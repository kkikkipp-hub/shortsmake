"""
GPT-4o Vision 기반 제품 영상 분석 서비스

음성이 없는 제품 소개 영상에서:
1. 프레임 추출 (N초마다)
2. GPT-4o Vision으로 각 프레임 분석
3. 제품 특징/하이라이트 구간 자동 식별
4. 각 구간에 자막 스크립트 자동 생성
"""
import asyncio
import base64
import json
from pathlib import Path
from typing import Optional

from config import WORKSPACE_DIR
from models.schemas import Segment
from utils.progress import progress_manager


# ──────────────────────────────────────────────
# 1. 프레임 추출
# ──────────────────────────────────────────────

async def _extract_frames(video_path: Path, frame_dir: Path,
                           interval: int = 5) -> list[tuple[float, Path]]:
    """N초 간격으로 프레임 추출 → [(timestamp, path), ...]"""
    frame_dir.mkdir(exist_ok=True)

    # 영상 길이 조회
    probe = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", str(video_path),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await probe.communicate()
    fmt = json.loads(stdout).get("format", {})
    duration = float(fmt.get("duration", 0))
    if duration <= 0:
        duration = 120.0

    timestamps = []
    t = 0.0
    while t < duration:
        timestamps.append(t)
        t += interval

    for i, ts in enumerate(timestamps):
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-ss", str(ts), "-i", str(video_path),
            "-vframes", "1", "-q:v", "4",
            "-vf", "scale=768:-1",  # 768px 폭으로 리사이즈 (API 비용 절감)
            str(frame_dir / f"frame_{i:04d}_{int(ts):05d}s.jpg"),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

    frames = []
    for p in sorted(frame_dir.glob("frame_*.jpg")):
        parts = p.stem.split("_")
        ts_sec = float(parts[2].replace("s", ""))
        frames.append((ts_sec, p))

    return frames


# ──────────────────────────────────────────────
# 2. GPT-4o Vision 분석
# ──────────────────────────────────────────────

async def _analyze_frames_gpt4o(
    frames: list[tuple[float, Path]],
    api_key: str,
    product_hint: str = "",
) -> list[dict]:
    """
    GPT-4o Vision에 프레임 묶음을 보내서 분석.
    반환: [{"timestamp": float, "description": str, "is_highlight": bool, "subtitle": str}]
    """
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)

    results = []
    # GPT-4o는 한 번에 최대 20장 이미지 처리 가능
    BATCH = 10
    for batch_start in range(0, len(frames), BATCH):
        batch = frames[batch_start:batch_start + BATCH]

        content: list[dict] = [
            {
                "type": "text",
                "text": f"""당신은 제품 마케팅 전문가입니다.
{f'제품 힌트: {product_hint}' if product_hint else ''}
아래 이미지들은 영상에서 {batch[0][0]:.0f}초 ~ {batch[-1][0]:.0f}초 구간의 스크린샷입니다.
각 이미지에 대해 JSON 배열 형태로 분석해주세요:

[
  {{
    "frame_index": 0,
    "timestamp": <초>,
    "description": "<한국어로 이 장면에서 보이는 제품/상황을 3줄 이내로 설명>",
    "is_highlight": <true/false: 제품의 핵심 기능이나 임팩트 있는 장면이면 true>,
    "subtitle": "<이 장면에 넣을 쇼츠용 자막 텍스트 (15자 이내, 임팩트 있게)>"
  }},
  ...
]

응답은 JSON 배열만 출력하세요. 다른 텍스트 없이."""
            }
        ]

        for i, (ts, img_path) in enumerate(batch):
            with open(img_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{b64}",
                    "detail": "low",  # 비용 절감 (고품질 불필요)
                }
            })

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: asyncio.run(client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": content}],
                max_tokens=1500,
            ))
        )

        raw = response.choices[0].message.content.strip()
        # JSON 파싱 (코드블록 제거)
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            # 파싱 실패시 빈 결과로 처리
            parsed = []

        for item in parsed:
            idx = item.get("frame_index", 0)
            if idx < len(batch):
                ts, _ = batch[idx]
                results.append({
                    "timestamp": ts,
                    "description": item.get("description", ""),
                    "is_highlight": item.get("is_highlight", False),
                    "subtitle": item.get("subtitle", ""),
                })

    return results


# ──────────────────────────────────────────────
# 3. 하이라이트 구간 → Segment 변환
# ──────────────────────────────────────────────

def _build_segments(
    frame_results: list[dict],
    total_duration: float,
    segment_duration: int = 30,
    max_segments: int = 5,
) -> tuple[list[Segment], dict[str, list[dict]]]:
    """
    분석 결과에서 하이라이트 구간 추출 → Segment 리스트 생성.
    반환: (segments, subtitles_map)
      subtitles_map: {seg_id: [{"start": float, "end": float, "text": str}]}
    """
    if not frame_results:
        return [], {}

    # 하이라이트 프레임 우선, 그 다음 모든 프레임
    highlights = [f for f in frame_results if f["is_highlight"]]
    if not highlights:
        highlights = frame_results

    # 하이라이트 타임스탬프를 시작점으로 segment_duration 구간 생성
    selected: list[tuple[float, float, float]] = []  # (start, end, score)
    interval = frame_results[1]["timestamp"] - frame_results[0]["timestamp"] if len(frame_results) > 1 else 5

    for fr in highlights:
        start = max(0.0, fr["timestamp"] - interval)
        end = min(total_duration, start + segment_duration)
        start = max(0.0, end - segment_duration)

        # 기존 구간과 50% 이상 겹치면 제외
        overlap = any(
            min(end, s[1]) - max(start, s[0]) > segment_duration * 0.5
            for s in selected
        )
        if not overlap:
            selected.append((start, end, 1.0 if fr["is_highlight"] else 0.6))
        if len(selected) >= max_segments:
            break

    # 시간 순 정렬
    selected.sort(key=lambda x: x[0])

    segments: list[Segment] = []
    subtitles_map: dict[str, list[dict]] = {}

    for i, (start, end, score) in enumerate(selected):
        seg_id = f"seg_{i+1:03d}"
        segments.append(Segment(
            id=seg_id,
            start_sec=round(start, 2),
            end_sec=round(end, 2),
            duration=round(end - start, 2),
            score=round(score, 3),
            reason="product_highlight",
        ))

        # 이 구간에 포함된 프레임들로 자막 생성
        seg_frames = [
            f for f in frame_results
            if start <= f["timestamp"] < end and f.get("subtitle")
        ]

        subs = []
        for j, fr in enumerate(seg_frames):
            sub_start = fr["timestamp"] - start
            sub_end = min(sub_start + interval * 0.9, end - start)
            subs.append({
                "id": f"sub_{seg_id}_{j:03d}",
                "start": round(sub_start, 2),
                "end": round(sub_end, 2),
                "text": fr["subtitle"],
            })

        subtitles_map[seg_id] = subs

    return segments, subtitles_map


# ──────────────────────────────────────────────
# 4. 공개 인터페이스
# ──────────────────────────────────────────────

async def analyze_product_video(
    job_id: str,
    api_key: str,
    frame_interval: int = 5,
    segment_duration: int = 30,
    max_segments: int = 5,
    product_hint: str = "",
) -> tuple[list[Segment], dict[str, list[dict]]]:
    """
    제품 영상을 비전 AI로 분석해서 쇼츠 구간 + 자막 생성.
    반환: (segments, subtitles_map)
    """
    job_dir = WORKSPACE_DIR / job_id

    # 원본 (또는 자막 제거된) 영상 선택
    source = job_dir / "source_clean.mp4"
    if not source.exists():
        for ext in ["mp4", "mkv", "webm", "avi"]:
            p = job_dir / f"source.{ext}"
            if p.exists():
                source = p
                break

    if not source.exists():
        raise FileNotFoundError("원본 영상을 찾을 수 없습니다")

    # 영상 길이
    probe = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", str(source),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await probe.communicate()
    total_duration = float(json.loads(stdout).get("format", {}).get("duration", 120))

    await progress_manager.send(job_id, "analyze", 5,
                                f"프레임 추출 중... ({frame_interval}초 간격)")

    frame_dir = job_dir / "_vision_frames"
    frames = await _extract_frames(source, frame_dir, interval=frame_interval)

    await progress_manager.send(job_id, "analyze", 30,
                                f"{len(frames)}개 프레임 추출 완료. GPT-4o Vision 분석 시작...")

    frame_results = await _analyze_frames_gpt4o(frames, api_key, product_hint)

    await progress_manager.send(job_id, "analyze", 80,
                                "GPT-4o 분석 완료. 구간 생성 중...")

    # 프레임 임시 파일 정리
    for p in frame_dir.glob("frame_*.jpg"):
        p.unlink()
    if frame_dir.exists():
        frame_dir.rmdir()

    segments, subtitles_map = _build_segments(
        frame_results, total_duration, segment_duration, max_segments
    )

    # 분석 결과 저장
    seg_data = [s.model_dump() for s in segments]
    (job_dir / "segments.json").write_text(
        json.dumps(seg_data, ensure_ascii=False), encoding="utf-8"
    )
    (job_dir / "vision_subtitles.json").write_text(
        json.dumps(subtitles_map, ensure_ascii=False), encoding="utf-8"
    )

    # 썸네일 생성
    thumb_dir = job_dir / "thumbnails"
    thumb_dir.mkdir(exist_ok=True)
    for seg in segments:
        mid = (seg.start_sec + seg.end_sec) / 2
        thumb_path = thumb_dir / f"{seg.id}.jpg"
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-ss", str(mid), "-i", str(source),
            "-vframes", "1", "-q:v", "3", "-vf", "scale=320:-1",
            str(thumb_path),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        seg.thumbnail = f"/api/jobs/{job_id}/thumb/{seg.id}.jpg"

    await progress_manager.send(job_id, "analyze", 100,
                                f"{len(segments)}개 제품 하이라이트 구간 추출 완료!")

    return segments, subtitles_map

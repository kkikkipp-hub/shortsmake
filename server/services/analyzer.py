import asyncio
import json
import subprocess
from pathlib import Path
from typing import Optional

import numpy as np
from config import WORKSPACE_DIR, MAX_SEGMENTS, MIN_SEGMENT_SCORE
from utils.progress import progress_manager
from models.schemas import Segment


async def analyze_video(job_id: str, duration_sec: int = 30,
                        max_segments: int = MAX_SEGMENTS) -> list[Segment]:
    """영상 분석: 씬 전환 + 오디오 에너지 → 하이라이트 구간 추출"""
    job_dir = WORKSPACE_DIR / job_id
    source = _find_source(job_dir)
    meta = json.loads((job_dir / "meta.json").read_text())
    total_dur = meta["duration"]

    await progress_manager.send(job_id, "analyze", 0, "오디오 분석 중...")

    # 1) 오디오 추출 → 에너지 분석
    audio_scores = await _analyze_audio_energy(job_id, source, total_dur)

    await progress_manager.send(job_id, "analyze", 40, "씬 전환 감지 중...")

    # 2) 씬 전환 감지
    scene_times = await _detect_scenes(source)

    await progress_manager.send(job_id, "analyze", 70, "최적 구간 추출 중...")

    # 3) 슬라이딩 윈도우로 최적 구간 찾기
    segments = _find_best_segments(
        audio_scores, scene_times, total_dur, duration_sec, max_segments
    )

    await progress_manager.send(job_id, "analyze", 85, "썸네일 생성 중...")

    # 4) 썸네일 생성
    thumb_dir = job_dir / "thumbnails"
    thumb_dir.mkdir(exist_ok=True)
    for seg in segments:
        mid = (seg.start_sec + seg.end_sec) / 2
        thumb_path = thumb_dir / f"{seg.id}.jpg"
        await _extract_thumbnail(source, mid, thumb_path)
        seg.thumbnail = f"/api/jobs/{job_id}/thumb/{seg.id}.jpg"

    # 결과 저장
    seg_data = [s.model_dump() for s in segments]
    (job_dir / "segments.json").write_text(
        json.dumps(seg_data, ensure_ascii=False), encoding="utf-8"
    )

    await progress_manager.send(job_id, "analyze", 100,
                                f"{len(segments)}개 구간 추출 완료!")
    return segments


async def _analyze_audio_energy(job_id: str, source: Path,
                                total_dur: float) -> np.ndarray:
    """librosa로 오디오 RMS 에너지 분석 → 초 단위 점수 배열"""
    import librosa

    # FFmpeg로 오디오 추출 (WAV, 모노, 22050Hz)
    job_dir = WORKSPACE_DIR / job_id
    audio_path = job_dir / "audio.wav"
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-i", str(source),
        "-ac", "1", "-ar", "22050", "-vn", str(audio_path),
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()

    # librosa 로드 (CPU-bound → thread pool)
    loop = asyncio.get_event_loop()
    y, sr = await loop.run_in_executor(
        None, lambda: librosa.load(str(audio_path), sr=22050, mono=True)
    )

    # RMS 에너지 (프레임 단위 → 초 단위로 리샘플)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    frames_per_sec = sr / 512
    n_seconds = int(total_dur)

    scores = np.zeros(n_seconds)
    for sec in range(n_seconds):
        start_frame = int(sec * frames_per_sec)
        end_frame = int((sec + 1) * frames_per_sec)
        if end_frame > len(rms):
            end_frame = len(rms)
        if start_frame < end_frame:
            scores[sec] = np.mean(rms[start_frame:end_frame])

    # 정규화 0~1
    if scores.max() > 0:
        scores = scores / scores.max()

    return scores


async def _detect_scenes(source: Path) -> list[float]:
    """PySceneDetect로 씬 전환 시점 감지"""
    try:
        from scenedetect import detect, ContentDetector
        loop = asyncio.get_event_loop()
        scenes = await loop.run_in_executor(
            None, lambda: detect(str(source), ContentDetector(threshold=27.0))
        )
        return [s[0].get_seconds() for s in scenes]
    except Exception:
        return []


def _find_best_segments(audio_scores: np.ndarray, scene_times: list[float],
                        total_dur: float, seg_dur: int,
                        max_count: int) -> list[Segment]:
    """슬라이딩 윈도우 + 씬 경계 보정으로 최적 구간 추출"""
    if len(audio_scores) < seg_dur:
        # 영상이 원하는 길이보다 짧으면 전체를 1구간
        return [Segment(
            id="seg_001", start_sec=0, end_sec=total_dur,
            duration=total_dur, score=1.0, reason="full_video"
        )]

    # 슬라이딩 윈도우: 초 단위 평균 에너지
    window_scores = []
    step = max(1, seg_dur // 3)  # 1/3 겹침
    for start in range(0, len(audio_scores) - seg_dur + 1, step):
        end = start + seg_dur
        avg = float(np.mean(audio_scores[start:end]))

        # 씬 전환 보너스: 구간 내 씬 전환이 있으면 +0.15
        scene_count = sum(1 for t in scene_times if start <= t < end)
        bonus = min(scene_count * 0.05, 0.15)

        # 변화량 보너스: 에너지 편차가 클수록 재밌는 구간
        std = float(np.std(audio_scores[start:end]))
        bonus += std * 0.3

        window_scores.append((start, end, avg + bonus))

    # 점수 높은 순 정렬
    window_scores.sort(key=lambda x: x[2], reverse=True)

    # 겹침 제거: Non-Maximum Suppression
    selected: list[tuple[int, int, float]] = []
    for start, end, score in window_scores:
        if score < MIN_SEGMENT_SCORE:
            break
        overlap = any(
            not (end <= s[0] or start >= s[1]) for s in selected
        )
        if not overlap:
            selected.append((start, end, score))
        if len(selected) >= max_count:
            break

    # 시간 순 정렬
    selected.sort(key=lambda x: x[0])

    # 씬 경계 보정: 시작점을 가장 가까운 씬 경계로 스냅
    segments = []
    for i, (start, end, score) in enumerate(selected):
        # 시작점을 가까운 씬 경계로 스냅 (±3초 이내)
        snapped_start = float(start)
        for t in scene_times:
            if abs(t - start) < 3:
                snapped_start = t
                break
        snapped_end = snapped_start + seg_dur
        if snapped_end > total_dur:
            snapped_end = total_dur
            snapped_start = max(0, snapped_end - seg_dur)

        reason = "high_energy"
        scene_in = sum(1 for t in scene_times if snapped_start <= t < snapped_end)
        if scene_in >= 2:
            reason = "scene_rich"
        elif float(np.std(audio_scores[int(snapped_start):int(snapped_end)])) > 0.25:
            reason = "dynamic"

        segments.append(Segment(
            id=f"seg_{i+1:03d}",
            start_sec=round(snapped_start, 2),
            end_sec=round(snapped_end, 2),
            duration=round(snapped_end - snapped_start, 2),
            score=round(min(score, 1.0), 3),
            reason=reason,
        ))

    return segments


async def _extract_thumbnail(source: Path, time_sec: float, output: Path):
    """FFmpeg로 특정 시점의 썸네일 추출"""
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-ss", str(time_sec), "-i", str(source),
        "-vframes", "1", "-q:v", "3",
        "-vf", "scale=320:-1", str(output),
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()


def _find_source(job_dir: Path) -> Path:
    for ext in ["mp4", "mkv", "webm", "avi"]:
        p = job_dir / f"source.{ext}"
        if p.exists():
            return p
    raise FileNotFoundError(f"원본 영상 없음: {job_dir}")

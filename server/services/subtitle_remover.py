"""
구워진(hardcoded) 자막 제거 서비스

CPU 모드 (GPU 없이):
  - fast   : EasyOCR 감지 → FFmpeg delogo 필터 (실시간, 품질 보통)
  - quality: EasyOCR 감지 → OpenCV TELEA 인페인팅 (느리지만 품질 좋음)
"""
import asyncio
import subprocess
import json
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from config import WORKSPACE_DIR
from utils.progress import progress_manager


# ──────────────────────────────────────────────
# 1. EasyOCR로 자막 영역 감지
# ──────────────────────────────────────────────

async def detect_subtitle_region(video_path: Path) -> Optional[dict]:
    """
    영상에서 20개 샘플 프레임을 추출해 EasyOCR로 자막 위치 감지.
    반환: {"x": int, "y": int, "w": int, "h": int} or None
    """
    import easyocr

    # 영상 메타데이터
    probe = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", str(video_path),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await probe.communicate()
    streams = json.loads(stdout)["streams"]
    video_stream = next((s for s in streams if s["codec_type"] == "video"), None)
    if not video_stream:
        return None

    width = int(video_stream["width"])
    height = int(video_stream["height"])

    # 20개 프레임 타임스탬프 생성
    duration = float(video_stream.get("duration", 0))
    if duration <= 0:
        duration = 60.0
    timestamps = [duration * i / 19 for i in range(20)]

    # 샘플 프레임 추출
    tmp_dir = video_path.parent / "_ocr_samples"
    tmp_dir.mkdir(exist_ok=True)
    for i, t in enumerate(timestamps):
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-ss", str(t), "-i", str(video_path),
            "-vframes", "1", "-q:v", "5",
            str(tmp_dir / f"frame_{i:03d}.jpg"),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

    # EasyOCR (CPU) - 화면 하단 40%만 분석해서 속도 향상
    loop = asyncio.get_event_loop()
    reader = easyocr.Reader(["ko", "en"], gpu=False, verbose=False)

    all_boxes: list[tuple[int, int, int, int]] = []  # (x, y, x2, y2)
    crop_top = int(height * 0.6)  # 상단 60% 무시

    for img_path in sorted(tmp_dir.glob("frame_*.jpg")):
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        crop = img[crop_top:, :]  # 하단 40%만

        results = await loop.run_in_executor(
            None, lambda c=crop: reader.readtext(c, detail=1, paragraph=False)
        )
        for bbox, text, conf in results:
            if conf < 0.4 or len(text.strip()) < 2:
                continue
            pts = np.array(bbox, dtype=np.float32)
            x1 = int(pts[:, 0].min())
            y1 = int(pts[:, 1].min()) + crop_top
            x2 = int(pts[:, 0].max())
            y2 = int(pts[:, 1].max()) + crop_top
            all_boxes.append((x1, y1, x2, y2))

    # 임시 파일 정리
    for f in tmp_dir.glob("frame_*.jpg"):
        f.unlink()
    tmp_dir.rmdir()

    if not all_boxes:
        return None

    # 유니온 바운딩박스 + 여백 추가
    pad = 10
    x1 = max(0, min(b[0] for b in all_boxes) - pad)
    y1 = max(0, min(b[1] for b in all_boxes) - pad)
    x2 = min(width,  max(b[2] for b in all_boxes) + pad)
    y2 = min(height, max(b[3] for b in all_boxes) + pad)

    return {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1,
            "video_w": width, "video_h": height}


# ──────────────────────────────────────────────
# 2a. FFmpeg delogo 방식 (빠름, 품질 보통)
# ──────────────────────────────────────────────

async def _remove_fast(job_id: str, video_path: Path, output_path: Path, region: dict):
    """FFmpeg delogo 필터로 자막 영역 제거"""
    x, y, w, h = region["x"], region["y"], region["w"], region["h"]
    filt = f"delogo=x={x}:y={y}:w={w}:h={h}:show=0"

    await progress_manager.send(job_id, "subtitle_removal", 50,
                                f"FFmpeg delogo 적용 중... (영역: {x},{y} {w}×{h})")
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-i", str(video_path),
        "-vf", filt, "-c:a", "copy",
        "-preset", "fast", "-crf", "18",
        str(output_path),
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg delogo 실패: {err.decode()[-500:]}")


# ──────────────────────────────────────────────
# 2b. OpenCV TELEA 인페인팅 (느림, 품질 좋음)
# ──────────────────────────────────────────────

async def _remove_quality(job_id: str, video_path: Path, output_path: Path, region: dict):
    """
    프레임별 OpenCV TELEA 인페인팅.
    30fps 5분 영상 기준 CPU에서 약 10~20분 소요.
    """
    x, y, w, h = region["x"], region["y"], region["w"], region["h"]
    vid_w, vid_h = region["video_w"], region["video_h"]

    # 마스크 생성 (자막 영역만 255)
    mask = np.zeros((vid_h, vid_w), dtype=np.uint8)
    mask[y:y + h, x:x + w] = 255

    # 원본에서 fps, 코덱 정보 가져오기
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    # 임시 처리 프레임 저장 디렉터리
    tmp_dir = output_path.parent / "_inpaint_frames"
    tmp_dir.mkdir(exist_ok=True)

    # 프레임 단위 인페인팅 (thread pool에서)
    loop = asyncio.get_event_loop()

    def process_frames():
        cap2 = cv2.VideoCapture(str(video_path))
        idx = 0
        while True:
            ret, frame = cap2.read()
            if not ret:
                break
            inpainted = cv2.inpaint(frame, mask, inpaintRadius=5,
                                    flags=cv2.INPAINT_TELEA)
            cv2.imwrite(str(tmp_dir / f"f{idx:07d}.jpg"), inpainted,
                        [cv2.IMWRITE_JPEG_QUALITY, 95])
            idx += 1
            if idx % 300 == 0:
                pct = int(idx / max(total, 1) * 70) + 20
                # 비동기 진행률 업데이트 (best-effort)
                asyncio.run_coroutine_threadsafe(
                    progress_manager.send(job_id, "subtitle_removal", pct,
                                          f"인페인팅 중... {idx}/{total} 프레임"),
                    loop,
                )
        cap2.release()

    await progress_manager.send(job_id, "subtitle_removal", 20,
                                "OpenCV TELEA 인페인팅 시작 (시간이 걸립니다)...")
    await loop.run_in_executor(None, process_frames)

    # 프레임 → 영상 재조립 (오디오 포함)
    await progress_manager.send(job_id, "subtitle_removal", 92, "영상 재조립 중...")
    frame_pattern = str(tmp_dir / "f%07d.jpg")
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y",
        "-framerate", str(fps), "-i", frame_pattern,
        "-i", str(video_path),
        "-map", "0:v", "-map", "1:a?",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "copy", "-shortest",
        str(output_path),
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()

    # 임시 파일 정리
    for f in tmp_dir.glob("f*.jpg"):
        f.unlink()
    tmp_dir.rmdir()

    if proc.returncode != 0:
        raise RuntimeError(f"영상 재조립 실패: {err.decode()[-500:]}")


# ──────────────────────────────────────────────
# 3. 공개 인터페이스
# ──────────────────────────────────────────────

async def remove_subtitles(job_id: str, mode: str = "fast") -> Path:
    """
    자막 제거 실행.
    mode: "fast" (FFmpeg delogo) | "quality" (OpenCV TELEA)
    반환: 처리된 영상 경로 (source_clean.mp4)
    """
    job_dir = WORKSPACE_DIR / job_id

    # 원본 영상 찾기
    source = None
    for ext in ["mp4", "mkv", "webm", "avi"]:
        p = job_dir / f"source.{ext}"
        if p.exists():
            source = p
            break
    if source is None:
        raise FileNotFoundError("원본 영상을 찾을 수 없습니다")

    output = job_dir / "source_clean.mp4"

    await progress_manager.send(job_id, "subtitle_removal", 5,
                                "자막 영역 감지 중 (EasyOCR)...")
    region = await detect_subtitle_region(source)

    if region is None:
        await progress_manager.send(job_id, "subtitle_removal", 100,
                                    "자막 영역이 감지되지 않았습니다. 원본을 사용합니다.")
        # 원본 복사
        import shutil
        shutil.copy2(source, output)
        return output

    await progress_manager.send(
        job_id, "subtitle_removal", 30,
        f"자막 영역 감지 완료: x={region['x']} y={region['y']} "
        f"{region['w']}×{region['h']} px"
    )

    if mode == "quality":
        await _remove_quality(job_id, source, output, region)
    else:
        await _remove_fast(job_id, source, output, region)

    await progress_manager.send(job_id, "subtitle_removal", 100,
                                "자막 제거 완료!")
    return output

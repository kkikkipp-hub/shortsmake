import asyncio
import json
import subprocess
from pathlib import Path
from config import WORKSPACE_DIR
from utils.progress import progress_manager


async def download_video(job_id: str, url: str) -> dict:
    """yt-dlp로 영상 다운로드, 진행률 WebSocket 전송"""
    job_dir = WORKSPACE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    output_path = job_dir / "source.mp4"

    await progress_manager.send(job_id, "download", 0, "영상 정보 확인 중...")

    # 1) 메타 먼저 가져오기
    meta_cmd = [
        "yt-dlp", "--dump-json", "--no-download", url
    ]
    meta_proc = await asyncio.create_subprocess_exec(
        *meta_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    try:
        stdout, stderr = await asyncio.wait_for(meta_proc.communicate(), timeout=60)
    except asyncio.TimeoutError:
        meta_proc.kill()
        raise RuntimeError("메타 정보 조회 타임아웃 (60초)")
    if meta_proc.returncode != 0:
        raise RuntimeError(f"메타 정보 실패: {stderr.decode()[:300]}")

    meta = json.loads(stdout.decode())
    title = meta.get("title", "Unknown")
    duration = meta.get("duration", 0)
    width = meta.get("width", 0)
    height = meta.get("height", 0)

    # 메타 저장
    meta_file = job_dir / "meta.json"
    meta_file.write_text(json.dumps({
        "url": url, "title": title, "duration": duration,
        "width": width, "height": height,
        "resolution": f"{width}x{height}",
    }, ensure_ascii=False), encoding="utf-8")

    await progress_manager.send(job_id, "download", 10,
                                f"'{title}' 다운로드 시작...",
                                {"title": title, "duration": duration})

    # 2) 다운로드
    dl_cmd = [
        "yt-dlp",
        "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
        "--merge-output-format", "mp4",
        "-o", str(output_path),
        "--newline",  # 진행률 파싱용
        "--no-playlist",
        url,
    ]
    proc = await asyncio.create_subprocess_exec(
        *dl_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )

    async def _read_progress():
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode().strip()
            if "[download]" in text and "%" in text:
                try:
                    pct_str = text.split("%")[0].split()[-1]
                    pct = float(pct_str)
                    await progress_manager.send(job_id, "download",
                                                10 + pct * 0.85, f"다운로드 중 {pct:.0f}%")
                except (ValueError, IndexError):
                    pass
            elif "[Merger]" in text or "Merging" in text:
                await progress_manager.send(job_id, "download", 96, "영상 병합 중...")
        await proc.wait()

    try:
        await asyncio.wait_for(_read_progress(), timeout=600)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError("다운로드 타임아웃 (10분 초과)")

    if proc.returncode != 0:
        raise RuntimeError("다운로드 실패")

    # output 파일이 .mp4가 아닌 경우 확인
    if not output_path.exists():
        # yt-dlp가 확장자를 바꾸는 경우
        candidates = list(job_dir.glob("source.*"))
        if candidates:
            output_path = candidates[0]

    await progress_manager.send(job_id, "download", 100, "다운로드 완료!")

    return {
        "title": title,
        "duration": duration,
        "resolution": f"{width}x{height}",
        "file": str(output_path),
    }

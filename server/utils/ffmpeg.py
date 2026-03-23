"""공유 FFmpeg 유틸리티"""
import asyncio


async def run_ffmpeg(proc: asyncio.subprocess.Process, timeout: int = 300):
    """FFmpeg 프로세스 실행 + 타임아웃 처리"""
    try:
        await asyncio.wait_for(proc.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError(f"FFmpeg 타임아웃 ({timeout}초 초과)")

import asyncio
import json
from pathlib import Path
import edge_tts
from config import WORKSPACE_DIR, DEFAULT_VOICE
from utils.progress import progress_manager
from models.schemas import SubtitleEntry


# 사용 가능한 한국어 음성 목록
KOREAN_VOICES = [
    {"id": "ko-KR-SunHiNeural", "name": "선희 (여성)", "gender": "Female"},
    {"id": "ko-KR-InJoonNeural", "name": "인준 (남성)", "gender": "Male"},
    {"id": "ko-KR-HyunsuNeural", "name": "현수 (남성)", "gender": "Male"},
    {"id": "ko-KR-BongJinNeural", "name": "봉진 (남성)", "gender": "Male"},
    {"id": "ko-KR-GookMinNeural", "name": "국민 (남성)", "gender": "Male"},
    {"id": "ko-KR-JiMinNeural", "name": "지민 (여성)", "gender": "Female"},
    {"id": "ko-KR-SeoHyeonNeural", "name": "서현 (여성)", "gender": "Female"},
    {"id": "ko-KR-SoonBokNeural", "name": "순복 (여성)", "gender": "Female"},
    {"id": "ko-KR-YuJinNeural", "name": "유진 (여성)", "gender": "Female"},
]


async def synthesize_segment_tts(
    job_id: str, segment_id: str,
    voice: str = DEFAULT_VOICE, speed: float = 1.0
) -> Path:
    """자막 기반 TTS 합성 → 구간별 mp3"""
    job_dir = WORKSPACE_DIR / job_id
    seg_dir = job_dir / "segments"
    tts_dir = job_dir / "tts"
    tts_dir.mkdir(exist_ok=True)

    # 자막 로드
    sub_path = seg_dir / f"{segment_id}_subs.json"
    if not sub_path.exists():
        raise FileNotFoundError(f"자막 없음: {segment_id}")
    subs = json.loads(sub_path.read_text())

    total = len(subs)
    if total == 0:
        raise ValueError("자막이 비어있습니다")

    await progress_manager.send(job_id, "tts", 0,
                                f"{segment_id} TTS 합성 시작...")

    # 각 자막별 TTS 생성
    chunk_files: list[tuple[float, str]] = []
    rate_str = f"+{int((speed-1)*100)}%" if speed >= 1 else f"{int((speed-1)*100)}%"

    for i, sub in enumerate(subs):
        text = sub["text"].strip()
        if not text:
            continue
        chunk_path = tts_dir / f"{segment_id}_chunk_{i:03d}.mp3"
        communicate = edge_tts.Communicate(text, voice, rate=rate_str)
        await communicate.save(str(chunk_path))
        chunk_files.append((sub["start"], str(chunk_path)))

        pct = ((i + 1) / total) * 80
        await progress_manager.send(job_id, "tts", pct,
                                    f"TTS {i+1}/{total}")

    # 청크를 타이밍에 맞게 하나로 합침
    output_path = tts_dir / f"{segment_id}_tts.mp3"
    await _merge_tts_chunks(chunk_files, output_path,
                            float(subs[-1]["end"]))

    await progress_manager.send(job_id, "tts", 100, "TTS 합성 완료!")
    return output_path


async def _merge_tts_chunks(
    chunks: list[tuple[float, str]], output: Path, total_dur: float
):
    """각 자막 타이밍에 맞춰 TTS 청크를 배치하여 하나의 오디오로 합침"""
    if not chunks:
        return

    # FFmpeg filter_complex로 타이밍 배치
    inputs = []
    filter_parts = []
    for i, (start_time, path) in enumerate(chunks):
        inputs.extend(["-i", path])
        delay_ms = int(start_time * 1000)
        filter_parts.append(
            f"[{i}:a]adelay={delay_ms}|{delay_ms}[a{i}]"
        )

    mix_inputs = "".join(f"[a{i}]" for i in range(len(chunks)))
    filter_parts.append(
        f"{mix_inputs}amix=inputs={len(chunks)}:duration=longest:normalize=0[out]"
    )

    cmd = ["ffmpeg", "-y"] + inputs + [
        "-filter_complex", ";".join(filter_parts),
        "-map", "[out]", "-ac", "1", "-ar", "44100",
        str(output),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
    )
    await proc.wait()

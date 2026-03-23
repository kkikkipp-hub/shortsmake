import asyncio
import json
from pathlib import Path
from config import WORKSPACE_DIR, WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE
from utils.progress import progress_manager
from models.schemas import SubtitleEntry


_whisper_model = None


def _get_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel(
            WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE
        )
    return _whisper_model


async def transcribe_segment(job_id: str, segment_id: str) -> list[SubtitleEntry]:
    """선택된 구간의 자막을 faster-whisper로 생성"""
    job_dir = WORKSPACE_DIR / job_id
    seg_dir = job_dir / "segments"
    seg_dir.mkdir(exist_ok=True)

    # 구간 정보 로드
    segments_data = json.loads((job_dir / "segments.json").read_text())
    seg = next((s for s in segments_data if s["id"] == segment_id), None)
    if not seg:
        raise ValueError(f"구간 없음: {segment_id}")

    await progress_manager.send(job_id, "transcribe", 0,
                                f"{segment_id} 오디오 추출 중...")

    # 구간 오디오 추출
    source = _find_source(job_dir)
    audio_path = seg_dir / f"{segment_id}.wav"
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-i", str(source),
        "-ss", str(seg["start_sec"]), "-to", str(seg["end_sec"]),
        "-ac", "1", "-ar", "16000", "-vn",
        "-af", "highpass=f=80,lowpass=f=10000,afftdn=nf=-25",  # 노이즈 필터 (nf 범위: -80~-20)
        str(audio_path),
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()

    # 오디오 파일 존재/크기 확인 (실패 시 필터 없이 재추출)
    if not audio_path.exists() or audio_path.stat().st_size < 5000:
        await progress_manager.send(job_id, "transcribe", 10,
                                    f"{segment_id} 오디오 필터 없이 재추출...")
        proc2 = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-i", str(source),
            "-ss", str(seg["start_sec"]), "-to", str(seg["end_sec"]),
            "-ac", "1", "-ar", "16000", "-vn",
            str(audio_path),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc2.wait()

    await progress_manager.send(job_id, "transcribe", 20,
                                f"{segment_id} 음성 인식 중... (모델: {WHISPER_MODEL})")

    # faster-whisper STT (CPU-bound → thread pool)
    loop = asyncio.get_event_loop()
    model = _get_model()
    whisper_segments, info = await loop.run_in_executor(
        None, lambda: model.transcribe(
            str(audio_path),
            language=None,                          # 자동 감지 (한국어/영어 등)
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=200,         # 200ms 무음 분리
                speech_pad_ms=250,                   # 음성 앞뒤 패딩 250ms
                threshold=0.25,                      # 낮은 임계값 = 더 적극 감지
            ),
            beam_size=5,
            best_of=3,
            temperature=[0.0, 0.2, 0.4, 0.6],
            condition_on_previous_text=True,
            no_speech_threshold=0.4,                 # 비음성 임계값 완화
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,                 # 낮은 확률 자막도 포함
        )
    )

    # 감지된 언어 로그
    detected_lang = getattr(info, 'language', 'unknown')
    lang_prob = getattr(info, 'language_probability', 0)
    await progress_manager.send(job_id, "transcribe", 50,
                                f"언어 감지: {detected_lang} ({lang_prob:.0%})")

    # 환각 패턴 필터
    HALLUCINATION_PATTERNS = [
        "자막을", "인식합니다", "정확하게", "한국어",
        "구독", "좋아요", "시청해 주셔서",
        "MBC 뉴스", "KBS 뉴스", "SBS 뉴스",  # 흔한 환각
        "♪", "♫",                              # 음악 기호 환각
    ]

    # 결과 변환 (빈 텍스트/반복/환각 필터링)
    subtitles: list[SubtitleEntry] = []
    idx = 0
    prev_text = ""
    for ws in whisper_segments:
        text = ws.text.strip()
        # 빈 자막, 반복 자막, 너무 짧은 자막 필터
        if not text or text == prev_text or len(text) < 2:
            continue
        # 환각 패턴 필터 (initial_prompt 잔여물 등)
        if any(p in text for p in HALLUCINATION_PATTERNS):
            # 환각이 텍스트의 대부분이면 스킵
            halluc_len = sum(len(p) for p in HALLUCINATION_PATTERNS if p in text)
            if halluc_len > len(text) * 0.5:
                continue
        # 동일 텍스트 3회 이상 반복 감지
        if subtitles and len(subtitles) >= 2:
            if subtitles[-1].text == text and subtitles[-2].text == text:
                continue
        idx += 1
        subtitles.append(SubtitleEntry(
            id=f"{segment_id}_sub_{idx:03d}",
            start=round(ws.start, 2),
            end=round(ws.end, 2),
            text=text,
        ))
        prev_text = text

    await progress_manager.send(job_id, "transcribe", 80,
                                f"자막 후처리 중...")

    # 후처리: 짧은 자막 병합 + 긴 자막 분리 + 타임스탬프 보정
    subtitles = _postprocess_subtitles(subtitles, segment_id)

    await progress_manager.send(job_id, "transcribe", 90,
                                f"{len(subtitles)}개 자막 생성 완료")

    # 저장
    sub_path = seg_dir / f"{segment_id}_subs.json"
    sub_path.write_text(
        json.dumps([s.model_dump() for s in subtitles], ensure_ascii=False),
        encoding="utf-8",
    )

    await progress_manager.send(job_id, "transcribe", 100, "자막 생성 완료!")
    return subtitles


def _postprocess_subtitles(subs: list[SubtitleEntry],
                           segment_id: str) -> list[SubtitleEntry]:
    """자막 후처리: 짧은 구간 병합, 긴 자막 분리, 타임스탬프 보정"""
    if not subs:
        return subs

    # 1) 너무 짧은 자막(0.5초 미만) → 이전 자막에 병합
    merged: list[SubtitleEntry] = []
    for sub in subs:
        dur = sub.end - sub.start
        if dur < 0.5 and merged:
            prev = merged[-1]
            merged[-1] = SubtitleEntry(
                id=prev.id, start=prev.start, end=sub.end,
                text=prev.text + " " + sub.text,
            )
        else:
            merged.append(sub)

    # 2) 너무 긴 자막(8초 초과) → 중간에서 분리
    split: list[SubtitleEntry] = []
    for sub in merged:
        dur = sub.end - sub.start
        if dur > 8.0:
            words = sub.text.split()
            if len(words) >= 2:
                mid = len(words) // 2
                mid_time = sub.start + dur * (mid / len(words))
                split.append(SubtitleEntry(
                    id="", start=sub.start, end=round(mid_time, 2),
                    text=" ".join(words[:mid]),
                ))
                split.append(SubtitleEntry(
                    id="", start=round(mid_time, 2), end=sub.end,
                    text=" ".join(words[mid:]),
                ))
            else:
                split.append(sub)
        else:
            split.append(sub)

    # 3) 겹치는 타임스탬프 보정
    for i in range(1, len(split)):
        if split[i].start < split[i-1].end:
            gap = (split[i-1].end + split[i].start) / 2
            split[i-1] = SubtitleEntry(
                id="", start=split[i-1].start, end=round(gap, 2),
                text=split[i-1].text,
            )
            split[i] = SubtitleEntry(
                id="", start=round(gap, 2), end=split[i].end,
                text=split[i].text,
            )

    # 4) ID 재정렬
    return [
        SubtitleEntry(
            id=f"{segment_id}_sub_{i+1:03d}",
            start=sub.start, end=sub.end, text=sub.text,
        )
        for i, sub in enumerate(split)
    ]


async def transcribe_all_selected(job_id: str,
                                  segment_ids: list[str]) -> dict[str, list[SubtitleEntry]]:
    """선택된 모든 구간의 자막 생성"""
    result = {}
    total = len(segment_ids)
    for i, sid in enumerate(segment_ids):
        await progress_manager.send(
            job_id, "transcribe", (i / total) * 100,
            f"구간 {i+1}/{total} 자막 생성 중..."
        )
        result[sid] = await transcribe_segment(job_id, sid)
    return result


def _find_source(job_dir: Path) -> Path:
    for ext in ["mp4", "mkv", "webm", "avi"]:
        p = job_dir / f"source.{ext}"
        if p.exists():
            return p
    raise FileNotFoundError(f"원본 영상 없음: {job_dir}")

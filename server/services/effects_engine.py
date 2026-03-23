import asyncio
import json
from pathlib import Path
from config import WORKSPACE_DIR, FFMPEG_THREADS, FONTS_DIR
from utils.progress import progress_manager
from models.schemas import EffectsConfig, SubtitleStyle, ASPECT_RATIOS


async def render_segment(job_id: str, segment_id: str,
                         effects_config: EffectsConfig) -> Path:
    """구간을 영상 효과 + 자막 + TTS 합쳐서 최종 렌더링"""
    job_dir = WORKSPACE_DIR / job_id
    seg_dir = job_dir / "segments"
    out_dir = job_dir / "output"
    out_dir.mkdir(exist_ok=True)

    source = _find_source(job_dir)
    segments_data = json.loads((job_dir / "segments.json").read_text())
    seg = next((s for s in segments_data if s["id"] == segment_id), None)
    if not seg:
        raise ValueError(f"구간 없음: {segment_id}")

    # 화면 비율 해석
    ratio = effects_config.aspect_ratio or "9:16"
    w, h = ASPECT_RATIOS.get(ratio, ASPECT_RATIOS["9:16"])

    await progress_manager.send(job_id, "render", 0,
                                f"{segment_id} 렌더링 시작... ({ratio})")

    # 1) 구간 잘라내기
    cut_path = seg_dir / f"{segment_id}_cut.mp4"
    await _cut_segment(source, seg["start_sec"], seg["end_sec"], cut_path)
    await progress_manager.send(job_id, "render", 15, "구간 추출 완료")

    # 2) 화면 비율 변환
    # closeup_fill, split_top_bottom, split_left_right는 자체적으로 비율 변환하므로 스킵
    has_layout_effect = any(
        e.type.value in ("closeup_fill", "split_top_bottom", "split_left_right")
        for e in effects_config.effects
    )
    needs_convert = ratio != "16:9" and not has_layout_effect
    if needs_convert:
        converted_path = seg_dir / f"{segment_id}_ratio.mp4"
        await _convert_aspect(cut_path, converted_path, w, h)
        current = converted_path
        await progress_manager.send(job_id, "render", 30, f"비율 변환 완료 ({ratio})")
    else:
        current = cut_path

    # 3) 영상 효과 적용
    if effects_config.effects:
        fx_path = seg_dir / f"{segment_id}_fx.mp4"
        await _apply_effects(current, fx_path, effects_config, w, h)
        current = fx_path
        await progress_manager.send(job_id, "render", 50, "효과 적용 완료")

    # 4) 자막 오버레이
    sub_file = seg_dir / f"{segment_id}_subs.json"
    if sub_file.exists():
        sub_path = seg_dir / f"{segment_id}_subbed.mp4"
        await _burn_subtitles(current, sub_file, sub_path,
                              effects_config.subtitle_style, w, h)
        current = sub_path
        await progress_manager.send(job_id, "render", 70, "자막 삽입 완료")

    # 5) TTS 오디오 믹싱
    tts_file = job_dir / "tts" / f"{segment_id}_tts.mp3"
    output_path = out_dir / f"{segment_id}_final.mp4"
    if tts_file.exists():
        await _mix_audio(current, tts_file, output_path)
        await progress_manager.send(job_id, "render", 90, "TTS 오디오 합성 완료")
    else:
        await _copy_file(current, output_path)

    await progress_manager.send(job_id, "render", 100,
                                f"{segment_id} 렌더링 완료!")
    return output_path


async def _cut_segment(source: Path, start: float, end: float, output: Path):
    """구간 잘라내기 (스트림 복사로 빠르게, 다음 단계에서 재인코딩)"""
    duration = end - start
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start),
        "-i", str(source),
        "-t", str(duration),
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        str(output),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
    )
    await proc.wait()


async def _convert_aspect(input_path: Path, output: Path, w: int, h: int):
    """임의의 화면 비율로 변환 (블러 배경 + 중앙 원본, 최적화)"""
    # 배경은 저해상도로 블러 → 확대 (성능 최적화)
    bg_w, bg_h = w // 4, h // 4
    filter_complex = (
        f"[0:v]split[bg][fg];"
        f"[bg]scale={bg_w}:{bg_h}:force_original_aspect_ratio=increase,"
        f"crop={bg_w}:{bg_h},avgblur=10,"
        f"scale={w}:{h}[blurred];"
        f"[fg]scale={w}:{h}:force_original_aspect_ratio=decrease[scaled];"
        f"[blurred][scaled]overlay=(W-w)/2:(H-h)/2[out]"
    )
    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-filter_complex", filter_complex,
        "-map", "[out]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-threads", str(FFMPEG_THREADS),
        str(output),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
    )
    await proc.wait()


async def _apply_effects(input_path: Path, output: Path,
                         config: EffectsConfig, w: int, h: int):
    """FFmpeg 필터로 영상 효과 적용 (복합 효과 지원)"""
    # 복합 효과 (filter_complex 필요) vs 단순 효과 분리
    complex_effects = []
    simple_filters = []

    for effect in config.effects:
        t = effect.type.value
        start = effect.start
        end = effect.end
        dur = end - start if end > start else 999
        factor = effect.factor

        if t == "closeup_fill":
            # 클로즈업 화면 채우기: 구간 동안 중앙 크롭 확대로 전환
            complex_effects.append(("closeup_fill", effect))
        elif t == "split_top_bottom":
            # 상하 2분할: 위=전체(축소), 아래=클로즈업
            complex_effects.append(("split_top_bottom", effect))
        elif t == "split_left_right":
            # 좌우 2분할
            complex_effects.append(("split_left_right", effect))
        elif t == "zoom_punch":
            # 빠른 줌인→복귀 (0.3초 줌인 + 0.3초 복귀)
            simple_filters.append(
                f"zoompan=z='if(between(in_time,{start},{start+0.3}),"
                f"min(zoom+{(factor-1)/0.3/25:.6f},{factor}),"
                f"if(between(in_time,{start+0.3},{end}),"
                f"max(zoom-{(factor-1)/(dur-0.3)/25:.6f},1),1))'"
                f":d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                f":s={w}x{h}:fps=30"
            )
        elif t == "shake":
            # 화면 흔들림: 임팩트 순간
            simple_filters.append(
                f"crop=iw-20:ih-20:"
                f"'10+if(between(t,{start},{end}),10*sin(t*40),0)':"
                f"'10+if(between(t,{start},{end}),8*cos(t*35),0)'"
            )
        elif t == "zoom_in":
            simple_filters.append(
                f"zoompan=z='if(between(in_time,{start},{end}),"
                f"min(zoom+{(factor-1)/dur/25:.6f},{factor}),1)'"
                f":d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                f":s={w}x{h}:fps=30"
            )
        elif t == "zoom_out":
            simple_filters.append(
                f"zoompan=z='if(between(in_time,{start},{end}),"
                f"max({factor}-(zoom-1)*{(factor-1)/dur/25:.6f},1),{factor})'"
                f":d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                f":s={w}x{h}:fps=30"
            )
        elif t == "fade_in":
            simple_filters.append(f"fade=t=in:st={start}:d={dur}")
        elif t == "fade_out":
            simple_filters.append(f"fade=t=out:st={start}:d={dur}")

    # 복합 효과가 있으면 filter_complex 사용
    if complex_effects:
        await _apply_complex_effect(input_path, output, complex_effects[0], w, h)
        # 복합 효과 위에 단순 효과 추가 적용
        if simple_filters:
            temp = output.with_suffix(".tmp.mp4")
            await _copy_file(output, temp)
            cmd = [
                "ffmpeg", "-y", "-i", str(temp),
                "-vf", ",".join(simple_filters),
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
                "-c:a", "copy", "-threads", str(FFMPEG_THREADS),
                str(output),
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
            )
            await proc.wait()
            temp.unlink(missing_ok=True)
        return

    # 단순 효과만
    if not simple_filters:
        await _copy_file(input_path, output)
        return

    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-vf", ",".join(simple_filters),
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-c:a", "copy", "-threads", str(FFMPEG_THREADS),
        str(output),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
    )
    await proc.wait()


async def _apply_complex_effect(input_path: Path, output: Path,
                                effect_info: tuple, w: int, h: int):
    """복합 효과 (분할화면, 클로즈업) 적용"""
    effect_type, effect = effect_info
    start = effect.start
    end = effect.end
    cx = effect.crop_x  # 크롭 중심 X (0~1)
    cy = effect.crop_y  # 크롭 중심 Y (0~1)

    if effect_type == "closeup_fill":
        # 클로즈업: 원본 중앙을 세로 비율에 맞게 크롭 확대
        # 구간 동안만 클로즈업, 나머지는 원본
        filter_complex = (
            f"[0:v]split[orig][zoom];"
            f"[zoom]crop=iw/2:ih/2:iw*{cx}-iw/4:ih*{cy}-ih/4,"
            f"scale={w}:{h}[zoomed];"
            f"[orig]scale={w}:{h}:force_original_aspect_ratio=decrease,"
            f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2[padded];"
            f"[padded][zoomed]overlay=0:0:"
            f"enable='between(t,{start},{end})'[out]"
        )

    elif effect_type == "split_top_bottom":
        # 상하 2분할: 위=전체(축소), 아래=클로즈업
        half_h = h // 2
        filter_complex = (
            f"[0:v]split[top][bot];"
            f"[top]scale={w}:{half_h}:force_original_aspect_ratio=decrease,"
            f"pad={w}:{half_h}:(ow-iw)/2:(oh-ih)/2:black[top_scaled];"
            f"[bot]crop=iw/2:ih/2:iw*{cx}-iw/4:ih*{cy}-ih/4,"
            f"scale={w}:{half_h}[bot_zoomed];"
            f"[top_scaled][bot_zoomed]vstack[out]"
        )

    elif effect_type == "split_left_right":
        # 좌우 2분할: 좌=전체(축소), 우=클로즈업
        half_w = w // 2
        filter_complex = (
            f"[0:v]split[left][right];"
            f"[left]scale={half_w}:{h}:force_original_aspect_ratio=decrease,"
            f"pad={half_w}:{h}:(ow-iw)/2:(oh-ih)/2:black[left_scaled];"
            f"[right]crop=iw/2:ih/2:iw*{cx}-iw/4:ih*{cy}-ih/4,"
            f"scale={half_w}:{h}[right_zoomed];"
            f"[left_scaled][right_zoomed]hstack[out]"
        )
    else:
        await _copy_file(input_path, output)
        return

    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-filter_complex", filter_complex,
        "-map", "[out]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-threads", str(FFMPEG_THREADS),
        str(output),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
    )
    await proc.wait()


async def _burn_subtitles(input_path: Path, subs_json: Path,
                          output: Path, style: SubtitleStyle,
                          w: int = 1080, h: int = 1920):
    """자막을 영상에 하드코딩 (지마켓산스 폰트)"""
    subs = json.loads(subs_json.read_text())
    if not subs:
        await _copy_file(input_path, output)
        return

    # ASS 자막 파일 생성
    ass_path = subs_json.with_suffix(".ass")
    _generate_ass(subs, ass_path, style, w, h)

    # fontsdir 옵션으로 커스텀 폰트 경로 지정
    fonts_opt = f"fontsdir={FONTS_DIR}" if FONTS_DIR.exists() else ""
    ass_filter = f"ass={ass_path}:{fonts_opt}" if fonts_opt else f"ass={ass_path}"

    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-vf", ass_filter,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
        "-c:a", "copy",
        "-threads", str(FFMPEG_THREADS),
        str(output),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
    )
    await proc.wait()


def _generate_ass(subs: list[dict], output: Path, style: SubtitleStyle,
                  w: int = 1080, h: int = 1920):
    """ASS 자막 파일 생성 (지마켓산스 볼드 + 스타일 적용)"""
    color_hex = style.color.lstrip("#")
    # ASS는 &HBBGGRR 형식
    ass_color = f"&H00{color_hex[4:6]}{color_hex[2:4]}{color_hex[0:2]}"
    outline_hex = style.outline_color.lstrip("#")
    ass_outline = f"&H00{outline_hex[4:6]}{outline_hex[2:4]}{outline_hex[0:2]}"

    alignment = {"top": 8, "center": 5, "bottom": 2}.get(style.position, 2)
    margin_v = 80 if style.position == "bottom" else 40

    font_name = style.font_name or "GmarketSansTTFBold"

    header = f"""[Script Info]
Title: ShortsMake Subtitles
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{style.font_size},{ass_color},&H000000FF,{ass_outline},&H80000000,1,0,0,0,100,100,1,0,1,{style.outline_width},1,{alignment},20,20,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    for sub in subs:
        start = _sec_to_ass_time(sub["start"])
        end = _sec_to_ass_time(sub["end"])
        text = sub["text"].replace("\n", "\\N")
        events.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")

    output.write_text(header + "\n".join(events), encoding="utf-8")


def _sec_to_ass_time(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    return f"{h}:{m:02d}:{s:05.2f}"


async def _mix_audio(video: Path, tts_audio: Path, output: Path,
                     tts_volume: float = 0.8, original_volume: float = 0.2):
    """원본 오디오 + TTS 믹싱"""
    filter_complex = (
        f"[0:a]volume={original_volume}[orig];"
        f"[1:a]volume={tts_volume}[tts];"
        f"[orig][tts]amix=inputs=2:duration=first:normalize=0[aout]"
    )
    cmd = [
        "ffmpeg", "-y", "-i", str(video), "-i", str(tts_audio),
        "-filter_complex", filter_complex,
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(output),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
    )
    await proc.wait()


async def _copy_file(src: Path, dst: Path):
    proc = await asyncio.create_subprocess_exec(
        "cp", str(src), str(dst),
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()


def _find_source(job_dir: Path) -> Path:
    for ext in ["mp4", "mkv", "webm", "avi"]:
        p = job_dir / f"source.{ext}"
        if p.exists():
            return p
    raise FileNotFoundError(f"원본 영상 없음: {job_dir}")

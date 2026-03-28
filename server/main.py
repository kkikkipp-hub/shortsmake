import asyncio
import io
import json
import re
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from config import WORKSPACE_DIR, API_KEY, OPENAI_API_KEY
from models.schemas import (
    DownloadRequest, AnalyzeRequest, SegmentSelectRequest,
    SubtitleData, TTSRequest, EffectsConfig, RenderRequest,
    RewriteRequest, JobInfo, JobStatus, Segment,
    SubtitleRemoveRequest, VisualAnalyzeRequest,
)
from utils.progress import progress_manager

app = FastAPI(title="ShortsMake API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["*"],
    allow_headers=["*", "X-API-Key"],
)


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    """API 키 인증 미들웨어 (SHORTSMAKE_API_KEY 환경변수 설정 시 활성)"""
    if API_KEY and request.url.path.startswith("/api/"):
        key = (
            request.headers.get("X-API-Key")
            or request.query_params.get("api_key")
        )
        if key != API_KEY:
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)

# ── 작업(Job) 상태 관리 (인메모리) ─────────────────────────────────────
jobs: dict[str, dict] = {}


def _restore_jobs():
    """서버 시작 시 workspace에서 기존 작업 복원"""
    for job_dir in WORKSPACE_DIR.iterdir():
        if not job_dir.is_dir():
            continue
        job_id = job_dir.name
        meta_file = job_dir / "meta.json"
        if meta_file.exists():
            meta = json.loads(meta_file.read_text())
            seg_file = job_dir / "segments.json"
            status = JobStatus.downloaded
            if seg_file.exists():
                status = JobStatus.analyzed
            jobs[job_id] = {
                "id": job_id,
                "status": status,
                "meta": meta,
                "created_at": meta.get("created_at", ""),
            }
            if seg_file.exists():
                jobs[job_id]["segments"] = json.loads(seg_file.read_text())
        else:
            jobs[job_id] = {
                "id": job_id,
                "status": JobStatus.created,
                "created_at": "",
            }

_restore_jobs()


def _get_job(job_id: str) -> dict:
    if job_id not in jobs:
        raise HTTPException(404, f"작업을 찾을 수 없어요: {job_id}")
    return jobs[job_id]


def _set_status(job_id: str, status: JobStatus):
    jobs[job_id]["status"] = status


# ── WebSocket ──────────────────────────────────────────────────────────
@app.websocket("/ws/{job_id}")
async def ws_progress(ws: WebSocket, job_id: str):
    await progress_manager.connect(job_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        progress_manager.disconnect(job_id, ws)


# ── Job CRUD ───────────────────────────────────────────────────────────
@app.post("/api/jobs")
async def create_job():
    job_id = uuid.uuid4().hex[:12]
    job_dir = WORKSPACE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    jobs[job_id] = {
        "id": job_id,
        "status": JobStatus.created,
        "created_at": datetime.now().isoformat(),
    }
    return {"id": job_id, "status": "created"}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    job = _get_job(job_id)
    result = {**job}
    job_dir = WORKSPACE_DIR / job_id

    # 메타 첨부
    meta_file = job_dir / "meta.json"
    if meta_file.exists():
        result["meta"] = json.loads(meta_file.read_text())

    # 구간 첨부
    seg_file = job_dir / "segments.json"
    if seg_file.exists():
        result["segments"] = json.loads(seg_file.read_text())

    return result


@app.get("/api/jobs")
async def list_jobs():
    return list(jobs.values())


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    import shutil
    job = _get_job(job_id)
    job_dir = WORKSPACE_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir)
    del jobs[job_id]
    return {"ok": True}


# ── Step 1: 다운로드 ──────────────────────────────────────────────────
@app.post("/api/jobs/{job_id}/download")
async def download(job_id: str, req: DownloadRequest, bg: BackgroundTasks):
    job = _get_job(job_id)
    _set_status(job_id, JobStatus.downloading)
    bg.add_task(_bg_download, job_id, req.url)
    return {"status": "downloading", "job_id": job_id}


@app.post("/api/jobs/{job_id}/upload")
async def upload_video(job_id: str, file: UploadFile = File(...)):
    """로컬 파일 직접 업로드 (MP4, MOV, AVI, MKV, WEBM 지원)"""
    _get_job(job_id)
    suffix = Path(file.filename or "video.mp4").suffix.lower()
    if suffix not in (".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"):
        raise HTTPException(400, f"지원하지 않는 파일 형식: {suffix}")

    job_dir = WORKSPACE_DIR / job_id
    video_path = job_dir / f"source{suffix}"

    _set_status(job_id, JobStatus.downloading)
    await progress_manager.send(job_id, "download", 10, "파일 저장 중...")

    # 청크 스트리밍 저장 (대용량 파일 OOM 방지)
    CHUNK = 64 * 1024  # 64KB
    with video_path.open("wb") as f:
        while True:
            chunk = await file.read(CHUNK)
            if not chunk:
                break
            f.write(chunk)

    # 메타데이터 추출 (FFprobe)
    import subprocess
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format",
         "-show_streams", str(video_path)],
        capture_output=True, text=True
    )
    duration = 0.0
    width, height = 0, 0
    if probe.returncode == 0:
        info = json.loads(probe.stdout)
        duration = float(info.get("format", {}).get("duration", 0))
        for s in info.get("streams", []):
            if s.get("codec_type") == "video":
                width = s.get("width", 0)
                height = s.get("height", 0)
                break

    name = Path(file.filename or "video.mp4").stem
    meta = {
        "url": f"local://{file.filename}",
        "title": name,
        "duration": duration,
        "width": width,
        "height": height,
        "resolution": f"{width}x{height}" if width else "unknown",
        "created_at": datetime.now().isoformat(),
    }
    (job_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False))
    jobs[job_id].update({"meta": meta})
    _set_status(job_id, JobStatus.downloaded)
    await progress_manager.send(job_id, "download", 100, "업로드 완료!")
    return {"status": "downloaded", "meta": meta}


async def _bg_download(job_id: str, url: str):
    from services.downloader import download_video
    try:
        result = await download_video(job_id, url)
        jobs[job_id].update(result)
        _set_status(job_id, JobStatus.downloaded)
    except Exception as e:
        jobs[job_id]["error"] = str(e)
        _set_status(job_id, JobStatus.failed)
        await progress_manager.send(job_id, "download", -1, f"오류: {e}")


# ── 제품 모드: 자막 제거 ──────────────────────────────────────────────
@app.post("/api/jobs/{job_id}/remove_subtitles")
async def remove_subtitles(job_id: str, req: SubtitleRemoveRequest, bg: BackgroundTasks):
    _get_job(job_id)
    jobs[job_id]["subtitle_removal"] = "processing"
    bg.add_task(_bg_remove_subtitles, job_id, req.mode)
    return {"status": "processing", "mode": req.mode}


async def _bg_remove_subtitles(job_id: str, mode: str):
    from services.subtitle_remover import remove_subtitles as _remove
    try:
        output = await _remove(job_id, mode)
        jobs[job_id]["subtitle_removal"] = "done"
        jobs[job_id]["subtitle_removal_file"] = str(output)
        await progress_manager.send(job_id, "subtitle_removal", 100, "자막 제거 완료!")
    except Exception as e:
        jobs[job_id]["subtitle_removal"] = "failed"
        jobs[job_id]["error"] = str(e)
        await progress_manager.send(job_id, "subtitle_removal", -1, f"자막 제거 오류: {e}")


# ── 제품 모드: 비전 분석 ───────────────────────────────────────────────
@app.post("/api/jobs/{job_id}/analyze_visual")
async def analyze_visual(job_id: str, req: VisualAnalyzeRequest, bg: BackgroundTasks):
    _get_job(job_id)
    _set_status(job_id, JobStatus.analyzing)
    bg.add_task(_bg_analyze_visual, job_id, req)
    return {"status": "analyzing"}


async def _bg_analyze_visual(job_id: str, req: VisualAnalyzeRequest):
    from services.vision_analyzer import analyze_product_video
    try:
        segments, subtitles_map = await analyze_product_video(
            job_id=job_id,
            api_key=OPENAI_API_KEY,
            frame_interval=req.frame_interval,
            segment_duration=req.segment_duration,
            max_segments=req.max_segments,
            product_hint=req.product_hint,
        )
        jobs[job_id]["segments"] = [s.model_dump() for s in segments]
        jobs[job_id]["vision_subtitles"] = subtitles_map
        _set_status(job_id, JobStatus.analyzed)
    except Exception as e:
        jobs[job_id]["error"] = str(e)
        _set_status(job_id, JobStatus.failed)
        await progress_manager.send(job_id, "analyze", -1, f"비전 분석 오류: {e}")


# ── 제품 모드: 비전 자막 조회 ──────────────────────────────────────────
@app.get("/api/jobs/{job_id}/vision_subtitles/{seg_id}")
async def get_vision_subtitles(job_id: str, seg_id: str):
    job = _get_job(job_id)
    vision_subs = job.get("vision_subtitles") or {}
    subs = vision_subs.get(seg_id, [])
    # vision_subtitles.json 파일에서도 확인
    if not subs:
        vs_file = WORKSPACE_DIR / job_id / "vision_subtitles.json"
        if vs_file.exists():
            all_vs = json.loads(vs_file.read_text())
            subs = all_vs.get(seg_id, [])
    return subs


# ── Step 2: 분석 ──────────────────────────────────────────────────────
@app.post("/api/jobs/{job_id}/analyze")
async def analyze(job_id: str, req: AnalyzeRequest, bg: BackgroundTasks):
    _get_job(job_id)
    _set_status(job_id, JobStatus.analyzing)
    bg.add_task(_bg_analyze, job_id, req.duration_sec, req.max_segments)
    return {"status": "analyzing"}


async def _bg_analyze(job_id: str, duration_sec: int, max_segments: int):
    from services.analyzer import analyze_video
    try:
        segments = await analyze_video(job_id, duration_sec, max_segments)
        jobs[job_id]["segments"] = [s.model_dump() for s in segments]
        _set_status(job_id, JobStatus.analyzed)
    except Exception as e:
        jobs[job_id]["error"] = str(e)
        _set_status(job_id, JobStatus.failed)
        await progress_manager.send(job_id, "analyze", -1, f"오류: {e}")


# ── Step 2.5: 구간 선택 ──────────────────────────────────────────────
@app.post("/api/jobs/{job_id}/segments/select")
async def select_segments(job_id: str, req: SegmentSelectRequest):
    job = _get_job(job_id)
    job_dir = WORKSPACE_DIR / job_id

    # 선택 저장
    (job_dir / "selected.json").write_text(
        json.dumps(req.segment_ids), encoding="utf-8"
    )
    jobs[job_id]["selected_segments"] = req.segment_ids
    return {"selected": req.segment_ids}


# ── Step 3: 자막 생성 ────────────────────────────────────────────────
@app.post("/api/jobs/{job_id}/subtitle/generate")
async def generate_subtitles(job_id: str, bg: BackgroundTasks):
    job = _get_job(job_id)
    job_dir = WORKSPACE_DIR / job_id

    selected_file = job_dir / "selected.json"
    if not selected_file.exists():
        raise HTTPException(400, "먼저 구간을 선택해주세요")
    selected = json.loads(selected_file.read_text())

    _set_status(job_id, JobStatus.transcribing)
    bg.add_task(_bg_transcribe, job_id, selected)
    return {"status": "transcribing", "segments": selected}


async def _bg_transcribe(job_id: str, segment_ids: list[str]):
    from services.transcriber import transcribe_all_selected
    try:
        result = await transcribe_all_selected(job_id, segment_ids)
        _set_status(job_id, JobStatus.transcribed)
    except Exception as e:
        jobs[job_id]["error"] = str(e)
        _set_status(job_id, JobStatus.failed)
        await progress_manager.send(job_id, "transcribe", -1, f"오류: {e}")


# ── Step 3.5: 자막 조회/수정 ─────────────────────────────────────────
@app.get("/api/jobs/{job_id}/subtitle/{segment_id}")
async def get_subtitle(job_id: str, segment_id: str):
    job_dir = WORKSPACE_DIR / job_id
    sub_path = job_dir / "segments" / f"{segment_id}_subs.json"
    if not sub_path.exists():
        raise HTTPException(404, "자막 없음")
    return json.loads(sub_path.read_text())


@app.put("/api/jobs/{job_id}/subtitle/{segment_id}")
async def update_subtitle(job_id: str, segment_id: str, data: SubtitleData):
    job_dir = WORKSPACE_DIR / job_id
    sub_path = job_dir / "segments" / f"{segment_id}_subs.json"
    sub_path.write_text(
        json.dumps([s.model_dump() for s in data.segments], ensure_ascii=False),
        encoding="utf-8",
    )
    return {"ok": True}


# ── Step 3.7: GPT 자막 리라이팅 ─────────────────────────────────────
@app.post("/api/jobs/{job_id}/subtitle/{segment_id}/rewrite")
async def rewrite_subtitle(job_id: str, segment_id: str, req: RewriteRequest):
    from services.rewriter import rewrite_subtitles
    job_dir = WORKSPACE_DIR / job_id
    sub_path = job_dir / "segments" / f"{segment_id}_subs.json"
    if not sub_path.exists():
        raise HTTPException(404, "자막 없음 — 먼저 자막을 생성해주세요")
    subs = json.loads(sub_path.read_text())
    try:
        rewritten = await rewrite_subtitles(subs, req.style, req.custom_prompt)
        return {"original": subs, "rewritten": rewritten}
    except Exception as e:
        raise HTTPException(500, f"GPT 리라이팅 실패: {e}")


@app.get("/api/rewrite/styles")
async def list_rewrite_styles():
    from services.rewriter import REWRITE_STYLES
    return REWRITE_STYLES


# ── Step 4: TTS ──────────────────────────────────────────────────────
@app.get("/api/voices")
async def list_voices():
    from services.tts_engine import KOREAN_VOICES
    return KOREAN_VOICES


@app.post("/api/jobs/{job_id}/tts")
async def synthesize_tts(job_id: str, req: TTSRequest, bg: BackgroundTasks):
    _get_job(job_id)
    bg.add_task(_bg_tts, job_id, req.segment_id, req.voice, req.speed)
    return {"status": "synthesizing", "segment_id": req.segment_id}


async def _bg_tts(job_id: str, segment_id: str, voice: str, speed: float):
    from services.tts_engine import synthesize_segment_tts
    try:
        await synthesize_segment_tts(job_id, segment_id, voice, speed)
    except Exception as e:
        jobs[job_id]["error"] = str(e)
        await progress_manager.send(job_id, "tts", -1, f"TTS 오류: {e}")


# ── Step 5: 효과 설정 + 렌더링 ───────────────────────────────────────
@app.put("/api/jobs/{job_id}/effects")
async def save_effects(job_id: str, config: EffectsConfig):
    job_dir = WORKSPACE_DIR / job_id
    fx_dir = job_dir / "effects"
    fx_dir.mkdir(exist_ok=True)
    (fx_dir / f"{config.segment_id}.json").write_text(
        config.model_dump_json(), encoding="utf-8"
    )
    return {"ok": True}


@app.post("/api/jobs/{job_id}/render")
async def render(job_id: str, req: RenderRequest, bg: BackgroundTasks):
    _get_job(job_id)
    _set_status(job_id, JobStatus.rendering)
    bg.add_task(_bg_render, job_id, req.segment_ids)
    return {"status": "rendering", "segments": req.segment_ids}


async def _bg_render(job_id: str, segment_ids: list[str]):
    from services.effects_engine import render_segment
    job_dir = WORKSPACE_DIR / job_id
    completed = 0
    total = len(segment_ids)

    async def render_one(sid: str):
        nonlocal completed
        fx_file = job_dir / "effects" / f"{sid}.json"
        if fx_file.exists():
            config = EffectsConfig.model_validate_json(fx_file.read_text())
        else:
            config = EffectsConfig(segment_id=sid)
        # 구간 시작 알림
        await progress_manager.send(
            job_id, "render",
            (completed / total) * 100,
            f"렌더링 중: {sid}",
            {"seg_id": sid, "seg_progress": 0},
        )
        try:
            await render_segment(job_id, sid, config)
        except Exception as seg_err:
            await progress_manager.send(
                job_id, "render", -1,
                f"{sid} 렌더링 오류: {seg_err}",
                {"seg_id": sid, "seg_progress": -1},
            )
            raise
        completed += 1
        # 구간 완료 알림
        await progress_manager.send(
            job_id, "render",
            (completed / total) * 100,
            f"완료 {completed}/{total}: {sid}",
            {"seg_id": sid, "seg_progress": 100},
        )

    await progress_manager.send(job_id, "render", 0,
                                f"{total}개 구간 병렬 렌더링 시작...")
    results = await asyncio.gather(
        *[render_one(sid) for sid in segment_ids],
        return_exceptions=True,
    )
    errors = [r for r in results if isinstance(r, BaseException)]
    if errors:
        jobs[job_id]["error"] = str(errors[0])
        _set_status(job_id, JobStatus.failed)
        await progress_manager.send(job_id, "render", -1,
                                    f"렌더링 오류 ({len(errors)}/{total}개 구간 실패): {errors[0]}")
    else:
        _set_status(job_id, JobStatus.completed)
        await progress_manager.send(job_id, "render", 100,
                                    f"모든 렌더링 완료! ({total}개)")


# ── 파일 제공 ─────────────────────────────────────────────────────────
@app.get("/api/jobs/{job_id}/source")
async def get_source_file(job_id: str):
    """구간 미리보기용 원본 영상 스트리밍"""
    _get_job(job_id)
    job_dir = WORKSPACE_DIR / job_id
    for ext in ["mp4", "mkv", "webm", "avi"]:
        p = job_dir / f"source.{ext}"
        if p.exists():
            return FileResponse(
                p, media_type="video/mp4",
                headers={"Accept-Ranges": "bytes"},
            )
    raise HTTPException(404, "소스 파일 없음")


@app.get("/api/jobs/{job_id}/thumb/{filename}")
async def get_thumbnail(job_id: str, filename: str):
    path = WORKSPACE_DIR / job_id / "thumbnails" / filename
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path, media_type="image/jpeg")


@app.get("/api/jobs/{job_id}/output/{filename}")
async def get_output(job_id: str, filename: str, download: bool = False):
    path = WORKSPACE_DIR / job_id / "output" / filename
    if not path.exists():
        raise HTTPException(404)
    if download:
        return FileResponse(path, media_type="video/mp4", filename=filename)
    # 브라우저 인라인 재생용 (Content-Disposition: inline)
    from starlette.responses import Response
    return FileResponse(
        path, media_type="video/mp4",
        headers={"Content-Disposition": f"inline; filename=\"{filename}\""}
    )


@app.get("/api/jobs/{job_id}/outputs")
async def list_outputs(job_id: str):
    out_dir = WORKSPACE_DIR / job_id / "output"
    if not out_dir.exists():
        return []
    return [
        {
            "name": f.name,
            "size": f.stat().st_size,
            "url": f"/api/jobs/{job_id}/output/{f.name}",
            "download_url": f"/api/jobs/{job_id}/output/{f.name}?download=true",
        }
        for f in sorted(out_dir.glob("*_final.mp4"))
    ]


@app.get("/api/jobs/{job_id}/outputs/zip")
async def download_outputs_zip(job_id: str):
    """완성된 모든 영상을 ZIP으로 일괄 다운로드"""
    out_dir = WORKSPACE_DIR / job_id / "output"
    if not out_dir.exists():
        raise HTTPException(404, "출력 파일이 없습니다")
    files = sorted(out_dir.glob("*_final.mp4"))
    if not files:
        raise HTTPException(404, "렌더링된 영상이 없습니다")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, f.name)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="shortsmake_{job_id[:8]}.zip"'},
    )


@app.post("/api/jobs/{job_id}/segments/{segment_id}/preview")
async def generate_preview(job_id: str, segment_id: str, config: EffectsConfig):
    """빠른 미리보기 렌더링 (저해상도, 최대 10초, 자막·TTS·BGM 제외)"""
    from services.effects_engine import render_preview
    _get_job(job_id)
    try:
        preview_path = await render_preview(job_id, segment_id, config)
        return {"url": f"/api/jobs/{job_id}/preview/{preview_path.name}"}
    except Exception as e:
        raise HTTPException(500, f"미리보기 생성 실패: {e}")


@app.get("/api/jobs/{job_id}/preview/{filename}")
async def get_preview_file(job_id: str, filename: str):
    """미리보기 영상 파일 제공"""
    path = WORKSPACE_DIR / job_id / "preview" / filename
    if not path.exists():
        raise HTTPException(404, "미리보기 파일 없음")
    return FileResponse(path, media_type="video/mp4",
                        headers={"Cache-Control": "no-store"})


@app.post("/api/jobs/{job_id}/segments/{segment_id}/thumbnail")
async def create_thumbnail(
    job_id: str, segment_id: str,
    time_offset: float | None = None,
    title: str = "",
):
    """구간 썸네일 생성 (중간 프레임 추출, 선택적 제목 오버레이)"""
    from services.effects_engine import generate_thumbnail
    _get_job(job_id)
    try:
        thumb = await generate_thumbnail(job_id, segment_id, time_offset, title)
        return {"url": f"/api/jobs/{job_id}/thumb/{thumb.name}"}
    except Exception as e:
        raise HTTPException(500, f"썸네일 생성 실패: {e}")


@app.post("/api/jobs/{job_id}/font")
async def upload_font(job_id: str, file: UploadFile = File(...)):
    """커스텀 폰트 업로드 (TTF/OTF) — FONTS_DIR에 저장"""
    from config import FONTS_DIR
    suffix = Path(file.filename or "font.ttf").suffix.lower()
    if suffix not in (".ttf", ".otf"):
        raise HTTPException(400, "TTF 또는 OTF 파일만 허용됩니다")
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    safe_stem = re.sub(r"[^\w\-]", "_", Path(file.filename or "font").stem)[:64]
    font_path = FONTS_DIR / (safe_stem + suffix)
    font_path.write_bytes(await file.read())
    return {"font_name": font_path.stem, "filename": font_path.name}


@app.get("/api/fonts")
async def list_fonts():
    """사용 가능한 폰트 목록 (내장 + 업로드)"""
    from config import FONTS_DIR
    built_in = [{"name": "GmarketSansTTFBold", "label": "지마켓산스 볼드 (기본)"}]
    custom = []
    if FONTS_DIR.exists():
        for f in sorted(FONTS_DIR.glob("*.ttf")) + sorted(FONTS_DIR.glob("*.otf")):
            if f.stem != "GmarketSansTTFBold":
                custom.append({"name": f.stem, "label": f.stem})
    return built_in + custom


@app.post("/api/jobs/{job_id}/bgm")
async def upload_bgm(job_id: str, file: UploadFile = File(...)):
    """BGM 파일 업로드 (MP3/AAC/WAV)"""
    job_dir = WORKSPACE_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(404, "job not found")
    suffix = Path(file.filename or "bgm.mp3").suffix.lower() or ".mp3"
    bgm_path = job_dir / f"bgm{suffix}"
    content = await file.read()
    bgm_path.write_bytes(content)
    return {"status": "ok", "filename": bgm_path.name}

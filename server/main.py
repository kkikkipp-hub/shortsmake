import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import WORKSPACE_DIR
from models.schemas import (
    DownloadRequest, AnalyzeRequest, SegmentSelectRequest,
    SubtitleData, TTSRequest, EffectsConfig, RenderRequest,
    RewriteRequest, JobInfo, JobStatus, Segment,
)
from utils.progress import progress_manager

app = FastAPI(title="ShortsMake API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    try:
        total = len(segment_ids)
        for i, sid in enumerate(segment_ids):
            # 효과 설정 로드
            fx_file = job_dir / "effects" / f"{sid}.json"
            if fx_file.exists():
                config = EffectsConfig.model_validate_json(fx_file.read_text())
            else:
                config = EffectsConfig(segment_id=sid)

            await progress_manager.send(
                job_id, "render",
                (i / total) * 100,
                f"렌더링 {i+1}/{total}: {sid}",
            )
            await render_segment(job_id, sid, config)

        _set_status(job_id, JobStatus.completed)
        await progress_manager.send(job_id, "render", 100,
                                    f"모든 렌더링 완료! ({total}개)")
    except Exception as e:
        jobs[job_id]["error"] = str(e)
        _set_status(job_id, JobStatus.failed)
        await progress_manager.send(job_id, "render", -1, f"렌더링 오류: {e}")


# ── 파일 제공 ─────────────────────────────────────────────────────────
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

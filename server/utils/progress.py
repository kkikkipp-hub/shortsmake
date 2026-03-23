import asyncio
import json
from typing import Optional
from fastapi import WebSocket


class ProgressManager:
    """WebSocket 기반 실시간 진행률 매니저"""

    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}
        self._status: dict[str, dict] = {}

    async def connect(self, job_id: str, ws: WebSocket):
        await ws.accept()
        self._connections.setdefault(job_id, []).append(ws)
        # 현재 상태 즉시 전송
        if job_id in self._status:
            await ws.send_json(self._status[job_id])

    def disconnect(self, job_id: str, ws: WebSocket):
        if job_id in self._connections:
            self._connections[job_id] = [
                c for c in self._connections[job_id] if c != ws
            ]

    async def send(self, job_id: str, step: str, progress: float,
                   message: str = "", detail: Optional[dict] = None):
        payload = {
            "job_id": job_id,
            "step": step,
            "progress": round(progress, 1),
            "message": message,
        }
        if detail:
            payload["detail"] = detail
        self._status[job_id] = payload

        dead = []
        for ws in self._connections.get(job_id, []):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(job_id, ws)


progress_manager = ProgressManager()

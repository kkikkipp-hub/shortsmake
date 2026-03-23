# ShortsMake — API 명세서

## 개요

API는 두 레이어로 구성:
- **Pages Functions** (`/api/*`) — D1/R2 접근, Python 서버 프록시
- **Python Server** (`/py/*`) — 영상 처리 전용 (Pages Functions에서만 호출)

---

## Pages Functions API (프론트에서 직접 호출)

### 영상 관리

**POST /api/videos** — 영상 다운로드 시작
```
Request:  { "url": "https://youtube.com/watch?v=..." }
          또는 multipart/form-data (파일 업로드)
Response: { "id": "uuid", "status": "downloading", "title": "..." }
```

**GET /api/videos/:id** — 영상 상태 조회
```
Response: {
  "id": "uuid",
  "title": "영상 제목",
  "duration": 1234.5,
  "width": 1920, "height": 1080,
  "status": "ready",
  "thumbnail": "https://r2-url/thumb.jpg",
  "created_at": "2026-03-23T..."
}
```

**GET /api/videos/:id/stream** — 영상 스트리밍 (R2 프록시)
```
Response: video/mp4 (Range 지원)
```

### 구간 관리

**GET /api/videos/:id/segments** — AI 추출 구간 목록
```
Response: [
  {
    "id": "uuid",
    "start_time": 45.2,
    "end_time": 105.8,
    "title": "핵심 하이라이트",
    "reason": "감정 고조, 핵심 메시지 전달",
    "score": 9,
    "selected": false
  }, ...
]
```

**PATCH /api/segments/:id** — 구간 선택/수정
```
Request:  { "selected": true, "start_time": 44.0, "end_time": 104.0 }
Response: { "ok": true }
```

### 자막 관리

**GET /api/segments/:id/subtitles** — 구간별 자막 조회
```
Response: [
  {
    "id": 1,
    "start_time": 0.0,
    "end_time": 3.5,
    "text": "안녕하세요 여러분",
    "style_json": {...},
    "seq": 0
  }, ...
]
```

**PUT /api/segments/:id/subtitles** — 자막 일괄 저장 (편집 완료)
```
Request: {
  "subtitles": [
    { "start_time": 0.0, "end_time": 3.5, "text": "수정된 자막", "seq": 0 },
    ...
  ]
}
Response: { "ok": true, "count": 15 }
```

**PUT /api/segments/:id/subtitles/:subId** — 개별 자막 수정
```
Request:  { "text": "수정 텍스트", "start_time": 1.2, "end_time": 3.8 }
Response: { "ok": true }
```

### TTS

**GET /api/tts/voices** — 사용 가능한 TTS 음성 목록
```
Response: [
  { "id": "ko-KR-SunHiNeural", "name": "선희", "gender": "female", "sample_url": "..." },
  { "id": "ko-KR-InJoonNeural", "name": "인준", "gender": "male", "sample_url": "..." },
  { "id": "ko-KR-HyunsuNeural", "name": "현수", "gender": "male", "sample_url": "..." },
  { "id": "ko-KR-BongJinNeural", "name": "봉진", "gender": "male", "sample_url": "..." }
]
```

**POST /api/segments/:id/tts** — TTS 생성 요청
```
Request:  { "voice": "ko-KR-SunHiNeural", "rate": "+10%", "pitch": "+0Hz" }
Response: { "ok": true, "status": "processing" }
```

**GET /api/segments/:id/tts** — TTS 상태/결과 조회
```
Response: {
  "status": "done",
  "audio_url": "https://r2-url/tts/uuid.mp3",
  "duration": 58.3,
  "subtitle_url": "https://r2-url/tts/uuid.srt"
}
```

### 렌더링

**POST /api/render** — 최종 렌더링 시작
```
Request: {
  "segments": [
    {
      "segment_id": "uuid",
      "effects": {
        "orientation": "vertical",
        "vertical_mode": "blur_bg",
        "zoom": { "enabled": true, "type": "ken_burns" },
        "fade": { "in_duration": 1, "out_duration": 1.5 },
        "color_filter": "cinematic",
        "subtitle_style": { "font": "NanumGothicBold", "size": 48, "color": "#FFFFFF" }
      },
      "audio_mode": "tts",
      "tts_voice": "ko-KR-SunHiNeural"
    }, ...
  ]
}
Response: { "render_ids": ["uuid1", "uuid2", ...] }
```

**GET /api/render/:id** — 렌더링 진행률 (SSE 스트림)
```
Response (SSE):
  data: {"progress": 35, "stage": "encoding"}
  data: {"progress": 100, "stage": "done", "download_url": "..."}
```

**GET /api/render/:id/download** — 완성본 다운로드
```
Response: R2 presigned URL로 리다이렉트 (302)
```

---

## Python Server API (Pages Functions에서만 호출)

### POST /py/download
```
Request:  { "url": "...", "video_id": "uuid" }
Response: { "r2_key": "videos/uuid.mp4", "duration": 1234.5, "width": 1920, "height": 1080 }
```

### POST /py/transcribe
```
Request:  { "r2_key": "videos/uuid.mp4", "language": "ko" }
Response: { "subtitles": [...], "language": "ko" }
```

### POST /py/analyze
```
Request:  { "subtitles": [...], "duration_sec": 60 }
Response: { "segments": [...] }
```

### POST /py/tts
```
Request:  { "text": "...", "voice": "ko-KR-SunHiNeural", "rate": "+0%" }
Response: { "r2_key": "tts/uuid.mp3", "duration": 5.3, "srt": "..." }
```

### POST /py/render
```
Request:  { "render_id": "uuid", "r2_source": "videos/uuid.mp4",
            "start": 45.2, "end": 105.8, "effects": {...},
            "subtitles": [...], "tts_r2_key": "tts/uuid.mp3" }
Response: SSE stream → { "progress": N, "r2_key": "renders/uuid.mp4" }
```

---

## 에러 응답 형식

```json
{
  "error": "에러 메시지 (한국어)",
  "code": "ERROR_CODE"
}
```

HTTP 상태 코드:
- 400: 잘못된 요청
- 404: 리소스 없음
- 422: 처리 불가 (URL 다운로드 실패 등)
- 500: 서버 오류
- 503: Python 서버 연결 불가

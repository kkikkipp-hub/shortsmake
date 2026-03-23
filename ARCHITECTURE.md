# ShortsMake — 시스템 아키텍처

## 1. 전체 구조

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                       │
│  ┌─────────────────┐   ┌─────────────────────────────┐  │
│  │  React Frontend  │   │   Pages Functions (Hono)    │  │
│  │  Vite + TS       │──▶│   /api/* 라우팅              │  │
│  │  - 영상 플레이어  │   │   - D1 CRUD (메타데이터)     │  │
│  │  - 자막 편집기    │   │   - R2 presigned URL 생성   │  │
│  │  - 효과 선택 UI  │   │   - Python서버 프록시        │  │
│  └─────────────────┘   └──────┬──────────┬───────────┘  │
│                               │          │               │
│                          Cloudflare D1  Cloudflare R2    │
│                          (메타데이터)   (영상 파일)       │
└───────────────────────────────┼──────────────────────────┘
                                │ HTTP
                    ┌───────────▼───────────┐
                    │  Python FastAPI Server  │
                    │  (로컬 / VPS)           │
                    │                         │
                    │  - yt-dlp (다운로드)     │
                    │  - faster-whisper (STT)  │
                    │  - edge-tts (TTS)        │
                    │  - FFmpeg (편집/렌더링)   │
                    │  - OpenAI API (분석)      │
                    └─────────────────────────┘
```

## 2. 왜 2-tier 구조인가

Cloudflare Workers/Pages Functions는:
- FFmpeg 바이너리 실행 불가 (네이티브 프로세스 제한)
- Whisper 모델 로딩 불가 (메모리/CPU 제한)
- 장시간 작업 불가 (30초 타임아웃)

따라서:
- **Pages Functions** → 가벼운 작업 (D1 CRUD, R2 URL, 프록시)
- **Python 서버** → 무거운 작업 (영상 처리, STT, TTS, 렌더링)

## 3. 데이터 흐름

### 3-1. 영상 다운로드 & 분석

```
[프론트] POST /api/videos {url}
    ↓
[Pages Fn] D1에 video 레코드 생성 (status: 'downloading')
    ↓ 프록시
[Python] yt-dlp 다운로드 → R2에 업로드
    ↓
[Python] faster-whisper STT → 자막 JSON 생성
    ↓
[Python] GPT-4o 구간 분석 → segments JSON
    ↓ 콜백
[Pages Fn] D1에 subtitles + segments 저장
           video status → 'ready'
```

### 3-2. 자막 편집 (프론트에서 직접)

```
[프론트] 자막 텍스트/타이밍 수정
    ↓
[Pages Fn] PUT /api/segments/:id/subtitles
    ↓
[D1] subtitles 업데이트
```

### 3-3. TTS 생성

```
[프론트] POST /api/segments/:id/tts {voice, rate}
    ↓
[Pages Fn] 프록시 →
[Python] edge-tts 생성 → R2에 MP3 업로드
    ↓ 콜백
[Pages Fn] D1에 tts_url 저장
```

### 3-4. 최종 렌더링

```
[프론트] POST /api/render {segment_ids, effects, tts_option}
    ↓
[Pages Fn] D1에 render job 생성 → 프록시
[Python] FFmpeg 파이프라인:
    1. R2에서 원본 다운로드
    2. 구간 자르기
    3. 세로(9:16) 변환 + 효과 적용
    4. 자막 오버레이 (ASS)
    5. TTS 오디오 믹싱
    6. 최종 MP4 인코딩
    7. R2에 업로드
    ↓ 진행률 SSE
[프론트] 프로그레스 바 표시
    ↓ 완료
[Pages Fn] D1 render status → 'done', R2 URL 저장
[프론트] 다운로드 버튼 활성화
```

## 4. 디렉토리 구조

```
/home/comnict/aiwork/shortsmake/
├── client/                      # Cloudflare Pages (React)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── HomePage.tsx         # URL 입력
│   │   │   ├── AnalyzePage.tsx      # 분석 진행/구간 선택
│   │   │   ├── EditPage.tsx         # 자막 편집 + 효과 설정
│   │   │   └── RenderPage.tsx       # 렌더링 + 다운로드
│   │   ├── components/
│   │   │   ├── VideoPlayer.tsx      # HTML5 영상 플레이어
│   │   │   ├── SubtitleEditor.tsx   # 자막 편집기
│   │   │   ├── EffectSelector.tsx   # 영상 효과 선택
│   │   │   ├── Timeline.tsx         # 구간 타임라인
│   │   │   └── ProgressBar.tsx      # 진행률 표시
│   │   ├── utils/
│   │   │   └── api.ts              # API 호출 유틸
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── functions/                   # Cloudflare Pages Functions
│   └── api/
│       └── [[route]].ts         # Hono 라우터 (D1, R2, 프록시)
│
├── server/                      # Python FastAPI (영상 처리)
│   ├── main.py                  # 앱 엔트리
│   ├── routers/
│   │   ├── download.py          # 다운로드 API
│   │   ├── transcribe.py        # STT API
│   │   ├── analyze.py           # AI 분석 API
│   │   ├── tts.py               # TTS API
│   │   └── render.py            # 렌더링 API
│   ├── services/
│   │   ├── downloader.py        # yt-dlp 래퍼
│   │   ├── transcriber.py       # faster-whisper 래퍼
│   │   ├── analyzer.py          # GPT-4o 구간 분석
│   │   ├── tts_service.py       # edge-tts 래퍼
│   │   ├── editor.py            # FFmpeg 효과/변환
│   │   ├── renderer.py          # 최종 렌더링 파이프라인
│   │   └── r2_client.py         # R2 업로드/다운로드
│   ├── models/
│   │   └── schemas.py           # Pydantic 모델
│   └── requirements.txt
│
├── migrations/                  # D1 마이그레이션
│   ├── 0001_init.sql
│   └── ...
│
├── wrangler.toml                # Cloudflare 설정
├── PRD.md
├── ARCHITECTURE.md
├── DB_SCHEMA.md
├── API_SPEC.md
└── RESEARCH_기술리서치.md
```

## 5. 환경 설정

### wrangler.toml
```toml
name = "shortsmake"
compatibility_date = "2024-09-23"
pages_build_output_dir = "client/dist"

[[d1_databases]]
binding = "DB"
database_name = "shortsmake-db"
database_id = "..."

[[r2_buckets]]
binding = "R2"
bucket_name = "shortsmake-media"

[vars]
PYTHON_API_URL = "http://localhost:8000"
OPENAI_API_KEY = ""
```

### Python 서버 환경변수
```
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=shortsmake-media
OPENAI_API_KEY=...
```

# ShortsMake 작업일지

---

## 2026-03-23 (1일차) — 프로젝트 착수 ~ MVP 완성

### 참여 인원
- PM: coderK
- 풀스택 개발: Isaac
- 리서처: 아이작2
- QA/리뷰: 아이작_리뷰어
- UI/UX: 아이작D
- 마케터: 아이작M

---

### 오전 — 기획 및 설계

**완료 항목**
- PRD.md 작성 (프로젝트 목적, 타겟, 핵심 기능 정의)
- ARCHITECTURE.md 작성 (2-tier 구조: Cloudflare Pages + Python FastAPI)
- DB_SCHEMA.md 작성 (D1, R2 스키마 설계)
- API_SPEC.md 작성 (전체 REST API 명세)
- UI_WIREFRAME.md 작성 (5단계 SPA 흐름)
- RESEARCH_기술리서치.md 작성

**기술 스택 확정**
- 프론트: Vite + React + TypeScript (localhost:5173)
- 백엔드: Python FastAPI (localhost:8001)
- STT: faster-whisper (medium 모델)
- TTS: edge-tts (한국어 9개 음성)
- 영상 처리: FFmpeg subprocess
- 다운로드: yt-dlp
- 상태 관리: zustand
- 실시간 통신: WebSocket
- 배포: Cloudflare Pages + D1 + R2

---

### 오후 — 개발 착수 및 핵심 기능 구현

**구현 완료**

#### 백엔드 (`/server`)
- `main.py`: FastAPI 앱, 인메모리 job 관리, 서버 재시작 시 workspace 스캔으로 job 복원(`_restore_jobs`)
- `config.py`: FFmpeg PATH 설정, Whisper 모델 설정, .env 로드
- `models/schemas.py`: EffectType enum (14종), Effect, EffectsConfig, SubtitleStyle 등 전체 스키마
- `services/transcriber.py`: faster-whisper 기반 STT, 노이즈 필터, VAD, 자막 후처리
- `services/effects_engine.py`: FFmpeg 기반 영상 효과 엔진 (클로즈업, 분할화면, 줌, 흔들림 등)
- `services/tts_service.py`: edge-tts 음성 합성

#### 프론트엔드 (`/client`)
- 5단계 SPA: InputStep → SegmentsStep → SubtitleStep → EffectsStep → RenderStep
- `useApi.ts`: 전체 API 훅
- `projectStore.ts`: zustand 전역 상태
- `ProgressBar.tsx`: WebSocket 기반 실시간 진행률

---

### 저녁 — 버그 수정 및 기능 개선

#### 수정된 버그

| # | 증상 | 원인 | 해결 |
|---|------|------|------|
| 1 | AI 분석 시작 → 404 | Vite proxy가 8000 포트 지정 | vite.config.ts → 8001로 수정 |
| 2 | 서버 재시작 후 job 사라짐 | 인메모리 저장소 초기화 | `_restore_jobs()` 추가 — workspace 스캔으로 복원 |
| 3 | 렌더링이 매우 느림 | `_cut_segment`에서 libx264 재인코딩 | `-c copy` 스트림 복사로 변경 |
| 4 | seg_002.wav not found | 서버 프로세스 PATH에 FFmpeg 없음 | `config.py` 최상단에 PATH 강제 주입 |
| 5 | --reload 모드 서버 크래시 | 파일 와처 불안정 | `--reload` 제거, 안정 모드 실행 |
| 6 | 최종 렌더링 버튼 무반응 | try/catch 없어 오류 무시 | `setError()` 핸들링 추가 |
| 7 | 클로즈업/분할 효과 이중 변환 | `_convert_aspect` 후 layout 효과 적용 | `has_layout_effect` 플래그로 건너뜀 |
| 8 | 완성 영상 안 열림 | FileResponse에 attachment 헤더, 플레이어 없음 | inline 헤더 + `<video>` 미리보기 추가 |

#### 추가된 기능
- **STT 품질 개선**: base → medium 모델, 노이즈 필터(`highpass`, `lowpass`, `afftdn`), 환각 패턴 필터, 자막 후처리 (짧은 자막 병합, 긴 자막 분할, 겹침 수정)
- **자막 리라이팅 편집**: GPT 리라이팅 결과를 read-only → 편집 가능 input으로 변경
- **영상 효과 8종 추가**: 효과없음, 클로즈업채우기, 상하2분할, 좌우2분할, 줌펀치, 임팩트흔들림, 줌인강조, 페이드인/아웃
- **영상 인라인 미리보기**: 렌더링 완료 후 `<video>` 플레이어로 즉시 시청 + 별도 다운로드 버튼

---

### 현재 상태

- 서버: 실행 중 (PID 705994, port 8001)
- 프론트: Vite dev server (port 5173)
- 완성 영상 저장 위치: `server/workspace/{jobId}/output/{segId}_final.mp4`
- 서버 로그: `/tmp/shortsmake-server.log`

---

### 미완료 / 다음 작업

- [ ] seg_002 자막 생성 정상화 확인 (FFmpeg PATH 수정 후 미검증)
- [ ] 8종 영상 효과 실제 영상으로 테스트
- [ ] Cloudflare Pages + D1 + R2 배포 연동
- [ ] GPT 자막 리라이팅 실제 API 연동 테스트
- [ ] 모바일 UI 최적화
- [ ] 에러 상태 UI 개선 (사용자 친화적 메시지)

---

*작성: PM coderK | ShortsMake v0.1 MVP*

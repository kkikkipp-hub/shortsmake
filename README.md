# ShortsMake

롱폼 영상 URL을 입력하면 AI가 분석하여 여러 개의 숏폼 영상을 자동 생성하는 웹 서비스.

## 기능

- 🎬 YouTube, Vimeo 등 yt-dlp 지원 URL 다운로드
- ✂️ AI 기반 자동 구간 분석 및 선택
- 💬 Whisper 기반 자막 자동 생성 및 편집 (Bold/Italic/Shadow/자간 스타일)
- ✨ 줌인/패닝 등 효과 설정, 커스텀 폰트 업로드 지원
- 🎤 Azure Edge TTS 음성 합성
- 📱 9:16 숏폼 영상 렌더링 및 다운로드
- 🛍️ **제품 쇼츠 모드**: GPT-4o Vision으로 하이라이트 구간 + 자막 자동 생성 (OPENAI_API_KEY 필요)
- 🧹 번인 자막 제거: EasyOCR 감지 → FFmpeg delogo(fast) / OpenCV inpainting(quality)
- 📂 Job 대시보드: 이전 작업 목록, ZIP 다운로드, 삭제

## 기술 스택

| 구분 | 스택 |
|------|------|
| 프론트엔드 | React 19 + TypeScript + Vite + Zustand |
| 백엔드 | Python FastAPI (Port 8001) |
| STT | faster-whisper |
| TTS | Edge TTS (Azure) |
| 영상 처리 | FFmpeg, yt-dlp |

## 로컬 실행

### 백엔드

```bash
cd /home/comnict/aiwork/shortsmake
source .venv/bin/activate
uvicorn server.main:app --reload --port 8001
```

### 프론트엔드

```bash
cd client
npm run dev
# → http://localhost:5173
```

## 버전

현재 버전: `0.1.12.0` — 자세한 변경 이력은 [CHANGELOG.md](CHANGELOG.md) 참조.

## 문서

- [PRD.md](PRD.md) — 프로젝트 요구사항
- [ARCHITECTURE.md](ARCHITECTURE.md) — 시스템 아키텍처
- [API_SPEC.md](API_SPEC.md) — API 명세
- [DB_SCHEMA.md](DB_SCHEMA.md) — 데이터 스키마

# ShortsMake 기술 리서치 보고서

**작성:** 아이작2 (리서처)
**날짜:** 2026-03-23

---

## 1. 영상 다운로드

### 추천: yt-dlp (Python 3.10+)

**설치:**
```bash
pip install yt-dlp
```

**Python 코드 예시:**
```python
import yt_dlp

def download_video(url: str, output_dir: str = "./downloads") -> dict:
    opts = {
        'format': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
        'merge_output_format': 'mp4',
        'outtmpl': f'{output_dir}/%(id)s.%(ext)s',
        'writeinfojson': True,       # 메타데이터 JSON 저장
        'writesubtitles': True,      # 기존 자막 다운로드
        'subtitleslangs': ['ko', 'en'],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return {
            'id': info['id'],
            'title': info['title'],
            'duration': info['duration'],
            'resolution': f"{info.get('width','?')}x{info.get('height','?')}",
            'filepath': ydl.prepare_filename(info),
        }
```

**주요 포맷 옵션:**
- `bestvideo+bestaudio/best` — 최고 품질 (별도 스트림 병합)
- `bestvideo[height<=1080]+bestaudio` — 1080p 이하 제한
- `merge_output_format: 'mp4'` — MP4로 출력 (FFmpeg 필요)

**저작권 프리 판별 주의사항:**
- yt-dlp 자체는 저작권을 판별하지 않음
- Creative Commons 라이선스 필터: YouTube API `videoLicense=creativeCommon`
- 사용자에게 "저작권 프리 영상만 사용하세요" 경고 UI 필수
- Pixabay, Pexels Videos 등 CC0 플랫폼은 별도 API 지원

**장점:** 1000+ 사이트 지원, 활발한 유지보수 (2026.02 최신 릴리즈)
**단점:** 사이트 정책 변경 시 일시 차단 가능

---

## 2. 영상 분석 및 하이라이트 구간 자동 추출

### 2-1. STT 자막 생성 — faster-whisper (추천)

**왜 faster-whisper인가:**
- OpenAI Whisper 대비 **4~5배 빠름** (CTranslate2 엔진)
- 동일 모델 가중치 → 동일 정확도
- 메모리 사용량 절반 (int8 양자화 지원)
- word-level timestamp 지원

**설치:**
```bash
pip install faster-whisper
```

**코드 예시:**
```python
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cpu", compute_type="int8")
# GPU 사용 시: device="cuda", compute_type="float16"

def transcribe(video_path: str) -> list[dict]:
    segments, info = model.transcribe(
        video_path,
        language="ko",
        word_timestamps=True,
        vad_filter=True,  # 무음 구간 자동 필터링
    )
    subtitles = []
    for seg in segments:
        subtitles.append({
            'start': seg.start,
            'end': seg.end,
            'text': seg.text.strip(),
            'words': [
                {'word': w.word, 'start': w.start, 'end': w.end}
                for w in (seg.words or [])
            ]
        })
    return subtitles
```

**대안 비교:**
- **openai-whisper**: 원본, 느림 (1x 실시간)
- **faster-whisper**: 4~5x 빠름, 메모리 절약 ← 추천
- **WhisperX**: word-level + 화자 분리, faster-whisper 기반
- **Whisper API (OpenAI)**: 클라우드, 유료, word-level 지원

### 2-2. 장면 전환 감지 — PySceneDetect

**설치:**
```bash
pip install scenedetect[opencv]
```

**코드 예시:**
```python
from scenedetect import detect, ContentDetector, split_video_ffmpeg

def detect_scenes(video_path: str, threshold: float = 27.0):
    scene_list = detect(video_path, ContentDetector(threshold=threshold))
    return [
        {'start': s[0].get_seconds(), 'end': s[1].get_seconds()}
        for s in scene_list
    ]
```

**장점:** Python API가 깔끔, FFmpeg 연동 자동 분할
**단점:** 음성/의미 기반 분석은 안됨 → AI 보완 필요

### 2-3. AI 기반 하이라이트 구간 추천 — GPT API

자막 텍스트를 GPT에 전달하여 숏폼에 적합한 구간 자동 추출:

```python
import openai

def analyze_highlights(subtitles: list[dict], duration_sec: int = 60) -> list[dict]:
    transcript = "\n".join(
        f"[{s['start']:.1f}s ~ {s['end']:.1f}s] {s['text']}"
        for s in subtitles
    )
    prompt = f"""다음은 영상의 전체 자막입니다.

{transcript}

이 영상에서 {duration_sec}초 길이의 숏폼 영상으로 만들기 좋은 구간을 5개 추천해주세요.
각 구간마다 JSON 형식으로:
- start_time (초)
- end_time (초)
- title (한줄 제목)
- reason (추천 이유)
- score (1~10 매력도 점수)
"""
    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)["segments"]
```

---

## 3. 숏폼 영상 편집 자동화

### 3-1. FFmpeg 직접 사용 (추천)

**가로(16:9) → 세로(9:16) 변환 (배경 블러 + 중앙 원본):**
```bash
ffmpeg -i input.mp4 -filter_complex "
  [0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20[bg];
  [0:v]scale=1080:-2:force_original_aspect_ratio=decrease[fg];
  [bg][fg]overlay=(W-w)/2:(H-h)/2
" -c:a copy output_vertical.mp4
```

**줌인/줌아웃 (Ken Burns 효과):**
```bash
ffmpeg -i input.mp4 -filter_complex "
  zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=1080x1920:fps=30
" output_zoom.mp4
```

**분할화면 (2분할 좌우):**
```bash
ffmpeg -i clip1.mp4 -i clip2.mp4 -filter_complex "
  [0:v]scale=540:1920[left];
  [1:v]scale=540:1920[right];
  [left][right]hstack=inputs=2
" output_split.mp4
```

**PiP (Picture-in-Picture):**
```bash
ffmpeg -i main.mp4 -i pip.mp4 -filter_complex "
  [1:v]scale=320:180[pip];
  [0:v][pip]overlay=W-w-20:20
" output_pip.mp4
```

**페이드 인/아웃:**
```bash
ffmpeg -i input.mp4 -filter_complex "
  fade=t=in:st=0:d=1,fade=t=out:st=58:d=2;
  afade=t=in:st=0:d=1,afade=t=out:st=58:d=2
" output_fade.mp4
```

**자막 오버레이 (ASS 스타일):**
```bash
ffmpeg -i input.mp4 -vf "ass=subtitles.ass" output_sub.mp4
```

**색보정 필터:**
```bash
# 밝게
ffmpeg -i input.mp4 -vf "eq=brightness=0.06:contrast=1.1:saturation=1.2" bright.mp4
# 빈티지
ffmpeg -i input.mp4 -vf "curves=vintage" vintage.mp4
# 시네마틱 (비네팅)
ffmpeg -i input.mp4 -vf "vignette=PI/4" cinematic.mp4
```

### 3-2. Python에서 FFmpeg 실행

```python
import subprocess, shlex

def run_ffmpeg(cmd: str, timeout: int = 600):
    """FFmpeg 명령어 실행 + 진행률 콜백"""
    process = subprocess.Popen(
        shlex.split(cmd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    stdout, stderr = process.communicate(timeout=timeout)
    if process.returncode != 0:
        raise RuntimeError(f"FFmpeg 실패: {stderr.decode()}")
    return stdout

# 구간 자르기 (무손실)
def cut_segment(input_path: str, start: float, end: float, output_path: str):
    cmd = (
        f'ffmpeg -y -ss {start} -to {end} -i "{input_path}" '
        f'-c copy -avoid_negative_ts make_zero "{output_path}"'
    )
    run_ffmpeg(cmd)
```

### 3-3. MoviePy vs FFmpeg 비교

| 항목 | FFmpeg (subprocess) | MoviePy |
|---|---|---|
| 속도 | 매우 빠름 (스트림 복사 시 ms 단위) | 느림 (70초 클립 추출에 20초+) |
| 메모리 | 적음 | 많음 (프레임 디코딩) |
| 효과 다양성 | 매우 다양 (filter_complex) | 기본 효과만 |
| 코드 가독성 | 낮음 (명령어 문자열) | 높음 (Python API) |
| 추천 | 프로덕션 용 ← 추천 | 프로토타이핑 용 |

**결론:** FFmpeg subprocess 사용 추천. 복잡한 필터 체인은 Python에서 문자열 빌더로 조합.

---

## 4. TTS (Text-to-Speech)

### 추천: edge-tts

**설치:**
```bash
pip install edge-tts
```

**한국어 음성 목록:**
```bash
edge-tts --list-voices | grep ko-KR
```

주요 한국어 음성:
- `ko-KR-SunHiNeural` — 여성, 자연스럽고 밝은 톤 ← 추천
- `ko-KR-InJoonNeural` — 남성, 안정적인 톤
- `ko-KR-HyunsuNeural` — 남성, 좀 더 부드러운 톤
- `ko-KR-BongJinNeural` — 남성, 뉴스 앵커 스타일

**코드 예시 (자막 타이밍 싱크):**
```python
import edge_tts
import asyncio

async def generate_tts(
    text: str,
    voice: str = "ko-KR-SunHiNeural",
    output_audio: str = "tts.mp3",
    output_srt: str = "tts.srt",
    rate: str = "+0%",
):
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    submaker = edge_tts.SubMaker()

    with open(output_audio, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                submaker.feed(chunk)

    # SRT 자막 파일 생성 (TTS 타이밍에 동기화)
    with open(output_srt, "w", encoding="utf-8") as f:
        f.write(submaker.generate_subs())

    return output_audio, output_srt

# 사용
asyncio.run(generate_tts("안녕하세요, 숏폼 자동 생성 테스트입니다."))
```

**자막별 개별 TTS 생성 (구간별 싱크):**
```python
async def generate_tts_per_subtitle(subtitles: list[dict], voice: str, output_dir: str):
    """각 자막 구간별로 TTS 생성 → 나중에 FFmpeg로 concat"""
    audio_files = []
    for i, sub in enumerate(subtitles):
        output = f"{output_dir}/tts_{i:04d}.mp3"
        communicate = edge_tts.Communicate(sub['text'], voice)
        await communicate.save(output)
        audio_files.append({
            'path': output,
            'start': sub['start'],
            'end': sub['end'],
            'text': sub['text'],
        })
    return audio_files
```

**장점:**
- 완전 무료 (API 키 불필요)
- 고품질 Neural 음성
- 비동기 처리로 빠름
- SRT/VTT 자막 자동 생성 (WordBoundary 이벤트)
- 속도/피치/볼륨 조절 가능

**단점:**
- Microsoft 서비스 의존 (오프라인 불가)
- 매우 긴 텍스트는 분할 필요

---

## 5. 프론트엔드 영상 편집 UI

### 5-1. 타임라인 에디터

**추천: @xzdarcy/react-timeline-editor**
```bash
npm install @xzdarcy/react-timeline-editor
```
- 드래그&드롭 타임라인
- 커스텀 액션 핸들러
- 스크롤/줌 지원
- 가볍고 의존성 적음

**대안: Twick (AI 기반 편집기 SDK)**
- AI 자막 생성 내장
- Canvas 기반 편집
- MP4 export
- 다만 무거움

### 5-2. 자막 편집 UI

**추천: @lilsnake/subtitle-editor**
```bash
npm install @lilsnake/subtitle-editor
```
- SRT/VTT/ASS 포맷 지원
- 웨이브폼 시각화
- 실시간 편집
- 타임라인 뷰

**직접 구현 시 핵심 컴포넌트:**
```
SubtitleEditor
├── VideoPlayer       — HTML5 video + 커스텀 컨트롤
├── WaveformDisplay    — wavesurfer.js 또는 peaks.js
├── SubtitleList       — 편집 가능한 자막 리스트
│   └── SubtitleRow    — 시작/끝 시간 + 텍스트 input
├── Timeline           — 드래그로 구간 조정
└── StylePanel         — 폰트/크기/색상/위치
```

### 5-3. 영상 미리보기

**wavesurfer.js** — 오디오 웨이브폼 시각화
```bash
npm install wavesurfer.js
```

**HTML5 Video** + currentTime 동기화로 자막 하이라이트:
```typescript
const videoRef = useRef<HTMLVideoElement>(null)

useEffect(() => {
  const interval = setInterval(() => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime
      // 현재 시간에 해당하는 자막 하이라이트
      setActiveSubtitle(subtitles.find(
        s => time >= s.start && time <= s.end
      ))
    }
  }, 100)
  return () => clearInterval(interval)
}, [subtitles])
```

---

## 6. 기술 스택 추천

### 최종 추천 스택

**백엔드: Python FastAPI**
- 이유: FFmpeg/Whisper/edge-tts 모두 Python 생태계
- 영상 처리 파이프라인 구축에 최적
- 비동기 지원 (async/await) → TTS, 다운로드 병렬화

**영상 처리: FFmpeg (subprocess)**
- MoviePy 대비 4~20배 빠름
- 필터 체인으로 모든 효과 조합 가능
- GPU 가속 (NVIDIA NVENC) 지원

**STT: faster-whisper**
- OpenAI Whisper 대비 4~5배 빠름
- word-level timestamp 지원
- int8 양자화로 메모리 절약

**TTS: edge-tts**
- 무료, 고품질 한국어 음성
- 자막 타이밍 자동 동기화

**AI 분석: OpenAI GPT-4o API**
- 자막 기반 하이라이트 구간 추천
- 자막 교정/요약

**프론트: React + Vite + TypeScript**
- react-timeline-editor (타임라인)
- wavesurfer.js (웨이브폼)
- HTML5 Video API (프리뷰)

**작업 큐: Celery + Redis**
- 이유: 백엔드가 Python이므로 Celery가 자연스러움
- 영상 다운로드, STT, 렌더링 등 오래 걸리는 작업 비동기 처리
- 진행률 추적 (task state)

```
Celery 작업 흐름:
task_download → task_transcribe → task_analyze → (사용자 편집) → task_render
```

### 필요 시스템 패키지
```bash
# Ubuntu/Debian
sudo apt install ffmpeg
# 또는 최신 FFmpeg (5.x+)
```

### requirements.txt (안)
```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
yt-dlp>=2026.2.0
faster-whisper>=1.1.0
edge-tts>=6.1.0
openai>=1.50.0
celery[redis]>=5.4.0
python-multipart>=0.0.9
pydantic>=2.0
```

---

## 요약 — 핵심 기술 선택 이유

| 영역 | 선택 | 이유 |
|---|---|---|
| 다운로드 | yt-dlp | 1000+ 사이트, 안정적 |
| STT | faster-whisper | 4~5x 빠름, word-level timestamp |
| AI 분석 | GPT-4o | 자막 기반 구간 추천 정확도 |
| 영상 편집 | FFmpeg subprocess | 최고 성능, 효과 다양성 |
| TTS | edge-tts | 무료, 고품질 한국어 |
| 백엔드 | FastAPI | Python 생태계 활용 |
| 프론트 | React + Vite | 타임라인/자막 편집 UI |
| 작업 큐 | Celery + Redis | 무거운 작업 비동기 처리 |

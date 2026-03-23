import os
from pathlib import Path

# FFmpeg + venv 실행파일 PATH 보장
_VENV_BIN = str(Path(__file__).parent / ".venv" / "bin")
os.environ["PATH"] = _VENV_BIN + ":/home/comnict/.local/bin:" + os.environ.get("PATH", "")

BASE_DIR = Path(__file__).parent
WORKSPACE_DIR = BASE_DIR / "workspace"
WORKSPACE_DIR.mkdir(exist_ok=True)

# faster-whisper 모델 (tiny/base/small/medium/large-v3)
WHISPER_MODEL = "medium"
WHISPER_DEVICE = "cpu"
WHISPER_COMPUTE = "int8"

# 영상 분석 기본값
DEFAULT_SHORT_DURATION = 30  # 초
MAX_SEGMENTS = 10
MIN_SEGMENT_SCORE = 0.3

# TTS 기본 음성
DEFAULT_VOICE = "ko-KR-SunHiNeural"

# FFmpeg
FFMPEG_THREADS = 4

# 폰트
FONTS_DIR = BASE_DIR / "fonts"

# OpenAI
from dotenv import load_dotenv
load_dotenv(BASE_DIR / ".env")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

# API 인증 키 (설정 시 모든 /api/* 요청에 X-API-Key 헤더 필요)
# 비어있으면 로컬 개발 모드 (인증 비활성)
API_KEY = os.environ.get("SHORTSMAKE_API_KEY", "")

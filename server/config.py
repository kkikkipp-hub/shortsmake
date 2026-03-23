import os
from pathlib import Path

# FFmpeg PATH 보장
os.environ["PATH"] = "/home/comnict/.local/bin:" + os.environ.get("PATH", "")

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

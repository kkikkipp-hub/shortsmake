from pydantic import BaseModel, field_validator
from typing import Optional
from enum import Enum
from urllib.parse import urlparse


class JobStatus(str, Enum):
    created = "created"
    downloading = "downloading"
    downloaded = "downloaded"
    analyzing = "analyzing"
    analyzed = "analyzed"
    transcribing = "transcribing"
    transcribed = "transcribed"
    rendering = "rendering"
    completed = "completed"
    failed = "failed"


class DownloadRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def validate_url_scheme(cls, v: str) -> str:
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(
                f"허용되지 않는 URL 스킴: '{parsed.scheme}' (http/https만 허용)"
            )
        return v


class AnalyzeRequest(BaseModel):
    duration_sec: int = 30
    max_segments: int = 10


class Segment(BaseModel):
    id: str
    start_sec: float
    end_sec: float
    duration: float
    score: float
    reason: str
    thumbnail: Optional[str] = None


class WordEntry(BaseModel):
    word: str
    start: float
    end: float


class SubtitleEntry(BaseModel):
    id: str
    start: float
    end: float
    text: str
    words: list[WordEntry] = []


class SubtitleData(BaseModel):
    segments: list[SubtitleEntry]


class SegmentSelectRequest(BaseModel):
    segment_ids: list[str]


class EffectType(str, Enum):
    zoom_in = "zoom_in"
    zoom_out = "zoom_out"
    zoom_punch = "zoom_punch"           # 빠르게 줌인→복귀 (임팩트)
    closeup_fill = "closeup_fill"       # 중앙 클로즈업으로 화면 꽉 채우기
    split_top_bottom = "split_top_bottom"  # 상하 2분할 (위:전체, 아래:클로즈업)
    split_left_right = "split_left_right"  # 좌우 2분할
    pan_left = "pan_left"
    pan_right = "pan_right"
    pan_up = "pan_up"
    pan_down = "pan_down"
    shake = "shake"                     # 임팩트 흔들림
    fade_in = "fade_in"
    fade_out = "fade_out"
    blur_bg_portrait = "blur_bg_portrait"


class Effect(BaseModel):
    type: EffectType
    start: float = 0
    end: float = 0
    factor: float = 1.3
    # closeup_fill/split 전용: 크롭 위치 (0.0~1.0, 기본 중앙)
    crop_x: float = 0.5
    crop_y: float = 0.5


class SubtitleStyle(BaseModel):
    font_name: str = "GmarketSansTTFBold"
    font_size: int = 44
    color: str = "#FFFFFF"
    outline_color: str = "#000000"
    outline_width: int = 3
    position: str = "bottom"  # top, center, bottom
    bg_color: Optional[str] = None
    bg_opacity: float = 0.6


# 화면 비율 프리셋
ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "9:16":  (1080, 1920),   # 세로 숏폼
    "1:1":   (1080, 1080),   # 정사각형 (인스타)
    "4:5":   (1080, 1350),   # 인스타 세로
    "16:9":  (1920, 1080),   # 가로 원본
    "4:3":   (1440, 1080),   # 가로 클래식
}


class EffectsConfig(BaseModel):
    segment_id: str
    orientation: str = "portrait"  # portrait, landscape (하위호환)
    aspect_ratio: str = "9:16"     # 9:16, 1:1, 4:5, 16:9, 4:3
    effects: list[Effect] = []
    subtitle_style: SubtitleStyle = SubtitleStyle()
    color_preset: str = "none"     # none, vivid, cinematic, warm, cool, bw
    denoise_audio: bool = False    # afftdn 노이즈 감소
    speed: float = 1.0             # 영상 속도 (0.5~2.0)
    watermark: str = ""            # 워터마크 텍스트 (빈 문자열이면 미적용)
    watermark_position: str = "bottom_right"  # top_left|top_right|bottom_left|bottom_right
    trim_start: Optional[float] = None  # 구간 시작 오버라이드 (None이면 AI 분석값 사용)
    trim_end: Optional[float] = None    # 구간 끝 오버라이드 (None이면 AI 분석값 사용)


class TTSRequest(BaseModel):
    segment_id: str
    voice: str = "ko-KR-SunHiNeural"
    speed: float = 1.0
    mix_original: float = 0.0  # 0=TTS만, 1=원본만


class RewriteRequest(BaseModel):
    segment_id: str
    style: str = "funny"  # funny, dramatic, calm, hype, meme
    custom_prompt: Optional[str] = None


class RenderRequest(BaseModel):
    segment_ids: list[str]


class JobInfo(BaseModel):
    id: str
    status: JobStatus
    url: Optional[str] = None
    title: Optional[str] = None
    duration: Optional[float] = None
    resolution: Optional[str] = None
    segments: list[Segment] = []
    created_at: str = ""

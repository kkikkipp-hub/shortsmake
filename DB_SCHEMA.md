# ShortsMake — D1 데이터베이스 스키마

## 테이블 설계

### videos — 원본 영상
```sql
CREATE TABLE videos (
  id          TEXT PRIMARY KEY,              -- UUID
  url         TEXT,                           -- 원본 URL (업로드 시 null)
  title       TEXT NOT NULL,
  duration    REAL NOT NULL DEFAULT 0,        -- 초 단위
  width       INTEGER,
  height      INTEGER,
  r2_key      TEXT,                           -- R2 저장 키
  thumbnail   TEXT,                           -- R2 썸네일 키
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN ('pending','downloading','transcribing','analyzing','ready','error')),
  error_msg   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### subtitles — 자막 (영상당 전체 자막)
```sql
CREATE TABLE subtitles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id    TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  start_time  REAL NOT NULL,                  -- 시작 (초)
  end_time    REAL NOT NULL,                  -- 끝 (초)
  text        TEXT NOT NULL,
  words_json  TEXT,                           -- word-level timestamps JSON
  seq         INTEGER NOT NULL DEFAULT 0,     -- 자막 순서
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sub_video ON subtitles(video_id, seq);
```

### segments — AI 추출 숏폼 구간
```sql
CREATE TABLE segments (
  id          TEXT PRIMARY KEY,              -- UUID
  video_id    TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  start_time  REAL NOT NULL,
  end_time    REAL NOT NULL,
  title       TEXT,                           -- AI 추천 제목
  reason      TEXT,                           -- AI 추천 이유
  score       INTEGER DEFAULT 0,             -- 매력도 (1~10)
  selected    INTEGER NOT NULL DEFAULT 0,    -- 사용자 선택 여부
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_seg_video ON segments(video_id);
```

### segment_subtitles — 구간별 편집된 자막
```sql
CREATE TABLE segment_subtitles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  segment_id  TEXT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  start_time  REAL NOT NULL,                  -- 구간 내 상대 시간
  end_time    REAL NOT NULL,
  text        TEXT NOT NULL,
  style_json  TEXT,                           -- 폰트/크기/색상/위치 JSON
  seq         INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_segsub_seg ON segment_subtitles(segment_id, seq);
```

### renders — 렌더링 작업
```sql
CREATE TABLE renders (
  id          TEXT PRIMARY KEY,              -- UUID
  segment_id  TEXT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  effects_json TEXT NOT NULL DEFAULT '{}',    -- 적용된 효과 설정
  tts_voice   TEXT,                           -- TTS 음성 (null이면 원본 오디오)
  tts_rate    TEXT DEFAULT '+0%',
  audio_mode  TEXT NOT NULL DEFAULT 'original'
              CHECK(audio_mode IN ('original','tts','mix')),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN ('pending','processing','done','error')),
  progress    INTEGER NOT NULL DEFAULT 0,    -- 0~100
  r2_key      TEXT,                           -- 완성본 R2 키
  r2_tts_key  TEXT,                           -- TTS 오디오 R2 키
  error_msg   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX idx_render_seg ON renders(segment_id);
```

### effect_presets — 효과 프리셋 (Phase 2)
```sql
CREATE TABLE effect_presets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  config_json TEXT NOT NULL,                  -- 효과 설정 JSON
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## effects_json 구조 예시

```json
{
  "orientation": "vertical",
  "vertical_mode": "blur_bg",
  "zoom": {
    "enabled": true,
    "type": "ken_burns",
    "start_zoom": 1.0,
    "end_zoom": 1.3
  },
  "fade": {
    "in_duration": 1.0,
    "out_duration": 1.5
  },
  "split_screen": {
    "enabled": false,
    "type": "pip",
    "position": "top_right"
  },
  "color_filter": "none",
  "subtitle_style": {
    "font": "NanumGothicBold",
    "size": 48,
    "color": "#FFFFFF",
    "outline": "#000000",
    "outline_width": 3,
    "position": "bottom",
    "bg_color": "rgba(0,0,0,0.5)",
    "animation": "fade"
  }
}
```

## 마이그레이션 파일

```sql
-- migrations/0001_init.sql
-- 위 CREATE TABLE 문 전부 포함
```

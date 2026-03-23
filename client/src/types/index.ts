export interface Job {
  id: string
  status: string
  meta?: {
    url: string
    title: string
    duration: number
    width: number
    height: number
    resolution: string
  }
  segments?: Segment[]
  selected_segments?: string[]
  error?: string
}

export interface Segment {
  id: string
  start_sec: number
  end_sec: number
  duration: number
  score: number
  reason: string
  thumbnail?: string
}

export interface SubtitleEntry {
  id: string
  start: number
  end: number
  text: string
}

export interface EffectsConfig {
  segment_id: string
  orientation: 'portrait' | 'landscape'
  aspect_ratio: string   // '9:16' | '1:1' | '4:5' | '16:9' | '4:3'
  effects: Effect[]
  subtitle_style: SubtitleStyle
  color_preset: string   // none | vivid | cinematic | warm | cool | bw | vintage
  denoise_audio: boolean
  speed: number          // 영상 속도 (0.5~2.0, 기본 1.0)
}

export interface Effect {
  type: string
  start: number
  end: number
  factor: number
  crop_x: number  // 클로즈업/분할 크롭 중심 X (0~1)
  crop_y: number  // 클로즈업/분할 크롭 중심 Y (0~1)
}

export interface SubtitleStyle {
  font_name: string
  font_size: number
  color: string
  outline_color: string
  outline_width: number
  position: 'top' | 'center' | 'bottom'
  bg_color?: string
  bg_opacity: number
}

export interface Voice {
  id: string
  name: string
  gender: string
}

export interface WsMessage {
  job_id: string
  step: string
  progress: number
  message: string
  detail?: Record<string, unknown>
}

export interface OutputFile {
  name: string
  size: number
  url: string
  download_url?: string
}

export type Step = 'input' | 'segments' | 'subtitle' | 'effects' | 'render'

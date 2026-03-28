import { useState, useRef, useEffect } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useApi } from '../hooks/useApi'
import type { EffectsConfig, Effect } from '../types'

const ASPECT_OPTIONS = [
  { key: '9:16',  label: '9:16',  desc: '세로 숏폼', icon: '📱', w: 1080, h: 1920 },
  { key: '1:1',   label: '1:1',   desc: '정사각형',   icon: '⬜', w: 1080, h: 1080 },
  { key: '4:5',   label: '4:5',   desc: '인스타 세로', icon: '📷', w: 1080, h: 1350 },
  { key: '16:9',  label: '16:9',  desc: '가로 원본',   icon: '🖥️', w: 1920, h: 1080 },
  { key: '4:3',   label: '4:3',   desc: '클래식',     icon: '📺', w: 1440, h: 1080 },
]

const EFFECT_PRESETS: { label: string; emoji: string; desc: string; effects: Effect[] }[] = [
  {
    label: '효과 없음', emoji: '⬜', desc: '원본 그대로',
    effects: [],
  },
  {
    label: '클로즈업 채우기', emoji: '🔍', desc: '중앙 확대로 화면 꽉 채움',
    effects: [{ type: 'closeup_fill', start: 0, end: 999, factor: 1.5, crop_x: 0.5, crop_y: 0.5 }],
  },
  {
    label: '상하 2분할', emoji: '⬆️⬇️', desc: '위: 전체 / 아래: 클로즈업',
    effects: [{ type: 'split_top_bottom', start: 0, end: 999, factor: 1, crop_x: 0.5, crop_y: 0.5 }],
  },
  {
    label: '좌우 2분할', emoji: '◀️▶️', desc: '좌: 전체 / 우: 클로즈업',
    effects: [{ type: 'split_left_right', start: 0, end: 999, factor: 1, crop_x: 0.5, crop_y: 0.5 }],
  },
  {
    label: '줌 펀치', emoji: '💥', desc: '순간 줌인 임팩트',
    effects: [{ type: 'zoom_punch', start: 1, end: 2, factor: 1.4, crop_x: 0.5, crop_y: 0.5 }],
  },
  {
    label: '임팩트 흔들림', emoji: '📳', desc: '화면 흔들기 효과',
    effects: [{ type: 'shake', start: 1, end: 3, factor: 1, crop_x: 0.5, crop_y: 0.5 }],
  },
  {
    label: '줌인 강조', emoji: '🔎', desc: '점진적 줌인',
    effects: [{ type: 'zoom_in', start: 0, end: 3, factor: 1.3, crop_x: 0.5, crop_y: 0.5 }],
  },
  {
    label: '페이드 인/아웃', emoji: '🌅', desc: '부드러운 등장/퇴장',
    effects: [
      { type: 'fade_in', start: 0, end: 1, factor: 1, crop_x: 0.5, crop_y: 0.5 },
      { type: 'fade_out', start: -2, end: 0, factor: 1, crop_x: 0.5, crop_y: 0.5 },
    ],
  },
]

const COLOR_PRESETS = [
  { key: 'none',      label: '원본',       emoji: '⬜', desc: '색보정 없음' },
  { key: 'vivid',     label: '비비드',     emoji: '🌈', desc: '채도+대비 강화' },
  { key: 'cinematic', label: '시네마틱',   emoji: '🎬', desc: '영화 필름 톤' },
  { key: 'warm',      label: '따뜻한',     emoji: '🌅', desc: '황금빛 워밍' },
  { key: 'cool',      label: '쿨톤',       emoji: '🧊', desc: '차가운 블루' },
  { key: 'bw',        label: '흑백',       emoji: '⚫', desc: '모노크롬' },
  { key: 'vintage',   label: '빈티지',     emoji: '📷', desc: '레트로 필름' },
]

const SUBTITLE_PRESETS = [
  {
    label: '기본',       emoji: '⬜', desc: '흰 글자 검정 외곽선',
    style: { font_size: 44, color: '#FFFFFF', outline_color: '#000000', outline_width: 3, position: 'bottom' as const, bg_opacity: 0.6 },
  },
  {
    label: 'TikTok',    emoji: '🟡', desc: '노란 글자 임팩트',
    style: { font_size: 52, color: '#FFE600', outline_color: '#000000', outline_width: 4, position: 'bottom' as const, bg_opacity: 0.6 },
  },
  {
    label: '시네마',     emoji: '🎬', desc: '가는 흰 글자 중앙',
    style: { font_size: 36, color: '#FFFFFF', outline_color: '#000000', outline_width: 2, position: 'center' as const, bg_opacity: 0.6 },
  },
  {
    label: 'Bold',      emoji: '💪', desc: '크고 굵은 외곽선',
    style: { font_size: 60, color: '#FFFFFF', outline_color: '#000000', outline_width: 6, position: 'bottom' as const, bg_opacity: 0.6 },
  },
  {
    label: '미니멀',     emoji: '✨', desc: '얇고 깔끔하게',
    style: { font_size: 38, color: '#FFFFFF', outline_color: '#333333', outline_width: 1, position: 'bottom' as const, bg_opacity: 0.6 },
  },
  {
    label: '배경박스',   emoji: '📦', desc: '반투명 박스 배경',
    style: { font_size: 42, color: '#FFFFFF', outline_color: '#000000', outline_width: 1, position: 'bottom' as const, bg_color: '#000000', bg_opacity: 0.55 },
  },
]

const DEFAULT_STYLE = {
  font_name: 'GmarketSansTTFBold',
  font_size: 44, color: '#FFFFFF', outline_color: '#000000',
  outline_width: 3, position: 'bottom' as const, bg_opacity: 0.6,
  bold: true, italic: false, shadow: 1, shadow_color: '#000000', letter_spacing: 1.0,
}

function secToInput(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1)
  return `${m}:${s.padStart(4, '0')}`
}
function inputToSec(val: string): number {
  const parts = val.split(':')
  if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  return parseFloat(val) || 0
}

const CROP_LAYOUT_EFFECTS = ['closeup_fill', 'split_top_bottom', 'split_left_right']

const CUSTOM_PRESETS_KEY = 'shortsmake_custom_presets'
type CustomPreset = { name: string; config: Omit<Partial<EffectsConfig>, 'segment_id' | 'trim_start' | 'trim_end'> }

function loadCustomPresets(): CustomPreset[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) || '[]') } catch { return [] }
}
function saveCustomPresets(presets: CustomPreset[]) {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets))
}

export default function EffectsStep() {
  const { jobId, segments, selectedSegments, effects, setEffects, setStep, setError } = useProjectStore()
  const [activeSegId, setActiveSegId] = useState(selectedSegments[0] || '')
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(() => loadCustomPresets())
  const [presetNameInput, setPresetNameInput] = useState('')
  const [availableFonts, setAvailableFonts] = useState<string[]>([])
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [thumbnailLoading, setThumbnailLoading] = useState(false)
  const fontInputRef = useRef<HTMLInputElement>(null)
  const api = useApi()

  useEffect(() => {
    api.listFonts().then((data: any) => {
      if (data?.fonts) setAvailableFonts(data.fonts)
    }).catch(() => {})
  }, [])

  async function uploadFont(file: File) {
    if (!jobId) return
    try {
      await api.uploadFontForJob(jobId, file)
      const data = await api.listFonts()
      if (data?.fonts) setAvailableFonts(data.fonts)
    } catch (e: any) {
      setError('폰트 업로드 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  async function generateThumbnail() {
    if (!jobId) return
    setThumbnailLoading(true)
    setThumbnailUrl(null)
    try {
      const seg = segments.find(s => s.id === activeSegId)
      const timeOffset = seg ? (seg.start_sec + seg.end_sec) / 2 : undefined
      const res = await api.createThumbnail(jobId, activeSegId, timeOffset)
      setThumbnailUrl(res.url)
    } catch (e: any) {
      setError('썸네일 생성 실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      setThumbnailLoading(false)
    }
  }

  const activeSeg = segments.find(s => s.id === activeSegId)

  const config: EffectsConfig = effects[activeSegId] || {
    segment_id: activeSegId,
    orientation: 'portrait',
    aspect_ratio: '9:16',
    effects: [],
    subtitle_style: DEFAULT_STYLE,
    color_preset: 'none',
    denoise_audio: false,
    speed: 1.0,
    watermark: '',
    watermark_position: 'bottom_right',
  }

  function updateConfig(partial: Partial<EffectsConfig>) {
    setEffects(activeSegId, { ...config, ...partial, segment_id: activeSegId })
  }

  function applyPreset(preset: typeof EFFECT_PRESETS[0]) {
    updateConfig({ effects: preset.effects })
  }

  function copyToAll() {
    const { segment_id: _, trim_start: _ts, trim_end: _te, ...shared } = config
    for (const sid of selectedSegments) {
      if (sid === activeSegId) continue
      const existing = effects[sid] || { segment_id: sid }
      setEffects(sid, { ...existing, ...shared, segment_id: sid })
    }
  }

  function saveCurrentAsPreset() {
    const name = presetNameInput.trim()
    if (!name) return
    const { segment_id: _, trim_start: _ts, trim_end: _te, ...presetConfig } = config as any
    const newPresets = [...customPresets, { name, config: presetConfig }]
    setCustomPresets(newPresets)
    saveCustomPresets(newPresets)
    setPresetNameInput('')
  }

  function deleteCustomPreset(idx: number) {
    const newPresets = customPresets.filter((_, i) => i !== idx)
    setCustomPresets(newPresets)
    saveCustomPresets(newPresets)
  }

  function applyCustomPreset(preset: CustomPreset) {
    const { segment_id: _, trim_start: _ts, trim_end: _te, ...rest } = preset.config as any
    updateConfig(rest)
  }

  // 크롭 위치 조절이 필요한 레이아웃 효과
  const layoutEffect = config.effects.find(e => CROP_LAYOUT_EFFECTS.includes(e.type))
  function updateCrop(crop_x: number, crop_y: number) {
    updateConfig({
      effects: config.effects.map(e =>
        CROP_LAYOUT_EFFECTS.includes(e.type) ? { ...e, crop_x, crop_y } : e
      ),
    })
  }

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  async function generatePreview() {
    if (!jobId) return
    setPreviewLoading(true)
    setPreviewUrl(null)
    try {
      const res = await api.generatePreview(jobId, activeSegId, config)
      setPreviewUrl(res.url)
    } catch (e: any) {
      setError('미리보기 생성 실패: ' + (e.response?.data?.detail || e.message))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function saveAndRender() {
    if (!jobId) {
      setError('작업 ID가 없습니다. 처음부터 다시 시작해주세요.')
      return
    }
    if (selectedSegments.length === 0) {
      setError('선택된 구간이 없습니다. 구간 선택 단계로 돌아가주세요.')
      return
    }
    try {
      for (const sid of selectedSegments) {
        const cfg = effects[sid] || {
          segment_id: sid, orientation: 'portrait', aspect_ratio: '9:16',
          effects: [], subtitle_style: config.subtitle_style,
        }
        await api.saveEffects(jobId, cfg)
      }
      setStep('render')
    } catch (e: any) {
      setError('효과 저장 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  const activeAspect = ASPECT_OPTIONS.find(a => a.key === config.aspect_ratio) || ASPECT_OPTIONS[0]

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>✨ 영상 효과 설정</h2>
        {selectedSegments.length > 1 && (
          <button
            onClick={copyToAll}
            title="현재 구간의 모든 설정을 나머지 구간에 복사"
            style={{
              background: '#fff7ed', border: '1px solid #fed7aa',
              color: '#c2410c', borderRadius: 8,
              padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            📋 모든 구간에 복사
          </button>
        )}
      </div>

      {/* 구간 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {selectedSegments.map(sid => (
          <button key={sid} onClick={() => setActiveSegId(sid)} style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: activeSegId === sid ? '2px solid #3182f6' : '2px solid #e5e8eb',
            background: activeSegId === sid ? '#ebf3ff' : '#fff',
            color: activeSegId === sid ? '#3182f6' : '#4e5968',
            cursor: 'pointer',
          }}>{sid.replace('seg_', '구간 ')}</button>
        ))}
      </div>

      {/* 화면 비율 */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e8eb', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>화면 비율</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ASPECT_OPTIONS.map(o => (
            <button key={o.key}
              onClick={() => updateConfig({
                aspect_ratio: o.key,
                orientation: ['9:16', '4:5', '1:1'].includes(o.key) ? 'portrait' : 'landscape',
              })}
              style={{
                flex: '1 1 0', minWidth: 100, padding: '12px 8px', borderRadius: 10,
                fontSize: 13, fontWeight: 600,
                border: config.aspect_ratio === o.key ? '2px solid #3182f6' : '2px solid #e5e8eb',
                background: config.aspect_ratio === o.key ? '#ebf3ff' : '#fff',
                color: config.aspect_ratio === o.key ? '#3182f6' : '#4e5968',
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 2 }}>{o.icon}</div>
              <div style={{ fontWeight: 800 }}>{o.label}</div>
              <div style={{ fontSize: 11, color: '#8b95a1', marginTop: 2 }}>{o.desc}</div>
              <div style={{ fontSize: 10, color: '#c9d0d7', marginTop: 1 }}>{o.w}×{o.h}</div>
            </button>
          ))}
        </div>

        {/* 미리보기 비율 시각화 */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: Math.min(activeAspect.w / 12, 100),
            height: Math.min(activeAspect.h / 12, 160),
            border: '2px solid #3182f6', borderRadius: 6,
            background: '#ebf3ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#3182f6',
          }}>
            {activeAspect.label}
          </div>
          <div style={{ fontSize: 13, color: '#4e5968' }}>
            <strong>{activeAspect.w} × {activeAspect.h}</strong>
            <span style={{ color: '#8b95a1', marginLeft: 8 }}>{activeAspect.desc}</span>
          </div>
        </div>
      </div>

      {/* 효과 프리셋 */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e8eb', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>영상 효과</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          {EFFECT_PRESETS.map((p, i) => {
            const isActive = JSON.stringify(config.effects) === JSON.stringify(p.effects)
            return (
              <button key={i} onClick={() => applyPreset(p)} style={{
                padding: '10px 6px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                border: isActive ? '2px solid #6366f1' : '2px solid #e5e8eb',
                background: isActive ? '#f0f0ff' : '#fff',
                color: isActive ? '#6366f1' : '#4e5968',
                cursor: 'pointer', textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, marginBottom: 2 }}>{p.emoji}</div>
                <div>{p.label}</div>
                <div style={{ fontSize: 10, color: '#8b95a1', marginTop: 2 }}>{p.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 크롭 위치 (클로즈업/분할 효과 선택 시만 표시) */}
      {layoutEffect && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e8eb', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🎯 크롭 중심 위치</h3>
          <div style={{ fontSize: 11, color: '#8b95a1', marginBottom: 12 }}>
            클로즈업/분할 효과의 화면 중심을 조정합니다. 격자를 클릭하거나 슬라이더로 세밀하게 조정하세요.
          </div>
          {/* 3×3 그리드 피커 */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, width: 132 }}>
                {[0.15, 0.5, 0.85].map(cy =>
                  [0.15, 0.5, 0.85].map(cx => {
                    const active = Math.abs((layoutEffect.crop_x ?? 0.5) - cx) < 0.15
                      && Math.abs((layoutEffect.crop_y ?? 0.5) - cy) < 0.15
                    return (
                      <button
                        key={`${cx},${cy}`}
                        onClick={() => updateCrop(cx, cy)}
                        style={{
                          width: 40, height: 40, borderRadius: 8,
                          border: active ? '2px solid #3182f6' : '1px solid #e5e8eb',
                          background: active ? '#ebf3ff' : '#f8f9fa',
                          cursor: 'pointer', fontSize: 14,
                        }}
                      >
                        {cy < 0.3 ? (cx < 0.3 ? '↖' : cx > 0.7 ? '↗' : '⬆') :
                         cy > 0.7 ? (cx < 0.3 ? '↙' : cx > 0.7 ? '↘' : '⬇') :
                          (cx < 0.3 ? '◀' : cx > 0.7 ? '▶' : '⊙')}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#4e5968' }}>가로 위치</span>
                  <span style={{ fontSize: 11, color: '#8b95a1' }}>{((layoutEffect.crop_x ?? 0.5) * 100).toFixed(0)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.01"
                  value={layoutEffect.crop_x ?? 0.5}
                  onChange={e => updateCrop(+e.target.value, layoutEffect.crop_y ?? 0.5)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#4e5968' }}>세로 위치</span>
                  <span style={{ fontSize: 11, color: '#8b95a1' }}>{((layoutEffect.crop_y ?? 0.5) * 100).toFixed(0)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.01"
                  value={layoutEffect.crop_y ?? 0.5}
                  onChange={e => updateCrop(layoutEffect.crop_x ?? 0.5, +e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 색상 필터 */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e8eb', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🎨 색상 필터</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {COLOR_PRESETS.map(p => {
            const active = (config.color_preset || 'none') === p.key
            return (
              <button key={p.key}
                onClick={() => updateConfig({ color_preset: p.key })}
                title={p.desc}
                style={{
                  padding: '10px 4px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                  border: active ? '2px solid #f59e0b' : '2px solid #e5e8eb',
                  background: active ? '#fffbeb' : '#fff',
                  color: active ? '#b45309' : '#4e5968',
                  cursor: 'pointer', textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 2 }}>{p.emoji}</div>
                <div>{p.label}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 오디오 + 속도 설정 */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e8eb', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🔊 오디오 & 속도</h3>

        {/* 속도 조절 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#191f28' }}>영상 속도</span>
            <span style={{
              fontSize: 13, fontWeight: 800, color: '#3182f6',
              background: '#ebf3ff', borderRadius: 6, padding: '2px 10px',
            }}>
              {(config.speed ?? 1.0).toFixed(1)}x
            </span>
          </div>
          <input
            type="range" min="0.5" max="2.0" step="0.1"
            value={config.speed ?? 1.0}
            onChange={e => updateConfig({ speed: +e.target.value })}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b95a1', marginTop: 2 }}>
            <span>0.5x (슬로우)</span>
            <span>1.0x (원본)</span>
            <span>2.0x (빠르게)</span>
          </div>
          {/* 빠른 설정 버튼 */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(v => (
              <button key={v}
                onClick={() => updateConfig({ speed: v })}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  border: (config.speed ?? 1.0) === v ? '2px solid #3182f6' : '1.5px solid #e5e8eb',
                  background: (config.speed ?? 1.0) === v ? '#ebf3ff' : '#fff',
                  color: (config.speed ?? 1.0) === v ? '#3182f6' : '#4e5968',
                  cursor: 'pointer',
                }}
              >{v}x</button>
            ))}
          </div>
        </div>

        {/* 노이즈 감소 토글 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <div
            onClick={() => updateConfig({ denoise_audio: !config.denoise_audio })}
            style={{
              width: 40, height: 22, borderRadius: 11,
              background: config.denoise_audio ? '#3182f6' : '#e5e8eb',
              position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 9, background: '#fff',
              position: 'absolute', top: 2,
              left: config.denoise_audio ? 20 : 2,
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#191f28' }}>배경 노이즈 감소</div>
            <div style={{ fontSize: 11, color: '#8b95a1' }}>afftdn 필터로 잡음 제거 — 녹음 품질이 낮을 때 유용</div>
          </div>
        </label>
      </div>

      {/* 자막 스타일 */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e8eb', marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>자막 스타일</h3>

        {/* 자막 프리셋 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', marginBottom: 8 }}>빠른 프리셋</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {SUBTITLE_PRESETS.map((p, i) => {
              const active = config.subtitle_style.font_size === p.style.font_size
                && config.subtitle_style.color === p.style.color
                && config.subtitle_style.outline_width === p.style.outline_width
              return (
                <button key={i}
                  onClick={() => updateConfig({ subtitle_style: { ...config.subtitle_style, font_name: 'GmarketSansTTFBold', ...p.style } })}
                  title={p.desc}
                  style={{
                    padding: '8px 4px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                    border: active ? '2px solid #6366f1' : '2px solid #e5e8eb',
                    background: active ? '#f0f0ff' : '#fff',
                    color: active ? '#6366f1' : '#4e5968',
                    cursor: 'pointer', textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{p.emoji}</div>
                  <div>{p.label}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 폰트 선택 + 업로드 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968' }}>폰트</label>
            <button
              onClick={() => fontInputRef.current?.click()}
              style={{
                background: '#f0f4ff', border: '1px solid #c7d7fa',
                borderRadius: 6, padding: '3px 10px',
                fontSize: 11, fontWeight: 600, color: '#3182f6', cursor: 'pointer',
              }}
            >
              + TTF/OTF 업로드
            </button>
            <input
              ref={fontInputRef}
              type="file"
              accept=".ttf,.otf"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFont(f) }}
            />
          </div>
          <select
            value={config.subtitle_style.font_name || 'GmarketSansTTFBold'}
            onChange={e => updateConfig({ subtitle_style: { ...config.subtitle_style, font_name: e.target.value } })}
            style={{ width: '100%', border: '1.5px solid #e5e8eb', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
          >
            <option value="GmarketSansTTFBold">지마켓산스 볼드 (기본)</option>
            {availableFonts.filter(f => f !== 'GmarketSansTTFBold').map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 4 }}>글자 크기</label>
            <input type="number" value={config.subtitle_style.font_size}
              onChange={e => updateConfig({ subtitle_style: { ...config.subtitle_style, font_size: +e.target.value } })}
              style={{ width: '100%', border: '1px solid #e5e8eb', borderRadius: 8, padding: '8px', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 4 }}>외곽선 두께</label>
            <input type="number" value={config.subtitle_style.outline_width}
              onChange={e => updateConfig({ subtitle_style: { ...config.subtitle_style, outline_width: +e.target.value } })}
              min={0} max={10}
              style={{ width: '100%', border: '1px solid #e5e8eb', borderRadius: 8, padding: '8px', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 4 }}>글자 색</label>
            <input type="color" value={config.subtitle_style.color}
              onChange={e => updateConfig({ subtitle_style: { ...config.subtitle_style, color: e.target.value } })}
              style={{ width: '100%', height: 38, border: '1px solid #e5e8eb', borderRadius: 8, cursor: 'pointer' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 4 }}>외곽선 색</label>
            <input type="color" value={config.subtitle_style.outline_color}
              onChange={e => updateConfig({ subtitle_style: { ...config.subtitle_style, outline_color: e.target.value } })}
              style={{ width: '100%', height: 38, border: '1px solid #e5e8eb', borderRadius: 8, cursor: 'pointer' }}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 6 }}>위치</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['top', 'center', 'bottom'].map(pos => (
              <button key={pos} onClick={() => updateConfig({ subtitle_style: { ...config.subtitle_style, position: pos as any } })}
                style={{
                  flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: config.subtitle_style.position === pos ? '2px solid #3182f6' : '1px solid #e5e8eb',
                  background: config.subtitle_style.position === pos ? '#ebf3ff' : '#fff',
                  color: config.subtitle_style.position === pos ? '#3182f6' : '#4e5968',
                  cursor: 'pointer',
                }}>
                {{ top: '상단', center: '중앙', bottom: '하단' }[pos]}
              </button>
            ))}
          </div>
        </div>

        {/* 고급 스타일 */}
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
          {/* Bold */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 6 }}>굵기</label>
            <button
              onClick={() => updateConfig({ subtitle_style: { ...config.subtitle_style, bold: !(config.subtitle_style.bold ?? true) } })}
              style={{
                width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                border: (config.subtitle_style.bold ?? true) ? '2px solid #3182f6' : '1.5px solid #e5e8eb',
                background: (config.subtitle_style.bold ?? true) ? '#ebf3ff' : '#fff',
                color: (config.subtitle_style.bold ?? true) ? '#3182f6' : '#8b95a1',
                cursor: 'pointer',
              }}
            >Bold</button>
          </div>
          {/* Italic */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 6 }}>기울기</label>
            <button
              onClick={() => updateConfig({ subtitle_style: { ...config.subtitle_style, italic: !(config.subtitle_style.italic ?? false) } })}
              style={{
                width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 13, fontStyle: 'italic',
                border: (config.subtitle_style.italic ?? false) ? '2px solid #6366f1' : '1.5px solid #e5e8eb',
                background: (config.subtitle_style.italic ?? false) ? '#f0f0ff' : '#fff',
                color: (config.subtitle_style.italic ?? false) ? '#6366f1' : '#8b95a1',
                cursor: 'pointer',
              }}
            >Italic</button>
          </div>
          {/* Shadow */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 6 }}>
              그림자 ({config.subtitle_style.shadow ?? 1})
            </label>
            <input
              type="range" min="0" max="4" step="1"
              value={config.subtitle_style.shadow ?? 1}
              onChange={e => updateConfig({ subtitle_style: { ...config.subtitle_style, shadow: +e.target.value } })}
              style={{ width: '100%', marginTop: 6 }}
            />
          </div>
          {/* Letter spacing */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 6 }}>
              자간 ({(config.subtitle_style.letter_spacing ?? 1).toFixed(1)})
            </label>
            <input
              type="range" min="0" max="10" step="0.5"
              value={config.subtitle_style.letter_spacing ?? 1}
              onChange={e => updateConfig({ subtitle_style: { ...config.subtitle_style, letter_spacing: +e.target.value } })}
              style={{ width: '100%', marginTop: 6 }}
            />
          </div>
        </div>

        {/* 자막 미리보기 */}
        <div style={{
          marginTop: 16, background: '#1a1a2e', borderRadius: 12,
          padding: '24px 16px', textAlign: 'center', position: 'relative',
          display: 'flex', flexDirection: 'column',
          justifyContent: config.subtitle_style.position === 'top' ? 'flex-start'
            : config.subtitle_style.position === 'center' ? 'center' : 'flex-end',
          minHeight: 100,
        }}>
          <div style={{
            fontSize: Math.min(config.subtitle_style.font_size * 0.5, 28),
            fontWeight: (config.subtitle_style.bold ?? true) ? 800 : 400,
            fontStyle: (config.subtitle_style.italic ?? false) ? 'italic' : 'normal',
            color: config.subtitle_style.color,
            textShadow: `0 0 ${config.subtitle_style.outline_width * 2}px ${config.subtitle_style.outline_color}`,
            letterSpacing: `${config.subtitle_style.letter_spacing ?? 1}px`,
          }}>
            자막 미리보기 텍스트
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 8 }}>
            {config.subtitle_style.font_name || 'GmarketSansTTFBold'} · {config.subtitle_style.font_size}px
          </div>
        </div>
      </div>

      {/* 구간 트리밍 */}
      {activeSeg && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e8eb', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>✂️ 구간 트리밍</h3>
            {(config.trim_start !== undefined || config.trim_end !== undefined) && (
              <button
                onClick={() => updateConfig({ trim_start: undefined, trim_end: undefined })}
                style={{
                  background: 'none', border: '1px solid #e5e8eb', borderRadius: 6,
                  padding: '3px 8px', fontSize: 11, color: '#8b95a1', cursor: 'pointer',
                }}
              >AI 분석값으로 초기화</button>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#8b95a1', marginBottom: 12 }}>
            AI가 추천한 구간: {secToInput(activeSeg.start_sec)} ~ {secToInput(activeSeg.end_sec)}
            &nbsp;({activeSeg.duration.toFixed(1)}초)
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 4 }}>시작 (분:초)</label>
              <input
                type="text"
                defaultValue={secToInput(config.trim_start ?? activeSeg.start_sec)}
                onBlur={e => {
                  const v = inputToSec(e.target.value)
                  if (!isNaN(v)) updateConfig({ trim_start: v })
                }}
                placeholder={secToInput(activeSeg.start_sec)}
                style={{ width: '100%', border: '1px solid #e5e8eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 4 }}>끝 (분:초)</label>
              <input
                type="text"
                defaultValue={secToInput(config.trim_end ?? activeSeg.end_sec)}
                onBlur={e => {
                  const v = inputToSec(e.target.value)
                  if (!isNaN(v)) updateConfig({ trim_end: v })
                }}
                placeholder={secToInput(activeSeg.end_sec)}
                style={{ width: '100%', border: '1px solid #e5e8eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 4 }}>길이</label>
              <div style={{
                height: 36, display: 'flex', alignItems: 'center',
                fontSize: 13, fontWeight: 700, color: '#3182f6',
                background: '#ebf3ff', borderRadius: 8, padding: '0 10px',
              }}>
                {((config.trim_end ?? activeSeg.end_sec) - (config.trim_start ?? activeSeg.start_sec)).toFixed(1)}초
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 워터마크 */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e8eb', marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>💧 워터마크</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 6 }}>워터마크 텍스트</label>
          <input
            type="text"
            value={config.watermark || ''}
            onChange={e => updateConfig({ watermark: e.target.value })}
            placeholder="예: @내채널, ShortsMake (빈칸이면 미적용)"
            style={{ width: '100%', border: '1px solid #e5e8eb', borderRadius: 8, padding: '9px 12px', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        {(config.watermark || '').length > 0 && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 6 }}>위치</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { key: 'top_left',     label: '↖ 좌상단' },
                { key: 'top_right',    label: '↗ 우상단' },
                { key: 'bottom_left',  label: '↙ 좌하단' },
                { key: 'bottom_right', label: '↘ 우하단' },
              ].map(pos => (
                <button key={pos.key}
                  onClick={() => updateConfig({ watermark_position: pos.key })}
                  style={{
                    padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: (config.watermark_position || 'bottom_right') === pos.key ? '2px solid #3182f6' : '1px solid #e5e8eb',
                    background: (config.watermark_position || 'bottom_right') === pos.key ? '#ebf3ff' : '#fff',
                    color: (config.watermark_position || 'bottom_right') === pos.key ? '#3182f6' : '#4e5968',
                    cursor: 'pointer',
                  }}
                >{pos.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 커스텀 프리셋 저장 */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e8eb', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>💾 나만의 프리셋</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: customPresets.length > 0 ? 12 : 0 }}>
          <input
            type="text"
            value={presetNameInput}
            onChange={e => setPresetNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveCurrentAsPreset()}
            placeholder="프리셋 이름 입력 후 저장"
            style={{ flex: 1, border: '1px solid #e5e8eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}
          />
          <button onClick={saveCurrentAsPreset} disabled={!presetNameInput.trim()} style={{
            background: presetNameInput.trim() ? '#6366f1' : '#c9d0d7',
            color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 14px', fontSize: 13, fontWeight: 700,
            cursor: presetNameInput.trim() ? 'pointer' : 'not-allowed',
          }}>저장</button>
        </div>
        {customPresets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {customPresets.map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#f8f9fa', borderRadius: 8, padding: '8px 12px',
              }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#191f28' }}>📌 {p.name}</span>
                <button onClick={() => applyCustomPreset(p)} style={{
                  background: '#ebf3ff', border: 'none', borderRadius: 6,
                  padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#3182f6', cursor: 'pointer',
                }}>적용</button>
                <button onClick={() => deleteCustomPreset(i)} style={{
                  background: '#fff0f0', border: 'none', borderRadius: 6,
                  padding: '4px 8px', fontSize: 12, color: '#ef4444', cursor: 'pointer',
                }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 빠른 미리보기 */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e8eb', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: previewUrl ? 14 : 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#191f28' }}>🎬 빠른 미리보기</div>
            <div style={{ fontSize: 11, color: '#8b95a1', marginTop: 2 }}>480p · 최대 10초 · 자막/TTS/BGM 제외</div>
          </div>
          <button
            onClick={generatePreview}
            disabled={previewLoading}
            style={{
              background: previewLoading ? '#c9d0d7' : '#22c55e',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 700,
              cursor: previewLoading ? 'not-allowed' : 'pointer', flexShrink: 0,
            }}
          >
            {previewLoading ? '생성 중...' : '▶ 미리보기 생성'}
          </button>
        </div>
        {previewUrl && (
          <video
            src={previewUrl}
            controls
            autoPlay
            style={{ width: '100%', maxHeight: 400, borderRadius: 10, background: '#000', display: 'block' }}
          />
        )}
      </div>

      {/* 썸네일 생성 */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e8eb', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: thumbnailUrl ? 14 : 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#191f28' }}>🖼 썸네일 자동 생성</div>
            <div style={{ fontSize: 11, color: '#8b95a1', marginTop: 2 }}>구간 중간 프레임에서 1080p 썸네일 추출</div>
          </div>
          <button
            onClick={generateThumbnail}
            disabled={thumbnailLoading}
            style={{
              background: thumbnailLoading ? '#c9d0d7' : '#f59e0b',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 700,
              cursor: thumbnailLoading ? 'not-allowed' : 'pointer', flexShrink: 0,
            }}
          >
            {thumbnailLoading ? '생성 중...' : '🖼 썸네일 생성'}
          </button>
        </div>
        {thumbnailUrl && (
          <div>
            <img
              src={thumbnailUrl}
              alt="썸네일"
              style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 10, background: '#000' }}
            />
            <a
              href={thumbnailUrl}
              download
              style={{
                display: 'block', textAlign: 'center', marginTop: 10,
                background: '#f59e0b', color: '#fff', borderRadius: 8,
                padding: '8px', fontSize: 13, fontWeight: 700, textDecoration: 'none',
              }}
            >
              ⬇ 썸네일 다운로드
            </a>
          </div>
        )}
      </div>

      <button onClick={saveAndRender} style={{
        width: '100%', background: '#6366f1', color: '#fff', border: 'none',
        borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
      }}>
        효과 저장 → 최종 렌더링
      </button>
    </div>
  )
}

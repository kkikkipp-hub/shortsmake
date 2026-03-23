import { useState } from 'react'
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
}

export default function EffectsStep() {
  const { jobId, selectedSegments, effects, setEffects, setStep, setError } = useProjectStore()
  const [activeSegId, setActiveSegId] = useState(selectedSegments[0] || '')
  const api = useApi()

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
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>✨ 영상 효과 설정</h2>

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

        {/* 폰트 정보 */}
        <div style={{
          background: '#f8f9fa', borderRadius: 10, padding: '10px 14px',
          marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>🔤</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#191f28' }}>
              {config.subtitle_style.font_name || 'GmarketSansTTFBold'}
            </div>
            <div style={{ fontSize: 11, color: '#8b95a1' }}>지마켓산스 볼드 · SIL Open Font License</div>
          </div>
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
            fontWeight: 800,
            color: config.subtitle_style.color,
            textShadow: `0 0 ${config.subtitle_style.outline_width * 2}px ${config.subtitle_style.outline_color}`,
            letterSpacing: 1,
          }}>
            자막 미리보기 텍스트
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 8 }}>
            지마켓산스 볼드 · {config.subtitle_style.font_size}px
          </div>
        </div>
      </div>

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

      <button onClick={saveAndRender} style={{
        width: '100%', background: '#6366f1', color: '#fff', border: 'none',
        borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
      }}>
        효과 저장 → 최종 렌더링
      </button>
    </div>
  )
}

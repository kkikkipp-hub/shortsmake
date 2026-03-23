import { useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useApi } from '../hooks/useApi'
import ProgressBar from '../components/ProgressBar'
import type { SubtitleEntry } from '../types'

const REWRITE_STYLES = [
  { key: 'funny',        label: '😂 재밌고 유쾌하게', color: '#f59e0b' },
  { key: 'dramatic',     label: '🎬 드라마틱하게', color: '#ef4444' },
  { key: 'cute',         label: '🐰 귀엽고 발랄하게', color: '#ec4899' },
  { key: 'meme',         label: '🔥 밈/짤 스타일', color: '#8b5cf6' },
  { key: 'professional', label: '👔 전문적이고 깔끔하게', color: '#3b82f6' },
  { key: 'custom',       label: '✏️ 직접 지시', color: '#6b7280' },
]

export default function SubtitleStep() {
  const { jobId, selectedSegments, subtitles, setSubtitles, setStep, setError } = useProjectStore()
  const [generating, setGenerating] = useState(false)
  const [activeSegId, setActiveSegId] = useState<string | null>(null)
  const [rewriteStyle, setRewriteStyle] = useState('funny')
  const [customPrompt, setCustomPrompt] = useState('')
  const [rewriting, setRewriting] = useState(false)
  const [rewritePreview, setRewritePreview] = useState<any[] | null>(null)
  const api = useApi()

  // 자막 생성
  async function generateSubs() {
    if (!jobId) return
    setGenerating(true)
    try {
      await api.generateSubtitles(jobId)
      // polling
      let retries = 0
      while (retries < 200) {
        await new Promise(r => setTimeout(r, 2000))
        const data = await api.getJob(jobId)
        if (data.status === 'transcribed') {
          // 각 구간 자막 로드
          for (const sid of selectedSegments) {
            const subs = await api.getSubtitle(jobId, sid)
            setSubtitles(sid, subs)
          }
          if (selectedSegments.length) setActiveSegId(selectedSegments[0])
          break
        }
        if (data.status === 'failed') {
          setError(data.error || '자막 생성 실패')
          return
        }
        retries++
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const activeSubs = activeSegId ? subtitles[activeSegId] || [] : []
  const hasSubs = Object.keys(subtitles).length > 0

  function updateSub(idx: number, field: keyof SubtitleEntry, value: string | number) {
    if (!activeSegId) return
    const updated = [...activeSubs]
    updated[idx] = { ...updated[idx], [field]: value }
    setSubtitles(activeSegId, updated)
  }

  function deleteSub(idx: number) {
    if (!activeSegId) return
    setSubtitles(activeSegId, activeSubs.filter((_, i) => i !== idx))
  }

  const FILLER_WORDS = ['음', '어', '그', '저', '뭐', '이제', '근데', '아', '음...', '어...', '그...']

  function removeFillers() {
    if (!activeSegId) return
    const filtered = activeSubs.filter(sub => {
      const t = sub.text.trim()
      return !FILLER_WORDS.some(fw => t === fw || t === fw + '...' || t === fw + '.')
        && t.length > 1
    })
    setSubtitles(activeSegId, filtered)
  }

  function autoLineBreak() {
    if (!activeSegId) return
    const MAX_CHARS = 18
    const result: typeof activeSubs = []
    let id = Date.now()
    for (const sub of activeSubs) {
      const t = sub.text.trim()
      if (t.length <= MAX_CHARS) {
        result.push(sub)
        continue
      }
      // 어절 단위로 분할
      const words = t.split(' ')
      let line = ''
      const lines: string[] = []
      for (const w of words) {
        if ((line + (line ? ' ' : '') + w).length > MAX_CHARS && line) {
          lines.push(line)
          line = w
        } else {
          line = line ? `${line} ${w}` : w
        }
      }
      if (line) lines.push(line)

      // 2줄 이상이면 구간을 균등 분할
      if (lines.length >= 2) {
        const dur = sub.end - sub.start
        const perLine = dur / lines.length
        lines.forEach((ln, i) => {
          result.push({
            id: `split_${id++}`,
            start: sub.start + i * perLine,
            end: sub.start + (i + 1) * perLine,
            text: ln,
          })
        })
      } else {
        result.push(sub)
      }
    }
    setSubtitles(activeSegId, result)
  }

  function addSub() {
    if (!activeSegId) return
    const last = activeSubs[activeSubs.length - 1]
    const newStart = last ? last.end : 0
    setSubtitles(activeSegId, [
      ...activeSubs,
      { id: `new_${Date.now()}`, start: newStart, end: newStart + 2, text: '' },
    ])
  }

  async function saveAndNext() {
    if (!jobId) return
    // 모든 구간 자막 저장
    for (const sid of selectedSegments) {
      const subs = subtitles[sid]
      if (subs) await api.updateSubtitle(jobId, sid, subs)
    }
    setStep('effects')
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>💬 자막 편집</h2>

      {!hasSubs && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <button onClick={generateSubs} disabled={generating} style={{
            background: generating ? '#c9deff' : '#3182f6',
            color: '#fff', border: 'none', borderRadius: 12,
            padding: '14px 28px', fontSize: 15, fontWeight: 700,
            cursor: generating ? 'not-allowed' : 'pointer',
          }}>
            {generating ? '🔄 자막 생성 중...' : '🎤 AI 자막 자동 생성'}
          </button>
          <div style={{ marginTop: 16 }}><ProgressBar /></div>
        </div>
      )}

      {hasSubs && (
        <>
          {/* 구간 탭 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {selectedSegments.map(sid => (
              <button key={sid} onClick={() => setActiveSegId(sid)} style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: activeSegId === sid ? '2px solid #3182f6' : '2px solid #e5e8eb',
                background: activeSegId === sid ? '#ebf3ff' : '#fff',
                color: activeSegId === sid ? '#3182f6' : '#4e5968',
                cursor: 'pointer',
              }}>
                {sid.replace('seg_', '구간 ')} ({(subtitles[sid] || []).length}줄)
              </button>
            ))}
          </div>

          {/* 타임라인 시각화 */}
          {activeSubs.length > 0 && (() => {
            const totalDur = activeSubs[activeSubs.length - 1]?.end || 1
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#8b95a1', marginBottom: 6 }}>
                  타임라인 ({totalDur.toFixed(1)}초)
                </div>
                <div style={{
                  position: 'relative', height: 28, background: '#f2f4f6',
                  borderRadius: 8, overflow: 'hidden',
                }}>
                  {activeSubs.map((sub, idx) => (
                    <div
                      key={sub.id}
                      title={`${sub.start.toFixed(1)}~${sub.end.toFixed(1)}s: ${sub.text}`}
                      onClick={() => {
                        const el = document.getElementById(`sub-row-${idx}`)
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }}
                      style={{
                        position: 'absolute',
                        left: `${(sub.start / totalDur) * 100}%`,
                        width: `${Math.max(0.5, ((sub.end - sub.start) / totalDur) * 100)}%`,
                        height: '100%',
                        background: `hsl(${(idx * 37) % 360}, 60%, 55%)`,
                        cursor: 'pointer',
                        borderRight: '1px solid rgba(255,255,255,0.4)',
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })()}

          {/* 자막 리스트 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {activeSubs.map((sub, idx) => (
              <div key={sub.id} id={`sub-row-${idx}`} style={{
                background: '#fff', borderRadius: 12, padding: '12px 16px',
                border: '1px solid #e5e8eb', display: 'flex', gap: 10, alignItems: 'center',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 100 }}>
                  <input
                    type="number" step="0.1" value={sub.start}
                    onChange={e => updateSub(idx, 'start', +e.target.value)}
                    style={{ border: '1px solid #e5e8eb', borderRadius: 6, padding: '4px 6px', fontSize: 12, width: '100%', textAlign: 'center' }}
                  />
                  <input
                    type="number" step="0.1" value={sub.end}
                    onChange={e => updateSub(idx, 'end', +e.target.value)}
                    style={{ border: '1px solid #e5e8eb', borderRadius: 6, padding: '4px 6px', fontSize: 12, width: '100%', textAlign: 'center' }}
                  />
                </div>
                <input
                  value={sub.text}
                  onChange={e => updateSub(idx, 'text', e.target.value)}
                  style={{
                    flex: 1, border: '1.5px solid #e5e8eb', borderRadius: 8,
                    padding: '8px 12px', fontSize: 14, outline: 'none',
                  }}
                  placeholder="자막 텍스트"
                />
                <button onClick={() => deleteSub(idx)} style={{
                  background: '#fff0f0', border: 'none', borderRadius: 6,
                  padding: '6px 10px', fontSize: 14, color: '#ff4d4f', cursor: 'pointer',
                }}>✕</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            <button onClick={addSub} style={{
              background: '#f2f4f6', border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#4e5968', cursor: 'pointer',
            }}>+ 자막 추가</button>
            <button onClick={removeFillers} style={{
              background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#dc2626', cursor: 'pointer',
            }}>🧹 필러 제거</button>
            <button onClick={autoLineBreak} style={{
              background: '#f0f7ff', border: '1px solid #93c5fd', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#2563eb', cursor: 'pointer',
            }} title="18자 초과 자막을 어절 단위로 분할">↩ 자동 줄바꿈</button>
          </div>

          {/* GPT 자막 리라이팅 */}
          <div style={{
            background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderRadius: 16,
            padding: 20, marginBottom: 24, border: '1px solid #fbbf24',
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, color: '#92400e' }}>
              ✨ GPT 자막 리라이팅
            </h3>
            <p style={{ fontSize: 12, color: '#a16207', marginBottom: 14 }}>
              AI가 자막을 선택한 스타일로 재밌게 다시 써드려요. 타이밍은 그대로 유지!
            </p>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {REWRITE_STYLES.map(s => (
                <button key={s.key} onClick={() => { setRewriteStyle(s.key); setRewritePreview(null) }}
                  style={{
                    padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: rewriteStyle === s.key ? `2px solid ${s.color}` : '2px solid #e5e8eb',
                    background: rewriteStyle === s.key ? `${s.color}18` : '#fff',
                    color: rewriteStyle === s.key ? s.color : '#4e5968',
                    cursor: 'pointer',
                  }}>{s.label}</button>
              ))}
            </div>

            {rewriteStyle === 'custom' && (
              <input
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder="예: 프로 해설가처럼 전문적이면서 유머러스하게"
                style={{
                  width: '100%', border: '1.5px solid #fbbf24', borderRadius: 8,
                  padding: '9px 12px', fontSize: 13, outline: 'none', marginBottom: 12,
                  boxSizing: 'border-box', background: '#fff',
                }}
              />
            )}

            <button
              onClick={async () => {
                if (!jobId || !activeSegId) return
                setRewriting(true); setRewritePreview(null)
                try {
                  const res = await api.rewriteSubtitle(jobId, activeSegId, rewriteStyle, rewriteStyle === 'custom' ? customPrompt : undefined)
                  setRewritePreview(res.rewritten)
                } catch (e: any) {
                  setError(e.response?.data?.detail || e.message || 'GPT 리라이팅 실패')
                } finally { setRewriting(false) }
              }}
              disabled={rewriting || !activeSegId}
              style={{
                background: rewriting ? '#fde68a' : '#f59e0b', color: '#fff',
                border: 'none', borderRadius: 10, padding: '10px 20px',
                fontSize: 14, fontWeight: 700,
                cursor: rewriting ? 'not-allowed' : 'pointer',
              }}
            >
              {rewriting ? '✨ GPT가 쓰는 중...' : '✨ 리라이팅 미리보기'}
            </button>

            {/* 미리보기 */}
            {rewritePreview && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                  리라이팅 결과 미리보기
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {rewritePreview.map((sub: any, i: number) => (
                    <div key={i} style={{
                      background: '#fff', borderRadius: 8, padding: '8px 12px',
                      border: '1px solid #fbbf24', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center',
                    }}>
                      <span style={{ color: '#a16207', fontSize: 11, whiteSpace: 'nowrap', minWidth: 70, textAlign: 'center' }}>
                        {sub.start.toFixed(1)}~{sub.end.toFixed(1)}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#9ca3af', fontSize: 11, textDecoration: 'line-through', marginBottom: 3 }}>
                          {activeSubs[i]?.text || ''}
                        </div>
                        <input
                          value={sub.text}
                          onChange={e => {
                            const updated = [...rewritePreview]
                            updated[i] = { ...updated[i], text: e.target.value }
                            setRewritePreview(updated)
                          }}
                          style={{
                            width: '100%', border: '1.5px solid #fbbf24', borderRadius: 6,
                            padding: '6px 8px', fontSize: 13, fontWeight: 600, color: '#191f28',
                            outline: 'none', boxSizing: 'border-box', background: '#fffef5',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => {
                    if (activeSegId) setSubtitles(activeSegId, rewritePreview)
                    setRewritePreview(null)
                  }} style={{
                    background: '#10b981', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>✅ 적용하기</button>
                  <button onClick={() => setRewritePreview(null)} style={{
                    background: '#f2f4f6', color: '#4e5968', border: 'none', borderRadius: 8,
                    padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>취소</button>
                </div>
              </div>
            )}
          </div>

          <button onClick={saveAndNext} style={{
            width: '100%', background: '#3182f6', color: '#fff', border: 'none',
            borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>
            자막 저장 → 효과 설정
          </button>
        </>
      )}
    </div>
  )
}

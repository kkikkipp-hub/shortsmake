import { useState, useEffect, useRef } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useApi } from '../hooks/useApi'
import ProgressBar from '../components/ProgressBar'
import type { Voice } from '../types'

export default function RenderStep() {
  const { jobId, selectedSegments, outputs, setOutputs, setError, job, progress, segmentProgress } = useProjectStore()
  const [voices, setVoices] = useState<Voice[]>([])
  const [voice, setVoice] = useState('ko-KR-SunHiNeural')
  const [speed, setSpeed] = useState(1.0)
  const [ttsProgress, setTtsProgress] = useState('')
  const [rendering, setRendering] = useState(false)
  const [step, setLocalStep] = useState<'tts' | 'render' | 'done'>('tts')
  const [bgmFile, setBgmFile] = useState<File | null>(null)
  const [bgmUploading, setBgmUploading] = useState(false)
  const [bgmUploaded, setBgmUploaded] = useState(false)
  const [renderLog, setRenderLog] = useState<string[]>([])
  const [showLog, setShowLog] = useState(false)
  const bgmInputRef = useRef<HTMLInputElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const renderingRef = useRef(false)
  const api = useApi()

  useEffect(() => {
    api.getVoices().then(setVoices).catch(() => {})
  }, [])

  // 이미 completed 상태면 바로 done으로
  useEffect(() => {
    if (job?.status === 'completed' && jobId) {
      api.getOutputs(jobId).then((files: any[]) => {
        if (files.length > 0) {
          setOutputs(files)
          setLocalStep('done')
        }
      }).catch(() => {})
    }
  }, [job?.status, jobId])

  async function uploadBgm(file: File) {
    if (!jobId) return
    setBgmUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await fetch(`/api/jobs/${jobId}/bgm`, { method: 'POST', body: form })
      setBgmUploaded(true)
    } catch (e: any) {
      setError('BGM 업로드 실패: ' + e.message)
    } finally {
      setBgmUploading(false)
    }
  }

  // TTS 합성
  async function synthesizeAll() {
    if (!jobId) return
    setTtsProgress('TTS 합성 시작...')
    try {
      for (let i = 0; i < selectedSegments.length; i++) {
        const sid = selectedSegments[i]
        setTtsProgress(`구간 ${i + 1}/${selectedSegments.length} TTS 합성 중...`)
        await api.synthesizeTts(jobId, sid, voice, speed)
        // WS progress 메시지로 완료/실패 대기 (최대 120초)
        let done = false
        let ttsError: string | null = null
        for (let t = 0; t < 120; t++) {
          await new Promise(r => setTimeout(r, 1000))
          const prog = useProjectStore.getState().progress
          if (prog?.step === 'tts' && prog.progress >= 100) { done = true; break }
          if (prog?.step === 'tts' && prog.progress < 0) { ttsError = prog.message; break }
        }
        if (ttsError) throw new Error(ttsError)
        if (!done) throw new Error('TTS 합성 타임아웃 (120초)')
      }
      setTtsProgress('TTS 합성 완료!')
      setLocalStep('render')
    } catch (e: any) {
      setTtsProgress('')
      setError(e.message)
    }
  }

  // 최종 렌더링
  async function startRender() {
    if (!jobId) return
    renderingRef.current = true
    setRendering(true)
    setRenderLog([])
    setShowLog(true)
    const ts = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setRenderLog([`[${ts}] 렌더링 시작 — ${selectedSegments.length}개 구간`])
    try {
      await api.renderSegments(jobId, selectedSegments)
      // WS가 진행률을 전달함 — useEffect에서 감지
    } catch (e: any) {
      const ts2 = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      setRenderLog(prev => [...prev, `[${ts2}] ❌ 오류: ${e.message}`])
      setError(e.message)
      renderingRef.current = false
      setRendering(false)
    }
  }

  // WS 진행률 감시 — 렌더링 중일 때만 반응
  useEffect(() => {
    if (!renderingRef.current || !progress) return
    const ts = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    if (progress.message) {
      setRenderLog(prev => {
        if (prev.length > 0 && prev[prev.length - 1].endsWith(progress.message)) return prev
        return [...prev, `[${ts}] ${progress.message}`]
      })
    }
    if (progress.step === 'render' && progress.progress >= 100) {
      setRenderLog(prev => [...prev, `[${ts}] ✅ 렌더링 완료!`])
      api.getOutputs(jobId!).then((files: any[]) => {
        setOutputs(files)
        setLocalStep('done')
      }).catch(() => {})
      renderingRef.current = false
      setRendering(false)
    } else if (
      (progress.step === 'render' && progress.progress < 0) ||
      progress.step === 'error'
    ) {
      setRenderLog(prev => [...prev, `[${ts}] ❌ ${progress.message}`])
      setError(progress.message || '렌더링 중 오류가 발생했습니다.')
      renderingRef.current = false
      setRendering(false)
    }
  }, [progress])

  // 로그 자동 스크롤
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [renderLog])

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>🎬 TTS + 최종 렌더링</h2>

      {/* TTS 설정 */}
      {step === 'tts' && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #e5e8eb', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>🎤 TTS 음성 합성</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 6 }}>
                음성 선택
              </label>
              <select value={voice} onChange={e => setVoice(e.target.value)} style={{
                width: '100%', border: '1.5px solid #e5e8eb', borderRadius: 8,
                padding: '10px 12px', fontSize: 13, outline: 'none',
              }}>
                {voices.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.gender === 'Female' ? '여' : '남'})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 6 }}>
                속도 ({speed.toFixed(1)}x)
              </label>
              <input type="range" min="0.5" max="2.0" step="0.1" value={speed}
                onChange={e => setSpeed(+e.target.value)}
                style={{ width: '100%', marginTop: 8 }}
              />
            </div>
          </div>

          {ttsProgress && (
            <div style={{ background: '#f2f4f6', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#4e5968', marginBottom: 12 }}>
              {ttsProgress}
            </div>
          )}

          {/* BGM 업로드 */}
          <div style={{
            background: '#f8f0ff', borderRadius: 10, padding: '14px 16px',
            marginBottom: 16, border: '1px solid #d8b4fe',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', marginBottom: 8 }}>
              🎵 배경음악 (BGM) — 선택사항
            </div>
            <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 10 }}>
              MP3/AAC/WAV 파일을 업로드하면 렌더링 시 낮은 볼륨으로 자동 믹싱됩니다
            </div>
            <input
              ref={bgmInputRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={async e => {
                const f = e.target.files?.[0]
                if (f) { setBgmFile(f); await uploadBgm(f) }
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => bgmInputRef.current?.click()}
                disabled={bgmUploading}
                style={{
                  background: bgmUploaded ? '#7c3aed' : '#ede9fe',
                  color: bgmUploaded ? '#fff' : '#7c3aed',
                  border: 'none', borderRadius: 8,
                  padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {bgmUploading ? '업로드 중...' : bgmUploaded ? '✓ 업로드 완료' : '📂 파일 선택'}
              </button>
              {bgmFile && (
                <span style={{ fontSize: 11, color: '#7c3aed' }}>{bgmFile.name}</span>
              )}
              {bgmUploaded && (
                <button
                  onClick={() => { setBgmFile(null); setBgmUploaded(false) }}
                  style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 12 }}
                >
                  ✕ 제거
                </button>
              )}
            </div>
          </div>

          <ProgressBar />

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={synthesizeAll} style={{
              flex: 1, background: '#3182f6', color: '#fff', border: 'none',
              borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              🎤 TTS 합성 시작
            </button>
            <button onClick={() => setLocalStep('render')} style={{
              background: '#f2f4f6', color: '#4e5968', border: 'none',
              borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              TTS 건너뛰기 →
            </button>
          </div>
        </div>
      )}

      {/* 렌더링 */}
      {step === 'render' && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #e5e8eb', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🎬 최종 변환</h3>
          <p style={{ fontSize: 13, color: '#8b95a1', marginBottom: 16 }}>
            {selectedSegments.length}개 구간을 효과 + 자막 + TTS 합쳐서 최종 영상으로 변환합니다.
          </p>

          <ProgressBar />

          {/* 구간별 진행률 */}
          {rendering && selectedSegments.length > 1 && (
            <div style={{ marginTop: 12, marginBottom: 4 }}>
              {selectedSegments.map(sid => {
                const pct = segmentProgress[sid] ?? 0
                return (
                  <div key={sid} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4e5968', marginBottom: 3 }}>
                      <span>{sid.replace('seg_', '구간 ')}</span>
                      <span style={{ fontWeight: 700, color: pct >= 100 ? '#1a7a3c' : '#3182f6' }}>
                        {pct >= 100 ? '✅ 완료' : `${pct}%`}
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#e5e8eb', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        background: pct >= 100 ? '#1a7a3c' : '#3182f6',
                        width: `${pct}%`, transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <button onClick={startRender} disabled={rendering || selectedSegments.length === 0} style={{
            width: '100%',
            background: (rendering || selectedSegments.length === 0) ? '#c9deff' : 'linear-gradient(135deg, #3182f6, #6366f1)',
            color: '#fff', border: 'none', borderRadius: 12,
            padding: '16px', fontSize: 16, fontWeight: 800, cursor: rendering ? 'not-allowed' : 'pointer',
          }}>
            {rendering ? '🔄 렌더링 진행 중...' : '🚀 최종 렌더링 시작'}
          </button>

          {/* 렌더링 로그 */}
          {renderLog.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#4e5968' }}>📋 렌더링 로그</span>
                <button
                  onClick={() => setShowLog(v => !v)}
                  style={{ background: 'none', border: 'none', fontSize: 11, color: '#8b95a1', cursor: 'pointer' }}
                >
                  {showLog ? '▲ 접기' : '▼ 펼치기'}
                </button>
              </div>
              {showLog && (
                <div style={{
                  background: '#0f172a', borderRadius: 10, padding: '12px 14px',
                  maxHeight: 220, overflowY: 'auto',
                  fontFamily: 'monospace', fontSize: 11, lineHeight: 1.7,
                }}>
                  {renderLog.map((line, i) => (
                    <div key={i} style={{
                      color: line.includes('❌') ? '#f87171' : line.includes('✅') ? '#4ade80' : '#94a3b8',
                    }}>{line}</div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 완료 → 미리보기 + 다운로드 */}
      {step === 'done' && outputs.length > 0 && (
        <div style={{ background: '#f0fff4', borderRadius: 14, padding: 24, border: '1px solid #b7e1c8' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1a7a3c' }}>
              {outputs.length}개 숏폼 완성!
            </h3>
            {outputs.length > 1 && (
              <a
                href={`/api/jobs/${jobId}/outputs/zip`}
                download
                style={{
                  display: 'inline-block', marginTop: 12,
                  background: '#1a7a3c', color: '#fff', borderRadius: 10,
                  padding: '10px 22px', fontSize: 14, fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                📦 전체 ZIP 다운로드
              </a>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {outputs.map(file => (
              <div key={file.name} style={{
                background: '#fff', borderRadius: 12, padding: 18,
                border: '1px solid #e5e8eb',
              }}>
                {/* 파일 정보 + 버튼 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#191f28' }}>{file.name}</div>
                    <div style={{ fontSize: 12, color: '#8b95a1' }}>
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                  <a href={file.download_url || file.url + '?download=true'} download={file.name} style={{
                    background: '#3182f6', color: '#fff', borderRadius: 8,
                    padding: '8px 16px', fontSize: 13, fontWeight: 700,
                    textDecoration: 'none', flexShrink: 0,
                  }}>
                    ⬇ 다운로드
                  </a>
                </div>

                {/* 영상 미리보기 플레이어 */}
                <video
                  src={file.url}
                  controls
                  playsInline
                  style={{
                    width: '100%',
                    maxHeight: 480,
                    borderRadius: 10,
                    background: '#000',
                    display: 'block',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

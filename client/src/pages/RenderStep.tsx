import { useState, useEffect, useRef } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useApi } from '../hooks/useApi'
import ProgressBar from '../components/ProgressBar'
import type { Voice } from '../types'

export default function RenderStep() {
  const { jobId, selectedSegments, outputs, setOutputs, setError, job } = useProjectStore()
  const [voices, setVoices] = useState<Voice[]>([])
  const [voice, setVoice] = useState('ko-KR-SunHiNeural')
  const [speed, setSpeed] = useState(1.0)
  const [ttsProgress, setTtsProgress] = useState('')
  const [rendering, setRendering] = useState(false)
  const [step, setLocalStep] = useState<'tts' | 'render' | 'done'>('tts')
  const [bgmFile, setBgmFile] = useState<File | null>(null)
  const [bgmUploading, setBgmUploading] = useState(false)
  const [bgmUploaded, setBgmUploaded] = useState(false)
  const bgmInputRef = useRef<HTMLInputElement>(null)
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
        // 완료 대기
        await new Promise(r => setTimeout(r, 3000))
      }
      setTtsProgress('TTS 합성 완료!')
      setLocalStep('render')
    } catch (e: any) {
      setError(e.message)
    }
  }

  // 최종 렌더링
  async function startRender() {
    if (!jobId) return
    setRendering(true)
    try {
      await api.renderSegments(jobId, selectedSegments)
      // polling
      let retries = 0
      while (retries < 300) {
        await new Promise(r => setTimeout(r, 3000))
        const data = await api.getJob(jobId)
        if (data.status === 'completed') {
          const files = await api.getOutputs(jobId)
          setOutputs(files)
          setLocalStep('done')
          break
        }
        if (data.status === 'failed') {
          setError(data.error || '렌더링 실패')
          break
        }
        retries++
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRendering(false)
    }
  }

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

          <button onClick={startRender} disabled={rendering || selectedSegments.length === 0} style={{
            width: '100%',
            background: (rendering || selectedSegments.length === 0) ? '#c9deff' : 'linear-gradient(135deg, #3182f6, #6366f1)',
            color: '#fff', border: 'none', borderRadius: 12,
            padding: '16px', fontSize: 16, fontWeight: 800, cursor: rendering ? 'not-allowed' : 'pointer',
          }}>
            {rendering ? '🔄 렌더링 진행 중...' : '🚀 최종 렌더링 시작'}
          </button>
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

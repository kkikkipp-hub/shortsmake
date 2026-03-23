import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useApi } from '../hooks/useApi'
import ProgressBar from '../components/ProgressBar'

type PrevJob = {
  id: string
  status: string
  meta?: { title: string; duration: number; resolution: string; url: string }
  segments?: { id: string }[]
  created_at?: string
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  downloaded: { label: '다운로드 완료', color: '#3182f6', bg: '#ebf3ff' },
  analyzed:   { label: '분석 완료',     color: '#1a7a3c', bg: '#f0fff4' },
  transcribed:{ label: '자막 생성됨',   color: '#6366f1', bg: '#f0f0ff' },
  completed:  { label: '렌더링 완료',   color: '#10b981', bg: '#ecfdf5' },
  failed:     { label: '실패',         color: '#ff4d4f', bg: '#fff0f0' },
  created:    { label: '생성됨',       color: '#8b95a1', bg: '#f2f4f6' },
  downloading:{ label: '다운로드 중',   color: '#b45309', bg: '#fffbeb' },
  analyzing:  { label: '분석 중',      color: '#b45309', bg: '#fffbeb' },
  rendering:  { label: '렌더링 중',    color: '#b45309', bg: '#fffbeb' },
}

export default function InputStep() {
  const [url, setUrl] = useState('')
  const [inputMode, setInputMode] = useState<'url' | 'file'>('url')
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [prevJobs, setPrevJobs] = useState<PrevJob[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const { job, loading, setJobId, setJob, setStep, setSegments, setSelectedSegments, setSubtitles, setLoading, setError } = useProjectStore()
  const api = useApi()

  useEffect(() => {
    api.listJobs()
      .then((list: PrevJob[]) => {
        const valid = list.filter(j => j.meta?.title)
        valid.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        setPrevJobs(valid)
      })
      .catch(() => {})
      .finally(() => setLoadingJobs(false))
  }, [])

  function isValidUrl(u: string): boolean {
    try { new URL(u); return true } catch { return false }
  }

  async function handleSubmit() {
    if (!url.trim() || !isValidUrl(url.trim())) return
    setLoading(true)
    setError(null)
    try {
      const { id } = await api.createJob()
      setJobId(id)
      await api.downloadVideo(id, url.trim())
      let retries = 0
      while (retries < 300) {
        await new Promise(r => setTimeout(r, 2000))
        const data = await api.getJob(id)
        setJob(data)
        if (data.status === 'downloaded') {
          setStep('segments')
          return
        }
        if (data.status === 'failed') {
          setError(data.error || '다운로드 실패')
          return
        }
        retries++
      }
      setError('시간 초과')
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  async function handleFileUpload() {
    if (!selectedFile) return
    setLoading(true)
    setError(null)
    try {
      const { id } = await api.createJob()
      setJobId(id)
      const form = new FormData()
      form.append('file', selectedFile)
      const res = await fetch(`/api/jobs/${id}/upload`, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '업로드 실패' }))
        throw new Error(err.detail || '업로드 실패')
      }
      const data = await res.json()
      setJob({ id, status: 'downloaded', meta: data.meta })
      setStep('segments')
    } catch (e: any) {
      setError(e.message || '파일 업로드 실패')
    } finally {
      setLoading(false)
    }
  }

  async function loadPrevJob(pj: PrevJob) {
    setError(null)
    try {
      const data = await api.getJob(pj.id)
      setJobId(pj.id)
      setJob(data)
      if (data.segments?.length) {
        setSegments(data.segments)
        const segIds = data.segments.map((seg: { id: string }) => seg.id)
        setSelectedSegments(segIds)
        // 이미 자막이 생성된 경우 자막 데이터도 복원 (병렬 로드)
        if (data.status === 'transcribed' || data.status === 'completed') {
          await Promise.all(segIds.map(async (sid) => {
            try {
              const subs = await api.getSubtitle(pj.id, sid)
              setSubtitles(sid, subs)
            } catch {}
          }))
        }
      }
      const s = data.status
      if (s === 'completed') {
        setStep('render')
      } else if (s === 'transcribed') {
        setStep('effects')
      } else if (s === 'analyzed' || s === 'downloaded') {
        setStep('segments')
      } else {
        setStep('segments')
      }
    } catch (e: any) {
      setError('작업을 불러올 수 없어요: ' + (e.message || ''))
    }
  }

  async function deletePrevJob(e: React.MouseEvent, jobId: string) {
    e.stopPropagation()
    try {
      await api.deleteJob(jobId)
      setPrevJobs(prev => prev.filter(j => j.id !== jobId))
    } catch {}
  }

  const meta = job?.meta

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🎬</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#191f28', marginBottom: 6 }}>
          영상 불러오기
        </h2>
        <p style={{ fontSize: 14, color: '#8b95a1' }}>
          URL 또는 로컬 파일을 선택하면 AI가 분석해 숏폼을 만들어요
        </p>
      </div>

      <div style={{
        background: '#fff', borderRadius: 16, padding: 24,
        border: '1px solid #e5e8eb', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        {/* 탭 전환 */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e8eb' }}>
          {(['url', 'file'] as const).map(mode => (
            <button key={mode}
              onClick={() => setInputMode(mode)}
              style={{
                flex: 1, padding: '10px', fontSize: 13, fontWeight: 700,
                border: 'none', cursor: 'pointer',
                background: inputMode === mode ? '#3182f6' : '#f8f9fa',
                color: inputMode === mode ? '#fff' : '#4e5968',
                transition: 'all 0.15s',
              }}
            >
              {mode === 'url' ? '🔗 URL 입력' : '📁 파일 업로드'}
            </button>
          ))}
        </div>

        {inputMode === 'url' ? (
          <>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 8 }}>
              영상 URL
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleSubmit()}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={loading}
                style={{
                  flex: 1, border: '1.5px solid #e5e8eb', borderRadius: 10,
                  padding: '12px 14px', fontSize: 14, outline: 'none',
                  fontFamily: 'monospace',
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={loading || !url.trim() || !isValidUrl(url.trim())}
                style={{
                  background: loading ? '#c9deff' : '#3182f6',
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '12px 20px', fontSize: 14, fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {loading ? '처리 중...' : '분석 시작'}
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
              style={{ display: 'none' }}
              onChange={e => setSelectedFile(e.target.files?.[0] || null)}
            />
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) setSelectedFile(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#3182f6' : '#e5e8eb'}`,
                borderRadius: 12, padding: '32px 20px', textAlign: 'center',
                background: dragOver ? '#ebf3ff' : '#f8f9fa',
                cursor: 'pointer', marginBottom: 16, transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
              {selectedFile ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#191f28' }}>{selectedFile.name}</div>
                  <div style={{ fontSize: 12, color: '#8b95a1', marginTop: 4 }}>
                    {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#4e5968' }}>
                    파일을 드래그하거나 클릭해서 선택
                  </div>
                  <div style={{ fontSize: 12, color: '#8b95a1', marginTop: 4 }}>
                    MP4, MOV, AVI, MKV, WEBM 지원
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleFileUpload}
              disabled={loading || !selectedFile}
              style={{
                width: '100%',
                background: loading ? '#c9deff' : selectedFile ? '#3182f6' : '#e5e8eb',
                color: selectedFile ? '#fff' : '#8b95a1',
                border: 'none', borderRadius: 10,
                padding: '12px', fontSize: 14, fontWeight: 700,
                cursor: loading || !selectedFile ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '업로드 중...' : '📤 파일 분석 시작'}
            </button>
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <ProgressBar />
        </div>

        {meta && (
          <div style={{ marginTop: 16, background: '#f8f9fa', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#191f28', marginBottom: 8 }}>
              {meta.title}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#8b95a1', flexWrap: 'wrap' }}>
              <span>길이: {formatDuration(meta.duration)}</span>
              <span>해상도: {meta.resolution}</span>
            </div>
          </div>
        )}
      </div>

      {/* 이전 작업 목록 */}
      {!loadingJobs && prevJobs.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#191f28', marginBottom: 12 }}>
            📂 이전 작업 이어하기
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {prevJobs.map(pj => {
              const st = STATUS_LABEL[pj.status] || STATUS_LABEL.created
              const segCount = pj.segments?.length || 0
              return (
                <div
                  key={pj.id}
                  onClick={() => loadPrevJob(pj)}
                  style={{
                    background: '#fff', borderRadius: 12, padding: '14px 18px',
                    border: '1px solid #e5e8eb', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 14,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#3182f6')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e8eb')}
                >
                  <div style={{ fontSize: 28, flexShrink: 0 }}>🎬</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: '#191f28',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {pj.meta?.title || pj.id}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                        background: st.bg, color: st.color,
                      }}>{st.label}</span>
                      {pj.meta?.duration && (
                        <span style={{ fontSize: 11, color: '#8b95a1' }}>
                          {formatDuration(pj.meta.duration)}
                        </span>
                      )}
                      {pj.meta?.resolution && (
                        <span style={{ fontSize: 11, color: '#8b95a1' }}>
                          {pj.meta.resolution}
                        </span>
                      )}
                      {segCount > 0 && (
                        <span style={{ fontSize: 11, color: '#8b95a1' }}>
                          구간 {segCount}개
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => deletePrevJob(e, pj.id)}
                    style={{
                      background: 'none', border: 'none', color: '#c9d0d7',
                      cursor: 'pointer', fontSize: 16, padding: '4px 8px',
                      flexShrink: 0,
                    }}
                    title="작업 삭제"
                  >✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{
        marginTop: 20, background: '#f0f0ff', borderRadius: 12,
        padding: '14px 18px', fontSize: 12, color: '#6366f1', lineHeight: 1.6,
      }}>
        💡 <strong>URL 모드:</strong> YouTube, Vimeo, Pexels 등 yt-dlp 지원 사이트 &nbsp;|&nbsp;
        <strong>파일 모드:</strong> 로컬 MP4·MOV·AVI·MKV·WEBM 직접 업로드
      </div>
    </div>
  )
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}분 ${s}초`
}

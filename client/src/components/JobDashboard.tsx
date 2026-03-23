import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'

interface JobEntry {
  id: string
  status: string
  created_at: string
  meta?: { title?: string; duration?: number; resolution?: string }
  output_count?: number
}

interface Props {
  onClose: () => void
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  created:     { text: '생성됨',    color: '#8b95a1' },
  downloading: { text: '다운로드 중', color: '#3182f6' },
  downloaded:  { text: '다운로드 완료', color: '#1a7a3c' },
  analyzing:   { text: '분석 중',   color: '#f59e0b' },
  analyzed:    { text: '분석 완료', color: '#1a7a3c' },
  transcribing:{ text: '자막 생성 중', color: '#7c3aed' },
  transcribed: { text: '자막 완료', color: '#1a7a3c' },
  rendering:   { text: '렌더링 중', color: '#f59e0b' },
  completed:   { text: '완료',      color: '#1a7a3c' },
  failed:      { text: '실패',      color: '#ff4d4f' },
}

function fmt(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function JobDashboard({ onClose }: Props) {
  const [jobs, setJobs] = useState<JobEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const api = useApi()

  async function loadJobs() {
    setLoading(true)
    try {
      const list: JobEntry[] = await api.listJobs()
      // 생성 시간 최신순 정렬
      list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      // 각 job 출력 파일 수 조회
      const enriched = await Promise.all(list.map(async (j) => {
        try {
          const outputs = await api.getOutputs(j.id)
          return { ...j, output_count: outputs.length }
        } catch {
          return { ...j, output_count: 0 }
        }
      }))
      setJobs(enriched)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadJobs() }, [])

  async function deleteJob(id: string) {
    if (!confirm('이 작업을 삭제할까요? 영상 파일도 함께 삭제됩니다.')) return
    setDeletingId(id)
    try {
      await api.deleteJob(id)
      setJobs(prev => prev.filter(j => j.id !== id))
    } catch {}
    setDeletingId(null)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div
        style={{
          width: 420, maxWidth: '95vw', height: '100vh',
          background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid #e5e8eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#191f28' }}>📂 이전 작업</div>
            <div style={{ fontSize: 11, color: '#8b95a1', marginTop: 2 }}>{jobs.length}개 작업</div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#8b95a1',
          }}>✕</button>
        </div>

        {/* 목록 */}
        <div style={{ flex: 1, padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#8b95a1', padding: 40, fontSize: 14 }}>
              불러오는 중...
            </div>
          ) : jobs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#8b95a1', padding: 40, fontSize: 14 }}>
              이전 작업이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobs.map(job => {
                const st = STATUS_LABEL[job.status] || { text: job.status, color: '#8b95a1' }
                const title = job.meta?.title || job.id
                return (
                  <div key={job.id} style={{
                    background: '#f8f9fa', borderRadius: 12, padding: 14,
                    border: '1px solid #e5e8eb',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 700, color: '#191f28',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }} title={title}>{title}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, color: st.color,
                            background: st.color + '18', padding: '2px 7px', borderRadius: 5,
                          }}>{st.text}</span>
                          {job.meta?.duration && (
                            <span style={{ fontSize: 11, color: '#8b95a1' }}>
                              {Math.floor(job.meta.duration / 60)}분 {Math.round(job.meta.duration % 60)}초
                            </span>
                          )}
                          {job.meta?.resolution && (
                            <span style={{ fontSize: 11, color: '#8b95a1' }}>{job.meta.resolution}</span>
                          )}
                          {(job.output_count ?? 0) > 0 && (
                            <span style={{ fontSize: 11, color: '#1a7a3c', fontWeight: 600 }}>
                              숏폼 {job.output_count}개
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: '#c9d0d7', marginTop: 4 }}>
                          {fmt(job.created_at)} · {job.id}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {(job.output_count ?? 0) > 0 && (
                          <a
                            href={`/api/jobs/${job.id}/outputs/zip`}
                            download
                            title="ZIP 다운로드"
                            style={{
                              padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                              background: '#f0fff4', color: '#1a7a3c', border: '1px solid #b7e1c8',
                              textDecoration: 'none', display: 'flex', alignItems: 'center',
                            }}
                          >📦</a>
                        )}
                        <button
                          onClick={() => deleteJob(job.id)}
                          disabled={deletingId === job.id}
                          title="작업 삭제"
                          style={{
                            padding: '5px 10px', borderRadius: 7, fontSize: 11,
                            background: '#fff0f0', color: '#ff4d4f', border: '1px solid #ffd0d0',
                            cursor: 'pointer',
                          }}
                        >{deletingId === job.id ? '...' : '🗑'}</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

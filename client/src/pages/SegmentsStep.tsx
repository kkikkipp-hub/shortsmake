import { useState, useRef } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useApi } from '../hooks/useApi'
import ProgressBar from '../components/ProgressBar'

const REASON_LABEL: Record<string, string> = {
  high_energy: '높은 에너지',
  scene_rich: '다양한 장면',
  dynamic: '역동적',
  full_video: '전체 영상',
}

export default function SegmentsStep() {
  const { jobId, segments, selectedSegments, setSegments, toggleSegment, setStep, setError } = useProjectStore()
  const [duration, setDuration] = useState(30)
  const [maxCount, setMaxCount] = useState(5)
  const [analyzing, setAnalyzing] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const api = useApi()

  async function startAnalysis() {
    if (!jobId) return
    setAnalyzing(true)
    setError(null)
    try {
      await api.analyzeVideo(jobId, duration, maxCount)
      // polling
      let retries = 0
      while (retries < 200) {
        await new Promise(r => setTimeout(r, 2000))
        const data = await api.getJob(jobId)
        if (data.segments?.length) {
          setSegments(data.segments)
          break
        }
        if (data.status === 'failed') {
          setError(data.error || '분석 실패')
          return
        }
        retries++
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  async function confirmSelection() {
    if (!jobId || selectedSegments.length === 0) return
    try {
      await api.selectSegments(jobId, selectedSegments)
      setStep('subtitle')
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>✂️ 숏폼 구간 추출</h2>

      {/* 설정 */}
      <div style={{
        background: '#fff', borderRadius: 14, padding: 20,
        border: '1px solid #e5e8eb', marginBottom: 20,
        display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 6 }}>
            숏폼 길이 (초)
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[15, 30, 60, 90].map(d => (
              <button key={d} onClick={() => setDuration(d)} style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: duration === d ? '2px solid #3182f6' : '2px solid #e5e8eb',
                background: duration === d ? '#ebf3ff' : '#fff',
                color: duration === d ? '#3182f6' : '#4e5968',
                cursor: 'pointer',
              }}>{d}초</button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#4e5968', display: 'block', marginBottom: 6 }}>
            최대 구간 수
          </label>
          <input type="number" value={maxCount} onChange={e => setMaxCount(+e.target.value)}
            min={1} max={20}
            style={{ border: '1.5px solid #e5e8eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: 80 }}
          />
        </div>
        <button onClick={startAnalysis} disabled={analyzing} style={{
          background: analyzing ? '#c9deff' : '#3182f6',
          color: '#fff', border: 'none', borderRadius: 10,
          padding: '10px 20px', fontSize: 14, fontWeight: 700,
          cursor: analyzing ? 'not-allowed' : 'pointer',
        }}>
          {analyzing ? '분석 중...' : '🔍 AI 분석 시작'}
        </button>
      </div>

      <ProgressBar />

      {/* 구간 목록 */}
      {segments.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#4e5968' }}>
              {segments.length}개 구간 발견 · {selectedSegments.length}개 선택됨
            </span>
            <button onClick={() => segments.forEach(s => {
              if (!selectedSegments.includes(s.id)) toggleSegment(s.id)
            })} style={{
              background: 'none', border: '1px solid #3182f6', borderRadius: 8,
              padding: '6px 12px', fontSize: 12, color: '#3182f6', fontWeight: 600, cursor: 'pointer',
            }}>전체 선택</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {segments.map(seg => {
              const selected = selectedSegments.includes(seg.id)
              return (
                <div
                  key={seg.id}
                  onClick={() => toggleSegment(seg.id)}
                  style={{
                    display: 'flex', gap: 14, alignItems: 'center',
                    background: selected ? '#ebf3ff' : '#fff',
                    border: `2px solid ${selected ? '#3182f6' : '#e5e8eb'}`,
                    borderRadius: 14, padding: 14, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* 썸네일 */}
                  {seg.thumbnail && (
                    <img src={seg.thumbnail} alt="" style={{
                      width: 120, height: 68, borderRadius: 8, objectFit: 'cover',
                      border: '1px solid #e5e8eb',
                    }} />
                  )}

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#191f28' }}>
                        {seg.id.replace('seg_', '구간 ')}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                        background: seg.score > 0.7 ? '#f0fff4' : seg.score > 0.4 ? '#fffbeb' : '#f2f4f6',
                        color: seg.score > 0.7 ? '#1a7a3c' : seg.score > 0.4 ? '#b45309' : '#8b95a1',
                      }}>
                        점수 {(seg.score * 100).toFixed(0)}
                      </span>
                      <span style={{ fontSize: 11, color: '#8b95a1', background: '#f2f4f6', padding: '2px 8px', borderRadius: 6 }}>
                        {REASON_LABEL[seg.reason] || seg.reason}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#4e5968' }}>
                      {formatTime(seg.start_sec)} ~ {formatTime(seg.end_sec)} ({seg.duration.toFixed(1)}초)
                    </div>
                  </div>

                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setPreviewId(previewId === seg.id ? null : seg.id)
                    }}
                    style={{
                      background: previewId === seg.id ? '#3182f6' : '#f2f4f6',
                      color: previewId === seg.id ? '#fff' : '#4e5968',
                      border: 'none', borderRadius: 8,
                      padding: '6px 10px', fontSize: 13, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {previewId === seg.id ? '⏹' : '▶'}
                  </button>

                  <div style={{
                    width: 24, height: 24, borderRadius: 6,
                    border: `2px solid ${selected ? '#3182f6' : '#c9d0d7'}`,
                    background: selected ? '#3182f6' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 14, flexShrink: 0,
                  }}>
                    {selected && '✓'}
                  </div>
                </div>

                {/* 미리보기 플레이어 */}
                {previewId === seg.id && (
                  <video
                    ref={videoRef}
                    src={`/api/jobs/${jobId}/source#t=${seg.start_sec},${seg.end_sec}`}
                    controls
                    autoPlay
                    style={{
                      width: '100%', maxHeight: 300, borderRadius: 10,
                      background: '#000', display: 'block', marginTop: 12,
                    }}
                    onEnded={() => setPreviewId(null)}
                  />
                )}
              )
            })}
          </div>

          <button onClick={confirmSelection}
            disabled={selectedSegments.length === 0}
            style={{
              marginTop: 20, width: '100%',
              background: selectedSegments.length === 0 ? '#c9d0d7' : '#3182f6',
              color: '#fff', border: 'none', borderRadius: 12,
              padding: '14px', fontSize: 15, fontWeight: 700,
              cursor: selectedSegments.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {selectedSegments.length}개 구간 선택 완료 → 자막 생성
          </button>
        </>
      )}
    </div>
  )
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

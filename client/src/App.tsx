import { useProjectStore } from './stores/projectStore'
import { useWebSocket } from './hooks/useWebSocket'
import StepNav from './components/StepNav'
import InputStep from './pages/InputStep'
import SegmentsStep from './pages/SegmentsStep'
import SubtitleStep from './pages/SubtitleStep'
import EffectsStep from './pages/EffectsStep'
import RenderStep from './pages/RenderStep'

function StepContent() {
  const step = useProjectStore((s) => s.step)
  switch (step) {
    case 'input':    return <InputStep />
    case 'segments': return <SegmentsStep />
    case 'subtitle': return <SubtitleStep />
    case 'effects':  return <EffectsStep />
    case 'render':   return <RenderStep />
  }
}

export default function App() {
  const { jobId, error, setError } = useProjectStore()
  useWebSocket(jobId)

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f8f9fa 0%, #fff 30%)',
      fontFamily: "'Pretendard Variable', -apple-system, sans-serif",
    }}>
      <header style={{
        padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid #e5e8eb', background: '#fff',
      }}>
        <span style={{ fontSize: 26 }}>🎬</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#191f28', lineHeight: 1.2 }}>
            ShortsMake
          </div>
          <div style={{ fontSize: 11, color: '#8b95a1' }}>
            롱폼 → 숏폼 자동 변환기
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 12px 80px' }}>
        <StepNav />

        {error && (
          <div style={{
            background: '#fff0f0', border: '1px solid #ffd0d0', borderRadius: 10,
            padding: '12px 16px', marginBottom: 16,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: '#ff4d4f', fontWeight: 600 }}>{error}</span>
            <button onClick={() => setError(null)} style={{
              background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', fontSize: 16,
            }}>✕</button>
          </div>
        )}

        <StepContent />
      </div>
    </div>
  )
}

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

// 단계별 재시도 힌트
const STEP_RETRY_HINT: Record<string, string> = {
  input:    '영상 URL이나 파일을 다시 확인하고 시도해주세요.',
  segments: 'AI 분석을 다시 실행하거나 이전 단계로 돌아가세요.',
  subtitle: '자막 생성을 다시 시도하거나 건너뛸 수 있어요.',
  effects:  '효과 저장에 실패했어요. 구간이 선택됐는지 확인하세요.',
  render:   '렌더링에 실패했어요. 서버 로그를 확인하거나 다시 시도하세요.',
}

export default function App() {
  const { jobId, error, step, setError, setStep, reset } = useProjectStore()
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
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <span style={{ fontSize: 26 }}>🎬</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#191f28', lineHeight: 1.2 }}>
            ShortsMake
          </div>
          <div style={{ fontSize: 11, color: '#8b95a1' }}>
            롱폼 → 숏폼 자동 변환기
          </div>
        </div>
        {jobId && (
          <button
            onClick={() => { if (confirm('처음부터 다시 시작할까요? 현재 작업이 초기화됩니다.')) reset() }}
            style={{
              background: 'none', border: '1px solid #e5e8eb', borderRadius: 8,
              padding: '6px 12px', fontSize: 12, color: '#8b95a1', cursor: 'pointer',
            }}
          >
            ↩ 처음으로
          </button>
        )}
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 12px 80px' }}>
        <StepNav />

        {error && (
          <div style={{
            background: '#fff0f0', border: '1px solid #ffd0d0', borderRadius: 12,
            padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#ff4d4f', fontWeight: 700, marginBottom: 4 }}>
                  ⚠️ {error}
                </div>
                <div style={{ fontSize: 12, color: '#8b95a1' }}>
                  {STEP_RETRY_HINT[step] || '다시 시도해주세요.'}
                </div>
              </div>
              <button onClick={() => setError(null)} style={{
                background: 'none', border: 'none', color: '#c9d0d7', cursor: 'pointer', fontSize: 18, flexShrink: 0,
              }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => setError(null)}
                style={{
                  background: '#ff4d4f', color: '#fff', border: 'none', borderRadius: 7,
                  padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                다시 시도
              </button>
              {step !== 'input' && (
                <button
                  onClick={() => { setError(null); setStep('input') }}
                  style={{
                    background: '#fff', color: '#4e5968', border: '1px solid #e5e8eb', borderRadius: 7,
                    padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  처음으로
                </button>
              )}
            </div>
          </div>
        )}

        <StepContent />
      </div>
    </div>
  )
}

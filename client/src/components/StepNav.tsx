import { useProjectStore } from '../stores/projectStore'
import type { Step } from '../types'

const STEPS: { key: Step; label: string; emoji: string }[] = [
  { key: 'input',    label: 'URL 입력',    emoji: '🔗' },
  { key: 'segments', label: '구간 선택',   emoji: '✂️' },
  { key: 'subtitle', label: '자막 편집',   emoji: '💬' },
  { key: 'effects',  label: '효과 설정',   emoji: '✨' },
  { key: 'render',   label: '최종 변환',   emoji: '🎬' },
]

export default function StepNav() {
  const { step, setStep, jobId } = useProjectStore()

  return (
    <div style={{
      display: 'flex', gap: 4, padding: '12px 0', marginBottom: 24,
      borderBottom: '1px solid #e5e8eb',
    }}>
      {STEPS.map((s, i) => {
        const active = s.key === step
        const done = STEPS.findIndex(x => x.key === step) > i
        return (
          <button
            key={s.key}
            onClick={() => jobId && setStep(s.key)}
            disabled={!jobId && s.key !== 'input'}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '10px 8px', borderRadius: 10,
              border: active ? '2px solid #3182f6' : '2px solid transparent',
              background: active ? '#ebf3ff' : done ? '#f0fff4' : '#f8f9fa',
              color: active ? '#3182f6' : done ? '#1a7a3c' : '#8b95a1',
              fontWeight: active ? 700 : 500, fontSize: 13,
              cursor: (!jobId && s.key !== 'input') ? 'not-allowed' : 'pointer',
              opacity: (!jobId && s.key !== 'input') ? 0.5 : 1,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 16 }}>{s.emoji}</span>
            <span style={{}}>{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}

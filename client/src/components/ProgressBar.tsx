import { useProjectStore } from '../stores/projectStore'

export default function ProgressBar() {
  const progress = useProjectStore((s) => s.progress)
  if (!progress || progress.progress < 0) return null

  return (
    <div style={{ background: '#f2f4f6', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#191f28' }}>
          {progress.message}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#3182f6' }}>
          {progress.progress.toFixed(0)}%
        </span>
      </div>
      <div style={{ background: '#e5e8eb', borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <div
          style={{
            background: 'linear-gradient(90deg, #3182f6, #6366f1)',
            height: '100%',
            borderRadius: 6,
            width: `${Math.min(progress.progress, 100)}%`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}

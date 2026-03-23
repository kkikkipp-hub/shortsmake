import { create } from 'zustand'
import type { Job, Segment, SubtitleEntry, EffectsConfig, WsMessage, Step, OutputFile } from '../types'

interface ProjectState {
  step: Step
  jobId: string | null
  job: Job | null
  segments: Segment[]
  selectedSegments: string[]
  subtitles: Record<string, SubtitleEntry[]>
  effects: Record<string, EffectsConfig>
  outputs: OutputFile[]
  progress: WsMessage | null
  segmentProgress: Record<string, number>  // seg_id → 0~100
  loading: boolean
  error: string | null
  // 제품 쇼츠 모드
  productMode: boolean
  openaiApiKey: string
  productHint: string
  removeHardcodedSubs: boolean

  setStep: (step: Step) => void
  setJobId: (id: string) => void
  setJob: (job: Job) => void
  setSegments: (s: Segment[]) => void
  setSelectedSegments: (ids: string[]) => void
  toggleSegment: (id: string) => void
  setSubtitles: (segId: string, subs: SubtitleEntry[]) => void
  setEffects: (segId: string, config: EffectsConfig) => void
  setOutputs: (files: OutputFile[]) => void
  setProgress: (msg: WsMessage) => void
  setSegmentProgress: (segId: string, pct: number) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  setProductMode: (v: boolean) => void
  setOpenaiApiKey: (v: string) => void
  setProductHint: (v: string) => void
  setRemoveHardcodedSubs: (v: boolean) => void
  reset: () => void
}

const initial = {
  step: 'input' as Step,
  jobId: null as string | null,
  job: null as Job | null,
  segments: [] as Segment[],
  selectedSegments: [] as string[],
  subtitles: {} as Record<string, SubtitleEntry[]>,
  effects: {} as Record<string, EffectsConfig>,
  outputs: [] as OutputFile[],
  progress: null as WsMessage | null,
  segmentProgress: {} as Record<string, number>,
  loading: false,
  error: null as string | null,
  productMode: false,
  openaiApiKey: '',
  productHint: '',
  removeHardcodedSubs: false,
}

export const useProjectStore = create<ProjectState>((set) => ({
  ...initial,

  setStep: (step) => set({ step }),
  setJobId: (id) => set({ jobId: id }),
  setJob: (job) => set({ job }),
  setSegments: (segments) => set({ segments }),
  setSelectedSegments: (selectedSegments) => set({ selectedSegments }),
  toggleSegment: (id) =>
    set((s) => ({
      selectedSegments: s.selectedSegments.includes(id)
        ? s.selectedSegments.filter((x) => x !== id)
        : [...s.selectedSegments, id],
    })),
  setSubtitles: (segId, subs) =>
    set((s) => ({ subtitles: { ...s.subtitles, [segId]: subs } })),
  setEffects: (segId, config) =>
    set((s) => ({ effects: { ...s.effects, [segId]: config } })),
  setOutputs: (outputs) => set({ outputs }),
  setProgress: (progress) => {
    set({ progress })
    // WS detail에서 구간별 진행률 추출
    if (progress.detail?.seg_id) {
      const { seg_id, seg_progress } = progress.detail
      if (typeof seg_progress === 'number') {
        set(s => ({ segmentProgress: { ...s.segmentProgress, [seg_id]: seg_progress } }))
      }
    }
  },
  setSegmentProgress: (segId, pct) =>
    set(s => ({ segmentProgress: { ...s.segmentProgress, [segId]: pct } })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setProductMode: (productMode) => set({ productMode }),
  setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
  setProductHint: (productHint) => set({ productHint }),
  setRemoveHardcodedSubs: (removeHardcodedSubs) => set({ removeHardcodedSubs }),
  reset: () => set(initial),
}))

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
  loading: boolean
  error: string | null

  setStep: (step: Step) => void
  setJobId: (id: string) => void
  setJob: (job: Job) => void
  setSegments: (s: Segment[]) => void
  toggleSegment: (id: string) => void
  setSubtitles: (segId: string, subs: SubtitleEntry[]) => void
  setEffects: (segId: string, config: EffectsConfig) => void
  setOutputs: (files: OutputFile[]) => void
  setProgress: (msg: WsMessage) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
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
  loading: false,
  error: null as string | null,
}

export const useProjectStore = create<ProjectState>((set) => ({
  ...initial,

  setStep: (step) => set({ step }),
  setJobId: (id) => set({ jobId: id }),
  setJob: (job) => set({ job }),
  setSegments: (segments) => set({ segments }),
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
  setProgress: (progress) => set({ progress }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () => set(initial),
}))

import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export function useApi() {
  return {
    listJobs: () => api.get('/jobs').then(r => r.data),

    createJob: () => api.post('/jobs').then(r => r.data),

    deleteJob: (jobId: string) => api.delete(`/jobs/${jobId}`).then(r => r.data),

    downloadVideo: (jobId: string, url: string) =>
      api.post(`/jobs/${jobId}/download`, { url }).then(r => r.data),

    getJob: (jobId: string) =>
      api.get(`/jobs/${jobId}`).then(r => r.data),

    analyzeVideo: (jobId: string, durationSec: number, maxSegments: number) =>
      api.post(`/jobs/${jobId}/analyze`, {
        duration_sec: durationSec,
        max_segments: maxSegments,
      }).then(r => r.data),

    selectSegments: (jobId: string, segmentIds: string[]) =>
      api.post(`/jobs/${jobId}/segments/select`, {
        segment_ids: segmentIds,
      }).then(r => r.data),

    generateSubtitles: (jobId: string) =>
      api.post(`/jobs/${jobId}/subtitle/generate`).then(r => r.data),

    getSubtitle: (jobId: string, segId: string) =>
      api.get(`/jobs/${jobId}/subtitle/${segId}`).then(r => r.data),

    updateSubtitle: (jobId: string, segId: string, segments: any[]) =>
      api.put(`/jobs/${jobId}/subtitle/${segId}`, { segments }).then(r => r.data),

    rewriteSubtitle: (jobId: string, segId: string, style: string, customPrompt?: string) =>
      api.post(`/jobs/${jobId}/subtitle/${segId}/rewrite`, {
        segment_id: segId, style, custom_prompt: customPrompt,
      }).then(r => r.data),

    getRewriteStyles: () =>
      api.get('/rewrite/styles').then(r => r.data),

    getVoices: () =>
      api.get('/voices').then(r => r.data),

    synthesizeTts: (jobId: string, segmentId: string, voice: string, speed: number) =>
      api.post(`/jobs/${jobId}/tts`, {
        segment_id: segmentId,
        voice, speed,
      }).then(r => r.data),

    saveEffects: (jobId: string, config: any) =>
      api.put(`/jobs/${jobId}/effects`, config).then(r => r.data),

    renderSegments: (jobId: string, segmentIds: string[]) =>
      api.post(`/jobs/${jobId}/render`, {
        segment_ids: segmentIds,
      }).then(r => r.data),

    getOutputs: (jobId: string) =>
      api.get(`/jobs/${jobId}/outputs`).then(r => r.data),

    generatePreview: (jobId: string, segId: string, config: any) =>
      api.post(`/jobs/${jobId}/segments/${segId}/preview`, config).then(r => r.data),

    uploadVideo: (jobId: string, file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post(`/jobs/${jobId}/upload`, form).then(r => r.data)
    },

    removeSubtitles: (jobId: string, mode: 'fast' | 'quality' = 'fast') =>
      api.post(`/jobs/${jobId}/remove_subtitles`, { mode }).then(r => r.data),

    analyzeVisual: (jobId: string, params: {
      frame_interval?: number
      segment_duration?: number
      max_segments?: number
      product_hint?: string
    }) => api.post(`/jobs/${jobId}/analyze_visual`, params).then(r => r.data),

    getVisionSubtitles: (jobId: string, segId: string) =>
      api.get(`/jobs/${jobId}/vision_subtitles/${segId}`).then(r => r.data),

    createThumbnail: (jobId: string, segId: string, timeOffset?: number, title?: string) =>
      api.post(`/jobs/${jobId}/segments/${segId}/thumbnail`, null, {
        params: { time_offset: timeOffset, title: title || '' },
      }).then(r => r.data),

    uploadFont: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      // font upload is global, use any job context; we pass to /api/jobs/:id/font
      // but since font is global, we use a dummy upload path and store in FONTS_DIR
      return api.post('/fonts/upload', form).then(r => r.data)
    },

    uploadFontForJob: (jobId: string, file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post(`/jobs/${jobId}/font`, form).then(r => r.data)
    },

    listFonts: () => api.get('/fonts').then(r => r.data),
  }
}

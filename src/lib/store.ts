import { create } from 'zustand'

export type TimeSegment = {
  id: string
  startS: number
  endS: number
  label?: string
  sibilanceRatio?: number
  resonances?: Array<{ frequencyHz: number; gainDb: number }>
}

type AppState = {
  fileName: string | null
  audioUrl: string | null
  audioBuffer: AudioBuffer | null
  sampleRate: number | null
  durationS: number | null
  numChannels: number | null
  isDecoding: boolean
  segments: TimeSegment[]
  setAudio: (payload: {
    fileName: string
    audioUrl: string
    audioBuffer: AudioBuffer
  }) => void
  clearAudio: () => void
  setDecoding: (v: boolean) => void
  setSegments: (segments: TimeSegment[]) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  fileName: null,
  audioUrl: null,
  audioBuffer: null,
  sampleRate: null,
  durationS: null,
  numChannels: null,
  isDecoding: false,
  segments: [],
  setAudio: ({ fileName, audioUrl, audioBuffer }) => {
    const prevUrl = get().audioUrl
    if (prevUrl && prevUrl !== audioUrl) URL.revokeObjectURL(prevUrl)
    set({
      fileName,
      audioUrl,
      audioBuffer,
      sampleRate: audioBuffer.sampleRate,
      durationS: audioBuffer.duration,
      numChannels: audioBuffer.numberOfChannels,
      isDecoding: false,
    })
  },
  clearAudio: () => {
    const prevUrl = get().audioUrl
    if (prevUrl) URL.revokeObjectURL(prevUrl)
    set({
      fileName: null,
      audioUrl: null,
      audioBuffer: null,
      sampleRate: null,
      durationS: null,
      numChannels: null,
      segments: [],
    })
  },
  setDecoding: (v) => set({ isDecoding: v }),
  setSegments: (segments) => set({ segments }),
}))



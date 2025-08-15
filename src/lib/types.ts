export type FrequencyBandsDb = {
  band20_120: number
  band120_500: number
  band500_2000: number
  band2000_5000: number
  band5000_10000: number
}

export type SegmentMetrics = {
  id: string
  startS: number
  endS: number
  durationS: number
  peakDbfs: number
  rmsDbfs: number
  spectralFluxMean: number
  spectralCentroidMeanHz: number
  bandsDb: FrequencyBandsDb
  sibilanceRatio: number // energia 6–10 kHz / 1–5 kHz (linear)
  resonances: Array<{ frequencyHz: number; gainDb: number }>
}

export type AnalysisResult = {
  sampleRate: number
  numChannels: number
  segments: SegmentMetrics[]
  pitch?: {
    medianHz: number
    stabilityCentsStd: number
    voicedRatio: number
  }
  key?: {
    name: string // ex.: C, G#, etc
    scale: 'major' | 'minor'
    confidence: number // 0..1
  }
}



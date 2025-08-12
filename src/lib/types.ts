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
}

export type AnalysisResult = {
  sampleRate: number
  numChannels: number
  segments: SegmentMetrics[]
}



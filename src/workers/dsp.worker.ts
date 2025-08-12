import { expose } from 'comlink'
import type { AnalysisResult, SegmentMetrics } from '../lib/types'

type AnalyzeParams = {
  channelData: Float32Array[]
  sampleRate: number
}

export type DspWorkerApi = {
  analyze(params: AnalyzeParams): Promise<AnalysisResult>
}

function computeRmsDbfs(frame: Float32Array): number {
  let sumSquares = 0
  for (let i = 0; i < frame.length; i++) sumSquares += frame[i] * frame[i]
  const rms = Math.sqrt(sumSquares / frame.length)
  const db = 20 * Math.log10(rms + 1e-12)
  return db
}

function computePeakDbfs(frame: Float32Array): number {
  let peak = 0
  for (let i = 0; i < frame.length; i++) peak = Math.max(peak, Math.abs(frame[i]))
  return 20 * Math.log10(peak + 1e-12)
}

function frameSignal(signal: Float32Array, frameSize: number, hopSize: number): Float32Array[] {
  const frames: Float32Array[] = []
  for (let start = 0; start + frameSize <= signal.length; start += hopSize) {
    frames.push(signal.subarray(start, start + frameSize))
  }
  return frames
}

function hannWindow(N: number): Float32Array {
  const w = new Float32Array(N)
  for (let n = 0; n < N; n++) w[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)))
  return w
}

function applyWindow(frame: Float32Array, win: Float32Array): Float32Array {
  const out = new Float32Array(frame.length)
  for (let i = 0; i < frame.length; i++) out[i] = frame[i] * win[i]
  return out
}

function spectralFlux(magPrev: Float32Array | null, magCurr: Float32Array): number {
  if (!magPrev) return 0
  let flux = 0
  for (let i = 0; i < magCurr.length; i++) {
    const diff = Math.max(0, magCurr[i] - magPrev[i])
    flux += diff * diff
  }
  return Math.sqrt(flux / magCurr.length)
}

function computeBandsDb(mag: Float32Array, sampleRate: number): {
  band20_120: number
  band120_500: number
  band500_2000: number
  band2000_5000: number
  band5000_10000: number
} {
  // mag bins assumem FFT de N pontos; aqui usamos PSD simplificada
  const N = (mag.length - 1) * 2
  const binHz = sampleRate / N
  const sumDb = (fromHz: number, toHz: number): number => {
    const fromBin = Math.max(1, Math.floor(fromHz / binHz))
    const toBin = Math.min(mag.length - 1, Math.floor(toHz / binHz))
    let sum = 0
    let count = 0
    for (let b = fromBin; b <= toBin; b++) {
      const v = mag[b]
      sum += 20 * Math.log10(v + 1e-12)
      count++
    }
    return count > 0 ? sum / count : -120
  }
  return {
    band20_120: sumDb(20, 120),
    band120_500: sumDb(120, 500),
    band500_2000: sumDb(500, 2000),
    band2000_5000: sumDb(2000, 5000),
    band5000_10000: sumDb(5000, 10000),
  }
}

async function analyzeMidChannel(channelData: Float32Array, sampleRate: number): Promise<SegmentMetrics[]> {
  const frameMs = 46.4 // ~2048 @44.1k
  const frameSize = Math.floor((frameMs / 1000) * sampleRate)
  const hopSize = Math.floor(frameSize / 2)
  const win = hannWindow(frameSize)

  // FFT via WebAudio não está disponível aqui; usar rápida DFT ingênua para protótipo (custoso, ok p/ v0.3)
  function magnitudeSpectrum(frame: Float32Array): Float32Array {
    const N = frame.length
    const reWin = applyWindow(frame, win)
    const mags = new Float32Array(N / 2 + 1)
    for (let k = 0; k <= N / 2; k++) {
      let re = 0,
        im = 0
      for (let n = 0; n < N; n++) {
        const phi = (-2 * Math.PI * k * n) / N
        re += reWin[n] * Math.cos(phi)
        im += reWin[n] * Math.sin(phi)
      }
      mags[k] = Math.sqrt(re * re + im * im) / (N / 2)
    }
    return mags
  }

  const frames = frameSignal(channelData, frameSize, hopSize)

  let magPrev: Float32Array | null = null
  const fluxSeries: number[] = []
  const energySeries: number[] = []

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    const rmsDb = computeRmsDbfs(frame)
    energySeries.push(rmsDb)
    const mag = magnitudeSpectrum(frame)
    const flux = spectralFlux(magPrev, mag)
    fluxSeries.push(flux)
    magPrev = mag
  }

  // Detecção simples de bordas por novidade (flux) + silêncio
  const fluxMean = fluxSeries.reduce((a, b) => a + b, 0) / Math.max(1, fluxSeries.length)
  const fluxThresh = fluxMean * 1.2
  const silenceThreshDb = -50

  const boundaries: number[] = [0]
  for (let i = 1; i < fluxSeries.length - 1; i++) {
    const isPeak = fluxSeries[i] > fluxThresh && fluxSeries[i] > fluxSeries[i - 1] && fluxSeries[i] >= fluxSeries[i + 1]
    const isSilence = energySeries[i] < silenceThreshDb
    if (isPeak || isSilence) boundaries.push(i)
  }
  boundaries.push(fluxSeries.length - 1)

  // Unir segmentos muito curtos (< 2s)
  const minDurFrames = Math.max(1, Math.floor((2 * sampleRate) / hopSize))
  const merged: [number, number][] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i]
    let b = boundaries[i + 1]
    if (b - a < minDurFrames && merged.length) {
      merged[merged.length - 1][1] = b
    } else {
      merged.push([a, b])
    }
  }

  // Agregar métricas por segmento
  const results: SegmentMetrics[] = []
  for (let idx = 0; idx < merged.length; idx++) {
    const [fa, fb] = merged[idx]
    const startS = (fa * hopSize) / sampleRate
    const endS = (fb * hopSize + frameSize) / sampleRate
    const durationS = Math.max(0, endS - startS)

    // métricas simples médias no intervalo
    let peakDb = -120,
      rmsDb = -120,
      fluxAcc = 0
    let centroidAcc = 0,
      centroidCount = 0
    let bandsAcc = { band20_120: 0, band120_500: 0, band500_2000: 0, band2000_5000: 0, band5000_10000: 0 }
    let bandCount = 0

    magPrev = null
    for (let f = fa; f <= fb && f < frames.length; f++) {
      const fr = frames[f]
      peakDb = Math.max(peakDb, computePeakDbfs(fr))
      rmsDb = Math.max(rmsDb, computeRmsDbfs(fr))
      const mag = magnitudeSpectrum(fr)
      // spectral centroid
      let num = 0,
        den = 0
      const N = (mag.length - 1) * 2
      const binHz = sampleRate / N
      for (let k = 0; k < mag.length; k++) {
        const fHz = k * binHz
        num += fHz * mag[k]
        den += mag[k]
      }
      const centroid = den > 0 ? num / den : 0
      centroidAcc += centroid
      centroidCount++
      const bands = computeBandsDb(mag, sampleRate)
      bandsAcc.band20_120 += bands.band20_120
      bandsAcc.band120_500 += bands.band120_500
      bandsAcc.band500_2000 += bands.band500_2000
      bandsAcc.band2000_5000 += bands.band2000_5000
      bandsAcc.band5000_10000 += bands.band5000_10000
      bandCount++
      fluxAcc += spectralFlux(magPrev, mag)
      magPrev = mag
    }

    results.push({
      id: `s${idx}`,
      startS,
      endS,
      durationS,
      peakDbfs: peakDb,
      rmsDbfs: rmsDb,
      spectralFluxMean: fluxAcc / Math.max(1, fb - fa + 1),
      spectralCentroidMeanHz: centroidCount ? centroidAcc / centroidCount : 0,
      bandsDb: {
        band20_120: bandCount ? bandsAcc.band20_120 / bandCount : -120,
        band120_500: bandCount ? bandsAcc.band120_500 / bandCount : -120,
        band500_2000: bandCount ? bandsAcc.band500_2000 / bandCount : -120,
        band2000_5000: bandCount ? bandsAcc.band2000_5000 / bandCount : -120,
        band5000_10000: bandCount ? bandsAcc.band5000_10000 / bandCount : -120,
      },
    })
  }
  return results
}

const api: DspWorkerApi = {
  async analyze({ channelData, sampleRate }) {
    // Mid channel (L+R)/2 se estéreo
    const mid = channelData.length === 2
      ? new Float32Array(channelData[0].map((v, i) => 0.5 * (v + channelData[1][i] || 0)))
      : channelData[0]
    const segments = await analyzeMidChannel(mid, sampleRate)
    return { sampleRate, numChannels: channelData.length, segments }
  },
}

expose(api)



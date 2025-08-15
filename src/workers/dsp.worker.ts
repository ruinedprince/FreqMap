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
    if (i % 10 === 0) reportProgress(Math.min(70, Math.round((i / frames.length) * 70)))
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
    let sibilanceAcc = 0
    let sibilanceCount = 0

    magPrev = null
    // acumular espectro médio do segmento para detecção de ressonâncias
    let avgMag: Float32Array | null = null
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

      // sibilância: energia 6–10 kHz vs 1–5 kHz
      const sRatio = (() => {
        const sumBand = (fromHz: number, toHz: number) => {
          const fromBin = Math.max(1, Math.floor(fromHz / binHz))
          const toBin = Math.min(mag.length - 1, Math.floor(toHz / binHz))
          let sum = 0
          for (let b = fromBin; b <= toBin; b++) sum += mag[b]
          return sum
        }
        const hi = sumBand(6000, 10000)
        const lo = sumBand(1000, 5000)
        return lo > 0 ? hi / lo : 0
      })()
      if (isFinite(sRatio)) {
        sibilanceAcc += sRatio
        sibilanceCount++
      }

      // espectro médio
      if (!avgMag) avgMag = new Float32Array(mag.length)
      for (let k = 0; k < mag.length; k++) avgMag[k] += mag[k]
    }
    reportProgress(Math.min(95, 70 + Math.round(((idx + 1) / Math.max(1, merged.length)) * 25)))

    // calcular ressonâncias: picos estreitos no espectro médio (200–4000 Hz)
    let resonances: Array<{ frequencyHz: number; gainDb: number }> = []
    if (bandCount > 0 && avgMag) {
      for (let k = 0; k < avgMag.length; k++) avgMag[k] /= bandCount
      const N = (avgMag.length - 1) * 2
      const binHz = sampleRate / N
      const dbMag = new Float32Array(avgMag.length)
      for (let k = 0; k < avgMag.length; k++) dbMag[k] = 20 * Math.log10(avgMag[k] + 1e-12)
      // cálculo de baseline por média móvel para destacar picos
      const win = 5
      const baseline = new Float32Array(dbMag.length)
      for (let i = 0; i < dbMag.length; i++) {
        let s = 0,
          c = 0
        for (let j = i - win; j <= i + win; j++) {
          if (j >= 0 && j < dbMag.length) {
            s += dbMag[j]
            c++
          }
        }
        baseline[i] = c ? s / c : dbMag[i]
      }
      for (let i = 2; i < dbMag.length - 2; i++) {
        const fHz = i * binHz
        if (fHz < 200 || fHz > 4000) continue
        const prominence = dbMag[i] - baseline[i]
        const isPeak = dbMag[i] > dbMag[i - 1] && dbMag[i] >= dbMag[i + 1]
        if (isPeak && prominence > 3) {
          resonances.push({ frequencyHz: fHz, gainDb: prominence })
        }
      }
      resonances.sort((a, b) => b.gainDb - a.gainDb)
      resonances = resonances.slice(0, 3)
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
      sibilanceRatio: sibilanceCount ? sibilanceAcc / sibilanceCount : 0,
      resonances,
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
    // Pitch (YIN simplificado) e Key (cromas + correlação) — protótipo leve
    const pitch = estimatePitchStats(mid, sampleRate)
    reportProgress(97)
    const key = estimateKey(mid, sampleRate)
    reportProgress(100)
    return { sampleRate, numChannels: channelData.length, segments, pitch, key }
  },
}

expose(api)
function reportProgress(p: number) {
  ;(self as any).postMessage({ __type: 'progress', value: p })
}
// -------- Pitch (YIN simplificado) --------
function estimatePitchStats(signal: Float32Array, sampleRate: number) {
  const frameSize = Math.floor(0.04 * sampleRate) // ~40ms
  const hop = Math.floor(frameSize / 2)
  const frames = frameSignal(signal, frameSize, hop)
  const pitches: number[] = []
  let voicedCount = 0
  for (const fr of frames) {
    const hz = yinPitch(fr, sampleRate)
    if (hz > 0) {
      pitches.push(hz)
      voicedCount++
    }
  }
  pitches.sort((a, b) => a - b)
  const median = pitches.length ? pitches[Math.floor(pitches.length / 2)] : 0
  // desvio padrão em cents
  const cents = pitches.map((h) => (1200 * Math.log2(h / Math.max(1e-6, median === 0 ? h : median))))
  const mean = cents.reduce((a, b) => a + b, 0) / Math.max(1, cents.length)
  const variance = cents.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, cents.length)
  const std = Math.sqrt(variance)
  return {
    medianHz: isFinite(median) ? median : 0,
    stabilityCentsStd: isFinite(std) ? std : 0,
    voicedRatio: frames.length ? voicedCount / frames.length : 0,
  }
}

function yinPitch(frame: Float32Array, sampleRate: number): number {
  const N = frame.length
  const tauMax = Math.floor(sampleRate / 80) // 80 Hz
  const tauMin = Math.floor(sampleRate / 1000) // 1 kHz limite superior
  const d = new Float32Array(tauMax + 1)
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0
    for (let i = 0; i < N - tau; i++) {
      const diff = frame[i] - frame[i + tau]
      sum += diff * diff
    }
    d[tau] = sum
  }
  // cumulativa normalizada
  const cum = new Float32Array(tauMax + 1)
  cum[0] = 1
  let running = 0
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau]
    cum[tau] = d[tau] * tau / Math.max(1e-9, running)
  }
  // pick mínimo abaixo de threshold
  const threshold = 0.1
  let bestTau = -1
  for (let tau = tauMin + 1; tau <= tauMax; tau++) {
    if (cum[tau] < threshold && cum[tau] <= cum[tau + 1]) {
      bestTau = tau
      break
    }
  }
  if (bestTau < 0) return 0
  return sampleRate / bestTau
}

// -------- Key detection (cromas + Krumhansl) --------
function estimateKey(signal: Float32Array, sampleRate: number) {
  // Cromas simplificados via STFT coarse
  const frame = 4096
  const hop = 1024
  const win = hannWindow(frame)
  const frames = frameSignal(signal, frame, hop)
  const chroma = new Float32Array(12)
  for (const fr of frames) {
    if (fr.length < frame) break
    const mag = magnitudeSpectrumSimple(fr, win)
    accumulateChroma(mag, sampleRate, chroma)
  }
  // normalizar
  const sum = chroma.reduce((a, b) => a + b, 0)
  for (let i = 0; i < 12; i++) chroma[i] = sum ? chroma[i] / sum : 0
  const major = krumhanslCorrelation(chroma, 'major')
  const minor = krumhanslCorrelation(chroma, 'minor')
  const best = major.value >= minor.value ? major : minor
  return { name: pitchClassName(best.index), scale: best.scale, confidence: Math.max(0, Math.min(1, best.value)) as 1 | 0 as number }
}

function magnitudeSpectrumSimple(frame: Float32Array, win: Float32Array) {
  const N = frame.length
  const mags = new Float32Array(N / 2 + 1)
  const w = applyWindow(frame, win)
  for (let k = 0; k <= N / 2; k++) {
    let re = 0,
      im = 0
    for (let n = 0; n < N; n++) {
      const phi = (-2 * Math.PI * k * n) / N
      re += w[n] * Math.cos(phi)
      im += w[n] * Math.sin(phi)
    }
    mags[k] = Math.sqrt(re * re + im * im)
  }
  return mags
}

function accumulateChroma(mag: Float32Array, sampleRate: number, chroma: Float32Array) {
  const N = (mag.length - 1) * 2
  const binHz = sampleRate / N
  for (let k = 1; k < mag.length; k++) {
    const f = k * binHz
    if (f < 50 || f > 5000) continue
    const midi = 69 + 12 * Math.log2(f / 440)
    const pc = ((Math.round(midi) % 12) + 12) % 12
    chroma[pc] += mag[k]
  }
}

function krumhanslCorrelation(chroma: Float32Array, scale: 'major' | 'minor') {
  const profiles: Record<'major' | 'minor', number[]> = {
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  }
  let bestIndex = 0
  let bestVal = -Infinity
  for (let shift = 0; shift < 12; shift++) {
    let sxy = 0,
      sx2 = 0,
      sy2 = 0
    for (let i = 0; i < 12; i++) {
      const x = chroma[(i + shift) % 12]
      const y = profiles[scale][i]
      sxy += x * y
      sx2 += x * x
      sy2 += y * y
    }
    const corr = sxy / Math.max(1e-9, Math.sqrt(sx2 * sy2))
    if (corr > bestVal) {
      bestVal = corr
      bestIndex = shift
    }
  }
  return { index: bestIndex, value: bestVal, scale }
}

function pitchClassName(index: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return names[((index % 12) + 12) % 12]
}



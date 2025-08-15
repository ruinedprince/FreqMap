import { useMemo, useState } from 'react'
import { useAppStore } from '../lib/store'
import { wrap } from 'comlink'
import type { DspWorkerApi } from '../workers/dsp.worker'

export default function AnalysisPanel() {
  const audioBuffer = useAppStore((s) => s.audioBuffer)
  const [loading, setLoading] = useState(false)
  const [segments, setSegments] = useState<
    Array<{ id: string; startS: number; endS: number; durationS: number; rmsDbfs: number; spectralFluxMean: number; sibilanceRatio?: number; resonances?: Array<{ frequencyHz: number; gainDb: number }> }>
  >([])
  const [pitchKey, setPitchKey] = useState<{ pitch?: { medianHz: number; stabilityCentsStd: number; voicedRatio: number }; key?: { name: string; scale: 'major' | 'minor'; confidence: number } } | null>(null)

  const worker = useMemo(() => new Worker(new URL('../workers/dsp.worker.ts', import.meta.url), { type: 'module' }), [])
  const api = useMemo(() => wrap<DspWorkerApi>(worker), [worker])

  async function runAnalysis() {
    if (!audioBuffer) return
    setLoading(true)
    try {
      const channelData = Array.from({ length: audioBuffer.numberOfChannels }, (_, c) => audioBuffer.getChannelData(c))
      const res = await api.analyze({ channelData, sampleRate: audioBuffer.sampleRate })
      setSegments(res.segments.map((s) => ({ id: s.id, startS: s.startS, endS: s.endS, durationS: s.durationS, rmsDbfs: s.rmsDbfs, spectralFluxMean: s.spectralFluxMean, sibilanceRatio: s.sibilanceRatio, resonances: s.resonances })))
      // sincroniza segmentos com store para Waveform pintar regiões
      const setStoreSegments = useAppStore.getState().setSegments
      setStoreSegments(res.segments.map((s) => ({ id: s.id, startS: s.startS, endS: s.endS, sibilanceRatio: s.sibilanceRatio, resonances: s.resonances })))
      setPitchKey({ pitch: res.pitch, key: res.key })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-6">
      <button className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50" disabled={!audioBuffer || loading} onClick={runAnalysis}>
        {loading ? 'Analisando…' : 'Analisar segmentos'}
      </button>
      {segments.length > 0 && (
        <div className="mt-4 text-sm">
          <div className="font-medium mb-2">Segmentos detectados</div>
          <ul className="space-y-1">
            {segments.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <span className="w-20">{s.startS.toFixed(2)}s → {s.endS.toFixed(2)}s</span>
                <span className="w-16">dur: {s.durationS.toFixed(2)}s</span>
                <span className="w-20">RMS: {s.rmsDbfs.toFixed(1)} dBFS</span>
                <span className="w-28">Flux: {s.spectralFluxMean.toFixed(3)}</span>
                <span className="w-28">Sib: {s.sibilanceRatio ? s.sibilanceRatio.toFixed(2) : '—'}</span>
                <span className="flex-1 truncate">Reson.: {s.resonances && s.resonances.length ? s.resonances.map(r => `${Math.round(r.frequencyHz)}Hz(+${r.gainDb.toFixed(1)}dB)`).join(', ') : '—'}</span>
              </li>
            ))}
          </ul>
          {pitchKey && (
            <div className="mt-4">
              <div className="font-medium">Resumo de pitch/tonalidade</div>
              <div className="text-xs text-slate-400">
                Pitch mediano: {pitchKey.pitch?.medianHz ? pitchKey.pitch.medianHz.toFixed(1) + ' Hz' : '—'} | estabilidade: {pitchKey.pitch ? pitchKey.pitch.stabilityCentsStd.toFixed(1) + ' cents' : '—'} | voz: {pitchKey.pitch ? Math.round((pitchKey.pitch.voicedRatio || 0) * 100) + '%' : '—'}
              </div>
              <div className="text-xs text-slate-400">
                Tonalidade: {pitchKey.key ? `${pitchKey.key.name} ${pitchKey.key.scale}` : '—'} (confiança: {pitchKey.key ? Math.round((pitchKey.key.confidence || 0) * 100) + '%' : '—'})
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}



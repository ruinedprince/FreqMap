import { useMemo, useState } from 'react'
import { useAppStore } from '../lib/store'
import { wrap } from 'comlink'
import type { DspWorkerApi } from '../workers/dsp.worker'

export default function AnalysisPanel() {
  const audioBuffer = useAppStore((s) => s.audioBuffer)
  const [loading, setLoading] = useState(false)
  const [segments, setSegments] = useState<
    Array<{ id: string; startS: number; endS: number; durationS: number; rmsDbfs: number; spectralFluxMean: number }>
  >([])

  const worker = useMemo(() => new Worker(new URL('../workers/dsp.worker.ts', import.meta.url), { type: 'module' }), [])
  const api = useMemo(() => wrap<DspWorkerApi>(worker), [worker])

  async function runAnalysis() {
    if (!audioBuffer) return
    setLoading(true)
    try {
      const channelData = Array.from({ length: audioBuffer.numberOfChannels }, (_, c) => audioBuffer.getChannelData(c))
      const res = await api.analyze({ channelData, sampleRate: audioBuffer.sampleRate })
      setSegments(
        res.segments.map((s) => ({ id: s.id, startS: s.startS, endS: s.endS, durationS: s.durationS, rmsDbfs: s.rmsDbfs, spectralFluxMean: s.spectralFluxMean }))
      )
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}



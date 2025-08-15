import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { useAppStore } from '../lib/store'

export default function Waveform() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const audioUrl = useAppStore((s) => s.audioUrl)
  const segments = useAppStore((s) => s.segments)

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#60a5fa',
      progressColor: '#1d4ed8',
      cursorColor: '#94a3b8',
      height: 96,
      plugins: [RegionsPlugin.create()]
    })
    wavesurferRef.current = ws
    ws.load(audioUrl)
    return () => {
      ws.destroy()
    }
  }, [audioUrl])

  // pintar/regenerar regiões quando segmentos mudarem
  useEffect(() => {
    const ws = wavesurferRef.current as any
    if (!ws || !ws.regions || !segments.length) return
    ws.regions.clear()
    segments.forEach((seg) => {
      const dur = Math.max(0.01, seg.endS - seg.startS)
      const sib = seg.sibilanceRatio ?? 0
      // cor baseada na sibilância (verde→amarelo→vermelho)
      const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
      const t = clamp((sib - 1.0) / 1.0, 0, 1) // ~1.0 ok, 2.0 alto
      const r = Math.round(255 * t)
      const g = Math.round(200 * (1 - t))
      const color = `rgba(${r},${g},80,0.35)`
      ws.addRegion({ start: seg.startS, end: seg.startS + dur, drag: false, resize: false, color })
    })
  }, [segments])

  if (!audioUrl) return null
  return <div className="mt-4" ref={containerRef} />
}



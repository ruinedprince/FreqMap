import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { useAppStore } from '../lib/store'

export default function Waveform() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const audioUrl = useAppStore((s) => s.audioUrl)

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#60a5fa',
      progressColor: '#1d4ed8',
      cursorColor: '#94a3b8',
      height: 96,
    })
    wavesurferRef.current = ws
    ws.load(audioUrl)
    return () => {
      ws.destroy()
    }
  }, [audioUrl])

  if (!audioUrl) return null
  return <div className="mt-4" ref={containerRef} />
}



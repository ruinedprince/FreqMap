import { useRef } from 'react'
import { useAppStore } from '../lib/store'

export default function Upload() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const setAudio = useAppStore((s) => s.setAudio)
  const setDecoding = useAppStore((s) => s.setDecoding)
  const clearAudio = useAppStore((s) => s.clearAudio)

  async function onSelect(file: File) {
    clearAudio()
    setDecoding(true)
    try {
      const url = URL.createObjectURL(file)
      const arrayBuffer = await file.arrayBuffer()
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 })
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0))
      setAudio({ fileName: file.name, audioUrl: url, audioBuffer })
    } catch (e) {
      console.error('Falha ao decodificar áudio', e)
      alert('Falha ao decodificar áudio. Formato suportado no momento: WAV/MP3.')
    } finally {
      setDecoding(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="audio/wav, audio/mp3, audio/mpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onSelect(f)
        }}
      />
      <button
        className="px-4 py-2 rounded bg-blue-600 text-white"
        onClick={() => inputRef.current?.click()}
      >
        Selecionar Áudio
      </button>
    </div>
  )
}



import './App.css'

function App() {
  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4">
        <h1 className="text-xl font-semibold">FreqMap</h1>
      </header>
      <main className="px-6 py-8">
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-lg border border-neutral-800 p-4">
            <h2 className="mb-2 text-lg font-medium">Upload</h2>
            <input type="file" accept="audio/*" className="block w-full" />
            <p className="mt-2 text-sm text-neutral-400">WAV, MP3, FLAC • até 5 minutos</p>
          </section>
          <section className="rounded-lg border border-neutral-800 p-4">
            <h2 className="mb-2 text-lg font-medium">Análise</h2>
            <div className="h-24 rounded bg-neutral-900" />
            <p className="mt-2 text-sm text-neutral-400">Visualizações virão aqui</p>
          </section>
        </div>
      </main>
    </div>
  )
}

export default App

// no React state needed at the moment
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import './index.css'
import Upload from './components/Upload'
import Waveform from './components/Waveform'

function App() {

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1 className="text-2xl font-semibold">FreqMap</h1>
      <div className="mt-4 container-app">
        <Upload />
        <Waveform />
      </div>
      <p className="read-the-docs mt-4 text-sm text-slate-400">
        Carregue um arquivo de áudio (WAV/MP3) para visualizar a forma de onda.
      </p>
    </>
  )
}

export default App

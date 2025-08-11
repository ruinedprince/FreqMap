// Esqueleto do worker de DSP (Comlink será adicionado na próxima iteração)
export type DspWorkerApi = {
  ping(): string
}

const api: DspWorkerApi = {
  ping() {
    return 'pong'
  },
}

// Expor futuramente via Comlink
;(self as any).dsp = api



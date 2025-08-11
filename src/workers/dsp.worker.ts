import * as Comlink from 'comlink'

export type AnalyzeRequest = {
  audioBuffer: Float32Array[]
  sampleRate: number
}

export type AnalyzeResponse = {
  durationSeconds: number
}

const api = {
  async analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
    const numChannels = req.audioBuffer.length
    const numSamples = req.audioBuffer[0]?.length ?? 0
    return { durationSeconds: numSamples / req.sampleRate / (numChannels > 0 ? 1 : 1) }
  },
}

Comlink.expose(api)



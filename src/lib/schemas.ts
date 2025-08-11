import { z } from 'zod'

export const AnalysisSchema = z.object({
  version: z.string(),
  stereo: z.boolean(),
  sample_rate: z.number(),
  segments: z
    .array(
      z.object({
        start_s: z.number(),
        end_s: z.number(),
      })
    )
    .default([]),
})

export type Analysis = z.infer<typeof AnalysisSchema>



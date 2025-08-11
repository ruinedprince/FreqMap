# FreqMap — Aplicação Web de Diagnóstico Vocal para Mixagem (v0.x)

Aplicação web 100% local-first que analisa faixas de voz e gera um plano técnico de mixagem baseado em parâmetros acústicos e perfis de gênero musical. O app não altera o áudio: produz um diagnóstico detalhado e recomendações para uso na sua DAW.

## Visão geral

- Processamento 100% local no dispositivo do usuário (privacidade e baixa latência)
- Suporte a estéreo (análise Mid/Side)
- Análise por trechos (segmentação temporal) com sugestões específicas por intervalo
- Exportação de plano em JSON/PDF e armazenamento local versionado

## Stack (v0.1)

- Frontend: React + TypeScript (Vite)
- Estilos: Tailwind CSS v4
- Performance para WASM/Threads: COOP/COEP configurado em dev/preview + `coi-serviceworker`
- Estado: (a definir nas próximas versões; ex.: Zustand)
- Visualização: (próximas versões; ex.: wavesurfer.js, uPlot)

## Status atual (v0.1)

- Projeto inicial criado com Vite + React + TS
- Tailwind v4 habilitado (ver `src/index.css`)
- Cabeçalhos COOP/COEP no `vite.config.ts` e registro de `public/coi-serviceworker.js`
- Git configurado e remoto publicado: `origin` → `https://github.com/ruinedprince/FreqMap.git`

## Executando localmente

```bash
npm install
npm run dev
# abrir http://localhost:5173
```

## Diretrizes de desenvolvimento

- Código em TypeScript, alta legibilidade e nomes descritivos
- Evitar bloqueios de UI: análises pesadas irão para Web Workers
- Carregar módulos WASM sob demanda (após a versão 0.2)
- Versionar schemas JSON (analysis/plan/presets) com Zod (após 0.2)

## Arquitetura (planejada)

- Decodificação: Web Audio API (WAV/MP3). FLAC via `ffmpeg.wasm` (lazy)
- DSP: `essentia.js` (FFT/STFT, cromas, YIN/pyin, KeyExtractor) + `ebur128-wasm` para LUFS
- Segmentação: novidade espectral (fluxo espectral + cromas + energia) e silêncio
- Estéreo: análise Mid/Side; métricas e recomendações direcionadas
- Mapeamento determinístico para sugestões (EQ, de-esser, compressão, reverb, limiter, gate, autotune)

## Exportação e armazenamento (planejado)

- JSON: `analysis.json` e `plan.json` (globais + por segmento)
- PDF: relatório amigável ao usuário
- Local-first: IndexedDB (metadados/presets), File System Access API (arquivos do usuário)

## Roadmap

Consulte o arquivo `ROADMAP_0.x_to_1.0.txt` na raiz com as versões 0.x → 1.0, metas e entregáveis.

## Licença

Definir (ex.: MIT) em versões futuras.


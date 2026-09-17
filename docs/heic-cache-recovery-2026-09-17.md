# HEIC cache recovery — 2026-09-17

## Sintoma real
Em Android/PWA, após selecionar as 6 fotos, alguns aparelhos exibiam: `A biblioteca libheif foi carregada, mas o decoder não ficou disponível.`

## Causa
A correção do decoder já existia no repositório, mas `heic-report-conversion-v10_10_12.js` e `heic-libheif-worker-v10_10_12.js` continuavam sujeitos ao cache-first genérico de URLs com `?v=`. Assim, aparelhos que haviam armazenado a revisão defeituosa podiam continuar executando o arquivo antigo.

## Correção
- rotaciona o worker para `heicworker3`;
- marca conversor e worker HEIC como `MUTABLE_PATHS` no Service Worker, portanto são servidos network-first;
- altera o `CACHE_HOTFIX` para `heic-recovery1`, invalidando os caches antigos e acionando a navegação de resgate já existente;
- mantém `sw.js` e `sw_47.js` idênticos;
- mantém conversão local, limites de 25 MB/32 MP e o fluxo de 6 fotos;
- não altera Firestore, Storage, App Check ou regras de negócio.

## Regressão
`scripts/heic-worker-export-check.mjs` agora exige a rotação do worker, os dois caminhos HEIC em `MUTABLE_PATHS`, o hotfix de cache e a identidade entre os dois Service Workers.

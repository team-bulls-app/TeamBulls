# Runtime hygiene audit — 2026-09-16

Escopo conservador da primeira passada de limpeza/performance sobre `main` após as correções #141–#143.

## Achados corrigidos

- `desktop-performance` mantinha listeners globais de `scroll` instalados também em mobile/tablet, embora o handler retornasse imediatamente fora do desktop.
- as otimizações globais do Chart eram aplicadas no desktop e não eram restauradas quando o viewport/capacidade saía do perfil desktop.
- tarefas de mídia agendadas podiam permanecer pendentes depois da troca de breakpoint.
- o runtime consultava `matchMedia()` repetidamente em caminhos quentes em vez de reutilizar `MediaQueryList`.
- o settle de animações podia agendar mais de um `requestAnimationFrame` concorrente em eventos próximos de `pageshow`, `focus` e retorno de visibilidade.
- classes de capacidade (`pointer:coarse`, movimento reduzido e Save-Data) eram atualizadas apenas em instalação/pageshow, não quando a preferência/capacidade mudava durante a sessão.

## Limites preservados

- sem alteração de Firestore Rules 28 ou Storage Rules 6;
- sem alteração de App Check/Auth;
- sem novas leituras/escritas Firebase;
- sem polling, `setInterval` ou retry de escrita;
- sem reescrita do core;
- sem alteração de dados, schema, relatórios, treino ou dieta;
- sem merge automático.

## Regressão

`scripts/desktop-runtime-hygiene-check.mjs` trava os contratos acima dentro do workflow `Team Bulls quality`.

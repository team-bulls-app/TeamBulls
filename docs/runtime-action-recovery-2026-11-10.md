# Recuperação de conexão, desempenho e ações — 10/11/2026

Base: `6f6849fdbbec30950e6e0655c13246c95d8040cd` (main após PR #234). Entrega proposta: versão **10.10.9**, build **2026111001**, revisão `runtime-action-recovery-1`.

## Falhas reproduzidas e correções

| Fluxo | Causa | Resultado |
| --- | --- | --- |
| Home parada com consultas falhando | `sync` e `ensureInsights` repetiam `classList.add` no elemento observado. Cada render acionava outro frame. A falha das consultas zerava o cache de tempo, permitindo nova consulta em cada passagem. | Classes só mudam quando necessário; atualizações concorrentes compartilham a leitura, falhas têm intervalo de 10 s, consultas têm limite de espera e resultados antigos não atualizam outro aluno. |
| Carregamento durante inicialização/reparo | Inicialização e reparo podiam baixar a mesma extensão ao mesmo tempo. Arquivo ausente entrava em novo reparo a cada cinco segundos indefinidamente. | Uma operação por arquivo; três rodadas automáticas com espera crescente, pausa em background e nova tentativa explícita ou por retorno de conexão. Mudanças de tela não contornam o orçamento. A execução normal dos scripts continua sequencial. |
| Notificações e relatórios em tempo real | Após erro terminal, a lista mantinha o handle encerrado e o retorno ao app o considerava saudável. Erros de permissão também acionavam uma consulta alternativa desnecessária. | Recria somente a assinatura que falhou, com esperas de 5/10/20 s e no máximo três tentativas por sequência de falhas sem resposta válida do servidor. Não repete permissão negada nem substitui assinaturas saudáveis. Handles/callbacks antigos são invalidados, inclusive ao reiniciar o mesmo UID. Inicialização oculta/offline retoma uma única assinatura por fonte ao voltar. |
| Botão aguardando módulo | O clique aguardava o recurso e depois executava mesmo após sair da conta ou navegar. Uma ação assíncrona resolvida com `false` era anunciada pela API como sucesso. | Confere conta, papel, modo, revisão de autenticação e navegação antes da execução; cancela contexto antigo e propaga o resultado assíncrono correto. |
| Salvar refeição após trocar de aluno | Falha tardia restaurava a cópia de A sobre o cache global já usado por B. O plano original também era mutado antes da confirmação. | Rascunho em cópia com destino capturado; o documento ativo é aplicado após confirmação. Resposta antiga não altera editor, cache ou tela de outro aluno. O modo local recupera o estado anterior se o armazenamento falhar. |
| Salvar refeição com interface lenta | A ativação por frame capturava como “original” o texto que o treinador já havia editado; o botão então considerava que não havia alteração. | Captura o estado ao abrir, antes do frame de layout. A ativação atrasada não limpa a marca de edição. |
| Digitar durante envio / erro de render após salvar | O retorno marcava o texto mais recente, ainda não enviado, como salvo; falha visual podia reverter o cache mesmo após commit confirmado. | Marca somente o conteúdo efetivamente enviado. Texto posterior continua pendente. Erro de apresentação após confirmação mantém o dado salvo e orienta reabrir a tela. |

Na reprodução original, com HTML e módulo Home reais no Chrome e consultas fictícias respondendo com erro, houve **240 mutações visuais e 80 consultas simuladas adicionais em 650 ms** sem interação. Após a correção, o mesmo componente gerou **zero mutações e zero consultas adicionais** nesse intervalo. Isso mede esse cenário reproduzível, não uma porcentagem de aceleração do app inteiro nem tráfego medido em contas reais.

## Cadeia de entrega e arquivos

- `config_v10_7.js`: fila, compartilhamento das operações e orçamento de reparo, revisão `10.10.61-startup13`.
- `modules/student-home-layout-v10_10_15.js`: `10.10.21-home5`, render idempotente e leitura limitada/coalescida.
- `modules/student-request-realtime-v10_10_32.js`: `10.10.32-studentrealtime5`, ciclo de vida de cada assinatura. O comportamento de um listener encerrado segue a [documentação oficial do Firestore](https://firebase.google.com/docs/firestore/query-data/listen#handle_listen_errors).
- `modules/button-action-integrity-v10_10_38.js`: `10.10.38-buttonintegrity2`, cancelamento de ação fora de contexto.
- `modules/trainer-diet-workspace-v10_10_11.js`: `10.10.11-dietworkspace2`, editor e confirmação de salvamento.
- `app_v10_10_9_core.js`: persistência de rascunho de dieta com destino capturado, preservando o caminho legado e o rollback do armazenamento local.
- `index.html`, `update_v10_10_9.js`, `sw.js`, `sw_47.js`, `version.json`: referências alinhadas, módulos mutáveis em network-first e novo build. Workers principal/compatibilidade continuam iguais. SDK Firebase e regras não foram alterados.

Os testes estáticos que fixavam a forma antiga do loop/consulta foram atualizados para a forma equivalente com espera e pausa. Foram preservados os filtros por aluno, limites, ordem de execução, fallback de índice e garantias de autenticação. Novos cenários comportamentais exigem execução sequencial e recusa de requisições duplicadas; não se removeu cobertura para fazer a mudança passar.

## Evidência e validação

- `scripts/runtime-action-recovery-check.mjs`: dez cenários com módulos entregues, relógio controlado e armazenamento fictício. Inclui assinatura encerrada, permissão negada, callbacks antigos, início offline/oculto, limite das tentativas, isolamento A/B, digitação durante envio, falha visual após commit, rollback local, clique atrasado, carga sequencial, pausa/retomada e limite de reparo.
- `scripts/runtime-home-recovery-browser-check.mjs`: HTML/CSS e módulos reais; serviço de dados e normalização controlados. Doze combinações **320/360/390/430/768/1440 px × claro/escuro**, com medição de repouso, consulta sem resposta, recuperação, cliques e salvamento de refeições. Um frame de layout é segurado deliberadamente para reproduzir o botão Salvar que ignorava a edição.
- Os cenários novos foram executados antes da correção e falharam nas causas descritas; passaram após a correção. O modo `--baseline 6f6849fdbbec30950e6e0655c13246c95d8040cd` é diagnóstico e deve reprovar a versão anterior.
- Validação local final: **102 scripts de código/comportamento**, **13 suítes no Chrome** (incluindo as doze combinações novas), **7 testes de inicialização do navegador**, checagem de segurança e `npm audit --prefix functions --omit=dev --audit-level=moderate`: todos aprovados; audit com **0 vulnerabilidades** conhecidas. A compilação sintática cobre 160 arquivos JavaScript.
- A suíte geral mantém os fluxos existentes de login/contas no aparelho, dados offline, séries e exclusões, pagamentos/comprovantes, fotos, ciclos de treino/relatórios, contraste e migração de instalações. Os resultados finais e o commit exato de CI ficam no PR.

## Pendência externa confirmada

A consulta pública `OPTIONS` ao endereço configurado `https://southamerica-east1-teamms-app.cloudfunctions.net/studentAdministration` retornou **HTTP 404** nesta etapa. Não houve autenticação nem leitura de cadastros nesse teste. Esse endereço atende a organização, arquivamento/restauração e exclusão de alunos e edição de apelidos preparados no PR #234; enquanto não estiver disponível, esses controles permanecem indisponíveis mesmo com internet funcionando.

É necessário conferir/publicar a função `studentAdministration` no projeto/região configurados, conforme [o procedimento do PR anterior](student-administration-2026-11-09.md). Este trabalho não publica funções, não altera regras nem executa arquivamento/exclusão em alunos reais. Não se deve confundir essa configuração ausente com perda de internet no aparelho.

Continuam manuais: Android/iPhone físicos, Safari/PWA iOS, rede móvel real oscilando, duas sessões reais concorrentes e App Check/IAM/serviço de administração em projeto de teste. Adaptadores locais e Chrome não substituem esses ensaios, nem garantem ausência de todos os outros bugs do aplicativo. Nenhum dado de produção foi alterado, apagado ou migrado. Entrega para revisão, sem merge ou deploy.

# Exclusão durável de registros de séries

Base: `78a596dfa0ef203fa7b58df79370852ef036caeb`, main após PR #232. Entrega proposta: **10.10.9 / build 2026110605**, revisão `student-session-delete-1`.

## Causas encontradas

1. A camada de registros pendentes retirava a criação da fila, tentava uma limpeza remota e descartava a falha. Sem conexão, não existia uma solicitação durável de delete para retomar. Uma criação já em voo também podia confirmar depois da tentativa de exclusão e restaurar a sessão no servidor.
2. O fluxo antigo aguardava flush da fila completa. Uma gravação lenta de outro registro podia bloquear a exclusão pedida pelo aluno.
3. Registros já sincronizados dependiam do delete remoto antes de atualizar a tela. Aluno registrado em modo offline podia cair na exclusão somente local, sem concluir o delete depois de reconectar.
4. O arquivo histórico mescla memória, arquivo atual, arquivo legado e backups antigos. Remover só a sessão do arquivo atual não impede que uma cópia legada a inclua novamente no próximo carregamento.
5. Retornos assíncronos e confirmações abertas não revalidavam sempre a conta/editor, podendo limpar o estado de outra tela após navegar ou trocar de perfil.

## Implementação

- Núcleo passa a usar `TeamBullsSessionPerformance.requestDelete()` para contas de alunos, inclusive conta validada offline. A confirmação visual só ocorre após persistir a intenção. Falha em todos os armazenamentos conserva registro, formulário e confirmação para tentar novamente.
- Solicitações e marcadores de exclusão usam armazenamento separado da fila de criações: `team_bulls_session_deletions_v1_<uid>` e `session-deletions:<uid>` no store IndexedDB existente. O formato da fila v3 de criação/edição permanece compatível; uma versão antiga não pode interpretar um delete como uma criação.
- IndexedDB faz leitura/mescla/gravação em uma transação para preservar pedidos de duas páginas. localStorage oferece cópia durável alternativa e sessionStorage funciona como espelho. Apenas o espelho temporário não confirma sucesso.
- O registro some da projeção local após o pedido durável. Delete remoto aguarda somente a Promise real de criação do mesmo ID. Timeout mantém a operação identificada, sem reenvio concorrente; falha mantém o pedido para recuperação por reconexão/retomada. A exclusão pode prosseguir enquanto outro registro está sendo salvo.
- Permissão negada/not-found só é reconciliada como ausência mediante consulta **no servidor**, limitada por `userId` e ID. Documento ainda existente mantém falha/pendência; as regras não são relaxadas.
- Marcadores confirmados continuam guardados para filtrar a sessão de backups antigos, hidratação, histórico compartilhado e callbacks atrasados. Criação/edição/projeção pendente também consulta o marcador para não restaurar a série.
- Lixeira, exclusão do registro pelo editor e remoção da última série usam o mesmo caminho. Conta, contexto do editor e exercício visível são conferidos antes de limpar campos/redesenhar. Uma confirmação antiga concluída tarde também não fecha um novo pedido de confirmação. Falhas e exclusões pendentes entram no diagnóstico de sincronização.
- Configuração, núcleo, três módulos ativos, atualizador, HTML e workers foram alinhados. Revisões: `sessionperf6`, `pendingsession3`, `destructive-supply3`.

## Evidência e resultados locais

- `scripts/session-durability-regression-check.mjs`: **33 cenários**, executando o núcleo e os módulos reais em VMs novas com armazenamento compartilhado. Mantém os 18 casos anteriores e acrescenta exclusão sincronizada offline, criação cancelada, criação em voo com timeout, gravação lenta de outro ID, delete em voo, reinício depois de delete remoto com confirmação local interrompida, IndexedDB como alternativa, falha de armazenamento, permissão real negada, interrupção da passagem após falha de conexão, conta registrada offline, troca de conta, backup legado, confirmação antiga e uma nova confirmação aberta durante o retorno de outra operação. Nenhum registro vizinho é removido.
- A base anterior reprova o primeiro cenário novo: uma sessão confirmada não pode ser excluída offline com intenção durável. Reprodução diagnóstica: `node scripts/session-durability-regression-check.mjs --baseline 78a596dfa0ef203fa7b58df79370852ef036caeb` (a reprovação é esperada na base).
- `scripts/student-session-delete-browser-check.mjs`: cliques no HTML real e carregamento dos módulos ativos de fila, mutações e exclusão, em **390 × 844 e 1440 × 1000**. Confere cancelar/confirmar, recarregar todo o ambiente JS com arquivo legado antigo, reconectar, remover a última série, falha de armazenamento e retry. Também usa **duas páginas e IndexedDB real** com falha simulada de localStorage; depois de reabrir, ambos os pedidos continuam presentes. CSP mantida; HTTPS bloqueado; apenas dados fictícios no localhost.
- Asserções estáticas foram atualizadas para o novo local da escrita canônica e o contrato durável. Os casos anteriores de dieta, autorização, timestamp imutável, fila, histórico e ausência de polling foram mantidos. A suíte de qualidade passa a executar também o novo teste de cliques.
- 96 verificações estáticas/comportamentais e a checagem de segurança passaram. A suíte de navegador existente cobre também treino, login, contraste e atualização de instalações antigas. Resultados de CI devem ser conferidos no commit final do PR.

## Limites e preservação

Nenhuma conta, sessão, série ou arquivo de produção foi lido ou excluído durante o trabalho. Firestore 28, Storage 6 e SDK Firebase permanecem intactos. Somente a ação explícita do aluno cria um pedido para excluir aquele ID; outros registros e backups legados são preservados. Os marcadores locais são mantidos para evitar retorno de cópias antigas; não houve limpeza automática desses marcadores.

Confirmação remota continua dependendo de rede, sessão autenticada e autorização de aluno ativo. Se a autorização for negada, o pedido permanece pendente e diagnosticável. Os testes automatizados usam adaptadores determinísticos para Firestore; a operação real em contas de teste, interrupção do processo pelo sistema no Android/iOS e Safari físico ainda exigem verificação manual. Não se afirma eliminação de todas as possíveis falhas de conectividade. Sem merge ou publicação por este trabalho.

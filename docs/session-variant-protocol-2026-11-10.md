# Escolha do exercício realizado e edição de protocolo — 10/11/2026

Base: `d9f98e6b81ca39ef4d02f44383afd0900b0971a7` (main após PR #235). Entrega: versão 10.10.9, build **2026111002**, revisão `session-variant-protocol-1`.

## Falhas reproduzidas

1. Um exercício legado chamado **Supino Reto**, igual ao nome do grupo, não era associado ao grupo: a busca só considerava o identificador do grupo ou o nome exato de um item. Um vínculo antigo do grupo também impedia a busca pelo identificador estável do item.
2. O campo de alternativas esperava a consulta terminar antes de aparecer, mesmo com o catálogo disponível no aparelho. A primeira alternativa da lista podia ser pré-selecionada no lugar do exercício prescrito.
3. A edição de um registro cuja alternativa saiu do catálogo podia substituir o nome/identificador histórico pela preferência atual. Uma resposta atrasada do catálogo também podia substituir a escolha exibida.
4. Renomear/recolorir um protocolo lia o cronograma administrativo e outros protocolos antes de gravar. Falha do cronograma ou remoção de outro treino após carregar a lista impedia uma alteração independente nesses metadados.
5. Depois da escrita confirmada, o botão Salvar continuava bloqueado aguardando a recarga do perfil. Uma falha dessa recarga podia ser apresentada como falha de salvamento. Ao permitir a próxima edição, também foi necessário impedir que o retorno anterior liberasse a operação nova ou reaplicasse seu nome antigo.

## Comportamento corrigido

- O grupo é resolvido pelo vínculo existente, identificador do item, nome exato do grupo ou nome exato do exercício. Não há aproximação por palavras nem escolha de outro grupo sem correspondência.
- O campo **Exercício realizado** aparece imediatamente com as opções em memória/cache e mantém uma opção explícita para o exercício prescrito. A consulta posterior não troca a escolha, a carga, as repetições ou a semana preenchida.
- A alternativa realizada é gravada nos campos próprios da sessão. O exercício da prescrição continua com o mesmo nome e identificador. Preferências continuam isoladas por conta/exercício e limitadas ao grupo encontrado.
- Ao editar registros antigos, a alternativa realizada continua disponível mesmo após sua remoção do catálogo. Respostas de outro modal/conta são descartadas. Se nenhum grupo puder ser identificado, o campo informa que não há alternativa vinculada; não inventa uma equivalência.
- Uma edição sem mudança da data inicial verifica no servidor a existência/propriedade do protocolo e a conta autenticada e altera somente esse documento. Novo protocolo, ativação ou mudança da data inicial mantêm a transação atômica com o ciclo administrativo.
- A confirmação da gravação libera a ação antes da recarga do perfil. Cada execução libera sua própria trava uma única vez; uma recarga anterior não reaplica seu nome após uma edição posterior. A recarga falhar depois da confirmação mantém o salvamento confirmado.

## Arquivos

- `app_v10_10_9_core.js`: resolução do grupo, preferência, campo de exercício realizado, preservação do histórico, cancelamento de resposta antiga, transação de metadados e ciclo de vida do botão Salvar.
- `index.html`: rótulos do campo e referência do core entregue.
- `sw.js`, `sw_47.js`, `update_v10_10_9.js`, `version.json`: build e URL do core alinhados; workers idênticos. O loader não sofreu alteração nesta etapa.
- `scripts/session-variant-protocol-check.mjs`: oito cenários com funções reais e dados fictícios, incluindo propriedade, troca de conta e atomicidade da alteração de início.
- `scripts/session-variant-protocol-browser-check.mjs`: HTML/CSS, funções reais e módulo real de registros duráveis; dez combinações de 320/390/430/768/1440 px × claro/escuro. Transporte do catálogo/Firestore é simulado, e HTTPS é bloqueado.
- `scripts/workout-rename-save-check.mjs`, `scripts/student-session-delete-browser-check.mjs`: fixtures incluem o elemento do modal e o contador de carregamento existentes na aplicação; mantêm as asserções anteriores.
- `scripts/runtime-delivery-coherence-check.mjs`: exige também a mesma URL do loader em HTML, atualizador e cache.
- `.github/workflows/quality.yml`, `.github/workflows/security.yml`: executam a nova cobertura nas regressões correspondentes.

## Evidência e limites

O diagnóstico `node scripts/session-variant-protocol-check.mjs --baseline d9f98e6` reproduz **seis falhas e dois casos de proteção aprovados** na versão anterior. Após a correção, os oito cenários passam. O navegador na mesma base reprova porque o campo permanece oculto enquanto aguarda a rede. Também foi reproduzida, antes de corrigir, a trava ativa mesmo após confirmação do protocolo quando a recarga do perfil fica pendente.

Validação local: **103 scripts de código/comportamento**, **14 suítes no navegador** e **7 testes de inicialização** aprovados; checagem de segurança aprovada com Rules 28/Storage 6 preservadas. O teste novo foi repetido após a proteção adicional contra remoção tardia de item no catálogo.

O navegador verifica a gravação efetiva da alternativa no módulo de fila durável do aluno, carga/repetições/semana, prescrição e histórico preservados, edição com alternativa removida, troca de conta e catálogo atrasado, além dos cliques reais no botão do protocolo e duas edições sobrepostas. Os resultados da suíte geral e da CI no commit exato ficam no PR.

Não houve acesso à conta real de aluno, alteração de treinos/dietas/registros de produção, mudança de regras ou versão do SDK Firebase. Não há deploy nem merge neste trabalho. Permanecem manuais a confirmação nos aparelhos afetados, Safari/PWA iOS e gravação no Firestore real sob rede móvel instável. Exercícios sem vínculo e sem correspondência exata de grupo/item precisam da identificação correta pelo treinador; a correção não inventa substituições.

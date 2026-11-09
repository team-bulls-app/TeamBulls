# Organização de alunos e catálogos — 09/11/2026

## Comportamento proposto

- O treinador usa as setas para ordenar grupos e exercícios dentro das substituições e as técnicas da biblioteca. Alunos recebem a ordem salva, sem controles de edição. A busca não muda o índice usado pelas setas. Uma edição concorrente é recusada antes de sobrescrever textos, vídeos ou metadados.
- O treinador vê **Nome cadastrado (apelido)**. O aluno vê somente o apelido. Novos cadastros preservam `registeredName` desde a inscrição; editar o apelido não escreve mais em `users.name`. Apelidos pendentes no aparelho usam o novo fluxo ao reconectar, sem substituir o cadastro.
- Para nomes que já foram sobrescritos por versões anteriores, não há como inferir o original com segurança. O treinador pode usar **CORRIGIR NOME CADASTRADO** no perfil. O apelido é preservado; o treinador também mantém a ação de remover o apelido.
- A lista principal pode ser reordenada pelo treinador. Preferências são privadas, salvas na nuvem e relidas em outra sessão/aparelho. Movimentos usam identificador de operação para não aplicar a mesma seta duas vezes quando a confirmação se perde.
- **REMOVER** arquiva o perfil e bloqueia o acesso online usando o estado inativo já existente. Histórico, dieta, treinos e pagamentos são preservados. A seção **ALUNOS ARQUIVADOS** permite consultar o perfil e **RESTAURAR ACESSO**.
- **EXCLUIR DEFINITIVAMENTE** fica na área de arquivados. Exige e-mail exato do aluno, texto `EXCLUIR` e nova confirmação da senha do treinador. A operação não tem desfazer.

## Segurança e escopo

As regras Firestore 28 e Storage 6 continuam byte a byte equivalentes após normalizar quebras de linha. Não foi criada permissão pública para alterar nomes cadastrados, preferências ou flags de arquivamento. Os novos campos privilegiados são gravados pelo serviço autenticado. A lista canônica de arquivados e a ordem ficam em um documento privado do treinador, inacessível ao cliente pelas regras atuais; a interface não confia em flags extras eventualmente fornecidas na inscrição do aluno.

O callable `studentAdministration`, na região `southamerica-east1`, valida App Check, revogação do token, papel atual do ator e vínculo do aluno. `preferences`, `move`, `registeredName`, `archive`, `restore` e `delete` exigem treinador; `nickname` permite ao aluno ativo alterar somente o próprio apelido e ao treinador vinculado removê-lo. A origem web é limitada ao domínio do app. O protocolo segue a [especificação oficial de callables](https://firebase.google.com/docs/functions/callable-reference) e a configuração de [App Check para Functions](https://firebase.google.com/docs/app-check/cloud-functions).

Na exclusão definitiva, o servidor primeiro bloqueia o aluno e substitui temporariamente o vínculo por um identificador de exclusão. Isso faz as regras atuais recusarem novas gravações de planos/séries por outras janelas enquanto o serviço limpa os dados. O aluno deixa de poder ser restaurado assim que a exclusão começa. Falhas parciais ficam identificadas em **Alunos arquivados** e podem ser retomadas; uma confirmação de sucesso só ocorre depois da limpeza e da exclusão de Auth.

A limpeza abrange planos, exercícios/séries (incluindo vínculos legados por treino), refeições, conclusões, fotos/miniaturas/originais, registros de refeições livres, relatórios, feedbacks, notificações, versões/templates vinculados, convites usados, pagamentos/comprovantes, eventos administrativos e tokens de aviso. Identificadores e prefixos são limitados ao aluno escolhido; vínculos divergentes interrompem o trabalho, preservando registros de outros alunos/treinadores. O comprovante operacional final não guarda nome, e-mail nem UID do aluno.

O escopo da exclusão é a conta e os dados geridos pelo app na nuvem. Downloads/exportações, cópias previamente guardadas em dispositivos desconectados e backups externos não podem ser apagados remotamente por este fluxo. Os dados de outros alunos, catálogos globais e arquivos gerais do treinador são preservados.

## Publicação necessária

**Nada foi publicado no Firebase e nenhum cadastro real foi arquivado ou apagado neste trabalho.** O PR prepara código e testes. Os novos controles de alunos e a gravação de apelidos exigem publicar o serviço antes de publicar o cliente atualizado. As ordenações dos catálogos usam o fluxo Firestore já existente.

Após revisão e aprovação, o responsável pelo projeto pode publicar somente a nova função:

```powershell
npm ci --prefix functions --ignore-scripts
firebase deploy --config firebase.push.json --only functions:studentAdministration --project teamms-app
```

É necessário um ambiente Firebase com Functions habilitado e permissões do service account para Firestore, Storage e administração de Auth. A função existente `notifyNewFeedback` é mantida; o comando acima não a republica. Não é preciso alterar as regras Firebase. Após publicar a função, conferir o fluxo em uma conta de teste isolada antes de disponibilizar a atualização do app. Com serviço indisponível, a lista e o histórico continuam acessíveis, e as ações novas não anunciam um salvamento falso. A leitura da organização espera no máximo um segundo antes de liberar a lista; a resposta completa atualiza a tela em segundo plano. Validação de identidade, conexão e reautenticação têm prazos limitados, sem reiniciar o SDK ou fazer polling.

## Arquivos principais

- `app_v10_10_9_core.js`: setas e gravação com detecção de conflitos dos catálogos; cache do nome cadastrado e apelido.
- `modules/trainer-student-administration-v10_10_71.js`: lista principal/arquivados, ordenação, restauração, correção do cadastro e confirmação de exclusão.
- `modules/student-home-profile-v10_10_12.js`, `modules/v107-invites.js` e listas do treinador: nome cadastrado separado do apelido, inclusive novas inscrições e sincronização offline.
- `functions/student-administration.js`, `functions/student-administration-trigger.js`, `functions/index.js`: operações privilegiadas autenticadas, verificação de vínculo e exclusão retomável.
- `config_v10_7.js`, `index.html`, `styles_v10_10_9.css`, `sw.js`, `sw_47.js`, `update_v10_10_9.js`, `version.json` e loaders associados: entrega coerente no build `2026110902`, origem do serviço explicitamente permitida e controles responsivos.
- `scripts/catalog-order-check.mjs`, `scripts/student-administration-*-check.mjs`, `scripts/protocol-cycle-search-browser-check.mjs` e workflows: cobertura nova e garantias anteriores preservadas.

## Validação local

- A matriz geral aprovou 101 checagens de código/comportamento, 12 rotinas de navegador e sete testes de inicialização. Os cenários específicos foram repetidos após as correções finais; o resultado de CI do commit final fica registrado no PR.
- 15 cenários de ordenação de catálogos: persistência/reabertura, falhas, concorrência, preservação de vídeos/metadados, padrões, limites, trava compartilhada, troca de conta e negação ao aluno.
- 16 cenários do serviço: nome/apelido, vínculo de treinador, arquivamento/restauração sem perda de histórico, ordenação idempotente, App Check/autenticação, login recente, confirmação exata, limpeza restrita ao alvo e retomada de exclusão interrompida.
- Contrato de segurança fixa os hashes das regras atuais e exige transporte autenticado, rejeição de tokens revogados, origem restrita e entrega coerente. A camada de segurança deve carregar antes da administração e esta antes do editor de apelido.
- Teste com os SDKs Firebase já fixados no lockfile: registro do callable e do trigger de feedback, limites de recursos e rejeição de identidade inválida antes de acessar dados. Usa projeto `demo-*` e endpoints locais fechados; não usa credenciais de produção.
- Navegador com HTML/CSS e módulos reais de segurança, administração e perfil; serviço e contas fictícios. Oito combinações de 320/390/768/1440 px, claro/escuro: apelido offline e sincronização, nome preservado, correção pelo treinador, setas e confirmação perdida, arquivar/restaurar, confirmação destrutiva, limpeza da senha, falha/retomada de exclusão e resposta atrasada após trocar de treinador. Também exige que o editor desapareça ao fechar e que os controles/status da lista ocupem a largura correta no desktop.

Permanecem pendentes: publicação autorizada da função, conferência de permissões/IAM e App Check no ambiente de homologação, ensaio com os serviços Firebase reais em projeto de teste e validação em Android/iPhone físicos. Os adaptadores determinísticos e o teste de binding do SDK não substituem esses ensaios. O ensaio de atualização inclui todos os endpoints históricos e preservação de dados locais; o encerramento do Chrome espera a liberação de arquivos temporários no Windows, sem tocar no perfil do navegador do usuário. O Java disponível localmente não atende à execução atual do Emulator Suite; nenhuma chamada destrutiva foi feita contra produção.

## Dependências do serviço

A auditoria inicial das dependências existentes encontrou oito avisos (um alto e sete moderados), incluindo os avisos de [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw), [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) e [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).

O lockfile recebeu correções transitivas compatíveis. `firebase-admin` permanece em **14.5.0**, `firebase-functions` em **7.4.0** e o SDK web em **13.1.0**. A cadeia antiga de `rimraf` não aparecia nas chamadas de produção dos consumidores instalados; um override restrito para **6.1.4**, compatível com Node 22, removeu essa cadeia vulnerável. O binding dos SDKs foi repetido com a árvore final. A auditoria final retornou **zero avisos** e o workflow de segurança passa a exigir auditoria sem avisos moderados ou superiores.

# Ciclo administrativo e substituições — 09/11/2026

O início exato do ciclo administrativo passa a vir da data informada no treino ativo. A próxima revisão mantém o intervalo configurado, com padrão de quatro semanas (28 dias), sem substituir esse intervalo por um mês de calendário.

Exemplo: novo treino com início em 09/11/2026 e revisão a cada quatro semanas mostra início em 09/11 e próxima atualização em 07/12. A data de atualização prevista da prescrição continua sendo a que o treinador informou.

## Comportamento

- Criar ou ativar um protocolo e alterar o início do protocolo ativo atualizam o ciclo administrativo automaticamente.
- Treino e agenda são gravados na mesma transação. Falhas mantêm o editor aberto; uma nova tentativa usa o mesmo identificador e preserva dias já existentes após uma confirmação perdida.
- O campo administrativo de início é somente leitura. Alterar o intervalo relê o início do treino no servidor, sem confiar no valor exibido no formulário.
- Renomear ou editar exercícios, reordenar protocolos e editar um treino inativo não reiniciam o ciclo vigente.
- Ao abrir o perfil como treinador, agendas antigas são vinculadas ao treino ativo. Vincular uma agenda que já tem a mesma data preserva a conclusão anterior; mudar protocolo ou início reinicia os marcadores do ciclo. Relatórios respondidos e histórico permanecem intactos.
- A preparação do questionário mensal ocorre depois da confirmação da agenda. Se falhar, o ciclo continua salvo e a preparação pode ser repetida ao abrir o perfil ou reconectar.
- Confirmações mensais antigas são recusadas tanto no perfil quanto na agenda do treinador se o protocolo, início, intervalo ou conclusão já mudou.
- Datas das prescrições de treino e dieta não são reescritas ao salvar ou concluir a revisão administrativa. O calendário semanal permanece independente.
- A busca nas substituições aceita nome do exercício ou do grupo, maiúsculas e acentos. Mantém foco, ordem original, contagem de resultados, limpeza e estado sem resultados.
- Exercícios prescritos no treino ativo aparecem em negrito com a indicação “NO TREINO ATIVO”; seus grupos recebem destaque. Identificadores do catálogo têm prioridade; prescrições antigas usam correspondência exata de nome. Protocolos inativos não geram destaque.

## Arquivos principais

- `app_v10_10_9_core.js`: transações, vínculo, leitura da agenda, conclusão protegida e pesquisa/destaques.
- `index.html`, `styles_v10_10_9.css`: campo de início vinculado, busca acessível e contraste nos dois temas.
- `modules/trainer-update-organizer-v10_10_41.js`, `modules/usability-checkup-v10_10_9.js`: agenda usa a conclusão protegida e loader exige a revisão `10.10.41-updateorganizer2`.
- `version.json`, `sw.js`, `sw_47.js`, `update_v10_10_9.js`: build `2026110901`, referências coerentes do código e CSS atualizados.

## Validação

- `scripts/protocol-cycle-search-check.mjs`: 25 cenários com funções reais e adaptadores de armazenamento determinísticos. Inclui atomicidade, repetição, conflito com outra criação, origem excluída, escopo do aluno, troca de conta, datas futuras/bissextas, preservação de histórico e confirmações mensais antigas.
- `scripts/protocol-cycle-search-browser-check.mjs`: oito combinações de tela (320, 390, 768 e 1440 px, temas claro e escuro), HTML/CSS e controladores reais; botão de salvar, falha antes da gravação, perda da confirmação após gravar, repetição sem apagar dias, busca/foco/negrito, limpeza, texto seguro e conclusão mensal pela agenda real.
- Checagens existentes de renomeação, questionários mensais, agenda, qualidade e entrega atualizadas para exigir o comportamento final, sem remover garantias anteriores.
- Verificação geral local: 97 checagens de código/comportamento, 11 rotinas de navegador e sete testes de inicialização do navegador aprovados. Os testes específicos foram repetidos após os últimos ajustes.

Os dados de teste são fictícios e locais. Nenhuma conta real, treino, dieta, pagamento ou regra do Firebase foi modificado durante a execução dos testes. Permanecem pendentes a conferência em Android/iPhone físicos e a confirmação de atualização de uma instalação antiga após publicação. O PR não é mesclado nem publicado por este trabalho.

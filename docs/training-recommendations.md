# Orientações de frequência do protocolo

O quadro “Frequência e dias recomendados” aparece na pasta principal do protocolo. O treinador pode editar uma sequência livre de até 800 caracteres e selecionar dias opcionais da semana. O aluno vê as orientações em modo de leitura. Nenhuma pasta, ordem de exercício ou calendário das 8 semanas é alterado.

Exemplo incluído no editor: “Treine 2 dias e descanse 1; treine os outros 2 dias, descanse 2 dias e repita.” Sem semana fixa, o treinador deixa os dias desmarcados. Texto vazio e nenhum dia removem a orientação da visualização do aluno.

Persistência no campo `trainingRecommendations` do documento de treino existente. A transação confere o proprietário, o treinador e o contexto antes de alterar apenas esse campo. O rascunho permanece disponível quando há falha. Navegação, cancelamento ou troca de aluno/protocolo invalidam o contexto. As regras existentes de workouts já permitem edição somente pelo treinador vinculado; nenhuma regra Firebase foi modificada.

Testes cobrem normalização, dias, texto livre, leitura pelo aluno, propriedade, troca de contexto durante a transação, falha/retry, escrita mínima e fechamento de modais na inicialização síncrona de convidado. Chrome: 8 combinações de tema e largura (320, 390, 768, 1440), persistência simulada e conservação das quatro pastas. Conta real e dispositivos físicos ficam para validação manual.

Build 2026110502, com revisão do núcleo/CSS alinhada no HTML, preload, atualizador e workers.

# Ciclo de treino e calendário (v10.10.70)

## Conclusão e avanço do ciclo

- O aluno confirma cada pasta de treino pelo botão **Concluir treino**.
- A semana atual avança quando todas as pastas do protocolo foram confirmadas naquela semana. A mudança de data, sozinha, não altera a semana.
- Na primeira abertura, o app grava a semana que o protocolo já apresentava antes desta alteração. Isso preserva o ponto de partida dos alunos atuais; depois dessa gravação, o avanço depende das confirmações.
- Cada confirmação fica em `workoutCompletions`, identificada por aluno, treino, início do protocolo, semana e pasta. O ponto de partida do ciclo fica em `workoutCycleStates`.
- Sem rede, o aluno ativo continua vendo a confirmação salva no aparelho com estado pendente. A sincronização tenta novamente quando a conexão retorna. O cartão do treino e o resumo de suporte mostram pendências e erros.

## Acesso no Firestore

As regras em `firebase/firestore_28_compacto.rules` permitem criar os dois tipos de documento somente ao aluno ativo autenticado. O aluno só lê seus registros; o treinador lê os registros de alunos vinculados. Os documentos são imutáveis após a criação. O conteúdo de `workouts` continua editável apenas pelo treinador.

Antes de publicar o frontend, publique as regras Firestore e os índices compostos correspondentes; sem as regras, o app mantém as confirmações localmente e reporta falha de sincronização. Os índices evitam que o calendário e o progresso precisem baixar todo o histórico para montar a tela.

## Grupos e orientações por dia

Cada pasta aceita grupos musculares de uma lista controlada, além de frequência e descanso opcionais. Os valores são normalizados no cliente, limitados em tamanho e escapados ao exibir. Renomear uma pasta preserva os campos e o histórico já associado.

## Eventos do calendário

O calendário agrega sessões de treino, confirmações explícitas e registros de alimentação. Para alimentação, inclui refeições concluídas (exceto escolhas de substituição) e refeições livres. O treinador chega ao calendário a partir do arquivo de um aluno; as consultas e as regras continuam limitadas à conta vinculada.


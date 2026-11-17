# Revisão de estabilidade — 17/11/2026

Base examinada: main bebcc75bc137f478ec9e3da6d1e3a66af2829567.
Escopo: registros, estrutura de treinos dos dois perfis, recuperação de entrada,
sincronização manual, transporte de relatórios, entrega de módulos e cache.

## Falhas corrigidas

1. O registro consultava novamente a estrutura mutável no momento de salvar.
   Se ela fosse recarregada sem o exercício, o formulário emitia
   “exercício não encontrado”. A prescrição aberta agora possui um contexto
   próprio, sem copiar o histórico, vinculado à conta e aos IDs originais.
   O registro permanece histórico mesmo se o protocolo mudar; o app não recria
   exercícios nem transfere a carga para outro ID. A troca de conta bloqueia
   o contexto anterior. A regressão da cadeira flexora falha na base e passa
   com a correção, incluindo Back-off Set e o acesso offline da mesma conta.

2. Uma consulta de treinos confirmada e outra de exercícios em cache eram
   classificadas juntas como leitura do servidor. Isso permitia substituir
   protocolos completos por listas incompletas. Agora ambas precisam estar
   confirmadas. Aluno e treinador mantêm a estrutura conhecida durante uma
   leitura parcial, mas continuam aplicando exclusões confirmadas pelo servidor.

3. Entradas simultâneas na tela inicial iniciavam consultas duplicadas.
   Elas passam a compartilhar uma operação por aluno enquanto a leitura está
   em andamento. O teste com 20 entradas simultâneas realiza duas consultas
   estruturais, uma por coleção, e uma única hidratação posterior do histórico.
   Um aparelho explicitamente offline não inicia essas consultas ao servidor.

4. O botão de sincronização podia anunciar sucesso e atualizar a data da
   última sincronização mesmo quando a leitura retornava false. O resultado
   agora é propagado pelos wrappers do perfil do treinador e conferido nos
   dois perfis antes de confirmar a sincronização.

5. Uma falha transitória rápida na leitura REST de relatórios interrompia
   a confirmação do período. Há uma única nova tentativa para leituras
   elegíveis que falham em até 1,5 s. Commits não são repetidos por essa camada.
   Falhas de autorização, troca de conta, aparelho offline e esperas longas
   não geram repetição. A confirmação de entregas incertas mantém o fluxo
   canônico existente e seus IDs idempotentes.

## Cobertura e limites

A revisão utiliza dados sintéticos e os módulos reais. Inclui fila durável,
reabertura, quota de armazenamento, troca de conta, resposta tardia, remoções
confirmadas, formulário prescrito com Back-off Set, variantes, relatórios,
entrada, ações dos botões e atualização da instalação.

As versões do bootstrap, loaders mutáveis, APIs registradas, atualizador e
Service Workers devem permanecer coerentes. Os números de revisão mudam somente
nos componentes alterados ou nos loaders que precisam entregá-los.

Nenhum documento de aluno, regra do Firebase, política de segurança ou versão do
SDK Firebase foi alterado. Não houve deploy nem merge. A disponibilidade real
do provedor, as configurações publicadas e os aparelhos dos alunos não são
substituídos por testes locais. Depois da publicação, conferir em Android/iPhone
a cadeira flexora, perda/retorno de conexão, reabertura e envio com seis fotos.

Resultados finais dos testes e commit estão registrados no PR.

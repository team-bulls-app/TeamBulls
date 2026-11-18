# Revisão da montagem da dieta — 18/11/2026

Base: `ddd600dfe7732e04720120fd894dae004096610a` (main, após PR #254).
Build da correção: `2026111801`.

Foram examinados os atalhos de porções, alimentos personalizados, cálculo ao
vivo, edição e navegação entre refeições, cópia entre divisões, instruções,
cálculo privado, seleção pelo aluno e entrega pelo atualizador/cache.

## Correções

| Falha reproduzida | Correção |
| --- | --- |
| A tentativa de trocar “Carbo” alterava itens congelados, gerando erro e interrompendo o ajuste visual. | “Carboidrato” passou a ser o nome canônico na tabela, pesquisa, cópia e inclusão. Aliases invisíveis mantêm as dietas antigas e os mesmos macros. |
| Uma falha na leitura das instruções era interpretada como dieta inexistente; o salvamento podia enviar listas vazias de planos e refeições. | A transação consulta o documento confirmado e altera apenas as instruções. Só inicializa listas quando o documento realmente não existe. |
| Falha de leitura ou edição em outro aparelho podia fazer um alimento novo substituir o catálogo inteiro por uma lista desatualizada. | Cada alteração é aplicada sobre o catálogo lido dentro da transação, preservando os demais alimentos e campos do documento. |
| Um catálogo antigo podia reaparecer depois da troca de conta ou depois de um salvamento mais recente. | Cache e formulários são vinculados ao treinador; respostas antigas são descartadas. Trocas de aluno/conta durante a confirmação das instruções também bloqueiam o salvamento anterior. |
| Excluir o último alimento personalizado deixava seus macros no registro de cálculos. | O registro recebe também o catálogo vazio confirmado, por uma API própria, sem depender da existência de linhas na tabela visual. |
| Nomes iguais aos de porções ou de outro alimento podiam tornar o cálculo ambíguo. | Novos cadastros/edições com nomes conflitantes são recusados. Itens já persistidos não são apagados nem renomeados automaticamente. |
| IDs antigos contendo aspas quebravam ações embutidas na tabela. | Os identificadores são serializados como dados antes da codificação para HTML. |
| Títulos e células herdavam texto escuro sobre o painel escuro no tema claro. | Cores de texto explícitas e restritas ao editor/tabela preservam a leitura nos dois temas. |

Cliques repetidos são bloqueados enquanto a gravação correspondente estiver
em andamento. Falhas mantêm os campos para nova tentativa. O cálculo continua
usando as 32 porções e os valores de referência existentes; não houve alteração
das fórmulas nutricionais ou migração de dietas já salvas.

## Validação

- `scripts/diet-builder-audit-check.mjs`: 13 cenários com os módulos reais,
  incluindo falhas de leitura/gravação, repetição de transação, cliques
  concorrentes, troca de conta e compatibilidade antiga.
- A execução desses testes contra a base reproduz as falhas anteriores.
- `scripts/diet-builder-browser-check.mjs`: busca, botões, totais automáticos,
  criação/exclusão, IDs antigos e contraste em 320, 390 e 1440 px, nos dois temas.
- Ambas as baterias fazem parte da verificação de qualidade do PR. Os resultados
  das demais regressões e do GitHub estão registrados na descrição do PR.

## Limites e melhorias seguintes

As verificações usam dados fictícios. É necessário conferir, depois da
publicação, a montagem em Android/iPhone reais e com as regras/configuração
efetivamente publicadas. As regras atuais já permitem as operações utilizadas;
nenhum arquivo de regras, dado de aluno ou serviço de produção foi alterado.

O salvamento do conjunto de planos ainda usa a representação aberta no editor.
Uma melhoria adicional é detectar e apresentar conflitos quando a mesma dieta
é editada simultaneamente em dois aparelhos, antes de substituir esse conjunto.
As transações deste PR protegem o catálogo e as instruções, sem mudar esse
contrato global de edição.

Linhas livres sem referência continuam sinalizadas como não contabilizadas.
Uma evolução útil é armazenar porções/quantidades de forma estruturada, mantendo
o texto livre como orientação; isso reduziria ambiguidades sem tentar adivinhar
o valor nutricional do que foi digitado.

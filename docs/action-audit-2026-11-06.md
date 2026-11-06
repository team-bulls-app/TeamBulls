# Auditoria de ações e resultados

Base: 7d7e0e93d9c0cffaa73a41c29bf635251b962af6. Foram inventariados 352 handlers estáticos de clique/mudança/envio no HTML, com 194 nomes de funções chamados (incluindo setTimeout do navegador). As referências foram confrontadas com o núcleo e os módulos. Nenhuma ausência de definição textual foi encontrada nesse inventário. Isso não verifica a exportação global de cada controlador; a existência de uma função não comprova seu resultado. Os fluxos abaixo receberam testes comportamentais adicionais.

## Falhas reproduzidas e corrigidas

| Ação | Falha | Resultado corrigido |
| --- | --- | --- |
| Abrir fotos rapidamente | O carregamento de A podia terminar após B e substituir imagem/metadados/download. A implementação ativa fica no módulo de qualidade, com outra camada de miniatura. | As três camadas conferem pedido, usuário, galeria e navegação. A miniatura não substitui um original já carregado. |
| Fechar foto durante o carregamento | A resposta tardia podia reabrir o visualizador fechado. | Fechamento invalida o pedido e limpa a imagem. |
| Comparar fotos | A galeria vem da mais recente para a mais antiga; os padrões de “antes/depois” começavam invertidos. Respostas podiam reaparecer após fechar ou mudar a seleção. | Padrão mais antiga → mais recente; validação da seleção/contexto e invalidação ao fechar. |
| Salvar, excluir, ocultar ou ordenar orientações/técnicas | Dez ações mutavam a biblioteca; persistGeneralInstructions/persistTechniqueCatalog também gravavam o cache antes da resposta. Falha deixava a alteração local e podia fechar a confirmação de exclusão. | Edição em cópia, escrita confirmada antes de aplicar/cachear, trava compartilhada por biblioteca, confirmação permanece aberta em falha e tentativa de criação mantém o mesmo ID. Respostas de outra sessão não atualizam o editor. |
| Setas de ordem do cardio | Falha de escrita deixava a ordem alterada na memória; no modo local o plano também podia ficar alterado. | Restauração da ordem e da cópia local, com proteção contra resposta de outro contexto. |

## Evidência e cobertura

- `action-outcomes-check.mjs`: dez ações de catálogo, cada uma com falha/estado e cache preservados, sucesso e bloqueio de aluno; criação e retry com ID estável; trava compartilhada, troca de sessão e ordem de cardio. O modo `--baseline 7d7e0e93d9c0cffaa73a41c29bf635251b962af6` reprova o código anterior já no salvar pasta sem conexão.
- `action-outcomes-browser-check.mjs`: cliques no HTML real e carregamento dos dois módulos reais de fotos, em 390 e 1440 px. Atrasos controlados em imagem/miniatura, download correspondente à imagem exibida, fechamento, comparação, gravação com falha/retry, exclusão confirmada e técnicas. Mantém a CSP do HTML e serve o teste por script local permitido; nenhum SDK ou dado de produção é usado.
- A suíte existente continua cobrindo os demais fluxos de treino, relatórios, pagamentos, cache, segurança, login e atualização. Nem toda cobertura existente é teste por clique.

Entrega: build 2026110602, com núcleo, módulos de foto, configuração e referências do atualizador/workers alinhados. Dados e regras Firebase de produção preservados. Operações dos catálogos continuam usando o esquema existente de documento compartilhado; conflitos entre edições em aparelhos distintos exigem validação adicional. Conta real, pagamento/comprovante real, envio de fotos/relatórios e Safari/aparelhos físicos permanecem manuais. Esta auditoria não comprova ausência de bugs em todos os botões ou estados possíveis.

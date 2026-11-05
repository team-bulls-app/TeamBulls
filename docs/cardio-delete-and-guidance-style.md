# Exclusão de cardio e visual das orientações

Os cartões editáveis passam a oferecer EXCLUIR diretamente, além do acesso pelo editor. A confirmação mantém o editor e a prescrição até a gravação terminar. Alunos com plano profissional continuam sem controles de edição. O modo local com permissão recebe os mesmos controles.

A exclusão captura aluno/sessão, verifica novamente antes e depois da leitura transacional e altera somente o mapa de cardio e seus metadados de atualização no documento mealPlans. Usa o estado remoto mais recente para preservar outras substituições. Dieta e campos adicionais permanecem. Aliases legados são convertidos para a forma canônica, e main:null tem precedência sobre primary/prescription para não ressuscitar um cardio principal removido. Nenhuma regra Firebase foi alterada.

Somente após confirmação de escrita são removidos o cronômetro do item e o cartão. Falhas mantêm item, seleção, timer e confirmação para nova tentativa. Escritas locais com falha restauram o plano local. Salvar, ordenar e excluir compartilham trava para evitar operações sobrepostas nessa tela.

O quadro de frequência usa bordas retas, faixa vermelha, título condensado dos protocolos, rótulos monoespaçados e contraste no tema claro. O conteúdo das orientações não muda.

Validação: cenários de cancelamento/confirmação, gravação malsucedida, retry, preservação do timer/dieta/metadados, concorrência com substituição adicionada remotamente, aluno diferente durante leitura, bloqueio para aluno profissional, rollback local e aliases legados. Chrome: 8 combinações de largura/tema, exclusão por clique, renderização imediata, seleção do próximo timer, reidratação e tipografia/bordas. Dados fictícios isolados; vínculo real e dispositivos físicos permanecem manuais.

Entrega: build 2026110503; núcleo/CSS com revisão alinhada no HTML, preload, atualizador e workers.

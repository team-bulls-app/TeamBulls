# Quadro de evolução do aluno

Acesso exclusivo do treinador no perfil do aluno, no protocolo, na pasta do dia, no exercício e no modal de edição. A consulta abre sobre o editor e preserva seu rascunho. Usa a consulta existente de sessões por aluno e suas regras de vínculo; nenhuma regra Firebase ou escrita de produção foi alterada.

Reúne registros da nuvem, arquivo preservado e árvore de protocolos, deduplicados pela identidade da sessão. Inclui sessões órfãs de exercícios/protocolos removidos. Executados com outro nome ou modo ficam em grupos separados. Os filtros por data são inclusivos. O resumo compara primeiro e último registro do período, não máximas históricas independentes; a linha mostra a maior carga em cada registro, em ordem cronológica. Cada registro expõe todas as séries, carga, repetições/tempo, alvo e GER quando registrados, semana e anotação.

Histórico detalhado é paginado em 50 registros sem truncar o conjunto usado no resumo. Cache e falha de atualização são identificados; nenhum dado local pode garantir registros que ainda não chegaram ao servidor. A unidade dos registros associados usa a técnica do exercício atual; registros órfãos sem unidade ficam como “registrado”, sem volume calculado. Técnicas alteradas retroativamente não permitem reconstruir com certeza a unidade histórica sem metadados que as versões antigas não salvaram. Percentuais com base zero são indisponíveis. Volume é soma carga × repetições, não uma medida isolada de qualidade ou esforço.

Respostas atrasadas são descartadas após troca de aluno/treinador ou fechamento do quadro. Textos são escapados. Chamadas diretas com perfil de aluno não consultam o histórico. A segurança de acesso continua nas regras existentes, além do bloqueio de interface.

Validação: testes de agregação, duplicação, órfãos, variantes, séries por tempo, percentual com base zero, filtros, paginação, escape de conteúdo e ciclo assíncrono. O teste Chrome usa dados fictícios, quatro larguras (320, 390, 768 e 1440), dois temas, contraste >=4,5:1, bloqueio de aluno e preservação do rascunho sob o quadro. Conferência de vínculo com conta real e Safari/aparelhos físicos permanece manual.

Entrega: build 2026110501; referências do núcleo e CSS alinhadas com preload, execução, atualizador e os dois workers. O recurso está no núcleo existente, sem novo módulo ou dependência remota.

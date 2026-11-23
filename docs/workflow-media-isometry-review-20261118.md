# Fluxos de prescrição, recuperação e isometria — build 2026111802

Implementação para revisão, sem merge, publicação ou alteração de dados de produção.

## Entregas

1. **Central de sincronização e rascunhos**, nas configurações: reúne as filas existentes de séries, exclusões, conclusões, alimentos, relatórios, comprovantes e resumos de alterações. Cada tentativa usa a identidade original. Relatórios incertos são consultados antes de permitir um novo envio pelo formulário canônico.
2. **Rascunhos vinculados à conta e ao aluno** para treino/dia/exercício/prescrição, série, dieta/divisão/refeição, relatórios com seis fotos, pagamento e feedback. Recuperação exige ação do usuário e conferência. Senhas não são capturadas. Arquivos ficam em IndexedDB como binários; o fallback de texto não guarda fotos nem vídeos. Falhas de armazenamento são mostradas, sem prometer recuperação que não ocorreu.
3. **Prévia como aluno**, sem trocar autenticação ou perfil e sem permitir iniciar/concluir treinos ou refeições. Mostra semanas, séries, técnicas, instruções, vídeos e alternativas da prescrição selecionada.
4. **Cadastro pelo rótulo**, na montagem da dieta: quantidade/unidade e macros da embalagem são convertidos pelas referências reais da tabela (atualmente P 15,7 g; C 28 g; G 8 g por porção). Mostra todos os macros secundários e encaminha para conferência no editor de alimentos personalizados ou diversos.
5. **Conferência antes de ativar** treino/dieta, com avisos e ligação para os editores. Refeições também são conferidas ao salvar. Avisos podem ser aceitos explicitamente: dias vazios podem fazer parte de uma montagem ainda em andamento. Os salvamentos de prescrições ativas continuam atualizando o aluno imediatamente, como no app existente; a conferência não cria uma publicação fictícia separada.
6. **Trabalho de hoje** no painel do treinador: relatórios para responder, revisão mensal pendente e treino próximo de completar oito semanas. Reutiliza os dados e o cache do painel, sem baixar todo o histórico de cada aluno.
7. **Resumo do que mudou**, revisável pelo treinador, enviado como feedback com identidade estável e conferência após resposta incerta. O comparativo usa a prescrição, excluindo registros feitos pelo aluno.
8. **Comparação de dois períodos** no quadro de evolução. Execução, modo e unidade permanecem separados; valores ausentes não viram progresso zero. Volume em kg·reps não é calculado para isometrias.
9. **Validação móvel na CI**, com Playwright 1.56.1 fixo e lockfile, Chromium em 360/412 px e WebKit em 390 px. Testa fonte ampliada, área visível reduzida, séries, arquivos, reabertura e substituição alimentar. Referência da ferramenta: [opções de emulação](https://playwright.dev/docs/test-use-options). Emulação não equivale a teste físico do teclado ou do sistema operacional.
10. **Copiar diagnóstico** junto das falhas, com versão e metadados de ação/etapa/horário/categoria. Não inclui respostas, senhas, e-mails, fotos, vídeos, comprovantes nem conteúdo dos formulários.

## Isometria por tempo

- IT, IS e técnicas personalizadas com “isometria” no nome usam segundos na semana correspondente.
- Cada série na tela de registro tem seu próprio cronômetro. Encerrar antes preenche o tempo efetivamente medido; completar o alvo usa as preferências existentes de som/vibração. Não há salvamento automático da sessão.
- Ao salvar durante uma contagem, ela é encerrada antes da leitura dos campos. A carga e os segundos são gravados juntos.
- `sets[].unit` registra `seconds` ou `reps`. Normalização, fila, backup, edição e histórico preservam a unidade. Séries cronometradas aceitam até 3.600 segundos; repetições continuam limitadas a 100. Registros antigos sem unidade não são regravados nem convertidos silenciosamente.
- Contagem usa relógio real, sem depender da quantidade de intervalos executados em segundo plano. O sistema operacional pode suspender som/vibração enquanto o app está fechado ou bloqueado.

## Desenhos e feedback em vídeo

- Ao ampliar uma foto autorizada do relatório, o treinador pode desenhar, colocar setas/texto, desfazer e exportar uma **cópia JPEG**. O original não é alterado. A cópia pode entrar no feedback aberto ou em um feedback separado.
- Gravação só inicia após toque e permissão de câmera/microfone. Há alternativa para selecionar MP4/WebM, prévia, limite de cinco minutos/60 MB e até seis anexos (um vídeo) por feedback. As faixas de câmera/microfone são interrompidas ao fechar, trocar de conta ou ocultar a página.
- Arquivos são enviados antes do documento de feedback. Caminhos imutáveis incluem treinador, aluno e ID do feedback. Uma resposta perdida reaproveita o arquivo confirmado e o mesmo feedback, sem substituir documentos nem apagar arquivos por timeout.
- O aluno abre os anexos sob demanda; vídeos não iniciam automaticamente. O histórico do treinador também abre os anexos publicados.

## Regras preparadas e limites operacionais

`firebase/storage_7.rules` preserva os domínios anteriores de Storage 6 e acrescenta somente `feedbackAttachments/{trainer}/{student}/{feedback}/{file}`. Escrita é do treinador vinculado; o aluno ativo só lê um caminho citado no feedback publicado para ele. Os ramos respeitam o limite de duas leituras de documentos nas regras Storage. Atualização do mesmo arquivo é negada. Firestore 28 permanece intacto.

`firebase.json` aponta para Storage 7 **para revisão**. Não houve deploy. Os anexos novos dependem da publicação dessas regras pelo responsável após revisão; os demais fluxos não precisam de nova regra Firestore.

Rascunhos podem ser recuperados por até 90 dias no mesmo navegador/instalação. Pendências de envio não expiram automaticamente antes da confirmação. Limpeza de dados do navegador, desinstalação, indisponibilidade/quota do armazenamento ou encerramento durante uma gravação ainda não concluída podem impedir recuperação; o app não substitui backup do aparelho.

## Validação manual antes da liberação

- Android S20 FE/S23 Ultra e iPhone instalado: registro com fonte ampliada e teclado aberto, encerramento antecipado e série de mais de 100 segundos.
- Som/vibração no primeiro uso, modo silencioso, app em segundo plano e tela bloqueada. Confirmar que preferências são respeitadas; não prometer alarme nativo persistente.
- Câmera/microfone reais, recusa/revogação de permissão, vídeo em MP4/WebM, orientação de tela e reprodução cruzada Android/iPhone.
- Após publicar Storage 7 em ambiente de teste: envio e leitura com duas contas de alunos/treinadores, aluno bloqueado, outro aluno, feedback ainda não publicado e caminho não relacionado. Não usar fotos ou contas de produção nos testes automatizados.
- Interrupção real da conexão após upload/commit e reabertura: confirmar que a Central verifica o envio original e que não há duplicatas.
- Edição simultânea do documento completo de dieta em dois aparelhos continua sujeita a conflito do modelo legado; esta entrega não introduz controle de versão transacional para todo o documento.

# Enquadramento da arte de pedra no login mobile

A imagem original 1672 × 941 é reutilizada sem editar os pixels. A janela decorativa tem proporção 9:16, exibe a faixa x=0..740 da fonte e ajusta sua escala uniformemente. Essa faixa contém os dois personagens; a altura inteira da fonte cabe no quadro. O preto completa a composição vertical. Não há uma imagem gerada ou personagens redesenhados.

A largura do quadro é limitada ao espaço disponível e a 56,25% da altura pequena da viewport (svh; vh como fallback). Assim, o recorte não aumenta com a altura do formulário ou com o número de contas salvas. O teclado altera o espaço do formulário sem redimensionar o quadro em navegadores com svh. O elemento decorativo é aria-hidden e não recebe eventos de toque.

A regra mobile também atende dispositivos com ponteiro coarse em paisagem, acima de 899 px. As regras de duas colunas do login desktop agora exigem hover e ponteiro fino, como já exigia a arte desktop. Formulário, fonte dos campos, rolagem e estilos de vidro leve são preservados.

Entrega: build 2026110302; CSS com mobileart=stone1 no HTML, preload, atualizador e workers. O PNG já usado no desktop está no cache e na preparação de ativação do worker; o preload mobile usa a mesma URL. A arte mobile anterior permanece disponível como arquivo para documentos antigos, mas deixa de ser pré-carregada pelo shell novo.

Validação: 38 cenários Chrome em dois temas, larguras 320–1440 px, telas 9:16 e alongadas, paisagem e tablet; cadastro, recuperação, erro e listas de contas. O teste verifica carregamento e dimensões da fonte, quadro 9:16, proporção e limites do recorte, uma coluna em telas de toque, ausência de corte horizontal de controles e preservação do desktop. A redução simulada da visualViewport com foco na senha confirma a escala estável do quadro com o teclado aberto.

Limite: testes em Chrome isolado, sem Firebase ou conta real. Conferência visual em Safari/iPhone e Android físicos segue recomendada após publicação; não é garantia sobre todo aparelho existente. Nenhuma alteração em dados, autenticação ou regras Firebase.

Verificações locais: 93/93 comandos do workflow de qualidade aprovados. Após incluir a arte na ativação do worker, repetidos os checks de entrega, coerência e recuperação de instalações. Security-check e diff --check aprovados.

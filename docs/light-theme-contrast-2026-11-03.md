# Contraste do tema claro e fundo do login desktop

## Problemas confirmados

- Configurações, notificações e perfil do treinador tinham fundos escuros, mas herdavam a tinta escura do canvas claro. Títulos ficavam quase invisíveis.
- O módulo de dieta compacta injetava um gradiente parcialmente transparente com seletor por ID e `!important`, vencendo a regra clara existente.
- Metadados e estados lidos/sem plano tinham cores esmaecidas ou opacidade sobre todo o cartão.
- Brilho mínimo do canvas combinado com brilho máximo do texto podia reduzir o contraste para menos de 4,5:1.

## Correção

Cartões adicionais passam a compartilhar os tokens de superfície, texto, borda e estado dos painéis do tema claro. Configurações, avisos, dieta, cobranças, histórico, resumos e feedbacks recebem ajustes específicos. O texto sobre o canvas claro tem contraste limitado a pelo menos 4,5:1 contra a superfície clara mais escura. O comportamento padrão do helper para o tema escuro permanece com alvo branco.

O fundo de login desktop usa a nova imagem fornecida pelo usuário, `team-bulls-desktop-login-stone-v2.png`, copiada integralmente (sem edição). A regra continua limitada ao login, largura mínima de 900 px, ponteiro fino e hover. A imagem mobile permanece a mesma. O asset anterior permanece disponível para documentos antigos.

Build 2026110301, CSS e core com `contrast=light15`, referências iguais no HTML/preload, atualizador e nos dois workers. O novo fundo está no preload desktop e na preparação do cache. Nenhuma mudança em regras Firebase, autenticação ou dados.

## Verificação

- Novo teste de navegador usa o HTML real das configurações, as funções reais da paleta e CSS de oito módulos inserido depois da folha principal. Os demais cartões são fixtures isoladas com as estruturas atuais, sem executar Firebase.
- 36 combinações: larguras 360, 390, 768 e 1440 px; brilho do canvas 35/70/180 e do texto 45/100/180. 57 seletores de texto precisam atingir 4,5:1. Fundos com gradiente são rejeitados na matriz, para não calcular contraste ignorando a imagem. O fundo da orientação precisa ser opaco.
- O teste falha com o CSS anterior: `node scripts/light-theme-contrast-browser-check.mjs --baseline c172313`. Passa com a correção; menor contraste medido 4,514:1.
- O teste existente de login verifica dois temas, desktop/mobile, cadastro, recuperação, contas salvas e mensagens de erro. A referência esperada da imagem foi atualizada; as asserções de isolamento mobile e entrega do CSS permanecem.
- A referência exata do CSS no teste de login e a revisão de release foram atualizadas; nenhuma asserção foi removida ou relaxada.

Os testes usam Chrome isolado e bloqueiam HTTPS. Não comprovam todas as combinações de conteúdo real nem renderização em Safari/iPhone físico. Após publicação, conferir visualmente configurações, notificações, orientações da dieta e login desktop nos dois temas.

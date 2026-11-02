# Recuperação de instalações antigas — 2026-11-02

Base revisada: `ff6c9383750bf84aa3905083ae9d2f88d734032d` (main, PR #222).
Build da correção: **2026110202**, versão **10.10.9**.

## Evidências e causas verificadas

- Produção consultada somente por HTTP: `version.json`, `recuperar.html` e `sw_47.js` responderam 200; produção anunciava build 2026110201. Nenhuma conta ou banco de produção foi consultado.
- A revisão inicial cobriu `sw.js` e `sw_47.js`; instalações anteriores usam cache-first para HTML. O levantamento posterior do histórico completo encontrou outros caminhos removidos, documentados em `legacy-installation-endpoints-2026-11-02.md`.
- O atualizador aceitava o build solicitado na URL como atualização concluída, sem conferir o HTML/runtime realmente carregado. Um marcador persistido podia ocultar avisos enquanto o código continuava antigo.
- Falhas/travamentos na consulta do manifesto impediam registrar o worker. Uma tentativa offline podia manter a trava de verificação preenchida. Retomadas `pageshow` não disparavam consulta.
- A navegação dependia de `preloadResponse.catch`; sem essa API, retornava cache sem tentar a rede. Se a gravação do cache falhasse por quota, também descartava HTML novo que já havia chegado.
- A recuperação anterior removia caches e desregistrava o worker antes de confirmar uma cópia nova disponível.

## Correção

- Conferência do build do HTML e do código executado; marcadores antigos não ocultam uma versão superior.
- Registro/verificação do worker independente da consulta do manifesto; consulta com prazo, liberação da trava e resposta visível quando offline.
- Verificação no DOM pronto, `pageshow`, retorno ao primeiro plano e reconexão, com agendamento que evita duplicações.
- Entrega de HTML pela rede mesmo sem navigation preload ou sem espaço para gravar cache; fallback offline preservado.
- Página de recuperação prepara/confirma worker e HTML antes de abrir o app; não remove IndexedDB, localStorage ou registros de acesso.
- Configurações mostram build e oferecem um link de recuperação funcional mesmo sem o módulo do atualizador.
- Publicação coerente de build no HTML, manifesto de versão, atualizador e ambos os workers.

## Verificação

- Antes da correção: 8 falhas reproduzidas nos 10 cenários comportamentais específicos.
- Depois: 10/10 cenários comportamentais aprovados.
- Chrome real, perfil temporário e servidor localhost: 7 cenários aprovados. Cobrem os dois endpoints, HTML legado sem opção de atualização, migração sem recarregar uma tela aberta, recuperação explícita, falha de download e preservação de localStorage/IndexedDB. A atualização do worker é disparada explicitamente para tornar o teste determinístico; o agendamento automático do iOS não é simulado.
- Suíte do workflow de qualidade: 91/91 comandos aprovados localmente, incluindo os novos testes.
- Checagem estática de segurança aprovada. Nenhuma regra Firebase, credencial, dado de aluno ou mecanismo de autenticação foi alterado.

## Confirmação pendente no iPhone

O relato informa iPhone 12; a versão do iOS e o URL exato da instalação não foram confirmados. As capturas mostram interface antiga e modo local, mas não identificam o build nem provam perda de dados da conta.

Após a publicação, abrir o app instalado com conexão, aguardar a verificação e atualizar. Se a interface antiga não tiver controles de atualização, fechar completamente e reabrir o ícone após a primeira abertura permite uma nova navegação sob o worker atualizado. Confirmar o build nas configurações e entrar pela conta cadastrada para verificar os protocolos da nuvem.

O Safari e o app da tela inicial podem usar armazenamentos separados. Abrir `recuperar.html` no Safari não comprova atualização da instalação da tela inicial. Não orientar a apagar dados do site, desinstalar o app ou remover registros locais para testar esta correção.

Não foi realizado merge, deploy ou teste no iPhone físico. A correção não elimina limitações de rede, um atalho instalado de outro endereço ou decisões de suspensão do sistema operacional.

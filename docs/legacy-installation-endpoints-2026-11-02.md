# Instalações antigas: endereços de atualização removidos

Base: `afd1012` (main, após o PR #223). O relato posterior confirmou que a instalação nova funciona na mesma conta, com treinos e dieta disponíveis. A revisão do PR #223 cobriu `sw.js` e `sw_47.js`; o histórico completo contém mais gerações de instaladores.

## Falha confirmada

Foram publicados e depois removidos **27 caminhos de workers** e **18 manifestos de instalação**. Exemplos consultados em produção em 2026-11-02:

| Caminho | HTTP antes desta correção |
|---|---|
| `sw_40.js`, `sw_44.js`, `sw_46.js` | 404 |
| `manifest_31.json`, `manifest_33.json` | 404 |
| `sw_47.js`, `version.json` | 200 |

Uma instalação retém o URL do worker que foi registrado. Publicar somente `sw.js`/`sw_47.js` não entrega um worker novo a um navegador que tenta atualizar `sw_15.js`, por exemplo. Os testes reproduzem o 404 e a permanência do worker antigo. Depois restauram o mesmo URL e confirmam a migração.

As capturas não revelam qual worker estava registrado no iPhone, e a instalação antiga já foi removida. Portanto, a lacuna de compatibilidade está comprovada, mas não é possível atribuir um desses URLs específicos à instalação que foi apagada.

## Correção

- `config/legacy-installation-endpoints.json` registra todos os caminhos e os commits históricos de origem.
- Os 27 workers antigos passam a importar `./sw.js`; não executam o app antigo nem implementam outra camada de dados.
- Os 18 manifestos voltam a existir. Cada um mantém seu `id`, `scope` e `start_url` histórico, incluindo os parâmetros antigos de lançamento. Os demais metadados acompanham o manifesto atual.
- `manifest.json`, `sw.js`, `sw_47.js`, o build 2026110202 e o runtime atual permanecem como publicados no PR #223. Não há necessidade de outro build do runtime para restaurar URLs ausentes.
- O gerador `node scripts/legacy-installation-endpoints.mjs` mantém os arquivos de compatibilidade; o CI apenas confere, sem gerar arquivos para esconder uma remoção.

## Cobertura

- Checagem dos **45 caminhos**: arquivos presentes, importação do worker canônico, identidade e URLs de lançamento preservados e ícones existentes.
- Browser real, somente localhost: os 7 cenários do PR #223 continuam executando. Mais **27 migrações**, uma para cada worker removido, reproduzem a atualização rejeitada com 404 e validam a recuperação após restaurar o URL.
- Em três migrações, os workers antigos são os bytes originais do Git: `sw_15.js` (v9.8), `sw_40.js` (v10.8.2) e `sw_46.js` (v10.10.3). As outras usam uma fixture de cache antigo sob cada URL real para conferir a entrega de todas as pontes.
- Os testes verificam preservação de localStorage e de um registro pendente em IndexedDB, atualização para o HTML/runtime atual e apenas um registro de worker no mesmo escopo. Incluem lançamento pela raiz e por URLs com parâmetros antigos.
- A consulta de atualização é disparada explicitamente no teste. Isso não equivale a verificar o agendamento de atualizações do Safari/iOS nem substitui teste em iPhone físico.

Nenhuma conta de produção foi consultada ou modificada. Não há alteração de regras Firebase, autenticação ou dados dos alunos. A reinstalação feita anteriormente pela aluna não permite recuperar ou inspecionar o armazenamento da instalação removida por este PR.

## Verificação após publicação

Confirmar HTTP 200 com JavaScript nos 27 URLs de worker e JSON válido nos 18 manifestos. Testar em um aparelho que ainda mantenha a instalação antiga, no mesmo endereço e sem apagar seus dados. Conferir a revisão 2026110202 e os protocolos após entrar na conta. A instalação da aluna que já funciona pode continuar em uso.

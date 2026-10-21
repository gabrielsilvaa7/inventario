# Inventário Friovix — Atualização de desempenho e feedback visual

## Funcionalidades
- Catálogo de produtos carregado uma única vez por centro/depósito/rodada/usuário, armazenado somente na memória da aba aberta no navegador. Buscas seguintes são locais, instantâneas depois do carregamento inicial, sem nova chamada ao Apps Script por tecla.
- Backend lê somente 7 colunas necessárias da base para o catálogo e para a consulta resumida de acompanhamento.
- Validação final de usuário, produto, rodada e quantidade permanece no backend em `consultarProduto` e `salvarContagem` — sugestões não autorizam lançamentos.
- Filtros do acompanhamento por centro, depósito, código, descrição e página utilizam `filtrarAcompanhamento`, que evita recomputar localizações e todas as tabelas do dashboard.
- Carregamento do dashboard ocorre ao acessar Dashboard ou Supervisão, não bloqueando o acesso inicial ao registro de contagens.
- Botões mostram indicador de processamento e ficam temporariamente desabilitados para evitar acionamentos duplos. O sistema exibe mensagens durante filtros e atualizações, com hora da última atualização concluída.
- Solicitações antigas de filtro e de autocomplete não substituem respostas mais recentes. Após uma mudança de rodada, o cache do catálogo é invalidado quando o contexto é atualizado.
- Se o Apps Script ainda estiver com a implantação antiga, a busca tem fallback para `sugerirProdutos`; a filtragem também consegue usar `painel`, mais lento, até a atualização do backend.

## Implantação necessária
1. Os arquivos do frontend são publicados no GitHub Pages após o commit em `main`.
2. Abra seu projeto existente em Google Apps Script. Atualize **Code.gs** e **Bridge.html** pelos arquivos de `apps-script/` do repositório.
3. Salve, escolha **Implantar > Gerenciar implantações > Editar > Nova versão > Implantar**. Não execute `instalarProjeto` novamente.
4. Reabra o site e atualize com `Ctrl+F5`.
5. Teste digitar parte de um código, alterar centro/depósito, filtrar acompanhamento e localizar endereços físicos.

Nenhuma aba do banco de dados existente é recriada ou modificada por esta atualização de código; as operações de leitura permanecem autenticadas.

## Limites
- O primeiro carregamento do catálogo de um depósito depende da latência do Apps Script/Sheets e pode demorar; as pesquisas seguintes naquele depósito são locais até a atualização/recarregamento.
- O dashboard completo ainda precisa consultar a base para refletir lançamentos recentes ao clicar em Atualizar. Com muitos registros/conexões simultâneas, Google Sheets e Apps Script ainda podem exigir otimizações adicionais.
- Somente homologar com dados de teste e validação da TI antes do inventário oficial.

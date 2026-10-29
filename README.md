# Inventário Friovix — GitHub Pages + Google Apps Script

## Atualização v11 — centros, apontadores, conferentes e etiquetas

### Botões dos centros
- **Dashboard:** a seleção do centro agora aparece em botões segmentados (por exemplo, **1025 | 1026**), gerados a partir dos centros da base ativa. Ao escolher o centro, os indicadores, o velocímetro, o acompanhamento e o localizador mostram **todos os seus depósitos** por padrão. O filtro Depósito permite refinar a um depósito específico. Pressionar novamente o botão do centro retorna à opção **Todos os depósitos**.
- **Supervisão:** os mesmos botões, no topo da aba, mostram somente os depósitos e controles daquele centro. As operações de fechar/reabrir rodadas e os relatórios continuam específicas de cada depósito.

### Quem conta e quem lança no sistema
- **Conferentes físicos:** dois colaboradores realizam a conferência no estoque, anotando os resultados na ficha de papel (campos **1º Conferente** e **2º Conferente**).
- **Apontador:** profissional que recebe a ficha preenchida, entra no site e transcreve os dados. Os perfis de acesso exibidos são **Apontador**, **Supervisor** e **Administrador**. Novos apontadores são cadastrados com perfil `APONTADOR`. Usuários antigos guardados como `CONTADOR` **continuam fazendo login**, porém aparecem como Apontador; nenhum usuário é excluído ou obrigado a trocar senha.
- **Ficha digital:** na aba Contagem, são obrigatórios **Nº da etiqueta**, **Data da contagem**, **1º Conferente**, **2º Conferente**, endereço físico (quando quantidade maior que zero) e quantidade. O login identifica automaticamente o responsável pelo apontamento.
- **Nº da etiqueta:** número com 1–12 dígitos, armazenado como **texto** (por exemplo, `000001`) para preservar zeros à esquerda. A etiqueta fica vinculada ao mesmo **Código + Centro + Depósito**; não pode gerar lançamento duplicado na mesma rodada nem ser vinculada a outro produto do setor. Pode ser informada novamente na 2ª/3ª rodada daquele mesmo material, conforme a ficha.
- **Card Etiquetas Registradas:** conta etiquetas distintas pelo par **Centro + Depósito + número da etiqueta**, independente do número de rodadas. Também acompanha os filtros dos centros e depósitos. Registros antigos, sem etiqueta, **não são contabilizados como etiquetas**; suas quantidades e contagens permanecem intactas.
- **Relatórios:** continuam mostrando SAP, físico, diferença, código, descrição, centro, depósito e rodada; acrescentam o **Apontador**, 1º/2º conferente(s), data(s) e etiqueta(s). Quando um material teve vários lançamentos parciais na mesma rodada, os responsáveis e as fichas são preservados.

### Migração de banco já instalado
O backend acrescenta automaticamente quatro campos **ao final** da aba `CONTAGENS` no **primeiro novo lançamento**:
`data_contagem`, `primeiro_conferente`, `segundo_conferente`, `etiqueta`.

Os **14 campos existentes e todas as linhas antigas são preservados**. Não execute `instalarProjeto` novamente. Não apague a aba `CONTAGENS`. A migração exige que os 14 cabeçalhos originais não tenham sido alterados por terceiros; o sistema rejeita conflito de coluna em vez de sobrescrever dados.

Para ativar: substitua o conteúdo de `apps-script/Code.gs` pela versão atual deste repositório, salve e publique uma **nova versão** da implantação Apps Script, mantendo o endereço `/exec` da implantação existente. **`Bridge.html` não foi alterado nesta versão.** Atualize a página do GitHub Pages. Faça o primeiro lançamento em modo TESTE e valide os dados na planilha antes do inventário oficial.

## Relatórios de inventário e exportação do Localizador (v10)

A etapa **Divergências aguardando aprovação** foi eliminada. As diferenças de 3ª rodada recebem status **DIVERGENTE_FINAL**, sem aprovação obrigatória e **sem atualização automática do SAP**. A aba histórica `APROVACOES` permanece intacta para não apagar dados anteriores, mas nenhuma nova aprovação é registrada.

Na **Supervisão**, a coluna **Relatórios de inventário** oferece:
- **Exportar rodada:** selecione uma rodada **encerrada** (1ª, 2ª ou 3ª) para um CSV contendo apenas os produtos contados nela.
- **Exportar relatório final:** aparece quando o centro/depósito estiver finalizado: após uma rodada 1 ou 2 encerrada **sem diferenças**, ou após a 3ª encerrada, **mesmo com diferenças**. Esse arquivo reúne **todos os produtos** do setor, com o resultado válido da **última rodada daquele SKU**. Assim, produtos já conferidos na 1ª aparecem junto aos recontados na 2ª/3ª, sem somar rodadas.
- As colunas do CSV incluem **apontador(es)** (usuários que digitaram), **conferentes físicos**, **data da ficha**, **etiquetas**, código, descrição, centro, depósito, rodada efetiva, quantidade física consolidada, quantidade SAP, diferença física − SAP e situação.
- Se um produto recebeu lançamentos parciais de vários **apontadores** na mesma rodada, todos os responsáveis pelo registro são identificados, além dos nomes dos conferentes físicos. Quantidade **zero** também aparece no relatório.
- Em caso de **reabertura**, os resultados anteriores deixam de ser considerados e a rodada reaberta só volta a ser exportável depois do novo encerramento. Exportações e reaberturas entram na auditoria.
- Apenas perfis **SUPERVISOR** e **ADMIN** podem baixar os arquivos.

No Dashboard, o botão **Exportar localizações · CSV** dentro de **Localizador de materiais** exporta todos os endereços que atendam aos filtros **Código / Centro / Depósito / Rua / Zona / Posição / Palete**, inclusive quando a tabela exibir no máximo 400 registros. O arquivo inclui código, descrição, UM, centro, depósito, endereço físico, quantidade e rodada da última contagem daquele material. Contagens com quantidade zero não criam endereço físico. Por proteção contra arquivos enormes, acima de **20.000 endereços filtrados**, refine os filtros em vez de receber um arquivo incompleto.

Os arquivos são **CSV UTF-8 com BOM e separador ponto e vírgula**, compatíveis com Excel em português, com números positivos/negativos preservados e proteção contra conteúdo interpretado como fórmula. **Para preservar códigos SAP com zeros iniciais**, importe pelo menu **Dados → De Texto/CSV** do Excel e defina a coluna Código como **Texto**. Os relatórios não alteram a planilha SAP nem os lançamentos.

**Ativação:** substitua `apps-script/Code.gs` e `apps-script/Bridge.html` no projeto Apps Script existente, salve e **Implantar → Gerenciar implantações → Editar → Nova versão → Implantar**. A interface do GitHub Pages é atualizada pelo commit. **Não execute `instalarProjeto` novamente.**



## Dashboard filtrado e Supervisão visual (v9)

- **Filtro por centro/depósito:** agora controla conjuntamente os três cards, o velocímetro e a tabela de acompanhamento. Os filtros foram movidos para o topo do Dashboard para indicar o escopo. A pesquisa por código/descrição afeta somente a listagem de produtos, não os totais do setor.
- **Produtos Contados:** quantidade de produtos distintos (Código + Centro + Depósito) com pelo menos um lançamento, mesmo quando a quantidade é zero; não é uma contagem de unidades e não depende de fechar a rodada.
- **Produtos Batendo (verde):** produtos cuja quantidade física foi confirmada igual ao SAP após o fechamento de qualquer rodada.
- **Produtos Divergente (vermelho):** apenas produtos com divergência de estoque após o encerramento da terceira rodada. A classificação do estoque continua baseada nas diferenças físicas da última rodada encerrada.
- **Supervisão:** a evolução da rodada aparece com porcentagem numérica, barra de progresso e total de materiais contados/alvo. A nova coluna **Próxima etapa / Resultado** sinaliza Estoque Batendo (verde), Segunda Contagem (amarelo), Terceira Contagem (amarelo) ou Estoque Divergente (vermelho), conforme o encerramento. Rodadas abertas indicam Em contagem.
- **Localizador de materiais:** coluna Quantidade física imediatamente após Descrição, maior contraste, números destacados e melhor leitura em telas estreitas.
- **Desempenho:** a consulta rápida `filtrarAcompanhamento` devolve também as métricas daquele depósito, mantendo cards e velocímetro sincronizados sem recalcular o dashboard inteiro a cada filtro.

**Ativação no sistema existente:** publique os novos `apps-script/Code.gs` e `apps-script/Bridge.html` (a ponte não mudou nesta versão, mas deve permanecer compatível). Salve e faça **Implantar → Gerenciar implantações → Editar → Nova versão → Implantar**. Não execute `instalarProjeto` novamente.

## Atualização de interface e supervisão (v8)

- **Velocímetro:** arco superior segmentado em três faixas coloridas (0–35% vermelho, 35–65% amarelo, 65–100% verde). O preenchimento segue exclusivamente da esquerda para a direita; o ponteiro acompanha a porcentagem de SKUs distintos contados.
- **Recontagens:** divergências da primeira e segunda contagem aparecem em **amarelo**, como necessidade de recontar. Somente após a **terceira rodada encerrada e divergente** o produto fica vermelho com **Divergência de Estoque**.
- **Permissões de recontagem:** em Supervisão, busque os contadores pelo nome ou usuário e libere, individualmente, quem pode repetir o mesmo material em rodadas posteriores. A permissão é salva na aba `CONFIG`, conferida pelo backend em todas as consultas/lançamentos e auditada. O antigo interruptor global foi desativado (mesmo que o registro legado ainda exista).
- **Ações de supervisão:** confirmação centralizada em janela com nome do usuário e centro/depósito/rodada, justificativa obrigatória para reabertura, spinner durante o processamento e atualização automática da tela, contexto e catálogo de produtos, sem depender de F5.
- **Exportação CSV:** para cada depósito, mostra apenas o botão **Exportar** da próxima recontagem aplicável. Ao chegar à terceira contagem, o arquivo da segunda não aparece; após o fim da terceira rodada, os dois botões desaparecem.

**Atualização do backend já instalado:** substitua somente o conteúdo de `apps-script/Code.gs` e `apps-script/Bridge.html` pela versão do repositório e publique uma **nova versão da implantação**. Não execute `instalarProjeto` e não substitua a planilha. Teste inicialmente no modo TESTE com usuários distintos.


Aplicação de inventário físico industrial com endereço **Rua / Zona / Posição / Palete**. O site fica no **GitHub Pages**, mas o banco é uma **nova planilha Google privada**, criada automaticamente pelo Apps Script. A planilha original do SAP é consultada e **não é modificada**.

> **Status: versão inicial para testes homologados. Não usar em inventário oficial sem validação de TI, carga simultânea, reconciliação e procedimentos de contingência.**

## Reabertura de rodadas encerradas (v5)

Na aba **Supervisão**, o supervisor ou administrador pode clicar em **Reabrir** na última rodada encerrada de um centro/depósito. É obrigatório informar uma justificativa de 10 ou mais caracteres.

- Os lançamentos da rodada, incluindo endereço, quantidade e usuário, permanecem na aba `CONTAGENS`.
- Os resultados do fechamento anterior são mantidos na aba `RESULTADOS` com status `REABERTO`, como histórico, e deixam de participar dos cálculos/dashboards.
- Ao encerrar novamente, o sistema gera nova consolidação e novos identificadores de resultados; a reabertura é registrada em `AUDITORIA`.
- Se uma rodada posterior já foi iniciada, **não é possível reabrir** a rodada anterior.
- Se a operação interromper com status `REABRINDO`, clique em **Retomar reabertura**. Essa proteção também é válida no modo OFICIAL.

**Para ativar no Apps Script existente:** substitua `Code.gs` e `Bridge.html` e selecione **Implantar → Gerenciar implantações → Editar → Nova versão → Implantar**. Não execute `instalarProjeto` novamente. A planilha de dados não precisa ser recriada.

## Atualização — velocímetro e exportação de recontagens (v7)

O **Dashboard** apresenta um velocímetro de progresso de produtos com a porcentagem de **produtos (Código + Centro + Depósito) que receberam ao menos um lançamento**, mesmo que a quantidade lançada seja zero. Repetir registros parciais do mesmo produto não aumenta o numerador. A métrica considera o centro e depósito selecionados na versão atual e não exige que o supervisor já tenha encerrado a rodada. Os indicadores de produtos **concluídos** continuam separados.

No painel **Acompanhamento de produtos**, após selecionar o centro e depósito:

- **Exportar 2ª contagem** fica disponível quando a primeira rodada for encerrada e houver produtos divergentes.
- **Exportar 3ª contagem** fica disponível quando a segunda rodada for encerrada e persistirem divergências.
- Os botões aparecem somente se existir uma lista para exportar naquele centro/depósito. São visíveis a **supervisores e administradores**.
- Cada exportação gera um **CSV UTF-8 com BOM e separador ponto e vírgula**, compatível com importação no Excel. Contém código, descrição, UM, centro, depósito, número da rodada e colunas em branco de endereço/quantidade para preenchimento. **Não inclui saldo SAP, diferença, valor monetário ou quantidades anteriormente contadas**, preservando a independência das recontagens.
- A lista é conferida novamente pelo backend no momento da exportação; um operador sem perfil de supervisão ou uma rodada anterior não encerrada não consegue gerar o arquivo.
- A ação é registrada na aba privada `AUDITORIA`; exportar não modifica contagens nem rodadas.

**Para ativar no sistema existente:** copie a versão mais recente de `apps-script/Code.gs` e `apps-script/Bridge.html` para o projeto Google Apps Script, salve e faça **Implantar → Gerenciar implantações → Editar → Nova versão → Implantar**. Preserve o URL `/exec` atual. Não execute `instalarProjeto` novamente e não altere a planilha de banco.

## O que já funciona

- Login com usuário/senha; perfis `CONTADOR`, `SUPERVISOR` e `ADMIN`.
- Importação única da planilha de estoque SAP para um novo banco Google Sheets.
- Código válido por **Código + Centro + Depósito**; descrição e UM obtidas da base importada.
- Lançamentos **aditivos** por Rua/Zona/Posição/Palete, usuário, data/hora e UUID de requisição.
- Quantidades zero permitidas (sem endereço, para material não localizado); UN inteira e KG até 3 casas decimais.
- Encerramento de rodada **somente pelo supervisor** e **somente quando TODOS os materiais-alvo receberam pelo menos um lançamento (inclusive zero)**.
- Até três rodadas. Rodada 2 e 3 recebem **somente materiais que divergiram na rodada anterior**. Produto que confere com SAP fica finalizado.
- Por padrão, o mesmo usuário não conta o mesmo produto em rodadas diferentes; supervisor pode liberar a exceção.
- Consolidação de endereços na última rodada registrada do material, sem misturar rodadas.
- Divergências após a terceira rodada são consideradas resultados físicos finais, sem aprovação obrigatória e sem lançamento automático no SAP. O supervisor pode exportar o relatório final.
- Log de auditoria: login, tentativa malsucedida, lançamento, encerramento/abertura, exportações, criação de usuário e mudança de configuração.
- Dashboard com **lista paginada de 50 produtos** por centro e depósito, código, descrição, estados da 1ª/2ª/3ª contagem (verde, amarelo, vermelho), situação **Estoque Batendo / Estoque Divergente** e progresso de produtos iniciados/concluídos.
- Autocomplete na tela de contagem por **código ou descrição**, restrito ao centro/depósito e à rodada atual (máximo 12 sugestões).
- Filtro de localização por endereço físico. A aba AUDITORIA fica acessível somente na planilha privada, não na interface.
- Menu de seleção de Centro + Depósito **sem a rodada**. A rodada continua visível na ficha do produto e no painel de supervisão.
- Atualiza ao recarregar a página ou clicar em **Atualizar**.

## Nova função — Atualizar Base SAP (administradores, modo TESTE)

No menu **Administração**, use **Verificar alterações** para comparar a planilha SAP de origem com a versão atual (novos, removidos, alterados, saldos e depósitos). Após revisar, utilize **Atualizar Base SAP**. Exige a limpeza das contagens de teste e confirmação digitada. No modo OFICIAL, a atualização fica bloqueada. Versões anteriores permanecem preservadas no Google Sheets. Consulte [o guia completo](docs/ATUALIZACAO_BASE_SAP.md).

**IMPORTANTE:** para ativar, atualize `apps-script/Code.gs` e `apps-script/Bridge.html` no projeto Apps Script existente e publique **uma nova versão da implantação**. Não execute `instalarProjeto` outra vez.

## Atualização da versão 3 — backend já instalado

**Não execute `instalarProjeto` outra vez!** O Google Sheets e as propriedades já estão configurados. Para ativar autocomplete e o novo dashboard, abra o projeto existente em Apps Script, substitua **Code.gs** e **Bridge.html** pelos arquivos em `apps-script/`, salve e faça **Implantar > Gerenciar implantações > Editar > Nova versão > Implantar**. Preserve a mesma implantação/URL `/exec`, quando possível. O `config.js` já contém a URL atual.

A evolução é calculada **por centro + depósito**, com:
- **Contagem iniciada:** total de SKUs que receberam pelo menos um lançamento em qualquer rodada / total de SKUs da base.
- **Contagem concluída:** SKUs conferidos em alguma rodada encerrada ou divergentes após a terceira rodada encerrada / total de SKUs da base.
- Verde quando a rodada encerrada confere com o SAP; amarelo nas divergências da 1ª e da 2ª; vermelho apenas quando a 3ª rodada encerra divergente. Lançamentos ainda não encerrados ficam azuis, sem antecipar resultado.
- O estado **Estoque Divergente** só ocorre ao finalizar a terceira rodada com diferença. Na primeira e na segunda, indica-se a próxima rodada necessária.

Apenas o frontend no GitHub não basta para essas novas funções: é obrigatório atualizar e reimplantar o Apps Script.

## NOVO — Modo TESTE e OFICIAL (Administração)

No menu **Administração** (perfil **ADMIN**), existem as opções **Modo TESTE** e **Modo OFICIAL**, além do botão **Apagar registros de teste**.

- **TESTE (inicial):** simule contagens, localizações, rodadas 1/2/3 e geração de relatórios. O administrador pode usar a limpeza após confirmar digitando `APAGAR TESTES`.
- **Limpeza:** elimina os dados simulados em `CONTAGENS`, `RESULTADOS`, `APROVACOES` e `RODADAS`, restabelece a Rodada 1 de cada Centro + Depósito e limpa a auditoria dos testes, guardando um evento da limpeza. Preserva `BASE_ESTOQUE`, `INVENTARIOS`, `USUARIOS`, `SESSOES` e `CONFIG`. Não modifica a planilha SAP original.
- **OFICIAL (permanente):** exige base de operações limpa e confirmação `INICIAR INVENTARIO OFICIAL`. Depois disso, o backend rejeita todas as tentativas de limpeza e **não permite voltar a TESTE**. As contagens e rodadas oficiais continuam funcionando normalmente.
- **Permissões:** apenas ADMIN consulta o controle de ambiente, ativa OFICIAL ou apaga dados de TESTE. O modo está nas Propriedades privadas do Apps Script, não no JavaScript do site.

**Aviso importante:** a proibição de exclusão vale para as funções do site. Quem tiver acesso de **editor** direto ao Google Sheets ainda poderá alterar/apagar células manualmente. Restrinja esse acesso para operação oficial. Consulte `docs/SEGURANCA.md`.

### Atualização obrigatória para a implantação já existente

1. No projeto Apps Script **Inventário SAP — Backend**, substitua integralmente o código de `Code.gs` e `Bridge.html` pelos arquivos atualizados deste GitHub. Salve.
2. Em **Implantar > Gerenciar implantações**, edite **a implantação existente** do Aplicativo da Web (ícone de lápis).
3. Em **Versão**, selecione **Nova versão** e clique em **Implantar**. Mantenha **Executar como: Eu**, e mantenha a configuração de acesso aprovada pela TI.
4. Use a mesma URL `/exec` já configurada em `config.js`; se a implantação fornecer URL diferente, atualize `config.js`.
5. Atualize o GitHub Pages (Ctrl+F5), entre com usuário ADMIN e confirme **Modo TESTE** e o botão **Apagar registros de teste**.

**NÃO execute `instalarProjeto` novamente.** A base existente já foi criada; as novas funções são compatíveis com ela. A propriedade `INVENTARIO_MODO` pode não existir em projetos instalados antes da atualização: nesse caso, o backend assume TESTE até ativação OFICIAL.

## Arquivos

```
inventario/
├─ index.html             # site publicado no GitHub Pages
├─ styles.css             # visual responsivo
├─ app.js                 # interface / comunicação com o backend
├─ config.js              # URL PUBLICA do Apps Script (não inclui segredos)
├─ .nojekyll              # permite servir os arquivos diretamente
├─ apps-script/
│  ├─ Code.gs             # backend protegido
│  ├─ Bridge.html         # ponte de mensagens para GitHub Pages
│  └─ appsscript.json     # fuso horário e permissões
└─ docs/
   ├─ ARQUITETURA.md
   ├─ SEGURANCA.md
   └─ TESTES.md
```

## ETAPA 1 — Publicar o frontend no GitHub Pages

O código deste projeto foi migrado para a raiz do repositório independente [`gabrielsilvaa7/inventario`](https://github.com/gabrielsilvaa7/inventario). O repositório anterior do site pessoal não é necessário para esta aplicação.

- URL do frontend: https://gabrielsilvaa7.github.io/inventario/
- Arquivo de entrada: `index.html`
- Configuração pública do backend: `config.js`
- Nenhum código nem dado do SAP deve ser incluído no frontend.

Se aparecer **Configuração pendente**, isso é esperado até concluir a implantação do Google Apps Script na etapa seguinte. A ativação do GitHub Pages pode ser feita pelo proprietário em **Settings > Pages > Deploy from a branch > main > /(root)** caso ainda não esteja ativa.

## ETAPA 2 — Crie o backend no Apps Script

1. Acesse [script.google.com](https://script.google.com) com a conta Google que terá permissão de leitura na planilha SAP de origem e administrará o banco. Clique em **Novo projeto**.
2. Dê o nome **Inventário SAP — Backend**.
3. No arquivo padrão `Código.gs`/`Code.gs`, apague o conteúdo e cole o conteúdo de `apps-script/Code.gs`.
4. Crie um arquivo de tipo **HTML** chamado **Bridge** (não use `Bridge.html.html`); cole o conteúdo de `apps-script/Bridge.html`.
5. Se quiser aplicar `apps-script/appsscript.json`, abra **Configurações do projeto > Mostrar arquivo de manifesto** e cole o conteúdo no `appsscript.json`. O fuso deve ficar `America/Manaus`. Garanta que a implantação tenha as permissões necessárias.
6. Em **Configurações do projeto > Propriedades do script**, inclua estas propriedades exatas:

   | Propriedade | Valor |
   | --- | --- |
   | `SAP_SOURCE_ID` | ID da planilha **SAP ESTOQUE 1025-1026**, extraído do URL entre `/d/` e `/edit` |
   | `WEB_ORIGIN` | `https://gabrielsilvaa7.github.io` (sem barra final e sem o nome do repositório) |
   | `ADMIN_USER` | Seu usuário inicial, por exemplo `ADMIN` |
   | `ADMIN_PASSWORD` | Uma senha inicial com **12 ou mais caracteres** (será descartada após a instalação) |

7. Na lista de funções do editor Apps Script, escolha **`instalarProjeto`** e clique em **Executar**. Autorize o acesso à planilha de origem e a criação de uma nova planilha. **Essa função deve ser executada somente uma vez.**
8. Consulte o **Registro de execução**. Deve aparecer o URL de uma nova planilha chamada **INVENTARIO SAP - BANCO DE DADOS**. Confirme as abas `BASE_ESTOQUE`, `CONTAGENS`, `RODADAS`, `RESULTADOS`, `USUARIOS`, `SESSOES`, `CONFIG`, `APROVACOES`, `AUDITORIA` e `INVENTARIOS`.
9. Confira se as rodadas iniciais foram abertas automaticamente para cada combinação Centro + Depósito da base importada. Evite compartilhar a planilha de banco com contadores.

> A instalação cria a propriedade `DB_SPREADSHEET_ID` automaticamente e remove `ADMIN_PASSWORD` das propriedades. **Não mude `DB_SPREADSHEET_ID` após o início das contagens.** Não execute instalação na planilha SAP original.

## ETAPA 3 — Implante o Apps Script como aplicativo da Web

1. No editor Apps Script, clique em **Implantar > Nova implantação**.
2. Tipo **Aplicativo da Web**.
3. **Executar como:** `Eu` (proprietário do projeto).
4. **Quem tem acesso:** `Qualquer pessoa` (**a ponte de login é pública, os métodos de estoque exigem login**).
5. Implante, autorize se solicitado e copie o URL da Web App que termina em **`/exec`**.
6. **Se a organização bloquear acesso "Qualquer pessoa", não reduza a segurança nem exponha a planilha. Consulte a TI; pode ser necessário um backend corporativo diferente.**

## ETAPA 4 — Conecte GitHub Pages ao Apps Script

1. Edite o arquivo `config.js` **do repositório GitHub**. Substitua `COLE_AQUI_O_URL_DA_WEB_APP_TERMINADO_EM_EXEC` pelo URL `/exec` da implantação.
2. Salve (commit). Reabra seu site GitHub Pages e atualize com `Ctrl+F5`.
3. Entre com o usuário e a senha definidos nas propriedades da etapa 2.
4. Cadastre usuários na aba **Usuários**, com perfis de `CONTADOR` ou `SUPERVISOR`.
5. Teste **um material real** no centro e depósito correspondentes, com endereço e quantidade; o lançamento deve ser gravado em `CONTAGENS`, e o dashboard deve refletir o endereço.

> O Apps Script funciona dentro de um `iframe` invisível, porque o navegador **não permite** usar `google.script.run` diretamente em páginas do GitHub e a API de Web App do Apps Script não é uma API REST com CORS previsível. A ponte checa a **origem HTTPS do site**, e todas as funções críticas verificam a sessão novamente. **Alguns navegadores e políticas de cookies/iframes corporativos podem bloquear essa integração**; teste nos celulares e computadores reais da equipe.

## ETAPA 5 — Teste as três rodadas

- Faça uma contagem de um material; vários lançamentos de um produto dentro da mesma rodada são somados.
- Para testar encerramento, o supervisor precisa garantir lançamento para **cada SKU alvo** do centro/depósito. Se faltar algum, o sistema recusa o encerramento e mostra exemplos de códigos pendentes.
- Ao encerrar, os SKUs com quantidade física igual à quantidade SAP são finalizados. Os divergentes ficam elegíveis para a rodada seguinte.
- Depois de `Rodada 1 ENCERRADA`, clique em **Próxima rodada**. Use um contador diferente por SKU, a menos que o supervisor tenha alterado a configuração.
- Quando a 1ª ou a 2ª rodada encerrar sem divergências, ou quando a 3ª rodada encerrar mesmo divergente, utilize **Exportar relatório final** na Supervisão.
- A regularização de diferenças no SAP é uma atividade externa autorizada; exportar não altera o saldo.

## Observações importantes

- **Não se deve comparar SAP e contagem antes do encerramento formal**, pois um produto pode estar distribuído em muitos endereços.
- A tela de login, o nome do site e os demais rótulos da interface usam **Inventário Friovix**; a planilha de banco já existente mantém seu nome para preservar suas referências.
- O sistema não dispara alertas quando dois operadores usam **o mesmo endereço**, conforme a regra operacional escolhida; a equipe deve controlar a cobertura física e evitar recontagem indevida.
- O saldo de referência usado é a coluna `QUANTIDADE`. `ESTOQUE BLOQUEADO`, `EM TRANSFERENCIA (CENTRO)` e `TRANSITO E TE` são preservados, mas não somados automaticamente à quantidade contábil. A TI/logística deverá validar o escopo.
- Valor total SAP é preservado, mas **não** convertido automaticamente em custo unitário/impacto da divergência sem validação de critérios contábeis.
- Saldo SAP **congelado**: exporte/capture a posição correta, defina horário de corte e impeça movimentações ou reconcilie movimentos posteriores, para não comparar bases de momentos diferentes.
- A planilha de origem não é modificada; a importação acontece uma vez na instalação. Para novo inventário, será necessária funcionalidade adicional de abertura de campanha; não sobrescreva o banco existente.
- Campos de localização são inteiros positivos a partir de 1; quantidade zero pode omitir endereço, pois representa material não localizado.
- `UN`, `UND`, `PC`, `PÇ`, `PCS`, `EA`, `CX`, `KIT` são configurados como unidades inteiras no backend; demais UMs aceitam até três casas decimais. Valide esse mapa com as unidades da sua operação.
- Dashboard exibe até 400 endereços por consulta para manter agilidade; o botão de exportação usa todos os endereços filtrados, sem truncamento silencioso.

## Se não funcionar

| Sintoma | Verificação |
|---|---|
| “Configuração pendente” | Editar `config.js` no repositório publicado. |
| “Não foi possível carregar o Apps Script” | Verificar URL `/exec`, implantação pública, navegador que permite iframe, bloqueadores, `WEB_ORIGIN`. |
| “Usuário ou senha inválidos” | `ADMIN_USER` e senha utilizados na instalação; usuário sempre normalizado para letras maiúsculas. |
| “Produto não encontrado” | Código + Centro + Depósito devem corresponder exatamente à base. |
| “Rodada encerrada” | Supervisor precisa abrir a próxima rodada se houver divergências. |
| “Materiais sem contagem” | Cada SKU-alvo exige lançamento. Não inserir zero em massa sem inspeção física. |
| “Muitas tentativas” | Aguarde 15 minutos ou consulte administrador. |
| “O servidor demorou” | Não altere os campos antes de verificar se o lançamento foi salvo; o sistema usa `request_id` para evitar duplicidade ao reenviar a mesma solicitação. |

## Próximas melhorias recomendadas

Autenticação corporativa (Google Workspace ou provedor de identidade), reset seguro de senhas, desativação de usuários pela interface, fechamento supervisionado por área/zona, planejamento de contagem cega, escaneamento por câmera/código de barras, cache/indexação para alta concorrência, gestão de múltiplas campanhas, exportação de ajustes CSV/XLSX, reconciliação de movimentações pós-corte, relatórios fiscais e teste de estresse.

**Atenção:** autenticação local com hash salgado e segredo privado é apenas uma camada inicial de proteção. Antes do inventário oficial, siga `docs/SEGURANCA.md` e `docs/TESTES.md`.

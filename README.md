# Inventário Friovix — GitHub Pages + Google Apps Script

Aplicação de inventário físico industrial com endereço **Rua / Zona / Posição / Palete**. O site fica no **GitHub Pages**, mas o banco é uma **nova planilha Google privada**, criada automaticamente pelo Apps Script. A planilha original do SAP é consultada e **não é modificada**.

> **Status: versão inicial para testes homologados. Não usar em inventário oficial sem validação de TI, carga simultânea, reconciliação e procedimentos de contingência.**

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
- Divergências após a terceira rodada precisam de aprovação do supervisor, sem lançamento automático no SAP.
- Log de auditoria: login, tentativa malsucedida, lançamento, encerramento/abertura, aprovação, criação de usuário, mudança de configuração.
- Dashboard com **lista paginada de 50 produtos** por centro e depósito, código, descrição, estados da 1ª/2ª/3ª contagem (verde, amarelo, vermelho), situação **Estoque Batendo / Estoque Divergente** e progresso de produtos iniciados/concluídos.
- Autocomplete na tela de contagem por **código ou descrição**, restrito ao centro/depósito e à rodada atual (máximo 12 sugestões).
- Filtro de localização por endereço físico. A aba AUDITORIA fica acessível somente na planilha privada, não na interface.
- Menu de seleção de Centro + Depósito **sem a rodada**. A rodada continua visível na ficha do produto e no painel de supervisão.
- Atualiza ao recarregar a página ou clicar em **Atualizar**.

## Atualização da versão 3 — backend já instalado

**Não execute `instalarProjeto` outra vez!** O Google Sheets e as propriedades já estão configurados. Para ativar autocomplete e o novo dashboard, abra o projeto existente em Apps Script, substitua **Code.gs** e **Bridge.html** pelos arquivos em `apps-script/`, salve e faça **Implantar > Gerenciar implantações > Editar > Nova versão > Implantar**. Preserve a mesma implantação/URL `/exec`, quando possível. O `config.js` já contém a URL atual.

A evolução é calculada **por centro + depósito**, com:
- **Contagem iniciada:** total de SKUs que receberam pelo menos um lançamento em qualquer rodada / total de SKUs da base.
- **Contagem concluída:** SKUs conferidos em alguma rodada encerrada ou divergentes após a terceira rodada encerrada / total de SKUs da base.
- Verde quando uma rodada encerrada confere com o SAP; amarelo quando a 1ª rodada não confere; vermelho quando a 2ª ou 3ª rodada não confere. Lançamentos ainda não encerrados ficam azuis, sem antecipar resultado.
- O estado **Estoque Divergente** só ocorre ao finalizar a terceira rodada com diferença. Na primeira e na segunda, indica-se a próxima rodada necessária.

Apenas o frontend no GitHub não basta para essas novas funções: é obrigatório atualizar e reimplantar o Apps Script.

## NOVO — Modo TESTE e OFICIAL (Administração)

No menu **Administração** (perfil **ADMIN**), existem as opções **Modo TESTE** e **Modo OFICIAL**, além do botão **Apagar registros de teste**.

- **TESTE (inicial):** simule contagens, localizações, rodadas 1/2/3 e aprovações livremente. O administrador pode usar a limpeza após confirmar digitando `APAGAR TESTES`.
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
- Depois da terceira rodada, se o saldo continuar diferente do SAP, surgirá uma pendência de aprovação no painel de supervisão.
- A aprovação apenas gera um registro em `APROVACOES`; a regularização SAP é atividade externa autorizada.

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
- Dashboard lista no máximo 400 endereços filtrados por consulta e até 150 divergências para evitar transferir grandes tabelas ao navegador.

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

# Sistema de Inventário

Aplicação web para registrar e acompanhar o inventário físico de materiais por **centro e depósito**.

## Funcionalidades

- Registro de contagens a partir de fichas físicas, com etiqueta, data, conferentes, quantidade e localização.
- Até três rodadas por material, com identificação de divergências em relação à base SAP.
- Dashboard de progresso, localização de materiais e exportação de relatórios.
- Acessos por perfil: **Apontador**, **Supervisor** e **Administrador**.

## Tecnologias

- **Interface:** HTML, CSS e JavaScript, hospedados no GitHub Pages.
- **Integração:** Google Apps Script.
- **Armazenamento:** Google Sheets.

## Estrutura

`index.html`, `styles.css` e `app.js` compõem a interface; `apps-script/` contém o backend e a ponte de comunicação.

**Implantação:** publique o site no GitHub Pages e configure o projeto Google Apps Script conforme o seu ambiente. Ao atualizar uma instalação existente, implante uma nova versão do Apps Script sem executar novamente `instalarProjeto`.

> Não publique credenciais, identificadores privados de planilhas ou dados reais de estoque no repositório.

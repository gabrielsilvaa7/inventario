# Atualização da Base SAP — Inventário Friovix

## Finalidade
A aba **Administração** oferece dois botões: **Verificar alterações** e **Atualizar Base SAP**. O sistema consulta a aba `Data` da planilha definida em `SAP_SOURCE_ID` nas propriedades privadas do Apps Script. A planilha de origem **nunca é alterada** pelo recurso.

## Como utilizar
1. Substitua/atualize os dados da aba `Data` da planilha SAP de origem, preservando as 12 colunas e seus cabeçalhos.
2. Entre como **ADMIN** no Inventário Friovix e confirme que o modo é **TESTE**.
3. Se já fez contagens ou encerrou rodadas de teste, utilize primeiro **Apagar registros de teste**. Esta ação é separada e irreversível, por isso confira antes os dados e as condições.
4. Clique em **Verificar alterações**. Serão mostrados os números de SKUs novos, alterados e removidos, além de mudanças de saldo/descrição e centros/depósitos.
5. Revise a prévia. Se não houver impedimentos, clique em **Atualizar Base SAP** e digite **ATUALIZAR BASE SAP** na confirmação.
6. Aguarde a mensagem de sucesso, sem fechar a página. Atualize o navegador em outros computadores para recarregar o catálogo de produtos.

## Condições de segurança
- Somente a função do backend, autenticada como **ADMIN**, pode atualizar a base. Ocultar botões no HTML não é a única proteção.
- O recurso é **bloqueado em modo OFICIAL**, inclusive para o administrador.
- Não permite alterar a base se houver lançamentos em `CONTAGENS`, `RESULTADOS` ou `APROVACOES`, nem se houver rodadas já encerradas ou superiores à primeira.
- A prévia não grava dados; a confirmação refaz a leitura e rejeita se a origem ou a base vigente foi modificada após a prévia.
- As quantidades do estoque bloqueado, transferência e trânsito continuam preservadas em colunas distintas, sem alteração automática da regra contábil.
- Transferências entre depósitos são identificadas como saída da chave Código+Centro+Depósito anterior e entrada na nova.
- Não sincroniza automaticamente a cada edição da planilha SAP. É necessário clicar nos botões administrativos.
- A cada importação, duas abas novas são gravadas e verificadas. Somente após a conclusão de ambas a propriedade privada `SAP_SNAPSHOT_ATIVO` aponta para elas.
- A aba `BASE_ESTOQUE` original e outras versões anteriores permanecem como histórico; **a base ativa após uma sincronização é a aba `BASE_SAP_<versão>`**. A rodada ativa correspondente é `RODADAS_SAP_<versão>`.
- A mudança fica registrada na aba `AUDITORIA`. Não altere nem exclua manualmente `SAP_SNAPSHOT_ATIVO`.
- Se ocorrer um erro antes de confirmar a nova versão, a referência à base anterior permanece ativa. Uma aba intermediária eventualmente criada pode ser preservada para diagnóstico, mas não é usada pelo aplicativo.
- Inventário oficial requer data de corte SAP, congelamento/reconciliação de movimentações e validação pela TI.

## Instalação no projeto Apps Script já existente
Atualize **ambos** os arquivos `apps-script/Code.gs` e `apps-script/Bridge.html` no projeto Apps Script existente. Salve e utilize **Implantar → Gerenciar implantações → Editar → Nova versão → Implantar**. Mantenha o URL `/exec` da implantação quando possível.

**Não execute `instalarProjeto` outra vez. Não exclua as abas de base existentes.**

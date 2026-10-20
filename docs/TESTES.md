# Roteiro de homologação antes do inventário oficial

Use um banco de teste separado; não edite o arquivo SAP original.

## Funcionais

- [ ] Instalação com `SAP_SOURCE_ID` e `WEB_ORIGIN`, usuário inicial e criação de todas as abas.
- [ ] Validar total de registros importados e amostras de estoque SAP (incluindo casas decimais, centros e depósitos).
- [ ] Garantir que código repetido em depósito diferente apareça separadamente.
- [ ] Senha errada recusada; usuário contador não acessa dashboard, fechamento nem cadastro.
- [ ] Código fora da base recusado.
- [ ] Lançar 5 UN em Rua 3 / Zona 2 / Posição 15 / Palete 4.
- [ ] Lançar 2 UN do mesmo material em outro endereço; total da rodada deverá ser 7.
- [ ] Dois usuários lançando no mesmo endereço somam; nenhum bloqueio de duplicidade de posição.
- [ ] Reenvio com mesmo `request_id` não soma duas vezes.
- [ ] Quantidade zero aceita com endereço vazio; não preenchido não é equivalente a zero.
- [ ] UN não aceita decimal e KG aceita até 3 casas.
- [ ] Rua, Zona, Posição e Palete não aceitam 0, negativos nem fração para lançamentos positivos.
- [ ] Supervisor não consegue encerrar rodada com materiais-alvo não contados.
- [ ] Após encerramento, novo lançamento naquela rodada é recusado.
- [ ] Material igual ao SAP encerra e não é elegível para próxima rodada.
- [ ] Material divergente entra na rodada 2, e contador da rodada 1 é recusado.
- [ ] Ativar exceção de mesmo contador, verificar permissão e audit trail.
- [ ] Material divergente na rodada 2 entra na rodada 3, e rodada 4 nunca abre.
- [ ] Terceira divergência necessita aprovação com justificativa.
- [ ] Aprovação não altera estoque SAP; gera linha separada e audit trail.
- [ ] Dashboard filtra por Código, Centro, Depósito, Rua, Zona, Posição e Palete.
- [ ] Dashboard não soma rodadas diferentes e carrega na atualização da página.

## Concorrência / segurança / dispositivo

- [ ] Testar ao menos o número **real** de contadores simultâneos em celulares e Wi-Fi de operação.
- [ ] Duas contagens simultâneas do mesmo material preservam ambas, sem perda.
- [ ] Encerramento do supervisor enquanto outro lançamento está em trânsito não perde/mescla dados.
- [ ] Rede cai após enviar: consultar banco e reenviar a **mesma** requisição; não duplicar.
- [ ] Tentativas indevidas por usuário e controles de perfil bloqueados no backend.
- [ ] Sessão expirada e logout bloqueiam endpoints.
- [ ] Smartphone Android/iOS e navegador real conseguem carregar iframe Apps Script (testar políticas corporativas, bloqueio de cookies e modo privado).
- [ ] Confirmar permissões do Google Drive: nenhum contador tem acesso direto à planilha privada.
- [ ] Confirmar que repositório GitHub NÃO contém dados SAP ou senhas.
- [ ] Medir tempo de resposta com volume de dados próximo da operação (milhares de SKUs/lançamentos).
- [ ] Simular interrupção Apps Script no meio do fechamento; testar procedimento de recuperação antes da produção.

**Critério de liberação**: testes aprovados por TI e supervisor, importação conciliada com SAP, procedimentos de contingência e backup documentados.

## Homologação do modo de operação

1. Entre como ADMIN; confirme a aba **Administração**, indicador **TESTE** no topo e botão de limpeza habilitado.
2. Registre contagens com Rua, Zona, Posição e Palete e percorra as três rodadas em um setor com poucos materiais. Aprove ao menos uma divergência.
3. Confira no Dashboard as contagens, divergências e endereços.
4. Use **Apagar registros de teste**; aceite a confirmação e digite `APAGAR TESTES`. Confira que não há contagens, resultados ou aprovações e que cada setor voltou à Rodada 1 aberta.
5. Confira que a base SAP e os usuários não foram removidos. Faça outro lançamento e repita a limpeza.
6. Tente selecionar **Modo OFICIAL** com contagens de teste pendentes: deve rejeitar. Limpe os testes novamente e confirme a operação oficial digitando `INICIAR INVENTARIO OFICIAL`.
7. Confirme indicador OFICIAL e botão de apagar desabilitado; tente `limparDadosTeste` diretamente como ADMIN pela ponte: o backend deve negar. Verifique que lançamentos normais ainda são aceitos.
8. Confirme que o modo OFICIAL permanece após atualizar a página e que não pode retornar a TESTE.
9. Simule diferentes usuários/abas para verificar que contagens iniciadas antes da limpeza não deixam linhas órfãs. Em caso de queda durante a limpeza, execute novamente como ADMIN.

**Atenção:** editar `Code.gs` no repositório não atualiza a implantação `/exec` automaticamente. É obrigatório atualizar os arquivos do projeto Apps Script e criar uma **nova versão da implantação existente** antes de testar os novos controles.

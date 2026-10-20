# Arquitetura do sistema

```
[Equipe no GitHub Pages HTTPS]
             │
             ▼
[index.html / styles.css / app.js]
             │ postMessage (origem autorizada, canal aleatório)
             ▼
[Bridge.html — Apps Script HtmlService]
             │ google.script.run
             ▼
[Code.gs — valida token, função, perfil, regras, lock]
             │
             ▼
[Google Sheets — BANCO PRIVADO]
  ├ INVENTARIOS
  ├ BASE_ESTOQUE (snapshot do SAP)
  ├ RODADAS
  ├ CONTAGENS (append-only)
  ├ RESULTADOS (snapshot do fechamento)
  ├ APROVACOES
  ├ USUARIOS / SESSOES
  ├ CONFIG
  └ AUDITORIA

[SAP ESTOQUE 1025-1026] --somente leitura / instalação--> [BASE_ESTOQUE]
```

## Chaves

- Material no inventário: `inventario_id + codigo + centro + deposito`.
- Posição física por lançamento: `rua + zona + posicao + palete`, cada campo inteiro > 0; para quantidade zero, pode ficar sem endereço.
- Transação: `lancamento_id`, com chave de idempotência `request_id` enviada pelo navegador.
- Rodada: `rodada_id` e número 1, 2 ou 3, agrupada por `inventario_id + centro + deposito`.

## Máquina de estados

| Rodada | Material-alvo | Depois do encerramento |
| --- | --- | --- |
| 1 | Todos os SKUs da combinação Centro + Depósito | Quantidade igual SAP = conferido; diferente = alvo da rodada 2 |
| 2 | Somente SKUs divergentes da rodada 1 | Igual = conferido; diferente = alvo da rodada 3 |
| 3 | Somente SKUs divergentes da rodada 2 | Igual = conferido; diferente = aguardando aprovação |

A rodada **não fecha** se faltar ao menos um material-alvo sem lançamento. Sem registro não significa zero. O supervisor precisa validar cobertura do armazém, inclusive materiais não encontrados.

## Precisão e soma

- Cada observação registra sua própria quantidade e localização.
- O fechamento totaliza por SKU dentro de uma rodada; não mistura quantidade da rodada 1 com 2/3.
- O dashboard apresenta os endereços da rodada mais recente do SKU. É uma fotografia da contagem e não necessariamente o endereçamento mestre do SAP.
- Decimal numérico é armazenado em ponto flutuante no Sheets; a comparação normaliza a diferença para 3 casas decimais. Para operações com maior rigor decimal, evoluir para unidades inteiras escalonadas (por exemplo milésimos de KG).

## Concorrência

- `LockService.getScriptLock()` serializa escritas críticas.
- A cada envio, o backend verifica rodada aberta, SKU permitido, usuário autorizado e UUID da requisição, sob o mesmo lock.
- A implementação utiliza leituras por aba inteira em alguns endpoints. Esse é um **MVP** e deve ser testado em carga. Em cenário de dezenas de contadores e milhares de registros simultâneos, considerar índices/cache, divisão de dados e/ou Postgres (Supabase, Cloud SQL) para garantir latência e disponibilidade.
- Google Sheets não é transacional: exceções durante um fechamento multi-linha podem deixar um fechamento incompleto. **Não use o banco em produção sem rotina de recuperação, cópia de segurança e testes de falha.**

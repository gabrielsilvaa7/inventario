/** Execute com Node.js 18+: node tests/backend.smoke.test.js
 * Emula APIs básicas do Apps Script para testes de regras, sem conexão com o Drive.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
class Sheet {
  constructor(name='',rows=[]){this.name=name;this.rows=rows.map(r=>r.slice());}
  setName(n){this.name=n;return this;}
  getLastRow(){return this.rows.length;}
  getMaxRows(){return 10000;}
  insertRowsAfter(){return this;}
  getSheetName(){return this.name;}
  getDataRange(){return {getDisplayValues:()=>this.rows.map(r=>r.map(x=>String(x??''))),getValues:()=>this.rows.map(r=>r.slice())};}
  setFrozenRows(){return this;}
  getRange(row,col,n=1,m=1){const self=this;return {
    setValues(values){for(let i=0;i<n;i++){const at=row-1+i;while(self.rows.length<=at)self.rows.push([]);for(let j=0;j<m;j++)self.rows[at][col-1+j]=values[i][j];}return this;},
    setValue(value){return this.setValues([[value]]);},
    clearContent(){for(let i=0;i<n;i++){const at=row-1+i;for(let j=0;j<m;j++)if(self.rows[at])self.rows[at][col-1+j]='';}while(self.rows.length>0&&self.rows[self.rows.length-1].every(x=>x===''||x===undefined))self.rows.pop();return this;},
    getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>self.rows[row-1+i]?.[col-1+j]??''));},
    setBackground(){return this;},setFontWeight(){return this;}
  };}
}
class Spreadsheet {
  constructor(id,name,init=false){this.id=id;this.name=name;this.sheets=init?[]:[new Sheet('Planilha1')];}
  getSheetByName(n){return this.sheets.find(x=>x.name===n)||null;}
  getSheets(){return this.sheets;}
  insertSheet(n){const x=new Sheet(n);this.sheets.push(x);return x;}
  getId(){return this.id;}
  getUrl(){return 'https://docs.google.com/spreadsheets/d/'+this.id+'/edit';}
}
const header=['CODIGO PRODUTO','DESCRIÇÃO PRODUTO','UNIDADE DE MEDIDA','CENTRO','DEPÓSITO','DESCRIÇÃO DO DEPÓSITO','QUANTIDADE','VALOR','MOEDA','ESTOQUE BLOQUEADO','EM TRANSFERENCIA (CENTRO)','TRANSITO E TE'];
const source=new Spreadsheet('source-sap','SAP',true);source.sheets.push(new Sheet('Data',[header,
 ['1000','Produto A','UN','1025','1','Livre Utilização','10','100,00','BRL','0','0','0'],
 ['2000','Produto KG','KG','1025','1','Livre Utilização','1,250','20,00','BRL','0','0','0'],
 ['3000','Produto ausente','UN','1025','1','Livre Utilização','1','5,00','BRL','0','0','0'],
 ['1000','Produto A','UN','1025','9','Descasado','2','20,00','BRL','0','0','0']
]));
const sheets=new Map([['source-sap',source]]);
const props=new Map([['SAP_SOURCE_ID','source-sap'],['WEB_ORIGIN','https://empresa.github.io'],['ADMIN_USER','ADMIN'],['ADMIN_PASSWORD','senha-inicial-supersegura']]);
const cache=new Map();const logs=[];
const env={
  console,Date,JSON,Math,Map,Set,String,Number,Array,Error,Object,RegExp,
  SpreadsheetApp:{openById:id=>{if(!sheets.has(id))throw Error('planilha desconhecida');return sheets.get(id);},create:name=>{const id='db-'+crypto.randomUUID();const sheet=new Spreadsheet(id,name);sheets.set(id,sheet);return sheet;}},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})},
  Utilities:{getUuid:()=>crypto.randomUUID(),computeDigest:(_,value)=>Array.from(crypto.createHash('sha256').update(String(value)).digest()).map(b=>b>127?b-256:b),DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'}},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
  Logger:{log:x=>logs.push(x)}
};
vm.createContext(env);vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname,'../apps-script/Code.gs'),'utf8'),env);
function fail(fn,re){assert.throws(fn,re);}
const installed=env.instalarProjeto();assert.equal(installed.itens,4);assert.equal(installed.setores,2);
assert(!props.has('ADMIN_PASSWORD'),'a senha do bootstrap deveria ser removida');
assert.throws(()=>env.instalarProjeto(),/já instalado/);
const token=env.entrar({usuario:'admin',senha:'senha-inicial-supersegura'}).token;
assert.equal(env.sessaoAtual({token}).usuario.perfil,'ADMIN');
assert.equal(env.estadoAmbiente({token}).modo,'TESTE');
assert.equal(props.get('INVENTARIO_MODO'),'TESTE');

// Integração: prévia, atualização versionada e preservação da fonte SAP.
const sapSheet=source.getSheetByName('Data');
const originalRows=sapSheet.rows.map(row=>row.slice());
const preview0=env.previsualizarAtualizacaoSAP({token});
assert.equal(preview0.ha_alteracoes,false);
sapSheet.rows=sapSheet.rows.filter(row=>row[0]!=='3000');
sapSheet.rows.find(row=>row[0]==='1000'&&row[4]==='1')[6]='13';
sapSheet.rows.push(['4000','Produto Novo','UN','1025','16','Entrada','9','90,00','BRL','0','0','0']);
const previewSAP=env.previsualizarAtualizacaoSAP({token});
assert.equal(previewSAP.novos,1);
assert.equal(previewSAP.removidos,1);
assert.equal(previewSAP.alterados,1);
assert.equal(previewSAP.pode_atualizar,true);
assert.equal(env.table_('BASE_ESTOQUE').find(x=>x.codigo==='1000'&&x.deposito==='1').quantidade_sap,10);
fail(()=>env.atualizarBaseSAP({token,assinatura:'inválida',confirmacao:'ATUALIZAR BASE SAP'}),/prévia/);
const import1=env.atualizarBaseSAP({token,assinatura:previewSAP.assinatura,confirmacao:'ATUALIZAR BASE SAP'});
assert.equal(import1.ok,true);
assert.equal(env.table_('RODADAS').length,3);
assert.equal(env.table_('BASE_ESTOQUE').find(x=>x.codigo==='1000'&&x.deposito==='1').quantidade_sap,13);
assert(env.table_('BASE_ESTOQUE').some(x=>x.codigo==='4000'));
assert.equal(sheets.get(props.get('DB_SPREADSHEET_ID')).getSheetByName('BASE_ESTOQUE').getLastRow(),5,'snapshot original preservado');
assert.equal(env.previsualizarAtualizacaoSAP({token}).ha_alteracoes,false);
sapSheet.rows=originalRows.map(row=>row.slice());
const previewRetorno=env.previsualizarAtualizacaoSAP({token});
env.atualizarBaseSAP({token,assinatura:previewRetorno.assinatura,confirmacao:'ATUALIZAR BASE SAP'});
assert.equal(env.table_('RODADAS').length,2);
assert.equal(env.table_('BASE_ESTOQUE').length,4);
assert.equal(env.table_('BASE_ESTOQUE').find(x=>x.codigo==='1000'&&x.deposito==='1').quantidade_sap,10);
assert.equal(env.table_('AUDITORIA').filter(e=>e.acao==='BASE_SAP_ATUALIZADA').length,2);

fail(()=>env.estadoAmbiente({token:'token-invalido'}),/Sessão/);
for(const u of ['CONTA','CONTB','CONTC'])env.cadastrarUsuario({token,usuario:{usuario:u,nome:'Contador '+u,senha:'senhafortedez123',perfil:'CONTADOR'}});
const login=u=>env.entrar({usuario:u,senha:'senhafortedez123'}).token;
const a=login('CONTA'),b=login('CONTB'),c=login('CONTC');
fail(()=>env.previsualizarAtualizacaoSAP({token:a}),/administrador/);
fail(()=>env.atualizarBaseSAP({token:a,confirmacao:'ATUALIZAR BASE SAP'}),/administrador/);
const count=(t,code,qty,location={},depot='1',req)=>env.salvarContagem({token:t,centro:'1025',deposito:depot,codigo:code,quantidade:qty,rua:location.rua??'',zona:location.zona??'',posicao:location.posicao??'',palete:location.palete??'',request_id:req||crypto.randomUUID()});
// Carregamento único do catálogo para busca local: somente SKUs permitidos por setor/usuário.
fail(()=>env.catalogoProdutos({token:'invalido',centro:'1025',deposito:'1'}),/Sessão/);
assert.equal(env.catalogoProdutos({token:a,centro:'1025',deposito:'1'}).itens.length,3);
assert.equal(env.catalogoProdutos({token:a,centro:'1025',deposito:'9'}).itens.length,1);
assert.equal(env.catalogoProdutos({token:a,centro:'1025',deposito:'99'}).itens.length,0);
fail(()=>env.filtrarAcompanhamento({token:a,acompanhamento:{centro:'1025',deposito:'1'}}),/supervisor/);
const quickBefore=env.filtrarAcompanhamento({token,acompanhamento:{centro:'1025',deposito:'1',termo:'2000'}});
assert.equal(quickBefore.total,3);
assert.equal(quickBefore.total_filtrado,1);
assert.equal(quickBefore.itens[0].codigo,'2000');
// As sugestões são privadas, limitadas ao centro/deposito/rodada e pesquisáveis por descrição.
fail(()=>env.sugerirProdutos({token:'invalido',centro:'1025',deposito:'1',termo:'prod'}),/Sessão/);
assert.equal(env.sugerirProdutos({token:a,centro:'1025',deposito:'1',termo:'prod'}).itens.length,3);
assert.equal(env.sugerirProdutos({token:a,centro:'1025',deposito:'1',termo:'1000'}).itens[0].codigo,'1000');
assert.equal(env.sugerirProdutos({token:a,centro:'1025',deposito:'9',termo:'produto'}).itens.length,1);
assert.equal(env.sugerirProdutos({token:a,centro:'1025',deposito:'1',termo:'a'}).itens.length,0);
const beforeClose=env.painel({token,acompanhamento:{centro:'1025',deposito:'1'}}).acompanhamento;
assert.equal(beforeClose.total,3);
assert.equal(beforeClose.contados,0);
assert.equal(beforeClose.conclusao,0);
assert.equal(beforeClose.itens.find(x=>x.codigo==='1000').situacao,'Não iniciado');
assert(!('auditoria' in env.painel({token})), 'auditoria não deve ser exposta pelo dashboard');
fail(()=>env.painel({token:a}),/supervisor/);
fail(()=>count(a,'9999',1,{rua:1,zona:1,posicao:1,palete:1}),/ausente/);
fail(()=>count(a,'1000','1,5',{rua:1,zona:1,posicao:1,palete:1}),/casa/);
fail(()=>count(a,'1000','1',{rua:0,zona:1,posicao:1,palete:1}),/inteiro/);
const l1={rua:3,zona:2,posicao:15,palete:4},l2={rua:4,zona:2,posicao:8,palete:1};
const uuid=crypto.randomUUID();count(a,'1000',8,l1,'1',uuid);assert.equal(count(a,'1000',8,l1,'1',uuid).duplicado,true);
count(a,'1000',1,l2);count(a,'2000','1,250',l1);
assert.equal(env.previsualizarAtualizacaoSAP({token}).pode_atualizar,false);
fail(()=>env.atualizarBaseSAP({token,assinatura:'errado',confirmacao:'ATUALIZAR BASE SAP'}),/CONTAGENS/);
const duringFirst=env.painel({token,acompanhamento:{centro:'1025',deposito:'1',pagina:1,termo:'1000'}}).acompanhamento;
assert.equal(duringFirst.contados,2);
assert.equal(duringFirst.progresso,67);
assert.equal(duringFirst.conclusao,0);
assert.equal(duringFirst.total_filtrado,1);
assert.equal(duringFirst.itens[0].rodadas[0],'EM_CONTAGEM');
assert.equal(env.filtrarAcompanhamento({token,acompanhamento:{centro:'1025',deposito:'1',termo:'1000'}}).itens[0].rodadas[0],'EM_CONTAGEM');

assert.equal(duringFirst.itens[0].situacao,'1ª contagem em andamento');
fail(()=>env.encerrarRodada({token,rodada_id:env.carregarContexto({token}).setores.find(x=>x.deposito==='1').rodada_id}),/sem contagem/);
count(a,'3000',0);
const firstRound=env.carregarContexto({token}).setores.find(x=>x.deposito==='1').rodada_id;
const firstClose=env.encerrarRodada({token,rodada_id:firstRound});assert.equal(firstClose.divergentes,2);
// Reabertura de fechamento acidental: lançamentos e resultado histórico permanecem.
fail(()=>env.reabrirRodada({token:a,rodada_id:firstRound,motivo:'Fechado antes do inventário terminar'}),/supervisor/);
fail(()=>env.reabrirRodada({token,rodada_id:firstRound,motivo:'curto'}),/justificativa/);
fail(()=>env.reabrirRodada({token,rodada_id:'id-nao-existe',motivo:'Fechamento incorreto da rodada'}),/não encontrada/);
assert.equal(env.painel({token}).setores.find(x=>x.deposito==='1').pode_reabrir,true);
const originallyClosed=env.resultadosAtivos_().filter(x=>x.rodada_id===firstRound);
assert.equal(originallyClosed.length,3);
const launchCountBeforeReopen=env.table_('CONTAGENS').length;
const reopenedFirst=env.reabrirRodada({token,rodada_id:firstRound,motivo:'Encerrado antes do término da verificação física'});
assert.equal(reopenedFirst.lancamentos_preservados,true);
assert.equal(env.carregarContexto({token}).setores.find(x=>x.deposito==='1').status,'ABERTA');
assert.equal(env.resultadosAtivos_().filter(x=>x.rodada_id===firstRound).length,0,'resultado fechado deve sair dos indicadores');
assert.equal(env.table_('RESULTADOS').filter(x=>x.rodada_id===firstRound&&x.status==='REABERTO').length,3,'histórico não pode ser apagado');
assert.equal(env.table_('CONTAGENS').length,launchCountBeforeReopen);
assert.equal(env.painel({token,acompanhamento:{centro:'1025',deposito:'1'}}).acompanhamento.concluidos,0,'dashboard não pode exibir resultado anulado como conferido');
fail(()=>env.reabrirRodada({token,rodada_id:firstRound,motivo:'Fechamento incorreto da rodada'}),/deve estar encerrada/);
// O operador pode lançar novamente, preservando quantidade total.
count(a,'1000',0);
assert.equal(env.encerrarRodada({token,rodada_id:firstRound}).divergentes,2);
const currentResultIds=env.resultadosAtivos_().filter(x=>x.rodada_id===firstRound).map(x=>x.resultado_id);
assert.equal(currentResultIds.length,3);
assert(currentResultIds.every(id=>!originallyClosed.some(x=>x.resultado_id===id)),'novo fechamento deve gerar novos resultados');
assert(env.table_('AUDITORIA').some(x=>x.acao==='RODADA_REABERTA'&&String(x.detalhes).includes('Encerrado antes')));

const closedFirst=env.painel({token,acompanhamento:{centro:'1025',deposito:'1'}}).acompanhamento;
assert.equal(closedFirst.contados,3);
assert.equal(closedFirst.concluidos,1);
assert.equal(closedFirst.progresso,100);
assert.equal(closedFirst.itens.find(x=>x.codigo==='2000').rodadas[0],'CONFERIDO');
assert.equal(closedFirst.itens.find(x=>x.codigo==='2000').situacao,'Estoque Batendo');
assert.equal(closedFirst.itens.find(x=>x.codigo==='1000').rodadas[0],'SEGUNDA_CONTAGEM');
assert.equal(closedFirst.itens.find(x=>x.codigo==='1000').situacao,'Aguardando 2ª contagem');
assert.equal(env.catalogoProdutos({token:a,centro:'1025',deposito:'1'}).itens.length,0,'rodada encerrada não permite catálogo');
assert.equal(env.sugerirProdutos({token:a,centro:'1025',deposito:'1',termo:'2000'}).itens.length,0);
fail(()=>count(a,'1000',2,l1),/encerrada/);
let second=env.abrirProximaRodada({token,centro:'1025',deposito:'1'});assert.equal(second.alvos,2);
fail(()=>env.reabrirRodada({token,rodada_id:firstRound,motivo:'Há mais produtos a registrar na primeira'}),/posterior/);
fail(()=>env.consultarProduto({token:b,centro:'1025',deposito:'1',codigo:'2000'}),/já foi conferido/);
fail(()=>count(a,'1000',10,l1),/Outro contador/);
count(b,'1000',10,l1);count(b,'3000',0);
const duringSecond=env.painel({token,acompanhamento:{centro:'1025',deposito:'1'}}).acompanhamento;
assert.equal(duringSecond.itens.find(x=>x.codigo==='1000').rodadas[1],'EM_CONTAGEM');
assert.equal(env.sugerirProdutos({token:a,centro:'1025',deposito:'1',termo:'1000'}).itens.length,0, 'não mostrar SKU proibido em segunda rodada');
assert.equal(env.catalogoProdutos({token:a,centro:'1025',deposito:'1'}).itens.length,0,'contador anterior não pode buscar SKU novamente');
assert.equal(env.catalogoProdutos({token:b,centro:'1025',deposito:'1'}).itens.length,2,'segundo contador pode buscar divergentes');

assert.equal(env.sugerirProdutos({token:b,centro:'1025',deposito:'1',termo:'1000'}).itens.length,1);
assert.equal(env.encerrarRodada({token,rodada_id:second.rodada_id}).divergentes,1);
// Retomada de execução parcialmente interrompida: alguns resultados já foram invalidados.
const testDb=sheets.get(props.get('DB_SPREADSHEET_ID'));
const roundsTable=env.sh_('RODADAS');
const resultsTable=testDb.getSheetByName('RESULTADOS');
const roundTwoRow=roundsTable.rows.findIndex(x=>x[0]===second.rodada_id);
const secondResultRow=resultsTable.rows.findIndex(x=>x[2]===second.rodada_id);
assert(roundTwoRow>0 && secondResultRow>0);
roundsTable.rows[roundTwoRow][5]='REABRINDO';
resultsTable.rows[secondResultRow][10]='REABERTO';
assert.equal(env.painel({token}).setores.find(x=>x.deposito==='1').status,'REABRINDO');
const recoveredReopen=env.reabrirRodada({token,rodada_id:second.rodada_id,motivo:'Retomando reabertura interrompida pelo servidor'});
assert.equal(recoveredReopen.numero,2);
assert.equal(env.carregarContexto({token}).setores.find(x=>x.deposito==='1').status,'ABERTA');
assert.equal(env.resultadosAtivos_().filter(x=>x.rodada_id===second.rodada_id).length,0);
assert.equal(env.encerrarRodada({token,rodada_id:second.rodada_id}).divergentes,1);

const closedSecond=env.painel({token,acompanhamento:{centro:'1025',deposito:'1'}}).acompanhamento;
assert.equal(closedSecond.itens.find(x=>x.codigo==='1000').rodadas[1],'CONFERIDO');
assert.equal(closedSecond.itens.find(x=>x.codigo==='1000').situacao,'Estoque Batendo');
assert.equal(closedSecond.itens.find(x=>x.codigo==='3000').rodadas[1],'DIVERGENTE');
assert.equal(closedSecond.itens.find(x=>x.codigo==='3000').situacao,'Aguardando 3ª contagem');
let third=env.abrirProximaRodada({token,centro:'1025',deposito:'1'});assert.equal(third.alvos,1);
fail(()=>count(b,'3000',0),/Outro contador/);
count(c,'3000',0);assert.equal(env.encerrarRodada({token,rodada_id:third.rodada_id}).divergentes,1);
const closedThird=env.painel({token,acompanhamento:{centro:'1025',deposito:'1'}}).acompanhamento;
assert.equal(closedThird.batendo,2);
assert.equal(closedThird.divergentes,1);
assert.equal(closedThird.concluidos,3);
assert.equal(closedThird.conclusao,100);
assert.equal(closedThird.itens.find(x=>x.codigo==='3000').rodadas[2],'DIVERGENTE');
assert.equal(closedThird.itens.find(x=>x.codigo==='3000').situacao,'Estoque Divergente');
assert.equal(env.painel({token,acompanhamento:{centro:'1025',deposito:'1',termo:'cobre'}}).acompanhamento.total_filtrado,0);
assert.equal(env.painel({token,acompanhamento:{centro:'1025',deposito:'1',termo:'produto'}}).acompanhamento.total_filtrado,3);
assert.equal(env.painel({token,acompanhamento:{centro:'1025',deposito:'9'}}).acompanhamento.total,1);
fail(()=>env.abrirProximaRodada({token,centro:'1025',deposito:'1'}),/três rodadas/);
let panel=env.painel({token});assert.equal(panel.resumo.conferidos,2);assert.equal(panel.resumo.pendentes_aprovacao,1);
const final=panel.divergencias[0];assert.equal(final.codigo,'3000');
fail(()=>env.aprovarDivergencia({token,resultado_id:final.resultado_id,motivo:'breve'}),/oito/);
env.aprovarDivergencia({token,resultado_id:final.resultado_id,motivo:'Conferido fisicamente com a equipe de armazém'});
fail(()=>env.reabrirRodada({token,rodada_id:third.rodada_id,motivo:'Tentativa após aprovação de divergência'}),/aprovação/);
panel=env.painel({token});assert.equal(panel.resumo.pendentes_aprovacao,0);
assert.equal(panel.setores.find(x=>x.deposito==='1').pode_reabrir,false);
assert.equal(panel.resumo.aprovados,1);
const address=panel.enderecos.filter(x=>x.codigo==='1000'&&x.deposito==='1');
assert.equal(address.length,1);assert.equal(address[0].quantidade,10);
// Simula falha parcial de fechamento: RESULTADOS já recebeu a linha, mas rodada continua aberta.
const sector9=env.carregarContexto({token}).setores.find(x=>x.deposito==='9');
count(a,'1000',2,l1,'9');
const db=sheets.get(props.get('DB_SPREADSHEET_ID'));
db.getSheetByName('RESULTADOS').rows.push([crypto.randomUUID(),installed.inventario_id,sector9.rodada_id,1,'1000','1025','9',2,2,0,'CONFERIDO',new Date().toISOString()]);
fail(()=>count(a,'1000',1,l1,'9'),/processo de fechamento/);
const recovered=env.encerrarRodada({token,rodada_id:sector9.rodada_id});assert.equal(recovered.divergentes,0);
assert.equal(db.getSheetByName('RESULTADOS').rows.filter(x=>x[2]===sector9.rodada_id).length,1,'não duplicar resultados na recuperação');
assert.equal(source.getSheetByName('Data').getLastRow(),5,'fonte SAP deveria permanecer intacta');
// Administração de ambiente: simulamos três rodadas, aprovações e depois limpeza total.
const before=env.estadoAmbiente({token});
assert(before.quantidades.contagens>0 && before.quantidades.resultados>0 && before.quantidades.aprovacoes>0);
fail(()=>env.limparDadosTeste({token:a,confirmacao:'APAGAR TESTES'}),/administrador/);
fail(()=>env.limparDadosTeste({token,confirmacao:'ERRADO'}),/Confirmação/);
fail(()=>env.iniciarInventarioOficial({token,confirmacao:'INICIAR INVENTARIO OFICIAL'}),/dados ou rodadas de teste/);
const cleaned=env.limparDadosTeste({token,confirmacao:'APAGAR TESTES'});
assert.equal(cleaned.modo,'TESTE');assert.equal(cleaned.setores_restaurados,2);
for(const name of ['CONTAGENS','RESULTADOS','APROVACOES'])assert.equal(env.table_(name).length,0,name+' não foi limpa');
assert.equal(env.table_('RODADAS').length,2);
assert(env.table_('RODADAS').every(x=>Number(x.numero)===1&&x.status==='ABERTA'));
assert.equal(env.painel({token,acompanhamento:{centro:'1025',deposito:'1'}}).acompanhamento.conclusao,0);
assert.equal(env.table_('BASE_ESTOQUE').length,4);
assert.equal(env.table_('USUARIOS').length,4);
assert.equal(env.table_('AUDITORIA').length,1);
assert.equal(env.table_('AUDITORIA')[0].acao,'AMBIENTE_TESTE_LIMPO');
assert.equal(env.painel({token}).resumo.total_lancamentos,0);
// Paginação do acompanhamento e interpretação da 3ª rodada conferida.
const many=Array.from({length:61},(_,i)=>({chave:(7000+i)+'|1025|1',codigo:String(7000+i),descricao:'Tubo cobre '+i,centro:'1025',deposito:'1'}));
const paged=env.acompanharProdutos_(many,[],[],[],{centro:'1025',deposito:'1',pagina:2});
assert.equal(paged.total,61);assert.equal(paged.total_paginas,2);assert.equal(paged.itens.length,11);
const pagedSearch=env.acompanharProdutos_(many,[],[],[],{centro:'1025',deposito:'1',termo:'TUBO',pagina:99});
assert.equal(pagedSearch.pagina,2);
const thirdPass=env.acompanharProdutos_(many,[],[
  {codigo:'7000',centro:'1025',deposito:'1',numero:1,diferenca:1},
  {codigo:'7000',centro:'1025',deposito:'1',numero:2,diferenca:1},
  {codigo:'7000',centro:'1025',deposito:'1',numero:3,diferenca:0}
],[],{centro:'1025',deposito:'1'}).itens[0];
assert.equal(thirdPass.rodadas[0],'SEGUNDA_CONTAGEM');
assert.equal(thirdPass.rodadas[1],'DIVERGENTE');
assert.equal(thirdPass.rodadas[2],'CONFERIDO');
assert.equal(thirdPass.situacao,'Estoque Batendo');
// É possível repetir o teste e a limpeza antes da ativação oficial.
count(a,'1000',2,l1);
assert.equal(env.table_('CONTAGENS').length,1);
env.limparDadosTeste({token,confirmacao:'APAGAR TESTES'});
fail(()=>env.iniciarInventarioOficial({token:a,confirmacao:'INICIAR INVENTARIO OFICIAL'}),/administrador/);
fail(()=>env.iniciarInventarioOficial({token,confirmacao:'CONFIRMO'}),/Confirmação/);
const official=env.iniciarInventarioOficial({token,confirmacao:'INICIAR INVENTARIO OFICIAL'});
assert.equal(official.modo,'OFICIAL');assert.equal(props.get('INVENTARIO_MODO'),'OFICIAL');
assert.equal(env.estadoAmbiente({token}).modo,'OFICIAL');
assert.equal(env.previsualizarAtualizacaoSAP({token}).pode_atualizar,false);
fail(()=>env.atualizarBaseSAP({token,assinatura:'x',confirmacao:'ATUALIZAR BASE SAP'}),/OFICIAL|congelada/);
assert.equal(env.carregarContexto({token:a}).modo,'OFICIAL');
fail(()=>env.limparDadosTeste({token,confirmacao:'APAGAR TESTES'}),/proibida/);
fail(()=>env.iniciarInventarioOficial({token,confirmacao:'INICIAR INVENTARIO OFICIAL'}),/OFICIAL/);
assert.equal(env.table_('RODADAS').length,2);
count(a,'1000',3,l2);assert.equal(env.painel({token}).resumo.total_lancamentos,1);
// No modo oficial: reabrir NÃO equivale a limpeza e continua possível com auditoria.
count(a,'2000','1,250',l1);
count(a,'3000',0);
const officialRound=env.carregarContexto({token}).setores.find(x=>x.deposito==='1').rodada_id;
assert.equal(env.encerrarRodada({token,rodada_id:officialRound}).numero,1);
assert.equal(env.reabrirRodada({token,rodada_id:officialRound,motivo:'Necessário completar conferência no modo oficial'}).numero,1);
assert.equal(props.get('INVENTARIO_MODO'),'OFICIAL');
assert.equal(env.table_('RESULTADOS').filter(x=>x.rodada_id===officialRound).every(x=>x.status==='REABERTO'),true);
assert.equal(env.table_('CONTAGENS').filter(x=>x.rodada_id===officialRound).length,3);

fail(()=>env.limparDadosTeste({token,confirmacao:'APAGAR TESTES'}),/proibida/);
assert.equal(env.table_('CONTAGENS').length,3);
assert.equal(source.getSheetByName('Data').getLastRow(),5,'fonte SAP não deve mudar durante resets/ativação');
env.sair({token});fail(()=>env.sessaoAtual({token}),/expirada|inválida/);
console.log('OK: reabertura supervisionada, preservação/auditoria, bloqueios de rodada posterior e aprovação, recuperação e modo oficial; pesquisa por código/descrição; dashboard progressivo das 3 rodadas, fechamento, percentuais, centros/depósitos, ocultação de auditoria; inventário TESTE/OFICIAL e demais regras.');

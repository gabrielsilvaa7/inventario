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
for(const u of ['CONTA','CONTB','CONTC'])env.cadastrarUsuario({token,usuario:{usuario:u,nome:'Contador '+u,senha:'senhafortedez123',perfil:'CONTADOR'}});
const login=u=>env.entrar({usuario:u,senha:'senhafortedez123'}).token;
const a=login('CONTA'),b=login('CONTB'),c=login('CONTC');
const count=(t,code,qty,location={},depot='1',req)=>env.salvarContagem({token:t,centro:'1025',deposito:depot,codigo:code,quantidade:qty,rua:location.rua??'',zona:location.zona??'',posicao:location.posicao??'',palete:location.palete??'',request_id:req||crypto.randomUUID()});
fail(()=>env.painel({token:a}),/supervisor/);
fail(()=>count(a,'9999',1,{rua:1,zona:1,posicao:1,palete:1}),/ausente/);
fail(()=>count(a,'1000','1,5',{rua:1,zona:1,posicao:1,palete:1}),/casa/);
fail(()=>count(a,'1000','1',{rua:0,zona:1,posicao:1,palete:1}),/inteiro/);
const l1={rua:3,zona:2,posicao:15,palete:4},l2={rua:4,zona:2,posicao:8,palete:1};
const uuid=crypto.randomUUID();count(a,'1000',8,l1,'1',uuid);assert.equal(count(a,'1000',8,l1,'1',uuid).duplicado,true);
count(a,'1000',1,l2);count(a,'2000','1,250',l1);
fail(()=>env.encerrarRodada({token,rodada_id:env.carregarContexto({token}).setores.find(x=>x.deposito==='1').rodada_id}),/sem contagem/);
count(a,'3000',0);
const firstRound=env.carregarContexto({token}).setores.find(x=>x.deposito==='1').rodada_id;
const firstClose=env.encerrarRodada({token,rodada_id:firstRound});assert.equal(firstClose.divergentes,2);
fail(()=>count(a,'1000',2,l1),/encerrada/);
let second=env.abrirProximaRodada({token,centro:'1025',deposito:'1'});assert.equal(second.alvos,2);
fail(()=>env.consultarProduto({token:b,centro:'1025',deposito:'1',codigo:'2000'}),/já foi conferido/);
fail(()=>count(a,'1000',10,l1),/Outro contador/);
count(b,'1000',10,l1);count(b,'3000',0);
assert.equal(env.encerrarRodada({token,rodada_id:second.rodada_id}).divergentes,1);
let third=env.abrirProximaRodada({token,centro:'1025',deposito:'1'});assert.equal(third.alvos,1);
fail(()=>count(b,'3000',0),/Outro contador/);
count(c,'3000',0);assert.equal(env.encerrarRodada({token,rodada_id:third.rodada_id}).divergentes,1);
fail(()=>env.abrirProximaRodada({token,centro:'1025',deposito:'1'}),/três rodadas/);
let panel=env.painel({token});assert.equal(panel.resumo.conferidos,2);assert.equal(panel.resumo.pendentes_aprovacao,1);
const final=panel.divergencias[0];assert.equal(final.codigo,'3000');
fail(()=>env.aprovarDivergencia({token,resultado_id:final.resultado_id,motivo:'breve'}),/oito/);
env.aprovarDivergencia({token,resultado_id:final.resultado_id,motivo:'Conferido fisicamente com a equipe de armazém'});
panel=env.painel({token});assert.equal(panel.resumo.pendentes_aprovacao,0);
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
env.sair({token});fail(()=>env.sessaoAtual({token}),/expirada|inválida/);
console.log('OK: importação, login, perfis, endereços, zero, idempotência, bloqueio por rodada, 3 rodadas, aprovação, dashboard, logout.');

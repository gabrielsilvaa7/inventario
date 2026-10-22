/** INVENTÁRIO FRIOVIX — Backend Google Apps Script v2
 * IMPORTANTE: configure as Propriedades do script antes de executar instalarProjeto().
 * Este script NÃO modifica a planilha SAP original.
 * Implantar como Aplicativo da Web > Executar como EU > Acesso QUALQUER PESSOA.
 * Segurança depende da validação de sessão em TODAS as operações de negócio.
 */
const SCHEMA = {
  INVENTARIOS: ['inventario_id','nome','criado_em','status','fonte_id'],
  BASE_ESTOQUE: ['inventario_id','chave','codigo','descricao','um','centro','deposito','descricao_deposito','quantidade_sap','valor_sap','moeda','estoque_bloqueado','transferencia_centro','transito_te'],
  USUARIOS: ['usuario_id','usuario','nome','perfil','ativo','salt','hash','criado_em'],
  SESSOES: ['token_hash','usuario','expira_em','criado_em','revogada'],
  RODADAS: ['rodada_id','inventario_id','centro','deposito','numero','status','aberta_em','encerrada_em','encerrada_por'],
  CONTAGENS: ['lancamento_id','request_id','rodada_id','inventario_id','codigo','centro','deposito','rua','zona','posicao','palete','quantidade','usuario','registrado_em'],
  RESULTADOS: ['resultado_id','inventario_id','rodada_id','numero','codigo','centro','deposito','quantidade_sap','quantidade_contada','diferenca','status','fechado_em'],
  APROVACOES: ['aprovacao_id','resultado_id','inventario_id','codigo','centro','deposito','quantidade_sap','quantidade_contada','diferenca','motivo','aprovador','aprovado_em'],
  CONFIG: ['chave','valor'],
  AUDITORIA: ['evento_id','data_hora','usuario','acao','entidade','referencia','detalhes']
};
const DEFAULT_CONFIG = {PERMITIR_MESMO_CONTADOR_ENTRE_RODADAS:'NAO'};
// O modo oficial é irreversível pela aplicação. Fonte da verdade: Propriedades do script (privadas).
const MODO_TESTE = 'TESTE', MODO_OFICIAL = 'OFICIAL';
const SESSION_HOURS = 8;
const PASSWORD_ROUNDS = 5000; // MVP: hash salgado + segredo servidor; auditar autenticação antes de produção crítica.

function props_(){ return PropertiesService.getScriptProperties(); }
function prop_(name){ return String(props_().getProperty(name)||'').trim(); }
function db_(){ const id=prop_('DB_SPREADSHEET_ID'); if(!id)throw Error('Projeto ainda não instalado: DB_SPREADSHEET_ID ausente.'); return SpreadsheetApp.openById(id); }
function sh_(name){
  // A referência única SAP_SNAPSHOT_ATIVO muda base e rodadas simultaneamente.
  let actual=name;
  if(name==='BASE_ESTOQUE'||name==='RODADAS'){
    const raw=prop_('SAP_SNAPSHOT_ATIVO');
    if(raw){
      let snapshot;try{snapshot=JSON.parse(raw);}catch(e){throw Error('Referência de versão da base SAP inválida.');}
      actual=name==='BASE_ESTOQUE'?snapshot.base:snapshot.rodadas;
      if(!/^[A-Za-z0-9_]{1,100}$/.test(str_(actual)))throw Error('Aba de versão da base SAP inválida.');
    }
  }
  const x=db_().getSheetByName(actual);
  if(!x)throw Error('Aba do banco de dados ausente: '+actual);
  return x;
}
function table_(name){ const s=sh_(name),last=s.getLastRow(); if(last<2)return []; const head=SCHEMA[name],values=s.getRange(2,1,last-1,head.length).getValues(); return values.filter(row=>row[0]!==''&&row[0]!==null).map(row=>Object.fromEntries(head.map((h,i)=>[h,row[i]]))); }
function appendMany_(name,rows){ if(!rows.length)return; const sheet=sh_(name),width=SCHEMA[name].length; for(let i=0;i<rows.length;i+=350){const part=rows.slice(i,i+350),start=sheet.getLastRow()+1,needed=start+part.length-1; if(needed>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),Math.max(needed-sheet.getMaxRows(),350)); sheet.getRange(start,1,part.length,width).setValues(part);} }
function iso_(){return new Date().toISOString();}
function str_(s){return String(s===null||s===undefined?'':s).trim();}
function norm_(s){return str_(s).toUpperCase();}
function normalizeKey_(codigo,centro,deposito){return [str_(codigo),str_(centro),str_(deposito)].join('|');}
function uuid_(){return Utilities.getUuid();}
function sha_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,str_(s),Utilities.Charset.UTF_8).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
function random_(){return uuid_().replace(/-/g,'')+uuid_().replace(/-/g,'');}
function passHash_(password,salt){let h=str_(password)+'|'+str_(salt)+'|'+prop_('AUTH_PEPPER');for(let i=0;i<PASSWORD_ROUNDS;i++)h=sha_(h);return h;}
function decimal_(raw,label){ if(typeof raw==='number'){if(!Number.isFinite(raw))throw Error(label+' inválido.');return raw;}const v=str_(raw);if(!v)throw Error(label+' obrigatório.');let txt=v;if(txt.includes(','))txt=txt.replace(/\./g,'').replace(',','.');if(!/^-?\d+(\.\d+)?$/.test(txt))throw Error(label+' inválido.');const n=Number(txt);if(!Number.isFinite(n))throw Error(label+' inválido.');return n;}
function integer_(raw,label){const n=Number(raw);if(!Number.isSafeInteger(n)||n<1)throw Error(label+' deve ser número inteiro a partir de 1.');return n;}
function noNeg_(n,label){if(n<0)throw Error(label+' não pode ser negativo.');return n;}
function toMillis_(x){const n=new Date(String(x)).getTime();return Number.isFinite(n)?n:0;}
function isSupervisor_(u){return u.perfil==='ADMIN'||u.perfil==='SUPERVISOR';}
function requireSupervisor_(u){if(!isSupervisor_(u))throw Error('Operação permitida somente para supervisor.');}
function requireAdmin_(u){if(u.perfil!=='ADMIN')throw Error('Operação permitida somente para administrador.');}
function writeAudit_(usuario,acao,entidade,ref,detalhes){appendMany_('AUDITORIA',[[uuid_(),iso_(),usuario,acao,entidade,str_(ref),JSON.stringify(detalhes||{})]]);}
function withLock_(fn){const lock=LockService.getScriptLock();lock.waitLock(30000);try{return fn();}finally{lock.releaseLock();}}
function auth_(token){const hash=sha_(str_(token));if(!token||str_(token).length<40)throw Error('Sessão ausente: faça login.');const s=table_('SESSOES').find(x=>x.token_hash===hash&&!x.revogada&&toMillis_(x.expira_em)>Date.now());if(!s)throw Error('Sessão expirada ou inválida. Faça login novamente.');const u=table_('USUARIOS').find(x=>x.usuario===s.usuario&&x.ativo==='SIM');if(!u)throw Error('Usuário desativado.');return {usuario:u.usuario,nome:u.nome,perfil:u.perfil};}
function activeInventory_(){const list=table_('INVENTARIOS').filter(x=>x.status==='ATIVO');if(!list.length)throw Error('Não há inventário ativo.');return list[list.length-1];}
function sector_(inv,center,depot){return table_('RODADAS').filter(x=>x.inventario_id===inv&&str_(x.centro)===str_(center)&&str_(x.deposito)===str_(depot)).sort((a,b)=>Number(a.numero)-Number(b.numero));}
/** Resultados de fechamentos revogados são mantidos para auditoria, mas não para cálculo. */
function resultadosAtivos_(){return table_('RESULTADOS').filter(x=>str_(x.status)!=='REABERTO');}
function targetForRound_(round,base,results){if(Number(round.numero)===1)return base;const prev=results.filter(x=>x.rodada_id!==round.rodada_id&&x.inventario_id===round.inventario_id&&str_(x.centro)===str_(round.centro)&&str_(x.deposito)===str_(round.deposito)&&Number(x.numero)===Number(round.numero)-1&&Math.abs(Number(x.diferenca))>0.0000001);const ids=new Set(prev.map(x=>str_(x.codigo)));return base.filter(x=>ids.has(str_(x.codigo)));}
function inventoryBase_(inv,center,depot){return table_('BASE_ESTOQUE').filter(x=>x.inventario_id===inv&&(center===undefined||center===null||str_(x.centro)===str_(center))&&(depot===undefined||depot===null||str_(x.deposito)===str_(depot)));}
function latestResultsMap_(results){const m=new Map();for(const r of results){const k=normalizeKey_(r.codigo,r.centro,r.deposito),prev=m.get(k);if(!prev||Number(r.numero)>Number(prev.numero))m.set(k,r);}return m;}
function getConfig_(k){const r=table_('CONFIG').find(x=>x.chave===k);return r?str_(r.valor):str_(DEFAULT_CONFIG[k]);}

/** Recontagem de um mesmo material depende de liberação NOMINAL, não do parâmetro global legado. */
function podeRecontarUsuario_(usuario){
  return getConfig_('PERMITIR_RECONTAGEM_USUARIO_'+norm_(usuario))==='SIM';
}
function listarPermissoesContadores(d){
  const u=auth_(d.token);requireSupervisor_(u);
  const prefix='PERMITIR_RECONTAGEM_USUARIO_';
  const permissoes=new Map(table_('CONFIG').filter(x=>str_(x.chave).startsWith(prefix)).map(x=>[str_(x.chave).slice(prefix.length),norm_(x.valor)]));
  return table_('USUARIOS').filter(x=>x.perfil==='CONTADOR'&&x.ativo==='SIM')
    .map(x=>({usuario:str_(x.usuario),nome:str_(x.nome),permitido:permissoes.get(str_(x.usuario))==='SIM'}))
    .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
}
function definirPermissaoContador(d){return withLock_(()=>{
  const u=auth_(d.token);requireSupervisor_(u);
  const username=norm_(d.usuario),permitido=d.permitido;
  if(typeof permitido!=='boolean')throw Error('Permissão inválida: informe verdadeiro ou falso.');
  const target=table_('USUARIOS').find(x=>x.usuario===username&&x.perfil==='CONTADOR'&&x.ativo==='SIM');
  if(!target)throw Error('Contador não encontrado ou inativo.');
  const key='PERMITIR_RECONTAGEM_USUARIO_'+username,value=permitido?'SIM':'NAO';
  const rows=table_('CONFIG'),i=rows.findIndex(x=>x.chave===key),previous=i>=0?norm_(rows[i].valor):'NAO';
  if(i>=0)sh_('CONFIG').getRange(i+2,2).setValue(value);else appendMany_('CONFIG',[[key,value]]);
  writeAudit_(u.usuario,'PERMISSAO_RECONTAGEM_USUARIO','USUARIO',username,{anterior:previous,atual:value});
  return {ok:true,usuario:username,permitido};
});}

function modoOperacao_(){
  const value=norm_(prop_('INVENTARIO_MODO')||MODO_TESTE);
  if(![MODO_TESTE,MODO_OFICIAL].includes(value))throw Error('Modo do inventário inválido. Consulte a administração.');
  return value;
}
function exigirSemLimpeza_(){
  if(prop_('LIMPEZA_EM_ANDAMENTO')==='SIM')throw Error('Limpeza de testes pendente. O administrador deve concluí-la antes de continuar.');
}
function resumoAmbiente_(){
  const nomes=['CONTAGENS','RESULTADOS','APROVACOES','RODADAS'];
  const quantidades=Object.fromEntries(nomes.map(nome=>[nome.toLowerCase(),table_(nome).length]));
  return {modo:modoOperacao_(),limpeza_pendente:prop_('LIMPEZA_EM_ANDAMENTO')==='SIM',
    quantidades,rodadas_superiores:table_('RODADAS').filter(x=>Number(x.numero)>1||x.status!=='ABERTA').length};
}
/** Consulta administrativa; não expõe senhas, tokens ou dados do SAP. */
function estadoAmbiente(d){const u=auth_(d.token);requireAdmin_(u);return resumoAmbiente_();}
/** Exclusivamente modo TESTE: apaga dados operacionais de simulação e restaura rodada 1.
 * Conserva BASE_ESTOQUE, INVENTARIOS, USUARIOS, SESSOES e CONFIG.
 * Em caso de interrupção, bloqueia novas operações até nova chamada de limpeza.
 */
function limparDadosTeste(d){return withLock_(()=>{
  const u=auth_(d.token);requireAdmin_(u);
  if(modoOperacao_()!==MODO_TESTE)throw Error('Limpeza proibida: o inventário já está em modo OFICIAL.');
  if(str_(d.confirmacao)!=='APAGAR TESTES')throw Error('Confirmação inválida. Digite APAGAR TESTES.');
  const inv=activeInventory_(),base=inventoryBase_(inv.inventario_id);
  if(!base.length)throw Error('Não há base SAP disponível para reabrir a rodada inicial.');
  const antes=resumoAmbiente_();
  const setores=[...new Set(base.map(x=>str_(x.centro)+'|'+str_(x.deposito)))].sort();
  props_().setProperty('LIMPEZA_EM_ANDAMENTO','SIM');
  // Limpa os lançamentos de teste e todas as suas dependências, preservando cabeçalhos.
  for(const nome of ['CONTAGENS','RESULTADOS','APROVACOES','RODADAS']){
    const sheet=sh_(nome),last=sheet.getLastRow();
    if(last>1)sheet.getRange(2,1,last-1,SCHEMA[nome].length).clearContent();
  }
  appendMany_('RODADAS',setores.map(item=>{
    const divisor=item.indexOf('|'),centro=item.slice(0,divisor),deposito=item.slice(divisor+1);
    return [uuid_(),inv.inventario_id,centro,deposito,1,'ABERTA',iso_(),'',''];
  }));
  // Eventos gerados nos testes também são descartados; preserva registro do reset atual.
  const log=sh_('AUDITORIA'),last=log.getLastRow();
  if(last>1)log.getRange(2,1,last-1,SCHEMA.AUDITORIA.length).clearContent();
  writeAudit_(u.usuario,'AMBIENTE_TESTE_LIMPO','INVENTARIO',inv.inventario_id,
    {contagens:antes.quantidades.contagens,resultados:antes.quantidades.resultados,
     aprovacoes:antes.quantidades.aprovacoes,rodadas:antes.quantidades.rodadas,
     setores_restaurados:setores.length});
  props_().deleteProperty('LIMPEZA_EM_ANDAMENTO');
  return {ok:true,...resumoAmbiente_(),setores_restaurados:setores.length};
});}
/** Transição permanente TESTE -> OFICIAL. Nunca há método inverso. */
function iniciarInventarioOficial(d){return withLock_(()=>{
  const u=auth_(d.token);requireAdmin_(u);
  if(modoOperacao_()!==MODO_TESTE)throw Error('O inventário já está no modo OFICIAL; não pode ser revertido.');
  exigirSemLimpeza_();
  if(str_(d.confirmacao)!=='INICIAR INVENTARIO OFICIAL')throw Error('Confirmação inválida. Digite INICIAR INVENTARIO OFICIAL.');
  const resumo=resumoAmbiente_();
  if(resumo.quantidades.contagens||resumo.quantidades.resultados||resumo.quantidades.aprovacoes||resumo.rodadas_superiores)
    throw Error('Há dados ou rodadas de teste. Utilize Limpar registros de teste antes de ativar o modo OFICIAL.');
  if(!resumo.quantidades.rodadas)throw Error('Nenhuma rodada inicial está disponível.');
  // Marcar OFICIAL antes de gerar o log para priorizar bloqueio irreversível mesmo se a auditoria falhar.
  props_().setProperty('INVENTARIO_MODO',MODO_OFICIAL);
  const inv=activeInventory_();
  writeAudit_(u.usuario,'MODO_OFICIAL_ATIVADO','INVENTARIO',inv.inventario_id,
    {modo_anterior:MODO_TESTE,modo_novo:MODO_OFICIAL});
  return {ok:true,modo:MODO_OFICIAL};
});}


/** Execute MANUALMENTE no editor Apps Script ANTES de publicar a Web App.
 * Propriedades: SAP_SOURCE_ID, WEB_ORIGIN, ADMIN_USER, ADMIN_PASSWORD.
 */
function instalarProjeto(){
  if(prop_('DB_SPREADSHEET_ID'))throw Error('Banco já instalado. Operação cancelada para preservar dados.');
  const sourceId=prop_('SAP_SOURCE_ID'),origin=prop_('WEB_ORIGIN'),user=norm_(prop_('ADMIN_USER')),password=prop_('ADMIN_PASSWORD');
  if(!sourceId||!origin||!user||!password)throw Error('Configure SAP_SOURCE_ID, WEB_ORIGIN, ADMIN_USER e ADMIN_PASSWORD nas Propriedades do script.');
  if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin))throw Error('WEB_ORIGIN deve ser somente a origem HTTPS, sem caminho nem barra final.');
  if(password.length<12)throw Error('ADMIN_PASSWORD precisa ter no mínimo 12 caracteres.');
  const source=SpreadsheetApp.openById(sourceId).getSheetByName('Data');if(!source)throw Error('Aba Data ausente na planilha SAP de origem.');
  const pepper=random_();props_().setProperty('AUTH_PEPPER',pepper);
  const db=SpreadsheetApp.create('INVENTARIO FRIOVIX - BANCO DE DADOS');props_().setProperty('DB_SPREADSHEET_ID',db.getId());
  const original=db.getSheets()[0];let first=true;
  for(const [name,headers] of Object.entries(SCHEMA)){
    const s=first?original:db.insertSheet(name);first=false;s.setName(name);
    s.getRange(1,1,1,headers.length).setValues([headers]);s.setFrozenRows(1);s.getRange(1,1,1,headers.length).setBackground('#edf1f5').setFontWeight('bold');
  }
  for(const [k,v] of Object.entries(DEFAULT_CONFIG))appendMany_('CONFIG',[[k,v]]);
  const salt=random_();appendMany_('USUARIOS',[[uuid_(),user,'Administrador inicial','ADMIN','SIM',salt,passHash_(password,salt),iso_()]]);
  props_().deleteProperty('ADMIN_PASSWORD');
  const imported=importarSAPInterno_(sourceId,source);
  props_().setProperty('INVENTARIO_MODO',MODO_TESTE);
  writeAudit_(user,'INSTALAR_PROJETO','INVENTARIO',imported.inventario_id,{importados:imported.itens,consolidados:imported.duplicados});
  Logger.log('INSTALAÇÃO CONCLUÍDA. Banco: '+db.getUrl());
  return {banco_url:db.getUrl(),...imported};
}
/** Valida a origem SAP e constrói uma nova fotografia, sem alterar a planilha origem. */
function lerBaseSAP_(source,inventoryId){
  const values=source.getDataRange().getDisplayValues();
  if(values.length<2)throw Error('A base SAP de origem está vazia.');
  const names=values.shift().map(s=>norm_(s).normalize('NFD').replace(/[\u0300-\u036f]/g,''));
  const required=['CODIGO PRODUTO','DESCRICAO PRODUTO','UNIDADE DE MEDIDA','CENTRO','DEPOSITO','DESCRICAO DO DEPOSITO','QUANTIDADE','VALOR','MOEDA','ESTOQUE BLOQUEADO','EM TRANSFERENCIA (CENTRO)','TRANSITO E TE'];
  const indices=required.map(x=>{const n=names.indexOf(x);if(n<0)throw Error('Coluna SAP ausente: '+x);return n;});
  const mapped=new Map();let duplicated=0;
  values.forEach((row,index)=>{
    const c=indices.map(i=>str_(row[i]));
    if(!c[0]){if(c.some(x=>x!==''))throw Error('Linha '+(index+2)+' do SAP sem código de produto.');return;}
    if(!c[3])throw Error('Linha '+(index+2)+' sem centro.');
    if(!c[2])throw Error('Linha '+(index+2)+' sem unidade de medida.');
    if(!c[8])throw Error('Linha '+(index+2)+' sem moeda.');
    const key=normalizeKey_(c[0],c[3],c[4]);
    const qty=decimal_(c[6]||'0','QUANTIDADE na linha '+(index+2));
    const valor=decimal_(c[7]||'0','VALOR na linha '+(index+2));
    const bloq=decimal_(c[9]||'0','ESTOQUE BLOQUEADO');
    const trans=decimal_(c[10]||'0','EM TRANSFERENCIA');
    const te=decimal_(c[11]||'0','TRANSITO E TE');
    if(mapped.has(key)){
      const prev=mapped.get(key);
      if(norm_(prev[4])!==norm_(c[2])||norm_(prev[10])!==norm_(c[8]))throw Error('Mesmo código/centro/depósito com UM ou moeda diferente: '+key);
      prev[8]+=qty;prev[9]+=valor;prev[11]+=bloq;prev[12]+=trans;prev[13]+=te;duplicated++;
    }else mapped.set(key,[inventoryId,key,c[0],c[1],c[2],c[3],c[4],c[5],qty,valor,c[8],bloq,trans,te]);
  });
  if(!mapped.size)throw Error('A origem SAP não contém produtos importáveis.');
  return {registros:[...mapped.values()].sort((a,b)=>a[1].localeCompare(b[1])),duplicados:duplicated};
}
function setoresDaBaseSAP_(registros,inventoryId){
  const setores=[...new Set(registros.map(x=>str_(x[5])+'|'+str_(x[6])))].sort();
  return setores.map(item=>{
    const div=item.indexOf('|'),centro=item.slice(0,div),deposito=item.slice(div+1);
    return [uuid_(),inventoryId,centro,deposito,1,'ABERTA',iso_(),'',''];
  });
}
function importarSAPInterno_(sourceId,source){
  const inv=uuid_(),parsed=lerBaseSAP_(source,inv);
  appendMany_('BASE_ESTOQUE',parsed.registros);
  appendMany_('INVENTARIOS',[[inv,'Inventário Friovix 1025-1026',iso_(),'ATIVO',sourceId]]);
  const setores=setoresDaBaseSAP_(parsed.registros,inv);
  appendMany_('RODADAS',setores);
  return {inventario_id:inv,itens:parsed.registros.length,duplicados:parsed.duplicados,setores:setores.length};
}
/** A atualização não pode invalidar contagens já executadas. */
function bloqueiosAtualizacaoSAP_(){
  const impedimentos=[];
  if(modoOperacao_()!==MODO_TESTE)impedimentos.push('A base SAP está congelada no modo OFICIAL.');
  if(prop_('LIMPEZA_EM_ANDAMENTO')==='SIM')impedimentos.push('Há limpeza de testes interrompida.');
  for(const nome of ['CONTAGENS','RESULTADOS','APROVACOES'])
    if(table_(nome).length)impedimentos.push('Há registros na aba '+nome+'. Use Limpar registros de teste antes de sincronizar.');
  if(table_('RODADAS').some(r=>Number(r.numero)!==1||str_(r.status)!=='ABERTA'||str_(r.encerrada_em)!==''))
    impedimentos.push('Há rodadas encerradas/reabertas ou posteriores à primeira. Limpe os testes antes de sincronizar.');
  return impedimentos;
}
function resumoDiferencasSAP_(anteriores,proximos){
  const keys=SCHEMA.BASE_ESTOQUE;
  const oldMap=new Map(anteriores.map(x=>[str_(x.chave),x]));
  const novoMap=new Map(proximos.map(row=>[str_(row[1]),Object.fromEntries(keys.map((k,i)=>[k,row[i]]))]));
  let novos=0,removidos=0,alterados=0,saldos=0,descricoes=0,unidades=0;
  const exemplos=[];
  for(const [key,novo] of novoMap){
    const antigo=oldMap.get(key);
    if(!antigo){novos++;if(exemplos.length<8)exemplos.push({chave:key,tipo:'NOVO'});continue;}
    if(keys.slice(2).some(k=>str_(antigo[k])!==str_(novo[k]))){
      alterados++;
      if(Number(antigo.quantidade_sap)!==Number(novo.quantidade_sap))saldos++;
      if(str_(antigo.descricao)!==str_(novo.descricao))descricoes++;
      if(str_(antigo.um)!==str_(novo.um))unidades++;
      if(exemplos.length<8)exemplos.push({chave:key,tipo:'ALTERADO'});
    }
  }
  for(const key of oldMap.keys())if(!novoMap.has(key)){
    removidos++;if(exemplos.length<8)exemplos.push({chave:key,tipo:'REMOVIDO'});
  }
  return {anteriores:anteriores.length,atuais:proximos.length,novos,removidos,alterados,saldos,descricoes,unidades,exemplos,
    setores:[...new Set(proximos.map(r=>str_(r[5])+'|'+str_(r[6])))].length,
    ha_alteracoes:Boolean(novos||removidos||alterados)};
}
function prepararAtualizacaoSAP_(){
  const inv=activeInventory_(),sourceId=prop_('SAP_SOURCE_ID');
  if(!sourceId||str_(inv.fonte_id)!==sourceId)throw Error('A origem SAP cadastrada diverge da origem do inventário.');
  const source=SpreadsheetApp.openById(sourceId).getSheetByName('Data');
  if(!source)throw Error('A aba Data não existe na planilha SAP de origem.');
  const dados=lerBaseSAP_(source,inv.inventario_id),anteriores=table_('BASE_ESTOQUE');
  const resumo=resumoDiferencasSAP_(anteriores,dados.registros);
  const assinatura=sha_(JSON.stringify({inv:inv.inventario_id,
    old:anteriores.map(r=>SCHEMA.BASE_ESTOQUE.map(k=>str_(r[k]))).sort((a,b)=>a[1].localeCompare(b[1])),
    novo:dados.registros}));
  return {inv,dados,resumo,assinatura};
}
function previsualizarAtualizacaoSAP(d){
  const u=auth_(d.token);requireAdmin_(u);exigirSemLimpeza_();
  const preparado=prepararAtualizacaoSAP_(),impedimentos=bloqueiosAtualizacaoSAP_();
  return {...preparado.resumo,assinatura:preparado.assinatura,impedimentos,
    pode_atualizar:impedimentos.length===0&&preparado.resumo.ha_alteracoes};
}
function gravarSnapshotSAP_(nome,cabecalhos,registros){
  const db=db_(),sheet=db.insertSheet(nome);
  sheet.getRange(1,1,1,cabecalhos.length).setValues([cabecalhos]);
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,1,cabecalhos.length).setBackground('#edf1f5').setFontWeight('bold');
  for(let i=0;i<registros.length;i+=350){
    const part=registros.slice(i,i+350),start=i+2,needed=start+part.length-1;
    if(needed>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),needed-sheet.getMaxRows());
    sheet.getRange(start,1,part.length,cabecalhos.length).setValues(part);
  }
  if(sheet.getLastRow()!==registros.length+1)throw Error('A nova aba de estoque foi gravada incompletamente.');
  return sheet;
}
function atualizarBaseSAP(d){return withLock_(()=>{
  const u=auth_(d.token);requireAdmin_(u);exigirSemLimpeza_();
  const impedimentos=bloqueiosAtualizacaoSAP_();
  if(impedimentos.length)throw Error(impedimentos.join(' '));
  if(str_(d.confirmacao)!=='ATUALIZAR BASE SAP')throw Error('Confirmação inválida. Digite ATUALIZAR BASE SAP.');
  const preparado=prepararAtualizacaoSAP_();
  if(!preparado.resumo.ha_alteracoes)throw Error('A base SAP já está atualizada.');
  if(str_(d.assinatura)!==preparado.assinatura)throw Error('A planilha SAP ou a base atual mudou após a prévia. Faça uma nova pré-visualização.');
  const suf=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)+'_'+uuid_().slice(0,6);
  const nomeBase='BASE_SAP_'+suf,nomeRodadas='RODADAS_SAP_'+suf;
  const novasRodadas=setoresDaBaseSAP_(preparado.dados.registros,preparado.inv.inventario_id);
  // As duas abas são preenchidas e verificadas antes da troca da referência ativa.
  gravarSnapshotSAP_(nomeBase,SCHEMA.BASE_ESTOQUE,preparado.dados.registros);
  gravarSnapshotSAP_(nomeRodadas,SCHEMA.RODADAS,novasRodadas);
  const novaVersao={base:nomeBase,rodadas:nomeRodadas,quando:iso_()};
  const antiga=prop_('SAP_SNAPSHOT_ATIVO');
  props_().setProperty('SAP_SNAPSHOT_ATIVO',JSON.stringify(novaVersao));
  try{
    writeAudit_(u.usuario,'BASE_SAP_ATUALIZADA','INVENTARIO',preparado.inv.inventario_id,
      {antes:preparado.resumo.anteriores,depois:preparado.resumo.atuais,novos:preparado.resumo.novos,
       removidos:preparado.resumo.removidos,alterados:preparado.resumo.alterados,
       setores:novasRodadas.length,origem:prop_('SAP_SOURCE_ID'),versao:nomeBase});
  }catch(err){
    if(antiga)props_().setProperty('SAP_SNAPSHOT_ATIVO',antiga);
    else props_().deleteProperty('SAP_SNAPSHOT_ATIVO');
    throw Error('Falha ao registrar auditoria; a versão anterior permaneceu ativa: '+err.message);
  }
  return {ok:true,...preparado.resumo,versao:nomeBase,quando:novaVersao.quando};
});}

/** Apenas identificação do transporte (não revela informações SAP). */
function ping(){return {ok:true,servico:'Inventário Friovix',versao:'2.0'};}
function entrar(d){return withLock_(()=>{
  const user=norm_(d&&d.usuario),pass=str_(d&&d.senha);
  if(!user||!pass)throw Error('Informe usuário e senha.');
  const cache=CacheService.getScriptCache(),key='fail:'+sha_(user).slice(0,24),fails=Number(cache.get(key)||0);
  if(fails>=5)throw Error('Muitas tentativas. Tente novamente em 15 minutos.');
  const row=table_('USUARIOS').find(x=>x.usuario===user&&x.ativo==='SIM');
  const known=passHash_(pass,row?row.salt:'usuario-desconhecido');
  if(!row||row.hash!==known){cache.put(key,String(fails+1),900);writeAudit_(user,'LOGIN_FALHA','USUARIO',user,{});throw Error('Usuário ou senha inválidos.');}
  cache.remove(key);
  const token=random_(),expires=new Date(Date.now()+SESSION_HOURS*3600000).toISOString();
  appendMany_('SESSOES',[[sha_(token),user,expires,iso_(),'']]);
  writeAudit_(user,'LOGIN','SESSAO',user,{});
  return {token,usuario:{usuario:row.usuario,nome:row.nome,perfil:row.perfil},expira_em:expires};
});}
function sair(d){return withLock_(()=>{
  const u=auth_(d.token),rows=table_('SESSOES'),idx=rows.findIndex(r=>r.token_hash===sha_(d.token));
  if(idx>=0)sh_('SESSOES').getRange(idx+2,5).setValue('SIM');
  writeAudit_(u.usuario,'LOGOUT','SESSAO',u.usuario,{});return {ok:true};
});}
function sessaoAtual(d){return {usuario:auth_(d.token),inventario:activeInventory_().nome};}
function carregarContexto(d){exigirSemLimpeza_();const u=auth_(d.token),inv=activeInventory_();const rounds=table_('RODADAS').filter(r=>r.inventario_id===inv.inventario_id);const grouping=new Map();for(const r of rounds){const k=r.centro+'|'+r.deposito,prev=grouping.get(k);if(!prev||Number(r.numero)>Number(prev.numero))grouping.set(k,r);}
  return {usuario:u,inventario:{id:inv.inventario_id,nome:inv.nome},modo:modoOperacao_(),setores:[...grouping.values()].map(r=>({centro:String(r.centro),deposito:String(r.deposito),rodada_id:r.rodada_id,numero:Number(r.numero),status:r.status})).sort((a,b)=>a.centro.localeCompare(b.centro)||a.deposito.localeCompare(b.deposito))};}
function consultarProduto(d){exigirSemLimpeza_();const u=auth_(d.token),inv=activeInventory_(),center=str_(d.centro),depot=str_(d.deposito),code=str_(d.codigo);
  const rounds=sector_(inv.inventario_id,center,depot),r=rounds[rounds.length-1];if(!r||r.status!=='ABERTA')throw Error('Não há rodada aberta para o centro/depósito escolhido.');
  const p=inventoryBase_(inv.inventario_id,center,depot).find(x=>str_(x.codigo)===code);if(!p)throw Error('Código não encontrado na base SAP deste centro e depósito.');
  const targets=targetForRound_(r,inventoryBase_(inv.inventario_id,center,depot),resultadosAtivos_());
  if(!targets.some(x=>str_(x.codigo)===code))throw Error('Este material já foi conferido ou não pertence à rodada atual.');
  if(!podeRecontarUsuario_(u.usuario)&&Number(r.numero)>1){
    const olderIds=new Set(rounds.filter(x=>Number(x.numero)<Number(r.numero)).map(x=>x.rodada_id));
    if(table_('CONTAGENS').some(x=>olderIds.has(x.rodada_id)&&str_(x.codigo)===code&&x.usuario===u.usuario))throw Error('Você já contou este material em rodada anterior. Solicite outro contador.');
  }
  return {codigo:code,descricao:p.descricao,um:p.um,centro:center,deposito:depot,rodada_id:r.rodada_id,rodada_numero:Number(r.numero)};
}
/** Carregamento por centro/depósito e usuário: um acesso em vez de um acesso por tecla.
 * A lista é auxiliar (somente código/descrição/UM), NUNCA substitui consultarProduto/salvarContagem
 * que validam autorização e rodada novamente na hora de registrar.
 */
function catalogoProdutos(d){
  exigirSemLimpeza_();
  const u=auth_(d.token),inv=activeInventory_(),centro=str_(d.centro),deposito=str_(d.deposito);
  if(!centro)throw Error('Selecione o centro e o depósito antes de pesquisar.');
  const rodadas=sector_(inv.inventario_id,centro,deposito),rodada=rodadas[rodadas.length-1];
  if(!rodada||rodada.status!=='ABERTA')return {rodada_id:rodada?rodada.rodada_id:'',itens:[]};
  // Catálogo leva apenas as 7 colunas necessárias, em vez das 14 da base inteira.
  const sheet=sh_('BASE_ESTOQUE'),last=sheet.getLastRow();
  const rows=last>1?sheet.getRange(2,1,last-1,7).getValues():[];
  const base=rows.filter(row=>str_(row[0])===str_(inv.inventario_id)&&str_(row[5])===centro&&str_(row[6])===deposito)
    .map(row=>({codigo:str_(row[2]),descricao:str_(row[3]),um:str_(row[4]),centro:str_(row[5]),deposito:str_(row[6])}));
  const alvos=Number(rodada.numero)===1?base:targetForRound_(rodada,base,resultadosAtivos_());
  let jaContados=new Set();
  if(Number(rodada.numero)>1&&!podeRecontarUsuario_(u.usuario)){
    const anteriores=new Set(rodadas.filter(r=>Number(r.numero)<Number(rodada.numero)).map(r=>str_(r.rodada_id)));
    jaContados=new Set(table_('CONTAGENS').filter(c=>c.usuario===u.usuario&&anteriores.has(str_(c.rodada_id))).map(c=>str_(c.codigo)));
  }
  return {rodada_id:rodada.rodada_id,itens:alvos.filter(p=>!jaContados.has(str_(p.codigo))).map(p=>({codigo:str_(p.codigo),descricao:str_(p.descricao),um:str_(p.um)}))};
}

/** Acompanhamento leve: filtros/paginação sem remontar endereços, aprovações ou painel inteiro. */
function filtrarAcompanhamento(d){
  exigirSemLimpeza_();
  const u=auth_(d.token);requireSupervisor_(u);
  const inv=activeInventory_(),f=d.acompanhamento||{},centro=str_(f.centro),deposito=str_(f.deposito);
  if(!centro)return {...acompanharProdutos_([],[],[],[],f),metricas:metricasProdutos_([],[],[])};
  // Uma única leitura por setor serve à tabela, aos cards e ao velocímetro.
  const sheet=sh_('BASE_ESTOQUE'),last=sheet.getLastRow();
  const rows=last>1?sheet.getRange(2,1,last-1,7).getValues():[];
  const itens=rows.filter(row=>str_(row[0])===str_(inv.inventario_id)&&str_(row[5])===centro&&str_(row[6])===deposito)
    .map(row=>({chave:str_(row[1]),codigo:str_(row[2]),descricao:str_(row[3]),centro:str_(row[5]),deposito:str_(row[6])}));
  const contagens=table_('CONTAGENS').filter(c=>c.inventario_id===inv.inventario_id&&str_(c.centro)===centro&&str_(c.deposito)===deposito);
  const resultados=resultadosAtivos_().filter(r=>r.inventario_id===inv.inventario_id&&str_(r.centro)===centro&&str_(r.deposito)===deposito);
  const rodadas=table_('RODADAS').filter(r=>r.inventario_id===inv.inventario_id&&str_(r.centro)===centro&&str_(r.deposito)===deposito);
  return {...acompanharProdutos_(itens,contagens,resultados,rodadas,f),metricas:metricasProdutos_(itens,contagens,resultados)};
}

/** Sugestões por código ou descrição, limitadas a 12, sempre no setor/rodada permitidos. */
function sugerirProdutos(d){
  exigirSemLimpeza_();
  const u=auth_(d.token),inv=activeInventory_();
  const center=str_(d.centro),depot=str_(d.deposito),term=norm_(d.termo).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(!center||term.length<2)return {itens:[],limite:12};
  const rounds=sector_(inv.inventario_id,center,depot),r=rounds[rounds.length-1];
  if(!r||r.status!=='ABERTA')return {itens:[],limite:12};
  const base=inventoryBase_(inv.inventario_id,center,depot);
  const targets=targetForRound_(r,base,resultadosAtivos_());
  const past=Number(r.numero)>1&&!podeRecontarUsuario_(u.usuario)
    ?new Set(table_('CONTAGENS').filter(x=>x.usuario===u.usuario&&rounds.some(z=>z.rodada_id===x.rodada_id&&Number(z.numero)<Number(r.numero))).map(x=>str_(x.codigo)))
    :new Set();
  const itens=[];
  for(const x of targets){
    if(past.has(str_(x.codigo)))continue;
    const descricao=norm_(x.descricao).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(str_(x.codigo).toUpperCase().includes(term)||descricao.includes(term)){
      itens.push({codigo:str_(x.codigo),descricao:str_(x.descricao),um:str_(x.um)});
      if(itens.length===12)break;
    }
  }
  return {itens,limite:12};
}

function salvarContagem(d){return withLock_(()=>{
  exigirSemLimpeza_();const u=auth_(d.token),inv=activeInventory_(),req=str_(d.request_id);if(req.length<12)throw Error('Identificador do lançamento inválido.');
  const old=table_('CONTAGENS').find(x=>x.request_id===req);if(old)return {ok:true,duplicado:true,lancamento_id:old.lancamento_id};
  const center=str_(d.centro),depot=str_(d.deposito),code=str_(d.codigo),rounds=sector_(inv.inventario_id,center,depot),r=rounds[rounds.length-1];
  if(!r||r.status!=='ABERTA')throw Error('Rodada encerrada ou inexistente.');
  if(resultadosAtivos_().some(x=>x.rodada_id===r.rodada_id))throw Error('Esta rodada está em processo de fechamento. Solicite ao supervisor a conclusão.');
  const base=inventoryBase_(inv.inventario_id,center,depot),p=base.find(x=>str_(x.codigo)===code);
  if(!p)throw Error('Produto ausente na base SAP.');
  if(!targetForRound_(r,base,resultadosAtivos_()).some(x=>str_(x.codigo)===code))throw Error('Produto já conferido; não pode ser contado novamente.');
  const qty=noNeg_(decimal_(d.quantidade,'Quantidade'),'Quantidade');
  const um=norm_(p.um),precision=['UN','UND','PÇ','PC','PCS','EA','CX','KIT'].includes(um)?0:3;
  if(Math.abs(qty*Math.pow(10,precision)-Math.round(qty*Math.pow(10,precision)))>0.000001)throw Error('Unidade '+um+' aceita no máximo '+precision+' casa(s) decimal(is).');
  if(qty>0&&['rua','zona','posicao','palete'].some(k=>str_(d[k])===''))throw Error('Informe Rua, Zona, Posição e Palete.');
  const location=['rua','zona','posicao','palete'].map(k=>qty===0&&str_(d[k])===''?'':integer_(d[k],k));
  if(!podeRecontarUsuario_(u.usuario)&&Number(r.numero)>1){const prevIds=new Set(rounds.filter(x=>Number(x.numero)<Number(r.numero)).map(x=>x.rodada_id));if(table_('CONTAGENS').some(x=>prevIds.has(x.rodada_id)&&x.codigo===code&&x.usuario===u.usuario))throw Error('Outro contador deve realizar esta rodada.');}
  const id=uuid_();appendMany_('CONTAGENS',[[id,req,r.rodada_id,inv.inventario_id,code,center,depot,...location,qty,u.usuario,iso_()]]);
  writeAudit_(u.usuario,'CONTAGEM_REGISTRADA','CONTAGEM',id,{codigo:code,centro:center,deposito:depot,rodada:Number(r.numero),quantidade:qty,rua:location[0],zona:location[1],posicao:location[2],palete:location[3]});
  return {ok:true,duplicado:false,lancamento_id:id};
});}
function getOverview_(inv){const base=inventoryBase_(inv.inventario_id),results=resultadosAtivos_().filter(x=>x.inventario_id===inv.inventario_id),latest=latestResultsMap_(results);
  let encerrados=0,conferidos=0,pendentesAprovacao=0;for(const p of base){const r=latest.get(p.chave);if(r){encerrados++;if(Math.abs(Number(r.diferenca))<0.0000001)conferidos++;if(r.status==='APROVACAO_PENDENTE')pendentesAprovacao++;}}
  const aprovados=new Set(table_('APROVACOES').filter(x=>x.inventario_id===inv.inventario_id).map(x=>x.resultado_id));
  return {total_skus:base.length,skus_com_resultado:encerrados,conferidos,pendentes_aprovacao:Math.max(0,pendentesAprovacao-[...latest.values()].filter(r=>aprovados.has(r.resultado_id)).length),aprovados:aprovados.size};
}

/** Progresso global: cada Código + Centro + Depósito conta apenas uma vez, inclusive contagem zero.
 * Não utiliza a quantidade de unidades, nem exige que a rodada esteja encerrada.
 */
function progressoGlobalProdutos_(base,contagens){
  const chaves=new Set(base.map(p=>normalizeKey_(p.codigo,p.centro,p.deposito)));
  const contados=new Set();
  for(const c of contagens){
    const chave=normalizeKey_(c.codigo,c.centro,c.deposito);
    if(chaves.has(chave))contados.add(chave);
  }
  const total=chaves.size;
  return {total,contados:contados.size,pendentes:total-contados.size,percentual:total?Math.round(contados.size/total*1000)/10:0};
}


/** Indicadores por Código + Centro + Depósito: sem duplicar parciais ou rodadas.
 * Divergente só após a 3ª rodada ENCERRADA, ainda que aprovado posteriormente.
 */
function metricasProdutos_(base,contagens,resultados){
  const progresso=progressoGlobalProdutos_(base,contagens);
  const ultimo=latestResultsMap_(resultados);
  let batendo=0,divergentes=0;
  for(const p of base){
    const resultado=ultimo.get(normalizeKey_(p.codigo,p.centro,p.deposito));
    if(!resultado)continue;
    if(Math.abs(Number(resultado.diferenca))<0.0000001)batendo++;
    else if(Number(resultado.numero)===3)divergentes++;
  }
  return {...progresso,batendo,divergentes};
}

/** Exportação cega, restrita a supervisor: exclusivamente divergentes da rodada anterior já encerrada.
 * Não inclui saldos SAP, valores monetários ou quantidades já contadas.
 */
function exportarListaRecontagem(d){return withLock_(()=>{
  exigirSemLimpeza_();
  const u=auth_(d.token);requireSupervisor_(u);
  const numero=Number(d.numero),centro=str_(d.centro),deposito=str_(d.deposito);
  if(![2,3].includes(numero)||!centro)throw Error('Selecione uma 2ª ou 3ª contagem e um centro/depósito válidos.');
  const inv=activeInventory_();
  const rodadaAnterior=sector_(inv.inventario_id,centro,deposito).find(r=>Number(r.numero)===numero-1);
  if(!rodadaAnterior||rodadaAnterior.status!=='ENCERRADA')throw Error('A rodada anterior precisa estar encerrada para exportar a recontagem.');
  const resultados=resultadosAtivos_().filter(r=>r.inventario_id===inv.inventario_id&&r.rodada_id===rodadaAnterior.rodada_id&&Math.abs(Number(r.diferenca))>0.0000001);
  const codigos=new Set(resultados.map(r=>str_(r.codigo)));
  if(!codigos.size)throw Error('Não há produtos divergentes para esta recontagem.');
  const itens=inventoryBase_(inv.inventario_id,centro,deposito)
    .filter(p=>codigos.has(str_(p.codigo)))
    .map(p=>({codigo:str_(p.codigo),descricao:str_(p.descricao),um:str_(p.um),centro:str_(p.centro),deposito:str_(p.deposito)}))
    .sort((a,b)=>a.codigo.localeCompare(b.codigo,'pt-BR',{numeric:true}));
  if(itens.length!==codigos.size)throw Error('Inconsistência entre a lista de divergências e a base SAP. Consulte o administrador.');
  writeAudit_(u.usuario,'LISTA_RECONTAGEM_EXPORTADA','RODADA',rodadaAnterior.rodada_id,{numero,centro,deposito,produtos:itens.length});
  return {numero,centro,deposito,total:itens.length,itens};
});}

/** Evolução por centro/depósito: uma linha por SKU, sem misturar rodadas.
 * Progresso de contagem = SKUs com pelo menos um lançamento / SKUs da base.
 * Concluídos = SKUs batendo em rodada fechada OU divergentes após a 3ª.
 * A situação só muda para conferido/divergente após fechamento formal.
 */
function acompanharProdutos_(base,counts,results,rounds,filter){
  const groups=[...new Set(base.map(x=>str_(x.centro)+'|'+str_(x.deposito)))].sort();
  const requested=str_(filter.centro)+'|'+str_(filter.deposito);
  const selected=groups.includes(requested)?requested:groups[0];
  if(!selected)return {centro:'',deposito:'',total:0,contados:0,concluidos:0,batendo:0,divergentes:0,progresso:0,conclusao:0,pagina:1,total_paginas:1,total_filtrado:0,itens:[]};
  const divider=selected.indexOf('|'),center=selected.slice(0,divider),depot=selected.slice(divider+1);
  const scope=base.filter(x=>str_(x.centro)===center&&str_(x.deposito)===depot);
  const statusByKey=new Map(),countedByKey=new Map(),roundById=new Map();
  for(const r of rounds)if(str_(r.centro)===center&&str_(r.deposito)===depot)roundById.set(str_(r.rodada_id),Number(r.numero));
  for(const r of results){
    if(str_(r.centro)!==center||str_(r.deposito)!==depot)continue;
    const key=normalizeKey_(r.codigo,r.centro,r.deposito),items=statusByKey.get(key)||{};
    items[Number(r.numero)]=Math.abs(Number(r.diferenca))<0.0000001?'CONFERIDO':'DIVERGENTE';
    statusByKey.set(key,items);
  }
  for(const c of counts){
    if(str_(c.centro)!==center||str_(c.deposito)!==depot)continue;
    const n=roundById.get(str_(c.rodada_id));if(!n)continue;
    const key=normalizeKey_(c.codigo,c.centro,c.deposito),items=countedByKey.get(key)||{};
    items[n]=true;countedByKey.set(key,items);
  }
  let contados=0,concluidos=0,batendo=0,divergentes=0;
  const items=scope.map(p=>{
    const s=statusByKey.get(p.chave)||{},seen=countedByKey.get(p.chave)||{};
    const roundsStatus=[1,2,3].map(n=>{
      if(s[n]==='CONFERIDO')return 'CONFERIDO';
      if(s[n]==='DIVERGENTE')return n<3?'SEGUNDA_CONTAGEM':'DIVERGENTE';
      return seen[n]?'EM_CONTAGEM':'PENDENTE';
    });
    if(Object.keys(seen).length)contados++;
    let situacao='Não iniciado',tipo='pending';
    if([s[1],s[2],s[3]].includes('CONFERIDO')){situacao='Estoque Batendo';tipo='passed';batendo++;concluidos++;}
    else if(s[3]==='DIVERGENTE'){situacao='Estoque Divergente';tipo='failed';divergentes++;concluidos++;}
    else if(seen[3]){situacao='3ª contagem em andamento';tipo='active';}
    else if(s[2]==='DIVERGENTE'){situacao='Aguardando 3ª contagem';tipo='warning';}
    else if(seen[2]){situacao='2ª contagem em andamento';tipo='active';}
    else if(s[1]==='DIVERGENTE'){situacao='Aguardando 2ª contagem';tipo='warning';}
    else if(seen[1]){situacao='1ª contagem em andamento';tipo='active';}
    return {codigo:str_(p.codigo),descricao:str_(p.descricao),centro:center,deposito:depot,rodadas:roundsStatus,situacao,tipo};
  });
  const termo=norm_(filter.termo).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const filtered=termo?items.filter(x=>norm_(x.codigo).includes(termo)||norm_(x.descricao).normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(termo)):items;
  const pageSize=50,totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const requestedPage=Number(filter.pagina);const page=Number.isSafeInteger(requestedPage)?Math.min(totalPages,Math.max(1,requestedPage)):1;
  const total=scope.length;
  return {centro:center,deposito:depot,total,contados,concluidos,batendo,divergentes,
    progresso:total?Math.round(contados/total*100):0,conclusao:total?Math.round(concluidos/total*100):0,
    total_filtrado:filtered.length,pagina:page,total_paginas:totalPages,itens:filtered.slice((page-1)*pageSize,page*pageSize)};
}

/** Dashboard somente para supervisor. Consolidação por endereço da última rodada de cada produto. */
function painel(d){exigirSemLimpeza_();const u=auth_(d.token);requireSupervisor_(u);const inv=activeInventory_();const base=inventoryBase_(inv.inventario_id),counts=table_('CONTAGENS').filter(x=>x.inventario_id===inv.inventario_id),rounds=table_('RODADAS').filter(x=>x.inventario_id===inv.inventario_id),results=resultadosAtivos_().filter(x=>x.inventario_id===inv.inventario_id),approved=table_('APROVACOES').filter(x=>x.inventario_id===inv.inventario_id);
  const approvedIds=new Set(approved.map(x=>x.resultado_id)),latest=latestResultsMap_(results),latestRound=new Map(),group=new Map();
  for(const r of rounds){const k=r.centro+'|'+r.deposito,old=latestRound.get(k);if(!old||Number(r.numero)>Number(old.numero))latestRound.set(k,r);}
  const divergentesPorRodada=new Map(),rodadasPorSetor=new Map();
  for(const r of results)if(Math.abs(Number(r.diferenca))>0.0000001)divergentesPorRodada.set(str_(r.rodada_id),(divergentesPorRodada.get(str_(r.rodada_id))||0)+1);
  for(const r of rounds){const key=str_(r.centro)+'|'+str_(r.deposito);if(!rodadasPorSetor.has(key))rodadasPorSetor.set(key,[]);rodadasPorSetor.get(key).push(r);}
  const sectorData=[];
  for(const round of latestRound.values()){
    const items=base.filter(x=>x.centro===round.centro&&x.deposito===round.deposito),target=targetForRound_(round,items,results),set=new Set(counts.filter(c=>c.rodada_id===round.rodada_id).map(c=>c.codigo));
    const historico=rodadasPorSetor.get(str_(round.centro)+'|'+str_(round.deposito))||[];
    const anterior1=historico.find(r=>Number(r.numero)===1),anterior2=historico.find(r=>Number(r.numero)===2);
    const exportacao_segunda=anterior1&&anterior1.status==='ENCERRADA'?(divergentesPorRodada.get(str_(anterior1.rodada_id))||0):0;
    const exportacao_terceira=anterior2&&anterior2.status==='ENCERRADA'?(divergentesPorRodada.get(str_(anterior2.rodada_id))||0):0;
    sectorData.push({divergentes_na_rodada:divergentesPorRodada.get(str_(round.rodada_id))||0,exportacao_segunda,exportacao_terceira,pode_reabrir:round.status==='ENCERRADA'&&results.some(x=>x.rodada_id===round.rodada_id)&&!results.some(x=>x.rodada_id===round.rodada_id&&approvedIds.has(x.resultado_id)),centro:round.centro,deposito:round.deposito,rodada_id:round.rodada_id,numero:Number(round.numero),status:round.status,total_alvo:target.length,produtos_registrados:target.filter(x=>set.has(x.codigo)).length,produtos_faltando:target.filter(x=>!set.has(x.codigo)).slice(0,25).map(x=>x.codigo),faltando_total:target.filter(x=>!set.has(x.codigo)).length});
  }
  const roundNumberById=new Map(rounds.map(r=>[str_(r.rodada_id),Number(r.numero)]));
  const currentRoundOf=new Map();for(const c of counts){const key=normalizeKey_(c.codigo,c.centro,c.deposito),number=roundNumberById.get(str_(c.rodada_id))||0,old=currentRoundOf.get(key);if(!old||number>old.numero)currentRoundOf.set(key,{numero:number,rodada_id:c.rodada_id});}
  const locGroup=new Map();for(const c of counts){const key=normalizeKey_(c.codigo,c.centro,c.deposito),current=currentRoundOf.get(key);if(!current||current.rodada_id!==c.rodada_id||Number(c.quantidade)===0)continue;
    const k=[c.centro,c.deposito,c.codigo,c.rua,c.zona,c.posicao,c.palete].join('|');const t=locGroup.get(k)||{centro:c.centro,deposito:c.deposito,codigo:c.codigo,rua:c.rua,zona:c.zona,posicao:c.posicao,palete:c.palete,quantidade:0,rodada:current.numero};t.quantidade+=Number(c.quantidade);locGroup.set(k,t);
  }
  const filter=d.filtro||{},match=v=>(k=>!str_(filter[k])||str_(v)===str_(filter[k]));
  const byCode=new Map(base.map(x=>[x.chave,x]));
  const locations=[...locGroup.values()].filter(x=>(!filter.codigo||String(x.codigo).includes(str_(filter.codigo)))&&['centro','deposito','rua','zona','posicao','palete'].every(k=>!str_(filter[k])||str_(x[k])===str_(filter[k]))).map(x=>({...x,descricao:byCode.get(normalizeKey_(x.codigo,x.centro,x.deposito))?.descricao||''}));
  const pending=[...latest.values()].filter(x=>x.status==='APROVACAO_PENDENTE'&&!approvedIds.has(x.resultado_id)).map(x=>({...x,descricao:byCode.get(normalizeKey_(x.codigo,x.centro,x.deposito))?.descricao||''}));
  let conferidos=0,comResultado=0;for(const b of base){const result=latest.get(b.chave);if(result){comResultado++;if(Math.abs(Number(result.diferenca))<0.0000001)conferidos++;}}
  const acompanhamento=acompanharProdutos_(base,counts,results,rounds,d&&d.acompanhamento||{});
  const centroEscopo=acompanhamento.centro,depositoEscopo=acompanhamento.deposito;
  const baseSetor=base.filter(x=>str_(x.centro)===centroEscopo&&str_(x.deposito)===depositoEscopo);
  const contagensSetor=counts.filter(x=>str_(x.centro)===centroEscopo&&str_(x.deposito)===depositoEscopo);
  const resultadosSetor=results.filter(x=>str_(x.centro)===centroEscopo&&str_(x.deposito)===depositoEscopo);
  const metricas=metricasProdutos_(baseSetor,contagensSetor,resultadosSetor);
  return {usuario:u,inventario:{id:inv.inventario_id,nome:inv.nome},modo:modoOperacao_(),resumo:{total_skus:base.length,com_resultado:comResultado,conferidos,pendentes_aprovacao:pending.length,aprovados:approved.length,total_lancamentos:counts.length},progresso_geral:metricas,metricas,setores:sectorData.sort((a,b)=>String(a.centro).localeCompare(String(b.centro))||String(a.deposito).localeCompare(String(b.deposito))),enderecos:locations.slice(0,400),total_enderecos_filtrados:locations.length,divergencias:pending.slice(0,150),config:{permitir_recontagem:getConfig_('PERMITIR_MESMO_CONTADOR_ENTRE_RODADAS')},acompanhamento};
}
function encerrarRodada(d){return withLock_(()=>{
  exigirSemLimpeza_();const u=auth_(d.token);requireSupervisor_(u);const inv=activeInventory_();const allRounds=table_('RODADAS'),r=allRounds.find(x=>x.rodada_id===str_(d.rodada_id)&&x.inventario_id===inv.inventario_id);
  if(!r||r.status!=='ABERTA')throw Error('Rodada já encerrada ou inválida.');
  const base=inventoryBase_(inv.inventario_id,r.centro,r.deposito),results=resultadosAtivos_(),targets=targetForRound_(r,base,results),counts=table_('CONTAGENS').filter(c=>c.rodada_id===r.rodada_id),totals=new Map();
  for(const c of counts)totals.set(str_(c.codigo),(totals.get(str_(c.codigo))||0)+Number(c.quantidade));
  const missing=targets.filter(b=>!totals.has(str_(b.codigo)));if(missing.length)throw Error('Não é possível encerrar: '+missing.length+' materiais sem contagem (nem zero). Primeiros códigos: '+missing.slice(0,12).map(x=>x.codigo).join(', '));
  if(!targets.length)throw Error('Nenhum material pendente nesta rodada.');
  const now=iso_(),out=targets.map(b=>{const qty=totals.get(str_(b.codigo)),diff=Math.round((qty-Number(b.quantidade_sap))*1000)/1000,status=Math.abs(diff)<0.0000001?'CONFERIDO':Number(r.numero)===3?'APROVACAO_PENDENTE':'DIVERGENTE';return [uuid_(),inv.inventario_id,r.rodada_id,Number(r.numero),b.codigo,r.centro,r.deposito,Number(b.quantidade_sap),qty,diff,status,now];});
  // Recuperável: se a execução parou após gravar parte dos resultados, retoma somente os faltantes.
  const persisted=results.filter(x=>x.rodada_id===r.rodada_id);const seen=new Map();
  for(const row of persisted){if(seen.has(str_(row.codigo)))throw Error('Resultado duplicado no fechamento: revisão manual necessária.');seen.set(str_(row.codigo),row);}
  for(const item of out){const old=seen.get(str_(item[4]));if(old&&(Math.abs(Number(old.quantidade_contada)-Number(item[8]))>0.000001||Math.abs(Number(old.diferenca)-Number(item[9]))>0.000001))throw Error('Quantidade mudou durante fechamento parcial: bloqueado para auditoria.');}
  appendMany_('RESULTADOS',out.filter(item=>!seen.has(str_(item[4]))));
  const s=sh_('RODADAS'),idx=allRounds.findIndex(x=>x.rodada_id===r.rodada_id);s.getRange(idx+2,6).setValue('ENCERRADA');s.getRange(idx+2,8,1,2).setValues([[now,u.usuario]]);
  const divergentes=out.filter(x=>x[10]!=='CONFERIDO').length;
  writeAudit_(u.usuario,'RODADA_ENCERRADA','RODADA',r.rodada_id,{centro:r.centro,deposito:r.deposito,numero:r.numero,materiais:out.length,divergentes});
  return {ok:true,numero:Number(r.numero),materiais:out.length,divergentes};
});}
/** Reabre exclusivamente a ÚLTIMA rodada encerrada de um centro/depósito.
 * Não remove contagens nem resultados antigos: marca os resultados anteriores como
 * REABERTO (histórico), e os cálculos usam somente resultados ativos.
 * O estado intermediário REABRINDO permite retomar uma execução interrompida.
 */
function reabrirRodada(d){return withLock_(()=>{
  exigirSemLimpeza_();
  const u=auth_(d&&d.token);requireSupervisor_(u);
  const motivo=str_(d&&d.motivo);
  if(motivo.length<10)throw Error('Informe uma justificativa de pelo menos 10 caracteres para reabrir.');
  const inv=activeInventory_(),id=str_(d&&d.rodada_id);
  const rodadas=table_('RODADAS').filter(x=>x.inventario_id===inv.inventario_id);
  const rodada=rodadas.find(x=>str_(x.rodada_id)===id);
  if(!rodada)throw Error('Rodada não encontrada no inventário ativo.');
  if(!['ENCERRADA','REABRINDO'].includes(str_(rodada.status)))throw Error('A rodada deve estar encerrada para ser reaberta.');
  const seguintes=rodadas.filter(x=>str_(x.centro)===str_(rodada.centro)&&str_(x.deposito)===str_(rodada.deposito)&&Number(x.numero)>Number(rodada.numero));
  if(seguintes.length)throw Error('Não é possível reabrir: uma rodada posterior já foi iniciada.');

  const todos=table_('RESULTADOS').filter(x=>str_(x.rodada_id)===id&&x.inventario_id===inv.inventario_id);
  if(!todos.length)throw Error('Fechamento sem resultados consolidados. Solicite verificação administrativa.');
  const ids=new Set(todos.map(x=>str_(x.resultado_id)));
  if(table_('APROVACOES').some(x=>ids.has(str_(x.resultado_id))))
    throw Error('Não é possível reabrir: já existe aprovação de divergência nesta rodada.');

  // Registra intenção antes da alteração dos resultados. Em uma falha intermediária,
  // a rodada fica REABRINDO e o supervisor poderá repetir a operação para concluir.
  const allRounds=table_('RODADAS'),index=allRounds.findIndex(x=>str_(x.rodada_id)===id);
  const roundSheet=sh_('RODADAS');
  if(rodada.status==='ENCERRADA'){
    writeAudit_(u.usuario,'REABERTURA_INICIADA','RODADA',id,
      {centro:rodada.centro,deposito:rodada.deposito,numero:Number(rodada.numero),motivo,resultados:todos.length});
    roundSheet.getRange(index+2,6).setValue('REABRINDO');
  }

  const resultSheet=sh_('RESULTADOS'),last=resultSheet.getLastRow();
  const values=last>1?resultSheet.getRange(2,1,last-1,SCHEMA.RESULTADOS.length).getValues():[];
  // Atualiza blocos contíguos em lote; somente resultados da rodada são invalidados.
  let invalidated=0,runStart=-1,runLength=0;
  const flush=()=>{
    if(runLength){resultSheet.getRange(runStart+2,11,runLength,1).setValues(Array.from({length:runLength},()=>['REABERTO']));runStart=-1;runLength=0;}
  };
  for(let i=0;i<values.length;i++){
    const row=values[i],target=str_(row[2])===id&&str_(row[10])!=='REABERTO';
    if(target){if(runLength===0)runStart=i;runLength++;invalidated++;}else flush();
  }
  flush();
  // Preserva todos os lançamentos da contagem física e suas localizações.
  writeAudit_(u.usuario,'RODADA_REABERTA','RODADA',id,
    {centro:rodada.centro,deposito:rodada.deposito,numero:Number(rodada.numero),motivo,resultados_anteriores:todos.length,resultados_invalidados_nesta_execucao:invalidated});
  roundSheet.getRange(index+2,6).setValue('ABERTA');
  roundSheet.getRange(index+2,8,1,2).setValues([['','']]);
  return {ok:true,numero:Number(rodada.numero),centro:str_(rodada.centro),deposito:str_(rodada.deposito),resultados_anteriores:todos.length,lancamentos_preservados:true};
});}
function abrirProximaRodada(d){return withLock_(()=>{
  exigirSemLimpeza_();const u=auth_(d.token);requireSupervisor_(u);const inv=activeInventory_(),rounds=sector_(inv.inventario_id,d.centro,d.deposito);const r=rounds[rounds.length-1];
  if(!r||r.status!=='ENCERRADA')throw Error('Encerre a rodada atual primeiro.');if(Number(r.numero)>=3)throw Error('Limite de três rodadas atingido.');
  const divergents=resultadosAtivos_().filter(x=>x.rodada_id===r.rodada_id&&Math.abs(Number(x.diferenca))>0.0000001);
  if(!divergents.length)throw Error('Todos os materiais foram conferidos; não há divergências.');
  const id=uuid_();appendMany_('RODADAS',[[id,inv.inventario_id,str_(r.centro),str_(r.deposito),Number(r.numero)+1,'ABERTA',iso_(),'','']]);
  writeAudit_(u.usuario,'RODADA_ABERTA','RODADA',id,{centro:r.centro,deposito:r.deposito,numero:Number(r.numero)+1,alvos:divergents.length});
  return {ok:true,rodada_id:id,numero:Number(r.numero)+1,alvos:divergents.length};
});}
function aprovarDivergencia(d){return withLock_(()=>{
  exigirSemLimpeza_();const u=auth_(d.token);requireSupervisor_(u);const reason=str_(d.motivo);if(reason.length<8)throw Error('Informe uma justificativa com pelo menos oito caracteres.');
  const res=resultadosAtivos_().find(x=>x.resultado_id===str_(d.resultado_id)&&x.status==='APROVACAO_PENDENTE');if(!res)throw Error('Divergência não está aguardando aprovação.');
  if(table_('APROVACOES').some(x=>x.resultado_id===res.resultado_id))throw Error('Divergência já aprovada.');
  const id=uuid_();appendMany_('APROVACOES',[[id,res.resultado_id,res.inventario_id,res.codigo,res.centro,res.deposito,res.quantidade_sap,res.quantidade_contada,res.diferenca,reason,u.usuario,iso_()]]);
  writeAudit_(u.usuario,'DIVERGENCIA_APROVADA','RESULTADO',res.resultado_id,{codigo:res.codigo,centro:res.centro,deposito:res.deposito,diferenca:res.diferenca,motivo:reason});
  return {ok:true,aprovacao_id:id};
});}
function listarUsuarios(d){const u=auth_(d.token);requireAdmin_(u);return table_('USUARIOS').map(x=>({usuario:x.usuario,nome:x.nome,perfil:x.perfil,ativo:x.ativo}));}
function cadastrarUsuario(d){return withLock_(()=>{
  const u=auth_(d.token);requireAdmin_(u);const data=d.usuario||{},username=norm_(data.usuario),name=str_(data.nome),role=norm_(data.perfil),pass=str_(data.senha);
  if(!/^[A-Z0-9._-]{3,40}$/.test(username))throw Error('Usuário: use 3 a 40 caracteres (letras, números, ponto, _ ou -).');
  if(name.length<2)throw Error('Nome obrigatório.');if(!['CONTADOR','SUPERVISOR','ADMIN'].includes(role))throw Error('Perfil inválido.');if(pass.length<10)throw Error('Senha inicial deve ter ao menos dez caracteres.');
  if(table_('USUARIOS').some(x=>x.usuario===username))throw Error('Usuário já cadastrado.');
  const salt=random_();appendMany_('USUARIOS',[[uuid_(),username,name,role,'SIM',salt,passHash_(pass,salt),iso_()]]);
  writeAudit_(u.usuario,'USUARIO_CRIADO','USUARIO',username,{perfil:role});return {ok:true};
});}
function atualizarConfiguracao(d){
  const u=auth_(d.token);requireSupervisor_(u);
  throw Error('A permissão de recontagem agora é individual. Utilize as configurações por contador.');
}

/** GitHub Pages usa esta ponte HTML (Google.script.run exige origem Apps Script). */
function doGet(e){
  const origin=prop_('WEB_ORIGIN');if(!origin)throw Error('WEB_ORIGIN não configurada.');
  const channel=str_(e&&e.parameter&&e.parameter.channel);
  if(!/^[a-zA-Z0-9_-]{12,100}$/.test(channel))return HtmlService.createHtmlOutput('A ponte exige um canal válido.');
  const tpl=HtmlService.createTemplateFromFile('Bridge');tpl.originJson=JSON.stringify(origin);tpl.channelJson=JSON.stringify(channel);
  return tpl.evaluate().setTitle('Inventário Friovix — Ponte').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

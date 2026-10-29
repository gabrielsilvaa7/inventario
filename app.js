/* Inventário Friovix — Cliente GitHub Pages. Nenhum segredo é colocado neste arquivo. */
'use strict';
const $=id=>document.getElementById(id);
const state={bridgeWindow:null,bridgeOrigin:'',channel:'',ready:false,pending:new Map(),token:sessionStorage.getItem('inventario_session')||'',usuario:null,context:null,product:null,dashboard:null,requestId:null,tab:'contagem',productPage:1,suggestionSequence:0,suggestionTimer:null,suggestions:[],suggestionActive:-1,catalogCache:new Map(),catalogPending:new Map(),catalogUnsupported:false,catalogSignature:'',dashboardLoading:false,dashboardQueued:'',followupSeq:0,followupTimer:null,sapBusy:false,sapPreview:null,counterPermissions:[],counterPermissionsLoading:false,supervisionCenter:''};
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(v)||0);
const rotuloPerfil_=perfil=>({CONTADOR:'Apontador',APONTADOR:'Apontador',SUPERVISOR:'Supervisor',ADMIN:'Administrador'}[String(perfil)]||String(perfil));
const random=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
function toast(msg,type=''){const t=$('toast');t.textContent=msg;t.className='toast '+type;t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.hidden=true,6000);}
function show(page){for(const id of ['connecting','loginPage','appPage'])$(id).hidden=id!==page;}
function btnBusy(button,busy,text){
  if(!button)return;
  if(busy){
    if(!button.classList.contains('is-busy'))button.dataset.oldText=button.textContent;
    button.disabled=true;button.classList.add('is-busy');
    button.innerHTML='<span class="mini-spinner" aria-hidden="true"></span>'+safe(text||'Processando...');
    button.setAttribute('aria-busy','true');
  }else{
    button.classList.remove('is-busy');button.disabled=false;
    button.textContent=button.dataset.oldText||button.textContent;
    button.removeAttribute('aria-busy');
  }
}
function bridgeCall(method,payload={},timeout=120000){if(!state.ready)return Promise.reject(new Error('Backend ainda não conectado.'));
  const id=random();return new Promise((resolve,reject)=>{const timeoutId=setTimeout(()=>{state.pending.delete(id);reject(new Error('O servidor demorou para responder. Consulte o supervisor antes de reenviar a contagem.'));},timeout);
    state.pending.set(id,{resolve,reject,timeoutId});state.bridgeWindow.postMessage({app:'inventario-sap',channel:state.channel,type:'request',id,method,payload},state.bridgeOrigin);
  });}
async function api(method,payload={},timeout){return bridgeCall(method,{token:state.token,...payload},timeout);}
function isGoogleBridge(origin){try{const u=new URL(origin);return u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname==='script.googleusercontent.com'||u.hostname.endsWith('.googleusercontent.com'));}catch{return false;}}
window.addEventListener('message',event=>{
  const data=event.data;if(!data||data.app!=='inventario-sap'||data.channel!==state.channel||!isGoogleBridge(event.origin))return;
  if(data.type==='ready'){
    // Google HtmlService pode adicionar iframes intermediários; guardamos o emissor real da ponte.
    if(state.ready&&event.source!==state.bridgeWindow)return;
    state.bridgeWindow=event.source;state.bridgeOrigin=event.origin;state.ready=true;startSession();return;
  }
  if(!state.ready||event.source!==state.bridgeWindow||event.origin!==state.bridgeOrigin||data.type!=='response')return;
  const item=state.pending.get(data.id);if(!item)return;clearTimeout(item.timeoutId);state.pending.delete(data.id);
  data.ok?item.resolve(data.result):item.reject(new Error(data.error||'Erro desconhecido do servidor.'));
});
async function startSession(){try{
  await bridgeCall('ping');
  if(state.token){try{const s=await api('sessaoAtual');state.usuario=s.usuario;await enterApp();return;}catch{sessionStorage.removeItem('inventario_session');state.token='';}}
  show('loginPage');
}catch(error){$('connectingMessage').textContent='Erro na comunicação com Apps Script: '+error.message;show('connecting');}}
function initBridge(){const url=window.INVENTARIO_CONFIG&&window.INVENTARIO_CONFIG.appsScriptUrl;
  if(!url||url.includes('COLE_AQUI')){$('connectingMessage').textContent='Configuração pendente: informe o URL da implantação Apps Script em config.js (veja README.md).';return;}
  try{const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='script.google.com'||!u.pathname.endsWith('/exec'))throw Error('A URL precisa ser HTTPS e terminar em /exec.');state.channel=random().replace(/[^a-zA-Z0-9_-]/g,'');u.searchParams.set('channel',state.channel);$('scriptBridge').src=u.href;
  }catch(err){$('connectingMessage').textContent='Configuração inválida: '+err.message;return;}
  setTimeout(()=>{if(!state.ready){$('connectingMessage').textContent='Não foi possível carregar o Apps Script. Confirme a implantação, a permissão "Qualquer pessoa", WEB_ORIGIN e o URL /exec. Verifique também bloqueios de iframe/cookies do navegador.';}},25000);
}
async function enterApp(){
  show('appPage');$('accountLabel').textContent=state.usuario.nome+' · '+rotuloPerfil_(state.usuario.perfil);
  applyRole();await refreshContext();
  // Dashboard volumoso é carregado somente quando solicitado; login/contagem ficam mais rápidos.
  if(state.usuario.perfil==='ADMIN')await Promise.all([refreshUsers(),refreshEnvironment()]);
  if((state.tab==='painel'||state.tab==='supervisao')&&canSupervise())await refreshDashboard();
}
function canSupervise(){return state.usuario&&['ADMIN','SUPERVISOR'].includes(state.usuario.perfil);}
function applyRole(){document.querySelectorAll('.supervisor-only').forEach(n=>n.classList.toggle('hidden-role',!canSupervise()));document.querySelectorAll('.admin-only').forEach(n=>n.classList.toggle('hidden-role',state.usuario.perfil!=='ADMIN'));}
function switchTab(tab){if((tab==='painel'||tab==='supervisao')&&!canSupervise())return;if(tab==='usuarios'&&state.usuario?.perfil!=='ADMIN')return;state.tab=tab;
  document.querySelectorAll('.tab').forEach(n=>n.classList.toggle('active',n.dataset.tab===tab));document.querySelectorAll('.page').forEach(n=>n.classList.toggle('active',n.id==='tab-'+tab));
  if((tab==='painel'||tab==='supervisao')&&!state.dashboard)refreshDashboard();
  if(tab==='supervisao')refreshCounterPermissions();}
async function refreshContext(){
  const next=await api('carregarContexto');
  const signature=JSON.stringify([next.inventario?.id,(next.setores||[]).map(x=>[x.centro,x.deposito,x.rodada_id,x.status])]);
  if(signature!==state.catalogSignature){state.catalogCache.clear();state.catalogPending.clear();state.catalogSignature=signature;}
  if(state.sapPreview){state.sapPreview=null;atualizarBotoesSAP();}
  state.context=next;
  $('inventoryName').textContent='Controle físico de estoque';renderModeBadge(state.context.modo);
  const prev=$('sectorSelect').value;$('sectorSelect').innerHTML='<option value="">Selecione centro e depósito...</option>'+state.context.setores.map(x=>`<option value="${safe(x.centro+'|'+x.deposito)}">Centro ${safe(x.centro)} · Depósito ${safe(x.deposito||'Não informado')}</option>`).join('');
  if([...$('sectorSelect').options].some(x=>x.value===prev))$('sectorSelect').value=prev;
  renderDashboardSectorOptions();
  if($('sectorSelect').value)preloadCatalog();
}
function renderModeBadge(mode){
  const badge=$('modeBadge');badge.textContent='Modo: '+(mode==='OFICIAL'?'OFICIAL':'TESTE');
  badge.className='mode-badge '+(mode==='OFICIAL'?'mode-official':'mode-test');
}
function paintEnvironment(data){
  const oficial=data.modo==='OFICIAL';
  $('adminModeBadge').textContent=data.modo;
  $('adminModeBadge').className='mode-badge '+(oficial?'mode-official':'mode-test');
  $('testModeButton').classList.toggle('active',!oficial);
  $('officialModeButton').classList.toggle('active',oficial);
  $('testModeButton').setAttribute('aria-pressed',String(!oficial));
  $('officialModeButton').setAttribute('aria-pressed',String(oficial));
  $('testModeButton').disabled=oficial;
  $('officialModeButton').disabled=oficial||data.limpeza_pendente;
  $('clearTestDataButton').disabled=oficial;
  $('modeInfo').textContent=oficial
    ?'INVENTÁRIO OFICIAL ATIVO. Nenhum registro pode ser apagado pela função de limpeza. Não é possível voltar ao modo TESTE.'
    :data.limpeza_pendente
    ?'Limpeza interrompida. Execute novamente a limpeza para liberar as operações.'
    :'MODO TESTE ATIVO. Você pode simular as três rodadas e reiniciar a contagem quantas vezes precisar.';
  const n=data.quantidades;
  $('environmentMetrics').innerHTML=[['Contagens',n.contagens],['Resultados',n.resultados],['Aprovações',n.aprovacoes],['Rodadas',n.rodadas]].map(x=>`<div><strong>${num(x[1])}</strong><span>${safe(x[0])}</span></div>`).join('');
  renderModeBadge(data.modo);
  atualizarBotoesSAP();
}
async function refreshEnvironment(){
  if(state.usuario?.perfil!=='ADMIN')return;
  try{paintEnvironment(await api('estadoAmbiente'));}catch(err){toast('Administração: '+err.message,'error');}
}
function atualizarBotoesSAP(){
  const oficial=state.context?.modo==='OFICIAL',busy=Boolean(state.sapBusy);
  $('sapPreviewButton').disabled=oficial||busy;
  $('sapApplyButton').disabled=oficial||busy||!state.sapPreview?.pode_atualizar;
  $('sapSyncMode').textContent=oficial?'Base congelada — OFICIAL':'Disponível no modo TESTE';
}
function statusSAP(loading,message){
  $('sapSyncStatus').hidden=!loading;
  if(loading)$('sapSyncStatusText').textContent=message;
}
function desenharPreviaSAP(data){
  const stats=[['SKUs na origem',data.atuais],['Novos',data.novos],['Alterados',data.alterados],['Removidos',data.removidos],['Saldos alterados',data.saldos],['Centros/depósitos',data.setores]];
  const squares=stats.map(x=>'<div class="sap-preview-stat"><strong>'+num(x[1])+'</strong><small>'+safe(x[0])+'</small></div>').join('');
  const blockers=(data.impedimentos||[]).map(x=>'<div class="sap-sync-warning">'+safe(x)+'</div>').join('');
  const examples=(data.exemplos||[]).map(x=>'<span>'+safe(x.tipo)+' · '+safe(x.chave)+'</span>').join('');
  const result=!data.ha_alteracoes?'Nenhuma diferença identificada. A base já está atualizada.':
    data.pode_atualizar?'Diferenças encontradas. Revise os números e confirme a atualização.':
    'Alterações encontradas, mas a sincronização está bloqueada enquanto houver pendências.';
  $('sapSyncPreview').innerHTML='<strong>'+safe(result)+'</strong><div class="sap-preview-stats">'+squares+'</div>'+
    '<p class="sap-sync-info">Base anterior: '+num(data.anteriores)+' SKUs · '+num(data.descricoes)+' descrições alteradas · '+num(data.unidades)+' unidades de medida alteradas.</p>'+
    blockers+(examples?'<div class="sap-sync-info">Exemplos de alterações:</div><div class="sap-sync-rows">'+examples+'</div>':'');
}
async function visualizarBaseSAP(){
  if(state.usuario?.perfil!=='ADMIN'||state.sapBusy)return;
  state.sapBusy=true;state.sapPreview=null;atualizarBotoesSAP();
  const b=$('sapPreviewButton');btnBusy(b,true,'Comparando…');
  statusSAP(true,'Lendo a planilha SAP e comparando com o inventário…');
  try{
    const result=await api('previsualizarAtualizacaoSAP',{},240000);
    state.sapPreview=result;desenharPreviaSAP(result);
    if(result.impedimentos?.length)toast('Há pendências que impedem a atualização da base.','error');
  }catch(err){$('sapSyncPreview').innerHTML='<div class="sap-sync-warning">'+safe(err.message)+'</div>';toast('Base SAP: '+err.message,'error');}
  finally{state.sapBusy=false;btnBusy(b,false);statusSAP(false);atualizarBotoesSAP();}
}
async function aplicarBaseSAP(){
  if(state.usuario?.perfil!=='ADMIN'||state.sapBusy||!state.sapPreview?.pode_atualizar)return;
  const previa=state.sapPreview;
  if(!confirm('Atualizar o estoque de referência? Produtos, quantidades e depósitos serão substituídos pelos dados atuais da planilha SAP. A versão anterior ficará preservada.'))return;
  const confirmacao=prompt('Para confirmar a sincronização, digite exatamente: ATUALIZAR BASE SAP');
  if(confirmacao===null)return;
  if(confirmacao!=='ATUALIZAR BASE SAP'){toast('Confirmação incorreta. A base não foi alterada.','error');return;}
  state.sapBusy=true;atualizarBotoesSAP();
  const b=$('sapApplyButton');btnBusy(b,true,'Atualizando…');
  statusSAP(true,'Preparando nova versão da base SAP. Aguarde e não feche esta página…');
  try{
    const r=await api('atualizarBaseSAP',{assinatura:previa.assinatura,confirmacao},300000);
    state.sapPreview=null;
    state.catalogCache.clear();state.catalogPending.clear();state.catalogSignature='';state.dashboard=null;
    resetProduct();$('productCode').value='';hideSuggestions();
    $('sapSyncPreview').innerHTML='<div class="notice">Atualização concluída. '+num(r.atuais)+' SKUs ativos, '+num(r.novos)+' novos, '+num(r.alterados)+' alterados e '+num(r.removidos)+' removidos. A versão anterior foi preservada.</div>';
    toast('Base SAP sincronizada. Atualize as páginas de outros usuários para carregar o novo estoque.','success');
    await refreshContext();await refreshEnvironment();
  }catch(err){state.sapPreview=null;toast('Sincronização não concluída: '+err.message,'error');$('sapSyncPreview').innerHTML='<div class="sap-sync-warning">'+safe(err.message)+' Faça uma nova prévia antes de tentar novamente.</div>';}
  finally{state.sapBusy=false;btnBusy(b,false);statusSAP(false);atualizarBotoesSAP();}
}
async function clearTestData(){
  if(state.usuario?.perfil!=='ADMIN')return;
  if(!confirm('Deseja APAGAR todas as contagens e rodadas de teste? Esta operação não pode ser desfeita. A base SAP e os usuários serão preservados.'))return;
  const confirmacao=prompt('Para confirmar a exclusão de todos os registros de teste, digite exatamente: APAGAR TESTES');
  if(confirmacao===null)return;
  if(confirmacao!=='APAGAR TESTES'){toast('Confirmação incorreta. Nenhum dado foi apagado.','error');return;}
  const b=$('clearTestDataButton');btnBusy(b,true,'Limpando...');
  try{
    const r=await api('limparDadosTeste',{confirmacao},180000);
    state.product=null;state.requestId=null;resetProduct();$('lastSaved').hidden=true;
    toast('Dados de teste apagados. '+r.setores_restaurados+' setores restaurados na rodada 1.','success');
    await refreshContext();await refreshDashboard();await refreshEnvironment();
  }catch(err){toast('Limpeza não concluída: '+err.message,'error');await refreshEnvironment();}
  finally{btnBusy(b,false);}
}
async function startOfficialInventory(){
  if(state.usuario?.perfil!=='ADMIN')return;
  const ok=confirm('ATENÇÃO: ao iniciar o modo OFICIAL, nunca mais será possível limpar registros deste inventário pelo site. Confirme que a base SAP, o corte e a equipe estão validados. Deseja continuar?');
  if(!ok)return;
  const confirmacao=prompt('Esta alteração é PERMANENTE. Digite exatamente: INICIAR INVENTARIO OFICIAL');
  if(confirmacao===null)return;
  if(confirmacao!=='INICIAR INVENTARIO OFICIAL'){toast('Confirmação incorreta; o ambiente continua em TESTE.','error');return;}
  const b=$('officialModeButton');btnBusy(b,true,'Ativando...');
  try{
    await api('iniciarInventarioOficial',{confirmacao});
    toast('Modo OFICIAL ativado. A limpeza de dados foi bloqueada permanentemente.','success');
    await refreshContext();await refreshDashboard();await refreshEnvironment();
  }catch(err){toast(err.message,'error');await refreshEnvironment();}
  finally{btnBusy(b,false);}
}
function currentSector(){const val=$('sectorSelect').value;if(!val)throw Error('Selecione Centro e Depósito.');const [centro,deposito]=val.split('|');return {centro,deposito};}
function resetProduct(){state.product=null;state.requestId=null;$('saveCount').disabled=true;$('countUnit').textContent='';$('productInfo').className='product-card muted';$('productInfo').textContent='Busque um produto no centro e depósito selecionados.';}
function centrosDisponiveis(){
  return [...new Set((state.context?.setores||[]).map(x=>String(x.centro)))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
}
function pintarBotoesCentro(id,atual){
  $(id).innerHTML=centrosDisponiveis().map(c=>`<button type="button" class="center-choice ${c===atual?'active':''}" data-center="${safe(c)}" aria-pressed="${c===atual?'true':'false'}" title="Visualizar todos os depósitos do centro ${safe(c)}">${safe(c)}</button>`).join('');
}
function renderSupervisionCenterButtons(){
  const centros=centrosDisponiveis();
  if(!centros.includes(state.supervisionCenter))state.supervisionCenter=centros[0]||'';
  pintarBotoesCentro('supervisionCenterButtons',state.supervisionCenter);
}
function renderDashboardSectorOptions(centerChanged=false){
  const areas=state.context?.setores||[],centers=centrosDisponiveis();
  const oldCenter=$('dashboardCenter').value;
  const centro=centers.includes(oldCenter)?oldCenter:centers[0]||'';
  $('dashboardCenter').value=centro;
  pintarBotoesCentro('dashboardCenterButtons',centro);
  const depots=[...new Set(areas.filter(x=>String(x.centro)===centro).map(x=>String(x.deposito)))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  const oldDepot=centerChanged?'':$('dashboardDepot').value;
  $('dashboardDepot').innerHTML='<option value="">Todos os depósitos</option>'+depots.filter(Boolean).map(d=>`<option value="${safe(d)}">Depósito ${safe(d)}</option>`).join('');
  $('dashboardDepot').value=!centerChanged&&depots.includes(oldDepot)?oldDepot:'';
  if(centerChanged||!$('filterCenter').value)$('filterCenter').value=centro;
  if(centerChanged)$('filterDepot').value='';
  renderSupervisionCenterButtons();
}
function selecionarCentroDashboard(centro){
  if(!centrosDisponiveis().includes(centro))return;
  // Pressionar o centro já ativo também retorna a "Todos os depósitos".
  $('dashboardCenter').value=centro;
  renderDashboardSectorOptions(true);
  // Ao trocar de centro, iniciar pela visão integral, sem filtros antigos do Localizador.
  $('dashboardQuery').value='';
  for(const id of ['filterCode','filterRua','filterZona','filterPosicao','filterPalete'])$(id).value='';
  state.productPage=1;
  refreshDashboard('Atualizando centro…');
}
function selecionarCentroSupervisao(centro){
  if(!centrosDisponiveis().includes(centro))return;
  state.supervisionCenter=centro;
  renderSupervisionCenterButtons();
  if(state.dashboard)pintarTabelaSupervisao(state.dashboard);
  else refreshDashboard();
}
function hideSuggestions(){
  state.suggestionSequence++;
  if(state.suggestionTimer){clearTimeout(state.suggestionTimer);state.suggestionTimer=null;}
  state.suggestions=[];state.suggestionActive=-1;
  $('productSuggestions').hidden=true;$('productSuggestions').innerHTML='';
  $('productCode').setAttribute('aria-expanded','false');
  $('productCode').removeAttribute('aria-activedescendant');
}
function suggestionMessage(message,loading=false){
  state.suggestions=[];state.suggestionActive=-1;
  const list=$('productSuggestions');
  list.innerHTML='<div class="suggestion-message">'+(loading?'<span class="mini-spinner" aria-hidden="true"></span>':'')+'<span>'+safe(message)+'</span></div>';
  list.hidden=false;$('productCode').setAttribute('aria-expanded','true');
}
function foldText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();}
function scopeCatalog(){
  const selection=$('sectorSelect').value;if(!selection||!state.context)return null;
  const [centro,deposito]=selection.split('|');
  const round=state.context.setores.find(x=>String(x.centro)===centro&&String(x.deposito)===deposito);
  return {key:[state.context.inventario?.id,state.usuario?.usuario,centro,deposito,round?.rodada_id].join('|'),selection,centro,deposito};
}
function preloadCatalog(){
  const scope=scopeCatalog();if(!scope||state.catalogUnsupported)return Promise.resolve(null);
  if(state.catalogCache.has(scope.key))return Promise.resolve(state.catalogCache.get(scope.key));
  if(state.catalogPending.has(scope.key))return state.catalogPending.get(scope.key);
  const promise=api('catalogoProdutos',{centro:scope.centro,deposito:scope.deposito},90000)
    .then(data=>{
      // Cada catálogo pertence a uma rodada e usuário específicos.
      const rows=(data.itens||[]).map(p=>({...p,codeSearch:foldText(p.codigo),nameSearch:foldText(p.descricao)}));
      if(scope.key===scopeCatalog()?.key)state.catalogCache.set(scope.key,rows);
      else if(state.catalogSignature)state.catalogCache.set(scope.key,rows);
      return rows;
    })
    .catch(err=>{
      if(/M[eé]todo n[aã]o permitido|is not a function|Fun[cç][aã]o n[aã]o encontrada/i.test(err.message))state.catalogUnsupported=true;
      return null;
    }).finally(()=>state.catalogPending.delete(scope.key));
  state.catalogPending.set(scope.key,promise);
  return promise;
}
function localSuggestions(catalog,term){
  const query=foldText(term),matches=[];
  for(const item of catalog){
    const c=item.codeSearch,n=item.nameSearch;
    const score=c.startsWith(query)?0:c.includes(query)?1:n.startsWith(query)?2:n.includes(query)?3:99;
    if(score===99)continue;
    matches.push({score,item});
  }
  // Código exato/prefixo aparece antes de correspondências no meio da descrição.
  matches.sort((a,b)=>a.score-b.score);
  return matches.slice(0,12).map(x=>x.item);
}
function paintSuggestions(items){
  state.suggestions=items;state.suggestionActive=-1;
  const list=$('productSuggestions');
  list.innerHTML=items.length?items.map((x,i)=>`<button type="button" role="option" id="productSuggestion${i}" aria-selected="false" data-suggest-code="${safe(x.codigo)}" class="suggestion"><strong>${safe(x.codigo)}</strong><span>${safe(x.descricao)}</span><small>${safe(x.um)}</small></button>`).join(''):'<div class="suggestion-empty">Nenhum produto disponível nesta rodada.</div>';
  list.hidden=false;$('productCode').setAttribute('aria-expanded','true');
}
function queueSuggestions(){
  const seq=++state.suggestionSequence;
  if(state.suggestionTimer)clearTimeout(state.suggestionTimer);
  const term=$('productCode').value.trim(),scope=scopeCatalog();
  if(term.length<2||!scope){hideSuggestions();return;}
  const valid=()=>seq===state.suggestionSequence&&scope.selection===$('sectorSelect').value&&term===$('productCode').value.trim();
  if(state.catalogCache.has(scope.key)){
    paintSuggestions(localSuggestions(state.catalogCache.get(scope.key),term));return;
  }
  suggestionMessage('Carregando produtos do depósito…',true);
  preloadCatalog().then(catalog=>{
    if(!valid())return;
    if(catalog){paintSuggestions(localSuggestions(catalog,term));return;}
    // Compatibilidade com implantação antiga ou restrições de catálogo: pesquisa remota existente.
    state.suggestionTimer=setTimeout(async()=>{
      if(!valid())return;
      try{
        const data=await api('sugerirProdutos',{centro:scope.centro,deposito:scope.deposito,termo:term});
        if(valid())paintSuggestions(data.itens||[]);
      }catch(err){if(valid())suggestionMessage('Não foi possível pesquisar. Tente novamente.');}
    },120);
  });
}
async function pickSuggestion(code){
  $('productCode').value=code;
  hideSuggestions();
  await searchProduct({preventDefault(){}});
}
function suggestionsKeydown(e){
  if($('productSuggestions').hidden)return;
  const items=state.suggestions;
  if(e.key==='Escape'){e.preventDefault();hideSuggestions();return;}
  if((e.key==='ArrowDown'||e.key==='ArrowUp')&&items.length){
    e.preventDefault();state.suggestionActive=(state.suggestionActive+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
    [...$('productSuggestions').querySelectorAll('[role="option"]')].forEach((node,i)=>node.setAttribute('aria-selected',String(i===state.suggestionActive)));
    $('productCode').setAttribute('aria-activedescendant','productSuggestion'+state.suggestionActive);
    return;
  }
  if(e.key==='Enter'&&state.suggestionActive>=0){e.preventDefault();pickSuggestion(items[state.suggestionActive].codigo);}
}
function roundCell(code,index){
  const classes={CONFERIDO:['passed','Conferido'],SEGUNDA_CONTAGEM:['warning','Nova contagem'],DIVERGENTE:['failed','Divergência de Estoque'],EM_CONTAGEM:['active','Em contagem'],PENDENTE:['pending','Pendente']};
  const [color,label]=classes[code]||classes.PENDENTE;
  return `<span class="round-state ${color}" title="${safe(label)}"><span class="round-dot ${color}" aria-hidden="true"></span>${safe(label)}</span>`;
}
function paintFollowup(data){
  if(!data)return;
  state.productPage=data.pagina;
  const fmtPercent=n=>String(n||0)+'%';
  $('progressOverview').innerHTML=`
    <div class="progress-tile"><span>Produtos dos depósitos selecionados</span><strong>${num(data.total)}</strong></div>
    <div class="progress-tile"><span>Contagem iniciada</span><strong>${num(data.contados)} <small>(${fmtPercent(data.progresso)})</small></strong><div class="progress-track"><div class="progress-fill started" style="width:${data.progresso}%"></div></div></div>
    <div class="progress-tile"><span>Contagem concluída</span><strong>${num(data.concluidos)} <small>(${fmtPercent(data.conclusao)})</small></strong><div class="progress-track"><div class="progress-fill completed" style="width:${data.conclusao}%"></div></div></div>
    <div class="progress-tile"><span>Estoque batendo</span><strong>${num(data.batendo)}</strong><small>${num(data.divergentes)} divergentes após 3 rodadas</small></div>`;
  $('followupBody').innerHTML=data.itens.length?data.itens.map(x=>`<tr>
    <td><strong>${safe(x.codigo)}</strong></td><td class="product-description">${safe(x.descricao)}</td><td>${safe(x.centro)}</td><td>${safe(x.deposito||'—')}</td>
    ${x.rodadas.map((s,i)=>`<td>${roundCell(s,i)}</td>`).join('')}
    <td><span class="final-status ${safe(x.tipo)}">${safe(x.situacao)}</span></td>
  </tr>`).join(''):'<tr><td colspan="8" class="empty">Nenhum produto encontrado para este filtro.</td></tr>';
  $('followupCount').textContent=`${num(data.total_filtrado)} produtos encontrados · Exibindo até 50 por página`;
  $('followupPage').textContent=`Página ${num(data.pagina)} de ${num(data.total_paginas)}`;
  $('followupPrev').disabled=data.pagina<=1;
  $('followupNext').disabled=data.pagina>=data.total_paginas;
}

async function searchProduct(event){event.preventDefault();hideSuggestions();const button=$('searchForm').querySelector('button');btnBusy(button,true,'Buscando...');resetProduct();try{
  const scope=currentSector();const codigo=$('productCode').value.trim();if(!codigo)throw Error('Informe o código do produto.');
  const product=await api('consultarProduto',{...scope,codigo});state.product=product;
  $('productInfo').className='product-card';$('productInfo').innerHTML=`<strong>${safe(product.descricao)}</strong><div class="meta">Código ${safe(product.codigo)} · Centro ${safe(product.centro)} · Depósito ${safe(product.deposito)} · Unidade ${safe(product.um)}</div><span class="pill">Rodada ${safe(product.rodada_numero)}</span>`;
  $('countUnit').textContent='('+product.um+')';$('saveCount').disabled=false;$('quantity').focus();
}catch(err){toast(err.message,'error');}finally{btnBusy(button,false);}}
async function saveCount(event){event.preventDefault();const button=$('saveCount');btnBusy(button,true,'Registrando...');try{
  if(!state.product)throw Error('Busque um produto antes de registrar.');
  const sector=currentSector();if(sector.centro!==state.product.centro||sector.deposito!==state.product.deposito)throw Error('O setor mudou. Busque o produto novamente.');
  const d={...sector,codigo:state.product.codigo,
    rua:$('rua').value,zona:$('zona').value,posicao:$('posicao').value,palete:$('palete').value,
    quantidade:$('quantity').value,
    data_contagem:$('countDate').value,primeiro_conferente:$('firstChecker').value.trim(),
    segundo_conferente:$('secondChecker').value.trim(),etiqueta:$('countTag').value.trim()};
  const value=d.quantidade.trim().includes(',')?d.quantidade.trim().replace(/\./g,'').replace(',','.'):d.quantidade.trim();if(!/^(\d+(\.\d+)?)$/.test(value))throw Error('Quantidade inválida. Use número positivo ou zero.');
  if(Number(value)>0&&['rua','zona','posicao','palete'].some(k=>!d[k]))throw Error('Informe todos os quatro campos de endereço.');
   if(!/^\d{1,12}$/.test(d.etiqueta)||Number(d.etiqueta)===0)throw Error('Informe um número de etiqueta válido, com até 12 dígitos.');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d.data_contagem))throw Error('Informe a data da contagem.');
   if(d.primeiro_conferente.length<2||d.segundo_conferente.length<2)throw Error('Informe o nome dos dois conferentes.');
   if(d.primeiro_conferente.toLocaleUpperCase('pt-BR')===d.segundo_conferente.toLocaleUpperCase('pt-BR'))throw Error('Informe dois conferentes distintos.');
  if(!state.requestId)state.requestId=random();
  const saved=await api('salvarContagem',{...d,request_id:state.requestId});
  $('lastSaved').hidden=false;$('lastSaved').textContent=(saved.duplicado?'Lançamento já recebido anteriormente.':'Lançamento registrado com sucesso!')
    +' Etiqueta Nº '+d.etiqueta+' · Data '+d.data_contagem+' · Conferentes '+d.primeiro_conferente+' e '+d.segundo_conferente
    +' · Produto '+d.codigo+' · '+d.quantidade+' '+state.product.um+' · Rua '+(d.rua||'—')
    +' / Zona '+(d.zona||'—')+' / Posição '+(d.posicao||'—')+' / Palete '+(d.palete||'—')+'.';
  toast('Ficha de contagem registrada e auditada!','success');state.dashboard=null;state.requestId=null;
    $('quantity').value='';$('countTag').value='';$('countTag').focus();
}catch(err){toast(err.message,'error');}finally{btnBusy(button,false);button.disabled=!state.product;}}
function fmtDate(x){const d=new Date(x);return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{timeZone:'America/Manaus'}):String(x||'');}

/** Velocímetro global — porcentagem de SKUs (código+centro+depósito) com algum lançamento. */

function gaugePoint(pct,radius=95){
  const angle=Math.PI*(1-pct/100);
  return {x:120+radius*Math.cos(angle),y:116-radius*Math.sin(angle)};
}
function gaugeArc(start,end){
  if(end<=start)return '';
  const a=gaugePoint(start),b=gaugePoint(end);
  return 'M '+a.x.toFixed(2)+' '+a.y.toFixed(2)+' A 95 95 0 0 1 '+b.x.toFixed(2)+' '+b.y.toFixed(2);
}
function paintGauge(progresso){
  const data=progresso||{total:0,contados:0,percentual:0};
  const pct=Math.max(0,Math.min(100,Number(data.percentual)||0));
  $('gaugePercent').textContent=pct.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  $('gaugeFraction').textContent=num(data.contados)+' de '+num(data.total)+' produtos contados';
  // Cada segmento começa onde o anterior termina: não há arredondamento da ponta direita em 0%.
  for(const zone of [{id:'gaugeZoneLow',start:0,end:35},{id:'gaugeZoneMid',start:35,end:65},{id:'gaugeZoneHigh',start:65,end:100}]){
    $(''+zone.id).setAttribute('d',gaugeArc(zone.start,Math.min(pct,zone.end)));
  }
  const tip=gaugePoint(pct,75);
  $('gaugeNeedle').setAttribute('x2',tip.x.toFixed(2));
  $('gaugeNeedle').setAttribute('y2',tip.y.toFixed(2));
}

function renderRecountExports(){
  const center=$('dashboardCenter').value,depot=$('dashboardDepot').value;
  const sector=depot?state.dashboard?.setores?.find(x=>String(x.centro)===center&&String(x.deposito)===depot):null;
  // Somente a recontagem da etapa atual/seguinte fica visível (nunca ambas).
  const rodada=Number(sector?.numero)||0;
  const n2=Number(sector?.exportacao_segunda)||0,n3=Number(sector?.exportacao_terceira)||0;
  let n=0,total=0;
  if(rodada===1&&sector?.status==='ENCERRADA'&&n2>0){n=2;total=n2;}
  else if(rodada===2&&sector?.status==='ABERTA'&&n2>0){n=2;total=n2;}
  else if(rodada===2&&sector?.status==='ENCERRADA'&&n3>0){n=3;total=n3;}
  else if(rodada===3&&sector?.status==='ABERTA'&&n3>0){n=3;total=n3;}
  const available=n>0;
  $('recountExportPanel').hidden=!available;
  $('exportRound2').hidden=n!==2;
  $('exportRound3').hidden=n!==3;
  $('exportRound2').disabled=n!==2;
  $('exportRound3').disabled=n!==3;
  $('exportRound2').textContent='Exportar';
  $('exportRound3').textContent='Exportar';
  if(available){
    $('recountExportHint').textContent='Lista da '+n+'ª contagem · '+num(total)+' produtos divergentes · Centro '+center+' · Depósito '+(depot||'Não informado')+'. Sem saldo SAP.';
  }
}
/** Impede que descrições sejam interpretadas como fórmulas por programas de planilha. */
function csvCell(value){
  const raw=String(value??'');
  const valueSafe=/^[=+@-]/.test(raw.trimStart())?"'"+raw:raw;
  return '"'+valueSafe.replace(/"/g,'""')+'"';
}
function gerarCsvRecontagem(lista){
  const headers=['Código','Descrição','Unidade','Centro','Depósito','Rodada','Rua','Zona','Posição','Palete','Quantidade física'];
  const linhas=[headers,...lista.itens.map(p=>[p.codigo,p.descricao,p.um,p.centro,p.deposito,lista.numero,'','','','',''])];
  const csv='\uFEFF'+linhas.map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const href=URL.createObjectURL(blob),link=document.createElement('a');
  const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
  const key=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_')||'SEM_DEP';
  link.href=href;link.download='Friovix_'+lista.numero+'a_Contagem_C'+key(lista.centro)+'_D'+key(lista.deposito)+'_'+stamp+'.csv';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(href),3000);
}
async function exportarRecontagem(numeroRodada,button){
  if(!canSupervise())return;
  const centro=$('dashboardCenter').value,deposito=$('dashboardDepot').value;
  if(!centro){toast('Selecione centro e depósito no dashboard.','error');return;}
  btnBusy(button,true,'Preparando CSV…');
  try{
    const lista=await api('exportarListaRecontagem',{numero:numeroRodada,centro,deposito},180000);
    if(!Array.isArray(lista.itens)||!lista.itens.length)throw Error('Nenhum produto elegível encontrado.');
    gerarCsvRecontagem(lista);
    toast('Lista da '+numeroRodada+'ª contagem gerada com '+num(lista.itens.length)+' produtos.','success');
  }catch(err){toast('Exportação: '+err.message,'error');}
  finally{btnBusy(button,false);renderRecountExports();}
}

/** Os cards e o velocímetro SEMPRE recebem exatamente o mesmo escopo do centro/depósito. */
function paintScopedIndicators(metricas){
  const m=metricas||{total:0,contados:0,batendo:0,divergentes:0,percentual:0};
  const cards=[
    {nome:'Produtos Contados',quantidade:m.contados,classe:'counted',detalhe:'Produtos distintos com lançamento'},
    {nome:'Produtos Batendo',quantidade:m.batendo,classe:'passed',detalhe:'Conferidos em rodada encerrada'},
    {nome:'Produtos Divergente',quantidade:m.divergentes,classe:'failed',detalhe:'Divergentes após a 3ª contagem'},
    {nome:'Etiquetas Registradas',quantidade:m.etiquetas||0,classe:'tags',detalhe:'Etiquetas distintas digitadas no sistema'}
  ];
  $('stats').innerHTML=cards.map(c=>`<div class="stat stat-${c.classe}"><span>${safe(c.nome)}</span><strong>${num(c.quantidade)}</strong><small>${safe(c.detalhe)}</small></div>`).join('');
  paintGauge(m);
}
function sectorRecommendation(round){
  if(round.status==='REABRINDO')return {classe:'active',texto:'Reabertura em andamento',nota:'Aguardando conclusão'};
  if(round.status!=='ENCERRADA')return {classe:'active',texto:'Em contagem',nota:'Finalize todos os produtos da rodada'};
  const divergentes=Number(round.divergentes_na_rodada)||0;
  if(divergentes===0)return {classe:'passed',texto:'Estoque Batendo',nota:'Nenhuma divergência nesta rodada'};
  if(Number(round.numero)===1)return {classe:'warning',texto:'Segunda Contagem',nota:num(divergentes)+' produtos para recontagem'};
  if(Number(round.numero)===2)return {classe:'warning',texto:'Terceira Contagem',nota:num(divergentes)+' produtos para recontagem'};
  return {classe:'failed',texto:'Estoque Divergente',nota:num(divergentes)+' produtos com divergência final'};
}

/** CSV UTF-8 para Excel, mantendo valores numéricos e protegendo textos que parecem fórmulas. */
function salvarCsvSeguro_(filename,headers,rows,numericColumns){
  const numbers=new Set(numericColumns||[]);
  const enc=(value,index)=>{
    if(numbers.has(index)){
      const n=Number(value);
      if(!Number.isFinite(n))throw Error('Número inválido no relatório: '+value);
      return String(n).replace('.',',');
    }
    return csvCell(value);
  };
  const csv='\uFEFF'+[headers,...rows].map((row,i)=>row.map((v,j)=>i?enc(v,j):csvCell(v)).join(';')).join('\r\n')+'\r\n';
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function exportarRelatorioInventario(tipo,centro,deposito,numero,button){
  if(!canSupervise())return;
  btnBusy(button,true,'Gerando relatório…');
  try{
    const data=await api('exportarRelatorioInventario',{tipo,centro,deposito,numero},180000);
    if(!Array.isArray(data.itens)||!data.itens.length)throw Error('O relatório não possui produtos.');
    const headers=['Apontador','1º Conferente','2º Conferente','Data da contagem','Etiqueta(s)',
      'Código','Descrição','Centro','Depósito','Rodada','Quantidade encontrada','Quantidade SAP','Diferença','Situação'];
    const rows=data.itens.map(x=>[x.apontador||x.contador,x.primeiro_conferente||'',x.segundo_conferente||'',
      x.data_contagem||'',x.etiquetas||'',x.codigo,x.descricao,x.centro,x.deposito,x.rodada,
      x.quantidade_encontrada,x.quantidade_sap,x.diferenca,x.situacao]);
    const key=x=>String(x).replace(/[^A-Za-z0-9_-]/g,'_')||'SEM_DEP';
    const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
    const label=tipo==='FINAL'?'FINAL':'RODADA_'+Number(numero);
    const name='FRIOVIX_INVENTARIO_'+label+'_C'+key(centro)+'_D'+key(deposito)+'_'+stamp+'.csv';
    salvarCsvSeguro_(name,headers,rows,[9,10,11,12]);
    toast('Relatório '+(tipo==='FINAL'?'final':'da '+numero+'ª rodada')+' gerado com '+num(data.itens.length)+' produtos.','success');
  }catch(err){toast('Relatório de inventário: '+err.message,'error');}
  finally{btnBusy(button,false);}
}
async function exportarLocalizacoes(button){
  if(!canSupervise())return;
  btnBusy(button,true,'Extraindo endereços…');
  try{
    const response=await api('exportarLocalizador',{filtro:getFilter()},180000);
    if(!Array.isArray(response.itens)||!response.itens.length)throw Error('Nenhuma localização disponível.');
    const headers=['Código','Descrição','Unidade','Centro','Depósito','Rua','Zona','Posição','Palete','Quantidade','Rodada'];
    const rows=response.itens.map(x=>[x.codigo,x.descricao,x.um,x.centro,x.deposito,x.rua,
      x.zona,x.posicao,x.palete,x.quantidade,x.rodada]);
    const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
    salvarCsvSeguro_('FRIOVIX_LOCALIZADOR_'+stamp+'.csv',headers,rows,[9,10]);
    toast('Localizações exportadas: '+num(response.itens.length)+' endereços conforme os filtros.','success');
  }catch(err){toast('Exportação do localizador: '+err.message,'error');}
  finally{btnBusy(button,false);}
}

function pintarTabelaSupervisao(data){
  const setores=(data.setores||[]).filter(r=>String(r.centro)===state.supervisionCenter);
  $('sectorsBody').innerHTML=setores.length?setores.map(r=>{
    const percent=r.total_alvo?Math.round(100*r.produtos_registrados/r.total_alvo):0;
    const indicador=sectorRecommendation(r),hasDifferences=Number(r.divergentes_na_rodada)>0;
    const action=r.status==='ABERTA'
      ?`<button class="btn secondary action-small" data-close="${safe(r.rodada_id)}">Encerrar</button>`
      :r.status==='REABRINDO'
      ?`<button class="btn secondary action-small" data-reopen="${safe(r.rodada_id)}">Retomar reabertura</button>`
      :r.status==='ENCERRADA'
      ?`<div class="round-actions">${r.numero<3&&hasDifferences?`<button class="btn secondary action-small" data-open="${safe(r.centro)}|${safe(r.deposito)}">Próxima rodada</button>`:''}${r.pode_reabrir?`<button class="btn outline-reopen action-small" data-reopen="${safe(r.rodada_id)}" title="Reabrir a contagem mantendo o histórico">Reabrir</button>`:''}${!r.pode_reabrir&&(!hasDifferences||r.numero===3)?'<span class="tiny">Concluído</span>':''}</div>`:'—';

    const reportRounds=Array.isArray(r.relatorios_rodadas)?r.relatorios_rodadas:[];
    const reportOptions=reportRounds.map(z=>'<option value="'+Number(z.numero)+'">'+Number(z.numero)+'ª contagem</option>').join('');
    const reportList=reportRounds.length
      ?'<div class="report-round-action"><select class="report-round-select" aria-label="Selecione a rodada encerrada">'+reportOptions+'</select>'
       +'<button type="button" class="btn secondary action-small" data-report-kind="RODADA" data-report-center="'+safe(r.centro)+'" data-report-depot="'+safe(r.deposito)+'" title="Exporta apenas os itens desta rodada">Exportar rodada</button></div>'
      :'<span class="tiny">Aguarde o encerramento</span>';
    const reportFinal=r.relatorio_final_disponivel
      ?'<button type="button" class="btn report-final-btn action-small" data-report-kind="FINAL" data-report-center="'+safe(r.centro)+'" data-report-depot="'+safe(r.deposito)+'" title="Inclui o último resultado de todos os produtos deste setor">Exportar relatório final</button>'
      :'';
    const reports='<div class="sector-reports">'+reportList+reportFinal+'</div>';
    const progress=`<div class="sector-progress" role="progressbar" aria-label="Progresso da ${num(r.numero)}ª contagem" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><div class="sector-progress-top"><strong>${percent}%</strong><span>${num(r.produtos_registrados)} de ${num(r.total_alvo)} produtos</span></div><div class="sector-progress-track"><div class="sector-progress-fill ${percent===100?'complete':''}" style="width:${percent}%"></div></div></div>`;
    const recommendation=`<div class="sector-recommendation ${indicador.classe}"><span class="sector-recommendation-dot" aria-hidden="true"></span><div><strong>${safe(indicador.texto)}</strong><small>${safe(indicador.nota)}</small></div></div>`;
    return `<tr><td><strong>${safe(r.centro)}</strong></td><td>${safe(r.deposito)}</td><td>${safe(r.numero)}ª</td><td><span class="tag ${r.status==='ABERTA'?'warn':'end'}">${safe(r.status)}</span></td><td>${progress}</td><td>${num(r.faltando_total)}${r.faltando_total?'<div class="tiny">Ex.: '+safe(r.produtos_faltando.slice(0,3).join(', '))+'</div>':''}</td><td>${recommendation}</td><td>${reports}</td><td>${action}</td></tr>`;
  }).join(''):'<tr><td colspan="9" class="empty">Nenhum setor disponível.</td></tr>';

}

function paintDashboard(data){state.dashboard=data;
  paintScopedIndicators(data.metricas);renderRecountExports();
  $('locationCount').textContent=`${num(data.total_enderecos_filtrados)} endereços encontrados. Exibindo até 400 resultados; refine os filtros se necessário.`;
  $('locationsBody').innerHTML=data.enderecos.length?data.enderecos.map(x=>`<tr><td><strong>${safe(x.codigo)}</strong></td><td class="locator-description">${safe(x.descricao)}</td><td class="locator-quantity-cell"><strong class="locator-quantity-value">${num(x.quantidade)}</strong></td><td>${safe(x.centro)}</td><td>${safe(x.deposito)}</td><td>${safe(x.rua)}</td><td>${safe(x.zona)}</td><td>${safe(x.posicao)}</td><td>${safe(x.palete)}</td><td>${safe(x.rodada)}</td></tr>`).join(''):'<tr><td colspan="10" class="empty">Nenhum material encontrado nos filtros escolhidos.</td></tr>';
  pintarTabelaSupervisao(data);
  paintFollowup(data.acompanhamento);
}
function getFilter(){return Object.fromEntries([['codigo','filterCode'],['centro','filterCenter'],['deposito','filterDepot'],['rua','filterRua'],['zona','filterZona'],['posicao','filterPosicao'],['palete','filterPalete']].map(([k,id])=>[k,$(id).value.trim()]));}
function followupOptions(){return {centro:$('dashboardCenter').value,deposito:$('dashboardDepot').value,termo:$('dashboardQuery').value.trim(),pagina:state.productPage};}
function followupLoading(active){
  $('followupLoading').hidden=!active;
  btnBusy($('searchFollowup'),active,'Filtrando…');
  $('followupPrev').disabled=active||!state.dashboard?.acompanhamento||state.dashboard.acompanhamento.pagina<=1;
  $('followupNext').disabled=active||!state.dashboard?.acompanhamento||state.dashboard.acompanhamento.pagina>=state.dashboard.acompanhamento.total_paginas;
  $('progressOverview').setAttribute('aria-busy',String(active));
  $('followupBody').setAttribute('aria-busy',String(active));
  $('stats').setAttribute('aria-busy',String(active));
  document.querySelector('.gauge-panel').setAttribute('aria-busy',String(active));
}
async function refreshFollowup(){
  if(!canSupervise())return;
  if(state.dashboardLoading){state.dashboardQueued='Atualizando dashboard…';return;}
  if(!state.dashboard){return refreshDashboard();}
  const seq=++state.followupSeq;
  followupLoading(true);
  try{
    const data=await api('filtrarAcompanhamento',{acompanhamento:followupOptions()});
    if(seq!==state.followupSeq)return;
    state.dashboard.acompanhamento=data;
    // A mesma resposta leve atualiza indicadores e velocímetro do setor escolhido.
    paintScopedIndicators(data.metricas);
    state.dashboard.metricas=data.metricas;
    paintFollowup(data);
  }catch(err){
    if(seq!==state.followupSeq)return;
    if(/M[eé]todo n[aã]o permitido|is not a function|Fun[cç][aã]o n[aã]o encontrada/i.test(err.message)){
      // Implantação anterior continua funcionando; apenas não terá o ganho do endpoint leve.
      followupLoading(false);return refreshDashboard('Atualizando dashboard…');
    }
    toast('Filtragem de produtos: '+err.message,'error');
  }finally{if(seq===state.followupSeq)followupLoading(false);}
}
function queueFollowup(){
  state.followupSeq++;
  if(state.followupTimer)clearTimeout(state.followupTimer);
  followupLoading(true);
  state.followupTimer=setTimeout(()=>{state.followupTimer=null;refreshFollowup();},110);
}
async function refreshDashboard(reason){
  if(!canSupervise())return;
  reason=typeof reason==='string'?reason:'Atualizando dashboard…';
  if(state.dashboardLoading){state.dashboardQueued=reason;return;}
  state.dashboardLoading=true;
  state.followupSeq++;if(state.followupTimer){clearTimeout(state.followupTimer);state.followupTimer=null;}
  const isFilter=reason==='Filtrando endereços…',filterBtn=$('filterForm').querySelector('button[type="submit"]');
  $('dashboardStatusText').textContent=reason;$('dashboardStatus').hidden=false;
  $('tab-painel').classList.add(isFilter?'is-filtering':'is-refreshing');
  $('tab-painel').setAttribute('aria-busy','true');
  $('locatorLoading').hidden=!isFilter;
  followupLoading(!isFilter);
  btnBusy(isFilter?filterBtn:$('refreshDashboard'),true,isFilter?'Pesquisando…':'Atualizando…');
  try{
    const data=await api('painel',{filtro:getFilter(),acompanhamento:followupOptions()});
    paintDashboard(data);
    $('dashboardUpdatedAt').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }catch(err){toast('Dashboard: '+err.message,'error');}
  finally{
    btnBusy(isFilter?filterBtn:$('refreshDashboard'),false);
    $('tab-painel').classList.remove('is-filtering','is-refreshing');
    $('tab-painel').setAttribute('aria-busy','false');$('dashboardStatus').hidden=true;
    $('locatorLoading').hidden=true;followupLoading(false);
    state.dashboardLoading=false;
    if(state.dashboardQueued){const queued=state.dashboardQueued;state.dashboardQueued='';refreshDashboard(queued);}
  }
}

let pendingRoundAction=null,roundActionBusy=false;
function closeRoundDialog(){
  if(roundActionBusy)return;
  $('roundActionDialog').close();pendingRoundAction=null;
}
function showRoundDialog(kind,ref){
  if(!canSupervise()||roundActionBusy)return;
  const row=kind==='open'
    ?state.dashboard?.setores?.find(x=>x.centro+'|'+x.deposito===ref)
    :state.dashboard?.setores?.find(x=>x.rodada_id===ref);
  if(!row){toast('Atualize a Supervisão e tente novamente.','error');return;}
  pendingRoundAction={kind,row};
  const title={close:'Encerrar rodada',open:'Iniciar próxima rodada',reopen:'Reabrir rodada'}[kind];
  const number=kind==='open'?Number(row.numero)+1:Number(row.numero);
  const detail=kind==='close'
    ?'Confirma o encerramento da '+number+'ª contagem? Após confirmar, o sistema consolidará as quantidades e bloqueará novos lançamentos até uma nova rodada ou reabertura.'
    :kind==='open'
    ?'Confirma a abertura da '+number+'ª contagem? Somente os materiais divergentes da rodada anterior serão liberados.'
    :'Confirma a reabertura da '+number+'ª contagem? Os lançamentos existentes serão preservados e os resultados anteriores ficarão no histórico.';
  $('roundDialogTitle').textContent=title;
  $('roundDialogText').textContent=detail;
  $('roundDialogUser').textContent=state.usuario.nome+' ('+state.usuario.usuario+')';
  $('roundDialogSector').textContent='Centro '+row.centro+' · Depósito '+(row.deposito||'Não informado')+' · '+number+'ª rodada';
  $('roundDialogReasonWrap').hidden=kind!=='reopen';
  $('roundDialogReason').value='';
  $('roundDialogStatus').hidden=true;
  $('roundDialogConfirm').textContent='Confirmar '+(kind==='close'?'encerramento':kind==='reopen'?'reabertura':'nova rodada');
  $('roundDialogCancel').disabled=false;
  $('roundActionDialog').showModal();
  if(kind==='reopen')$('roundDialogReason').focus();
  else $('roundDialogConfirm').focus();
}
async function confirmRoundAction(){
  if(!pendingRoundAction||roundActionBusy)return;
  const {kind,row}=pendingRoundAction;
  const motivo=$('roundDialogReason').value.trim();
  if(kind==='reopen'&&motivo.length<10){toast('Informe o motivo da reabertura com pelo menos 10 caracteres.','error');$('roundDialogReason').focus();return;}
  roundActionBusy=true;
  const button=$('roundDialogConfirm'),status=$('roundDialogStatus');
  const labels={close:'Encerrando rodada…',reopen:'Reabrindo rodada…',open:'Abrindo próxima rodada…'};
  btnBusy(button,true,labels[kind]);$('roundDialogCancel').disabled=true;
  status.hidden=false;$('roundDialogStatusText').textContent=labels[kind]+' Atualizando a tela ao concluir.';
  try{
    let result;
    if(kind==='close')result=await api('encerrarRodada',{rodada_id:row.rodada_id},180000);
    else if(kind==='reopen')result=await api('reabrirRodada',{rodada_id:row.rodada_id,motivo},180000);
    else result=await api('abrirProximaRodada',{centro:row.centro,deposito:row.deposito},180000);
    // A seleção e os catálogos devem refletir imediatamente a nova rodada, sem F5.
    state.catalogCache.clear();state.catalogPending.clear();state.catalogSignature='';state.dashboard=null;
    resetProduct();hideSuggestions();$('productCode').value='';
    await refreshContext();
    if($('sectorSelect').value===row.centro+'|'+row.deposito)await preloadCatalog();
    await refreshDashboard();
    $('roundActionDialog').close();pendingRoundAction=null;
    const msg=kind==='close'?('Rodada '+result.numero+' encerrada. '+result.materiais+' materiais e '+result.divergentes+' divergências.')
      :kind==='open'?('Rodada '+result.numero+' aberta: '+result.alvos+' materiais para recontagem.')
      :('Rodada '+result.numero+' reaberta. Contagens anteriores preservadas.');
    toast(msg,'success');
  }catch(err){toast('Operação não concluída: '+err.message,'error');$('roundDialogStatusText').textContent='Não foi possível concluir. Confira o erro e tente novamente.';}
  finally{
    roundActionBusy=false;btnBusy(button,false);$('roundDialogCancel').disabled=false;
    if(!$('roundActionDialog').open)status.hidden=true;
  }
}
function doClose(roundId){showRoundDialog('close',roundId);}
function doReopen(roundId){showRoundDialog('reopen',roundId);}
function doOpen(value){showRoundDialog('open',value);}
async function refreshUsers(){if(state.usuario?.perfil!=='ADMIN')return;try{const users=await api('listarUsuarios');$('userList').innerHTML=users.map(u=>`<div class="person"><div><strong>${safe(u.nome)}</strong><small>${safe(u.usuario)}</small></div><span class="tag ${u.ativo==='SIM'?'ok':'warn'}">${safe(rotuloPerfil_(u.perfil))}</span></div>`).join('');}catch(err){toast(err.message,'error');}}
async function doCreateUser(event){event.preventDefault();const button=$('userForm').querySelector('button');btnBusy(button,true,'Salvando...');try{
  const usuario={usuario:$('newUsername').value.trim(),nome:$('newName').value.trim(),perfil:$('newRole').value,senha:$('newPassword').value};await api('cadastrarUsuario',{usuario});
  $('userForm').reset();toast('Usuário cadastrado.','success');await refreshUsers();
  state.counterPermissions=[];
}catch(err){toast(err.message,'error');}finally{btnBusy(button,false);}}

function renderCounterPermissions(){
  const needle=foldText($('counterPermissionSearch').value.trim());
  const filtered=state.counterPermissions.filter(x=>!needle||foldText(x.usuario+' '+x.nome).includes(needle));
  $('counterPermissionList').innerHTML=filtered.length?filtered.map(x=>`<label class="counter-permission-row">
      <span class="counter-person"><strong>${safe(x.nome)}</strong><small>${safe(x.usuario)}</small></span>
      <span class="counter-permission-label">Permitir recontagem</span>
      <input type="checkbox" data-counter-user="${safe(x.usuario)}" ${x.permitido?'checked':''} aria-label="Permitir que o apontador ${safe(x.nome)} lance o mesmo produto em rodadas posteriores">
    </label>`).join(''):'<p class="hint">Nenhum apontador encontrado para essa pesquisa.</p>';
}
async function refreshCounterPermissions(){
  if(!canSupervise()||state.counterPermissionsLoading)return;
  state.counterPermissionsLoading=true;
  const button=$('refreshCounterPermissions');
  btnBusy(button,true,'Carregando…');$('counterPermissionStatus').hidden=false;
  try{
    state.counterPermissions=await api('listarPermissoesContadores');
    renderCounterPermissions();
  }catch(err){toast('Permissões: '+err.message,'error');$('counterPermissionList').innerHTML='<p class="hint">Não foi possível carregar os contadores.</p>';}
  finally{btnBusy(button,false);$('counterPermissionStatus').hidden=true;state.counterPermissionsLoading=false;}
}
async function changeCounterPermission(event){
  const checkbox=event.target.closest('input[data-counter-user]');
  if(!checkbox||!canSupervise())return;
  const usuario=checkbox.dataset.counterUser,permitido=checkbox.checked;
  checkbox.disabled=true;
  const row=checkbox.closest('.counter-permission-row');row?.classList.add('permission-saving');
  try{
    await api('definirPermissaoContador',{usuario,permitido});
    const record=state.counterPermissions.find(x=>x.usuario===usuario);
    if(record)record.permitido=permitido;
    toast('Permissão de '+usuario+(permitido?' liberada.':' revogada.'),'success');
  }catch(err){checkbox.checked=!permitido;toast('Permissão: '+err.message,'error');}
  finally{checkbox.disabled=false;row?.classList.remove('permission-saving');}
}
async function logout(){try{await api('sair');}catch{}state.token='';state.usuario=null;state.product=null;state.catalogCache.clear();state.catalogPending.clear();state.catalogSignature='';state.dashboard=null;sessionStorage.removeItem('inventario_session');show('loginPage');$('loginForm').reset();}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const button=$('loginButton');btnBusy(button,true,'Autenticando...');try{
  const res=await bridgeCall('entrar',{usuario:$('loginUser').value.trim(),senha:$('loginPass').value});state.token=res.token;state.usuario=res.usuario;
  sessionStorage.setItem('inventario_session',res.token);$('loginPass').value='';await enterApp();toast('Bem-vindo(a), '+res.usuario.nome+'!','success');
}catch(err){toast(err.message,'error');}finally{btnBusy(button,false);}});
$('logoutButton').addEventListener('click',logout);
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
$('searchForm').addEventListener('submit',searchProduct);$('countForm').addEventListener('submit',saveCount);
$('sectorSelect').addEventListener('change',()=>{resetProduct();$('productCode').value='';hideSuggestions();preloadCatalog();});$('productCode').addEventListener('input',()=>{resetProduct();queueSuggestions();});
$('countForm').addEventListener('input',()=>state.requestId=null);
$('filterForm').addEventListener('submit',async e=>{e.preventDefault();await refreshDashboard('Filtrando endereços…');});
$('refreshDashboard').addEventListener('click',refreshDashboard);
$('dashboardCenterButtons').addEventListener('click',e=>{
  const b=e.target.closest('button[data-center]');if(b)selecionarCentroDashboard(b.dataset.center);
});
$('supervisionCenterButtons').addEventListener('click',e=>{
  const b=e.target.closest('button[data-center]');if(b)selecionarCentroSupervisao(b.dataset.center);
});
$('dashboardDepot').addEventListener('change',()=>{
  state.productPage=1;$('filterCenter').value=$('dashboardCenter').value;$('filterDepot').value=$('dashboardDepot').value;
  refreshDashboard('Atualizando depósito…');
});
$('searchFollowup').addEventListener('click',()=>{state.productPage=1;refreshFollowup();});
$('dashboardQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();state.productPage=1;refreshFollowup();}});
$('followupPrev').addEventListener('click',()=>{if(state.productPage>1){state.productPage--;refreshFollowup();}});
$('followupNext').addEventListener('click',()=>{if(state.productPage<(state.dashboard?.acompanhamento?.total_paginas||1)){state.productPage++;refreshFollowup();}});
$('productCode').addEventListener('keydown',suggestionsKeydown);
$('productCode').addEventListener('focus',()=>{if($('productCode').value.trim().length>=2)queueSuggestions();});
$('productSuggestions').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-suggest-code]');if(!b)return;e.preventDefault();pickSuggestion(b.dataset.suggestCode);});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.product-lookup'))hideSuggestions();});
$('sectorsBody').addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(!b)return;
  if(b.dataset.reportKind){
    const {reportKind:tipo,reportCenter:centro,reportDepot:deposito}=b.dataset;
    const numero=tipo==='RODADA'?Number(b.closest('tr')?.querySelector('.report-round-select')?.value):undefined;
    exportarRelatorioInventario(tipo,centro,deposito,numero,b);
    return;
  }
  if(b.dataset.close)doClose(b.dataset.close);
  if(b.dataset.open)doOpen(b.dataset.open);
  if(b.dataset.reopen)doReopen(b.dataset.reopen,b);
});
$('exportLocator').addEventListener('click',e=>exportarLocalizacoes(e.currentTarget));
$('userForm').addEventListener('submit',doCreateUser);
$('refreshCounterPermissions').addEventListener('click',refreshCounterPermissions);
$('counterPermissionSearch').addEventListener('input',renderCounterPermissions);
$('counterPermissionList').addEventListener('change',changeCounterPermission);
$('roundDialogCancel').addEventListener('click',closeRoundDialog);
$('roundDialogConfirm').addEventListener('click',confirmRoundAction);
$('roundActionDialog').addEventListener('cancel',event=>{if(roundActionBusy)event.preventDefault();else pendingRoundAction=null;});
$('testModeButton').addEventListener('click',()=>toast('O modo TESTE já está ativo.','success'));
$('officialModeButton').addEventListener('click',startOfficialInventory);
$('clearTestDataButton').addEventListener('click',clearTestData);
$('sapPreviewButton').addEventListener('click',visualizarBaseSAP);
$('sapApplyButton').addEventListener('click',aplicarBaseSAP);
$('exportRound2').addEventListener('click',e=>exportarRecontagem(2,e.currentTarget));
$('exportRound3').addEventListener('click',e=>exportarRecontagem(3,e.currentTarget));
// Data inicial no fuso local do dispositivo (sem deslocar para o dia UTC seguinte).
$('countDate').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
initBridge();

/* Inventário Friovix — Cliente GitHub Pages. Nenhum segredo é colocado neste arquivo. */
'use strict';
const $=id=>document.getElementById(id);
const state={bridgeWindow:null,bridgeOrigin:'',channel:'',ready:false,pending:new Map(),token:sessionStorage.getItem('inventario_session')||'',usuario:null,context:null,product:null,dashboard:null,requestId:null,tab:'contagem',productPage:1,suggestionSequence:0,suggestionTimer:null,suggestions:[],suggestionActive:-1,catalogCache:new Map(),catalogPending:new Map(),catalogUnsupported:false,catalogSignature:'',dashboardLoading:false,dashboardQueued:'',followupSeq:0,followupTimer:null,sapBusy:false,sapPreview:null};
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(v)||0);
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
  show('appPage');$('accountLabel').textContent=state.usuario.nome+' · '+state.usuario.perfil;
  applyRole();await refreshContext();
  // Dashboard volumoso é carregado somente quando solicitado; login/contagem ficam mais rápidos.
  if(state.usuario.perfil==='ADMIN')await Promise.all([refreshUsers(),refreshEnvironment()]);
  if((state.tab==='painel'||state.tab==='supervisao')&&canSupervise())await refreshDashboard();
}
function canSupervise(){return state.usuario&&['ADMIN','SUPERVISOR'].includes(state.usuario.perfil);}
function applyRole(){document.querySelectorAll('.supervisor-only').forEach(n=>n.classList.toggle('hidden-role',!canSupervise()));document.querySelectorAll('.admin-only').forEach(n=>n.classList.toggle('hidden-role',state.usuario.perfil!=='ADMIN'));}
function switchTab(tab){if((tab==='painel'||tab==='supervisao')&&!canSupervise())return;if(tab==='usuarios'&&state.usuario?.perfil!=='ADMIN')return;state.tab=tab;
  document.querySelectorAll('.tab').forEach(n=>n.classList.toggle('active',n.dataset.tab===tab));document.querySelectorAll('.page').forEach(n=>n.classList.toggle('active',n.id==='tab-'+tab));
  if((tab==='painel'||tab==='supervisao')&&!state.dashboard)refreshDashboard();}
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
function renderDashboardSectorOptions(centerChanged=false){
  const areas=state.context?.setores||[];
  const centers=[...new Set(areas.map(x=>String(x.centro)))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  const oldCenter=$('dashboardCenter').value;
  $('dashboardCenter').innerHTML=centers.map(c=>`<option value="${safe(c)}">Centro ${safe(c)}</option>`).join('');
  $('dashboardCenter').value=centers.includes(oldCenter)?oldCenter:centers[0]||'';
  const depots=[...new Set(areas.filter(x=>String(x.centro)===$('dashboardCenter').value).map(x=>String(x.deposito)))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  const oldDepot=centerChanged?'':$('dashboardDepot').value;
  $('dashboardDepot').innerHTML=depots.map(d=>`<option value="${safe(d)}">Depósito ${safe(d||'Não informado')}</option>`).join('');
  $('dashboardDepot').value=depots.includes(oldDepot)?oldDepot:depots[0]||'';
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
  const classes={CONFERIDO:['passed','Conferido'],SEGUNDA_CONTAGEM:['warning','Recontar'],DIVERGENTE:['failed',index===1?'3ª necessária':'Divergente'],EM_CONTAGEM:['active','Em contagem'],PENDENTE:['pending','Pendente']};
  const [color,label]=classes[code]||classes.PENDENTE;
  return `<span class="round-state ${color}" title="${safe(label)}"><span class="round-dot ${color}" aria-hidden="true"></span>${safe(label)}</span>`;
}
function paintFollowup(data){
  if(!data)return;
  state.productPage=data.pagina;
  const fmtPercent=n=>String(n||0)+'%';
  $('progressOverview').innerHTML=`
    <div class="progress-tile"><span>Produtos deste centro/depósito</span><strong>${num(data.total)}</strong></div>
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
  const d={...sector,codigo:state.product.codigo,rua:$('rua').value,zona:$('zona').value,posicao:$('posicao').value,palete:$('palete').value,quantidade:$('quantity').value};
  const value=d.quantidade.trim().includes(',')?d.quantidade.trim().replace(/\./g,'').replace(',','.'):d.quantidade.trim();if(!/^(\d+(\.\d+)?)$/.test(value))throw Error('Quantidade inválida. Use número positivo ou zero.');
  if(Number(value)>0&&['rua','zona','posicao','palete'].some(k=>!d[k]))throw Error('Informe todos os quatro campos de endereço.');
  if(!state.requestId)state.requestId=random();
  const saved=await api('salvarContagem',{...d,request_id:state.requestId});
  $('lastSaved').hidden=false;$('lastSaved').textContent=(saved.duplicado?'Lançamento já recebido anteriormente.':'Lançamento registrado com sucesso!')+' Produto '+d.codigo+' · '+d.quantidade+' '+state.product.um+' · Rua '+(d.rua||'—')+' / Zona '+(d.zona||'—')+' / Posição '+(d.posicao||'—')+' / Palete '+(d.palete||'—')+'.';
  toast('Contagem registrada e auditada!','success');state.dashboard=null;state.requestId=null;$('quantity').value='';$('quantity').focus();
}catch(err){toast(err.message,'error');}finally{btnBusy(button,false);button.disabled=!state.product;}}
function fmtDate(x){const d=new Date(x);return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{timeZone:'America/Manaus'}):String(x||'');}

/** Velocímetro global — porcentagem de SKUs (código+centro+depósito) com algum lançamento. */
function paintGauge(progresso){
  const data=progresso||{total:0,contados:0,percentual:0};
  const pct=Math.max(0,Math.min(100,Number(data.percentual)||0));
  $('gaugePercent').textContent=pct.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  $('gaugeFraction').textContent=num(data.contados)+' de '+num(data.total)+' produtos contados';
  const fill=$('gaugeFill');
  fill.style.strokeDashoffset=String(100-pct);
  fill.style.stroke=pct>=100?'#18734c':'#df6d3d';
}
function renderRecountExports(){
  const center=$('dashboardCenter').value,depot=$('dashboardDepot').value;
  const sector=state.dashboard?.setores?.find(x=>String(x.centro)===center&&String(x.deposito)===depot);
  const segunda=Number(sector?.exportacao_segunda)||0,terceira=Number(sector?.exportacao_terceira)||0;
  const available=segunda>0||terceira>0;
  $('recountExportPanel').hidden=!available;
  $('exportRound2').hidden=!(segunda>0);
  $('exportRound3').hidden=!(terceira>0);
  $('exportRound2').disabled=!(segunda>0);
  $('exportRound3').disabled=!(terceira>0);
  if(available){
    $('exportRound2').textContent='Exportar 2ª contagem ('+num(segunda)+') · CSV';
    $('exportRound3').textContent='Exportar 3ª contagem ('+num(terceira)+') · CSV';
    $('recountExportHint').textContent='Centro '+center+' · Depósito '+(depot||'Não informado')+'. Apenas produtos divergentes na rodada anterior encerrada, sem saldo SAP.';
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

function paintDashboard(data){state.dashboard=data;const k=data.resumo;
  const stats=[['SKUs da base',k.total_skus],['Com resultado',k.com_resultado],['Conferidos',k.conferidos],['Aprovação pendente',k.pendentes_aprovacao],['Lançamentos',k.total_lancamentos]];
  $('stats').innerHTML=stats.map(x=>`<div class="stat"><span>${safe(x[0])}</span><strong>${num(x[1])}</strong></div>`).join('');
  paintGauge(data.progresso_geral);renderRecountExports();
  $('locationCount').textContent=`${num(data.total_enderecos_filtrados)} endereços encontrados. Exibindo até 400 resultados; refine os filtros se necessário.`;
  $('locationsBody').innerHTML=data.enderecos.length?data.enderecos.map(x=>`<tr><td><strong>${safe(x.codigo)}</strong></td><td>${safe(x.descricao)}</td><td>${safe(x.centro)}</td><td>${safe(x.deposito)}</td><td>${safe(x.rua)}</td><td>${safe(x.zona)}</td><td>${safe(x.posicao)}</td><td>${safe(x.palete)}</td><td>${num(x.quantidade)}</td><td>${safe(x.rodada)}</td></tr>`).join(''):'<tr><td colspan="10" class="empty">Nenhum material encontrado nos filtros escolhidos.</td></tr>';
  $('sectorsBody').innerHTML=data.setores.length?data.setores.map(r=>{
    const percent=r.total_alvo?Math.round(100*r.produtos_registrados/r.total_alvo):100;
    const action=r.status==='ABERTA'
      ?`<button class="btn secondary action-small" data-close="${safe(r.rodada_id)}">Encerrar</button>`
      :r.status==='REABRINDO'
      ?`<button class="btn secondary action-small" data-reopen="${safe(r.rodada_id)}">Retomar reabertura</button>`
      :r.status==='ENCERRADA'
      ?`<div class="round-actions">${r.numero<3?`<button class="btn secondary action-small" data-open="${safe(r.centro)}|${safe(r.deposito)}">Próxima rodada</button>`:''}${r.pode_reabrir?`<button class="btn outline-reopen action-small" data-reopen="${safe(r.rodada_id)}" title="Reabrir para completar a contagem, mantendo histórico">Reabrir</button>`:''}${r.numero===3&&!r.pode_reabrir?'<span class="tiny">Aprovação registrada</span>':''}</div>`:'—';
    return `<tr><td>${safe(r.centro)}</td><td>${safe(r.deposito)}</td><td>${safe(r.numero)}</td><td><span class="tag ${r.status==='ABERTA'?'warn':'end'}">${safe(r.status)}</span></td><td>${num(r.produtos_registrados)} / ${num(r.total_alvo)} (${percent}%)</td><td>${num(r.faltando_total)}${r.faltando_total?'<div class="tiny">Ex.: '+safe(r.produtos_faltando.slice(0,3).join(', '))+'</div>':''}</td><td>${action}</td></tr>`;
  }).join(''):'<tr><td colspan="7" class="empty">Nenhum setor disponível.</td></tr>';
  $('approvalsBody').innerHTML=data.divergencias.length?data.divergencias.map(x=>`<tr><td>${safe(x.codigo)}</td><td>${safe(x.centro)}</td><td>${safe(x.deposito)}</td><td>${num(x.quantidade_sap)}</td><td>${num(x.quantidade_contada)}</td><td>${num(x.diferenca)}</td><td><button class="btn secondary action-small" data-approve="${safe(x.resultado_id)}">Aprovar</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhuma divergência aguardando aprovação.</td></tr>';
  $('allowSameCounter').checked=data.config.permitir_recontagem==='SIM';
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
    state.dashboard.acompanhamento=data;paintFollowup(data);
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
async function doClose(roundId){if(!confirm('Encerrar esta rodada? Após o fechamento nenhum contador poderá lançar neste setor até a próxima rodada.'))return;
  try{const r=await api('encerrarRodada',{rodada_id:roundId},180000);toast(`Rodada ${r.numero} encerrada. ${r.materiais} materiais, ${r.divergentes} divergências.`,'success');await refreshContext();await refreshDashboard();resetProduct();}catch(err){toast(err.message,'error');}}
async function doReopen(roundId,button){
  if(!canSupervise())return;
  const motivo=prompt('Justificativa obrigatória para reabrir a contagem (mínimo de 10 caracteres):');
  if(motivo===null)return;
  if(motivo.trim().length<10){toast('Informe uma justificativa com pelo menos 10 caracteres.','error');return;}
  if(!confirm('Reabrir esta rodada? Os lançamentos existentes serão preservados e os resultados consolidados anteriores ficarão no histórico até um novo encerramento.'))return;
  btnBusy(button,true,'Reabrindo…');
  try{
    const result=await api('reabrirRodada',{rodada_id:roundId,motivo:motivo.trim()},180000);
    toast(`Rodada ${result.numero} reaberta no Centro ${result.centro}, Depósito ${result.deposito}. Contagens preservadas.`,'success');
    state.dashboard=null;
    await refreshContext();await refreshDashboard();resetProduct();
  }catch(err){toast('Reabertura não concluída: '+err.message,'error');}
  finally{btnBusy(button,false);}
}
async function doOpen(value){const [centro,deposito]=value.split('|');if(!confirm(`Abrir próxima rodada para Centro ${centro} / Depósito ${deposito}?`))return;
  try{const r=await api('abrirProximaRodada',{centro,deposito});toast(`Rodada ${r.numero} aberta para ${r.alvos} materiais divergentes.`,'success');await refreshContext();await refreshDashboard();resetProduct();}catch(err){toast(err.message,'error');}}
async function doApprove(resultId){const reason=prompt('Justificativa de aprovação da divergência final (mínimo de 8 caracteres):');if(reason===null)return;
  try{await api('aprovarDivergencia',{resultado_id:resultId,motivo:reason});toast('Divergência aprovada. Não foi lançada no SAP.','success');await refreshDashboard();}catch(err){toast(err.message,'error');}}
async function refreshUsers(){if(state.usuario?.perfil!=='ADMIN')return;try{const users=await api('listarUsuarios');$('userList').innerHTML=users.map(u=>`<div class="person"><div><strong>${safe(u.nome)}</strong><small>${safe(u.usuario)}</small></div><span class="tag ${u.ativo==='SIM'?'ok':'warn'}">${safe(u.perfil)}</span></div>`).join('');}catch(err){toast(err.message,'error');}}
async function doCreateUser(event){event.preventDefault();const button=$('userForm').querySelector('button');btnBusy(button,true,'Salvando...');try{
  const usuario={usuario:$('newUsername').value.trim(),nome:$('newName').value.trim(),perfil:$('newRole').value,senha:$('newPassword').value};await api('cadastrarUsuario',{usuario});
  $('userForm').reset();toast('Usuário cadastrado.','success');await refreshUsers();
}catch(err){toast(err.message,'error');}finally{btnBusy(button,false);}}
async function saveSettings(){const value=$('allowSameCounter').checked?'SIM':'NAO';if(!confirm('Alterar a política de contadores entre rodadas?'))return;
  try{await api('atualizarConfiguracao',{chave:'PERMITIR_MESMO_CONTADOR_ENTRE_RODADAS',valor:value});toast('Configuração salva.','success');await refreshDashboard();}catch(err){toast(err.message,'error');}}
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
$('dashboardCenter').addEventListener('change',()=>{state.productPage=1;renderDashboardSectorOptions(true);renderRecountExports();queueFollowup();});
$('dashboardDepot').addEventListener('change',()=>{state.productPage=1;renderRecountExports();queueFollowup();});
$('searchFollowup').addEventListener('click',()=>{state.productPage=1;refreshFollowup();});
$('dashboardQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();state.productPage=1;refreshFollowup();}});
$('followupPrev').addEventListener('click',()=>{if(state.productPage>1){state.productPage--;refreshFollowup();}});
$('followupNext').addEventListener('click',()=>{if(state.productPage<(state.dashboard?.acompanhamento?.total_paginas||1)){state.productPage++;refreshFollowup();}});
$('productCode').addEventListener('keydown',suggestionsKeydown);
$('productCode').addEventListener('focus',()=>{if($('productCode').value.trim().length>=2)queueSuggestions();});
$('productSuggestions').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-suggest-code]');if(!b)return;e.preventDefault();pickSuggestion(b.dataset.suggestCode);});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.product-lookup'))hideSuggestions();});
$('sectorsBody').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.close)doClose(b.dataset.close);if(b.dataset.open)doOpen(b.dataset.open);if(b.dataset.reopen)doReopen(b.dataset.reopen,b);});
$('approvalsBody').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.approve)doApprove(b.dataset.approve);});
$('userForm').addEventListener('submit',doCreateUser);$('saveSettings').addEventListener('click',saveSettings);
$('testModeButton').addEventListener('click',()=>toast('O modo TESTE já está ativo.','success'));
$('officialModeButton').addEventListener('click',startOfficialInventory);
$('clearTestDataButton').addEventListener('click',clearTestData);
$('sapPreviewButton').addEventListener('click',visualizarBaseSAP);
$('sapApplyButton').addEventListener('click',aplicarBaseSAP);
$('exportRound2').addEventListener('click',e=>exportarRecontagem(2,e.currentTarget));
$('exportRound3').addEventListener('click',e=>exportarRecontagem(3,e.currentTarget));
initBridge();

/* Inventário Friovix — Cliente GitHub Pages. Nenhum segredo é colocado neste arquivo. */
'use strict';
const $=id=>document.getElementById(id);
const state={bridgeWindow:null,bridgeOrigin:'',channel:'',ready:false,pending:new Map(),token:sessionStorage.getItem('inventario_session')||'',usuario:null,context:null,product:null,dashboard:null,requestId:null,tab:'contagem',productPage:1,suggestionSequence:0,suggestionTimer:null,suggestions:[],suggestionActive:-1};
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(Number(v)||0);
const random=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
function toast(msg,type=''){const t=$('toast');t.textContent=msg;t.className='toast '+type;t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.hidden=true,6000);}
function show(page){for(const id of ['connecting','loginPage','appPage'])$(id).hidden=id!==page;}
function btnBusy(button,busy,text){if(!button)return;button.disabled=busy;if(busy){button.dataset.oldText=button.textContent;button.textContent=text||'Processando...';}else button.textContent=button.dataset.oldText||button.textContent;}
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
async function enterApp(){show('appPage');$('accountLabel').textContent=state.usuario.nome+' · '+state.usuario.perfil;applyRole();await refreshContext();if(canSupervise()){await refreshDashboard();}if(state.usuario.perfil==='ADMIN'){await refreshUsers();await refreshEnvironment();}}
function canSupervise(){return state.usuario&&['ADMIN','SUPERVISOR'].includes(state.usuario.perfil);}
function applyRole(){document.querySelectorAll('.supervisor-only').forEach(n=>n.classList.toggle('hidden-role',!canSupervise()));document.querySelectorAll('.admin-only').forEach(n=>n.classList.toggle('hidden-role',state.usuario.perfil!=='ADMIN'));}
function switchTab(tab){if((tab==='painel'||tab==='supervisao')&&!canSupervise())return;if(tab==='usuarios'&&state.usuario?.perfil!=='ADMIN')return;state.tab=tab;
  document.querySelectorAll('.tab').forEach(n=>n.classList.toggle('active',n.dataset.tab===tab));document.querySelectorAll('.page').forEach(n=>n.classList.toggle('active',n.id==='tab-'+tab));}
async function refreshContext(){state.context=await api('carregarContexto');$('inventoryName').textContent='Controle físico de estoque';renderModeBadge(state.context.modo);
  const prev=$('sectorSelect').value;$('sectorSelect').innerHTML='<option value="">Selecione centro e depósito...</option>'+state.context.setores.map(x=>`<option value="${safe(x.centro+'|'+x.deposito)}">Centro ${safe(x.centro)} · Depósito ${safe(x.deposito||'Não informado')}</option>`).join('');
  if([...$('sectorSelect').options].some(x=>x.value===prev))$('sectorSelect').value=prev;
  renderDashboardSectorOptions();
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
}
async function refreshEnvironment(){
  if(state.usuario?.perfil!=='ADMIN')return;
  try{paintEnvironment(await api('estadoAmbiente'));}catch(err){toast('Administração: '+err.message,'error');}
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
  const term=$('productCode').value.trim(),selection=$('sectorSelect').value;
  if(term.length<2||!selection){hideSuggestions();return;}
  const [centro,deposito]=selection.split('|');
  state.suggestionTimer=setTimeout(async()=>{
    try{
      const data=await api('sugerirProdutos',{centro,deposito,termo:term});
      if(seq!==state.suggestionSequence||selection!==$('sectorSelect').value||term!==$('productCode').value.trim())return;
      paintSuggestions(data.itens||[]);
    }catch(err){if(seq===state.suggestionSequence)hideSuggestions();}
  },260);
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
  toast('Contagem registrada e auditada!','success');state.requestId=null;$('quantity').value='';$('quantity').focus();
}catch(err){toast(err.message,'error');}finally{btnBusy(button,false);button.disabled=!state.product;}}
function fmtDate(x){const d=new Date(x);return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{timeZone:'America/Manaus'}):String(x||'');}
function paintDashboard(data){state.dashboard=data;const k=data.resumo;
  const stats=[['SKUs da base',k.total_skus],['Com resultado',k.com_resultado],['Conferidos',k.conferidos],['Aprovação pendente',k.pendentes_aprovacao],['Lançamentos',k.total_lancamentos]];
  $('stats').innerHTML=stats.map(x=>`<div class="stat"><span>${safe(x[0])}</span><strong>${num(x[1])}</strong></div>`).join('');
  $('locationCount').textContent=`${num(data.total_enderecos_filtrados)} endereços encontrados. Exibindo até 400 resultados; refine os filtros se necessário.`;
  $('locationsBody').innerHTML=data.enderecos.length?data.enderecos.map(x=>`<tr><td><strong>${safe(x.codigo)}</strong></td><td>${safe(x.descricao)}</td><td>${safe(x.centro)}</td><td>${safe(x.deposito)}</td><td>${safe(x.rua)}</td><td>${safe(x.zona)}</td><td>${safe(x.posicao)}</td><td>${safe(x.palete)}</td><td>${num(x.quantidade)}</td><td>${safe(x.rodada)}</td></tr>`).join(''):'<tr><td colspan="10" class="empty">Nenhum material encontrado nos filtros escolhidos.</td></tr>';
  $('sectorsBody').innerHTML=data.setores.length?data.setores.map(r=>{
    const percent=r.total_alvo?Math.round(100*r.produtos_registrados/r.total_alvo):100;
    const action=r.status==='ABERTA'?`<button class="btn secondary action-small" data-close="${safe(r.rodada_id)}">Encerrar</button>`:r.numero<3?`<button class="btn secondary action-small" data-open="${safe(r.centro)}|${safe(r.deposito)}">Próxima rodada</button>`:'—';
    return `<tr><td>${safe(r.centro)}</td><td>${safe(r.deposito)}</td><td>${safe(r.numero)}</td><td><span class="tag ${r.status==='ABERTA'?'warn':'end'}">${safe(r.status)}</span></td><td>${num(r.produtos_registrados)} / ${num(r.total_alvo)} (${percent}%)</td><td>${num(r.faltando_total)}${r.faltando_total?'<div class="tiny">Ex.: '+safe(r.produtos_faltando.slice(0,3).join(', '))+'</div>':''}</td><td>${action}</td></tr>`;
  }).join(''):'<tr><td colspan="7" class="empty">Nenhum setor disponível.</td></tr>';
  $('approvalsBody').innerHTML=data.divergencias.length?data.divergencias.map(x=>`<tr><td>${safe(x.codigo)}</td><td>${safe(x.centro)}</td><td>${safe(x.deposito)}</td><td>${num(x.quantidade_sap)}</td><td>${num(x.quantidade_contada)}</td><td>${num(x.diferenca)}</td><td><button class="btn secondary action-small" data-approve="${safe(x.resultado_id)}">Aprovar</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhuma divergência aguardando aprovação.</td></tr>';
  $('allowSameCounter').checked=data.config.permitir_recontagem==='SIM';
  paintFollowup(data.acompanhamento);
}
function getFilter(){return Object.fromEntries([['codigo','filterCode'],['centro','filterCenter'],['deposito','filterDepot'],['rua','filterRua'],['zona','filterZona'],['posicao','filterPosicao'],['palete','filterPalete']].map(([k,id])=>[k,$(id).value.trim()]));}
async function refreshDashboard(){if(!canSupervise())return;try{const data=await api('painel',{filtro:getFilter(),acompanhamento:{centro:$('dashboardCenter').value,deposito:$('dashboardDepot').value,termo:$('dashboardQuery').value.trim(),pagina:state.productPage}});paintDashboard(data);}catch(err){toast('Dashboard: '+err.message,'error');}}
async function doClose(roundId){if(!confirm('Encerrar esta rodada? Após o fechamento nenhum contador poderá lançar neste setor até a próxima rodada.'))return;
  try{const r=await api('encerrarRodada',{rodada_id:roundId},180000);toast(`Rodada ${r.numero} encerrada. ${r.materiais} materiais, ${r.divergentes} divergências.`,'success');await refreshContext();await refreshDashboard();resetProduct();}catch(err){toast(err.message,'error');}}
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
async function logout(){try{await api('sair');}catch{}state.token='';state.usuario=null;state.product=null;sessionStorage.removeItem('inventario_session');show('loginPage');$('loginForm').reset();}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const button=$('loginButton');btnBusy(button,true,'Autenticando...');try{
  const res=await bridgeCall('entrar',{usuario:$('loginUser').value.trim(),senha:$('loginPass').value});state.token=res.token;state.usuario=res.usuario;
  sessionStorage.setItem('inventario_session',res.token);$('loginPass').value='';await enterApp();toast('Bem-vindo(a), '+res.usuario.nome+'!','success');
}catch(err){toast(err.message,'error');}finally{btnBusy(button,false);}});
$('logoutButton').addEventListener('click',logout);
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
$('searchForm').addEventListener('submit',searchProduct);$('countForm').addEventListener('submit',saveCount);
$('sectorSelect').addEventListener('change',()=>{resetProduct();$('productCode').value='';hideSuggestions();});$('productCode').addEventListener('input',()=>{resetProduct();queueSuggestions();});
$('countForm').addEventListener('input',()=>state.requestId=null);
$('filterForm').addEventListener('submit',async e=>{e.preventDefault();await refreshDashboard();});
$('refreshDashboard').addEventListener('click',refreshDashboard);
$('dashboardCenter').addEventListener('change',()=>{state.productPage=1;renderDashboardSectorOptions(true);refreshDashboard();});
$('dashboardDepot').addEventListener('change',()=>{state.productPage=1;refreshDashboard();});
$('searchFollowup').addEventListener('click',()=>{state.productPage=1;refreshDashboard();});
$('dashboardQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();state.productPage=1;refreshDashboard();}});
$('followupPrev').addEventListener('click',()=>{if(state.productPage>1){state.productPage--;refreshDashboard();}});
$('followupNext').addEventListener('click',()=>{if(state.productPage<(state.dashboard?.acompanhamento?.total_paginas||1)){state.productPage++;refreshDashboard();}});
$('productCode').addEventListener('keydown',suggestionsKeydown);
$('productCode').addEventListener('focus',()=>{if($('productCode').value.trim().length>=2)queueSuggestions();});
$('productSuggestions').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-suggest-code]');if(!b)return;e.preventDefault();pickSuggestion(b.dataset.suggestCode);});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.product-lookup'))hideSuggestions();});
$('sectorsBody').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.close)doClose(b.dataset.close);if(b.dataset.open)doOpen(b.dataset.open);});
$('approvalsBody').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.approve)doApprove(b.dataset.approve);});
$('userForm').addEventListener('submit',doCreateUser);$('saveSettings').addEventListener('click',saveSettings);
$('testModeButton').addEventListener('click',()=>toast('O modo TESTE já está ativo.','success'));
$('officialModeButton').addEventListener('click',startOfficialInventory);
$('clearTestDataButton').addEventListener('click',clearTestData);
initBridge();

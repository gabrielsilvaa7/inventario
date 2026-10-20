/* Inventário SAP — Cliente GitHub Pages. Nenhum segredo é colocado neste arquivo. */
'use strict';
const $=id=>document.getElementById(id);
const state={bridgeWindow:null,bridgeOrigin:'',channel:'',ready:false,pending:new Map(),token:sessionStorage.getItem('inventario_session')||'',usuario:null,context:null,product:null,dashboard:null,requestId:null,tab:'contagem'};
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
async function enterApp(){show('appPage');$('accountLabel').textContent=state.usuario.nome+' · '+state.usuario.perfil;applyRole();await refreshContext();if(canSupervise()){await refreshDashboard();}if(state.usuario.perfil==='ADMIN')await refreshUsers();}
function canSupervise(){return state.usuario&&['ADMIN','SUPERVISOR'].includes(state.usuario.perfil);}
function applyRole(){document.querySelectorAll('.supervisor-only').forEach(n=>n.classList.toggle('hidden-role',!canSupervise()));document.querySelectorAll('.admin-only').forEach(n=>n.classList.toggle('hidden-role',state.usuario.perfil!=='ADMIN'));}
function switchTab(tab){if((tab==='painel'||tab==='supervisao')&&!canSupervise())return;if(tab==='usuarios'&&state.usuario?.perfil!=='ADMIN')return;state.tab=tab;
  document.querySelectorAll('.tab').forEach(n=>n.classList.toggle('active',n.dataset.tab===tab));document.querySelectorAll('.page').forEach(n=>n.classList.toggle('active',n.id==='tab-'+tab));}
async function refreshContext(){state.context=await api('carregarContexto');$('inventoryName').textContent=state.context.inventario.nome;
  const prev=$('sectorSelect').value;$('sectorSelect').innerHTML='<option value="">Selecione um setor...</option>'+state.context.setores.map(x=>`<option value="${safe(x.centro+'|'+x.deposito)}">Centro ${safe(x.centro)} · Depósito ${safe(x.deposito)} · R${x.numero} ${safe(x.status)}</option>`).join('');
  if([...$('sectorSelect').options].some(x=>x.value===prev))$('sectorSelect').value=prev;
}
function currentSector(){const val=$('sectorSelect').value;if(!val)throw Error('Selecione Centro e Depósito.');const [centro,deposito]=val.split('|');return {centro,deposito};}
function resetProduct(){state.product=null;state.requestId=null;$('saveCount').disabled=true;$('countUnit').textContent='';$('productInfo').className='product-card muted';$('productInfo').textContent='Busque um produto no centro e depósito selecionados.';}
async function searchProduct(event){event.preventDefault();const button=$('searchForm').querySelector('button');btnBusy(button,true,'Buscando...');resetProduct();try{
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
  $('auditBody').innerHTML=data.auditoria.length?data.auditoria.map(x=>`<tr><td>${safe(fmtDate(x.quando))}</td><td>${safe(x.usuario)}</td><td>${safe(x.acao)}</td><td>${safe(x.referencia)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">Sem eventos.</td></tr>';
}
function getFilter(){return Object.fromEntries([['codigo','filterCode'],['centro','filterCenter'],['deposito','filterDepot'],['rua','filterRua'],['zona','filterZona'],['posicao','filterPosicao'],['palete','filterPalete']].map(([k,id])=>[k,$(id).value.trim()]));}
async function refreshDashboard(){if(!canSupervise())return;try{const data=await api('painel',{filtro:getFilter()});paintDashboard(data);}catch(err){toast('Dashboard: '+err.message,'error');}}
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
$('sectorSelect').addEventListener('change',resetProduct);$('productCode').addEventListener('input',resetProduct);
$('countForm').addEventListener('input',()=>state.requestId=null);
$('filterForm').addEventListener('submit',async e=>{e.preventDefault();await refreshDashboard();});
$('refreshDashboard').addEventListener('click',refreshDashboard);
$('sectorsBody').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.close)doClose(b.dataset.close);if(b.dataset.open)doOpen(b.dataset.open);});
$('approvalsBody').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.approve)doApprove(b.dataset.approve);});
$('userForm').addEventListener('submit',doCreateUser);$('saveSettings').addEventListener('click',saveSettings);
initBridge();

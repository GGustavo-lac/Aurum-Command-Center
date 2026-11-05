const STORAGE_KEY = 'aurum-command-center-v1';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const todayISO = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const brl = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const numberBR = value => new Intl.NumberFormat('pt-BR').format(Number(value)||0);
const dateBR = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeImg = value => typeof value==='string' && value.startsWith('data:image/') ? escapeHtml(value) : '';
const projectPalette = ['gold','blue','green','purple'];
const safeStorageGet = key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const safeStorageSet = (key,value) => { try { localStorage.setItem(key,value); return true; } catch { return false; } };

function defaultData(){
  const tikId = uid(), chinaId = uid();
  return {
    version:1,
    projects:[
      {id:tikId,name:'TikTok Shop',niche:'Conteúdo & afiliados',description:'Construir audiência, alcançar 1.000 seguidores e começar a monetizar com vídeos.',icon:'▶',color:'gold',createdAt:new Date().toISOString(),followers:0,followerGoal:1000,videos:0,videoGoal:3,views:0,photos:[]},
      {id:chinaId,name:'Importação de celulares',niche:'Importação & revenda',description:'Comprar aparelhos na China, acompanhar o custo posto no Brasil e revender com margem.',icon:'◇',color:'blue',createdAt:new Date().toISOString(),followers:0,followerGoal:0,videos:0,videoGoal:0,views:0,photos:[]}
    ],
    transactions:[],
    tasks:[
      {id:uid(),title:'Planejar e publicar os 3 primeiros vídeos',projectId:tikId,dueDate:'',priority:'Alta',done:false,createdAt:new Date().toISOString()},
      {id:uid(),title:'Definir estratégia para chegar aos 1.000 seguidores',projectId:tikId,dueDate:'',priority:'Média',done:false,createdAt:new Date().toISOString()},
      {id:uid(),title:'Comparar fornecedores e calcular o custo posto no Brasil',projectId:chinaId,dueDate:'',priority:'Alta',done:false,createdAt:new Date().toISOString()}
    ],
    inventory:[],
    investments:[],
    mood:{selected:'',note:'',lastGenerated:''}
  };
}
function loadData(){
  try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return defaultData();const parsed=JSON.parse(raw);if(!parsed||parsed.version!==1) return defaultData();return {...defaultData(),...parsed};}
  catch(err){console.warn('Falha ao ler dados locais',err);return defaultData();}
}
let state=loadData();
let pendingPhotos=[];
let lastSuggestion=null;
let selectedMood='';
let chatHistory=[];
let aiConnected=false;
let dbClient=null;
let dbUser=null;
let dbSaveTimer=null;
let dbWriteQueue=Promise.resolve();

function save(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
  catch(err){toast('O armazenamento do navegador está cheio. Exporte um backup e remova algumas fotos.','error');console.error(err);}
  if(dbClient && dbUser){clearTimeout(dbSaveTimer);dbSaveTimer=setTimeout(()=>syncToCloud(),500);}
}
async function syncToCloud(){
  if(!dbClient||!dbUser)return;
  const snapshot=JSON.parse(JSON.stringify(state));
  dbWriteQueue=dbWriteQueue.then(async()=>{
    const {error}=await dbClient.from('aurum_workspaces').upsert({user_id:dbUser.id,data:snapshot,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(error){console.error('Supabase sync:',error);toast('Não consegui sincronizar com a nuvem. Seus dados continuam neste aparelho.','error');}
    else setCloudStatus('Sincronizado na nuvem');
  });
  return dbWriteQueue;
}
function setCloudStatus(message){const el=$('#cloudStatus');if(el)el.textContent=message;}
function showAuthScreen(){
  if($('#supabaseAuth'))return;
  const wrap=document.createElement('div');wrap.id='supabaseAuth';wrap.className='cloud-auth-screen';
  wrap.innerHTML=`<div class="cloud-auth-card"><div class="brand-mark auth-mark">✧</div><div class="panel-kicker">AURUM / PRIVATE WORKSPACE</div><h1>Seu império,<br><span>em qualquer lugar.</span></h1><p>Entre ou crie sua conta para sincronizar seus empreendimentos com segurança na Supabase.</p><form id="cloudAuthForm"><label>E-mail</label><input name="email" type="email" autocomplete="email" required placeholder="voce@email.com"><label>Senha</label><input name="password" type="password" autocomplete="current-password" minlength="6" required placeholder="Mínimo de 6 caracteres"><div class="auth-error" id="cloudAuthError"></div><button class="button button-gold full-button" type="submit" id="cloudLogin">Entrar</button><button class="button button-ghost full-button" type="button" id="cloudSignup">Criar conta</button></form><small id="cloudStatus">Conexão segura via Supabase Auth + Row Level Security.</small></div></div>`;
  document.body.append(wrap);
  const form=$('#cloudAuthForm');
  form.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(form);await authenticate('login',f.get('email'),f.get('password'));});
  $('#cloudSignup').addEventListener('click',async()=>{const f=new FormData(form);if(!form.reportValidity())return;await authenticate('signup',f.get('email'),f.get('password'));});
}
async function authenticate(mode,email,password){
  const errorEl=$('#cloudAuthError');errorEl.textContent='Conectando...';
  const result=mode==='signup'?await dbClient.auth.signUp({email,password,options:{emailRedirectTo:location.origin}}):await dbClient.auth.signInWithPassword({email,password});
  if(result.error){errorEl.textContent=result.error.message;return;}
  if(mode==='signup'&&!result.data.session){errorEl.textContent='Conta criada. Confirme o e-mail enviado pela Supabase e depois entre.';return;}
  dbUser=result.data.user||result.data.session?.user;
  if(dbUser)await loadCloudWorkspace();
}
async function loadCloudWorkspace(){
  if(!dbUser)return;
  setCloudStatus('Carregando seus dados...');
  const {data,error}=await dbClient.from('aurum_workspaces').select('data').eq('user_id',dbUser.id).maybeSingle();
  if(error){$('#cloudAuthError').textContent=error.message;return;}
  if(data?.data){state={...defaultData(),...data.data};safeStorageSet(STORAGE_KEY,JSON.stringify(state));}
  else {await syncToCloud();}
  $('#supabaseAuth')?.remove();
  const status=$('#cloudStatus');if(status)status.textContent=`Conectado: ${dbUser.email||'conta'}`;
  renderAll();setCloudStatus('Sincronizado na nuvem');toast('Workspace conectado, chefe.');
}
async function initSupabase(){
  const cfg=window.AURUM_SUPABASE_CONFIG||{};
  if(!cfg.url||!cfg.anonKey||cfg.url.includes('SEU-PROJETO')){setCloudStatus('Modo local · configure a Supabase');return;}
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    dbClient=createClient(cfg.url,cfg.anonKey);
    const {data}=await dbClient.auth.getSession();
    if(data.session?.user){dbUser=data.session.user;await loadCloudWorkspace();}
    else showAuthScreen();
    dbClient.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){dbUser=null;showAuthScreen();}else if(event==='SIGNED_IN'&&session?.user&&!dbUser){dbUser=session.user;loadCloudWorkspace();}});
  }catch(err){console.error(err);toast('Falha ao iniciar Supabase. Confira URL e chave pública.','error');}
}

function toast(message,type='success'){
  const el=document.createElement('div');el.className=`toast ${type==='error'?'error':''}`;el.textContent=message;$('#toastStack').append(el);setTimeout(()=>el.remove(),3800);
}
function projectById(id){return state.projects.find(p=>p.id===id)}
function projectLabel(id){return projectById(id)?.name||'Geral / não vinculado'}
function projectTotals(id){const tx=state.transactions.filter(t=>!id||t.projectId===id);const revenue=tx.filter(t=>t.type==='revenue').reduce((s,t)=>s+t.amount,0);const expenses=tx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);return {revenue,expenses,profit:revenue-expenses};}
function totals(){return state.transactions.reduce((o,t)=>{o[t.type]+=t.amount;return o;},{revenue:0,expense:0});}
function sortedTransactions(){return [...state.transactions].sort((a,b)=>(b.date||'').localeCompare(a.date||'' )||(b.createdAt||'').localeCompare(a.createdAt||''));}
function todayLong(){return new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date());}
$('#todayLabel').textContent=todayLong();$('#moodDate').textContent=todayLong().toUpperCase();const hourNow=new Date().getHours();$('#greetingTitle').innerHTML=`${hourNow<12?'Bom dia':hourNow<18?'Boa tarde':'Boa noite'}, chefe<span class="gold-dot">.</span>`;

function setView(view){
  $$('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));
  $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  const titles={overview:'VISÃO GERAL',businesses:'EMPREENDIMENTOS',finance:'FINANCEIRO',inventory:'ESTOQUE & PRODUTOS',tasks:'CENTRAL DE TAREFAS',investments:'APLICAÇÕES',mood:'MOOD DO DIA'};
  $('#breadcrumbTitle').textContent=titles[view]||'AURUM';
  $('#sidebar').classList.remove('open');
  renderAll();
}

function renderAll(){renderOverview();renderBusinesses();renderFinance();renderInventory();renderTasks();renderInvestments();}

function renderOverview(){
  const t=totals(), profit=t.revenue-t.expense, margin=t.revenue?profit/t.revenue*100:0;
  $('#statRevenue').textContent=brl(t.revenue);$('#statExpenses').textContent=brl(t.expense);$('#statProfit').textContent=brl(profit);$('#statInvested').textContent=brl(state.investments.reduce((s,x)=>s+x.principal,0));
  $('#revenueCount').textContent=`${state.transactions.filter(x=>x.type==='revenue').length} lançamentos`;
  $('#expenseCount').textContent=`${state.transactions.filter(x=>x.type==='expense').length} lançamentos`;
  $('#marginValue').textContent=`${margin.toFixed(1).replace('.',',')}% margem`;
  $('#investmentCount').textContent=`${state.investments.length} aplicações`;
  const currentMonth=state.transactions.filter(x=>x.date?.slice(0,7)===todayISO().slice(0,7));
  $('#chartTotal').textContent=brl(currentMonth.filter(x=>x.type==='revenue').reduce((s,x)=>s+x.amount,0));
  renderFinanceChart();
  $('#portfolioList').innerHTML=state.projects.length?state.projects.map(p=>{const sum=projectTotals(p.id);return `<div class="portfolio-item"><div class="project-emblem ${escapeHtml(p.color)}">${escapeHtml(p.icon||'◈')}</div><div class="portfolio-copy"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.niche||'Negócio independente')}</small></div><div class="portfolio-metric"><strong>${brl(sum.profit)}</strong><small>lucro operacional</small></div></div>`}).join(''):'<div class="list-empty">Adicione seu primeiro empreendimento.</div>';
  const goals=[];
  state.projects.forEach(p=>{if(p.followerGoal>0)goals.push({name:`${p.name} · Seguidores`,value:p.followers||0,target:p.followerGoal});if(p.videoGoal>0)goals.push({name:`${p.name} · Vídeos publicados`,value:p.videos||0,target:p.videoGoal});});
  $('#goalCount').textContent=String(goals.length).padStart(2,'0');
  $('#goalsList').innerHTML=goals.length?goals.map(g=>{const pct=Math.min(100,Math.round(g.value/g.target*100));return `<div class="goal-row"><div class="goal-title"><span>${escapeHtml(g.name)}</span><small>${numberBR(g.value)} / ${numberBR(g.target)} · ${pct}%</small></div><div class="progress-track"><span style="width:${pct}%"></span></div></div>`}).join(''):'<div class="goal-empty">Cadastre metas de seguidores ou entregas nos seus projetos.</div>';
  const recent=sortedTransactions().slice(0,5);
  $('#activityList').innerHTML=recent.length?recent.map(x=>`<div class="activity-item"><div class="activity-icon ${x.type==='expense'?'expense':''}">${x.type==='expense'?'↘':'↗'}</div><div class="activity-copy"><strong>${escapeHtml(x.description)}</strong><small>${escapeHtml(projectLabel(x.projectId))} · ${dateBR(x.date)}</small></div><div class="activity-value ${x.type==='expense'?'negative':'positive'}">${x.type==='expense'?'−':'+'}${brl(x.amount)}</div></div>`).join(''):'<div class="list-empty">Seu primeiro lançamento vai aparecer aqui.</div>';
}
function renderFinanceChart(){
  const host=$('#financeChart');
  const months=[];const now=new Date();for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')});}
  const data=months.map(m=>{const xs=state.transactions.filter(t=>(t.date||'').slice(0,7)===m.key);return {...m,revenue:xs.filter(t=>t.type==='revenue').reduce((s,t)=>s+t.amount,0),expense:xs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0)};});
  const max=Math.max(1,...data.flatMap(x=>[x.revenue,x.expense]));
  if(!state.transactions.length){host.innerHTML='<div class="empty-chart">Seus lançamentos aparecerão neste gráfico.</div>';return;}
  const W=650,H=160,left=35,right=10,top=9,bottom=24,plotW=W-left-right,plotH=H-top-bottom;
  const x=i=>left+(plotW/(data.length-1))*i;const y=v=>top+plotH-(v/max)*plotH;
  const path=key=>data.map((d,i)=>`${i?'L':'M'} ${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(' ');
  const area=`${path('revenue')} L ${x(data.length-1)} ${top+plotH} L ${x(0)} ${top+plotH} Z`;
  const grid=[0,1,2,3].map(i=>{const yy=top+plotH-(plotH/3)*i;return `<line class="chart-gridline" x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}"/>`}).join('');
  const labels=data.map((d,i)=>`<text class="chart-axis" text-anchor="middle" x="${x(i)}" y="${H-4}">${escapeHtml(d.label)}</text>`).join('');
  const points=data.map((d,i)=>`<circle class="chart-point" cx="${x(i)}" cy="${y(d.revenue)}" r="3.4"/>`).join('');
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gráfico de receitas e despesas por mês"><defs><linearGradient id="goldFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#c8a96b" stop-opacity=".22"/><stop offset="100%" stop-color="#c8a96b" stop-opacity="0"/></linearGradient></defs>${grid}<path class="chart-area" d="${area}"/><path class="chart-revenue" d="${path('revenue')}"/><path class="chart-expense" d="${path('expense')}"/>${points}${labels}</svg>`;
}

function renderBusinesses(){
  const q=($('#businessSearch')?.value||'').toLowerCase();const sort=$('#businessSort')?.value||'name';let ps=state.projects.filter(p=>`${p.name} ${p.niche} ${p.description}`.toLowerCase().includes(q));
  if(sort==='profit')ps.sort((a,b)=>projectTotals(b.id).profit-projectTotals(a.id).profit);else if(sort==='recent')ps.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));else ps.sort((a,b)=>a.name.localeCompare(b.name));
  $('#businessCount').textContent=String(state.projects.length).padStart(2,'0');
  $('#businessGrid').innerHTML=ps.length?ps.map(p=>{
    const t=projectTotals(p.id),taskCount=state.tasks.filter(x=>x.projectId===p.id&&!x.done).length;const followerPct=p.followerGoal?Math.min(100,Math.round((p.followers||0)/p.followerGoal*100)):0;
    const stats=`<div><small>FATURAMENTO</small><strong>${brl(t.revenue)}</strong></div><div><small>DESPESAS</small><strong>${brl(t.expenses)}</strong></div><div><small>RESULTADO</small><strong style="color:${t.profit>=0?'#8fc6a5':'#d38b8b'}">${brl(t.profit)}</strong></div>`;
    const metric=p.followerGoal?`<div class="business-progress"><div class="goal-title"><span>Meta de seguidores</span><small>${numberBR(p.followers||0)} / ${numberBR(p.followerGoal)} · ${followerPct}%</small></div><div class="progress-track"><span style="width:${followerPct}%"></span></div></div>`:(p.videoGoal?`<div class="business-progress"><div class="goal-title"><span>Vídeos publicados</span><small>${numberBR(p.videos||0)} / ${numberBR(p.videoGoal)}</small></div><div class="progress-track"><span style="width:${Math.min(100,(p.videos||0)/p.videoGoal*100)}%"></span></div></div>`:'');const viewsLabel=Number(p.views)>0?`<div class="views-line">◉ ${numberBR(p.views)} visualizações acumuladas</div>`:'';
    const photos=(p.photos||[]).length?`<div class="photo-strip">${p.photos.slice(0,5).map(src=>`<img src="${safeImg(src)}" data-photo-src="${safeImg(src)}" alt="Foto de ${escapeHtml(p.name)}"/>`).join('')}</div>`:'';
    return `<article class="business-card"><div class="business-card-top"><div class="business-main"><div class="project-emblem ${escapeHtml(p.color)}">${escapeHtml(p.icon||'◈')}</div><div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.niche||'Negócio independente')}</p></div></div><span class="status-pill">ATIVO</span></div><div class="business-card-stats">${stats}</div>${metric}${viewsLabel}<div class="business-card-actions"><span class="muted-copy">${taskCount} tarefa(s) em aberto</span><div style="display:flex;gap:6px"><button class="mini-action" data-edit-project="${p.id}">Editar</button><button class="mini-action primary" data-quick-project="${p.id}">＋ Lançar</button></div></div>${photos}</article>`;
  }).join(''):'<div class="empty-state" style="display:block;grid-column:1/-1">Nenhum empreendimento encontrado.</div>';
}

function renderFinance(){
  const t=totals(),profit=t.revenue-t.expense;const overview=$('#financeOverview');
  overview.innerHTML=`<div class="finance-kpi"><small>RECEITA BRUTA</small><strong>${brl(t.revenue)}</strong></div><div class="finance-kpi"><small>DESPESAS TOTAIS</small><strong>${brl(t.expense)}</strong></div><div class="finance-kpi ${profit>=0?'profit':'loss'}"><small>RESULTADO OPERACIONAL</small><strong>${brl(profit)}</strong></div>`;
  const filter=$('#financeFilter')?.value||'all';const list=sortedTransactions().filter(x=>filter==='all'||x.type===filter);
  $('#financeRows').innerHTML=list.map(x=>`<tr><td>${escapeHtml(x.description)}${x.photo?` <button class="photo-open-button" data-photo-src="${safeImg(x.photo)}" title="Ver foto / comprovante">▧</button>`:''}</td><td>${escapeHtml(projectLabel(x.projectId))}</td><td>${dateBR(x.date)}</td><td><span class="type-label ${x.type}">${x.type==='revenue'?'RECEITA':'DESPESA'}</span></td><td class="align-right"><span class="table-value ${x.type==='revenue'?'positive':'negative'}">${x.type==='expense'?'−':'+'}${brl(x.amount)}</span></td><td><button class="row-delete" data-delete-transaction="${x.id}" title="Excluir lançamento">×</button></td></tr>`).join('');
  $('#financeEmpty').style.display=list.length?'none':'block';
}

function renderInventory(){
  const units=state.inventory.reduce((s,x)=>s+x.quantity,0),cost=state.inventory.reduce((s,x)=>s+x.quantity*x.unitCost,0),potential=state.inventory.reduce((s,x)=>s+x.quantity*(x.salePrice-x.unitCost),0);
  $('#inventoryKpis').innerHTML=`<div class="inventory-kpi"><small>UNIDADES EM ESTOQUE</small><strong>${numberBR(units)}</strong></div><div class="inventory-kpi"><small>CAPITAL EM ESTOQUE</small><strong>${brl(cost)}</strong></div><div class="inventory-kpi"><small>LUCRO POTENCIAL (ESTIMADO)</small><strong style="color:#8fc6a5">${brl(potential)}</strong></div>`;
  $('#inventoryGrid').innerHTML=state.inventory.length?state.inventory.map(x=>`<article class="product-card"><div class="product-photo">${x.photo?`<img src="${safeImg(x.photo)}" data-photo-src="${safeImg(x.photo)}" alt="${escapeHtml(x.name)}"/>`:'◇'}<span class="stock-count">${numberBR(x.quantity)} un.</span></div><div class="product-info"><h3>${escapeHtml(x.name)}</h3><p>${escapeHtml(projectLabel(x.projectId))} · ${escapeHtml(x.status||'Em estoque')}</p><div class="product-price-row"><div><small>CUSTO POSTO</small><strong>${brl(x.unitCost)}</strong></div><div><small>PREÇO VENDA</small><strong>${brl(x.salePrice)}</strong></div></div></div><div class="product-actions"><button class="mini-action" data-edit-stock="${x.id}">Editar</button><button class="mini-action" data-delete-stock="${x.id}">Excluir</button></div></article>`).join(''):'<div class="empty-state" style="display:block;grid-column:1/-1">Seu estoque está vazio. Cadastre uma mercadoria para acompanhar custo, quantidade e margem.</div>';
}

function renderTasks(){
  const open=state.tasks.filter(t=>!t.done),done=state.tasks.filter(t=>t.done);const all=state.tasks.length,pct=all?Math.round(done.length/all*100):0;
  $('#taskProgressText').textContent=`${done.length} de ${all} tarefas concluídas`;$('#taskProgressBar').style.width=`${pct}%`;
  $('#taskProgressPct').innerHTML=`${pct}<small>%</small>`;$('#openTaskCount').textContent=String(open.length).padStart(2,'0');$('#doneTaskCount').textContent=String(done.length).padStart(2,'0');
  const markup=(t,isDone)=>`<div class="task-item"><button class="task-check ${isDone?'checked':''}" data-toggle-task="${t.id}" aria-label="${isDone?'Reabrir':'Concluir'} tarefa">${isDone?'✓':''}</button><div class="task-copy ${isDone?'completed':''}"><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(projectLabel(t.projectId))}${t.dueDate?' · Prazo: '+dateBR(t.dueDate):''}</small></div>${!isDone?`<span class="task-priority">${escapeHtml(t.priority||'Normal').toUpperCase()}</span>`:''}</div>`;
  $('#openTasks').innerHTML=open.length?open.map(t=>markup(t,false)).join(''):'<div class="list-empty">Tudo em dia. Crie uma nova tarefa para avançar.</div>';
  $('#doneTasks').innerHTML=done.length?done.map(t=>markup(t,true)).join(''):'<div class="list-empty">As tarefas concluídas aparecem aqui.</div>';
}

function renderInvestments(){
  const principal=state.investments.reduce((s,x)=>s+x.principal,0),current=state.investments.reduce((s,x)=>s+x.currentValue,0),gain=current-principal;
  $('#investmentSummary').innerHTML=`<div class="finance-kpi"><small>VALOR APLICADO</small><strong>${brl(principal)}</strong></div><div class="finance-kpi"><small>VALOR ATUAL INFORMADO</small><strong>${brl(current)}</strong></div><div class="finance-kpi ${gain>=0?'profit':'loss'}"><small>RENDIMENTO INFORMADO</small><strong>${gain>=0?'+':''}${brl(gain)}</strong></div>`;
  $('#investmentList').innerHTML=state.investments.length?state.investments.map(x=>{const diff=x.currentValue-x.principal,pct=x.principal?diff/x.principal*100:0;return `<article class="investment-card"><div class="investment-head"><div><h3>${escapeHtml(x.name)}</h3><small>${escapeHtml(x.kind)} · Desde ${dateBR(x.date)}</small></div><span class="type-label ${diff>=0?'revenue':'expense'}">${pct>=0?'+':''}${pct.toFixed(2).replace('.',',')}%</span></div><div class="investment-values"><div><small>VALOR APLICADO</small><strong>${brl(x.principal)}</strong></div><div><small>VALOR ATUAL</small><strong>${brl(x.currentValue)}</strong></div></div><div class="investment-foot"><span>${escapeHtml(x.liquidity||'Liquidez não informada')}</span><span class="${diff>=0?'return-positive':'return-negative'}">${diff>=0?'+':''}${brl(diff)}</span></div><div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="mini-action" data-delete-investment="${x.id}">Excluir aplicação</button></div></article>`}).join(''):'<div class="empty-state" style="display:block;grid-column:1/-1">Nenhuma aplicação cadastrada. Adicione seus investimentos para acompanhar o capital aplicado.</div>';
}

function openModal(title,kicker,html){$('#modalTitle').textContent=title;$('#modalKicker').textContent=kicker||'AURUM / REGISTRO';$('#modalBody').innerHTML=html;$('#modalBackdrop').classList.add('open');document.body.style.overflow='hidden';}
function closeModal(){$('#modalBackdrop').classList.remove('open');document.body.style.overflow='';pendingPhotos=[];}
$('#closeModal').addEventListener('click',closeModal);$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))closeModal()});
function projectOptions(selected=''){return `<option value="">Geral / não vinculado</option>${state.projects.map(p=>`<option value="${p.id}" ${selected===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}`}
function showTransactionForm(projectId='',presetType='revenue'){
  openModal('Novo lançamento','AURUM / FINANCEIRO',`<form id="transactionForm"><div class="form-grid"><div class="form-field"><label>Tipo de movimentação</label><select name="type"><option value="revenue" ${presetType==='revenue'?'selected':''}>Receita / venda</option><option value="expense" ${presetType==='expense'?'selected':''}>Despesa / custo</option></select></div><div class="form-field"><label>Valor (R$)</label><input name="amount" type="number" min="0.01" step="0.01" placeholder="0,00" required/></div><div class="form-field full"><label>Descrição</label><input name="description" placeholder="Ex.: Venda de celular, comissão TikTok..." required maxlength="100"/></div><div class="form-field"><label>Empreendimento</label><select name="projectId">${projectOptions(projectId)}</select></div><div class="form-field"><label>Data</label><input name="date" type="date" value="${todayISO()}" required/></div><div class="form-field full"><label>Foto ou comprovante (opcional)</label><div class="file-drop"><input name="photo" type="file" accept="image/*"/><div class="form-help">Imagem comprimida e salva no navegador junto com o lançamento.</div><div class="photo-preview" id="modalPhotoPreview"></div></div></div></div><div class="form-actions"><button type="button" class="button button-ghost" data-close-modal>Cancelar</button><button class="button button-gold" type="submit">Salvar lançamento</button></div></form>`);
  bindPhotoPreview($('#transactionForm [name="photo"]'));
  $('#transactionForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);const amount=Number(f.get('amount'));if(!(amount>0))return toast('Informe um valor válido.','error');state.transactions.push({id:uid(),type:f.get('type'),amount,description:f.get('description').trim(),projectId:f.get('projectId'),date:f.get('date'),photo:pendingPhotos[0]||'',createdAt:new Date().toISOString()});save();closeModal();renderAll();toast('Lançamento registrado, chefe.');});
}
function showProjectForm(id=''){
  const p=id?projectById(id):null;pendingPhotos=[];
  openModal(p?'Editar empreendimento':'Novo empreendimento','AURUM / PORTFÓLIO',`<form id="projectForm"><div class="form-grid"><div class="form-field full"><label>Nome do empreendimento</label><input name="name" required maxlength="55" value="${escapeHtml(p?.name||'')}" placeholder="Ex.: TikTok Shop, importação..."/></div><div class="form-field"><label>Nicho / segmento</label><input name="niche" value="${escapeHtml(p?.niche||'')}" placeholder="Ex.: Afiliados, eletrônicos..."/></div><div class="form-field"><label>Ícone (um símbolo)</label><input name="icon" maxlength="3" value="${escapeHtml(p?.icon||'◈')}"/></div><div class="form-field"><label>Meta de seguidores (0 = não usar)</label><input name="followerGoal" type="number" min="0" value="${p?.followerGoal??0}"/></div><div class="form-field"><label>Seguidores atuais</label><input name="followers" type="number" min="0" value="${p?.followers??0}"/></div><div class="form-field"><label>Meta de vídeos</label><input name="videoGoal" type="number" min="0" value="${p?.videoGoal??0}"/></div><div class="form-field"><label>Vídeos publicados</label><input name="videos" type="number" min="0" value="${p?.videos??0}"/></div><div class="form-field"><label>Visualizações acumuladas</label><input name="views" type="number" min="0" value="${p?.views??0}"/></div><div class="form-field full"><label>Descrição / objetivo</label><textarea name="description" placeholder="O que você quer construir neste negócio?">${escapeHtml(p?.description||'')}</textarea></div><div class="form-field full"><label>Fotos do empreendimento</label><div class="file-drop"><input name="photos" type="file" accept="image/*" multiple/><div class="form-help">Você pode anexar até 3 imagens. Elas ficam salvas neste navegador.</div><div class="photo-preview" id="modalPhotoPreview">${(p?.photos||[]).map(x=>`<img src="${safeImg(x)}" data-photo-src="${safeImg(x)}" alt="Foto atual"/>`).join('')}</div></div></div></div><div class="form-actions">${p?'<button type="button" class="button button-ghost" id="deleteProject">Excluir</button>':''}<button type="button" class="button button-ghost" data-close-modal>Cancelar</button><button class="button button-gold" type="submit">Salvar empreendimento</button></div></form>`);
  bindPhotoPreview($('#projectForm [name="photos"]'),true);
  if(p)$('#deleteProject').addEventListener('click',()=>{if(confirm(`Excluir ${p.name}? Os lançamentos serão mantidos como não vinculados.`)){state.transactions.forEach(t=>{if(t.projectId===p.id)t.projectId=''});state.tasks.forEach(t=>{if(t.projectId===p.id)t.projectId=''});state.inventory.forEach(t=>{if(t.projectId===p.id)t.projectId=''});state.projects=state.projects.filter(x=>x.id!==p.id);save();closeModal();renderAll();toast('Empreendimento excluído.')}});
  $('#projectForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);const obj={name:f.get('name').trim(),niche:f.get('niche').trim(),icon:f.get('icon').trim()||'◈',followerGoal:Number(f.get('followerGoal'))||0,followers:Number(f.get('followers'))||0,videoGoal:Number(f.get('videoGoal'))||0,videos:Number(f.get('videos'))||0,views:Number(f.get('views'))||0,description:f.get('description').trim()};if(p){Object.assign(p,obj,{photos:[...pendingPhotos,...(p.photos||[])].slice(0,3)});}else{state.projects.push({id:uid(),...obj,color:projectPalette[state.projects.length%projectPalette.length],createdAt:new Date().toISOString(),views:0,photos:pendingPhotos.slice(0,3)});}save();closeModal();renderAll();toast(p?'Empreendimento atualizado.':'Novo empreendimento criado.');});
}
function showTaskForm(prefill={}){
  openModal('Nova tarefa','AURUM / EXECUÇÃO',`<form id="taskForm"><div class="form-grid"><div class="form-field full"><label>O que precisa ser feito?</label><input name="title" required maxlength="120" value="${escapeHtml(prefill.title||'')}" placeholder="Ex.: Publicar vídeo sobre o produto..."/></div><div class="form-field"><label>Empreendimento</label><select name="projectId">${projectOptions(prefill.projectId||'')}</select></div><div class="form-field"><label>Prioridade</label><select name="priority"><option>Alta</option><option selected>Média</option><option>Baixa</option></select></div><div class="form-field full"><label>Prazo (opcional)</label><input type="date" name="dueDate" value="${prefill.dueDate||''}"/></div></div><div class="form-actions"><button type="button" class="button button-ghost" data-close-modal>Cancelar</button><button class="button button-gold">Criar tarefa</button></div></form>`);
  $('#taskForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);state.tasks.push({id:uid(),title:f.get('title').trim(),projectId:f.get('projectId'),priority:f.get('priority'),dueDate:f.get('dueDate'),done:false,createdAt:new Date().toISOString()});save();closeModal();renderAll();toast('Tarefa adicionada à central.');});
}
function showStockForm(id=''){
 const x=id?state.inventory.find(i=>i.id===id):null;
 openModal(x?'Editar produto':'Cadastrar produto','AURUM / ESTOQUE',`<form id="stockForm"><div class="form-grid"><div class="form-field full"><label>Produto</label><input name="name" required value="${escapeHtml(x?.name||'')}" placeholder="Ex.: iPhone 14 128GB..."/></div><div class="form-field"><label>Quantidade</label><input type="number" name="quantity" min="0" step="1" value="${x?.quantity??1}" required/></div><div class="form-field"><label>Status logístico</label><select name="status">${['Em pesquisa','Encomendado','Em trânsito','Em estoque','Reservado','Vendido'].map(v=>`<option ${x?.status===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="form-field"><label>Compra unitária (R$)</label><input type="number" step="0.01" min="0" name="purchaseCost" value="${x?.purchaseCost??x?.unitCost??0}" required/></div><div class="form-field"><label>Frete / logística por unidade (R$)</label><input type="number" step="0.01" min="0" name="logisticsCost" value="${x?.logisticsCost??0}" required/></div><div class="form-field"><label>Impostos / taxas por unidade (R$)</label><input type="number" step="0.01" min="0" name="taxCost" value="${x?.taxCost??0}" required/></div><div class="form-field"><label>Preço de venda (R$)</label><input type="number" step="0.01" min="0" name="salePrice" value="${x?.salePrice??0}" required/></div><div class="form-field"><label>Empreendimento</label><select name="projectId">${projectOptions(x?.projectId||'')}</select></div><div class="form-field"><label>Foto do produto</label><input type="file" name="photo" accept="image/*"/></div></div><div class="form-actions">${x?'<button type="button" class="button button-ghost" id="deleteStockFromForm">Excluir produto</button>':''}<button type="button" class="button button-ghost" data-close-modal>Cancelar</button><button class="button button-gold">Salvar produto</button></div></form>`);
 bindPhotoPreview($('#stockForm [name="photo"]'));
 if(x)$('#deleteStockFromForm').addEventListener('click',()=>{state.inventory=state.inventory.filter(i=>i.id!==x.id);save();closeModal();renderInventory();toast('Produto removido.');});
 $('#stockForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);const purchaseCost=Number(f.get('purchaseCost'))||0,logisticsCost=Number(f.get('logisticsCost'))||0,taxCost=Number(f.get('taxCost'))||0;const obj={name:f.get('name').trim(),quantity:Number(f.get('quantity')),status:f.get('status'),purchaseCost,logisticsCost,taxCost,unitCost:purchaseCost+logisticsCost+taxCost,salePrice:Number(f.get('salePrice')),projectId:f.get('projectId')};if(x)Object.assign(x,obj,{photo:pendingPhotos[0]||x.photo||''});else state.inventory.push({id:uid(),...obj,photo:pendingPhotos[0]||''});save();closeModal();renderAll();toast(x?'Produto atualizado.':'Produto cadastrado.');});
}
function showInvestmentForm(){
 openModal('Nova aplicação','AURUM / CAPITAL',`<form id="investmentForm"><div class="form-grid"><div class="form-field full"><label>Nome da aplicação</label><input name="name" required placeholder="Ex.: CDB liquidez diária, Tesouro Selic..."/></div><div class="form-field"><label>Tipo</label><select name="kind"><option>Renda fixa</option><option>Renda variável</option><option>Caixa / reserva</option><option>Criptoativos</option><option>Outro</option></select></div><div class="form-field"><label>Data da aplicação</label><input type="date" name="date" value="${todayISO()}"/></div><div class="form-field"><label>Valor aplicado (R$)</label><input type="number" name="principal" min="0.01" step="0.01" required/></div><div class="form-field"><label>Valor atual (R$)</label><input type="number" name="currentValue" min="0" step="0.01" required/></div><div class="form-field full"><label>Liquidez / observação</label><input name="liquidity" placeholder="Ex.: D+0, vencimento em 2028..."/></div><div class="form-field full"><div class="form-help">Os rendimentos são calculados com base nos valores que você informar. O painel não consulta sua corretora nem recomenda investimentos.</div></div></div><div class="form-actions"><button type="button" class="button button-ghost" data-close-modal>Cancelar</button><button class="button button-gold">Salvar aplicação</button></div></form>`);
 $('#investmentForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);state.investments.push({id:uid(),name:f.get('name').trim(),kind:f.get('kind'),date:f.get('date'),principal:Number(f.get('principal')),currentValue:Number(f.get('currentValue')),liquidity:f.get('liquidity').trim()});save();closeModal();renderAll();toast('Aplicação adicionada.');});
}
function bindPhotoPreview(input,multiple=false){if(!input)return;input.addEventListener('change',async()=>{pendingPhotos=[];const files=[...input.files].slice(0,multiple?3:1);for(const file of files){if(!file.type.startsWith('image/'))continue;try{pendingPhotos.push(await compressImage(file));}catch(e){toast('Não consegui ler uma das imagens.','error')}}const preview=$('#modalPhotoPreview');if(preview)preview.innerHTML=pendingPhotos.map(src=>`<img src="${safeImg(src)}" alt="Prévia da foto"/>`).join('');});}
async function compressImage(file){
 const bitmap=await createImageBitmap(file);const max=1100,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();return canvas.toDataURL('image/jpeg',.68);
}

// AI helper: the API key is only read inside the Netlify Function. The offline parser is a useful demo fallback.
function parseMoney(text){
 const m=text.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)(\s*k\b)?/i);if(!m)return 0;let s=m[1];let n;if(s.includes('.')&&s.includes(','))n=Number(s.replace(/\./g,'').replace(',','.'));else if(s.includes('.')&&/^\d{1,3}(\.\d{3})+$/.test(s))n=Number(s.replace(/\./g,''));else n=Number(s.replace(',','.'));if(m[2])n*=1000;return Number.isFinite(n)?n:0;
}
function guessProject(text){const t=text.toLowerCase();if(t.includes('tiktok')||t.includes('shop')||t.includes('seguidor')||t.includes('vídeo')||t.includes('video'))return state.projects.find(p=>/tiktok|shop/i.test(p.name))?.id||'';if(t.includes('china')||t.includes('celular')||t.includes('iphone')||t.includes('fornecedor')||t.includes('import'))return state.projects.find(p=>/china|celular|import/i.test(p.name))?.id||'';return '';}
function offlineAssistant(text){
 const low=text.toLowerCase(),amount=parseMoney(text),projectId=guessProject(text);let action={type:'none'};let reply='Entendi, chefe. Posso organizar isso como lançamento, tarefa, meta ou produto. Me conta o valor, o empreendimento e o que você quer registrar.';
 if(amount>0&&/(faturei|vendi|venda|recebi|entrou|ganhei|comiss[aã]o|lucro)/i.test(low)){action={type:'add_revenue',amount,projectId,description:text.slice(0,90)};reply=`Boa, chefe. Identifiquei uma possível receita de ${brl(amount)}${projectId?' para '+projectLabel(projectId):''}. Confere a sugestão antes de salvar.`;}
 else if(amount>0&&/(paguei|gastei|comprei|despesa|custo|custou|investi no estoque|frete)/i.test(low)){action={type:'add_expense',amount,projectId,description:text.slice(0,90)};reply=`Anotei a possível saída de ${brl(amount)}, chefe. Revise o empreendimento e confirme para entrar no caixa.`;}
 else if(/seguidor/i.test(low)){const match=text.match(/(\d[\d.,]*)\s*(?:seguidores?)?/i);const val=match?Number(match[1].replace(/\./g,'').replace(',','.')):NaN;if(Number.isFinite(val)&&val>=0){action={type:'update_followers',metricValue:val,projectId};reply=`Encontrei uma atualização de seguidores para ${numberBR(val)}. Veja se está vinculada ao negócio certo.`;}else reply='Qual é o número atual de seguidores que devo registrar, chefe?';}
 else if(amount>0&&/(apliquei|aplicação|aplicacao|cdb|tesouro|renda fixa)/i.test(low)){action={type:'add_investment',amount,title:'Aplicação informada pela IA'};reply=`Identifiquei um aporte de ${brl(amount)}. Vou sugerir o cadastro da aplicação; você completa o nome e o valor atual.`;}
 else if(/(preciso|tenho que|não posso esquecer|nao posso esquecer|lembra de|devo|fazer|postar|publicar|gravar)/i.test(low)){action={type:'create_task',title:text.slice(0,120),projectId};reply='Transformei seu recado em uma tarefa sugerida. Ajuste o prazo e a prioridade antes de adicionar.';}
 else if(/(viralizou|bateu|visualizaç|views)/i.test(low)){reply='Isso merece registro, chefe. Conte quantas visualizações o vídeo alcançou e eu atualizo o acompanhamento do conteúdo.';}
 return {reply,action,offline:true};
}
async function askAssistant(text,mode='chat',mood=''){
 const context={projects:state.projects.map(p=>({name:p.name,niche:p.niche,followers:p.followers,followerGoal:p.followerGoal,videos:p.videos,videoGoal:p.videoGoal})),transactions:state.transactions.slice(-30).map(t=>({type:t.type,amount:t.amount,description:t.description,project:projectLabel(t.projectId),date:t.date})),tasks:state.tasks.slice(-20).map(t=>({title:t.title,done:t.done,project:projectLabel(t.projectId)})),inventory:state.inventory.map(i=>({name:i.name,quantity:i.quantity,status:i.status,unitCost:i.unitCost,salePrice:i.salePrice})),investments:state.investments.map(i=>({name:i.name,principal:i.principal,currentValue:i.currentValue}))};
 try{const res=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,message:text,mood,today:todayISO(),accessCode:safeStorageGet('aurum-ai-access'),context,history:chatHistory.slice(0,-1).slice(-8)})});if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.error||'IA ainda não configurada.');}aiConnected=true;$('#aiConnectionStatus').textContent='IA conectada';if($('.ai-status-dot'))$('.ai-status-dot').style.background='#7bc29c';return await res.json();}
 catch(err){aiConnected=false;$('#aiConnectionStatus').textContent='modo local';if($('.ai-status-dot'))$('.ai-status-dot').style.background='#b28f55';console.info('Usando assistente local:',err.message);if(mode==='mood')return {reply:'A trilha offline está pronta. Configure OPENAI_API_KEY na Netlify para receber curadoria personalizada com IA.',track:null,offline:true};return offlineAssistant(text);}
}
function openChat(){ $('#chatOverlay').classList.add('open');document.body.style.overflow='hidden';setTimeout(()=>$('#chatInput').focus(),80); }
function closeChat(){ $('#chatOverlay').classList.remove('open');document.body.style.overflow=''; }
$('#closeChat').addEventListener('click',closeChat);$('#chatOverlay').addEventListener('click',e=>{if(e.target===$('#chatOverlay'))closeChat()});
$('#configureAi').addEventListener('click',()=>{const current=safeStorageGet('aurum-ai-access');openModal('Conectar copiloto IA','AURUM / ACESSO SEGURO',`<form id="aiAccessForm"><div class="form-grid"><div class="form-field full"><label>Código privado de acesso</label><input name="accessCode" type="password" autocomplete="off" value="${escapeHtml(current)}" placeholder="Digite o código configurado na Netlify" required/><div class="form-help">Este código é definido por você na variável AURUM_ACCESS_CODE da Netlify. Não é sua chave OpenAI. A chave OpenAI fica somente no servidor.</div></div></div><div class="form-actions"><button type="button" class="button button-ghost" data-close-modal>Cancelar</button><button class="button button-gold">Salvar código</button></div></form>`);$('#aiAccessForm').addEventListener('submit',e=>{e.preventDefault();const code=new FormData(e.currentTarget).get('accessCode').trim();if(!safeStorageSet('aurum-ai-access',code))return toast('Não foi possível salvar no navegador. Habilite o armazenamento local.','error');closeModal();toast('Código de acesso salvo neste navegador.');});});
function addChatMessage(role,text){const wrap=document.createElement('div');wrap.className=`chat-message ${role}`;const avatar=document.createElement('div');avatar.className='message-avatar';avatar.textContent=role==='assistant'?'✧':'GL';const bubble=document.createElement('div');bubble.className='message-bubble';const p=document.createElement('p');p.textContent=text;bubble.append(p);wrap.append(avatar,bubble);$('#chatMessages').append(wrap);$('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;return wrap;}
$('#chatForm').addEventListener('submit',async e=>{
 e.preventDefault();const input=$('#chatInput');const text=input.value.trim();if(!text)return;input.value='';addChatMessage('user',text);chatHistory.push({role:'user',content:text});$('#sendChat').disabled=true;const typing=document.createElement('div');typing.className='chat-typing';typing.textContent='AURUM está analisando seu movimento...';$('#chatMessages').append(typing);$('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;
 const result=await askAssistant(text);typing.remove();$('#sendChat').disabled=false;addChatMessage('assistant',result.reply||'Vamos organizar isso, chefe.');chatHistory.push({role:'assistant',content:result.reply||''});
 const action=normalizeAction(result.action||{type:'none'});lastSuggestion=action.type&&action.type!=='none'?action:null;const holder=$('#suggestionHolder');holder.innerHTML='';if(lastSuggestion){const card=document.createElement('div');card.className='ai-suggestion';const small=document.createElement('small');small.textContent='SUGESTÃO DE ATUALIZAÇÃO';const p=document.createElement('p');p.textContent=describeAction(lastSuggestion);const row=document.createElement('div');row.className='ai-suggestion-actions';const apply=document.createElement('button');apply.textContent='Aplicar atualização';apply.addEventListener('click',()=>{applyAiAction(lastSuggestion);holder.innerHTML='';lastSuggestion=null;});const discard=document.createElement('button');discard.textContent='Descartar';discard.addEventListener('click',()=>{holder.innerHTML='';lastSuggestion=null;});row.append(apply,discard);card.append(small,p,row);holder.append(card);}
});
function normalizeAction(action){if(!action||typeof action!=='object')return {type:'none'};if(action.projectId)return action;const name=String(action.projectName||'').trim().toLowerCase();const project=name?state.projects.find(p=>p.name.toLowerCase()===name)||state.projects.find(p=>p.name.toLowerCase().includes(name)||name.includes(p.name.toLowerCase())):null;return {...action,projectId:project?.id||''};}
function describeAction(a){if(a.type==='add_revenue')return `Registrar receita de ${brl(a.amount)} · ${projectLabel(a.projectId)} · ${a.description||'Receita informada'}`;if(a.type==='add_expense')return `Registrar despesa de ${brl(a.amount)} · ${projectLabel(a.projectId)} · ${a.description||'Despesa informada'}`;if(a.type==='update_followers')return `Atualizar seguidores de ${projectLabel(a.projectId)} para ${numberBR(a.metricValue)}.`;if(a.type==='update_videos')return `Atualizar vídeos publicados em ${projectLabel(a.projectId)} para ${numberBR(a.metricValue)}.`;if(a.type==='update_views')return `Atualizar visualizações acumuladas em ${projectLabel(a.projectId)} para ${numberBR(a.metricValue)}.`;if(a.type==='create_task')return `Criar tarefa: ${a.title}`;if(a.type==='add_investment')return `Cadastrar aplicação de ${brl(a.amount)} (você completará os detalhes).`;if(a.type==='add_project')return `Criar empreendimento: ${a.title}`;if(a.type==='add_stock')return `Cadastrar produto: ${a.title} · quantidade ${a.metricValue||1}`;return 'Atualizar dados do painel.';}
function showStockFormFromAi(a){
 pendingPhotos=[];
 openModal('Completar produto','AURUM / SUGESTÃO DA IA',`<form id="aiStockForm"><div class="form-grid"><div class="form-field full"><label>Produto</label><input name="name" required value="${escapeHtml(a.title||'Produto informado à IA')}"/></div><div class="form-field"><label>Quantidade</label><input name="quantity" type="number" min="0" step="1" value="${Number(a.metricValue)||1}" required/></div><div class="form-field"><label>Status logístico</label><select name="status"><option>Em pesquisa</option><option selected>Encomendado</option><option>Em trânsito</option><option>Em estoque</option></select></div><div class="form-field"><label>Compra unitária (R$)</label><input name="purchaseCost" type="number" min="0" step="0.01" value="0" required/></div><div class="form-field"><label>Frete / logística por unidade (R$)</label><input name="logisticsCost" type="number" min="0" step="0.01" value="0" required/></div><div class="form-field"><label>Impostos / taxas por unidade (R$)</label><input name="taxCost" type="number" min="0" step="0.01" value="0" required/></div><div class="form-field"><label>Preço de venda (R$)</label><input name="salePrice" type="number" min="0" step="0.01" value="0" required/></div><div class="form-field full"><label>Empreendimento</label><select name="projectId">${projectOptions(a.projectId||'')}</select></div></div><div class="form-actions"><button type="button" class="button button-ghost" data-close-modal>Cancelar</button><button class="button button-gold">Salvar produto</button></div></form>`);
 $('#aiStockForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);const purchaseCost=Number(f.get('purchaseCost'))||0,logisticsCost=Number(f.get('logisticsCost'))||0,taxCost=Number(f.get('taxCost'))||0;state.inventory.push({id:uid(),name:f.get('name').trim(),quantity:Number(f.get('quantity')),status:f.get('status'),purchaseCost,logisticsCost,taxCost,unitCost:purchaseCost+logisticsCost+taxCost,salePrice:Number(f.get('salePrice'))||0,projectId:f.get('projectId'),photo:''});save();closeModal();renderAll();toast('Produto cadastrado.');});
}

function applyAiAction(a){
 if(a.type==='add_revenue'||a.type==='add_expense'){if(!(Number(a.amount)>0))return toast('Valor da sugestão inválido.','error');state.transactions.push({id:uid(),type:a.type==='add_revenue'?'revenue':'expense',amount:Number(a.amount),description:a.description|| (a.type==='add_revenue'?'Receita informada à IA':'Despesa informada à IA'),projectId:a.projectId||'',date:a.date||todayISO(),createdAt:new Date().toISOString()});}
 else if(a.type==='update_followers'||a.type==='update_videos'||a.type==='update_views'){const p=projectById(a.projectId)||state.projects.find(p=>a.type==='update_followers'?p.followerGoal>0:a.type==='update_videos'?p.videoGoal>0:/tiktok|shop/i.test(p.name))||state.projects[0];if(!p)return toast('Crie um empreendimento primeiro.','error');const field=a.type==='update_followers'?'followers':a.type==='update_videos'?'videos':'views';p[field]=Math.max(0,Number(a.metricValue)||0);}
 else if(a.type==='create_task'){state.tasks.push({id:uid(),title:a.title||'Tarefa sugerida pela IA',projectId:a.projectId||'',priority:'Média',dueDate:a.date||'',done:false,createdAt:new Date().toISOString()});}
 else if(a.type==='add_investment'){openModal('Completar aplicação','AURUM / SUGESTÃO DA IA',`<form id="aiInvestmentForm"><div class="form-grid"><div class="form-field full"><label>Nome da aplicação</label><input name="name" required value="${escapeHtml(a.title||'Aplicação')}"/></div><div class="form-field"><label>Valor aplicado (R$)</label><input name="principal" type="number" step="0.01" value="${Number(a.amount)||0}" required/></div><div class="form-field"><label>Valor atual (R$)</label><input name="current" type="number" step="0.01" value="${Number(a.amount)||0}" required/></div><div class="form-field full"><label>Tipo</label><select name="kind"><option>Renda fixa</option><option>Renda variável</option><option>Caixa / reserva</option><option>Outro</option></select></div></div><div class="form-actions"><button type="button" class="button button-ghost" data-close-modal>Cancelar</button><button class="button button-gold">Salvar aplicação</button></div></form>`);$('#aiInvestmentForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);state.investments.push({id:uid(),name:f.get('name'),principal:Number(f.get('principal')),currentValue:Number(f.get('current')),kind:f.get('kind'),date:todayISO(),liquidity:''});save();closeModal();renderAll();toast('Aplicação cadastrada.');});return;}
 else if(a.type==='add_project'){state.projects.push({id:uid(),name:a.title||'Novo empreendimento',niche:'Novo negócio',description:'Criado pela IA',icon:'◈',color:projectPalette[state.projects.length%4],createdAt:new Date().toISOString(),followers:0,followerGoal:0,videos:0,videoGoal:0,views:0,photos:[]});}
 else if(a.type==='add_stock'){showStockFormFromAi(a);return;}
 save();renderAll();toast('Atualização aplicada ao painel, chefe.');
}

const moodCatalog={
 focus:{title:'Time',artist:'Hans Zimmer',why:'Trilha de concentração e construção. Boa para entrar em execução profunda, organizar a operação e fazer o que precisa ser feito.',energy:'FOCO / CINEMÁTICO',query:'Hans Zimmer Time'},
 delay:{title:'The Less I Know The Better',artist:'Tame Impala',why:'Um pouco de ironia elegante para esperar o fornecedor, rastrear a carga e manter a cabeça fria enquanto a logística resolve o próprio enredo.',energy:'PACIÊNCIA / GROOVE',query:'Tame Impala The Less I Know The Better'},
 loss:{title:'The Nights',artist:'Avicii',why:'Para lembrar que um dia ruim não define o projeto. Respira, aprende com o que saiu do plano e volta para o jogo.',energy:'RECOMEÇO / ENERGIA',query:'Avicii The Nights'},
 win:{title:'On Top of the World',artist:'Imagine Dragons',why:'Dia de colocar o resultado no placar. Curta a conquista, registre os números e transforme o embalo em consistência.',energy:'VITÓRIA / IMPACTO',query:'Imagine Dragons On Top of the World'},
 viral:{title:'Can’t Hold Us',artist:'Macklemore & Ryan Lewis',why:'Quando o conteúdo encontra audiência, o ritmo acelera. Aproveite o alcance, responda à comunidade e converta atenção em oportunidade.',energy:'HYPE / ACELERAÇÃO',query:'Macklemore Ryan Lewis Cant Hold Us'},
 ambition:{title:'Outro',artist:'M83',why:'Uma trilha expansiva para pensar no longo prazo. Grandes planos ficam mais reais quando viram metas e próximos passos.',energy:'VISÃO / EXPANSÃO',query:'M83 Outro'}
};
function selectMood(key){selectedMood=key;$$('.mood-option').forEach(el=>el.classList.toggle('selected',el.dataset.mood===key));}
$$('.mood-option').forEach(el=>el.addEventListener('click',()=>selectMood(el.dataset.mood)));
function renderMoodTrack(track,caption,offline=false){
 const mood=moodCatalog[selectedMood]||moodCatalog.focus;const item=track||mood;const title=item.title||mood.title,artist=item.artist||mood.artist,why=item.why||caption||mood.why,query=item.spotifyQuery||`${title} ${artist}`;
 $('#moodCover').classList.add('generated');$('#moodCover .cover-bottom small').textContent=mood.energy||moodCatalog[selectedMood]?.energy||'AURUM SOUNDTRACK';$('#moodCover .cover-bottom strong').textContent='YOUR DAY. YOUR TEMPO.';
 $('#moodResult').innerHTML=`<div class="panel-kicker">SUA TRILHA DE HOJE</div><div class="track-meta"><div class="track-art">♫</div><div class="track-info"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(artist)} · ${escapeHtml(mood.energy||'SOUNDTRACK')}</small></div><a class="spotify-link" href="https://open.spotify.com/search/${encodeURIComponent(query)}" target="_blank" rel="noopener">Ouvir ↗</a></div><p class="mood-caption">${escapeHtml(why)}</p>${offline?'<p class="form-help" style="margin-top:12px">Curadoria local. Conecte a IA na Netlify para recomendações personalizadas.</p>':''}`;
}
$('#generateMood').addEventListener('click',async()=>{
 if(!selectedMood)return toast('Escolha o mood primeiro, chefe.','error');const note=$('#moodNote').value.trim();state.mood={selected:selectedMood,note,lastGenerated:todayISO()};save();$('#generateMood').disabled=true;$('#generateMood').textContent='✧ MONTANDO A TRILHA...';
 const result=await askAssistant(note||`Meu mood hoje é ${selectedMood}. Escolha uma música que combine com isso.`, 'mood',selectedMood);
 renderMoodTrack(result.track||moodCatalog[selectedMood],result.reply,result.offline);$('#generateMood').disabled=false;$('#generateMood').textContent='✧ GERAR MINHA TRILHA';toast('Sua trilha está pronta, chefe.');
});

// Export, restore and delegated interactions.
function downloadFile(filename,content,mime){const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}
function exportBackup(){downloadFile(`aurum-backup-${todayISO()}.json`,JSON.stringify(state,null,2),'application/json');toast('Backup exportado. Guarde esse arquivo em local seguro.');}
function exportCSV(){const rows=[['data','tipo','descricao','empreendimento','valor'],...sortedTransactions().map(t=>[t.date,t.type,t.description,projectLabel(t.projectId),t.amount])];const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');downloadFile(`aurum-financeiro-${todayISO()}.csv`,'\uFEFF'+csv,'text/csv;charset=utf-8');toast('CSV financeiro exportado.');}
$('#backupButton').addEventListener('click',exportBackup);
function restoreBackup(file){const reader=new FileReader();reader.onload=()=>{try{const next=JSON.parse(reader.result);if(next.version!==1||!Array.isArray(next.projects)||!Array.isArray(next.transactions))throw new Error('Formato inválido');if(confirm('Importar este backup e substituir os dados atuais?')){state={...defaultData(),...next};save();renderAll();toast('Backup restaurado com sucesso.');}}catch(e){toast('Não consegui importar esse backup.','error')}};reader.readAsText(file);}

document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
 const link=e.target.closest('[data-view-link]');if(link){setView(link.dataset.viewLink);return;}
 if(e.target.closest('[data-open-chat]')){openChat();return;}
 const prompt=e.target.closest('[data-prompt]');if(prompt){$('#chatInput').value=prompt.dataset.prompt;$('#chatInput').focus();return;}
 const close=e.target.closest('[data-close-modal]');if(close){closeModal();return;}
 const photo=e.target.closest('[data-photo-src]');if(photo){openModal('Foto / comprovante','AURUM / ARQUIVO',`<img src="${safeImg(photo.dataset.photoSrc)}" alt="Foto anexada" style="display:block;width:100%;max-height:65vh;object-fit:contain;border-radius:9px;background:#090b0e"/>`);return;}
 const action=e.target.closest('[data-action]')?.dataset.action;
 if(action==='quick-note'){showTransactionForm();return;}if(action==='new-project'){showProjectForm();return;}if(action==='new-task'){showTaskForm();return;}if(action==='new-stock'){showStockForm();return;}if(action==='new-investment'){showInvestmentForm();return;}if(action==='export-csv'){exportCSV();return;}
 const editProject=e.target.closest('[data-edit-project]');if(editProject){showProjectForm(editProject.dataset.editProject);return;}
 const quickProject=e.target.closest('[data-quick-project]');if(quickProject){showTransactionForm(quickProject.dataset.quickProject);return;}
 const delTx=e.target.closest('[data-delete-transaction]');if(delTx){if(confirm('Excluir este lançamento?')){state.transactions=state.transactions.filter(t=>t.id!==delTx.dataset.deleteTransaction);save();renderAll();toast('Lançamento excluído.');}return;}
 const editStock=e.target.closest('[data-edit-stock]');if(editStock){showStockForm(editStock.dataset.editStock);return;}
 const delStock=e.target.closest('[data-delete-stock]');if(delStock){if(confirm('Excluir este produto do estoque?')){state.inventory=state.inventory.filter(t=>t.id!==delStock.dataset.deleteStock);save();renderInventory();toast('Produto excluído.');}return;}
 const toggle=e.target.closest('[data-toggle-task]');if(toggle){const t=state.tasks.find(x=>x.id===toggle.dataset.toggleTask);if(t)t.done=!t.done;save();renderAll();return;}
 const delInv=e.target.closest('[data-delete-investment]');if(delInv){if(confirm('Excluir esta aplicação do painel?')){state.investments=state.investments.filter(x=>x.id!==delInv.dataset.deleteInvestment);save();renderAll();toast('Aplicação removida.');}return;}
});
$('#businessSearch').addEventListener('input',renderBusinesses);$('#businessSort').addEventListener('change',renderBusinesses);$('#financeFilter').addEventListener('change',renderFinance);
$('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));

// Offer local data restore through an unobtrusive file input.
const restoreInput=document.createElement('input');restoreInput.type='file';restoreInput.accept='application/json,.json';restoreInput.hidden=true;document.body.append(restoreInput);restoreInput.addEventListener('change',()=>{if(restoreInput.files[0])restoreBackup(restoreInput.files[0]);restoreInput.value='';});
$('#restoreButton').addEventListener('click',()=>restoreInput.click());

// Global shortcut: Ctrl/Cmd + K opens the AI copilot.
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openChat();}if(e.key==='Escape'){closeModal();closeChat();}});

renderAll();
initSupabase();

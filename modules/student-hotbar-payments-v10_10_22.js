/* Team Bulls v10.10.22 — hotbar do aluno sem duplicidade de suprimentos + pagamentos próprios. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_HOTBAR_PAYMENTS_101022__)return;
  window.__TEAM_BULLS_STUDENT_HOTBAR_PAYMENTS_101022__=true;

  const VERSION='10.10.22-studentpay2';
  const COLLECTION='studentBilling';
  let cachedRecord=null;
  let loading=null;
  let patchTimer=null;

  const currentUser=()=>{try{return typeof CURRENT_USER!=='undefined'?CURRENT_USER:null;}catch(error){return null;}};
  const coreMode=()=>{try{return typeof MODE!=='undefined'?MODE:'';}catch(error){return'';}};
  const studentContext=()=>{
    try{if(window.TeamBullsStudentHomeLayout?.isStudentContext)return !!window.TeamBullsStudentHomeLayout.isStudentContext();}catch(error){}
    const user=currentUser();
    if(user?.role==='trainer')return false;
    if(user?.role==='student')return true;
    return coreMode()==='local'||document.body.classList.contains('student-desktop');
  };
  const cloudStudent=()=>currentUser()?.role==='student'&&coreMode()==='cloud'&&typeof db!=='undefined'&&!!db;
  const uid=()=>String(currentUser()?.uid||'').trim();
  const toast=(message,error=false)=>typeof showToast==='function'?showToast(message,error):undefined;
  const h=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const todayIso=()=>{try{return typeof today==='function'?today():new Date().toISOString().slice(0,10);}catch(error){return new Date().toISOString().slice(0,10);}};
  const formatDate=value=>{const raw=iso(value);if(!raw)return'—';const [year,month,day]=raw.split('-');return`${day}/${month}/${year}`;};
  const formatMoney=cents=>(Math.max(0,Number(cents)||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const planLabel=(value,months=0)=>value==='custom'?`AJUSTÁVEL · ${Number(months)||1}M`:value==='annual'?'ANUAL':value==='semiannual'?'SEMESTRAL':'TRIMESTRAL';
  const dateUtc=value=>{const raw=iso(value);if(!raw)return null;const [year,month,day]=raw.split('-').map(Number);return new Date(Date.UTC(year,month-1,day));};
  const dayDiff=(left,right)=>{const a=dateUtc(left),b=dateUtc(right);return a&&b?Math.round((b-a)/86400000):null;};
  function paymentStatus(record){
    const days=dayDiff(todayIso(),record?.nextDueDate);
    if(days===null)return{kind:'neutral',label:'SEM VENCIMENTO'};
    if(days<0)return{kind:'late',label:`ATRASADO ${Math.abs(days)}D`};
    if(days===0)return{kind:'today',label:'VENCE HOJE'};
    if(days<=7)return{kind:'soon',label:`VENCE EM ${days}D`};
    return{kind:'ok',label:'EM DIA'};
  }

  function injectStyles(){
    if(document.getElementById('tb-student-payments-style'))return;
    const style=document.createElement('style');
    style.id='tb-student-payments-style';
    style.textContent=`
      #screen-student-payments .content{max-width:760px;margin:0 auto;padding-top:16px}
      .tb-student-payments-hero{border:1px solid #43352d;border-radius:11px;background:linear-gradient(150deg,#171311,#0e0d0c 76%);padding:16px;margin-bottom:12px}
      .tb-student-payments-hero span{display:block;color:#9c313b;font:600 8px 'DM Mono',monospace;letter-spacing:1.2px;text-transform:uppercase}
      .tb-student-payments-hero strong{display:block;margin-top:6px;color:#e8ddd5;font:800 27px/1 'Barlow Condensed',sans-serif;letter-spacing:.35px}
      .tb-student-payments-hero p{margin:7px 0 0;color:#81756d;font-size:11px;line-height:1.5}
      .tb-student-payment-card{border:1px solid #45372f;border-radius:11px;background:#0f0e0d;padding:14px}
      .tb-student-payment-status{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid #302721}
      .tb-student-payment-status small{display:block;color:#74685f;font:600 8px 'DM Mono',monospace;letter-spacing:.75px;text-transform:uppercase}
      .tb-student-payment-status strong{display:block;margin-top:4px;color:#eee3db;font:900 24px/1 'Barlow Condensed',sans-serif}
      .tb-student-payment-pill{flex:0 0 auto;border:1px solid #514239;border-radius:999px;background:#161210;color:#a99b91;padding:6px 9px;font:700 8px 'DM Mono',monospace;letter-spacing:.4px}
      .tb-student-payment-pill.ok{border-color:rgba(34,197,94,.32);color:#8cdaa7;background:rgba(34,197,94,.055)}
      .tb-student-payment-pill.soon,.tb-student-payment-pill.today{border-color:rgba(245,158,11,.34);color:#e5b56c;background:rgba(245,158,11,.05)}
      .tb-student-payment-pill.late{border-color:rgba(225,29,72,.42);color:#ff788e;background:rgba(225,29,72,.06)}
      .tb-student-payment-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
      .tb-student-payment-metric{border:1px solid #302823;border-radius:8px;background:#11100f;padding:11px}
      .tb-student-payment-metric span{display:block;color:#71665f;font:600 7px 'DM Mono',monospace;letter-spacing:.65px;text-transform:uppercase}
      .tb-student-payment-metric strong{display:block;margin-top:5px;color:#d7cbc2;font:800 17px 'Barlow Condensed',sans-serif;overflow-wrap:anywhere}
      .tb-student-payment-private{margin-top:11px;padding:10px 11px;border:1px solid #302822;border-radius:8px;background:#0c0b0a;color:#746a63;font-size:10px;line-height:1.5}
      .tb-student-payment-empty{padding:22px 14px;border:1px dashed #40352e;border-radius:10px;background:#0e0d0c;text-align:center;color:#786d65;font-size:11px;line-height:1.5}
      .tb-student-payment-empty strong{display:block;margin-bottom:5px;color:#cbbdb3;font:800 18px 'Barlow Condensed',sans-serif}
      .tb-student-payment-retry{margin-top:12px;border:1px solid #5b4037;border-radius:8px;background:#19110f;color:#d9c7bb;padding:9px 11px;font:700 8px 'DM Mono',monospace;cursor:pointer}
      @media(max-width:520px){.tb-student-payment-grid{grid-template-columns:1fr}.tb-student-payment-status{align-items:flex-start;flex-direction:column}.tb-student-payment-pill{align-self:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function ensureScreen(){
    let screen=document.getElementById('screen-student-payments');
    if(screen)return screen;
    const app=document.getElementById('app');if(!app)return null;
    screen=document.createElement('div');screen.className='screen';screen.id='screen-student-payments';
    screen.innerHTML=`<div class="header"><button class="btn-icon" type="button" onclick="goHome()" aria-label="Voltar ao início">←</button><div class="header-title">PAGAMENTOS</div><button class="btn-icon ghost" type="button" onclick="TeamBullsStudentPayments.refresh()" aria-label="Atualizar pagamentos" title="Atualizar">↻</button></div><div class="content"><section class="tb-student-payments-hero"><span>ÁREA FINANCEIRA DO ALUNO</span><strong>Seus pagamentos</strong><p>Consulte o plano registrado, o último valor informado e a próxima data de pagamento.</p></section><div id="tb-student-payment-body"><div class="tb-student-payment-empty">Carregando...</div></div></div>`;
    app.appendChild(screen);return screen;
  }

  function paymentsIcon(){return'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h8"/></svg>';}
  function setPaymentsActive(){document.querySelectorAll('.tb-v17-hotbar button').forEach(button=>button.classList.toggle('is-active',button.dataset.hotbar==='payments'));}

  function patchHotbar(){
    if(!studentContext())return false;
    const nav=document.querySelector('.tb-v17-hotbar');if(!nav)return false;
    const diet=nav.querySelector('[data-hotbar="diet"]');
    if(diet){diet.setAttribute('aria-label','SUPRIMENTOS');diet.title='SUPRIMENTOS';const label=diet.querySelector('span');if(label)label.textContent='SUPRIMENTOS';}
    nav.querySelector('[data-hotbar="supplements"]')?.remove();
    let payments=nav.querySelector('[data-hotbar="payments"]');
    if(!payments){
      payments=document.createElement('button');payments.type='button';payments.dataset.hotbar='payments';payments.setAttribute('aria-label','PAGAMENTOS');payments.title='PAGAMENTOS';payments.innerHTML=paymentsIcon()+'<span>PAGAM.</span>';payments.addEventListener('click',()=>openPayments());
      const options=nav.querySelector('[data-hotbar="options"]');if(options)nav.insertBefore(payments,options);else nav.appendChild(payments);
    }
    return true;
  }

  function renderLoading(){const host=document.getElementById('tb-student-payment-body');if(host)host.innerHTML='<div class="tb-student-payment-empty">Atualizando seus dados de pagamento...</div>';}
  function renderOffline(){const host=document.getElementById('tb-student-payment-body');if(host)host.innerHTML='<div class="tb-student-payment-empty"><strong>Conta online necessária</strong>Os pagamentos ficam disponíveis quando sua conta do Team Bulls está conectada à nuvem.</div>';}
  function renderEmpty(){const host=document.getElementById('tb-student-payment-body');if(host)host.innerHTML='<div class="tb-student-payment-empty"><strong>Nenhum pagamento sincronizado</strong>Seu treinador ainda não possui um pagamento disponível nesta área.</div>';}
  function renderError(){const host=document.getElementById('tb-student-payment-body');if(host)host.innerHTML='<div class="tb-student-payment-empty"><strong>Não foi possível carregar</strong>Tente novamente quando a conexão estiver estável.<br><button class="tb-student-payment-retry" type="button" onclick="TeamBullsStudentPayments.refresh()">TENTAR NOVAMENTE</button></div>';}
  function renderRecord(record){
    const host=document.getElementById('tb-student-payment-body');if(!host)return;
    const state=paymentStatus(record);
    host.innerHTML=`<section class="tb-student-payment-card"><div class="tb-student-payment-status"><div><small>ÚLTIMO PAGAMENTO REGISTRADO</small><strong>${h(formatMoney(record.amountCents))}</strong></div><span class="tb-student-payment-pill ${h(state.kind)}">${h(state.label)}</span></div><div class="tb-student-payment-grid"><div class="tb-student-payment-metric"><span>PLANO</span><strong>${h(planLabel(record.planType,record.durationMonths))}</strong></div><div class="tb-student-payment-metric"><span>PRÓXIMO PAGAMENTO</span><strong>${h(formatDate(record.nextDueDate))}</strong></div><div class="tb-student-payment-metric"><span>VIGÊNCIA INICIADA</span><strong>${h(formatDate(record.validFrom))}</strong></div><div class="tb-student-payment-metric"><span>SITUAÇÃO</span><strong>${h(state.label)}</strong></div></div><div class="tb-student-payment-private">Esta é uma visualização somente leitura dos seus próprios dados. Observações administrativas e arquivos internos do treinador não são exibidos.</div></section>`;
  }

  async function readRecord(force=false){
    if(!cloudStudent()||!uid())return null;
    if(!force&&cachedRecord)return cachedRecord;
    if(loading)return loading;
    loading=(async()=>{
      const ref=db.collection(COLLECTION).doc(uid());
      const snap=typeof cloudGet==='function'?await cloudGet(ref,'pagamentos do aluno'):await ref.get();
      cachedRecord=snap.exists?{...snap.data(),id:snap.id}:null;
      return cachedRecord;
    })().finally(()=>{loading=null;});
    return loading;
  }

  async function refresh(){
    ensureScreen();patchHotbar();setPaymentsActive();
    if(!cloudStudent()){renderOffline();return false;}
    renderLoading();
    try{const record=await readRecord(true);if(record)renderRecord(record);else renderEmpty();return true;}catch(error){console.warn('[Team Bulls] Pagamentos do aluno indisponíveis',error);renderError();return false;}
  }

  async function openPayments(){
    if(!studentContext())return false;
    ensureScreen();patchHotbar();
    if(typeof showScreen==='function')showScreen('screen-student-payments');else document.getElementById('screen-student-payments')?.classList.add('active');
    requestAnimationFrame(()=>setPaymentsActive());
    await refresh();requestAnimationFrame(()=>setPaymentsActive());return true;
  }

  function patchSoon(attempt=0){
    if(patchHotbar()||attempt>=20)return;
    clearTimeout(patchTimer);patchTimer=setTimeout(()=>patchSoon(attempt+1),attempt<5?80:220);
  }
  function install(){injectStyles();ensureScreen();patchSoon();}

  window.TeamBullsStudentPayments=Object.freeze({version:VERSION,open:openPayments,refresh,patchHotbar});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-student-runtime-ready',()=>patchSoon());
  window.addEventListener('pageshow',()=>patchSoon(),{passive:true});
})();

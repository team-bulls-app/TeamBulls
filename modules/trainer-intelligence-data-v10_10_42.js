/* Team Bulls v10.10.42 — camada de dados compartilhada para inteligência do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_INTELLIGENCE_DATA_101042__)return;
  window.__TEAM_BULLS_TRAINER_INTELLIGENCE_DATA_101042__=true;

  const VERSION='10.10.42-inteldata1';
  const TTL_MS=120000;
  const CONCURRENCY=5;
  let rosterCache={uid:'',at:0,items:[]};
  let globalCache={uid:'',at:0,activity:[],payments:[]};
  const shallowCache=new Map();
  const deepCache=new Map();

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const trainerUid=()=>trainer()?String(CURRENT_USER?.uid||''):'';
  const now=()=>Date.now();
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const todayIso=()=>{try{if(typeof today==='function')return today();}catch(error){}const d=new Date(),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};
  const addDays=(value,days)=>{try{if(typeof addDaysIso==='function')return addDaysIso(value,days);}catch(error){}const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));if(!m)return todayIso();const d=new Date(+m[1],+m[2]-1,+m[3],12);d.setDate(d.getDate()+Number(days||0));return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const dayDiff=(a,b)=>{const parse=value=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));return m?new Date(+m[1],+m[2]-1,+m[3],12).getTime():0;},x=parse(a),y=parse(b);return x&&y?Math.round((y-x)/86400000):0;};
  const stamp=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.seconds)return Number(value.seconds)*1000;const n=Number(value);return Number.isFinite(n)?n:0;}catch(error){return 0;}};
  const clone=value=>{try{return structuredClone(value);}catch(error){try{return JSON.parse(JSON.stringify(value));}catch(inner){return value;}}};
  const fresh=entry=>entry&&now()-Number(entry.at||0)<TTL_MS;

  async function mapLimit(items,limit,worker){
    const out=new Array(items.length);let cursor=0;
    const run=async()=>{while(true){const index=cursor++;if(index>=items.length)return;out[index]=await worker(items[index],index);}};
    await Promise.all(Array.from({length:Math.min(Math.max(1,limit),items.length||1)},run));return out;
  }
  async function getRef(reference,label){return typeof cloudGet==='function'?cloudGet(reference,label):reference.get();}

  function clear(){rosterCache={uid:'',at:0,items:[]};globalCache={uid:'',at:0,activity:[],payments:[]};shallowCache.clear();deepCache.clear();}

  async function loadRoster(force=false){
    const uid=trainerUid();if(!uid)return[];
    if(!force&&rosterCache.uid===uid&&fresh(rosterCache))return clone(rosterCache.items);
    const snap=await getRef(db.collection('users').where('trainerId','==',uid),'alunos para central inteligente');
    const items=(snap.docs||[]).map(doc=>({...doc.data(),uid:doc.id})).filter(item=>item.role==='student'&&String(item.trainerId||'')===uid).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
    rosterCache={uid,at:now(),items};return clone(items);
  }

  async function loadGlobal(force=false){
    const uid=trainerUid();if(!uid)return{activity:[],payments:[]};
    if(!force&&globalCache.uid===uid&&fresh(globalCache))return clone(globalCache);
    const [activitySnap,paymentSnap]=await Promise.all([
      getRef(db.collection('trainerActivity').doc(uid).collection('events').limit(200),'eventos recentes do treinador').catch(()=>null),
      getRef(db.collection('trainerBilling').doc(uid).collection('payments').limit(500),'pagamentos para radar').catch(()=>null)
    ]);
    const activity=(activitySnap?.docs||[]).map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>stamp(b.createdAt)-stamp(a.createdAt)||String(b.submittedDate||'').localeCompare(String(a.submittedDate||'')));
    const payments=(paymentSnap?.docs||[]).map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>stamp(b.createdAt)-stamp(a.createdAt));
    globalCache={uid,at:now(),activity,payments};return clone(globalCache);
  }

  function latestPaymentFor(studentId,payments=[]){return payments.filter(item=>String(item.studentId)===String(studentId)).sort((a,b)=>stamp(b.createdAt)-stamp(a.createdAt)||String(b.validFrom||'').localeCompare(String(a.validFrom||'')))[0]||null;}
  function latestActivityFor(studentId,activity=[],type=''){return activity.filter(item=>String(item.studentId)===String(studentId)&&(!type||item.type===type)).sort((a,b)=>stamp(b.createdAt)-stamp(a.createdAt)||String(b.submittedDate||'').localeCompare(String(a.submittedDate||'')))[0]||null;}

  function weeklyDue(schedule){
    if(!schedule||schedule.enabled===false||!iso(schedule.nextDueDate))return'';
    const interval=Math.max(1,Math.min(90,Math.trunc(Number(schedule.intervalDays)||7))),completed=iso(schedule.organizerWeeklyCompletedThrough),nowDate=todayIso();let due=String(schedule.nextDueDate),guard=0;
    if(completed){while(due<=completed&&guard++<1200)due=addDays(due,interval);return due;}
    if(due>nowDate)return due;
    while(guard++<1200){const next=addDays(due,interval);if(next>nowDate)break;due=next;}return due;
  }
  function protocolState(schedule,date=todayIso()){
    if(!schedule||!iso(schedule.startDate))return null;
    try{if(typeof v109ProtocolState==='function')return v109ProtocolState({...schedule,_exists:true},date);}catch(error){}
    const intervalWeeks=Math.max(1,Math.min(52,Math.trunc(Number(schedule.intervalWeeks)||4))),days=Math.max(0,dayDiff(schedule.startDate,date)),elapsed=date<schedule.startDate?0:Math.floor(days/(intervalWeeks*7)),last=Math.max(0,Math.trunc(Number(schedule.lastCompletedCycle)||0)),pending=elapsed>last?elapsed:0,nextCycle=pending||Math.max(last+1,elapsed+1),due=addDays(schedule.startDate,nextCycle*intervalWeeks*7);
    return{intervalWeeks,elapsedCycle:elapsed,lastCompletedCycle:last,pendingCycle:pending,pending:pending>0,nextDueDate:due,weekNumber:date<schedule.startDate?0:Math.floor(days/7)+1};
  }

  async function loadShallow(studentId,force=false){
    const uid=trainerUid(),key=String(studentId||'');if(!uid||!key)return null;
    const cached=shallowCache.get(key);if(!force&&cached?.trainerUid===uid&&fresh(cached))return clone(cached.value);
    const [checkinDoc,protocolDoc]=await Promise.all([
      getRef(db.collection('checkinSchedules').doc(key),'agenda semanal para radar').catch(()=>null),
      getRef(db.collection('protocolReviewSchedules').doc(key),'agenda mensal para radar').catch(()=>null)
    ]);
    const value={studentId:key,checkinSchedule:checkinDoc?.exists?{...checkinDoc.data(),studentId:key}:null,protocolSchedule:protocolDoc?.exists?{...protocolDoc.data(),studentId:key}:null};
    shallowCache.set(key,{trainerUid:uid,at:now(),value});return clone(value);
  }

  async function loadDashboard(force=false){
    const [students,global]=await Promise.all([loadRoster(force),loadGlobal(force)]),active=students.filter(item=>item.status!=='inactive');
    const rows=await mapLimit(active,CONCURRENCY,async student=>({student,...await loadShallow(student.uid,force)}));
    return{students,active,activity:global.activity,payments:global.payments,rows};
  }

  async function loadDeepStudent(studentId,force=false){
    const uid=trainerUid(),key=String(studentId||'');if(!uid||!key)return null;
    const cached=deepCache.get(key);if(!force&&cached?.trainerUid===uid&&fresh(cached))return clone(cached.value);
    const [shallow,global,sessionsSnap,checkinsSnap,feedbackSnap]=await Promise.all([
      loadShallow(key,force),loadGlobal(force),
      getRef(db.collection('sessions').where('userId','==',key),'histórico de treino para análise').catch(()=>null),
      getRef(db.collection('weeklyCheckins').where('studentId','==',key),'relatórios para análise').catch(()=>null),
      getRef(db.collection('feedback').where('studentId','==',key),'feedbacks para análise').catch(()=>null)
    ]);
    const sessions=(sessionsSnap?.docs||[]).map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.id).localeCompare(String(a.id)));
    const checkins=(checkinsSnap?.docs||[]).map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>String(b.submittedDate||b.dueDate||'').localeCompare(String(a.submittedDate||a.dueDate||''))||stamp(b.createdAt)-stamp(a.createdAt));
    const feedbacks=(feedbackSnap?.docs||[]).map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>stamp(b.createdAt)-stamp(a.createdAt));
    const value={studentId:key,...shallow,activity:global.activity.filter(item=>String(item.studentId)===key),payments:global.payments.filter(item=>String(item.studentId)===key),sessions,checkins,feedbacks};
    deepCache.set(key,{trainerUid:uid,at:now(),value});return clone(value);
  }

  function paymentState(record){
    if(!record||!iso(record.nextDueDate))return{kind:'none',days:null};const days=dayDiff(todayIso(),record.nextDueDate);if(days<0)return{kind:'late',days};if(days===0)return{kind:'today',days};if(days<=7)return{kind:'soon',days};return{kind:'ok',days};
  }

  function analyze(row,global={activity:[],payments:[]},deep=null){
    const student=row?.student||{},sid=String(student.uid||row?.studentId||''),todayDate=todayIso(),weekly=weeklyDue(row?.checkinSchedule),monthly=protocolState(row?.protocolSchedule),lastActivity=latestActivityFor(sid,global.activity,'weekly_checkin'),payment=latestPaymentFor(sid,global.payments),pay=paymentState(payment),signals=[];
    const weeklyDays=weekly?dayDiff(weekly,todayDate):null,monthlyDays=monthly?.nextDueDate?dayDiff(monthly.nextDueDate,todayDate):null,lastReport=iso(lastActivity?.submittedDate),reportAge=lastReport?dayDiff(lastReport,todayDate):null;
    if(!row?.checkinSchedule)signals.push({key:'weekly_missing',points:12,label:'Sem programação semanal',action:'Configurar a agenda semanal'});
    else if(weeklyDays>0)signals.push({key:'weekly_overdue',points:35,label:`Atualização semanal atrasada ${weeklyDays}d`,action:'Revisar atualização semanal'});
    else if(weeklyDays!==null&&weeklyDays>=-2)signals.push({key:'weekly_soon',points:8,label:weeklyDays===0?'Atualização semanal hoje':'Atualização semanal próxima',action:'Preparar revisão semanal'});
    if(!row?.protocolSchedule)signals.push({key:'monthly_missing',points:12,label:'Sem ciclo mensal configurado',action:'Configurar atualização completa'});
    else if(monthly?.pending)signals.push({key:'monthly_overdue',points:40,label:`Atualização completa pendente${monthlyDays>0?` há ${monthlyDays}d`:''}`,action:'Executar atualização completa'});
    else if(monthlyDays!==null&&monthlyDays>=-3)signals.push({key:'monthly_soon',points:8,label:'Atualização completa próxima',action:'Preparar atualização completa'});
    if(pay.kind==='late')signals.push({key:'payment_late',points:20,label:`Pagamento atrasado ${Math.abs(pay.days)}d`,action:'Verificar pagamento'});
    else if(pay.kind==='today'||pay.kind==='soon')signals.push({key:'payment_soon',points:5,label:pay.kind==='today'?'Pagamento vence hoje':`Pagamento vence em ${pay.days}d`,action:'Acompanhar pagamento'});
    if(reportAge!==null&&reportAge>10)signals.push({key:'report_gap',points:15,label:`Último relatório há ${reportAge}d`,action:'Verificar adesão e contato'});
    const newReport=global.activity.some(item=>String(item.studentId)===sid&&item.read!==true);
    if(newReport)signals.push({key:'new_report',points:6,label:'Novo relatório aguardando leitura',action:'Ler relatório recebido'});
    if(deep){
      const lastSession=deep.sessions?.[0]?.date&&iso(deep.sessions[0].date)?deep.sessions[0].date:'',sessionAge=lastSession?dayDiff(lastSession,todayDate):null,unread=deep.feedbacks?.filter(item=>item.read!==true).length||0;
      if(sessionAge===null)signals.push({key:'no_training',points:20,label:'Sem sessões registradas',action:'Checar início do treinamento'});
      else if(sessionAge>9)signals.push({key:'training_gap',points:25,label:`Sem treino registrado há ${sessionAge}d`,action:'Investigar ausência de treino'});
      else if(sessionAge>6)signals.push({key:'training_gap',points:12,label:`Último treino há ${sessionAge}d`,action:'Checar frequência de treino'});
      if(unread>0)signals.push({key:'feedback_unread',points:Math.min(12,4+unread*2),label:`${unread} feedback${unread===1?'':'s'} ainda não lido${unread===1?'':'s'}`,action:'Avaliar necessidade de contato'});
    }
    const score=Math.min(100,signals.reduce((sum,item)=>sum+item.points,0)),urgent=signals.some(item=>['weekly_overdue','monthly_overdue'].includes(item.key));let light='green';if(urgent||score>=50)light='red';else if(newReport&&score<35)light='blue';else if(score>=20)light='yellow';
    const sorted=signals.slice().sort((a,b)=>b.points-a.points),nextAction=sorted[0]?.action||'Manter acompanhamento normal';
    return{studentId:sid,student,score,light,signals:sorted,nextAction,weeklyDue:weekly,monthlyState:monthly,payment,paymentState:pay,lastReportDate:lastReport,newReport};
  }

  function weekWindow(offset=0){const end=addDays(todayIso(),-offset*7),start=addDays(end,-6);return{start,end};}
  function inWindow(date,window){return iso(date)&&date>=window.start&&date<=window.end;}
  function summary(rows,global){
    const analyses=rows.map(row=>analyze(row,global)),thisWeek=weekWindow(0),previous=weekWindow(1),weeklyEvents=global.activity.filter(item=>item.type==='weekly_checkin'),reportsNow=weeklyEvents.filter(item=>inWindow(item.submittedDate,thisWeek)).length,reportsPrev=weeklyEvents.filter(item=>inWindow(item.submittedDate,previous)).length;
    return{active:rows.length,reportsNow,reportsPrev,reportsDelta:reportsNow-reportsPrev,red:analyses.filter(item=>item.light==='red').length,yellow:analyses.filter(item=>item.light==='yellow').length,blue:analyses.filter(item=>item.light==='blue').length,weeklyOverdue:analyses.filter(item=>item.signals.some(signal=>signal.key==='weekly_overdue')).length,monthlyOverdue:analyses.filter(item=>item.signals.some(signal=>signal.key==='monthly_overdue')).length,paymentsLate:analyses.filter(item=>item.paymentState.kind==='late').length,analyses};
  }

  function currentCycleBounds(schedule){const state=protocolState(schedule);if(!state)return null;const intervalDays=state.intervalWeeks*7,cycle=Math.max(1,state.pendingCycle||state.lastCompletedCycle+1||1),start=addDays(schedule.startDate,(cycle-1)*intervalDays),end=addDays(start,intervalDays-1);return{cycle,start,end,state};}

  function invalidateStudent(studentId){const key=String(studentId||'');if(key){shallowCache.delete(key);deepCache.delete(key);}}

  function installLogout(){if(typeof confirmLogout!=='function'||confirmLogout.__tbIntelligenceData)return;const base=confirmLogout;const wrapped=function(){clear();return base.apply(this,arguments);};wrapped.__tbIntelligenceData=true;wrapped.__tbBase=base;confirmLogout=wrapped;}
  installLogout();window.addEventListener('team-bulls-runtime-ready',installLogout);

  window.TeamBullsTrainerIntelligenceData=Object.freeze({version:VERSION,loadRoster,loadGlobal,loadShallow,loadDashboard,loadDeepStudent,analyze,summary,weeklyDue,protocolState,currentCycleBounds,latestPaymentFor,latestActivityFor,dayDiff,addDays,todayIso,invalidateStudent,clear});
})();

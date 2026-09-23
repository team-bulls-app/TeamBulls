/* Relatórios completos do ciclo: o treinador prepara o pedido; a data libera a resposta. */
'use strict';
(()=>{
  if(window.TeamBullsMonthlyReports)return;
  const VERSION='10.10.59-monthly1';
  const schedules=new Map();
  let syncPromise=null,syncTrainer='',syncedTrainer='',syncedAt=0;
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const monthly=report=>report?.reportType==='monthly';
  const trainer=()=>CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db&&auth?.currentUser?.uid===CURRENT_USER.uid;
  const student=uid=>CURRENT_USER?.role==='student'&&CURRENT_USER.uid===uid&&auth?.currentUser?.uid===uid&&MODE==='cloud';
  const read=(ref,label)=>withTimeout(ref.get({source:'server'}),10000,label);
  const message=(text,error=false)=>{if(typeof showToast==='function')showToast(text,error);};

  function cycle(schedule){
    if(!schedule||!iso(schedule.startDate)||!schedule.studentId||!schedule.trainerId)return null;
    const weeks=Math.max(1,Math.min(52,Math.trunc(Number(schedule.intervalWeeks)||4)));
    const anchor=iso(schedule.lastCompletedDate)?schedule.lastCompletedDate:schedule.startDate;
    const steps=iso(schedule.lastCompletedDate)?1:Math.max(1,Math.trunc(Number(schedule.lastCompletedCycle)||0)+1);
    const dueDate=addDaysIso(anchor,weeks*7*steps);
    const key=JSON.stringify([schedule.trainerId,schedule.studentId,schedule.startDate,weeks,anchor,dueDate]);
    return{key,dueDate,id:stableEntityId('monthly-report',key)};
  }
  function remember(uid,schedule){schedules.set(uid,schedule);}
  function status(report,schedule=schedules.get(report?.studentId),date=today()){
    if(report?.answered===true)return'answered';
    if(!monthly(report))return'pending';
    if(schedule===undefined)return trainer()&&iso(report.dueDate)?(report.dueDate<=date?'pending':'scheduled'):'loading';
    const current=cycle(schedule);
    if(!current||report.monthlyCycleKey!==current.key||report.dueDate!==current.dueDate||report.id!==current.id)return'superseded';
    return current.dueDate<=date?'pending':'scheduled';
  }
  async function loadSchedule(uid){
    if(!student(uid)&&!trainer())throw new Error('A sessão mudou. Entre novamente.');
    const actor=CURRENT_USER.uid;
    const doc=await read(db.collection('protocolReviewSchedules').doc(uid),'confirmar ciclo mensal');
    if(CURRENT_USER?.uid!==actor||auth?.currentUser?.uid!==actor)throw new Error('A sessão mudou durante a consulta.');
    const schedule=doc.exists?{...doc.data(),studentId:uid}:null;
    remember(uid,schedule);return schedule;
  }
  async function pending(rows,uid){
    if(rows.some(monthly))await loadSchedule(uid);
    return rows.filter(report=>report.answered!==true&&status(report)==='pending');
  }
  async function refreshVisibleReports(uid){
    if(!student(uid)||document.querySelector('.screen.active')?.id!=='screen-my-quest')return;
    try{
      const snap=await read(db.collection('questionnaires').where('studentId','==',uid),'atualizar relatórios');
      if(!student(uid)||document.querySelector('.screen.active')?.id!=='screen-my-quest')return;
      MY_QUEST_CACHE=snap.docs.map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      renderQuestList(MY_QUEST_CACHE,'my-quest-list','my-quest-empty',false);
    }catch(error){message('Não foi possível atualizar a lista de relatórios. Abra a aba novamente.',true);}
  }
  async function assertAvailable(report){
    if(!monthly(report))return true;
    const uid=String(report.studentId||'');
    if(!student(uid)||report.trainerId!==CURRENT_USER.trainerId)throw new Error('Este relatório não pertence à sua sessão atual.');
    const schedule=await loadSchedule(uid),state=status(report,schedule);
    if(state==='scheduled')throw new Error('O relatório mensal será liberado em '+fmt(report.dueDate)+'.');
    if(state!=='pending')throw new Error('Este ciclo foi atualizado ou o relatório já foi enviado. Abra novamente a lista de relatórios.');
    return true;
  }

  async function findRequest(uid,id){
    // Consultar a coleção evita GET de documento inexistente, negado pelas Rules 28.
    const snap=await read(db.collection('questionnaires').where('studentId','==',uid).where('reportType','==','monthly'),'confirmar pedido mensal');
    const doc=snap.docs.find(row=>row.id===id);return doc?{...doc.data(),id:doc.id}:null;
  }
  function sameCycle(report,current,uid,trainerUid){
    return monthly(report)&&report.id===current.id&&report.studentId===uid&&report.trainerId===trainerUid&&report.monthlyCycleKey===current.key&&report.dueDate===current.dueDate;
  }
  async function prepare(uid){
    if(!trainer())throw new Error('A preparação do relatório exige a sessão do treinador.');
    const trainerUid=CURRENT_USER.uid,schedule=await loadSchedule(uid);
    if(!schedule)return null;
    if(schedule.studentId!==uid||schedule.trainerId!==trainerUid)throw new Error('Ciclo fora da carteira deste treinador.');
    const current=cycle(schedule);if(!current)return null;
    const existing=await findRequest(uid,current.id);
    if(existing){
      if(!sameCycle(existing,current,uid,trainerUid))throw new Error('Identidade do relatório mensal divergente.');
      return existing;
    }
    const {questions,sectionAt}=buildWeeklyCheckinQuestions();
    if(!questions.length||questions.length>60)throw new Error('Perguntas do relatório completo indisponíveis.');
    const fresh=await loadSchedule(uid);
    if(!trainer()||CURRENT_USER.uid!==trainerUid||cycle(fresh)?.key!==current.key)throw new Error('O ciclo mudou durante a preparação. Tente sincronizar novamente.');
    const payload={studentId:uid,trainerId:trainerUid,title:'Relatório mensal completo',reportType:'monthly',requestMode:'full',
      monthlyCycleKey:current.key,dueDate:current.dueDate,questions,sectionAt,answers:null,answered:false,
      requiresPhotos:true,requiredPhotoCount:6,allQuestionsRequired:true,createdAt:firebase.firestore.FieldValue.serverTimestamp()};
    try{
      // Rules 28 permitem ao treinador criar, mas NÃO atualizar questionários.
      // Mesmo duas abas concorrentes não conseguem sobrescrever respostas/histórico.
      await cloudWrite(db.collection('questionnaires').doc(current.id).set(payload),'preparar relatório mensal');
    }catch(error){
      const confirmed=await findRequest(uid,current.id).catch(()=>null);
      if(!sameCycle(confirmed,current,uid,trainerUid))throw error;
      return confirmed;
    }
    return{...payload,id:current.id};
  }
  function ensureForStudent(uid){
    // Cada chamada relê o ciclo. Uma gravação de nova agenda não pode herdar
    // a Promise de preparação do ciclo anterior. A identidade/Rules deduplicam.
    return prepare(uid);
  }
  async function sync(){
    if(!trainer())return false;
    const trainerUid=CURRENT_USER.uid;
    if(syncPromise)return syncTrainer===trainerUid?syncPromise:syncPromise.then(()=>sync());
    syncTrainer=trainerUid;
    syncPromise=(async()=>{
      // Rules 28 comprovam a carteira por role + trainerId em users. Os
      // cronogramas são lidos pelo UID de cada aluno, sem listagem global.
      const snap=await read(db.collection('users').where('trainerId','==',trainerUid).where('role','==','student'),'alunos dos ciclos mensais');
      const active=snap.docs.filter(doc=>doc.data().status==='active');
      let failures=0;
      // Sem limite de carteira e sem polling. Só cria o pedido do ciclo atual,
      // inclusive futuro, para dispensar a presença do treinador no vencimento.
      for(let offset=0;offset<active.length;offset+=3){
        if(!trainer()||CURRENT_USER.uid!==trainerUid)return false;
        await Promise.all(active.slice(offset,offset+3).map(async doc=>{
          try{await ensureForStudent(doc.id);}catch(error){failures++;console.warn('[Team Bulls] pedido mensal não preparado',error?.code||error?.message);}
        }));
      }
      if(failures){message('Não foi possível preparar '+failures+' relatório(s) mensal(is). Reabra o app conectado para tentar novamente.',true);return false;}
      syncedTrainer=trainerUid;syncedAt=Date.now();return true;
    })().catch(error=>{console.warn('[Team Bulls] sincronização dos ciclos mensais',error?.code||error?.message);message('Não foi possível preparar os relatórios mensais. Reabra o app conectado para tentar novamente.',true);return false;}).finally(()=>{syncPromise=null;});
    return syncPromise;
  }
  function resume(){
    if(trainer()&&(syncedTrainer!==CURRENT_USER.uid||Date.now()-syncedAt>60000))sync();
    else if(CURRENT_USER?.role==='student')window.TeamBullsStudentRequestRealtime?.recompute?.('monthly-ready');
  }
  window.TeamBullsMonthlyReports=Object.freeze({version:VERSION,cycle,status,remember,pending,loadSchedule,assertAvailable,ensureForStudent,sync,refreshVisibleReports});
  window.addEventListener('team-bulls-runtime-ready',resume);
  window.addEventListener('team-bulls-runtime-state',resume);
  window.addEventListener('team-bulls-intelligence-ready',resume);
  window.addEventListener('pageshow',resume,{passive:true});
  window.addEventListener('online',resume,{passive:true});
  resume();
})();

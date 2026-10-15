import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const canonical=read('modules/trainer-canonical-inbox-v10_10_58.js');
const hub=read('modules/trainer-inbox-payments-v10_10_12.js');
const core=read('app_v10_10_9_core.js');
const guard=read('modules/trainer-canonical-context-guard-v10_10_42.js');
function between(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
// Read the double-quoted HTML attribute before decoding entities, as the browser
// does. JSON quotes must never terminate onclick before its argument is parsed.
const decode=value=>value.replace(/&(amp|quot|lt|gt|#39);/g,(_,key)=>({amp:'&',quot:'"',lt:'<',gt:'>','#39':"'"}[key]));
const handlers=html=>[...html.matchAll(/\bonclick="([^"]*)"/g)].map(match=>decode(match[1]));
const quiet={warn(){},error(){}};
function fixture(source,isCanonical){
  const nodes=new Map(),opened=[],reads=[],marked=[],errors=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:''});return nodes.get(id);};
  const rows=[
    {id:'w-weekly-1',sourceId:'weekly-1',studentId:'student-selected',type:'weekly_checkin',submittedDate:'2026-09-20',read:false},
    {id:'q-full-1',sourceId:'full-1',studentId:'student-selected',type:'questionnaire',submittedDate:'2026-09-23',read:false}
  ];
  const docs=new Map(rows.map(row=>[row.sourceId,{id:row.sourceId,studentId:row.studentId,answered:true,requestMode:'full',photoIds:[],questions:['Como foi a semana?'],answers:['Resposta de teste'],submittedDate:row.submittedDate}]));
  const context=vm.createContext({console:quiet,CURRENT_USER:{uid:'trainer-a',role:'trainer'},MODE:'cloud',VIEW_STUDENT:{uid:'student-previous'},
    document:{getElementById:node,querySelector:()=>({id:'screen-trainer-inbox'}),querySelectorAll:()=>[]},
    items:rows,activityEvents:rows,protocolDue:[],inboxFilter:'all',WEEKLY_CHECKINS:[],TS_QUEST_CACHE:[],MY_QUEST_CACHE:[],
    db:{collection:collection=>({doc:id=>({get:async()=>{reads.push([collection,id]);return {id,exists:docs.has(id),data:()=>docs.get(id)};}})})},
    trainer:()=>true,markRead:async row=>marked.push(row.id),markEventRead:async id=>marked.push(id),
    timeout:async task=>task,cloudGet:ref=>ref.get(),questionnaireComplete:report=>report.answered===true,
    updateBadges(){},ensureUi:()=>true,studentName:()=> 'Aluno "Teste" & Cia',fmtDate:value=>value,fmt:value=>value,
    reportSection:()=>node('canonical-section'),currentFilter:()=>context.inboxFilter,
    openModal:id=>opened.push(id),showToast:message=>errors.push(message),toast:message=>errors.push(message),
    fetchWeeklyCheckins:async uid=>{reads.push(['profile-weekly',uid]);return[];},
    v109ReportMode:report=>report.requestMode,v109ModeRequiresPhotos:()=>true,v109ModeRequiresAnswers:()=>true,v109ReportModeLabel:()=> 'Relatório completo',
    setTimeout(){},addEventListener(){},esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
  context.window=context;
  const helpers=source.split('\n').filter(line=>/^  const (h|js)=/.test(line)).join('\n');
  const render=isCanonical?between(source,'  function render(){','  function fullPayload('):between(source,'  function renderInbox(){','  async function refreshInbox(');
  const open=isCanonical?between(source,'  async function open(rowId){','  async function repairMissing('):between(source,'  async function openActivity(id){','  async function openProtocolStudent(');
  vm.runInContext(helpers+render+open,context);
  vm.runInContext(between(core,'async function viewWeeklyCheckin(id){','\n// Tabela de alimentos')+between(core,'viewQuestionnaire=async function(qid,fromTrainer){','\nasync function loadReportSettings('),context);
  vm.runInContext(guard,context);
  if(isCanonical)context.TeamBullsCanonicalTrainerInbox={open:context.open};
  else context.TeamBullsTrainerHub={openActivity:context.openActivity};
  return {context,rows,opened,reads,marked,errors,docs,render(){vm.runInContext(isCanonical?'render()':'renderInbox()',context);return node(isCanonical?'canonical-section':'tb-inbox-body').innerHTML;}};
}

const failures=[];
async function test(name,run){try{await run();console.log('APROVADO — '+name);}catch(error){failures.push(name);console.error('FALHA — '+name+': '+error.message);}}
for(const [name,source,isCanonical] of [['Central canônica',canonical,true],['Central alternativa',hub,false]]){
  await test(name+': HTML do card chega ao modal do semanal e do completo',async()=>{
    const f=fixture(source,isCanonical),html=f.render(),actions=handlers(html);assert.equal(actions.length,2);
    assert.ok(html.includes('Aluno &quot;Teste&quot; &amp; Cia'));
    for(const action of actions)await vm.runInContext(action,f.context);
    assert.deepEqual(f.opened,['modal-weekly-checkin-view','modal-view-quest']);
    assert.equal(f.context.VIEW_STUDENT.uid,'student-previous','Abrir relatório da Central não deve trocar o perfil global.');
    assert.deepEqual(f.reads,[['weeklyCheckins','weekly-1'],['questionnaires','full-1']]);
    assert.deepEqual(f.marked,f.rows.map(row=>row.id));assert.deepEqual(f.errors,[]);
    f.context.inboxFilter='unread';f.rows[0].read=true;
    const filtered=handlers(f.render());assert.equal(filtered.length,1);await vm.runInContext(filtered[0],f.context);
    assert.equal(f.opened.at(-1),'modal-view-quest');
  });
  await test(name+': aspas e entidades no ID não truncam nem executam outro comando',async()=>{
    const f=fixture(source,isCanonical),calls=[];
    f.rows.splice(0,f.rows.length,{...f.rows[0],id:'legacy-"&quot;\'<>\\-);globalThis.injected=true;//'});
    const api=isCanonical?f.context.TeamBullsCanonicalTrainerInbox:f.context.TeamBullsTrainerHub;
    api[isCanonical?'open':'openActivity']=id=>calls.push(id);
    const actions=handlers(f.render());assert.equal(actions.length,1);vm.runInContext(actions[0],f.context);
    assert.deepEqual(calls,[f.rows[0].id]);assert.equal(f.context.injected,undefined);
  });
  await test(name+': documento indisponível mostra erro sem abrir dados antigos',async()=>{
    const f=fixture(source,isCanonical);f.docs.delete('full-1');
    await vm.runInContext(handlers(f.render())[1],f.context);
    assert.equal(f.opened.length,0);assert.equal(f.errors.length,1);
  });
}
await test('Guarda do perfil continua rejeitando semanal pertencente a outro aluno',async()=>{
  const f=fixture(canonical,true);f.context.document.querySelector=()=>({id:'screen-ts-quest'});
  f.context.WEEKLY_CHECKINS=[f.docs.get('weekly-1')];
  await f.context.viewWeeklyCheckin('weekly-1');
  assert.equal(f.opened.length,0);assert.equal(f.errors.length,1);
});
await test('Contexto explícito da Central exige aluno, documento, tela e papel corretos',async()=>{
  for(const invalid of ['student','document','screen','role']){
    const f=fixture(canonical,true);f.context.WEEKLY_CHECKINS=[f.docs.get('weekly-1')];
    if(invalid==='screen')f.context.document.querySelector=()=>({id:'screen-ts-quest'});
    if(invalid==='role')f.context.CURRENT_USER.role='student';
    await f.context.viewWeeklyCheckin(invalid==='document'?'other-id':'weekly-1',{source:'trainer-inbox',studentId:invalid==='student'?'other-student':'student-selected'});
    assert.equal(f.opened.length,0,invalid);assert.equal(f.errors.length,1,invalid);
  }
});
await test('Helper compartilhado preserva argumentos de pagamento e comprovante',async()=>{
  const f=fixture(hub,false),calls=[],person='student-"quoted',receipt='paymentReceipts/a/arquivo "teste".jpg';
  Object.assign(f.context,{students:[{uid:'student-new',name:'Novo'},{uid:person,name:'Teste'}],paymentSearch:'',
    paymentRecords:[{id:'pay-new',studentId:person,validFrom:'2026-09-20',nextDueDate:'2026-12-20',receiptPath:receipt},{id:'pay-old',studentId:person,validFrom:'2026-06-20',receiptPath:receipt}],
    paymentStatus:()=>({kind:'ok',label:'EM DIA'}),formatMoney:()=> 'R$ 100',planLabel:()=> 'Trimestral'});
  f.context.TeamBullsTrainerHub={openPaymentEditor:(...args)=>calls.push(['editor',...args]),openReceipt:(...args)=>calls.push(['receipt',...args])};
  vm.runInContext(between(hub,'  function latestPaymentMap(){','  function startPaymentListener(){'),f.context);
  vm.runInContext('renderPayments()',f.context);
  for(const action of handlers(f.context.document.getElementById('tb-payment-list').innerHTML))vm.runInContext(action,f.context);
  assert.ok(calls.some(call=>call[0]==='editor'&&call[1]===person&&call[2]==='pay-new'));
  assert.ok(calls.some(call=>call[0]==='receipt'&&call[1]===receipt));assert.ok(calls.some(call=>call[1]==='student-new'));
});
if(failures.length)process.exitCode=1;

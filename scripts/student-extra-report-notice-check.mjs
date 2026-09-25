import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('modules/student-home-profile-v10_10_12.js','utf8');
const slice=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to));
const host={innerHTML:'',contains:()=>true};
const modal={open:false,classList:{contains(name){return name==='open'&&modal.open;}}};
const answerModal={open:false,classList:{contains(name){return name==='open'&&answerModal.open;}}};
const button={textContent:'ENVIAR RELATÓRIO',disabled:false,isConnected:true,setAttribute(){},removeAttribute(){}};
const messages=[];
let loads=0,weeklyOpens=0,questionnaireOpens=0,resolveLoad;
const loading=new Promise(resolve=>{resolveLoad=resolve;});
const context={
  notifications:[
    {id:'manual',title:'Relatório extra solicitado',body:'Enviar perguntas e fotos.',type:'relatório semanal',read:false,action:'weekly'},
    {id:'full',title:'Relatório extra pendente',body:'Novo relatório.',type:'relatório',read:false,action:'questionnaire'},
    {id:'message',title:'Mensagem do treinador',body:'Aviso informativo.',type:'aviso',read:false,source:'notification'}
  ],
  noticeActionBusy:false,console,
  esc:value=>String(value??''),fmt:()=>'',
  window:{TeamBullsWeeklyReportIntegrity:{canOpenForm:()=>true},TeamBullsIntelligenceBootstrap:{load:async()=>{loads++;await loading;}}},
  document:{getElementById:id=>id==='tb-notice-list'?host:id==='modal-weekly-checkin'?modal:id==='modal-answer-quest'?answerModal:null,querySelector:()=>button},
  openWeeklyCheckinModal:async()=>{weeklyOpens++;modal.open=true;},
  openAnswerQuestionnaire:async()=>{questionnaireOpens++;answerModal.open=true;},
  showToast:(message,error)=>messages.push({message,error}),
  loadNotifications:async()=>context.notifications,applyNoticeBadge:()=>0,
  markRead:async()=>{}
};
vm.createContext(context);
vm.runInContext(slice('  function renderNotifications(){','\n  function applyNoticeBadge()')+'\n'+slice('  function noticeActionButton(index)','\n  function ensureStatsShell(stats)')+'\nwindow.renderNotices=renderNotifications;',context);
context.window.renderNotices();
assert.match(host.innerHTML,/data-notice-index="0" role="button" tabindex="0"/);
assert.match(host.innerHTML,/data-notice-index="1" role="button" tabindex="0"/);
assert.doesNotMatch(host.innerHTML,/data-notice-index="2"/,'informational messages must not impersonate a report action');

const card=index=>({dataset:{noticeIndex:String(index)}});
const target=(index,inButton=false)=>({closest:selector=>selector==='button'?(inButton?{}:null):card(index)});
host.onclick({target:target(0)});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(loads,1,'touching the notice text must start loading the weekly form');
assert.equal(weeklyOpens,0,'form must wait for the integrity suite');
assert.equal(button.textContent,'CARREGANDO RELATÓRIO...','the student needs visible progress while loading');
resolveLoad();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(weeklyOpens,1);
assert.equal(modal.open,true);
host.onclick({target:target(0,true)});
assert.equal(weeklyOpens,1,'the button click must not bubble into a second opening');

const keyEvent={key:'Enter',target:target(1),preventDefault(){this.prevented=true;}};
host.onkeydown(keyEvent);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(keyEvent.prevented,true);
assert.equal(questionnaireOpens,1,'keyboard activation must open the requested full extra report');
assert.equal(answerModal.open,true);
assert.equal(messages.length,0);

modal.open=false;
context.openWeeklyCheckinModal=async()=>{weeklyOpens++;return false;};
host.onclick({target:target(0)});
await new Promise(resolve=>setImmediate(resolve));
assert.ok(messages.some(item=>item.error&&item.message.includes('não abriu')),'a rejected weekly opening must never fail silently');
console.log('APROVADO — aviso inteiro abre relatórios extras; botão não duplica, teclado funciona, carregamento e falhas são visíveis.');

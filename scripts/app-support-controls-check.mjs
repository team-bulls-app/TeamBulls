import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const read=file=>fs.readFileSync(file,'utf8');
const noticeSource=read('modules/student-feedback-device-notices-v10_10_62.js');
const diagnosticsSource=read('modules/support-diagnostics-v10_10_9.js');
const profile=read('modules/student-home-profile-v10_10_12.js');
const index=read('index.html'),config=read('config_v10_7.js'),updater=read('update_v10_10_9.js');
const sw=read('sw.js'),sw47=read('sw_47.js'),version=JSON.parse(read('version.json'));

function makeNoticeHarness({online=true,failDelete=false}={}){
  const local=new Map(),listeners=new Map(),records=new Map(),writes=[],deletes=[],shown=[];
  const panel={hidden:false},enableButton={hidden:false,textContent:'',disabled:false},disableButton={hidden:false,textContent:'',disabled:false},status={textContent:''};
  const elements={'tb-device-notice-panel':panel,'tb-device-notice-enable':enableButton,'tb-device-notice-disable':disableButton,'tb-device-notice-status':status};
  const localStorage={getItem:key=>local.has(key)?local.get(key):null,setItem:(key,value)=>local.set(key,String(value)),removeItem:key=>local.delete(key)};
  const docRef=id=>({get:async()=>({exists:records.has(id)}),set:async value=>{records.set(id,value);writes.push(id);},update:async value=>{records.set(id,{...records.get(id),...value});},delete:async()=>{deletes.push(id);if(failDelete)throw new Error('offline firestore');records.delete(id);}});
  const db={collection:name=>({doc:uid=>({collection:sub=>({doc:id=>docRef(`${name}/${uid}/${sub}/${id}`)})})})};
  let permission='default',unsubscribeCount=0,deleteTokenCount=0;
  const token='token-for-device-1';
  const messaging={getToken:async()=>token,onMessage:()=>()=>{unsubscribeCount++;},deleteToken:async()=>{deleteTokenCount++;return true;}};
  const firebaseMessaging=()=>messaging;firebaseMessaging.isSupported=async()=>true;
  const firebase={messaging:firebaseMessaging,firestore:{FieldValue:{serverTimestamp:()=>({serverTimestamp:true})}}};
  const navigator={userAgent:'Android',onLine:online,serviceWorker:{register:async()=>({scope:'./feedback-push/'}),ready:Promise.resolve({showNotification:async(...args)=>shown.push(args)})}};
  const Notification={get permission(){return permission;},requestPermission:async()=>{permission='granted';return permission;}};
  const document={getElementById:id=>elements[id]||null};
  const window={Notification,TEAM_BULLS_PUBLIC_CONFIG:{webPushVapidKey:'test-public-key'},addEventListener:(type,callback)=>{const items=listeners.get(type)||[];items.push(callback);listeners.set(type,items);}};
  const context={window,document,navigator,Notification,matchMedia:()=>({matches:true}),isSecureContext:true,localStorage,TextEncoder,Uint8Array,crypto:webcrypto,CURRENT_USER:{uid:'student-a',role:'student'},MODE:'cloud',ACCESS_MODE:'cloud-active',auth:{currentUser:{uid:'student-a'}},db,firebase,loadSdkOnce:async()=>true,showToast:()=>{},console:{warn:()=>{}},Promise,Map,Set,Array,String,JSON,Date,Error,setTimeout,clearTimeout};
  vm.runInNewContext(noticeSource,context,{filename:'student-feedback-device-notices-v10_10_62.js'});
  return{api:window.TeamBullsDeviceNotices,local,listeners,records,writes,deletes,shown,elements,disableButton,unsubscribeCount:()=>unsubscribeCount,deleteTokenCount:()=>deleteTokenCount,setOnline:value=>{navigator.onLine=value;},setDeleteFailure:value=>{failDelete=value;},permission:()=>permission};
}

const notice=makeNoticeHarness();
assert.equal(notice.permission(),'default');
await notice.api.enable();
assert.equal(notice.permission(),'granted');
assert.equal(notice.writes.length,1,'Ativar deve registrar o aparelho uma vez.');
assert.equal(notice.disableButton.hidden,false,'A Central deve exibir a opção de desativar após o registro.');
assert.equal(await notice.api.disable(),true,'A desativação deve confirmar a remoção no servidor.');
assert.equal(notice.records.size,0,'A desativação deve excluir o token remoto deste aparelho.');
assert.equal(notice.local.get('team-bulls-push-disabled:student-a'),'1','A preferência deve sobreviver a reinicializações.');
assert.equal(notice.local.has('team-bulls-push-disable-pending:student-a'),false,'Uma remoção confirmada não deve continuar pendente.');
assert.equal(notice.unsubscribeCount(),1,'A desativação deve encerrar avisos em primeiro plano.');
assert.equal(notice.deleteTokenCount(),1,'A desativação deve limpar o token local do navegador.');
assert.equal(await notice.api.register(),false,'Um aparelho desativado não pode ser inscrito automaticamente.');
await notice.api.notifyFeedback('feedback-after-opt-out',{feedbackType:'weekly_report'});
assert.equal(notice.shown.length,0,'Um aparelho desativado não pode mostrar novos avisos em primeiro plano.');
for(const callback of notice.listeners.get('online')||[])callback();
await Promise.resolve();
assert.equal(notice.writes.length,1,'Reconectar não deve reativar uma preferência desativada.');
await notice.api.enable();
assert.equal(notice.local.has('team-bulls-push-disabled:student-a'),false,'Ativar novamente deve remover o bloqueio local.');
assert.equal(notice.writes.length,2,'Ativar novamente deve restaurar o registro remoto.');

const failingNotice=makeNoticeHarness();
await failingNotice.api.enable();
failingNotice.setDeleteFailure(true);
assert.equal(await failingNotice.api.disable(),false,'Uma exclusão remota não confirmada não deve ser reportada como concluída.');
assert.equal(failingNotice.local.get('team-bulls-push-disabled:student-a'),'1','A preferência local deve pausar o aparelho enquanto a remoção está pendente.');
assert.equal(failingNotice.local.get('team-bulls-push-disable-pending:student-a'),'1','Falhas de rede precisam permanecer visíveis e permitir nova tentativa.');
assert.equal(await failingNotice.api.register(),false,'Uma falha remota não pode provocar reinscrição automática.');
failingNotice.setDeleteFailure(false);
assert.equal(await failingNotice.api.disable(),true,'A remoção pendente deve poder ser concluída em nova tentativa.');
assert.equal(failingNotice.local.has('team-bulls-push-disable-pending:student-a'),false);

const offlineNotice=makeNoticeHarness();
await offlineNotice.api.enable();
offlineNotice.setOnline(false);
assert.equal(await offlineNotice.api.disable(),false,'Sem conexão, o app não deve afirmar que removeu o token remoto.');
assert.equal(offlineNotice.local.get('team-bulls-push-disabled:student-a'),'1','A pausa local deve valer imediatamente mesmo sem internet.');
assert.equal(offlineNotice.local.get('team-bulls-push-disable-pending:student-a'),'1','A remoção deve ficar marcada para retomar ao reconectar.');
offlineNotice.setOnline(true);
assert.equal(await offlineNotice.api.disable(),true,'A desativação offline deve ser concluída ao restabelecer a conexão.');
assert.equal(offlineNotice.records.size,0);

async function checkDiagnostics(clipboardAvailable){
  const copied=[],elements={
    'tb-copy-diagnostics':{disabled:false,addEventListener:(type,callback)=>{elements.handler=callback;}},
    'tb-diagnostics-output':{hidden:true,value:'',focus(){},select(){this.selected=true;},setSelectionRange(){}},
    'tb-diagnostics-status':{textContent:''}
  };
  const document={getElementById:id=>elements[id]||null,querySelector:()=>({id:'screen-student-notifications'})};
  const navigator={onLine:true,serviceWorker:{controller:{}},standalone:false};
  if(clipboardAvailable)navigator.clipboard={writeText:async text=>copied.push(text)};
  const window={TeamBullsUpdater:{version:'10.10.9',build:2026102902}};
  const context={window,document,navigator,matchMedia:query=>({matches:query==='(pointer: coarse)'}),CURRENT_USER:{uid:'private-user-id',name:'Nome Particular',email:'private@example.com',role:'student'},MODE:'cloud',Date,Number,String,Promise,console};
  vm.runInNewContext(diagnosticsSource,context,{filename:'support-diagnostics-v10_10_9.js'});
  const summary=window.TeamBullsSupportDiagnostics.createSummary();
  assert.match(summary,/Build: 2026102902/);
  assert.match(summary,/Tela: screen-student-notifications/);
  for(const secret of ['private-user-id','Nome Particular','private@example.com'])assert.equal(summary.includes(secret),false,'O diagnóstico não pode incluir dados pessoais.');
  assert.equal(/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(diagnosticsSource),false,'O módulo de diagnóstico não pode enviar dados.');
  const result=await window.TeamBullsSupportDiagnostics.copy();
  if(clipboardAvailable){assert.equal(result,true);assert.equal(copied.length,1);assert.equal(elements['tb-diagnostics-output'].hidden,true);}
  else{assert.equal(result,false);assert.equal(elements['tb-diagnostics-output'].hidden,false);assert.equal(elements['tb-diagnostics-output'].selected,true);}
  return{elements,copied};
}
await checkDiagnostics(true);
await checkDiagnostics(false);

assert.match(profile,/id="tb-device-notice-disable"/,'A Central do aluno deve oferecer controle por aparelho.');
assert.match(index,/id="tb-copy-diagnostics"/,'Configurações devem expor o resumo técnico local.');
assert.match(config,/student-home-profile-v10_10_12\.js\?v=10\.10\.22-studenthome6/);
assert.match(updater,/support-diagnostics-v10_10_9\.js\?v=10\.10\.9-diagnostics2/);
assert.match(sw,/support-diagnostics-v10_10_9\.js\?v=10\.10\.9-diagnostics2/);
assert.equal(sw,sw47,'Os service workers publicados devem permanecer idênticos.');
assert.equal(Number(version.build),2026102902,'O build publicado deve acompanhar os arquivos atualizados.');
assert.match(updater,/const CURRENT_BUILD=2026102902/);
assert.match(sw,/const BUILD_REVISION=2026102902/);

console.log('APROVADO — ativação, desativação remota, preferência offline pendente, retomada de conexão, reinscrição controlada e diagnóstico local sem dados pessoais.');

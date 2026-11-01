import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const boot=fs.readFileSync('boot_v10.js','utf8');
const block=boot.slice(boot.indexOf('// BEGIN DEVICE ACCESS BOOTSTRAP'),boot.indexOf('// END DEVICE ACCESS BOOTSTRAP'));
assert.ok(block.includes('TeamBullsDeviceAccess'));
const fault=code=>Object.assign(new Error(code),{code});
const values=new Map(),sessions=new Map(),refreshes=[],activated=[];
const user=(uid,email,code='')=>({uid,email,async getIdToken(force){assert.equal(force,true);refreshes.push(uid);if(code)throw fault(code);return 'private-token';}});
function runtime(){
  const attested=new Set();
  const apps=[],main={currentUser:null,app:{options:{projectId:'test-project'}},async setPersistence(value){assert.equal(value,'local');},async updateCurrentUser(value){activated.push(value.uid);this.currentUser=value;},async signOut(){this.currentUser=null;}};
  const firebase={apps,initializeApp(options,name){
    assert.equal(options.projectId,'test-project');
    const app={name,options,appCheck:()=>({activate(provider,auto){assert.equal(provider.key,'test-site-key');assert.equal(auto,false);attested.add(name);}}),auth(){return service;},async delete(){apps.splice(apps.indexOf(app),1);}};
    const service={app,currentUser:null,async setPersistence(value){assert.ok(attested.has(name),'App Check precisa ser configurado antes de restaurar a conta.');assert.equal(value,'local');this.currentUser=sessions.get(name)||null;},
      onAuthStateChanged(next){let alive=true;queueMicrotask(()=>{if(alive)next(this.currentUser);});return()=>{alive=false;};},
      async updateCurrentUser(value){this.currentUser=value;sessions.set(name,value);},async signOut(){this.currentUser=null;sessions.delete(name);}};
    apps.push(app);return app;
  }};
  firebase.auth=Object.assign(()=>main,{Auth:{Persistence:{LOCAL:'local'}}});
  firebase.appCheck=Object.assign(()=>{}, {ReCaptchaEnterpriseProvider:class{constructor(key){this.key=key;}}});
  const window={},navigator={onLine:true};
  const context=vm.createContext({window,auth:main,firebase,CFG:{appCheckSiteKey:'test-site-key'},navigator,setTimeout,clearTimeout,console:{warn(){}},localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}});
  vm.runInContext(block,context);
  return {access:window.TeamBullsDeviceAccess,main,navigator,context,firebase};
}
const a=user('uid-a','aluno.a@example.test'),b=user('uid-b','aluno.b@example.test');
let r=runtime();
r.main.currentUser=a;assert.equal(await r.access.remember(a),true);
r.main.currentUser=b;assert.equal(await r.access.remember(b),true);
assert.equal(await r.access.remember(a),false,'Uma conta alheia à sessão autenticada não pode ser adicionada.');
assert.deepEqual(JSON.parse(values.get('team_bulls_device_accounts_v1')),[{email:b.email,uid:b.uid},{email:a.email,uid:a.uid}]);
assert.ok(![...values.values()].join().includes('private-token'),'A lista própria não pode copiar tokens ou senhas.');
const blocked=runtime();blocked.firebase.appCheck=undefined;
await assert.rejects(blocked.access.restore(a.email),{code:'team-bulls/device-attestation-unavailable'});
assert.equal(blocked.main.currentUser,null,'Não deve ativar acesso sem o App Check configurado.');
assert.equal(blocked.access.has(a.email),true,'Falha na atestação não deve apagar uma sessão válida.');

// Fechar/reabrir: novas instâncias Auth restauram as sessões pelo SDK LOCAL.
r=runtime();assert.equal(r.main.currentUser,null);
await r.access.restore(a.email);assert.equal(r.main.currentUser.uid,a.uid);
await r.access.restore(b.email);assert.equal(r.main.currentUser.uid,b.uid);
assert.deepEqual(refreshes,['uid-a','uid-b'],'Cada entrada precisa renovar a sessão no servidor.');
const before=activated.length;
await assert.rejects(r.access.restore(a.email,{canActivate:()=>false}),{code:'team-bulls/device-cancelled'});
assert.equal(activated.length,before,'Navegar para fora do login durante a espera cancela a ativação.');
r.navigator.onLine=false;
await assert.rejects(r.access.restore(a.email),{code:'auth/network-request-failed'});
assert.equal(activated.length,before,'Acesso lembrado não pode liberar treinador offline.');
assert.equal(r.access.has(a.email),true,'Ausência de rede preserva a sessão para tentar novamente.');
r.navigator.onLine=true;
sessions.set('tb-device-v1-uid-a',user(a.uid,a.email,'auth/network-request-failed'));
await assert.rejects(r.access.restore(a.email),{code:'auth/network-request-failed'});
assert.equal(r.access.has(a.email),true);
sessions.set('tb-device-v1-uid-a',user(a.uid,a.email,'auth/user-token-expired'));
await assert.rejects(r.access.restore(a.email),{code:'auth/user-token-expired'});
assert.equal(r.access.has(a.email),false);assert.equal(sessions.has('tb-device-v1-uid-a'),false);
assert.equal(r.access.has(b.email),true,'Revogar uma sessão não pode apagar outra conta.');
sessions.set('tb-device-v1-uid-b',a);
await assert.rejects(r.access.restore(b.email),{code:'team-bulls/device-account-mismatch'});
assert.equal(activated.length,before,'Metadados adulterados não podem trocar a identidade autenticada.');
assert.equal(r.access.has(b.email),false);
r.main.currentUser=b;await r.access.remember(b);await r.access.forget(b.email);
assert.equal(sessions.has('tb-device-v1-uid-b'),false,'Esquecer acesso precisa encerrar a sessão LOCAL correspondente.');
assert.equal(r.main.currentUser,null,'Esquecer a conta também precisa apagar sua sessão principal, se ainda existir.');
for(let i=0;i<9;i++){const next=user('extra-'+i,'extra'+i+'@example.test');r.main.currentUser=next;await r.access.remember(next);}
assert.equal(sessions.size,8);assert.equal(r.access.has('extra0@example.test'),false);
assert.equal(sessions.has('tb-device-v1-extra-0'),false,'Exceder o limite precisa remover também a sessão do SDK.');

// As três camadas devem respeitar a preferência sem religar o autofill Google.
const viewport=fs.readFileSync('viewport_v10_10_9.js','utf8');
const update=fs.readFileSync('modules/app-update-v10_10_9.js','utf8');
const between=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function field(){return {value:'',dataset:{},attrs:{},setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];},addEventListener(){}};}
const form=field(),email=field(),password=field(),fields={'panel-login':form,'login-email':email,'login-pass':password};
const context=vm.createContext({window:{TeamBullsKnownAccounts:{}},document:{getElementById:id=>fields[id]||null},safeGet:()=>'',profileEmail:()=>'',LAST_EMAIL_KEY:'last',renderKnownAccounts(){}});
vm.runInContext(between(boot,'  function patchAuthAutocomplete()', '\n  let observer='),context);
vm.runInContext(between(viewport,'  function prepareAuthFields()', '\n  function injectPendingStyle('),context);
vm.runInContext(between(update,'  function prepareAuthAutofill()', '\n  function install('),context);
for(const method of ['patchAuthAutocomplete','prepareAuthFields','prepareAuthAutofill']){
  vm.runInContext(method+'()',context);
  assert.equal(form.autocomplete||form.attrs.autocomplete,'off',method);
  assert.equal(password.autocomplete||password.attrs.autocomplete,'off',method);
  assert.equal(password.name||password.attrs.name,'tb_access_secret',method);
}
console.log('APROVADO — acesso por aparelho: reinício, múltiplas contas, renovação, revogação, offline, cancelamento, remoção e três camadas de formulário.');

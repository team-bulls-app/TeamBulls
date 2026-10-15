/* Team Bulls v10.10.9 — convites individuais de uso único. */
'use strict';
(function(){
  const TB=window.TeamBulls107;if(!TB)return;
  const REGISTRATION_DIAGNOSTIC_REVISION='preflight4';
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randomCode(){
    const bytes=new Uint8Array(15);crypto.getRandomValues(bytes);
    let raw='';for(const byte of bytes)raw+=alphabet[byte%alphabet.length];
    return'TB-'+raw.slice(0,5)+'-'+raw.slice(5,10)+'-'+raw.slice(10,15);
  }
  function normalizeCode(value){return String(value||'').normalize('NFKC').trim().toUpperCase().replace(/\s+/g,'');}
  async function sha256(value){
    if(!crypto?.subtle)throw new Error('Este navegador não oferece a criptografia necessária para validar convites.');
    const bytes=new TextEncoder().encode(normalizeCode(value));
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  function inviteValid(data){
    if(!data||data.active!==true||data.usedBy)return false;
    const expiry=data.expiresAt?.toMillis?data.expiresAt.toMillis():new Date(data.expiresAt||0).getTime();
    return Number.isFinite(expiry)&&expiry>Date.now();
  }
  TB.createInvite=async function(days=7){
    if(CURRENT_USER?.role!=='trainer')throw new Error('Somente o treinador pode criar convites.');
    if(!await TB.ensureCloud())throw new Error('Firebase indisponível.');
    const safeDays=Math.max(1,Math.min(30,Math.trunc(Number(days)||7)));
    for(let attempt=0;attempt<4;attempt++){
      const code=randomCode(),id=await sha256(code),ref=db.collection('studentInvites').doc(id);
      const existing=await cloudGet(ref,'verificar convite');if(existing.exists)continue;
      const expiresAt=firebase.firestore.Timestamp.fromMillis(Date.now()+safeDays*86400000);
      await cloudWrite(ref.set({trainerId:CURRENT_USER.uid,active:true,createdAt:firebase.firestore.FieldValue.serverTimestamp(),expiresAt,usedAt:null,usedBy:'',revokedAt:null}),'criar convite');
      await TB.audit('Convite criado',{entity:'convite',summary:'Convite de uso único por '+safeDays+' dias',metadata:{inviteId:id,expiresAt:expiresAt.toDate().toISOString()}});
      return{id,code,active:true,expiresAt:expiresAt.toDate().toISOString()};
    }
    throw new Error('Não foi possível gerar um convite exclusivo. Tente novamente.');
  };
  TB.loadInvites=async function(){
    if(CURRENT_USER?.role!=='trainer'||!await TB.ensureCloud())return[];
    const snap=await cloudGet(db.collection('studentInvites').where('trainerId','==',CURRENT_USER.uid).limit(120),'convites');
    return snap.docs.map(doc=>{
      const data=doc.data(),expiresAt=data.expiresAt?.toDate?data.expiresAt.toDate().toISOString():String(data.expiresAt||''),createdAt=data.createdAt?.toDate?data.createdAt.toDate().toISOString():'';
      return{...data,id:doc.id,expiresAt,createdAt,valid:inviteValid(data)};
    }).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  };
  TB.revokeInvite=async function(id){
    if(CURRENT_USER?.role!=='trainer'||!id)throw new Error('Convite inválido.');
    await cloudWrite(db.collection('studentInvites').doc(id).update({active:false,revokedAt:firebase.firestore.FieldValue.serverTimestamp()}),'revogar convite');
    await TB.audit('Convite revogado',{entity:'convite',metadata:{inviteId:id}});return true;
  };
  TB.copyText=async function(value){
    try{await navigator.clipboard.writeText(String(value||''));showToast('✓ Copiado para a área de transferência');return true;}
    catch(error){window.prompt('Copie o conteúdo abaixo:',String(value||''));return false;}
  };
  TB.inviteHash=sha256;

  let registrationDiagnostic=Object.freeze({revision:REGISTRATION_DIAGNOSTIC_REVISION,stage:'idle',code:'',appCheck:'unknown'});
  function setRegistrationDiagnostic(stage,code='',appCheck=registrationDiagnostic.appCheck){
    registrationDiagnostic=Object.freeze({revision:REGISTRATION_DIAGNOSTIC_REVISION,stage:String(stage||'unknown'),code:String(code||''),appCheck:String(appCheck||'unknown')});
    window.TeamBullsRegistrationDiagnostics=registrationDiagnostic;
    return registrationDiagnostic;
  }
  setRegistrationDiagnostic('idle');

  async function ensureRegistrationAppCheck({forceRefresh=false}={}){
    const key=String(typeof CFG!=='undefined'&&CFG.appCheckSiteKey||'').trim();
    if(!key){setRegistrationDiagnostic('app-check','disabled','disabled');return true;}
    try{
      /* O boot pode abandonar uma inicialização lenta em 2,5 s para liberar a UI.
         O cadastro não pode herdar esse orçamento curto: aqui aguardamos até 8 s.
         getToken(false) reutiliza somente token válido e o próprio SDK renova se
         estiver ausente/expirado; refresh forçado fica reservado à recuperação 403. */
      if(typeof initOptionalAppCheck==='function')await withTimeout(initOptionalAppCheck(),8000,'App Check do cadastro');
      const service=typeof firebase!=='undefined'&&typeof firebase.appCheck==='function'?firebase.appCheck():null;
      if(!service||typeof service.getToken!=='function'){
        const error=new Error('A proteção de segurança do aplicativo não iniciou neste aparelho.');
        error.code='team-bulls/app-check-unavailable';throw error;
      }
      const result=await withTimeout(service.getToken(!!forceRefresh),8000,forceRefresh?'renovar proteção App Check':'validar proteção App Check');
      if(!result?.token){const error=new Error('Não foi possível validar a proteção de segurança neste aparelho.');error.code='team-bulls/app-check-failed';throw error;}
      setRegistrationDiagnostic('app-check',forceRefresh?'ok-refreshed':'ok','valid');return true;
    }catch(error){
      if(!String(error?.code||'').startsWith('team-bulls/app-check'))error.code='team-bulls/app-check-failed';
      setRegistrationDiagnostic('app-check',error.code,'invalid');throw error;
    }
  }
  function isPermissionDenied(error){return String(error?.code||'').toLowerCase()==='permission-denied';}
  function registrationPermissionMessage(stage){
    if(stage==='invite-precheck')return'Não foi possível validar o convite com o servidor [REG-INV-403]. A proteção do aparelho foi validada; o app tentará novamente após autenticar a conta sem consumir o convite.';
    if(stage==='transaction')return'O servidor recusou a criação do perfil [REG-FS-403]. Não use outro convite ainda. O aplicativo renovou autenticação e App Check e repetiu a operação uma única vez; confira as regras Firestore publicadas.';
    return'O servidor recusou esta etapa do cadastro [REG-403]. Não repita o cadastro até a configuração do Firebase ser conferida.';
  }
  async function registrationState(uid,inviteId,trainerId){
    if(!uid||!db)return'unknown';
    try{
      const snap=await withTimeout(db.collection('users').doc(uid).get(),6000,'confirmar resultado do cadastro');
      if(!snap.exists)return'missing';
      const data=snap.data()||{};
      return data.role==='student'&&String(data.inviteId||'')===String(inviteId||'')&&String(data.trainerId||'')===String(trainerId||'')?'committed':'conflict';
    }catch(error){return'unknown';}
  }
  function uncertainCommit(error){
    const code=String(error?.code||'').toLowerCase();
    const message=String(error?.message||'').toLowerCase();
    return code==='unavailable'||code==='deadline-exceeded'||code==='auth/network-request-failed'||code==='team-bulls/timeout'||message.includes('network')||message.includes('offline');
  }
  async function finishRegisteredAccount(email,pass,cred,userData){
    cacheUserProfile({...userData,uid:cred.user.uid});
    await rememberOfflineCredential(email,pass,cred.user.uid,userData);
    window.TeamBullsAuthFields?.clearSecrets?.();
  }
  function suspendAuthListenerForRegistration(){
    try{
      if(typeof AUTH_UNSUBSCRIBE==='function'){
        AUTH_UNSUBSCRIBE();AUTH_UNSUBSCRIBE=null;AUTH_CALLBACK_SEEN=false;AUTH_PROCESSING_UID='';return true;
      }
    }catch(error){console.warn('Não foi possível pausar o observador de autenticação durante o cadastro:',error);}
    return false;
  }
  function resumeAuthListenerAfterRegistration(wasSuspended){
    if(!wasSuspended)return;
    try{AUTH_HANDLED=false;AUTH_PROCESSING_UID='';if(typeof startAuthListener==='function')startAuthListener();}
    catch(error){console.error('Não foi possível restaurar o observador de autenticação:',error);}
  }
  async function validateInviteSnapshot(snapshot){
    if(!snapshot.exists||!inviteValid(snapshot.data())){const error=new Error('Convite inválido, expirado ou já utilizado.');error.code='team-bulls/invalid-invite';throw error;}
    const trainerId=String(snapshot.data().trainerId||'');
    if(!trainerId){const error=new Error('O convite não possui treinador válido.');error.code='team-bulls/invalid-invite';throw error;}
    return trainerId;
  }
  async function commitRegistration(inviteRef,cred,userData){
    return db.runTransaction(async transaction=>{
      const fresh=await transaction.get(inviteRef);
      if(!fresh.exists||!inviteValid(fresh.data())){const error=new Error('Este convite acabou de expirar ou já foi usado.');error.code='team-bulls/invalid-invite';throw error;}
      if(String(fresh.data().trainerId||'')!==userData.trainerId){const error=new Error('Convite inconsistente.');error.code='team-bulls/invalid-invite';throw error;}
      transaction.set(db.collection('users').doc(cred.user.uid),userData);
      transaction.update(inviteRef,{active:false,usedBy:cred.user.uid,usedAt:firebase.firestore.FieldValue.serverTimestamp()});
    });
  }
  async function createRegistrationCredential(email,pass,button){
    /* createUserWithEmailAndPassword não aceita AbortSignal. Um timeout artificial
       rejeitava a tela, mas a criação continuava no SDK e podia concluir depois,
       deixando uma conta Auth sem perfil/convite. Aqui o limite de 12 s vira só
       feedback visual: o fluxo só avança ou falha quando a operação Auth realmente
       se resolve, portanto a credencial nunca fica fora do alcance da limpeza. */
    let settled=false;
    const slowTimer=setTimeout(()=>{
      if(settled||!button?.disabled)return;
      button.textContent='CRIANDO CONTA · CONEXÃO LENTA...';
      setRegistrationDiagnostic('auth-create','waiting-network',registrationDiagnostic.appCheck);
    },12000);
    try{return await auth.createUserWithEmailAndPassword(email,pass);}
    finally{settled=true;clearTimeout(slowTimer);}
  }

  /* Cadastro seguro e diagnosticável. O convite é validado antes do Auth quando
     as Rules publicadas permitem leitura pública. Se uma implantação antiga negar
     somente esse preflight, o app cria a conta, pausa o listener global e repete a
     validação já autenticado. A gravação continua atômica e nunca relaxa Rules. */
  doRegister=async function(){
    clearAuthError('reg-error');setRegistrationDiagnostic('form');
    const name=document.getElementById('reg-name').value.trim();
    const email=document.getElementById('reg-email').value.trim().toLowerCase();
    const pass=document.getElementById('reg-pass').value;
    const code=normalizeCode(document.getElementById('reg-code').value);
    if(!name||!email||!pass||!code){showAuthError('reg-error','Preencha nome, e-mail, senha e convite.');return;}
    if(name.length>100){showAuthError('reg-error','O nome deve ter no máximo 100 caracteres.');return;}
    if(pass.length<8){showAuthError('reg-error','Use uma senha com pelo menos 8 caracteres.');return;}
    if(!navigator.onLine){showAuthError('reg-error','O cadastro inicial exige conexão com a internet.');return;}
    const btn=document.getElementById('btn-register');if(btn.disabled)return;
    btn.disabled=true;
    let cred=null,inviteId='',userData=null,authListenerSuspended=false,stage='firebase',trainerId='',precheckRequiresAuth=false;
    try{
      btn.textContent='VERIFICANDO CONEXÃO...';setRegistrationDiagnostic(stage);
      if(!await ensureFirebaseReady())throw new Error('Não foi possível carregar a conexão segura.');

      stage='app-check';btn.textContent='VERIFICANDO SEGURANÇA...';setRegistrationDiagnostic(stage);
      await ensureRegistrationAppCheck({forceRefresh:false});

      stage='invite-precheck';btn.textContent='VALIDANDO CONVITE...';setRegistrationDiagnostic(stage,'',registrationDiagnostic.appCheck);
      inviteId=await sha256(code);const inviteRef=db.collection('studentInvites').doc(inviteId);
      try{
        trainerId=await validateInviteSnapshot(await cloudGet(inviteRef,'validar convite'));
      }catch(error){
        if(!isPermissionDenied(error))throw error;
        precheckRequiresAuth=true;
        setRegistrationDiagnostic('invite-precheck','permission-denied-auth-retry',registrationDiagnostic.appCheck);
      }

      stage='auth-create';btn.textContent='CRIANDO CONTA...';setRegistrationDiagnostic(stage);AUTH_HANDLED=false;startBootWatchdog();
      authListenerSuspended=suspendAuthListenerForRegistration();
      cred=await createRegistrationCredential(email,pass,btn);

      stage='auth-token';btn.textContent='VALIDANDO CONTA...';setRegistrationDiagnostic(stage);
      let tokenResult=await withTimeout(cred.user.getIdTokenResult(true),8000,'atualização da credencial de cadastro');
      const tokenEmail=String(tokenResult?.claims?.email||cred.user.email||'').trim().toLowerCase();
      if(!tokenEmail){const error=new Error('O Firebase não retornou um e-mail autenticado para esta conta.');error.code='team-bulls/auth-email-claim';throw error;}

      if(precheckRequiresAuth){
        stage='invite-auth-check';btn.textContent='REVALIDANDO CONVITE...';setRegistrationDiagnostic(stage);
        trainerId=await validateInviteSnapshot(await cloudGet(inviteRef,'revalidar convite autenticado'));
      }
      userData={name:name.slice(0,100),email:tokenEmail,role:'student',status:'active',trainerId,inviteId,createdAt:firebase.firestore.FieldValue.serverTimestamp()};

      stage='transaction';btn.textContent='CRIANDO PERFIL...';setRegistrationDiagnostic(stage);
      try{
        await commitRegistration(inviteRef,cred,userData);
      }catch(error){
        if(!isPermissionDenied(error))throw error;
        stage='transaction-refresh';btn.textContent='RENOVANDO SEGURANÇA...';setRegistrationDiagnostic(stage,'permission-denied-retry',registrationDiagnostic.appCheck);
        tokenResult=await withTimeout(cred.user.getIdTokenResult(true),8000,'renovar credencial de cadastro');
        await ensureRegistrationAppCheck({forceRefresh:true});
        stage='transaction';btn.textContent='CRIANDO PERFIL...';setRegistrationDiagnostic(stage,'retry',registrationDiagnostic.appCheck);
        await commitRegistration(inviteRef,cred,userData);
      }
      stage='committed';setRegistrationDiagnostic(stage,'ok');
      await finishRegisteredAccount(tokenEmail,pass,cred,userData);
    }catch(error){
      AUTH_HANDLED=false;setRegistrationDiagnostic(stage,error?.code||'error',registrationDiagnostic.appCheck);
      if(cred?.user&&userData&&uncertainCommit(error)){
        const state=await registrationState(cred.user.uid,inviteId,userData.trainerId);
        if(state==='committed'){setRegistrationDiagnostic('committed-after-check','ok');await finishRegisteredAccount(userData.email,pass,cred,userData);return;}
        if(state==='unknown'){
          try{await auth.signOut();}catch(signOutError){}
          showAuthError('reg-error','Não foi possível confirmar o resultado do cadastro [REG-UNCERTAIN]. Não use outro convite. Tente entrar com este mesmo e-mail; se não entrar, envie este código ao suporte.');return;
        }
      }
      if(cred?.user){try{await cred.user.delete();}catch(cleanupError){try{await auth.signOut();}catch(signOutError){}}}
      const messages={
        'auth/email-already-in-use':'Este e-mail já possui uma conta. Antes de usar outro convite, tente entrar normalmente ou recuperar a senha.',
        'auth/invalid-email':'E-mail inválido.','auth/weak-password':'Senha muito fraca.',
        'team-bulls/invalid-invite':'Convite inválido, expirado ou já utilizado. Peça um novo ao treinador.',
        'team-bulls/app-check-unavailable':'A proteção de segurança do Team Bulls não iniciou neste aparelho [REG-APP-INIT]. Não foi criada nenhuma conta; atualize a tela e tente novamente com este mesmo convite. Se persistir, verifique bloqueadores, DNS e navegador.',
        'team-bulls/app-check-failed':'Este aparelho não conseguiu concluir a validação de segurança [REG-APP-TOKEN]. Não foi criada nenhuma conta e o convite não foi consumido. Atualize a tela e tente novamente com este mesmo convite.',
        'team-bulls/auth-email-claim':'A autenticação foi criada sem a confirmação de e-mail exigida pelo perfil [REG-AUTH-EMAIL]. A tentativa foi cancelada com segurança.',
        'team-bulls/timeout':'O servidor demorou além do esperado. A tentativa foi tratada de forma conservadora; use este mesmo convite e siga a orientação exibida antes de tentar novamente.'
      };
      const message=isPermissionDenied(error)?registrationPermissionMessage(stage):(messages[error?.code]||error?.message||'Não foi possível criar a conta.');
      showAuthError('reg-error',message);
    }finally{
      resumeAuthListenerAfterRegistration(authListenerSuspended);
      btn.disabled=false;btn.textContent='CRIAR NOVO REGISTRO';
    }
  };

  doRegister.__tbCanonicalInviteRegistration=true;
  doRegister.__tbRegistrationPreflight=REGISTRATION_DIAGNOSTIC_REVISION;
  doRegister.__tbRegistrationAppCheck='cached-first';
  doRegister.__tbRegistrationAuthCreate='settle-before-continue';
  const CANONICAL_REGISTER=doRegister;
  function enforceCanonicalRegistration(){
    if(typeof doRegister==='function'&&doRegister!==CANONICAL_REGISTER){
      console.warn('[Team Bulls] Fluxo legado de cadastro ignorado; restaurando cadastro seguro por convite.');doRegister=CANONICAL_REGISTER;
    }
  }
  window.addEventListener('team-bulls-runtime-state',enforceCanonicalRegistration);
  window.addEventListener('team-bulls-runtime-ready',enforceCanonicalRegistration);
  window.addEventListener('pageshow',enforceCanonicalRegistration);

  function updateRegisterCopy(){
    const input=document.getElementById('reg-code');if(!input)return;
    const label=input.closest('.form-group')?.querySelector('.form-label');
    if(label)label.innerHTML='Convite individual <span style="color:var(--accent)">*uso único</span>';
    input.placeholder='Ex.: TB-ABCDE-FGHIJ-KLMNO';input.maxLength=23;input.autocapitalize='characters';
    const passLabel=document.getElementById('reg-pass')?.closest('.form-group')?.querySelector('.form-label');if(passLabel)passLabel.textContent='Senha (mín. 8 caracteres)';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',updateRegisterCopy,{once:true});else updateRegisterCopy();
})();
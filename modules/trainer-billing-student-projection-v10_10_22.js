/* Team Bulls v10.10.22 — projeção financeira mínima e segura para leitura do próprio aluno. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_BILLING_STUDENT_PROJECTION_101022__)return;
  window.__TEAM_BULLS_TRAINER_BILLING_STUDENT_PROJECTION_101022__=true;

  const VERSION='10.10.22-billingprojection2';
  const PAYMENT_LIMIT=500;
  const TARGET_COLLECTION='studentBilling';
  let unsubscribe=null;
  let trainerUid='';
  let lastFingerprint='';
  let syncing=Promise.resolve();

  const trainer=()=>typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer'&&typeof MODE!=='undefined'&&MODE==='cloud'&&String(CURRENT_USER?.uid||'').trim();
  const cleanId=value=>String(value??'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,190);
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;};
  const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
  const paymentCollection=uid=>db.collection('trainerBilling').doc(uid).collection('payments');

  function normalized(doc){
    const data=doc?.data?.()||{};
    const studentId=cleanId(data.studentId),paymentId=cleanId(doc?.id||'');
    if(!studentId||!paymentId)return null;
    if(!['quarterly','semiannual','annual','custom'].includes(data.planType))return null;
    if(!iso(data.validFrom)||!iso(data.nextDueDate))return null;
    const fixedMonths=data.planType==='quarterly'?3:data.planType==='semiannual'?6:data.planType==='annual'?12:0;
    const durationMonths=Number.isInteger(data.durationMonths)?data.durationMonths:fixedMonths;
    if(data.planType==='custom'?(durationMonths<1||durationMonths>60):(durationMonths!==fixedMonths))return null;
    const amountCents=Math.max(0,Math.min(100000000,Math.trunc(number(data.amountCents))));
    return{studentId,paymentId,planType:data.planType,durationMonths,amountCents,validFrom:data.validFrom,nextDueDate:data.nextDueDate,createdAt:data.createdAt};
  }
  function millis(value){try{if(value?.toMillis)return value.toMillis();if(value?.seconds)return Number(value.seconds)*1000;return Number(value)||0;}catch(error){return 0;}}
  function latestPerStudent(snapshot){
    const map=new Map();
    for(const doc of snapshot.docs||[]){
      const row=normalized(doc);if(!row)continue;
      const previous=map.get(row.studentId);
      if(!previous||String(row.validFrom)>String(previous.validFrom)||(row.validFrom===previous.validFrom&&millis(row.createdAt)>millis(previous.createdAt)))map.set(row.studentId,row);
    }
    return map;
  }
  function fingerprint(map){return JSON.stringify([...map.values()].sort((a,b)=>a.studentId.localeCompare(b.studentId)).map(item=>[item.studentId,item.paymentId,item.planType,item.durationMonths,item.amountCents,item.validFrom,item.nextDueDate]));}

  async function commitProjection(map,uid){
    if(!trainer()||String(CURRENT_USER.uid)!==uid||typeof db==='undefined'||!db)return false;
    const rows=[...map.values()];
    for(let offset=0;offset<rows.length;offset+=350){
      if(!trainer()||String(CURRENT_USER.uid)!==uid)return false;
      const batch=db.batch();
      for(const row of rows.slice(offset,offset+350)){
        const ref=db.collection(TARGET_COLLECTION).doc(row.studentId);
        batch.set(ref,{schemaVersion:1,studentId:row.studentId,trainerId:uid,paymentId:row.paymentId,planType:row.planType,durationMonths:row.durationMonths,amountCents:row.amountCents,validFrom:row.validFrom,nextDueDate:row.nextDueDate,updatedAt:stamp()});
      }
      const task=batch.commit();
      if(typeof cloudWrite==='function')await cloudWrite(task,'sincronizar pagamentos visíveis ao aluno');else await task;
    }
    return true;
  }

  function queueSnapshot(snapshot,uid){
    const latest=latestPerStudent(snapshot),nextFingerprint=fingerprint(latest);
    if(nextFingerprint===lastFingerprint)return;
    syncing=syncing.catch(()=>false).then(async()=>{
      if(!trainer()||String(CURRENT_USER.uid)!==uid)return false;
      const ok=await commitProjection(latest,uid);
      if(ok)lastFingerprint=nextFingerprint;
      return ok;
    }).catch(error=>{console.warn('[Team Bulls] Projeção financeira do aluno não sincronizada',error);return false;});
  }

  function stop(){try{unsubscribe?.();}catch(error){}unsubscribe=null;trainerUid='';lastFingerprint='';}
  function start(){
    if(!trainer()||typeof db==='undefined'||!db){stop();return false;}
    const uid=String(CURRENT_USER.uid);
    if(unsubscribe&&trainerUid===uid)return true;
    stop();trainerUid=uid;
    unsubscribe=paymentCollection(uid).orderBy('createdAt','desc').limit(PAYMENT_LIMIT).onSnapshot(snapshot=>queueSnapshot(snapshot,uid),error=>console.warn('[Team Bulls] Pagamentos privados indisponíveis para projeção',error));
    return true;
  }
  function installLogoutHook(){
    if(typeof confirmLogout!=='function'||confirmLogout.__tbBillingProjection)return;
    const base=confirmLogout;
    const wrapped=function(){stop();return base.apply(this,arguments);};
    wrapped.__tbBillingProjection=true;confirmLogout=wrapped;
  }
  function install(){installLogoutHook();start();}

  window.TeamBullsBillingProjection=Object.freeze({version:VERSION,start,stop});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-runtime-ready',start);
  window.addEventListener('online',start);
  window.addEventListener('pageshow',start,{passive:true});
})();

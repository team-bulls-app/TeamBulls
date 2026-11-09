'use strict';
const {createHash,randomUUID}=require('node:crypto');
const uidPattern=/^[A-Za-z0-9_-]{1,128}$/;
const VERSION='10.10.71-studentadmin1';
const clean=value=>String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,100);
const hash=value=>createHash('sha256').update(value).digest('hex');

// All privileged operations stay on the server. Firestore/Storage Rules 28/6
// remain unchanged; browsers cannot write registry names, archive flags or order.
function createStudentAdministration({db,identity,bucket,serverTimestamp,deleteField,ErrorType,now=Date.now,newLease=randomUUID}){
  const fail=(code,message,details)=>{throw new ErrorType(code,message,details);};
  const ref=uid=>db.collection('users').doc(uid);
  const prefs=uid=>db.collection('trainerRosters').doc(uid);
  const validUid=value=>{if(typeof value!=='string'||!uidPattern.test(value)||['__proto__','prototype','constructor'].includes(value))fail('invalid-argument','Identificação do aluno inválida.');return value;};
  const trainer=(row,actor)=>{if(!row||row.role!=='trainer')fail('permission-denied','Esta ação exige o perfil de treinador.');return actor;};
  const owned=(row,actor)=>{if(!row||row.role!=='student'||row.trainerId!==actor)fail('permission-denied','O aluno não pertence à sua lista.');};
  const publicStudent=(uid,row)=>({uid,name:String(row.name||''),registeredName:String(row.registeredName||row.name||''),nickname:String(row.nickname||''),email:String(row.email||''),status:row.status,isArchived:row.isArchived===true});
  const orderStudents=(rows,order)=>{const rank=new Map((Array.isArray(order)?order:[]).map((id,index)=>[id,index]));return rows.slice().sort((a,b)=>(rank.get(a.uid)??Infinity)-(rank.get(b.uid)??Infinity)||clean(a.registeredName||a.name).localeCompare(clean(b.registeredName||b.name),'pt-BR')||a.uid.localeCompare(b.uid));};
  async function editStudent(actor,uid,action,data){
    return db.runTransaction(async tx=>{
      const [actorDoc,studentDoc,rosterDoc]=await Promise.all([tx.get(ref(actor)),tx.get(ref(uid)),tx.get(prefs(actor))]);
      const actorRow=actorDoc.exists?actorDoc.data():null,row=studentDoc.exists?studentDoc.data():null;
      const archivedIds=rosterDoc.exists&&Array.isArray(rosterDoc.data().archivedIds)?rosterDoc.data().archivedIds:[];
      if(!row||row.role!=='student'||String(row.trainerId||'').startsWith('!deleting:'))fail('failed-precondition','Este perfil não está disponível para alterações.');
      let changes={};
      if(action==='nickname'){
        if(actor!==uid){trainer(actorRow,actor);owned(row,actor);if(data.nickname!=='')fail('permission-denied','O treinador pode remover o apelido, mas não escolher um apelido pelo aluno.');}
        else if(actorRow?.role!=='student'||row.status!=='active')fail('permission-denied','Entre com uma conta de aluno ativa.');
        if(typeof data.nickname!=='string'||data.nickname.length>100)fail('invalid-argument','Use um apelido com até 100 caracteres.');
        const nickname=clean(data.nickname);if(!nickname&&actor===uid)fail('invalid-argument','Digite seu nome de exibição.');
        changes={registeredName:clean(row.registeredName||row.name),nickname};
      }else{
        trainer(actorRow,actor);owned(row,actor);
        if(action==='registeredName'){
          if(typeof data.registeredName!=='string')fail('invalid-argument','Confira o nome cadastrado.');
          const registeredName=clean(data.registeredName);if(!registeredName||String(data.registeredName).length>100)fail('invalid-argument','Confira o nome cadastrado.');
          changes={registeredName,nickname:typeof row.nickname==='string'?row.nickname:row.name!==registeredName?clean(row.name):''};
        }else if(action==='archive'){
          if(archivedIds.includes(uid)&&row.status==='inactive')return publicStudent(uid,{...row,isArchived:true});
          changes={isArchived:true,status:'inactive',archivedAt:serverTimestamp(),archivedBy:actor};
        }else if(action==='restore'){
          if(!archivedIds.includes(uid)){if(row.status==='active')return publicStudent(uid,{...row,isArchived:false});fail('failed-precondition','O aluno já está na lista principal.');}
          changes={isArchived:false,status:'active',restoredAt:serverTimestamp(),restoredBy:actor};
        }else fail('invalid-argument','Ação inválida.');
      }
      tx.update(ref(uid),changes);
      if(action==='archive'||action==='restore')tx.set(prefs(actor),{trainerId:actor,archivedIds:action==='archive'?[...new Set([...archivedIds,uid])]:archivedIds.filter(id=>id!==uid),updatedAt:serverTimestamp()},{merge:true});
      return publicStudent(uid,{...row,...changes});
    });
  }
  async function moveStudent(actor,uid,data){
    if(![-1,1].includes(data.direction)||typeof data.requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(data.requestId))fail('invalid-argument','Movimento inválido.');
    return db.runTransaction(async tx=>{
      const preferenceRef=prefs(actor),opRef=preferenceRef.collection('operations').doc(data.requestId);
      const [actorDoc,rosterDoc,opDoc,students]=await Promise.all([tx.get(ref(actor)),tx.get(preferenceRef),tx.get(opRef),tx.get(db.collection('users').where('role','==','student').where('trainerId','==',actor))]);
      trainer(actorDoc.exists?actorDoc.data():null,actor);
      const old=rosterDoc.exists?rosterDoc.data():{},archivedIds=Array.isArray(old.archivedIds)?old.archivedIds:[];
      const rows=students.docs.map(doc=>({...doc.data(),uid:doc.id})).filter(row=>!archivedIds.includes(row.uid)),ordered=orderStudents(rows,old.order);
      if(opDoc.exists){const op=opDoc.data();if(op.studentUid!==uid||op.direction!==data.direction)fail('invalid-argument','A tentativa não corresponde ao movimento original.');return{order:ordered.map(row=>row.uid)};}
      const index=ordered.findIndex(row=>row.uid===uid),next=index+data.direction;
      if(index<0)fail('not-found','O aluno não está na lista principal.');
      if(next<0||next>=ordered.length)return{order:ordered.map(row=>row.uid)};
      [ordered[index],ordered[next]]=[ordered[next],ordered[index]];const order=ordered.map(row=>row.uid);
      tx.set(preferenceRef,{trainerId:actor,order,updatedAt:serverTimestamp()},{merge:true});
      tx.set(opRef,{studentUid:uid,direction:data.direction,createdAt:serverTimestamp()});return{order};
    });
  }
  async function deleteQuery(query,uid,actor,checkTrainer=false){
    while(true){
      const snap=await query.limit(150).get();if(!snap.docs.length)return;
      // Refuse mixed ownership instead of silently deleting another account's data.
      for(const doc of snap.docs){const row=doc.data();if(row.userId&&row.userId!==uid||row.studentUid&&row.studentUid!==uid||row.studentId&&row.studentId!==uid||checkTrainer&&row.trainerId&&row.trainerId!==actor)fail('failed-precondition','Há registros com vínculo divergente. A exclusão foi interrompida para conferência.');}
      for(const doc of snap.docs)await db.recursiveDelete(doc.ref);
    }
  }
  async function deleteStoragePrefix(prefix){
    while(true){const [files]=await bucket.getFiles({prefix,maxResults:150,autoPaginate:false});if(!files.length)return;for(const file of files){if(!file.name.startsWith(prefix))fail('internal','Caminho de arquivo divergente.');await file.delete({ignoreNotFound:true});}}
  }
  async function permanentlyDelete(actor,uid,data,authTime){
    if(data.confirmation!=='EXCLUIR'||typeof data.email!=='string'||!data.email.trim())fail('invalid-argument','Confirme o e-mail e digite EXCLUIR.');
    if(!Number.isFinite(authTime)||authTime*1000>now()+60000||now()-authTime*1000>5*60000)fail('failed-precondition','Entre novamente antes de excluir definitivamente.',{reason:'recent-login-required'});
    const jobId=hash(actor+':'+uid),jobRef=db.collection('studentDeletionJobs').doc(jobId),lease=newLease(),emailHash=hash(data.email.trim().toLocaleLowerCase('en-US'));
    const started=await db.runTransaction(async tx=>{
      const [actorDoc,studentDoc,jobDoc,rosterDoc]=await Promise.all([tx.get(ref(actor)),tx.get(ref(uid)),tx.get(jobRef),tx.get(prefs(actor))]);
      trainer(actorDoc.exists?actorDoc.data():null,actor);const row=studentDoc.exists?studentDoc.data():null,job=jobDoc.exists?jobDoc.data():null;
      if(job&&job.trainerId!==actor)fail('permission-denied','Operação indisponível.');
      if(job?.state==='completed'){if(studentDoc.exists)fail('failed-precondition','Existe um cadastro com esta identificação. A operação anterior não pode ser reutilizada.');return false;}
      if(job){if(job.studentUid!==uid||job.emailHash!==emailHash)fail('permission-denied','A confirmação não corresponde a esta operação.');if(row&&(row.role!=='student'||row.trainerId!=='!deleting:'+jobId))fail('failed-precondition','O vínculo do perfil mudou. A exclusão foi suspensa para conferência.');if(job.leaseUntil>now())fail('aborted','A exclusão já está em andamento. Aguarde e consulte novamente.');}
      else{owned(row,actor);if(!rosterDoc.exists||!rosterDoc.data().archivedIds?.includes(uid)||row.status!=='inactive')fail('failed-precondition','Arquive e bloqueie o perfil antes de excluir definitivamente.');if(hash(String(row.email||'').trim().toLocaleLowerCase('en-US'))!==emailHash)fail('invalid-argument','O e-mail não corresponde ao aluno escolhido.');}
      const previousPending=rosterDoc.exists?rosterDoc.data().pendingDeletions?.[uid]:null;
      const pending={registeredName:String(row?.registeredName||row?.name||previousPending?.registeredName||'Aluno'),email:String(row?.email||data.email),uid};
      tx.set(jobRef,{trainerId:actor,studentUid:uid,emailHash,state:'deleting',leaseOwner:lease,leaseUntil:now()+10*60000,updatedAt:serverTimestamp()},{merge:true});
      tx.set(prefs(actor),{pendingDeletions:{[uid]:pending}},{merge:true});
      if(studentDoc.exists)tx.update(ref(uid),{status:'inactive',isArchived:true,deletionState:'deleting',trainerId:'!deleting:'+jobId});
      return true;
    });
    if(!started)return{deleted:true};
    try{
      try{await identity.updateUser(uid,{disabled:true});}catch(error){if(error.code!=='auth/user-not-found')throw error;}
      // The ownership barrier makes existing Rules 28/6 deny new student
      // content and linked trainer writes, including another open window.
      while(true){const workouts=await db.collection('workouts').where('userId','==',uid).limit(50).get();if(!workouts.docs.length)break;for(const workout of workouts.docs){await deleteQuery(db.collection('exercises').where('workoutId','==',workout.id),uid,actor);await deleteQuery(db.collection('sessions').where('workoutId','==',workout.id),uid,actor);await db.recursiveDelete(workout.ref);}}
      for(const [collection,field,guard] of [['exercises','userId'],['sessions','userId'],['feedback','studentId',true],['questionnaires','studentId',true],['weeklyCheckins','studentId',true],['progressPhotos','userId'],['freeMealLogs','userId'],['mealCompletions','studentUid'],['workoutCompletions','studentUid'],['workoutCycleStates','studentUid'],['notifications','studentId',true],['planVersions','studentId',true],['auditLogs','studentId',true],['studentInvites','usedBy',true]])await deleteQuery(db.collection(collection).where(field,'==',uid),uid,actor,guard);
      await deleteQuery(db.collection('planTemplates').where('snapshot.targetUid','==',uid),uid,actor,true);
      await deleteQuery(db.collection('trainerBilling').doc(actor).collection('payments').where('studentId','==',uid),uid,actor);
      await deleteQuery(db.collection('trainerActivity').doc(actor).collection('events').where('studentId','==',uid),uid,actor);
      await deleteQuery(prefs(actor).collection('operations').where('studentUid','==',uid),uid,actor);
      for(const collection of ['mealPlans','checkinSchedules','protocolReviewSchedules','dietCalculations','studentBilling','pushDevices'])await db.recursiveDelete(db.collection(collection).doc(uid));
      for(const prefix of ['progressPhotos','progressPhotoThumbs','progressPhotoOriginals','freeMealLogs','studentProfiles'])await deleteStoragePrefix(prefix+'/'+uid+'/');
      await deleteStoragePrefix('paymentReceipts/'+actor+'/'+uid+'/');
      try{await identity.deleteUser(uid);}catch(error){if(error.code!=='auth/user-not-found')throw error;}
      await db.recursiveDelete(ref(uid));
      await db.runTransaction(async tx=>{
        const [jobDoc,rosterDoc]=await Promise.all([tx.get(jobRef),tx.get(prefs(actor))]);
        if(!jobDoc.exists||jobDoc.data().leaseOwner!==lease)fail('aborted','A operação foi retomada em outro acesso.');
        const roster=rosterDoc.exists?rosterDoc.data():{},pending={...(roster.pendingDeletions||{})};delete pending[uid];
        tx.set(prefs(actor),{order:(roster.order||[]).filter(id=>id!==uid),archivedIds:(roster.archivedIds||[]).filter(id=>id!==uid),pendingDeletions:pending},{mergeFields:['order','archivedIds','pendingDeletions']});
        tx.set(jobRef,{trainerId:actor,state:'completed',completedAt:serverTimestamp(),studentUid:deleteField(),emailHash:deleteField(),leaseOwner:deleteField(),leaseUntil:deleteField()},{merge:true});
      });
      return{deleted:true};
    }catch(error){await db.runTransaction(async tx=>{const job=await tx.get(jobRef);if(job.exists&&job.data().leaseOwner===lease)tx.update(jobRef,{state:'failed',leaseUntil:0,updatedAt:serverTimestamp()});});throw error;}
  }
  return async function administration(request){
    const actor=request.auth?.uid;if(!actor||!request.app)fail('unauthenticated','Entre novamente e atualize a validação do aplicativo.');
    const data=request.data||{},action=String(data.action||'');
    if(data.clientVersion!==VERSION)fail('failed-precondition','Atualize o aplicativo para usar os controles de alunos.');
    if(action==='preferences'){
      const actorDoc=await ref(actor).get();trainer(actorDoc.exists?actorDoc.data():null,actor);const doc=await prefs(actor).get(),row=doc.exists?doc.data():{};
      return{order:Array.isArray(row.order)?row.order:[],archivedIds:Array.isArray(row.archivedIds)?row.archivedIds:[],pendingDeletions:Object.values(row.pendingDeletions||{})};
    }
    const uid=validUid(data.studentUid);if(uid===actor&&action!=='nickname')fail('permission-denied','Esta ação não pode alterar sua própria conta de treinador.');
    if(action==='move')return moveStudent(actor,uid,data);
    if(action==='delete')return permanentlyDelete(actor,uid,data,Number(request.auth.token?.auth_time));
    if(['nickname','registeredName','archive','restore'].includes(action))return editStudent(actor,uid,action,data);
    fail('invalid-argument','Ação inválida.');
  };
}
module.exports={createStudentAdministration};

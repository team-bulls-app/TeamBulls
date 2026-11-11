import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const modulePath='modules/trainer-inbox-payments-v10_10_12.js';
const baselineIndex=process.argv.indexOf('--baseline'),baseline=process.argv[baselineIndex+1];assert(baselineIndex<0||/^[a-f0-9]{7,40}$/.test(baseline));
const source=baselineIndex<0?fs.readFileSync(modulePath,'utf8'):execFileSync('git',['show',`${baseline}:${modulePath}`],{encoding:'utf8'});
const saveStart=source.indexOf('async function savePayment(){');
const attachmentStart=source.indexOf('async function attachPaymentReceipt(');
const start=attachmentStart>=0?attachmentStart:saveStart;
const end=source.indexOf(attachmentStart>=0?'\n  function clearReceiptView':'\n  async function openReceipt',start);
assert(start>=0&&end>start,'Não foi possível localizar o salvamento de pagamentos.');
const saveSource=source.slice(start,end);

function harness({primaryFailures=0,receiptFailure=false,linkFailure=false,holdPrimary=null,holdUpload=null,holdLink=null}={}){
  const fields={
    'tb-payment-student':{value:'student-a'},'tb-payment-plan':{value:'semiannual'},
    'tb-payment-duration':{value:'6'},'tb-payment-amount':{value:'600'},
    'tb-payment-valid-from':{value:'2026-09-15'},'tb-payment-note':{value:''},
    'tb-payment-save':{disabled:false,textContent:'SALVAR PAGAMENTO'}
  };
  const writes=[],uploads=[],closed=[],messages=[],deleted=[],records=new Map(),attachments=[],published=[];let failCount=primaryFailures;
  const context={
    CURRENT_USER:{uid:'trainer-a'},MODE:'cloud',trainer:()=>true,
    paymentSaving:false,paymentEditorRequest:1,
    studentMap:new Map([['student-a',{uid:'student-a'}]]),
    paymentEditorId:'',pendingPaymentId:'pay-stable',pendingPaymentStudentId:'',
    paymentFile:{name:'comprovante.jpg',type:'image/jpeg'},paymentRecords:[],receiptJobs:new Map(),
    db:{runTransaction:async task=>{let staged;const result=await task({get:async ref=>ref.get(),set:(ref,payload,options)=>{staged={ref,payload,options};}});if(staged)await staged.ref.set(staged.payload,staged.options);return result;}},
    paymentCollection:uid=>({doc:id=>({set:async(payload,options)=>{
      writes.push({uid,id,payload:{...payload},options});
      if(Object.prototype.hasOwnProperty.call(payload,'amountCents')){
        if(failCount>0){failCount--;return Promise.reject(new Error('firestore-unavailable'));}
        if(holdPrimary)await holdPrimary;
      }
      if(payload.receiptPath&&holdLink)await holdLink;
      records.set(id,{...(records.get(id)||{}),...payload});if(linkFailure&&payload.receiptPath)throw new Error('timeout-after-commit');
    },get:async()=>({exists:records.has(id),data:()=>structuredClone(records.get(id))})})}),
    document:{getElementById:id=>fields[id]||null},
    iso:value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'',
    planMonths:type=>type==='annual'?12:type==='semiannual'?6:3,
    addCalendarMonths:(date,months)=>months===6?'2027-03-15':'2026-12-15',
    nowStamp:()=>({serverTimestamp:true}),cloudWrite:task=>task,
    uploadReceipt:async(_trainer,_student,_payment,file)=>{uploads.push(file.name);if(holdUpload)await holdUpload;if(receiptFailure)throw new Error('storage-offline');return'paymentReceipts/trainer-a/student-a/pay-stable.jpg';},
    deleteReceipt:path=>deleted.push(path),
    closeModal:id=>closed.push(id),revokePaymentPreview:()=>{},paymentPreviewUrl:'',
    publishPayment:(id,data)=>{published.push({id,...data});context.paymentRecords=[{...data,id},...context.paymentRecords.filter(row=>row.id!==id)];},
    renderPayments:()=>{},refreshPaymentDetails:()=>{},
    toast:(message,error=false)=>messages.push({message,error}),fmtDate:value=>value
  };
  vm.createContext(context);vm.runInContext(saveSource,context);
  if(context.attachPaymentReceipt){
    const attach=context.attachPaymentReceipt;
    context.attachPaymentReceipt=(...args)=>{const task=attach(...args);attachments.push(task);return task;};
  }
  return{context,fields,writes,uploads,closed,messages,records,deleted,published,settleAttachments:()=>Promise.all(attachments)};
}

{
  let releaseUpload,releaseLink;
  const upload=new Promise(resolve=>releaseUpload=resolve),link=new Promise(resolve=>releaseLink=resolve);
  const h=harness({holdUpload:upload,holdLink:link});
  const saving=h.context.savePayment();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(h.closed,['modal-trainer-payment'],'The confirmed payment must close the editor even when the upload is still pending');
  assert.equal(await saving,true);
  assert.equal(h.fields['tb-payment-save'].disabled,false);
  assert.equal(h.published[0].amountCents,60000,'The confirmed payment appears before a listener or reload');
  assert.equal(h.context.receiptJobs.get('pay-stable').state,'uploading');
  releaseUpload();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.published.length,1,'Uploading the file alone must not display the receipt as linked');
  releaseLink();
  await h.settleAttachments();
  assert.equal(h.published[1].receiptName,'comprovante.jpg');
  assert.equal(h.context.receiptJobs.size,0);
}

{
  const h=harness({receiptFailure:true});
  await h.context.savePayment();await h.settleAttachments();
  assert.equal(h.writes.length,1,'O pagamento deve ser escrito antes de tentar enviar o arquivo.');
  assert.equal(h.writes[0].id,'pay-stable','O mesmo ID estável deve ser usado no documento.');
  assert.equal(h.writes[0].payload.amountCents,60000,'O valor precisa ser salvo em centavos inteiros.');
  assert.equal(h.writes[0].payload.durationMonths,6,'A duração do plano deve ser salva com o registro.');
  assert.equal(h.records.get('pay-stable')?.receiptPath||'','','O comprovante indisponível não deve apagar nem bloquear o registro.');
  assert.deepEqual(h.uploads,['comprovante.jpg'],'O comprovante só deve ser enviado depois da gravação principal.');
  assert.deepEqual(h.closed,['modal-trainer-payment'],'A falha do arquivo não deve deixar o formulário preso após salvar o pagamento.');
  assert.match(h.messages[0]?.message||'',/Pagamento salvo/,'A confirmação deve identificar o pagamento salvo.');
  assert.equal(h.context.receiptJobs.get('pay-stable').state,'failed','O comprovante deve ter seu próprio estado de falha.');
  assert.equal(h.fields['tb-payment-save'].disabled,false,'O botão precisa ser liberado após a tentativa.');
}

{
  const h=harness({primaryFailures:1});h.context.paymentFile=null;
  await h.context.savePayment();
  assert.equal(h.writes.length,1,'Primeira falha deve tentar uma única gravação.');
  assert.equal(h.context.pendingPaymentId,'pay-stable','O ID precisa permanecer estável quando o resultado da gravação é incerto.');
  assert.equal(h.fields['tb-payment-save'].disabled,false,'Falha da gravação deve liberar o botão para tentar novamente.');
  await h.context.savePayment();
  assert.deepEqual(h.writes.map(row=>row.id),['pay-stable','pay-stable'],'A nova tentativa não pode criar um segundo registro.');
  assert.equal(h.records.get('pay-stable')?.studentId,'student-a','A nova tentativa precisa permanecer vinculada ao mesmo aluno.');
  assert.deepEqual(h.closed,['modal-trainer-payment'],'Após a gravação confirmada, o formulário deve fechar.');
}

{
  const h=harness({linkFailure:true});await h.context.savePayment();await h.settleAttachments();
  assert.equal(h.records.get('pay-stable').receiptPath,'paymentReceipts/trainer-a/student-a/pay-stable.jpg','The server may commit the receipt link before a timeout reaches the client');
  assert.deepEqual(h.deleted,[],'An uncertain receipt link must not delete the file referenced by a late commit');
  assert.equal(h.context.paymentSaving,false);assert.equal(h.context.receiptJobs.get('pay-stable').state,'failed');
}

{
  let release;
  const upload=new Promise(resolve=>release=resolve),h=harness({holdUpload:upload});
  await h.context.savePayment();
  h.records.get('pay-stable').receiptPath='concurrent-replacement.jpg';
  release();
  await h.settleAttachments();
  assert.equal(h.writes.length,1,'An upload based on a stale receipt cannot replace the latest link');
  assert.equal(h.records.get('pay-stable').receiptPath,'concurrent-replacement.jpg');
}
{
  const h=harness();h.context.paymentFile=null;h.records.set('pay-stable',{trainerId:'trainer-a',studentId:'student-a',createdAt:{seconds:123},receiptPath:'existing-receipt.jpg',receiptName:'Original'});assert.equal(await h.context.savePayment(),true);
  assert.equal(h.records.get('pay-stable').receiptPath,'existing-receipt.jpg','A financial retry must not clear a receipt confirmed by another attempt');
  assert.deepEqual(h.records.get('pay-stable').createdAt,{seconds:123},'Retry must preserve immutable createdAt and stay compatible with the current Rules');
  assert(!Object.hasOwn(h.writes[0].payload,'createdAt'),'A retry of an existing document must not issue a new creation timestamp');
}
{
  let release;const gate=new Promise(r=>release=r),h=harness({holdPrimary:gate});const first=h.context.savePayment();
  await new Promise(r=>setImmediate(r));
  assert.equal(await h.context.savePayment(),false,'Double submit must not start a second write');assert.equal(h.writes.length,1);
  h.context.paymentFile={name:'another-file.jpg'};release();await first;await h.settleAttachments();assert.deepEqual(h.uploads,['comprovante.jpg'],'The selected file must be captured before the financial write');
}
for(const phase of ['primary','upload']){
  let release;const gate=new Promise(r=>release=r),h=harness(phase==='primary'?{holdPrimary:gate}:{holdUpload:gate});const saving=h.context.savePayment();await new Promise(r=>setImmediate(r));
  h.context.CURRENT_USER={uid:'trainer-b'};h.context.paymentEditorRequest++;h.context.pendingPaymentId='new-editor';h.context.receiptJobs.clear();release();await saving;await h.settleAttachments();
  assert.equal(h.context.pendingPaymentId,'new-editor','Late completion must not reset a different editor/session');assert.equal(h.closed.length,phase==='primary'?0:1);assert.equal(h.writes.length,1,'A stale session must not attach a receipt after the initial write');if(phase==='primary')assert.equal(h.uploads.length,0);
}
{
  const h=harness();h.records.set('pay-stable',{trainerId:'trainer-a',studentId:'another-student',createdAt:{seconds:123}});
  assert.equal(await h.context.savePayment(),false,'An existing payment ID cannot be reassigned to another student');assert.equal(h.writes.length,0);assert.equal(h.uploads.length,0);assert.equal(h.closed.length,0);
}
// Exercise the actual Storage path builder: replacing a receipt creates a new object.
{
 const start=source.indexOf('async function uploadReceipt('),end=source.indexOf('\n  async function attachPaymentReceipt',start),paths=[];
 const c=vm.createContext({cleanId:v=>String(v).replace(/[^A-Za-z0-9_-]/g,'').slice(0,190),receiptExtension:()=> 'jpg',withTimeout:p=>p,ensureStorageService:async()=>({ref:path=>({put:async()=>paths.push(path)})})});
 vm.runInContext(source.slice(start,end),c);await c.uploadReceipt('trainer-a','student-a','pay-stable',{},()=>true);await c.uploadReceipt('trainer-a','student-a','pay-stable',{},()=>true);
 assert.notEqual(paths[0],paths[1],'Receipt replacement must not overwrite the previous object before confirmation');assert(paths.every(p=>/^paymentReceipts\/trainer-a\/student-a\/[A-Za-z0-9_-]{1,190}\.jpg$/.test(p)),'Versioned path must remain compatible with the existing Rules');
}
console.log('APROVADO — pagamento aparece e fecha antes do envio, retry estável, comprovante atualiza após vínculo, falha separada, troca de sessão e proteção contra substituir comprovante mais recente.');

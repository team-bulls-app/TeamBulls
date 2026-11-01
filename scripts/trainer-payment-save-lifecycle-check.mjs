import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const modulePath='modules/trainer-inbox-payments-v10_10_12.js';
const source=fs.readFileSync(modulePath,'utf8');
const start=source.indexOf('async function savePayment(){');
const end=source.indexOf('\n  async function openReceipt',start);
assert(start>=0&&end>start,'Não foi possível localizar o salvamento de pagamentos.');
const saveSource=source.slice(start,end);

function harness({primaryFailures=0,receiptFailure=false}={}){
  const fields={
    'tb-payment-student':{value:'student-a'},'tb-payment-plan':{value:'semiannual'},
    'tb-payment-duration':{value:'6'},'tb-payment-amount':{value:'600'},
    'tb-payment-valid-from':{value:'2026-09-15'},'tb-payment-note':{value:''},
    'tb-payment-save':{disabled:false,textContent:'SALVAR PAGAMENTO'}
  };
  const writes=[],uploads=[],closed=[],messages=[],records=new Map();let failCount=primaryFailures;
  const context={
    CURRENT_USER:{uid:'trainer-a'},MODE:'cloud',trainer:()=>true,
    studentMap:new Map([['student-a',{uid:'student-a'}]]),
    paymentEditorId:'',pendingPaymentId:'pay-stable',pendingPaymentStudentId:'',
    paymentFile:{name:'comprovante.jpg',type:'image/jpeg'},paymentRecords:[],
    paymentCollection:uid=>({doc:id=>({set:(payload,options)=>{
      writes.push({uid,id,payload:{...payload},options});
      if(!Object.prototype.hasOwnProperty.call(payload,'receiptPath')||payload.receiptPath===''){
        if(failCount>0){failCount--;return Promise.reject(new Error('firestore-unavailable'));}
      }
      records.set(id,{...(records.get(id)||{}),...payload});return Promise.resolve();
    }})}),
    document:{getElementById:id=>fields[id]||null},
    iso:value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'',
    planMonths:type=>type==='annual'?12:type==='semiannual'?6:3,
    addCalendarMonths:(date,months)=>months===6?'2027-03-15':'2026-12-15',
    nowStamp:()=>({serverTimestamp:true}),cloudWrite:task=>task,
    uploadReceipt:async(_trainer,_student,_payment,file)=>{uploads.push(file.name);if(receiptFailure)throw new Error('storage-offline');return'paymentReceipts/trainer-a/student-a/pay-stable.jpg';},
    closeModal:id=>closed.push(id),revokePaymentPreview:()=>{},paymentPreviewUrl:'',
    toast:(message,error=false)=>messages.push({message,error}),fmtDate:value=>value
  };
  vm.createContext(context);vm.runInContext(saveSource,context);
  return{context,fields,writes,uploads,closed,messages,records};
}

{
  const h=harness({receiptFailure:true});
  await h.context.savePayment();
  assert.equal(h.writes.length,1,'O pagamento deve ser escrito antes de tentar enviar o arquivo.');
  assert.equal(h.writes[0].id,'pay-stable','O mesmo ID estável deve ser usado no documento.');
  assert.equal(h.writes[0].payload.amountCents,60000,'O valor precisa ser salvo em centavos inteiros.');
  assert.equal(h.writes[0].payload.durationMonths,6,'A duração do plano deve ser salva com o registro.');
  assert.equal(h.records.get('pay-stable')?.receiptPath,'','O comprovante indisponível não deve apagar nem bloquear o registro.');
  assert.deepEqual(h.uploads,['comprovante.jpg'],'O comprovante só deve ser enviado depois da gravação principal.');
  assert.deepEqual(h.closed,['modal-trainer-payment'],'A falha do arquivo não deve deixar o formulário preso após salvar o pagamento.');
  assert.match(h.messages[0]?.message||'',/Pagamento salvo, mas o comprovante não foi enviado/,'A confirmação deve distinguir o pagamento salvo do comprovante pendente.');
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

console.log('APROVADO — registro financeiro não fica dependente do upload do comprovante e retentativas reutilizam o mesmo documento.');

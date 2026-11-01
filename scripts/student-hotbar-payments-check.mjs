import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const read=file=>fs.readFileSync(file,'utf8');
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const studentPath='modules/student-hotbar-payments-v10_10_22.js';
const projectionPath='modules/trainer-billing-student-projection-v10_10_22.js';
const layoutPath='modules/student-home-layout-v10_10_15.js';
const configPath='config_v10_7.js';
const rulesPath='firebase/firestore_28_compacto.rules';

for(const file of [studentPath,projectionPath,layoutPath,configPath,rulesPath])assert(fs.existsSync(file),`Arquivo obrigatório ausente: ${file}`);
for(const file of [studentPath,projectionPath,configPath]){
  if(!fs.existsSync(file))continue;
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(result.status===0,`${file} possui JavaScript inválido: ${String(result.stderr||'').trim()}`);
}

const student=fs.existsSync(studentPath)?read(studentPath):'';
const projection=fs.existsSync(projectionPath)?read(projectionPath):'';
const layout=fs.existsSync(layoutPath)?read(layoutPath):'';
const config=fs.existsSync(configPath)?read(configPath):'';
const rules=fs.existsSync(rulesPath)?read(rulesPath):'';

has(layout,"['diet','DIETA','DIETA'",'Layout base deixou de fornecer o destino oficial da dieta/suprimentos.');
has(layout,"if(typeof openMeals==='function')openMeals()",'Destino oficial de suprimentos não usa mais openMeals().');

has(student,"const VERSION='10.10.22-studentpay2'",'Patch da hotbar não possui revisão própria.');
has(student,"const COLLECTION='studentBilling'",'Tela de pagamentos do aluno não usa a projeção segura.');
has(student,"nav.querySelector('[data-hotbar=\"supplements\"]')?.remove()",'Aba duplicada de suplementos não é removida.');
has(student,"diet.setAttribute('aria-label','SUPRIMENTOS')",'Aba Dieta não é renomeada para Suprimentos.');
has(student,"payments.dataset.hotbar='payments'",'Aba Pagamentos não é criada na hotbar.');
has(student,"payments.setAttribute('aria-label','PAGAMENTOS')",'Aba Pagamentos não possui rótulo acessível.');
has(student,"db.collection(COLLECTION).doc(uid())",'Aluno não lê exclusivamente o próprio documento financeiro.');
has(student,"showScreen('screen-student-payments')",'Aba Pagamentos não abre uma tela própria.');
lacks(student,"db.collection('trainerBilling')",'Tela do aluno tenta acessar a coleção financeira privada do treinador.');
lacks(student,'receiptPath','Tela do aluno expõe caminho de comprovante privado.');
lacks(student,'receiptName','Tela do aluno expõe nome de comprovante privado.');
lacks(student,'.note','Tela do aluno expõe observação privada do treinador.');

has(projection,"const VERSION='10.10.22-billingprojection2'",'Projeção financeira não possui revisão própria.');
has(projection,"db.collection('trainerBilling').doc(uid).collection('payments')",'Projeção não parte da coleção privada oficial.');
has(projection,"const TARGET_COLLECTION='studentBilling'",'Projeção não escreve no domínio seguro do aluno.');
has(projection,"schemaVersion:1,studentId:row.studentId,trainerId:uid,paymentId:row.paymentId,planType:row.planType,durationMonths:row.durationMonths,amountCents:row.amountCents,validFrom:row.validFrom,nextDueDate:row.nextDueDate,updatedAt:stamp()",'Payload da projeção não está fechado aos campos mínimos esperados.');
lacks(projection,'receiptPath','Projeção copia caminho de comprovante privado.');
lacks(projection,'receiptName','Projeção copia nome do comprovante privado.');
lacks(projection,'note:', 'Projeção copia observação privada do treinador.');
has(projection,"CURRENT_USER?.role==='trainer'",'Projeção não possui gate explícito de treinador.');
has(projection,"MODE!=='undefined'&&MODE==='cloud'",'Projeção não está limitada ao modo cloud.');

has(config,"'./modules/student-hotbar-payments-v10_10_22.js?v=10.10.22-studentpay2'",'Loader prioritário do aluno não entrega a nova hotbar/pagamentos.');
has(config,"MODULE_ROOT+'trainer-billing-student-projection-v10_10_22.js?v=10.10.22-billingprojection2'",'Projeção financeira não está protegida pelo gate de treinador.');
assert(config.indexOf('student-hotbar-payments-v10_10_22.js')>config.indexOf('student-home-layout-v10_10_15.js'),'Patch da hotbar precisa carregar depois do layout canônico.');
assert(config.indexOf('trainer-billing-student-projection-v10_10_22.js')>config.indexOf('trainer-inbox-payments-v10_10_12.js'),'Projeção precisa carregar depois do módulo financeiro oficial do treinador.');

has(rules,'match /trainerBilling/{trainerUid}','Domínio financeiro privado do treinador foi removido.');
has(rules,'allow read: if isTrainer() && request.auth.uid == trainerUid;','Leitura privada do trainerBilling deixou de exigir o próprio treinador.');
has(rules,'match /studentBilling/{studentUid}','Regras não possuem projeção financeira do aluno.');
has(rules,'activeOwner(studentUid)','Aluno não está limitado ao próprio documento ativo.');
has(rules,'allow create, update: if trainerOwns(studentUid)','Somente o treinador vinculado deve escrever a projeção.');
has(rules,"'schemaVersion','studentId','trainerId','paymentId','planType','durationMonths'",'Schema seguro da projeção não está fechado.');
has(rules,"'amountCents','validFrom','nextDueDate','updatedAt'",'Campos financeiros mínimos da projeção estão incompletos.');
has(rules,"request.resource.data.planType in ['quarterly','semiannual','annual','custom']",'Projeção aceita plano financeiro desconhecido.');
has(rules,'allow delete: if false;','Projeção financeira pode ser apagada pelo cliente.');
has(rules,'match /{document=**} { allow read, write: if false; }','Firestore perdeu o deny-all final.');

const projectionRule=rules.match(/match \/studentBilling\/\{studentUid\} \{([\s\S]*?)\n    \}/)?.[1]||'';
lacks(projectionRule,'receiptPath','Regra da projeção permite campo de comprovante.');
lacks(projectionRule,'receiptName','Regra da projeção permite nome do comprovante.');
lacks(projectionRule,"'note'",'Regra da projeção permite observação privada.');

if(failures.length){console.error('\nFALHA — hotbar/pagamentos do aluno\n- '+failures.join('\n- '));process.exit(1);}
console.log('APROVADO — Dieta→Suprimentos, aba duplicada removida e Pagamentos seguro/read-only protegidos.');

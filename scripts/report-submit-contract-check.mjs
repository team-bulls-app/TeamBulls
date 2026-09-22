import fs from 'node:fs';

const fail=[];
const read=file=>fs.readFileSync(file,'utf8');
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const required=[
  'firebase.json',
  'firebase/firestore_28_compacto.rules',
  'modules/student-report-submit-reconciliation-v10_10_57.js',
  'modules/heic-report-conversion-v10_10_12.js',
  'sw.js','sw_47.js'
];
for(const file of required)assert(fs.existsSync(file),`Arquivo obrigatório ausente: ${file}`);
if(fail.length){console.error(fail.join('\n'));process.exit(1);}

const firebase=JSON.parse(read('firebase.json'));
const rules=read('firebase/firestore_28_compacto.rules');
const submit=read('modules/student-report-submit-reconciliation-v10_10_57.js');
const heic=read('modules/heic-report-conversion-v10_10_12.js');
const sw=read('sw.js'),sw47=read('sw_47.js');

// Fonte canônica de autorização. GitHub e Firebase publicado são estados distintos;
// este teste impede o repositório de voltar silenciosamente a outra Rules.
assert(firebase?.firestore?.rules==='firebase/firestore_28_compacto.rules','firebase.json deixou de apontar para Rules 28.');
has(rules,'function activeOwner(uid)','Rules perderam a prova de aluno autenticado/ativo.');
has(rules,'function trainerOwns(uid)','Rules perderam o isolamento treinador → aluno.');
has(rules,'match /{document=**} { allow read, write: if false; }','Deny-all final das Rules 28 desapareceu.');

// Questionários: o aluno só conclui o próprio documento e não pode alterar
// identidade, treinador, perguntas ou metadados estruturais.
has(rules,'match /questionnaires/{id}','Rules não cobrem questionários.');
has(rules,'allow update: if activeOwner(resource.data.studentId)','Questionário não exige o próprio aluno ativo no update.');
has(rules,".hasOnly(['answers', 'answered', 'answeredAt', 'photoIds'])",'Questionário permite alterar campos além da resposta canônica.');
has(rules,"questionnaireMode(resource.data) == 'photos'",'Relatório legado somente de fotos voltou a depender de requestMode.');
has(rules,"questionnaireMode(resource.data) == 'written'",'Relatório escrito legado perdeu inferência segura.');
has(rules,"questionnaireMode(resource.data) == 'full'",'Relatório completo perdeu inferência segura.');
has(rules,'request.resource.data.photoIds.size() == 6','Fluxos fotográficos deixaram de exigir exatamente seis IDs.');

// Semanais: criação é do próprio aluno, vinculada à solicitação/agenda,
// usa exatamente o schema e os seis IDs determinísticos e fica imutável.
has(rules,'function weeklyPhotoIdsMatch(id, data)','Rules perderam o vínculo determinístico dos seis IDs de foto semanal.');
has(rules,'function weeklyRequestMatchesSchedule(data)','Rules perderam o vínculo entre relatório semanal e agenda legítima.');
has(rules,'match /weeklyCheckins/{id}','Rules não cobrem relatórios semanais.');
const weeklyStart=rules.indexOf('match /weeklyCheckins/{id}');
const weeklyEnd=rules.indexOf('match /progressPhotos/{id}',weeklyStart);
const weekly=weeklyStart>=0&&weeklyEnd>weeklyStart?rules.slice(weeklyStart,weeklyEnd):'';
has(weekly,'allow create: if activeOwner(request.resource.data.studentId)','Relatório semanal não exige o próprio aluno ativo.');
has(weekly,'request.resource.data.keys().hasOnly([','Semanal aceita campos arbitrários fora do schema canônico.');
has(weekly,"'studentId','requestKey','requestKind','dueDate','submittedDate','weight'",'Schema semanal não protege os metadados da solicitação.');
has(weekly,'requiredText(request.resource.data.requestKey, 220)','requestKey semanal não possui tipo/teto explícito.');
has(weekly,"request.resource.data.requestKind in ['scheduled', 'manual']",'Semanal aceita tipo de solicitação inválido.');
has(weekly,'isoDate(request.resource.data.dueDate)','Semanal não valida dueDate.');
has(weekly,'isoDate(request.resource.data.submittedDate)','Semanal não valida submittedDate.');
has(weekly,'weeklyRequestMatchesSchedule(request.resource.data)','Semanal não exige solicitação compatível com a agenda.');
has(weekly,'request.resource.data.sectionAt is map','Semanal não valida o mapa de seções.');
has(weekly,'request.resource.data.sectionAt.keys().size() <= 60','Mapa de seções semanal não possui limite.');
has(weekly,'request.resource.data.answers.size() == request.resource.data.questions.size()','Semanal pode divergir perguntas e respostas.');
has(weekly,'weeklyPhotoIdsMatch(id, request.resource.data)','Semanal não exige os seis IDs determinísticos do próprio documento.');
has(weekly,'request.resource.data.weight >= 20','Semanal perdeu limite mínimo de peso.');
has(weekly,'request.resource.data.weight <= 500','Semanal perdeu limite máximo de peso.');
has(weekly,'allow update, delete: if false','Semanal confirmado voltou a ser mutável.');
has(rules,"data.requestKey == 'scheduled:' + data.dueDate",'Solicitação semanal programada não amarra requestKey à data.');
has(rules,"data.requestKey == 'manual:' + checkinScheduleData(data.studentId).get('extraRequestId', '')",'Solicitação semanal extra não amarra requestKey ao pedido do treinador.');
has(rules,"data.dueDate == checkinScheduleData(data.studentId).get('extraRequestedAt', '')",'Relatório extra não amarra a data ao pedido do treinador.');
for(let index=1;index<=6;index++)has(rules,`data.photoIds[${index-1}] == id + '-p${index}'`,`Foto semanal ${index} perdeu o ID determinístico.`);

// Fotos dos relatórios ficam no Firestore/dataURL. O payload precisa caber nas
// Rules e o caminho canônico não pode voltar a tentar Storage antes do commit.
const photoStart=rules.indexOf('match /progressPhotos/{id}');
const photoEnd=rules.indexOf('match /',photoStart+10);
const photos=photoStart>=0?rules.slice(photoStart,photoEnd>photoStart?photoEnd:undefined):'';
has(photos,'allow create: if activeOwner(request.resource.data.userId)','Foto de progresso não exige o próprio aluno ativo.');
has(photos,"request.resource.data.get('dataUrl', '').size() <= 950000",'Teto Firestore das fotos divergiu do contrato atual.');
has(photos,"(request.resource.data.get('dataUrl', '') != '' || request.resource.data.get('photoPath', '') != '')",'Rules voltaram a aceitar foto vazia.');
has(submit,'const FIRESTORE_DATA_URL_MAX=620000','Cliente perdeu o teto conservador de dataURL abaixo das Rules.');
has(submit,'const MAX_COMMIT_BODY=7*1024*1024','Commit REST perdeu limite preventivo de payload.');
has(submit,"const VERSION='10.10.57-submitstate5'",'Envio canônico não usa a revisão que corrige permission-denied semanal.');
has(submit,'data.dataUrl=await firestorePhotoData(file,variants.full)','Foto do relatório não é preparada diretamente para Firestore.');
lacks(submit,"uploadCloudPhoto('progressPhotos'",'Relatório voltou a tentar Firebase Storage antes do Firestore.');
lacks(submit,"uploadCloudPhoto('progressPhotoThumbs'",'Relatório voltou a criar miniatura em Storage sem necessidade.');
lacks(submit,'deleteCloudPhoto(','Fluxo Firestore-only voltou a depender de cleanup de Storage.');
lacks(submit,'createdPaths','Fluxo Firestore-only voltou a manter estado de uploads externos.');

// Commit: seis fotos + conclusão devem permanecer atômicos. Resultado incerto é
// reconciliado por leitura; não existe retry automático/cego de escrita.
has(submit,"writes.push(patchWrite('questionnaires'",'Questionário não conclui no mesmo conjunto atômico das fotos.');
has(submit,"writes.push(createWrite('weeklyCheckins'",'Semanal não conclui no mesmo conjunto atômico das fotos.');
has(submit,"return fetchJson(commitUrl(),{method:'POST'",'Envio canônico deixou de usar commit REST único.');
has(submit,"currentDocument:{exists:false}",'Criação de foto/semanal perdeu precondição contra sobrescrita.');
has(submit,"currentDocument:{exists:true}",'Update do questionário perdeu precondição de existência.');
has(submit,"uncertain.set('q:'",'Questionário perdeu estado de confirmação para resultado de rede incerto.');
has(submit,"uncertain.set('w:'",'Semanal perdeu estado de confirmação para resultado de rede incerto.');
has(submit,"O app não fará reenvio automático",'Fluxo não deixa explícita a ausência de retry cego.');
lacks(submit,'setInterval(','Envio de relatórios não pode introduzir polling.');

// Um relatório semanal novo ainda não possui resource.data. Fazer GET direto em
// weeklyCheckins/{id} antes do create faz a regra de leitura negar o documento
// inexistente. Duplicação já é barrada atomicamente por currentDocument.exists:false.
const weeklySubmitStart=submit.indexOf('async function robustWeeklySubmit()');
const weeklyCommitStart=submit.indexOf("try{await restCommit(writes,'enviar relatório semanal');}",weeklySubmitStart);
const weeklyPreCommit=weeklySubmitStart>=0&&weeklyCommitStart>weeklySubmitStart?submit.slice(weeklySubmitStart,weeklyCommitStart):'';
assert(weeklyPreCommit.length>0,'Não foi possível isolar o preflight do envio semanal.');
lacks(weeklyPreCommit,"restGet('weeklyCheckins',checkinId)",'Semanal voltou a ler o documento inexistente antes do create e pode receber permission-denied.');
has(weeklyPreCommit,"writes.push(createWrite('weeklyCheckins',checkinId,checkinData))",'Semanal perdeu o create atômico protegido por precondição.');

// App Check e sessão acompanham o commit REST; não basta autenticar no SDK.
has(submit,"'Authorization':'Bearer '+idToken",'Commit REST perdeu autenticação Firebase do aluno.');
has(submit,"headers['X-Firebase-AppCheck']=tokenResult.token",'Commit REST perdeu App Check.');
has(submit,"appCheck.getToken(false)",'App Check deve usar token atual sem refresh cego a cada envio.');

// Falhas de foto e memória já corrigidas continuam cobertas no mesmo contrato.
has(heic,'const preparedJpegInputs=new WeakMap()','JPG voltou a exigir segunda decodificação integral no envio.');
has(heic,'preparedJpegInputs.delete(file);return baseDecode(prepared);','JPG preparado não é consumido de forma única.');

// Entrega PWA não pode divergir entre os dois workers.
assert(sw===sw47,'sw.js e sw_47.js divergiram.');
has(sw,"'/modules/heic-report-conversion-v10_10_12.js'",'Conversor/preparo de fotos precisa continuar network-first.');

if(fail.length){
  console.error('FALHA — contrato de envio de relatórios\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — envio de relatórios mantém 6 fotos, Firestore-only, agenda/schema semanais íntegros, create sem GET inexistente, atomicidade, App Check, Rules 28, isolamento por aluno, reconciliação sem retry cego e proteção PWA.');

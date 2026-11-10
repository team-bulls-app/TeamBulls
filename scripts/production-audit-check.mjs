import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(root,rel));
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

function extractMatchBlock(source,header){
  const start=source.indexOf(header);
  if(start<0)return'';
  const brace=source.indexOf('{',start+header.length);
  if(brace<0)return'';
  let depth=0;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(char==='{')depth++;
    else if(char==='}'){
      depth--;
      if(depth===0)return source.slice(start,index+1);
    }
  }
  return'';
}

const firebaseJson=JSON.parse(read('firebase.json'));
const activeRules=String(firebaseJson?.firestore?.rules||'').replace(/\\/g,'/');
const activeStorage=String(firebaseJson?.storage?.rules||'').replace(/\\/g,'/');
assert(/^firebase\/firestore_\d+_compacto\.rules$/.test(activeRules),'firebase.json não aponta para uma regra Firestore versionada esperada.');
assert(exists(activeRules),`Regra ativa não existe no repositório: ${activeRules}`);
assert(activeRules==='firebase/firestore_28_compacto.rules','Release atual deve usar Firestore Rules 28.');
assert(activeStorage==='firebase/storage_6.rules'&&exists(activeStorage),'Release atual deve usar Storage Rules 6 existente.');

if(exists(activeRules)){
  const firestore=read(activeRules);
  const privateDiet=extractMatchBlock(firestore,'match /dietCalculations/{uid}');
  const privateBilling=extractMatchBlock(firestore,'match /trainerBilling/{trainerUid}');
  const trainerActivity=extractMatchBlock(firestore,'match /trainerActivity/{trainerUid}');
  assert(privateDiet.length>0,'Regra ativa não protege dietCalculations.');
  has(privateDiet,'allow read: if trainerOwns(uid)','Cálculos privados não exigem vínculo do treinador na leitura.');
  has(privateDiet,'allow create: if trainerOwns(uid)','Cálculos privados não exigem vínculo do treinador na criação.');
  has(privateDiet,'allow update: if trainerOwns(uid)','Cálculos privados não exigem vínculo do treinador na atualização.');
  has(privateDiet,'allow delete: if trainerOwns(uid)','Cálculos privados não exigem vínculo do treinador na exclusão.');
  lacks(privateDiet,'activeOwner(','Aluno recebeu acesso direto à coleção privada dietCalculations.');
  assert(privateBilling.length>0,'Regra ativa não possui domínio financeiro privado trainerBilling.');
  has(privateBilling,'request.auth.uid == trainerUid','trainerBilling não está limitado ao treinador proprietário.');
  assert(trainerActivity.length>0,'Regra ativa não possui caixa agregada trainerActivity.');
  has(trainerActivity,'userData(request.resource.data.studentId).trainerId == trainerUid','Evento de aluno pode apontar para treinador não vinculado.');
  has(firestore,'match /{document=**} { allow read, write: if false; }','Regra ativa perdeu o deny-all final.');
}

if(exists(activeStorage)){
  const storage=read(activeStorage);
  has(storage,'match /paymentReceipts/{trainerUid}/{studentUid}/{fileName}','Storage ativo não possui namespace privado de comprovantes.');
  has(storage,'trainerOwns(studentUid)','Comprovante não exige vínculo do treinador ao aluno.');
  has(storage,'validPaymentReceipt(15 * 1024 * 1024)','Comprovante não possui limite de 15 MB.');
  has(storage,'match /{allPaths=**} { allow read, write: if false; }','Storage ativo perdeu o deny-all final.');
}

const config=read('config_v10_7.js');
const moduleMatches=[...config.matchAll(/'\.\/modules\/([^']+\.js\?[^']+)'/g)].map(match=>'modules/'+match[1].split('?')[0]);
const missingModules=[...new Set(moduleMatches)].filter(rel=>!exists(rel));
assert(missingModules.length===0,'Loader referencia módulos inexistentes: '+missingModules.join(', '));
assert(new Set(moduleMatches).size===moduleMatches.length,'Loader possui módulo duplicado.');
has(config,'if(!ok&&navigator.onLine&&visible())','Loader não tenta novamente após falha temporária de módulo opcional.');
has(config,'ok=await loadScriptOnce(src,Math.max(6500,Number(timeoutMs)||3200))','Nova tentativa de módulo não possui janela maior para rede lenta.');
has(config,'for(const src of modules){if(!sessionUiReady()||!visible())break;await loadScript(src);}','Loader perdeu a execução sequencial determinística.');
const portions=config.indexOf('diet-portion-presets-v10_10_9.js');
const release=config.indexOf('release-coherence-v10_10_10.js');
const trainerHub=config.indexOf('trainer-inbox-payments-v10_10_12.js');
assert(portions>=0&&release>portions,'Coerência de release precisa executar depois das extensões de dieta.');
assert(trainerHub>release,'Central/Pagamentos deve carregar depois da coerência de release.');

const releaseModule=read('modules/release-coherence-v10_10_10.js');
has(releaseModule,"const ACTIVE_FIRESTORE_RULES='firestore_28_compacto.rules'",'Camada de coerência aponta para regra Firestore incorreta.');
has(releaseModule,"replace(/firestore_(?:26|27)_compacto\\.rules/g,ACTIVE_FIRESTORE_RULES)",'Mensagem antiga de permissão não é corrigida para a regra ativa.');
has(releaseModule,"['TeamBullsDietCalculator',()=>!!window.TeamBullsDietCalculator]",'Diagnóstico de runtime não cobre calculadora da dieta.');
has(releaseModule,"['TeamBullsDietPortions',()=>!!window.TeamBullsDietPortions]",'Diagnóstico de runtime não cobre tabela de porções.');

const portionModule=read('modules/diet-portion-presets-v10_10_9.js');
lacks(portionModule,"db.collection(",'Tabela fixa de porções passou a gerar leitura/gravação Firestore desnecessária.');
has(portionModule,'window.TeamBullsDietPortions=Object.freeze','Tabela de porções não expõe a API esperada pelo runtime.');

const dietCalculation=read('modules/diet-calculation-evolution-v10_10_9.js');
has(dietCalculation,"const STORAGE_COLLECTION='dietCalculations'",'Calculadora privada deixou de usar coleção isolada.');
lacks(dietCalculation,"db.collection('mealPlans').doc(uid).set({schemaVersion",'Entradas internas da calculadora não podem ser persistidas junto da dieta visível ao aluno.');

const coreBytes=fs.statSync(path.join(root,'app_v10_10_9_core.js')).size;
const cssBytes=fs.statSync(path.join(root,'styles_v10_10_9.css')).size;
const indexBytes=fs.statSync(path.join(root,'index.html')).size;
assert(coreBytes<900*1024,'Núcleo ultrapassou o limite conservador de 900 KiB.');
assert(cssBytes<280*1024,'CSS principal ultrapassou o limite conservador de 280 KiB.');
assert(indexBytes<190*1024,'HTML principal ultrapassou o limite conservador de 190 KiB.');

if(failures.length){
  console.error('FALHA — auditoria de produção\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log(`APROVADO — regras ativas ${activeRules} / ${activeStorage}, módulos do loader, Central/Pagamentos, retry de rede e limites validados.`);

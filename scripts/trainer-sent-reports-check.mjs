import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const read=file=>fs.readFileSync(file,'utf8');
const moduleFile='modules/trainer-sent-reports-v10_10_52.js';
const runtimeFile='modules/trainer-runtime-reliability-v10_10_46.js';
const module=read(moduleFile);
const runtime=read(runtimeFile);
const rules=read('firebase/firestore_28_compacto.rules');

for(const file of [moduleFile,runtimeFile]){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
}

assert(module.includes("const VERSION='10.10.52-sentreports3'"),'Arquivo de relatórios enviados está na revisão errada.');
assert(runtime.includes("trainer-sent-reports-v10_10_52.js?v=10.10.52-sentreports3"),'Runtime do treinador não entrega o arquivo por propriedade histórica.');
assert(runtime.includes("const VERSION='10.10.52-trainer2'"),'Runtime do treinador não foi cache-bustado.');

// O arquivo deve existir mesmo se o aluno sumir do roster atual: trainerId do
// questionário é a fonte histórica e imutável de propriedade.
assert(module.includes("db.collection('questionnaires').where('trainerId','==',uid).limit(MAX_REPORTS)"),'Arquivo ainda depende do roster para descobrir relatórios do treinador.');
assert(module.includes("String(report.trainerId||'')===uid"),'Resultado global não é novamente isolado pelo treinador autenticado.');
assert(module.includes('loadNames(uid)'),'Arquivo não tenta enriquecer nomes sem tornar o roster fonte de verdade.');
assert(module.includes('runtimeStudents()'),'Nome conhecido no runtime não é preservado para aluno com vínculo inconsistente.');
assert(module.includes("return id?`Aluno · ${id.slice(-6)}`:'Aluno'"),'Relatório sem nome legível não possui fallback não destrutivo.');

assert(module.includes("filter==='pending'")&&module.includes("filter==='answered'"),'Arquivo precisa separar AGUARDANDO e RESPONDIDOS.');
assert(module.includes('Relatórios enviados — histórico e pendências'),'Painel não possui entrada explícita para o arquivo.');
assert(module.includes("screen-trainer-sent-reports"),'Tela própria de relatórios enviados não foi criada.');
assert(module.includes('await viewQuestionnaire(report.id,true)'),'Relatório respondido não reaproveita o visualizador de respostas/fotos.');
assert(module.includes('Status: AGUARDANDO RESPOSTA DO ALUNO'),'Pedido pendente não informa claramente que ainda aguarda resposta.');

// Somente leitura dos documentos canônicos.
assert(!module.includes('setInterval('),'Arquivo de relatórios não pode adicionar polling.');
assert(!module.includes('onSnapshot('),'Arquivo global deve carregar somente quando aberto/atualizado.');
assert(!module.includes('cloudWrite('),'Arquivo global deve ser somente leitura.');
assert(!/\.set\s*\(/.test(module),'Arquivo global não pode gravar documentos Firestore.');
assert(!/\.update\s*\(/.test(module),'Arquivo global não pode alterar documentos Firestore.');
assert(!/\.delete\s*\(/.test(module),'Arquivo global não pode excluir documentos Firestore.');

// Segurança: propriedade histórica só vale porque trainerId é definido pelo
// treinador na criação e fica imutável quando o aluno responde.
assert(rules.includes("|| (isTrainer() && resource.data.trainerId == request.auth.uid);"),'Rules não permitem leitura pelo proprietário histórico do questionário.');
assert(rules.includes("allow create: if trainerOwns(request.resource.data.studentId)"),'Criação deixou de exigir vínculo atual válido.');
assert(rules.includes("request.resource.data.trainerId == request.auth.uid"),'Criação não fixa o trainerId do treinador autenticado.');
assert(rules.includes("immutable('studentId') && immutable('trainerId')"),'Resposta do aluno poderia alterar a propriedade histórica.');

if(fail.length){
  console.error('FALHA — arquivo de relatórios enviados do treinador\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — arquivo de Relatórios enviados consulta diretamente os questionários pertencentes ao trainerId imutável, sem depender do roster e sem alterar os documentos originais.');

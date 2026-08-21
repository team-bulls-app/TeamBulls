import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const modulePath='modules/workflow-controls-v10_10_10.js';
assert(fs.existsSync(modulePath),'Módulo workflow-controls ausente.');
if(fs.existsSync(modulePath)){
  const syntax=spawnSync(process.execPath,['--check',modulePath],{encoding:'utf8'});
  assert(syntax.status===0,'workflow-controls possui JavaScript inválido: '+String(syntax.stderr||'').trim());
}

const workflow=fs.existsSync(modulePath)?read(modulePath):'';
const config=read('config_v10_7.js');
const sw=read('sw.js');
const legacySw=read('sw_47.js');

// Bloqueios de exercício/semana.
has(workflow,"const LOCK_FIELD='weeklyEditLocks'",'Bloqueios não possuem campo persistente próprio.');
has(workflow,'function materializeWeeks(exercise,weeks)','Bloquear semana não materializa a prescrição herdada.');
has(workflow,'function toggleCurrentWeekLock()','Controle de trancar/destrancar semana ausente.');
has(workflow,'function toggleExerciseLock()','Controle de trancar/destrancar 8 semanas ausente.');
has(workflow,'TRANCAR SEMANA','Botão de bloqueio da semana ausente.');
has(workflow,'TRANCAR 8 SEMANAS','Botão de bloqueio do exercício ausente.');
has(workflow,'if(!weekLocked(target,week))','Cópia em lote não preserva semana protegida.');
has(workflow,"input:checked:not(:disabled)",'Cópia em lote pode incluir destino visualmente bloqueado.');
has(workflow,'filter(exercise=>!weekLocked(exercise,week))','Aplicação em massa de técnicas não exclui exercícios protegidos.');
has(workflow,'techniqueLockConflict','Super set pode alterar parceiro protegido sem validação.');

// Agenda semanal: a data passa a nascer do envio real, e relatório extra não reinicia o ciclo.
has(workflow,'function nextScheduledDueFromSubmission(schedule,checkins)','Cálculo do próximo relatório a partir do envio ausente.');
has(workflow,".filter(item=>String(item?.requestKind||'scheduled')!=='manual'",'Relatório extra pode reiniciar a agenda semanal.');
has(workflow,'return addDaysIso(last.submittedDate,interval);','Próxima entrega não é calculada a partir da data real de envio.');
has(workflow,'7 dias após o último envio','Interface não explica a nova regra de 7 dias após envio.');
lacks(workflow,"db.collection('checkinSchedules').doc(studentUid).update",'Aluno ganhou gravação direta indevida na agenda semanal.');
lacks(workflow,"db.collection('checkinSchedules').doc(studentUid).set",'Módulo novo não deve ampliar escrita do aluno em checkinSchedules.');

// Feedback livre: backdrop não captura cliques, janela captura, move e minimiza.
has(workflow,'#modal-feedback.tb-feedback-float{pointer-events:none','Backdrop de feedback continua bloqueando a tela atrás.');
has(workflow,'.feedback-editor-sheet{pointer-events:auto','Editor de feedback deixou de receber interação.');
has(workflow,'function startFeedbackDrag(event)','Janela de feedback não pode ser movida.');
has(workflow,'setFeedbackMinimized','Janela de feedback não pode ser minimizada.');
has(workflow,'openFeedbackForWeeklyReport','Relatório semanal não possui ação de feedback contextual.');
has(workflow,'sourceType','Feedback contextual não registra a origem do relatório/atualização.');
has(workflow,"message.length>30000",'Limite de 30.000 caracteres do feedback extenso não foi preservado.');

// Entrega/cache: módulo deve rodar após as camadas de prescrição e antes da estabilidade final de modais.
has(config,'workflow-controls-v10_10_10.js?v=10.10.10-workflow1','Loader não entrega workflow-controls com cache-bust próprio.');
assert(config.indexOf('prescription-propagation-v10_10_9.js')<config.indexOf('workflow-controls-v10_10_10.js'),'Workflow controls precisa executar depois das camadas de propagação.');
assert(config.indexOf('workflow-controls-v10_10_10.js')<config.indexOf('modal-stack-stability-v10_10_9.js'),'Workflow controls precisa executar antes da estabilidade final de modais.');
for(const [name,text] of [['sw.js',sw],['sw_47.js',legacySw]]){
  // O cache pode avançar em hotfixes posteriores; o que não pode regredir é voltar
  // para uma revisão anterior a workflow1 ou deixar de preparar o módulo.
  assert(/const CACHE_HOTFIX='(?:workflow1|audit1)'/.test(text),`${name} não possui cache compatível com workflow-controls ou evolução posterior.`);
  has(text,'security-hardening-v10_10_9.js?v=10.10.10-security7',`${name} ainda prepara security6 antigo.`);
  has(text,'legacy-student-link-repair-v10_10_10.js?v=10.10.10-legacy-links5',`${name} ainda prepara legacy-links4 antigo.`);
  has(text,'workflow-controls-v10_10_10.js?v=10.10.10-workflow1',`${name} não prepara workflow-controls offline.`);
}

if(fail.length){
  console.error('FALHA — workflow controls check\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — bloqueios, agenda pós-envio, feedback flutuante e cache verificados.');

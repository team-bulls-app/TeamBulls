import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(root,rel));
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);

const reportPath='modules/report-photo-ux-v10_10_10.js';
const auditPath='modules/usability-audit-v10_10_10.js';
const lockBridgePath='modules/prescription-lock-bridge-v10_10_10.js';
const gerBridgePath='modules/ger-lock-bridge-v10_10_10.js';
for(const [file,message] of [
  [reportPath,'Módulo de fotos rápidas em relatórios ausente.'],
  [auditPath,'Módulo de auditoria de usabilidade ausente.'],
  [lockBridgePath,'Ponte entre propagação direcional e trancas ausente.'],
  [gerBridgePath,'Ponte entre GER em lote e trancas ausente.']
])assert(exists(file),message);
if(failures.length){console.error('\nFalhas da auditoria de relatórios/usabilidade:\n- '+failures.join('\n- '));process.exit(1);}

const report=read(reportPath),audit=read(auditPath),lockBridge=read(lockBridgePath),gerBridge=read(gerBridgePath),config=read('config_v10_7.js'),sw=read('sw.js'),sw47=read('sw_47.js');

// Fotos do relatório: grade leve, clicável e sem seis originais simultâneos.
has(report,"const MAX_RECORD_CACHE=180",'Cache curto de registros fotográficos não está limitado.');
has(report,"where('userId','==',uid)",'Consulta agrupada de fotos não está vinculada ao aluno atual.');
has(report,"FieldPath.documentId(),'in',ids",'Consulta agrupada de até seis fotos não está presente.');
has(report,"db.collection('progressPhotos').doc(id)",'Fallback individual de fotos antigas/ambientes incompatíveis ausente.');
has(report,'seedGlobalPhotoCache(uid,ordered)','Fotos de relatório não entram no cache usado pelo visualizador.');
has(report,'data-photo-record="progress"','Miniaturas do relatório não usam o hidratador seguro existente.');
has(report,'hydrateSecureImages(grid)','Miniaturas não usam carregamento lazy/thumbnail existente.');
has(report,"openPhotoView(button.dataset.tbReportPhoto,true)",'Foto dentro do relatório não é clicável para ampliar.');
has(report,"resolvePhotoSource(p,{full:false})",'Visualizador não antecipa a miniatura leve enquanto a versão completa carrega.');
has(report,"openModal('modal-photo-view')",'Visualizador de foto não abre imediatamente.');
assert(!report.includes("Promise.all((checkin.photoIds||[]).slice(0,6).map")&&!report.includes("resolvePhotoSource(record,{full:CURRENT_USER?.role==='trainer'})"),'Relatório voltou a carregar seis fotos originais simultaneamente.');

// Regressões encontradas na combinação workflow-controls + modal-stack + guard.
has(audit,'#modal-feedback.tb-feedback-float{pointer-events:none!important','Feedback flutuante pode voltar a bloquear a tela atrás.');
has(audit,'#modal-feedback.tb-feedback-float .feedback-editor-sheet{pointer-events:auto!important','Editor de feedback perdeu interação própria.');
has(audit,"button.id='tb-feedback-open-reports'",'Feedback flutuante não oferece acesso direto aos relatórios.');
has(audit,"Você já tem um feedback em edição",'Novo feedback pode sobrescrever um rascunho já aberto.');
has(audit,"Descartar o feedback que está sendo escrito?",'Fechamento pode apagar feedback extenso sem confirmação.');
has(audit,"#tb-lock-week-btn,#tb-lock-exercise-btn",'Bloqueios não verificam alterações não salvas.');
has(audit,"WEEK_TECHNIQUE_EDITOR_DIRTY",'Bloqueio não protege técnicas semanais ainda não salvas.');
has(audit,"collectPrescriptionRows",'Bloqueio não compara séries/GER visíveis com a prescrição salva.');
has(audit,"v104CopyPrescriptionToAll.__tbAuditNoopGuard",'Cópia para todos não possui proteção para fonte alterada sem destinos alteráveis.');
has(audit,"salvar prescrição da fonte",'Prescrição da fonte não é persistida no caso de destinos iguais/protegidos.');
has(audit,"modal.dataset.tbNonblockingModal!=='1'",'ESC não diferencia feedback não bloqueante de modais de relatório/foto.');
has(audit,"tbModalOpenSeq",'ESC não considera a ordem real de abertura dos modais.');
has(audit,"startsWith('blob:')",'Retorno por BFCache não limpa URLs blob revogadas.');
has(audit,'hydrateSecureImages(document)','Retorno por BFCache não reidrata imagens seguras.');

// Ações direcionais tinham listeners privados e conseguiam passar por fora de weeklyEditLocks.
has(lockBridge,"const CENTER_ID='tb-prescription-actions-center'",'Ponte de trancas não protege o centro novo de ações.');
has(lockBridge,"if(locked(exercise,week)){counter.protected++;continue;}",'Propagação de séries não pula semanas trancadas.');
has(lockBridge,"Repassar preservando trancas",'Usuário não é avisado de que destinos protegidos serão preservados.');
has(lockBridge,"kind==='technique'",'Propagação direcional de técnicas não é interceptada.');
has(lockBridge,"técnicas e vínculos de Super set não podem ser aplicados parcialmente",'Técnicas podem atravessar trancas e quebrar vínculo de Super set.');
has(lockBridge,"event.stopImmediatePropagation()",'Listener privado antigo ainda pode executar depois da proteção.');

// GER em lote também existia antes das trancas e precisava de ponte própria.
has(gerBridge,'window.TeamBullsGerBulk=Object.freeze','GER em lote não é redirecionado para versão compatível com trancas.');
has(gerBridge,'if(locked(item,week)){protectedCount++;continue;}','GER da semana pode editar exercício trancado.');
has(gerBridge,'if(locked(exercise,current)){protectedWeeks++;continue;}','GER das 8 semanas pode editar semana trancada.');
has(gerBridge,"resolveWeekPrescription(snapshot,current)",'GER das semanas destrancadas não materializa corretamente prescrições herdadas ao redor de uma semana protegida.');
has(gerBridge,"closest('#tb-save-series-only')",'Salvar somente séries pode sugerir gravação em semana trancada.');

// Ordem é intencional: workflow -> pontes de tranca -> fotos -> auditoria -> monitor final de modais.
const workflowIndex=config.indexOf('workflow-controls-v10_10_10.js?v=10.10.10-workflow1');
const lockIndex=config.indexOf('prescription-lock-bridge-v10_10_10.js?v=10.10.10-lockbridge1');
const gerLockIndex=config.indexOf('ger-lock-bridge-v10_10_10.js?v=10.10.10-gerlock1');
const reportIndex=config.indexOf('report-photo-ux-v10_10_10.js?v=10.10.10-reportphotos1');
const auditIndex=config.indexOf('usability-audit-v10_10_10.js?v=10.10.10-audit1');
const modalIndex=config.indexOf('modal-stack-stability-v10_10_9.js?v=10.10.9-modal2&fix=freeze1');
assert(workflowIndex>=0&&lockIndex>workflowIndex&&gerLockIndex>lockIndex&&reportIndex>gerLockIndex&&auditIndex>reportIndex&&modalIndex>auditIndex,'Ordem dos hotfixes de tranca/relatório/auditoria está incorreta.');

for(const [name,source] of [['sw.js',sw],['sw_47.js',sw47]]){
  has(source,"const CACHE_HOTFIX='audit1'",`${name} não força a nova shell da auditoria.`);
  has(source,"./modules/report-photo-ux-v10_10_10.js?v=10.10.10-reportphotos1",`${name} não prepara fotos rápidas de relatório.`);
  has(source,"./modules/usability-audit-v10_10_10.js?v=10.10.10-audit1",`${name} não prepara auditoria de usabilidade.`);
}

if(failures.length){
  console.error('\nFalhas da auditoria de relatórios/usabilidade:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('Report/usability audit OK — fotos rápidas, trancas em todas as rotas de propagação e regressões recentes protegidas.');

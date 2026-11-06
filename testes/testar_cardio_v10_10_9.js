const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const core=fs.readFileSync(path.join(root,'app_v10_10_9_core.js'),'utf8');
const css=fs.readFileSync(path.join(root,'styles_v10_10_9.css'),'utf8');
function fail(message){console.error('FALHA:',message);process.exit(1);}
const htmlTokens=['id="screen-cardio"','id="screen-ts-cardio"','id="modal-cardio-item"','openCardioFromWorkout(false)','openCardioFromWorkout(true)','openCardioFromDiet(false)','openCardioFromDiet(true)','id="input-cardio-type"','id="input-cardio-duration"','id="input-cardio-frequency"'];
for(const token of htmlTokens)if(!html.includes(token))fail('interface de cardio ausente: '+token);
const coreTokens=["const V10109_VERSION='10.10.9'",'function normalizeCardioDocument(value)','function openCardioFromWorkout(trainerMode=false)','function openCardioFromDiet(trainerMode=false)','function startCardioTimer()','function pauseCardioTimer()','function resetCardioTimer()','function saveCardioItem()','function moveCardioSubstitution(id,delta)','function persistCardioMutation(context,mutate)',"db.collection('mealPlans').doc(context.cardio.targetUid)","transaction.set(ref,{cardioPlan:next,cardioUpdatedBy:context.userUid","mergeFields:['cardioPlan','cardioUpdatedBy','cardioUpdatedAt']",'Cada substituição possui modalidade, duração, frequência e timer próprios.'];
for(const token of coreTokens)if(!core.includes(token))fail('núcleo de cardio ausente: '+token);
const cssTokens=['.context-section-tabs','.cardio-prescription-card','.cardio-timer-card','.cardio-timer-clock','.cardio-editor-grid'];
for(const token of cssTokens)if(!css.includes(token))fail('CSS de cardio ausente: '+token);
if((html.match(/id="screen-cardio"/g)||[]).length!==1||(html.match(/id="screen-ts-cardio"/g)||[]).length!==1)fail('telas de cardio duplicadas');
console.log('APROVADO: cardio compartilhado em treino e dieta, substituições individuais e cronômetros prescritos.');

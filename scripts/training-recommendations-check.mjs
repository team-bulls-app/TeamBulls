import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const core=fs.readFileSync('app_v10_10_9_core.js','utf8'),block=core.slice(core.indexOf('// Protocol-wide training/rest guidance'));
// Guest startup can synchronously navigate before the bottom of the core runs.
// Its modal cleanup must work before these feature state initializers execute.
const close=core.match(/function closeModal\(id\)\{[\s\S]*?\n\}/)[0];
vm.runInNewContext(close+"\ncloseModal('modal-training-recommendations');\n"+block,{document:{getElementById:()=>null}});
const progress=core.slice(core.indexOf('// Trainer progression: read-only history'),core.indexOf('// Protocol-wide training/rest guidance'));
vm.runInNewContext('closeTrainerProgress();\n'+progress,{document:{getElementById:()=>null}});
let writes=[],owner='a',exists=true,fail=false,afterRead=null,locked=false;
const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:''});return elements.get(id);};
const workout={id:'w',name:'Treino 4 dias',days:[{name:'Superior'}],exercises:[{id:'e'}]};
const context=vm.createContext({console,CURRENT_USER:{role:'trainer',uid:'coach'},VIEW_STUDENT:{uid:'a'},VIEW_STUDENT_WORKOUT:workout,MODE:'cloud',
 document:{getElementById:element,querySelectorAll:()=>[{value:'0'},{value:'3'}]},
 esc:s=>String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;'),
 beginAction:()=>{if(locked)return false;locked=true;return true;},endAction:()=>{locked=false;},
 renderTsWorkout(){},closeModal:()=>vm.runInContext('TRAINING_RECOMMENDATIONS_CONTEXT=null',context),showToast(){},
 db:{collection:name=>{assert.equal(name,'workouts');return{doc:id=>({id})};},runTransaction:async fn=>{
  const staged=[];await fn({get:async()=>{if(afterRead)afterRead();return{exists,data:()=>({userId:owner})};},update:(ref,payload)=>staged.push({ref,payload})});
  if(fail)throw new Error('conexão indisponível');writes.push(...staged);
 }},cloudWrite:async promise=>promise
});
vm.runInContext(block,context);const run=s=>vm.runInContext(s,context);
function prepare(){run('TRAINING_RECOMMENDATIONS_CONTEXT={workout:VIEW_STUDENT_WORKOUT,studentUid:"a",trainerUid:"coach"}');element('training-frequency').value='Treine 2 dias e descanse 1; treine os outros 2 dias, descanse 2 dias e repita.';}
assert.equal(run('normalizeTrainingRecommendations(null).frequency'),'');
assert.equal(run('JSON.stringify(normalizeTrainingRecommendations({frequency:" x ",weekdays:[6,0,6,-1,7,"1"]}))'),'{"frequency":"x","weekdays":[0,6]}');
prepare();await run('saveTrainingRecommendations()');assert.equal(writes.length,1);assert.deepEqual(Object.keys(writes[0].payload),['trainingRecommendations']);assert.equal(workout.days[0].name,'Superior');assert.equal(workout.trainingRecommendations.weekdays.join(','),'0,3');
context.CURRENT_USER.role='student';prepare();await run('saveTrainingRecommendations()');assert.equal(writes.length,1,'Students cannot write');context.CURRENT_USER.role='trainer';
prepare();owner='other';await run('saveTrainingRecommendations()');assert.equal(writes.length,1,'Mismatched owner cannot write');assert.match(element('training-recommendations-status').textContent,/não pertence/);owner='a';
prepare();exists=false;await run('saveTrainingRecommendations()');assert.equal(writes.length,1);exists=true;
prepare();afterRead=()=>{context.VIEW_STUDENT={uid:'b'};};await run('saveTrainingRecommendations()');assert.equal(writes.length,1,'Navigation during read prevents write');context.VIEW_STUDENT={uid:'a'};afterRead=null;
prepare();fail=true;await run('saveTrainingRecommendations()');assert.equal(writes.length,1);assert.match(element('training-recommendations-status').textContent,/Seu texto continua/);assert.match(element('training-frequency').value,/Treine 2 dias/);assert.equal(locked,false);fail=false;
await run('saveTrainingRecommendations()');assert.equal(writes.length,2,'Retry saves same draft');
prepare();element('training-frequency').value='x'.repeat(801);await run('saveTrainingRecommendations()');assert.equal(writes.length,2);
workout.trainingRecommendations={frequency:'<img src=x>\nTreine 2 dias',weekdays:[]};assert.match(run('trainingRecommendationsHtml(VIEW_STUDENT_WORKOUT)'),/&lt;img/);assert.match(run('trainingRecommendationsHtml(VIEW_STUDENT_WORKOUT)'),/Sem dias fixos/);
context.CURRENT_USER.role='student';assert(!run('trainingRecommendationsHtml(VIEW_STUDENT_WORKOUT)').includes('EDITAR FREQUÊNCIA'));assert(run('trainingRecommendationsHtml(VIEW_STUDENT_WORKOUT)').includes('Treine 2 dias'));
assert(core.includes("${dayName?'':trainingRecommendationsHtml(workout)}"),'Both student and trainer protocol summaries must show guidance');
console.log('PASS training recommendations: normalization, cycle text, weekdays, student read-only, owner and navigation guards, failed-save draft, retry and minimal update.');

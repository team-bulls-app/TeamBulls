import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const marker='const BC_PRESCRIPTION_TARGET=';
const start=core.indexOf(marker);
assert(start>0,'Tratamento da técnica BC não foi encontrado no núcleo.');
const rangeFromPdf=core.match(/exerciseHasBcTechnique\(ex,week\)\?BC_PRESCRIPTION_TARGET:set\.targetMin\+'-'\+set\.targetMax\+' reps'/g)||[];
assert.equal(rangeFromPdf.length,1,'PDF deve usar a mesma orientação só nas semanas BC.');

function classes(){const values=new Set();return{contains:name=>values.has(name),toggle(name,on){if(on)values.add(name);else values.delete(name);}};}
function textTarget(text){return{value:text,querySelector:()=>null,set textContent(value){this.value=value;},get textContent(){return this.value;}};}
const exercise={id:'exercise-1',techniqueIdsByWeek:{1:['custom-bc-42'],2:['custom-other']}};
const numericInputs=[{value:'8',classList:classes()},{value:'12',classList:classes()}];
const row={classList:classes(),label:null,querySelectorAll:selector=>selector==='input.set-edit-input'?numericInputs:[],querySelector(selector){if(selector==='.bc-target-value')return this.label;if(selector==='select')return {};return null;},insertBefore(label){this.label=label;label.remove=()=>{this.label=null;};}};
const picker={inputs:[{value:'custom-bc-42',checked:true}],querySelector(){return this.inputs[0]||null;},querySelectorAll(){return this.inputs.filter(input=>input.checked);}};
const minLabel={textContent:'Reps mín.'},maxLabel={textContent:'Reps máx.'},modal={classList:classes()};
const cardTarget=textTarget('8–12 reps'),sessionTarget=textTarget('8–12 reps');
const card={querySelectorAll:()=>[cardTarget]};
const map={
  'modal-prescription':modal,'prescription-editor':{querySelectorAll:()=>[row]},
  'prescription-min-label':minLabel,'prescription-max-label':maxLabel,
  'input-prescription-week':{value:'1'},'week-technique-picker':picker,
  'prescription-card-test':card
};
const context={
  document:{head:{appendChild(){}},createElement:()=>({}),getElementById:id=>map[id]||null,querySelectorAll:selector=>selector.includes('#sets-editor')?[sessionTarget]:[]},
  TECHNIQUE_CATALOG:{items:[{id:'custom-bc-42',code:'BC'},{id:'custom-other',code:'MP'}]},
  getPlanEditExercise:()=>exercise,exerciseTechniqueIds:(item,week)=>item?.techniqueIdsByWeek?.[week]||[],
  exerciseUsesResistedTime:()=>false,getE:()=>exercise,SESSION_WID:'w1',SESSION_EID:'exercise-1',
  onWeekTechniqueSelectionChange(){minLabel.textContent='Reps mín.';maxLabel.textContent='Reps máx.';},
  loadPrescriptionEditor(){},addPrescriptionSetRow(){},removePrescriptionSet(){},copyPreviousPrescription(){},refreshBackoffPrescriptionRow(){},
  prescriptionCompactSummary:()=>({rx:{sets:[{targetMin:8,targetMax:12,ger:3}]},reps:'1×8–12 reps',ger:'GER 03'}),
  renderExercisePrescription(){cardTarget.textContent='8–12 reps';},populateSessionEditorForWeek(){sessionTarget.textContent='8–12 reps';}
};
vm.createContext(context);
vm.runInContext(core.slice(start),context);

context.loadPrescriptionEditor();
assert(modal.classList.contains('bc-target-active'));
assert.equal(row.label?.textContent,'Carga para 5 a 6');
assert(numericInputs.every(input=>input.classList.contains('bc-hidden-target')));
assert.equal(minLabel.textContent,'REPETIÇÕES');
assert.equal(numericInputs[0].value,'8');
assert.equal(numericInputs[1].value,'12');
assert.equal(context.prescriptionCompactSummary(exercise,1).reps,'Carga para 5 a 6');
assert.equal(context.prescriptionCompactSummary(exercise,2).reps,'1×8–12 reps');
context.renderExercisePrescription(exercise,'prescription-card-test',1);
assert.equal(cardTarget.textContent,'Carga para 5 a 6');
context.populateSessionEditorForWeek(1);
assert.equal(sessionTarget.textContent,'Carga para 5 a 6');

picker.inputs[0].checked=false;
context.onWeekTechniqueSelectionChange(true);
assert(!modal.classList.contains('bc-target-active'));
assert.equal(row.label,null);
assert(numericInputs.every(input=>!input.classList.contains('bc-hidden-target')));
assert.equal(minLabel.textContent,'Reps mín.');
assert.equal(numericInputs[0].value,'8');
assert.equal(numericInputs[1].value,'12');
exercise.techniqueIdsByWeek[1]=[];
assert.equal(context.prescriptionCompactSummary(exercise,1).reps,'1×8–12 reps');
context.renderExercisePrescription(exercise,'prescription-card-test',1);
assert.equal(cardTarget.textContent,'8–12 reps');
console.log('APROVADO — BC mostra “Carga para 5 a 6” no editor, card, sessão e semana; retirar BC restaura os números sem reescrever a prescrição.');

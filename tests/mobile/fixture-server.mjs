import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),core=read('app_v10_10_9_core.js');
const slice=(a,b)=>{const at=core.indexOf(a),end=core.indexOf(b,at);if(at<0||end<0)throw new Error(a);return core.slice(at,end);};
const source=name=>{const at=core.indexOf('function '+name+'(');if(at<0)throw new Error(name);const line=core.slice(at).split('\n')[0].trimEnd();return line.endsWith('}')?line:core.slice(at,core.indexOf('\n}',at)+2);};
const modules=['workflow-model','workflow-storage','workflow-sync','workflow-drafts','prescription-workflow','isometry-series-timer','feedback-media'].map(name=>'modules/'+name+'-v10_10_71.js');
const setup=`
window.errors=[];window.messages=[];window.saved=[];window.alarms=0;window.writes=0;window.uploads=0;window.remote=new Map();window.objects=new Map();window.dropUpload=false;window.dropAck=false;
addEventListener('error',e=>errors.push(e.error?.stack||e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
let CURRENT_USER={uid:'student-test',role:'student'},MODE='cloud',LOCAL_OWNER_UID='',VIEW_STUDENT=null,VIEW_STUDENT_WORKOUT=null;
let SESSION_WID='w',SESSION_EID='e',EDIT_SESSION_WID='w',EDIT_SESSION_EID='e',EDIT_SESSION_ID='old',SET_COUNT=0,EDIT_SET_COUNT=0;
let SESSION_EDITOR_WEEK=1,LAST_SESSION_WEEK=1;
let REST_INTERVAL=null,REST_REMAINING=0,REST_TOTAL=0,REST_PAUSED=false,REST_END_AT=0,REST_CLUSTER_CLOCK=null;
const TECHNIQUE_CATALOG={items:[{id:'it',name:'Isometria tradicional'},{id:'is',name:'Isometria de sustentação'},{id:'custom',name:'Isometria na parede'}]};
window.exercise={id:'e',name:'Cadeira flexora',weeks:{1:['it'],2:[]},sets:[{targetMin:120,targetMax:240,ger:3,unit:'seconds'}]};
const sessionExerciseForSave=()=>exercise,getE=()=>exercise,exerciseTechniqueIds=(ex,w=1)=>ex.weeks[w]||[],inferExerciseTechniqueWeek=()=>Number(document.getElementById('input-session-week').value)||1;
const exerciseHasTechnique=(ex,id,week)=>exerciseTechniqueIds(ex,week).includes(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prescribedRangeLabel=s=>s.targetMin+'–'+s.targetMax,formatGerLevel=v=>'GER '+v,renderGerMeter=()=>'',updateBackoffLoadSuggestion=()=>{},renderSessionPrescriptionSummary=()=>{};
function showToast(m,e){messages.push({message:m,error:!!e});}function cloudWrite(p){return p;}function cloudGet(p){return p.get();}function withTimeout(p,ms){return Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms))]);}
window.confirm=()=>true;window.alert=m=>messages.push({message:m});
function openModal(id){document.getElementById(id)?.classList.add('open');}function closeModal(id){document.getElementById(id)?.classList.remove('open');}
function openLogSessionModal(){openModal('modal-session');populateSessionEditorForWeek(document.getElementById('input-session-week').value);}
function populateSessionEditorForWeek(){SET_COUNT=0;document.getElementById('sets-editor').replaceChildren();for(const set of exercise.sets)addSetRow('','',set);}
function saveSession(){const sets=normalizePerformedSets(readSessionSetRows('sets-editor'));if(!sets)return false;saved.push(sets);return true;}
function saveEditSession(){const sets=normalizePerformedSets(readSessionSetRows('edit-sets-editor'));if(!sets)return false;saved.push(sets);return true;}
let editHistory=[{weight:40,reps:35,unit:'seconds',targetMin:120,targetMax:240,ger:3}];
function openEditSession(){EDIT_SET_COUNT=0;document.getElementById('edit-sets-editor').replaceChildren();for(const set of editHistory)addEditSetRow(set.weight,set.reps,set,set.clusterReps??null);openModal('modal-edit-session');}const findSessionOwner=()=>({session:{sets:editHistory}}),getPlanEditExercise=()=>exercise,currentWeekTechniqueEditorConfig=()=>null;
window.openClusterExample=(count=2,min=8,max=12)=>{
  exercise.weeks={1:['cs'],2:[],3:['cs','it']};
  exercise.sets=Array.from({length:count},()=>({targetMin:min,targetMax:max,ger:3}));
  openLogSessionModal();
};
window.editClusterExample=()=>{editHistory=saved[0];closeModal('modal-session');openEditSession();};
window.TeamBullsCardioAlert={prime(){},restFinished(){alarms++;}};
let WEEKLY_CHECKIN_REQUEST={requestKey:'scheduled:2026-11-18'},WEEKLY_CHECKIN_FILES=Array(6).fill(null),QUESTIONNAIRE_REPORT_FILES=Array(6).fill(null),CUR_ANSWER_QUEST_ID='report-test';
function openWeeklyCheckinModal(){document.getElementById('weekly-checkin-weight').value='';document.querySelector('[data-weekly-question]').value='';WEEKLY_CHECKIN_FILES=Array(6).fill(null);openModal('modal-weekly-checkin');}
function openFeedbackModal(){document.getElementById('input-feedback').value='';openModal('modal-feedback');}function sendFeedback(){window.plainFeedback=true;}
const v1010FeedbackType=v=>v||'extra',v1010FeedbackFields=v=>({feedbackType:v}),v1010FeedbackLabel=()=> 'Feedback visual',validIsoDate=v=>!!v;let V109_PROTOCOL_REVIEW_SCHEDULE=null;const v109ProtocolState=()=>null;
const firebase={firestore:{FieldPath:{documentId:()=> '__name__'},FieldValue:{serverTimestamp:()=>123}}};
const db={collection:()=>({where(field,op,value){const filters=[[field,value]];const query={where(f,o,v){filters.push([f,v]);return query;},get:async()=>({docs:[...remote].filter(([id,d])=>filters.every(([f,v])=>(f==='__name__'?id:d[f])===v)).map(([id,d])=>({id,data:()=>structuredClone(d)}))})};return query;},doc:id=>({set:async data=>{writes++;remote.set(id,structuredClone(data));if(dropAck){dropAck=false;throw new Error('timeout-after-commit');}}})})};
async function ensureStorageService(){return{ref:path=>({getMetadata:async()=>{const o=objects.get(path);if(!o)throw Object.assign(new Error('not found'),{code:'storage/object-not-found'});return{size:o.size,contentType:o.type};},put:blob=>{uploads++;objects.set(path,blob);if(dropUpload){dropUpload=false;return Promise.reject(new Error('upload-ack-lost'));}return Promise.resolve();},getDownloadURL:async()=>{const o=objects.get(path);if(!o)throw new Error('not found');return URL.createObjectURL(o);}})};}
let CUR_PHOTO_ID='photo-test',PHOTOS_CACHE=[{id:'photo-test',userId:'student-test'}];function openPhotoView(){openModal('modal-photo-view');return true;}
window.asTrainer=()=>{CURRENT_USER={uid:'coach-test',role:'trainer'};VIEW_STUDENT_WORKOUT={id:'w',name:'Treino de teste',startDate:'2026-11-18',updateDate:'2027-01-13',days:[{id:'d',name:'Pernas'},{id:'empty',name:'Dia vazio'}],exercises:[{...exercise,dayName:'Pernas',instructions:'Mantenha a posição',weeklyPlan:{}}]};VIEW_STUDENT={uid:'student-test',name:'Aluno',workouts:[VIEW_STUDENT_WORKOUT]};};
window.activations=0;function activateTrainerWorkout(){activations++;return true;}function activateDietPlan(){activations++;return true;}
const getWorkoutDays=w=>w.days,exercisesForDay=(w,n)=>w.exercises.filter(e=>e.dayName===n),resolveWeekPrescription=e=>({sets:e.sets}),effectivePrescriptionSets=(e,s)=>s,exerciseResultUnit=(e,w)=>exerciseUsesResistedTime(e,w)?'seg':'reps',techniqueItemsForExercise=(e,w)=>(e.weeks[w]||[]).map(id=>TECHNIQUE_CATALOG.items.find(t=>t.id===id)).filter(Boolean),findExerciseGroup=()=>null;
window.asStudent=()=>{CURRENT_USER={uid:'student-test',role:'student'};VIEW_STUDENT=null;};
window.testImage=()=>{const canvas=document.createElement('canvas');canvas.width=180;canvas.height=240;const c=canvas.getContext('2d');c.fillStyle='#ddd';c.fillRect(0,0,180,240);c.fillStyle='#553';c.fillRect(40,30,80,190);return canvas.toDataURL('image/jpeg');};
window.addTestImage=async()=>{const blob=await(await fetch(testImage())).blob();return TeamBullsFeedbackMedia.add(blob,'Cópia de teste','photo-test');};
`+['normalizePrescriptionSet','validClusterReps','normalizePerformedSet','normalizePerformedSets','exerciseUsesResistedTime','clusterBlockInputs','readSessionSetRows','renumberPerformedSetRows','addEditSetRow','sessionEditorHasData','onSessionWeekChange','startRestTimer','restTick','renderRestTick','resetRestTimer','sessionPerformedResult'].map(source).join('\n')+'\n'+slice('function usesTraditionalCluster(', 'removeSet=function(btn)')+'\n'+slice('const addEditSetRowV101=addEditSetRow;', 'const workoutPdfHtmlV101=');
const modal=(id,title,contents)=>'<div id="'+id+'" class="modal-backdrop"><div class="modal-sheet"><div class="modal-title">'+title+'</div>'+contents+'</div></div>';
const ui=modal('modal-edit-session','Editar registro','<select id="edit-session-week" onchange="onEditSessionWeekChange()"><option>1</option><option>2</option></select><div id="edit-sets-editor"></div><button onclick="saveEditSession()">SALVAR ALTERAÇÕES</button>')+modal('modal-session','Registrar resultado','<label>Semana<select id="input-session-week" onchange="onSessionWeekChange()"><option>1</option><option>2</option><option>3</option></select></label><div id="sets-editor"></div><div class="rest-timer"><span id="rest-timer-display"></span><span id="rest-timer-bar"></span><div id="rest-timer-presets"></div><div id="rest-timer-controls"><button id="rest-timer-toggle-btn">Pausar</button></div></div><button class="btn-primary" onclick="saveSession()">SALVAR REGISTRO</button>')+
modal('modal-weekly-checkin','Relatório semanal','<div class="form-group"><label>Peso</label><input id="weekly-checkin-weight" type="number"></div><div class="form-group"><label>Como foi a semana?</label><textarea data-weekly-question="0"></textarea></div>'+Array.from({length:6},(_,i)=>'<input id="weekly-photo-'+i+'" type="file" accept="image/*" onchange="WEEKLY_CHECKIN_FILES['+i+']=this.files[0]">').join(''))+
modal('modal-feedback','Feedback','<div class="form-group"><label>Tipo<select id="input-feedback-type"><option value="extra">Extra</option></select></label></div><div class="form-group"><label>Título<input id="input-feedback-title"></label></div><div class="form-group"><label>Mensagem<textarea id="input-feedback"></textarea></label></div><button onclick="sendFeedback()">TRANSMITIR FEEDBACK</button>')+
modal('modal-photo-view','Foto de teste','<img id="photo-view-img" style="max-width:100%"><div id="photo-view-meta"></div>');
const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0}input,textarea,select{font-size:16px;max-width:100%}.modal-sheet{box-sizing:border-box}button{min-height:44px}#screen-settings{display:none}</style><body><div id="screen-settings"></div>'+ui+'<script src="/setup.js"></script>'+modules.map(file=>'<script src="/'+file+'"></script>').join('')+'</body></html>';
const trainerDashboard=read('index.html').split('<!-- TRAINER DASHBOARD -->')[1].split('<!-- TRAINER VIEWING STUDENT -->')[0].replace('class="screen" id="screen-trainer"','class="screen active" id="screen-trainer"');
const queueHtml='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body>'+trainerDashboard+
  '<script src="/queue-setup.js"></script><script src="/modules/workflow-model-v10_10_71.js"></script><script src="/modules/workflow-sync-v10_10_71.js"></script></body></html>';
const queueSetup=`
let CURRENT_USER={uid:'queue-coach',role:'trainer'},VIEW_STUDENT=null;
window.TeamBullsWorkflowStorage={owner:()=>CURRENT_USER.uid};
const student={uid:'queue-student',name:'Alex da Silva Pereira dos Santos Júnior'};
const todayIso=()=> '2026-11-23';
window.queueCalls=0;window.queueMode='ready';window.queueVisits=[];
window.TeamBullsTrainerIntelligenceData={
  todayIso,
  dayDiff:()=>3,
  addDays:()=> '2026-11-26',
  protocolState:()=>({pending:true,nextDueDate:'2026-11-20'}),
  async loadDashboard(){
    queueCalls++;
    if(queueMode==='fail')throw new Error('offline fixture');
    if(queueMode==='hold')await new Promise(resolve=>{window.finishQueue=resolve;});
    return {
      rows:[{student,protocolSchedule:{sourceWorkoutId:'w',startDate:'2026-10-01'}}],
      activity:Array.from({length:7},(_,index)=>({studentId:student.uid,type:'weekly_checkin',sourceId:'report-'+index,submittedDate:'2026-11-'+(16+index)}))
    };
  }
};
function viewStudent(uid){VIEW_STUDENT={uid};}
function openTsWorkout(id){queueVisits.push({student:VIEW_STUDENT.uid,workout:id});}
window.setQueueAccount=(uid,role)=>{CURRENT_USER={uid,role};dispatchEvent(new Event('team-bulls-runtime-state'));};
`;
// A separate food fixture runs the canonical catalog, rendering and choice persistence.
const foodSetup=`let CURRENT_USER={uid:'student-test',role:'student'},MODE='local';
const meal={id:'meal-test',items:'0,25 porção de carboidrato\\n1 porção de proteína\\nÁgua'},variant={id:'variant-test',meals:[meal]},plan={id:'diet-test',variants:[variant]};
const DIET_CONTEXT={targetUid:'student-test'},MEAL_CTX={targetUid:'student-test',listId:'diet-meals-list',emptyId:'diet-meals-empty',canToggleDone:true},MEAL_PLAN_CACHE={meals:[meal]},FOOD_CATALOG_VERSION=2;
const currentDiet=()=>plan,currentDietVariant=()=>variant,today=()=> '2026-11-18',uid=()=>crypto.randomUUID(),esc=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;'),jsArg=JSON.stringify,isMealDoneToday=()=>false,loadFoodOptions=async()=>FOOD_OPTIONS,showToast=()=>{};async function openDietDetail(){}
${slice('function normalizedName(','function sessionFingerprint(')}
${slice('function defaultFoodOptions(','const DEFAULT_EXERCISE_VIDEO_URLS=')}
const FOOD_OPTIONS=defaultFoodOptions();
${slice('function renderMealsList(','function openAddMealModal(')}
window.errors=[];addEventListener('error',e=>errors.push(e.error?.stack||e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.mixedRow=()=>[...document.querySelectorAll('[data-tb-food-row]')].find(row=>JSON.parse(row.dataset.tbFoodRow).at(-1)==='misc');`;
const food='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><div id="diet-meals-list"></div><div id="diet-meals-empty"></div><script src="/food-setup.js"></script><script src="/modules/student-food-choices-v10_10_64.js"></script></body></html>';
const server=http.createServer((req,res)=>{let content,type='text/javascript';if(req.url==='/'){content=html;type='text/html';}else if(req.url==='/food'){content=food;type='text/html';}else if(req.url==='/trainer-queue'){content=queueHtml;type='text/html';}else if(req.url==='/queue-setup.js')content=queueSetup;else if(req.url==='/setup.js')content=setup;else if(req.url==='/food-setup.js')content=foodSetup;else if(req.url==='/styles.css'){content=read('styles_v10_10_9.css');type='text/css';}else if(/^\/modules\/[a-zA-Z0-9_-]+\.js$/.test(req.url)){try{content=read(req.url.slice(1));}catch{res.writeHead(404);res.end();return;}}else{res.writeHead(404);res.end();return;}res.setHeader('Content-Type',type+';charset=utf-8');res.end(content);});
server.listen(43871,'127.0.0.1');

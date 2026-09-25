(()=>{
  'use strict';

  const VERSION='10.10.10-dietcalc1';
  const STORAGE_COLLECTION='dietCalculations';
  const MAX_EVOLUTION_POINTS=12;
  const profileCache=new Map();
  let activeCalculatorUid='';

  function math(){return window.TeamBullsDietMath;}
  function trainer(){return typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer';}
  function student(){return typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='student';}
  function selectedStudentUid(){return String(typeof DIET_CONTEXT!=='undefined'&&DIET_CONTEXT?.targetUid||typeof VIEW_STUDENT!=='undefined'&&VIEW_STUDENT?.uid||'');}
  function h(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function number(value,fallback=0){const parsed=Number(String(value??'').replace(',','.'));return Number.isFinite(parsed)?parsed:fallback;}
  function fmtNumber(value,digits=0){return Number(value||0).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});}
  function fmtDate(value){try{return typeof fmt==='function'?fmt(value):String(value||'');}catch(error){return String(value||'');}}
  function toast(message,error=false){if(typeof showToast==='function')showToast(message,error);}
  function timestamp(){return firebase.firestore.FieldValue.serverTimestamp();}

  function injectStyles(){
    if(document.getElementById('tb-diet-calc-evolution-style'))return;
    const style=document.createElement('style');style.id='tb-diet-calc-evolution-style';style.textContent=`
      .tb-diet-calc-shell,.tb-evolution-card{margin:14px 0;border:1px solid rgba(225,29,72,.28);border-radius:14px;background:linear-gradient(180deg,rgba(225,29,72,.055),rgba(15,15,15,.94));box-shadow:0 12px 32px rgba(0,0,0,.18);overflow:hidden}
      .tb-diet-calc-head{display:flex;gap:14px;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
      .tb-diet-calc-head>div{min-width:0}.tb-diet-calc-head span,.tb-evolution-kicker{display:block;font:700 10px/1.2 'DM Mono',monospace;letter-spacing:1.1px;color:#e11d48}.tb-diet-calc-head strong{display:block;margin-top:5px;font:800 18px/1.05 'Barlow Condensed',sans-serif;letter-spacing:.5px;color:var(--text,#efefef)}
      .tb-diet-calc-head small{display:block;margin-top:5px;color:var(--text-dim,#888);font-size:11px;line-height:1.35}.tb-diet-calc-toggle{flex:0 0 auto;border:1px solid rgba(225,29,72,.5);background:rgba(225,29,72,.12);color:#ff6682;border-radius:8px;padding:9px 12px;font:800 10px 'DM Mono',monospace;letter-spacing:.6px;cursor:pointer}
      .tb-diet-calc-body{padding:14px 16px 16px}.tb-diet-calc-body[hidden]{display:none!important}.tb-calc-private-note{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;margin-bottom:13px;border:1px solid rgba(34,197,94,.22);border-radius:9px;background:rgba(34,197,94,.055);font-size:11px;line-height:1.45;color:#a7b7ac}.tb-calc-private-note b{color:#86efac}
      .tb-calc-grid{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px}.tb-calc-grid.macros{grid-template-columns:repeat(4,minmax(120px,1fr));margin-top:10px}.tb-calc-field{display:flex;flex-direction:column;gap:5px}.tb-calc-field label{font:700 9px 'DM Mono',monospace;letter-spacing:.7px;color:var(--text-dim,#888);text-transform:uppercase}.tb-calc-field input,.tb-calc-field select{width:100%;min-width:0;border:1px solid rgba(255,255,255,.11);border-radius:8px;background:#101010;color:var(--text,#efefef);padding:9px 10px;font:600 13px 'Barlow',sans-serif;outline:none}.tb-calc-field input:focus,.tb-calc-field select:focus{border-color:rgba(225,29,72,.65);box-shadow:0 0 0 2px rgba(225,29,72,.08)}.tb-calc-section-title{margin:14px 0 8px;font:800 11px 'DM Mono',monospace;letter-spacing:1px;color:#b8aaa1}.tb-calc-help{margin:8px 0 0;color:#756d67;font-size:10px;line-height:1.45}
      .tb-calc-results{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:8px;margin-top:14px}.tb-calc-result{padding:11px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(255,255,255,.025)}.tb-calc-result span{display:block;color:#827a75;font:700 9px 'DM Mono',monospace;letter-spacing:.55px;text-transform:uppercase}.tb-calc-result strong{display:block;margin-top:6px;color:#f2eee9;font:800 20px 'Barlow Condensed',sans-serif}.tb-calc-result.accent strong{color:#ff526f}.tb-calc-result.good strong{color:#86efac}
      .tb-macro-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px}.tb-macro-table th,.tb-macro-table td{padding:8px 7px;border-bottom:1px solid rgba(255,255,255,.06);text-align:right}.tb-macro-table th:first-child,.tb-macro-table td:first-child{text-align:left}.tb-macro-table th{font:700 8px 'DM Mono',monospace;color:#776f69;letter-spacing:.6px;text-transform:uppercase}.tb-macro-table td{color:#c8c2bd}.tb-macro-table tr:last-child td{border-bottom:0}.tb-calc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.tb-calc-actions button{border-radius:8px;padding:10px 12px;font:800 9px 'DM Mono',monospace;letter-spacing:.55px;cursor:pointer}.tb-calc-save{border:1px solid #e11d48;background:#b30e35;color:#fff}.tb-calc-secondary{border:1px solid rgba(255,255,255,.12);background:#121212;color:#bbb}.tb-calc-status{margin-top:8px;min-height:16px;font:600 10px 'DM Mono',monospace;color:#837a74}
      .tb-evolution-card{padding:14px 16px}.tb-evolution-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.tb-evolution-title{font:800 18px 'Barlow Condensed',sans-serif;color:#eee}.tb-evolution-sub{font-size:10px;color:#777;margin-top:3px}.tb-evolution-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:12px}.tb-evolution-stat{padding:9px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.02)}.tb-evolution-stat span{display:block;font:700 8px 'DM Mono',monospace;letter-spacing:.5px;color:#756d67;text-transform:uppercase}.tb-evolution-stat strong{display:block;margin-top:4px;font:800 17px 'Barlow Condensed',sans-serif;color:#e8e2dd}.tb-evolution-chart{border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#0d0d0d;padding:8px;overflow:hidden}.tb-evolution-chart svg{display:block;width:100%;height:auto;min-height:150px}.tb-evolution-empty{padding:22px 12px;text-align:center;color:#756d67;font-size:11px}.tb-evolution-dates{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font:600 8px 'DM Mono',monospace;color:#655e59}.tb-evolution-note{margin-top:9px;font-size:10px;line-height:1.4;color:#746c66}
      @media(max-width:900px){.tb-calc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tb-calc-grid.macros{grid-template-columns:repeat(2,minmax(0,1fr))}.tb-calc-results{grid-template-columns:repeat(2,minmax(0,1fr))}.tb-evolution-stats{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:520px){.tb-diet-calc-head{align-items:flex-start;flex-direction:column}.tb-diet-calc-toggle{width:100%}.tb-calc-grid,.tb-calc-grid.macros,.tb-calc-results{grid-template-columns:1fr 1fr}.tb-calc-actions button{flex:1 1 100%}.tb-evolution-card{padding:12px}.tb-evolution-head{align-items:flex-start;flex-direction:column}}
    `;document.head.appendChild(style);
  }

  function calculatorShell(uid){
    const anchor=document.getElementById('ts-diet-energy-summary');if(!anchor||!trainer()||!uid)return null;
    let shell=document.getElementById('tb-diet-calculator');
    if(!shell){shell=document.createElement('section');shell.id='tb-diet-calculator';shell.className='tb-diet-calc-shell';anchor.parentNode.insertBefore(shell,anchor);}
    if(shell.dataset.studentUid!==uid){
      shell.dataset.studentUid=uid;activeCalculatorUid='';
      shell.innerHTML=`<div class="tb-diet-calc-head"><div><span>FERRAMENTA INTERNA DO TREINADOR</span><strong>Cálculo metabólico e da dieta</strong><small>TMB, GCD, peso de cálculo e macronutrientes com as fórmulas da planilha-base.</small></div><button class="tb-diet-calc-toggle" type="button" onclick="TeamBullsDietCalculator.toggle()">ABRIR CÁLCULO</button></div><div class="tb-diet-calc-body" id="tb-diet-calc-body" hidden></div>`;
    }
    return shell;
  }

  async function readLatestWeight(uid){
    try{
      const items=typeof fetchWeeklyCheckins==='function'?await fetchWeeklyCheckins(uid):[];
      const latest=(items||[]).find(item=>number(item?.weight)>0);
      return latest?number(latest.weight):0;
    }catch(error){return 0;}
  }

  async function loadProfile(uid,force=false){
    if(!trainer()||!uid||typeof db==='undefined'||!db)return null;
    if(!force&&profileCache.has(uid))return profileCache.get(uid);
    try{
      const ref=db.collection(STORAGE_COLLECTION).doc(uid);
      const doc=typeof cloudGet==='function'?await cloudGet(ref,'cálculo privado da dieta'):await ref.get();
      const data=doc.exists?{...doc.data(),_exists:true}:{studentId:uid,trainerId:CURRENT_USER.uid,_exists:false};
      profileCache.set(uid,data);return data;
    }catch(error){
      console.error('Team Bulls diet calculation profile',error);toast('Não foi possível carregar o cálculo privado agora.',true);return null;
    }
  }

  function fieldValue(body,name){return body.querySelector(`[data-calc="${name}"]`)?.value??'';}
  function profileDefaults(profile,latestWeight=0){
    const macros=profile?.macros&&typeof profile.macros==='object'?profile.macros:{};
    return{
      sex:profile?.sex==='female'?'female':'male',
      actualWeightKg:number(profile?.actualWeightKg,latestWeight||70),heightCm:number(profile?.heightCm,170),ageYears:number(profile?.ageYears,30),activityFactor:number(profile?.activityFactor,1.5),
      referenceMode:['real','ideal','manual'].includes(profile?.referenceMode)?profile.referenceMode:'real',manualReferenceWeightKg:number(profile?.manualReferenceWeightKg,0),manualAdjustmentKcal:number(profile?.manualAdjustmentKcal,0),
      macros:{animalProtein:number(macros.animalProtein),plantProtein:number(macros.plantProtein),carbs:number(macros.carbs),fat:number(macros.fat)}
    };
  }

  function calculatorFormHtml(values){
    return`<div class="tb-calc-private-note"><span>🔒</span><div><b>Privado do treinador.</b> Estes dados são gravados em uma coleção separada da dieta do aluno. O aluno não recebe acesso a TMB, FA, GCD, peso usado no cálculo ou macronutrientes internos.</div></div>
      <div class="tb-calc-section-title">DADOS PARA O CÁLCULO</div>
      <div class="tb-calc-grid">
        <div class="tb-calc-field"><label>Sexo da fórmula</label><select data-calc="sex"><option value="male"${values.sex==='male'?' selected':''}>Masculino</option><option value="female"${values.sex==='female'?' selected':''}>Feminino</option></select></div>
        <div class="tb-calc-field"><label>Peso atual (kg)</label><input data-calc="actualWeightKg" type="number" min="20" max="500" step="0.1" value="${h(values.actualWeightKg)}"></div>
        <div class="tb-calc-field"><label>Altura (cm)</label><input data-calc="heightCm" type="number" min="100" max="250" step="1" value="${h(values.heightCm)}"></div>
        <div class="tb-calc-field"><label>Idade</label><input data-calc="ageYears" type="number" min="10" max="100" step="1" value="${h(values.ageYears)}"></div>
        <div class="tb-calc-field"><label>FA</label><input data-calc="activityFactor" list="tb-fa-presets" type="number" min="1" max="2.5" step="0.05" value="${h(values.activityFactor)}"><datalist id="tb-fa-presets"><option value="1.3"><option value="1.4"><option value="1.5"><option value="1.6"><option value="1.7"></datalist></div>
        <div class="tb-calc-field"><label>Peso usado na fórmula</label><select data-calc="referenceMode"><option value="real"${values.referenceMode==='real'?' selected':''}>Peso atual</option><option value="ideal"${values.referenceMode==='ideal'?' selected':''}>Peso ideal da planilha</option><option value="manual"${values.referenceMode==='manual'?' selected':''}>Manual</option></select></div>
        <div class="tb-calc-field"><label>Peso manual (kg)</label><input data-calc="manualReferenceWeightKg" type="number" min="20" max="500" step="0.1" value="${values.manualReferenceWeightKg?h(values.manualReferenceWeightKg):''}" placeholder="Somente modo manual"></div>
        <div class="tb-calc-field"><label>Ajuste manual do gasto</label><input data-calc="manualAdjustmentKcal" type="number" min="-5000" max="5000" step="25" value="${h(values.manualAdjustmentKcal)}"></div>
      </div>
      <div class="tb-calc-help">FA da planilha: 1,3 sedentário · 1,4 levemente ativo · 1,5 treino/cardio iniciante–intermediário com rotina pouco ativa · 1,6 treino/cardio avançado com rotina pouco ativa · 1,7 rotina muito ativa. O ajuste manual é separado da fórmula-base e permanece sob decisão do treinador.</div>
      <div class="tb-calc-section-title">MACRONUTRIENTES TOTAIS DA DIETA (OPCIONAL)</div>
      <div class="tb-calc-grid macros">
        <div class="tb-calc-field"><label>Proteína animal (g)</label><input data-calc="animalProtein" type="number" min="0" max="2000" step="1" value="${h(values.macros.animalProtein)}"></div>
        <div class="tb-calc-field"><label>Proteína vegetal (g)</label><input data-calc="plantProtein" type="number" min="0" max="2000" step="1" value="${h(values.macros.plantProtein)}"></div>
        <div class="tb-calc-field"><label>Carboidratos (g)</label><input data-calc="carbs" type="number" min="0" max="3000" step="1" value="${h(values.macros.carbs)}"></div>
        <div class="tb-calc-field"><label>Gorduras (g)</label><input data-calc="fat" type="number" min="0" max="1000" step="1" value="${h(values.macros.fat)}"></div>
      </div>
      <div id="tb-calc-results"></div>
      <div class="tb-calc-actions"><button class="tb-calc-save" type="button" onclick="TeamBullsDietCalculator.save()">SALVAR CÁLCULO PRIVADO</button><button class="tb-calc-secondary" type="button" onclick="TeamBullsDietCalculator.prefillGet()">USAR GET NA TABELA DA DIETA</button><button class="tb-calc-secondary" type="button" onclick="TeamBullsDietCalculator.prefillTrainingVet()">USAR KCAL DOS MACROS NO VET TREINO</button><button class="tb-calc-secondary" type="button" onclick="TeamBullsDietCalculator.openEvolution()">VER EVOLUÇÃO DO ALUNO</button></div><div class="tb-calc-status" id="tb-calc-status"></div>`;
  }

  function valuesFromBody(body){
    return{
      sex:fieldValue(body,'sex'),actualWeightKg:number(fieldValue(body,'actualWeightKg')),heightCm:number(fieldValue(body,'heightCm')),ageYears:number(fieldValue(body,'ageYears')),activityFactor:number(fieldValue(body,'activityFactor'),1.5),referenceMode:fieldValue(body,'referenceMode'),manualReferenceWeightKg:number(fieldValue(body,'manualReferenceWeightKg')),manualAdjustmentKcal:number(fieldValue(body,'manualAdjustmentKcal')),
      macros:{animalProtein:number(fieldValue(body,'animalProtein')),plantProtein:number(fieldValue(body,'plantProtein')),carbs:number(fieldValue(body,'carbs')),fat:number(fieldValue(body,'fat'))}
    };
  }

  function validate(values){
    if(values.actualWeightKg<20||values.actualWeightKg>500)return'Informe peso entre 20 e 500 kg.';
    if(values.heightCm<100||values.heightCm>250)return'Informe altura entre 100 e 250 cm.';
    if(values.ageYears<10||values.ageYears>100)return'Informe idade entre 10 e 100 anos.';
    if(values.activityFactor<1||values.activityFactor>2.5)return'Informe FA entre 1,0 e 2,5.';
    if(values.referenceMode==='manual'&&(values.manualReferenceWeightKg<20||values.manualReferenceWeightKg>500))return'Informe um peso manual válido.';
    return'';
  }

  function renderResults(){
    const body=document.getElementById('tb-diet-calc-body'),host=document.getElementById('tb-calc-results');if(!body||!host||!math())return null;
    const values=valuesFromBody(body),error=validate(values);if(error){host.innerHTML=`<div class="tb-calc-status">${h(error)}</div>`;return null;}
    const result=math().calculate(values),m=result.macros,balanceClass=result.energyBalanceKcal<=0?'good':'accent';
    const balanceText=m.totalKcal?`${result.energyBalanceKcal>0?'+':''}${fmtNumber(result.energyBalanceKcal)} kcal`:'—';
    host.innerHTML=`<div class="tb-calc-results"><div class="tb-calc-result"><span>Peso ideal</span><strong>${fmtNumber(result.idealWeightKg,1)} kg</strong></div><div class="tb-calc-result"><span>Peso de cálculo</span><strong>${fmtNumber(result.referenceWeightKg,1)} kg</strong></div><div class="tb-calc-result"><span>TMB</span><strong>${fmtNumber(result.tmbKcal)} kcal</strong></div><div class="tb-calc-result"><span>GCD base</span><strong>${fmtNumber(result.baseGcdKcal)} kcal</strong></div><div class="tb-calc-result accent"><span>GET final</span><strong>${fmtNumber(result.finalGcdKcal)} kcal</strong></div><div class="tb-calc-result"><span>Kcal dos macros</span><strong>${m.totalKcal?fmtNumber(m.totalKcal)+' kcal':'—'}</strong></div><div class="tb-calc-result ${balanceClass}"><span>Saldo dieta − GET</span><strong>${balanceText}</strong></div></div>
      <table class="tb-macro-table"><thead><tr><th>Macro</th><th>g</th><th>kcal</th><th>%</th><th>g/kg</th></tr></thead><tbody>${macroRow('Proteína animal',m.animalProtein)}${macroRow('Proteína vegetal',m.plantProtein)}${macroRow('Carboidratos',m.carbs)}${macroRow('Gorduras',m.fat)}</tbody></table>`;
    body.dataset.finalGcd=String(result.finalGcdKcal);body.dataset.macroKcal=String(m.totalKcal||0);return result;
  }
  function macroRow(label,row){return`<tr><td>${h(label)}</td><td>${fmtNumber(row.grams,1)}</td><td>${fmtNumber(row.kcal)}</td><td>${fmtNumber(row.percent,1)}%</td><td>${fmtNumber(row.gramsPerKg,2)}</td></tr>`;}

  function bindCalculatorInputs(body){
    body.querySelectorAll('[data-calc]').forEach(input=>input.addEventListener('input',renderResults));
    body.querySelectorAll('select[data-calc]').forEach(input=>input.addEventListener('change',renderResults));
  }

  async function openCalculator(uid){
    if(!trainer()||!uid)return;
    const shell=calculatorShell(uid),body=document.getElementById('tb-diet-calc-body');if(!shell||!body)return;
    body.hidden=false;shell.querySelector('.tb-diet-calc-toggle').textContent='FECHAR CÁLCULO';
    if(activeCalculatorUid===uid&&body.dataset.ready==='1')return;
    body.dataset.ready='0';body.innerHTML='<div class="tb-evolution-empty">Carregando dados privados do cálculo...</div>';
    const [profile,latestWeight]=await Promise.all([loadProfile(uid),readLatestWeight(uid)]);if(shell.dataset.studentUid!==uid||selectedStudentUid()!==uid)return;
    const values=profileDefaults(profile,latestWeight);body.innerHTML=calculatorFormHtml(values);body.dataset.ready='1';activeCalculatorUid=uid;bindCalculatorInputs(body);renderResults();
  }

  async function toggleCalculator(){
    const uid=selectedStudentUid(),shell=calculatorShell(uid),body=document.getElementById('tb-diet-calc-body');if(!shell||!body)return;
    if(!body.hidden){body.hidden=true;shell.querySelector('.tb-diet-calc-toggle').textContent='ABRIR CÁLCULO';return;}
    await openCalculator(uid);
  }

  async function saveCalculator(){
    const uid=selectedStudentUid(),body=document.getElementById('tb-diet-calc-body');if(!trainer()||!uid||!body||!math())return;
    const values=valuesFromBody(body),validation=validate(values);if(validation){toast(validation,true);return;}const result=math().calculate(values),status=document.getElementById('tb-calc-status');if(status)status.textContent='Salvando...';
    try{
      const existing=await loadProfile(uid),payload={schemaVersion:1,studentId:uid,trainerId:CURRENT_USER.uid,sex:result.sex,actualWeightKg:result.actualWeightKg,heightCm:result.heightCm,ageYears:result.ageYears,activityFactor:result.activityFactor,referenceMode:result.referenceMode,manualReferenceWeightKg:values.referenceMode==='manual'?result.referenceWeightKg:0,manualAdjustmentKcal:result.manualAdjustmentKcal,macros:{animalProtein:values.macros.animalProtein,plantProtein:values.macros.plantProtein,carbs:values.macros.carbs,fat:values.macros.fat},createdAt:existing?._exists&&existing.createdAt?existing.createdAt:timestamp(),updatedAt:timestamp()};
      const ref=db.collection(STORAGE_COLLECTION).doc(uid),task=ref.set(payload);if(typeof cloudWrite==='function')await cloudWrite(task,'salvar cálculo privado da dieta');else await task;profileCache.set(uid,{...payload,_exists:true});if(status)status.textContent='✓ Cálculo privado salvo para este aluno.';toast('✓ Cálculo da dieta salvo');
    }catch(error){console.error('save diet calculation',error);if(status)status.textContent='Falha ao salvar. Nenhum dado da dieta do aluno foi alterado.';toast(typeof cloudWriteError==='function'?cloudWriteError(error,'salvar o cálculo privado'):'Erro ao salvar o cálculo.',true);}
  }

  function prefillDietField(kind){
    if(!trainer())return;const body=document.getElementById('tb-diet-calc-body');if(!body)return;const result=renderResults();if(!result)return;
    const value=kind==='training'?result.macros.totalKcal:result.finalGcdKcal;if(!value){toast('Preencha os macronutrientes antes de usar o VET do treino.',true);return;}
    let variantId='';
    if(kind==='training'){
      const plan=typeof currentDiet==='function'?currentDiet():null,candidates=(plan?.variants||[]).filter(item=>item.dayType==='training'),active=typeof currentDietVariant==='function'?currentDietVariant():null;
      variantId=String(active?.dayType==='training'?active.id:candidates.length===1?candidates[0].id:'');
      if(!variantId){toast('Selecione uma divisão de treino antes de preencher o VET com as kcal dos macros.',true);return;}
    }
    if(typeof openEditDietModal!=='function'){toast('Editor da dieta indisponível.',true);return;}openEditDietModal(typeof CURRENT_DIET_ID!=='undefined'?CURRENT_DIET_ID:'');
    requestAnimationFrame(()=>setTimeout(()=>{const field=kind==='training'?[...document.querySelectorAll('[data-diet-variant-energy]')].find(item=>item.dataset.dietVariantEnergy===variantId):document.getElementById('input-diet-total-expenditure');if(field){field.value=String(Math.round(value));field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();toast(kind==='training'?'Kcal dos macros preenchidas no VET da divisão de treino. Revise e salve a dieta.':'GET preenchido na tabela da dieta. Revise e salve a dieta.');}},40));
  }

  function evolutionData(items,uid){
    const rows=(Array.isArray(items)?items:[]).filter(item=>String(item?.studentId||uid)===uid&&number(item?.weight)>0).map(item=>({date:String(item.submittedDate||item.dueDate||''),weight:number(item.weight),id:String(item.id||'')})).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    return rows.slice(-MAX_EVOLUTION_POINTS);
  }

  function chartSvg(points){
    if(!points.length)return'';const width=720,height=190,left=42,right=16,top=18,bottom=30,plotW=width-left-right,plotH=height-top-bottom,weights=points.map(p=>p.weight),minRaw=Math.min(...weights),maxRaw=Math.max(...weights),padding=Math.max(1,(maxRaw-minRaw)*.18),min=Math.max(0,minRaw-padding),max=maxRaw+padding,range=Math.max(1,max-min),x=index=>left+(points.length===1?plotW/2:(index/(points.length-1))*plotW),y=value=>top+((max-value)/range)*plotH;
    const grid=[0,.25,.5,.75,1].map(r=>{const yy=top+r*plotH,val=max-r*range;return`<line x1="${left}" y1="${yy.toFixed(1)}" x2="${width-right}" y2="${yy.toFixed(1)}" stroke="rgba(255,255,255,.07)"/><text x="${left-7}" y="${(yy+3).toFixed(1)}" text-anchor="end" fill="#6f6862" font-size="9">${h(fmtNumber(val,1))}</text>`;}).join('');
    const path=points.map((point,index)=>`${index?'L':'M'} ${x(index).toFixed(1)} ${y(point.weight).toFixed(1)}`).join(' '),dots=points.map((point,index)=>`<circle cx="${x(index).toFixed(1)}" cy="${y(point.weight).toFixed(1)}" r="4" fill="#e11d48" stroke="#ff9aaa" stroke-width="1"/><text x="${x(index).toFixed(1)}" y="${Math.max(11,y(point.weight)-9).toFixed(1)}" text-anchor="middle" fill="#d8d0ca" font-size="9">${h(fmtNumber(point.weight,1))}</text>`).join('');
    return`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de evolução do peso em quilogramas">${grid}<path d="${path}" fill="none" stroke="#e11d48" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}<text x="12" y="12" fill="#756d67" font-size="9">kg</text></svg>`;
  }

  function ensureEvolutionHost(listId,hostId){
    const anchor=document.getElementById(listId);if(!anchor)return null;let host=document.getElementById(hostId);if(!host){host=document.createElement('section');host.id=hostId;host.className='tb-evolution-card';anchor.parentNode.insertBefore(host,anchor);}return host;
  }

  function renderEvolution(items,uid,trainerMode=false){
    if(!uid)return;const host=ensureEvolutionHost(trainerMode?'ts-weekly-checkin-list':'my-weekly-checkin-list',trainerMode?'tb-trainer-evolution':'tb-student-evolution');if(!host)return;const points=evolutionData(items,uid);
    if(!points.length){host.innerHTML=`<div class="tb-evolution-kicker">EVOLUÇÃO</div><div class="tb-evolution-title">Peso nos relatórios</div><div class="tb-evolution-empty">Ainda não há relatórios semanais com peso suficiente para montar o gráfico.</div>`;return;}
    const first=points[0],last=points[points.length-1],delta=last.weight-first.weight,deltaText=(delta>0?'+':'')+fmtNumber(delta,1)+' kg';host.innerHTML=`<div class="tb-evolution-head"><div><div class="tb-evolution-kicker">${trainerMode?'EVOLUÇÃO DO ALUNO':'MINHA EVOLUÇÃO'}</div><div class="tb-evolution-title">Peso registrado nos relatórios</div><div class="tb-evolution-sub">Últimos ${points.length} registros válidos</div></div></div><div class="tb-evolution-stats"><div class="tb-evolution-stat"><span>Primeiro</span><strong>${fmtNumber(first.weight,1)} kg</strong></div><div class="tb-evolution-stat"><span>Atual</span><strong>${fmtNumber(last.weight,1)} kg</strong></div><div class="tb-evolution-stat"><span>Variação</span><strong>${h(deltaText)}</strong></div><div class="tb-evolution-stat"><span>Relatórios</span><strong>${points.length}</strong></div></div><div class="tb-evolution-chart">${chartSvg(points)}</div><div class="tb-evolution-dates"><span>${h(fmtDate(first.date))}</span><span>${h(fmtDate(last.date))}</span></div><div class="tb-evolution-note">O gráfico usa exclusivamente o peso que já é informado nos relatórios semanais; não cria uma segunda base de dados e não inventa medidas corporais que o app ainda não coleta.</div>`;
  }

  function currentCheckins(uid){
    if(typeof WEEKLY_CHECKINS!=='undefined'&&Array.isArray(WEEKLY_CHECKINS)){const filtered=WEEKLY_CHECKINS.filter(item=>String(item?.studentId||uid)===uid);if(filtered.length)return filtered;}return[];
  }
  async function refreshEvolution(uid,trainerMode){
    if(!uid)return;let items=currentCheckins(uid);if(!items.length&&typeof fetchWeeklyCheckins==='function')items=await fetchWeeklyCheckins(uid);if(trainerMode&&String(typeof VIEW_STUDENT!=='undefined'&&VIEW_STUDENT?.uid||'')!==uid)return;if(!trainerMode&&String(typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.uid||'')!==uid)return;renderEvolution(items,uid,trainerMode);
  }

  function openEvolution(){
    if(!trainer()||typeof openTsQuestionnaires!=='function')return;openTsQuestionnaires();setTimeout(()=>document.getElementById('tb-trainer-evolution')?.scrollIntoView({behavior:'smooth',block:'start'}),180);
  }

  function installHooks(){
    if(window.__TB_DIET_CALC_EVOLUTION_HOOKED)return;window.__TB_DIET_CALC_EVOLUTION_HOOKED=true;
    if(typeof openDietDetail==='function'){
      const base=openDietDetail;openDietDetail=async function(id,trainerMode=false){const result=await base.apply(this,arguments);if(trainerMode&&trainer()){const uid=selectedStudentUid();calculatorShell(uid);}return result;};
    }
    if(typeof openTsQuestionnaires==='function'){
      const base=openTsQuestionnaires;openTsQuestionnaires=async function(){const uid=String(typeof VIEW_STUDENT!=='undefined'&&VIEW_STUDENT?.uid||'');const result=await base.apply(this,arguments);if(uid&&trainer())await refreshEvolution(uid,true);return result;};
    }
    if(typeof openMyQuestionnaires==='function'){
      const base=openMyQuestionnaires;openMyQuestionnaires=async function(){const uid=String(typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.uid||'');const result=await base.apply(this,arguments);if(uid&&student())await refreshEvolution(uid,false);return result;};
    }
    if(typeof confirmLogout==='function'){
      const base=confirmLogout;confirmLogout=function(){profileCache.clear();activeCalculatorUid='';document.getElementById('tb-diet-calculator')?.remove();document.getElementById('tb-trainer-evolution')?.remove();document.getElementById('tb-student-evolution')?.remove();return base.apply(this,arguments);};
    }
  }

  window.TeamBullsDietCalculator=Object.freeze({
    version:VERSION,toggle:toggleCalculator,save:saveCalculator,prefillGet:()=>prefillDietField('get'),prefillTrainingVet:()=>prefillDietField('training'),openEvolution,refreshResults:renderResults
  });
  injectStyles();installHooks();
})();

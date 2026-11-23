/* Pure prescription/reliability calculations. No storage or network access. */
(function(root,factory){const api=Object.freeze(factory());if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TeamBullsWorkflowModel=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const version='10.10.71-workflowmodel1';
  const text=value=>String(value??'').normalize('NFKC').trim();
  const key=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase();
  const number=value=>Number(String(value??'').replace(',','.'));
  const round=value=>Math.round((value+Number.EPSILON)*1000)/1000;
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const stable=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
  function labelCalculation(input,references){
    const serving=number(input.serving),desired=number(input.portions),macro=input.macro;
    const values={protein:number(input.protein),carbs:number(input.carbs),fat:number(input.fat)};
    if(!text(input.name)||!['g','ml'].includes(input.unit)||!['protein','carbs','fat'].includes(macro))throw new Error('Informe o alimento, a unidade e o macro de referência.');
    if(!(serving>0&&serving<=10000&&desired>0&&desired<=100)||Object.values(values).some(v=>!Number.isFinite(v)||v<0||v>1000))throw new Error('Confira a quantidade da embalagem, as porções e os macros.');
    const refs={protein:number(references.protein),carbs:number(references.carbs),fat:number(references.fat)};
    if(Object.values(refs).some(v=>!(v>0))||!(values[macro]>0))throw new Error('O rótulo precisa conter o macro escolhido e a tabela deve estar disponível.');
    const factor=desired*refs[macro]/values[macro],quantity=round(serving*factor);
    const grams=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,round(v*factor)]));
    return{quantity,unit:input.unit,name:text(input.name).slice(0,100),...grams,kcal:Math.round(grams.protein*4+grams.carbs*4+grams.fat*9),portions:Object.fromEntries(Object.entries(grams).map(([k,v])=>[k,round(v/refs[k])])),references:refs};
  }
  const detached=value=>JSON.parse(stable(value));
  function workoutSnapshot(workout){
    const pick=(object,fields)=>Object.fromEntries(fields.map(field=>[field,object?.[field]??null]));
    return detached({...pick(workout,['id','name','startDate','updateDate','trainingRecommendations']),days:(workout?.days||[]).map(day=>pick(day,['id','name','order','muscleGroups','frequencyGuidance','restGuidance'])),exercises:(workout?.exercises||[]).map(exercise=>pick(exercise,['id','name','dayId','dayName','sets','weeklyPlan','weeklyTechniquePlan','techniqueIds','optionalTechniqueIds','instructions','videoUrl','catalogGroupId','catalogItemId','supersetExerciseId','order']))});
  }
  function dietSnapshot(plan){return detached({id:plan?.id,name:plan?.name,startDate:plan?.startDate,updateDate:plan?.updateDate,energySummary:plan?.energySummary,variants:(plan?.variants||[]).map(variant=>({id:variant.id,name:variant.name,weekdays:variant.weekdays,workoutDays:variant.workoutDays,restWeekdays:variant.restWeekdays,daysPerWeek:variant.daysPerWeek,dayType:variant.dayType,restDaysPerWeek:variant.restDaysPerWeek,meals:(variant.meals||[]).map(meal=>({id:meal.id,name:meal.name,time:meal.time,items:meal.items,notes:meal.notes}))}))});}
  function reviewWorkout(workout,setsFor){
    const issues=[],days=workout?.days||[],exercises=workout?.exercises||[];
    if(!text(workout?.name))issues.push({type:'workout',id:workout?.id,message:'Protocolo sem nome.'});
    if(!exercises.length)issues.push({type:'workout',id:workout?.id,message:'O protocolo está sem exercícios.'});
    for(const day of days){if(!exercises.some(ex=>ex.dayId===day.id||key(ex.dayName)===key(day.name)))issues.push({type:'day',id:day.id,dayName:day.name,message:'Dia vazio: '+text(day.name)});}
    for(const exercise of exercises){
      if(!text(exercise.name))issues.push({type:'exercise',id:exercise.id,message:'Exercício sem nome.'});
      for(let week=1;week<=8;week++){
        const sets=setsFor?setsFor(exercise,week):(exercise.weeklyPlan?.['w'+week]||exercise.sets||[]);
        if(!sets?.length){issues.push({type:'prescription',id:exercise.id,week,message:text(exercise.name)+': semana '+week+' sem prescrição.'});continue;}
        if(sets.some(set=>!Number.isFinite(number(set.targetMin))||!Number.isFinite(number(set.targetMax))||number(set.targetMin)<=0||number(set.targetMax)<number(set.targetMin)))issues.push({type:'prescription',id:exercise.id,week,message:text(exercise.name)+': confira repetições/tempo da semana '+week+'.'});
      }
    }
    if(!iso(workout?.startDate)||!iso(workout?.updateDate)||workout.updateDate<workout.startDate)issues.push({type:'workout',id:workout?.id,message:'Confira as datas do protocolo.'});
    return issues;
  }
  function reviewDiet(plan,analyze){
    const issues=[];if(!text(plan?.name))issues.push({type:'diet',id:plan?.id,message:'Dieta sem nome.'});
    if(!plan?.variants?.length)issues.push({type:'diet',id:plan?.id,message:'Dieta sem divisões ou refeições.'});
    for(const variant of plan?.variants||[]){
      if(!variant.meals?.length)issues.push({type:'variant',id:variant.id,message:text(variant.name)+': nenhuma refeição.'});
      for(const meal of variant.meals||[]){
        const lines=text(meal.items).split(/\r?\n/).filter(Boolean),result=analyze?.(meal.items);
        if(!lines.length)issues.push({type:'meal',id:meal.id,variantId:variant.id,message:text(variant.name)+' / '+text(meal.name)+': refeição sem alimentos.'});
        if(lines.some(line=>/^\s*0+(?:[.,]0+)?\s+por[çc]/i.test(line)||/por[çc](?:ão|ões|ao|oes)/i.test(line)&&!/^\s*\d+(?:[.,]\d+)?\s+por[çc](?:ão|ões|ao|oes)\s+(?:de\s+)?(?:carbo(?:idratos?)?|prote[íi]nas?|gorduras?|frutas?)\s*$/i.test(line)))issues.push({type:'meal',id:meal.id,variantId:variant.id,message:text(meal.name)+': confira o texto das porções.'});
        if(result?.unknown>0)issues.push({type:'meal',id:meal.id,variantId:variant.id,level:'notice',message:text(meal.name)+': '+result.unknown+' linha(s) sem referência nutricional; o total é parcial.'});
      }
    }
    return issues;
  }
  function changes(kind,before,after){
    if(!before)return['Nova prescrição: '+text(after?.name)];
    const output=[],changed=(a,b)=>stable(a)!==stable(b);
    for(const [field,label] of [['name','Nome'],['startDate','Início'],['updateDate','Atualização prevista'],['trainingRecommendations','Frequência e descanso'],['energySummary','Orientação de energia']])if(changed(before[field],after[field]))output.push(label+' atualizado'+(typeof after[field]==='string'?': '+after[field]:'.'));
    const compare=(oldRows,newRows,label,fields)=>{
      const old=new Map((oldRows||[]).map(row=>[String(row.id),row])),next=new Map((newRows||[]).map(row=>[String(row.id),row]));
      for(const [id,row] of old)if(!next.has(id))output.push(label+' removido: '+text(row.name));
      for(const [id,row] of next){const previous=old.get(id);if(!previous){output.push(label+' adicionado: '+text(row.name));continue;}for(const [field,title] of fields)if(changed(previous[field],row[field]))output.push(text(row.name)+' — '+title+(typeof row[field]==='string'?': '+text(row[field]).slice(0,600):' atualizado(a).'));}
    };
    if(kind==='workout'){
      compare(before.days,after.days,'Dia',[['name','nome'],['order','ordem'],['muscleGroups','grupos musculares'],['frequencyGuidance','frequência'],['restGuidance','descanso']]);
      compare(before.exercises,after.exercises,'Exercício',[['name','execução'],['dayName','dia'],['sets','séries/repetições/GER'],['weeklyPlan','prescrição das semanas'],['weeklyTechniquePlan','técnicas das semanas'],['techniqueIds','técnicas'],['optionalTechniqueIds','técnicas opcionais'],['catalogGroupId','grupo de substituições'],['catalogItemId','item do catálogo'],['supersetExerciseId','vínculo do super set'],['instructions','orientação'],['videoUrl','vídeo'],['order','ordem']]);
    }else{
      compare(before.variants,after.variants,'Divisão',[['name','nome'],['weekdays','dias'],['workoutDays','treinos vinculados'],['restWeekdays','descansos'],['daysPerWeek','frequência semanal'],['dayType','dias de treino/descanso'],['restDaysPerWeek','frequência de descanso']]);
      for(const variant of after.variants||[])compare(before.variants?.find(row=>row.id===variant.id)?.meals,variant.meals,'Refeição de '+text(variant.name),[['name','nome'],['time','horário'],['items','alimentos e porções'],['notes','orientações']]);
    }
    return output.slice(0,120);
  }
  function comparePeriods(rows,a,b){
    if(![a.from,a.to,b.from,b.to].every(iso)||a.from>a.to||b.from>b.to)throw new Error('Informe dois períodos válidos.');
    if(a.from<=b.to&&b.from<=a.to)throw new Error('Escolha períodos sem sobreposição para evitar contar registros duas vezes.');
    const group=new Map();for(const row of rows||[]){const id=row.group||key(row.name)+'|'+row.unit+'|'+row.mode;if(!group.has(id))group.set(id,[]);group.get(id).push(row);}
    const metrics=list=>({records:list.length,days:new Set(list.map(row=>row.date)).size,load:list.length?Math.max(...list.map(row=>Number(row.max)||0)):null,reps:list.reduce((sum,row)=>sum+(Number(row.reps)||0),0),sets:list.reduce((sum,row)=>sum+(Number(row.count)||0),0),volume:list.length&&list.every(row=>row.volume!==null)?list.reduce((sum,row)=>sum+(Number(row.volume)||0),0):null});
    return[...group.entries()].map(([id,list])=>({id,name:list[0].name,unit:list[0].unit,mode:list[0].mode,a:metrics(list.filter(row=>row.date>=a.from&&row.date<=a.to)),b:metrics(list.filter(row=>row.date>=b.from&&row.date<=b.to))})).filter(row=>row.a.records||row.b.records);
  }
  function safeDiagnostic(input={}){
    const allowed=value=>/^[a-z0-9_:. -]{1,100}$/i.test(String(value||''))?String(value):'indisponivel';
    return{action:allowed(input.action),stage:allowed(input.stage),category:['network','permission','storage','conflict','other'].includes(input.category)?input.category:'other',at:Number.isFinite(input.at)?new Date(input.at).toISOString():new Date().toISOString()};
  }
  return{version,key,stable,iso,labelCalculation,workoutSnapshot,dietSnapshot,reviewWorkout,reviewDiet,changes,comparePeriods,safeDiagnostic};
});

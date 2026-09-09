/* Team Bulls v10.10.36 — exportação PDF nativa, sem pop-up e compatível com mobile/PWA. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_PDF_EXPORT_101012__)return;
  window.__TEAM_BULLS_PDF_EXPORT_101012__=true;
  const VERSION='10.10.36-pdf2';
  const W=595.28,H=841.89,M=42,CONTENT_W=W-M*2,ACC=[0.70,0.04,0.08],DARK=[0.045,0.045,0.045],INK=[0.10,0.10,0.10],MUTED=[0.38,0.38,0.38],LIGHT=[0.96,0.95,0.94];
  const cp1252={0x2013:0x96,0x2014:0x97,0x2018:0x91,0x2019:0x92,0x201c:0x93,0x201d:0x94,0x2022:0x95,0x2026:0x85,0x20ac:0x80};
  const byteText=value=>{let out='';for(const ch of String(value??'')){const code=ch.codePointAt(0);if(code<=255)out+=String.fromCharCode(code);else if(cp1252[code])out+=String.fromCharCode(cp1252[code]);else out+=({0x2192:'>',0x2713:'OK',0x00d7:'x'}[code]||'?');}return out;};
  const literal=value=>byteText(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[\r\n]+/g,' ');
  const clean=value=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  const safeFile=value=>clean(value||'documento').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'team-bulls';
  const fmtDate=value=>{const raw=clean(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw||'—';const [y,m,d]=raw.split('-');return`${d}/${m}/${y}`;};
  const rgb=c=>`${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;
  function approxWidth(text,size,font='F1'){let sum=0;for(const ch of clean(text)){if('ilI.,:;|!'.includes(ch))sum+=.24;else if('MW@%'.includes(ch))sum+=.88;else if(ch===' ')sum+=.28;else sum+=font==='F3'?.60:.52;}return sum*size;}
  function wrap(text,maxWidth,size=10,font='F1'){
    const paras=String(text??'').replace(/\r/g,'').split('\n'),lines=[];
    for(const para of paras){const words=para.trim().split(/\s+/).filter(Boolean);if(!words.length){lines.push('');continue;}let line='';for(const word of words){const trial=line?line+' '+word:word;if(approxWidth(trial,size,font)<=maxWidth){line=trial;continue;}if(line)lines.push(line);if(approxWidth(word,size,font)<=maxWidth){line=word;continue;}let part='';for(const ch of word){if(part&&approxWidth(part+ch,size,font)>maxWidth){lines.push(part);part=ch;}else part+=ch;}line=part;}if(line)lines.push(line);}return lines;
  }
  class PdfDoc{
    constructor(title,student,kind){this.pages=[];this.page=null;this.y=0;this.title=clean(title);this.student=clean(student)||'Aluno';this.kind=clean(kind);this.addPage();}
    addPage(){this.page=[];this.pages.push(this.page);this.y=112;this.rect(0,0,W,82,DARK);this.rect(0,79,W,3,ACC);this.text(M,29,'TEAM',21,'F2',[.78,.73,.67]);this.text(M+57,29,'BULLS',21,'F2',[1,.36,.43]);this.text(M,49,'// SURVIVAL FITNESS SYSTEM',7.5,'F3',[.62,.60,.58]);this.text(W-M,31,this.kind.toUpperCase(),8,'F3',[.86,.84,.81],'right');this.text(W-M,49,this.student,9,'F2',[1,1,1],'right');}
    ensure(height){if(this.y+height>H-52)this.addPage();}
    raw(s){this.page.push(s);}
    text(x,y,text,size=10,font='F1',color=INK,align='left'){
      let tx=x;const t=clean(text);if(align==='right')tx=x-approxWidth(t,size,font);else if(align==='center')tx=x-approxWidth(t,size,font)/2;
      this.raw(`BT /${font} ${size.toFixed(2)} Tf ${rgb(color)} rg 1 0 0 1 ${tx.toFixed(2)} ${(H-y).toFixed(2)} Tm (${literal(t)}) Tj ET\n`);
    }
    rect(x,y,w,h,fill,stroke=null,width=.7){this.raw(`${rgb(fill)} rg ${x.toFixed(2)} ${(H-y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`);if(stroke)this.raw(`${rgb(stroke)} RG ${width} w ${x.toFixed(2)} ${(H-y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S\n`);}
    line(x1,y1,x2,y2,color=[.8,.8,.8],width=.7){this.raw(`${rgb(color)} RG ${width} w ${x1.toFixed(2)} ${(H-y1).toFixed(2)} m ${x2.toFixed(2)} ${(H-y2).toFixed(2)} l S\n`);}
    paragraph(text,{x=M,width=CONTENT_W,size=9.2,font='F1',color=INK,line=12,gap=5}={}){const lines=wrap(text,width,size,font);this.ensure(lines.length*line+gap);for(const value of lines){this.text(x,this.y,value,size,font,color);this.y+=line;}this.y+=gap;return lines.length;}
    section(label,meta=''){this.ensure(34);this.rect(M,this.y,CONTENT_W,25,DARK);this.rect(M,this.y,4,25,ACC);this.text(M+13,this.y+16,clean(label).toUpperCase(),11,'F2',[1,1,1]);if(meta)this.text(W-M-9,this.y+16,meta,7.2,'F3',[.72,.70,.68],'right');this.y+=34;}
    cardTitle(title,kicker=''){this.ensure(34);if(kicker)this.text(M,this.y,kicker.toUpperCase(),6.8,'F3',ACC);this.text(M,this.y+(kicker?15:8),title,13,'F2',INK);this.y+=kicker?28:22;}
    badge(text,x,y,w=78){this.rect(x,y,w,18,[.98,.91,.92],ACC,.6);this.text(x+w/2,y+12,text,7,'F2',ACC,'center');}
    keyValue(label,value){this.ensure(20);this.text(M,this.y,label.toUpperCase(),6.5,'F3',MUTED);this.text(M+120,this.y,value||'—',9,'F2',INK);this.y+=16;}
    finalize(){const total=this.pages.length;this.pages.forEach((ops,index)=>{ops.push(`${rgb([.88,.86,.84])} RG .5 w ${M} 34 m ${W-M} 34 l S\n`);ops.push(`BT /F3 6.5 Tf ${rgb(MUTED)} rg 1 0 0 1 ${M} 21 Tm (${literal('TEAM BULLS // DOCUMENTO DO ALUNO')}) Tj ET\n`);ops.push(`BT /F3 6.5 Tf ${rgb(MUTED)} rg 1 0 0 1 ${(W-M-75).toFixed(2)} 21 Tm (${literal(`PÁGINA ${index+1} / ${total}`)}) Tj ET\n`);});return buildPdf(this.pages);}
  }
  function buildPdf(pages){
    const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'];
    const refs=[];
    for(const ops of pages){const content=ops.join('');const contentId=objects.length;objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);const pageId=objects.length;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`);refs.push(pageId);}
    objects[2]=`<< /Type /Pages /Count ${refs.length} /Kids [${refs.map(id=>id+' 0 R').join(' ')}] >>`;
    let pdf='%PDF-1.4\n%âãÏÓ\n',offsets=[0];for(let i=1;i<objects.length;i++){offsets[i]=pdf.length;pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
    const xref=pdf.length;pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const bytes=new Uint8Array(pdf.length);for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255;return new Blob([bytes],{type:'application/pdf'});
  }
  function appleMobile(){const ua=String(navigator.userAgent||''),platform=String(navigator.platform||'');return /iPad|iPhone|iPod/i.test(ua)||(platform==='MacIntel'&&Number(navigator.maxTouchPoints)>1);}
  function directDownload(blob,filename,{openViewer=false}={}){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';if(openViewer)a.target='_blank';a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return true;}
  async function deliver(blob,name){
    const filename=safeFile(name)+'.pdf',apple=appleMobile();
    if(apple&&typeof File==='function'&&typeof navigator.share==='function'){
      try{const file=new File([blob],filename,{type:'application/pdf'}),payload={files:[file],title:filename};if(typeof navigator.canShare!=='function'||navigator.canShare(payload)){await navigator.share(payload);if(typeof showToast==='function')showToast('✓ PDF pronto para salvar em Arquivos ou compartilhar');return true;}}
      catch(error){if(error?.name==='AbortError')return false;console.warn('[Team Bulls PDF] compartilhamento nativo indisponível; usando visualizador/download',error);}
    }
    directDownload(blob,filename,{openViewer:apple});if(typeof showToast==='function')showToast(apple?'✓ PDF aberto para salvar ou compartilhar':'✓ PDF enviado para Downloads');return true;
  }
  function setLabel(set,index,exercise){
    const min=clean(set?.targetMin),max=clean(set?.targetMax),ger=clean(set?.ger),backoff=set?.backoff===true?' · -20% carga':'';let unit='reps';try{if(typeof exerciseUsesResistedTime==='function'&&exerciseUsesResistedTime(exercise))unit='seg';}catch(error){}
    const range=min||max?(min===max?min:`${min||'?'}-${max||'?'}`):'livre';return`${index+1}ª série: ${range} ${unit}${ger?` · GER ${String(ger).padStart(2,'0')}`:''}${backoff}`;
  }
  function renderWorkout(workout,studentName){
    const doc=new PdfDoc(workout?.name||'Treino',studentName,'Plano de treino');doc.text(M,105,clean(workout?.name||'TREINO').toUpperCase(),22,'F2',INK);doc.y=133;doc.paragraph('Prescrição completa de musculação organizada por dia e por semana.',{size:9,color:MUTED,line:12,gap:12});
    let days=[];try{days=typeof groupExercisesByDay==='function'?groupExercisesByDay(workout?.exercises||[],typeof getWorkoutDays==='function'?getWorkoutDays(workout):[]):[];}catch(error){}
    if(!Array.isArray(days)||!days.length){const map=new Map();for(const ex of(workout?.exercises||[])){const day=clean(ex?.day||'Treino');if(!map.has(day))map.set(day,[]);map.get(day).push(ex);}days=[...map.entries()];}
    for(const [day,items] of days){doc.section(day,`${items.length} exercício${items.length===1?'':'s'}`);for(const ex of items){doc.cardTitle(clean(ex?.name||'Exercício'),'EXERCÍCIO');const inst=clean(ex?.instructions);if(inst){doc.paragraph('ORIENTAÇÃO',{size:6.7,font:'F3',color:ACC,line:9,gap:1});doc.paragraph(inst,{size:8.8,line:11,gap:7});}
        try{if(typeof techniqueItemsForExercise==='function'){const tech=techniqueItemsForExercise(ex)||[];if(tech.length)doc.paragraph('Técnicas: '+tech.map(item=>item.code+' — '+item.name+(typeof exerciseHasOptionalTechnique==='function'&&exerciseHasOptionalTechnique(ex,item.id)?' (opcional)':'')).join(' · '),{size:8,color:MUTED,line:10.5,gap:7});}}catch(error){}
        for(let week=1;week<=8;week++){let sets=[];try{sets=(typeof resolveWeekPrescription==='function'?resolveWeekPrescription(ex,week)?.sets:[])||[];}catch(error){}const label=sets.length?sets.map((s,i)=>setLabel(s,i,ex)).join(' | '):'Sem exercício';const lines=wrap(label,CONTENT_W-88,7.8,'F1');doc.ensure(Math.max(24,lines.length*9+10));doc.rect(M,doc.y,72,Math.max(21,lines.length*9+7),week%2?[.965,.96,.955]:[.94,.935,.93]);doc.text(M+9,doc.y+14,`SEMANA ${week}`,7.2,'F2',week===1?ACC:INK);let yy=doc.y+13;for(const line of lines){doc.text(M+84,yy,line,7.8,'F1',INK);yy+=9;}doc.y+=Math.max(24,lines.length*9+10);}
        doc.y+=7;doc.line(M,doc.y,W-M,doc.y,[.88,.86,.84],.5);doc.y+=10;
      }}
    return doc.finalize();
  }
  function macroSummary(meals){const api=window.TeamBullsDietLiveCalories;if(typeof api?.analyze!=='function')return null;const total={protein:0,carbs:0,fat:0,kcal:0};for(const meal of meals||[]){const a=api.analyze(meal?.items||'')||{};for(const k of Object.keys(total))total[k]+=Number(a[k])||0;}return total;}
  function renderDiet(plan,studentName){
    const doc=new PdfDoc(plan?.name||'Dieta',studentName,'Plano alimentar');doc.text(M,105,clean(plan?.name||'DIETA').toUpperCase(),22,'F2',INK);doc.y=133;doc.paragraph('Plano alimentar completo, divisões semanais e orientações da consultoria.',{size:9,color:MUTED,line:12,gap:9});
    if(plan?.isActive)doc.badge('PLANO ATUAL',M,doc.y,78);if(plan?.startDate||plan?.updateDate){doc.text(M+92,doc.y+12,`Vigência: ${fmtDate(plan.startDate)}  ·  Atualização: ${fmtDate(plan.updateDate)}`,8,'F1',MUTED);doc.y+=29;}else doc.y+=25;
    const variants=Array.isArray(plan?.variants)&&plan.variants.length?plan.variants:[{name:'Plano principal',daysPerWeek:7,meals:plan?.meals||[]}];
    for(const variant of variants){const meals=[...(variant?.meals||[])].sort((a,b)=>clean(a?.time).localeCompare(clean(b?.time)));doc.section(variant?.name||'Divisão',`${Number(variant?.daysPerWeek)||0}x / semana`);const macros=macroSummary(meals);if(macros){doc.ensure(35);doc.rect(M,doc.y,CONTENT_W,29,[.955,.97,.955]);doc.text(M+10,doc.y+12,`${Math.round(macros.kcal)} kcal`,10,'F2',INK);doc.text(M+96,doc.y+12,`P ${Math.round(macros.protein)}g  ·  C ${Math.round(macros.carbs)}g  ·  G ${Math.round(macros.fat)}g`,8,'F1',MUTED);doc.y+=38;}
      meals.forEach((meal,index)=>{doc.ensure(46);const time=clean(meal?.time)||'--:--';doc.text(M,doc.y,time,8,'F3',ACC);doc.text(M+52,doc.y,clean(meal?.name)||`Refeição ${index+1}`,12,'F2',INK);doc.y+=16;const items=String(meal?.items||'').trim();if(items)doc.paragraph(items,{x:M+52,width:CONTENT_W-52,size:8.8,line:11,gap:4});else doc.paragraph('Nenhum alimento descrito.',{x:M+52,width:CONTENT_W-52,size:8.5,color:MUTED,line:11,gap:4});if(clean(meal?.notes)){doc.paragraph('Observação: '+meal.notes,{x:M+52,width:CONTENT_W-52,size:7.8,color:MUTED,line:10,gap:5});}doc.line(M+52,doc.y,W-M,doc.y,[.89,.87,.85],.45);doc.y+=10;});
    }
    const defs=typeof DIET_SECTION_DEFS!=='undefined'?DIET_SECTION_DEFS:[{key:'importantSupplements',title:'Suplementos importantes'},{key:'optionalSupplements',title:'Suplementos opcionais'},{key:'hormonalProtocol',title:'Protocolo Hormonal'}];for(const def of defs){const items=Array.isArray(plan?.[def.key])?plan[def.key]:[];if(!items.length)continue;doc.section(def.title,`${items.length} item${items.length===1?'':'s'}`);for(const item of items){doc.ensure(37);doc.text(M,doc.y,clean(item?.name)||'Item',10,'F2',INK);doc.y+=13;const detail=[clean(item?.dose)&&`Dose: ${clean(item.dose)}`,clean(item?.time)&&`Horário/frequência: ${clean(item.time)}`].filter(Boolean).join(' · ');if(detail)doc.paragraph(detail,{size:8,color:MUTED,line:10,gap:2});if(clean(item?.notes))doc.paragraph(item.notes,{size:8.2,line:10.5,gap:6});doc.line(M,doc.y,W-M,doc.y,[.89,.87,.85],.45);doc.y+=8;}}
    return doc.finalize();
  }
  function exportWorkout(workout,studentName){if(!workout){if(typeof showToast==='function')showToast('Nenhum treino aberto para exportar.',true);return;}try{deliver(renderWorkout(workout,studentName),`Team-Bulls-Treino-${studentName||'Aluno'}-${workout?.name||'Treino'}`);}catch(error){console.error('[Team Bulls PDF] treino',error);alert('Não foi possível gerar o PDF do treino. Atualize o aplicativo e tente novamente.');}}
  function exportDiet(plan,studentName){if(!plan){if(typeof showToast==='function')showToast('Nenhuma dieta aberta para exportar.',true);return;}try{deliver(renderDiet(plan,studentName),`Team-Bulls-Dieta-${studentName||'Aluno'}-${plan?.name||'Dieta'}`);}catch(error){console.error('[Team Bulls PDF] dieta',error);alert('Não foi possível gerar o PDF da dieta. Atualize o aplicativo e tente novamente.');}}
  function currentPlan(){try{return typeof currentDiet==='function'?currentDiet():null;}catch(error){return null;}}
  window.exportWorkoutPdf=exportWorkout;
  window.exportCurrentDietPdf=()=>exportDiet(currentPlan(),typeof CURRENT_USER!=='undefined'?CURRENT_USER?.name:'Aluno');
  window.exportTrainerDietPdf=()=>exportDiet(currentPlan(),typeof VIEW_STUDENT!=='undefined'?VIEW_STUDENT?.name:'Aluno');
  function ensureDietButtons(){for(const [screen,fn,title] of [['screen-diet-detail','exportCurrentDietPdf','Salvar dieta completa em PDF'],['screen-ts-diet-detail','exportTrainerDietPdf','Salvar dieta do aluno em PDF']]){const header=document.querySelector(`#${screen} .header`);if(!header||header.querySelector('[data-tb-pdf-diet]'))continue;const button=document.createElement('button');button.type='button';button.className='btn-icon ghost';button.dataset.tbPdfDiet='1';button.title=title;button.setAttribute('aria-label',title);button.textContent='PDF';button.onclick=()=>window[fn]?.();header.appendChild(button);}}
  function install(){window.exportWorkoutPdf=exportWorkout;ensureDietButtons();}
  install();document.addEventListener('DOMContentLoaded',install,{once:true});window.addEventListener('team-bulls-runtime-state',install);window.addEventListener('team-bulls-runtime-ready',install);window.TeamBullsPdfExport=Object.freeze({version:VERSION,workout:exportWorkout,diet:exportDiet});
})();
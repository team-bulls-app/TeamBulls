/* Team Bulls v10.10.10 — fotos rápidas e clicáveis dentro dos relatórios. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_REPORT_PHOTO_UX_V101010__)return;
  window.__TEAM_BULLS_REPORT_PHOTO_UX_V101010__=true;

  const VERSION='10.10.10-reportphotos1';
  const MAX_RECORD_CACHE=180;
  const recordCache=new Map();
  let photoViewRequest=0;

  const safe=value=>typeof esc==='function'?esc(value):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const uniqueIds=values=>[...new Set((Array.isArray(values)?values:[]).map(value=>String(value||'').trim()).filter(Boolean))].slice(0,6);
  const recordKey=(uid,id)=>String(uid||'')+':'+String(id||'');

  function rememberRecord(uid,record){
    if(!uid||!record?.id)return;
    const key=recordKey(uid,record.id);recordCache.delete(key);recordCache.set(key,record);
    while(recordCache.size>MAX_RECORD_CACHE)recordCache.delete(recordCache.keys().next().value);
  }
  function cachedRecord(uid,id){
    const key=recordKey(uid,id),cached=recordCache.get(key);if(cached)return cached;
    try{
      if(typeof PHOTOS_CACHE_UID!=='undefined'&&String(PHOTOS_CACHE_UID||'')===String(uid)&&Array.isArray(PHOTOS_CACHE)){
        const found=PHOTOS_CACHE.find(item=>String(item.id)===String(id));if(found){rememberRecord(uid,found);return found;}
      }
    }catch(error){}
    return null;
  }
  function normalizeRecord(uid,doc){
    if(!doc?.exists)return null;const raw=doc.data()||{};
    if(raw.userId&&String(raw.userId)!==String(uid))return null;
    return{...raw,id:doc.id,userId:String(raw.userId||uid),dataUrl:typeof safePhotoDataUrl==='function'?safePhotoDataUrl(raw.dataUrl):String(raw.dataUrl||''),photoPath:typeof safePhotoPath==='function'?safePhotoPath(raw.photoPath):String(raw.photoPath||''),thumbPath:typeof safePhotoPath==='function'?safePhotoPath(raw.thumbPath):String(raw.thumbPath||'')};
  }
  function seedGlobalPhotoCache(uid,records){
    if(!uid||!Array.isArray(records)||!records.length)return;
    try{
      if(typeof PHOTOS_CACHE==='undefined')return;
      if(typeof PHOTOS_CACHE_UID!=='undefined'&&String(PHOTOS_CACHE_UID||'')!==String(uid)){
        PHOTOS_CACHE=[];PHOTOS_CACHE_UID=uid;
      }
      for(const record of records){
        const index=PHOTOS_CACHE.findIndex(item=>String(item.id)===String(record.id));
        if(index>=0)PHOTOS_CACHE[index]={...record,...PHOTOS_CACHE[index]};
        else PHOTOS_CACHE.push(record);
      }
    }catch(error){console.warn('[Team Bulls] Cache visual de fotos não pôde ser preparado.',error);}
  }

  async function fetchMissingRecords(uid,ids){
    if(!uid||!ids.length)return[];
    const found=[];
    // Uma consulta agrupada reduz latência. Se regras/índice do ambiente não aceitarem,
    // volta automaticamente para os gets individuais já usados pelo app.
    try{
      const FieldPath=firebase?.firestore?.FieldPath;
      if(FieldPath?.documentId){
        const snap=await cloudGet(db.collection('progressPhotos').where('userId','==',uid).where(FieldPath.documentId(),'in',ids),'fotos do relatório');
        for(const doc of snap.docs||[]){const record=normalizeRecord(uid,{exists:true,id:doc.id,data:()=>doc.data()});if(record)found.push(record);}
        const foundIds=new Set(found.map(item=>String(item.id)));
        if(ids.every(id=>foundIds.has(String(id))))return found;
      }
    }catch(error){console.warn('[Team Bulls] Consulta agrupada de fotos indisponível; usando fallback seguro.',error?.code||error?.message);}
    const missing=ids.filter(id=>!found.some(item=>String(item.id)===String(id)));
    const fallback=await Promise.all(missing.map(async id=>{
      try{return normalizeRecord(uid,await cloudGet(db.collection('progressPhotos').doc(id),'foto do relatório'));}
      catch(error){return null;}
    }));
    return found.concat(fallback.filter(Boolean));
  }

  async function reportPhotoRecords(uid,photoIds){
    const ids=uniqueIds(photoIds),byId=new Map(),missing=[];
    for(const id of ids){const record=cachedRecord(uid,id);if(record)byId.set(id,record);else missing.push(id);}
    if(missing.length){
      const fetched=await fetchMissingRecords(uid,missing);
      for(const record of fetched){rememberRecord(uid,record);byId.set(String(record.id),record);}
    }
    const ordered=ids.map(id=>byId.get(id)).filter(Boolean);seedGlobalPhotoCache(uid,ordered);return ordered;
  }

  function installStyles(){
    if(document.getElementById('tb-report-photo-ux-style'))return;
    const style=document.createElement('style');style.id='tb-report-photo-ux-style';style.textContent=`
      .tb-report-photo-help{margin:7px 0 10px;color:var(--text-muted);font:500 9px/1.4 'DM Mono',monospace}
      .checkin-view-photo-grid .tb-report-photo-button{display:block;width:100%;padding:0;border:1px solid rgba(255,255,255,.09);border-radius:10px;overflow:hidden;background:#111;color:inherit;text-align:left;cursor:zoom-in}
      .checkin-view-photo-grid .tb-report-photo-button img{display:block;width:100%;aspect-ratio:3/4;object-fit:cover;background:#0d0d0d}
      .checkin-view-photo-grid .tb-report-photo-button span{display:block;padding:7px 8px;color:var(--text-dim);font:700 9px/1.3 'DM Mono',monospace}
      .tb-report-photo-skeleton{min-height:180px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:linear-gradient(110deg,#111 24%,#181818 38%,#111 52%);background-size:220% 100%;animation:tb-report-photo-pulse 1.2s linear infinite}
      #photo-view-img.tb-photo-view-loading{min-height:180px;background:#0d0d0d}
      @keyframes tb-report-photo-pulse{to{background-position-x:-220%}}
      @media(prefers-reduced-motion:reduce){.tb-report-photo-skeleton{animation:none}}
    `;document.head.appendChild(style);
  }

  async function renderReportPhotoGrid(photoIds,gridId,uid){
    const grid=document.getElementById(gridId),ids=uniqueIds(photoIds);if(!grid)return;
    if(!ids.length){grid.innerHTML='<div class="no-data-inline">As fotos deste relatório não estão disponíveis.</div>';return;}
    grid.innerHTML=ids.map(()=>'<div class="tb-report-photo-skeleton" aria-hidden="true"></div>').join('');
    const records=await reportPhotoRecords(uid,ids);if(!grid.isConnected)return;
    const byId=new Map(records.map(record=>[String(record.id),record]));
    grid.innerHTML=ids.map((id,index)=>{
      const record=byId.get(id);if(!record)return'<div class="no-data-inline">Foto indisponível</div>';
      const direct=(typeof safePhotoDataUrl==='function'?safePhotoDataUrl(record.dataUrl):'')||record._photoThumbSrc||'';
      const pose=String(record.pose||((typeof CHECKIN_POSES!=='undefined'&&CHECKIN_POSES[index])||'Foto'));
      return`<button type="button" class="tb-report-photo-button" data-tb-report-photo="${safe(id)}" aria-label="Abrir ${safe(pose)} em tamanho maior"><img ${direct?`src="${safe(direct)}"`:''} data-photo-record="progress" data-photo-id="${safe(id)}" loading="lazy" decoding="async" alt="${safe(pose)}"><span>${safe(pose)} · TOQUE PARA AMPLIAR</span></button>`;
    }).join('');
    grid.querySelectorAll('[data-tb-report-photo]').forEach(button=>button.addEventListener('click',()=>{if(typeof openPhotoView==='function')openPhotoView(button.dataset.tbReportPhoto,true);}));
    if(typeof hydrateSecureImages==='function')hydrateSecureImages(grid);
  }

  function reportOwnerUid(record){
    return String(record?.studentId||record?.userId||(typeof VIEW_STUDENT!=='undefined'&&VIEW_STUDENT?.uid)||(typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.uid)||'');
  }

  if(typeof viewWeeklyCheckin==='function'){
    viewWeeklyCheckin=async function(id){
      const checkin=(typeof WEEKLY_CHECKINS!=='undefined'&&Array.isArray(WEEKLY_CHECKINS)?WEEKLY_CHECKINS:[]).find(item=>String(item.id)===String(id));if(!checkin)return;
      const photoIds=uniqueIds(checkin.photoIds),title=document.getElementById('weekly-checkin-view-title'),host=document.getElementById('weekly-checkin-view-body');if(!host)return;
      if(title)title.textContent=(checkin.requestKind==='manual'?'Relatório extra':'Relatório semanal')+' // '+fmt(checkin.submittedDate||checkin.dueDate);
      host.innerHTML=`<div class="photo-weight-meta">PESO: ${Number(checkin.weight||0).toLocaleString('pt-BR',{maximumFractionDigits:1})} kg</div>${photoIds.length?'<div class="tb-report-photo-help">Miniaturas leves são carregadas primeiro. Toque em uma foto para abrir a versão completa.</div><div class="checkin-view-photo-grid" id="checkin-view-photo-grid"></div>':'<div class="no-data-inline">Este relatório não possui fotos disponíveis.</div>'}`+(checkin.questions||[]).map((question,index)=>`${checkin.sectionAt&&checkin.sectionAt[index]?`<div class="quest-section-title">${safe(checkin.sectionAt[index])}</div>`:''}<div class="quest-view-qa"><div class="q">${index+1}. ${safe(question)}</div><div class="a">${safe(checkin.answers?.[index]||'(sem resposta)')}</div></div>`).join('');
      openModal('modal-weekly-checkin-view');
      if(photoIds.length)await renderReportPhotoGrid(photoIds,'checkin-view-photo-grid',reportOwnerUid(checkin));
    };
    viewWeeklyCheckin.__tbReportPhotoUx=true;
  }

  if(typeof viewQuestionnaire==='function'){
    viewQuestionnaire=async function(qid,fromTrainer){
      const cache=fromTrainer?(typeof TS_QUEST_CACHE!=='undefined'?TS_QUEST_CACHE:[]):(typeof MY_QUEST_CACHE!=='undefined'?MY_QUEST_CACHE:[]),report=(Array.isArray(cache)?cache:[]).find(item=>String(item.id)===String(qid));if(!report||!report.answered)return;
      const mode=typeof v109ReportMode==='function'?v109ReportMode(report):'full',photoIds=uniqueIds(report.photoIds),parts=[];
      const requiresPhotos=typeof v109ModeRequiresPhotos==='function'?v109ModeRequiresPhotos(mode):photoIds.length>0;
      const requiresAnswers=typeof v109ModeRequiresAnswers==='function'?v109ModeRequiresAnswers(mode):true;
      if(requiresPhotos)parts.push(photoIds.length?'<div class="section-header"><span class="section-label">Fotos do relatório</span></div><div class="tb-report-photo-help">Miniaturas leves são carregadas primeiro. Toque em uma foto para abrir a versão completa.</div><div class="checkin-view-photo-grid" id="questionnaire-view-photo-grid"></div>':'<div class="no-data-inline">As fotos deste relatório não estão disponíveis.</div>');
      if(requiresAnswers)parts.push((report.questions||[]).map((question,index)=>`${report.sectionAt&&report.sectionAt[index]?`<div class="quest-section-title">${safe(report.sectionAt[index])}</div>`:''}<div class="quest-view-qa"><div class="q">${index+1}. ${safe(question)}</div><div class="a">${safe(report.answers?.[index]||'(sem resposta)')}</div></div>`).join(''));
      const title=document.getElementById('quest-view-title');if(title)title.textContent=(typeof v109ReportModeLabel==='function'?v109ReportModeLabel(mode):'Relatório')+' respondido';
      const body=document.getElementById('quest-view-body');if(!body)return;body.innerHTML=parts.join('');openModal('modal-view-quest');
      if(photoIds.length)await renderReportPhotoGrid(photoIds,'questionnaire-view-photo-grid',reportOwnerUid(report));
    };
    viewQuestionnaire.__tbReportPhotoUx=true;
  }

  // O visualizador abre imediatamente com miniatura e atualiza para alta qualidade
  // em segundo plano. Isso também melhora a aba Fotos sem mudar o download original.
  if(typeof openPhotoView==='function'&&!openPhotoView.__tbReportPhotoUx){
    const base=openPhotoView;
    const wrapped=async function(pid,readonly){
      const p=typeof PHOTOS_CACHE!=='undefined'&&Array.isArray(PHOTOS_CACHE)?PHOTOS_CACHE.find(item=>String(item.id)===String(pid)):null;
      if(!p)return base.apply(this,arguments);
      const request=++photoViewRequest;CUR_PHOTO_ID=pid;
      const title=document.getElementById('photo-view-title');if(title)title.textContent='Evidência // '+fmt(p.date);
      const meta=document.getElementById('photo-view-meta');if(meta)meta.textContent=Number(p.weight)>0?'PESO REGISTRADO: '+Number(p.weight).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg':'PESO NÃO INFORMADO NESTE REGISTRO';
      const img=document.getElementById('photo-view-img');if(img){img.removeAttribute('src');img.classList.add('tb-photo-view-loading');}
      const download=document.getElementById('btn-download-photo');if(download)download.style.display='none';
      const deleteButton=document.getElementById('btn-delete-photo');if(deleteButton)deleteButton.style.display=(readonly||p.checkinId||p.reportId||p.questionnaireId)?'none':'block';
      if(!document.getElementById('modal-photo-view')?.classList.contains('open'))openModal('modal-photo-view');
      Promise.resolve(typeof resolvePhotoSource==='function'?resolvePhotoSource(p,{full:false}):'').then(src=>{
        if(request===photoViewRequest&&String(CUR_PHOTO_ID)===String(pid)&&document.getElementById('modal-photo-view')?.classList.contains('open')&&src&&img)img.src=src;
      }).catch(()=>{});
      try{return await base.apply(this,arguments);}
      finally{
        if(request===photoViewRequest&&img)img.classList.remove('tb-photo-view-loading');
        else if(request!==photoViewRequest){
          const currentId=String(CUR_PHOTO_ID||''),current=typeof PHOTOS_CACHE!=='undefined'&&Array.isArray(PHOTOS_CACHE)?PHOTOS_CACHE.find(item=>String(item.id)===currentId):null;
          if(current&&img){const latest=photoViewRequest;Promise.resolve(resolvePhotoSource(current,{full:false})).then(src=>{if(latest===photoViewRequest&&src&&document.getElementById('modal-photo-view')?.classList.contains('open')){img.src=src;img.classList.remove('tb-photo-view-loading');const staleDownload=document.getElementById('btn-download-photo');if(staleDownload)staleDownload.style.display='none';}}).catch(()=>{});}
        }
      }
    };
    wrapped.__tbReportPhotoUx=true;wrapped.__tbBase=base;openPhotoView=wrapped;
  }

  installStyles();
  window.TeamBullsReportPhotoUX=Object.freeze({version:VERSION,cacheSize:()=>recordCache.size});
})();

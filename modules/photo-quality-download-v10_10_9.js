/* Team Bulls v10.10.9 — preservação da foto original + download pelo treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_PHOTO_QUALITY_V10109__)return;
  window.__TEAM_BULLS_PHOTO_QUALITY_V10109__=true;

  const VERSION='10.10.9-photoquality3';
  const ORIGINAL_KIND='progressPhotoOriginals';
  const MAX_ORIGINAL_BYTES=25*1024*1024;
  const WEB_IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
  const pendingOriginals=new Map();
  const originalUrlCache=new Map();
  const originalMissCache=new Set();
  const previewTokens={weekly:Array(6).fill(0),questionnaire:Array(6).fill(0)};

  const normalizeType=file=>{
    const raw=String(file?.type||'').toLowerCase().trim();
    if(raw==='image/jpg'||raw==='image/pjpeg')return'image/jpeg';
    if(/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.test(raw))return raw;
    const name=String(file?.name||'').toLowerCase();
    if(/\.jpe?g$/.test(name))return'image/jpeg';
    if(/\.png$/.test(name))return'image/png';
    if(/\.webp$/.test(name))return'image/webp';
    if(/\.gif$/.test(name))return'image/gif';
    if(/\.avif$/.test(name))return'image/avif';
    if(/\.heic$/.test(name))return'image/heic';
    if(/\.heif$/.test(name))return'image/heif';
    return'';
  };
  const safeToken=value=>String(value||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,190);
  const originalPath=(userId,id)=>`${ORIGINAL_KIND}/${safeToken(userId)}/${safeToken(id)}`;
  const originalName=(file,id)=>{
    const raw=String(file?.name||'').trim();
    const cleaned=raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,160);
    return cleaned||`team-bulls-${safeToken(id)||'foto'}`;
  };
  const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

  function decodeFailure(file,type){
    const name=String(file?.name||'esta foto');
    if(type==='image/heic'||type==='image/heif')return new Error(`O arquivo ${name} está em HEIC/HEIF e este navegador não conseguiu convertê-lo. Use a opção JPG/JPEG da câmera ou escolha uma versão JPG da foto.`);
    return new Error(`Não foi possível preparar ${name}. Se a foto for muito grande, feche outros aplicativos e tente novamente; JPG, PNG, WebP e AVIF são aceitos.`);
  }

  function decodeViaImage(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),img=new Image();let settled=false;
      const finish=(value,error)=>{
        if(settled)return;settled=true;
        img.onload=null;img.onerror=null;
        if(error){URL.revokeObjectURL(url);reject(error);return;}
        resolve({source:img,width:img.naturalWidth||img.width,height:img.naturalHeight||img.height,close:()=>URL.revokeObjectURL(url)});
      };
      img.decoding='async';
      img.onload=()=>finish(null,null);
      img.onerror=()=>finish(null,new Error('image-element-decode-failed'));
      img.src=url;
    });
  }

  // O fluxo antigo mantinha seis object URLs de fotos em resolução cheia abertos
  // enquanto tentava decodificar uma sétima superfície para compressão. Em celulares,
  // isso pode exceder o orçamento de memória mesmo para JPEGs perfeitamente válidos.
  function releaseLegacyReportPreviewSurfaces(){
    const groups=[
      {urls:typeof WEEKLY_CHECKIN_PREVIEW_URLS!=='undefined'?WEEKLY_CHECKIN_PREVIEW_URLS:null,prefix:'weekly-photo-preview-'},
      {urls:typeof QUESTIONNAIRE_REPORT_PREVIEW_URLS!=='undefined'?QUESTIONNAIRE_REPORT_PREVIEW_URLS:null,prefix:'report-photo-preview-'}
    ];
    for(const group of groups){
      if(!Array.isArray(group.urls))continue;
      for(let index=0;index<group.urls.length;index++){
        const url=String(group.urls[index]||'');
        if(url.startsWith('blob:'))try{URL.revokeObjectURL(url);}catch(error){}
        group.urls[index]='';
        const preview=document.getElementById(group.prefix+index);
        if(preview&&String(preview.src||'').startsWith('blob:')){preview.removeAttribute('src');preview.classList.remove('active');}
      }
    }
  }

  if(typeof decodeImageForCompression==='function'&&!decodeImageForCompression.__tbMobileDecode){
    const wrapped=async function(file){
      if(!(file instanceof Blob))throw new Error('Escolha uma imagem válida.');
      const type=normalizeType(file);
      if(!type&&!String(file.type||'').toLowerCase().startsWith('image/'))throw new Error('Escolha uma imagem válida.');
      if('createImageBitmap'in window){
        try{
          const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
          if(bitmap?.width&&bitmap?.height)return{source:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close?.()};
          bitmap?.close?.();
        }catch(error){}
        // Alguns WebViews Android reconhecem o arquivo, mas rejeitam a opção
        // imageOrientation. Uma segunda tentativa sem opções evita falso negativo.
        try{
          const bitmap=await createImageBitmap(file);
          if(bitmap?.width&&bitmap?.height)return{source:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close?.()};
          bitmap?.close?.();
        }catch(error){}
      }
      try{
        const decoded=await decodeViaImage(file);
        if(decoded.width&&decoded.height)return decoded;
        decoded.close?.();
      }catch(error){}
      throw decodeFailure(file,type);
    };
    wrapped.__tbMobileDecode=true;
    decodeImageForCompression=wrapped;
  }

  async function lightweightPreview(file){
    const decoded=await decodeImageForCompression(file);
    try{return encodeImageVariant(decoded,520,.68,240000);}
    finally{decoded.close?.();}
  }

  async function prepareReportPreview(kind,index,event){
    const file=event?.target?.files?.[0]||null;if(!file)return;
    const type=normalizeType(file);
    if(!type&&!String(file.type||'').toLowerCase().startsWith('image/')){alert('Escolha uma imagem válida.');event.target.value='';return;}
    const weekly=kind==='weekly';
    const files=weekly?WEEKLY_CHECKIN_FILES:QUESTIONNAIRE_REPORT_FILES;
    const urls=weekly?WEEKLY_CHECKIN_PREVIEW_URLS:QUESTIONNAIRE_REPORT_PREVIEW_URLS;
    const prefix=weekly?'weekly-photo-preview-':'report-photo-preview-';
    const token=++previewTokens[kind][index];
    if(urls[index])try{URL.revokeObjectURL(urls[index]);}catch(error){}
    urls[index]='';files[index]=file;
    const preview=document.getElementById(prefix+index);
    if(preview){preview.removeAttribute('src');preview.classList.remove('active');preview.dataset.tbPhotoPreparing='1';}
    try{
      const dataUrl=await lightweightPreview(file);
      if(token!==previewTokens[kind][index]||files[index]!==file)return;
      if(preview){preview.src=dataUrl;preview.classList.add('active');}
    }catch(error){
      if(token===previewTokens[kind][index]&&files[index]===file){files[index]=null;event.target.value='';if(preview){preview.removeAttribute('src');preview.classList.remove('active');}}
      alert(error?.message||'Não foi possível preparar esta imagem.');
    }finally{if(preview&&token===previewTokens[kind][index])delete preview.dataset.tbPhotoPreparing;}
  }

  if(typeof previewWeeklyCheckinPhoto==='function'){
    previewWeeklyCheckinPhoto=function(index,event){return prepareReportPreview('weekly',Math.max(0,Math.min(5,Number(index)||0)),event);};
    previewWeeklyCheckinPhoto.__tbLightPreview=true;
  }
  if(typeof previewQuestionnaireReportPhoto==='function'){
    previewQuestionnaireReportPhoto=function(index,event){return prepareReportPreview('questionnaire',Math.max(0,Math.min(5,Number(index)||0)),event);};
    previewQuestionnaireReportPhoto.__tbLightPreview=true;
  }

  async function getStorage(){
    if(typeof ensureStorageService!=='function')return null;
    try{return await withTimeout(ensureStorageService(),5000,'carregar armazenamento');}catch(error){return null;}
  }

  async function uploadOriginal(userId,id,file){
    if(!(file instanceof Blob))return false;
    const type=normalizeType(file);if(!type)return false;
    if(!file.size||file.size>MAX_ORIGINAL_BYTES){
      console.warn('[Team Bulls] Original não arquivado: tamanho fora do limite.',file.size);
      return false;
    }
    const service=await getStorage();if(!service)return false;
    const path=originalPath(userId,id);if(!safeToken(userId)||!safeToken(id))return false;
    try{
      const name=originalName(file,id);
      await withTimeout(service.ref(path).put(file,{
        contentType:type,
        cacheControl:'private,max-age=86400',
        contentDisposition:`attachment; filename="${name.replace(/"/g,'_')}"`,
        customMetadata:{originalName:name,teamBullsVersion:VERSION}
      }),60000,'arquivar fotografia original');
      originalMissCache.delete(path);originalUrlCache.delete(path);
      return true;
    }catch(error){
      console.warn('[Team Bulls] Não foi possível arquivar o original; a versão otimizada continua válida.',error?.code||error?.message);
      return false;
    }
  }

  async function resolveOriginal(record,{forDisplay=false}={}){
    const userId=safeToken(record?.userId),id=safeToken(record?.id);if(!userId||!id)return null;
    const path=originalPath(userId,id);if(originalMissCache.has(path))return null;
    if(originalUrlCache.has(path)){
      const cached=originalUrlCache.get(path);
      if(!forDisplay||WEB_IMAGE_TYPES.has(cached.contentType))return cached;
      return null;
    }
    const service=await getStorage();if(!service)return null;
    try{
      const ref=service.ref(path);
      const metadata=await withTimeout(ref.getMetadata(),7000,'verificar fotografia original');
      const contentType=String(metadata?.contentType||'').toLowerCase();
      const url=await withTimeout(ref.getDownloadURL(),7000,'abrir fotografia original');
      const result={path,url,contentType,name:String(metadata?.customMetadata?.originalName||'').trim(),size:Number(metadata?.size)||0};
      originalUrlCache.set(path,result);
      if(forDisplay&&!WEB_IMAGE_TYPES.has(contentType))return null;
      return result;
    }catch(error){
      if(error?.code==='storage/object-not-found'||String(error?.message||'').toLowerCase().includes('object'))originalMissCache.add(path);
      return null;
    }
  }

  if(typeof buildProgressPhotoVariants==='function'&&!buildProgressPhotoVariants.__tbOriginalArchive){
    const baseBuild=buildProgressPhotoVariants;
    const wrapped=async function(file){
      releaseLegacyReportPreviewSurfaces();
      await nextPaint();
      const variants=await baseBuild(file);
      if(file instanceof Blob&&typeof variants?.full==='string')pendingOriginals.set(variants.full,file);
      return variants;
    };
    wrapped.__tbOriginalArchive=true;
    wrapped.__tbMobilePreviewRelease=true;
    buildProgressPhotoVariants=wrapped;
  }

  if(typeof uploadCloudPhoto==='function'&&!uploadCloudPhoto.__tbOriginalArchive){
    const baseUpload=uploadCloudPhoto;
    const wrapped=async function(kind,userId,id,dataUrl){
      const original=kind==='progressPhotos'?pendingOriginals.get(dataUrl):null;
      if(original)pendingOriginals.delete(dataUrl);
      const path=await baseUpload(kind,userId,id,dataUrl);
      if(path&&original)await uploadOriginal(userId,id,original);
      return path;
    };
    wrapped.__tbOriginalArchive=true;
    uploadCloudPhoto=wrapped;
  }

  if(typeof resolvePhotoSource==='function'&&!resolvePhotoSource.__tbOriginalArchive){
    const baseResolve=resolvePhotoSource;
    const wrapped=async function(record,options={}){
      if(options?.full===true){
        const original=await resolveOriginal(record,{forDisplay:true});
        if(original?.url)return original.url;
        const fullPath=typeof safePhotoPath==='function'?safePhotoPath(record?.photoPath):'';
        if(fullPath){
          try{
            if(typeof PHOTO_URL_CACHE!=='undefined'&&PHOTO_URL_CACHE.has(fullPath))return PHOTO_URL_CACHE.get(fullPath);
            const service=await getStorage();if(service){
              const url=await withTimeout(service.ref(fullPath).getDownloadURL(),7000,'abrir fotografia');
              if(typeof PHOTO_URL_CACHE!=='undefined')PHOTO_URL_CACHE.set(fullPath,url);
              return url;
            }
          }catch(error){}
        }
      }
      return baseResolve(record,options);
    };
    wrapped.__tbOriginalArchive=true;
    resolvePhotoSource=wrapped;
  }

  async function downloadRecord(record){
    if(!record||CURRENT_USER?.role!=='trainer')return;
    const context=capturePhotoReadContext(record);if(!photoReadContextCurrent(context))return;
    const original=await resolveOriginal(record,{forDisplay:false});
    if(!photoReadContextCurrent(context))return;
    let url=original?.url||'',name=original?.name||'';
    if(!url){
      const path=typeof safePhotoPath==='function'?safePhotoPath(record?.photoPath):'';
      if(path){
        const service=await getStorage();
        if(service)try{url=await withTimeout(service.ref(path).getDownloadURL(),7000,'baixar fotografia');}catch(error){}
      }
      name=name||`team-bulls-${String(record?.date||'foto')}-${safeToken(record?.id)||'foto'}.jpg`;
    }
    if(!url&&typeof safePhotoDataUrl==='function'){
      const direct=safePhotoDataUrl(record?.dataUrl);
      if(direct){url=direct;name=name||`team-bulls-${String(record?.date||'foto')}-${safeToken(record?.id)||'foto'}.jpg`;}
    }
    if(!photoReadContextCurrent(context))return;
    if(!url){showToast?.('A fotografia não está disponível para download neste momento.',true);return;}
    try{
      const response=await fetch(url,{credentials:'omit'});if(!response.ok)throw new Error('download');
      const blob=await response.blob();if(!photoReadContextCurrent(context))return;const objectUrl=URL.createObjectURL(blob),anchor=document.createElement('a');
      anchor.href=objectUrl;anchor.download=name||'team-bulls-foto';anchor.rel='noopener';document.body.appendChild(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(objectUrl),3000);
      showToast?.('✓ Download da fotografia iniciado');
    }catch(error){
      if(!photoReadContextCurrent(context))return;
      const anchor=document.createElement('a');anchor.href=url;anchor.target='_blank';anchor.rel='noopener';anchor.download=name||'team-bulls-foto';document.body.appendChild(anchor);anchor.click();anchor.remove();
      showToast?.('A foto foi aberta para você salvar no dispositivo.');
    }
  }

  function ensureDownloadButton(record){
    let button=document.getElementById('btn-download-photo');
    const deleteButton=document.getElementById('btn-delete-photo');
    if(!button){
      button=document.createElement('button');button.type='button';button.id='btn-download-photo';
      button.className=deleteButton?.className||'btn btn-outline';button.textContent='↓ BAIXAR FOTO ORIGINAL';
      if(deleteButton?.parentElement)deleteButton.parentElement.insertBefore(button,deleteButton);
      else document.getElementById('modal-photo-view')?.appendChild(button);
    }
    const trainer=typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer';
    button.style.display=trainer?'block':'none';
    button.onclick=()=>downloadRecord(record);
  }

  if(typeof openPhotoView==='function'&&!openPhotoView.__tbOriginalArchive){
    const wrapped=async function(pid,readonly){
      const p=typeof PHOTOS_CACHE!=='undefined'?PHOTOS_CACHE.find(item=>String(item.id)===String(pid)):null;if(!p)return;
      const context=beginPhotoViewRequest(p,pid);
      const title=document.getElementById('photo-view-title');if(title)title.textContent='Evidência // '+fmt(p.date);
      const img=document.getElementById('photo-view-img');if(!img)return;img.removeAttribute('src');
      const src=await resolvePhotoSource(p,{full:true});
      if(!photoViewRequestCurrent(context))return false;
      if(!src){showToast?.('A fotografia não está disponível neste momento.',true);return;}
      img.src=src;
      const meta=document.getElementById('photo-view-meta');if(meta)meta.textContent=Number(p.weight)>0?'PESO REGISTRADO: '+Number(p.weight).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg':'PESO NÃO INFORMADO NESTE REGISTRO';
      const deleteButton=document.getElementById('btn-delete-photo');if(deleteButton)deleteButton.style.display=(readonly||p.checkinId||p.reportId||p.questionnaireId)?'none':'block';
      ensureDownloadButton(p);openModal('modal-photo-view');return true;
    };
    wrapped.__tbOriginalArchive=true;
    openPhotoView=wrapped;
  }

  if(typeof deleteCloudPhoto==='function'&&!deleteCloudPhoto.__tbOriginalArchive){
    const baseDelete=deleteCloudPhoto;
    const wrapped=async function(path){
      const match=/^progressPhotos\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,190})\.jpg$/.exec(String(path||''));
      const result=await baseDelete(path);
      if(match){
        const original=originalPath(match[1],match[2]),service=await getStorage();
        if(service)try{await service.ref(original).delete();}catch(error){}
        originalUrlCache.delete(original);originalMissCache.delete(original);
      }
      return result;
    };
    wrapped.__tbOriginalArchive=true;
    deleteCloudPhoto=wrapped;
  }

  window.TeamBullsPhotoQuality=Object.freeze({version:VERSION,maxOriginalBytes:MAX_ORIGINAL_BYTES,normalizeType,releaseReportPreviews:releaseLegacyReportPreviewSurfaces});
})();

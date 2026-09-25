/* Team Bulls v10.10.12 — conversão HEIC/HEIF local sob demanda para relatórios. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_HEIC_REPORT_CONVERSION__)return;
  window.__TEAM_BULLS_HEIC_REPORT_CONVERSION__=true;

  const VERSION='10.10.12-heic4';
  const MAX_HEIC_BYTES=25*1024*1024;
  const WORKER_URL='./modules/heic-libheif-worker-v10_10_12.js?v=10.10.12-heicworker4';
  let workerPromise=null;
  let workerSeq=0;
  const pendingWorkerRequests=new Map();
  const batchInFlight=new WeakSet();
  const preparedJpegInputs=new WeakMap();
  const convertedHeicInputs=new WeakMap();
  let reportPreviewDepth=0;

  const fileType=file=>{
    const raw=String(file?.type||'').toLowerCase().trim();
    if(raw==='image/heic'||raw==='image/heif')return raw;
    const name=String(file?.name||'').toLowerCase();
    if(/\.heic$/.test(name))return'image/heic';
    if(/\.heif$/.test(name))return'image/heif';
    return'';
  };
  const isHeic=file=>!!fileType(file);
  const isJpeg=file=>{
    const raw=String(file?.type||'').toLowerCase().trim();
    if(raw==='image/jpeg'||raw==='image/jpg'||raw==='image/pjpeg')return true;
    return /\.jpe?g$/i.test(String(file?.name||''));
  };
  const dataUrlToJpegBlob=value=>{
    try{
      const match=/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(value||''));if(!match)return null;
      const raw=atob(match[1]),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      return new Blob([bytes],{type:'image/jpeg'});
    }catch(error){return null;}
  };
  const withReportPreview=async task=>{reportPreviewDepth++;try{return await task();}finally{reportPreviewDepth=Math.max(0,reportPreviewDepth-1);}};
  const stageJpegInput=(file,decoded)=>{
    if(!isJpeg(file)||!decoded?.width||!decoded?.height||typeof encodeImageVariant!=='function')return;
    try{
      const dataUrl=encodeImageVariant(decoded,1280,.78,850000),blob=dataUrlToJpegBlob(dataUrl);
      if(blob?.size)preparedJpegInputs.set(file,blob);
    }catch(error){console.warn('[Team Bulls] JPG seguirá pelo decode normal no envio.',error?.message||error);}
  };
  const timeout=(promise,ms,label)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`${label} demorou mais que o esperado.`)),ms);
    Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
  const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));

  function resetWorker(error){
    const reason=error instanceof Error?error:new Error(String(error||'Decoder HEIC reiniciado.'));
    for(const request of pendingWorkerRequests.values())request.reject(reason);
    pendingWorkerRequests.clear();
    workerPromise=null;
  }

  function getWorker(){
    if(workerPromise)return workerPromise;
    workerPromise=new Promise((resolve,reject)=>{
      if(typeof Worker!=='function'){reject(new Error('Este navegador não oferece o worker seguro necessário para HEIC.'));return;}
      let settled=false;
      let worker;
      try{worker=new Worker(WORKER_URL);}catch(error){reject(error);return;}
      const timer=setTimeout(()=>{
        if(settled)return;settled=true;try{worker.terminate();}catch(error){};reject(new Error('O decoder HEIC não respondeu a tempo.'));
      },35000);
      worker.addEventListener('message',event=>{
        const data=event.data||{};
        if(data.type==='ready'&&!settled){
          settled=true;clearTimeout(timer);
          if(data.ok)resolve(worker);
          else{try{worker.terminate();}catch(error){};reject(new Error(String(data.error||'Decoder HEIC indisponível.')));}
          return;
        }
        const id=String(data.id||'');
        if(!id||!pendingWorkerRequests.has(id))return;
        const request=pendingWorkerRequests.get(id);pendingWorkerRequests.delete(id);
        if(data.ok)request.resolve(data);else request.reject(new Error(String(data.error||'Falha ao decodificar HEIC.')));
      });
      worker.addEventListener('error',event=>{
        const error=new Error(String(event?.message||'Falha no worker HEIC.'));
        if(!settled){settled=true;clearTimeout(timer);reject(error);return;}
        resetWorker(error);
      });
    }).catch(error=>{workerPromise=null;throw error;});
    return workerPromise;
  }

  async function decodeHeicPixels(file){
    const worker=await getWorker();
    const buffer=await file.arrayBuffer();
    const id=`tb-heic-${Date.now()}-${++workerSeq}`;
    return timeout(new Promise((resolve,reject)=>{
      pendingWorkerRequests.set(id,{resolve,reject});
      try{worker.postMessage({id,buffer},[buffer]);}
      catch(error){pendingWorkerRequests.delete(id);reject(error);}
    }),50000,'Decodificar foto HEIC');
  }

  function pixelsToJpeg(decoded){
    return new Promise((resolve,reject)=>{
      try{
        const width=Number(decoded?.width||0),height=Number(decoded?.height||0),buffer=decoded?.rgba;
        if(!width||!height||!(buffer instanceof ArrayBuffer))throw new Error('O decoder HEIC retornou pixels inválidos.');
        const pixels=new Uint8ClampedArray(buffer);
        if(pixels.length!==width*height*4)throw new Error('O decoder HEIC retornou uma imagem incompleta.');
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas indisponível para finalizar a foto HEIC.');
        ctx.putImageData(new ImageData(pixels,width,height),0,0);
        canvas.toBlob(blob=>blob&&blob.size?resolve(blob):reject(new Error('Não foi possível gerar o JPG convertido.')),'image/jpeg',.94);
      }catch(error){reject(error);}
    });
  }

  async function convertHeic(file){
    if(!(file instanceof Blob)||!isHeic(file))return file;
    if(!file.size||file.size>MAX_HEIC_BYTES)throw new Error('A foto HEIC excede 25 MB. Escolha uma foto menor.');
    if(navigator.onLine===false)throw new Error('Conecte-se à internet uma vez para preparar o decoder HEIC.');
    const decoded=await decodeHeicPixels(file);
    const blob=await pixelsToJpeg(decoded);
    const base=String(file?.name||'foto').replace(/\.(heic|heif)$/i,'')||'foto';
    try{return new File([blob],`${base}.jpg`,{type:'image/jpeg',lastModified:Number(file?.lastModified)||Date.now()});}
    catch(error){blob.name=`${base}.jpg`;return blob;}
  }

  function installDecoder(){
    if(typeof decodeImageForCompression!=='function'||decodeImageForCompression.__tbHeicConversion)return false;
    const baseDecode=decodeImageForCompression;
    const wrapped=async function(file){
      if(!isHeic(file)){
        const prepared=preparedJpegInputs.get(file);
        if(prepared){preparedJpegInputs.delete(file);return baseDecode(prepared);}
        const decoded=await baseDecode(file);
        if(reportPreviewDepth>0&&isJpeg(file))stageJpegInput(file,decoded);
        return decoded;
      }
      const converted=convertedHeicInputs.get(file);
      if(converted)return baseDecode(converted);
      try{return await baseDecode(file);}catch(nativeError){
        try{
          const jpeg=await convertHeic(file);
          const decoded=await baseDecode(jpeg);
          convertedHeicInputs.set(file,jpeg);
          return decoded;
        }catch(error){
          const name=String(file?.name||'esta foto');
          const detail=String(error?.message||'').trim();
          throw new Error(`Não foi possível converter ${name} de HEIC/HEIF para JPG${detail?`: ${detail}`:'.'}`);
        }
      }
    };
    wrapped.__tbHeicConversion=true;wrapped.__tbHeicVersion=VERSION;
    decodeImageForCompression=wrapped;
    return true;
  }

  function syntheticEvent(file){return{target:{files:[file],value:''},currentTarget:null};}
  function clearBatchInput(target){try{if(target&&'value'in target)target.value='';}catch(error){}}
  async function processSixPhotoBatch(base,event,kind){
    const target=event?.target||null;
    const selected=Array.from(target?.files||[]);
    if(selected.length<=1)return null;
    if(selected.length!==6){
      clearBatchInput(target);
      alert('Selecione exatamente 6 fotos de uma vez, na ordem indicada: Frente, Costas, Lado direito, Lado esquerdo, Lado direito braços estendidos e Lado esquerdo braços estendidos.');
      return false;
    }
    if(target&&typeof target==='object'&&batchInFlight.has(target))return false;
    if(target&&typeof target==='object')batchInFlight.add(target);
    try{
      for(let slot=0;slot<6;slot++){
        if(typeof showToast==='function')showToast(`Preparando foto ${slot+1} de 6...`);
        await withReportPreview(()=>base(slot,syntheticEvent(selected[slot])));
        const prepared=kind==='weekly'?(typeof WEEKLY_CHECKIN_FILES!=='undefined'?WEEKLY_CHECKIN_FILES[slot]:null):(typeof QUESTIONNAIRE_REPORT_FILES!=='undefined'?QUESTIONNAIRE_REPORT_FILES[slot]:null);
        if(!(prepared instanceof File)){if(typeof showToast==='function')showToast(`Foto ${slot+1} não foi preparada. Escolha uma versão JPG/JPEG ou tente novamente.`,true);return false;}
        await nextPaint();
      }
      let complete=false;
      try{
        const files=kind==='weekly'
          ?(typeof WEEKLY_CHECKIN_FILES!=='undefined'?WEEKLY_CHECKIN_FILES:null)
          :(typeof QUESTIONNAIRE_REPORT_FILES!=='undefined'?QUESTIONNAIRE_REPORT_FILES:null);
        complete=Array.isArray(files)&&files.length===6&&files.every(file=>file instanceof File);
      }catch(error){}
      if(complete&&typeof showToast==='function')showToast('✓ As 6 fotos foram preparadas na ordem selecionada');
      return complete;
    }finally{
      clearBatchInput(target);
      if(target&&typeof target==='object')batchInFlight.delete(target);
    }
  }

  function installBatchPreviewBridge(){
    let changed=false;
    if(typeof previewWeeklyCheckinPhoto==='function'&&!previewWeeklyCheckinPhoto.__tbSixPhotoBatch){
      const base=previewWeeklyCheckinPhoto;
      const wrapped=function(index,event){const count=Number(event?.target?.files?.length)||0;if(count>1)return processSixPhotoBatch(base,event,'weekly');const args=arguments,context=this;return withReportPreview(()=>base.apply(context,args));};
      wrapped.__tbSixPhotoBatch=true;wrapped.__tbBase=base;previewWeeklyCheckinPhoto=wrapped;changed=true;
    }
    if(typeof previewQuestionnaireReportPhoto==='function'&&!previewQuestionnaireReportPhoto.__tbSixPhotoBatch){
      const base=previewQuestionnaireReportPhoto;
      const wrapped=function(index,event){const count=Number(event?.target?.files?.length)||0;if(count>1)return processSixPhotoBatch(base,event,'questionnaire');const args=arguments,context=this;return withReportPreview(()=>base.apply(context,args));};
      wrapped.__tbSixPhotoBatch=true;wrapped.__tbBase=base;previewQuestionnaireReportPhoto=wrapped;changed=true;
    }
    return changed;
  }

  function install(){const decoder=installDecoder();const batch=installBatchPreviewBridge();return decoder||batch;}

  install();
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('team-bulls-runtime-ready',install);
  window.TeamBullsHeicReportConversion=Object.freeze({version:VERSION,isHeic,convert:convertHeic,install});
})();

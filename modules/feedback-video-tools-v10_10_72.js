/* Local video preparation and opt-in, account-scoped offline copies. */
(()=>{
  'use strict';
  if(window.TeamBullsFeedbackVideoTools)return;
  const version='10.10.72-videotools1';
  const MiB=1024*1024,sourceLimit=200*MiB,uploadLimit=60*MiB;
  let opening;
  const owner=()=>window.TeamBullsWorkflowStorage?.owner?.()||'';
  const validOwner=uid=>!!uid&&owner()===uid;
  const cancelled=()=>new DOMException('Preparação cancelada.','AbortError');
  function check(signal){if(signal?.aborted)throw cancelled();}
  function database(){
    if(opening)return opening;
    opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open('team-bulls-feedback-video-local-v1',1);
      request.onupgradeneeded=()=>{
        request.result.createObjectStore('folders');
        request.result.createObjectStore('copies');
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=request.onblocked=()=>reject(new Error('Armazenamento de vídeos indisponível neste aparelho.'));
    }).catch(error=>{opening=null;throw error;});
    return opening;
  }
  async function local(uid,store,operation,key,value){
    if(!validOwner(uid))throw cancelled();
    const db=await database();if(!validOwner(uid))throw cancelled();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,operation==='get'?'readonly':'readwrite');
      const records=tx.objectStore(store);
      const request=operation==='get'?records.get(key):operation==='put'?records.put(value,key):records.delete(key);
      let result;
      request.onsuccess=()=>result=request.result;
      tx.oncomplete=()=>validOwner(uid)?resolve(result):reject(cancelled());
      tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Não foi possível acessar a cópia local do vídeo.'));
    });
  }
  const supportsFolder=()=>typeof window.showDirectoryPicker==='function';
  async function getFolder(uid){return await local(uid,'folders','get',uid)||null;}
  async function chooseFolder(uid){
    if(!supportsFolder()||!validOwner(uid))throw new Error('A seleção de pasta está disponível no Chrome ou Edge do computador.');
    const handle=await window.showDirectoryPicker({mode:'readwrite',id:'team-bulls-feedbacks'});
    if(!validOwner(uid))throw cancelled();
    await local(uid,'folders','put',uid,handle).catch(error=>{if(!validOwner(uid))throw error;});
    return handle;
  }
  function filename(label,name,type){
    const clean=value=>String(value||'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/[. ]+$/g,'').trim().slice(0,72)||'Feedback';
    const ext=String(name||'').match(/\.(mp4|webm|mov|m4v)$/i)?.[0]||(type==='video/webm'?'.webm':'.mp4');
    return new Date().toISOString().slice(0,10)+' - '+clean(label)+' - '+clean(String(name||'Vídeo').replace(/\.[^.]+$/,''))+' - '+crypto.randomUUID().slice(0,8)+ext.toLowerCase();
  }
  async function archive(uid,folder,file,label,name,signal){
    check(signal);
    if(!validOwner(uid)||!folder)throw cancelled();
    if(typeof folder.queryPermission==='function'&&await folder.queryPermission({mode:'readwrite'})!=='granted')throw new Error('Autorize novamente a pasta para salvar o vídeo original.');
    if(!validOwner(uid))throw cancelled();
    check(signal);
    const nameOnDisk=filename(label,name,file.type);
    const handle=await folder.getFileHandle(nameOnDisk,{create:true});
    const writer=await handle.createWritable();
    try{
      check(signal);if(!validOwner(uid))throw cancelled();
      await writer.write(file);
      check(signal);if(!validOwner(uid))throw cancelled();
      await writer.close();
      const saved=await handle.getFile();
      if(saved.size!==file.size)throw new Error('A cópia original não foi confirmada na pasta.');
      return nameOnDisk;
    }catch(error){try{await writer.abort();}catch{}throw error;}
  }
  function downloadOriginal(file,name){
    const src=URL.createObjectURL(file),link=document.createElement('a');
    link.href=src;link.download=/\.[a-z\d]+$/i.test(name)?name:name+(file.type==='video/webm'?'.webm':'.mp4');document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(src),60000);
  }
  async function readDuration(video,knownDuration,signal){
    if(Number.isFinite(video.duration))return video.duration;
    if(Number.isFinite(knownDuration)&&knownDuration>0)return knownDuration;
    // A MediaRecorder WebM may omit duration until the browser seeks to its end.
    return new Promise((resolve,reject)=>{
      const finish=(error,seconds)=>{
        clearTimeout(timer);video.removeEventListener('seeked',seeked);signal?.removeEventListener('abort',abort);
        if(error)reject(error);else{video.currentTime=0;resolve(seconds);}
      };
      const seeked=()=>{
        const seconds=Number.isFinite(video.duration)?video.duration:video.currentTime;
        if(Number.isFinite(seconds)&&seconds>0&&seconds<86400)finish(null,seconds);
      };
      const abort=()=>finish(cancelled());
      const timer=setTimeout(()=>finish(new Error('Não foi possível conferir a duração. Exporte o vídeo como MP4.')),15000);
      video.addEventListener('seeked',seeked);signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();else try{video.currentTime=Number.MAX_SAFE_INTEGER;}catch(error){finish(error);}
    });
  }
  const isSource=file=>file instanceof Blob&&file.size>0&&file.size<=sourceLimit
    &&(/^(video\/(mp4|webm|quicktime|x-m4v))$/.test(file.type)||/\.(mp4|webm|mov|m4v)$/i.test(file.name||''));
  function mediaSource(file,signal){
    const video=document.createElement('video'),src=URL.createObjectURL(file);
    video.preload='metadata';video.playsInline=true;video.src=src;
    function dispose(){video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(src);}
    const loaded=new Promise((resolve,reject)=>{
      const finish=error=>{
        clearTimeout(timer);signal?.removeEventListener('abort',abort);
        video.onloadedmetadata=video.onerror=null;
        error?reject(error):resolve(video);
      };
      const abort=()=>finish(cancelled());
      const timer=setTimeout(()=>finish(new Error('O vídeo não pôde ser lido. Tente MP4.')),20000);
      video.onloadedmetadata=()=>finish();
      video.onerror=()=>finish(new Error('Formato de vídeo incompatível com este navegador.'));
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();
    });
    return {video,loaded,dispose};
  }
  async function duration(file,knownDuration=null,signal){
    const source=mediaSource(file,signal);
    try{
      const video=await source.loaded;
      const seconds=await readDuration(video,knownDuration,signal);
      if(!Number.isFinite(seconds)||seconds<=0||!video.videoWidth||!video.videoHeight)throw new Error('Não foi possível conferir a duração do vídeo. Exporte-o como MP4 e tente novamente.');
      return seconds;
    }finally{source.dispose();}
  }
  // Construct and unlock audio during the explicit user gesture. Some browsers
  // need an active AudioContext before a recording can include the original sound.
  function primeAudio(){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return null;
    try{
      const context=new Audio();
      context.resume().catch(()=>{});
      return context;
    }catch{return null;}
  }
  function recordingMime(){
    return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm']
      .find(value=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(value));
  }
  async function prepare(file,{knownDuration=null,signal,audio=null,progress=()=>{}}={}){
    if(!isSource(file))throw new Error('Selecione um vídeo de até 200 MB em MP4, WebM ou MOV.');
    const source=mediaSource(file,signal);
    let media,stream,destination,frame,visibility,abort,abortReject;
    try{
      const video=await source.loaded;check(signal);
      const seconds=await readDuration(video,knownDuration,signal);
      if(!Number.isFinite(seconds)||seconds<=0||!video.videoWidth||!video.videoHeight)throw new Error('Não foi possível ler a duração. Exporte o vídeo como MP4.');
      const originalType=/^video\/(mp4|webm)$/.test(file.type);
      const videoBitrate=Math.floor(Math.min(1200000,uploadLimit*8*.85/seconds-64000));
      const compactNeeded=!originalType||file.size>uploadLimit||
        (file.size>10*MiB&&file.size*8/seconds>Math.max(180000,videoBitrate+64000)*1.2);
      if(!compactNeeded){progress(1);return {blob:file,duration:seconds,compressed:false};}
      if(videoBitrate<80000)throw new Error('O vídeo é longo demais para compactar mantendo a qualidade mínima do áudio e da imagem. Divida o vídeo em partes.');
      const mime=recordingMime(),canvas=document.createElement('canvas');
      if(!mime||!canvas.captureStream||!audio)throw new Error('A compactação está indisponível neste navegador. Use o Chrome ou Edge do computador.');
      if(audio.state!=='running')await Promise.race([audio.resume(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Toque em preparar vídeo para autorizar o áudio.')),4000))]);
      check(signal);
      const maxEdge=videoBitrate>=850000?1280:videoBitrate>=420000?854:640;
      const scale=Math.min(1,maxEdge/Math.max(video.videoWidth,video.videoHeight));
      canvas.width=Math.max(2,Math.floor(video.videoWidth*scale/2)*2);
      canvas.height=Math.max(2,Math.floor(video.videoHeight*scale/2)*2);
      const context=canvas.getContext('2d',{alpha:false});
      stream=canvas.captureStream(24);
      destination=audio.createMediaStreamDestination();
      const sound=audio.createMediaElementSource(video);sound.connect(destination);
      const tracks=[...stream.getVideoTracks(),...destination.stream.getAudioTracks()];
      media=new MediaRecorder(new MediaStream(tracks),{mimeType:mime,videoBitsPerSecond:videoBitrate,audioBitsPerSecond:64000});
      const chunks=[];let bytes=0;
      const recorded=new Promise((resolve,reject)=>{
        abortReject=reject;
        media.ondataavailable=event=>{
          bytes+=event.data.size;
          if(bytes>uploadLimit){reject(new Error('A versão compactada ultrapassou 60 MB. Divida o vídeo em partes.'));return;}
          if(event.data.size)chunks.push(event.data);
        };
        media.onerror=()=>reject(new Error('Não foi possível compactar o vídeo.'));
        media.onstop=()=>resolve(new Blob(chunks,{type:media.mimeType.startsWith('video/mp4')?'video/mp4':'video/webm'}));
      });
      recorded.catch(()=>{});
      const draw=()=>{
        if(video.readyState>=2)context.drawImage(video,0,0,canvas.width,canvas.height);
        progress(Math.min(.99,video.currentTime/seconds));
        if(!video.ended)frame=video.requestVideoFrameCallback?video.requestVideoFrameCallback(draw):requestAnimationFrame(draw);
      };
      abort=()=>abortReject(cancelled());
      signal?.addEventListener('abort',abort,{once:true});
      video.onerror=()=>abortReject(new Error('O vídeo parou de responder durante a compactação.'));
      video.onended=()=>{if(media.state!=='inactive')media.stop();};
      visibility=()=>{
        if(media.state==='inactive')return;
        if(document.hidden){video.pause();if(media.state==='recording')media.pause();}
        else{if(media.state==='paused')media.resume();video.play().catch(()=>abortReject(new Error('A compactação foi interrompida. Toque em preparar novamente.')));}
      };
      document.addEventListener('visibilitychange',visibility);
      check(signal);
      await video.play();
      context.drawImage(video,0,0,canvas.width,canvas.height);
      media.start(1000);draw();visibility();
      const blob=await recorded;check(signal);
      if(!blob.size||blob.size>uploadLimit)throw new Error('O vídeo compactado não ficou dentro do limite de envio.');
      progress(1);return {blob,duration:seconds,compressed:true};
    }finally{
      signal?.removeEventListener('abort',abort);
      document.removeEventListener('visibilitychange',visibility);
      if(frame!=null){if(source.video.cancelVideoFrameCallback)source.video.cancelVideoFrameCallback(frame);else cancelAnimationFrame(frame);}
      if(media?.state&&media.state!=='inactive')try{media.ondataavailable=null;media.onstop=null;media.stop();}catch{}
      stream?.getTracks().forEach(track=>track.stop());
      destination?.stream.getTracks().forEach(track=>track.stop());
      source.dispose();if(audio&&audio.state!=='closed')try{await audio.close();}catch{}
    }
  }
  const copyKey=(uid,path)=>JSON.stringify([uid,path]);
  async function getCopy(uid,path){
    const value=await local(uid,'copies','get',copyKey(uid,path));
    if(value?.owner!==uid||value.path!==path)return null;
    if(value.blob instanceof Blob)return value.blob;
    return value.bytes instanceof ArrayBuffer?new Blob([value.bytes],{type:value.type}):null;
  }
  async function saveCopy(uid,path,blob){
    if(!(blob instanceof Blob)||!blob.size||blob.size>uploadLimit)throw new Error('O vídeo não cabe no armazenamento local.');
    try{await local(uid,'copies','put',copyKey(uid,path),{owner:uid,path,blob});}
    catch(error){
      if(!validOwner(uid))throw error;
      // Some iOS/WebKit installations cannot persist native Blob values.
      const bytes=await blob.arrayBuffer();
      await local(uid,'copies','put',copyKey(uid,path),{owner:uid,path,bytes,type:blob.type});
    }
    return true;
  }
  async function deleteCopy(uid,path){await local(uid,'copies','delete',copyKey(uid,path));return true;}
  async function fetchCopy(src,item,signal,progress=()=>{}){
    const response=await fetch(src,{signal,cache:'no-store'});
    const expected=Number(item.size);
    if(!response.ok||!Number.isFinite(expected)||expected<1||expected>uploadLimit)throw new Error('Não foi possível baixar este vídeo.');
    const reader=response.body?.getReader();
    if(!reader){const blob=await response.blob();if(blob.size!==expected)throw new Error('Vídeo incompleto. Tente novamente.');return new Blob([blob],{type:item.mime});}
    let size=0;const chunks=[];
    try{
      for(;;){
        const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;if(size>expected)throw new Error('O tamanho do vídeo não corresponde ao feedback.');
        chunks.push(value);progress(size/expected);
      }
      if(size!==expected)throw new Error('Vídeo incompleto. Tente novamente.');
      return new Blob(chunks,{type:item.mime});
    }finally{if(size!==expected)await reader.cancel().catch(()=>{});}
  }
  window.TeamBullsFeedbackVideoTools=Object.freeze({version,sourceLimit,uploadLimit,isSource,primeAudio,supportsFolder,getFolder,chooseFolder,archive,downloadOriginal,duration,prepare,getCopy,saveCopy,deleteCopy,fetchCopy});
})();

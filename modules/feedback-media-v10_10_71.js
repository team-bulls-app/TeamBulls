/* Trainer-owned copies and immutable, account-bound feedback attachments. */
(()=>{
  'use strict';if(window.TeamBullsFeedbackMedia)return;
  const version='10.10.72-feedbackmedia2',MAX_VIDEO=60*1024*1024,MAX_IMAGE=2*1024*1024;
  let draft=null,recording=null,cameraRequest=null,uploading=false,annotation=null;const flights=new Map(),urls=new Set(),viewOwners=new WeakMap();
  const store=()=>window.TeamBullsWorkflowStorage,owner=()=>store()?.owner()||'';
  const videoTools=()=>window.TeamBullsFeedbackVideoTools;
  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud';}catch{return false;}};
  const subject=()=>{try{return String(VIEW_STUDENT?.uid||'');}catch{return'';}};
  const current=state=>!!state&&trainer()&&owner()===state.owner&&subject()===state.studentId;
  const currentDraft=state=>draft===state&&current(state);
  const scope=state=>({owner:state.owner,subject:state.studentId,kind:'receipt',id:'media:'+state.id});
  const draftScope=state=>({owner:state.owner,subject:state.studentId,kind:'draft',id:'feedback-media'});
  const url=blob=>{const value=URL.createObjectURL(blob);urls.add(value);return value;};
  const revoke=value=>{if(urls.delete(value))URL.revokeObjectURL(value);};
  const notify=(message,error=false)=>{if(typeof showToast==='function')showToast(message,error);};
  const validFile=file=>file instanceof Blob&&file.size>0&&(/^(video\/(mp4|webm))$/.test(file.type)?file.size<=MAX_VIDEO:file.type==='image/jpeg'&&file.size<=MAX_IMAGE);
  const button=(label,run)=>{const el=document.createElement('button');el.type='button';el.className='btn-ghost';el.textContent=label;el.onclick=run;return el;};
  function clearPreviews(){document.querySelectorAll('[data-feedback-media] video').forEach(video=>{video.pause();video.removeAttribute('src');video.load();});for(const value of [...urls])revoke(value);}
  async function persistDraft(target){
    if(!currentDraft(target))return false;
    const result=await store().put(draftScope(target),{source:'media-draft',files:target.files.slice(),route:{modal:'modal-feedback',subject:target.studentId,entity:target.studentId+'|feedback'},mediaId:target.id,archivedName:target.archivedName||''});
    if(currentDraft(target)&&(!result.ok||!result.media))notify('Não foi possível recuperar os anexos após fechar o app. Mantenha esta tela aberta até enviar.',true);
    return result.ok&&result.media;
  }
  function canEditAttachments(target){
    if(!currentDraft(target)||uploading)return false;
    if(target.pending){notify('Este envio aguarda confirmação. Retome o feedback original pela Central de sincronização.',true);return false;}
    return true;
  }
  async function add(file,name,sourcePhotoId='',knownDuration=null,target=draft){
    if(!canEditAttachments(target))return false;
    if(!validFile(file)){notify('Use imagem JPEG de até 2 MB ou vídeo MP4/WebM de até 60 MB.',true);return false;}
    const video=file.type.startsWith('video/');
    if(video){
      if(target.checkingVideo)return false;
      target.checkingVideo=true;
      try{await videoDuration(file,knownDuration);}catch(error){if(currentDraft(target))notify(error.message,true);return false;}
      finally{target.checkingVideo=false;}
    }
    if(!canEditAttachments(target))return false;
    if(target.files.length>=6){notify('Use até seis anexos por feedback.',true);return false;}
    if(video&&target.files.some(item=>item.type.startsWith('video/'))){notify('Use um vídeo por feedback. Envie outro feedback para acrescentar mais vídeos.',true);return false;}
    target.id=crypto.randomUUID();
    target.files.push({blob:file,name:String(name||'anexo').slice(0,100),type:file.type,sourcePhotoId:String(sourcePhotoId||'').slice(0,160)});
    await persistDraft(target);
    if(!currentDraft(target))return false;
    renderEditor();return true;
  }
  function videoDuration(file,knownDuration=null){return videoTools().duration(file,knownDuration);}
  const sizeLabel=file=>(file.size/(1024*1024)).toLocaleString('pt-BR',{maximumFractionDigits:1})+' MB';
  function cancelPreparation(target){
    if(target?.preparation)target.preparation.controller.abort();
  }
  function selectVideo(file,name,knownDuration=null,target=draft){
    if(!canEditAttachments(target)||target.preparation||target.checkingVideo)return;
    if(!videoTools()?.isSource(file)){notify('Escolha um vídeo de até 200 MB em MP4, WebM ou MOV.',true);return;}
    if(target.files.length>=6||target.files.some(item=>item.type.startsWith('video/'))){notify('Use um vídeo por feedback e até seis anexos.',true);return;}
    target.sourceVideo={file,name:name||'Vídeo de feedback',knownDuration,archivedName:''};
    target.mediaMessage='Vídeo selecionado. Prepare a versão para o aluno.';
    renderEditor();
  }
  async function chooseVideoFolder(target){
    if(!currentDraft(target)||target.preparation||uploading)return;
    try{
      const folder=await videoTools().chooseFolder(target.owner);
      if(currentDraft(target)){target.folder=folder;target.folderLoaded=true;target.mediaMessage='Pasta selecionada para os vídeos originais.';}
    }catch(error){if(currentDraft(target)&&error.name!=='AbortError')target.mediaMessage=error.message;}
    if(currentDraft(target))renderEditor();
  }
  function preparationStatus(target,message,amount=0){
    if(!currentDraft(target))return;
    target.mediaMessage=message;
    const status=document.querySelector('#modal-feedback [data-media-status]');
    const progress=document.querySelector('#modal-feedback [data-video-progress]');
    if(status&&status.textContent!==message)status.textContent=message;
    if(progress)progress.value=amount;
  }
  async function prepareVideo(target){
    const source=target?.sourceVideo,tools=videoTools();
    if(!source||!canEditAttachments(target)||target.preparation||target.checkingVideo)return false;
    if(tools.supportsFolder()&&!target.folder&&!source.archivedName){
      target.mediaMessage='Selecione a pasta dos originais antes de preparar o vídeo.';renderEditor();return false;
    }
    const controller=new AbortController(),job={controller};target.preparation=job;
    let audio;
    const active=()=>currentDraft(target)&&target.preparation===job&&target.sourceVideo===source&&!controller.signal.aborted;
    try{
      audio=tools.primeAudio();
      renderEditor();
      if(target.folder&&!source.archivedName){
        preparationStatus(target,'Salvando o vídeo original na pasta escolhida…');
        source.archivedName=await tools.archive(target.owner,target.folder,source.file,VIEW_STUDENT?.name||'Aluno',source.name,controller.signal);
      }
      if(!active())return false;
      preparationStatus(target,'Preparando a versão para o aluno…');
      const output=await tools.prepare(source.file,{knownDuration:source.knownDuration,signal:controller.signal,audio,progress:value=>{
        if(active())preparationStatus(target,'Preparando vídeo · '+Math.round(value*100)+'%',value);
      }});
      if(!active())return false;
      target.archivedName=source.archivedName;
      target.preparation=null;
      const added=await add(output.blob,source.name,'',output.duration,target);
      if(!currentDraft(target))return false;
      if(added){
        target.sourceVideo=null;
        target.mediaMessage=(output.compressed?'Vídeo compactado: '+sizeLabel(source.file)+' → ':'Vídeo pronto: ')+sizeLabel(output.blob)+'.';
      }
      return added;
    }catch(error){
      if(currentDraft(target))target.mediaMessage=error.name==='AbortError'?'Preparação cancelada. O vídeo original continua disponível.':error.message;
      return false;
    }finally{
      if(audio&&audio.state!=='closed')try{await audio.close();}catch{}
      if(target.preparation===job)target.preparation=null;
      if(currentDraft(target))renderEditor();
    }
  }
  function renderEditor(){
    const host=document.querySelector('#modal-feedback [data-feedback-media]');if(!host||!current(draft))return;for(const media of host.querySelectorAll('[data-local-media]')){if(media.tagName==='VIDEO')media.pause();revoke(media.src);}host.replaceChildren();
    const title=document.createElement('h3');title.textContent='EXPLICAÇÕES VISUAIS';host.append(title);
    const help=document.createElement('p');help.textContent='Selecione um vídeo de até 200 MB. O app prepara uma versão leve de até 60 MB para o aluno. Até seis anexos por feedback.';host.append(help);
    const target=draft,locked=uploading||!!target.pending||!!target.preparation||!!target.checkingVideo;
    if(videoTools()?.supportsFolder()){
      const archive=document.createElement('div');archive.className='tb-video-archive';
      const text=document.createElement('div');text.innerHTML='<strong>Arquivo local do treinador</strong><small></small>';
      text.querySelector('small').textContent=target.folder?'Pasta: '+target.folder.name:'Escolha onde guardar os vídeos originais.';
      const choose=button(target.folder?'ALTERAR PASTA':'ESCOLHER PASTA',()=>void chooseVideoFolder(target));choose.disabled=locked||!!recording;
      archive.append(text,choose);host.append(archive);
    }
    const file=document.createElement('input');file.type='file';file.accept='video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v';file.hidden=true;file.setAttribute('aria-label','Selecionar arquivo de vídeo');file.disabled=locked||!!recording||!!cameraRequest;file.onchange=()=>{const selected=file.files?.[0];if(selected)selectVideo(selected,selected.name,null,target);file.value='';};host.append(file);
    const controls=document.createElement('div');controls.className='tb-flow-actions';
    const pick=button('SELECIONAR VÍDEO',()=>file.click());pick.disabled=file.disabled;
    const recordButton=button(recording?'ENCERRAR GRAVAÇÃO':'GRAVAR VÍDEO',()=>recording?stopRecording():void startRecording());recordButton.disabled=locked||!!cameraRequest||!!target.sourceVideo;
    controls.append(pick,recordButton);host.append(controls);
    if(target.sourceVideo){
      const source=target.sourceVideo,card=document.createElement('section');card.className='tb-video-source';
      const title=document.createElement('strong');title.textContent=source.name+' · '+sizeLabel(source.file);card.append(title);
      if(source.archivedName){const info=document.createElement('small');info.textContent='Original salvo: '+source.archivedName;card.append(info);}
      const actions=document.createElement('div');actions.className='tb-flow-actions';
      if(target.preparation){
        const progress=document.createElement('progress');progress.dataset.videoProgress='1';progress.max=1;progress.value=0;progress.setAttribute('aria-label','Preparação do vídeo');card.append(progress);
        actions.append(button('CANCELAR PREPARAÇÃO',()=>cancelPreparation(target)));
      }else{
        const prepare=button('PREPARAR VÍDEO',()=>void prepareVideo(target));prepare.className='btn-primary';prepare.disabled=locked;actions.append(prepare);
        if(!videoTools().supportsFolder())actions.append(button('SALVAR ORIGINAL',()=>videoTools().downloadOriginal(source.file,source.name)));
        const remove=button('REMOVER VÍDEO',()=>{if(!canEditAttachments(target))return;target.sourceVideo=null;target.mediaMessage='';renderEditor();});remove.disabled=locked;actions.append(remove);
      }
      card.append(actions);host.append(card);
    }
    if(recording){const preview=document.createElement('video');preview.autoplay=true;preview.muted=true;preview.playsInline=true;preview.srcObject=recording.stream;host.append(preview);const text=document.createElement('p');text.textContent='Gravação em andamento. Encerre para conferir antes de enviar.';host.append(text);}
    target.files.forEach((item,index)=>{const card=document.createElement('section'),media=document.createElement(item.type.startsWith('video/')?'video':'img');media.dataset.localMedia='1';media.src=url(item.blob);media.style.cssText='max-width:100%;max-height:360px';if(media.tagName==='VIDEO'){media.controls=true;media.preload='metadata';media.playsInline=true;}else media.alt='Cópia anotada para o feedback';card.append(media);if(item.type.startsWith('video/')){const info=document.createElement('small');info.textContent='Arquivo para o aluno: '+sizeLabel(item.blob)+(target.archivedName?' · Original salvo na pasta do treinador.':'');card.append(info);}const remove=button('REMOVER ANEXO',()=>{if(!canEditAttachments(target))return;if(target.files[index]?.type.startsWith('video/')){target.archivedName='';target.mediaMessage='';}target.files.splice(index,1);target.id=crypto.randomUUID();void persistDraft(target);renderEditor();});remove.disabled=locked;card.append(remove);host.append(card);});
    const status=document.createElement('p');status.dataset.mediaStatus='1';status.setAttribute('role','status');status.textContent=uploading?'Enviando e confirmando anexos…':target.pending?'Envio pendente. Retome com os mesmos anexos.':target.mediaMessage||target.files.length+' anexo(s) preparado(s). Confira antes de enviar.';host.append(status);
  }
  function stopRecording(discard=false){cameraRequest=null;const state=recording;if(!state)return;recording=null;state.discard=discard;clearTimeout(state.timer);try{if(state.recorder.state!=='inactive')state.recorder.stop();}catch{}state.stream.getTracks().forEach(track=>track.stop());}
  async function startRecording(){
    const captured=draft;if(!canEditAttachments(captured)||recording||cameraRequest||captured.sourceVideo||captured.preparation)return;
    if(captured.files.length>=6||captured.files.some(item=>item.type.startsWith('video/'))){notify('Use um vídeo por feedback e até seis anexos.',true);return;}
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){notify('A gravação não está disponível neste navegador. Grave com a câmera do aparelho e selecione o vídeo.',true);return;}
    const request={draft:captured};cameraRequest=request;renderEditor();let stream;
    try{stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'},audio:true});
      if(cameraRequest!==request||!currentDraft(captured)||uploading||!document.getElementById('modal-feedback')?.classList.contains('open')){stream.getTracks().forEach(track=>track.stop());return;}
      const mime=['video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));if(!mime){stream.getTracks().forEach(track=>track.stop());throw new Error('Formato de gravação incompatível. Grave pelo aparelho e selecione o arquivo.');}
      const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1200000}),chunks=[],state={stream,recorder,draft:captured,started:Date.now(),discard:false,size:0,timer:0};recording=state;
      recorder.ondataavailable=event=>{if(event.data.size){state.size+=event.data.size;chunks.push(event.data);if(state.size>=videoTools().sourceLimit-2*1024*1024&&recording===state)stopRecording();}};
      recorder.onerror=()=>{state.discard=true;if(recording===state)stopRecording(true);if(currentDraft(captured))notify('A gravação foi interrompida. Tente selecionar um vídeo do aparelho.',true);};
      recorder.onstop=()=>{stream.getTracks().forEach(track=>track.stop());if(recording===state)recording=null;clearTimeout(state.timer);if(!state.discard&&chunks.length&&currentDraft(captured))selectVideo(new Blob(chunks,{type:mime.startsWith('video/mp4')?'video/mp4':'video/webm'}),'Orientações em vídeo',Math.max(0,(Date.now()-state.started)/1000),captured);if(currentDraft(captured))renderEditor();};
      recorder.start(1000);
    }catch(error){if(recording?.stream===stream)stopRecording(true);else stream?.getTracks().forEach(track=>track.stop());if(currentDraft(captured))notify(error.name==='NotAllowedError'?'Câmera ou microfone não autorizados. Você pode selecionar um vídeo já gravado.':error.message,true);}
    finally{if(cameraRequest===request)cameraRequest=null;if(currentDraft(captured))renderEditor();}
  }
  async function editor(){
    if(!trainer()||!subject())return;const studentId=subject(),uid=owner();if(!draft||!current(draft)){cancelPreparation(draft);stopRecording(true);clearPreviews();draft={owner:uid,studentId,id:crypto.randomUUID(),files:[]};}
    let host=document.querySelector('#modal-feedback [data-feedback-media]');if(!host){host=document.createElement('section');host.dataset.feedbackMedia='editor';document.getElementById('input-feedback')?.closest('.form-group')?.insertAdjacentElement('afterend',host);if(!host.isConnected)document.querySelector('#modal-feedback .modal-sheet')?.append(host);}
    renderEditor();const state=draft;
    if(!state.folderLoaded&&videoTools()?.supportsFolder()){
      const folder=await videoTools().getFolder(uid).catch(()=>null);
      if(!currentDraft(state))return;
      if(!state.folderLoaded){state.folder=folder;state.folderLoaded=true;renderEditor();}
    }
    const saved=await store().get(draftScope(state));if(!currentDraft(state)||!saved?.files?.length||state.files.length)return;
    const pending=saved.mediaId?await store().get(scope({...state,id:saved.mediaId})):null;
    if(!currentDraft(state)||state.files.length)return;
    const recover=button('RECUPERAR ANEXOS DO RASCUNHO',()=>{if(!currentDraft(state)||state.files.length||state.sourceVideo||uploading)return;state.id=saved.mediaId||state.id;state.pending=!!pending;state.archivedName=saved.archivedName||'';state.files=saved.files.filter(item=>validFile(item.blob)).slice(0,6);renderEditor();});host.prepend(recover);
  }
  async function annotate(){
    if(!trainer()||!subject())return;const image=document.getElementById('photo-view-img'),pid=typeof CUR_PHOTO_ID!=='undefined'?String(CUR_PHOTO_ID||''):'';if(!image?.src||!pid){notify('Abra uma foto do relatório primeiro.',true);return;}const record=typeof PHOTOS_CACHE!=='undefined'?PHOTOS_CACHE.find(item=>String(item.id)===pid):null;if(!record||String(record.userId||record.studentId||'')!==subject()){notify('Abra uma foto do aluno selecionado para criar a explicação visual.',true);return;}
    const state={owner:owner(),studentId:subject(),pid,strokes:[],stroke:null,tool:'pen',color:'#ff304f',text:'',width:4};
    const source=new Image();source.crossOrigin='anonymous';try{await new Promise((resolve,reject)=>{source.onload=resolve;source.onerror=reject;source.src=image.src;});}catch{notify('Não foi possível preparar a cópia da foto. Tente abrir a foto novamente.',true);return;}
    if(!current(state)||String(CUR_PHOTO_ID||'')!==pid||image.src!==source.src)return;const {body}=window.TeamBullsWorkflowSync.dialog('Anotar cópia da foto','modal-feedback-annotation');annotation=state;
    const toolbar=document.createElement('div');toolbar.className='tb-flow-actions';const tools=document.createElement('select');tools.setAttribute('aria-label','Ferramenta de anotação');for(const [value,label] of [['pen','Desenhar'],['arrow','Seta'],['text','Texto']]){const option=document.createElement('option');option.value=value;option.textContent=label;tools.append(option);}tools.onchange=()=>state.tool=tools.value;
    const color=document.createElement('input');color.type='color';color.value=state.color;color.setAttribute('aria-label','Cor da anotação');color.oninput=()=>state.color=color.value;
    const text=document.createElement('input');text.type='text';text.maxLength=150;text.placeholder='Texto para colocar na foto';text.setAttribute('aria-label','Texto da anotação');text.oninput=()=>state.text=text.value;toolbar.append(tools,color,text);body.append(toolbar);
    const canvas=document.createElement('canvas'),ratio=Math.min(1,1600/Math.max(source.naturalWidth,source.naturalHeight));canvas.width=Math.round(source.naturalWidth*ratio);canvas.height=Math.round(source.naturalHeight*ratio);canvas.style.cssText='display:block;width:100%;height:auto;touch-action:none;border:1px solid #725b4f';canvas.setAttribute('aria-label','Área para desenhar na cópia da foto');body.append(canvas);const ctx=canvas.getContext('2d');
    const paint=()=>{ctx.drawImage(source,0,0,canvas.width,canvas.height);for(const stroke of [...state.strokes,...(state.stroke?[state.stroke]:[])]){ctx.strokeStyle=ctx.fillStyle=stroke.color;ctx.lineWidth=4;ctx.lineCap='round';const [a,b]=[stroke.points[0],stroke.points.at(-1)];if(stroke.tool==='text'){ctx.font='bold '+Math.max(20,canvas.width/30)+'px sans-serif';ctx.fillText(stroke.text,a.x,a.y,canvas.width-a.x);continue;}ctx.beginPath();ctx.moveTo(a.x,a.y);for(const point of stroke.points)ctx.lineTo(point.x,point.y);ctx.stroke();if(stroke.tool==='arrow'&&b){const angle=Math.atan2(b.y-a.y,b.x-a.x);ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-22*Math.cos(angle-.45),b.y-22*Math.sin(angle-.45));ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-22*Math.cos(angle+.45),b.y-22*Math.sin(angle+.45));ctx.stroke();}}};
    const point=event=>{const bounds=canvas.getBoundingClientRect();return{x:(event.clientX-bounds.left)*canvas.width/bounds.width,y:(event.clientY-bounds.top)*canvas.height/bounds.height};};
    canvas.onpointerdown=event=>{if(!current(state)||state.strokes.length>=200)return;event.preventDefault();canvas.setPointerCapture(event.pointerId);state.stroke={tool:state.tool,color:state.color,text:state.text,points:[point(event)]};paint();};
    canvas.onpointermove=event=>{if(!state.stroke)return;event.preventDefault();if(state.stroke.tool==='pen'&&state.stroke.points.length<5000)state.stroke.points.push(point(event));else if(state.stroke.tool==='arrow')state.stroke.points[1]=point(event);paint();};
    canvas.onpointerup=()=>{if(state.stroke){state.strokes.push(state.stroke);state.stroke=null;paint();}};canvas.onpointercancel=()=>{state.stroke=null;paint();};
    toolbar.append(button('DESFAZER',()=>{state.strokes.pop();paint();}),button('LIMPAR MARCAÇÕES',()=>{state.strokes=[];paint();}));
    let attaching=false;
    const attach=async separate=>{
      if(attaching||annotation!==state||!current(state))return;
      attaching=true;
      try{
        if(separate){
          if(currentDraft(draft)&&draft.files.length){notify('Envie ou remova os anexos do feedback atual antes de criar outro.',true);return;}
          openFeedbackModal('extra');
        }else if(!document.getElementById('modal-feedback')?.classList.contains('open'))openFeedbackModal('extra');
        await editor();
        const target=draft;
        if(annotation!==state||!current(state)||!canEditAttachments(target))return;
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));
        if(annotation!==state||!current(state)||!currentDraft(target))return;
        if(!blob){notify('Não foi possível exportar a cópia anotada.',true);return;}
        if(await add(blob,'Foto anotada',state.pid,null,target)&&annotation===state&&currentDraft(target)){
          closeModal('modal-feedback-annotation');notify('Cópia anexada. Confira a mensagem e envie o feedback.');
        }
      }finally{attaching=false;}
    };
    body.append(button('ANEXAR AO FEEDBACK',()=>void attach(false)),button('CRIAR FEEDBACK SEPARADO',()=>void attach(true)));paint();
  }
  function pathFor(state,index,item){return'feedbackAttachments/'+state.owner+'/'+state.studentId+'/'+state.id+'/'+index+(item.type==='image/jpeg'?'.jpg':item.type==='video/mp4'?'.mp4':'.webm');}
  async function existing(state){
    const query=db.collection('feedback').where('studentId','==',state.studentId).where(firebase.firestore.FieldPath.documentId(),'==',state.id);
    const snap=await cloudGet({get:()=>query.get({source:'server'})},'conferir envio do feedback');
    const doc=snap.docs?.[0];
    if(snap.metadata?.fromCache||doc?.metadata?.hasPendingWrites)throw new Error('O servidor ainda não confirmou o feedback.');
    return doc?.data()||null;
  }
  function sameDelivery(actual,expected){
    if(!actual||!expected)return false;
    const fields=['trainerId','studentId','title','message','feedbackType','feedbackCategory','protocolStartDate','protocolCycle'];
    if(fields.some(field=>actual[field]!==expected[field]))return false;
    const manifest=data=>(data.attachments||[]).map(item=>[item.path,item.kind,item.mime,item.size,item.name,item.sourcePhotoId]);
    return JSON.stringify(actual.attachmentPaths||[])===JSON.stringify(expected.attachmentPaths||[])&&JSON.stringify(manifest(actual))===JSON.stringify(manifest(expected));
  }
  function receiptDelivery(record,id){
    if(record?.source!=='media'||record.id!=='media:'+id||!record.files?.length)return null;
    return {...record,id,uploaded:record.uploaded||[]};
  }
  async function uploadAttachment(ref,item,state){
    const upload=ref.put(item.blob,{contentType:item.type});
    try{
      if(typeof upload.on!=='function')return await withTimeout(upload,120000,'enviar anexo');
      return await new Promise((resolve,reject)=>{
        let timer,last=-1,unsubscribe;
        const finish=(error,value)=>{clearTimeout(timer);unsubscribe?.();error?reject(error):resolve(value);};
        const restart=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(new Error('Envio sem progresso. Retome pela Central de sincronização.')),120000);};
        restart();
        unsubscribe=upload.on('state_changed',snapshot=>{
          if(!current(state)){finish(new Error('A conta ou o aluno mudou.'));return;}
          if(snapshot.bytesTransferred!==last){last=snapshot.bytesTransferred;restart();}
          if(currentDraft(draft)&&draft.id===state.id){
            const status=document.querySelector('#modal-feedback [data-media-status]');
            if(status)status.textContent='Enviando anexo · '+Math.round(snapshot.bytesTransferred/Math.max(1,snapshot.totalBytes)*100)+'%';
          }
        },error=>finish(error),()=>finish(null,upload.snapshot));
      });
    }catch(error){try{upload.cancel();}catch{}throw error;}
  }
  async function deliver(state){
    if(flights.has(state.id))return flights.get(state.id);if(!current(state))throw new Error('Abra o aluno correto para continuar este feedback.');
    const task=(async()=>{const prior=await existing(state);if(prior){if(!sameDelivery(prior,state.payload))throw new Error('A identificação deste envio já foi usada por outro conteúdo.');return true;}
      const storage=await ensureStorageService();if(!storage)throw new Error('O envio de arquivos está indisponível. Tente novamente mais tarde.');
      for(let index=0;index<state.files.length;index++){if(!current(state))throw new Error('A conta ou o aluno selecionado mudou. O envio foi interrompido.');if(state.uploaded.includes(index))continue;const item=state.files[index],ref=storage.ref(state.payload.attachmentPaths[index]);
        // Paths are immutable. After an uncertain upload, metadata proves that the original object arrived.
        let meta;try{meta=await withTimeout(ref.getMetadata(),12000,'conferir anexo');}catch(error){if(!['storage/object-not-found','object-not-found'].includes(error?.code))throw error;}
        if(meta){if(Number(meta.size)!==item.blob.size||meta.contentType!==item.type)throw new Error('O arquivo confirmado diverge deste rascunho.');}
        else{if(!current(state))throw new Error('A conta ou o aluno selecionado mudou. O envio foi interrompido.');await uploadAttachment(ref,item,state);}
        state.uploaded.push(index);const saved=await store().put(scope(state),state);if(!saved.ok||!saved.media)throw new Error('Não foi possível guardar a confirmação dos anexos neste aparelho.');
      }
      if(!current(state))throw new Error('A conta ou o aluno selecionado mudou.');
      try{await cloudWrite(db.collection('feedback').doc(state.id).set({...state.payload,createdAt:firebase.firestore.FieldValue.serverTimestamp()}),'enviar feedback com anexos');}
      catch(error){const confirmed=await existing(state).catch(()=>null);if(!confirmed||!sameDelivery(confirmed,state.payload))throw error;}
      return true;
    })().then(async result=>{
      await store().remove(scope(state));
      const saved=await store().get(draftScope(state));
      if(saved?.mediaId===state.id)await store().remove(draftScope(state));
      return result;
    }).finally(()=>flights.delete(state.id));flights.set(state.id,task);return task;
  }
  async function finishEditor(target){
    if(!currentDraft(target))return;
    await window.TeamBullsWorkflowDrafts?.confirmed?.('modal-feedback');
    if(!currentDraft(target))return;
    clearPreviews();closeModal('modal-feedback');draft=null;
  }
  async function send(base,args){
    if(recording||cameraRequest){notify('Encerre a gravação e confira o vídeo antes de enviar.',true);return false;}
    if(currentDraft(draft)&&(draft.checkingVideo||draft.preparation||draft.sourceVideo)){notify('Conclua a preparação do vídeo antes de transmitir o feedback.',true);return false;}
    if(uploading)return false;
    if(!currentDraft(draft)||!draft.files.length)return base.apply(window,args);
    const message=String(document.getElementById('input-feedback')?.value||'').normalize('NFKC').trim()||'Orientações visuais do treinador.',type=v1010FeedbackType(document.getElementById('input-feedback-type')?.value),title=String(document.getElementById('input-feedback-title')?.value||'').normalize('NFKC').trim().slice(0,160)||v1010FeedbackLabel({feedbackType:type});if(message.length>30000){notify('Use até 30.000 caracteres.',true);return false;}
    uploading=true;const captured=draft;renderEditor();const schedule=type==='monthly_full'?V109_PROTOCOL_REVIEW_SCHEDULE:null,state=schedule?v109ProtocolState(schedule):null;
    const job={owner:captured.owner,studentId:captured.studentId,id:captured.id,files:captured.files.map(item=>({...item})),uploaded:[],source:'media',status:'pending',payload:{trainerId:captured.owner,studentId:captured.studentId,title,...v1010FeedbackFields(type),message,read:false,protocolStartDate:type==='monthly_full'&&validIsoDate(schedule?.startDate)?schedule.startDate:'',protocolCycle:state?Math.max(0,Number(state.pendingCycle||state.elapsedCycle||0)):0}};
    job.payload.attachmentPaths=job.files.map((item,index)=>pathFor(job,index,item));job.payload.attachments=job.files.map((item,index)=>({path:job.payload.attachmentPaths[index],kind:item.type.startsWith('video/')?'video':'image',mime:item.type,size:item.blob.size,name:item.name,sourcePhotoId:item.sourcePhotoId||''}));
    try{
      const previous=await store().get(scope(job));if(!currentDraft(captured))return false;
      let delivery=job;
      if(previous){
        captured.pending=true;delivery=receiptDelivery(previous,job.id);
        if(!delivery||!sameDelivery(delivery.payload,job.payload)){notify('Este envio já foi preparado com outros dados. Retome o feedback original pela Central de sincronização.',true);return false;}
      }else{
        const saved=await store().put(scope(job),job);
        if(!saved.ok||!saved.media)throw new Error('Não foi possível guardar os anexos neste aparelho para um envio seguro.');
        captured.pending=true;
      }
      await deliver(delivery);
      if(currentDraft(captured)){await finishEditor(captured);notify('Feedback e anexos confirmados na conta do aluno.');}
      return true;
    }catch(error){window.TeamBullsWorkflowSync?.recordError?.(error,'feedback-media');if(currentDraft(captured))notify('Feedback sem confirmação. Confira a Central de sincronização antes de reenviar.',true);return false;}
    finally{uploading=false;renderEditor();}
  }
  async function syncItems(){return(await store()?.list?.('receipt')||[]).filter(item=>item.source==='media').map(item=>({id:item.id.slice(6),type:'media',label:'Feedback com anexos',studentId:item.studentId,status:'pending',date:new Date(item.updatedAt).toISOString().slice(0,10)}));}
  async function retry(id){
    const metadata=(await store().list('receipt')).find(item=>item.id==='media:'+id&&item.source==='media');
    const delivery=metadata?receiptDelivery(await store().get(metadata),id):null;
    if(!delivery||!current(delivery))throw new Error('Abra o perfil deste aluno antes de retomar o feedback.');
    const result=await deliver(delivery);
    if(currentDraft(draft)&&draft.id===id)await finishEditor(draft);
    return result;
  }
  function canView(data){try{return !!CURRENT_USER?.uid&&(CURRENT_USER.role==='trainer'?CURRENT_USER.uid===data?.trainerId:CURRENT_USER.uid===data?.studentId);}catch{return false;}}
  function validAttachment(item,data,id){const prefix='feedbackAttachments/'+data.trainerId+'/'+data.studentId+'/'+id+'/';return typeof item?.path==='string'&&item.path.startsWith(prefix)&&/^[0-5]\.(jpg|mp4|webm)$/.test(item.path.slice(prefix.length))&&Array.isArray(data.attachmentPaths)&&data.attachmentPaths.includes(item.path)&&['image/jpeg','video/mp4','video/webm'].includes(item.mime)&&(item.kind==='image'?item.mime==='image/jpeg':item.kind==='video'&&item.mime.startsWith('video/'));}
  function releaseView(area){
    if(!area)return;
    area.querySelectorAll('video').forEach(video=>{
      video.pause();
      if(video.dataset.localUrl)revoke(video.dataset.localUrl);video.removeAttribute('src');video.load();
    });
    const download=area._tbVideoDownload;
    if(download)download.abort();
  }
  function renderVideo(box,item,data,uid,area){
    const tools=videoTools(),student=CURRENT_USER?.role==='student';
    const active=()=>owner()===uid&&canView(data)&&area.isConnected&&(!area.closest('.modal-backdrop')||area.closest('.modal-backdrop').classList.contains('open'));
    const controls=document.createElement('div');controls.className='tb-flow-actions';
    const player=document.createElement('div');
    const note=document.createElement('p');note.setAttribute('role','status');
    let copy=null,loading=false,downloading=false;
    async function sourceUrl(){
      const storage=await ensureStorageService();
      if(!storage||!active())throw new Error('Vídeo indisponível.');
      return storage.ref(item.path).getDownloadURL();
    }
    const watch=button('ABRIR VÍDEO',async()=>{
      if(loading||!active())return;
      loading=true;watch.disabled=true;
      try{
        const src=copy?url(copy):await sourceUrl();
        if(!active()){if(copy)revoke(src);return;}
        player.querySelectorAll('video').forEach(old=>{old.pause();if(old.dataset.localUrl)revoke(old.dataset.localUrl);});
        const video=document.createElement('video');video.controls=true;video.preload='metadata';video.playsInline=true;video.src=src;
        if(copy)video.dataset.localUrl=src;
        player.replaceChildren(video);
      }catch(error){if(active())note.textContent='Não foi possível abrir o vídeo. Confira a conexão.';}
      finally{loading=false;if(active())watch.disabled=false;}
    });
    const offline=button('BAIXAR PARA VER OFFLINE',async()=>{
      if(!active()||downloading||!tools)return;
      downloading=true;offline.disabled=true;
      try{
        if(copy){
          await tools.deleteCopy(uid,item.path);
          if(!active())return;
          copy=null;
          const video=player.querySelector('video[data-local-url]');
          if(video){video.pause();revoke(video.dataset.localUrl);video.remove();}
          note.textContent='Cópia apagada deste aparelho. O vídeo continua no feedback.';
        }else{
          if(navigator.onLine===false)throw new Error('Conecte-se à internet para baixar este vídeo.');
          const controller=new AbortController();area._tbVideoDownload=controller;
          const src=await sourceUrl();
          const blob=await tools.fetchCopy(src,item,controller.signal,value=>{if(active())note.textContent='Baixando · '+Math.round(value*100)+'%';});
          if(!active()||controller.signal.aborted)return;
          await tools.saveCopy(uid,item.path,blob);
          if(!active())return;
          copy=blob;note.textContent='Vídeo disponível offline neste aparelho.';
        }
      }catch(error){if(active()&&error.name!=='AbortError')note.textContent=error.message||'Não foi possível guardar a cópia offline.';}
      finally{
        downloading=false;if(active()){offline.disabled=false;offline.textContent=copy?'APAGAR CÓPIA DO APARELHO':'BAIXAR PARA VER OFFLINE';}
        area._tbVideoDownload=null;
      }
    });
    controls.append(watch);
    if(student&&tools){
      offline.disabled=true;controls.append(offline);
      tools.getCopy(uid,item.path).then(blob=>{
        if(!active())return;
        copy=blob;
        if(blob){offline.textContent='APAGAR CÓPIA DO APARELHO';note.textContent='Vídeo disponível offline neste aparelho.';}
      }).catch(()=>{if(active())note.textContent='O armazenamento offline está indisponível neste aparelho.';}).finally(()=>{if(active())offline.disabled=false;});
    }
    box.append(controls,player,note);
  }
  function render(host,data,id){
    if(!host||!canView(data)||!Array.isArray(data?.attachments))return;
    const previous=host.querySelector('[data-feedback-media-view]');releaseView(previous);previous?.remove();
    const area=document.createElement('section');area.dataset.feedbackMediaView='1';host.append(area);
    const uid=owner();viewOwners.set(area,uid);
    for(const item of data.attachments.slice(0,6).filter(item=>validAttachment(item,data,id))){
      const box=document.createElement('div');box.className='tb-feedback-attachment';area.append(box);
      if(item.kind==='video'){renderVideo(box,item,data,uid,area);continue;}
      const load=button('ABRIR FOTO ANOTADA',async()=>{
        load.disabled=true;
        try{
          const storage=await ensureStorageService();if(!storage)throw new Error('Storage indisponível');
          const src=await storage.ref(item.path).getDownloadURL();
          if(owner()!==uid||!canView(data)||!box.isConnected)return;
          const image=document.createElement('img');image.alt='Explicação visual do treinador';image.src=src;box.replaceChildren(image);
        }catch{load.disabled=false;load.textContent='TENTAR ABRIR ANEXO NOVAMENTE';notify('Não foi possível abrir este anexo. Verifique a conexão.',true);}
      });box.append(load);
    }
  }
  function install(){
    for(const [name,after] of [['openPhotoView',()=>{if(!trainer())return;const modal=document.getElementById('modal-photo-view');if(!modal||modal.querySelector('[data-annotate-photo]'))return;const control=button('ANOTAR CÓPIA E USAR NO FEEDBACK',()=>void annotate());control.dataset.annotatePhoto='1';modal.querySelector('#photo-view-meta')?.insertAdjacentElement('afterend',control);}],['openFeedbackModal',()=>void editor()]]){const base=window[name];if(typeof base!=='function'||base.__tbFeedbackMedia)continue;const wrapped=function(){const result=base.apply(this,arguments);if(result?.then)return result.then(value=>{after();return value;});after();return result;};Object.assign(wrapped,base);wrapped.__tbFeedbackMedia=true;window[name]=wrapped;}
    if(typeof sendFeedback==='function'&&!sendFeedback.__tbFeedbackMedia){const base=sendFeedback;sendFeedback=function(){return send(base,arguments);};sendFeedback.__tbFeedbackMedia=true;}
    if(typeof closeModal==='function'&&!closeModal.__tbFeedbackMedia){const base=closeModal;closeModal=function(id){if(id==='modal-feedback'){cancelPreparation(draft);stopRecording();clearPreviews();}if(id==='modal-feedback-annotation')annotation=null;document.getElementById(id)?.querySelectorAll('[data-feedback-media-view]').forEach(releaseView);return base.apply(this,arguments);};closeModal.__tbFeedbackMedia=true;}
    if(typeof showFeedbackBanner==='function'&&!showFeedbackBanner.__tbFeedbackMedia){const base=showFeedbackBanner;showFeedbackBanner=function(id,data){const result=base.apply(this,arguments);render(document.getElementById('feedback-banner-text'),data,id);return result;};showFeedbackBanner.__tbFeedbackMedia=true;}
  }
  window.addEventListener('pagehide',()=>{cancelPreparation(draft);stopRecording();});document.addEventListener('visibilitychange',()=>{if(document.hidden)stopRecording();});
  window.addEventListener('team-bulls-runtime-state',()=>{
    if((recording&&!currentDraft(recording.draft))||(cameraRequest&&!currentDraft(cameraRequest.draft)))stopRecording(true);
    if(draft&&!currentDraft(draft)){cancelPreparation(draft);clearPreviews();draft=null;}
    if(annotation&&!current(annotation)){closeModal('modal-feedback-annotation');annotation=null;}
    const uid=owner();
    document.querySelectorAll('[data-feedback-media-view]').forEach(el=>{
      if(viewOwners.get(el)===uid)return;
      releaseView(el);el.remove();
    });
  });
  ['team-bulls-runtime-ready','team-bulls-student-runtime-ready','team-bulls-intelligence-ready'].forEach(name=>window.addEventListener(name,install));
  window.TeamBullsFeedbackMedia=Object.freeze({version,annotate,add,editor,render,selectVideo,syncItems,retry,stopRecording,validFile,validAttachment,state:()=>({files:draft?.files.length||0,recording:!!recording,uploading})});install();
})();

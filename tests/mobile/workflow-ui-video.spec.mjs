import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('https://**',route=>route.abort());
});

test('prescription preview and warnings keep the app layout and partial meals can save directly',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    asTrainer();
    window.confirm=()=>{throw new Error('Unexpected native confirmation');};
    await TeamBullsPrescriptionWorkflow.preview('workout');
  });
  const preview=page.locator('#modal-prescription-preview');
  await expect(preview.locator('.tb-flow-head')).toHaveCSS('display','flex');
  await expect(preview.locator('.tb-flow-row').first()).toHaveCSS('display','flex');
  await expect(preview.locator('.tb-flow-head h2')).toHaveCSS('font-family',/Barlow Condensed/);
  await preview.getByRole('button',{name:'FECHAR'}).click();
  await page.evaluate(async()=>TeamBullsPrescriptionWorkflow.review('workout'));
  const review=page.locator('#modal-prescription-review');
  const textbox=review.getByRole('textbox',{name:'Resumo para o aluno'});
  const [sheet,field]=await Promise.all([review.locator('.modal-sheet').boundingBox(),textbox.boundingBox()]);
  expect(field.width).toBeGreaterThan(sheet.width*.8);
  await review.getByRole('button',{name:'FECHAR'}).click();
  await page.evaluate(()=>{void activateDietPlan('diet-fixture');});
  const activate=page.locator('#modal-activation-preflight');
  const notices=activate.getByText('2 observações nutricionais');
  await expect(notices).toBeVisible();
  await expect(activate.getByText(/Dia sem treino · Refeição 1/)).toBeHidden();
  await notices.click();
  await expect(activate.getByText(/Dia de treino · Refeição 1/)).toBeVisible();
  await expect(activate.getByText(/Dia sem treino · Refeição 1/)).toBeVisible();
  await activate.getByRole('button',{name:'ATIVAR APÓS CONFERÊNCIA'}).click();
  await expect.poll(()=>page.evaluate(()=>activations)).toBe(1);

  await page.evaluate(()=>openEditMealModal());
  const meal=page.locator('#modal-meal');
  await meal.locator('#input-meal-items').fill('1 porção de proteína\nÁgua');
  await expect(meal.locator('#tb-meal-review-note')).toContainText('O total calculado é parcial');
  await meal.getByRole('button',{name:'SALVAR REFEIÇÃO'}).click();
  await expect.poll(()=>page.evaluate(()=>mealSaves)).toBe(1);
  await meal.locator('#input-meal-items').fill('0 porção de proteína');
  await meal.getByRole('button',{name:'SALVAR REFEIÇÃO'}).click();
  const confirm=page.locator('#modal-workflow-confirm');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button',{name:'FECHAR'}).click();
  expect(await page.evaluate(()=>mealSaves)).toBe(1);
  await meal.getByRole('button',{name:'SALVAR REFEIÇÃO'}).click();
  await confirm.getByRole('button',{name:'SALVAR APÓS CONFERÊNCIA'}).click();
  await expect.poll(()=>page.evaluate(()=>mealSaves)).toBe(2);
  expect(await page.evaluate(()=>errors)).toEqual([]);
});

test('200 MB originals remain in the selected-folder archive and only the prepared copy is sent',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const tools=TeamBullsFeedbackVideoTools;
    window.archiveSize=0;
    const originalPart=new Blob([new Uint8Array(1024*1024)]);
    const original=new File(Array(200).fill(originalPart),'Aula.mp4',{type:'video/mp4'});
    const tooLarge=new File([original,new Uint8Array(1)],'Maior.mp4',{type:'video/mp4'});
    window.sourceLimits=[tools.isSource(original),tools.isSource(tooLarge)];
    window.TeamBullsFeedbackVideoTools=Object.freeze({...tools,
      supportsFolder:()=>true,getFolder:async()=>null,chooseFolder:async()=>({
        name:'Feedbacks Team Bulls',
        queryPermission:async()=> 'granted',
        getFileHandle:async()=>{
          let saved=null;
          return{
            createWritable:async()=>({write:async file=>{saved=file;archiveSize=file.size;},close:async()=>{},abort:async()=>{}}),
            getFile:async()=>saved
          };
        }
      }),
      primeAudio:()=>null,duration:async()=>2,
      prepare:async(file,{progress})=>{progress(1);return {blob:new Blob(['prepared video'],{type:'video/mp4'}),duration:2,compressed:true};}
    });
    asTrainer();openFeedbackModal();await TeamBullsFeedbackMedia.editor();
    TeamBullsFeedbackMedia.selectVideo(original,original.name);
  });
  expect(await page.evaluate(()=>sourceLimits)).toEqual([true,false]);
  const media=page.locator('#modal-feedback [data-feedback-media]');
  await expect(media).toContainText('200 MB');
  await media.getByRole('button',{name:'ESCOLHER PASTA'}).click();
  await expect(media).toContainText('Feedbacks Team Bulls');
  await media.getByRole('button',{name:'PREPARAR VÍDEO'}).click();
  await expect(media).toContainText('Original salvo na pasta do treinador');
  expect(await page.evaluate(()=>archiveSize)).toBe(200*1024*1024);
  await page.getByRole('button',{name:'TRANSMITIR FEEDBACK'}).click();
  await expect.poll(()=>page.evaluate(()=>remote.size)).toBe(1);
  const sent=await page.evaluate(()=>({blob:[...objects.values()][0].size,feedback:[...remote.values()][0]}));
  expect(sent.blob).toBe(14);
  expect(sent.feedback.attachments[0]).toMatchObject({size:14,kind:'video'});
  expect(JSON.stringify(sent.feedback)).not.toContain('Feedbacks Team Bulls');
  expect(JSON.stringify(sent.feedback)).not.toContain('Original.mp4');
});

test('student downloads and deletes the local copy without deleting or modifying the published video',async({page})=>{
  await page.goto('/');
  const fixture=()=>{
    asStudent();
    const path='feedbackAttachments/coach-test/student-test/feedback-test/0.mp4';
    const blob=new Blob(['local video test bytes'],{type:'video/mp4'});
    objects.set(path,blob);
    const data={trainerId:'coach-test',studentId:'student-test',attachmentPaths:[path],attachments:[{path,kind:'video',mime:'video/mp4',size:blob.size,name:'Orientações'}]};
    window.offlineFixture={path,data};
    const host=document.createElement('div');host.id='video-feedback-fixture';document.body.append(host);
    TeamBullsFeedbackMedia.render(host,data,'feedback-test');
  };
  await page.evaluate(fixture);
  const view=page.locator('#video-feedback-fixture');
  await view.getByRole('button',{name:'BAIXAR PARA VER OFFLINE'}).click();
  await expect(view.getByText('Vídeo disponível offline neste aparelho.')).toBeVisible();
  await page.reload();
  await page.evaluate(fixture);
  await expect(view.getByRole('button',{name:'APAGAR CÓPIA DO APARELHO'})).toBeVisible();
  await view.getByRole('button',{name:'ABRIR VÍDEO'}).click();
  await expect(view.locator('video')).toHaveAttribute('data-local-url',/^blob:/);
  await view.getByRole('button',{name:'APAGAR CÓPIA DO APARELHO'}).click();
  await expect(view.getByText('Cópia apagada deste aparelho. O vídeo continua no feedback.')).toBeVisible();
  expect(await page.evaluate(async()=>{
    const {path}=offlineFixture;
    return {copy:await TeamBullsFeedbackVideoTools.getCopy('student-test',path),remote:objects.has(path),writes};
  })).toEqual({copy:null,remote:true,writes:0});
  await view.getByRole('button',{name:'ABRIR VÍDEO'}).click();
  await expect(view.locator('video')).toBeVisible();
  await expect(view.locator('video')).not.toHaveAttribute('data-local-url',/./);
});

test('native compression of a synthetic 200 MB video produces a playable compact file',async({page},testInfo)=>{
  // One Chromium run exercises the desktop recording APIs with a large
  // synthetic container. The folder and offline flows run in every browser.
  test.skip(testInfo.project.name!=='android-large','Run the expensive native encoding case in one Chromium profile.');
  await page.goto('/');
  await page.evaluate(()=>{
    const button=document.createElement('button');button.textContent='TESTAR COMPACTAÇÃO';document.body.append(button);
    button.onclick=async()=>{
      const tools=TeamBullsFeedbackVideoTools;
      try{
        const audio=tools.primeAudio(),tone=audio.createOscillator(),destination=audio.createMediaStreamDestination();
        tone.connect(destination);tone.start();
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
        const ctx=canvas.getContext('2d'),stream=canvas.captureStream(24);
        const type=MediaRecorder.isTypeSupported('video/mp4')?'video/mp4':'video/webm';
        const recorder=new MediaRecorder(new MediaStream([...stream.getVideoTracks(),...destination.stream.getAudioTracks()]),{mimeType:type,videoBitsPerSecond:1500000});
        const chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);
        const recorded=new Promise(resolve=>recorder.onstop=()=>resolve(new Blob(chunks,{type})));
        const noise=ctx.createImageData(640,360);
        const tick=setInterval(()=>{crypto.getRandomValues(new Uint8Array(noise.data.buffer,0,65536));ctx.putImageData(noise,0,0);},40);
        recorder.start();await new Promise(resolve=>setTimeout(resolve,1500));recorder.stop();clearInterval(tick);tone.stop();
        const clip=await recorded;await audio.close();stream.getTracks().forEach(track=>track.stop());
        const header=new Uint8Array(type==='video/mp4'?8:5),padding=tools.sourceLimit-clip.size-header.length;
        if(type==='video/mp4'){new DataView(header.buffer).setUint32(0,padding+8);header.set([102,114,101,101],4);}
        else{header[0]=236;header[1]=16|((padding>>>24)&15);header[2]=(padding>>>16)&255;header[3]=(padding>>>8)&255;header[4]=padding&255;}
        const block=new Blob([new Uint8Array(1024*1024)]);
        const file=new File([clip,header,...Array(Math.floor(padding/block.size)).fill(block),block.slice(0,padding%block.size)],type==='video/mp4'?'original.mp4':'original.webm',{type});
        const result=await tools.prepare(file,{knownDuration:1.5,audio:tools.primeAudio()});
        const duration=await tools.duration(result.blob,result.duration);
        // Decode the resulting audio as well, rather than only checking video metadata.
        const playbackAudio=tools.primeAudio(),player=document.createElement('video');
        const src=URL.createObjectURL(result.blob);player.src=src;player.playsInline=true;
        const analyzer=playbackAudio.createAnalyser(),silent=playbackAudio.createGain();
        silent.gain.value=0;
        playbackAudio.createMediaElementSource(player).connect(analyzer);analyzer.connect(silent);silent.connect(playbackAudio.destination);
        await player.play();await new Promise(resolve=>setTimeout(resolve,450));
        const samples=new Float32Array(analyzer.fftSize);analyzer.getFloatTimeDomainData(samples);
        const rms=Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);
        player.pause();URL.revokeObjectURL(src);await playbackAudio.close();
        window.nativeResult={source:file.size,size:result.blob.size,compressed:result.compressed,duration,rms};
      }catch(error){window.nativeResult={error:error.message};}
    };
  });
  await page.getByRole('button',{name:'TESTAR COMPACTAÇÃO'}).click();
  await expect.poll(()=>page.evaluate(()=>window.nativeResult),{timeout:30000}).toBeTruthy();
  const result=await page.evaluate(()=>nativeResult);
  expect(result.error).toBeUndefined();
  expect(result.source).toBe(200*1024*1024);
  expect(result.compressed).toBe(true);
  expect(result.size).toBeLessThan(60*1024*1024);
  expect(result.duration).toBeGreaterThan(.5);
  expect(result.rms).toBeGreaterThan(.001);
});

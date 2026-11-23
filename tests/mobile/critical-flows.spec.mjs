import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.route('https://**',route=>route.abort());page.on('dialog',dialog=>dialog.accept());});
test('student preview is read-only and activation preflight exposes empty days before writing',async({page})=>{
  await page.goto('/');await page.evaluate(async()=>{asTrainer();await TeamBullsPrescriptionWorkflow.preview('workout');});
  await expect(page.locator('#modal-prescription-preview')).toContainText('Mantenha a posição');await expect(page.locator('#modal-prescription-preview')).toContainText('240 seg');
  expect(await page.evaluate(()=>({writes,activations,role:CURRENT_USER.role,uid:CURRENT_USER.uid}))).toEqual({writes:0,activations:0,role:'trainer',uid:'coach-test'});
  await page.evaluate(()=>{closeModal('modal-prescription-preview');void activateTrainerWorkout('w');});await expect(page.locator('#modal-activation-preflight')).toContainText('Dia vazio');expect(await page.evaluate(()=>activations)).toBe(0);
  await page.getByRole('button',{name:'ATIVAR APÓS CONFERÊNCIA',exact:true}).click();expect(await page.evaluate(()=>activations)).toBe(1);expect(await page.evaluate(()=>errors)).toEqual([]);
});
test('isometry timer measures each set, captures early stop and explicit save with load',async({page})=>{
  await page.clock.install({time:new Date('2026-11-18T12:00:00Z')});await page.goto('/');await page.clock.pauseAt(new Date('2026-11-18T12:00:01Z'));
  await page.evaluate(()=>openLogSessionModal());const row=page.locator('#sets-editor .performed-set-row').first();
  await expect(row.locator('[data-f="r"]')).toHaveAttribute('max','3600');await row.locator('[data-f="w"]').fill('40');
  await row.getByRole('button',{name:'INICIAR SÉRIE',exact:true}).click();await page.clock.fastForward(35000);
  await row.getByRole('button',{name:'ENCERRAR SÉRIE',exact:true}).click();await expect(row.locator('[data-f="r"]')).toHaveValue('35');
  expect(await page.evaluate(()=>saved.length)).toBe(0);await page.getByRole('button',{name:'SALVAR REGISTRO',exact:true}).click();
  expect(await page.evaluate(()=>saved[0][0])).toMatchObject({weight:40,reps:35,unit:'seconds',targetMax:240});
  await row.locator('[data-f="r"]').fill('');await row.locator('[data-series-target]').fill('120');await row.locator('[data-series-start]').click();await page.clock.fastForward(121000);
  await expect(row.locator('[data-f="r"]')).toHaveValue('120');expect(await page.evaluate(()=>alarms)).toBe(1);expect(await page.evaluate(()=>saved.length)).toBe(1);
  // Saving while still running must capture elapsed seconds before the canonical save reads the form.
  await row.locator('[data-f="r"]').fill('');await row.locator('[data-series-target]').fill('240');await row.locator('[data-series-start]').click();await page.clock.fastForward(45000);await page.getByRole('button',{name:'SALVAR REGISTRO',exact:true}).click();
  expect(await page.evaluate(()=>saved.at(-1)[0].reps)).toBe(45);expect(await page.evaluate(()=>TeamBullsIsometrySeriesTimer.state())).toBeNull();
  await page.evaluate(()=>{exercise.sets=[{targetMin:6,targetMax:8,ger:3}];});await page.locator('#input-session-week').selectOption('2');await expect(row.locator('[data-series-timer]')).toHaveCount(0);await expect(row.locator('[data-f="r"]')).toHaveAttribute('max','100');
  expect(await page.evaluate(()=>errors)).toEqual([]);
});

test('editing a timed record preserves its unit after the current technique changes',async({page})=>{
  await page.clock.install({time:new Date('2026-11-18T12:00:00Z')});await page.goto('/');await page.clock.pauseAt(new Date('2026-11-18T12:00:01Z'));
  await page.evaluate(()=>{exercise.weeks={1:[],2:[]};openEditSession();});const row=page.locator('#edit-sets-editor .performed-set-row');await expect(row.locator('[data-f="r"]')).toHaveAttribute('max','3600');
  await row.locator('[data-f="r"]').fill('');await row.locator('[data-series-start]').click();await page.clock.fastForward(25000);await page.getByRole('button',{name:'SALVAR ALTERAÇÕES',exact:true}).click();expect(await page.evaluate(()=>saved.at(-1)[0])).toMatchObject({weight:40,reps:25,unit:'seconds'});expect(await page.evaluate(()=>TeamBullsIsometrySeriesTimer.state())).toBeNull();expect(await page.evaluate(()=>errors)).toEqual([]);
});

test('week changes protect a running set in a new session and preserve elapsed time in edits',async({page})=>{
  await page.clock.install({time:new Date('2026-11-18T12:00:00Z')});
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-11-18T12:00:01Z'));
  await page.evaluate(()=>{window.confirm=message=>{messages.push({message});return false;};openLogSessionModal();});
  const row=page.locator('#sets-editor .performed-set-row').first();
  await row.locator('[data-series-start]').click();
  await page.clock.fastForward(25000);
  await page.locator('#input-session-week').selectOption('2');
  await expect(page.locator('#input-session-week')).toHaveValue('1');
  expect(await page.evaluate(()=>messages.at(-1).message)).toContain('Trocar a semana');
  expect(await page.evaluate(()=>TeamBullsIsometrySeriesTimer.state().elapsed)).toBe(25);
  await row.locator('[data-series-stop]').click();
  await expect(row.locator('[data-f="r"]')).toHaveValue('25');
  await page.evaluate(()=>{closeModal('modal-session');openEditSession();});
  const editRow=page.locator('#edit-sets-editor .performed-set-row').first();
  await editRow.locator('[data-f="r"]').fill('');
  await editRow.locator('[data-series-start]').click();
  await page.clock.fastForward(35000);
  await page.locator('#edit-session-week').selectOption('2');
  await expect(editRow.locator('[data-f="r"]')).toHaveValue('35');
  expect(await page.evaluate(()=>TeamBullsIsometrySeriesTimer.state())).toBeNull();
  expect(await page.evaluate(()=>errors)).toEqual([]);
});

test('enlarged type and reduced visible viewport keep the set form and save controls reachable',async({page})=>{
  await page.goto('/');await page.evaluate(()=>{document.documentElement.style.fontSize='200%';document.body.style.fontSize='200%';openLogSessionModal();});
  await page.setViewportSize({width:test.info().project.use.viewport.width,height:460});const input=page.locator('#sets-editor [data-f="r"]');await input.focus();await input.fill('90');await page.getByRole('button',{name:'SALVAR REGISTRO',exact:true}).scrollIntoViewIfNeeded();
  const bounds=await page.locator('#modal-session>.modal-sheet').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(-1);expect(bounds.x+bounds.width).toBeLessThanOrEqual(test.info().project.use.viewport.width+1);
  await expect(page.getByRole('button',{name:'SALVAR REGISTRO',exact:true})).toBeVisible();expect(await page.evaluate(()=>errors)).toEqual([]);
});

test('six report photos and answers recover after reload and remain isolated from another account',async({page})=>{
  await page.goto('/');await page.evaluate(()=>openWeeklyCheckinModal());await page.locator('#weekly-checkin-weight').fill('73.5');await page.locator('[data-weekly-question]').fill('Minha semana de teste');
  const image=await page.evaluate(()=>testImage());const buffer=Buffer.from(image.split(',')[1],'base64');
  for(let i=0;i<6;i++)await page.locator('#weekly-photo-'+i).setInputFiles({name:'foto-'+i+'.jpg',mimeType:'image/jpeg',buffer});
  await expect.poll(()=>page.evaluate(async()=>((await TeamBullsWorkflowStorage.list('draft')).find(r=>r.route?.modal==='modal-weekly-checkin')?.files||[]).length)).toBe(6);
  await page.reload();await page.evaluate(()=>openWeeklyCheckinModal());await page.getByRole('button',{name:'RECUPERAR',exact:true}).click();
  await expect(page.locator('#weekly-checkin-weight')).toHaveValue('73.5');await expect(page.locator('[data-weekly-question]')).toHaveValue('Minha semana de teste');expect(await page.evaluate(()=>WEEKLY_CHECKIN_FILES.filter(Boolean).length)).toBe(6);
  await page.evaluate(()=>{CURRENT_USER={uid:'other-student',role:'student'};closeModal('modal-weekly-checkin');openWeeklyCheckinModal();});await expect(page.getByRole('button',{name:'RECUPERAR',exact:true})).toBeHidden();expect(await page.evaluate(async()=> (await TeamBullsWorkflowStorage.list()).length)).toBe(0);
  expect(await page.evaluate(()=>errors)).toEqual([]);
});

test('annotated copy attaches to feedback without changing the original photo',async({page})=>{
  await page.goto('/');await page.evaluate(()=>{asTrainer();document.getElementById('photo-view-img').src=testImage();openPhotoView();});const original=await page.locator('#photo-view-img').getAttribute('src');
  await page.getByRole('button',{name:'ANOTAR CÓPIA E USAR NO FEEDBACK'}).click();const canvas=page.locator('#modal-feedback-annotation canvas');await expect(canvas).toBeVisible();const bounds=await canvas.boundingBox();
  await page.mouse.move(bounds.x+bounds.width*.25,bounds.y+bounds.height*.3);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.7,bounds.y+bounds.height*.65,{steps:5});await page.mouse.up();
  await page.getByRole('button',{name:'ANEXAR AO FEEDBACK',exact:true}).click();await expect.poll(()=>page.evaluate(()=>TeamBullsFeedbackMedia.state().files)).toBe(1);
  expect(await page.locator('#photo-view-img').getAttribute('src')).toBe(original);expect(await page.evaluate(async()=>{const r=(await TeamBullsWorkflowStorage.list('draft')).find(x=>x.source==='media-draft');return r.files[0].sourcePhotoId;})).toBe('photo-test');
  expect(await page.evaluate(()=>writes)).toBe(0);expect(await page.evaluate(()=>errors)).toEqual([]);
});

test('a photo left open cannot be annotated for a different selected student',async({page})=>{
  await page.goto('/');await page.evaluate(()=>{asTrainer();document.getElementById('photo-view-img').src=testImage();openPhotoView();VIEW_STUDENT={uid:'different-student'};});
  await page.getByRole('button',{name:'ANOTAR CÓPIA E USAR NO FEEDBACK'}).click();await expect(page.locator('#modal-feedback-annotation')).toHaveCount(0);expect(await page.evaluate(()=>TeamBullsFeedbackMedia.state().files)).toBe(0);expect(await page.evaluate(()=>messages.at(-1).message)).toContain('aluno selecionado');
});

test('an annotation exported after a student switch cannot enter the next feedback draft',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    asTrainer();
    document.getElementById('photo-view-img').src=testImage();
    openPhotoView();
    const exportImage=HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob=function(callback,...args){
      exportImage.call(this,blob=>{window.finishPhotoExport=()=>callback(blob);},...args);
    };
  });
  await page.getByRole('button',{name:'ANOTAR CÓPIA E USAR NO FEEDBACK'}).click();
  await page.getByRole('button',{name:'ANEXAR AO FEEDBACK',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof window.finishPhotoExport)).toBe('function');
  await page.evaluate(async()=>{
    VIEW_STUDENT={uid:'different-student'};
    openFeedbackModal();
    await TeamBullsFeedbackMedia.editor();
    window.finishPhotoExport();
  });
  expect(await page.evaluate(async()=>{
    const records=await TeamBullsWorkflowStorage.list('draft');
    return {files:TeamBullsFeedbackMedia.state().files,other:records.some(row=>row.subject==='different-student'&&row.source==='media-draft')};
  })).toEqual({files:0,other:false});
});

test('uncertain attachment upload retries the same immutable file and confirms a lost feedback acknowledgement',async({page})=>{
  await page.goto('/');await page.evaluate(async()=>{asTrainer();openFeedbackModal();await TeamBullsFeedbackMedia.editor();await addTestImage();dropUpload=true;});await page.locator('#input-feedback').fill('Confira a execução na cópia anotada.');
  await page.getByRole('button',{name:'TRANSMITIR FEEDBACK',exact:true}).click();await expect.poll(()=>page.evaluate(()=>TeamBullsFeedbackMedia.state().uploading)).toBe(false);expect(await page.evaluate(()=>uploads)).toBe(1);expect(await page.evaluate(()=>writes)).toBe(0);
  await expect(page.getByRole('button',{name:'REMOVER ANEXO',exact:true})).toBeDisabled();
  await page.locator('#input-feedback').fill('Edição que não pode modificar um envio pendente.');
  await page.getByRole('button',{name:'TRANSMITIR FEEDBACK',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>TeamBullsFeedbackMedia.state().uploading)).toBe(false);
  expect(await page.evaluate(()=>writes)).toBe(0);
  const deliveryId=await page.evaluate(async()=>{
    const [pending]=await TeamBullsFeedbackMedia.syncItems();
    dropAck=true;
    await TeamBullsFeedbackMedia.retry(pending.id);
    return pending.id;
  });
  expect(await page.evaluate(()=>writes)).toBe(1);
  await expect(page.locator('#modal-feedback')).not.toHaveClass(/open/);expect(await page.evaluate(()=>remote.size)).toBe(1);expect(await page.evaluate(()=>uploads)).toBe(1);expect(await page.evaluate(async()=> (await TeamBullsFeedbackMedia.syncItems()).length)).toBe(0);
  const record=await page.evaluate(id=>remote.get(id),deliveryId);
  expect(record.message).toBe('Confira a execução na cópia anotada.');
  expect(record.attachments).toHaveLength(1);
  expect(record.attachmentPaths[0]).toBe('feedbackAttachments/coach-test/student-test/'+deliveryId+'/0.jpg');
  expect(await page.evaluate(()=>errors)).toEqual([]);
});

test('camera and microphone tracks stop when the editor closes or account changes',async({page})=>{
  await page.goto('/');await page.evaluate(async()=>{
    asTrainer();openFeedbackModal();await TeamBullsFeedbackMedia.editor();window.trackStops=0;
    // Headless WebKit on Windows has no MediaStream constructor. Mock the same
    // capture and preview boundary in each browser while exercising app cleanup.
    const stream={getTracks:()=>[{stop(){trackStops++;}}]};
    Object.defineProperty(HTMLMediaElement.prototype,'srcObject',{configurable:true,set(value){this.dataset.capturePreview=String(value===stream);}});
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>stream}});
    window.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.onstop?.();}};
  });
  async function start(){
    await page.getByRole('button',{name:'GRAVAR VÍDEO',exact:true}).click();
    await expect(page.locator('video[data-capture-preview="true"]')).toHaveCount(1);
    expect(await page.evaluate(()=>TeamBullsFeedbackMedia.state().recording)).toBe(true);
  }
  await start();
  await page.evaluate(()=>closeModal('modal-feedback'));
  expect(await page.evaluate(()=>TeamBullsFeedbackMedia.state().recording)).toBe(false);
  await expect.poll(()=>page.evaluate(()=>trackStops)).toBeGreaterThan(0);
  await page.evaluate(async()=>{openFeedbackModal();await TeamBullsFeedbackMedia.editor();window.trackStops=0;});
  await start();
  await page.evaluate(()=>{CURRENT_USER={uid:'different',role:'trainer'};dispatchEvent(new Event('team-bulls-runtime-state'));});
  expect(await page.evaluate(()=>TeamBullsFeedbackMedia.state().recording)).toBe(false);
  await expect.poll(()=>page.evaluate(()=>trackStops)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>errors)).toEqual([]);
});

test('food substitutions enforce the meal macro budget and survive reload',async({page})=>{
  await page.goto('/food');await expect.poll(()=>page.evaluate(()=>!!mixedRow())).toBe(true);
  expect(await page.evaluate(()=>[...mixedRow().querySelector('select').options].find(o=>o.text.startsWith('Salmão')).disabled)).toBe(true);
  await page.evaluate(()=>{mixedRow().querySelector('summary').click();const s=mixedRow().querySelector('select');s.value=[...s.options].find(o=>o.text.startsWith('Leite desnatado')).value;s.dispatchEvent(new Event('change',{bubbles:true}));});
  await expect.poll(()=>page.evaluate(()=>mixedRow().querySelector('[data-tb-food-quantity]').textContent)).toBe('125 ml');
  await page.evaluate(()=>{const i=mixedRow().querySelector('input');i.value='1';i.dispatchEvent(new Event('input',{bubbles:true}));});expect(await page.evaluate(()=>mixedRow().querySelector('[data-tb-food-save]').disabled)).toBe(true);
  await page.evaluate(()=>{const i=mixedRow().querySelector('input');i.value='0.5';i.dispatchEvent(new Event('input',{bubbles:true}));mixedRow().querySelector('[data-tb-food-save]').click();});await page.reload();await expect.poll(()=>page.evaluate(()=>mixedRow()?.querySelector('summary').textContent)).toContain('125 ml');
  expect(await page.evaluate(()=>errors)).toEqual([]);
});

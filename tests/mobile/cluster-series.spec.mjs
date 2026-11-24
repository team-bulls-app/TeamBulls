import {test,expect} from '@playwright/test';

test.beforeEach(({page})=>{page.on('dialog',dialog=>dialog.accept());});

test('cluster records two blocks per set and times both kinds of rest',async({page})=>{
  await page.clock.install({time:new Date('2026-11-23T12:00:00Z')});
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-11-23T12:01:00Z'));
  await page.evaluate(()=>openClusterExample());
  const series=page.locator('#sets-editor .cluster-set-row');
  await expect(series).toHaveCount(2);
  const first=series.first(),last=series.last();
  await expect(first.locator('.cluster-blocks small')).toHaveText(['4–6 reps','4–6 reps']);
  await expect(first.getByText('Carga da série (kg)',{exact:true})).toBeVisible();
  const [load,blocks]=await Promise.all([
    first.getByLabel('Carga realizada').boundingBox(),
    first.locator('.cluster-blocks').boundingBox()
  ]);
  expect(load.y+load.height).toBeLessThanOrEqual(blocks.y);
  await first.getByLabel('Carga realizada').fill('40');
  await first.getByLabel('Repetições do bloco 1').fill('4');
  await first.getByRole('button',{name:'20 s',exact:true}).click();
  await expect(first.locator('.cluster-between-blocks output')).toHaveText('00:20');
  await page.clock.fastForward(20000);
  await expect(first.locator('.cluster-between-blocks [role="status"]')).toHaveText('Descanso concluído');
  expect(await page.evaluate(()=>alarms)).toBe(1);
  await first.getByLabel('Repetições do bloco 2').fill('4');
  await first.getByRole('button',{name:'Iniciar 2 min'}).click();
  await expect(first.locator('.cluster-between-sets output')).toHaveText('02:00');
  await first.getByRole('button',{name:'Cancelar pausa'}).click();
  await expect(first.locator('.cluster-between-sets output')).toBeHidden();
  await expect(last.getByRole('button',{name:'Iniciar 2 min'})).toBeHidden();
  await last.getByLabel('Carga realizada').fill('40');
  await last.getByLabel('Repetições do bloco 1').fill('5');
  await last.getByLabel('Repetições do bloco 2').fill('4');
  await page.getByRole('button',{name:'SALVAR REGISTRO'}).click();
  expect(await page.evaluate(()=>saved[0])).toMatchObject([
    {weight:40,reps:8,unit:'reps',clusterReps:[4,4]},
    {weight:40,reps:9,unit:'reps',clusterReps:[5,4]}
  ]);
  expect(await page.evaluate(()=>sessionPerformedResult(saved[0][0],'×'))).toContain('4 + 4');

  await page.evaluate(()=>{exercise.weeks[1]=[];editClusterExample();});
  const edited=page.locator('#edit-sets-editor .cluster-set-row').first();
  await expect(edited.getByLabel('Repetições do bloco 2')).toHaveValue('4');
  await edited.getByLabel('Repetições do bloco 2').fill('3');
  await page.locator('#edit-session-week').selectOption('2');
  await expect(edited.getByLabel('Repetições do bloco 2')).toHaveValue('3');
  await page.getByRole('button',{name:'SALVAR ALTERAÇÕES'}).click();
  expect(await page.evaluate(()=>saved.at(-1)[0])).toMatchObject({weight:40,reps:7,clusterReps:[4,3]});
  expect(await page.evaluate(()=>errors)).toEqual([]);
});

test('cluster applies only to the chosen repetition-based week and handles odd targets',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    document.documentElement.style.setProperty('--font-scale','1.4');
    openClusterExample(1,9,9);
  });
  const modal=page.locator('#modal-session'),row=modal.locator('.cluster-set-row');
  await expect(row.locator('.cluster-blocks small')).toHaveText(['4 reps','5 reps']);
  const second=await row.getByLabel('Repetições do bloco 2').boundingBox();
  expect(second.x+second.width).toBeLessThanOrEqual(page.viewportSize().width+1);
  await row.getByLabel('Repetições do bloco 1').fill('4');
  await page.getByRole('button',{name:'SALVAR REGISTRO'}).click();
  expect(await page.evaluate(()=>saved[0][0])).toMatchObject({reps:4,clusterReps:[4,0]});
  await page.locator('#input-session-week').selectOption('2');
  await expect(row).toHaveCount(0);
  await expect(modal.getByLabel('Repetições realizadas')).toBeVisible();
  await page.locator('#input-session-week').selectOption('3');
  await expect(row).toHaveCount(0);
  await expect(modal.getByRole('button',{name:'INICIAR SÉRIE'})).toBeVisible();
  expect(await page.evaluate(()=>errors)).toEqual([]);
});

import {test,expect} from '@playwright/test';

test('trainer queue stays compact and uses the dashboard layout and typography',async({page})=>{
  await page.goto('/trainer-queue');
  const queue=page.locator('.trainer-central-content #tb-work-queue');
  const groups=queue.locator('.trainer-work-group');
  await expect(queue.locator('[data-work-count]')).toHaveText('9 pendências');
  await expect(groups.first()).toBeHidden();
  expect(await page.locator('#trainer-central-title').evaluate(el=>el.getBoundingClientRect().top))
    .toBeLessThan((await queue.boundingBox()).y);

  await queue.locator('.trainer-work-summary').click();
  await expect(groups.locator('h3')).toHaveText(['Relatórios','Revisões mensais','Treinos']);
  await expect(groups.nth(1).locator('time')).toHaveText('20/11/2026');
  const reports=groups.first();
  await expect(reports.locator('li:visible')).toHaveCount(5);
  await reports.getByText('Ver mais (2)').click();
  await expect(reports.locator('li:visible')).toHaveCount(7);
  const workout=groups.last().getByRole('button',{name:/Abrir.+Treino próximo/});
  await expect(workout).toHaveCSS('font-family',/Barlow Condensed/);
  await expect(workout).toHaveCSS('min-height','44px');
  await workout.click();
  expect(await page.evaluate(()=>queueVisits)).toEqual([{student:'queue-student',workout:'w'}]);

  const dark=await queue.evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.evaluate(()=>{
    document.documentElement.dataset.theme='light';
    document.documentElement.style.setProperty('--font-scale','1.4');
  });
  expect(await queue.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toEqual(dark);
  const [group,button]=await Promise.all([groups.last().boundingBox(),workout.boundingBox()]);
  expect(button.x+button.width).toBeLessThanOrEqual(group.x+group.width);
  expect(group.x+group.width).toBeLessThanOrEqual(page.viewportSize().width+1);

  await page.setViewportSize({width:1362,height:990});
  await page.evaluate(()=>{
    delete document.documentElement.dataset.theme;
    document.documentElement.style.removeProperty('--font-scale');
  });
  const boxes=await Promise.all((await groups.all()).map(el=>el.boundingBox()));
  expect(boxes.map(box=>box.y)).toEqual([boxes[0].y,boxes[0].y,boxes[0].y]);
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x+boxes[0].width);
});

test('refresh preserves the visible queue on failure and clears it on account change',async({page})=>{
  await page.goto('/trainer-queue');
  const queue=page.locator('#tb-work-queue');
  await expect(queue.locator('[data-work-count]')).toHaveText('9 pendências');
  await queue.locator('.trainer-work-summary').click();
  const refresh=queue.getByRole('button',{name:'Atualizar fila'});
  await page.evaluate(()=>{queueMode='fail';});
  await refresh.click();
  await expect(queue.getByRole('status')).toHaveText('Não foi possível atualizar. Tente novamente.');
  await expect(queue.getByRole('heading',{name:'Treinos'})).toBeVisible();

  await page.evaluate(()=>{queueMode='hold';});
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await page.evaluate(()=>{void TeamBullsWorkflowSync.workQueue(true);});
  expect(await page.evaluate(()=>queueCalls)).toBe(3);
  await page.evaluate(()=>{setQueueAccount('other-student','student');finishQueue();});
  await expect(queue).toBeHidden();
  await expect(queue.locator('[data-work-count]')).toBeEmpty();
  await expect(queue.locator('.trainer-work-row')).toHaveCount(0);
});

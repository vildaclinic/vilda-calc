import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test('Gabinet isolates search and quick inputs, and drops delayed records on vault lock', async ({ page }) => {
  await page.setContent('<main id="home"></main>');
  await page.evaluate(() => {
    window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true;
    window.__VILDA_HOME_GABINET_PREVIEW__ = true;
    const listeners = new Map();
    let unlocked = true;
    const day = new Date();
    const today = [day.getFullYear(), String(day.getMonth() + 1).padStart(2,'0'), String(day.getDate()).padStart(2,'0')].join('-');
    window.VildaVault = {
      isUnlocked: () => unlocked,
      getCurrentUser: () => ({userId:'fictional-account'}),
      captureSyncOperationSession: () => 'test-session',
      assertSyncOperationSession: () => { if (!unlocked) throw new Error('locked'); },
      onLock: fn => listeners.set('lock',fn),
      listPatients: async () => [{patientId:'fictional-patient',header:{name:'Żuk Fikcyjny',dobISO:'2000-01-11'}}],
      createCalendarReader: () => ({
        dispose() {},
        listPatientNotesInRange: async () => [
          {category:'absence',title:'Nieobecność',dueDateISO:today},
          {category:'followup',patientId:'fictional-patient',dueDateISO:today,dueTime:'09:15',title:'Kontrola'}
        ]
      })
    };
    window.VildaAuthUI = {isBootReady:()=>true};
    window.VildaProAccess = {hasAccess:()=>true};
    window.VildaHomeGabinetQuick = {calculate:()=>({rows:[{label:'Wynik testowy',value:'42'}]})};
    window.lockVault = () => { unlocked = false; listeners.get('lock')(); };
    window.capturedInputs = [];
    for (const eventName of ['change','input']) {
      document.addEventListener(eventName, event => window.capturedInputs.push(event.target.tagName), true);
    }
  });
  await page.addScriptTag({path:fileURLToPath(new URL('../../vilda_home_gabinet_start.js',import.meta.url))});
  await page.evaluate(() => {
    window.landing = window.VildaHomeGabinetStart.mount(document.querySelector('main'), {onSelect:(id,mode)=>{ window.picked = [id,mode]; }});
  });
  await expect(page.getByText('Kontrola',{exact:true})).toBeVisible();
  await expect(page.getByText('Nieobecność',{exact:true})).toHaveCount(0);
  const search = page.getByRole('searchbox');
  await search.fill('zuk');
  const results = page.getByRole('region',{name:'Wyniki wyszukiwania pacjentów'});
  await results.getByRole('button',{name:'Rozpocznij nową wizytę'}).click();
  expect(await page.evaluate(()=>window.picked)).toEqual(['fictional-patient','start']);
  await page.evaluate(async () => {
    window.VildaHomeEncounter = {state:()=>({mode:'new'})};
    await window.landing.refresh();
  });
  const draft = page.getByRole('region',{name:'Rozpoczęta wizyta'});
  await draft.getByRole('button',{name:'Kontynuuj wizytę'}).click();
  expect(await page.evaluate(()=>window.picked)).toEqual(['fictional-patient','overview']);
  await page.getByRole('button',{name:'Szybkie obliczenie'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="years"]').fill('12');
  await dialog.locator('[name="sex"]').selectOption('F');
  await dialog.locator('[name="height"]').fill('150');
  await dialog.getByRole('button',{name:'Oblicz',exact:true}).click();
  await expect(dialog.getByText('42')).toBeVisible();
  await dialog.getByRole('button',{name:'Zamknij'}).last().click();
  const nativeTargets = await page.evaluate(()=>window.capturedInputs);
  expect(nativeTargets.length).toBeGreaterThan(0);
  expect([...new Set(nativeTargets)]).toEqual(['DIV']);
  await page.evaluate(async () => {
    let finish;
    window.VildaVault.listPatients = () => new Promise(resolve => { finish = resolve; });
    const reading = window.landing.refresh();
    window.lockVault();
    finish([{patientId:'private',header:{name:'Spóźniony pacjent'}}]);
    await reading;
  });
  await expect(page.getByText('Żuk Fikcyjny',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Spóźniony pacjent',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toHaveCount(0);
});

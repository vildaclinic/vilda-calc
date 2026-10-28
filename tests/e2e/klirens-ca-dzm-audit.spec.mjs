import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import { installMemoryVault, memory, saveVisible, openShellCalculator } from '../support/klirens-patient-record.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { applySession, card, choose, details, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-ca-dzm-browser.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector);
      if (!node?.checkVisibility()) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('#caDzmInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      controls: [...document.querySelectorAll('#caDzmInputCard input,#caDzmInputCard select,#caDzmInputCard button')].filter(node => node.checkVisibility()).map(node => ({ id: node.id || node.textContent.trim(), font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })),
      texts: [...document.querySelectorAll('#clcrResultReport .clcr-result-value,#clcrResultReport .ca-dzm-reference-value')].map(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const text = range.getBoundingClientRect(), container = node.getBoundingClientRect();
        return { text: node.textContent.trim(), left: container.left, right: container.right, textLeft: text.left, textRight: text.right };
      }),
    };
  });
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(result.inputCard).not.toBeNull();
  expect(Math.abs(result.form.width - result.inputCard.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.clear.width - result.inputCard.width)).toBeLessThanOrEqual(1);
  expect(result.clear.top - result.inputCard.bottom).toBeGreaterThanOrEqual(15);
  if (width < 980) expect(result.report.top - result.clear.bottom).toBeGreaterThanOrEqual(20);
  else {
    expect(Math.abs(result.report.top - result.activePanel.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.report.width - result.activePanel.width)).toBeLessThanOrEqual(1);
  }
  for (const control of result.controls) {
    expect(control.font, control.id).toBeGreaterThanOrEqual(16);
    expect(control.height, control.id).toBeGreaterThanOrEqual(48);
    expect(control.left, control.id).toBeGreaterThanOrEqual(0);
    expect(control.right, control.id).toBeLessThanOrEqual(width + 1);
  }
  for (const text of result.texts) {
    expect(text.textLeft, text.text).toBeGreaterThanOrEqual(text.left - 0.5);
    expect(text.textRight, text.text).toBeLessThanOrEqual(text.right + 0.5);
  }
  return result;
}

function sameWidths(before, after) {
  for (const key of ['form', 'inputCard', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

for(const width of [1440,390,320]) {
  test(`Ca DZM: minimum danych, pełny kontekst i stała geometria ${width}px`,async({page},testInfo)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await openCalculator(page,width);
    await choose(page,'Ca_mgkg');await restore(page,{CA_concentration:'',CA_volume:''});await expectBlocked(page);
    expect(await page.locator('#caDzmInputCard input:visible').count()).toBe(2);
    expect(await page.locator('#caDzmInputCard select:visible').count()).toBe(2);
    for(const id of ['weight','CA_collectionHours','collectionStartAt','collectionEndAt','U_Ca','V24'])await expect(page.locator('#'+id)).toBeHidden();
    const first=await geometry(page,width);
    await page.locator('#CA_concentration').fill('5');await page.locator('#CA_volume').fill('1200');const high=await expectResult(page);
    expect(high.dailyMg).toBe(240.468);expect(high.reference.upper).toBe(4);
    const colors=await card(page).evaluate(n=>({value:getComputedStyle(n.querySelector('.clcr-result-value')).color,ref:getComputedStyle(n.querySelector('.ca-dzm-reference-value')).color,unit:getComputedStyle(n.querySelector('.ca-dzm-reference-unit')).color}));
    expect(colors.value).not.toBe(colors.ref);expect(colors.unit).toBe(colors.ref);sameWidths(first,await geometry(page,width));
    await page.getByRole('button',{name:'Gotowe wydalanie',exact:true}).click();await page.locator('#CA_reportedUnit').selectOption('mg/kg/24h');await page.locator('#CA_reportedValue').fill('3');
    await expectResult(page,{raw:3,status:'within',tone:'normal'});await expect(card(page)).toContainText('Wynik poniżej górnej granicy normy dla wieku.');sameWidths(first,await geometry(page,width));
    await page.locator('.ca-dzm-clinical-context>summary').click();await page.locator('#CA_clinicalMode').selectOption('hypo');
    await expectResult(page,{raw:3,status:'within',tone:'normal'});await expect(card(page)).toContainText('To jeden z elementów oceny bezpieczeństwa leczenia');
    await page.locator('#CA_clinicalMode').selectOption('phpt');await expect(page.locator('.ca-dzm-clinical-face')).toHaveText('Pierwotna nadczynność przytarczyc');
    await page.locator('#CA_reportedValue').fill('8');await expectResult(page,{raw:8});await expect(card(page)).toContainText('Sam wynik nie rozstrzyga o konieczności leczenia operacyjnego.');sameWidths(first,await geometry(page,width));
    await details(page).locator('summary').click();await expect(details(page)).toContainText('Khan');await expect(details(page)).toContainText('ESE');sameWidths(first,await geometry(page,width));
    const shot=testInfo.outputPath(`ca-dzm-${width}.png`);await page.locator('#clcrWorkspace').screenshot({path:shot});await testInfo.attach(`ca-dzm-${width}`,{path:shot,contentType:'image/png'});
    await page.locator('#clearBtn').click();await page.waitForFunction(()=>window.clcrIsResetting!==true);await choose(page,'Ca_mgkg');await expectBlocked(page);
    await expect(page.locator('#CA_concentration')).toHaveValue('');await expect(page.locator('#CA_collectionHours')).toHaveValue('24');await expect(page.locator('#CA_clinicalMode')).toHaveValue('phpt');sameWidths(first,await geometry(page,width));expect(errors).toEqual([]);
  });
}

test('Ca DZM: jednostki zachowują tę samą ilość, a brak masy lub wieku nie blokuje liczby',async({page})=>{
  await openCalculator(page);
  for(const [CA_concentration,CA_concentrationUnit] of [['5','mmol/L'],['20.039','mg/dL'],['200.39','mg/L']]){
    await restore(page,{CA_concentration,CA_concentrationUnit,CA_volume:'1.2',CA_volumeUnit:'L'});await expectResult(page);
  }
  await restore(page,{weight:''});await expectResult(page,{raw:240.468,status:'unassessed',tone:'neutral',unit:'mg/24 h',reference:false});
  await restore(page,{age:'',weight:''});await expectResult(page,{raw:240.468,status:'unassessed',tone:'neutral',unit:'mg/24 h',reference:false});
  await restore(page,{age:'45',sex:'M',weight:''});await expectResult(page,{raw:240.468,status:'within',tone:'normal',unit:'mg/24 h'});
});

test('Ca DZM: dzieci i niemowlęta zachowują normę wieku we wszystkich kontekstach',async({page})=>{
  await openCalculator(page);
  for(const [age,ageMonths,value,upper,status,tone] of [['0','2','5',5,'within','normal'],['0','3','4',4,'boundary','warning'],['10','0','3',4,'within','normal']]){
    for(const CA_clinicalMode of ['general','hypo','phpt']){
      await restore(page,{age,ageMonths,CA_inputMode:'reported',CA_reportedValue:value,CA_reportedUnit:'mg/kg/24h',CA_clinicalMode});
      const model=await expectResult(page,{raw:Number(value),status,tone});expect(model.reference.upper).toBe(upper);await expect(card(page)).not.toContainText('250');await expect(card(page)).not.toContainText('300');
    }
  }
});

test('Ca DZM: 220mg u kobiety ma inny próg kamicy, cel niedoczynności i kryterium PHPT',async({page})=>{
  await openCalculator(page);
  for(const [CA_clinicalMode,status,tone,ref] of [['general','high','warning','<200'],['hypo','within','normal','<250'],['phpt','criterion-not-met','neutral','>250']]){
    await restore(page,{age:'45',sex:'F',weight:'60',CA_inputMode:'reported',CA_reportedValue:'220',CA_clinicalMode});
    const m=await expectResult(page,{raw:220,status,tone,unit:'mg/24 h'});expect(m.referenceText).toBe(ref);
    if(CA_clinicalMode === 'phpt') await expect(card(page).locator('.ca-dzm-range-normal')).toHaveCount(0);
  }
  await restore(page,{age:'45',sex:'F',CA_inputMode:'reported',CA_reportedValue:'250',CA_clinicalMode:'phpt'});await expectResult(page,{raw:250,status:'criterion-not-met',tone:'neutral',unit:'mg/24 h'});
  await restore(page,{age:'45',sex:'F',CA_inputMode:'reported',CA_reportedValue:'320',CA_clinicalMode:'phpt'});await expectResult(page,{raw:320,status:'criterion-met',unit:'mg/24 h'});
});

test('Ca DZM: walidacja, zero i niepełna doba usuwają niewłaściwy werdykt oraz stary wynik',async({page})=>{
  await openCalculator(page);await restore(page);
  for(const invalid of ['','-1','NaN','Infinity','0x10','5x']){await page.locator('#CA_concentration').fill('5');await expectResult(page);await page.locator('#CA_concentration').fill(invalid);await expectBlocked(page);}
  await restore(page,{CA_concentration:'0'});await expectResult(page,{raw:0,status:'zero',tone:'neutral',reference:false});
  await restore(page,{CA_collectionHours:'12'});await expectResult(page,{raw:16.0312,status:'unassessed',tone:'neutral',reference:false});
  await restore(page,{ui_collectionNoMissedVoids_answer:'no'});await expectBlocked(page);
});

test('Ca DZM: przełączenie formuły i wczytanie innego pacjenta nie przenosi pomiaru ani choroby',async({page})=>{
  await openCalculator(page);await restore(page,{CA_clinicalMode:'hypo'});await choose(page,'UA_mgkg');await choose(page,'Ca_mgkg');await expectResult(page);
  await applySession(page,{version:2,currentVersion:'pro',selectedFormula:'Ca_mgkg',inputs:{age:'12',weight:'40',sex:'F'}});await expectBlocked(page);
  await expect(page.locator('#CA_clinicalMode')).toHaveValue('general');await expect(page.locator('#CA_concentration')).toHaveValue('');
});

test('Ca DZM: zapis, historia, edycja kontekstu i usunięcie dotyczą dokładnie wybranego pomiaru',async({page})=>{
  await openCalculator(page);await installMemoryVault(page);await restore(page,{CA_inputMode:'reported',CA_reportedValue:'3',CA_reportedUnit:'mg/kg/24h',CA_clinicalMode:'hypo'});
  const original=await expectResult(page,{raw:3,status:'within',tone:'normal',guest:false});const [first]=await saveVisible(page,'2026-10-24');
  expect(first.labResult).toMatchObject({valueNum:3,value:'3',unit:'mg/kg/24 h',testKey:'clcr-ca-dzm',norm:'<4 mg/kg/24 h'});
  await restore(page,{CA_inputMode:'reported',CA_reportedValue:'4',CA_reportedUnit:'mg/kg/24h'});await expectResult(page,{raw:4,status:'boundary',guest:false});const [sibling]=await saveVisible(page,'2026-10-25');
  await page.evaluate(notes=>{window.__caSyntheticNotes=notes},[first,sibling]);const history=await readVisibleSavedHistory(page,'__caSyntheticNotes');expect(history.visible).toBe(true);expect(history.ids).toEqual(history.originalIds);
  expect(history.points.map(p=>p.valueNum)).toEqual([3,4]);
  await page.evaluate(note=>window.ClcrResultDetails.open({patientId:note.patientId,noteId:note.id}),first);await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-CA_clinicalMode')).toHaveValue('hypo');await page.locator('#editField-CA_reportedValue').fill('-1');await page.locator('#saveEditedMeasurement').click();await expect(page.locator('#editError')).toBeVisible();expect((await memory(page)).updates).toHaveLength(0);
  await page.locator('#editField-CA_reportedValue').fill('8');await page.locator('#editField-CA_clinicalMode').selectOption('phpt');await page.locator('#saveEditedMeasurement').click();await expect(page.locator('#editDialog')).toBeHidden();
  let stored=await memory(page);const edited=stored.notes.find(n=>n.id===first.id);expect(stored.notes.find(n=>n.id===sibling.id)).toEqual(sibling);
  const point=await page.evaluate(n=>window.ClcrSavedResults.projectPatientNotes([n]).measurements[0],edited);expect(point).toMatchObject({valueNum:8,outOfRange:true,caDzmAssessment:{input:{clinicalContext:'phpt'}}});
  expect(original.interpretation).toContain('To jeden z elementów');await page.locator('#deleteMeasurement').click();await page.locator('#confirmDeleteMeasurement').click();await expect(page.locator('#detailsDialog')).toBeHidden();stored=await memory(page);expect(stored.notes).toEqual([sibling]);expect(stored.originalsLocked).toBe(true);
});

test('Ca DZM: AI i Word korzystają z tej samej liczby, normy i komentarza',async({page})=>{
  await openCalculator(page);await restore(page,{CA_inputMode:'reported',CA_reportedValue:'3.999999999999',CA_reportedUnit:'mg/kg/24h',CA_clinicalMode:'hypo'});const model=await expectResult(page,{raw:3.999999999999,status:'within',tone:'normal'});
  await page.evaluate(()=>{window.__caClipboard='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__caClipboard=value}}});window.alert=()=>{}});
  await page.locator('#askAI').click();await expect.poll(()=>page.evaluate(()=>window.__caClipboard)).toContain(model.display.text);const copied=await page.evaluate(()=>window.__caClipboard);
  for(const text of [model.display.text,model.unit,model.referenceText,model.interpretation])expect(copied).toContain(text);
  const waiting=page.waitForEvent('download');await page.locator('#downloadDOCX').click();const download=await waiting;const exported=await fs.readFile(await download.path(),'utf8');const text=await page.evaluate(html=>new DOMParser().parseFromString(html,'text/html').body.textContent,exported);
  for(const value of [model.display.text,model.unit,model.referenceText,model.interpretation])expect(text).toContain(value);
});


// The main patient card loads its own read/edit resources; it must work without
// opening the calculator modules in the Start document first.
test('Ca DZM: Badania i Wykresy w głównej karcie zachowują obie liczby i edycję kontekstu', async ({ page }) => {
  const { calculator, start } = await openShellCalculator(page);
  await restore(calculator, { CA_inputMode: 'reported', CA_reportedValue: '3', CA_reportedUnit: 'mg/kg/24h', CA_clinicalMode: 'hypo' });
  const [first] = await saveVisible(calculator, '2026-10-24');
  await restore(calculator, { CA_inputMode: 'reported', CA_reportedValue: '8', CA_reportedUnit: 'mg/kg/24h', CA_clinicalMode: 'phpt' });
  const [second] = await saveVisible(calculator, '2026-10-25');
  await calculator.locator('#clcrOpenBadaniaBtn').click();
  await expect(page).toHaveURL(/app\.html#\/start/);
  const history = start.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-history');
  await expect(history.locator('tr[data-note-id]')).toHaveCount(2);
  for (const [note, value] of [[first, '3'], [second, '8']]) {
    await expect(history.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveAttribute('data-value', value);
    await expect(history.locator(`tr[data-note-id="${note.id}"] .vilda-clcr-row-reference`)).toHaveText('<4 mg/kg/24 h');
  }
  expect(await start.evaluate(() => Boolean(window.VildaClcrCaDzm))).toBe(false);
  await history.locator(`.vilda-clcr-value[data-note-id="${first.id}"]`).click();
  await start.locator('#editMeasurement').click();
  await expect(start.locator('#editField-CA_clinicalMode')).toHaveValue('hypo');
  await start.locator('#editField-CA_reportedValue').fill('4');
  await start.locator('#editField-CA_clinicalMode').selectOption('phpt');
  await start.locator('#saveEditedMeasurement').click();
  await expect(start.locator('#editDialog')).toBeHidden();
  await start.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(history.locator(`.vilda-clcr-point[data-note-id="${first.id}"]`)).toHaveAttribute('data-value', '4');
  expect((await memory(start)).notes.find(note => note.id === second.id)).toEqual(second);
  expect((await memory(start)).originalsLocked).toBe(true);
});

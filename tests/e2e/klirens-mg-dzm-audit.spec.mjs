import {expect,test} from '@playwright/test';
import fs from 'node:fs/promises';
import {czekajNaUstabilizowanyUklad} from '../support/uklad-czekanie.mjs';
import {installMemoryVault,memory,saveVisible} from '../support/klirens-patient-record.mjs';
import {readVisibleSavedHistory} from '../support/klirens-saved-history.mjs';
import {openCalculator,restore,choose,card,details,expectResult,expectBlocked} from '../support/klirens-mg-dzm-browser.mjs';

async function geometry(page,width){await czekajNaUstabilizowanyUklad(page);const g=await page.evaluate(()=>{const box=s=>{const b=document.querySelector(s).getBoundingClientRect();return{x:b.x,w:b.width,y:b.y+scrollY,bottom:b.bottom+scrollY};};return{overflow:document.documentElement.scrollWidth-innerWidth,form:box('#clcrForm'),card:box('#mgDzmInputCard'),clear:box('#clearBtn'),report:box('#clcrResultReport'),active:box('#clcrActivePanel'),controls:[...document.querySelectorAll('#mgDzmInputCard input,#mgDzmInputCard select,#mgDzmInputCard button')].filter(n=>n.checkVisibility()).map(n=>({id:n.id,font:parseFloat(getComputedStyle(n).fontSize),height:n.getBoundingClientRect().height}))};});expect(g.overflow).toBeLessThanOrEqual(1);expect(Math.abs(g.form.w-g.card.w)).toBeLessThanOrEqual(1);expect(Math.abs(g.clear.w-g.card.w)).toBeLessThanOrEqual(1);if(width<980)expect(g.report.y-g.clear.bottom).toBeGreaterThanOrEqual(20);else{expect(Math.abs(g.active.y-g.report.y)).toBeLessThanOrEqual(1);expect(Math.abs(g.active.w-g.report.w)).toBeLessThanOrEqual(1);}for(const c of g.controls){expect(c.font,c.id).toBeGreaterThanOrEqual(16);expect(c.height,c.id).toBeGreaterThanOrEqual(48);}return g;}
function sameWidths(a,b){for(const key of ['form','card','clear','report'])expect(Math.abs(a[key].w-b[key].w),key).toBeLessThanOrEqual(.5);}

for(const width of [1440,390,320])test(`Mg DZM: dwa pola, źródłowy próg i stała geometria ${width}px`,async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await openCalculator(page,width);await choose(page,'Mg_mgkg');await restore(page,{MG_concentration:'',MG_volume:''});await expectBlocked(page);
 expect(await page.locator('#mgDzmInputCard input:visible').count()).toBe(2);expect(await page.locator('#mgDzmInputCard select:visible').count()).toBe(2);
 await expect(page.locator('#MG_collectionHours')).toHaveValue('24');await expect(page.locator('#MG_collectionHours')).toBeHidden();await expect(page.locator('#weight')).toBeHidden();await expect(page.locator('#height')).toBeHidden();
 const initial=await geometry(page,width);await page.locator('#MG_concentration').fill('20');await page.locator('#MG_volume').fill('1500');const m=await expectResult(page);await expect(page.locator('#clcrInfo')).toBeEmpty();expect(m.dailyMg).toBe(30);expect(m.reference.lower).toBe(88);await expect(card(page)).toContainText('Może wiązać się z małą podażą lub słabym wchłanianiem magnezu; sam wynik nie rozpoznaje niedoboru magnezu.');
 await expect(page.locator('#mgDzmInputCard')).not.toContainText(/hipomagnez/i);await expect(details(page)).not.toContainText(/hipomagnez/i);
 const colors=await card(page).evaluate(n=>({value:getComputedStyle(n.querySelector('.clcr-result-value')).color,ref:getComputedStyle(n.querySelector('.mg-dzm-reference-value')).color,unit:getComputedStyle(n.querySelector('.mg-dzm-reference-unit')).color}));expect(colors.value).not.toBe(colors.ref);expect(colors.ref).toBe(colors.unit);sameWidths(initial,await geometry(page,width));
 await page.getByRole('button',{name:'Gotowe wydalanie',exact:true}).click();await page.locator('#MG_reportedValue').fill('30');await expectResult(page);sameWidths(initial,await geometry(page,width));
 await details(page).locator('summary').click();await expect(details(page)).toContainText('88');sameWidths(initial,await geometry(page,width));
 const shot=testInfo.outputPath(`mg-dzm-${width}.png`);await page.locator('#clcrWorkspace').screenshot({path:shot});await testInfo.attach('mg-dzm',{path:shot,contentType:'image/png'});
 await page.locator('#clearBtn').click();await page.waitForFunction(()=>window.clcrIsResetting!==true);await choose(page,'Mg_mgkg');await expectBlocked(page);await expect(page.locator('#MG_collectionHours')).toHaveValue('24');await expect(page.locator('#weight')).toHaveValue('30');await expect(page.locator('#height')).toHaveValue('135');sameWidths(initial,await geometry(page,width));
 expect(errors).toEqual([]);
});

test('Mg DZM: jednostki, granice i odniesienia bez dodatkowego wywiadu',async({page})=>{
 await openCalculator(page);
 for(const [MG_concentration,MG_concentrationUnit,MG_volume,MG_volumeUnit]of [['30.38125','mg/L','1600','mL'],['1.25','mmol/L','1.6','L'],['3.038125','mg/dL','1600','mL']]){await restore(page,{age:'45',weight:'',height:'',MG_concentration,MG_concentrationUnit,MG_volume,MG_volumeUnit});await expectResult(page,{raw:48.61,unit:'mg/24 h'});}
 for(const [MG_reportedValue,status,tone]of [['51','within','normal'],['269','within','normal'],['50.999999999','low','warning'],['269.000000001','high','warning']]){await restore(page,{age:'45',MG_inputMode:'reported',MG_reportedValue});await expectResult(page,{raw:Number(MG_reportedValue),status,tone,unit:'mg/24 h'});}
 for(const fields of [{age:'',ageMonths:'',weight:'',height:''},{age:'1'},{age:'85'},{weight:'',height:''}]){await restore(page,fields);await expectResult(page,{raw:30,status:'unassessed',tone:'neutral',unit:'mg/24 h',reference:false});}
 await restore(page,{age:'45',weight:'',MG_inputMode:'reported',MG_reportedValue:'2',MG_reportedUnit:'mg/kg/24h'});await expectResult(page,{raw:2,status:'unassessed',tone:'neutral',unit:'mg/kg/24 h',reference:false});
});

test('Mg DZM: nieprawidłowe wejście, zero, mała liczba i pusty czas',async({page})=>{
 await openCalculator(page);await restore(page);
 for(const MG_concentration of ['-1','NaN','Infinity','0x10','1x']){await restore(page,{MG_concentration});await expectBlocked(page);}
 await restore(page,{MG_concentration:'0'});await expectResult(page,{raw:0,status:'zero',tone:'neutral',unit:'mg/24 h',reference:false});
 await restore(page,{age:'45',MG_concentration:'0.00001'});const tiny=await expectResult(page,{raw:0.000015,unit:'mg/24 h'});expect(tiny.display.text.replace(',','.')).not.toMatch(/^0(?:\.0+)?$/);
 await restore(page,{age:'45',MG_collectionHours:''});await expectResult(page,{raw:30,unit:'mg/24 h'});
 await restore(page,{MG_collectionHours:'12'});await expectResult(page,{raw:60,status:'unassessed',tone:'neutral',unit:'mg/24 h',reference:false});
 await restore(page,{ui_collectionNoMissedVoids_answer:'no'});await expectBlocked(page);
});

test('Mg DZM: zapis, odczyt i świadoma edycja jednego pomiaru',async({page})=>{
 await openCalculator(page);await installMemoryVault(page);await restore(page);await expectResult(page,{guest:false});await saveVisible(page);const first=await memory(page);expect(first.notes).toHaveLength(1);expect(first.notes[0].labResult.value).toBe('49,13');expect(first.notes[0].labResult.unit).toBe('mg/1,73 m²/24 h');
 await page.evaluate(notes=>{window.__mgSyntheticNotes=notes},first.notes);const history=await readVisibleSavedHistory(page,'__mgSyntheticNotes');expect(history.visible).toBe(true);expect(history.ids).toEqual(history.originalIds);expect(history.points[0].displayValue).toBe('49,13');
 await page.evaluate(note=>window.ClcrResultDetails.open({patientId:note.patientId,noteId:note.id}),first.notes[0]);await page.locator('#editMeasurement').click();await page.locator('#editField-MG_concentration').fill('50');await page.locator('#saveEditedMeasurement').click();await expect(page.locator('#editDialog')).toBeHidden();const edited=await memory(page);expect(edited.notes).toHaveLength(1);expect(edited.notes[0].id).toBe(first.notes[0].id);expect(Number(edited.notes[0].labResult.value.replace(',','.'))).toBeGreaterThan(88);
});


test('Mg DZM: AI i Word zachowują wspólną liczbę, odniesienie i interpretację',async({page})=>{
 await openCalculator(page);await restore(page,{age:'45',MG_inputMode:'reported',MG_reportedValue:'50.999999999'});
 const model=await expectResult(page,{raw:50.999999999,status:'low',tone:'warning',unit:'mg/24 h'});
 await page.evaluate(()=>{window.__mgClipboard='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__mgClipboard=value}}});window.alert=()=>{};});
 await page.locator('#askAI').click();await expect.poll(()=>page.evaluate(()=>window.__mgClipboard)).toContain(model.display.text);
 const copied=await page.evaluate(()=>window.__mgClipboard);
 for(const text of [model.display.text,model.unit,model.referenceText,model.interpretation])expect(copied).toContain(text);
 const waiting=page.waitForEvent('download');await page.locator('#downloadDOCX').click();const download=await waiting;
 const exported=await fs.readFile(await download.path(),'utf8');
 const text=await page.evaluate(html=>new DOMParser().parseFromString(html,'text/html').body.textContent,exported);
 for(const value of [model.display.text,model.unit,model.referenceText,model.interpretation])expect(text).toContain(value);
});

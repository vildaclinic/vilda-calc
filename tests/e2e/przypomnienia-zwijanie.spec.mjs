import { expect, test } from '../support/test-czas.mjs';

// P-PRZYPOMNIENIA-B22: approved filters replace category folding.
// Preserve checks for note counts, category labels, dates, reload and sync data.
// Only fictional test records; native vault and event/render paths.

const HASLO = 'E2e#Zwijanie!2026rem';

/** Zakłada użytkownika sejfu, zasiewa wpisy na dziś i pokazuje kartę. */
async function otworz(page, wpisy) {
  await page.addInitScript(()=>localStorage.setItem('vilda-terms-accepted-v1',JSON.stringify({version:1,acceptedAtISO:new Date().toISOString()})));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.evaluate(async (lista) => {
    const V = window.VildaVault;
    const p = (n) => String(n).padStart(2, '0');
    // Datę liczy PRZEGLĄDARKA — kontener testowy chodzi w UTC i policzyłby inną dobę.
    const d = new Date();
    void d;
    for (const w of lista) {
      const pac = await V.savePatient({ name: w.name });
      await V.savePatientNote({
        patientId: pac.id || pac.patientId,
        title: w.title,
        body: '',
        category: w.category,
        dueDateISO: (()=>{const day=new Date();day.setDate(day.getDate()+(w.offset||0));return `${day.getFullYear()}-${p(day.getMonth()+1)}-${p(day.getDate())}`;})(),
        dueTime: null,
      });
    }
  }, wpisy);
  await pokazKarte(page);
}

/** Przeładowanie strony z gotowymi danymi + otwarcie bramki PRO. */
async function pokazKarte(page) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked());
  await page.evaluate(() => {
    const a = document.getElementById('vilda-auth-ui-root');
    if (a) a.style.display = 'none';
    // Karta jest za bramką PRO (podpisany token, którego w teście nie podrabiamy) — podmieniamy
    // wyłącznie tę bramkę; cała reszta ścieżki renderowania jest prawdziwa.
    window.VildaProAccess.hasAccess = () => true;
    window.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForSelector('#remindersInline .vb22-row', {
    state: 'attached', timeout: 20000,
  });
}

const DATA = [
  {name:'Fikcyjna Ewa',title:'Zaległa procedura',category:'procedura',offset:-2},
  {name:'Fikcyjny Filip',title:'Zaległa kontrola',category:'followup',offset:-1},
  {name:'Fikcyjna Gabriela',title:'Wynik oczekiwany dziś',category:'wynik-badania',offset:0},
  {name:'Fikcyjny Hubert',title:'Kontrola dzisiaj',category:'followup',offset:0},
  {name:'Fikcyjna Irena',title:'Przyszła kontrola',category:'followup',offset:7},
];
const card=page=>page.locator('#remindersInline');
for (const [key,label,count] of [['all','Wszystkie',5],['overdue','Zaległe',2],['today','Dziś',2],['pending','Oczekujące wyniki',1]]) {
 test('B22 filtr '+label+' pokazuje właściwe sprawy bez zmiany pozostałych liczników',async({page})=>{
  await otworz(page,DATA); const root=card(page);
  await expect(root.locator('.vb22-count')).toHaveText(['5','2','2','1']);
  await root.locator('[data-filter='+key+']').click();
  await expect(root.locator('.vb22-row')).toHaveCount(count);
  await expect(root.locator('.vb22-count')).toHaveText(['5','2','2','1']);
  await expect(root.locator('[data-filter='+key+']')).toHaveAttribute('aria-pressed','true');
  const selected=await root.locator('[aria-pressed=true]').count();expect(selected).toBe(1);
  await expect(root).not.toContainText('Urlop');
  if(key==='overdue')await expect(root.locator('.vild-rem-when')).toHaveText(['Po terminie','Po terminie']);
  if(key==='today')await expect(root).not.toContainText('Przyszła kontrola');
  if(key==='pending')await expect(root.locator('.vb22-row-title')).toHaveText(['Wynik oczekiwany dziś']);
 });
}

test('B22 filtry obejmują przyszłe sprawy, licznik dzwonka pozostaje ograniczony do dziś',async({page})=>{
 await otworz(page,DATA);await expect(card(page).locator('.vb22-row')).toHaveCount(5);
 await expect(card(page)).toContainText('Przyszła kontrola');await expect(page.locator('#vildaRemindersBtn')).toHaveAttribute('data-count','4');
 await card(page).locator('[data-filter=today]').click();await expect(card(page).locator('.vb22-row')).toHaveCount(2);
 await expect(card(page)).not.toContainText('Przyszła kontrola');await pokazKarte(page);
 await expect(card(page).locator('.vb22-row')).toHaveCount(5);await expect(card(page).locator('.vb22-count')).toHaveText(['5','2','2','1']);
 await expect(page.locator('#vildaRemindersBtn')).toHaveAttribute('data-count','4');
});

test('B22 zero oczekujących wyników jest odrębne od pustej całej listy',async({page})=>{
 await otworz(page,DATA);await page.evaluate(async()=>{const groups=await window.VildaVault.listPatientNotesDueByDate();for(const g of groups)for(const n of g.notes)if(n.category==='wynik-badania')await window.VildaVault.completePatientNote(n.id);});
 await expect(card(page).locator('.vb22-count')).toHaveText(['4','2','1','0']);await card(page).locator('[data-filter=pending]').click();
 await expect(card(page).locator('.vb22-row')).toHaveCount(0);await expect(card(page)).toContainText('Brak spraw w tym filtrze');
 await expect(card(page)).not.toContainText('Brak przypomnień na dziś');await card(page).locator('[data-filter=all]').click();
 await expect(card(page).locator('.vb22-row')).toHaveCount(4);await expect(page.locator('#vildaRemindersBtn')).toHaveAttribute('data-count','3');
});

test('B22 pełny i mały widok mają niezależne filtry nad tym samym zbiorem',async({page})=>{
 await otworz(page,DATA);await card(page).locator('[data-filter=pending]').click();await page.locator('#vildaRemindersBtn').click();const dialog=page.locator('dialog.vb22');
 await expect(dialog.locator('.vb22-row')).toHaveCount(5);await expect(dialog.locator('.vb22-count')).toHaveText(['5','2','2','1']);
 await dialog.locator('[data-filter=overdue]').click();await expect(dialog.locator('.vb22-row')).toHaveCount(2);await expect(card(page).locator('.vb22-row')).toHaveCount(1);
 await dialog.getByRole('button',{name:'Zamknij Przypomnienia',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(card(page).locator('[data-filter=pending]')).toHaveAttribute('aria-pressed','true');await expect(card(page).locator('.vb22-row')).toHaveCount(1);
});

test('B22 wyszukiwanie pacjenta aktualizuje licznik i nie miesza szczegółów innej osoby',async({page})=>{
 await otworz(page,DATA);await page.locator('#vildaRemindersBtn').click();const dialog=page.locator('dialog.vb22');
 await dialog.getByRole('searchbox',{name:'Szukaj pacjenta lub sprawy'}).fill('Gabriela');await expect(dialog.locator('.vb22-row')).toHaveCount(1);
 await expect(dialog.locator('.vb22-count')).toHaveText(['1','0','1','1']);await expect(dialog.locator('h3')).toHaveText('Wynik oczekiwany dziś');
 await expect(dialog.locator('.vb22-detail')).toContainText('Fikcyjna Gabriela');await expect(dialog.locator('.vb22-detail')).not.toContainText('Filip');
 await dialog.getByRole('searchbox').fill('nieistniejący fikcyjny pacjent');await expect(dialog.locator('.vb22-row')).toHaveCount(0);
 await expect(dialog.locator('.vb22-count')).toHaveText(['0','0','0','0']);await expect(dialog.locator('.vb22-detail')).toContainText('Wybierz sprawę');
});

test('B22 wybór filtrów nie zmienia notatek ani historycznych preferencji synchronizacji',async({page})=>{
 await otworz(page,DATA);await page.evaluate(()=>window.VildaPersistence.writePreferenceJSON('remindersCollapsedCategories',['followup']));
 const before=await page.evaluate(async()=>{const p=await window.VildaVault.exportSyncPayload();return p.patientNotes.map(n=>({id:n.id,rev:n.rev,body:n.body,updatedAtISO:n.updatedAtISO}));});
 for(const key of ['pending','overdue','today','all'])await card(page).locator('[data-filter='+key+']').click();
 const after=await page.evaluate(async()=>{const p=await window.VildaVault.exportSyncPayload();return {notes:p.patientNotes.map(n=>({id:n.id,rev:n.rev,body:n.body,updatedAtISO:n.updatedAtISO})),prefs:window.VildaPersistence.readPreferenceJSON('remindersCollapsedCategories',null),sync:p.userPreferences};});
 expect(after.notes).toEqual(before);expect(after.prefs).toEqual(['followup']);expect(after.sync.remindersCollapsedCategories).toBeTruthy();
 await expect(card(page).locator('.vb22-row')).toHaveCount(5);await expect(card(page).locator('.vb22-count')).toHaveText(['5','2','2','1']);
});

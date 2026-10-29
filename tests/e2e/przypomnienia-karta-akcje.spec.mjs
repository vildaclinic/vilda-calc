import { expect, test } from '../support/test-czas.mjs';

// Karta „Przypomnienia” obok głównego formularza (index.html, vilda_auth_ui.js) — życzenie
// właściciela 2026-09-11: pozycja karty była tylko napisem („Obserwacja — Umówić densytometr…”),
// bez podglądu pełnej treści i bez akcji; akcje (Otwórz kartę pacjenta / Zrobione / Przełóż… /
// Nie zgłosił się) istniały wyłącznie w widoku pełnoekranowym, pod długim naciśnięciem albo „⋮”.
// Teraz (wariant A, wybór właściciela 2026-09-12): klik w pozycję ORAZ przycisk „⋮” przy pozycji
// otwierają to samo okno na środku ekranu — pełna treść zdarzenia i przyciski akcji z tego samego
// silnika co widok pełnoekranowy (remAkcje). Pierwsze wydanie wpisało style do bloku
// @media (max-width:699px), więc na komputerze okno lądowało nieostylowane na dole strony —
// stąd asercje geometrii (rozmiar „⋮”, position:fixed, wyśrodkowanie) przy szerokości 1440 px.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#RemKarta!26aa';
const DLUGA_TRESC =
  'Umówić densytometrię w Pracowni Densytometrii (budynek C, II piętro), skierowanie w teczce. ' +
  'Przed badaniem odstawić wapń na 24 h. Wynik omówić z rodzicami na następnej wizycie, ' +
  'porównać z poprzednim badaniem z marca.';

// Daty liczy PRZEGLĄDARKA (test-czas.mjs może trzymać jej zegar w innym dniu niż Node).
const dataWPrzegladarce = (page, przesuniecieDni) => page.evaluate((n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}, przesuniecieDni);

async function otworzZDanymi(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
      // Dzienny modal przypomnień nie ma przechwytywać kliknięć.
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      window.localStorage.setItem('vilda-reminders-shown-v1', `${t}|${Date.now()}`);
      window.localStorage.setItem('vilda-reminders-closed-v1', `${t}|${Date.now()}`);
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  const zalegla = await dataWPrzegladarce(page, -3);
  const dzis = await dataWPrzegladarce(page, 0);
  const ids = await page.evaluate(
    async (a) => {
      await window.VildaVault.createUser(a.pw, { label: 'e2e', iterations: 10000 });
      const pid = (await window.VildaVault.savePatient({ name: 'Densyta Dorota', user: { age: 9, sex: 'F' } })).patientId;
      const obs = (await window.VildaVault.savePatientNote({
        patientId: pid, title: 'Umówić densytometr', body: a.tresc, category: 'observation', dueDateISO: a.zalegla, dueTime: null,
      })).id;
      const kontrola = (await window.VildaVault.savePatientNote({
        patientId: pid, title: 'Wizyta kontrolna', body: '', category: 'followup', dueDateISO: a.dzis, dueTime: '11:30',
      })).id;
      return { pid, obs, kontrola };
    },
    { pw: HASLO, tresc: DLUGA_TRESC, zalegla, dzis },
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.evaluate(() => {
    // Karta jest za bramką PRO (podpisany token, którego w teście nie podrabiamy) — podmieniamy
    // wyłącznie tę bramkę, jak w przypomnienia-zwijanie.spec.mjs; reszta ścieżki jest prawdziwa.
    window.VildaProAccess.hasAccess = () => true;
    window.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForSelector('#remindersInline .vild-rem-row', { state: 'attached', timeout: 20_000 });
  // Baner cookies (fixed, u dołu) przykrywa dolne wiersze karty i menu — odrzucamy jak w innych
  // specyfikacjach (klirens-ui-*.spec.mjs).
  const consentDecline = page.locator('#consent-decline');
  if (await consentDecline.isVisible().catch(() => false)) {
    await consentDecline.click();
  }
  return ids;
}

const notatka = (page, id) => page.evaluate(async (i) => {
  const n = await window.VildaVault.getPatientNote(i);
  return { body: n.body, completedAtISO: n.completedAtISO || null, dueDateISO: String(n.dueDateISO || '').slice(0, 10) };
}, id);

const wierszObs = (page) => page.locator('#remindersInline .vild-rem-row', { hasText: 'Umówić densytometr' });

test('klik w pozycję karty otwiera pełny B2.2 z treścią, terminem i akcjami', async ({ page }) => {
  await otworzZDanymi(page); const row = wierszObs(page); await expect(row).toHaveCount(1);
  await expect(row).not.toContainText('odstawić wapń'); await row.click();
  const dialog = page.locator('dialog.vb22-modal'); await expect(dialog).toBeVisible();
  for (const text of ['Densyta Dorota','Obserwacja','Umówić densytometr',DLUGA_TRESC,'Szczegóły wydarzenia']) await expect(dialog).toContainText(text);
  const geometry = await dialog.evaluate(node => { const r = node.getBoundingClientRect(); return { position: getComputedStyle(node).position, cx: r.x+r.width/2, cy:r.y+r.height/2, w:r.width, h:r.height, vw:innerWidth,vh:innerHeight }; });
  expect(geometry.position).toBe('fixed'); expect(Math.abs(geometry.cx-geometry.vw/2)).toBeLessThan(40); expect(Math.abs(geometry.cy-geometry.vh/2)).toBeLessThan(60);
  expect(geometry.w).toBeLessThanOrEqual(1281); expect(geometry.w).toBeGreaterThan(700); expect(geometry.h).toBeLessThanOrEqual(geometry.vh);
  await expect(dialog.getByRole('button',{name:/[Oo]twórz Kartę pacjenta/})).toBeVisible();
  for (const name of ['Oznacz jako wykonane','Przełóż termin','Nie zgłosił się']) await expect(dialog.getByRole('button',{name,exact:true})).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});

test('B2.2: wykonanie zachowuje opis, a przełożenie zachowuje zadanie z nowym terminem', async ({ page }) => {
  const ids=await otworzZDanymi(page); await wierszObs(page).click(); const dialog=page.locator('dialog.vb22-modal');
  await expect(dialog).toContainText(DLUGA_TRESC);
  for(const name of ['Oznacz jako wykonane','Przełóż termin','Nie zgłosił się']) await expect(dialog.getByRole('button',{name,exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Oznacz jako wykonane',exact:true}).click();
  await page.locator('dialog.vb22-outcome').getByLabel('Co zostało zrobione? (opcjonalnie)',{exact:true}).fill('Fikcyjny zapis wykonania densytometrii.');
  await page.locator('dialog.vb22-outcome').getByRole('button',{name:'Zapisz wykonanie',exact:true}).click();
  await expect.poll(async()=>!!(await notatka(page,ids.obs)).completedAtISO).toBe(true);
  expect((await notatka(page,ids.obs)).body).toContain(DLUGA_TRESC); expect((await notatka(page,ids.obs)).body).toContain('Fikcyjny zapis wykonania');
  await expect(wierszObs(page)).toHaveCount(0); await dialog.getByRole('button',{name:'Zamknij Przypomnienia',exact:true}).click();
  const control=page.locator('#remindersInline .vild-rem-row',{hasText:'Wizyta kontrolna'}); await expect(control).toHaveCount(1); await control.click();
  await dialog.getByRole('button',{name:'Przełóż termin',exact:true}).click();
  const tomorrow=await dataWPrzegladarce(page,1); await page.locator('dialog.vb22-outcome').getByLabel('Nowy termin',{exact:true}).fill(tomorrow.slice(0,10));
  await page.locator('dialog.vb22-outcome').getByLabel('Powód zmiany (opcjonalnie)',{exact:true}).fill('Fikcyjnie ustalony nowy termin.');
  await page.locator('dialog.vb22-outcome').getByRole('button',{name:'Zapisz nowy termin',exact:true}).click();
  await expect.poll(async()=>(await notatka(page,ids.kontrola)).dueDateISO).toBe(tomorrow);
  expect((await notatka(page,ids.kontrola)).completedAtISO).toBeNull(); expect((await notatka(page,ids.kontrola)).body).toContain('Fikcyjnie ustalony nowy termin.');
  await expect(control).toHaveCount(0); // Przyszły termin pozostaje przy pacjencie; aktywne przypomnienia obejmują dziś i zaległe.
  await dialog.getByRole('button',{name:'Zamknij Przypomnienia',exact:true}).click();
  await page.locator('#remindersInline [data-filter=today]').click(); await expect(control).toHaveCount(0);
});

// P-PRZYPOMNIENIA-ECHO (2026-10-13): po pierwszym renderze karta wysyła ping samonaprawy licznika
// (BroadcastChannel „vilda-notes”, Tr w vilda_auth_ui.js), gdy licznik paska w sessionStorage jest inny.
// Nasłuchiwała jednak na drugim obiekcie tego kanału, więc dostawała własny ping i przebudowywała się
// jeszcze raz z tą samą treścią. Test „⋮” wyżej mierzył przycisk w tej chwili i w CI dostawał null
// (#652, #653). Tu karta wysyła ping za każdym razem: licznik paska nie trafia do sessionStorage.
test('własny ping licznika nie przebudowuje karty; ping z innej karty lub ramki nadal ją odświeża', async ({ page }) => {
  await page.addInitScript(() => {
    const P = { pingi: [], zmiany: [], wToku: new Set(), reads:0 };
    window.__echo = P;
    // Licznik paska (vilda_chrome.js) kasujemy — sessionStorage przeżywa przeładowanie — i nie dajemy go
    // zapisać przed żadnym skryptem strony, więc karta zawsze widzi inny licznik niż swój.
    const LICZNIK = 'vilda-reminders-count-v1';
    try { sessionStorage.removeItem(LICZNIK); } catch (_) { /* brak storage */ }
    const zapis = Storage.prototype.setItem;
    Storage.prototype.setItem = function (klucz, wartosc) {
      if (klucz === LICZNIK) return undefined;
      return zapis.call(this, klucz, wartosc);
    };
    // Podsłuch kanału powstaje przed skryptami strony, więc dostaje każdy komunikat przed kartą;
    // referencja w P, żeby obiekt kanału nie zniknął przy odśmiecaniu.
    try {
      P.kanal = new BroadcastChannel('vilda-notes');
      P.kanal.onmessage = (e) => {
        if (e.data && e.data.sender === 'rem-inline-selfheal') P.pingi.push(e.data);
      };
    } catch (_) { /* brak BroadcastChannel — test padnie na warunku wstępnym */ }
    document.addEventListener('DOMContentLoaded', () => {
      const karta = document.getElementById('remindersInline');
      if (karta) {
        new MutationObserver((lista) => {
          for (const m of lista) P.zmiany.push({ dodane: m.addedNodes.length, usuniete: m.removedNodes.length });
        }).observe(karta, { childList: true });
      }
      // Pobrania wpisów w toku: przebudowa karty kończy się dopiero po nich.
      const sejf = window.VildaVault;
      const zwykle = sejf && sejf.listPatientNotesDueByDate;
      if (!zwykle) return;
      sejf.listPatientNotesDueByDate = function (...argumenty) {
        if (/\bBr\b/.test(new Error().stack || '')) P.reads++;
        const wynik = Promise.resolve(zwykle.apply(this, argumenty));
        P.wToku.add(wynik);
        wynik.finally(() => P.wToku.delete(wynik)).catch(() => {});
        return wynik;
      };
    });
  });
  await otworzZDanymi(page);
  // Daje każdemu nasłuchowi czas na odebranie komunikatu i czeka, aż skończą się pobrania wpisów.
  const ustal = () => page.evaluate(async () => {
    const klatka = () => new Promise((ok) => { requestAnimationFrame(() => ok()); });
    await klatka(); await klatka();
    while (window.__echo.wToku.size) await Promise.allSettled([...window.__echo.wToku]);
    await klatka(); await klatka();
    return window.__echo.zmiany.slice();
  });
  await page.waitForFunction(() => window.__echo.pingi.length >= 1, null, { timeout: 20_000 });
  const poPingu = await ustal();
  expect(poPingu.filter((z) => z.dodane > 0).length, 'karta wypełniła się raz').toBe(1);
  expect(poPingu.filter((z) => z.usuniete > 0), 'własny ping karty nie przebudowuje jej drugi raz').toEqual([]);
  const box = await wierszObs(page).boundingBox();
  expect(box, 'wiersz B2.2 jest mierzalny po pingu').toBeTruthy();
  const readsBefore = await page.evaluate(()=>window.__echo.reads);

  // Kontrola: ten sam ping z innego obiektu kanału (inna karta przeglądarki albo ramka powłoki) odświeża kartę.
  await page.evaluate(() => {
    const k = new BroadcastChannel('vilda-notes');
    k.postMessage({ type: 'note-changed', ts: Date.now(), sender: 'rem-inline-selfheal', action: 'recount' });
    k.close();
  });
  await expect.poll(()=>page.evaluate(()=>window.__echo.reads), {message:'ping z innej karty odświeża dane'}).toBe(readsBefore+1);
  expect((await ustal()).filter(z=>z.usuniete>0), 'B2.2 zachowuje korzeń karty').toEqual([]);
  await expect(wierszObs(page)).toHaveCount(1);
});

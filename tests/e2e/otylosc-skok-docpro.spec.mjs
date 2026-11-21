import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-SKOK (etap 2 projektu „Leczenie otyłości — wpisy poza wizytą”; decyzje właściciela 2026-11-19).
// Włączenie, Zakończenie i zmianę leku edytuje się w monitorze DocPro. Karta pacjenta ma przy takich wpisach przyciski,
// które przenoszą tam od razu (ta sama droga co skok do punktu GH: wpis „vilda:gh-jump”, strażnik niezapisanych zmian):
//   SK-1 „Edytuj w DocPro →” — pacjentka wczytana jak „Odtwórz zapis” (bez okna wyboru, bez nowej wizyty), punkt
//        Włączenia otwarty do edycji; zapis poprawki mówi, że listy pacjentów zobaczą zmianę po „Zapisz dane”;
//   SK-2 „Dodaj ponownie w DocPro →” — pola monitora wypełnione z usuniętego Zakończenia;
//   SK-3 „Włączenie w DocPro →” (brak aktywnego cyklu) — zwykłe okno „Nowy pomiar / Odtwórz zapis”, potem monitor
//        gotowy do nowego Włączenia;
//   SK-4 wygląd sekcji jak na makiecie (małe przyciski, białe tło, kolory odznak źródła; telefon bez poziomego przewijania).
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block', chwila: '2026-11-18T12:00:00Z' });

const HASLO = 'E2e#SkokDocPro!26';
const WEGOVY = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const P = (id, type, dateISO, mies, weight, height, dose = '2,4 mg / tydz.') => ({
  id, type, dateISO, ageYears: 13, ageMonths: mies, weight, height,
  bmi: height > 0 ? +(weight / Math.pow(height / 100, 2)).toFixed(1) : null, drug: WEGOVY, substance: '', dose,
});
const MIGAWKA = [P('p-start', 'start', '2026-04-14', 0, 80, 160, '0,25 mg / tydz.'), P('p-paz', 'continue', '2026-10-13', 6, 75.2, 162.9)];
const ZAKONCZENIE = P('p-end', 'end', '2026-11-03', 6, 72.4, 163.6);

async function docpro(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('pwzNumber', '6000001');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && Boolean(window.VildaProAccess)
    && typeof window.obesityTherapyMonitorSkok === 'function' && Boolean(window.VildaDziennikOtylosciUI));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (tryb && !tryb.checked) { tryb.checked = true; tryb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(1200);
  const potwierdzam = page.locator('#professionalConfirmBtn');
  if (await potwierdzam.isVisible()) await potwierdzam.click();
  const bezAnalityki = page.getByRole('button', { name: 'Nie zgadzam się', exact: true });
  if (await bezAnalityki.isVisible()) await bezAnalityki.click();
}

async function pacjentka(page, punkty = MIGAWKA) {
  return page.evaluate(async (pts) => (await window.VildaVault.savePatient({
    name: 'Testowa Zuzanna',
    user: { lastName: 'Testowa', firstName: 'Zuzanna', sex: 'F', age: 13, ageMonths: 7, height: 163.6, weight: 72.4, dobISO: '2013-04-11' },
    obesityTherapyPoints: pts,
  }, { dedup: false })).patientId, punkty);
}

async function karta(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
  // P-KARTA-LECZENIE (etap 1): bloki leczenia stoją w zakładce „Leczenie” (druga, po „Status”).
  await page.locator('.vilda-patient-tab[data-tab="leczenie"]').click();
  // P-KARTA-LECZENIE (etap 2): „Wpisy leczenia” — widok „Wpisy” karty leczenia (domyślnie „Przegląd”).
  await page.locator('.vilda-ko-seg').getByRole('tab', { name: /^Wpisy/ }).click();
  await expect(page.locator('.vdo')).toBeVisible({ timeout: 15000 });
}

const wiersz = (page, dateISO) => page.locator(`.vdo-list:not(.vdo-list-deleted) > .vdo-item[data-date="${dateISO}"]`);
const komunikat = (page) => page.locator('#obesityTherapyActionMsg');
const przycisk = (page, nazwa) => page.locator('#obesityMonitorSection .obm-visit button', { hasText: nazwa });
const pole = (page, id) => page.locator(`#${id}`);
const wersjeWizyty = (page, pid) => page.evaluate(async (id) => ((await window.VildaVault.getPatient(id)).snapshots || []).length, pid);
const punktyDziennika = (page, pid) => page.evaluate(async (id) => {
  const D = window.VildaDziennikOtylosci;
  const migawka = (await window.VildaVault.getPatient(id)).snapshots[0].payload.obesityTherapyPoints;
  return (await D.wczytaj(id, migawka)).punkty.map((p) => [p.type, p.dateISO, p.weight]);
}, pid);

test.describe('Karta pacjenta → monitor leczenia otyłości w DocPro', () => {
  test('SK-1: „Edytuj w DocPro →” otwiera Włączenie do edycji, bez okna wyboru i bez nowej wizyty', async ({ page }) => {
    test.setTimeout(150_000);
    const okna = [];
    page.on('dialog', (d) => { okna.push(d.message()); d.accept(); });
    await docpro(page);
    const pid = await pacjentka(page);
    await karta(page, pid);
    const start = wiersz(page, '2026-04-14');
    await expect(start).toContainText('Od Włączenia zależą cykl, ocena wg ChPL i listy pacjentów.');
    await start.getByRole('button', { name: 'Edytuj w DocPro →' }).click();

    await expect(page.locator('.vdo')).toBeHidden();
    await page.waitForFunction((id) => window._vildaCurrentPatientId === id, pid, { timeout: 20000 });
    await expect(page.locator('#obesityEditBar')).toContainText('Edytujesz punkt: Włączenie', { timeout: 20000 });
    await expect(page.locator('#obesityMonitorSection')).toBeVisible();
    await expect(pole(page, 'obesityWeight')).toHaveValue('80');
    await expect(pole(page, 'obesityDate')).toHaveValue('2026-04-14');
    await expect(page.locator('#vildaLoadChoiceModal'), 'wczytanie jak „Odtwórz zapis” — bez okna wyboru').toHaveCount(0);

    await pole(page, 'obesityWeight').fill('79,6');
    await przycisk(page, 'Włączenie leczenia').click();
    await expect(komunikat(page)).toHaveText('Zapisano w dzienniku leczenia — wpis widać w Karcie pacjenta i na innych urządzeniach. Listy pacjentów zobaczą zmianę po „Zapisz dane”.');
    expect(okna.some((t) => /odniesieniem/.test(t)), 'monitor pyta jak dotąd przy zmianie punktu odniesienia').toBe(true);
    expect((await punktyDziennika(page, pid))[0]).toEqual(['start', '2026-04-14', 79.6]);
    expect(await wersjeWizyty(page, pid), 'poprawka w dzienniku nie tworzy wersji wizyty').toBe(1);
  });

  test('SK-2: „Dodaj ponownie w DocPro →” wypełnia monitor z usuniętego Zakończenia', async ({ page }) => {
    test.setTimeout(150_000);
    await docpro(page);
    const pid = await pacjentka(page, [...MIGAWKA, ZAKONCZENIE]);
    await page.evaluate(async (id) => {
      const D = window.VildaDziennikOtylosci;
      const migawka = (await window.VildaVault.getPatient(id)).snapshots[0].payload.obesityTherapyPoints;
      const stan = await D.wczytaj(id, migawka);
      const plan = D.planDzialania(stan, id, { rodzaj: 'usun', id: 'p-end' });
      await D.zapisz(id, plan.wersje);
    }, pid);
    await karta(page, pid);
    await page.getByRole('button', { name: /Usunięte wpisy \(1\)/ }).click();
    await page.getByRole('button', { name: 'Dodaj ponownie w DocPro →' }).click();

    await expect(komunikat(page)).toContainText('Uzupełniono z usuniętego wpisu: Zakończenie, 03.11.2026. Sprawdź pola i zapisz przyciskiem „Zakończenie leczenia”.', { timeout: 20000 });
    await expect(pole(page, 'obesityWeight')).toHaveValue('72.4');
    await expect(pole(page, 'obesityHeight')).toHaveValue('163.6');
    await expect(pole(page, 'obesityDate')).toHaveValue('2026-11-03');
    await expect(page.locator('#obesityEditBar')).toBeHidden();
    await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await komunikat(page).getByRole('button', { name: 'Wyczyść pola' }).click();
    await expect(pole(page, 'obesityWeight')).toHaveValue('');
    expect(await wersjeWizyty(page, pid)).toBe(1);
  });

  test('SK-3: „Włączenie w DocPro →” pyta „Nowy pomiar / Odtwórz zapis”, potem monitor gotowy do nowego cyklu', async ({ page }) => {
    test.setTimeout(150_000);
    await docpro(page);
    const pid = await pacjentka(page, [...MIGAWKA, ZAKONCZENIE]);
    await karta(page, pid);
    await expect(page.getByRole('button', { name: 'Kontynuacja' })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Włączenie w DocPro →' }).click();

    await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible({ timeout: 20000 });
    await expect(komunikat(page)).not.toContainText('Nowy cykl leczenia otyłości');
    await page.locator('#vildaLcmNew').click();
    await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await expect(komunikat(page)).toHaveText('Nowy cykl leczenia otyłości. Wpisz pomiary z tej wizyty, lek, dawkę i datę, potem wybierz „Włączenie leczenia”.', { timeout: 20000 });
    await expect(page.locator('#obesityMonitorSection')).toBeVisible();
    await expect(pole(page, 'obesityWeight')).toHaveValue('');
    await expect(pole(page, 'obesityDate')).toHaveValue('');
  });

  test('SK-5: powłoka — Karta na Start, „Edytuj w DocPro →” przenosi do panelu DocPro z punktem w edycji', async ({ page }) => {
    test.setTimeout(180_000);
    page.on('dialog', (d) => d.accept());
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
        window.localStorage.setItem('pwzNumber', '6000001');
        const d = new Date();
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        window.localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
        window.localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
      } catch (_) { /* brak storage — pomiń */ }
    });
    const ramka = async (tytul) => {
      await page.waitForFunction((n) => {
        const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
        return Boolean(f && f.contentWindow && f.contentWindow.VildaVault && typeof f.contentWindow.applyLoadedData === 'function');
      }, tytul, { timeout: 30000 });
      return (await page.$(`iframe.app-pane[title="${tytul}"]`)).contentFrame();
    };
    await page.goto('/app.html', { waitUntil: 'load' });
    let start = await ramka('Start');
    await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
    await page.reload({ waitUntil: 'load' });
    start = await ramka('Start');
    await start.waitForFunction(() => window.VildaVault.isUnlocked() && Boolean(window.VildaDziennikOtylosciUI));
    await page.waitForTimeout(1500);
    const zgoda = page.locator('#consent-decline');
    if (await zgoda.isVisible().catch(() => false)) await zgoda.click();
    const pid = await start.evaluate(async (pts) => (await window.VildaVault.savePatient({
      name: 'Testowa Zuzanna',
      user: { lastName: 'Testowa', firstName: 'Zuzanna', sex: 'F', age: 13, ageMonths: 7, height: 163.6, weight: 72.4, dobISO: '2013-04-11' },
      obesityTherapyPoints: pts,
    }, { dedup: false })).patientId, MIGAWKA);
    await start.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
    // P-KARTA-LECZENIE (etap 1): bloki leczenia stoją w zakładce „Leczenie” (druga, po „Status”).
    await start.locator('.vilda-patient-tab[data-tab="leczenie"]').click();
    // P-KARTA-LECZENIE (etap 2): „Wpisy leczenia” — widok „Wpisy” karty leczenia (domyślnie „Przegląd”).
    await start.locator('.vilda-ko-seg').getByRole('tab', { name: /^Wpisy/ }).click();
    await expect(start.locator('.vdo')).toBeVisible({ timeout: 15000 });
    await start.locator('.vdo-item[data-date="2026-04-14"]').getByRole('button', { name: 'Edytuj w DocPro →' }).click();

    const docpro = await ramka('DocPro');
    await docpro.waitForFunction(() => Boolean(window.VildaProAccess) && typeof window.obesityTherapyMonitorSkok === 'function');
    await docpro.evaluate(() => {
      window.VildaProAccess.hasAccess = () => true;
      document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
      const tryb = document.getElementById('resultsModeToggle');
      if (tryb && !tryb.checked) { tryb.checked = true; tryb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    const potwierdzam = docpro.locator('#professionalConfirmBtn');
    if (await potwierdzam.isVisible().catch(() => false)) await potwierdzam.click();
    await docpro.waitForFunction((id) => window._vildaCurrentPatientId === id, pid, { timeout: 20000 });
    await expect(docpro.locator('#obesityEditBar')).toContainText('Edytujesz punkt: Włączenie', { timeout: 20000 });
    await expect(docpro.locator('#obesityWeight')).toHaveValue('80');
    await expect(docpro.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).toBe('#/docpro');
  });

  test('SK-4: wygląd sekcji jak na makiecie — komputer i telefon', async ({ page }) => {
    test.setTimeout(150_000);
    await docpro(page);
    const pid = await pacjentka(page);
    await page.evaluate(async ({ id, lek }) => {
      const D = window.VildaDziennikOtylosci;
      const migawka = (await window.VildaVault.getPatient(id)).snapshots[0].payload.obesityTherapyPoints;
      const plan = D.planNowego(await D.wczytaj(id, migawka), id, { type: 'continue', dateISO: '2026-11-10', ageYears: 13, ageMonths: 7, weight: 74.6, weightSource: 'pacjent', drug: lek, dose: '2,4 mg / tydz.' });
      await D.zapisz(id, plan.wersje);
    }, { id: pid, lek: WEGOVY });
    await karta(page, pid);
    const styl = () => page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const cs = (el) => { const s = getComputedStyle(el); return { h: Math.round(el.getBoundingClientRect().height), bg: s.backgroundColor, color: s.color, shadow: s.boxShadow }; };
      return {
        sekcja: cs(q('.vdo')), karta: cs(q('.vilda-ko-karta')), wiersz: cs(q('.vdo-item')), dodaj: cs(q('.vdo-add')), popraw: cs(q('.vdo-row-actions .vdo-btn')),
        docpro: cs(q('.vdo-btn-docpro')), gabinet: cs(q('.vdo-src-gabinet')), pacjent: cs(q('.vdo-src-pacjent')),
        przewijanie: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    let s = await styl();
    // P-KARTA-LECZENIE, etap 2 (makieta hybrydy 2026-11-19): w karcie leczenia sekcja nie ma własnego pudełka — białe
    // wpisy stoją na miętowym tle karty (dotąd: białe tło sekcji). Wpisy i przyciski bez zmian.
    expect(s.sekcja.bg, 'sekcja bez własnego tła').toBe('rgba(0, 0, 0, 0)');
    expect(s.karta.bg, 'miętowe tło karty leczenia').toBe('rgb(225, 245, 238)');
    expect(s.wiersz.bg).toBe('rgb(255, 255, 255)');
    expect(s.dodaj.h, '„+ Kontynuacja” mniejszy niż przyciski ekranu konta').toBeLessThanOrEqual(36);
    expect(s.dodaj.shadow).toBe('none');
    expect(s.popraw.h).toBeLessThanOrEqual(34);
    expect(s.popraw.color, 'turkusowy tekst przycisku').toBe('rgb(0, 131, 141)');
    expect(s.docpro.h).toBeLessThanOrEqual(34);
    expect(s.gabinet.bg).toBe('rgb(224, 242, 241)');
    expect(s.pacjent.bg).toBe('rgb(255, 244, 224)');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    s = await styl();
    expect(s.popraw.h, 'telefon: cel dotyku').toBeGreaterThanOrEqual(44);
    expect(s.dodaj.h, 'telefon: cel dotyku').toBeGreaterThanOrEqual(44);
    expect(s.przewijanie, 'telefon bez poziomego przewijania').toBe(false);
  });
});

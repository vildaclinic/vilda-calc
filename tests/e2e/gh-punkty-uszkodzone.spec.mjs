import { expect, test } from '../support/test-czas.mjs';

// P-GH-PUNKTY-USZKODZONE (rata 4): prawdziwy DocPro z listą punktów terapii GH, w której jest uszkodzony wpis (null).
// - Po F5 monitor działa: tabela z dwoma punktami, licznik 2, ostrzeżenie nad tabelą, bez błędów strony.
// - Odtworzenie stanu DocPro (vilda_persist_runtime zapisuje listę z okna z powrotem do pamięci modułu) i kolejne F5
//   NIE usuwają uszkodzonego wpisu po cichu: lista zmienia się wyłącznie po kliknięciu przycisku naprawy.
// - Zapis z karty: komunikat z przyciskiem; „Usuń uszkodzony wpis” zostawia dwa punkty w tej samej kolejności;
//   ponowny zapis dopisuje punkt. Na telefonie (390 px) ostrzeżenie i komunikat mieszczą się bez poziomego przewijania.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhUszkodzone!26';
const P1 = {
  id: 'gh-e2e-u1', type: 'start', ageYears: 8, ageMonths: 0, weight: 25, height: 122, boneAge: null,
  dose: 0.028, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.7,
};
const P2 = {
  id: 'gh-e2e-u2', type: 'continue', ageYears: 8, ageMonths: 6, weight: 27, height: 125.5, boneAge: null,
  dose: 0.8 / 27, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: 210, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
};
const OSTRZEZENIE = '⚠ Lista punktów zawiera 1 uszkodzony wpis bez danych. Nie jest pokazywany w tabeli. '
  + 'Zapisywanie i usuwanie punktów jest wstrzymane, dopóki go nie usuniesz.';
const TRESC = 'Nie zapisano: lista punktów leczenia tego pacjenta zawiera 1 uszkodzony wpis bez danych. Usuń go, '
  + 'aby zapisywać punkty. Pozostałe punkty się nie zmienią.';

async function zaloguj(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

// DocPro po starcie: monitor gotowy, odtworzenie stanu zakończone, karta GH widoczna (zakładka Monitorowanie).
async function docproGotowy(page) {
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function'
    && Boolean(window.vildaGhIgfPersistApi) && Boolean(window.VildaGhPunkty), null, { timeout: 60000 });
  await page.waitForTimeout(2500); // odtworzenie stanu DocPro biegnie do ~1,5 s po starcie strony
  await page.evaluate(() => {
    window.vildaGhIgfPersistApi.ensureMounted();
    const k = document.getElementById('ghIgfTherapyCard');
    if (k.parentNode && k.parentNode.id !== 'e2e-pudlo') {
      const pudlo = document.createElement('div');
      pudlo.id = 'e2e-pudlo';
      pudlo.style.cssText = 'position:relative;z-index:9999;background:#fff;padding:8px';
      document.body.prepend(pudlo);
      pudlo.appendChild(k);
    }
    k.style.display = 'block';
    window.ghActivateTab('mon');
  });
}

const modul = (page) => page.evaluate(() => JSON.stringify(window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', null)));
const ustawKarte = (page) => page.evaluate(() => {
  const set = (id, v) => {
    const e = document.getElementById(id);
    e.value = v;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  };
  set('age', '9'); set('ageMonths', '0'); set('sex', 'M'); set('height', '130'); set('weight', '29');
  if (typeof window.update === 'function') window.update();
  set('therProg', 'SNP'); set('therDrug', 'Omnitrope 10 mg');
});

for (const [opis, rozmiar] of [['desktop', { width: 1280, height: 860 }], ['telefon (390 px)', { width: 390, height: 844 }]]) {
  test(`uszkodzony wpis po F5: monitor działa, dane bez zmian do kliknięcia naprawy; naprawa i zapis — ${opis}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(rozmiar);
    const bledy = [];
    page.on('pageerror', (e) => bledy.push(String(e && e.message)));
    await page.route(/^https:\/\/vilda-sync\./, (route) => route.abort());
    await zaloguj(page);
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await docproGotowy(page);
    const zapisana = JSON.stringify([P1, null, P2]);
    await page.evaluate((lista) => {
      window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', JSON.parse(lista), { force: true });
    }, zapisana);

    // F5 z uszkodzoną listą: monitor startuje (dawniej start przerywał się na tabeli).
    await page.reload({ waitUntil: 'load' });
    await docproGotowy(page);
    await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(2);
    await expect(page.locator('#ghTabMonCount')).toHaveText('2');
    await expect(page.locator('#ghTherapyDamagedNote')).toHaveText(OSTRZEZENIE);
    expect(await modul(page)).toBe(zapisana);
    // Lustro w karcie zaawansowanej (na DocPro ukrytej): wiersze obu punktów, bez uszkodzonego wpisu.
    await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('#advMeasurements .measure-row[data-gh-sync="true"]'))
      .map((r) => r.getAttribute('data-gh-id')))).toEqual([P1.id, P2.id]);

    // Odtworzenie stanu DocPro i drugie F5: lista dalej z uszkodzonym wpisem (nic nie przepisuje jej po cichu).
    await page.reload({ waitUntil: 'load' });
    await docproGotowy(page);
    await page.waitForTimeout(1500);
    expect(await modul(page)).toBe(zapisana);
    await expect(page.locator('#ghTherapyDamagedNote')).toBeVisible();

    // Telefon: ostrzeżenie mieści się w oknie, strona bez poziomego przewijania.
    const uklad = await page.evaluate(() => {
      const r = document.getElementById('ghTherapyDamagedNote').getBoundingClientRect();
      return { lewo: r.left, prawo: r.right, okno: window.innerWidth,
        przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(uklad.lewo).toBeGreaterThanOrEqual(0);
    expect(uklad.prawo).toBeLessThanOrEqual(uklad.okno);
    expect(uklad.przewijanie).toBeLessThanOrEqual(0);

    // Zapis z karty: komunikat z przyciskiem; lista bez zmian.
    await ustawKarte(page);
    await page.click('#btnGhContinue');
    await expect(page.locator('#ghInfoOverlay p')).toHaveText(TRESC);
    await expect(page.locator('#ghInfoOverlayHeader')).toHaveText('Uszkodzony wpis na liście punktów');
    const przycisk = page.locator('#ghDamagedRemoveBtn');
    await expect(przycisk).toHaveText('Usuń uszkodzony wpis');
    await expect(przycisk).toBeInViewport();
    expect(await modul(page)).toBe(zapisana);

    // Naprawa: dwa punkty w tej samej kolejności; ostrzeżenie znika; ponowny zapis dopisuje punkt.
    await przycisk.click();
    await expect(page.locator('#ghInfoOverlay')).toHaveCount(0);
    expect(await modul(page)).toBe(JSON.stringify([P1, P2]));
    await expect(page.locator('#ghTherapyDamagedNote')).toHaveCount(0);
    await page.click('#btnGhContinue');
    await expect(page.locator('#ghTherapyTbody .edit-gh-pt-btn')).toHaveCount(3);
    const poZapisie = JSON.parse(await modul(page));
    expect(poZapisie.slice(0, 2)).toEqual([P1, P2]);
    expect(poZapisie[2]).toMatchObject({ type: 'continue', weight: 29, height: 130, drug: 'Omnitrope 10 mg' });
    await expect(page.locator('#ghInfoOverlay')).toHaveCount(0);

    expect(bledy, `pageerror:\n${bledy.join('\n')}`).toEqual([]);
  });
}

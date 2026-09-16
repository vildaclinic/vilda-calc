import { expect, test } from '../support/test-czas.mjs';

// P-DS-6 na PRAWDZIWEJ stronie: obwód głowy pacjenta z rozpoznaniem zespołu Downa.
//
// Do 1.0.972 moduł obwodów czytał obwód głowy wyłącznie z siatek populacyjnych, więc dziecko
// leżące dokładnie na MEDIANIE DS wypadało tam na ~2. centylu w 3–5 lat — fałszywy alarm
// małogłowia u typowego pacjenta. Test idzie całą ścieżką produkcyjną: kolejność skryptów,
// dostęp modułu do silnika i do czytnika tablic DS, wynik karty i nota w podsumowaniu.
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#DsGlowa!26a';

async function otworz(page) {
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
  await page.waitForFunction(() => Boolean(window.VildaBmi) && Boolean(window.VildaDsLMS)
    && typeof window.vildaDsWiersz === 'function' && Boolean(window.VildaCircumference));
}

async function wypelnij(page, pola) {
  await page.evaluate((p) => {
    for (const [id, v] of Object.entries(p)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, pola);
}

test('mediana DS to 50. centyl przy rozpoznaniu, a alarm bez niego', async ({ page }) => {
  await otworz(page);

  // chłopiec, 4 lata, obwód głowy dokładnie na medianie siatki DS
  const medianaDs = await page.evaluate(() => window.vildaDsWiersz('HC', 'M', 48)[1]);
  expect(medianaDs).toBeGreaterThan(40);

  await wypelnij(page, {
    sex: 'M', age: '4', ageMonths: '0', weight: '16', height: '98',
    headCircumference: medianaDs.toFixed(1),
  });

  // do oceny podajemy medianę DOKŁADNIE (pole formularza ma jedno miejsce po przecinku,
  // więc zaokrąglenie samo w sobie przesunęłoby z o ~0,01 SD i test mierzyłby własny artefakt)
  const ocena = () => page.evaluate((cm) => {
    const r = window.VildaCircumference.assessRegular('head', cm, 'M', 4);
    return { ok: r.ok, ds: r.dsUsed === true, perc: r.perc, z: r.zScore, cat: r.cls && r.cls.cat };
  }, medianaDs);

  // bez rozpoznania — dawne zachowanie: ta sama głowa czyta się jako odchylenie
  const bez = await ocena();
  expect(bez.ds, 'bez rozpoznania siatka populacyjna').toBe(false);
  expect(bez.perc, 'mediana DS na siatce populacyjnej wypada nisko').toBeLessThan(10);

  // rozpoznanie w rekordzie przestawia siatkę obwodu głowy
  await page.evaluate(() => window.VildaDsSource.zapamietaj({ clinical: { downSyndrome: true } }));
  const zDs = await ocena();
  expect(zDs.ds, 'rozpoznanie z rekordu przestawia moduł obwodów').toBe(true);
  expect(zDs.ok).toBe(true);
  expect(Math.abs(zDs.z), 'mediana DS to z = 0').toBeLessThan(1e-9);
  expect(zDs.perc).toBeGreaterThan(49.9);
  expect(zDs.perc).toBeLessThan(50.1);
  expect(zDs.cat, 'i nie jest już odchyleniem').toBe('normal');

  // wynik jest liczony DOKŁADNIE tym samym łańcuchem, co reszta aplikacji
  const parytet = await page.evaluate((cm) => {
    const lms = window.vildaDsWiersz('HC', 'M', 48);
    return Math.abs(window.VildaCircumference.assessRegular('head', cm, 'M', 4).zScore - window.VildaBmi.zLms(cm, lms));
  }, medianaDs);
  expect(parytet, 'moduł i silnik dają TĘ SAMĄ liczbę').toBe(0);

  // i wraca po wyczyszczeniu stanu
  await page.evaluate(() => window.VildaDsSource.zapomnij());
  expect((await ocena()).ds).toBe(false);
});

test('karta obwodu głowy NAZYWA siatkę DS i mówi, czemu przełącznik WHO/IMiD nic nie robi', async ({ page }) => {
  await otworz(page);
  await page.evaluate(() => window.VildaDsSource.zapamietaj({ clinical: { downSyndrome: true } }));
  const medianaDs = await page.evaluate(() => window.vildaDsWiersz('HC', 'M', 48)[1]);
  await wypelnij(page, {
    sex: 'M', age: '4', ageMonths: '0', weight: '16', height: '98',
    headCircumference: medianaDs.toFixed(1),
  });

  const nota = await page.evaluate((cm) => window.VildaCircumference.assessRegular('head', cm, 'M', 4).sourceHtml,
    Number(medianaDs.toFixed(1)));
  expect(nota).toContain('Zemel 2015');
  expect(nota).toContain('WHO / IMiD');

  // decyzja D2: poza zakresem siatki DS nie ma wyniku z innej populacji
  const poza = await page.evaluate((cm) => {
    const r = window.VildaCircumference.assessRegular('head', cm, 'M', 21);
    return { ok: r.ok, ds: r.dsUsed === true, reason: r.reason };
  }, Number(medianaDs.toFixed(1)));
  expect(poza.ok).toBe(false);
  expect(poza.ds).toBe(true);
  expect(poza.reason).toBe('ds-range');
});

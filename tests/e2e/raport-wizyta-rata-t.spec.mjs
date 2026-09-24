import { expect, test } from '@playwright/test';

// P-RAPORT rata T (decyzje właściciela 2026-09-23): zdanie o wysokim wzroście w nagłówku „Raportu po wizycie”
// zależy od wzrostu docelowego wg rodziców (MPH): W1 w paśmie (żółte, opisowe), W2 pogranicze, W3 alarm 3–10 lat
// (przedwczesne dojrzewanie nazwane), W3′ < 3 lat (obserwacja), MPH niezależnie od trybu, liczba SDS tylko w trybie
// profesjonalnym, brak dwóch „Dodatkowo …” o tej samej osi. PRAWDZIWA strona (index i docpro); dane FIKCYJNE.
// Tryb przełączany przez #resultsModeToggle (zbieracz czyta leksykalny `professionalMode` z app.js, nie window.*).

const NB = ' ';

async function otworz(page, strona) {
  await page.goto(`/${strona || 'index.html'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.patientReportBuildModel === 'function'
    && !!window.VildaRaportNaglowek && window.VildaRaportNaglowek.WERSJA >= 3);
}

async function model(page, s) {
  return page.evaluate(async (s) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const pro = s.pro !== false;
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && tgl.checked !== pro) { tgl.checked = pro; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    ['bpSystolic', 'bpDiastolic', 'heartRate', 'respRate', 'waistCm', 'hipCm', 'headCircumference', 'chestCircumference', 'customGoalKg'].forEach((id) => set(id, ''));
    set('name', 'Testowy Fikcyjny'); set('sex', s.sex); set('age', s.age); set('ageMonths', s.months || 0);
    set('weight', ''); set('height', ''); window.update(); // źródło siatki ustala się w update()
    set('weight', s.w); set('height', s.h);
    set('advMotherHeight', s.mo == null ? '' : s.mo); set('advFatherHeight', s.fa == null ? '' : s.fa);
    window.update();
    await new Promise((r) => { setTimeout(r, 500); });
    const m = window.patientReportBuildModel();
    return {
      proLeksykalny: typeof professionalMode !== 'undefined' ? professionalMode : null,
      hl: m.headline,
      podsumowanieMph: (m.summaryLines || []).filter((l) => /mpSDS|MPH/.test(String(l))),
      html: window.patientReportBuildHtml(m),
    };
  }, s);
}

const SZESCIOLATEK = { age: 6, months: 0, sex: 'M', w: 24, h: 129 };

test.describe('P-RAPORT rata T — wysoki wzrost a wzrost docelowy wg rodziców', () => {
  test('RT-1: chłopiec 1 rok, 11,8 kg / 83,0 cm, rodzice 176/191 — tytuł o masie, podtytuł „zgodny ze wzrostem rodziców” z zastrzeżeniem < 3 lat, bez liczby SDS', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { age: 1, months: 0, sex: 'M', w: 11.8, h: 83, mo: 176, fa: 191 });
    expect(r.proLeksykalny).toBe(true);
    expect(r.hl.badge).toBe('Wysoka masa ciała');
    expect(r.hl.title).toMatch(new RegExp(`^Masa ciała jest wysoka jak na wiek \\(11,8${NB}kg, 9\\d\\. centyl\\), ale w stosunku do wzrostu pozostaje prawidłowa\\.$`));
    expect(r.hl.subtext).toMatch(new RegExp(`^Wzrost jest zgodny ze wzrostem rodziców \\(wzrost docelowy wg rodziców 190,0${NB}cm, 9\\d\\. centyl dorosłych\\)\\. U dzieci poniżej 3 lat pozycja na siatce może się jeszcze zmieniać, dlatego najważniejsze jest tempo wzrastania w kolejnych pomiarach\\.$`));
    expect(r.hl.subtext + r.hl.text).not.toMatch(/Sam wysoki|SDS|rodzinn/);
    expect(r.hl.dodatkowe).toEqual([]);
    expect(r.podsumowanieMph.join(' ')).toMatch(/MPH: 190,0 cm/);
  });

  test('RT-2: chłopiec 6 lat, 129,0 cm, rodzice 158/168 (tryb profesjonalny) — W3 czerwone, wartości w tytule i zdaniu, różnica jak w linii podsumowania, bez drugiej osi', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...SZESCIOLATEK, mo: 158, fa: 168 });
    expect(r.hl.badge).toBe('Wysoki wzrost — do oceny'); expect(r.hl.tone).toBe('danger');
    expect(r.hl.title).toMatch(new RegExp(`^Wzrost jest wysoki jak na wiek: 129,0${NB}cm, 9[89]\\. centyl — wyraźnie wyższy, niż wynika ze wzrostu rodziców\\.$`));
    const m = r.hl.text.match(new RegExp(`^Wzrost docelowy wg rodziców to 169,5${NB}cm \\((\\d+)\\. centyl dorosłych\\); różnica wynosi (\\+\\d,\\d\\d)${NB}SDS\\. Taki wynik wymaga dalszej oceny, m\\.in\\. w kierunku przedwczesnego dojrzewania \\(tempo wzrastania, objawy dojrzewania, wiek kostny\\)\\.$`));
    expect(m, r.hl.text).not.toBeNull();
    expect(Number(m[2].replace(',', '.'))).toBeGreaterThanOrEqual(2);
    const linia = r.podsumowanieMph.find((l) => /hSDS - mpSDS/.test(l));
    expect(linia).toMatch(new RegExp(`hSDS - mpSDS: ${m[2].replace('+', '\\+')}$`)); // jedna liczba w nagłówku i podsumowaniu
    expect(r.hl.text).not.toMatch(/Plan ustalono|Dodatkowo wzrost/);
    expect(r.hl.dodatkowe).toEqual([]);
    expect(r.html).toContain('tone-danger');
  });

  test('RT-3: ten sam chłopiec w trybie standardowym — MPH nadal w nagłówku (siatka WHO), zdanie bez liczby SDS', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...SZESCIOLATEK, mo: 158, fa: 168, pro: false });
    expect(r.proLeksykalny).toBe(false);
    expect(r.hl.badge).toBe('Wysoki wzrost — do oceny'); expect(r.hl.tone).toBe('danger');
    expect(r.hl.text).toMatch(new RegExp(`^Wzrost docelowy wg rodziców to 169,5${NB}cm \\(\\d+\\. centyl dorosłych\\)\\. Taki wynik wymaga dalszej oceny, m\\.in\\. w kierunku przedwczesnego dojrzewania`));
    expect(r.hl.title + r.hl.text + r.hl.subtext).not.toMatch(/SDS/);
    expect(r.podsumowanieMph.join(' ')).not.toMatch(/hSDS - mpSDS/); // podsumowanie standardowe też bez liczby
  });

  test('RT-4: chłopiec 6 lat, rodzice 178/193 — W1 żółte, „zgodny ze wzrostem rodziców”', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...SZESCIOLATEK, mo: 178, fa: 193 });
    expect(r.hl.badge).toBe('Wysoki wzrost'); expect(r.hl.tone).toBe('warn');
    expect(r.hl.title).toMatch(new RegExp(`^Wzrost jest wysoki jak na wiek: 129,0${NB}cm, 9[89]\\. centyl\\.$`));
    expect(r.hl.text).toMatch(new RegExp(`^Wzrost jest zgodny ze wzrostem rodziców \\(wzrost docelowy wg rodziców 192,0${NB}cm, 9\\d\\. centyl dorosłych\\)\\. Najwięcej informacji daje tempo wzrastania w kolejnych pomiarach\\.$`));
    expect(r.hl.text).not.toMatch(/Sam wysoki|rodzinn|SDS/);
  });

  test('RT-5: chłopiec 6 lat, rodzice 167/181 — W2 pogranicze: „wyższy” bez „wyraźnie”, różnica 1,5–2,0', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...SZESCIOLATEK, mo: 167, fa: 181 });
    expect(r.hl.badge).toBe('Wysoki wzrost'); expect(r.hl.tone).toBe('warn');
    const m = r.hl.text.match(new RegExp(`^Wzrost jest wyższy, niż wynika ze wzrostu rodziców \\(wzrost docelowy wg rodziców 180,5${NB}cm, \\d+\\. centyl dorosłych; różnica \\+(\\d,\\d\\d)${NB}SDS\\)\\. Taki wynik ocenia się razem z tempem wzrastania w kolejnych pomiarach\\.$`));
    expect(m, r.hl.text).not.toBeNull();
    const d = Number(m[1].replace(',', '.'));
    expect(d).toBeGreaterThanOrEqual(1.5); expect(d).toBeLessThan(2);
    expect(r.hl.text).not.toMatch(/wyraźnie|nieco|Dodatkowo wzrost/);
  });

  test('RT-6: bez wzrostu rodziców — zdanie o tempie plus dopisek o rodzicach (rata R2: rodzice raz)', async ({ page }) => {
    await otworz(page);
    const r = await model(page, { ...SZESCIOLATEK });
    expect(r.hl.badge).toBe('Wysoki wzrost');
    expect(r.hl.text).toBe('Sam wysoki wzrost nie jest nieprawidłowością; ocenia się go razem z tempem wzrastania. Do pełniejszej oceny potrzebny jest wzrost obojga rodziców.');
  });

  test('RT-7: docpro.html — ta sama ścieżka (W3 u 6-latka z rodzicami 158/168)', async ({ page }) => {
    await otworz(page, 'docpro.html');
    const r = await model(page, { ...SZESCIOLATEK, mo: 158, fa: 168 });
    expect(r.hl.badge).toBe('Wysoki wzrost — do oceny'); expect(r.hl.tone).toBe('danger');
    expect(r.hl.text).toMatch(/przedwczesnego dojrzewania/);
    expect(r.hl.dodatkowe).toEqual([]);
  });
});

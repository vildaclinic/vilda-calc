import { expect, test } from '@playwright/test';

// OBESITY-EDIT-1 (zgłoszenie właściciela 2026-09-13): w zakładce „Monitorowanie leczenia" modułu
// „Leczenie otyłości" punktu nie dało się poprawić — tylko dodać albo usunąć. Test sprawdza
// WPIĘCIE na prawdziwym DocPro: ołówek wczytuje punkt do formularza, przyciski rodzaju wizyty
// zapisują zmiany zamiast dodawać duplikat, a identyfikator rekordu przeżywa edycję.
// Dane wyłącznie FIKCYJNE.

async function otworz(page) {
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.obesityAddTherapyPoint === 'function'
    && typeof window.obesitySaveTherapyPointEdit === 'function');
}

// Dwa punkty: włączenie i kontynuacja. Wpisujemy je tą samą drogą, co lekarz — przez formularz
// i przyciski rodzaju wizyty.
async function dwaPunkty(page) {
  return page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = String(v); };
    window.obesityTherapyMonitorSetPoints([]);
    set('obesityAge', 13); set('obesityAgeMonths', 0);
    set('obesityWeight', 92); set('obesityHeight', 165);
    set('obesityDose', '3,0 mg'); set('obesityDate', '2026-01-10');
    window.obesityAddTherapyPoint('start');
    set('obesityAge', 13); set('obesityAgeMonths', 3);
    set('obesityWeight', 88); set('obesityHeight', 166);
    set('obesityDose', '3,0 mg'); set('obesityDate', '2026-04-11');
    window.obesityAddTherapyPoint('continue');
    return (window.obesityTherapyPoints || []).map((p) => ({ id: String(p.id), type: p.type, weight: p.weight, bmi: p.bmi }));
  });
}

test('OBESITY-EDIT-1: ołówek poprawia punkt, a rekord zachowuje identyfikator', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const przed = await dwaPunkty(page);
  expect(przed.length).toBe(2);

  // W każdym wierszu tabeli stoi przycisk edycji — tego wcześniej nie było.
  const olowki = await page.evaluate(() => document.querySelectorAll('#obesityTherapyTbody .obm-edit').length);
  expect(olowki).toBe(2);

  const po = await page.evaluate((id) => {
    window.obesityEditTherapyPoint(id);
    const bar = document.getElementById('obesityEditBar');
    const paseklWidoczny = !!bar && bar.style.display !== 'none' && bar.textContent.includes('Edytujesz punkt');
    // Formularz ma wartości z edytowanego punktu…
    const val = (x) => document.getElementById(x).value;
    const wczytane = { masa: val('obesityWeight'), wzrost: val('obesityHeight'), data: val('obesityDate') };
    // …poprawiamy masę i zapisujemy tym samym przyciskiem, którym się punkt nadaje.
    document.getElementById('obesityWeight').value = '80';
    window.obesitySaveTherapyPointEdit('continue');
    return {
      paseklWidoczny,
      wczytane,
      punkty: (window.obesityTherapyPoints || []).map((p) => ({ id: String(p.id), type: p.type, weight: p.weight, bmi: p.bmi })),
      trybEdycji: window.obesityTherapyPointEditingId(),
    };
  }, przed[1].id);

  expect(po.paseklWidoczny).toBe(true);
  expect(po.wczytane).toEqual({ masa: '88', wzrost: '166', data: '2026-04-11' });
  // Nie przybył duplikat — punkty nadal dwa, z tymi samymi identyfikatorami.
  expect(po.punkty.length).toBe(2);
  expect(po.punkty.map((p) => p.id)).toEqual(przed.map((p) => p.id));
  // Masa poprawiona, a zapisane BMI przeliczone (80 kg / 1,66 m → ok. 29,0).
  const edytowany = po.punkty.find((p) => p.id === przed[1].id);
  expect(edytowany.weight).toBe(80);
  expect(edytowany.bmi).toBeCloseTo(29.0, 1);
  // Po zapisie tryb edycji się kończy.
  expect(po.trybEdycji).toBe('');
});

test('OBESITY-EDIT-1: drugie „Włączenie" jest odrzucane — punkt odniesienia zostaje jeden', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const przed = await dwaPunkty(page);

  const out = await page.evaluate((id) => {
    const komunikaty = [];
    const alert = window.alert;
    window.alert = (m) => { komunikaty.push(String(m)); };
    window.obesityEditTherapyPoint(id);
    const zapisano = window.obesitySaveTherapyPointEdit('start');
    window.alert = alert;
    return {
      zapisano,
      komunikaty,
      starty: (window.obesityTherapyPoints || []).filter((p) => p.type === 'start').length,
      trybEdycji: window.obesityTherapyPointEditingId(),
    };
  }, przed[1].id);

  expect(out.zapisano).toBe(false);
  expect(out.starty).toBe(1);
  expect(out.komunikaty.join(' ')).toContain('Włączenie');
  // Tryb edycji trwa dalej — lekarz poprawia wybór, nie zaczyna od zera.
  expect(out.trybEdycji).toBe(String(przed[1].id));
});

test('OBESITY-EDIT-1: zmiana punktu odniesienia pyta o potwierdzenie', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const przed = await dwaPunkty(page);

  const out = await page.evaluate((id) => {
    const pytania = [];
    const confirm = window.confirm;
    window.confirm = (m) => { pytania.push(String(m)); return false; };
    window.obesityEditTherapyPoint(id);
    document.getElementById('obesityWeight').value = '95';
    const zapisano = window.obesitySaveTherapyPointEdit('start');
    window.confirm = confirm;
    return { zapisano, pytania, masa: (window.obesityTherapyPoints || [])[0].weight };
  }, przed[0].id);

  expect(out.pytania.join(' ')).toMatch(/odniesieniem dla całej oceny leczenia/);
  // Odmowa w oknie potwierdzenia zostawia dane nietknięte.
  expect(out.zapisano).toBe(false);
  expect(out.masa).toBe(92);
});

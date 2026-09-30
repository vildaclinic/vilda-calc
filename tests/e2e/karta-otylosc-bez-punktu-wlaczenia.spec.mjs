import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-BEZ-STARTU (decyzje właściciela 2026-09-30). Karta „Leczenie otyłości” i panel „Dane analityczne —
// otyłość” w Karcie pacjenta brały przy braku punktu „Włączenie” pierwszy zapisany punkt kontrolny jako start: pole
// „Włączenie” podawało jego wiek, a werdykt wg ChPL liczył okno i redukcję od masy, która nie jest masą początkową —
// w obie strony (fałszywe „odstawić” i fałszywe „kontynuować”). Wznowiony kurs (po „Zakończeniu”) był oceniany od
// startu poprzedniego kursu. Teraz:
//   • ocenia się bieżący kurs (punkty po ostatnim „Zakończeniu”, po którym są jeszcze punkty);
//   • bez „Włączenia” w bieżącym kursie werdykt ChPL jest wstrzymany, liczby zostają podpisane „od 1. punktu”;
//   • monitor DocPro pokazuje miękką podpowiedź (jak monitor GH), liczby w tabeli bez zmian.
//
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#OtyloscBezStartu!26';
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'liraglutide', dose: '3,0 mg / dobę' };
const MYSIMBA = { drug: 'Mysimba (naltrekson/bupropion) – p.o.', substance: 'naltrexone-bupropion', dose: '2 tabl. 2×/dobę' };
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'semaglutide', dose: '2,4 mg / tydz.' };

async function otworzZKontem(page) {
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
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.ObesityResponseCriteria));
}

/** Pacjent z punktami leczenia otyłości: [typ, dataISO, masa] + wspólne pola leku, wieku i wzrostu. */
async function pacjent(page, { imie, wiek = 40, wzrost = 170, plec = 'M', lek, punkty }) {
  return page.evaluate(async (d) => {
    const h = d.wzrost / 100;
    const pts = d.punkty.map(([type, dateISO, weight], i) => ({
      id: `${type}-${dateISO}-${i}`, type, ageYears: d.wiek, ageMonths: 0, weight, height: d.wzrost,
      bmi: +(weight / (h * h)).toFixed(1), dose: d.lek.dose, dateISO, drug: d.lek.drug, substance: d.lek.substance,
    }));
    const ost = pts[pts.length - 1];
    const wynik = await window.VildaVault.savePatient({
      name: `Testowy ${d.imie}`,
      user: { lastName: 'Testowy', firstName: d.imie, sex: d.plec, age: d.wiek, ageMonths: 0, height: d.wzrost, weight: ost.weight },
      obesityTherapyPoints: pts,
    }, { dedup: false });
    return wynik.patientId;
  }, { imie, wiek, wzrost, plec, lek, punkty });
}

const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/** Otwiera Kartę, czyta kartę „Leczenie otyłości”, rozwija panel otyłości i oddaje jego treść oraz werdykt. */
async function karta(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  const podsumowanie = page.locator('.vilda-gh-summary', { hasText: 'Leczenie otyłości' }).first();
  await expect(podsumowanie).toBeVisible({ timeout: 15000 });
  const przycisk = page.locator('.vilda-gha-btn', { hasText: 'otyłość' });
  await przycisk.click();
  const panel = page.locator('.vilda-gha-panel', { has: page.locator('.vilda-oba-verdict') }).first();
  await expect(panel).toBeVisible();
  const werdykt = await panel.evaluate((el) => {
    const v = el.querySelector('.vilda-oba-verdict');
    return { klasa: v.className, tytul: (v.querySelector('.vilda-oba-vt') || {}).textContent || '', opis: (v.querySelector('.vilda-oba-vd') || {}).textContent || '' };
  });
  return { karta: norm(await podsumowanie.textContent()), panel: norm(await panel.textContent()), werdykt };
}

function bezWerdyktuChpl(w) {
  expect(w.werdykt.klasa, 'werdykt neutralny, nie zielony ani czerwony').toContain('wait');
  expect(w.werdykt.tytul).toContain('Brak punktu „Włączenie” — ocena wg ChPL niedostępna');
  // „odstawić” może paść w cytowanej regule ChPL, ale nie jako werdykt.
  for (const zakazane of ['odstawić', 'kontynuować']) expect(w.werdykt.tytul, `tytuł bez „${zakazane}”`).not.toContain(zakazane);
  for (const zakazane of ['Przed oknem oceny', 'Trwa zwiększanie dawki', 'Za mało danych', 'Osiągnięto']) {
    expect(w.werdykt.tytul + ' ' + w.werdykt.opis, `bez „${zakazane}”`).not.toContain(zakazane);
  }
  expect(w.werdykt.opis, 'mówi, od czego ChPL liczy odpowiedź').toContain('od początkowej masy ciała i od włączenia leczenia');
  expect(w.werdykt.opis, 'wskazuje, jak to naprawić — tylko z udokumentowaną masą i datą').toContain('tylko z udokumentowaną masą i datą');
  expect(w.panel, 'kafelek „Redukcja do oceny” nie udaje oceny wg ChPL').not.toContain('Redukcja do oceny');
  // Podpisy kafelków (tekst wyjaśnienia werdyktu może mówić o włączeniu — to opis zasady ChPL).
  for (const zakazane of ['% od włączenia', 'poprawa od włączenia', 'średnio od włączenia', 'od włączenia (z dat wizyt)', 'Czas leczenia', 'przy włączeniu']) {
    expect(w.panel, `kafelki bez „${zakazane}”`).not.toContain(zakazane);
  }
}

test.describe('P-OTYLOSC-BEZ-STARTU — Karta pacjenta', () => {
  test('OB-1: Saxenda, dorosły, same „Kontynuacje” (100 → 98 kg w 16 tyg.) — bez fałszywego „odstawić”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const pid = await pacjent(page, { imie: 'Sax-BezStartu', lek: SAXENDA, punkty: [['continue', '2026-01-05', 100], ['continue', '2026-04-27', 98]] });
    const w = await karta(page, pid);
    bezWerdyktuChpl(w);
    expect(w.werdykt.opis, 'reguła ChPL grupy jest pokazana').toContain('Saxenda dorośli');
    expect(w.karta).toContain('Włączeniebrak punktu');
    expect(w.karta).toContain('Brak punktu „Włączenie” (pierwszy zapisany punkt: w wieku 40 l. 0 mies.)');
    expect(w.karta).toContain('aktywne');
    expect(w.panel).toContain('Masa w 1. punkcie100 kg');
    expect(w.panel).toContain('Redukcja masy−2,0 kg−2,0% od 1. punktu');
    expect(w.panel).toContain('Czas od 1. punktu16 tyg.od 1. punktu (z dat wizyt)');
  });

  test('OB-1K (kontrola): te same dane z pierwszym punktem „Włączenie” — werdykt jak dotąd', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const pid = await pacjent(page, { imie: 'Sax-ZeStartem', lek: SAXENDA, punkty: [['start', '2026-01-05', 100], ['continue', '2026-04-27', 98]] });
    const w = await karta(page, pid);
    expect(w.werdykt.tytul).toContain('odstawić');
    expect(w.werdykt.klasa).toContain('bad');
    expect(w.werdykt.opis).toContain('nominalnego czasu zwiększania dawki');
    expect(w.karta).toContain('Włączeniew wieku 40 l. 0 mies. (05.01.2026)');
    expect(w.karta).not.toContain('Brak punktu');
    expect(w.panel).toContain('Masa przy włączeniu100 kg');
    expect(w.panel).toContain('Redukcja do oceny');
    expect(w.panel).not.toContain('1. punkt');
  });

  test('OB-2: Mysimba, dorosły, same „Kontynuacje” (104 → 98,5 kg w 17 tyg.) — bez fałszywego „kontynuować”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const pid = await pacjent(page, { imie: 'Mys-BezStartu', lek: MYSIMBA, punkty: [['continue', '2026-01-05', 104], ['continue', '2026-05-04', 98.5]] });
    const w = await karta(page, pid);
    bezWerdyktuChpl(w);
    expect(w.werdykt.opis).toContain('Mysimba dorośli');
  });

  test('OB-3: Wegovy, 15 lat, dwa punkty „Kontynuacja” 8 tyg. od siebie — bez „Trwa zwiększanie dawki”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const pid = await pacjent(page, { imie: 'Weg-15', wiek: 15, wzrost: 165, lek: WEGOVY, punkty: [['continue', '2026-01-05', 82], ['continue', '2026-03-02', 80]] });
    const w = await karta(page, pid);
    bezWerdyktuChpl(w);
    expect(w.panel, 'ΔBMI-SDS podpisane od 1. punktu').toMatch(/Odpowiedź \(ΔBMI-SDS\)[−+]?\d,\d{2}(poprawa|bez poprawy) od 1\. punktu/);
  });

  test('OB-4: jeden punkt „Kontynuacja” — podpowiedź mówi o braku „Włączenia”, werdykt wstrzymany', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const pid = await pacjent(page, { imie: 'Sax-Jeden', lek: SAXENDA, punkty: [['continue', '2026-01-05', 100]] });
    const w = await karta(page, pid);
    bezWerdyktuChpl(w);
    expect(w.panel).toContain('Jeden punkt terapii bez punktu „Włączenie”');
    expect(w.panel).toContain('Masa w 1. punkcie100 kg');
  });

  test('OB-5: Wegovy, dorosły (ocena kliniczna) bez „Włączenia” — „Obecnie” liczone od 1. zapisanego punktu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const pid = await pacjent(page, { imie: 'Weg-Dorosly', lek: WEGOVY, punkty: [['continue', '2026-01-05', 100], ['continue', '2026-05-04', 96]] });
    const w = await karta(page, pid);
    expect(w.werdykt.tytul).toContain('Ocena kliniczna');
    expect(w.werdykt.opis).toContain('Obecnie: −4,0% masy od 1. zapisanego punktu (brak punktu „Włączenie”).');
    expect(w.werdykt.opis).not.toContain('tyg.');
    expect(w.panel).not.toContain('Redukcja do oceny');
    expect(w.panel).not.toContain('% od włączenia');
  });

  test('KURS-1: wznowiony kurs bez własnego „Włączenia” — nie oceniany od startu poprzedniego kursu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const pid = await pacjent(page, {
      imie: 'Sax-Kurs2-BezStartu', lek: SAXENDA,
      punkty: [['start', '2025-01-06', 100], ['end', '2025-06-02', 90], ['continue', '2025-11-03', 108], ['continue', '2026-04-27', 101]],
    });
    const w = await karta(page, pid);
    bezWerdyktuChpl(w);
    expect(w.karta, 'leczenie trwa — nowy kurs po „Zakończeniu”').toContain('aktywne');
    expect(w.karta).not.toContain('leczenie zakończone');
    expect(w.karta).toContain('Włączeniebrak punktu');
    expect(w.karta).toContain('Bieżący kurs leczenia (po punkcie „Zakończenie”) nie ma punktu „Włączenie” (pierwszy zapisany punkt kursu: w wieku 40 l. 0 mies.)');
    expect(w.panel, 'redukcja od 1. punktu bieżącego kursu (108 kg), nie od 100 kg z 2025-01').toContain('Masa w 1. punkcie108 kg');
  });

  test('KURS-2: wznowiony kurs z własnym „Włączeniem” — oceniany od niego („kontynuować”), nie od startu kursu 1', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const pid = await pacjent(page, {
      imie: 'Sax-Kurs2-ZeStartem', lek: SAXENDA,
      punkty: [['start', '2025-01-06', 100], ['end', '2025-06-02', 90], ['start', '2025-11-03', 108], ['continue', '2026-04-27', 101]],
    });
    const w = await karta(page, pid);
    expect(w.werdykt.tytul, 'od 108 kg: −6,5% po 21 tyg. dawki podtrzymującej').toContain('kontynuować');
    expect(w.werdykt.klasa).toContain('good');
    expect(w.karta).toContain('Włączeniew wieku 40 l. 0 mies. (03.11.2025)');
    expect(w.karta).toContain('aktywne');
    expect(w.panel).toContain('Masa przy włączeniu108 kg');
  });
});

test.describe('P-OTYLOSC-BEZ-STARTU — monitor DocPro', () => {
  async function monitor(page, punkty) {
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.obesityTherapyMonitorSetPoints === 'function');
    return page.evaluate((pts) => {
      window.obesityTherapyMonitorSetPoints(pts.map(([type, dateISO, weight], i) => ({
        id: `m-${i}`, type, ageYears: 40, ageMonths: 0, weight, height: 170, bmi: +(weight / 2.89).toFixed(1),
        dose: '3,0 mg', dateISO, drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'liraglutide',
      })));
      const hint = document.getElementById('obesityTherapyStartHint');
      // P-OTYLOSC-CYKLE rata 2: tabela w blokach cykli, najnowszy na górze; nagłówki i redukcje każdego cyklu osobno.
      const cykle = [...document.querySelectorAll('#obesityTherapyTableWrap .obm-cycle')].map((b) => ({
        naglowki: [...b.querySelectorAll('th.obm-th-red')].map((th) => th.textContent),
        redukcje: [...b.querySelectorAll('tbody tr')].map((tr) => [...tr.children].slice(7, 9).map((td) => td.textContent)),
      }));
      return {
        widoczna: !!hint && getComputedStyle(hint).display !== 'none',
        tekst: hint ? hint.textContent : null,
        naglowki: cykle.length ? cykle[0].naglowki : [],
        redukcje: cykle.length ? cykle[0].redukcje : [],
        cykle,
      };
    }, punkty);
  }

  test('MON-1: bez „Włączenia” — podpowiedź i nagłówki „od 1. punktu”, liczby jak dotąd', async ({ page }) => {
    const m = await monitor(page, [['continue', '2026-01-05', 100], ['continue', '2026-04-27', 98]]);
    expect(m.widoczna).toBe(true);
    expect(m.tekst).toContain('Brak punktu „Włączenie”. Redukcja w tabeli liczy się od pierwszego zapisanego punktu');
    expect(m.naglowki).toEqual(['Redukcja masy (od 1. punktu)', 'Redukcja BMI (od 1. punktu)']);
    expect(m.redukcje).toEqual([['—', '—'], ['−2,0%', '−2,0%']]);
  });

  test('MON-2: z „Włączeniem” — bez podpowiedzi, nagłówki bez zmian', async ({ page }) => {
    const m = await monitor(page, [['start', '2026-01-05', 100], ['continue', '2026-04-27', 98]]);
    expect(m.widoczna).toBe(false);
    expect(m.naglowki).toEqual(['Redukcja masy', 'Redukcja BMI']);
    expect(m.redukcje).toEqual([['—', '—'], ['−2,0%', '−2,0%']]);
  });

  test('MON-3: wznowiony kurs bez własnego „Włączenia” — podpowiedź o bieżącym kursie', async ({ page }) => {
    const m = await monitor(page, [['start', '2025-01-06', 100], ['end', '2025-06-02', 90], ['continue', '2025-11-03', 108], ['continue', '2026-04-27', 101]]);
    expect(m.widoczna).toBe(true);
    expect(m.tekst).toContain('Bieżący kurs leczenia (po punkcie „Zakończenie”) nie ma punktu „Włączenie”');
    // P-OTYLOSC-CYKLE rata 2: bieżący cykl bez „Włączenia” liczy redukcję od SWOJEGO 1. punktu (108 kg), z podpisem;
    // dotąd liczył od startu poprzedniego kursu (100 kg: +8,0% i +1,0%). Cykl 1 — od swojego Włączenia.
    expect(m.naglowki).toEqual(['Redukcja masy (od 1. punktu)', 'Redukcja BMI (od 1. punktu)']);
    expect(m.redukcje).toEqual([['—', '—'], ['−6,5%', '−6,5%']]);
    expect(m.cykle[1].naglowki).toEqual(['Redukcja masy', 'Redukcja BMI']);
    expect(m.cykle[1].redukcje).toEqual([['—', '—'], ['−10,0%', '−10,0%']]);
  });
});

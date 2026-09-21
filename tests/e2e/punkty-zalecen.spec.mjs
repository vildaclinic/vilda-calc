import { expect, test } from '@playwright/test';

// P-RAPORT-PUNKTY — silnik oddaje TE SAME zalecenia rozpisane na punkty (`dane.punkty`)
// obok pelnych zdan (`dane.zdania`).
//
// Po co: zatwierdzona makieta raportu jednostronicowego ma w trzech dolnych kolumnach krotkie
// hasla, a generator mowi pelnymi zdaniami klinicznymi. Alternatywa — ciecie zdania w widoku po
// przecinkach — byloby samowolka warstwy prezentacji nad trescia kliniczna. Dlatego rozpisanie
// stoi w silniku, w zamknietej tablicy VILDA_PUNKTY, i podlega tym testom.
//
// Reguly, ktorych te testy pilnuja:
//  1. punkt nie wnosi ZADNEJ liczby, ktorej nie ma w zdaniu tej samej roli u tego samego pacjenta;
//  2. punkt nie wnosi ZADNEGO nowego slowa znaczacego (poza lista slow ramujacych nizej);
//  3. rozpisanie jest osobne dla kazdego rejestru — zdanie „Dla pacjenta" i zdanie zawodowe
//     roznia sie trescia (np. „3–5 posilkow dziennie" pada TYLKO w rejestrze pacjenta);
//  4. rola bez rozpisania pokazuje CALE zdanie, nigdy jego urwany kawalek;
//  5. tekstowy raport pozostaje nietkniety — punkty nie trafiaja do textOutput ani htmlOutput.
//
// Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true;
    window.__vildaPlanPalTouched = false;
    window.__vildaDietStrategyTouched = false;
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    window.ensureDietRecommendationsElements();
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    flag('patientFacingToggle', !!s.pf);
    if (s.click) { const bt = document.querySelector(`[data-diet-strategy-choice="${s.click}"]`); if (bt) bt.click(); }
    window.update();
    await new Promise((res) => { setTimeout(res, 140); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    const d = r.dane || {};
    return { text: r.textOutput || '', html: r.htmlOutput || '', zdania: d.zdania || {}, punkty: d.punkty || {} };
  }, s);
}

const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\u2011/g, '-').replace(/\s+/g, ' ').trim();
const zloz = (s) => norm(s).toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => 'acelnoszz'['ąćęłńóśźż'.indexOf(c)]);
const LICZBY = /\d+(?:[.,]\d+)?/g;
const SLOWA = /[0-9a-z-]+/g;

// Slowa RAMUJACE — nie sa faktem, tylko kierunkiem, ktory zdanie juz wyraza czasownikiem
// („nalezy ograniczyc" → „mniej:", „zwiekszyc udzial" → „wiecej"). Lista jest zamknieta i krotka
// celowo: kazde jej rozszerzenie to furtka na dopisanie tresci, wiec wymaga osobnej decyzji.
const RAMA = new Set(['wiecej', 'mniej', 'zamiast', 'codziennie', 'notowanie', 'obserwacja']);

/** Regula 1 i 2: punkt nie wnosi nowej liczby ani nowego slowa znaczacego. */
function punktyWiernieCytuja(w, opis) {
  Object.keys(w.punkty).forEach((rola) => {
    const zdanie = norm((w.zdania[rola] || []).join(' '));
    const liczby = new Set(zdanie.match(LICZBY) || []);
    const rdzenie = new Set((zloz(zdanie).match(SLOWA) || []).map((x) => x.slice(0, 4)));
    w.punkty[rola].forEach((p) => {
      (norm(p).match(LICZBY) || []).forEach((n) => {
        expect(liczby, `${opis} / ${rola}: liczba „${n}” z punktu nie wystepuje w zdaniu`).toContain(n);
      });
      (zloz(p).match(SLOWA) || []).filter((x) => x.length >= 5 && !RAMA.has(x)).forEach((x) => {
        expect(rdzenie, `${opis} / ${rola}: slowo „${x}” z punktu nie wystepuje w zdaniu`).toContain(x.slice(0, 4));
      });
    });
  });
}

test('punkty cytuja zdania: dorosli i dzieci, oba rejestry', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const przypadki = [
    ['dorosly z otyloscia', { age: 42, sex: 'M', w: 108, h: 178 }],
    ['dorosly z otyloscia, rejestr pacjenta', { age: 42, sex: 'M', w: 108, h: 178, pf: true }],
    ['dorosla z nadwaga', { age: 35, sex: 'F', w: 78, h: 165 }],
    ['dorosla z niedowaga', { age: 28, sex: 'F', w: 44, h: 168 }],
    ['dorosla z niedowaga, rejestr pacjenta', { age: 28, sex: 'F', w: 44, h: 168, pf: true }],
    ['dorosla z niedowaga i planem przyrostu (rata D)', { age: 28, sex: 'F', w: 50, h: 168 }],
    ['dorosla z niedowaga i planem przyrostu, rejestr pacjenta', { age: 28, sex: 'F', w: 50, h: 168, pf: true }],
    ['8-latka z niedowaga (rata D)', { age: 8, sex: 'F', w: 21.7, h: 128 }],
    ['8-latka z niedowaga, rejestr pacjenta', { age: 8, sex: 'F', w: 21.7, h: 128, pf: true }],
    ['12-latka z niedowaga', { age: 12, sex: 'F', w: 32.4, h: 150 }],
    ['12-latka z niedowaga, rejestr pacjenta', { age: 12, sex: 'F', w: 32.4, h: 150, pf: true }],
    ['18-latek z niedowaga, rejestr pacjenta', { age: 18, sex: 'M', w: 56.4, h: 178, pf: true }],
    ['nastolatka 14 lat', { age: 14, months: 6, sex: 'F', w: 75, h: 150 }],
    ['nastolatka 14 lat, rejestr pacjenta', { age: 14, months: 6, sex: 'F', w: 75, h: 150, pf: true }],
    ['3-latka', { age: 3, sex: 'F', w: 22, h: 100 }],
    ['3-latka, rejestr pacjenta', { age: 3, sex: 'F', w: 22, h: 100, pf: true }],
    ['3-latka w normie (rata E)', { age: 3, sex: 'F', w: 15.5, h: 100 }],
    ['3-latka w normie, rejestr pacjenta', { age: 3, sex: 'F', w: 15.5, h: 100, pf: true }],
    ['3-latka z niedowaga (rata E)', { age: 3, sex: 'F', w: 12, h: 100 }],
    ['3-latka z niedowaga, rejestr pacjenta', { age: 3, sex: 'F', w: 12, h: 100, pf: true }],
    ['2-latek w normie', { age: 2, sex: 'M', w: 12.5, h: 88 }],
    ['16-latek z nadwaga', { age: 16, sex: 'M', w: 82, h: 176 }],
    ['11-latek z otyloscia', { age: 11, sex: 'M', w: 70, h: 150 }],
    ['8-latka, jawna redukcja', { age: 8, sex: 'F', w: 40, h: 130, click: 'reduction' }]
  ];
  for (const [opis, s] of przypadki) {
    const w = await policz(page, s);
    expect(Object.keys(w.punkty).length, opis + ': brak punktow').toBeGreaterThan(0);
    // ten sam zestaw rol co zdania — raport nie dostaje kolumny, ktorej nie ma w tekscie
    expect(Object.keys(w.punkty).sort(), opis + ': role punktow rozjechaly sie ze zdaniami')
      .toEqual(Object.keys(w.zdania).sort());
    punktyWiernieCytuja(w, opis);
    // regula 5: raport tekstowy jest nietkniety. Punkt jest albo DOSLOWNYM urywkiem zdania
    // (wtedy oczywiscie jest w tekscie — tak wyglada wierne cytowanie), albo przeredagowaniem
    // („mniej: …" zamiast „nalezy ograniczyc …") — i wtedy w tekscie wystapic NIE MOZE.
    Object.keys(w.punkty).forEach((rola) => w.punkty[rola].forEach((p) => {
      const zdanie = norm((w.zdania[rola] || []).join(' '));
      if (!zdanie.includes(norm(p))) {
        expect(norm(w.text), opis + ': przeredagowany punkt trafil do tekstu zalecen').not.toContain(norm(p));
      }
    }));
    // i struktura wyjscia sie nie zmienila: klasyczny raport to nadal numerowana lista zdan,
    // bez listy wypunktowanej i bez dodatkowych pozycji
    expect(w.html, opis + ': lista wypunktowana w raporcie klasycznym').not.toContain('<ul');
    expect((w.html.match(/<li>/g) || []).length, opis + ': liczba pozycji raportu sie zmienila')
      .toBe((w.text.match(/^\s*\d+\. /gm) || []).length);
  }
});

test('rozpisanie jest osobne dla kazdego rejestru', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const pro = await policz(page, { age: 42, sex: 'M', w: 108, h: 178 });
  const pac = await policz(page, { age: 42, sex: 'M', w: 108, h: 178, pf: true });

  // TO JEST POWOD, DLA KTOREGO KAZDY KLUCZ MA DWIE LISTY: zdanie zawodowe nie mowi
  // o liczbie posilkow, zdanie „Dla pacjenta" mowi. Jedna wspolna lista dopisalaby
  // lekarzowi fakt, ktorego jego wlasny raport nie zawiera.
  expect(norm(pro.zdania.talerz[0])).not.toContain('3–5');
  expect(norm(pac.zdania.talerz[0])).toContain('3–5 regularnych posiłków dziennie');
  expect(pro.punkty.talerz.some((p) => norm(p).includes('3–5'))).toBe(false);
  expect(pac.punkty.talerz.some((p) => norm(p).includes('3–5 regularnych posiłków dziennie'))).toBe(true);

  punktyWiernieCytuja(pro, 'rejestr zawodowy');
  punktyWiernieCytuja(pac, 'rejestr pacjenta');
});

test('pasma wieku: punkty ruchu ida za zdaniem, nie za sztywna lista', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const male = await policz(page, { age: 3, sex: 'F', w: 22, h: 100 });
  const nasto = await policz(page, { age: 14, months: 6, sex: 'F', w: 75, h: 150 });

  const rMale = male.punkty.ruch.map(norm).join(' | ');
  const rNasto = nasto.punkty.ruch.map(norm).join(' | ');
  expect(rMale).toContain('180 minut');
  expect(rMale).toContain('rozłożonej w ciągu dnia');
  expect(rMale).toContain('maksymalne ograniczenie czasu przed ekranem');
  expect(rNasto).toContain('60 minut');
  expect(rNasto).not.toContain('180 minut');
  expect(rMale).not.toBe(rNasto);
});

test('rola bez rozpisania pokazuje cale zdanie, a nie jego kawalek', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  // zdania krotkie i jednoclonowe nie maja rozpisania: punktem jest samo zdanie
  const niedowaga = await policz(page, { age: 28, sex: 'F', w: 44, h: 168 });
  // pierwsze zdanie kontroli nie ma rozpisania → jest punktem w całości; drugie (rata D) ma rozpisanie
  expect(niedowaga.punkty.kontrola[0]).toBe(niedowaga.zdania.kontrola[0]);
  expect(norm(niedowaga.punkty.kontrola[0])).toContain('Niedowaga wymaga oceny przyczyn klinicznych');
  expect(niedowaga.zdania.kontrola.length).toBe(2);
  expect(niedowaga.punkty.kontrola.length).toBe(3);

  const dziecko = await policz(page, { age: 3, sex: 'F', w: 22, h: 100 });
  expect(dziecko.punkty.kontrola).toEqual(dziecko.zdania.kontrola);

  // a rola z rozpisaniem ma punkty KROTSZE od zdania — inaczej rozpisanie niczego nie daje
  dziecko.punkty.ruch.forEach((p) => {
    expect(norm(p).length, 'punkt nie jest krotszy od zdania').toBeLessThan(norm(dziecko.zdania.ruch[0]).length);
  });
});

test('kontrola ujemna: brak zalecen to brak punktow, i punkty nie przeciekaja miedzy pacjentami', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const zPunktami = await policz(page, { age: 42, sex: 'M', w: 108, h: 178 });
  expect(Object.keys(zPunktami.punkty).sort()).toEqual(['kontrola', 'ruch', 'talerz']);

  // P-DIETA-UTRZYMANIE rata B: dorosly w normie ma WLASNE punkty talerza i ruchu, ale nie ma kontroli;
  // punkty talerza roznia sie od punktow otylosci — przeciek zbiornika pokazalby liste otylosci.
  const wNormie = await policz(page, { age: 30, sex: 'M', w: 72, h: 180 });
  expect(Object.keys(wNormie.punkty).sort()).toEqual(['ruch', 'talerz']);
  expect(wNormie.punkty.kontrola).toBeUndefined();
  expect(wNormie.punkty.talerz).not.toEqual(zPunktami.punkty.talerz);

  const znowu = await policz(page, { age: 42, sex: 'M', w: 108, h: 178 });
  expect(znowu.punkty).toEqual(zPunktami.punkty);
});

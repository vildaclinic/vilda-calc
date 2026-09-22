import { expect, test } from '@playwright/test';

// P-SZCZEBLE na PRAWDZIWEJ stronie: szczeble pośrednie w karcie „Droga do normy BMI".
//
// Testy jednostkowe pilnują silnika i dwóch funkcji karty. Ten test pilnuje tego, co lekarz
// naprawdę zobaczy po wpisaniu pomiaru — łącznie z tym, że dziecko z BMI w normie NIE
// dostaje podpowiedzi schudnięcia. Dane wyłącznie FIKCYJNE.

async function policz(page, d) {
  return page.evaluate((x) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    set('age', x.age); set('ageMonths', x.months || 0); set('sex', x.sex);
    set('weight', x.weight); set('height', x.height);
    window.update();
    const host = document.getElementById('bmiJourneyMount');
    const box = host ? host.querySelector('.bmi-journey-goalbox') : null;
    return {
      jest: !!box,
      // UWAGA: normalizacja zwija też wąską spację nierozdzielającą (U+202F), której
      // karta używa między liczbą a jednostką — w oczekiwaniach piszemy zwykłą spację.
      tekst: box ? box.textContent.replace(/\s+/g, ' ').trim() : '',
      ile: box ? box.querySelectorAll('.bmi-journey-g4').length : 0,
    };
  }, d);
}

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && !!window.VildaBmi
    && typeof window.VildaBmi.drabinkaCelow === 'function');
}

test.describe('P-SZCZEBLE — Droga do normy BMI', () => {
  test('SZCZEBLE-1: dorosły z otyłością III stopnia dostaje BMI 35 przed BMI 30', async ({ page }) => {
    test.setTimeout(90_000);
    await otworz(page);
    const r = await policz(page, { age: 47, sex: 'M', weight: 112.4, height: 167 });

    expect(r.jest).toBe(true);
    expect(r.tekst, 'cel bez zmian').toContain('−43,0');
    expect(r.ile, 'dwa szczeble').toBe(2);
    expect(r.tekst).toContain('Po drodze: −14,8 kg → BMI 35 — wyjście z otyłości III stopnia'); // rata R (K1): etykieta wg stanu wyjsciowego
    expect(r.tekst).toContain('Po drodze: −28,7 kg → BMI 30 — koniec otyłości');
    expect(r.tekst.indexOf('BMI 35'), 'bliższy szczebel pierwszy')
      .toBeLessThan(r.tekst.indexOf('BMI 30'));
  });

  test('SZCZEBLE-2: dziecko z otyłością dostaje próg Reinehra ze źródłem', async ({ page }) => {
    test.setTimeout(90_000);
    await otworz(page);
    const r = await policz(page, { age: 12, sex: 'M', weight: 75, height: 150 });

    expect(r.jest).toBe(true);
    expect(r.ile).toBe(2);
    expect(r.tekst, 'próg poprawy bliżej niż granica otyłości').toContain('−7,8 kg');
    expect(r.tekst).toContain('BMI-SDS');
    expect(r.tekst).toContain('próg poprawy');
    expect(r.tekst, 'jedyny nowy próg w aplikacji ma podane źródło').toContain('Reinehr 2016');
    expect(r.tekst).toContain('97. centyl — koniec otyłości');
  });

  test('SZCZEBLE-3: przy otyłości olbrzymiej pierwszy jest wyjście z niej', async ({ page }) => {
    test.setTimeout(90_000);
    await otworz(page);
    const r = await policz(page, { age: 14, sex: 'M', weight: 120, height: 165 });

    expect(r.ile).toBe(2);
    expect(r.tekst).toContain('SDS 3 — wyjście z otyłości olbrzymiej');
    expect(r.tekst.indexOf('SDS 3'), 'najbliższy szczebel na początku')
      .toBeLessThan(r.tekst.indexOf('BMI-SDS'));
  });

  test('SZCZEBLE-4: kontrola negatywna — dziecko z BMI w normie bez podpowiedzi chudnięcia', async ({ page }) => {
    test.setTimeout(90_000);
    await otworz(page);
    // Pierwsza wersja filtrowała szczeble tylko po „poniżej dzisiejszej masy", więc
    // zdrowe dziecko dostawało próg Reinehra, czyli sugestię schudnięcia kilograma.
    const r = await policz(page, { age: 10, sex: 'M', weight: 32, height: 140 });
    expect(r.ile).toBe(0);
    expect(r.tekst).not.toContain('Po drodze');

    const drab = await page.evaluate(() => window.VildaBmi.drabinkaCelow({
      wzrostCm: 140, masaKg: 32, wiekMies: 120, plec: 'M', zrodlo: 'OLAF' }));
    expect(drab.kierunek).toBe('w-normie');
    expect(drab.szczeble).toEqual([]);
  });

  test('SZCZEBLE-5: na wąskim ekranie wiersze się zawijają, bez poziomego przewijania', async ({ page }) => {
    test.setTimeout(90_000);
    await otworz(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const r = await policz(page, { age: 14, sex: 'M', weight: 120, height: 165 });
    expect(r.ile).toBe(2);
    const przewija = await page.evaluate(() => {
      const d = document.documentElement;
      return d.scrollWidth - d.clientWidth;
    });
    expect(przewija, 'brak poziomego przewijania').toBeLessThanOrEqual(1);
  });
});

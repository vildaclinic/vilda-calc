import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-CICHY-ZAPIS (zgłoszenie właściciela 2026-09-14) — nieudany zapis nie mówił nic.
//
// ZNALEZISKO. Wszystkie 11 komunikatów tego modułu — od „Uzupełnij: wiek, wagę i wzrost"
// po „Nie udało się zapisać pacjenta" — wisiało na `f("saveDataBtn")` albo `f("loadDataBtn")`.
// OBU tych przycisków dawno nie ma w HTML: opcje zapisu i wczytywania przeniesiono do menu
// (index.html mówi to wprost w komentarzu). `showTooltip(el, tekst)` zaczyna się od
// `if(!el||!tekst) return;`, więc przy pustej kotwicy MILCZY — a `O()` i tak meldowało sukces
// (`return o(e,t),!0`), więc awaryjny `alert` nigdy nie miał szansy się odezwać.
//
// Zmierzone w przeglądarce PRZED poprawką, formularz bez wieku i wagi:
//   saveUserData() → null · `.menu-tooltip` → 0 sztuk · alert → brak
// Czyli: lekarz klika „Zapisz dane", nic się nie dzieje i nic mu o tym nie mówi.
//
// Zmierzone PO poprawce, trzy różne braki pod rząd:
//   „Nie zapisano — uzupełnij: wiek i masę ciała."   kursor → #age
//   „Nie zapisano — uzupełnij: masę ciała."          kursor → #weight
//   „Nie zapisano — uzupełnij: imię i nazwisko."     kursor → #lastName
//
// Funkcje są WYCINANE Z PLIKU PRODUKCYJNEGO i uruchamiane wprost. Dane wyłącznie FIKCYJNE.

const src = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');
const app = fs.readFileSync(path.join(korzen, 'app.js'), 'utf8');

function wytnij(zrodlo, nazwa) {
  const i = zrodlo.indexOf(`function ${nazwa}(`);
  if (i < 0) return null;
  let d = 0;
  for (let k = zrodlo.indexOf('{', i); k < zrodlo.length; k += 1) {
    if (zrodlo[k] === '{') d += 1;
    else if (zrodlo[k] === '}') {
      d -= 1;
      if (d === 0) return zrodlo.slice(i, k + 1);
    }
  }
  return null;
}

function funkcje(nazwy) {
  return nazwy.map((n) => {
    const c = wytnij(src, n);
    expect(c, `vilda_data_import_export.js ma ${n}()`).toBeTruthy();
    return c;
  }).join('\n');
}

/* `f(id)` to wyszukiwarka elementów modułu — w teście podstawiamy własną mapę. */
function silnik(elementy = {}) {
  const kod = `
    function N(x) { const v = typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.')); return Number.isFinite(v) ? v : null; }
    function f(id) { return elementy[id] || null; }
    function l() { /* w teście nie logujemy */ }
    ${funkcje(['_e', 'ut', 'Bwidok', 'Bkotw', 'Bbraki', 'Bkomunikat'])}
    return { Bwidok, Bkotw, Bbraki, Bkomunikat };
  `;
  return new Function('elementy', kod)(elementy);
}

const KOMPLET = { name: 'Fikcyjny Testowy', user: { age: 8, weight: 26, height: 130 } };

describe('Komunikat nazywa dokładnie to, czego brakuje', () => {
  // Silnik budujemy W KAŻDYM teście, nie w ciele describe: przy wersji sprzed poprawki
  // wycinanie nie znajduje pomocników i zbiórka testów padłaby w całości („no tests"),
  // zamiast pokazać, który warunek nie jest spełniony.
  const Bbraki = (dane) => silnik().Bbraki(dane);
  const tekst = (dane) => { const s = silnik(); return s.Bkomunikat(s.Bbraki(dane)); };

  it('komplet danych → brak komunikatu', () => {
    expect(Bbraki(KOMPLET)).toEqual([]);
    expect(tekst(KOMPLET)).toBe('');
  });

  it('jeden brak wymienia tylko ten jeden', () => {
    expect(tekst({ ...KOMPLET, user: { age: 8, weight: null, height: 130 } }))
      .toBe('Nie zapisano — uzupełnij: masę ciała.');
  });

  it('dwa braki łączy spójnikiem, nie przecinkiem', () => {
    expect(tekst({ ...KOMPLET, user: { age: null, weight: null, height: 130 } }))
      .toBe('Nie zapisano — uzupełnij: wiek i masę ciała.');
  });

  it('trzy braki: przecinek i spójnik przed ostatnim', () => {
    expect(tekst({ ...KOMPLET, user: { age: null, weight: null, height: null } }))
      .toBe('Nie zapisano — uzupełnij: wiek, masę ciała i wzrost.');
  });

  it('brak nazwiska jest osobnym brakiem, nie pomijanym', () => {
    expect(tekst({ name: '   ', user: { age: 8, weight: 26, height: 130 } }))
      .toBe('Nie zapisano — uzupełnij: imię i nazwisko.');
  });

  it('kolejność braków idzie za kolejnością pól w formularzu', () => {
    const b = Bbraki({ name: '', user: {} });
    expect(b.map((x) => x.id)).toEqual(['age', 'weight', 'height', 'name']);
  });

  it('wiek zero jest poprawny, masa i wzrost zero już nie', () => {
    expect(Bbraki({ ...KOMPLET, user: { age: 0, weight: 26, height: 130 } })).toEqual([]);
    expect(Bbraki({ ...KOMPLET, user: { age: 8, weight: 0, height: 130 } }).map((x) => x.id)).toEqual(['weight']);
    expect(Bbraki({ ...KOMPLET, user: { age: 8, weight: 26, height: 0 } }).map((x) => x.id)).toEqual(['height']);
  });

  it('brak sekcji user nie wywraca sprawdzenia', () => {
    expect(Bbraki({ name: 'Fikcyjny Testowy' }).map((x) => x.id)).toEqual(['age', 'weight', 'height']);
    expect(Bbraki(null).length).toBe(4);
  });
});

describe('Kotwica komunikatu: tylko element, który istnieje i jest widoczny', () => {
  const widoczny = () => ({ offsetParent: {}, getBoundingClientRect: () => ({ width: 80, height: 24 }) });
  const ukryty = () => ({ offsetParent: null, getBoundingClientRect: () => ({ width: 0, height: 0 }) });

  it('nieistniejący przycisk zapisu nie jest kotwicą', () => {
    const e = { clearAllDataBtn: widoczny() };
    expect(silnik(e).Bkotw()).toBe(e.clearAllDataBtn);
  });

  it('ukryty przycisk w zwiniętym menu jest pomijany', () => {
    const e = { saveDataBtnSidebar: ukryty(), clearAllDataBtn: widoczny() };
    expect(silnik(e).Bkotw()).toBe(e.clearAllDataBtn);
  });

  it('widoczny przycisk zapisu ma pierwszeństwo', () => {
    const e = { saveDataBtnSidebar: widoczny(), clearAllDataBtn: widoczny() };
    expect(silnik(e).Bkotw()).toBe(e.saveDataBtnSidebar);
  });

  it('gdy nie ma żadnej kotwicy, zwracamy null — wtedy komunikat idzie alertem', () => {
    expect(silnik({}).Bkotw()).toBeNull();
  });

  it('element bez offsetParent, ale o niezerowych wymiarach, liczy się jako widoczny', () => {
    const { Bwidok } = silnik();
    expect(Bwidok({ offsetParent: null, getBoundingClientRect: () => ({ width: 10, height: 0 }) })).toBe(true);
    expect(Bwidok(null)).toBe(false);
    expect(Bwidok({ offsetParent: null, getBoundingClientRect: () => { throw new Error('odmowa'); } })).toBe(false);
  });
});

describe('Okablowanie', () => {
  it('O() szuka kotwicy zastępczej, zanim odda się tooltipowi', () => {
    expect(src).toContain('Bk=Bwidok(e)?e:Bkotw()');
    expect(src).toContain('if(o&&Bk)');
  });

  it('zablokowany zapis nazywa braki i wskazuje pierwsze pole', () => {
    // P-PASEK-STATUSU (2026-09-14): to samo wywołanie niesie teraz ton i LISTĘ braków —
    // pasek robi z nich odnośniki do pól. Reszta twierdzenia bez zmian: zapis się nie
    // odbywa (`null`), komunikat nazywa braki, a kursor ląduje na pierwszym z nich.
    expect(src).toContain('const Bb=Bbraki(a);if(Bb.length)return O(o,Bkomunikat(Bb),t,');
    expect(src).toContain('{ton:"blad",pola:Bb}),Bwskaz(Bb),null;');
  });

  it('timer wygaszania dymka rusza wyłącznie swój własny dymek', () => {
    // Przedtem licznik starego dymka gasił NOWSZY, bo działał na zmiennej globalnej.
    expect(app).toContain('__menuTooltip===n&&(n.style.opacity="0"');
    expect(app).toContain('__menuTooltip===n&&(n.remove(),__menuTooltip=null)');
  });
});

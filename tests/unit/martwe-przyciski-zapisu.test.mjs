import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-MARTWE-PRZYCISKI (przegląd i sprzątanie po P-CICHY-ZAPIS, 2026-09-14) — spis kontrolny
// identyfikatorów przycisków, których nie ma w żadnej stronie.
//
// TŁO. Przy naprawie cichego zapisu wyszło, że `vilda_data_import_export.js` wieszał wszystkie
// swoje komunikaty na `saveDataBtn` i `loadDataBtn` — a tych przycisków dawno nie ma: opcje
// zapisu i wczytywania przeniesiono do menu, gdzie `vilda_chrome.js` tworzy w runtime tylko
// `saveDataBtnSidebar`, `patientsListBtnSidebar` i `addVisitNoteBtnSidebar`.
//
// Przegląd wykazał, że żaden inny moduł przez to nie milczał; sprzątanie usunęło same martwe
// odwołania, bez zmiany zachowania. Ten test utrwala wynik: jeżeli martwy identyfikator wróci
// do kodu albo zniknie któreś z zabezpieczeń, test się odezwie.
//
// MARTWE SĄ TRZY: `saveDataBtn`, `loadDataBtn` oraz `loadDataBtnSidebar` (ten ostatni umknął
// pierwszej wersji spisu — menu nigdy takiej pozycji nie tworzyło).

const MARTWE = ['saveDataBtn', 'loadDataBtn', 'loadDataBtnSidebar'];
const ZYWY = 'saveDataBtnSidebar';

const html = fs.readdirSync(korzen).filter((f) => f.endsWith('.html'));
const js = fs.readdirSync(korzen).filter((f) => f.endsWith('.js'));

const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

/* Liczymy ODCZYTY Z DOM, nie wzmianki: komentarz opisujący historię błędu nie jest
   odwołaniem do martwego przycisku i nie ma go czym zastąpić. */
function odczyty(tekst, id) {
  const bezKomentarzy = tekst
    .split('\n')
    .filter((w) => !/^\s*\/\//.test(w) && !/^\s*\/\*/.test(w) && !/\*\/\s*$/.test(w))
    .join('\n');
  return (bezKomentarzy.match(new RegExp(`(?:f|getElementById)\\("${id}"\\)`, 'g')) || []).length;
}

// Jedyny moduł, któremu wolno jeszcze sięgać po martwe identyfikatory — wraz z powodem.
const DOZWOLONE = {
  'vilda_data_import_export.js': {
    saveDataBtn: 1,
    loadDataBtn: 7,
    loadDataBtnSidebar: 2,
    powod: 'obsługa przycisków importu/eksportu przeniesionych do menu: same wywołania są '
      + 'bezpiecznymi no-opami (`el && …`), a ich usunięcie byłoby decyzją o rezygnacji z tej '
      + 'obsługi, nie sprzątaniem — gdyby przyciski wróciły, to jest kod, który je obsłuży',
  },
};

describe('Martwe identyfikatory przycisków zapisu i wczytywania', () => {
  it('żadna strona nie ma ich w markupie', () => {
    const zPrzyciskiem = html.filter((f) => {
      const s = zrodlo(f);
      return MARTWE.some((id) => s.includes(`id="${id}"`));
    });
    expect(zPrzyciskiem).toEqual([]);
  });

  it('menu tworzy żywy zamiennik, na którym da się zawiesić komunikat', () => {
    expect(zrodlo('vilda_chrome.js')).toContain(`id:"${ZYWY}"`);
  });

  it('menu nie tworzy pozycji wczytywania — dlatego loadDataBtnSidebar też jest martwy', () => {
    expect(zrodlo('vilda_chrome.js')).not.toContain('id:"loadDataBtnSidebar"');
  });

  it('sięga po nie wyłącznie moduł z listy, w znanej liczbie', () => {
    const znalezione = {};
    js.forEach((f) => {
      const s = zrodlo(f);
      const wpis = {};
      MARTWE.forEach((id) => {
        const n = odczyty(s, id);
        if (n) wpis[id] = n;
      });
      if (Object.keys(wpis).length) znalezione[f] = wpis;
    });

    const oczekiwane = {};
    Object.keys(DOZWOLONE).forEach((f) => {
      const { powod, ...liczby } = DOZWOLONE[f];
      expect(powod.length, `${f} ma zapisany powód`).toBeGreaterThan(40);
      oczekiwane[f] = liczby;
    });
    expect(znalezione).toEqual(oczekiwane);
  });
});

describe('Sprzątnięte moduły nie wracają do martwych identyfikatorów', () => {
  const posprzatane = ['app.js', 'custom-fixes.js', 'cukrzyca.js', 'gh_igf_therapy.js',
    'vilda_save_status_indicator.js', 'vilda_unsaved_guard.js'];

  it.each(posprzatane)('%s nie odczytuje już żadnego martwego przycisku', (plik) => {
    const s = zrodlo(plik);
    MARTWE.forEach((id) => expect(odczyty(s, id), `${plik} → ${id}`).toBe(0));
  });

  it('moduły zapisu nadal sięgają po żywy przycisk w menu', () => {
    ['custom-fixes.js', 'vilda_save_status_indicator.js', 'vilda_unsaved_guard.js',
      'gh_igf_therapy.js', 'cukrzyca.js'].forEach((plik) => {
      expect(zrodlo(plik), plik).toContain(ZYWY);
    });
  });
});

describe('Zabezpieczenia, na których opiera się bezpieczeństwo tych ścieżek', () => {
  it('app.js: brak modułu zapisu kończy się alertem, nie ciszą', () => {
    const s = zrodlo('app.js');
    expect(s).toContain('return alert(v),null');
  });

  it('app.js: brak modułu importu też kończy się alertem', () => {
    const s = zrodlo('app.js');
    expect(s).toContain('typeof alert=="function"&&alert(L)');
  });

  it('vilda_data_import_export.js: komunikaty szukają istniejącej kotwicy', () => {
    const s = zrodlo('vilda_data_import_export.js');
    expect(s).toContain('Bk=Bwidok(e)?e:Bkotw()');
    // Lista kandydatów zawiera już tylko elementy, które mogą istnieć.
    expect(s).toContain(`const e=["${ZYWY}","clearAllDataBtn"];`);
  });

  it('vilda_unsaved_guard.js: brak przycisku zapisu jest nazwany, a nie przemilczany', () => {
    const s = zrodlo('vilda_unsaved_guard.js');
    expect(s).toContain('Nie znaleziono przycisku zapisu');
    // Przepuszcza dalej dopiero po potwierdzeniu z sejfu, nie po samym kliknięciu.
    expect(s).toContain('onPatientSaved');
  });

  it('custom-fixes.js: kliknięcie wygaszonego przycisku nadal tłumaczy powód', () => {
    const s = zrodlo('custom-fixes.js');
    expect(s).toContain('i.getAttribute("data-tip")||"Aby zapisa');
  });

  it('gh_igf_therapy.js ma ścieżkę zapasową bez przycisku', () => {
    expect(zrodlo('gh_igf_therapy.js')).toContain('VildaDataImportExport.saveUserData');
  });
});

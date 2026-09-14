import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-MARTWE-PRZYCISKI (przegląd po P-CICHY-ZAPIS, 2026-09-14) — spis kontrolny martwych
// identyfikatorów `saveDataBtn` i `loadDataBtn`.
//
// TŁO. Przy naprawie cichego zapisu (P-CICHY-ZAPIS) wyszło, że `vilda_data_import_export.js`
// wieszał WSZYSTKIE swoje komunikaty na `f("saveDataBtn")` i `f("loadDataBtn")` — a obu tych
// przycisków dawno nie ma w żadnej stronie: opcje zapisu i wczytywania przeniesiono do menu,
// gdzie `vilda_chrome.js` tworzy w runtime `saveDataBtnSidebar`. Skutkiem była cisza przy
// nieudanym zapisie.
//
// PRZEGLĄD POZOSTAŁYCH MODUŁÓW wykazał, że żaden inny nie milczy — każdy albo sięga po
// istniejący `saveDataBtnSidebar`, albo ma jawną ścieżkę zapasową. Ten test utrwala ten
// wynik: jeżeli ktoś dołoży NOWE odwołanie do martwego identyfikatora albo zabierze
// któreś zabezpieczenie, test się odezwie i zmusi do ponownego przejrzenia sprawy.
//
// Zmiana liczb poniżej nie jest sama w sobie błędem — jest sygnałem „przeczytaj powód
// jeszcze raz i upewnij się, że nadal jest prawdziwy".

const html = fs.readdirSync(korzen).filter((f) => f.endsWith('.html'));
const js = fs.readdirSync(korzen).filter((f) => f.endsWith('.js'));

function zrodlo(plik) {
  return fs.readFileSync(path.join(korzen, plik), 'utf8');
}

function ile(tekst, igla) {
  return tekst.split(igla).length - 1;
}

// Moduły, które wolno, żeby odwoływały się do martwych identyfikatorów — wraz z powodem,
// dla którego każdy z nich jest bezpieczny. Powód jest częścią testu, nie komentarzem obok.
const DOZWOLONE = {
  'app.js': { save: 1, load: 1, powod: 'obie ścieżki kończą się zapasowym alert(...)' },
  'cukrzyca.js': { save: 1, load: 1, powod: 'tylko wygaszanie przycisków; na tej stronie nie ma modułu zapisu' },
  'custom-fixes.js': { save: 2, load: 0, powod: 'wygasza istniejący saveDataBtnSidebar i dokleja powód w data-tip' },
  'gh_igf_therapy.js': { save: 1, load: 0, powod: 'sidebar albo bezpośrednie VildaDataImportExport.saveUserData()' },
  'vilda_data_import_export.js': { save: 6, load: 9, powod: 'komunikaty przechodzą przez Bkotw(), które szuka istniejącej kotwicy' },
  'vilda_save_status_indicator.js': { save: 2, load: 0, powod: 'wiąże też saveDataBtnSidebar i nasłuchuje na dokumencie' },
  'vilda_unsaved_guard.js': { save: 1, load: 0, powod: 'przy braku przycisku mówi wprost i nie przepuszcza dalej' },
  'vilda_update_prep.js': { save: 2, load: 4, powod: 'wyłącznie manifest dokumentacyjny, bez odczytu z DOM' },
};

describe('Martwe identyfikatory przycisków zapisu i wczytywania', () => {
  it('żadna strona nie ma już tych przycisków w markupie', () => {
    const zPrzyciskiem = html.filter((f) => {
      const s = zrodlo(f);
      return s.includes('id="saveDataBtn"') || s.includes('id="loadDataBtn"');
    });
    // Gdyby ktoś je przywrócił, powody w DOZWOLONE przestają obowiązywać i trzeba je przejrzeć.
    expect(zPrzyciskiem).toEqual([]);
  });

  it('menu tworzy zamiennik, na którym da się zawiesić komunikat', () => {
    expect(zrodlo('vilda_chrome.js')).toContain('id:"saveDataBtnSidebar"');
  });

  it('odwołują się do nich wyłącznie moduły z listy, w znanej liczbie', () => {
    const znalezione = {};
    js.forEach((f) => {
      const s = zrodlo(f);
      const save = ile(s, '"saveDataBtn"');
      const load = ile(s, '"loadDataBtn"');
      if (save || load) znalezione[f] = { save, load };
    });

    const oczekiwane = {};
    Object.keys(DOZWOLONE).forEach((f) => {
      oczekiwane[f] = { save: DOZWOLONE[f].save, load: DOZWOLONE[f].load };
    });
    expect(znalezione).toEqual(oczekiwane);
  });

  it('każdy dozwolony moduł ma zapisany powód, dla którego jest bezpieczny', () => {
    Object.keys(DOZWOLONE).forEach((f) => {
      expect(String(DOZWOLONE[f].powod || '').trim().length, `${f} ma powód`).toBeGreaterThan(20);
    });
  });
});

describe('Zabezpieczenia, na których opierają się powody', () => {
  it('app.js: komunikat o braku modułu zapisu schodzi do alertu', () => {
    const s = zrodlo('app.js');
    expect(s).toContain('showTooltip=="function"?showTooltip(w,v):alert(v)');
  });

  it('app.js: komunikat o braku modułu importu też schodzi do alertu', () => {
    const s = zrodlo('app.js');
    expect(s).toContain('A&&typeof showTooltip=="function"?showTooltip(A,L):typeof alert=="function"&&alert(L)');
  });

  it('vilda_data_import_export.js: komunikaty szukają istniejącej kotwicy', () => {
    const s = zrodlo('vilda_data_import_export.js');
    expect(s).toContain('Bk=Bwidok(e)?e:Bkotw()');
    expect(s).toContain('"saveDataBtn","saveDataBtnSidebar","loadDataBtn","clearAllDataBtn"');
  });

  it('vilda_unsaved_guard.js: brak przycisku zapisu jest nazwany, a nie przemilczany', () => {
    const s = zrodlo('vilda_unsaved_guard.js');
    expect(s).toContain('Nie znaleziono przycisku zapisu');
    // Guard przepuszcza dalej dopiero po potwierdzeniu z sejfu, nie po samym kliknięciu.
    expect(s).toContain('onPatientSaved');
  });

  it('custom-fixes.js i save-status-indicator sięgają po istniejący przycisk w menu', () => {
    expect(zrodlo('custom-fixes.js')).toContain('saveDataBtnSidebar');
    expect(zrodlo('vilda_save_status_indicator.js')).toContain('saveDataBtnSidebar');
  });

  it('gh_igf_therapy.js ma ścieżkę zapasową bez przycisku', () => {
    const s = zrodlo('gh_igf_therapy.js');
    expect(s).toContain('VildaDataImportExport.saveUserData');
  });
});

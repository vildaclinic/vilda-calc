import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

// P-TOZSAMOSC (zgłoszenie właściciela 2026-09-15) — po wczytaniu pacjenta nazwisko, imię i płeć
// zostawały edytowalne (na obu stronach), a na docpro po „Odtwórz zapis" także data urodzenia;
// docpro nie miał panelu pokwitaniowego; po F5 wracał przycisk „Odtwórz zapisany stan", a jego
// kliknięcie po wcześniejszym odtworzeniu nie robiło nic. Zmierzone skryptem na prawdziwych
// stronach przed zmianą (fikcyjne konto, fikcyjne dane):
//   • wczytanie: #firstName/#lastName ro=0; F5 → hasUserModifiedAfterLoad=true bez edycji;
//   • „Odtwórz zapis" → lastLoadedData=null → docpro: #dobInput ro=0; F5 → przycisk widoczny, martwy.
// Atrapa DOM; dane wyłącznie FIKCYJNE.

function atrapa(id) {
  const el = {
    id, value: '', readOnly: false, disabled: false, hidden: false, textContent: '', dataset: {}, klasy: new Set(), atr: {},
  };
  el.classList = { add: (k) => el.klasy.add(k), remove: (k) => el.klasy.delete(k), contains: (k) => el.klasy.has(k) };
  el.removeAttribute = (n) => { delete el.atr[n]; delete el[n]; };
  return el;
}

function srodowisko({ bez = [] } = {}) {
  const pola = {};
  ['lastName', 'firstName', 'name', 'sex', 'tozsamoscNote'].filter((id) => !bez.includes(id)).forEach((id) => { pola[id] = atrapa(id); });
  const nasluchy = { doc: {}, win: {} };
  const win = {
    document: {
      readyState: 'complete',
      getElementById: (id) => pola[id] || null,
      addEventListener: (n, f) => { (nasluchy.doc[n] = nasluchy.doc[n] || []).push(f); },
    },
    addEventListener: (n, f) => { (nasluchy.win[n] = nasluchy.win[n] || []).push(f); },
    setTimeout: (f) => { f(); return 1; },
    lastLoadedData: null,
  };
  loadBrowserScript('vilda_pola_tozsamosci.js', win);
  return { win, pola, nasluchy, M: win.VildaPolaTozsamosci };
}

describe('vilda_pola_tozsamosci.js — reguła blokady', () => {
  it('bez bazy pola są wolne', () => {
    const { pola, M } = srodowisko();
    pola.name.value = 'Fikcyjna Ewa';
    expect(M.odswiez()).toBe(false);
    expect(pola.lastName.readOnly).toBe(false);
    expect(pola.sex.disabled).toBe(false);
    expect(pola.tozsamoscNote.hidden).toBe(true);
  });

  it('baza nazywa pacjenta z formularza → nazwisko i imię tylko do odczytu, płeć wyłączona, notka', () => {
    const { win, pola, M } = srodowisko();
    win.lastLoadedData = { name: 'Fikcyjna Ewa', user: { sex: 'F' } };
    pola.name.value = 'Fikcyjna Ewa';
    expect(M.odswiez()).toBe(true);
    expect(pola.lastName.readOnly).toBe(true);
    expect(pola.firstName.readOnly).toBe(true);
    expect(pola.sex.disabled).toBe(true);
    expect(pola.lastName.klasy.has(M.KLASA)).toBe(true);
    expect(pola.sex.klasy.has(M.KLASA)).toBe(true);
    expect(pola.tozsamoscNote.hidden).toBe(false);
    expect(pola.tozsamoscNote.textContent).toContain('Karcie Pacjenta');
  });

  it('kolejność i wielkość liter nie mają znaczenia (vilda_name_fix potrafi zamienić „Imię Nazwisko")', () => {
    const { win, pola, M } = srodowisko();
    win.lastLoadedData = { name: 'Szymon Fikcyjny' };
    pola.name.value = '  fikcyjny   SZYMON ';
    expect(M.odswiez()).toBe(true);
    expect(M.klucz('Fikcyjna-Dwuczłonowa Anna Maria')).toBe('anna fikcyjna-dwuczłonowa maria');
  });

  it('inne dziecko w polu niż w bazie → bez blokady (lekarz wpisał kogoś innego)', () => {
    const { win, pola, M } = srodowisko();
    win.lastLoadedData = { name: 'Fikcyjna Ewa' };
    pola.name.value = 'Fikcyjny Jan';
    expect(M.odswiez()).toBe(false);
    expect(pola.firstName.readOnly).toBe(false);
  });

  it('po zniknięciu bazy zdejmuje TYLKO własną blokadę i czyści notkę', () => {
    const { win, pola, M } = srodowisko();
    win.lastLoadedData = { name: 'Fikcyjna Ewa' };
    pola.name.value = 'Fikcyjna Ewa';
    M.odswiez();
    win.lastLoadedData = null;
    expect(M.odswiez()).toBe(false);
    expect(pola.lastName.readOnly).toBe(false);
    expect(pola.lastName.klasy.has(M.KLASA)).toBe(false);
    expect(pola.sex.disabled).toBe(false);
    expect(pola.tozsamoscNote.hidden).toBe(true);
    // Pole zablokowane przez KOGOŚ INNEGO (bez znacznika) zostaje w spokoju.
    const obce = srodowisko();
    obce.pola.sex.disabled = true;
    obce.M.odswiez();
    expect(obce.pola.sex.disabled).toBe(true);
  });

  it('nasłuchuje zdarzeń wczytania, zapisu, odtworzenia, bazy, wyczyszczenia oraz input/change', () => {
    const { nasluchy } = srodowisko();
    ['vilda:patient-loaded', 'vilda:patient-saved', 'vilda:state-restored', 'vilda:json-imported',
      'vilda:baseline-refreshed', 'vilda:user-state-cleared', 'input', 'change'].forEach((n) => expect(nasluchy.doc[n], n).toBeTruthy());
    expect(nasluchy.win['vilda:user-state-cleared']).toBeTruthy();
  });

  it('każda ZMIANA stanu blokady idzie jako vilda:tozsamosc-zmiana; powtórna ocena bez zmiany milczy', () => {
    const { win, pola, M } = srodowisko();
    const zdarzenia = [];
    win.CustomEvent = function (typ, init) { this.type = typ; this.detail = init && init.detail; };
    win.document.dispatchEvent = (ev) => { zdarzenia.push(ev); return true; };
    win.lastLoadedData = { name: 'Fikcyjna Ewa' };
    pola.name.value = 'Fikcyjna Ewa';
    M.odswiez();
    M.odswiez();
    expect(zdarzenia.map((e) => [e.type, e.detail.zablokowane])).toEqual([['vilda:tozsamosc-zmiana', true]]);
    win.lastLoadedData = null;
    M.odswiez();
    expect(zdarzenia.length).toBe(2);
    expect(zdarzenia[1].detail.zablokowane).toBe(false);
  });

  it('strona bez pól tożsamości: brak nasłuchów, brak wyjątku', () => {
    const { nasluchy, M } = srodowisko({ bez: ['lastName', 'firstName', 'sex', 'name', 'tozsamoscNote'] });
    expect(M.__init).toBe(true);
    expect(Object.keys(nasluchy.doc)).toEqual([]);
  });
});

describe('Obie strony mają ten sam formularz główny i tę samą blokadę', () => {
  const index = zrodlo('index.html');
  const docpro = zrodlo('docpro.html');
  const POLA_PANELU = ['tannerToggleBtn', 'tannerStageWrap', 'tannerStage', 'testicularVolumeWrap', 'advTesticularVolume',
    'pubertyExtraWrap', 'pubertyOnsetAge', 'pubertyMenarcheAge', 'pubertyMenarcheHeight', 'pubertyMenarcheBoneAge',
    'pubertyGnrhaStatus', 'pubertyGnrhaAgesWrap', 'pubertyGnrhaStartAge', 'pubertyGnrhaStopAge', 'pubertyCdgp',
    'pubertyCdgpNote', 'pubertyConflicts'];

  it('docpro.html ma panel „Dane pokwitaniowe" z tymi samymi identyfikatorami i tym samym skryptem, co index.html', () => {
    POLA_PANELU.forEach((id) => {
      expect(index, id).toContain(`id="${id}"`);
      expect(docpro, id).toContain(`id="${id}"`);
    });
    const tag = /<script defer src="inline_index_02\.js\?v=\d+"><\/script>/;
    expect(index).toMatch(tag);
    expect(docpro).toMatch(tag);
    expect(docpro).toContain('.vild-tanner-toggle');
  });

  it('obie strony ładują vilda_pola_tozsamosci.js po module bazy i mają notkę #tozsamoscNote', () => {
    [index, docpro].forEach((h) => {
      const baza = h.indexOf('vilda_baseline_pacjenta.js?v=');
      const modul = h.indexOf('vilda_pola_tozsamosci.js?v=');
      expect(baza).toBeGreaterThan(-1);
      expect(modul).toBeGreaterThan(baza);
      expect(h).toContain('id="tozsamoscNote"');
      expect(h).toContain('input.vild-pole-z-kartoteki[readonly], select.vild-pole-z-kartoteki[disabled]');
    });
  });

  it('service worker i rejestr zależności znają moduł', () => {
    expect(zrodlo('service-worker-kalorii.js')).toContain("'/vilda_pola_tozsamosci.js?v=2',");
    expect(zrodlo('vilda_deps.js')).toContain('VildaPolaTozsamosci:');
  });
});

describe('Podpowiedź pacjenta przy zablokowanym polu tożsamości (P-TOZSAMOSC-2)', () => {
  const src = zrodlo('vilda_auth_ui.js');

  function wytnij(nazwa) {
    const i = src.indexOf(`function ${nazwa}(`);
    expect(i, `vilda_auth_ui.js ma ${nazwa}()`).toBeGreaterThan(-1);
    let d = 0;
    for (let k = src.indexOf('{', i); k < src.length; k += 1) {
      if (src[k] === '{') d += 1;
      else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('niezbalansowane nawiasy');
  }

  const Bz0 = (pola) => new Function('i', 'mo', `${wytnij('Bz0')}return Bz0;`)(
    { document: { getElementById: (id) => pola[id] || null } },
    { firstName: 1, lastName: 1 },
  );

  it('pole readOnly, disabled albo ze znacznikiem z kartoteki blokuje podpowiedź', () => {
    const b = Bz0({});
    expect(b({ id: 'lastName', readOnly: true })).toBe(true);
    expect(b({ id: 'advName', disabled: true })).toBe(true);
    expect(b({ id: 'firstName', dataset: { zKartoteki: '1' } })).toBe(true);
    expect(b(null)).toBe(false);
  });

  it('para Nazwisko/Imię: blokada jednego pola z pary wystarcza; wolna para podpowiada', () => {
    const zablokowana = Bz0({ lastName: { readOnly: true }, firstName: { readOnly: false } });
    expect(zablokowana({ id: 'firstName', readOnly: false, dataset: {} })).toBe(true);
    const wolna = Bz0({ lastName: { readOnly: false }, firstName: { readOnly: false } });
    expect(wolna({ id: 'firstName', readOnly: false, dataset: {} })).toBe(false);
    expect(wolna({ id: 'basicGrowthName', readOnly: false, dataset: {} })).toBe(false);
  });

  it('Pi() pyta o blokadę przed budową listy i chowa ją', () => {
    expect(src).toContain('if(Bz0(t)){Ua();return}var a=vs(t);if(!a){Ua();return}');
  });

  it('lista otwarta tuż przed blokadą znika: wczytanie, zapis i zmiana blokady chowają ją; klawiatura na zablokowanym polu nie wybiera', () => {
    // Przegląd adwersaryjny (2026-09-15): bramka w Pi() działa tylko przy OTWIERANIU listy — lista
    // otwarta w oknie przed blokadą zostawała na ekranie i reagowała na Enter. Stąd trzy zamknięcia.
    expect(src).toContain('i.document.addEventListener("vilda:patient-loaded",function(){Qe=null,Ua()})');
    expect(src).toContain('i.document.addEventListener("vilda:patient-saved",function(){Qe=null,Ua()})');
    expect(src).toContain('i.document.addEventListener("vilda:tozsamosc-zmiana",function(n){n&&n.detail&&n.detail.zablokowane&&Ua()})');
    expect(src).toContain('function bs(t){if(t&&Bz0(t.target)){Ua();return}');
  });
});

describe('Odtworzenie zapisu i odświeżenie strony (kotwice w plikach zminifikowanych)', () => {
  it('restoreLoadedState() zostawia bazę wczytanego pacjenta i zapamiętuje wybór „restore"', () => {
    const src = zrodlo('vilda_data_import_export.js');
    expect(src).not.toContain('try{a.lastLoadedData=null}');
    expect(src).toContain('a.sessionStorage.setItem("vildaLoadChoiceV1","restore")');
  });

  it('odtworzenie sesji (F5) nie pokazuje przycisku „Odtwórz zapisany stan"', () => {
    const src = zrodlo('vilda_data_import_export.js');
    expect(src).toContain('a.isSessionRestore||(g?x("show-restore-button",g,[]):x("show-restore-button-local",at,[a]));');
  });

  it('flaga „lekarz edytował po wczytaniu" tylko ze zdarzeń zaufanych (nie programowych)', () => {
    expect(zrodlo('vilda_data_import_export.js')).toContain('const d=function(ev){/* P-TOZSAMOSC');
    expect(zrodlo('vilda_data_import_export.js')).toContain('if(ev&&ev.isTrusted===!1)return;try{s.style.display="none"}');
    expect(zrodlo('app.js')).toContain('window.lastLoadedData&&w.isTrusted!==!1&&(window.hasUserModifiedAfterLoad=!0)');
  });

  it('start po F5: wybór „restore" to dokonany wybór — bez przycisku, bez podsumowania poprzedniego pomiaru', () => {
    const src = zrodlo('vilda_persist_runtime.js');
    expect(src).toContain('let Bt0=null;try{Bt0=window.sessionStorage.getItem("vildaLoadChoiceV1")}catch{}');
    expect(src).toContain('Bt0!=="restore"&&typeof v=="function"&&v(null,!0)');
    expect(src).toContain('typeof m=="function"&&Bt0!=="restore"?window.prevMeasurementInfo=m(i):window.prevMeasurementInfo=null');
    expect(src).toContain('let l=Bt0==="new";if(window.hasUserModifiedAfterLoad||Bt0==="restore"){');
  });
});

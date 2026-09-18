import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-NOTATKI rata 2 (G8 + G11, audyt „Dodaj notatkę do wizyty" 2026-09-18).
//
// Cała ścieżka przycisku „Dodaj notatkę do wizyty" (bramka -> klik -> suggestLinkedAge) nie miała
// żadnego testu. Audyt zmierzył w niej dwie usterki:
//
//   G8: kotwica liczona była `parseInt(#age)*12`, a pomiar zapisywał się w sejfie jako
//       `Math.round(wiek*12 + miesiące)`. Dla 5,5 roku notatka dostawała 60 mies., a pomiar 66 —
//       w Historii wisiała pod chipem „Pomiar usunięty", choć pomiar istniał pod innym wiekiem.
//   G9: dla noworodka (0 l 0 mies.) przycisk był aktywny, a klik odmawiał „Nieprawidłowy wiek".
//
// Test uruchamia PRAWDZIWY moduł z custom-fixes.js na atrapie DOM i porównuje wynik z PRAWDZIWYM
// sejfem (vilda_vault.js, adapter w pamięci). Dane wyłącznie fikcyjne.

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function wytnijModulPaska() {
  const latin = fs.readFileSync(path.join(repositoryRoot, 'custom-fixes.js')).toString('latin1');
  const start = latin.indexOf('})(),(function(){', 9000) + 5;
  const marker = 'custom-fixes:sidebar-menu",S)})()';
  const end = latin.indexOf(marker) + marker.length;
  const src = Buffer.from(latin.slice(start, end), 'latin1').toString('utf8');
  if (!src.startsWith('(function(){') || !src.endsWith('})()')) {
    throw new Error('Nie znalazłem granic modułu „custom-fixes:sidebar-menu" — popraw kotwice testu.');
  }
  return src;
}
const MODUL_PASKA = wytnijModulPaska();

function atrapa(id) {
  const el = { id, value: '', atr: {}, _l: {} };
  el.setAttribute = (n, v) => { el.atr[n] = String(v); };
  el.getAttribute = (n) => (n in el.atr ? el.atr[n] : null);
  el.hasAttribute = (n) => n in el.atr;
  el.removeAttribute = (n) => { delete el.atr[n]; };
  el.addEventListener = (n, f) => { (el._l[n] = el._l[n] || []).push(f); };
  el.click = () => (el._l.click || []).forEach((f) => f({ preventDefault() {} }));
  return el;
}

// Jeden przebieg paska bocznego: budujemy formularz, odpalamy moduł, klikamy przycisk.
function pasek({ patientId = null, age = '', ageMonths = '', height = '', weight = '',
  name = 'Testowy Pacjent', loggedIn = true, bezFormularza = false } = {}) {
  const pola = {};
  const idsPrzyciskow = ['saveDataBtnSidebar', 'patientsListBtnSidebar', 'addVisitNoteBtnSidebar'];
  const idsFormularza = ['name', 'age', 'ageMonths', 'weight', 'height'];
  idsPrzyciskow.forEach((id) => { pola[id] = atrapa(id); });
  if (!bezFormularza) {
    idsFormularza.forEach((id) => { pola[id] = atrapa(id); });
    pola.name.value = name;
    pola.age.value = age;
    pola.ageMonths.value = ageMonths;
    pola.height.value = height;
    pola.weight.value = weight;
  }
  const tipy = [];
  const edytor = [];
  const magazyn = {};
  const win = {
    sessionStorage: {
      getItem: (k) => (k in magazyn ? magazyn[k] : null),
      setItem: (k, v) => { magazyn[k] = String(v); },
      removeItem: (k) => { delete magazyn[k]; },
    },
    _vildaCurrentPatientId: patientId,
    vildaOnReady: (_n, fn) => fn(),
    addEventListener() {},
    VildaSession: { isLoggedIn: () => loggedIn, TOOLTIPS: { saveData: {}, patients: {}, visitNote: {} } },
    VildaVault: {
      onUnlock() {}, onLock() {}, onPatientDeleted() {}, onPatientListChanged() {}, onPatientSaved() {},
      isUnlocked: () => loggedIn,
      ageMonthsFromForm(lata, miesiace) {
        const a = typeof lata === 'number' && isFinite(lata) ? lata : null;
        const b = typeof miesiace === 'number' && isFinite(miesiace) ? miesiace : null;
        return a === null && b === null ? null : Math.round((a || 0) * 12 + (b || 0));
      },
    },
    VildaChrome: { showTip: (_el, msg) => tipy.push(msg) },
    VildaAuthUI: { showPatientNoteEditor: (o) => edytor.push(o) },
  };
  const document = {
    getElementById: (id) => pola[id] || null,
    addEventListener() {},
    body: { appendChild() {} },
  };
  new Function('window', 'document', 'setInterval', 'clearInterval', 'setTimeout', MODUL_PASKA)(
    win, document, () => 0, () => {}, () => 0,
  );
  const btn = pola.addVisitNoteBtnSidebar;
  const przedKlikiem = { wylaczony: btn.hasAttribute('disabled'), tip: btn.getAttribute('data-tip') };
  btn.click();
  return {
    ...przedKlikiem,
    dymek: tipy[0] || null,
    edytorOtwarty: edytor.length,
    suggestLinkedAge: edytor[0] ? edytor[0].suggestLinkedAge : null,
  };
}

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}
async function sejf(label) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  await vault.createUser(`Bramka#Notatki2026!${label}`, { label, iterations: 10000 });
  return vault;
}

describe('bramka „Dodaj notatkę do wizyty" (G11)', () => {
  it('bez zalogowania przycisk jest wyłączony i mówi o logowaniu', () => {
    const w = pasek({ loggedIn: false, patientId: 'p1', age: '5', height: '110', weight: '19' });
    expect(w.wylaczony).toBe(true);
    expect(w.edytorOtwarty).toBe(0);
    expect(w.tip).toMatch(/Zaloguj/);
  });

  it('bez pacjenta w bazie przycisk kieruje do listy „Pacjenci"', () => {
    const w = pasek({ patientId: null, age: '5', height: '110', weight: '19' });
    expect(w.wylaczony).toBe(true);
    expect(w.tip).toMatch(/Pacjenci/);
    expect(w.dymek).toMatch(/Pacjenci/);
  });

  it('bez wieku i bez wymiarów podpowiedź mówi, czego brakuje (G20)', () => {
    expect(pasek({ patientId: 'p1', age: '', ageMonths: '', height: '110', weight: '19' }).tip)
      .toMatch(/Wpisz wiek/);
    expect(pasek({ patientId: 'p1', age: '5', height: '', weight: '' }).tip)
      .toMatch(/wzrost lub masę ciała/);
  });

  it('na stronie bez formularza pacjenta podpowiedź kieruje na Start/DocPro (G20, D11)', () => {
    const w = pasek({ patientId: 'p1', bezFormularza: true });
    expect(w.wylaczony).toBe(true);
    expect(w.tip).toMatch(/Start i DocPro/);
  });

  it('komplet danych otwiera edytor', () => {
    const w = pasek({ patientId: 'p1', age: '5', ageMonths: '3', height: '110', weight: '19' });
    expect(w.wylaczony).toBe(false);
    expect(w.edytorOtwarty).toBe(1);
    expect(w.suggestLinkedAge).toBe(63);
  });

  it('sama waga wystarczy, wzrost nie jest wymagany', () => {
    expect(pasek({ patientId: 'p1', age: '5', height: '', weight: '19' }).edytorOtwarty).toBe(1);
  });
});

describe('kotwica notatki liczona tą samą formułą co pomiar (G8)', () => {
  // Przed poprawką: parseInt("5.5") = 5 -> 60 mies., a sejf zapisywał 66.
  for (const [wiek, miesiace, oczekiwane] of [
    ['5', '3', 63],
    ['5.5', '', 66],
    ['2.5', '', 30],
    ['0', '7', 7],
    ['', '9', 9],
  ]) {
    it(`wiek "${wiek}" + "${miesiace}" mies. -> kotwica ${oczekiwane} mies.`, () => {
      const w = pasek({ patientId: 'p1', age: wiek, ageMonths: miesiace, height: '110', weight: '19' });
      expect(w.suggestLinkedAge).toBe(oczekiwane);
    });
  }

  it('kotwica z paska zgadza się z ageMonths pomiaru zapisanego w sejfie', async () => {
    const vault = await sejf('zgodnosc');
    const zapis = await vault.savePatient({
      name: 'Zgodna Kotwica', sex: 'K', age: 5.5, height: 110, weight: 19,
    });
    const historia = await vault.listPatientTimelineEvents(zapis.patientId);
    const pomiary = historia.filter((x) => x.type === 'measurement');
    const zPaska = pasek({ patientId: zapis.patientId, age: '5.5', height: '110', weight: '19' }).suggestLinkedAge;
    expect(pomiary.map((x) => x.ageMonths)).toContain(zPaska);
  });

  it('ta sama formuła w sejfie: VildaVault.ageMonthsFromForm', async () => {
    const vault = await sejf('formula');
    expect(vault.ageMonthsFromForm(5.5, null)).toBe(66);
    expect(vault.ageMonthsFromForm(5, 3)).toBe(63);
    expect(vault.ageMonthsFromForm(null, 9)).toBe(9);
    expect(vault.ageMonthsFromForm(null, null)).toBe(null);
    expect(vault.ageMonthsFromForm(0, 0)).toBe(0);
  });
});

describe('noworodek 0 mies. (G9, decyzja D8)', () => {
  it('przycisk działa i proponuje kotwicę 0 mies.', () => {
    const w = pasek({ patientId: 'p1', age: '0', ageMonths: '0', weight: '3.5' });
    expect(w.wylaczony).toBe(false);
    expect(w.dymek).toBe(null);
    expect(w.edytorOtwarty).toBe(1);
    expect(w.suggestLinkedAge).toBe(0);
  });

  it('sejf zapisuje linkedAgeMonths = 0 zamiast je zerować', async () => {
    const vault = await sejf('noworodek');
    const zapis = await vault.savePatient({ name: 'Noworodek Testowy', sex: 'M', age: 0, ageMonths: 0, weight: 3.5, height: 52 });
    const { id } = await vault.savePatientNote({
      patientId: zapis.patientId, title: 'Wizyta noworodkowa', body: 'SGA — kontrola', linkedAgeMonths: 0,
    });
    const notatka = await vault.getPatientNote(id);
    expect(notatka.linkedAgeMonths).toBe(0);
    const historia = await vault.listPatientTimelineEvents(zapis.patientId);
    const wpis = historia.find((x) => x.type === 'note' && x.noteId === id);
    expect(wpis.linkedAgeMonths).toBe(0);
  });

  it('ujemny wiek nadal jest odrzucany', async () => {
    const vault = await sejf('ujemny');
    const zapis = await vault.savePatient({ name: 'Ujemny Wiek', sex: 'M', age: 3, height: 95, weight: 14 });
    const { id } = await vault.savePatientNote({
      patientId: zapis.patientId, title: 'Zła kotwica', body: 'x', linkedAgeMonths: -5,
    });
    expect((await vault.getPatientNote(id)).linkedAgeMonths).toBe(null);
  });
});

describe('Historia odróżnia usunięty pomiar od nigdy niezapisanego (G8, decyzja D7)', () => {
  it('wiek bez pomiaru w żadnej migawce nie trafia na listę usuniętych', async () => {
    const vault = await sejf('brak');
    const zapis = await vault.savePatient({ name: 'Bez Pomiaru', sex: 'K', age: 6, height: 115, weight: 21 });
    await vault.savePatientNote({
      patientId: zapis.patientId, title: 'Notatka przed zapisem pomiaru', body: 'x', linkedAgeMonths: 84,
    });
    const historia = await vault.listPatientTimelineEvents(zapis.patientId);
    expect(historia.removedMeasurementAgeMonths).toEqual([]);
  });

  it('pomiar skasowany z rekordu ląduje na liście usuniętych', async () => {
    const vault = await sejf('usuniety');
    const wiersze = (pary) => pary.map(([m, h]) => ({ ageMonths: m, ageYears: m / 12, height: h, weight: 18 }));
    const zapisz = (patientId, pary, wiek) => vault.savePatient({
      ...(patientId ? { patientId } : {}),
      name: 'Usunięty Pomiar',
      user: { lastName: 'Usunięty', firstName: 'Pomiar', sex: 'M', age: Math.floor(wiek / 12), ageMonths: wiek % 12, height: pary[pary.length - 1][1], weight: 18 },
      advanced: { data: { measurements: wiersze(pary) } },
    }, { dedup: false });

    const pierwszy = await zapisz(null, [[48, 102]], 48);
    await zapisz(pierwszy.patientId, [[48, 102], [60, 110]], 60);

    const historia = await vault.listPatientTimelineEvents(pierwszy.patientId);
    expect(historia.filter((x) => x.type === 'measurement').map((x) => x.ageMonths)).toContain(48);
    expect(historia.removedMeasurementAgeMonths).toEqual([]);

    const doUsuniecia = historia.find((x) => x.type === 'measurement' && x.ageMonths === 48);
    await vault.deleteMeasurementRow(pierwszy.patientId, { uid: doUsuniecia.uid || null, key: doUsuniecia.rowKey || null });

    const po = await vault.listPatientTimelineEvents(pierwszy.patientId);
    expect(po.filter((x) => x.type === 'measurement').map((x) => x.ageMonths)).not.toContain(48);
    expect(po.removedMeasurementAgeMonths).toContain(48);
  });
});

// G19 — szuflada mobilna i powłoka. Zachowanie na żywo wymagałoby telefonu i ramek powłoki;
// tutaj pilnujemy samych rozgałęzień, bo to po kilka znaków, które łatwo cofnąć (ten sam wzorzec
// co w karta-pacjenta-notatki-historia.test.mjs).
describe('G19 — wyłączony przycisk nie przekazuje kliknięcia dalej', () => {
  const zrodlo = (plik) => fs.readFileSync(path.join(repositoryRoot, plik), 'utf8');

  it('szuflada lustruje stan przycisku przy każdym otwarciu', () => {
    const chrome = zrodlo('vilda_chrome.js');
    expect(chrome, 'lustrzenie aria-disabled/data-tip na przyciskach szuflady').toContain('function Qdm(e)');
    expect(chrome, 'lustrzenie odpala się przy otwarciu szuflady').toContain('e.__vildaCloseTimer=null),Qdm(e)');
  });

  it('szuflada pokazuje dymek na sobie zamiast klikać ukryty przycisk paska', () => {
    const chrome = zrodlo('vilda_chrome.js');
    expect(chrome).toContain('if(d&&(d.getAttribute("aria-disabled")==="true"||d.hasAttribute("disabled"))){F(n,');
  });

  it('powłoka nie forwarduje kliknięcia wyłączonego przycisku do ramki', () => {
    const shell = zrodlo('vilda_shell.js');
    expect(shell).toContain('if(r.getAttribute("aria-disabled")==="true"||r.hasAttribute("disabled")){');
    expect(shell).toContain('a.VildaChrome.showTip(r,r.getAttribute("data-tip")');
  });

  it('strony bez bramki (bez custom-fixes.js) dostają podpowiedź z vilda_chrome.js', () => {
    const chrome = zrodlo('vilda_chrome.js');
    expect(chrome, 'wybór tekstu zależy od obecności formularza pacjenta').toContain('function Qvn()');
    expect(chrome).toContain('o.getElementById("age")||o.getElementById("ageMonths")');
    expect(chrome, 'przycisk jest od razu oznaczony jako niedostępny')
      .toContain('if(t&&!t._cfBound)try{t.setAttribute("aria-disabled","true"),t.setAttribute("data-tip",Qvn())}catch{}');
  });

  it('teksty podpowiedzi mają jedno źródło w VildaSession.TOOLTIPS.visitNote', () => {
    const bridge = zrodlo('vilda_session_bridge.js');
    ['notLoggedIn', 'noPatient', 'noAge', 'noMeasure', 'noAgeOrMeasure', 'notOnThisPage', 'badAge', 'unavailable']
      .forEach((klucz) => expect(bridge, `TOOLTIPS.visitNote.${klucz}`).toContain(`${klucz}:`));
    expect(zrodlo('custom-fixes.js')).toContain('window.VildaSession.TOOLTIPS.visitNote||{}');
  });
});

// G14 — scalanie musi w ogóle zgłosić zmianę, inaczej otwarty edytor nie ma się czego dowiedzieć.
describe('G14 — scalanie zgłasza zmiany notatek pacjenta', () => {
  it('sejf wysyła powiadomienie merge / merge-delete', () => {
    const vault = fs.readFileSync(path.join(repositoryRoot, 'vilda_vault.js'), 'utf8');
    expect(vault).toContain('Qch.push({id:g.id,patientId:g.patientId,action:"merge"})');
    expect(vault).toContain('action:"merge-delete"');
    expect(vault, 'powiadomienia lecą zbiorczo po zakończeniu gałęzi').toContain('for(let Qi=0;Qi<Qch.length;Qi+=1)qr(Qch[Qi])');
  });

  it('synchronizacja nie planuje wysyłki w reakcji na własne scalenie', () => {
    expect(fs.readFileSync(path.join(repositoryRoot, 'vilda_sync_integration.js'), 'utf8'))
      .toContain('e&&typeof e.action=="string"&&e.action.indexOf("merge")===0||m({immediate:!0})');
  });

  it('edytor pokazuje baner o zmianie z innego urządzenia', () => {
    const ui = fs.readFileSync(path.join(repositoryRoot, 'vilda_auth_ui.js'), 'utf8');
    expect(ui).toContain('i.__vildaPneOpen={id:r.id,show:Qshow}');
    expect(ui).toContain('i.__vildaNoteEditorChangeBound=!0');
    expect(ui).toContain('Ta notatka zmieni\\u0142a si\\u0119 na innym urz\\u0105dzeniu.');
  });
});

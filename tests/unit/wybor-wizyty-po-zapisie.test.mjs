import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Zdarzenie patient-loaded ze źródłem „save” potwierdza własny zapis formularza.
// Ponowne otwarcie wyboru wizyty kasowało decyzję „restore” / „new” i po
// przełączeniu stron wracał przycisk odtwarzania. Wykonujemy prawdziwy moduł
// paska bocznego, razem z nasłuchami tożsamości i wyboru wizyty.
const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = fs.readFileSync(path.join(korzen, 'custom-fixes.js'), 'utf8');
const poczatek = zrodlo.indexOf('(function(){function s(i,h){if(typeof showTooltip');
const koniecKotwica = 'custom-fixes:sidebar-menu",S)})()';
const koniec = zrodlo.indexOf(koniecKotwica, poczatek) + koniecKotwica.length;
if (poczatek < 0 || koniec < poczatek) throw new Error('Brak modułu paska bocznego w custom-fixes.js.');
const modul = zrodlo.slice(poczatek, koniec);

function uruchom(wybor) {
  const store = {};
  if (wybor != null) store.vildaLoadChoiceV1 = wybor;
  const nasluchy = {};
  const zaplanowane = [];
  const dokument = {
    getElementById: () => null,
    addEventListener: (typ, fn) => { (nasluchy[typ] ||= []).push(fn); },
    removeEventListener() {},
    body: { appendChild() {} },
  };
  const okno = {
    sessionStorage: {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    vildaOnReady: (_n, fn) => fn(),
    addEventListener() {},
  };
  new Function('window', 'document', 'setTimeout', 'setInterval', 'clearInterval', modul)(
    okno, dokument, (fn) => { zaplanowane.push(fn); return zaplanowane.length; }, () => 0, () => {},
  );
  function wyslij(detail) {
    const ev = { type: 'vilda:patient-loaded', detail };
    nasluchy['vilda:patient-loaded'].forEach((fn) => fn(ev));
  }
  return { okno, store, zaplanowane, wyslij };
}

describe('Własny zapis zachowuje dokonany wybór wizyty', () => {
  it.each(['restore', 'new'])('zapis po wyborze %s zachowuje decyzję bez ponownego modalu', (wybor) => {
    const { okno, store, zaplanowane, wyslij } = uruchom(wybor);
    wyslij({ source: 'save', patientId: 'fikcyjny-pacjent' });
    expect(store.vildaLoadChoiceV1).toBe(wybor);
    expect(zaplanowane).toHaveLength(0);
    // Nasłuch tożsamości nadal działa; wyciszamy wyłącznie ponowny wybór wizyty.
    expect(okno._vildaCurrentPatientId).toBe('fikcyjny-pacjent');
    expect(store.vildaCurrentPatientId).toBe('fikcyjny-pacjent');
  });

  it('powiadomienie o własnym zapisie bez wyboru nie uruchamia wyboru wczytania', () => {
    const { store, zaplanowane, wyslij } = uruchom(null);
    wyslij({ source: 'save', patientId: 'fikcyjny-pacjent' });
    expect(store.vildaLoadChoiceV1).toBeUndefined();
    expect(zaplanowane).toHaveLength(0);
  });

  it.each(['restore', 'new'])('faktyczne nowe wczytanie po %s kasuje poprzedni wybór', (wybor) => {
    const { store, zaplanowane, wyslij } = uruchom(wybor);
    wyslij({ source: 'pick', patientId: 'inny-fikcyjny-pacjent' });
    expect(store.vildaLoadChoiceV1).toBeUndefined();
    expect(zaplanowane).toHaveLength(1);
  });

  it('przywrócenie wersji nadal planuje odtworzenie zapisu', () => {
    const { store, zaplanowane, wyslij } = uruchom('new');
    wyslij({ source: 'version-restore', patientId: 'fikcyjny-pacjent' });
    expect(store.vildaLoadChoiceV1).toBeUndefined();
    expect(zaplanowane).toHaveLength(1);
    zaplanowane[0]();
    expect(store.vildaLoadChoiceV1).toBe('restore');
  });
});

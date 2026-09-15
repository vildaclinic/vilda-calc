import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-ODSWIEZENIE (zgłoszenie właściciela 2026-09-15), część 4: linia bazowa wczytanego pacjenta
// podąża za rekordem, gdy ten sam lekarz zmienia go gdzie indziej w tej samej karcie (ekran
// „Edytuj", szybki pomiar, korekta nazwiska). Sejf i dokument podstawione atrapami; moduł jest
// czytelny i wołany wprost. Dane wyłącznie fikcyjne.

function atrapaPola(value) {
  return { value: value || '', readOnly: false, dataset: {}, options: null, dispatchEvent() { return true; } };
}

function srodowisko(opcje) {
  const o = opcje || {};
  const pola = {
    name: atrapaPola(o.name || ''), lastName: atrapaPola(''), firstName: atrapaPola(''),
    sex: Object.assign(atrapaPola(''), { options: [{ value: 'M' }, { value: 'K' }] }),
    dobInput: atrapaPola(''),
  };
  const listeners = [];
  const win = {
    document: { readyState: 'complete', getElementById: (id) => pola[id] || null, dispatchEvent() { return true; } },
    CustomEvent: function (typ, init) { this.type = typ; this.detail = init && init.detail; },
    Event: function (typ) { this.type = typ; },
    sessionStorage: { getItem: () => null },
    _vildaCurrentPatientId: o.pid || null,
    lastLoadedData: o.baza || null,
    __vildaOstatniWlasnyZapis: o.wlasny || null,
    flushe: 0,
    vildaPersistFlushNow() { win.flushe += 1; },
    VildaVault: {
      onPatientSaved: (cb) => listeners.push(cb),
      normalizePatientName: (n) => String(n || '').toLowerCase().replace(/\s+/g, ' ').trim(),
      getPatient: async (pid) => (o.rekordy && o.rekordy[pid]) || null,
    },
    VildaDobAge: {
      ustawione: [],
      setFromRecord(iso) { win.VildaDobAge.ustawione.push(iso); pola.dobInput.value = iso; pola.dobInput.readOnly = true; pola.dobInput.dataset.dobSource = 'record'; return true; },
      refresh() { return null; },
      clearAll() { pola.dobInput.value = ''; },
    },
  };
  loadBrowserScript('vilda_baseline_pacjenta.js', win);
  return { win, pola, powiadom: (info) => Promise.all(listeners.map((cb) => cb(info))) };
}

const REKORD = (payload) => ({ snapshots: [{ snapshotId: 's2', payload }], snapshotCount: 2 });
const tick = () => new Promise((r) => { setTimeout(r, 20); });

describe('Linia bazowa podąża za rekordem', () => {
  it('montuje się na sejfie i po zmianie wczytanego pacjenta czyta głowę rekordu', async () => {
    const payload = { name: 'Fikcyjna Ola', user: { lastName: 'Fikcyjna', firstName: 'Ola', dobISO: '2021-05-05', sex: 'K' } };
    const s = srodowisko({ pid: 'p1', name: 'Fikcyjna Ola', baza: { name: 'Fikcyjna Ola', user: {} }, rekordy: { p1: REKORD(payload) } });
    expect(s.win.VildaBaselinePacjenta.mount()).toBe(true);
    await s.powiadom({ patientId: 'p1', snapshotId: 's2', isUpdate: true });
    await tick();
    expect(s.win.lastLoadedData.user.dobISO).toBe('2021-05-05');
    expect(s.win.lastLoadedData).not.toBe(payload); // klon, nie ta sama referencja
    expect(s.win.VildaDobAge.ustawione).toEqual(['2021-05-05']);
    expect(s.pola.dobInput.readOnly).toBe(true);
    expect(s.pola.lastName.value).toBe('Fikcyjna');
    expect(s.pola.firstName.value).toBe('Ola');
    expect(s.pola.sex.value).toBe('K');
    expect(s.win.flushe, 'kopia w persistence odświeżona').toBe(1);
  });

  it('nie reaguje na zmianę INNEGO pacjenta niż wczytany', async () => {
    const s = srodowisko({ pid: 'p1', baza: { name: 'A' }, rekordy: { p2: REKORD({ name: 'B', user: { dobISO: '2020-01-01' } }) } });
    await s.powiadom({ patientId: 'p2', snapshotId: 's2', isUpdate: true });
    await tick();
    expect(s.win.lastLoadedData).toEqual({ name: 'A' });
    expect(s.win.VildaDobAge.ustawione).toEqual([]);
  });

  it('echo własnego „Zapisz" z formularza (ta sama wersja przez savePatient) jest pomijane', async () => {
    const s = srodowisko({ pid: 'p1', baza: { name: 'A' }, wlasny: { patientId: 'p1', snapshotId: 's2', kiedy: Date.now() }, rekordy: { p1: REKORD({ name: 'A', user: { dobISO: '2020-01-01' } }) } });
    await s.powiadom({ patientId: 'p1', snapshotId: 's2', isNew: false });
    await tick();
    expect(s.win.lastLoadedData).toEqual({ name: 'A' });
    expect(s.win.flushe).toBe(0);
  });

  // Ekran „Edytuj" i korekta nazwiska aktualizują W MIEJSCU tę samą wersję, którą przed chwilą
  // zapisał formularz — równy snapshotId nie może uchodzić za echo. To była pierwsza wersja
  // bezpiecznika i przez nią data z Karty Pacjenta przepadała.
  it('aktualizacja w miejscu (isUpdate) tej samej wersji NIE jest echem własnego zapisu', async () => {
    const s = srodowisko({ pid: 'p1', name: 'A', baza: { name: 'A' }, wlasny: { patientId: 'p1', snapshotId: 's2', kiedy: Date.now() }, rekordy: { p1: REKORD({ name: 'A', user: { dobISO: '2020-01-01' } }) } });
    await s.powiadom({ patientId: 'p1', snapshotId: 's2', isUpdate: true });
    await tick();
    expect(s.win.lastLoadedData.user.dobISO).toBe('2020-01-01');
  });

  it('gdy lekarz wpisał już INNE dziecko, baza się odświeża, ale tożsamości w polach nie podmienia', async () => {
    const s = srodowisko({ pid: 'p1', name: 'Inny Pacjent', baza: { name: 'Fikcyjna Ola' }, rekordy: { p1: REKORD({ name: 'Fikcyjna Ola', user: { lastName: 'Fikcyjna', firstName: 'Ola', dobISO: '2021-05-05' } }) } });
    await s.powiadom({ patientId: 'p1', snapshotId: 's3', isUpdate: true });
    await tick();
    expect(s.win.lastLoadedData.name).toBe('Fikcyjna Ola');
    expect(s.pola.name.value).toBe('Inny Pacjent');
    expect(s.win.VildaDobAge.ustawione).toEqual([]);
  });

  it('rekord, który stracił datę, zdejmuje blokadę z pola daty', async () => {
    const s = srodowisko({ pid: 'p1', name: 'A', baza: { name: 'A', user: { dobISO: '2020-01-01' } }, rekordy: { p1: REKORD({ name: 'A', user: {} }) } });
    s.pola.dobInput.value = '01-01-2020'; s.pola.dobInput.readOnly = true; s.pola.dobInput.dataset.dobSource = 'record';
    await s.powiadom({ patientId: 'p1', snapshotId: 's3', isUpdate: true });
    await tick();
    expect(s.pola.dobInput.readOnly).toBe(false);
    expect(s.pola.dobInput.dataset.dobSource).toBeUndefined();
    expect(s.win.lastLoadedData.user.dobISO).toBeUndefined();
  });

  it('bez sejfu z powiadomieniami moduł jest bezpiecznym no-op', () => {
    const win = { document: { readyState: 'complete', getElementById: () => null } };
    loadBrowserScript('vilda_baseline_pacjenta.js', win);
    expect(win.VildaBaselinePacjenta.mount()).toBe(false);
  });
});

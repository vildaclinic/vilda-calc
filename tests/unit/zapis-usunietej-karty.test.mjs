import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-ZAPIS-USUNIETEJ (decyzja właściciela 2026-10-08: „zrób to zgodnie z rekomendacjami” — przegląd „co dalej po #518”,
// punkt A13: odmówić zapisu do karty usuniętej albo scalonej i wskazać kartę, z którą ją scalono).
//
// Mierzone na `audyt` 8c13b80 (każdy przypadek niżej wtedy nie przechodził, kontrole przechodziły):
//   - zapis z id karty usuniętej (removePatient) albo scalonej („Scal pacjentów”) zakładał ją od nowa z jedną wersją
//     i zdejmował nagrobek: po scaleniu na liście wracał duplikat, po usunięciu — pacjent; komunikat „Zapisano nowego
//     pacjenta”;
//   - tak samo korekta wersji i pomiaru na takiej karcie kończyła się technicznym błędem bez wskazania karty;
//   - główny „Zapisz dane” w oknie, które trzymało kartę scaloną w innej karcie przeglądarki, wskrzeszał ją.
//
// Reguła po zmianie: savePatient pod blokadą pacjenta czyta rekord świeżo; gdy go nie ma, a jest lokalny nagrobek,
// odmawia (code PATIENT_DELETED) i nic nie zapisuje. Odmowa wskazuje kartę, pod którą leżą dziś wersje tej karty
// (mergedIntoPatientId), gdy sejf zna którąś z nich. Ponowienie do tej karty z opcją dolaczPoScaleniu dopisuje wiersze
// karty docelowej, niczego nie zastępuje i o nic nie pyta. Karta nieznana (bez nagrobka) — zapis jak dotąd.
//
// Prawdziwy vilda_vault.js (i vilda_data_import_export.js) na magazynie w pamięci. Dane wyłącznie FIKCYJNE.

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function okno() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0'); // retencja wyłączona: testy liczą wersje same
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  return win.VildaVault;
}

// Magazyn, który liczy zapisy (put…, remove…) i odczyty nagrobków.
function zLicznikiem(adapter) {
  const licz = { zapisy: 0, nagrobki: 0 };
  const owiniety = new Proxy(adapter, {
    get(cel, klucz) {
      const f = cel[klucz];
      if (typeof f !== 'function') return f;
      return function (...args) {
        if (/^(put|remove)/.test(String(klucz))) licz.zapisy += 1;
        if (klucz === 'listTombstonesForUser') licz.nagrobki += 1;
        return f.apply(cel, args);
      };
    },
  });
  return { owiniety, licz };
}

let licznik = 0;
async function konto() {
  licznik += 1;
  const haslo = `Zapis#Usunietej!2026${licznik}aa`;
  const v = okno();
  const baza = v.createInMemoryAdapter();
  const w = zLicznikiem(baza);
  v.setStorageAdapter(w.owiniety);
  await v.createUser(haslo, { label: `dev${licznik}`, iterations: 10000 });
  const [u] = await v.listUsers();
  /* Druga karta przeglądarki: świeży sejf na tym samym magazynie — nic nie wczytywał. */
  async function drugaKarta() {
    const v2 = okno();
    v2.setStorageAdapter(baza);
    await v2.unlockUser(u.userId, haslo);
    return v2;
  }
  return { v, baza, uid: u.userId, licz: w.licz, drugaKarta };
}

const pomiar = (ageMonths, height) => ({ ageMonths, ageYears: ageMonths / 12, height: height || 90 + ageMonths / 2, weight: 12 + ageMonths / 6 });
const payload = (wiersze, { imie = 'Jan', dobISO } = {}) => ({
  name: `Testowy ${imie}`,
  user: Object.assign({ lastName: 'Testowy', firstName: imie, sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 }, dobISO ? { dobISO } : {}),
  advanced: { data: { measurements: wiersze.map((w) => (Array.isArray(w) ? pomiar(w[0], w[1]) : pomiar(w))) } },
});
const wiersze = (snap) => ((((snap || {}).payload || {}).advanced || {}).data || {}).measurements || [];
const klucze = (snap) => wiersze(snap).map((m) => `${m.ageMonths}:${m.height}`).sort();
const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function karta(v, kolejne, opcje) {
  const a = await v.savePatient(payload(kolejne[0], opcje), { dedup: false });
  for (const w of kolejne.slice(1)) {
    await chwila(5);
    await v.savePatient(payload(w, opcje), { patientId: a.patientId, dedup: false });
  }
  return a.patientId;
}

async function stan(d, pid) {
  const rek = await d.baza.getPatientForUser(d.uid, pid);
  const wersje = await d.baza.listSnapshotsForUser(d.uid, pid);
  const nagrobki = (await d.baza.listTombstonesForUser(d.uid)).filter((t) => t.patientId === pid);
  return { rekord: !!rek, wersje: wersje.length, nagrobek: nagrobki.length > 0 };
}

async function odmowa(p) {
  try { await p; } catch (e) { return e; }
  return null;
}

describe('A13 — sejf odmawia zapisu do karty usuniętej albo scalonej', () => {
  it('po usunięciu: odmowa PATIENT_DELETED, nic nie zapisano, nagrobek zostaje', async () => {
    const d = await konto();
    const x = await karta(d.v, [[60], [60, 66]]);
    await d.v.removePatient(x);
    const przed = d.licz.zapisy;
    const e = await odmowa(d.v.savePatient(payload([60, 66, 72]), { patientId: x, dedup: false }));
    expect(e && e.code).toBe('PATIENT_DELETED');
    expect(e.patientId).toBe(x);
    expect(e.mergedIntoPatientId).toBeNull();
    expect(e.deletedAtISO).toEqual(expect.any(String));
    expect(e.vildaSaveBusy, 'to nie jest „zajęte w innej karcie”').toBeUndefined();
    expect(e.message).toMatch(/usunięto albo scalono/);
    expect(d.licz.zapisy - przed, 'zero zapisów w magazynie').toBe(0);
    expect(await stan(d, x)).toEqual({ rekord: false, wersje: 0, nagrobek: true });
    expect((await d.v.listPatients()).map((p) => p.patientId)).not.toContain(x);
  });

  it('po scaleniu w tym samym oknie: odmowa wskazuje kartę docelową, jej nazwę i zgodną tożsamość', async () => {
    const d = await konto();
    const x = await karta(d.v, [[60], [60, 66]]);
    const y = await karta(d.v, [[48], [48, 54]]);
    await d.v.mergePatients(x, y);
    const yPrzed = await stan(d, y);
    const e = await odmowa(d.v.savePatient(payload([60, 66, 72]), { patientId: x, dedup: false }));
    expect(e && e.code).toBe('PATIENT_DELETED');
    expect(e.mergedIntoPatientId).toBe(y);
    expect(e.mergedIntoName).toBe('Testowy Jan');
    expect(e.mergedIntoSameIdentity).toBe(true);
    expect(e.message).toBe('Tego pacjenta scalono z kartą „Testowy Jan” — nic nie zapisano.');
    expect(await stan(d, x)).toEqual({ rekord: false, wersje: 0, nagrobek: true });
    expect(await stan(d, y), 'karta docelowa bez zmian').toEqual(yPrzed);
    expect((await d.v.listPatients()).filter((p) => p.header && p.header.name === 'Testowy Jan'), 'bez duplikatu').toHaveLength(1);
  });

  it('druga karta przeglądarki: bez wskazówki „usunięto albo scalono”; z znaneWersje albo baseSnapshotId — karta docelowa', async () => {
    const d = await konto();
    const x = await karta(d.v, [[60], [60, 66]]);
    const y = await karta(d.v, [[48], [48, 54]]);
    const sidX = (await d.v.getPatient(x)).snapshots[0].snapshotId;
    await d.v.mergePatients(x, y);
    const b = await d.drugaKarta();
    const bez = await odmowa(b.savePatient(payload([60, 66, 72]), { patientId: x, dedup: false }));
    expect(bez && bez.code).toBe('PATIENT_DELETED');
    expect(bez.mergedIntoPatientId).toBeNull();
    const zWersja = await odmowa(b.savePatient(payload([60, 66, 72]), { patientId: x, dedup: false, znaneWersje: [sidX] }));
    expect(zWersja && zWersja.mergedIntoPatientId).toBe(y);
    const zBaza = await odmowa(b.savePatient(payload([60, 66, 72]), { patientId: x, dedup: false, baseSnapshotId: sidX }));
    expect(zBaza && zBaza.mergedIntoPatientId).toBe(y);
    expect(await stan(d, x)).toEqual({ rekord: false, wersje: 0, nagrobek: true });
  });

  it('karta docelowa z inną datą urodzenia: odmowa wskazuje kartę, ale tożsamość niezgodna', async () => {
    const d = await konto();
    const x = await karta(d.v, [[60], [60, 66]], { dobISO: '2020-01-01' });
    const y = await karta(d.v, [[48], [48, 54]], { dobISO: '2020-02-02' });
    await d.v.mergePatients(x, y);
    const e = await odmowa(d.v.savePatient(payload([60, 66, 72], { dobISO: '2020-01-01' }), { patientId: x, dedup: false }));
    expect(e && e.mergedIntoPatientId).toBe(y);
    expect(e.mergedIntoSameIdentity).toBe(false);
  });

  it('odmowa zapada przed pytaniem „Ktoś inny zmienił ten rekord” (rozstrzygacz nie jest wołany)', async () => {
    const d = await konto();
    const x = await karta(d.v, [[60], [60, 66]]);
    const glowaX = (await d.v.getPatient(x)).snapshots[0].payload;
    await d.v.removePatient(x);
    let pytania = 0;
    d.v.setSaveConflictResolver(async () => { pytania += 1; return 'scal'; });
    const e = await odmowa(d.v.savePatient(payload([60, 66, 72]), { patientId: x, baselinePayload: glowaX }));
    expect(e && e.code).toBe('PATIENT_DELETED');
    expect(pytania).toBe(0);
  });

  it('id z treści zapisu (payload.patientId) i osoba spoza bazy z id: ta sama odmowa', async () => {
    const d = await konto();
    const x = await karta(d.v, [[60]]);
    await d.v.removePatient(x);
    const e1 = await odmowa(d.v.savePatient(Object.assign(payload([60, 66]), { patientId: x })));
    expect(e1 && e1.code).toBe('PATIENT_DELETED');
    const zew = await d.v.saveExternalPatient({ firstName: 'Ola', lastName: 'Testowa', sex: 'K' });
    await d.v.removePatient(zew.patientId);
    const e2 = await odmowa(d.v.saveExternalPatient({ patientId: zew.patientId, firstName: 'Ola', lastName: 'Testowa', sex: 'K' }));
    expect(e2 && e2.code).toBe('PATIENT_DELETED');
    expect(await stan(d, zew.patientId)).toEqual({ rekord: false, wersje: 0, nagrobek: true });
  });

  it('korekta wersji i pomiaru na karcie scalonej albo usuniętej: ta sama odmowa (zamiast błędu technicznego)', async () => {
    const d = await konto();
    const x = await karta(d.v, [[60], [60, 66]]);
    const y = await karta(d.v, [[48]]);
    const sidX = (await d.v.getPatient(x)).snapshots[0].snapshotId;
    await d.v.mergePatients(x, y);
    const e1 = await odmowa(d.v.updateSnapshotPayload(x, sidX, payload([60, 66]), { preserveSavedAt: true }));
    expect(e1 && e1.code).toBe('PATIENT_DELETED');
    expect(e1.mergedIntoPatientId).toBe(y);
    const z = await karta(d.v, [[50], [50, 56]], { imie: 'Adam' });
    await d.v.removePatient(z);
    const e2 = await odmowa(d.v.updateMeasurementRow(z, { key: '56' }, { height: 120 }));
    expect(e2 && e2.code).toBe('PATIENT_DELETED');
    const e3 = await odmowa(d.v.deleteMeasurementRow(z, { key: '56' }));
    expect(e3 && e3.code).toBe('PATIENT_DELETED');
  });
});

describe('A13 — kontrole: co się nie zmienia', () => {
  it('karta nieznana (id bez rekordu i bez nagrobka): zapis jak dotąd zakłada kartę', async () => {
    const d = await konto();
    const w = await d.v.savePatient(payload([60]), { patientId: 'karta-z-innego-urzadzenia-1', dedup: false });
    expect(w.patientId).toBe('karta-z-innego-urzadzenia-1');
    expect(w.isNew).toBe(true);
    expect(await stan(d, w.patientId)).toEqual({ rekord: true, wersje: 1, nagrobek: false });
  });

  it('nowa karta bez id nie czyta nagrobków (bez kosztu dla „Dodaj pacjenta”)', async () => {
    const d = await konto();
    const przed = d.licz.nagrobki;
    await d.v.savePatient(payload([60]), { dedup: false });
    expect(d.licz.nagrobki - przed).toBe(0);
  });

  it('jawny import starego pliku JSON z id karty usuniętej przywraca ją jak dotąd', async () => {
    const d = await konto();
    const x = await karta(d.v, [[60]]);
    await d.v.removePatient(x);
    const w = await d.v.importLegacyJsonPatient(Object.assign(payload([60, 66]), { patientId: x }));
    expect(w.patientId).toBe(x);
    expect(await stan(d, x)).toEqual({ rekord: true, wersje: 1, nagrobek: false });
  });

  it('„Scal pacjentów” działa dalej (wewnętrzny zapis do karty docelowej)', async () => {
    const d = await konto();
    const x = await karta(d.v, [[60], [60, 66]]);
    const y = await karta(d.v, [[48], [48, 54]]);
    const wynik = await d.v.mergePatients(x, y);
    expect(wynik.targetPatientId).toBe(y);
    expect(await stan(d, y)).toEqual({ rekord: true, wersje: 5, nagrobek: false });
  });
});

describe('A13 — ponowienie do karty docelowej scalenia (dolaczPoScaleniu)', () => {
  /* X: 60, 66:123. Y: 48, 54, 66:125. Po scaleniu głowa Y ma oba wiersze z 66. miesiąca. Formularz X: lekarz poprawił
     66 na 124 i dopisał 72. */
  async function przygotuj() {
    const d = await konto();
    const x = await karta(d.v, [[[60, 120]], [[60, 120], [66, 123]]]);
    const y = await karta(d.v, [[48], [48, 54], [48, 54, [66, 125]]]);
    const glowaX = (await d.v.getPatient(x)).snapshots[0].payload;
    await d.v.mergePatients(x, y);
    expect(klucze((await d.v.getPatient(y)).snapshots[0]), 'kontrola: głowa Y po scaleniu').toEqual(
      ['48:114', '54:117', '60:120', '66:123', '66:125'].sort());
    return { d, x, y, glowaX };
  }

  it('dopisuje wiersze karty docelowej, niczego nie zastępuje i o nic nie pyta', async () => {
    const { d, x, y, glowaX } = await przygotuj();
    let pytania = 0;
    d.v.setSaveConflictResolver(async () => { pytania += 1; return 'scal'; });
    const w = await d.v.savePatient(payload([[60, 120], [66, 124], 72]), { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    expect(pytania, 'bez pytania').toBe(0);
    expect(w.patientId).toBe(y);
    expect(w.isNew).toBe(false);
    expect(klucze((await d.v.getPatient(y)).snapshots[0]), 'pomiary Y zostają, poprawka lekarza zostaje, 66:123 nie wraca').toEqual(
      ['48:114', '54:117', '60:120', '66:124', '66:125', '72:126'].sort());
    expect(await stan(d, x), 'X nie wraca').toEqual({ rekord: false, wersje: 0, nagrobek: true });
  });

  it('wiersz skasowany przez lekarza w formularzu (był w bazie X) nie wraca', async () => {
    const { d, x, y, glowaX } = await przygotuj();
    await d.v.savePatient(payload([[66, 123], 72]), { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    expect(klucze((await d.v.getPatient(y)).snapshots[0])).toEqual(['48:114', '54:117', '66:123', '66:125', '72:126'].sort());
  });

  it('wiersz karty docelowej, który formularz trzyma w drugiej sekcji, nie jest dublowany', async () => {
    const { d, x, y, glowaX } = await przygotuj();
    const dane = payload([[60, 120], [66, 124], 72]);
    dane.growthBasic = { data: { measurements: [pomiar(48)] } }; // ten sam pomiar co w głowie Y, ale w „podstawowych”
    await d.v.savePatient(dane, { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    const g = (await d.v.getPatient(y)).snapshots[0].payload;
    const wszystkie = ['advanced', 'growthBasic'].flatMap((l) => (((g[l] || {}).data || {}).measurements || []));
    expect(wszystkie.filter((m) => m.ageMonths === 48), 'jeden wiersz z 48. miesiąca').toHaveLength(1);
    expect(wszystkie.filter((m) => m.ageMonths === 54), 'wiersz Y z 54. miesiąca dopisany').toHaveLength(1);
  });

  /* Poprawka po przeglądzie (Codex P1 x2 w #586): poza wierszami ponowienie przejmuje kartę docelową jak „Scal
     pacjentów” — jej dane zostają, z formularza idą tylko zmiany lekarza względem kopii wczytanej. */
  async function przygotujSekcje({ bezPlciX = false } = {}) {
    const d = await konto();
    const zX = Object.assign(payload([[60, 120], [66, 123]]), { ghTherapyPoints: [{ ageMonths: 60, dose: 0.025 }], plan: { tekst: 'plan X', dieta: 'zwykła' } });
    zX.advanced.motherHeight = 160;
    zX.advanced.fatherHeight = 180;
    if (bezPlciX) delete zX.user.sex;
    const x = (await d.v.savePatient(zX, { dedup: false })).patientId;
    const zY = Object.assign(payload([48, 54]), {
      ghTherapyPoints: [{ ageMonths: 54, dose: 0.03 }], birth: { weightG: 3200 }, doctor: { name: 'Dr Fikcyjny' }, plan: { tekst: 'plan Y' },
    });
    zY.advanced.motherHeight = 165;
    Object.assign(zY.user, { height: 104, weight: 17 });
    const y = (await d.v.savePatient(zY, { dedup: false })).patientId;
    const glowaX = (await d.v.getPatient(x)).snapshots[0].payload;
    await d.v.mergePatients(x, y);
    const glowaY = (await d.v.getPatient(y)).snapshots[0].payload;
    expect(glowaY.ghTherapyPoints, 'kontrola: scalenie łączy punkty').toHaveLength(2);
    expect(glowaY.birth, 'kontrola: sekcja tylko Y').toEqual({ weightG: 3200 });
    expect(glowaY.advanced.motherHeight, 'kontrola: scalenie trzyma wartość karty docelowej').toBe(165);
    return { d, x, y, glowaX };
  }
  const formularzX = (glowaX, zmien) => { const f = JSON.parse(JSON.stringify(glowaX)); f.advanced.data.measurements.push(pomiar(72)); if (zmien) zmien(f); return f; };
  const dawki = (p) => (p.ghTherapyPoints || []).map((q) => `${q.ageMonths}:${q.dose}`).sort();

  it('sekcje karty docelowej zostają (punkty terapii, dane urodzeniowe, lekarz, plan); punkt dodany przez lekarza dochodzi', async () => {
    const { d, x, y, glowaX } = await przygotujSekcje();
    const f = formularzX(glowaX, (q) => { q.ghTherapyPoints.push({ ageMonths: 72, dose: 0.033 }); });
    await d.v.savePatient(f, { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    const g = (await d.v.getPatient(y)).snapshots[0].payload;
    expect(dawki(g)).toEqual(['54:0.03', '60:0.025', '72:0.033']);
    expect(g.birth).toEqual({ weightG: 3200 });
    expect(g.doctor).toEqual({ name: 'Dr Fikcyjny' });
    expect(g.plan, 'plan niezmieniony przez lekarza — z karty docelowej').toEqual({ tekst: 'plan Y' });
    expect(g.advanced.motherHeight, 'wzrost matki z karty docelowej, nie ze starej karty').toBe(165);
    expect(klucze({ payload: g })).toContain('72:126');
  });

  it('zmiany lekarza w formularzu wygrywają: usunięty punkt nie wraca, poprawiony plan zostaje', async () => {
    const { d, x, y, glowaX } = await przygotujSekcje();
    const f = formularzX(glowaX, (q) => { q.ghTherapyPoints = []; q.plan = { tekst: 'plan po wizycie' }; });
    await d.v.savePatient(f, { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    const g = (await d.v.getPatient(y)).snapshots[0].payload;
    expect(dawki(g), 'punkt X usunięty przez lekarza, punkt Y zostaje').toEqual(['54:0.03']);
    expect(g.plan).toEqual({ tekst: 'plan po wizycie' });
  });

  it('brak płci w starej karcie nie kasuje płci karty docelowej (ładunek i nagłówek)', async () => {
    const { d, x, y, glowaX } = await przygotujSekcje({ bezPlciX: true });
    expect(glowaX.user.sex, 'kontrola: X bez płci').toBeUndefined();
    await d.v.savePatient(formularzX(glowaX), { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    const r = await d.v.getPatient(y);
    expect(r.snapshots[0].payload.user.sex).toBe('M');
    expect(r.header.sex).toBe('M');
  });

  it('formularz z sekcjami domyślnymi i wyzerowaną wizytą (jak prawdziwy formularz): dane karty docelowej zostają', async () => {
    const { d, x, y, glowaX } = await przygotujSekcje();
    const f = formularzX(glowaX, (q) => {
      q.doctor = { isDoctor: null, pwzNumber: null }; // sekcja domyślna formularza — w starej karcie jej nie było
      q.plan = Object.fromEntries(Object.entries(q.plan).reverse()); // ten sam plan, inna kolejność kluczy
      Object.assign(q.user, { height: null, weight: null }); // „Nowy pomiar” zeruje wizytę, lekarz nic nie wpisał
    });
    await d.v.savePatient(f, { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    const g = (await d.v.getPatient(y)).snapshots[0].payload;
    expect(g.doctor).toEqual({ name: 'Dr Fikcyjny' });
    expect(g.plan).toEqual({ tekst: 'plan Y' });
    expect([g.user.height, g.user.weight], 'wizyta karty docelowej zostaje').toEqual([104, 17]);
  });

  it('puste pole karty docelowej nie kasuje wartości ze starej karty', async () => {
    const { d, x, y, glowaX } = await przygotujSekcje();
    const r = await d.v.getPatient(y);
    const bezOjca = JSON.parse(JSON.stringify(r.snapshots[0].payload));
    bezOjca.advanced.fatherHeight = null;
    await d.v.savePatient(bezOjca, { patientId: y, dedup: false, baseSnapshotId: r.snapshots[0].snapshotId, skipAdvancedAntiClobber: true });
    expect((await d.v.getPatient(y)).snapshots[0].payload.advanced.fatherHeight, 'kontrola').toBeNull();
    await d.v.savePatient(formularzX(glowaX), { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    expect((await d.v.getPatient(y)).snapshots[0].payload.advanced.fatherHeight).toBe(180);
  });

  it('bieżąca wizyta wpisana przez lekarza zostaje w polach pacjenta', async () => {
    const { d, x, y, glowaX } = await przygotujSekcje();
    const f = formularzX(glowaX, (q) => { Object.assign(q.user, { age: 6, ageMonths: 0, height: 112, weight: 20 }); });
    await d.v.savePatient(f, { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    const u = (await d.v.getPatient(y)).snapshots[0].payload.user;
    expect([u.age, u.ageMonths, u.height, u.weight]).toEqual([6, 0, 112, 20]);
  });

  it('kontrola: bez dolaczPoScaleniu zapis do Y pyta jak dotąd', async () => {
    const { d, y, glowaX } = await przygotuj();
    let pytania = 0;
    d.v.setSaveConflictResolver(async () => { pytania += 1; return 'scal'; });
    await d.v.savePatient(payload([[60, 120], [66, 124], 72]), { patientId: y, baselinePayload: glowaX });
    expect(pytania).toBe(1);
  });
});

/* Główny „Zapisz dane” (prawdziwy vilda_data_import_export.js) w oknie, które trzyma kartę X. */
function formularz(V, { sesja, idOkna } = {}) {
  const pole = (id) => ({
    id, value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    dispatchEvent() { return true; }, addEventListener() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
  });
  const pola = {};
  ['name', 'age', 'weight', 'height'].forEach((id) => { pola[id] = pole(id); });
  const kom = []; const zd = []; const opcje = [];
  const ses = sesja || magazyn();
  const w = {
    localStorage: magazyn(), sessionStorage: ses, setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    requestAnimationFrame: (f) => setTimeout(f, 0), location: { pathname: '/index.html', href: 'http://localhost/index.html' },
    Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = (i || {}).detail; } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    document: {
      readyState: 'complete', hidden: false, addEventListener() {}, removeEventListener() {}, dispatchEvent(e) { zd.push(e); return true; },
      getElementById: (id) => pola[id] || null, querySelector: () => null, querySelectorAll: () => [], body: pole('body'), documentElement: pole('html'),
    },
    VildaStatusBar: { pokaz(o) { kom.push({ tekst: o.tekst, ton: o.ton }); return true; } },
  };
  w.window = w; w.self = w; w.top = w; w.parent = w;
  w.VildaPersistence = { updateShared(fn) { const k = {}; fn(k, {}); return k; }, readShared: () => ({}), writeShared: () => true, writeMainSession: () => true, readMainSession: () => null };
  w.VildaPanelPacjent = { wczytanie() {}, nieaktualny: () => false, cel: (d) => d };
  w.VildaVault = Object.assign(Object.create(V), { savePatient(p, o) { opcje.push(JSON.parse(JSON.stringify(Object.assign({}, o, { baselinePayload: undefined })))); return V.savePatient(p, o); } });
  if (idOkna) { w._vildaCurrentPatientId = idOkna; ses.setItem('vildaCurrentPatientId', idOkna); }
  loadBrowserScript('vilda_data_import_export.js', w);
  const zapisz = (dane) => w.VildaDataImportExport.saveUserData({ collectUserData: () => JSON.parse(JSON.stringify(dane)) });
  return { w, kom, zd, opcje, ses, zapisz };
}

describe('A13 — główny „Zapisz dane” w oknie z kartą scaloną albo usuniętą', () => {
  it('scalona, ta sama tożsamość: odmowa z nazwą karty, formularz bez zmian; drugi klik dopisuje do karty docelowej', async () => {
    const d = await konto();
    const x = await karta(d.v, [[[60, 120]], [[60, 120], [66, 123]]]);
    const y = await karta(d.v, [[48], [48, 54]]);
    const glowaX = (await d.v.getPatient(x)).snapshots[0].payload;
    await d.v.mergePatients(x, y);
    const F = formularz(d.v, { idOkna: x });
    F.w.lastLoadedData = JSON.parse(JSON.stringify(glowaX));
    const baza = F.w.lastLoadedData;
    const dane = payload([[60, 120], [66, 123], 72]);

    await F.zapisz(dane);
    expect(F.kom.at(-1)).toEqual({
      tekst: 'Nie zapisano — tego pacjenta scalono z kartą „Testowy Jan”. Dane w formularzu zostały. Kliknij „Zapisz dane” jeszcze raz, aby dopisać je do tamtej karty.',
      ton: 'blad',
    });
    expect(F.w.lastLoadedData, 'baza formularza bez zmian').toBe(baza);
    expect(F.zd, 'bez zdarzenia wczytania').toHaveLength(0);
    expect(F.w._vildaCurrentPatientId, 'okno nie celuje już w X').toBeNull();
    expect(F.ses.getItem('vildaCurrentPatientId')).toBeNull();
    expect(await stan(d, x)).toEqual({ rekord: false, wersje: 0, nagrobek: true });

    await F.zapisz(dane);
    expect(F.opcje.at(-1)).toMatchObject({ patientId: y, dolaczPoScaleniu: x });
    expect(F.kom.at(-1).ton).toBe('ok');
    expect(klucze((await d.v.getPatient(y)).snapshots[0])).toEqual(['48:114', '54:117', '60:120', '66:123', '72:126'].sort());
    expect(F.zd.at(-1).detail).toMatchObject({ patientId: y, source: 'save' });
    expect(await stan(d, x)).toEqual({ rekord: false, wersje: 0, nagrobek: true });
  });

  it('scalona z kartą o innej dacie urodzenia: kolejne kliknięcia nic nie zapisują i nie zakładają duplikatu', async () => {
    const d = await konto();
    const x = await karta(d.v, [[60], [60, 66]], { dobISO: '2020-01-01' });
    const y = await karta(d.v, [[48]], { dobISO: '2020-02-02' });
    const glowaX = (await d.v.getPatient(x)).snapshots[0].payload;
    await d.v.mergePatients(x, y);
    const F = formularz(d.v, { idOkna: x });
    F.w.lastLoadedData = JSON.parse(JSON.stringify(glowaX));
    const dane = payload([60, 66, 72], { dobISO: '2020-01-01' });
    const ile = (await d.v.listPatients()).length;
    await F.zapisz(dane);
    await F.zapisz(dane);
    expect(F.kom.at(-1).tekst).toBe('Nie zapisano — tego pacjenta scalono z kartą „Testowy Jan”, która ma inne nazwisko albo datę urodzenia. Dane w formularzu zostały. Otwórz tamtą kartę z listy pacjentów i wpisz w niej nowe dane.');
    expect(F.opcje, 'drugi klik nie dochodzi do sejfu').toHaveLength(1);
    expect((await d.v.listPatients()).length).toBe(ile);
  });

  it('usunięta: odmowa, a drugi klik zapisuje zwykłym dopasowaniem (bez id usuniętej karty)', async () => {
    const d = await konto();
    const x = await karta(d.v, [[60], [60, 66]], { imie: 'Adam' });
    const glowaX = (await d.v.getPatient(x)).snapshots[0].payload;
    await d.v.removePatient(x);
    const b = await d.drugaKarta(); // okno, które nie wie o usunięciu
    const F = formularz(b, { idOkna: x });
    F.w.lastLoadedData = JSON.parse(JSON.stringify(glowaX));
    const dane = payload([60, 66, 72], { imie: 'Adam' });
    await F.zapisz(dane);
    expect(F.kom.at(-1).tekst).toBe('Nie zapisano — tego pacjenta usunięto albo scalono z inną kartą. Dane w formularzu zostały. Kliknij „Zapisz dane” jeszcze raz — aplikacja dobierze kartę tak jak przy każdym zapisie.');
    await F.zapisz(dane);
    expect(F.opcje.at(-1).patientId, 'ponowienie bez id usuniętej karty').toBeUndefined();
    expect(F.kom.at(-1).ton).toBe('nowy');
    expect(await stan(d, x), 'X nie wraca').toEqual({ rekord: false, wersje: 0, nagrobek: true });
  });
});

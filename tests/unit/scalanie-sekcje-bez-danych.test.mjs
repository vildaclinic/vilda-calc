import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SCALANIE-SEKCJE (przegląd „trzy wady”, wada 3: badacz i krytyk 2026-10-14; wariant (c+) z raportu krytyka).
//
// „Scal pacjentów” (mergePatients → Bsc1) brało sekcję kartoteki ze starej karty tylko wtedy, gdy w karcie docelowej
// sekcja była null. Strony zapisują jednak niewypełnione sekcje jako obiekty z wartościami domyślnymi: PAL dobrany
// regułą wieku przy palWybrany:false, PAL karty spożycia, puste listy posiłków, ukryty znacznik lekarza na docpro
// (isDoctor:true), pustą sesję klirensu v2 z jednostkami i stanami. Wypełniona sekcja starej karty znikała wtedy po cichu
// z bieżącej wersji karty docelowej. Ta sama przyczyna w ponowieniu zapisu po scaleniu (Bdo_sekcje, P-ZAPIS-USUNIETEJ-3):
// przeliczony domyślny PAL w formularzu starej karty liczył się jako „zmiana lekarza” i kasował WYBRANY plan karty docelowej.
//
// Reguła po zmianie: sekcja karty docelowej „bez danych” (wartości domyślne strony, które nie są decyzją ani wpisem
// lekarza) jest zastępowana W CAŁOŚCI sekcją starej karty, która ma dane; sekcji nie łączymy pole po polu. Karta
// docelowa bez sekcji (null) — jak dotąd. W ponowieniu zapisu sekcja „bez danych” w formularzu nie jest zmianą lekarza,
// a sekcja „bez danych” karty docelowej nie zastępuje sekcji z formularza.
//
// Prawdziwy vilda_vault.js na magazynie w pamięci; kształty zapisu stron z tests/fixtures/scalanie-sekcje-ksztalty.json
// (przechwycone z collectUserData na index, docpro i kalkulator-klirens). Strażnicy porównują regułę sejfu z prawdziwym
// vildaPalZapisuWybrany (vilda_data_import_export.js) i z polami karty pacjenta w kalkulator-klirens.html.
// Oznaczenia: [czerwony na audyt] — nie przechodził na `audyt` 2df41a8; [kontrola] — przechodził (zachowanie bez zmian).
// Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');
const K = JSON.parse(czytaj('tests/fixtures/scalanie-sekcje-ksztalty.json'));
const kopia = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

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

let licznik = 0;
async function konto() {
  licznik += 1;
  const v = okno();
  v.setStorageAdapter(v.createInMemoryAdapter());
  await v.createUser(`Scal#Sekcje!2026${licznik}aa`, { label: `sekcje${licznik}`, iterations: 10000 });
  return v;
}

const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });
const pomiar = (m) => ({ ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
const wiekiWierszy = (p) => (((p || {}).advanced || {}).data || {}).measurements.map((w) => w.ageMonths).sort((a, b) => a - b);

/* Zapis strony: PRAWDZIWY kształt z collectUserData (domyślnie index.html z wiekiem) z podmienionymi sekcjami. Strona
   bez wpisanego nazwiska (docpro, klirens w fixture) dostaje je jak od lekarza — bez nazwiska sejf zapisu nie przyjmie. */
function zapis(sekcje, { baza = K.indexZWiekiem, wiersze } = {}) {
  const p = kopia(baza);
  if (!p.name) {
    p.name = 'Testowy Jan';
    Object.assign(p.user, { lastName: 'Testowy', firstName: 'Jan' });
  }
  Object.keys(sekcje || {}).forEach((k) => { p[k] = kopia(sekcje[k]); });
  if (wiersze) p.advanced.data.measurements = wiersze.map(pomiar);
  return p;
}

/* X (stara karta) zapisany pierwszy, Y (karta docelowa) drugi; mergePatients(X, Y); głowa Y. */
async function scal(zX, zY, v) {
  const s = v || (await konto());
  const x = (await s.savePatient(zX, { dedup: false })).patientId;
  await chwila(3);
  const y = (await s.savePatient(zY, { dedup: false })).patientId;
  const glowaX = (await s.getPatient(x)).snapshots[0].payload;
  const wynik = await s.mergePatients(x, y);
  const r = await s.getPatient(y);
  return { v: s, x, y, glowaX, wynik, r, g: r.snapshots[0].payload };
}

// Sekcje wypełnione w starej karcie X (lekarz wybrał PAL i dietę, wpisał cel, historię spożycia, posiłki, PWZ).
const planX = { palFactor: 1.8, palWybrany: true, dietLevel: 'redukcyjna', dietaWybrana: true, customGoalKg: 18 };
const intakeX = { pal: '1.8', history: [{ dateISO: '2026-01-01', kcal: 1500 }], estKcalPerDay: 1500 };
const foodsX = { snacks: [{ key: 'jablko', qty: 1 }], meals: [] };
const doctorX = { isDoctor: true, pwzNumber: '0000000' };
const planDomyslnyIndex = K.indexZWiekiem.plan; // {1.6, palWybrany:false, dietLevel:null, dietaWybrana:false, customGoalKg:null}

describe('P-SCALANIE-SEKCJE — prawdziwe kształty stron (kontrola przechwyconego zapisu)', () => {
  it('fixture: niewypełnione sekcje stron to obiekty z wartościami domyślnymi, nie null', () => {
    expect(K.indexZWiekiem.plan).toEqual({ palFactor: 1.6, palWybrany: false, dietLevel: null, dietaWybrana: false, customGoalKg: null });
    expect(K.indexZWiekiem.intake).toEqual({ pal: '1.6', history: null, estKcalPerDay: null });
    expect(K.indexBezWieku.plan.palFactor).toBeNull();
    expect(K.indexBezWieku.intake.pal).toBe('1.4');
    expect(K.docpro.doctor).toEqual({ isDoctor: true, pwzNumber: null });
    expect(K.klirensPusty.plan).not.toHaveProperty('customGoalKg');
    expect(K.klirensPusty.clcr).toMatchObject({ version: 2, source: 'kalkulator-klirens.html', inputs: { Scr: '', ScrUnit: 'mg/dl', creatinineState: 'unknown' } });
    expect(K.klirensAntropometriaClcr.inputs).toMatchObject({ age: '4', weight: '17', height: '104', Scr: '' });
    expect(K.klirensAntropometriaClcr.summary.clcr.length, 'samo summary nie odróżnia badania od antropometrii').toBeGreaterThan(0);
    expect(K.klirensScrClcr.inputs.Scr).toBe('0.4');
  });
});

describe('P-SCALANIE-SEKCJE — „Scal pacjentów”: sekcja karty docelowej bez danych', () => {
  it('T1 [czerwony na audyt] plan index z wiekiem (PAL domyślny 1,6) → plan starej karty w całości', async () => {
    const { g } = await scal(zapis({ plan: planX }), zapis({}));
    expect(g.plan).toEqual(planX);
  });

  it('T2 [czerwony na audyt] plan docpro, kalkulatora klirensu i index bez wieku (PAL null) → plan starej karty', async () => {
    const v = await konto();
    for (const baza of [K.docpro, K.klirensPusty, K.indexBezWieku]) {
      const { g } = await scal(zapis({ plan: planX }), zapis({}, { baza }), v);
      expect(g.plan).toEqual(planX);
    }
  });

  it('T3 [czerwony na audyt] lekarz z index {isDoctor:null} i {isDoctor:false} bez PWZ → lekarz starej karty', async () => {
    const v = await konto();
    for (const doctor of [K.indexZWiekiem.doctor, { isDoctor: false, pwzNumber: null }]) {
      const { g } = await scal(zapis({ doctor: doctorX }), zapis({ doctor }), v);
      expect(g.doctor).toEqual(doctorX);
    }
  });

  it('T4 [czerwony na audyt] puste listy posiłków → posiłki starej karty', async () => {
    const { g } = await scal(zapis({ foods: foodsX }), zapis({}));
    expect(K.indexZWiekiem.foods).toEqual({ snacks: [], meals: [] });
    expect(g.foods).toEqual(foodsX);
  });

  it('T5 [czerwony na audyt] spożycie z samym PAL karty spożycia (index z wiekiem; {pal 1.4, history []}) → spożycie starej karty w całości', async () => {
    const v = await konto();
    for (const intake of [K.indexZWiekiem.intake, { pal: '1.4', history: [], estKcalPerDay: null }]) {
      const { g } = await scal(zapis({ intake: intakeX }), zapis({ intake }), v);
      expect(g.intake).toEqual(intakeX);
    }
  });

  it('T6 [czerwony na audyt] pokwitanie {} → pokwitanie starej karty', async () => {
    const { g } = await scal(zapis({ puberty: { testicularVolumeL: 4 } }), zapis({ puberty: {} }));
    expect(g.puberty).toEqual({ testicularVolumeL: 4 });
  });

  it('T18 [czerwony na audyt] pusta sesja klirensu (strona klirensu zapisuje ją zawsze) → klirens starej karty (Scr 0,4)', async () => {
    const { g } = await scal(zapis({ clcr: K.klirensScrClcr }), zapis({}, { baza: K.klirensPusty }));
    expect(g.clcr).toEqual(K.klirensScrClcr);
    expect(g.clcr.inputs.Scr).toBe('0.4');
  });

  it('T19 [czerwony na audyt] sesja klirensu z samą antropometrią (summary z BSA) → klirens starej karty', async () => {
    const { g } = await scal(zapis({ clcr: K.klirensScrClcr }), zapis({ clcr: K.klirensAntropometriaClcr }));
    expect(g.clcr).toEqual(K.klirensScrClcr);
  });

  it('T21 [czerwony na audyt] lekarz z docpro {isDoctor:true, PWZ brak} → lekarz starej karty; kontrole: PWZ i nazwisko celu zostają', async () => {
    const v = await konto();
    expect((await scal(zapis({ doctor: doctorX }), zapis({}, { baza: K.docpro }), v)).g.doctor).toEqual(doctorX);
    expect((await scal(zapis({ doctor: doctorX }), zapis({ doctor: { isDoctor: true, pwzNumber: '1111111' } }), v)).g.doctor)
      .toEqual({ isDoctor: true, pwzNumber: '1111111' });
    expect((await scal(zapis({ doctor: doctorX }), zapis({ doctor: { name: 'Dr Fikcyjny' } }), v)).g.doctor).toEqual({ name: 'Dr Fikcyjny' });
  });

  it('T22 [czerwony na audyt] plan bez znaczników sprzed P-PAL-ZAPIS {1,6; dieta} (1,6 = domyślny przy wczytaniu) → plan starej karty', async () => {
    const { g } = await scal(zapis({ plan: planX }), zapis({ plan: { palFactor: 1.6, dietLevel: 'redukcyjna' } }));
    expect(g.plan).toEqual(planX);
  });

  it('T29 [czerwony na audyt] plan otyłości: PAL 1,4 domyślny i dieta zalecona przez silnik (bez znacznika) → plan starej karty', async () => {
    const { g } = await scal(zapis({ plan: planX }), zapis({ plan: { palFactor: 1.4, palWybrany: false, dietLevel: 'redukcyjna', dietaWybrana: false, customGoalKg: null } }));
    expect(g.plan).toEqual(planX);
  });

  it('T25 [czerwony na audyt] „Zostaw ten, scal pozostałe” (kolejność listPatients): sekcję bez danych wypełnia ostatnio zapisana karta z danymi', async () => {
    const v = await konto();
    const plan = (palFactor) => ({ palFactor, palWybrany: true, dietLevel: null, dietaWybrana: false, customGoalKg: null });
    const y = (await v.savePatient(zapis({}), { dedup: false })).patientId;
    await chwila(5);
    const x1 = (await v.savePatient(zapis({ plan: plan(1.8) }), { dedup: false })).patientId;
    await chwila(5);
    const x2 = (await v.savePatient(zapis({ plan: plan(1.2) }), { dedup: false })).patientId;
    const lista = (await v.listPatients()).map((p) => p.patientId);
    expect(lista, 'lista: najnowszy zapis pierwszy').toEqual([x2, x1, y]);
    // vilda_auth_ui.js: źródła w kolejności listy, po kolei, cel = wskazany rekord
    for (const id of lista.filter((id) => id !== y)) await v.mergePatients(id, y);
    const r = await v.getPatient(y);
    expect(r.snapshots[0].payload.plan).toEqual(plan(1.2));
    expect(r.snapshots.map((s) => s.seq).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('P-SCALANIE-SEKCJE — kontrole: dane karty docelowej wygrywają, sekcji nie mieszamy', () => {
  it('T7 [kontrola] plan z wybranym PAL bez diety zostaje — bez doklejania diety starej karty', async () => {
    const planY = { palFactor: 1.4, palWybrany: true, dietLevel: null, dietaWybrana: false, customGoalKg: null };
    expect((await scal(zapis({ plan: planX }), zapis({ plan: planY }))).g.plan).toEqual(planY);
  });

  it('T8 [kontrola] plan wybrany {1,2; łagodna} zostaje, bez celu własnego starej karty', async () => {
    const planY = { palFactor: 1.2, palWybrany: true, dietLevel: 'lagodna', dietaWybrana: true, customGoalKg: null };
    expect((await scal(zapis({ plan: planX }), zapis({ plan: planY }))).g.plan).toEqual(planY);
  });

  it('T9 [kontrola] dane urodzeniowe z wpisanym tygodniem zostają w całości (bez masy ze starej karty)', async () => {
    const birthY = { weeks: '39', weight: '', length: '', hasComputed: false };
    const { g } = await scal(zapis({ birth: { weeks: '36', weight: '2100', length: '45', hasComputed: true } }), zapis({ birth: birthY }));
    expect(g.birth).toEqual(birthY);
  });

  it('T10 [kontrola] liczba 0 to dana: wzrost matki 0 zostaje, brak wzrostu ojca bierze 180; dawny klirens {creatinine:0} zostaje', async () => {
    const zX = zapis({ clcr: K.klirensScrClcr });
    Object.assign(zX.advanced, { motherHeight: 160, fatherHeight: 180 });
    const zY = zapis({ clcr: { creatinine: 0 } });
    Object.assign(zY.advanced, { motherHeight: 0, fatherHeight: null });
    const { g } = await scal(zX, zY);
    expect([g.advanced.motherHeight, g.advanced.fatherHeight]).toEqual([0, 180]);
    expect(g.clcr).toEqual({ creatinine: 0 });
  });

  it('T11 [kontrola] obie sekcje bez danych: plan karty docelowej (index) zostaje', async () => {
    const { g } = await scal(zapis({}, { baza: K.docpro }), zapis({}));
    expect(g.plan).toEqual(planDomyslnyIndex);
  });

  it('T12 [kontrola] karta docelowa bez danych urodzeniowych (null) → dane starej karty, jak dotąd', async () => {
    const birthX = { weeks: '39', weight: '3200', hasComputed: true };
    expect(K.indexZWiekiem.birth).toBeNull();
    expect((await scal(zapis({ birth: birthX }), zapis({}))).g.birth).toEqual(birthX);
  });

  it('T13 [kontrola] ciśnienie (sekcja bieżącej wizyty spoza listy) zostaje z karty docelowej', async () => {
    const { g } = await scal(zapis({ bp: { heartRate: null, temperature: null, population: 'healthy', systolic: 105, diastolic: 65 } }), zapis({}));
    expect(g.bp).toEqual(K.indexZWiekiem.bp);
  });

  it('T14 [kontrola] pola proste: brak płci → płeć starej karty (wersja i nagłówek); tygodnie 0 zostają; „M” z index zostaje', async () => {
    const v = await konto();
    const zX = zapis({});
    Object.assign(zX.user, { sex: 'F', ageWeeks: 30 });
    const zY = zapis({});
    Object.assign(zY.user, { sex: '', ageWeeks: 0 });
    const a = await scal(zX, zY, v);
    expect([a.g.user.sex, a.r.header.sex, a.g.user.ageWeeks]).toEqual(['F', 'F', 0]);
    const b = await scal(zX, zapis({}), v); // index zawsze zapisuje płeć (select bez pustej opcji)
    expect(b.g.user.sex).toBe('M');
  });

  it('T20 [kontrola] klirens z kreatyniną zostaje; obie sesje bez danych → sesja karty docelowej', async () => {
    const v = await konto();
    expect((await scal(zapis({}, { baza: K.klirensPusty }), zapis({ clcr: K.klirensScrClcr }), v)).g.clcr).toEqual(K.klirensScrClcr);
    expect((await scal(zapis({}, { baza: K.klirensPusty }), zapis({ clcr: K.klirensAntropometriaClcr }), v)).g.clcr).toEqual(K.klirensAntropometriaClcr);
  });

  it('T23 [kontrola] plan bez znacznika z PAL 1,8 (wybór lekarza przy wczytaniu) zostaje', async () => {
    const { g } = await scal(zapis({ plan: { palFactor: 1.2, palWybrany: true, dietLevel: null, dietaWybrana: false, customGoalKg: null } }), zapis({ plan: { palFactor: 1.8 } }));
    expect(g.plan).toEqual({ palFactor: 1.8 });
  });

  it('T24 [kontrola] karta docelowa bez sekcji (null) → sekcja starej karty jak dotąd, także bez danych', async () => {
    const zY = zapis({ plan: null, clcr: null });
    delete zY.doctor;
    const { g } = await scal(zapis({ plan: planDomyslnyIndex, doctor: K.docpro.doctor, clcr: K.klirensPusty.clcr }), zY);
    expect(g.plan).toEqual(planDomyslnyIndex);
    expect(g.doctor).toEqual(K.docpro.doctor);
    expect(g.clcr).toEqual(K.klirensPusty.clcr);
  });

  it('T30 [kontrola] plan z samym celem własnym 20 kg przy PAL domyślnym zostaje (cel własny to decyzja)', async () => {
    const planY = { palFactor: 1.6, palWybrany: false, dietLevel: null, dietaWybrana: false, customGoalKg: 20 };
    expect((await scal(zapis({ plan: planX }), zapis({ plan: planY }))).g.plan).toEqual(planY);
  });

  it('T28 [czerwony na audyt tylko przez plan głowy; synchronizacja jak dotąd] drugie urządzenie dostaje głowę scalenia zwykłą deltą, bez karty X', async () => {
    const A = await konto();
    const B = await konto();
    const x = (await A.savePatient(zapis({ plan: planX }), { dedup: false })).patientId;
    await chwila(3);
    const y = (await A.savePatient(zapis({}), { dedup: false })).patientId;
    await B.mergeSyncPayload(await A.exportSyncPayload());
    expect((await B.listPatients()).length).toBe(2);
    const wynik = await A.mergePatients(x, y);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    const rB = await B.getPatient(y);
    expect((await B.listPatients()).map((p) => p.patientId)).toEqual([y]);
    expect(rB.snapshots).toHaveLength(3);
    expect(rB.snapshots[0].snapshotId).toBe(wynik.snapshotId);
    expect(rB.snapshots[0].payload.plan).toEqual(planX);
    await A.mergeSyncPayload(await B.exportSyncPayload());
    const rA = await A.getPatient(y);
    expect([(await A.listPatients()).length, rA.snapshots.length]).toEqual([1, 3]);
    expect(rA.snapshots[0].payload.plan).toEqual(planX);
  });
});

describe('P-SCALANIE-SEKCJE — ponowienie zapisu po scaleniu (Bdo_sekcje)', () => {
  const formularz = (glowaX, plan) => {
    const f = kopia(glowaX);
    f.advanced.data.measurements.push(pomiar(72));
    if (plan) f.plan = kopia(plan);
    return f;
  };

  it('T15 [czerwony na audyt] łańcuch scalenie + ponowienie z formularza starej karty: plan starej karty w głowie po obu krokach', async () => {
    const { v, x, y, glowaX, g } = await scal(zapis({ plan: planX }, { wiersze: [60, 66] }), zapis({}, { wiersze: [48, 54] }));
    expect(g.plan).toEqual(planX);
    await v.savePatient(formularz(glowaX), { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    const r = await v.getPatient(y);
    expect(r.snapshots[0].payload.plan).toEqual(planX);
    expect(r.snapshots).toHaveLength(4);
    expect(wiekiWierszy(r.snapshots[0].payload)).toEqual([48, 54, 60, 66, 72]);
  });

  it('T26 [czerwony na audyt] przeliczony domyślny PAL w formularzu starej karty (1,6 → 1,4) nie kasuje wybranego planu karty docelowej', async () => {
    const planY = { palFactor: 1.2, palWybrany: true, dietLevel: 'lagodna', dietaWybrana: true, customGoalKg: null };
    const { v, x, y, glowaX, g } = await scal(zapis({}, { wiersze: [60] }), zapis({ plan: planY }, { wiersze: [48] }));
    expect(g.plan, 'kontrola: scalenie trzyma wybrany plan karty docelowej').toEqual(planY);
    await v.savePatient(formularz(glowaX, Object.assign({}, planDomyslnyIndex, { palFactor: 1.4 })), { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    expect((await v.getPatient(y)).snapshots[0].payload.plan).toEqual(planY);
  });

  it('T26 [kontrola] lekarz wybrał w formularzu starej karty PAL 1,8 → to zmiana lekarza, wygrywa', async () => {
    const planY = { palFactor: 1.2, palWybrany: true, dietLevel: 'lagodna', dietaWybrana: true, customGoalKg: null };
    const { v, x, y, glowaX } = await scal(zapis({}, { wiersze: [60] }), zapis({ plan: planY }, { wiersze: [48] }));
    const wybrany = Object.assign({}, planDomyslnyIndex, { palFactor: 1.8, palWybrany: true });
    await v.savePatient(formularz(glowaX, wybrany), { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    expect((await v.getPatient(y)).snapshots[0].payload.plan).toEqual(wybrany);
  });

  it('T27 [czerwony na audyt] głowa karty docelowej z planem domyślnym (zapis po scaleniu sprzed poprawki) nie zastępuje planu z formularza', async () => {
    const { v, x, y, glowaX } = await scal(zapis({ plan: planX }, { wiersze: [60, 66] }), zapis({}, { wiersze: [48, 54] }));
    const r0 = await v.getPatient(y);
    const p = kopia(r0.snapshots[0].payload);
    p.plan = kopia(planDomyslnyIndex); // stan głowy jak po scaleniu sprzed poprawki
    await v.savePatient(p, { patientId: y, dedup: false, baseSnapshotId: r0.snapshots[0].snapshotId });
    expect((await v.getPatient(y)).snapshots[0].payload.plan, 'kontrola: głowa z planem domyślnym').toEqual(planDomyslnyIndex);
    await v.savePatient(formularz(glowaX), { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    const r = await v.getPatient(y);
    expect(r.snapshots[0].payload.plan).toEqual(planX);
    expect(r.snapshots).toHaveLength(5);
    expect(wiekiWierszy(r.snapshots[0].payload)).toEqual([48, 54, 60, 66, 72]);
  });

  it('T31 [czerwony na audyt] pusta sesja klirensu z formularza starej karty nie kasuje klirensu karty docelowej', async () => {
    const { v, x, y, glowaX } = await scal(zapis({}, { wiersze: [60] }), zapis({ clcr: K.klirensScrClcr }, { wiersze: [48] }));
    const f = formularz(glowaX);
    f.clcr = kopia(K.klirensPusty.clcr);
    await v.savePatient(f, { patientId: y, baselinePayload: glowaX, dolaczPoScaleniu: x });
    expect((await v.getPatient(y)).snapshots[0].payload.clcr).toEqual(K.klirensScrClcr);
  });
});

/* Strażnicy zgodności reguły sejfu z warstwą formularza (sejf nie woła kodu strony, więc trzyma kopie dwóch list). */
function oknoFormularza() {
  const win = {
    document: {
      getElementById: () => null, addEventListener() {}, dispatchEvent() { return true; },
      querySelectorAll() { return []; }, querySelector() { return null; },
      createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; }, body: { appendChild() {} },
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout,
    Event: class {}, CustomEvent: class {}, location: { pathname: '/' }, navigator: {},
  };
  win.window = win;
  new Function('window', 'globalThis', czytaj('vilda_data_import_export.js'))(win, win);
  return win;
}

describe('P-SCALANIE-SEKCJE — strażnicy zgodności z formularzem', () => {
  it('strażnik PAL: „PAL wybrany” sejfu = vildaPalZapisuWybrany przy wczytaniu, na pełnym zestawie kształtów planu', async () => {
    const wybrany = oknoFormularza().vildaPalZapisuWybrany;
    expect(typeof wybrany).toBe('function');
    const m = czytaj('vilda_data_import_export.js').match(/PAL_DOMYSLNE_HISTORYCZNE=Object\.freeze\(\[([^\]]*)\]\)/);
    expect(m, 'stała PAL_DOMYSLNE_HISTORYCZNE w vilda_data_import_export.js').not.toBeNull();
    const domyslne = m[1].split(',').map(Number);
    expect(domyslne.length).toBeGreaterThan(0);
    const wartosci = [null, '', 0, -1, 'abc', 1.2, 1.8, 2, '2.0', '1.8'];
    domyslne.forEach((d) => { wartosci.push(d, String(d), d + 0.00001, d + 0.01); });
    const ksztalty = [];
    wartosci.forEach((palFactor) => {
      ksztalty.push({ palFactor }, { palFactor, palWybrany: true }, { palFactor, palWybrany: false });
    });
    const v = await konto();
    const zX = zapis({ plan: planX });
    const rozjazdy = [];
    for (const plan of ksztalty) {
      const { g } = await scal(zX, zapis({ plan }), v);
      const zostal = JSON.stringify(g.plan) === JSON.stringify(plan);
      const doZastapienia = JSON.stringify(g.plan) === JSON.stringify(planX);
      expect(zostal || doZastapienia, `plan ${JSON.stringify(plan)}: albo zostaje, albo w całości plan X`).toBe(true);
      if (zostal !== wybrany(plan)) rozjazdy.push({ plan, sejfTrzyma: zostal, wczytanieWybrany: wybrany(plan) });
    }
    expect(rozjazdy).toEqual([]);
  });

  it('strażnik klirensu: pola karty pacjenta kalkulatora (wiek, masa, wzrost…) i wersja to nie dane; wynik badania tak', async () => {
    const html = czytaj('kalkulator-klirens.html');
    const i = html.indexOf('<fieldset id="patientSet">');
    expect(i, 'karta pacjenta w kalkulator-klirens.html').toBeGreaterThanOrEqual(0);
    const karta = html.slice(i, html.indexOf('</fieldset>', i));
    const polaKarty = [...karta.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((x) => x[1]);
    expect(polaKarty).toEqual(expect.arrayContaining(['age', 'weight', 'height']));
    // Budowa sesji (inline_kalkulator_klirens_07.js) dopisuje do inputs wersję kalkulatora i wybrany wzór.
    const budowa = czytaj('inline_kalkulator_klirens_07.js');
    expect(budowa).toMatch(/\.inputs\.currentVersion=/);
    expect(budowa).toMatch(/\.inputs\.formulaPicker=/);
    // Fixture zgodny z formularzem: każde pole karty jest w sesji, każde pole sesji to pole strony.
    const pustaSesja = K.klirensPusty.clcr;
    polaKarty.forEach((k) => { expect(pustaSesja.inputs, `pole karty ${k} w sesji`).toHaveProperty(k); });
    Object.keys(pustaSesja.inputs).filter((k) => k !== 'currentVersion').forEach((k) => {
      expect(html.includes(`id="${k}"`), `pole sesji ${k} w kalkulator-klirens.html`).toBe(true);
    });

    const v = await konto();
    const zX = zapis({ clcr: K.klirensScrClcr });
    const sesja = (zmiany) => { const s = kopia(pustaSesja); Object.assign(s.inputs, zmiany); return s; };
    for (const k of polaKarty.concat(['currentVersion', 'formulaPicker'])) {
      const { g } = await scal(zX, zapis({ clcr: sesja({ [k]: '7' }) }), v);
      expect(g.clcr, `samo pole ${k} to nie dane — klirens starej karty`).toEqual(K.klirensScrClcr);
    }
    for (const [k, w] of [['Scr', '0,5'], ['CystatinC', '0.9'], ['S_Na', '140'], ['U_Alb', '12'], ['Ucr', '80'], ['V24', '900'], ['UreaPre', '30'], ['suspectedAKI', true], ['Scr', 0.5]]) {
      const zY = sesja({ [k]: w });
      const { g } = await scal(zX, zapis({ clcr: zY }), v);
      expect(g.clcr, `pole ${k}=${JSON.stringify(w)} to dane — klirens karty docelowej zostaje`).toEqual(zY);
    }
  });
});

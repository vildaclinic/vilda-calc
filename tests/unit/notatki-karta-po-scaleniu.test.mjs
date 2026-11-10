import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// E2-PR3c4 (decyzja 6 właściciela z 2026-11-10, P-NOTATKI-ZA-KARTA): notatka po „Scal pacjentów” idzie za kartą, która
// istnieje. Reguła karty notatki w scalaniu (Le), gdy wersja tutejsza i z ładunku leżą pod różnymi kartami: karta martwa
// = nagrobek karty znany tu albo z ładunku i brak karty po fazie kart; dokładnie jedna martwa — druga; pełny remis
// (rev i chwila zmiany równe) — mniejszy patientId; inaczej karta zwycięzcy treści (gdy obie istnieją — wersji zapisanej
// później). Gdy wygrywa tutejsza treść, a reguła daje kartę z ładunku — zapis samej karty pod blokadą notatki na
// świeżym odczycie (Bnp_zmienKarte). Plan opieki (gałąź planu w Le) — tylko „karta martwa”, bez reguły remisu.
// Prawdziwy vilda_vault.js, magazyn w pamięci, dane wyłącznie fikcyjne (bez PESEL).

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

let licznik = 0;
async function urzadzenie(zKopii = null) {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const baza = v.createInMemoryAdapter();
  v.setStorageAdapter(baza);
  let haslo;
  if (zKopii) {
    haslo = zKopii.haslo;
    v.lock('manual');
    await v.importSyncCode(await zKopii.v.exportSyncCode(haslo), haslo, { label: `kopia-${licznik}` });
  } else {
    haslo = `Karta#Notatki!2026${licznik}aa`;
    await v.createUser(haslo, { label: `karta-${licznik}`, iterations: 10000 });
  }
  return { v, baza, haslo, uid: v.getCurrentUser().userId };
}

const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });
const zapis = (nazwisko, imie, wzrost) => ({
  name: `${nazwisko} ${imie}`,
  user: { lastName: nazwisko, firstName: imie, sex: 'F', age: 9, ageMonths: 2, height: wzrost, weight: 28 },
  advanced: { data: { measurements: [{ uid: `m-${wzrost}`, ageMonths: 110, ageYears: 110 / 12, height: wzrost, weight: 28 }] } },
});
async function karta(v, imie, wzrost = 131) { return (await v.savePatient(zapis('Fikcyjna', imie, wzrost), { dedup: false })).patientId; }
const pelny = async (z, na) => { await na.v.mergeSyncPayload(JSON.parse(JSON.stringify(await z.v.exportSyncPayload()))); };
const rekord = (d, id) => d.baza.getPatientNoteForUser(d.uid, id);
const tytul = async (d, id) => { const x = (await d.v.listAllPatientNotes()).find((q) => q.id === id); return x ? x.title : null; };
const kartaJest = async (d, pid) => !!(await d.baza.getPatientForUser(d.uid, pid));
async function gdzie(d, id, ids) {
  const n = await rekord(d, id);
  if (!n) return 'brak';
  const nazwa = Object.entries(ids).find(([, p]) => p === n.patientId);
  return `${nazwa ? nazwa[0] : '?'}${(await kartaJest(d, n.patientId)) ? '' : ' (bez karty)'}`;
}

/* Dwa urządzenia A i B jednego konta: karty P i Q, notatka n pod P; pełna wymiana. */
async function poczatek() {
  const A = await urzadzenie();
  const ids = { P: await karta(A.v, 'Ola', 131), Q: await karta(A.v, 'Ewa', 128) };
  const n = await A.v.savePatientNote({ patientId: ids.P, title: 'n (fikcja)', body: 'fikcyjna treść', category: 'followup' });
  const B = await urzadzenie(A);
  await pelny(A, B);
  expect(await gdzie(B, n.id, ids)).toBe('P');
  return { A, B, ids, n };
}

describe('E2-PR3c4 — karta notatki po „Scal pacjentów”: obie karty istnieją', () => {
  it('[kontrola; na bazie tak samo — nagrobek P zdjęty, gdy karta wraca] B poprawia n pod P po „Scal pacjentów” P → Q na A i dopisuje wizytę P (karta P wraca): n pod P na obu (wersja zapisana później)', async () => {
    const { A, B, ids, n } = await poczatek();
    await chwila(5);
    await A.v.mergePatients(ids.P, ids.Q);
    await chwila(5);
    await B.v.savePatientNote({ id: n.id, patientId: ids.P, title: 'n (fikcja, poprawka B)', body: 'fikcyjna treść B', category: 'followup' });
    await chwila(5);
    await B.v.savePatient(zapis('Fikcyjna', 'Ola', 133), { patientId: ids.P, dedup: false });
    for (let r = 0; r < 2; r += 1) { await pelny(A, B); await pelny(B, A); }
    expect([await kartaJest(A, ids.P), await kartaJest(B, ids.P)], 'karta P wraca na A (wizyta B po scaleniu)').toEqual([true, true]);
    expect([await gdzie(A, n.id, ids), await gdzie(B, n.id, ids)]).toEqual(['P', 'P']);
    expect([await tytul(A, n.id), await tytul(B, n.id)]).toEqual(['n (fikcja, poprawka B)', 'n (fikcja, poprawka B)']);
  });

  it('[kontrola] B poprawia n pod P PRZED „Scal pacjentów” na A, potem dopisuje wizytę P: n pod Q na obu (wersja ze scalenia zapisana później)', async () => {
    const { A, B, ids, n } = await poczatek();
    await chwila(5);
    await B.v.savePatientNote({ id: n.id, patientId: ids.P, title: 'n (fikcja, poprawka B wcześniej)', body: 'fikcyjna treść B', category: 'followup' });
    await chwila(5);
    await A.v.mergePatients(ids.P, ids.Q);
    await chwila(5);
    await B.v.savePatient(zapis('Fikcyjna', 'Ola', 133), { patientId: ids.P, dedup: false });
    for (let r = 0; r < 2; r += 1) { await pelny(A, B); await pelny(B, A); }
    expect([await kartaJest(A, ids.P), await kartaJest(B, ids.P)]).toEqual([true, true]);
    expect([await gdzie(A, n.id, ids), await gdzie(B, n.id, ids)]).toEqual(['Q', 'Q']);
  });
});

describe('E2-PR3c4 — pełny remis, dawny rozjazd, koszt i wyścig', () => {
  // Rozjazd z bazy (pomiar): B z n pod usuniętą kartą P, A z tą samą wersją (rev, chwila zmiany) pod Q. Odtworzony
  // zapisem samej karty w magazynie B (jak zostawiała go dotychczasowa aplikacja).
  async function rozjazd() {
    const { A, B, ids, n } = await poczatek();
    await chwila(5);
    await A.v.mergePatients(ids.P, ids.Q);
    for (let r = 0; r < 2; r += 1) { await pelny(A, B); await pelny(B, A); }
    expect([await gdzie(A, n.id, ids), await gdzie(B, n.id, ids)]).toEqual(['Q', 'Q']);
    const rB = await rekord(B, n.id);
    await B.baza.putPatientNoteForUser(B.uid, { ...rB, patientId: ids.P });
    expect(await gdzie(B, n.id, ids)).toBe('P (bez karty)');
    return { A, B, ids, n };
  }

  it('[czerwony na bazie] dawny rozjazd (B: n pod usuniętą kartą P, A: ta sama wersja pod Q) leczy pierwsza pełna wymiana: n pod Q na obu, treść, rev i chwila zmiany bez zmian', async () => {
    const { A, B, ids, n } = await rozjazd();
    const przed = await rekord(B, n.id);
    const wynik = await B.v.mergeSyncPayload(JSON.parse(JSON.stringify(await A.v.exportSyncPayload())));
    expect(wynik.updatedPatientNoteCount, 'zmieniona notatka (sama karta)').toBe(1);
    await pelny(B, A);
    expect([await gdzie(A, n.id, ids), await gdzie(B, n.id, ids)]).toEqual(['Q', 'Q']);
    const po = await rekord(B, n.id);
    expect({ ...po, patientId: null }, 'zapis samej karty: pozostałe pola rekordu B bez zmian').toEqual({ ...przed, patientId: null });
    expect([po.rev, po.updatedAtISO], 'ta sama wersja co na A').toEqual([(await rekord(A, n.id)).rev, (await rekord(A, n.id)).updatedAtISO]);
  });

  it('[czerwony na bazie; koszt] bez różnicy kart notatki scalanie nie czyta kart w sekcji notatek; przy różnicy — jeden odczyt na kartę z nagrobkiem, raz na scalanie', async () => {
    const { A, B, ids, n } = await rozjazd();
    const n2 = await A.v.savePatientNote({ patientId: ids.Q, title: 'n2 (fikcja)', body: 'fikcyjna druga', category: 'followup' });
    await pelny(A, B);
    const r2 = await rekord(B, n2.id);
    await B.baza.putPatientNoteForUser(B.uid, { ...r2, patientId: ids.P });
    const policz = async (d, lad) => {
      const pierwotne = d.baza.getPatientForUser.bind(d.baza);
      const odczyty = [];
      d.baza.getPatientForUser = (uid, pid) => { odczyty.push(pid); return pierwotne(uid, pid); };
      try { await d.v.mergeSyncPayload(lad); } finally { d.baza.getPatientForUser = pierwotne; }
      return odczyty;
    };
    // Ładunek bez kart (patients: []): odczyty kart w Le pochodzą tylko z nagrobków kart i z reguły karty notatki.
    const lad = JSON.parse(JSON.stringify({ ...(await A.v.exportSyncPayload()), patients: [] }));
    const zRoznica = await policz(B, lad);
    expect(zRoznica.filter((p) => p === ids.P).length - (lad.tombstones || []).filter((t) => t.patientId === ids.P).length,
      'dodatkowy odczyt karty P (reguła karty notatki, raz dla n i n2)').toBe(1);
    expect([await gdzie(B, n.id, ids), await gdzie(B, n2.id, ids)]).toEqual(['Q', 'Q']);
    const bezRoznicy = await policz(B, lad);
    expect(bezRoznicy.filter((p) => p === ids.P).length - (lad.tombstones || []).filter((t) => t.patientId === ids.P).length,
      'bez różnicy kart notatki — bez dodatkowych odczytów').toBe(0);
  });

  it('[czerwony na bazie; wyścig] druga karta przeglądarki poprawia n w trakcie scalania (przed zapisem karty) — zapis karty pomijany, poprawka zostaje', async () => {
    const { A, B, ids, n } = await rozjazd();
    const pierwotne = B.baza.getPatientNoteForUser.bind(B.baza);
    let wstrzyknieto = false;
    B.baza.getPatientNoteForUser = async (uid, id) => {
      if (id === n.id && !wstrzyknieto) {
        wstrzyknieto = true;
        const r = await pierwotne(uid, id);
        await B.baza.putPatientNoteForUser(uid, { ...r, rev: (r.rev || 0) + 1, updatedAtISO: new Date(Date.now() + 1000).toISOString() });
      }
      return pierwotne(uid, id);
    };
    let wynik;
    try { wynik = await B.v.mergeSyncPayload(JSON.parse(JSON.stringify(await A.v.exportSyncPayload()))); } finally { B.baza.getPatientNoteForUser = pierwotne; }
    expect(wstrzyknieto, 'świeży odczyt pod blokadą notatki').toBe(true);
    expect(wynik.updatedPatientNoteCount).toBe(0);
    const r = await rekord(B, n.id);
    expect([r.patientId === ids.P, r.rev]).toEqual([true, (await rekord(A, n.id)).rev + 1]);
  });

  it('[czerwony na bazie] pełny remis, obie karty usunięte: mniejszy patientId na każdym urządzeniu, w obu kierunkach', async () => {
    const wynik = [];
    for (const kierunek of ['tutaj P, w ładunku Q', 'tutaj Q, w ładunku P']) {
      const X = await urzadzenie();
      const ids = { P: await karta(X.v, 'Ola', 131), Q: await karta(X.v, 'Ewa', 128) };
      const [tu, tam] = kierunek.startsWith('tutaj P') ? [ids.P, ids.Q] : [ids.Q, ids.P];
      const n = await X.v.savePatientNote({ patientId: tu, title: 'n (fikcja)', body: 'fikcyjna treść', category: 'followup' });
      const lad = JSON.parse(JSON.stringify(await X.v.exportSyncPayload()));
      const pozniej = new Date(Date.now() + 60_000).toISOString();
      lad.patients = [];
      lad.tombstones = [{ patientId: ids.P, deletedAtISO: pozniej }, { patientId: ids.Q, deletedAtISO: pozniej }];
      lad.patientNotes = lad.patientNotes.filter((x) => x.id === n.id).map((x) => ({ ...x, patientId: tam }));
      lad.patientNoteTombstones = [];
      await X.v.mergeSyncPayload(lad);
      expect([await kartaJest(X, ids.P), await kartaJest(X, ids.Q)], kierunek).toEqual([false, false]);
      wynik.push((await rekord(X, n.id)).patientId === (ids.P < ids.Q ? ids.P : ids.Q));
    }
    expect(wynik).toEqual([true, true]);
  });
});

describe('E2-PR3c4 — plan opieki po „Scal pacjentów”', () => {
  let nrOperacji = 0;
  const operacja = () => `fikcyjna-operacja-karty-planu-${++nrOperacji}`;
  async function zmien(d, planId, patientId, action, extra = {}) {
    const obecny = planId && await d.v.getCarePlan(planId);
    const w = await d.v.mutateCarePlan({ patientId, operationId: operacja(), action, ...(obecny ? { planId, baseRev: obecny.rev } : {}), ...extra });
    expect(w.saved).toBe(true);
    return w;
  }
  it('[czerwony na bazie] „Scal pacjentów” P → Q na A, B (bez wiedzy o scaleniu) dopisuje ustalenie do planu pod P: plan pod Q na obu, z ustaleniem B', async () => {
    const A = await urzadzenie();
    const ids = { P: await karta(A.v, 'Ola', 131), Q: await karta(A.v, 'Ewa', 128) };
    const planId = (await zmien(A, null, ids.P, 'create', { title: 'Fikcyjny plan kontroli' })).planId;
    const B = await urzadzenie(A);
    await pelny(A, B);
    expect((await B.v.getCarePlan(planId)).patientId).toBe(ids.P);
    await chwila(5);
    await A.v.mergePatients(ids.P, ids.Q);
    await chwila(5);
    const tekst = 'Fikcyjne ustalenie B po scaleniu na A.';
    await zmien(B, planId, ids.P, 'addNote', { text: tekst, dateISO: '2026-11-10' });
    for (let r = 0; r < 2; r += 1) { await pelny(A, B); await pelny(B, A); }
    expect([await kartaJest(A, ids.P), await kartaJest(B, ids.P)]).toEqual([false, false]);
    expect([await gdzie(A, planId, ids), await gdzie(B, planId, ids)]).toEqual(['Q', 'Q']);
    for (const d of [A, B]) {
      const plan = await d.v.getCarePlan(planId);
      expect([plan.patientId === ids.Q, (plan.log || []).some((e) => e.text === tekst)], 'plan pod Q z ustaleniem B').toEqual([true, true]);
    }
  });
});

describe('E2-PR3c4 — strażnik źródła reguły karty notatki', () => {
  const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../vilda_vault.js'), 'utf8');
  const funkcja = (nazwa) => { const a = src.indexOf(`async function ${nazwa}(`); return a < 0 ? '' : src.slice(a, src.indexOf('\n}\n', a)); };
  it('[czerwony na bazie] Le: karta martwa = nagrobek karty (tu albo z ładunku) i brak karty, odczyt leniwy raz na pacjenta; jedna martwa — druga, pełny remis — mniejszy patientId, inaczej zwycięzca treści; hak tylko przy zmianie karty; plan opieki bez reguły remisu', () => {
    expect(src).toContain('Qmart=async function(Qq){if(!Qq||!Qpt.has(Qq))return!1;if(!(Qq in Qmk)){');
    expect(src, 'błąd odczytu karty = karta żywa').toContain('try{Qk=await P.getPatientForUser(b,Qq)}catch(PatientClinicalCaught){PatientClinicalRethrow(PatientClinicalCaught);Qk={}}Qmk[Qq]=!Qk}return Qmk[Qq]}');
    expect(src).toContain('if(Qdg&&!Qdm)return Qm;if(Qdm&&!Qdg)return Qg;if(Qr)return Qg<Qm?Qg:Qm;return Qw?Qg:Qm}');
    expect(src).toContain('patientId:Qwp,bodyCipher:ti');
    expect(src).toContain('Qdn.add(g.id);if(Qwp!==g.patientId)Bem_wlasciciel(g.id,e)})}');
    expect(src).toContain('await Qwl(g.patientId,Ej.patientId,!1,Ew===Ev&&Ex===Ey)===g.patientId&&await Bnp_zmienKarte(P,g,Ej,g.patientId,e)){Qch.push({id:g.id,patientId:g.patientId,action:"merge"});Nt++;Qdn.add(g.id)}');
    expect(src).toContain('M.patientId!==g.patientId&&await Qmart(M.patientId)&&!await Qmart(g.patientId)){await Bnp_zapiszKarte(P,M,g.patientId,e);');
  });
  it('[czerwony na bazie] zapis samej karty: pod blokadą notatki, na świeżym odczycie tego samego rekordu co na początku sekcji notatek, po sprawdzeniu sesji scalania i tego samego magazynu', () => {
    const zmien = funkcja('Bnp_zmienKarte'), zapisz = funkcja('Bnp_zapiszKarte');
    expect(zmien).toContain('await Ac(g.id, async function () {\n    Bses_pilnuj(opcje);');
    expect(zmien).toContain('n = await h.getPatientNoteForUser(b, g.id);');
    expect(zmien).toContain('if (!n || n.patientId === pid || n.patientId !== e.patientId || n.rev !== e.rev || n.updatedAtISO !== e.updatedAtISO) return;');
    expect(zmien).toContain('await Bnp_zapiszKarte(h, n, pid, opcje);');
    expect(zapisz).toContain('Bses_pilnuj(opcje);\n  if (I() !== h) throw Bses_blad();\n  await h.putPatientNoteForUser(b, PatientClinicalWriteValue(b, Object.assign({}, n, { patientId: pid })));');
  });
});

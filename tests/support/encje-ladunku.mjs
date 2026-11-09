// Model encji ładunku synchronizacji (exportSyncPayload) do porównań stanu dwóch urządzeń — wydzielony bez zmiany
// zachowania z tests/unit/sync-dziennik-wlasnosciowy.test.mjs (test A ≡ B, E2-PR2a), używany też przez
// tests/unit/sync-pokrycie-mutacji.test.mjs (E2-PR3a2). Funkcje czyste: bez okna, sejfu i zegara.
//
// EKSPORTY
//   sortuj(x) — kopia z kluczami obiektów posortowanymi (rekurencyjnie; kolejność tablic bez zmian).
//   naj(snapshots) — najnowsza wersja karty (po savedAtISO, updatedAtISO, snapshotId) albo null.
//   encje(ladunek) → Map — encje ładunku: klucz = rodzaj:klucz zdarzenia, wartość { kind, key, val (JSON z posortowanymi
//       kluczami), …pola pomocnicze }. Karta (pola bez wersji, bez snapshotCount i header.timestampISO) to osobna encja
//       „karta” (pola: patientId, wersje, najnowsza); wersja — snap patientId/snapshotId; wpisy kosza jednego
//       snapshotId (bez seq) — jedna encja stomb; sekcje proste (notatki, listy, klucze dostępu, nagrobki); preferencje
//       (pref:klucz) i hasło (cred).
//   sciezkiEncji(x, y) — ścieżki różnic wewnątrz encji (tablice obiektów z polem tożsamości — po nim, inne — po indeksie).
//   D(x, y) — różnice encja po encji dwóch eksportów kanonicznych (opis niżej).

export function sortuj(x) {
  if (Array.isArray(x)) return x.map(sortuj);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) o[k] = sortuj(x[k]); return o; }
  return x;
}
export const naj = (snapshots) => (snapshots || []).reduce((m, s) => {
  if (!m) return s;
  const a = [s.savedAtISO || '', s.updatedAtISO || '', s.snapshotId], b = [m.savedAtISO || '', m.updatedAtISO || '', m.snapshotId];
  return a.join('|') > b.join('|') ? s : m;
}, null);

// ── Encje ładunku (wyrocznia emisji i różnice) ───────────────────────────────────────────────────────────────────────
// Klucz encji = rodzaj:klucz zdarzenia; wartość = JSON z posortowanymi kluczami. Karta (pola bez wersji, bez
// snapshotCount i header.timestampISO) to osobna encja „karta” — nośnikiem jej pól jest snap albo stomb z kartą (11.2).
const SEKCJE_PROSTE = [
  ['patientNotes', 'pnote', 'id'], ['patientNoteTombstones', 'pnotetomb', 'id'], ['notes', 'note', 'id'],
  ['noteTombstones', 'notetomb', 'id'], ['patientLists', 'plist', 'id'], ['patientListTombstones', 'plisttomb', 'id'],
  ['passkeys', 'pk', 'credentialId'], ['passkeyTombstones', 'pktomb', 'credentialId'], ['tombstones', 'ptomb', 'patientId'],
];
export function encje(lad) {
  const m = new Map();
  const dodaj = (kind, key, val, extra = {}) => m.set(kind + ':' + key, { kind, key, val: JSON.stringify(sortuj(val)), ...extra });
  for (const p of lad.patients || []) {
    const { snapshots, snapshotCount: _c, ...karta } = p;
    const header = karta.header && typeof karta.header === 'object' ? { ...karta.header } : karta.header;
    if (header && typeof header === 'object') delete header.timestampISO;
    dodaj('karta', p.patientId, { ...karta, header }, { patientId: p.patientId, wersje: (snapshots || []).map((s) => s.snapshotId), najnowsza: (naj(snapshots) || {}).snapshotId || null });
    for (const s of snapshots || []) dodaj('snap', p.patientId + '/' + s.snapshotId, s, { patientId: p.patientId, snapshotId: s.snapshotId });
  }
  for (const [sekcja, kind, pole] of SEKCJE_PROSTE) for (const e of lad[sekcja] || []) dodaj(kind, e[pole], e, { patientId: e.patientId || null });
  const kosz = new Map();
  for (const e of lad.snapshotTombstones || []) {
    const { seq: _s, ...bez } = e;
    if (!kosz.has(e.snapshotId)) kosz.set(e.snapshotId, []);
    kosz.get(e.snapshotId).push(sortuj(bez));
  }
  for (const [sid, l] of kosz) dodaj('stomb', sid, l.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)), { patientIds: l.map((x) => x.patientId) });
  for (const [k, w] of Object.entries(lad.userPreferences || {})) dodaj('pref', k, w);
  if (lad.credential) dodaj('cred', 'cred', lad.credential);
  return m;
}

// ── D(X, Y): różnice encja po encji (specyfikacja 2a, 3.2) ──────────────────────────────────────────────────────────
// Na eksportach kanonicznych (pominSeq, pominSnapshotCount). Klucze: karta patientId (bez tablicy snapshots), wersja
// patientId/snapshotId, wpis kosza snapshotId|patientId, notatka pacjenta i jej nagrobek id, notatka biblioteki, lista
// i ich nagrobki id, klucz dostępu credentialId, preferencja — klucz, credential — jeden obiekt, nagrobek karty
// patientId; pozostałe pola główne — „inne:<pole>”. Wynik: [{ klucz, rodzaj, sciezki (niepuste), a, b, tylko }] —
// a/b = encja po stronie X/Y (null, gdy jej brak; wtedy sciezki ['(obecność)'] i tylko 'x' albo 'y').
const SEKCJE_D = [
  ['patientNotes', 'pnote', (e) => e.id], ['patientNoteTombstones', 'pnotetomb', (e) => e.id], ['notes', 'note', (e) => e.id],
  ['noteTombstones', 'notetomb', (e) => e.id], ['patientLists', 'plist', (e) => e.id], ['patientListTombstones', 'plisttomb', (e) => e.id],
  ['passkeys', 'pk', (e) => e.credentialId], ['passkeyTombstones', 'pktomb', (e) => e.credentialId], ['tombstones', 'ptomb', (e) => e.patientId],
  ['snapshotTombstones', 'kosz', (e) => `${e.snapshotId}|${e.patientId}`],
];
function encjeD(k) {
  const m = new Map();
  const dodaj = (rodzaj, klucz, val) => {
    let kk = rodzaj + ':' + klucz;
    for (let i = 2; m.has(kk); i += 1) kk = `${rodzaj}:${klucz}#${i}`; // duplikat klucza — osobna encja (widoczna w D)
    m.set(kk, { rodzaj, klucz: kk.slice(rodzaj.length + 1), val });
  };
  for (const [pole, w] of Object.entries(k || {})) {
    if (pole === 'patients') {
      for (const p of w || []) {
        const { snapshots, ...karta } = p;
        dodaj('karta', p.patientId, karta);
        for (const s of snapshots || []) dodaj('wersja', `${p.patientId}/${s.snapshotId}`, s);
      }
    } else if (pole === 'userPreferences') {
      for (const [kl, v] of Object.entries(w || {})) dodaj('pref', kl, v);
    } else if (pole === 'credential') {
      dodaj('cred', 'cred', w);
    } else {
      const sek = SEKCJE_D.find(([s]) => s === pole);
      if (sek && Array.isArray(w)) for (const e of w) dodaj(sek[1], sek[2](e), e);
      else dodaj('inne:' + pole, pole, w);
    }
  }
  return m;
}
// Ścieżki różnic wewnątrz encji (tablice obiektów z polem tożsamości — po nim, inne — po indeksie).
export function sciezkiEncji(x, y, p = '', out = []) {
  if (JSON.stringify(x) === JSON.stringify(y)) return out;
  if (Array.isArray(x) && Array.isArray(y)) {
    const id = (e, i) => (e && typeof e === 'object' && (e.patientId || e.snapshotId || e.id || e.credentialId)) || '#' + i;
    const mx = new Map(x.map((e, i) => [String(id(e, i)), e])), my = new Map(y.map((e, i) => [String(id(e, i)), e]));
    for (const k of new Set([...mx.keys(), ...my.keys()])) sciezkiEncji(mx.get(k), my.get(k), `${p}[${k}]`, out);
    return out;
  }
  if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) sciezkiEncji(x[k], y[k], p ? `${p}.${k}` : k, out);
    return out;
  }
  out.push(p || '(wartość)');
  return out;
}
export function D(x, y) {
  const a = encjeD(x), b = encjeD(y);
  const out = [];
  for (const k of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const ea = a.get(k), eb = b.get(k);
    if (ea && eb && JSON.stringify(ea.val) === JSON.stringify(eb.val)) continue;
    const e = ea || eb;
    // Ścieżki zawsze niepuste (3.2): różnica, której sciezkiEncji nie umie wskazać (np. duplikat tożsamości w tablicy
    // wewnątrz encji), dostaje '(wartość)' — żaden predykat klasy jej wtedy nie przyjmie (P7).
    const sc = ea && eb ? sciezkiEncji(ea.val, eb.val) : ['(obecność)'];
    out.push({
      klucz: e.klucz, rodzaj: e.rodzaj, a: ea ? ea.val : null, b: eb ? eb.val : null, tylko: !ea ? 'y' : !eb ? 'x' : null,
      sciezki: sc.length ? sc : ['(wartość)'],
    });
  }
  return out;
}

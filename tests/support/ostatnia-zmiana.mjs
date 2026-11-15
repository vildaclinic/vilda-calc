// Wyrocznia „nie zginęła ostatnia zmiana” (E3-PR0a) dla testu A ≡ B (tests/unit/sync-dziennik-wlasnosciowy.test.mjs).
// W1 i W4 porównują urządzenia między sobą; ta wyrocznia porównuje każde urządzenie z historią zapisów lekarza: czy to,
// co widać w karcie i w oknie Kosza, jest ostatnią zmianą każdego pola. Dane wyłącznie fikcyjne.
//
// HISTORIA. Każda mutacja lokalna (mutacja() testu) daje zapis: urządzenie, opis, eksport przed i po, chwila zegara
// urządzenia (Date.now() w chwili mutacji) i operacje (wywołania API sejfu z argumentami — np. „Przywróć” rozpoznaje się
// po argumencie snapshotId wywołania restoreTrashedSnapshot, nie po różnicy eksportu). Model buduje się sam przy
// pierwszej mutacji świata ze stanu przed (stan bazowy wspólny urządzeniom). Różnica projekcji eksportu urządzenia
// mutującego daje zapisy pól encji:
// - wizyta (snapshotId): treść (payload bez pól „_…” i bez visit.patientId — karta wizyty to osobne pole), gwiazdka
//   (payload._pinned w karcie), położenie (karta pid | Kosz pid | brak z przyczyną: usuń pacjenta, retencja, inne);
// - karta (patientId): obecność (ostatni zapis w tej karcie) i usunięcie („Usuń pacjenta” albo źródło „Scal pacjentów”
//   — wtedy alias karta → karta docelowa z chwilą scalenia);
// - notatka pacjenta: tekst (tytuł, treść, kategoria), karta, obecność; notatka biblioteki i lista: wartość i obecność.
// Bez rev, chwil, opisu nagrobków i hasła (pola niewidoczne dla lekarza).
//
// OSTATNIA ZMIANA. LWW po polu według chwili logicznej (zegar urządzenia, numer mutacji). Zapis urządzenia, które znało
// bieżącą wartość pola, jest późniejszy od niej także przy zegarze spóźnionym (chwila = max(zegar, chwila znanej
// wartości); jak Bpp_chwilaZmiany sejfu). Reguły:
// - „Przywróć” jest zapisem treści z chwilą przywrócenia (R4, PD-9: ALGORITHMS P-PRZYWROC-Z-KARTY, „„Przywróć” =
//   najpóźniejsza zmiana (R4, PD-9)”, ok. 28605–28607, i P-POZNIEJSZA-POPRAWKA, „R4, „Przywróć” i import z kosza są
//   najpóźniejszą zmianą zapisu”, ok. 30609–30610) — wygrywa z poprawką z innego urządzenia zrobioną po koszu, której urządzenie
//   przywracające nie znało; chwila przywrócenia jest późniejsza od zdejmowanego wpisu Kosza.
// - Kosz to zmiana w karcie: wygrywa z wcześniejszym „Usuń pacjenta” (karta wraca); „Odepnij i usuń” to zapis gwiazdki.
// - „Usuń pacjenta” jest operacją kartową (także wizyty nieznane urządzeniu); późniejsza zmiana w karcie na urządzeniu
//   bez wiedzy o usunięciu wygrywa z nagrobkiem i karta wraca z tym, co to urządzenie w niej ma, gdy dostaje nagrobek
//   (hak H1 — pełna karta, ratunek notatki D-21): z jego wersjami i notatkami oraz z tym, co usuwające urządzenie
//   wysłało przed nagrobkiem; bez wersji i notatek, które to urządzenie samo wcześniej usunęło.
// - „Scal pacjentów” X → Y przenosi wizyty i notatki do Y; przeniesienie nie jest zmianą wizyty (nie wygrywa z koszem
//   ani z przycięciem). Wersja, którą scalenie dopisuje pod Y (głowa scalenia), nie jest zapisem lekarza: jej zniknięcie
//   przy tej samej treści widocznej w karcie nie jest utratą (porównanie treści, nie tylko snapshotId).
// - Retencja nie zdejmuje wizyty, której ostatni rejestr gwiazdki jest przypięty, ani wpisu Kosza; od P-TRWALE-WIZYTY
//   (docs/PATIENT_VISITS.md) nie usuwa ostatniego stanu wizyty (visitId): wersja przycięta na innym urządzeniu, która jest
//   na urządzeniu jedyną wersją swojej wizyty w karcie, zostaje i nie jest wskrzeszeniem.
// - Notatka idzie za kartą, która istnieje.
//
// OCENA (ocen) w punkcie, każde urządzenie: widok — karty z eksportu, Kosz z listTrashedSnapshots tylko z patientExists
// (wiersze okna Kosza), notatki pod kartą, która istnieje. Rodzaje naruszeń: „utrata”, „treść”, „gwiazdka”, „gwiazdka
// Kosza”, „obecność” (karta zamiast Kosza albo odwrotnie), „wskrzeszenie”, „także w Koszu”, „inna karta”; pole
// gdzieIndziej — urządzenia punktu, na których ostatnia treść jest widoczna. Każde naruszenie dostaje klasę z jawnej
// tabeli wyjątków WYJATKI albo null (klasa null = czerwień w CI).

export function sortuj(x) {
  if (Array.isArray(x)) return x.map(sortuj);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) o[k] = sortuj(x[k]); return o; }
  return x;
}
const bezPodkr = (p) => {
  if (!p || typeof p !== 'object') return p ?? null;
  const o = {};
  for (const k of Object.keys(p)) if (!k.startsWith('_')) o[k] = p[k];
  // visit.patientId to karta wizyty (zmienia ją „Scal pacjentów”) — położenie ma osobne pole
  if (o.visit && typeof o.visit === 'object') { const { patientId: _karta, ...v } = o.visit; o.visit = v; }
  return o;
};
export const tresc = (p) => JSON.stringify(sortuj(bezPodkr(p)));
// Treść bez tożsamości wizyty (porównanie głowy scalenia z wersją, z której ją zbudowano).
const trescBezWizyty = (t) => { try { const p = JSON.parse(t); if (p && typeof p === 'object') delete p.visit; return JSON.stringify(p); } catch { return t; } };
const wizytaId = (p) => (p && p.visit && typeof p.visit === 'object' ? p.visit.visitId || null : null);
const krotkoTresc = (t) => {
  try { const p = JSON.parse(t); return p && p.user ? `${p.user.height}cm/${p.user.weight}kg` : String(t).slice(0, 40); } catch { return String(t).slice(0, 40); }
};
const tekstNotatki = (n) => JSON.stringify([n.title ?? null, n.body ?? null, n.category ?? null]);

// ── Czas logiczny ────────────────────────────────────────────────────────────────────────────────────────────────────
const B0 = Object.freeze({ t: -1, s: 0 });
export function cmp(a, b) { if (a.t !== b.t) return a.t < b.t ? -1 : 1; return a.s - b.s; }
const maks = (a, b) => (cmp(a, b) >= 0 ? a : b);

// ── Operacje mutacji (wywołania API sejfu z argumentami) ────────────────────────────────────────────────────────────
// Nazwy metod sejfu, których wywołania mutacja() zapisuje; zapisz() czyta z nich rodzaj operacji.
export const OPERACJE = Object.freeze(['restoreTrashedSnapshot', 'mergePatients', 'removePatient', 'moveSnapshotToTrash', 'pruneSnapshotsForPatient', 'updateSnapshotPayload', 'setSnapshotPinned']);
function rozbierz(operacje) {
  const o = { przywroc: new Set(), scal: null, poprawka: new Set() };
  for (const { nazwa, args = [] } of operacje || []) {
    if (nazwa === 'restoreTrashedSnapshot') o.przywroc.add(args[1]);
    else if (nazwa === 'mergePatients') o.scal = { z: args[0], na: args[1] };
    else if (nazwa === 'updateSnapshotPayload') o.poprawka.add(args[1]);
  }
  return o;
}

// ── Projekcja eksportu (urządzenie mutujące; Kosz z eksportu: wpis z treścią) ──────────────────────────────────────
export function projekcja(lad) {
  const P = { karty: new Set(), nagrP: new Set(), w: new Map(), ret: new Set(), stomb: new Set(), n: new Map(), nTomb: new Set(), l: new Map(), li: new Map() };
  for (const p of lad.patients || []) {
    P.karty.add(p.patientId);
    const sn = p.snapshots || [];
    for (const s of sn) P.w.set(s.snapshotId, { loc: 'karta', pid: p.patientId, tresc: tresc(s.payload), pin: !!(s.payload && s.payload._pinned), ile: sn.length, raw: `${s.updatedAtISO || ''}|${s.rev || 0}` });
  }
  for (const t of lad.tombstones || []) P.nagrP.add(t.patientId);
  for (const e of lad.snapshotTombstones || []) {
    P.stomb.add(e.snapshotId);
    if (e.powod === 'retencja') P.ret.add(e.snapshotId);
    if (!P.w.has(e.snapshotId) && e.payload) P.w.set(e.snapshotId, { loc: 'kosz', pid: e.patientId, tresc: tresc(e.payload), pin: null, ile: 0 });
  }
  for (const n of lad.patientNotes || []) P.n.set(n.id, { pid: n.patientId, tekst: tekstNotatki(n), raw: `${n.updatedAtISO || ''}|${n.rev || 0}` });
  for (const t of lad.patientNoteTombstones || []) P.nTomb.add(t.id);
  // notatki biblioteki i listy: wartość + surowy odcisk (zapis bez zmiany treści też jest zapisem — LWW sejfu)
  for (const n of lad.notes || []) P.l.set(n.id, { v: JSON.stringify([n.title ?? null, n.body ?? null]), raw: `${n.updatedAtISO || ''}|${n.rev || 0}` });
  for (const l of lad.patientLists || []) P.li.set(l.id, { v: JSON.stringify([l.name ?? null, [...(l.memberIds || [])].sort()]), raw: `${l.updatedAtISO || ''}|${l.rev || 0}` });
  return P;
}

// ── Widok urządzenia (punkt sprawdzenia) ────────────────────────────────────────────────────────────────────────────
// Karty z eksportu, Kosz z listTrashedSnapshots (wiersze okna Kosza: patientExists), notatki pod kartą, która jest.
export function widokZ(st, kosz) {
  const V = { karty: new Set(), w: new Map(), podwojne: new Map(), koszUkryte: new Map(), n: new Map(), nUkryte: new Map(), l: new Map(), li: new Map() };
  for (const p of st.patients || []) {
    V.karty.add(p.patientId);
    const sn = p.snapshots || [];
    for (const s of sn) V.w.set(s.snapshotId, { loc: 'karta', pid: p.patientId, tresc: tresc(s.payload), pin: !!(s.payload && s.payload._pinned), ile: sn.length, vid: wizytaId(s.payload) });
  }
  for (const e of kosz || []) {
    const x = { loc: 'kosz', pid: e.patientId, tresc: tresc(e.payload), pin: !!e.pinned, ile: 0, vid: wizytaId(e.payload) };
    if (!e.patientExists) { V.koszUkryte.set(e.snapshotId, x); continue; }
    if (V.w.has(e.snapshotId)) { V.podwojne.set(e.snapshotId, x); continue; }
    V.w.set(e.snapshotId, x);
  }
  for (const n of st.patientNotes || []) (V.karty.has(n.patientId) ? V.n : V.nUkryte).set(n.id, { pid: n.patientId, tekst: tekstNotatki(n) });
  for (const n of st.notes || []) V.l.set(n.id, JSON.stringify([n.title ?? null, n.body ?? null]));
  for (const l of st.patientLists || []) V.li.set(l.id, JSON.stringify([l.name ?? null, [...(l.memberIds || [])].sort()]));
  return V;
}
export async function widokUrz(U) {
  const v = U.v || U;
  const st = JSON.parse(JSON.stringify(await v.exportSyncPayload()));
  const kosz = await v.listTrashedSnapshots();
  return widokZ(st, kosz);
}
// Widok kliniczny jako napis (równość widoku dwóch urządzeń; tryb ścisły): karty z wizytami (treść, gwiazdka), okno
// Kosza (treść, gwiazdka), notatki pod kartą, która jest, notatki biblioteki i listy.
export function widokNapis(V) {
  const w = [...V.w.entries()].map(([sid, x]) => [sid, x.loc, x.pid, x.tresc, x.pin]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const n = [...V.n.entries()].map(([id, x]) => [id, x.pid, x.tekst]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const l = [...V.l.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const li = [...V.li.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return JSON.stringify({ karty: [...V.karty].sort(), w, n, l, li });
}

// ── Model ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function nowyModel() {
  return { w: new Map(), n: new Map(), l: new Map(), li: new Map(), karty: new Map(), alias: new Map(), seq: 0, mutacji: 0, baza: false };
}
function karta(M, pid) { let k = M.karty.get(pid); if (!k) { k = { tObec: null, tUsun: null, przyczyna: null }; M.karty.set(pid, k); } return k; }
function obecna(M, pid, czas) { const k = karta(M, pid); if (!k.tObec || cmp(czas, k.tObec) > 0) k.tObec = czas; }
export function zywa(M, pid) { const k = M.karty.get(pid); return !!(k && k.tObec && (!k.tUsun || cmp(k.tObec, k.tUsun) > 0)); }
// Karta docelowa: alias „Scal pacjentów” idzie tylko za zapisem wcześniejszym niż scalenie (zapis późniejszy, na
// urządzeniu bez wiedzy, wskazuje starą kartę).
export function rozwiaz(M, pid, czas) {
  const byly = new Set();
  let p = pid, c = czas;
  while (M.alias.has(p) && !byly.has(p)) {
    const a = M.alias.get(p);
    if (cmp(a.czas, c) < 0) break;
    byly.add(p);
    p = a.do; c = a.czas;
  }
  return p;
}
// Notatka idzie za kartą, która istnieje (E2-PR3c4): alias „Scal pacjentów” zawsze, gdy stara karta nie żyje.
export function rozwiazN(M, pid) {
  const byly = new Set();
  let p = pid;
  while (!zywa(M, p) && M.alias.has(p) && !byly.has(p)) { byly.add(p); p = M.alias.get(p).do; }
  return p;
}
function wizyta(M, sid) {
  let m = M.w.get(sid);
  if (!m) { m = { sid, loc: 'brak', pid: null, tLoc: B0, tresc: null, tTresc: B0, pin: null, tPin: B0, przyczyna: null, przyc: null, kosz: null, utrataE1: null, glowa: false, znane: new Set(), hist: [] }; M.w.set(sid, m); }
  return m;
}
function notatka(M, id) {
  let m = M.n.get(id);
  if (!m) { m = { id, obecna: false, tekst: null, pid: null, tPid: B0, tTekst: B0, tObec: B0, przyczyna: null, hist: [] }; M.n.set(id, m); }
  return m;
}
// Stan bazowy (wspólny wszystkim urządzeniom na początku świata): zapis z chwilą B0.
export function baza(M, lad) {
  const P = projekcja(lad);
  for (const [sid, x] of P.w) {
    const m = wizyta(M, sid);
    Object.assign(m, { loc: x.loc, pid: x.pid, tLoc: B0, tresc: x.tresc, tTresc: B0, pin: x.loc === 'karta' ? x.pin : null, tPin: B0 });
    m.hist.push({ op: 'baza', loc: x.loc, pid: x.pid, tresc: x.tresc });
    if (x.loc === 'karta') obecna(M, x.pid, B0);
  }
  for (const pid of P.karty) obecna(M, pid, B0);
  for (const [id, x] of P.n) Object.assign(notatka(M, id), { obecna: true, tekst: x.tekst, pid: x.pid, tPid: B0, tTekst: B0, tObec: B0 });
  for (const [id, t] of P.l) M.l.set(id, { obecna: true, tekst: t.v, t: B0 });
  for (const [id, t] of P.li) M.li.set(id, { obecna: true, tekst: t.v, t: B0 });
  M.baza = true;
}

// Mutacja lokalna na urządzeniu dev: przed/po — eksporty urządzenia; t — Date.now() urządzenia w chwili mutacji;
// operacje — [{ nazwa, args }] wywołań API sejfu w tej mutacji (OPERACJE).
export function zapisz(M, { dev, opis = '', przed, po, t, operacje = [] }) {
  if (!M.baza) baza(M, przed);
  M.mutacji += 1;
  const czas = { t, s: ++M.seq };
  const a = projekcja(przed), b = projekcja(po);
  const op = rozbierz(operacje);
  const dotkniete = new Set();
  const zapisane = new Set(); // karty, w których ta mutacja jest zmianą (zapis, gwiazdka, kosz)
  // Karty z nowym nagrobkiem w tej mutacji (karta była na urządzeniu); cel — karta docelowa „Scal pacjentów”.
  const noweNagr = [...b.nagrP].filter((p) => !a.nagrP.has(p) && a.karty.has(p) && !b.karty.has(p));
  const cele = new Map(noweNagr.map((p) => [p, op.scal && op.scal.z === p ? op.scal.na : null]));
  const zywePrzed = new Map(noweNagr.map((p) => [p, zywa(M, p)])); // karty usuwane tą mutacją: żywe przed nią?
  // Wizyty. Każde pole zapisywane tylko chwilą późniejszą niż jego ostatni zapis (LWW po polu; zegar urządzenia).
  const czasZ = (tPola, zna) => (zna && cmp(tPola, czas) >= 0 ? { t: tPola.t, s: czas.s } : czas);
  for (const sid of new Set([...a.w.keys(), ...b.w.keys()])) {
    const x = a.w.get(sid), y = b.w.get(sid);
    const przepis = x && y && x.loc === 'karta' && y.loc === 'karta' && x.raw !== y.raw && op.poprawka.has(sid);
    const przywr = op.przywroc.has(sid) && y && y.loc === 'karta';
    if (x && y && x.loc === y.loc && x.pid === y.pid && x.tresc === y.tresc && (x.loc !== 'karta' || x.pin === y.pin) && !przepis && !przywr) continue;
    const m = wizyta(M, sid);
    m.znane.add(dev);
    if (x && !y && !(b.ret.has(sid) && !a.ret.has(sid)) && noweNagr.includes(x.pid) && !cele.get(x.pid)) continue; // „Usuń pacjenta”: pętla kartowa
    dotkniete.add(sid);
    const h = { czas, dev, op: opis };
    // Karta docelowa: zapis w starej karcie X po „Scal pacjentów” X → T (urządzenie bez wiedzy), gdy model ma już tę
    // wizytę pod T — zapis idzie za scaleniem (P1e, K6, E2-PR3c2); wizyta nieprzeniesiona — stara karta wraca (D-4 A).
    const docelowa = (pid) => {
      const al = M.alias.get(pid);
      if (!al || cmp(al.czas, czas) > 0) return pid;
      const ef = efektywny(M, m);
      const tk = ef.loc !== 'brak' && ef.pid ? rozwiaz(M, ef.pid, B0) : null;
      return tk && tk !== pid && zywa(M, tk) ? tk : pid;
    };
    // Urządzenie zna bieżące położenie wizyty w modelu (to samo położenie i karta po aliasach); „Przywróć” zdejmuje
    // wpis Kosza, który urządzenie zna, więc jest późniejsze od niego także przy zegarze spóźnionym.
    const znaLoc = (q) => { const ef = efektywny(M, m); return (!!q && ef.loc === q.loc && (ef.loc === 'brak' || rozwiaz(M, ef.pid, B0) === rozwiaz(M, q.pid, B0))) || (przywr && ef.loc === 'kosz'); };
    const przeniesienie = op.scal && x && y && x.loc === 'karta' && y.loc === 'karta' && x.pid !== y.pid && x.tresc === y.tresc && x.pin === y.pin;
    // D-4 A: zmiana w starej karcie X na urządzeniu, które o „Scal pacjentów” X → … nie wiedziało, podnosi chwilę zapisu
    // X — X wraca jako duplikat karty (zaakceptowane, plan D-4); znacznik dla klasyfikacji „inna karta”.
    if (!przeniesienie && y && y.pid && M.alias.has(y.pid) && cmp(M.alias.get(y.pid).czas, czas) < 0) karta(M, y.pid).zapisPoScaleniu = czas;
    const glowa = op.scal && !x && y && y.loc === 'karta' && y.pid === op.scal.na;
    if (glowa) m.glowa = true; // wersja dopisana przez „Scal pacjentów” pod kartę docelową
    else if (!przeniesienie) m.glowa = false; // późniejsza zmiana tej wersji jest już zapisem lekarza
    if (przeniesienie) {
      // „Scal pacjentów” nie jest zmianą wizyty: nie wygrywa z koszem ani z przycięciem (kosz-przed, E4b-ret), a wizytę
      // usuniętą „Usuń pacjenta” na innym urządzeniu przenosi do żywej karty docelowej — chyba że przed „Usuń pacjenta”
      // leżała w Koszu: wtedy wpis Kosza zostaje (pod usuniętą kartą, jak kosz-przed), a scalenie jej nie przenosi.
      const ef = efektywny(M, m);
      const koszPrzedUsun = ef.loc === 'brak' && ef.przyczyna === 'usuń pacjenta' && m.przedUsun && m.przedUsun.loc === 'kosz';
      if (koszPrzedUsun) { Object.assign(m, { loc: 'kosz', pid: m.przedUsun.pid, tLoc: m.przedUsun.tLoc, przyczyna: null }); h.przeniesienie = 'pominięte (Kosz przed „Usuń pacjenta”)'; }
      else if (ef.loc === 'kosz' || (ef.loc === 'brak' && ef.przyczyna === 'retencja')) { h.przeniesienie = 'pominięte (kosz/przycięcie)'; }
      else { m.loc = 'karta'; m.pid = y.pid; m.tLoc = czas; m.przyczyna = null; m.utrataE1 = null; h.loc = 'karta'; h.pid = y.pid; }
    } else if (y && y.loc === 'karta') {
      // „Przywróć” — zapis treści z chwilą przywrócenia (R4, PD-9), późniejszy od wpisu Kosza, który urządzenie znało.
      const zTresc = !x || x.tresc !== y.tresc || przepis || przywr;
      const zPin = !x || (x.loc === 'karta' && x.pin !== y.pin);
      const znaKosz = przywr && m.kosz && ((x && x.loc === 'kosz') || a.stomb.has(sid));
      const cT = przywr ? czasZ(maks(x && x.tresc === m.tresc ? m.tTresc : B0, znaKosz ? m.kosz : B0), true) : czasZ(m.tTresc, x && x.tresc === m.tresc);
      const cP = czasZ(m.tPin, x && x.loc === 'karta' && x.pin === m.pin), cL = czasZ(m.tLoc, x && znaLoc(x));
      if (zTresc && cmp(cT, m.tTresc) > 0) { m.tresc = y.tresc; m.tTresc = cT; m.devTresc = dev; h.tresc = y.tresc; }
      if (zPin && cmp(cP, m.tPin) > 0) { m.pin = y.pin; m.tPin = cP; h.pin = y.pin; }
      if (zTresc || zPin) { const k = M.karty.get(y.pid); if (k && k.tUsun && cmp(k.tUsun, czas) < 0) { obecna(M, y.pid, czas); zapisane.add(y.pid); } }
      if (cmp(cL, m.tLoc) > 0) {
        const pid = docelowa(y.pid);
        m.loc = 'karta'; m.pid = pid; m.tLoc = cL; m.przyczyna = null; m.utrataE1 = null;
        h.loc = 'karta'; h.pid = pid;
        obecna(M, pid, czas); zapisane.add(pid);
      }
      if (przywr) h.przywroc = true;
    } else if (y && y.loc === 'kosz') {
      const cP = czasZ(m.tPin, x && x.loc === 'karta' && x.pin === m.pin), cL = czasZ(m.tLoc, x && znaLoc(x));
      if (x && x.loc === 'karta' && x.pin && cmp(cP, m.tPin) > 0) { m.pin = false; m.tPin = cP; h.pin = false; }
      if (!x && cmp(czas, m.tTresc) > 0) { m.tresc = y.tresc; m.tTresc = czas; h.tresc = y.tresc; }
      if (cmp(cL, m.tLoc) > 0) {
        const pid = docelowa(y.pid);
        m.loc = 'kosz'; m.pid = pid; m.tLoc = cL; m.przyczyna = null; m.kosz = cL; m.utrataE1 = null;
        h.loc = 'kosz'; h.pid = pid;
        obecna(M, pid, czas); zapisane.add(pid); // kosz to zmiana w karcie: wygrywa z wcześniejszym „Usuń pacjenta” (R4-a: karta wraca)
      }
    } else if (x && !y) {
      const pr = b.ret.has(sid) && !a.ret.has(sid) ? 'retencja' : (noweNagr.includes(x.pid) && !cele.get(x.pid)) ? 'usuń pacjenta' : 'inne';
      const cL = czasZ(m.tLoc, znaLoc(x));
      // porządkowanie (retencja) nie zdejmuje wizyty, która wg modelu leży w Koszu (wpis Kosza wygrywa — E2-PR3c5)
      if (pr === 'retencja' && efektywny(M, m).loc === 'kosz') { h.przyciecie = 'pominięte (w Koszu)'; m.przyc = cL; }
      else if (cmp(cL, m.tLoc) > 0) {
        const ef = efektywny(M, m);
        if (pr === 'usuń pacjenta') { m.przedUsun = { loc: ef.loc, pid: ef.pid, tLoc: ef.tLoc, karta: x.pid, czas: cL, wraca: false }; (m.usunieteNa = m.usunieteNa || new Set()).add(dev); }
        if (pr === 'retencja') { m.przedRet = { loc: ef.loc, pid: ef.pid, tLoc: ef.tLoc }; m.przyc = cL; }
        m.loc = 'brak'; m.tLoc = cL; m.przyczyna = pr; m.utrataE1 = null;
        h.loc = 'brak'; h.przyczyna = pr;
      }
    }
    m.hist.push(h);
  }
  // Powrót karty po „Usuń pacjenta” (hak H1, ratunek notatki D-21): późniejsza zmiana w karcie p na urządzeniu D, które
  // o usunięciu nie wiedziało, przywraca kartę z tym, co D w niej ma, gdy dostaje nagrobek (jego pełna karta): z tym,
  // co D ma teraz, i z tym, co usuwające urządzenie wysłało przed nagrobkiem (kolejka FIFO) — poza wersjami i notatkami,
  // które D samo wcześniej usunęło (ich już nie ma, więc nie wracają).
  const wraca = (m, mam) => mam || !(m.usunieteNa && m.usunieteNa.has(dev));
  for (const p of zapisane) {
    const k = M.karty.get(p);
    if (!k || !k.tUsun || cmp(k.tUsun, czas) >= 0) continue;
    for (const [sid, m] of M.w) if (m.loc === 'brak' && m.przyczyna === 'usuń pacjenta' && m.przedUsun && m.przedUsun.karta === p && wraca(m, a.w.has(sid) && a.w.get(sid).pid === p)) m.przedUsun.wraca = true;
    for (const [id, m] of M.n) if (!m.obecna && m.przyczyna === 'usuń pacjenta' && m.kartaUsun === p && wraca(m, a.n.has(id) && a.n.get(id).pid === p)) m.wraca = true;
  }
  // Operacje kartowe: wizyty modelu w tej karcie, których mutacja nie dotknęła (nieznane urządzeniu).
  for (const p of noweNagr) {
    const k = karta(M, p);
    const cel = cele.get(p);
    // stan efektywny wizyt liczony przed zapisaniem nagrobku (wersje, które wróciły z kartą, usuwa ten nagrobek ponownie)
    for (const [sid, m] of M.w) {
      if (dotkniete.has(sid) || cmp(m.tLoc, czas) >= 0) continue;
      const ef = efektywny(M, m);
      if (ef.loc === 'brak' || rozwiaz(M, ef.pid, ef.tLoc) !== p) continue;
      if (cel && a.w.has(sid) && a.w.get(sid).loc === 'karta') continue;
      // „Scal pacjentów” na urządzeniu, które tej wizyty nie znało (albo znało ją tylko z Kosza): nagrobek scalenia usuwa
      // ją razem z kartą (utrata wersji E1/E1b, P-SYNC-WLASCICIEL „Ograniczenia”).
      if (cel) { m.utrataE1 = { czas, dev, z: p, na: cel }; m.hist.push({ czas, dev, op: opis, kartowa: 'scal (wizyta nieznana urządzeniu scalającemu)' }); }
      else { m.przedUsun = { loc: ef.loc, pid: ef.pid, tLoc: ef.tLoc, karta: p, czas, wraca: false }; (m.usunieteNa = m.usunieteNa || new Set()).add(dev); m.loc = 'brak'; m.tLoc = czas; m.przyczyna = 'usuń pacjenta'; m.hist.push({ czas, dev, op: opis, kartowa: 'usuń pacjenta', loc: 'brak' }); }
    }
    k.tUsun = czas; k.przyczyna = cel ? 'scal' : 'usuń pacjenta';
    if (cel) M.alias.set(p, { do: cel, czas, dev });
  }
  // Notatki pacjentów
  for (const id of new Set([...a.n.keys(), ...b.n.keys()])) {
    const x = a.n.get(id), y = b.n.get(id);
    if (x && y && x.tekst === y.tekst && x.pid === y.pid && x.raw === y.raw) continue;
    const m = notatka(M, id);
    const h = { czas, dev, op: opis, scal: !!op.scal };
    const kartowe = !y && noweNagr.includes(x.pid) && !cele.get(x.pid);
    // notatka, która wróciła z kartą (hak H1, ratunek D-21), jest obecna dla nagrobka tej mutacji
    const obecnaEf = m.obecna || (m.przyczyna === 'usuń pacjenta' && m.wraca && m.kartaUsun && (zywePrzed.has(m.kartaUsun) ? zywePrzed.get(m.kartaUsun) : zywa(M, m.kartaUsun)));
    if (!y && kartowe && !obecnaEf) { h.usun = 'już usunięta w modelu'; m.hist.push(h); continue; }
    if (!y && kartowe && m.pid && m.pid !== x.pid) { h.usun = 'pominięte (notatka przeniesiona do innej karty)'; m.hist.push(h); continue; }
    if (y && y.pid && M.alias.has(y.pid) && cmp(M.alias.get(y.pid).czas, czas) < 0 && !op.scal) karta(M, y.pid).zapisPoScaleniu = czas;
    if (y && (!x || x.tekst !== y.tekst || (x.raw !== y.raw && x.pid === y.pid))) { Object.assign(m, { obecna: true, tekst: y.tekst, pid: y.pid, tPid: czas, tTekst: czas, tObec: czas, przyczyna: null }); h.tekst = y.tekst; h.pid = y.pid; }
    else if (y) { m.pid = y.pid; m.tPid = czas; h.pid = y.pid; }
    else { m.obecna = false; m.tObec = czas; m.przyczyna = kartowe ? 'usuń pacjenta' : b.nTomb.has(id) ? 'usuń notatkę' : 'inne'; m.kartaUsun = m.przyczyna === 'usuń pacjenta' ? x.pid : null; m.wraca = false; (m.usunieteNa = m.usunieteNa || new Set()).add(dev); h.usun = m.przyczyna; }
    m.hist.push(h);
  }
  // Notatki biblioteki i listy
  for (const [slownik, pa, pb] of [[M.l, a.l, b.l], [M.li, a.li, b.li]]) {
    for (const id of new Set([...pa.keys(), ...pb.keys()])) {
      const x = pa.get(id), y = pb.get(id);
      if (x && y && x.v === y.v && x.raw === y.raw) continue;
      const m = slownik.get(id);
      if (m && cmp(czas, m.t) <= 0) continue;
      slownik.set(id, y !== undefined ? { obecna: true, tekst: y.v, t: czas, dev } : { obecna: false, tekst: x.v, t: czas, dev });
    }
  }
}

// Oczekiwane położenie wizyty.
// - „Usuń pacjenta” jest operacją kartową: późniejsza zmiana w tej karcie wygrywa z nagrobkiem pacjenta i karta wraca
//   (hak H1: pełna karta) — wizyty usunięte tym nagrobkiem, które wracają z kartą (przedUsun.wraca), są tam, gdzie były
//   przed usunięciem.
// - Retencja nie przycina wizyty, której ostatni rejestr gwiazdki jest przypięty (npret-K, E4b-ret-pin).
function efektywny(M, m) {
  if (m.loc === 'brak' && m.przyczyna === 'usuń pacjenta' && m.przedUsun && m.przedUsun.wraca && zywa(M, m.przedUsun.karta) && m.przedUsun.loc !== 'brak') return { ...m.przedUsun, h1: true };
  if (m.loc === 'brak' && m.przyczyna === 'retencja' && m.pin === true && m.przedRet && m.przedRet.loc !== 'brak') return { ...m.przedRet, przypieta: true };
  return m;
}
export function oczekWizyty(M, m) {
  const st = efektywny(M, m);
  if (st.loc === 'brak') return { loc: 'brak', przyczyna: st.przyczyna };
  const pid = rozwiaz(M, st.pid, st.tLoc);
  return zywa(M, pid) ? { loc: st.loc, pid, h1: !!st.h1, przypieta: !!st.przypieta } : { loc: 'brak', ukryta: true, pid, h1: !!st.h1 };
}

// ── Ocena widoków jednego punktu ─────────────────────────────────────────────────────────────────────────────────────
// widoki: { nazwa: V }. Wynik: lista naruszeń { encja, id, et, urz, rodzaj, oczek, fakt, gdzieIndziej, klasa, hist }.
export function ocen(M, widoki, { przebieg = null, etykieta = (id) => String(id).slice(0, 6) } = {}) {
  const out = [];
  const nazwy = Object.keys(widoki);
  for (const [sid, m] of M.w) {
    const e = oczekWizyty(M, m);
    const gdzie = nazwy.filter((n) => { const v = widoki[n].w.get(sid); const d = widoki[n].podwojne.get(sid); return (v && v.tresc === m.tresc) || (d && d.tresc === m.tresc); });
    for (const n of nazwy) {
      const V = widoki[n];
      const v = V.w.get(sid) || { loc: 'brak' };
      const r = [];
      if (e.loc !== 'brak' && v.loc === 'brak') r.push('utrata');
      else if (e.loc === 'brak' && v.loc !== 'brak') r.push('wskrzeszenie');
      else if (e.loc !== 'brak') {
        if (v.tresc !== m.tresc) r.push('treść');
        if (e.loc !== v.loc) r.push('obecność');
        if (m.pin !== null && v.loc === e.loc && v.pin !== m.pin) r.push(v.loc === 'karta' ? 'gwiazdka' : 'gwiazdka Kosza');
        if (e.loc === 'karta' && v.loc === 'karta' && v.pid !== e.pid && rozwiaz(M, v.pid, { t: Infinity, s: 0 }) !== e.pid) r.push('inna karta');
        if (e.loc === 'karta' && v.loc === 'karta' && V.podwojne.has(sid)) r.push('także w Koszu');
      }
      // Głowa scalenia nie jest zapisem lekarza: brak tej wersji (albo inna treść) przy tej samej treści widocznej
      // w karcie urządzenia (inna wersja, bez tożsamości wizyty) nie jest utratą.
      const trescGlowy = m.glowa ? trescBezWizyty(m.tresc) : null;
      const glowaWidoczna = m.glowa && [...V.w.values()].some((q) => q.loc === 'karta' && trescBezWizyty(q.tresc) === trescGlowy);
      // P-TRWALE-WIZYTY: retencja nie usuwa ostatniego stanu wizyty — wersja przycięta na innym urządzeniu, która jest
      // tu jedyną wersją swojej wizyty w karcie, zostaje (reguła sejfu, nie wyjątek).
      const ostatniStanWizyty = e.loc === 'brak' && e.przyczyna === 'retencja' && v.loc === 'karta' && v.vid
        && ![...V.w.entries()].some(([q, w]) => q !== sid && w.loc === 'karta' && w.pid === v.pid && w.vid === v.vid);
      for (const rodzaj of r) {
        if (glowaWidoczna && (rodzaj === 'utrata' || rodzaj === 'treść')) continue;
        if (ostatniStanWizyty && rodzaj === 'wskrzeszenie') continue;
        const nar = { encja: 'wizyta', id: sid, et: etykieta(sid), urz: n, rodzaj,
          oczek: { loc: e.loc, pid: e.pid ? etykieta(e.pid) : null, tresc: krotkoTresc(m.tresc), pin: m.pin, przyczyna: m.przyczyna, ukryta: !!e.ukryta },
          fakt: { loc: v.loc, pid: v.pid ? etykieta(v.pid) : null, tresc: v.tresc ? krotkoTresc(v.tresc) : null, pin: v.pin ?? null, ile: v.ile ?? null, wKoszuTez: V.podwojne.has(sid) },
          gdzieIndziej: gdzie };
        nar.klasa = klasaWizyty(M, m, e, v, rodzaj, V, przebieg, sid);
        nar.hist = m.hist.slice(-6).map((h) => ({ t: h.czas ? h.czas.t : null, s: h.czas ? h.czas.s : null, dev: h.dev, op: h.op, ...(h.tresc ? { tresc: krotkoTresc(h.tresc) } : {}), ...(h.pin !== undefined ? { pin: h.pin } : {}), ...(h.loc ? { loc: h.loc, pid: h.pid ? etykieta(h.pid) : undefined } : {}), ...(h.przyczyna ? { przyczyna: h.przyczyna } : {}), ...(h.kartowa ? { kartowa: h.kartowa } : {}) }));
        out.push(nar);
      }
    }
  }
  for (const [id, m] of M.n) {
    const pid = m.pid ? rozwiazN(M, m.pid) : null;
    const h1 = !m.obecna && m.przyczyna === 'usuń pacjenta' && m.kartaUsun && m.wraca && zywa(M, m.kartaUsun);
    const ocz = (m.obecna || h1) && pid && zywa(M, pid);
    const gdzie = nazwy.filter((n) => { const v = widoki[n].n.get(id); return v && v.tekst === m.tekst; });
    for (const n of nazwy) {
      const V = widoki[n];
      const v = V.n.get(id);
      const r = [];
      if (ocz && !v) r.push(V.nUkryte.has(id) ? 'utrata (pod kartą usuniętą)' : 'utrata');
      else if (!ocz && v) r.push('wskrzeszenie');
      else if (ocz && v) {
        if (v.tekst !== m.tekst) r.push('treść');
        if (v.pid !== pid) r.push('inna karta');
      }
      for (const rodzaj of r) {
        out.push({ encja: 'notatka', id, et: etykieta(id), urz: n, rodzaj, oczek: { obecna: m.obecna, pid: pid ? etykieta(pid) : null, zywa: !!(pid && zywa(M, pid)), tekst: m.tekst, przyczyna: m.przyczyna },
          fakt: v ? { pid: etykieta(v.pid), tekst: v.tekst } : (V.nUkryte.has(id) ? { ukryta: etykieta(V.nUkryte.get(id).pid), tekst: V.nUkryte.get(id).tekst } : null), gdzieIndziej: gdzie,
          klasa: klasaNotatki(M, m, rodzaj, przebieg, V, id, v), hist: m.hist.slice(-6).map((h) => ({ t: h.czas.t, s: h.czas.s, dev: h.dev, op: h.op, ...(h.tekst ? { tekst: h.tekst } : {}), ...(h.usun ? { usun: h.usun } : {}) })) });
      }
    }
  }
  for (const [encja, slownik, pole] of [['notatka biblioteki', M.l, 'l'], ['lista', M.li, 'li']]) {
    for (const [id, m] of slownik) {
      for (const n of nazwy) {
        const v = widoki[n][pole].get(id);
        let rodzaj = null;
        if (m.obecna && v === undefined) rodzaj = 'utrata';
        else if (!m.obecna && v !== undefined) rodzaj = 'wskrzeszenie';
        else if (m.obecna && v !== m.tekst) rodzaj = 'treść';
        if (rodzaj) out.push({ encja, id, et: etykieta(id), urz: n, rodzaj, oczek: { obecna: m.obecna, tekst: m.tekst }, fakt: v ?? null, klasa: null, hist: [{ t: m.t.t, s: m.t.s, dev: m.dev }] });
      }
    }
  }
  return out;
}

// ── Jawna tabela wyjątków (klasa → uzasadnienie, źródło, światy) ───────────────────────────────────────────────────
// Naruszenie z klasą spoza tabeli albo w świecie spoza listy klasy (W1 — po samych zdarzeniach, W4 — zdarzenia, a po
// nich pełna wymiana, bloby — świat samych blobów) = czerwień w CI. Odwołania do ALGORITHMS — nazwa wpisu i przybliżony
// wiersz (docs/clinical/ALGORITHMS.md); plan — docs/SYNC_PRZYROSTOWA_PLAN.md.
export const WYJATKI = Object.freeze({
  'E1 (obecność)': Object.freeze({
    opis: 'wizyta, którą ostatni kosz kładzie w Koszu (albo która jest usunięta), zostaje na części urządzeń jedyną wersją karty z najnowszą treścią — wyjątek ostatniej wersji karty (Q8); treść jest widoczna, różni się obecność',
    zrodlo: 'ALGORITHMS „E1 — obecność wizyty przy dwóch koszach offline” (ok. 28060) i „Wpływ kliniczny” P-KOSZ-PO-KLUCZU (ok. 28156: „zostaje w niej tylko jako ostatnia wersja karty, jak dotąd — E1, Q8”); tests/unit/kosz-po-kluczu.test.mjs:203–204',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'E1/E1b (utrata wersji nieznanej scalającemu)': Object.freeze({
    opis: '„Scal pacjentów” X → Y na urządzeniu, które nie znało wersji X (zapisanej na innym urządzeniu bez połączenia albo znanej tylko z Kosza): nagrobek scalenia usuwa X z tą wersją — nie ma jej nigdzie, także przy samych blobach',
    zrodlo: 'ALGORITHMS P-SYNC-WLASCICIEL, „Ograniczenia”: „Utrata wersji (E1/E1b), osobna wada” (ok. 31658–31667); też ok. 31486 (rodzina E1: nagrobek scalenia nie niesie celu)',
    naprawa: 'do naprawy w E3-PR0 (decyzja 9a z 2026-11-15)',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'E4b (stara karta po „Scal pacjentów”)': Object.freeze({
    opis: 'stara karta X przeżywa po samych zdarzeniach na urządzeniu, które o scaleniu nie wiedziało (wizyta jako jedyna wersja albo pod starą kartą); pełna wymiana to leczy (po W4 klasa nie jest dozwolona); w świecie samych blobów — kosz-po-2 K←C,P←K (stara karta X z x na C, znane ograniczenie P5, KAT_ZMIANY)',
    zrodlo: 'ALGORITHMS P-KOSZ-PO-KLUCZU, rodzina E4b (ok. 27831, tabela ok. 27953–27961); kosz-po-2 (P5, ok. 27816)',
    naprawa: 'do naprawy w E3-PR0e (4a)',
    swiaty: Object.freeze(['W1', 'bloby']),
  }),
  'D-4 A (stara karta wraca po zapisie bez wiedzy o scaleniu)': Object.freeze({
    opis: 'zmiana w starej karcie X (wizyta, gwiazdka, notatka) na urządzeniu, które o „Scal pacjentów” X → Y nie wiedziało, jest późniejsza niż scalenie: X wraca na wszystkich urządzeniach jako duplikat karty i trzyma tę wizytę albo notatkę (treść widoczna, w innej karcie tego samego pacjenta); także po pełnej wymianie',
    zrodlo: 'plan D-4 (wariant A: „duplikat karty po „Scal pacjentów” na innym urządzeniu zaakceptowany (do ponownego scalenia)”, docs/SYNC_PRZYROSTOWA_PLAN.md:858); ALGORITHMS P-KOSZ-PO-KLUCZU (ok. 28100–28103: „stara karta — zapisana teraz później niż „Scal pacjentów” — wraca na wszystkich urządzeniach (D-4 A)”)',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'P5 (Kosz pod kartą usuniętą po scaleniu)': Object.freeze({
    opis: 'wizyta dana do Kosza pod kartą, która zniknęła po „Scal pacjentów” (kosz-przed, kosz-po, kosz-po-2): wpis z treścią leży w Koszu, ale okno Kosza go nie pokazuje (patientExists = false) i nie da się go przywrócić',
    zrodlo: 'ALGORITHMS P-KOSZ-PO-KLUCZU: „Domknięcie wymaga celu scalenia w nagrobku (zmiana formatu, P5)” (ok. 28085) i „Wpływ kliniczny” (ok. 28157–28158: wizyty dane do kosza w duplikacie, który zniknął — w koszu, ale bez karty); vilda_kosz_zapisow.js:226',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'P6 (notatka przy starej karcie)': Object.freeze({
    opis: 'notatka dopisana do starej karty na urządzeniu, które o „Scal pacjentów” nie wiedziało (albo zapisana przed scaleniem, ale nieznana urządzeniu scalającemu): zostaje w magazynie bez karty i nie widać jej w żadnej karcie',
    zrodlo: 'ALGORITHMS P-KOSZ-PO-KLUCZU: decyzja P6 (ok. 27817) i „Notatki dopisane do starej karty” (ok. 28104–28107); tests/unit/kosz-po-kluczu-krawedzie.test.mjs:360–390 (F1)',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'D21-9 (notatka przepięta przy równoległym „Usuń pacjenta”)': Object.freeze({
    opis: '„Scal pacjentów” X → Y na jednym urządzeniu równolegle z „Usuń pacjenta” X na drugim: notatki przepięte pod Y giną (nagrobki notatek z „Usuń pacjenta” są późniejsze); wizyty zostają',
    zrodlo: 'ALGORITHMS P-NOTATKI-ZA-KARTA, „Poza zakresem (D21-9)” (ok. 30292–30294); tests/unit/notatki-za-karta.test.mjs:2606–2607, 3265',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'notatki od nowa po „Scal pacjentów”': Object.freeze({
    opis: '„Scal pacjentów” zapisuje notatki źródła od nowa, z nową chwilą: wcześniejsza edycja albo usunięcie tej notatki na innym urządzeniu przegrywa (wskrzeszenie albo starsza treść, nie utrata)',
    zrodlo: 'ALGORITHMS P-DZIENNIK-ZDARZEN, „Osobna sprawa: „Scal pacjentów” zapisuje notatki źródła od nowa” (ok. 26967–26968)',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'retencja (przycięcie bez treści)': Object.freeze({
    opis: 'nagrobek retencji nie niesie treści, a cień jest tylko tutejszy: gwiazdka albo poprawka na starszej kopii zostawia wersję ze starszą treścią albo bez niej; po samych zdarzeniach',
    zrodlo: 'tests/unit/kosz-po-kluczu-fuzz.test.mjs:27–28, 45–50; ALGORITHMS „Retencja przez duplikat w obie strony” (P2, ok. 28108) i tabela E4b-ret (ok. 27960)',
    swiaty: Object.freeze(['W1']),
  }),
  'npret (przypięta wizyta przeżywa przycięcie)': Object.freeze({
    opis: 'przypięta wersja przeżywa przycięcie z innego urządzenia: po samych zdarzeniach bywa jej jeszcze brak (npret-pin, npret-K), po pełnej wymianie jest',
    zrodlo: 'blok p. 5 (KAT_LISTA: npret-pin, npret-K); ALGORITHMS tabela E4b-ret-pin (ok. 27961)',
    swiaty: Object.freeze(['W1']),
  }),
  'Q8-obca-2': Object.freeze({
    opis: 'decyzja „którą wizytę zostawić” odłożona (decyzja 3a z 2026-11-15: miarą jest wynik taki sam jak po pełnej synchronizacji); obie wizyty w Koszu, wpisy pod starą kartą X ukryte',
    zrodlo: 'blok p. 5 (Q8_ZDARZENIA, KAT_ZMIANY_ZD); ALGORITHMS P-DZIENNIK-ZDARZEN (wyjątek Q8-obca-2)',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  R4a: Object.freeze({
    opis: 'gwiazdka wpisu Kosza różni się po samych zdarzeniach; pełna wymiana to leczy, przy samych blobach gwiazdka ginie (zmiana zachowania R4-a)',
    zrodlo: 'klasa 3.6 R4a (tabela DOZWOLONE); blok p. 6 R4-a',
    swiaty: Object.freeze(['W1', 'bloby']),
  }),
  'R4a′': Object.freeze({
    opis: 'treść wpisu Kosza różni się po samych zdarzeniach (Kosz ze starszą treścią); pełna wymiana to leczy, przy samych blobach poprawka ginie (zmiana zachowania R4-a′)',
    zrodlo: 'klasa 3.6 R4a′; blok p. 6 R4-a′',
    swiaty: Object.freeze(['W1', 'bloby']),
  }),
  'karta częściowa (nagrobek przegrał lokalnie, bez haka H1)': Object.freeze({
    opis: 'karta usunięta „Usuń pacjenta” wraca po samych zdarzeniach tylko z wersjami urządzenia, które nagrobka nie znało i wysłało tylko swoją zmianę: u odbiorców nagrobek przegrał lokalnie, więc nie wysyłają pełnej karty (świadomie bez haka H1), a urządzenie z pełną kartą nagrobka nie dostało; dowozi ją pełna wymiana',
    zrodlo: 'ALGORITHMS „Dziennik zdarzeń: haki scalania” (P-DZIENNIK-ZDARZEN, E2-PR3b), „Świadomie bez haka H1”: lokalny nagrobek karty przegrywa z kartą z ładunku (Bsl_zdejmijNagrobek) — karta częściowa u odbiorcy, partialSince w etapie 3, w etapie 2 dowozi ją pełna wysyłka (decyzja 7) (ok. 24409); blok p. 6 „R5-E1, C wysyła tylko zdarzenia”',
    swiaty: Object.freeze(['W1']),
  }),
  'R5-E1': Object.freeze({
    opis: '„Przywróć” przegrywa z „Usuń pacjenta”, gdy kartę przywraca trzecie urządzenie nową wizytą: wizyta jest w Koszu, a nie w karcie (treść widoczna)',
    zrodlo: 'blok p. 6 R5-E1 („ZNANA RÓŻNICA (naprawa: E3-PR0)”)',
    naprawa: 'naprawa: E3-PR0',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
});
const zKlasa = (k) => { if (!WYJATKI[k]) throw new Error(`wyrocznia: klasa spoza tabeli wyjątków: ${k}`); return k; };

// ── Klasyfikacja (jawne wyjątki) ─────────────────────────────────────────────────────────────────────────────────────
function klasaWizyty(M, m, e, v, rodzaj, V, przebieg, sid) {
  if (przebieg && /^Q8-obca-2/.test(przebieg) && ['obecność', 'wskrzeszenie', 'utrata', 'treść'].includes(rodzaj)) return zKlasa('Q8-obca-2');
  if (rodzaj === 'utrata' && e.loc === 'kosz' && V.koszUkryte.has(sid)) return zKlasa('P5 (Kosz pod kartą usuniętą po scaleniu)');
  if (rodzaj === 'obecność' && e.loc === 'karta' && v.loc === 'kosz' && e.h1) return zKlasa('R5-E1');
  if (rodzaj === 'gwiazdka Kosza' && e.loc === 'kosz' && v.loc === 'kosz') return zKlasa('R4a');
  if (rodzaj === 'treść' && e.loc === 'kosz' && v.loc === 'kosz') return zKlasa('R4a′');
  if (rodzaj === 'utrata' && (e.przypieta || (m.przyc && m.pin === true))) return zKlasa('npret (przypięta wizyta przeżywa przycięcie)');
  const ostatnia = v.loc === 'karta' && v.ile === 1;
  const staraKarta = v.pid && M.alias.has(v.pid);
  if ((rodzaj === 'obecność' && e.loc === 'kosz') || (rodzaj === 'wskrzeszenie' && e.ukryta !== true)) {
    if (ostatnia) return zKlasa(zywa(M, rozwiaz(M, v.pid, B0)) && !staraKarta ? 'E1 (obecność)' : 'E4b (stara karta po „Scal pacjentów”)');
  }
  if (rodzaj === 'wskrzeszenie' && ostatnia) return zKlasa(staraKarta ? 'E4b (stara karta po „Scal pacjentów”)' : 'E1 (obecność)');
  if (rodzaj === 'utrata' && e.h1 && V.karty.has(e.pid)) return zKlasa('karta częściowa (nagrobek przegrał lokalnie, bez haka H1)');
  if (m.przyc && cmp(m.przyc, m.tTresc) > 0 && ['treść', 'utrata', 'gwiazdka'].includes(rodzaj)) return zKlasa('retencja (przycięcie bez treści)');
  if (m.utrataE1 && ['utrata', 'treść', 'gwiazdka'].includes(rodzaj)) return zKlasa('E1/E1b (utrata wersji nieznanej scalającemu)');
  if (rodzaj === 'inna karta' && staraKarta) return zKlasa(M.karty.get(v.pid).zapisPoScaleniu ? 'D-4 A (stara karta wraca po zapisie bez wiedzy o scaleniu)' : 'E4b (stara karta po „Scal pacjentów”)');
  if (rodzaj === 'także w Koszu' && ostatnia && V.podwojne.get(sid).tresc === v.tresc) return zKlasa('E1 (obecność)'); // ta sama (najnowsza) treść w karcie i w Koszu
  return null;
}
function klasaNotatki(M, m, rodzaj, przebieg, V, id, v) {
  if (rodzaj === 'utrata (pod kartą usuniętą)' && V.nUkryte.has(id) && M.alias.has(V.nUkryte.get(id).pid)) return zKlasa('P6 (notatka przy starej karcie)');
  if (rodzaj === 'inna karta' && v && M.alias.has(v.pid)) return zKlasa(M.karty.get(v.pid) && M.karty.get(v.pid).zapisPoScaleniu ? 'D-4 A (stara karta wraca po zapisie bez wiedzy o scaleniu)' : 'E4b (stara karta po „Scal pacjentów”)');
  if (rodzaj === 'utrata' && m.obecna && m.hist.some((h) => h.usun === 'pominięte (notatka przeniesiona do innej karty)')) return zKlasa('D21-9 (notatka przepięta przy równoległym „Usuń pacjenta”)');
  const ost = [...m.hist].reverse().find((h) => h.tekst || h.usun);
  if (ost && m.hist.some((h) => h.scal && h.czas && ost.czas && cmp(h.czas, ost.czas) > 0) && (rodzaj === 'wskrzeszenie' || rodzaj === 'treść')) return zKlasa('notatki od nowa po „Scal pacjentów”');
  return null;
}

// Naruszenia, które czerwienią: bez klasy albo z klasą w świecie spoza listy klasy (swiat: 'W1' | 'W4' | 'bloby').
export const bezWyjatku = (lista, swiat) => lista.filter((x) => !x.klasa || !WYJATKI[x.klasa].swiaty.includes(swiat));
// Skrót naruszeń punktu (encja:rodzaj:klasa → liczba).
export function podsumuj(lista) {
  const o = {};
  for (const x of lista) { const k = `${x.encja}:${x.rodzaj}:${x.klasa}`; o[k] = (o[k] || 0) + 1; }
  return o;
}
// Klucz naruszenia bez urządzenia (tryb ścisły: naruszenie W1, którego nie ma w W4 albo w blobach tego punktu).
export const kluczNaruszenia = (x) => `${x.encja}|${x.id}|${x.rodzaj}`;

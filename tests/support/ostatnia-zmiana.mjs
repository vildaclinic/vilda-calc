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
//   (payload._pinned w karcie), położenie (karta pid | Kosz pid | brak z przyczyną: usuń pacjenta, retencja). Zniknięcie
//   bez operacji, która je tłumaczy (bez Kosza, bez nagrobka retencji, bez „Usuń pacjenta”; także wersja karty źródłowej
//   „Scal pacjentów”, której nie ma pod kartą docelową), nie zmienia położenia w modelu: urządzenie dostaje „zniknięcie
//   bez operacji” bez klasy. Tak samo retencja, po której w karcie nie zostaje żadna wersja tej samej wizyty (visitId):
//   „retencja usunęła ostatni stan wizyty” bez klasy (P-TRWALE-WIZYTY);
// - karta (patientId): obecność (ostatni zapis w tej karcie) i usunięcie („Usuń pacjenta” albo źródło „Scal pacjentów”
//   — wtedy alias karta → karta docelowa z chwilą scalenia);
// - notatka pacjenta: tekst (tytuł, treść, kategoria), karta, obecność; notatka biblioteki i lista: wartość i obecność.
// Bez rev, chwil, opisu nagrobków i hasła (pola niewidoczne dla lekarza).
//
// OSTATNIA ZMIANA. LWW po polu według chwili logicznej (zegar urządzenia, numer mutacji). Zapis urządzenia, które znało
// bieżącą wartość pola, jest późniejszy od niej także przy zegarze spóźnionym (chwila = max(zegar, chwila znanej
// wartości); jak Bpp_chwilaZmiany sejfu). Reguły:
// - „Przywróć” jest zapisem treści z chwilą przywrócenia (R4, PD-9: ALGORITHMS P-PRZYWROC-Z-KARTY, „„Przywróć” =
//   najpóźniejsza zmiana (R4, PD-9)”, ok. 28942–28944, i P-POZNIEJSZA-POPRAWKA, „R4, „Przywróć” i import z kosza są
//   najpóźniejszą zmianą zapisu”, ok. 30946–30947) — wygrywa z poprawką z innego urządzenia zrobioną po koszu, której
//   urządzenie przywracające nie znało; chwila przywrócenia jest późniejsza od zdejmowanego wpisu Kosza.
// - Kosz to zmiana w karcie: wygrywa z wcześniejszym „Usuń pacjenta” (karta wraca); „Odepnij i usuń” to zapis gwiazdki.
// - „Usuń pacjenta” jest operacją kartową (także wizyty nieznane urządzeniu); późniejsza zmiana w karcie na urządzeniu
//   bez wiedzy o usunięciu wygrywa z nagrobkiem i karta wraca z tym, co to urządzenie w niej ma, gdy dostaje nagrobek
//   (hak H1 — pełna karta, ratunek notatki D-21): z jego wersjami i notatkami oraz z tym, co usuwające urządzenie
//   wysłało przed nagrobkiem; bez wersji i notatek, które to urządzenie samo wcześniej usunęło.
// - „Scal pacjentów” X → Y przenosi wizyty i notatki do Y; przeniesienie nie jest zmianą wizyty (nie wygrywa z koszem
//   ani z przycięciem). Wersja, którą scalenie dopisuje pod Y (głowa scalenia), nie jest zapisem lekarza: jej zniknięcie
//   przy tej samej treści widocznej w karcie nie jest utratą (porównanie treści, nie tylko snapshotId). Zapis w starej
//   karcie X po scaleniu (urządzenie bez wiedzy o nim) model zapamiętuje przy tej wizycie albo notatce (zapisPoScaleniu),
//   a notatkę X nieznaną urządzeniu scalającemu — przy tej notatce (nieznanaScalajacemu).
// - Retencja nie zdejmuje wizyty, której ostatni rejestr gwiazdki jest przypięty, ani wpisu Kosza; od P-TRWALE-WIZYTY
//   (docs/PATIENT_VISITS.md) nie usuwa ostatniego stanu wizyty (visitId): wersja przycięta na innym urządzeniu, która jest
//   na urządzeniu jedyną wersją swojej wizyty w karcie, zostaje i nie jest wskrzeszeniem; retencja, po której na
//   urządzeniu przycinającym w karcie nie zostaje żadna wersja tej wizyty, nie zmienia modelu (naruszenie bez klasy) —
//   chyba że wersja tej wizyty leży w Koszu (ręczne usunięcie zdejmuje ochronę starszych wersji).
// - Notatka idzie za kartą, która istnieje.
//
// OCENA (ocen) w punkcie, każde urządzenie: widok — karty z eksportu, Kosz z listTrashedSnapshots tylko z patientExists
// (wiersze okna Kosza), notatki pod kartą, która istnieje. Rodzaje naruszeń: „utrata”, „zniknięcie bez operacji”,
// „retencja usunęła ostatni stan wizyty”, „treść”, „gwiazdka” (także gwiazdka wizyty, która jako ostatnia wersja karty
// została w karcie zamiast w Koszu — ma najpóźniejszy rejestr gwiazdki), „gwiazdka Kosza”, „obecność” (karta zamiast
// Kosza albo odwrotnie), „wskrzeszenie”, „także w Koszu”, „inna karta”; pole gdzieIndziej — urządzenia punktu, na
// których ostatnia treść jest widoczna. Każde naruszenie dostaje klasę z jawnej tabeli wyjątków WYJATKI albo null
// (klasa null = czerwień w CI). Klasa wymaga mechanizmu z historii (np. alias „Scal pacjentów” karty, zapis w starej
// karcie po scaleniu, kosz bez wiedzy o ostatniej gwiazdce albo treści), nie samego objawu w widoku.
//
// FLOTA ZE STARSZĄ APLIKACJĄ (E3-PR0b). Zapis historii niesie app urządzenia mutującego ('N' — bieżący sejf, domyślnie;
// 'S221', 'S276' — sejf starszej aplikacji z fikstury, tests/support/starsza-aplikacja.mjs). Ocena bierze stare — nazwy
// widoków urządzeń starszej aplikacji (dochodzą do nich urządzenia z app ≠ 'N' z historii). Klasy floty (WYJATKI z polem
// cechy) działają tylko wtedy, gdy mechanizm z historii leży na urządzeniu starszej aplikacji, które ma daną cechę
// (CECHY_STARSZYCH); ten sam objaw z mechanizmem na bieżącym urządzeniu zostaje bez klasy floty. Klasy floty są dozwolone
// tylko w światach floty ('W1 floty', 'W4 floty' — losowe floty; 'p6f W1', 'p6f W4' — scenariusze deterministyczne);
// klasa samych bieżących urządzeń obowiązuje w świecie floty tak jak w jego odpowiedniku bez floty (SWIATY_FLOTY).
// Starsza aplikacja nie pisze tożsamości wizyty (payload.visit), a bieżąca dopisuje ją przy odczycie i scalaniu: gdy
// oczekiwany zapis treści nie ma payload.visit, treść faktu porównuje się bez niej (rownaTresc; gdy ma — ściśle).
// Przypadki z przyczyną po stronie bieżącej aplikacji klasy floty nie dostają.

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
// Normalizacja tożsamości wizyty (E3-PR0b) według OCZEKIWANEGO zapisu, nie według urządzenia: gdy ostatni zapis treści
// nie ma payload.visit (starsza aplikacja jej nie pisze; bieżąca wyznacza ją przy odczycie — Bvisit_legacy, vilda_vault.js
// :5908–5918, docs/PATIENT_VISITS.md:45), treść faktu porównuje się bez visit; gdy ma — porównanie jest ścisłe.
// E2_AB_NORM_VISIT=0 wyłącza normalizację (pomiar fałszywych naruszeń „treść”); NORM_VISIT.uzyta — liczba porównań
// rozstrzygniętych normalizacją. normalizuj = false — porównanie ścisłe (rownaW: tożsamość wizyty faktu przeczy widokowi).
const maWizyte = (t) => { try { const p = JSON.parse(t); return !!p && typeof p === 'object' && 'visit' in p; } catch { return false; } };
export const NORM_VISIT = { wlaczona: process.env.E2_AB_NORM_VISIT !== '0', uzyta: 0 };
export function rownaTresc(fakt, ocz, normalizuj = true) {
  if (fakt === ocz) return true;
  if (!NORM_VISIT.wlaczona || !normalizuj || fakt == null || ocz == null || maWizyte(ocz)) return false;
  const r = trescBezWizyty(fakt) === ocz;
  if (r) NORM_VISIT.uzyta += 1;
  return r;
}
// Treść wersji v widoku wobec oczekiwanej: normalizacja tylko wtedy, gdy tożsamość wizyty faktu nie przeczy widokowi —
// w widoku bieżącej aplikacji visit.patientId faktu jest kartą wersji (albo wpisu Kosza) albo go nie ma (bieżąca
// wyznacza tożsamość z karty; treść porównuje się bez visit.patientId, więc inaczej błędna karta wizyty zniknęłaby razem
// z visit). Widok starszej aplikacji (stary) — bez warunku: ona tożsamości wizyty nie utrzymuje (np. „Scal pacjentów” jej
// nie zmienia).
const rownaW = (v, ocz, stary) => rownaTresc(v.tresc, ocz, stary || !v.vpid || v.vpid === v.pid);
const wizytaId = (p) => (p && p.visit && typeof p.visit === 'object' ? p.visit.visitId || null : null);
const kartaWizyty = (p) => (p && p.visit && typeof p.visit === 'object' && p.visit.patientId != null ? p.visit.patientId : null);
const krotkoTresc = (t) => {
  try { const p = JSON.parse(t); return p && p.user ? `${p.user.height}cm/${p.user.weight}kg` : String(t).slice(0, 40); } catch { return String(t).slice(0, 40); }
};
const tekstNotatki = (n) => JSON.stringify([n.title ?? null, n.body ?? null, n.category ?? null]);

// ── Czas logiczny ────────────────────────────────────────────────────────────────────────────────────────────────────
const B0 = Object.freeze({ t: -1, s: 0 });
export function cmp(a, b) { if (a.t !== b.t) return a.t < b.t ? -1 : 1; return a.s - b.s; }
const maks = (a, b) => (cmp(a, b) >= 0 ? a : b);

// ── Starsza aplikacja we flocie (E3-PR0b) ──────────────────────────────────────────────────────────────────────────
// Cechy sejfu starszej aplikacji, na których stoją mechanizmy klas floty (fikstury tests/fixtures/vilda_vault-221.js.txt
// i vilda_vault-276.js.txt, retencja tests/fixtures/vilda_retention-v1.js.txt; tests/support/starsza-aplikacja.mjs):
// - retencja v1 — przycina bez ochrony wizyt (computeRetention bez protectedVisitSnapshotIds); obie wersje;
// - bez składników W3 — nie zna rejestru gwiazdki (_pinnedState), chwili treści (_contentAtISO) ani pola gwiazdka wpisu
//   Kosza; „Odepnij i usuń” wkłada do Kosza treść z _pinned (fikstura 221:757–787); rekord tej samej wersji bierze w całości
//   (Bkz_nowszaWersja, fikstura 221:454–462); tylko 221 (276 ma Bgw_);
// - najpierw rev — wersję tej samej karty wybiera po rev, a nie po chwili zmiany (docs/clinical/ALGORITHMS.md, „Flota
//   mieszana”, ok. 29442–29445); tylko 221;
// - bez haka H1 — nie ma haków dziennika zdarzeń (Bem_): karta, która wraca jej zmianą, nie niesie pełnej karty; tylko 221;
// - bez ratunku notatek — nie ma ratunku notatki D-21 (Bnp_) ani pola deletedWithPatient nagrobka notatki
//   (vilda_vault.js:4901); tylko 221.
export const BIEZACA = 'N';
const RETENCJA_V1 = 'retencja v1', BEZ_W3 = 'bez składników W3', NAJPIERW_REV = 'najpierw rev', BEZ_H1 = 'bez haka H1', BEZ_RATUNKU = 'bez ratunku notatek';
export const CECHY_STARSZYCH = Object.freeze({
  S221: Object.freeze([RETENCJA_V1, BEZ_W3, NAJPIERW_REV, BEZ_H1, BEZ_RATUNKU]),
  S276: Object.freeze([RETENCJA_V1]),
});
// Urządzenie dev (z historii) ma cechę starszej aplikacji?
const maCeche = (M, dev, cecha) => { const c = CECHY_STARSZYCH[M.app.get(dev)]; return !!c && c.includes(cecha); };
// Wersja przed „Usuń pacjenta”: urządzenie starszej aplikacji, którego retencja v1 usunęła u siebie ostatni stan jej
// wizyty (null — brak takiego przycięcia); przy „Usuń pacjenta” retOstatni jest zerowane, więc zapamiętuje je przedUsun.
const retDevStarszej = (M, m) => (m.retOstatni && maCeche(M, m.retOstatni.dev, RETENCJA_V1) ? m.retOstatni.dev : null);
// Karta X wróciła przed chwilą czas: wcześniejszy zapis wizyty albo notatki w starej karcie X po „Scal pacjentów” na
// urządzeniu bez wiedzy o nim (D-4 A; zapisPoScaleniu).
const wrocilaPrzed = (M, pid, czas) => [M.w, M.n].some((mapa) => {
  for (const q of mapa.values()) if (q.zapisPoScaleniu && q.zapisPoScaleniu.pid === pid && cmp(q.zapisPoScaleniu.czas, czas) < 0) return true;
  return false;
});
// Nowy zapis treści wersji zdejmuje znaczniki mechanizmów, które dotyczyły poprzedniej treści.
const zapisTresci = (m) => { m.trescNadpisana = null; m.gwiazdkaJakTresc = null; m.przywrocenieStarszej = null; };

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
  const P = { karty: new Set(), nagrP: new Set(), w: new Map(), ret: new Set(), stomb: new Set(), wizytyWKoszu: new Set(), n: new Map(), nTomb: new Set(), l: new Map(), li: new Map() };
  for (const p of lad.patients || []) {
    P.karty.add(p.patientId);
    const sn = p.snapshots || [];
    for (const s of sn) P.w.set(s.snapshotId, { loc: 'karta', pid: p.patientId, tresc: tresc(s.payload), pin: !!(s.payload && s.payload._pinned), ile: sn.length, vid: wizytaId(s.payload), raw: `${s.updatedAtISO || ''}|${s.rev || 0}`, rev: s.rev || 0 });
  }
  for (const t of lad.tombstones || []) P.nagrP.add(t.patientId);
  for (const e of lad.snapshotTombstones || []) {
    P.stomb.add(e.snapshotId);
    if (e.powod === 'retencja') P.ret.add(e.snapshotId);
    // wizyty z wersją usuniętą ręcznie (Kosz; tożsamość z treści wpisu albo z visitIdentity nagrobka bez treści)
    else { const vid = wizytaId(e.payload) || (e.visitIdentity && e.visitIdentity.visitId) || null; if (vid) P.wizytyWKoszu.add(vid); }
    if (!P.w.has(e.snapshotId) && e.payload) P.w.set(e.snapshotId, { loc: 'kosz', pid: e.patientId, tresc: tresc(e.payload), pin: null, ile: 0, vid: wizytaId(e.payload) });
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
// E3-PR0b: vpid — visit.patientId treści (rownaW); ret — wersje z nagrobkiem retencji w eksporcie (bez treści).
export function widokZ(st, kosz) {
  const V = { karty: new Set(), w: new Map(), podwojne: new Map(), koszUkryte: new Map(), n: new Map(), nUkryte: new Map(), l: new Map(), li: new Map(), ret: new Set() };
  for (const p of st.patients || []) {
    V.karty.add(p.patientId);
    const sn = p.snapshots || [];
    for (const s of sn) V.w.set(s.snapshotId, { loc: 'karta', pid: p.patientId, tresc: tresc(s.payload), pin: !!(s.payload && s.payload._pinned), ile: sn.length, vid: wizytaId(s.payload), vpid: kartaWizyty(s.payload), rev: s.rev || 0 });
  }
  for (const e of st.snapshotTombstones || []) if (e.powod === 'retencja') V.ret.add(e.snapshotId);
  for (const e of kosz || []) {
    const x = { loc: 'kosz', pid: e.patientId, tresc: tresc(e.payload), pin: !!e.pinned, ile: 0, vid: wizytaId(e.payload), vpid: kartaWizyty(e.payload) };
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
  return { w: new Map(), n: new Map(), l: new Map(), li: new Map(), karty: new Map(), alias: new Map(), app: new Map(), seq: 0, mutacji: 0, baza: false };
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
  if (!m) {
    m = { sid, loc: 'brak', pid: null, tLoc: B0, tresc: null, tTresc: B0, pin: null, tPin: B0, przyczyna: null, przyc: null, kosz: null, utrataE1: null, glowa: false,
      bezOperacji: null, retOstatni: null, zapisPoScaleniu: null, koszWStarej: null, koszIle: null, koszBezGwiazdki: false, koszBezTresci: false, znane: new Set(), hist: [],
      // flota ze starszą aplikacją (E3-PR0b): autor ostatniego zapisu gwiazdki i urządzenie, które wersję utworzyło;
      // znaczniki mechanizmów klas floty (zapisz) i najwyższy rev widziany przy każdej treści tej wersji
      devPin: null, utworzona: null, gwStarszej: null, trescNadpisana: null, gwiazdkaNadpisana: null, gwiazdkaJakTresc: null, przywrocenieStarszej: null, koszStarszej: null, revTresci: new Map() };
    M.w.set(sid, m);
  }
  return m;
}
function notatka(M, id) {
  let m = M.n.get(id);
  if (!m) { m = { id, obecna: false, tekst: null, pid: null, tPid: B0, tTekst: B0, tObec: B0, przyczyna: null, zapisPoScaleniu: null, nieznanaScalajacemu: null, devUsun: null, wracaPrzez: null, wracaZNotatka: null, hist: [] }; M.n.set(id, m); }
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
// operacje — [{ nazwa, args }] wywołań API sejfu w tej mutacji (OPERACJE); app — aplikacja urządzenia (E3-PR0b: 'N'
// — bieżąca, domyślnie; 'S221', 'S276' — starsza, CECHY_STARSZYCH).
export function zapisz(M, { dev, app = BIEZACA, opis = '', przed, po, t, operacje = [] }) {
  if (!M.baza) baza(M, przed);
  M.mutacji += 1;
  M.app.set(dev, app);
  const ma = (d, c) => maCeche(M, d, c);
  const bezW3 = ma(dev, BEZ_W3);
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
  // Nowe położenie wizyty zdejmuje znaczniki stanu, którego już nie ma (utrata E1/E1b, zniknięcie bez operacji,
  // retencja ostatniego stanu wizyty).
  const nowePolozenie = (m) => { m.utrataE1 = null; m.bezOperacji = null; m.retOstatni = null; };
  for (const sid of new Set([...a.w.keys(), ...b.w.keys()])) {
    const x = a.w.get(sid);
    let y = b.w.get(sid);
    // „Scal pacjentów” X → Y: wersja karty X, którą urządzenie scalające znało, przechodzi pod Y. Jej zniknięcie (bez
    // wpisu Kosza i bez nagrobka retencji) nie jest zmianą lekarza: model oczekuje jej pod Y (urządzenie ją znało, więc
    // to nie E1/E1b), a ocena zgłasza na tym urządzeniu „zniknięcie bez operacji” bez klasy.
    let bezOp = null;
    if (x && !y && x.loc === 'karta' && op.scal && x.pid === op.scal.z && !(b.ret.has(sid) && !a.ret.has(sid))) {
      y = { ...x, pid: op.scal.na, ile: 0 };
      bezOp = 'zniknięcie przy „Scal pacjentów”';
    }
    const przepis = x && y && x.loc === 'karta' && y.loc === 'karta' && x.raw !== y.raw && op.poprawka.has(sid);
    const przywr = op.przywroc.has(sid) && y && y.loc === 'karta';
    if (x && y && x.loc === y.loc && x.pid === y.pid && x.tresc === y.tresc && (x.loc !== 'karta' || x.pin === y.pin) && !przepis && !przywr) continue;
    const nowa = !M.w.has(sid);
    const m = wizyta(M, sid);
    m.znane.add(dev);
    // E3-PR0b: urządzenie, które wersję utworzyło, i najwyższy rev widziany przy każdej treści tej wersji („najpierw rev”)
    if (nowa && y && y.loc === 'karta') m.utworzona = dev;
    for (const q of [x, y]) if (q && q.loc === 'karta' && !(m.revTresci.get(q.tresc) >= q.rev)) m.revTresci.set(q.tresc, q.rev);
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
    // D-4 A: zmiana tej wizyty w starej karcie X (treść albo gwiazdka) na urządzeniu, które o „Scal pacjentów” X → … nie
    // wiedziało, podnosi chwilę zapisu X — X wraca jako duplikat karty z tą wizytą (zaakceptowane, plan D-4); znacznik
    // przy wizycie (nie przy karcie) dla klasyfikacji „inna karta”. Kosz w starej karcie — osobny znacznik (koszWStarej).
    const wStarej = !przeniesienie && !!y && !!y.pid && M.alias.has(y.pid) && cmp(M.alias.get(y.pid).czas, czas) < 0;
    if (wStarej && y.loc === 'karta') m.zapisPoScaleniu = { czas, pid: y.pid };
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
      else { m.loc = 'karta'; m.pid = y.pid; m.tLoc = czas; m.przyczyna = null; nowePolozenie(m); h.loc = 'karta'; h.pid = y.pid; }
    } else if (y && y.loc === 'karta') {
      // „Przywróć” — zapis treści z chwilą przywrócenia (R4, PD-9), późniejszy od wpisu Kosza, który urządzenie znało.
      const zTresc = !x || x.tresc !== y.tresc || przepis || przywr;
      const zPin = !x || (x.loc === 'karta' && x.pin !== y.pin);
      const znaKosz = przywr && m.kosz && ((x && x.loc === 'kosz') || a.stomb.has(sid));
      const cT = przywr ? czasZ(maks(x && x.tresc === m.tresc ? m.tTresc : B0, znaKosz ? m.kosz : B0), true) : czasZ(m.tTresc, x && x.tresc === m.tresc);
      const cP = czasZ(m.tPin, x && x.loc === 'karta' && x.pin === m.pin), cL = czasZ(m.tLoc, x && znaLoc(x));
      const przedT = { tresc: m.tresc, dev: m.devTresc }, przedP = { pin: m.pin, dev: m.devPin };
      const trescZapisana = zTresc && cmp(cT, m.tTresc) > 0, pinZapisany = zPin && cmp(cP, m.tPin) > 0;
      if (trescZapisana) { m.tresc = y.tresc; m.tTresc = cT; m.devTresc = dev; h.tresc = y.tresc; h.rev = y.rev; zapisTresci(m); }
      if (pinZapisany) { m.pin = y.pin; m.tPin = cP; m.devPin = dev; h.pin = y.pin; m.gwiazdkaNadpisana = null; }
      // Flota ze starszą aplikacją (E3-PR0b) — znaczniki mechanizmów klas floty:
      // - gwiazdka bez rejestru W3: „Przywróć” albo zmiana gwiazdki istniejącej wersji na urządzeniu bez składników W3
      //   (bieżąca aplikacja zachowuje wtedy gwiazdkę sprzed — pinN; starsza pokazuje swoją — pinStarszej); zapis gwiazdki
      //   bieżącej aplikacji zdejmuje znacznik;
      if (bezW3 && ((pinZapisany && x) || przywr)) m.gwStarszej = { czas, dev, rodzaj: przywr ? 'przywróć' : 'gwiazdka', pinN: m.gwStarszej ? m.gwStarszej.pinN : (przedP.pin ?? y.pin), pinStarszej: y.pin };
      else if (!bezW3 && pinZapisany) m.gwStarszej = null;
      // - „Przywróć” bez chwili treści: przywrócenie na urządzeniu bez składników W3, gdy ostatni zapis treści przed nim
      //   (poprawka) zrobiła bieżąca aplikacja — w porządku LWW jest on późniejszy od przywracanej treści, a Bgw_stan czyta
      //   przywrócenie jak zmianę samej gwiazdki: zostaje poprawka;
      if (bezW3 && przywr && trescZapisana && przedT.dev && !ma(przedT.dev, BEZ_W3) && przedT.tresc !== y.tresc) m.przywrocenieStarszej = { czas, dev, poprawka: przedT.tresc };
      // - zmiana starszej aplikacji nadpisana przed wysłaniem: ostatni zapis treści (gwiazdki) zrobiło urządzenie bez
      //   składników W3, a ten zapis bieżącej aplikacji go nie znał i go nie zastąpił — starsza bierze cały nowszy rekord;
      if (!bezW3 && x && x.loc === 'karta') {
        if (przedT.dev && ma(przedT.dev, BEZ_W3) && x.tresc !== przedT.tresc && m.devTresc === przedT.dev) m.trescNadpisana = { czas, dev, tresc: y.tresc };
        if (przedP.dev && ma(przedP.dev, BEZ_W3) && x.pin !== przedP.pin && m.devPin === przedP.dev) m.gwiazdkaNadpisana = { czas, dev, pin: y.pin };
      }
      // - gwiazdka starszej aplikacji na wersji, którą sama utworzyła (bez pól W3), bez wiedzy o poprawce z bieżącej
      //   aplikacji: bieżąca czyta ją jak zmianę treści (PD-12) i bierze starą treść urządzenia starszej aplikacji.
      if (bezW3 && pinZapisany && !trescZapisana && m.utworzona && ma(m.utworzona, BEZ_W3) && m.devTresc && !ma(m.devTresc, BEZ_W3) && x && x.tresc !== m.tresc) m.gwiazdkaJakTresc = { czas, dev, tresc: y.tresc };
      if (zTresc || zPin) { const k = M.karty.get(y.pid); if (k && k.tUsun && cmp(k.tUsun, czas) < 0) { obecna(M, y.pid, czas); zapisane.add(y.pid); } }
      if (cmp(cL, m.tLoc) > 0) {
        const pid = docelowa(y.pid);
        m.loc = 'karta'; m.pid = pid; m.tLoc = cL; m.przyczyna = null; nowePolozenie(m);
        h.loc = 'karta'; h.pid = pid;
        obecna(M, pid, czas); zapisane.add(pid);
      }
      if (przywr) h.przywroc = true;
    } else if (y && y.loc === 'kosz') {
      const cP = czasZ(m.tPin, x && x.loc === 'karta' && x.pin === m.pin), cL = czasZ(m.tLoc, x && znaLoc(x));
      // Urządzenie dające do Kosza znało ostatnią gwiazdkę i ostatnią treść wizyty? (mechanizm R4a i R4a′: kosz na
      // urządzeniu bez wiedzy o późniejszej gwiazdce albo poprawce z innego urządzenia)
      const pinZnany = !x || x.loc !== 'karta' || m.pin === null || x.pin === m.pin;
      const trescZnana = !x || x.loc !== 'karta' || x.tresc === m.tresc;
      const przedT = { dev: m.devTresc }, przedP = { pin: m.pin, dev: m.devPin };
      if (x && x.loc === 'karta' && x.pin && cmp(cP, m.tPin) > 0) { m.pin = false; m.tPin = cP; h.pin = false; m.devPin = dev; m.gwiazdkaNadpisana = null; }
      if (!x && cmp(czas, m.tTresc) > 0) { m.tresc = y.tresc; m.tTresc = czas; m.devTresc = dev; h.tresc = y.tresc; zapisTresci(m); }
      if (cmp(cL, m.tLoc) > 0) {
        const pid = docelowa(y.pid);
        m.loc = 'kosz'; m.pid = pid; m.tLoc = cL; m.przyczyna = null; m.kosz = cL; nowePolozenie(m);
        m.koszIle = x && x.loc === 'karta' ? x.ile : null;
        m.koszBezGwiazdki = !pinZnany; m.koszBezTresci = !trescZnana;
        // E3-PR0b: kosz bieżącej aplikacji bez wiedzy o ostatniej treści (gwiazdce) zapisanej na urządzeniu bez składników
        // W3 — starsza trzyma ją tylko w karcie i traci po nagrobku (R4a i R4a′ także po pełnej wymianie); kosz na
        // urządzeniu bez składników W3 — wpis bez pola gwiazdka (W20: decyduje gwiazdka wersji sprzed kosza).
        m.koszStarszej = bezW3 ? null : { tresc: !trescZnana && !!przedT.dev && ma(przedT.dev, BEZ_W3), pin: !pinZnany && !!przedP.dev && ma(przedP.dev, BEZ_W3) };
        m.gwStarszej = bezW3 && x && x.loc === 'karta' ? { czas, dev, rodzaj: 'kosz', pinN: m.gwStarszej ? m.gwStarszej.pinN : (przedP.pin ?? x.pin), pinStarszej: x.pin } : null;
        // kosz w starej karcie X po scaleniu (kosz-po-2); wrocila — X wróciła wcześniejszym zapisem po scaleniu (D-4 A)
        m.koszWStarej = wStarej ? { czas, pid: y.pid, wrocila: wrocilaPrzed(M, y.pid, czas) } : null;
        h.loc = 'kosz'; h.pid = pid;
        obecna(M, pid, czas); zapisane.add(pid); // kosz to zmiana w karcie: wygrywa z wcześniejszym „Usuń pacjenta” (R4-a: karta wraca)
      }
    } else if (x && !y) {
      const pr = b.ret.has(sid) && !a.ret.has(sid) ? 'retencja' : (noweNagr.includes(x.pid) && !cele.get(x.pid)) ? 'usuń pacjenta' : 'inne';
      const cL = czasZ(m.tLoc, znaLoc(x));
      // P-TRWALE-WIZYTY: po retencji w karcie zostaje co najmniej jedna wersja tej wizyty (visitId) — inaczej retencja
      // usunęła ostatni stan wizyty (bez zmiany modelu; ocena: naruszenie bez klasy na urządzeniu przycinającym). Wyjątek
      // sejfu: wersja tej wizyty usunięta ręcznie (Kosz) zdejmuje ochronę starszych wersji (Bvisit_applyDeletedHeads;
      // docs/PATIENT_VISITS.md: „Znana ręcznie usunięta najnowsza wersja nadal rozstrzyga…”).
      const ostatniStan = pr === 'retencja' && x.loc === 'karta' && !!x.vid && !a.wizytyWKoszu.has(x.vid) && !b.wizytyWKoszu.has(x.vid)
        && ![...b.w.values()].some((w) => w.loc === 'karta' && w.pid === x.pid && w.vid === x.vid);
      // porządkowanie (retencja) nie zdejmuje wizyty, która wg modelu leży w Koszu (wpis Kosza wygrywa — E2-PR3c5)
      if (pr === 'retencja' && efektywny(M, m).loc === 'kosz') { h.przyciecie = 'pominięte (w Koszu)'; m.przyc = cL; }
      else if (pr === 'inne') { m.bezOperacji = { czas, dev, opis: 'zniknięcie bez operacji' }; h.bezOperacji = m.bezOperacji.opis; }
      else if (ostatniStan) { m.retOstatni = { czas, dev, vid: x.vid }; h.przyciecie = 'bez zmiany modelu (ostatni stan wizyty)'; }
      else if (cmp(cL, m.tLoc) > 0) {
        const ef = efektywny(M, m);
        if (pr === 'usuń pacjenta') { m.przedUsun = { loc: ef.loc, pid: ef.pid, tLoc: ef.tLoc, karta: x.pid, czas: cL, wraca: false, retDev: retDevStarszej(M, m) }; (m.usunieteNa = m.usunieteNa || new Set()).add(dev); }
        if (pr === 'retencja') { m.przedRet = { loc: ef.loc, pid: ef.pid, tLoc: ef.tLoc }; m.przyc = cL; }
        m.loc = 'brak'; m.tLoc = cL; m.przyczyna = pr; nowePolozenie(m);
        h.loc = 'brak'; h.przyczyna = pr;
      }
    }
    if (bezOp) { m.bezOperacji = { czas, dev, opis: bezOp }; h.bezOperacji = bezOp; }
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
    // E3-PR0b: przez — urządzenie, którego zmiana pierwsza przywróciła kartę (hak H1 albo jego brak w starszej aplikacji);
    // przy notatce także to, czy to urządzenie miało ją przed tą zmianą (wracaZNotatka: jego pełna kopia niesie jej rekord)
    for (const [sid, m] of M.w) if (m.loc === 'brak' && m.przyczyna === 'usuń pacjenta' && m.przedUsun && m.przedUsun.karta === p && wraca(m, a.w.has(sid) && a.w.get(sid).pid === p)) { if (!m.przedUsun.wraca) m.przedUsun.przez = dev; m.przedUsun.wraca = true; }
    for (const [id, m] of M.n) if (!m.obecna && m.przyczyna === 'usuń pacjenta' && m.kartaUsun === p && wraca(m, a.n.has(id) && a.n.get(id).pid === p)) { if (!m.wraca) { m.wracaPrzez = dev; m.wracaZNotatka = a.n.has(id); } m.wraca = true; }
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
      else { m.przedUsun = { loc: ef.loc, pid: ef.pid, tLoc: ef.tLoc, karta: p, czas, wraca: false, retDev: retDevStarszej(M, m) }; (m.usunieteNa = m.usunieteNa || new Set()).add(dev); m.loc = 'brak'; m.tLoc = czas; m.przyczyna = 'usuń pacjenta'; m.bezOperacji = null; m.retOstatni = null; m.hist.push({ czas, dev, op: opis, kartowa: 'usuń pacjenta', loc: 'brak' }); }
    }
    k.tUsun = czas; k.przyczyna = cel ? 'scal' : 'usuń pacjenta';
    if (cel) {
      M.alias.set(p, { do: cel, czas, dev });
      // P6: notatki karty źródłowej, których urządzenie scalające nie znało, zostają pod starą kartą
      for (const [id, n] of M.n) if (n.obecna && n.pid === p && !a.n.has(id)) n.nieznanaScalajacemu = { czas, pid: p };
    }
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
    // zapis notatki w starej karcie X po „Scal pacjentów” (urządzenie bez wiedzy o nim): D-4 A albo P6 tej notatki
    if (y && y.pid && M.alias.has(y.pid) && cmp(M.alias.get(y.pid).czas, czas) < 0 && !op.scal) m.zapisPoScaleniu = { czas, pid: y.pid };
    if (y && (!x || x.tekst !== y.tekst || (x.raw !== y.raw && x.pid === y.pid))) { Object.assign(m, { obecna: true, tekst: y.tekst, pid: y.pid, tPid: czas, tTekst: czas, tObec: czas, przyczyna: null }); h.tekst = y.tekst; h.pid = y.pid; }
    else if (y) { m.pid = y.pid; m.tPid = czas; h.pid = y.pid; }
    else { m.obecna = false; m.tObec = czas; m.przyczyna = kartowe ? 'usuń pacjenta' : b.nTomb.has(id) ? 'usuń notatkę' : 'inne'; m.kartaUsun = m.przyczyna === 'usuń pacjenta' ? x.pid : null; m.wraca = false; m.devUsun = dev; m.wracaPrzez = null; m.wracaZNotatka = null; (m.usunieteNa = m.usunieteNa || new Set()).add(dev); h.usun = m.przyczyna; }
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
// stare (E3-PR0b) — nazwy widoków urządzeń starszej aplikacji; dochodzą do nich urządzenia z app ≠ 'N' z historii.
// Klasy floty sprawdza się tylko przy niepustym zbiorze stare, przed klasami samych bieżących urządzeń.
export function ocen(M, widoki, { etykieta = (id) => String(id).slice(0, 6), stare = null } = {}) {
  const out = [];
  const nazwy = Object.keys(widoki);
  const stareW = new Set([...(stare || []), ...[...M.app].filter(([, a]) => a !== BIEZACA).map(([d]) => d)]);
  const flota = stareW.size > 0;
  for (const [sid, m] of M.w) {
    const e = oczekWizyty(M, m);
    const gdzie = nazwy.filter((n) => { const v = widoki[n].w.get(sid); const d = widoki[n].podwojne.get(sid); const st = stareW.has(n); return (v && rownaW(v, m.tresc, st)) || (d && rownaW(d, m.tresc, st)); });
    // widoki z oczekiwaną gwiazdką wersji w karcie (klasy floty; liczone tylko przy naruszeniu gwiazdki)
    const gdziePin = () => nazwy.filter((n) => { const v = widoki[n].w.get(sid); return !!v && v.loc === 'karta' && v.pin === m.pin; });
    for (const n of nazwy) {
      const V = widoki[n];
      const v = V.w.get(sid) || { loc: 'brak' };
      const r = [];
      if (e.loc !== 'brak' && v.loc === 'brak') r.push(m.bezOperacji ? 'zniknięcie bez operacji' : m.retOstatni ? 'retencja usunęła ostatni stan wizyty' : 'utrata');
      else if (e.loc === 'brak' && v.loc !== 'brak') r.push('wskrzeszenie');
      else if (e.loc !== 'brak') {
        if (!rownaW(v, m.tresc, stareW.has(n))) r.push('treść');
        if (e.loc !== v.loc) r.push('obecność');
        if (m.pin !== null && v.loc === e.loc && v.pin !== m.pin) r.push(v.loc === 'karta' ? 'gwiazdka' : 'gwiazdka Kosza');
        // Ostatnia wersja karty, która została w karcie zamiast w Koszu (E1, Q8), bierze najpóźniejszy rejestr gwiazdki
        // (ALGORITHMS P-KOSZ-PO-KLUCZU, D1 = C): inna gwiazdka niż ostatni zapis gwiazdki = „gwiazdka”.
        if (m.pin !== null && e.loc === 'kosz' && v.loc === 'karta' && v.ile === 1 && v.pin !== m.pin) r.push('gwiazdka');
        // stara karta z aliasem do karty oczekiwanej też jest „inną kartą” (zgłaszaną i klasyfikowaną: E4b, D-4 A)
        if (e.loc === 'karta' && v.loc === 'karta' && v.pid !== e.pid) r.push('inna karta');
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
        const kf = flota ? klasaFlotyWizyty(M, m, e, v, rodzaj, V, sid, n, stareW, gdzie, gdziePin) : undefined;
        nar.klasa = kf !== undefined ? kf : klasaWizyty(M, m, e, v, rodzaj, V, sid);
        nar.hist = m.hist.slice(-6).map((h) => ({ t: h.czas ? h.czas.t : null, s: h.czas ? h.czas.s : null, dev: h.dev, op: h.op, ...(h.tresc ? { tresc: krotkoTresc(h.tresc) } : {}), ...(h.pin !== undefined ? { pin: h.pin } : {}), ...(h.loc ? { loc: h.loc, pid: h.pid ? etykieta(h.pid) : undefined } : {}), ...(h.przyczyna ? { przyczyna: h.przyczyna } : {}), ...(h.kartowa ? { kartowa: h.kartowa } : {}), ...(h.bezOperacji ? { bezOperacji: h.bezOperacji } : {}), ...(h.przyciecie ? { przyciecie: h.przyciecie } : {}) }));
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
          klasa: (flota && klasaFlotyNotatki(M, m, rodzaj)) || klasaNotatki(M, m, rodzaj, V, id, v), hist: m.hist.slice(-6).map((h) => ({ t: h.czas.t, s: h.czas.s, dev: h.dev, op: h.op, ...(h.tekst ? { tekst: h.tekst } : {}), ...(h.usun ? { usun: h.usun } : {}) })) });
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

// ── Jawna tabela wyjątków (klasa → uzasadnienie, mechanizm, źródło, światy) ─────────────────────────────────────────
// Naruszenie z klasą spoza tabeli albo w świecie spoza listy klasy (W1 — po samych zdarzeniach, W4 — zdarzenia, a po
// nich pełna wymiana, bloby — świat samych blobów) = czerwień w CI. Klasę nadaje się tylko wtedy, gdy w historii jest
// mechanizm z opisu (pole mechanizm), nie za sam objaw w widoku. Odwołania do ALGORITHMS — nazwa wpisu i przybliżony
// wiersz (docs/clinical/ALGORITHMS.md); plan — docs/SYNC_PRZYROSTOWA_PLAN.md. Decyzje właściciela z 2026-11-15 (2a, 3a,
// 4a, 9a) — plan, rozdział 6, „Decyzje z 2026-11-15”.
//
// Klasy floty ze starszą aplikacją (E3-PR0b; pole cechy — cechy starszej aplikacji, na których stoi mechanizm,
// CECHY_STARSZYCH): dozwolone tylko w światach floty; skutki starszej wersji czekają na decyzję właściciela (opis).
// Światy floty i ich odpowiedniki bez floty: klasa samych bieżących urządzeń (bez pola cechy) jest w świecie floty
// dozwolona tak jak w odpowiedniku (dozwolonaW).
export const SWIATY_FLOTY = Object.freeze({ 'W1 floty': 'W1', 'W4 floty': 'W4', 'p6f W1': 'W1', 'p6f W4': 'W4' });
export const SWIATY = Object.freeze(['W1', 'W4', 'bloby', ...Object.keys(SWIATY_FLOTY)]);
export const DO_DECYZJI = 'do decyzji właściciela (znane ograniczenie starszej wersji)';
const W_FLOCIE = Object.freeze(Object.keys(SWIATY_FLOTY));
const KL_RET_PRZYCINAJACE = 'retencja starszej aplikacji (urządzenie przycinające)';
const KL_RET_GLOWA = 'retencja starszej aplikacji (odbiorca zachował głowę wizyty)';
const KL_GWIAZDKA = 'gwiazdka ze starszej aplikacji';
const KL_PRZYWROC = '„Przywróć” na starszej aplikacji bez chwili treści';
const KL_NADPISANA = 'zmiana starszej aplikacji nadpisana przed wysłaniem (bez W3)';
const KL_NAJPIERW_REV = 'najpierw rev (starsza aplikacja)';
const KL_NOTATKA = 'notatka bez ratunku D-21 (starsza aplikacja)';
const KL_KARTA_CZESCIOWA = 'karta częściowa (starsza aplikacja)';
const KL_R4A = 'R4a (starsza aplikacja)';
const KL_R4A_PRIM = 'R4a′ (starsza aplikacja)';
const KL_KOSZ_W_ZWROCONEJ = 'D-4 A (Kosz w zwróconej starej karcie)';
export const WYJATKI = Object.freeze({
  'E1 (obecność)': Object.freeze({
    opis: 'wizyta, którą ostatni kosz kładzie w Koszu, zostaje na części urządzeń jedyną wersją karty z najnowszą treścią — wyjątek ostatniej wersji karty (Q8); treść jest widoczna, różni się obecność. Tak też Q8-obca-2 (decyzja właściciela 3a z 2026-11-15: miarą jest wynik taki sam jak po pełnej synchronizacji, wybór wizyty odłożony)',
    mechanizm: 'wizyta dana do Kosza na urządzeniu, które miało w karcie więcej niż tę jedną wersję; w widoku jedyna wersja żywej karty bez aliasu „Scal pacjentów”',
    zrodlo: 'ALGORITHMS „E1 — obecność wizyty przy dwóch koszach offline” (ok. 28397) i „Wpływ kliniczny” P-KOSZ-PO-KLUCZU (ok. 28493: „zostaje w niej tylko jako ostatnia wersja karty, jak dotąd — E1, Q8”); tests/unit/kosz-po-kluczu.test.mjs:203–204',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'E1/E1b (utrata wersji nieznanej scalającemu)': Object.freeze({
    opis: '„Scal pacjentów” X → Y na urządzeniu, które nie znało wersji X (zapisanej na innym urządzeniu bez połączenia albo znanej tylko z Kosza): nagrobek scalenia usuwa X z tą wersją — nie ma jej nigdzie, także przy samych blobach',
    mechanizm: 'nagrobek scalenia na urządzeniu, w którego eksporcie przed scaleniem nie było tej wersji w karcie X',
    zrodlo: 'ALGORITHMS P-SYNC-WLASCICIEL, „Ograniczenia”: „Utrata wersji (E1/E1b), osobna wada” (ok. 31995–32004); też ok. 31823 (rodzina E1: nagrobek scalenia nie niesie celu)',
    naprawa: 'do naprawy w E3-PR0 (decyzja właściciela 9a z 2026-11-15)',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'E4b (stara karta po „Scal pacjentów”)': Object.freeze({
    opis: 'stara karta X przeżywa po samych zdarzeniach na urządzeniu, które o scaleniu nie wiedziało (wizyta jako jedyna wersja albo pod starą kartą); pełna wymiana to leczy, więc klasa jest dozwolona tylko w W1 (decyzja właściciela 4a z 2026-11-15)',
    mechanizm: 'karta wizyty albo notatki w widoku ma alias „Scal pacjentów” (stara karta X)',
    zrodlo: 'ALGORITHMS P-KOSZ-PO-KLUCZU, rodzina E4b (ok. 28168, tabela ok. 28290–28298)',
    naprawa: 'do naprawy w osobnym PR etapu E3-PR0 (stara karta po „Scal pacjentów”; decyzja właściciela 4a z 2026-11-15)',
    swiaty: Object.freeze(['W1']),
  }),
  'kosz-po-2 (stara karta z ostatnią wersją przy samych blobach)': Object.freeze({
    opis: 'kosz-po-2: K scala X → Y → Z, C (bez wiedzy) poprawia x w starej X, P (też bez wiedzy) daje x do Kosza w X; przy samych blobach C zostaje ze starą kartą X z x jako ostatnią wersją karty (karta X przeżywa nagrobek scalenia, bo poprawka C jest późniejsza niż scalenie, a wcześniejsza niż kosz P)',
    mechanizm: 'zapis wizyty w starej karcie X po scaleniu, potem kosz tej wizyty w X na urządzeniu bez wiedzy o scaleniu; w widoku x jedyną wersją karty X z aliasem',
    zrodlo: 'ALGORITHMS P-KOSZ-PO-KLUCZU, „kosz-po-2” (ok. 28400–28403): „Domknięcie wymaga celu scalenia w nagrobku (zmiana formatu, P5)”; blok p. 5 (KAT_ZMIANY: kosz-po-2 K←C,P←K)',
    swiaty: Object.freeze(['bloby']),
  }),
  'D-4 A (stara karta wraca po zapisie bez wiedzy o scaleniu)': Object.freeze({
    opis: 'zmiana w starej karcie X (wizyta, gwiazdka, notatka) na urządzeniu, które o „Scal pacjentów” X → Y nie wiedziało, jest późniejsza niż scalenie: X wraca na wszystkich urządzeniach jako duplikat karty i trzyma tę wizytę albo notatkę (treść widoczna, w innej karcie tego samego pacjenta); także po pełnej wymianie',
    mechanizm: 'ta wizyta albo notatka (nie inna z tej karty) zapisana w starej karcie X po scaleniu; w widoku pod X',
    zrodlo: 'plan D-4 (wariant A: „duplikat karty po „Scal pacjentów” na innym urządzeniu zaakceptowany (do ponownego scalenia)”, docs/SYNC_PRZYROSTOWA_PLAN.md, rozdział 6, tabela decyzji, wiersz D-4); ALGORITHMS P-KOSZ-PO-KLUCZU (ok. 28437–28440: „stara karta — zapisana teraz później niż „Scal pacjentów” — wraca na wszystkich urządzeniach (D-4 A)”)',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'P5 (Kosz pod kartą usuniętą po scaleniu)': Object.freeze({
    opis: 'wizyta dana do Kosza pod kartą, która zniknęła po „Scal pacjentów” (kosz-przed, kosz-po, kosz-po-2): wpis z treścią leży w Koszu, ale okno Kosza go nie pokazuje (patientExists = false) i nie da się go przywrócić',
    mechanizm: 'ukryty wpis Kosza wskazuje kartę z aliasem „Scal pacjentów”, a model oczekuje wizyty w Koszu',
    zrodlo: 'ALGORITHMS P-KOSZ-PO-KLUCZU: „Domknięcie wymaga celu scalenia w nagrobku (zmiana formatu, P5)” (ok. 28422) i „Wpływ kliniczny” (ok. 28494–28495: wizyty dane do kosza w duplikacie, który zniknął — w koszu, ale bez karty); vilda_kosz_zapisow.js:226',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'P6 (notatka przy starej karcie)': Object.freeze({
    opis: 'notatka dopisana do starej karty na urządzeniu, które o „Scal pacjentów” nie wiedziało (albo zapisana przed scaleniem, ale nieznana urządzeniu scalającemu): zostaje w magazynie bez karty i nie widać jej w żadnej karcie',
    mechanizm: 'notatka pod kartą z aliasem, zapisana w niej po scaleniu albo nieobecna w eksporcie urządzenia scalającego przed scaleniem',
    zrodlo: 'ALGORITHMS P-KOSZ-PO-KLUCZU: decyzja P6 (ok. 28154) i „Notatki dopisane do starej karty” (ok. 28441–28444); tests/unit/kosz-po-kluczu-krawedzie.test.mjs:360–390 (F1)',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'D21-9 (notatka przepięta przy równoległym „Usuń pacjenta”)': Object.freeze({
    opis: '„Scal pacjentów” X → Y na jednym urządzeniu równolegle z „Usuń pacjenta” X na drugim: notatki przepięte pod Y giną (nagrobki notatek z „Usuń pacjenta” są późniejsze); wizyty zostają',
    mechanizm: 'nagrobek notatki z „Usuń pacjenta” X pominięty w modelu, bo notatka była już przepięta pod Y',
    zrodlo: 'ALGORITHMS P-NOTATKI-ZA-KARTA, „Poza zakresem (D21-9)” (ok. 30629–30631); tests/unit/notatki-za-karta.test.mjs:2606–2607, 3265',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'notatki od nowa po „Scal pacjentów”': Object.freeze({
    opis: '„Scal pacjentów” zapisuje notatki źródła od nowa, z nową chwilą: wcześniejsza edycja albo usunięcie tej notatki na innym urządzeniu przegrywa (wskrzeszenie albo starsza treść, nie utrata)',
    mechanizm: 'zapis notatki przez „Scal pacjentów” późniejszy niż ostatnia edycja albo usunięcie tej notatki',
    zrodlo: 'ALGORITHMS P-DZIENNIK-ZDARZEN, „Osobna sprawa: „Scal pacjentów” zapisuje notatki źródła od nowa” (ok. 27304–27305)',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  'retencja (przycięcie bez treści)': Object.freeze({
    opis: 'nagrobek retencji nie niesie treści, a cień jest tylko tutejszy: gwiazdka albo poprawka na starszej kopii zostawia wersję ze starszą treścią albo bez niej; po samych zdarzeniach',
    mechanizm: 'przycięcie retencją późniejsze niż ostatni zapis treści wizyty',
    zrodlo: 'tests/unit/kosz-po-kluczu-fuzz.test.mjs:27–28, 45–50; ALGORITHMS „Retencja przez duplikat w obie strony” (P2, ok. 28445) i tabela E4b-ret (ok. 28297)',
    swiaty: Object.freeze(['W1']),
  }),
  'npret (przypięta wizyta przeżywa przycięcie)': Object.freeze({
    opis: 'przypięta wersja przeżywa przycięcie z innego urządzenia: po samych zdarzeniach bywa jej jeszcze brak (npret-pin, npret-K), po pełnej wymianie jest',
    mechanizm: 'przycięcie retencją wizyty, której ostatni rejestr gwiazdki jest przypięty',
    zrodlo: 'blok p. 5 (KAT_LISTA: npret-pin, npret-K); ALGORITHMS tabela E4b-ret-pin (ok. 28298)',
    swiaty: Object.freeze(['W1']),
  }),
  R4a: Object.freeze({
    opis: 'gwiazdka wpisu Kosza różni się po samych zdarzeniach; pełna wymiana to leczy, przy samych blobach gwiazdka ginie (zmiana zachowania R4-a)',
    mechanizm: 'kosz na urządzeniu, które nie znało ostatniego rejestru gwiazdki wizyty',
    zrodlo: 'klasa 3.6 R4a (tabela DOZWOLONE); blok p. 6 R4-a',
    swiaty: Object.freeze(['W1', 'bloby']),
  }),
  'R4a′': Object.freeze({
    opis: 'treść wpisu Kosza różni się po samych zdarzeniach (Kosz ze starszą treścią); pełna wymiana to leczy, przy samych blobach poprawka ginie (zmiana zachowania R4-a′)',
    mechanizm: 'kosz na urządzeniu, które nie znało ostatniej treści wizyty',
    zrodlo: 'klasa 3.6 R4a′; blok p. 6 R4-a′',
    swiaty: Object.freeze(['W1', 'bloby']),
  }),
  'karta częściowa (nagrobek przegrał lokalnie, bez haka H1)': Object.freeze({
    opis: 'karta usunięta „Usuń pacjenta” wraca po samych zdarzeniach tylko z wersjami urządzenia, które nagrobka nie znało i wysłało tylko swoją zmianę: u odbiorców nagrobek przegrał lokalnie, więc nie wysyłają pełnej karty (świadomie bez haka H1), a urządzenie z pełną kartą nagrobka nie dostało; dowozi ją pełna wymiana',
    mechanizm: 'wizyta usunięta „Usuń pacjenta”, która wraca z kartą (późniejsza zmiana w karcie na urządzeniu bez wiedzy); karta jest w widoku, wizyty nie ma',
    zrodlo: 'ALGORITHMS „Dziennik zdarzeń: haki scalania” (P-DZIENNIK-ZDARZEN, E2-PR3b), „Świadomie bez haka H1”: lokalny nagrobek karty przegrywa z kartą z ładunku (Bsl_zdejmijNagrobek) — karta częściowa u odbiorcy, partialSince w etapie 3, w etapie 2 dowozi ją pełna wysyłka (decyzja 7) (ok. 24746); blok p. 6 „R5-E1, C wysyła tylko zdarzenia”',
    swiaty: Object.freeze(['W1']),
  }),
  'R5-E1': Object.freeze({
    opis: '„Przywróć” przegrywa z „Usuń pacjenta”, gdy kartę przywraca trzecie urządzenie nową wizytą: wizyta jest w Koszu, a nie w karcie (treść widoczna)',
    mechanizm: '„Przywróć” tej wizyty przed „Usuń pacjenta”, karta wraca późniejszą zmianą na innym urządzeniu',
    zrodlo: 'blok p. 6 R5-E1 („ZNANA RÓŻNICA (naprawa: E3-PR0)”)',
    naprawa: 'naprawa: E3-PR0',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  // E3-PR0b: klasa samych bieżących urządzeń (rodzina D-4 A i kosz-po-2); dopisana na końcu klasyfikacji (klasaWizyty), więc
  // nie zmienia klasy żadnego wcześniej sklasyfikowanego naruszenia.
  [KL_KOSZ_W_ZWROCONEJ]: Object.freeze({
    opis: 'stara karta X wraca zapisem w niej na urządzeniu, które o „Scal pacjentów” X → Y nie wiedziało (D-4 A), a potem takie urządzenie daje wizytę z X do Kosza w X: wpis Kosza zostaje przy żywej X także wtedy, gdy kartę Y usunięto („Usuń pacjenta”); model przypisuje kosz karcie docelowej (zapis za scaleniem) i usuwa go razem z nią — nic nie ginie, wpis jest w Koszu karty X',
    mechanizm: 'kosz tej wizyty w starej karcie X po scaleniu, gdy X wróciła już wcześniejszym zapisem wizyty albo notatki w X po scaleniu (urządzenie bez wiedzy o nim), potem „Usuń pacjenta” karty, z którą model usunął wpis; w widoku wpis Kosza pod X („wskrzeszenie”). Kosz w starej karcie, która przed nim nie wróciła — bez klasy',
    zrodlo: 'plan D-4 (wariant A: „duplikat karty po „Scal pacjentów” na innym urządzeniu zaakceptowany (do ponownego scalenia)”, docs/SYNC_PRZYROSTOWA_PLAN.md, rozdział 6, tabela decyzji, wiersz D-4); ALGORITHMS P-KOSZ-PO-KLUCZU, „kosz-po-2” (ok. 28400–28403); tests/unit/ostatnia-zmiana.test.mjs, przypadek „D-4 A (Kosz w zwróconej starej karcie)”',
    swiaty: Object.freeze(['W1', 'W4', 'bloby']),
  }),
  [KL_RET_PRZYCINAJACE]: Object.freeze({
    opis: `retencja v1 starszej aplikacji (bez ochrony wizyt) usuwa u siebie ostatni stan wizyty; bieżące urządzenia go zachowują (P-TRWALE-WIZYTY); naruszenie tylko w widoku urządzenia przycinającego — ${DO_DECYZJI}`,
    mechanizm: 'przycięcie retencją na urządzeniu z retencją v1, po którym w jego karcie nie zostaje żadna wersja tej wizyty (visitId); „retencja usunęła ostatni stan wizyty” tylko w widoku tego urządzenia',
    zrodlo: 'docs/PATIENT_VISITS.md:41, :43, :47; tests/fixtures/vilda_retention-v1.js.txt; tests/unit/starsza-aplikacja-fikstury.test.mjs, „retencja na starszej aplikacji: v1 przycina, bieżąca nie” (z 8 wersji z 8 dni sprzed 40–54 dni retencja v1 zostawia 1, bieżąca 8)',
    cechy: Object.freeze([RETENCJA_V1]),
    swiaty: W_FLOCIE,
  }),
  [KL_RET_GLOWA]: Object.freeze({
    opis: `bieżący odbiorca nagrobka retencji ze starszej aplikacji zachowuje najnowszy stan wizyty, a jej starsze wersje usuwa (reguła wizyty, nie wersji): przycięta wersja znika, w karcie zostaje inna wersja tej samej wizyty — ${DO_DECYZJI}`,
    mechanizm: 'jak „retencja starszej aplikacji (urządzenie przycinające)”, a do widoku bieżącego urządzenia doszedł nagrobek retencji tej wersji i jest w nim w karcie inna wersja tej samej wizyty (visitId)',
    zrodlo: 'vilda_vault.js Bvisit_protected (:6189) i Bvisit_keepRetention (:6272); docs/PATIENT_VISITS.md:41, :43',
    cechy: Object.freeze([RETENCJA_V1]),
    swiaty: W_FLOCIE,
  }),
  [KL_GWIAZDKA]: Object.freeze({
    opis: `„Odepnij i usuń” starszej aplikacji wkłada do Kosza treść z gwiazdką i bez pola gwiazdka, a jej „Przywróć” i przypięcie nie zapisują rejestru gwiazdki: wizyta leży w Koszu i wraca do karty z gwiazdką sprzed. Dozwolony jest tylko jeden fakt: w widoku bieżącej aplikacji wynik reguły W20 (brak pola gwiazdka — decyduje gwiazdka wersji sprzed kosza), w widoku starszej aplikacji jej własna gwiazdka (_pinned treści); każdy inny fakt to czerwień — ${DO_DECYZJI}`,
    mechanizm: 'ostatni zapis gwiazdki tej wersji (kosz, „Przywróć” albo zmiana gwiazdki; przypięcie — tylko w widoku starszej aplikacji, bo bieżąca czyta je jako przypięcie w chwili zmiany rekordu) na urządzeniu bez składników W3, bez późniejszego zapisu gwiazdki ani kosza na urządzeniu bieżącej aplikacji; „gwiazdka” w karcie albo „gwiazdka Kosza” z faktem równym dozwolonemu. Kosz na urządzeniu bez składników W3, które nie znało ostatniej gwiazdki, i bieżący widok z gwiazdką sprzed kosza tego widoku — R4a (tylko po samych zdarzeniach)',
    zrodlo: 'vilda_vault.js:2766–2771 (W20); docs/clinical/ALGORITHMS.md „Flota mieszana”, W20 (ok. 29661–29665); tests/fixtures/vilda_vault-221.js.txt:757–787 (Bkz_doKosza: treść Kosza z _pinned) i :833 (gwiazdka okna Kosza z treści)',
    cechy: Object.freeze([BEZ_W3]),
    swiaty: W_FLOCIE,
  }),
  [KL_PRZYWROC]: Object.freeze({
    opis: `„Przywróć” starszej aplikacji oddaje treść z Kosza ze starą chwilą treści i tym samym odciskiem; bieżąca aplikacja czyta to jak zmianę samej gwiazdki, więc zostaje wcześniejsza poprawka z bieżącej aplikacji, a nie treść z Kosza (nic nie ginie) — ${DO_DECYZJI}`,
    mechanizm: '„Przywróć” na urządzeniu bez składników W3 jako ostatni zapis treści, po poprawce z bieżącej aplikacji późniejszej niż przywracana treść; „treść” z faktem równym tej poprawce',
    zrodlo: 'vilda_vault.js Bgw_stan (:1558, gałąź :1570); tests/fixtures/vilda_vault-221.js.txt (bez _contentAtISO i _pinnedState)',
    cechy: Object.freeze([BEZ_W3]),
    swiaty: W_FLOCIE,
  }),
  [KL_NADPISANA]: Object.freeze({
    opis: `starsza aplikacja nie zna składników W3 i bierze cały nowszy rekord wersji: (a) jej poprawka albo gwiazdka ginie, gdy przed jej wysłaniem dochodzi do niej zapis tej wersji z bieżącej aplikacji, który jej nie znał; (b) jej gwiazdkę na wersji, którą sama utworzyła (bez pól W3), bieżąca aplikacja czyta jak zmianę treści (PD-12) i bierze jej starą treść zamiast poprawki — ${DO_DECYZJI}`,
    mechanizm: '(a) ostatni zapis treści (gwiazdki) na urządzeniu bez składników W3, potem zapis tej wersji na urządzeniu bieżącej aplikacji bez wiedzy o nim, który go nie zastąpił — fakt równy treści (gwiazdce) tego zapisu; (b) przypięcie na urządzeniu bez składników W3 wersji przez nie utworzonej, bez wiedzy o poprawce z bieżącej aplikacji — fakt równy treści urządzenia starszej aplikacji. W obu oczekiwanej treści (gwiazdki) nie ma w żadnym widoku punktu: gdy gdzieś jest, zmiana opuściła urządzenie i klasy nie ma',
    zrodlo: 'docs/clinical/ALGORITHMS.md „Flota mieszana” (ok. 29442–29445: „nie zna rejestru gwiazdki ani składników”); tests/fixtures/vilda_vault-221.js.txt:454–462 (Bkz_nowszaWersja); vilda_vault.js:1526–1527 (wersja bez pól W3)',
    cechy: Object.freeze([BEZ_W3]),
    swiaty: W_FLOCIE,
  }),
  [KL_NAJPIERW_REV]: Object.freeze({
    opis: `starsza aplikacja wybiera treść tej samej wersji najpierw po rev: wcześniejsza treść z wyższym rev wygrywa u niej z późniejszą, a gdy karta wraca z niej, ta treść trafia na wszystkie urządzenia — ${DO_DECYZJI}`,
    mechanizm: 'dwie treści tej wersji z odwrotną kolejnością rev i chwili (fakt — wcześniejsza z wyższym rev, oczekiwana — późniejsza), a jedną z nich zapisało urządzenie, które wybiera wersję najpierw po rev; w widoku bieżącego urządzenia tylko wtedy, gdy oczekiwanej treści nie ma w żadnym widoku i widok nie należy do urządzenia, które ją zapisało (albo kartę zwróciła zmiana urządzenia, które wybiera najpierw po rev)',
    zrodlo: 'docs/clinical/ALGORITHMS.md „Flota mieszana” (ok. 29443–29447: „Wersję tej samej karty 221 i 218 wybierają „najpierw rev””; rekord złożony dostaje rev + 1); vilda_vault.js:1543',
    cechy: Object.freeze([NAJPIERW_REV]),
    swiaty: W_FLOCIE,
  }),
  [KL_NOTATKA]: Object.freeze({
    opis: `starsza aplikacja nie ma ratunku notatki D-21: (a) po „Usuń pacjenta” na bieżącym urządzeniu, gdy nagrobek dojdzie do niej przed jej pełną kopią, a potem ona zmieni kartę, karta wraca bez notatek; (b) jej „Usuń pacjenta” zapisuje nagrobki notatek bez deletedWithPatient, więc powrót karty zmianą na bieżącym urządzeniu notatek nie przywraca — ${DO_DECYZJI}`,
    mechanizm: 'notatka usunięta „Usuń pacjenta”, karta wraca późniejszą zmianą, a usunięcie było na urządzeniu bez ratunku notatek albo kartę przywróciła zmiana na takim urządzeniu, które przed nią notatki już nie miało; „utrata” notatki',
    zrodlo: 'plan D-21 (docs/SYNC_PRZYROSTOWA_PLAN.md); docs/clinical/ALGORITHMS.md „Hak H2: ratunek notatki zawsze do kolejki” (ok. 24752–24754); vilda_vault.js:4901 (deletedWithPatient); tests/fixtures/vilda_vault-221.js.txt:2515 (Bpu_usun)',
    cechy: Object.freeze([BEZ_RATUNKU]),
    swiaty: W_FLOCIE,
  }),
  [KL_KARTA_CZESCIOWA]: Object.freeze({
    opis: `karta usunięta „Usuń pacjenta” wraca bez części wersji także po pełnej wymianie: (a) wraca zmianą starszej aplikacji, która nie ma haka H1 i nie wysyła pełnej karty; (b) przed usunięciem retencja v1 starszej aplikacji usunęła u niej ostatni stan wizyty — ${DO_DECYZJI}`,
    mechanizm: 'wizyta usunięta „Usuń pacjenta”, która wraca z kartą (karta jest w widoku, wizyty nie ma), a kartę przywróciła zmiana na urządzeniu bez haka H1 albo przed usunięciem ostatni stan wizyty usunęła retencja v1 urządzenia starszej aplikacji, które potem kartę przywróciło (albo to jego widok)',
    zrodlo: 'docs/clinical/ALGORITHMS.md tabela klas E3-PR0a, „karta częściowa” (ok. 40248) i „Świadomie bez haka H1” (ok. 24746); tests/fixtures/vilda_vault-221.js.txt (bez haków Bem_)',
    cechy: Object.freeze([BEZ_H1, RETENCJA_V1]),
    swiaty: W_FLOCIE,
  }),
  [KL_R4A]: Object.freeze({
    opis: `kosz na bieżącym urządzeniu bez wiedzy o gwiazdce ze starszej aplikacji: starsza trzyma ją tylko w karcie i traci po nagrobku, więc gwiazdka wpisu Kosza różni się także po pełnej wymianie (między bieżącymi urządzeniami leczy to pełna wymiana) — ${DO_DECYZJI}`,
    mechanizm: 'kosz na urządzeniu bieżącej aplikacji, które nie znało ostatniego zapisu gwiazdki, a ten zapis zrobiło urządzenie bez składników W3; „gwiazdka Kosza”',
    zrodlo: 'klasa R4a (wyżej); docs/clinical/ALGORITHMS.md „Flota mieszana” (ok. 29442–29445); tests/fixtures/vilda_vault-221.js.txt:454–462 (Bkz_nowszaWersja)',
    cechy: Object.freeze([BEZ_W3]),
    swiaty: W_FLOCIE,
  }),
  [KL_R4A_PRIM]: Object.freeze({
    opis: `kosz na bieżącym urządzeniu bez wiedzy o poprawce ze starszej aplikacji: starsza trzyma nowszą treść tylko w karcie i traci ją po nagrobku, więc wpis Kosza ma starszą treść także po pełnej wymianie (między bieżącymi urządzeniami leczy to scalenie treści Kosza, P-KOSZ-NOWSZA-TRESC) — ${DO_DECYZJI}`,
    mechanizm: 'kosz na urządzeniu bieżącej aplikacji, które nie znało ostatniego zapisu treści, a ten zapis zrobiło urządzenie bez składników W3; „treść” wpisu Kosza',
    zrodlo: 'klasa R4a′ (wyżej); docs/clinical/ALGORITHMS.md P-KOSZ-NOWSZA-TRESC (ok. 31332) i „Flota mieszana” (ok. 29442–29445)',
    cechy: Object.freeze([BEZ_W3]),
    swiaty: W_FLOCIE,
  }),
});
const zKlasa = (k) => { if (!WYJATKI[k]) throw new Error(`wyrocznia: klasa spoza tabeli wyjątków: ${k}`); return k; };

// ── Klasyfikacja (jawne wyjątki; mechanizm z historii, nie sam objaw) ───────────────────────────────────────────────
const BEZ_KLASY = Object.freeze(['zniknięcie bez operacji', 'retencja usunęła ostatni stan wizyty']);
function klasaWizyty(M, m, e, v, rodzaj, V, sid) {
  if (BEZ_KLASY.includes(rodzaj)) return null;
  const aliasKarty = (pid) => !!pid && M.alias.has(pid);
  if (rodzaj === 'utrata' && e.loc === 'kosz' && V.koszUkryte.has(sid) && aliasKarty(V.koszUkryte.get(sid).pid)) return zKlasa('P5 (Kosz pod kartą usuniętą po scaleniu)');
  if (rodzaj === 'obecność' && e.loc === 'karta' && v.loc === 'kosz' && e.h1 && m.hist.some((h) => h.przywroc)) return zKlasa('R5-E1');
  if (rodzaj === 'gwiazdka Kosza' && e.loc === 'kosz' && v.loc === 'kosz' && m.koszBezGwiazdki) return zKlasa('R4a');
  if (rodzaj === 'treść' && e.loc === 'kosz' && v.loc === 'kosz' && m.koszBezTresci) return zKlasa('R4a′');
  if (rodzaj === 'utrata' && (e.przypieta || (m.przyc && m.pin === true))) return zKlasa('npret (przypięta wizyta przeżywa przycięcie)');
  const ostatnia = v.loc === 'karta' && v.ile === 1;
  const staraKarta = aliasKarty(v.pid);
  const zywaKarta = !!v.pid && !staraKarta && zywa(M, v.pid);
  // ta wizyta zapisana w starej karcie widoku po scaleniu (mechanizm D-4 A i kosz-po-2)
  const zapisWStarej = staraKarta && !!m.zapisPoScaleniu && m.zapisPoScaleniu.pid === v.pid;
  const koszPoZapisieWStarej = zapisWStarej && !!m.koszWStarej && m.koszWStarej.pid === v.pid && cmp(m.zapisPoScaleniu.czas, m.koszWStarej.czas) < 0;
  // E1: kosz na urządzeniu, które miało w karcie więcej niż tę wersję (nagrobek nie usuwa ostatniej wersji karty)
  const koszZInnymi = m.kosz && (m.koszIle == null || m.koszIle > 1);
  if (rodzaj === 'obecność' && e.loc === 'kosz' && ostatnia && koszPoZapisieWStarej) return zKlasa('kosz-po-2 (stara karta z ostatnią wersją przy samych blobach)');
  if ((rodzaj === 'obecność' && e.loc === 'kosz') || (rodzaj === 'wskrzeszenie' && ostatnia)) {
    if (ostatnia && staraKarta) return zKlasa('E4b (stara karta po „Scal pacjentów”)');
    if (ostatnia && zywaKarta && (rodzaj === 'wskrzeszenie' || koszZInnymi)) return zKlasa('E1 (obecność)');
  }
  if (rodzaj === 'utrata' && e.h1 && V.karty.has(e.pid)) return zKlasa('karta częściowa (nagrobek przegrał lokalnie, bez haka H1)');
  if (m.przyc && cmp(m.przyc, m.tTresc) > 0 && ['treść', 'utrata', 'gwiazdka'].includes(rodzaj)) return zKlasa('retencja (przycięcie bez treści)');
  if (m.utrataE1 && ['utrata', 'treść', 'gwiazdka'].includes(rodzaj)) return zKlasa('E1/E1b (utrata wersji nieznanej scalającemu)');
  if (rodzaj === 'inna karta' && staraKarta) return zKlasa(zapisWStarej ? 'D-4 A (stara karta wraca po zapisie bez wiedzy o scaleniu)' : 'E4b (stara karta po „Scal pacjentów”)');
  // ta sama (najnowsza) treść w karcie i w Koszu: ostatnia wersja żywej karty, dana do Kosza
  if (rodzaj === 'także w Koszu' && ostatnia && zywaKarta && koszZInnymi && V.podwojne.get(sid).tresc === v.tresc) return zKlasa('E1 (obecność)');
  // E3-PR0b: wpis Kosza w starej karcie X, która wróciła przed koszem (D-4 A); model usunął go z kartą docelową
  const kw = m.koszWStarej;
  if (rodzaj === 'wskrzeszenie' && e.loc === 'brak' && v.loc === 'kosz' && kw && kw.wrocila && v.pid === kw.pid && staraKarta
    && m.przyczyna === 'usuń pacjenta' && m.przedUsun && m.przedUsun.loc === 'kosz' && m.przedUsun.karta !== kw.pid) return zKlasa(KL_KOSZ_W_ZWROCONEJ);
  return null;
}
function klasaNotatki(M, m, rodzaj, V, id, v) {
  const zapisW = (pid) => !!m.zapisPoScaleniu && m.zapisPoScaleniu.pid === pid;
  if (rodzaj === 'utrata (pod kartą usuniętą)' && V.nUkryte.has(id)) {
    const pid = V.nUkryte.get(id).pid;
    if (M.alias.has(pid) && (zapisW(pid) || (!!m.nieznanaScalajacemu && m.nieznanaScalajacemu.pid === pid))) return zKlasa('P6 (notatka przy starej karcie)');
  }
  if (rodzaj === 'inna karta' && v && M.alias.has(v.pid)) return zKlasa(zapisW(v.pid) ? 'D-4 A (stara karta wraca po zapisie bez wiedzy o scaleniu)' : 'E4b (stara karta po „Scal pacjentów”)');
  if (rodzaj === 'utrata' && m.obecna && m.hist.some((h) => h.usun === 'pominięte (notatka przeniesiona do innej karty)')) return zKlasa('D21-9 (notatka przepięta przy równoległym „Usuń pacjenta”)');
  const ost = [...m.hist].reverse().find((h) => h.tekst || h.usun);
  if (ost && m.hist.some((h) => h.scal && h.czas && ost.czas && cmp(h.czas, ost.czas) > 0) && (rodzaj === 'wskrzeszenie' || rodzaj === 'treść')) return zKlasa('notatki od nowa po „Scal pacjentów”');
  return null;
}

// ── Klasy floty ze starszą aplikacją (E3-PR0b; mechanizm z historii na urządzeniu z cechą starszej aplikacji) ────────
// Wynik: klasa; undefined — brak mechanizmu floty (dalej klasy samych bieżących urządzeń); null — mechanizm gwiazdki
// starszej aplikacji jest, a fakt nie jest dozwolony (czerwień bez dalszej klasyfikacji: każdy inny fakt to czerwień).
// gdzie — widoki punktu z oczekiwaną treścią; gdziePin() — widoki z oczekiwaną gwiazdką wersji w karcie. Zmiana, która
// według mechanizmu zginęła na urządzeniu starszej aplikacji przed wysłaniem, nie może być widoczna nigdzie: jeśli jest,
// opuściła to urządzenie, a jej brak w widoku leży po stronie wymiany bieżących urządzeń (bez klasy floty).
function klasaFlotyWizyty(M, m, e, v, rodzaj, V, sid, n, stareW, gdzie, gdziePin) {
  const ma = (d, c) => !!d && maCeche(M, d, c);
  const stary = stareW.has(n);
  const rowna = (ocz) => rownaW(v, ocz, stary);
  if (rodzaj === 'retencja usunęła ostatni stan wizyty') {
    const r = m.retOstatni;
    if (!r || !ma(r.dev, RETENCJA_V1)) return undefined;
    if (n === r.dev) return zKlasa(KL_RET_PRZYCINAJACE);
    // widok bieżącego urządzenia: doszedł do niego nagrobek retencji tej wersji, a w karcie jest inna wersja tej wizyty
    if (!stary && V.ret.has(sid) && r.vid && [...V.w.entries()].some(([q, w]) => q !== sid && w.loc === 'karta' && w.vid === r.vid)) return zKlasa(KL_RET_GLOWA);
    return undefined;
  }
  if (rodzaj === 'gwiazdka' || rodzaj === 'gwiazdka Kosza') {
    if (rodzaj === 'gwiazdka' && m.gwiazdkaNadpisana && v.pin === m.gwiazdkaNadpisana.pin && gdziePin().length === 0) return zKlasa(KL_NADPISANA);
    if (rodzaj === 'gwiazdka Kosza' && e.loc === 'kosz' && v.loc === 'kosz' && m.koszBezGwiazdki && m.koszStarszej && m.koszStarszej.pin) return zKlasa(KL_R4A);
    // Warunek faktu: w widoku bieżącej aplikacji tylko wynik W20 (gwiazdka sprzed), w widoku starszej — jej gwiazdka.
    // Wyjątek: kosz na urządzeniu bez składników W3, które nie znało ostatniej gwiazdki — bieżące urządzenie, do którego ta
    // gwiazdka jeszcze nie doszła, bierze według W20 swoją gwiazdkę sprzed kosza; to R4a (klasa samych bieżących urządzeń,
    // dozwolona po samych zdarzeniach), a po pełnej wymianie dozwolony jest tylko wynik W20 z modelu.
    // Przypięcie na urządzeniu bez składników W3 bieżąca aplikacja czyta jako przypięcie w chwili zmiany rekordu (Bgw_stan,
    // vilda_vault.js:1558–1571: _pinned inny niż rejestr albo brak rejestru — gwiazdka w chwili u), więc w jej widoku
    // nie ma tu mechanizmu floty; gwiazdka sprzed zostaje po odpięciu bez rejestru („nieprzypięta — nigdy jawnie”, :1527),
    // po „Przywróć” i po koszu (W20).
    const g = m.gwStarszej;
    if (g && !stary && g.rodzaj === 'gwiazdka' && g.pinStarszej) return undefined;
    if (g) {
      if (v.pin === (stary ? g.pinStarszej : g.pinN)) return zKlasa(KL_GWIAZDKA);
      if (!stary && rodzaj === 'gwiazdka Kosza' && g.rodzaj === 'kosz' && m.koszBezGwiazdki) return undefined;
      return null;
    }
    return undefined;
  }
  if (rodzaj === 'treść') {
    if (e.loc === 'kosz' && v.loc === 'kosz' && m.koszBezTresci && m.koszStarszej && m.koszStarszej.tresc) return zKlasa(KL_R4A_PRIM);
    if (m.przywrocenieStarszej && rowna(m.przywrocenieStarszej.poprawka)) return zKlasa(KL_PRZYWROC);
    if (gdzie.length === 0 && m.trescNadpisana && rowna(m.trescNadpisana.tresc)) return zKlasa(KL_NADPISANA);
    if (gdzie.length === 0 && m.gwiazdkaJakTresc && rowna(m.gwiazdkaJakTresc.tresc)) return zKlasa(KL_NADPISANA);
    // „Najpierw rev”: widok starszej aplikacji — jej reguła; widok bieżącej — tylko gdy jedynym źródłem jest urządzenie
    // starszej aplikacji: oczekiwanej treści nie ma nigdzie, a widok nie należy do urządzenia, które ją zapisało (bieżąca
    // aplikacja wybiera treść po chwili: rekord bez pól W3 ma chwilę treści updatedAtISO, Bgw_stan), chyba że kartę
    // zwróciła zmiana urządzenia, które wybiera najpierw po rev.
    const rev = najpierwRev(M, m, v, stary);
    if (rev && (stary || (gdzie.length === 0 && (n !== rev.dev || (!!m.przedUsun && m.przedUsun.wraca && ma(m.przedUsun.przez, NAJPIERW_REV)))))) return zKlasa(KL_NAJPIERW_REV);
    return undefined;
  }
  if (rodzaj === 'utrata' && e.h1 && V.karty.has(e.pid) && m.przedUsun) {
    // (a) kartę zwróciła zmiana na urządzeniu bez haka H1; (b) przed „Usuń pacjenta” retencja v1 usunęła ostatni stan
    // wizyty na urządzeniu starszej aplikacji, a kartę zwróciło to urządzenie (jego karta tej wersji nie niesie) albo to
    // jest jego widok — powrót karty z bieżącego urządzenia z tą wersją (hak H1, pełna karta) niesie ją wszystkim.
    const p = m.przedUsun;
    if (ma(p.przez, BEZ_H1) || (!!p.retDev && (p.przez === p.retDev || n === p.retDev))) return zKlasa(KL_KARTA_CZESCIOWA);
  }
  return undefined;
}
// „Najpierw rev”: fakt to wcześniejsza treść tej wersji z wyższym rev (najwyższy widziany przy tej treści) niż oczekiwana,
// późniejsza treść, a jedną z nich zapisało urządzenie, które wybiera wersję najpierw po rev. Wynik: zapis oczekiwanej
// treści (dev — urządzenie, które ją zapisało) albo null.
function najpierwRev(M, m, v, stary) {
  if (v.loc !== 'karta' || v.tresc == null) return null;
  let ocz = null;
  for (let i = m.hist.length - 1; i >= 0 && !ocz; i -= 1) if (m.hist[i].dev && m.hist[i].czas && m.hist[i].tresc === m.tresc) ocz = m.hist[i];
  if (!ocz) return null;
  const revOcz = m.revTresci.get(m.tresc) ?? 0;
  return m.hist.some((h) => h !== ocz && h.dev && h.czas && h.tresc != null && cmp(h.czas, ocz.czas) < 0 && rownaW(v, h.tresc, stary)
    && (m.revTresci.get(h.tresc) ?? 0) > revOcz && (maCeche(M, h.dev, NAJPIERW_REV) || maCeche(M, ocz.dev, NAJPIERW_REV))) ? ocz : null;
}
// Notatka bez ratunku D-21: (b) „Usuń pacjenta” na urządzeniu bez ratunku notatek; (a) kartę zwróciła zmiana na takim
// urządzeniu, które samo notatki już nie miało (dostało nagrobek przed swoją pełną kopią) — gdy ją miało, jego pełna kopia
// niesie jej rekord i ratunek D-21 bieżącej aplikacji ją przywraca (utrata po stronie bieżącej aplikacji, bez klasy floty).
function klasaFlotyNotatki(M, m, rodzaj) {
  if (rodzaj === 'utrata' && !m.obecna && m.przyczyna === 'usuń pacjenta' && m.wraca
    && (maCeche(M, m.devUsun, BEZ_RATUNKU) || (maCeche(M, m.wracaPrzez, BEZ_RATUNKU) && !m.wracaZNotatka))) return zKlasa(KL_NOTATKA);
  return null;
}

// Klasa dozwolona w świecie: z listy klasy; klasa samych bieżących urządzeń (bez pola cechy) w świecie floty — tak jak
// w jego odpowiedniku bez floty (SWIATY_FLOTY); klasa floty tylko w światach floty.
export function dozwolonaW(klasa, swiat) {
  const w = WYJATKI[klasa];
  if (!w) return false;
  if (w.swiaty.includes(swiat)) return true;
  return !w.cechy && !!SWIATY_FLOTY[swiat] && w.swiaty.includes(SWIATY_FLOTY[swiat]);
}
// Naruszenia, które czerwienią: bez klasy albo z klasą w świecie spoza listy klasy (swiat: SWIATY).
export const bezWyjatku = (lista, swiat) => lista.filter((x) => !x.klasa || !dozwolonaW(x.klasa, swiat));
// Skrót naruszeń punktu (encja:rodzaj:klasa → liczba).
export function podsumuj(lista) {
  const o = {};
  for (const x of lista) { const k = `${x.encja}:${x.rodzaj}:${x.klasa}`; o[k] = (o[k] || 0) + 1; }
  return o;
}
// Klucz naruszenia bez urządzenia (tryb ścisły: naruszenie W1, którego nie ma w W4 albo w blobach tego punktu).
export const kluczNaruszenia = (x) => `${x.encja}|${x.id}|${x.rodzaj}`;

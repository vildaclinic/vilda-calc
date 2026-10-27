// P-CIEN-POZA-LISTA (PR-S4, wariant V przeglądu 2; decyzja właściciela 2026-10-26, 6): pełny szyfr cienia (D4 = a) leży
// w osobnym rekordzie magazynu cienia adaptera, a lista nagrobków trzyma zaślepkę { iv, cien: 1 }. Reguła łączenia i wyniki
// bez zmian; zmienia się tylko, co i jak często się zapisuje. Prawdziwy vilda_vault.js, sejfy w pamięci, sztuczny zegar,
// dane wyłącznie fikcyjne („Testowy Jan”). Uprząż: polkrata-uprzaz.mjs; starsza aplikacja — tests/fixtures/vilda_vault-221.js.txt.
//   M1 — ponowne scalenie tego samego ładunku: 0 zapisów listy i magazynu;
//   M2 — cień zostaje treścią ważnego kosza: kosz 58 na trzech, rekord usunięty, w liście pełna treść kosza;
//   M3 — wygaśnięcie (31 dni): rekordy usunięte jedną transakcją, lista bez zaślepek;
//   M4 — adapter bez metod magazynu: cień w liście, ten sam wynik;
//   M5 — rekordy zniknęły (uszkodzenie): bez wyjątku, cień jak wygasły;
//   M6 — aktualizacja z listy z cieniem w liście (format bez wariantu): pierwszy zapis przenosi cień do magazynu;
//   M7 — cofnięcie do 221 i powrót: wynik ten sam co dla cienia w liście (221 nie czyta Bpk); sierotę z 221 zamiata
//        pierwszy zapis listy po powrocie (11 → 10 rekordów);
//   M8 — inwariant „lista wskazuje tylko istniejące rekordy”: zaślepka spoza listy na dysku (wyścig kart; ze strażnikiem
//        połkniętego błędu końca scalania i ścisłą liczbą odczytów — R4), błąd zapisu rekordów (lista zapisuje się bez
//        nich), błąd sprzątania (sieroty zamiata następny zapis listy), kolejność „rekordy przed listą” przy przerwaniu
//        (M8d, R2 przeglądu wariantu V);
//   M8e — błąd zapisu partii przy cieniu z treści ważnego kosza z dysku (R1 przeglądu wariantu V): stały i jednorazowy —
//        lista bez tego cienia, jedna próba, bez połkniętego błędu;
//   M9 — blokada sejfu w trakcie zapisu listy (W3 przeglądu wariantu V): jedno uid na zmianę listy — rekordy do konta;
//   M9b — to samo uid poza rekordami (W2P-2 weryfikacji): doczytanie treści kosza, sprzątanie po zapisie listy i znacznik
//        zamiatania (zamiatanie w oknie blokady nie zalicza zamiatania nowej sesji); sprzątanie po liście zapisanej w sesji
//        scalania po blokadzie nic nie usuwa (zapisy S4 pilnują sesji jak P-CHMURA-OPIS) — sieroty zamiata nowa sesja;
//   N4, N5 — Bgw_wskrzes czyta pełny szyfr z magazynu na trasie naturalnej w jednej karcie (R3; m17 czerwieni oba);
//   L2 — zamiatanie sierot ponawiane po blokadzie i odblokowaniu tego samego konta (R5; kontrola bez blokady);
//   M10 — „Usuń pacjenta” zdejmuje cień wersji tej karty od razu (decyzja właściciela 2026-10-26, 1: S4V-MP4 = b): 0 rekordów
//        i 0 zaślepek tej karty jedną partią, kosz z treścią zostaje, cień innej karty nietknięty; krawędź D-21 (karta
//        przeżywa na urządzeniu, które nie wie o usunięciu; stara kopia do kosza) — kosz 23 na trzech; adapter bez magazynu;
//   M11 — zbiór kart usuniętych w tej sesji (W3P-1 i decyzja 1 na całej flocie): „Usuń pacjenta” w trakcie scalenia, które
//        przycina wersje tej karty (z hakiem i bez), usunięcie z K dochodzące synchronizacją, „Scal pacjentów” na K (pełny
//        ładunek i sama delta karty docelowej; kosz starej kopii 23 jak f612fe09 — z powrotem źródła i bez), krawędzie
//        D-21 (karta albo źródło zostaje — cień zostaje; karta wraca — kosz 23 jak f612fe09), zbiór czyszczony blokadą,
//        ważny kosz karty usuniętej unieważniony w scaleniu (M11h, W5P-3: cień zdjęty także z wyniku złączenia, L3);
//        adapter bez magazynu;
//   K  — koszt deterministycznie: scalenie bez zmian 0 zapisów rekordów cienia, rekord metadanych bez pełnych szyfrów.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sztucznyZegar, przesunZegar, zegar, urzadzenie, urzadzenia, aktualizuj, poprawMase, przypnij, doKosza, przytnij, sync, rundy, widoki,
  stan, jan, zapisz, DZIEN,
} from './polkrata-uprzaz.mjs';

const M = 60e3;
afterEach(() => { vi.useRealTimers(); });
const B = (x) => Buffer.byteLength(JSON.stringify(x));
// Sztuczny zegar wspólny dla pliku idzie naprzód; retencja zostawia ostatnią wersję dnia, więc przebieg, który przejdzie
// przez północ, przycina inaczej. Testy z przycięciem pod koniec pliku zaczynają o 9:00 UTC (jak przypieta-w3-flota).
function zegarRano() {
  const d = new Date(zegar.t);
  if (d.getUTCHours() < 9 || d.getUTCHours() >= 12) zegar.t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 9);
  sztucznyZegar();
}

// Nakładka na __px: licznik zapisów listy i magazynu cienia; awaria — funkcja (nazwa metody, argumenty) → błąd albo nic.
function licznik(v, awaria) {
  const l = { lista: 0, partie: 0, cienZapis: 0, cienUsun: 0, odczyty: 0, klucze: 0 };
  const px = v.__px;
  const nowy = new Proxy(px, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    if (k === 'putUserMeta') {
      return async (uid, m) => {
        const s = await cel.getUserMeta(uid);
        if (JSON.stringify((s && s.snapshotTombstones) || []) !== JSON.stringify(m.snapshotTombstones || [])) l.lista += 1;
        return f.call(cel, uid, m);
      };
    }
    if (k === 'writeSnapshotShadowsForUser') {
      return async (uid, rek, usun) => {
        const er = awaria && awaria(k, rek || [], usun || []);
        if (er) throw er;
        l.partie += 1; l.cienZapis += (rek || []).length; l.cienUsun += (usun || []).length;
        return f.call(cel, uid, rek, usun);
      };
    }
    if (k === 'getSnapshotShadowForUser') return async (...a) => { l.odczyty += 1; return f.apply(cel, a); };
    if (k === 'listSnapshotShadowKeysForUser') return async (...a) => { l.klucze += 1; return f.apply(cel, a); };
    return f.bind(cel);
  } });
  v.setStorageAdapter(nowy); v.__px = nowy;
  return l;
}
async function lokalnie(v, sid) {
  const m = (await v.__px.getUserMeta(v.__uid)) || {};
  const e = (m.snapshotTombstones || []).find((x) => x.snapshotId === sid) || null;
  const mag = typeof v.__px.listSnapshotShadowKeysForUser === 'function' ? await v.__px.listSnapshotShadowKeysForUser(v.__uid) : null;
  return {
    wpis: e ? (e.powod === 'retencja' ? 'retencja' : e.payloadCipher ? 'kosz' : 'kosz-bez-tresci') : null,
    tresc: e && e.payloadCipher ? Object.keys(e.payloadCipher).sort().join(',') : null,
    cien: e && e.Bpk && e.Bpk.t && e.Bpk.t.c ? Object.keys(e.Bpk.t.c).sort().join(',') : null,
    magazyn: mag ? mag.length : null,
  };
}
// Inwariant: każda zaślepka w liście na dysku ma rekord w magazynie.
async function wiszace(v) {
  const m = (await v.__px.getUserMeta(v.__uid)) || {};
  const klucze = new Set(await v.__px.listSnapshotShadowKeysForUser(v.__uid));
  return (m.snapshotTombstones || []).filter((e) => e.Bpk && e.Bpk.t && e.Bpk.t.c && e.Bpk.t.c.cien === 1 && !klucze.has(e.Bpk.t.c.iv)).length;
}
// Rekordy magazynu konta, których lista na dysku nie wskazuje.
async function sieroty(v) {
  const m = (await v.__px.getUserMeta(v.__uid)) || {};
  const wsk = new Set((m.snapshotTombstones || []).filter((e) => e.Bpk && e.Bpk.t && e.Bpk.t.c && e.Bpk.t.c.cien === 1).map((e) => e.Bpk.t.c.iv));
  return (await v.__px.listSnapshotShadowKeysForUser(v.__uid)).filter((k) => !wsk.has(k)).length;
}
// Blokada sejfu po wywołaniu adaptera, dla którego kiedy(nazwa, stan) zwróci true; zObcym — wywołania magazynu cienia z uid
// innym niż konto (po blokadzie).
function uzbroj(P, kiedy, powod) {
  const px = P.__px;
  const st = { uzbrojone: true, okno: false, zObcym: [], poNaglowku: false, odczyty: 0 };
  const hak = new Proxy(px, { get(cel, k) {
    const f = cel[k];
    if (typeof f !== 'function') return f;
    return async (...a) => {
      if (st.okno && /SnapshotShadow/.test(String(k)) && a[0] !== P.__uid) st.zObcym.push(`${String(k)}(${String(a[0])})`);
      if (k === 'putPatientForUser' && st.uzbrojone) st.poNaglowku = true;
      const r = await f.apply(cel, a);
      if (st.uzbrojone && kiedy(String(k), st)) { st.uzbrojone = false; st.okno = true; P.lock(powod); }
      return r;
    };
  } });
  P.setStorageAdapter(hak); P.__px = hak;
  return { st, zdejmij() { st.okno = false; P.setStorageAdapter(px); P.__px = px; } };
}
// Przygotowanie (zk-v2 sędziów): P poprawia na 58 i wysyła do C; C przycina (zna 58); P scala C — u P cień 58 (11 wersji
// przyciętych na C, 11 rekordów magazynu).
async function przygotuj(nazwy = ['P', 'K', 'C']) {
  sztucznyZegar();
  const { u, sid, pid } = await urzadzenia(nazwy);
  przesunZegar(M); await poprawMase(u.P, sid, 58);
  przesunZegar(M); await sync(u.P, u.C);
  przesunZegar(M); await przytnij(u.C, sid);
  przesunZegar(M); await sync(u.C, u.P);
  return { u, sid, pid };
}

describe('P-CIEN-POZA-LISTA: mechanika', () => {
  it('M1: cień powstaje raz (11 rekordów, zaślepki w liście); ponowne scalenie tego samego ładunku — 0 zapisów listy i magazynu', async () => {
    const { u: { P, C }, sid } = await przygotuj();
    expect(await lokalnie(P, sid)).toEqual({ wpis: 'retencja', tresc: null, cien: 'cien,iv', magazyn: 11 });
    const meta = await P.__px.getUserMeta(P.__uid);
    expect(meta.snapshotTombstones.filter((e) => e.Bpk && e.Bpk.t && e.Bpk.t.c && e.Bpk.t.c.data).length, 'lista bez pełnych szyfrów cienia').toBe(0);
    const l = licznik(P);
    const lad = JSON.parse(JSON.stringify(await C.exportSyncPayload()));
    przesunZegar(M); await P.mergeSyncPayload(JSON.parse(JSON.stringify(lad)));
    przesunZegar(M); await P.mergeSyncPayload(JSON.parse(JSON.stringify(lad)));
    expect(l).toEqual({ lista: 0, partie: 0, cienZapis: 0, cienUsun: 0, odczyty: 0, klucze: 0 });
    expect(await wiszace(P)).toBe(0);
  }, 120_000);

  it('M2: cień → ważny kosz (K ze starą kopią 23 daje do kosza) — kosz 58 na trzech, rekord usunięty (11 → 10) jedną partią, w liście pełna treść kosza', async () => {
    const { u: { P, K, C }, sid } = await przygotuj();
    const l = licznik(P);
    przesunZegar(M); await doKosza(K, sid);
    przesunZegar(M); await sync(K, P);
    expect(await lokalnie(P, sid)).toEqual({ wpis: 'kosz', tresc: 'data,iv', cien: null, magazyn: 10 });
    expect(l.lista, 'jeden zapis listy').toBe(1);
    expect({ partie: l.partie, cienZapis: l.cienZapis, cienUsun: l.cienUsun }).toEqual({ partie: 1, cienZapis: 0, cienUsun: 1 });
    expect(l.odczyty, 'pełny szyfr treści kosza doczytany z magazynu').toBe(1);
    await rundy([P, K, C]);
    expect(await widoki({ P, K, C }, sid)).toEqual({ P: 'kosz 58', K: 'kosz 58', C: 'kosz 58' });
    expect(await wiszace(P)).toBe(0);
  }, 120_000);

  it('M3: wygaśnięcie cienia (31 dni) — 11 rekordów usuniętych jedną transakcją, lista bez zaślepek', async () => {
    const { u: { P, C }, sid } = await przygotuj();
    const l = licznik(P);
    przesunZegar(31 * DZIEN); await sync(C, P);
    expect(await lokalnie(P, sid)).toEqual({ wpis: 'retencja', tresc: null, cien: null, magazyn: 0 });
    expect({ partie: l.partie, cienZapis: l.cienZapis, cienUsun: l.cienUsun }).toEqual({ partie: 1, cienZapis: 0, cienUsun: 11 });
    const meta = await P.__px.getUserMeta(P.__uid);
    expect(meta.snapshotTombstones.filter((e) => e.Bpk && e.Bpk.t && e.Bpk.t.c).length, 'lista bez cienia').toBe(0);
  }, 120_000);

  it('M4: adapter bez metod magazynu cienia — cień w liście (jak przed wariantem), ten sam wynik', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    const px = u.P.__px;
    const bez = new Proxy(px, { get(cel, k) { if (String(k).includes('SnapshotShadow')) return undefined; const f = cel[k]; return typeof f === 'function' ? f.bind(cel) : f; } });
    u.P.setStorageAdapter(bez); u.P.__px = bez;
    przesunZegar(M); await poprawMase(u.P, sid, 58);
    przesunZegar(M); await sync(u.P, u.C);
    przesunZegar(M); await przytnij(u.C, sid);
    przesunZegar(M); await sync(u.C, u.P);
    expect(await lokalnie(u.P, sid)).toEqual({ wpis: 'retencja', tresc: null, cien: 'data,iv', magazyn: null });
    przesunZegar(M); await doKosza(u.K, sid);
    await rundy([u.P, u.K, u.C]);
    expect(await widoki(u, sid)).toEqual({ P: 'kosz 58', K: 'kosz 58', C: 'kosz 58' });
  }, 120_000);

  it('M5: rekordy cienia zniknęły z magazynu (uszkodzenie) — scalenie bez wyjątku, cień jak wygasły (kosz 23 na trzech)', async () => {
    const { u: { P, K, C }, sid } = await przygotuj();
    const klucze = await P.__px.listSnapshotShadowKeysForUser(P.__uid);
    expect(klucze.length).toBe(11);
    await P.__px.writeSnapshotShadowsForUser(P.__uid, [], klucze);
    przesunZegar(M); await doKosza(K, sid);
    let blad = null;
    try { przesunZegar(M); await sync(K, P); } catch (er) { blad = String(er && er.message); }
    expect(blad).toBe(null);
    await rundy([P, K, C]);
    expect(await widoki({ P, K, C }, sid)).toEqual({ P: 'kosz 23', K: 'kosz 23', C: 'kosz 23' });
  }, 120_000);

  it('M6: aktualizacja z listy z pełnym cieniem w liście (format bez wariantu) — pierwszy zapis listy: 11 rekordów jedną partią, zaślepki; potem kosz 58 na trzech', async () => {
    const { u: { P, K, C }, sid } = await przygotuj();
    // Lista jak bez wariantu: pełne szyfry cienia w Bpk.t.c, magazyn pusty (ta sama lista, ten sam stan składników).
    const meta = await P.__px.getUserMeta(P.__uid);
    const klucze = await P.__px.listSnapshotShadowKeysForUser(P.__uid);
    const rek = new Map();
    for (const k of klucze) rek.set(k, (await P.__px.getSnapshotShadowForUser(P.__uid, k)).c);
    const stara = meta.snapshotTombstones.map((e) => (e.Bpk && e.Bpk.t && e.Bpk.t.c && e.Bpk.t.c.cien === 1
      ? { ...e, Bpk: { ...e.Bpk, t: { ...e.Bpk.t, c: rek.get(e.Bpk.t.c.iv) } } } : e));
    await P.__px.putUserMeta(P.__uid, { ...meta, snapshotTombstones: stara });
    await P.__px.writeSnapshotShadowsForUser(P.__uid, [], klucze);
    P.lock('manual'); await P.unlockUser(P.__uid, P.__haslo); // nowa sesja (jak po aktualizacji)
    expect(await lokalnie(P, sid)).toEqual({ wpis: 'retencja', tresc: null, cien: 'data,iv', magazyn: 0 });
    const l = licznik(P);
    przesunZegar(M); await sync(C, P);
    expect(await lokalnie(P, sid)).toEqual({ wpis: 'retencja', tresc: null, cien: 'cien,iv', magazyn: 11 });
    expect({ lista: l.lista, partie: l.partie, cienZapis: l.cienZapis, cienUsun: l.cienUsun }).toEqual({ lista: 1, partie: 1, cienZapis: 11, cienUsun: 0 });
    przesunZegar(M); await doKosza(K, sid);
    przesunZegar(M); await sync(K, P);
    await rundy([P, K, C]);
    expect(await widoki({ P, K, C }, sid)).toEqual({ P: 'kosz 58', K: 'kosz 58', C: 'kosz 58' });
    expect(await wiszace(P)).toBe(0);
  }, 120_000);

  it('M7: cofnięcie P do 221 po powstaniu cienia, kosz K, powrót — wynik i eksport jak dla cienia w liście (adapter bez metod)', async () => {
    const przebieg = async (bezMagazynu) => {
      sztucznyZegar();
      const { u, sid } = await urzadzenia(['P', 'K', 'C']);
      zegar.baza = zegar.t;
      if (bezMagazynu) {
        const px = u.P.__px;
        const bez = new Proxy(px, { get(cel, k) { if (String(k).includes('SnapshotShadow')) return undefined; const f = cel[k]; return typeof f === 'function' ? f.bind(cel) : f; } });
        u.P.setStorageAdapter(bez); u.P.__px = bez;
      }
      przesunZegar(M); await poprawMase(u.P, sid, 58);
      przesunZegar(M); await sync(u.P, u.C);
      przesunZegar(M); await przytnij(u.C, sid);
      przesunZegar(M); await sync(u.C, u.P);
      u.P = await aktualizuj(u.P, 'S221');
      przesunZegar(M); await doKosza(u.K, sid);
      przesunZegar(M); await sync(u.K, u.P);
      const naStarym = await widoki({ P: u.P }, sid);
      u.P = await aktualizuj(u.P, 'N');
      const rek = async () => (bezMagazynu ? null : (await u.P.__px.listSnapshotShadowKeysForUser(u.P.__uid)).length);
      const magazyn = { poPowrocie: await rek() };
      przesunZegar(M); await sync(u.K, u.P);
      magazyn.poPierwszymScaleniu = await rek();
      await rundy([u.P, u.K, u.C]);
      const s = {};
      for (const n of ['P', 'K', 'C']) s[n] = (await stan(u[n], sid)).nagrobek;
      return { naStarym, widoki: await widoki(u, sid), nagrobki: s, magazyn };
    };
    const { magazyn, ...v } = await przebieg(false);
    const { magazyn: bez, ...n } = await przebieg(true);
    expect(v).toEqual(n);
    expect(v.widoki.P).toMatch(/^kosz /);
    expect(bez).toEqual({ poPowrocie: null, poPierwszymScaleniu: null });
    // 221 nie zamiata: rekord cienia, który ważny kosz zabrał na 221, zostaje sierotą; zamiata go pierwszy zapis listy po powrocie.
    expect(magazyn, 'sierota z 221 zamieciona przy pierwszym zapisie listy po powrocie').toEqual({ poPowrocie: 11, poPierwszymScaleniu: 10 });
  }, 180_000);
});

describe('P-CIEN-POZA-LISTA: inwariant „lista wskazuje tylko istniejące rekordy”', () => {
  it('M8a: zaślepka spoza listy na dysku (inna karta zdjęła cień i rekord w trakcie scalania) — sprawdzona pod blokadą, cień jak wygasły, lista bez wiszącej zaślepki', async () => {
    const { u: { P, C }, sid } = await przygotuj();
    const meta0 = await P.__px.getUserMeta(P.__uid);
    const e0 = meta0.snapshotTombstones.find((e) => e.snapshotId === sid);
    const iv = e0.Bpk.t.c.iv;
    let uzbrojone = true;
    const px = P.__px;
    // „Druga karta” w trakcie scalania (po starcie, przed zapisem listy): zdejmuje cień tej wersji z listy i usuwa rekord.
    const hak = new Proxy(px, { get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      if (k === 'listSnapshotsForUser') {
        return async (...a) => {
          if (uzbrojone) {
            uzbrojone = false;
            const m = await cel.getUserMeta(P.__uid);
            const lista = m.snapshotTombstones.map((e) => (e.snapshotId === sid ? { ...e, Bpk: { ...e.Bpk, t: { ...e.Bpk.t, c: null } } } : e));
            await cel.putUserMeta(P.__uid, { ...m, snapshotTombstones: lista });
            await cel.writeSnapshotShadowsForUser(P.__uid, [], [iv]);
          }
          return f.apply(cel, a);
        };
      }
      return f.bind(cel);
    } });
    P.setStorageAdapter(hak); P.__px = hak;
    const l = licznik(P);
    // R4 przeglądu wariantu V: błąd końca scalania połyka mergeSyncPayload (console.warn) — strażnik, bo stan końcowy listy
    // bywa ten sam także przy nieudanym zapisie; ponowienia do rzutu widać też po liczbie odczytów (1, nie 4).
    const ostrz = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...a) => { ostrz.push(a.map(String).join(' ')); });
    try { przesunZegar(M); await sync(C, P); } finally { spy.mockRestore(); }
    expect(ostrz.filter((x) => x.includes('scalanie nagrobkow')), 'koniec scalania bez połkniętego błędu').toEqual([]);
    expect(uzbrojone, 'hak zadziałał').toBe(false);
    expect(l.odczyty, 'obca zaślepka sprawdzona w magazynie raz').toBe(1);
    // W2P-3 weryfikacji: strażnik bezRekordu w Bpc_przedZapisem — bez niego lista z wiszącą zaślepką trafia na dysk, a stan
    // końcowy naprawia dopiero następna próba (przejściowy zapis między dwiema transakcjami).
    expect(l.lista, 'scalenie nie zapisuje listy z wiszącą zaślepką (stan przejściowy między próbami)').toBe(0);
    expect(await wiszace(P), 'lista bez zaślepki bez rekordu').toBe(0);
    const po = (await P.__px.getUserMeta(P.__uid)).snapshotTombstones.find((e) => e.snapshotId === sid);
    expect(po.Bpk.t && po.Bpk.t.c, 'cień tej wersji jak wygasły').toBeFalsy();
  }, 120_000);

  it('M8b: błąd zapisu rekordów cienia (np. brak miejsca) — lista zapisuje się bez tych cieni (nagrobki są), żadna zaślepka bez rekordu', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await poprawMase(u.P, sid, 58);
    przesunZegar(M); await sync(u.P, u.C);
    przesunZegar(M); await przytnij(u.C, sid);
    const l = licznik(u.P, (k, rek) => (rek.length ? Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }) : null));
    przesunZegar(M); await sync(u.C, u.P);
    expect(l.cienZapis, 'żaden rekord nie zapisany').toBe(0);
    expect(await lokalnie(u.P, sid), 'nagrobek retencji zapisany, cień jak wygasły').toEqual({ wpis: 'retencja', tresc: null, cien: null, magazyn: 0 });
    const meta = await u.P.__px.getUserMeta(u.P.__uid);
    expect(meta.snapshotTombstones.length, 'wszystkie 11 nagrobków retencji w liście').toBe(11);
    expect(await wiszace(u.P)).toBe(0);
  }, 120_000);

  it('M8c: błąd sprzątania po zapisie listy — zostają tylko sieroty, zamiata je następny zapis listy (getAllKeys, jedna partia)', async () => {
    const { u: { P, K, C }, sid, pid } = await przygotuj();
    let awaria = true;
    const l = licznik(P, (k, rek, usun) => (awaria && usun.length ? new Error('IndexedDB: awaria testowa') : null));
    przesunZegar(M); await doKosza(K, sid);
    przesunZegar(M); await sync(K, P);
    expect(await lokalnie(P, sid), 'kosz z pełną treścią; rekord został jako sierota').toEqual({ wpis: 'kosz', tresc: 'data,iv', cien: null, magazyn: 11 });
    expect(await wiszace(P)).toBe(0);
    awaria = false;
    const przed = { ...l };
    // Następna zmiana listy na P (kosz nowej wizyty — bez cienia): zamiatanie, ponowione po błędzie.
    przesunZegar(M); const nowa = await P.savePatient(jan(130, 30), { dedup: false, patientId: pid });
    przesunZegar(M); await P.moveSnapshotToTrash(pid, nowa.snapshotId, { odepnij: true });
    expect({ klucze: l.klucze - przed.klucze, partie: l.partie - przed.partie, usun: l.cienUsun - przed.cienUsun },
      'zamiatanie po samych kluczach, jedna partia usunięć').toEqual({ klucze: 1, partie: 1, usun: 1 });
    expect((await P.__px.listSnapshotShadowKeysForUser(P.__uid)).length, 'sierota usunięta').toBe(10);
    expect(await wiszace(P)).toBe(0);
    await rundy([P, K, C]);
    expect((await widoki({ P, K, C }, sid))).toEqual({ P: 'kosz 58', K: 'kosz 58', C: 'kosz 58' });
  }, 120_000);

  // R2 przeglądu wariantu V: kolejność „rekordy przed listą” (Bmk_zmien: przedZapisem przed putUserMeta) — jedyne, co trzyma
  // inwariant przy przerwaniu między dwiema transakcjami. Zapis partii zawisa (karta zamknięta w trakcie transakcji).
  it('M8d (R2): zapis partii rekordów przerwany (karta zamknięta w trakcie) — lista na dysku jeszcze nie wskazuje tych rekordów', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await poprawMase(u.P, sid, 58);
    przesunZegar(M); await sync(u.P, u.C);
    przesunZegar(M); await przytnij(u.C, sid);
    let zawis = false; let start;
    const rozpoczety = new Promise((r) => { start = r; });
    const px = u.P.__px;
    const hak = new Proxy(px, { get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      if (k === 'writeSnapshotShadowsForUser') {
        return async (uid, rek, usun) => { if ((rek || []).length) { zawis = true; start(); return new Promise(() => {}); } return f.call(cel, uid, rek, usun); };
      }
      return f.bind(cel);
    } });
    u.P.setStorageAdapter(hak); u.P.__px = hak;
    przesunZegar(M); sync(u.C, u.P).catch(() => {});
    await Promise.race([rozpoczety, new Promise((r) => { setTimeout(r, 5000); })]);
    expect(zawis, 'zapis partii rekordów rozpoczęty').toBe(true);
    expect(await wiszace(u.P), 'lista na dysku bez zaślepek bez rekordu w chwili przerwania').toBe(0);
    const m = await px.getUserMeta(u.P.__uid);
    expect((m.snapshotTombstones || []).length, 'lista na dysku jeszcze sprzed scalenia').toBe(0);
  }, 120_000);

  // R1 przeglądu wariantu V: cień powstaje z treści WAŻNEGO kosza zapisanej na dysku (K daje X do kosza → P; C, nie wiedząc
  // o koszu, poprawia X na 74 i przycina — kosz na P traci ważność w tym scaleniu), a zapis partii rekordów pada. bezZap
  // działa na wyniku złączenia (Bpc_odloz): cień jak wygasły, lista zapisuje się bez niego — jak M8b, bez ponowień do
  // rzutu i bez połkniętego błędu końca scalania.
  for (const ile of [99, 1]) {
    it(`M8e (R1): błąd zapisu partii ${ile === 1 ? 'jednorazowy' : 'stały'} przy cieniu z treści ważnego kosza z dysku — lista zapisuje się bez cienia (11 nagrobków retencji), 1 próba zapisu, bez połkniętego błędu, 0 wiszących zaślepek`, async () => {
      sztucznyZegar();
      const { u, sid } = await urzadzenia(['P', 'K', 'C']);
      przesunZegar(M); await doKosza(u.K, sid);
      przesunZegar(M); await sync(u.K, u.P);
      przesunZegar(M); await poprawMase(u.C, sid, 74);
      przesunZegar(M); await przytnij(u.C, sid);
      expect((await lokalnie(u.P, sid)).wpis, 'na P ważny kosz z treścią na dysku').toBe('kosz');
      let proby = 0;
      const l = licznik(u.P, (k, rek) => {
        if (!rek.length) return null;
        proby += 1;
        return proby <= ile ? Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }) : null;
      });
      const ostrz = [];
      const spy = vi.spyOn(console, 'warn').mockImplementation((...a) => { ostrz.push(a.map(String).join(' ')); });
      try { przesunZegar(M); await sync(u.C, u.P); } finally { spy.mockRestore(); }
      expect(ostrz.filter((x) => x.includes('scalanie nagrobkow')), 'koniec scalania bez połkniętego błędu').toEqual([]);
      expect(proby, 'jedna próba zapisu rekordów (bez ponowień do rzutu)').toBe(1);
      expect(l.cienZapis, 'żaden rekord nie zapisany').toBe(0);
      const meta = await u.P.__px.getUserMeta(u.P.__uid);
      expect(meta.snapshotTombstones.filter((e) => e.powod === 'retencja').length, 'nagrobki retencji C zapisane na P').toBe(11);
      expect(await lokalnie(u.P, sid), 'nagrobek retencji X, cień jak wygasły').toEqual({ wpis: 'retencja', tresc: null, cien: null, magazyn: 0 });
      expect((await widoki({ P: u.P }, sid)).P, 'kosz nieaktualny — X usunięta przycięciem C').toBe('brak');
      expect(await wiszace(u.P)).toBe(0);
    }, 120_000);
  }

  // W3 przeglądu wariantu V: blokada sejfu (kn: b = null — „Zablokuj”, bezczynność, wylogowanie) w oknie zapisu listy pod
  // blokadą metadanych. Jedno uid na całą zmianę listy (Bkz_zmienListe): rekordy cienia idą do konta, którego listę
  // zapisujemy, nigdy poza nie. Wyzwalacz: drugi odczyt metadanych po zapisie nagłówka karty w scaleniu — odczyt
  // pod blokadą w Bmk_zmien (pierwszy to przygotowanie Z4 w Bkz_zmienListe); blokada przed przedZapisem. Od P-CHMURA-OPIS
  // scalanie przerwane zmianą sesji kończy się błędem SESSION_CHANGED (lista kosza konta, które scalało, zapisuje się
  // do niego); M9 i M9b sprawdzają dalej, że magazyn cienia i zapisy idą tylko do tego konta.
  for (const powod of ['manual', 'idle']) {
    it(`M9 (W3): blokada „${powod}” w trakcie zapisu listy — rekordy cienia do konta (0 wywołań magazynu i zapisów spoza konta), po ponownym logowaniu 0 wiszących zaślepek, kosz 58 na trzech`, async () => {
      sztucznyZegar();
      const { u, sid } = await urzadzenia(['P', 'K', 'C']);
      przesunZegar(M); await poprawMase(u.P, sid, 58);
      przesunZegar(M); await sync(u.P, u.C);
      przesunZegar(M); await przytnij(u.C, sid);
      const P = u.P, px = P.__px;
      const zObcym = [], cienKonta = [];
      let uzbrojone = true, poNaglowku = false, odczyty = 0, okno = false;
      const naUid = /ForUser$|^(get|put)UserMeta$/;
      const hak = new Proxy(px, { get(cel, k) {
        const f = cel[k];
        if (typeof f !== 'function' || !naUid.test(String(k))) return typeof f === 'function' ? f.bind(cel) : f;
        return async (...a) => {
          if (okno && a[0] !== P.__uid && (/SnapshotShadow/.test(k) || /^(put|write|remove|delete|update)/.test(k))) zObcym.push(`${k}(${String(a[0])})`);
          if (okno && k === 'writeSnapshotShadowsForUser' && a[0] === P.__uid) cienKonta.push((a[1] || []).length);
          if (k === 'putPatientForUser' && uzbrojone) poNaglowku = true;
          const r = await f.apply(cel, a);
          if (k === 'getUserMeta' && uzbrojone && poNaglowku && (odczyty += 1) === 2) { uzbrojone = false; okno = true; P.lock(powod); }
          return r;
        };
      } });
      P.setStorageAdapter(hak); P.__px = hak;
      let blad = null;
      try { przesunZegar(M); await sync(u.C, P); } catch (er) { blad = (er && er.code) || String(er && er.message); }
      okno = false;
      P.setStorageAdapter(px); P.__px = px;
      expect(uzbrojone, 'blokada w oknie zapisu listy').toBe(false);
      expect(blad, 'scalanie przerwane blokadą').toBe('SESSION_CHANGED');
      expect(zObcym, 'magazyn cienia i zapisy tylko dla konta').toEqual([]);
      expect(cienKonta, 'rekordy cienia zapisane do konta jedną partią').toEqual([11]);
      expect(await px.listSnapshotShadowKeysForUser(null), 'poza kontem bez rekordów').toEqual([]);
      expect(await wiszace(P), 'lista konta bez wiszących zaślepek').toBe(0);
      await P.unlockUser(P.__uid, P.__haslo);
      przesunZegar(M); await sync(u.C, P);
      expect(await wiszace(P), 'po ponownym logowaniu 0 wiszących zaślepek').toBe(0);
      expect((await lokalnie(P, sid)).cien).toBe('cien,iv');
      przesunZegar(M); await doKosza(u.K, sid);
      przesunZegar(M); await sync(u.K, P);
      await rundy([P, u.K, u.C]);
      expect(await widoki(u, sid)).toEqual({ P: 'kosz 58', K: 'kosz 58', C: 'kosz 58' });
    }, 120_000);
  }

  // W2P-2 weryfikacji: uid konta z W3 idzie też do doczytania treści kosza (Bpc_pelny w pętli prób), do sprzątania po
  // zapisie listy (Bpc_sprzataj) i do warunku znacznika zamiatania. M9 widzi tylko rekordy (przedZapisem). Mutanty:
  // w3c (doczytanie z b) → M9b-1, w3b (sprzątanie z b) → M9b-1 i M9b-2, w3d (znacznik bez b === uid) → M9b-3.
  for (const powod of ['manual', 'idle']) {
    it(`M9b-1: K→P, blokada „${powod}” pod blokadą metadanych przed doczytaniem treści kosza — magazyn tylko dla konta, po ponownym logowaniu kosz 58 na trzech`, async () => {
      const { u, sid } = await przygotuj();
      przesunZegar(M); await doKosza(u.K, sid);
      // Drugi odczyt metadanych po zapisie nagłówka karty — odczyt pod blokadą (pierwszy: przygotowanie Z4), jak w M9.
      const h = uzbroj(u.P, (k, st) => k === 'getUserMeta' && st.poNaglowku && (st.odczyty += 1) === 2, powod);
      let blad = null;
      try { przesunZegar(M); await sync(u.K, u.P); } catch (er) { blad = (er && er.code) || String(er && er.message); }
      h.zdejmij();
      expect(h.st.uzbrojone, 'blokada w oknie').toBe(false);
      expect(blad, 'scalanie przerwane blokadą').toBe('SESSION_CHANGED');
      expect(h.st.zObcym, 'doczytanie treści kosza i sprzątanie w magazynie konta').toEqual([]);
      await u.P.unlockUser(u.P.__uid, u.P.__haslo);
      await rundy([u.P, u.K, u.C]);
      expect(await widoki(u, sid)).toEqual({ P: 'kosz 58', K: 'kosz 58', C: 'kosz 58' });
    }, 120_000);

    // Od zapisów S4 pilnujących sesji (jak P-CHMURA-OPIS): lista bez usunięcia wersji zapisuje się tylko w sesji scalania,
    // a sprzątanie po niej po zmianie sesji nic nie usuwa — rekordy wygasłych cieni zostają sierotami, które zamiata
    // pierwszy zapis listy po ponownym logowaniu (zamiatanie raz na sesję).
    it(`M9b-2: wygaśnięcie (31 dni), blokada „${powod}” po zapisie listy, przed sprzątaniem — magazyn tylko dla konta, sprzątanie bez usuwania po blokadzie; sieroty zamiata pierwszy zapis listy po ponownym logowaniu`, async () => {
      const { u, pid } = await przygotuj();
      const h = uzbroj(u.P, (k) => k === 'putUserMeta', powod);
      let blad = null;
      try { przesunZegar(31 * DZIEN); await sync(u.C, u.P); } catch (er) { blad = (er && er.code) || String(er && er.message); }
      h.zdejmij();
      expect(h.st.uzbrojone, 'blokada w oknie').toBe(false);
      expect(blad, 'scalanie przerwane blokadą').toBe('SESSION_CHANGED');
      expect(h.st.zObcym, 'sprzątanie w magazynie konta').toEqual([]);
      expect(await wiszace(u.P), 'lista bez zaślepek bez rekordu').toBe(0);
      expect(await sieroty(u.P), 'po blokadzie sprzątanie nic nie usuwa — rekordy wygasłych cieni zostają sierotami').toBe(11);
      await u.P.unlockUser(u.P.__uid, u.P.__haslo);
      przesunZegar(M); await sync(u.C, u.P);
      przesunZegar(M); const nowa = await u.P.savePatient(jan(130, 30), { dedup: false, patientId: pid });
      przesunZegar(M); await u.P.moveSnapshotToTrash(pid, nowa.snapshotId, { odepnij: true });
      expect(await sieroty(u.P), 'po ponownym logowaniu: pierwszy zapis listy zamiata sieroty').toBe(0);
    }, 120_000);
  }

  it('M9b-3: zamiatanie w oknie blokady nie zalicza zamiatania nowej sesji — sierota dopisana przed ponownym logowaniem zamieciona przy pierwszym zapisie listy', async () => {
    const { u, pid } = await przygotuj();
    const h = uzbroj(u.P, (k) => k === 'putUserMeta', 'manual');
    let blad = null;
    try { przesunZegar(31 * DZIEN); await sync(u.C, u.P); } catch (er) { blad = (er && er.code) || String(er && er.message); }
    h.zdejmij();
    expect(h.st.uzbrojone).toBe(false);
    expect(blad, 'scalanie przerwane blokadą').toBe('SESSION_CHANGED');
    await u.P.__px.writeSnapshotShadowsForUser(u.P.__uid, [{ key: 'SIEROTA-1', c: { iv: 'SIEROTA-1', data: 'AAAA' }, patientId: 'p', snapshotId: 's', od: '' }], []);
    await u.P.unlockUser(u.P.__uid, u.P.__haslo);
    przesunZegar(M); const nowa = await u.P.savePatient(jan(130, 30), { dedup: false, patientId: pid });
    przesunZegar(M); await u.P.moveSnapshotToTrash(pid, nowa.snapshotId, { odepnij: true });
    expect((await u.P.__px.listSnapshotShadowKeysForUser(u.P.__uid)).includes('SIEROTA-1'), 'sierota zamieciona w nowej sesji').toBe(false);
  }, 120_000);
});

// R3 przeglądu wariantu V: Bgw_wskrzes (przypięta wersja wraca z cienia) czyta pełny szyfr z magazynu — pamięć podręczną
// zapełnia tylko odczyt z magazynu, a każde scalenie czyta listę z dysku (z zaślepkami), więc każdy cień zapisany we
// wcześniejszym scaleniu trzeba doczytać, także w tej samej karcie. Trasa naturalna (katalog S4 w innej kolejności, bez
// ręcznej zmiany listy): gwiazdka P, kosz K, P←K, C poprawia na 74, K←C, retencja C, K←C (u K cień 74: zaślepka + rekord),
// K←P (kosz z rejestrem gwiazdki P, bez wersji) — koniec scalania K wskrzesza wersję z zaślepki.
describe('P-CIEN-POZA-LISTA: odczyt z magazynu w Bgw_wskrzes (trasa naturalna)', () => {
  async function trasa() {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    const { P, K, C } = u;
    przesunZegar(M); await przypnij(P, sid, true);
    przesunZegar(M); await doKosza(K, sid);
    przesunZegar(M); await sync(K, P);
    przesunZegar(M); await poprawMase(C, sid, 74);
    przesunZegar(M); await sync(C, K);
    przesunZegar(M); await przytnij(C, sid);
    przesunZegar(M); await sync(C, K);
    expect((await lokalnie(K, sid)).cien, 'u K cień 74 jako zaślepka').toBe('cien,iv');
    przesunZegar(M); await sync(P, K);
    return { u, sid };
  }
  it('N4: K←P — przypięta wersja 74* wraca na K z zaślepki (odczyt z magazynu), po rundach 74* na trzech', async () => {
    const { u, sid } = await trasa();
    expect((await widoki({ K: u.K }, sid)).K, 'K←P: wersja z cienia 74 z rejestrem gwiazdki P').toBe('karta 74*');
    await rundy([u.P, u.K, u.C]);
    expect(await widoki(u, sid)).toEqual({ P: 'karta 74*', K: 'karta 74*', C: 'karta 74*' });
  }, 120_000);
  it('N5: P milknie po K←P (stary telefon), dalej tylko K↔C — 74* przeżywa wyłącznie dzięki odczytowi zaślepki z magazynu na K', async () => {
    const { u, sid } = await trasa();
    for (let r = 0; r < 3; r += 1) { przesunZegar(M); await sync(u.K, u.C); await sync(u.C, u.K); }
    expect(await widoki({ K: u.K, C: u.C }, sid)).toEqual({ K: 'karta 74*', C: 'karta 74*' });
  }, 120_000);
});

// R5 przeglądu wariantu V: zamiatanie sierot raz na sesję — blokada (kn → Bpc_wyczysc) zaczyna nową sesję, więc pierwszy
// zapis listy po ponownym odblokowaniu tego samego konta zamiata znowu. Kontrola: bez blokady sierota zostaje.
describe('P-CIEN-POZA-LISTA: zamiatanie sierot raz na sesję', () => {
  for (const zBlokada of [false, true]) {
    it(`L2${zBlokada ? '' : ' (kontrola, bez blokady)'}: sierota dopisana po zamiataniu — ${zBlokada ? 'po blokadzie i odblokowaniu zamieciona przy pierwszym zapisie listy' : 'w tej samej sesji zostaje'}`, async () => {
      const { u: { P, C }, sid, pid } = await przygotuj();
      expect(sid).toBeTruthy();
      await P.__px.writeSnapshotShadowsForUser(P.__uid, [{ key: 'SIEROTA-1', c: { iv: 'SIEROTA-1', data: 'AAAA' }, patientId: 'p', snapshotId: 's', od: '' }], []);
      if (zBlokada) { P.lock('manual'); await P.unlockUser(P.__uid, P.__haslo); }
      przesunZegar(M); const nowa = await P.savePatient(jan(130, 30), { dedup: false, patientId: pid });
      przesunZegar(M); await P.moveSnapshotToTrash(pid, nowa.snapshotId, { odepnij: true });
      const klucze = await P.__px.listSnapshotShadowKeysForUser(P.__uid);
      expect(klucze.includes('SIEROTA-1'), zBlokada ? 'sierota zamieciona' : 'sierota zostaje do następnej sesji').toBe(!zBlokada);
      expect(klucze.length, 'rekordy cienia 58 nietknięte').toBe(zBlokada ? 11 : 12);
      expect(await wiszace(P)).toBe(0);
      expect((await lokalnie(P, sid)).cien).toBe('cien,iv');
      expect(C).toBeTruthy();
    }, 120_000);
  }
});

// Wspólne dla M10 i M11: druga karta (Testowy Piotr), adapter bez metod magazynu cienia, stan jednej karty, dwie karty z cieniem.
const piotr = (height, weight) => ({ name: 'Testowy Piotr', user: { lastName: 'Testowy', firstName: 'Piotr', dobISO: '2015-05-05', sex: 'M', height, weight } });
const bezMetod = (v) => {
  const px = v.__px;
  const bez = new Proxy(px, { get(cel, k) { if (String(k).includes('SnapshotShadow')) return undefined; const f = cel[k]; return typeof f === 'function' ? f.bind(cel) : f; } });
  v.setStorageAdapter(bez); v.__px = bez;
};
// Stan nagrobków i magazynu jednej karty na urządzeniu.
async function karta(v, pid) {
  const m = (await v.__px.getUserMeta(v.__uid)) || {};
  const lista = (m.snapshotTombstones || []).filter((e) => e.patientId === pid);
  let rekordy = null;
  if (typeof v.__px.listSnapshotShadowKeysForUser === 'function') {
    rekordy = 0;
    for (const k of await v.__px.listSnapshotShadowKeysForUser(v.__uid)) if ((await v.__px.getSnapshotShadowForUser(v.__uid, k)).patientId === pid) rekordy += 1;
  }
  const t = (e) => (e.Bpk && e.Bpk.t && e.Bpk.t.c) || null;
  return {
    zaslepki: lista.filter((e) => t(e) && t(e).cien === 1).length,
    pelnyCien: lista.filter((e) => t(e) && typeof t(e).data === 'string').length,
    rekordy,
    koszZTrescia: lista.filter((e) => e.payloadCipher && e.payloadCipher.data).length,
  };
}
// Dwie karty z cieniem na P: Jan (pid; czwarta wersja poprawiona na 58, druga w koszu P) i Piotr (pid2; czwarta na 68).
// C przycina obie karty, P scala C.
async function dwieKarty(bezMagazynu) {
  sztucznyZegar();
  const { u, pid, ids, sid } = await urzadzenia(['P', 'K', 'C']);
  if (bezMagazynu) bezMetod(u.P);
  let pid2 = null; const ids2 = [];
  for (let i = 0; i < 12; i += 1) { const r = await zapisz(u.K, piotr(110 + i, 30 + i), pid2 ? { patientId: pid2 } : {}); pid2 = r.patientId; ids2.push(r.snapshotId); }
  przesunZegar(M); await sync(u.K, u.P); await sync(u.K, u.C);
  const sid2 = ids2[3];
  przesunZegar(M); await poprawMase(u.P, sid, 58); await poprawMase(u.P, sid2, 68);
  przesunZegar(M); await doKosza(u.P, ids[1]);
  przesunZegar(M); await sync(u.P, u.C);
  przesunZegar(M); await przytnij(u.C, sid); await przytnij(u.C, sid2);
  przesunZegar(M); await sync(u.C, u.P);
  return { u, pid, ids, sid, pid2, sid2 };
}

// Decyzja właściciela 2026-10-26 (1: S4V-MP4 = b): „Usuń pacjenta” od razu usuwa kopie robocze (cień) wersji tej karty —
// okno potwierdzenia obiecuje usunięcie „wraz z całą historią pomiarów i notatek”. Dotąd zaszyfrowana treść wersji tej
// karty przyciętych na innym urządzeniu zostawała w magazynie do 30 dni. Koszt przyjęty (D4): karta zachowana na urządzeniu,
// które nie wie o usunięciu (D-21), i jego stara kopia takiej wersji w koszu — kosz bierze treść innych urządzeń (23, jak
// f612fe09; z cieniem byłoby 58).
describe('P-CIEN-POZA-LISTA: „Usuń pacjenta” zdejmuje cień karty (decyzja 1, S4V-MP4 = b)', () => {
  for (const bezMagazynu of [false, true]) {
    it(`M10a${bezMagazynu ? ' (adapter bez metod magazynu — cień w liście)' : ''}: „Usuń pacjenta” — cień tej karty znika od razu (jedna partia), kosz z treścią zostaje, cień innej karty nietknięty (kosz 68 na trzech)`, async () => {
      const { u, pid, pid2, sid2 } = await dwieKarty(bezMagazynu);
      const { P, K, C } = u;
      const przed = { jan: await karta(P, pid), piotr: await karta(P, pid2) };
      expect(przed, 'przed: cień obu kart, kosz Jana z treścią').toEqual(bezMagazynu ? {
        jan: { zaslepki: 0, pelnyCien: 10, rekordy: null, koszZTrescia: 1 }, piotr: { zaslepki: 0, pelnyCien: 11, rekordy: null, koszZTrescia: 0 },
      } : {
        jan: { zaslepki: 10, pelnyCien: 0, rekordy: 10, koszZTrescia: 1 }, piotr: { zaslepki: 11, pelnyCien: 0, rekordy: 11, koszZTrescia: 0 },
      });
      const l = bezMagazynu ? null : licznik(P);
      przesunZegar(M); await P.removePatient(pid);
      const zm = l ? { ...l } : null;
      const po = { jan: await karta(P, pid), piotr: await karta(P, pid2) };
      expect(po, 'po „Usuń pacjenta”: cień Jana zdjęty, kosz Jana z treścią i cień Piotra zostają').toEqual({
        jan: { zaslepki: 0, pelnyCien: 0, rekordy: bezMagazynu ? null : 0, koszZTrescia: 1 }, piotr: przed.piotr,
      });
      if (zm) {
        expect(zm, 'jeden zapis listy, rekordy Jana usunięte jedną partią (bez nowych rekordów i odczytów)').toEqual({ lista: 1, partie: 1, cienZapis: 0, cienUsun: 10, odczyty: 0, klucze: 0 });
        expect(await wiszace(P)).toBe(0);
        expect(await sieroty(P)).toBe(0);
      }
      expect((await P.listTrashedSnapshots()).filter((e) => e.patientId === pid).length, 'kosz Jana widoczny w Koszu').toBe(1);
      przesunZegar(M); await sync(K, P); przesunZegar(M); await sync(C, P);
      expect(await karta(P, pid), 'scalenia nie przywracają cienia usuniętej karty').toEqual(po.jan);
      // Cień Piotra działa: K (stara kopia 33) daje czwartą wersję Piotra do kosza — kosz 68 na trzech.
      przesunZegar(M); await doKosza(K, sid2);
      przesunZegar(M); await sync(K, P);
      await rundy([P, K, C]);
      expect(await widoki(u, sid2)).toEqual({ P: 'kosz 68', K: 'kosz 68', C: 'kosz 68' });
    }, 180_000);

    it(`M10b${bezMagazynu ? ' (adapter bez metod magazynu)' : ''}: krawędź D-21 — K nie wie o usunięciu, zapisuje nową wizytę (karta przeżywa) i daje starą kopię czwartej wersji (23) do kosza: kosz 23 na trzech (koszt decyzji 1; z cieniem byłoby 58)`, async () => {
      sztucznyZegar();
      const { u, pid, sid } = await urzadzenia(['P', 'K', 'C']);
      const { P, K, C } = u;
      if (bezMagazynu) bezMetod(P);
      przesunZegar(M); await poprawMase(P, sid, 58);
      przesunZegar(M); await sync(P, C);
      przesunZegar(M); await przytnij(C, sid);
      przesunZegar(M); await sync(C, P);
      expect(await karta(P, pid), 'przed: cień 11 wersji Jana').toEqual(bezMagazynu
        ? { zaslepki: 0, pelnyCien: 11, rekordy: null, koszZTrescia: 0 } : { zaslepki: 11, pelnyCien: 0, rekordy: 11, koszZTrescia: 0 });
      przesunZegar(M); await P.removePatient(pid);
      expect(await karta(P, pid)).toEqual({ zaslepki: 0, pelnyCien: 0, rekordy: bezMagazynu ? null : 0, koszZTrescia: 0 });
      przesunZegar(M); await zapisz(K, jan(120, 40), { patientId: pid });
      przesunZegar(M); await doKosza(K, sid);
      przesunZegar(M); await sync(K, P);
      await rundy([P, K, C]);
      expect((await P.listPatients()).some((k) => k.patientId === pid), 'karta przeżywa (zapis K po chwili usunięcia, D-21)').toBe(true);
      expect(await widoki(u, sid)).toEqual({ P: 'kosz 23', K: 'kosz 23', C: 'kosz 23' });
      if (!bezMagazynu) expect(await wiszace(P)).toBe(0);
    }, 180_000);
  }
});

// W3P-1 weryfikacji decyzji 1 i decyzja 1 na całej flocie (właściciel 2026-10-26: po „Usuń pacjenta” cień wizyt tej karty
// usuwany od razu, nie po 30 dniach). Sejf trzyma zbiór kart usuniętych w tej sesji (Bpc_usuniete): „Usuń pacjenta” tutaj,
// karta usunięta scaleniem z powodu nagrobka karty (Bsl_usunPacjenta) i pusta karta źródła „Scal pacjentów” z innego
// urządzenia (faza przeniesień). Każda zmiana listy — także końcowy zapis scalenia — zdejmuje ich cień (rekordy: jedna
// partia sprzątania); blokada, wylogowanie i przeładowanie strony czyszczą zbiór (żyje w pamięci dokumentu). Koszt jak
// w decyzji 1: karta, która w tej sesji wraca (D-21), do końca sesji nie ma cienia — kosz bierze treść innych urządzeń
// (23, jak f612fe09); ten sam kosz po „Scal pacjentów” na innym urządzeniu, także bez powrotu źródła (M11d, W5P-2). Na
// 1da487ce M11a, M11a-2, M11b, M11d ×2, M11e, M11f i M11h są czerwone (11 rekordów albo kosz 58); M11h także na e107e186
// (1 zaślepka i 1 rekord, ponowne scalenie zapisuje listę).
describe('P-CIEN-POZA-LISTA: cień kart usuniętych w tej sesji (W3P-1, decyzja 1 na całej flocie)', () => {
  const bezCienia = (bezMagazynu) => ({ zaslepki: 0, pelnyCien: 0, rekordy: bezMagazynu ? null : 0, koszZTrescia: 0 });
  // P z cieniem 58 Jana (11 wersji przyciętych na C) — jak przygotuj(), z opcjonalnym adapterem bez metod magazynu.
  async function janZCieniem(bezMagazynu) {
    zegarRano();
    const { u, pid, ids, sid } = await urzadzenia(['P', 'K', 'C']);
    if (bezMagazynu) bezMetod(u.P);
    przesunZegar(M); await poprawMase(u.P, sid, 58);
    przesunZegar(M); await sync(u.P, u.C);
    przesunZegar(M); await przytnij(u.C, sid);
    przesunZegar(M); await sync(u.C, u.P);
    expect(await karta(u.P, pid), 'przed: cień 11 wersji Jana').toEqual(bezMagazynu
      ? { zaslepki: 0, pelnyCien: 11, rekordy: null, koszZTrescia: 0 } : { zaslepki: 11, pelnyCien: 0, rekordy: 11, koszZTrescia: 0 });
    return { u, pid, ids, sid };
  }
  for (const bezMagazynu of [false, true]) {
    const opis = bezMagazynu ? ' (adapter bez metod magazynu — cień w liście)' : '';
    // W3P-1: koniec scalania zapisuje listę po zwolnieniu blokady karty, z mapą, w której są pełne szyfry cienia wersji
    // usuniętych w tym scaleniu. „Usuń pacjenta” (blokada karty zwolniona przez scalenie) zdejmował cień tylko z listy na
    // dysku, a końcowy zapis scalenia dokładał go z powrotem (do 30 dni). Hak: kliknięcie przy pierwszym usunięciu wersji
    // Jana w scaleniu, końcowy zapis listy scalenia czeka na koniec „Usuń pacjenta”.
    it(`M11a${opis}: „Usuń pacjenta” w trakcie scalenia, które przycina wersje tej karty (W3P-1) — końcowy zapis listy scalenia nie przywraca cienia`, async () => {
      sztucznyZegar();
      const { u, pid, sid } = await urzadzenia(['P', 'K', 'C']);
      const { P, K, C } = u;
      if (bezMagazynu) bezMetod(P);
      przesunZegar(M); await poprawMase(P, sid, 58);
      przesunZegar(M); await sync(P, C);
      przesunZegar(M); await przytnij(C, sid);
      // P scala C: scalenie usuwa 11 wersji Jana (cień 58 w mapie scalania) i w tym czasie lekarz klika „Usuń pacjenta”.
      const px = P.__px;
      const st = { pr: null, czekal: false, koniecUsun: false, przedKoncem: null };
      const hak = new Proxy(px, { get(cel, k) {
        const f = cel[k];
        if (typeof f !== 'function') return f;
        return async (...a) => {
          if (k === 'getUserMeta' && st.pr && !st.czekal) {
            const stos = new Error().stack || '';
            if (stos.includes('Bkz_scalKoniec') && stos.includes('Bkz_zmienListe')) {
              st.czekal = true;
              st.przedKoncem = await Promise.race([st.pr, new Promise((r) => { setTimeout(() => r('limit'), 5000); })]);
            }
          }
          const r = await f.apply(cel, a);
          if (k === 'removeSnapshotForUser' && !st.pr) st.pr = P.removePatient(pid).then(() => 'ok', (e) => String(e && e.message));
          return r;
        };
      } });
      P.setStorageAdapter(hak); P.__px = hak;
      try { przesunZegar(M); await sync(C, P); } finally { P.setStorageAdapter(px); P.__px = px; }
      expect(st.pr, 'kliknięcie w trakcie scalenia (usunięcie wersji Jana)').not.toBe(null);
      expect(await st.pr).toBe('ok');
      expect({ czekal: st.czekal, przedKoncem: st.przedKoncem }, '„Usuń pacjenta” skończone przed końcowym zapisem listy scalenia').toEqual({ czekal: true, przedKoncem: 'ok' });
      expect((await P.listPatients()).some((x) => x.patientId === pid), 'karty nie ma').toBe(false);
      expect(await karta(P, pid), 'po scaleniu: 0 zaślepek, 0 szyfrów i 0 rekordów cienia Jana').toEqual(bezCienia(bezMagazynu));
      if (!bezMagazynu) expect(await wiszace(P)).toBe(0);
      await rundy([P, K, C], 1);
      expect(await karta(P, pid), 'po rundzie synchronizacji dalej bez cienia').toEqual(bezCienia(bezMagazynu));
    }, 180_000);

    // Decyzja 1 na całej flocie: „Usuń pacjenta” na K przychodzi do P synchronizacją (nagrobek karty z ładunku,
    // Bsl_usunPacjenta) — cień Jana znika przy końcowym zapisie listy tego scalenia, rekordy jedną partią. Kosz Jana
    // z treścią zostaje (widoczny w Koszu, jak f612fe09), cień Piotra jest nietknięty i działa (kosz 68 na trzech).
    it(`M11b${opis}: „Usuń pacjenta” na K dochodzi do P synchronizacją — na P po scaleniu 0 zaślepek i rekordów cienia tej karty (jedna partia), kosz z treścią i cień innej karty zostają (kosz 68 na trzech)`, async () => {
      const { u, pid, pid2, sid2 } = await dwieKarty(bezMagazynu);
      const { P, K, C } = u;
      const przed = { jan: await karta(P, pid), piotr: await karta(P, pid2) };
      przesunZegar(M); await K.removePatient(pid);
      const l = bezMagazynu ? null : licznik(P);
      przesunZegar(M); await sync(K, P);
      const zm = l ? { ...l } : null;
      expect((await P.listPatients()).some((x) => x.patientId === pid), 'karta usunięta synchronizacją').toBe(false);
      const po = { jan: await karta(P, pid), piotr: await karta(P, pid2) };
      expect(po, 'po scaleniu: cień Jana zdjęty, kosz Jana z treścią i cień Piotra zostają').toEqual({
        jan: { ...bezCienia(bezMagazynu), koszZTrescia: 1 }, piotr: przed.piotr,
      });
      if (zm) {
        expect({ partie: zm.partie, cienZapis: zm.cienZapis, cienUsun: zm.cienUsun, odczyty: zm.odczyty }, 'rekordy Jana usunięte jedną partią, bez nowych rekordów i odczytów').toEqual({ partie: 1, cienZapis: 0, cienUsun: 10, odczyty: 0 });
        expect(await wiszace(P)).toBe(0);
        expect(await sieroty(P)).toBe(0);
      }
      przesunZegar(M); await sync(C, P); await sync(K, P);
      expect(await karta(P, pid), 'kolejne scalenia nie przywracają cienia').toEqual(po.jan);
      przesunZegar(M); await doKosza(K, sid2);
      przesunZegar(M); await sync(K, P);
      await rundy([P, K, C]);
      expect(await widoki(u, sid2)).toEqual({ P: 'kosz 68', K: 'kosz 68', C: 'kosz 68' });
    }, 180_000);
  }

  // W3P-1 bez sztucznego opóźnienia: scalenie przycina wersje dwóch kart (Jan, Piotr), „Usuń pacjenta” karty przetwarzanej
  // jako pierwsza — kliknięte przy pierwszym usunięciu jej wersji. Na 1da487ce zostawało 11 rekordów usuniętej karty.
  it('M11a-2: wyścig bez haka opóźniającego — dwie karty w scaleniu, „Usuń pacjenta” karty przetwarzanej jako pierwsza: 0 rekordów usuniętej, 11 rekordów drugiej', async () => {
    sztucznyZegar();
    const { u, pid, ids, sid } = await urzadzenia(['P', 'K', 'C']);
    const { P, K, C } = u;
    let pid2 = null; const ids2 = [];
    for (let i = 0; i < 12; i += 1) { const r = await zapisz(K, piotr(110 + i, 30 + i), pid2 ? { patientId: pid2 } : {}); pid2 = r.patientId; ids2.push(r.snapshotId); }
    przesunZegar(M); await sync(K, P); await sync(K, C);
    przesunZegar(M); await poprawMase(P, sid, 58); await poprawMase(P, ids2[3], 68);
    przesunZegar(M); await sync(P, C);
    przesunZegar(M); await przytnij(C, sid); await przytnij(C, ids2[3]);
    const px = P.__px;
    let pr = null, cel = null;
    const hak = new Proxy(px, { get(c, k) {
      const f = c[k];
      if (typeof f !== 'function') return f;
      return async (...a) => {
        const r = await f.apply(c, a);
        if (k === 'removeSnapshotForUser' && !pr) {
          cel = ids.includes(a[1]) ? pid : pid2;
          pr = P.removePatient(cel).then(() => 'ok', (e) => String(e && e.message));
        }
        return r;
      };
    } });
    P.setStorageAdapter(hak); P.__px = hak;
    try { przesunZegar(M); await sync(C, P); } finally { P.setStorageAdapter(px); P.__px = px; }
    expect(await pr).toBe('ok');
    const inna = cel === pid ? pid2 : pid;
    expect({ usunieta: (await karta(P, cel)).rekordy, inna: (await karta(P, inna)).rekordy }, 'rekordy cienia: usuniętej 0, drugiej 11').toEqual({ usunieta: 0, inna: 11 });
    expect(await wiszace(P)).toBe(0);
  }, 180_000);

  // D-21 F2 (Bsl_usunPacjenta: karta zapisana po chwili usunięcia zostaje): P nie wie o usunięciu na K i zapisuje nową
  // wizytę — karta przeżywa, a jej cień zostaje (to urządzenie karty nie usunęło; po rundach karta wraca na K).
  it('M11c: P nie wie o usunięciu na K i zapisuje nową wizytę (D-21) — karta zostaje i zachowuje cień (11 rekordów), po rundach karta jest na trzech', async () => {
    const { u, pid } = await janZCieniem(false);
    const { P, K, C } = u;
    przesunZegar(M); await K.removePatient(pid);
    przesunZegar(M); await zapisz(P, jan(130, 33), { patientId: pid });
    przesunZegar(M); await sync(K, P);
    expect(await karta(P, pid), 'karta P zostaje — cień zostaje').toEqual({ zaslepki: 11, pelnyCien: 0, rekordy: 11, koszZTrescia: 0 });
    await rundy([P, K, C]);
    expect(await karta(P, pid)).toEqual({ zaslepki: 11, pelnyCien: 0, rekordy: 11, koszZTrescia: 0 });
    for (const v of [P, K, C]) expect((await v.listPatients()).some((x) => x.patientId === pid), `karta na ${v.__nazwa}`).toBe(true);
  }, 180_000);

  // D-21 F2 (przegląd poprawki P1): karta zapisana w tej karcie przeglądarki po starcie scalenia, które niesie wygrywający
  // na starcie nagrobek karty — Bsl_usunPacjenta na świeżym rekordzie zostawia kartę i do zbioru jej nie dodaje: cień zostaje.
  it('M11c-2: nowa wizyta zapisana tu w trakcie scalenia z nagrobkiem karty (Bsl_usunPacjenta F2: karta zostaje) — karta nie trafia do zbioru, cień zostaje (11)', async () => {
    const { u, pid } = await janZCieniem(false);
    const { P, K } = u;
    przesunZegar(M); await K.removePatient(pid);
    const px = P.__px;
    const st = { zapis: null };
    const hak = new Proxy(px, { get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      return async (...a) => {
        if (k === 'listTombstonesForUser' && !st.zapis) {
          st.zapis = 'w toku';
          przesunZegar(M);
          st.zapis = await P.savePatient(jan(131, 34), { dedup: false, patientId: pid }).then(() => 'ok', (e) => String(e && e.message));
        }
        return f.apply(cel, a);
      };
    } });
    P.setStorageAdapter(hak); P.__px = hak;
    try { przesunZegar(M); await sync(K, P); } finally { P.setStorageAdapter(px); P.__px = px; }
    expect(st.zapis, 'zapis w trakcie scalenia').toBe('ok');
    expect((await P.listPatients()).some((x) => x.patientId === pid), 'karta zostaje').toBe(true);
    expect(await karta(P, pid), 'cień zostaje').toEqual({ zaslepki: 11, pelnyCien: 0, rekordy: 11, koszZTrescia: 0 });
  }, 180_000);

  // „Scal pacjentów” S → T na K. Pełny ładunek K niesie nagrobek S: na P karta S znika (Bsl_usunPacjenta), wpisy S
  // zachowują jej patientId — cień S znika przy końcowym zapisie listy, jak na K (Bpu_usun źródła). K daje potem do kosza
  // swoją starą kopię czwartej wersji (23; dziś pod T) — kosz 23 na trzech, jak f612fe09. To koszt każdego „Scal
  // pacjentów” na innym urządzeniu, gdy źródło ma cień (W5P-2), a nie krawędzi D-21: wynik ten sam bez powrotu źródła
  // i z powrotem (C, który o scaleniu nie wie, zapisuje nową wizytę S — S wraca). Na 1da487ce cień S na P dawał 58.
  for (const wraca of [false, true]) {
    it(`M11d${wraca ? ' (źródło wraca z nowej wizyty C)' : ''}: „Scal pacjentów” na K — na P źródło bez cienia; stara kopia K do kosza — kosz 23 na trzech, jak f612fe09 (koszt „Scal pacjentów”, niezależnie od powrotu źródła)`, async () => {
      const { u, pid: S, sid } = await janZCieniem(false);
      const { P, K, C } = u;
      const T = (await zapisz(K, jan(140, 40))).patientId;
      przesunZegar(M); await sync(K, P); await sync(K, C);
      przesunZegar(M); await K.mergePatients(S, T);
      przesunZegar(M); await sync(K, P);
      expect((await P.listPatients()).some((x) => x.patientId === S), 'karta S usunięta synchronizacją').toBe(false);
      expect(await karta(P, S), 'P: źródło bez cienia').toEqual(bezCienia(false));
      expect(await wiszace(P)).toBe(0);
      if (wraca) {
        przesunZegar(M); await zapisz(C, jan(150, 45), { patientId: S });
        przesunZegar(M); await sync(C, P);
        expect((await P.listPatients()).some((x) => x.patientId === S), 'S wraca (D-21)').toBe(true);
        expect((await karta(P, S)).rekordy, 'w tej sesji bez cienia').toBe(0);
      }
      przesunZegar(M); await doKosza(K, sid);
      przesunZegar(M); await sync(K, P);
      await rundy([P, K, C]);
      expect(await widoki(u, sid)).toEqual({ P: 'kosz 23', K: 'kosz 23', C: 'kosz 23' });
    }, 180_000);
  }

  // Delta karty docelowej przychodzi przed deltą nagrobka źródła (buildPatientDelta T, bez nagrobków): faza przeniesień
  // przenosi ostatnią wersję S pod T i usuwa pustą kartę S bez nagrobka (Bsw_poOddaniu) — cień S znika w tym scaleniu.
  it('M11e: „Scal pacjentów” na K, na P najpierw sama delta karty docelowej — pusta karta źródła znika w fazie przeniesień, jej cień też', async () => {
    const { u, pid: S } = await janZCieniem(false);
    const { P, K, C } = u;
    const T = (await zapisz(K, jan(140, 40))).patientId;
    przesunZegar(M); await sync(K, P); await sync(K, C);
    przesunZegar(M); await K.mergePatients(S, T);
    const d = await K.buildPatientDelta(T);
    const lad = JSON.parse(JSON.stringify(await K.decryptPayloadForCurrentUser(d.iv, d.data)));
    expect(lad.tombstones || [], 'delta bez nagrobków kart').toEqual([]);
    przesunZegar(M); await P.mergeSyncPayload(lad);
    expect((await P.listPatients()).some((x) => x.patientId === S), 'pusta karta S zniknęła w fazie przeniesień').toBe(false);
    expect(await karta(P, S), 'P: źródło bez cienia').toEqual(bezCienia(false));
    expect(await wiszace(P)).toBe(0);
    await rundy([P, K, C], 1);
    expect(await karta(P, S)).toEqual(bezCienia(false));
  }, 180_000);

  // Źródło „Scal pacjentów” z innego urządzenia, które tu zostaje (P zapisał nową wizytę S po scaleniu na K, przed
  // synchronizacją — D-21): faza przenosi pod T wersję wspólną, S ma dalej wersję spoza scalenia, nie znika i nie trafia
  // do zbioru — cień S zostaje, tak jak karta zachowana na urządzeniu, które o usunięciu nie wie (M11c).
  it('M11e-2: źródło „Scal pacjentów” z K, które tu zostaje (nowa wizyta P po scaleniu, D-21) — nie trafia do zbioru, cień zostaje (11)', async () => {
    const { u, pid: S } = await janZCieniem(false);
    const { P, K, C } = u;
    const T = (await zapisz(K, jan(140, 40))).patientId;
    przesunZegar(M); await sync(K, P); await sync(K, C);
    przesunZegar(M); await K.mergePatients(S, T);
    przesunZegar(M); await zapisz(P, jan(150, 45), { patientId: S });
    przesunZegar(M); await sync(K, P);
    const wS = (await P.getPatient(S)).snapshots.length;
    expect(wS, 'S zostaje z nową wizytą (wersja wspólna przeszła pod T)').toBe(1);
    expect(await karta(P, S), 'cień S zostaje').toEqual({ zaslepki: 11, pelnyCien: 0, rekordy: 11, koszZTrescia: 0 });
  }, 180_000);

  // Zbiór żyje w pamięci dokumentu: blokada i wylogowanie go czyszczą (Bpc_wyczysc), przeładowanie strony też. Karta
  // usunięta tu, potem przywrócona nową wizytą z K (D-21): w tej sesji scalenie odtwarzające cień (treść wersji z ładunku pokonanych przez nagrobki przycięcia) go nie
  // zapisuje; po blokadzie i ponownym logowaniu karty w zbiorze nie ma (nagrobek przegrał, Bsl_usunPacjenta jej nie dodaje),
  // więc cień wraca. Mutant bez czyszczenia przy blokadzie — 0 także po ponownym logowaniu.
  it('M11f: zbiór kart usuniętych żyje w sesji — karta usunięta tu i przywrócona nową wizytą K (D-21): w tej sesji bez cienia, po blokadzie i ponownym logowaniu cień wraca (11)', async () => {
    const { u, pid } = await janZCieniem(false);
    const { P, K } = u;
    przesunZegar(M); await P.removePatient(pid);
    przesunZegar(M); await zapisz(K, jan(130, 33), { patientId: pid });
    przesunZegar(M); await sync(K, P);
    expect((await P.listPatients()).some((x) => x.patientId === pid), 'karta wraca (D-21)').toBe(true);
    expect((await karta(P, pid)).rekordy, 'w tej sesji bez cienia').toBe(0);
    P.lock('manual');
    await P.unlockUser(P.__uid, P.__haslo);
    przesunZegar(M); await sync(K, P);
    expect(await karta(P, pid), 'nowa sesja: cień karty, która wróciła').toEqual({ zaslepki: 11, pelnyCien: 0, rekordy: 11, koszZTrescia: 0 });
    expect(await wiszace(P)).toBe(0);
  }, 180_000);

  // W5P-3 przeglądu: cień kart ze zbioru zdejmowany także z WYNIKU złączenia (Bkz_zmienListe po Bkz_czysc, przed
  // Bpc_odloz). Bpc_bezKarty na źródłach pomija ważny kosz, a złączenie może go unieważnić: C, które o koszu P nie wie,
  // zmienia tę wersję po koszu i ją przycina (z > k) — treść kosza P przechodzi do wyniku jako cień karty usuniętej. Na
  // e107e186 po scaleniu C: 1 zaślepka i 1 rekord tej karty (do najbliższej zmiany listy), a ponowne scalenie tego samego
  // ładunku zapisywało listę (L3). Zdejmowanie ze źródeł (Bpc_f) zostaje: decyduje, która treść wygrywa (koszt decyzji 1).
  for (const bezMagazynu of [false, true]) {
    it(`M11h${bezMagazynu ? ' (adapter bez metod magazynu — cień w liście)' : ''}: ważny kosz karty usuniętej tutaj, który scalenie unieważnia (C zmienia i przycina tę wersję) — po scaleniu 0 zaślepek i rekordów tej karty, ponowne scalenie tego ładunku: 0 zapisów listy`, async () => {
      zegarRano();
      const { u, pid, sid } = await urzadzenia(['P', 'K', 'C']);
      const { P, C } = u;
      if (bezMagazynu) bezMetod(P);
      przesunZegar(M); await doKosza(P, sid);
      przesunZegar(M); await poprawMase(C, sid, 58);
      przesunZegar(M); await przytnij(C, sid);
      przesunZegar(M); await P.removePatient(pid);
      expect(await karta(P, pid), 'przed scaleniem: ważny kosz z treścią, bez cienia').toEqual({ ...bezCienia(bezMagazynu), koszZTrescia: 1 });
      const lad = JSON.parse(JSON.stringify(await C.exportSyncPayload()));
      przesunZegar(M); await P.mergeSyncPayload(JSON.parse(JSON.stringify(lad)));
      expect(await karta(P, pid), 'po scaleniu C: kosz unieważniony, bez cienia karty usuniętej').toEqual(bezCienia(bezMagazynu));
      if (!bezMagazynu) { expect(await wiszace(P)).toBe(0); expect(await sieroty(P)).toBe(0); }
      const l = licznik(P);
      przesunZegar(M); await P.mergeSyncPayload(JSON.parse(JSON.stringify(lad)));
      expect(l.lista, 'L3: ponowne scalenie tego samego ładunku — 0 zapisów listy').toBe(0);
      expect(await karta(P, pid)).toEqual(bezCienia(bezMagazynu));
    }, 180_000);
  }
});

describe('P-CIEN-POZA-LISTA: koszt (deterministycznie, treść ok. 18 KB)', () => {
  it('K: 3 karty × 12 wersji, K przycina 33, C scala — rekord metadanych C bez pełnych szyfrów cienia; scalenie bez zmian: 0 zapisów rekordów; kosz: 0 zapisów rekordów', async () => {
    zegarRano();
    const tresc = (p, i) => ({
      name: `Testowy Jan ${p}`,
      user: { lastName: `Testowy${p}`, firstName: 'Jan', dobISO: '2016-03-12', sex: 'M', height: 100 + i, weight: 20 + i / 10 },
      advanced: { data: { measurements: Array.from({ length: 90 }, (_, k) => ({
        uid: `m-${p}-${k}-0000-0000-000000000000`, ageMonths: 12 + k * 2, ageYears: (12 + k * 2) / 12, height: 70 + k, weight: 9 + k / 3,
        dateISO: `20${17 + Math.floor(k / 12)}-0${1 + (k % 9)}-1${k % 10}`, boneAgeYears: k % 5 ? null : 3 + k / 12, note: 'pomiar kontrolny w poradni',
      })) } },
    });
    const K = await urzadzenie('K'), C = await urzadzenie('C');
    const pids = [];
    for (let p = 0; p < 3; p += 1) {
      let pid = null;
      for (let i = 0; i < 12; i += 1) { przesunZegar(M); const r = await K.savePatient(tresc(p, i), { dedup: false, ...(pid ? { patientId: pid } : {}) }); pid = r.patientId; }
      pids.push(pid);
    }
    przesunZegar(M); await sync(K, C);
    for (const pid of pids) { przesunZegar(M); await K.pruneSnapshotsForPatient(pid, { recentHours: 0 }); }
    const meta = { n: 0, b: 0, ostatni: null };
    const l = licznik(C);
    const px = C.__px;
    const mierz = new Proxy(px, { get(cel, k) {
      const f = cel[k];
      if (k === 'putUserMeta') return async (uid, m) => { meta.n += 1; meta.b += B(m); meta.ostatni = m; return f.call(cel, uid, m); };
      return typeof f === 'function' ? f.bind(cel) : f;
    } });
    C.setStorageAdapter(mierz); C.__px = mierz;
    przesunZegar(M); await sync(K, C);
    const klucze = await C.__px.listSnapshotShadowKeysForUser(C.__uid);
    expect(klucze.length, '33 cienie na C').toBe(33);
    expect({ partie: l.partie, cienZapis: l.cienZapis }, 'rekordy cienia zapisane raz, jedną partią').toEqual({ partie: 1, cienZapis: 33 });
    let cienB = 0;
    const m1 = JSON.stringify(await C.__px.getUserMeta(C.__uid));
    for (const k of klucze) {
      const r = await C.__px.getSnapshotShadowForUser(C.__uid, k);
      cienB += B(r);
      expect(m1.includes(r.c.data), 'rekord metadanych bez pełnego szyfru cienia').toBe(false);
    }
    expect(cienB, 'magazyn: 33 rekordy po ponad 20 KB').toBeGreaterThan(33 * 20_000);
    expect(m1.length, 'rekord metadanych: same zaślepki (≈1–2 KB na wpis)').toBeLessThan(33 * 2_500);
    // Scalenie bez zmian: zapis metadanych (chwila ostatniego scalenia) bez listy z cieniem, 0 rekordów cienia.
    Object.assign(l, { lista: 0, partie: 0, cienZapis: 0, cienUsun: 0, odczyty: 0, klucze: 0 }); Object.assign(meta, { n: 0, b: 0 });
    przesunZegar(M); await sync(K, C);
    expect({ lista: l.lista, partie: l.partie, odczyty: l.odczyty }, 'scalenie bez zmian: 0 zapisów listy i magazynu').toEqual({ lista: 0, partie: 0, odczyty: 0 });
    expect(meta.b, 'zapisane metadane bez cienia').toBeLessThan(33 * 2_500 + 20_000);
    // Usunięcie do kosza wersji z karty: jeden zapis listy, 0 rekordów cienia.
    Object.assign(l, { lista: 0, partie: 0, cienZapis: 0, cienUsun: 0, odczyty: 0, klucze: 0 }); Object.assign(meta, { n: 0, b: 0 });
    przesunZegar(M); const nowa = await C.savePatient(tresc(0, 99), { dedup: false, patientId: pids[0] });
    Object.assign(l, { lista: 0, partie: 0, cienZapis: 0, cienUsun: 0, odczyty: 0, klucze: 0 }); Object.assign(meta, { n: 0, b: 0 });
    przesunZegar(M); await C.moveSnapshotToTrash(pids[0], nowa.snapshotId, { odepnij: true });
    expect({ lista: l.lista, partie: l.partie }).toEqual({ lista: 1, partie: 0 });
    expect(meta.b, 'kosz: metadane z jedną treścią kosza, bez cienia').toBeLessThan(33 * 2_500 + 60_000);
    console.info('[koszt cienia K]', JSON.stringify({ cienie: klucze.length, magazynB: cienB, metaB: m1.length, metaKoszB: meta.b }));
  }, 300_000);
});

// P-KOSZ-POLKRATA (S4 krok 1): regresje wad znalezionych przez panel sędziów w prototypie półkraty (2026-10-21).
// Prawdziwy vilda_vault.js, sejfy w pamięci, sztuczny zegar, dane wyłącznie fikcyjne („Testowy Jan”). Uprząż:
// polkrata-uprzaz.mjs; starsza aplikacja (cofnięcie wydania) — tests/fixtures/vilda_vault-221.js.txt (D11 = a).
//   W-M1a–d (K1, D10 = a) — cofnięcie wydania albo stara karta przeglądarki na tym samym magazynie: starszy kod zmienia
//            pola wpisu kosza przez Object.assign i przenosi lokalne Bpk bez zmian; po powrocie nowy kod nie może
//            cofnąć tych zmian (R3a „rev nie spada”, R1 i P-KOSZ-NOWSZA-TRESC — w koszu najnowsza treść). Sędzia
//            cofał do 222 (1d6be72e) i 221; tu do 221 — ten sam mechanizm (kod bez Bpk), jedna kopia starszego sejfu.
//   F-1, W-D1 (K3) — ten sam eksportowany nagrobek na każdym urządzeniu po rundach (pole revPary), 0 zapisów listy.
//   W-D3, G2b, G2c — stempel zmiany po przycięciu, które wersja przypięta przeżyła (Bpk_retencjaZapisu): odpięcie
//            po przycięciu z zegara do przodu nie usuwa wizyty; późniejsza poprawka z innego urządzenia nie przepada,
//            a świadome odpięcie wygrywa z jego starą kopią z gwiazdką (S4 krok 2, W3 — w kroku 1 G2c zależało od losu).
//   W-D6   — treść kosza nie zależy od kolejności scaleń (gwiazdka w treści kosza).
//   W-D7   — ponowne scalenie tego samego ładunku: stan bez zmian i 0 zapisów listy nagrobków (D6, prawo L3).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sztucznyZegar, przesunZegar, zegar, urzadzenie, urzadzenia, aktualizuj, sync, rundy, stan, widoki, eksportNagrobka,
  poprawMase, przypnij, doKosza, przytnij, zapisz, jan, zeruj, zapisy, DZIEN,
} from './polkrata-uprzaz.mjs';

const M = 60e3;
afterEach(() => { vi.useRealTimers(); });
const opis = (n) => n && { rodzaj: n.rodzaj, masa: n.masa, rev: n.rev, zm: n.zm };

// --- W-M1: cofnięcie wydania i powrót ---------------------------------------------------------------------------------
async function cofniecie(wariant, zK) {
  sztucznyZegar();
  const { u, sid } = await urzadzenia(['P', 'K', 'C']);
  zegar.baza = zegar.t;
  if (wariant === 'a') {
    przesunZegar(M); await poprawMase(u.K, sid, 77);
    przesunZegar(M); await poprawMase(u.K, sid, 78);
  } else {
    przesunZegar(M); await poprawMase(u.K, sid, 57);
    przesunZegar(M); await poprawMase(u.K, sid, 58);
    przesunZegar(M); await poprawMase(u.P, sid, 74);
  }
  przesunZegar(M); await doKosza(u.P, sid);
  u.P = await aktualizuj(u.P, 'S221'); // cofnięcie wydania na P
  przesunZegar(M); await sync(u.K, u.P);
  const naStarym = (await stan(u.P, sid)).nagrobek;
  u.P = await aktualizuj(u.P, 'N'); // ponowna aktualizacja na tym samym magazynie
  przesunZegar(M); await sync(u.C, u.P);
  przesunZegar(M); await sync(u.P, u.C);
  const lista = zK ? [u.P, u.K, u.C] : [u.P, u.C];
  await rundy(lista, 3);
  const koniec = {};
  for (const v of lista) koniec[v.__nazwa] = (await stan(v, sid)).nagrobek;
  return { naStarym, koniec };
}
// W-M1c/d: czwarte urządzenie (D ze starą treścią w karcie albo E z wcześniejszą poprawką 80 kg); K po scaleniu z P już
// się nie synchronizuje.
async function cofniecieCzwarte(czwarte, cofnij) {
  sztucznyZegar();
  const { u, sid } = await urzadzenia(['P', 'K', 'C', czwarte]);
  zegar.baza = zegar.t;
  przesunZegar(M); await poprawMase(u.K, sid, 77);
  if (czwarte === 'E') { przesunZegar(M); await poprawMase(u.E, sid, 80); }
  przesunZegar(M); await poprawMase(u.K, sid, 78);
  przesunZegar(M); await doKosza(u.P, sid);
  if (cofnij) u.P = await aktualizuj(u.P, 'S221');
  przesunZegar(M); await sync(u.K, u.P);
  const naStarym = (await stan(u.P, sid)).nagrobek;
  if (cofnij) u.P = await aktualizuj(u.P, 'N');
  przesunZegar(M); await sync(u.C, u.P);
  przesunZegar(M); await sync(u.P, u.C);
  przesunZegar(M);
  await rundy([u.P, u.C, u[czwarte]], 3);
  const koniec = {};
  for (const v of [u.P, u.C, u[czwarte]]) {
    const s = await stan(v, sid);
    koniec[v.__nazwa] = { karta: s.karta && s.karta.masa, kosz: s.kosz && s.kosz.masa, rev: s.nagrobek && s.nagrobek.rev, zm: s.nagrobek && s.nagrobek.zm };
  }
  return { naStarym, koniec };
}

describe('W-M1 (K1): cofnięcie wydania do 221 i powrót — nowy kod nie cofa zmian wpisu zrobionych przez starszy kod', () => {
  it('W-M1a: K 77, 78 (rev 2, t+2), P kosz (t+3); P na 221 scala K — po powrocie kosz 78 kg z rev 2 i chwilą zmiany t+2', async () => {
    const r = await cofniecie('a', false);
    expect(opis(r.naStarym)).toEqual({ rodzaj: 'kosz', masa: 78, rev: 2, zm: 't+2' });
    for (const [n, s] of Object.entries(r.koniec)) expect(opis(s), n).toEqual(opis(r.naStarym));
  }, 120_000);
  it('W-M1b: K 57, 58 (rev 2, t+2), P 74 (rev 1, t+3), P kosz; P na 221 — po rundach z K kosz 58 kg z opisem swojej wersji', async () => {
    const r = await cofniecie('b', true);
    expect(opis(r.naStarym)).toEqual({ rodzaj: 'kosz', masa: 58, rev: 2, zm: 't+2' });
    for (const [n, s] of Object.entries(r.koniec)) expect(opis(s), n).toEqual(opis(r.naStarym));
  }, 120_000);
  for (const cofnij of [true, false]) {
    it(`W-M1c${cofnij ? '' : ' (kontrola bez cofnięcia)'}: czwarte urządzenie z pierwotną treścią — kosz 78 kg (rev 2, zm t+2) na P, C i D`, async () => {
      const r = await cofniecieCzwarte('D', cofnij);
      expect(r.naStarym && r.naStarym.masa).toBe(78);
      for (const [n, s] of Object.entries(r.koniec)) expect(s, n).toEqual({ karta: null, kosz: 78, rev: 2, zm: 't+2' });
    }, 120_000);
    it(`W-M1d${cofnij ? '' : ' (kontrola bez cofnięcia)'}: wcześniejsza poprawka 80 kg z E nie wypiera z kosza późniejszej 78 kg`, async () => {
      const r = await cofniecieCzwarte('E', cofnij);
      for (const [n, s] of Object.entries(r.koniec)) expect(s, n).toEqual({ karta: null, kosz: 78, rev: 2, zm: 't+3' });
    }, 120_000);
  }
});

// --- F-1, W-D1: ten sam eksportowany nagrobek ---------------------------------------------------------------------
describe('F-1 i W-D1 (K3): po rundach ten sam eksportowany nagrobek na każdym urządzeniu', () => {
  for (const kolejnosc of ['C-potem-P', 'P-potem-C']) {
    it(`kosz P, retencja C (bez wiedzy), K scala ${kolejnosc} — eksport identyczny na P, K i C, 0 zapisów listy w rundzie kontrolnej`, async () => {
      sztucznyZegar();
      const { u, lista, sid } = await urzadzenia(['P', 'K', 'C']);
      zegar.baza = zegar.t;
      przesunZegar(M); await doKosza(u.P, sid);
      przesunZegar(M); await przytnij(u.C, sid);
      przesunZegar(M);
      if (kolejnosc === 'C-potem-P') { await sync(u.C, u.K); przesunZegar(M); await sync(u.P, u.K); } else { await sync(u.P, u.K); przesunZegar(M); await sync(u.C, u.K); }
      await rundy(lista, 3);
      zeruj(lista);
      await rundy(lista, 1);
      expect(Object.values(zapisy(lista)).map((z) => z.lista)).toEqual([0, 0, 0]);
      const e = { P: await eksportNagrobka(u.P, sid), K: await eksportNagrobka(u.K, sid), C: await eksportNagrobka(u.C, sid) };
      expect(e.P && e.P.tresc, 'kosz z treścią').toEqual({ masa: 23, pin: false });
      expect(e.K, 'K wobec P').toEqual(e.P);
      expect(e.C, 'C wobec P').toEqual(e.P);
    }, 120_000);
  }
});

// --- W-D3, G2b, G2c: stempel po przycięciu przeżytym przez przypiętą ----------------------------------------------
async function trzyPelne() {
  const u = { P: await urzadzenie('P'), K: await urzadzenie('K'), C: await urzadzenie('C') };
  const lista = [u.P, u.K, u.C];
  for (const a of lista) for (const b of lista) if (a !== b) await sync(a, b);
  return { u, lista };
}
async function karta12(u, autor = 'K') {
  let pid = null; const ids = [];
  for (let i = 0; i < 12; i += 1) {
    const r = await zapisz(u[autor], jan(100 + i, 20 + i), pid ? { patientId: pid } : {});
    pid = r.patientId; ids.push(r.snapshotId);
  }
  for (const n of Object.keys(u)) if (n !== autor) await sync(u[autor], u[n]);
  return { pid, sid: ids[3] };
}
describe('stempel zmiany po przycięciu, które przypięta wersja przeżyła (A3a, Bpk_retencjaZapisu)', () => {
  it('W-D3: P przypina; C (zegar +2 h) przycina; po rundach P odpina — wizyta zostaje w karcie bez gwiazdki na P, K, C', async () => {
    sztucznyZegar();
    const { u, lista, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await przypnij(u.P, sid, true);
    przesunZegar(M);
    przesunZegar(120 * M); await przytnij(u.C, sid); przesunZegar(-120 * M);
    przesunZegar(M); await sync(u.C, u.P);
    await rundy(lista, 2);
    expect(await widoki(u, sid)).toEqual({ P: 'karta 23*', K: 'karta 23*', C: 'karta 23*' });
    przesunZegar(10 * M); await przypnij(u.P, sid, false); // realnie po przycięciu C, ale przed chwilą z jego zegara
    await rundy(lista, 3);
    expect(await widoki(u, sid)).toEqual({ P: 'karta 23', K: 'karta 23', C: 'karta 23' });
  }, 120_000);
  for (const skos of [0, 2, 10, 60]) for (const gdzie of ['P', 'C']) {
    it(`G2b: K przycina z zegarem +${skos} min, odpięcie na ${gdzie} — wizyta zostaje w karcie bez gwiazdki`, async () => {
      sztucznyZegar();
      const { u, lista } = await trzyPelne();
      przesunZegar(15 * DZIEN);
      const { sid } = await karta12(u);
      przesunZegar(M); zegar.baza = zegar.t;
      await przypnij(u.P, sid, true); await sync(u.P, u.C);
      przesunZegar(M);
      przesunZegar(skos * M); await przytnij(u.K, sid); przesunZegar(-skos * M);
      przesunZegar(M);
      await rundy(lista, 3);
      expect(await widoki(u, sid)).toEqual({ P: 'karta 23*', K: 'karta 23*', C: 'karta 23*' });
      przesunZegar(M);
      await przypnij(u[gdzie], sid, false);
      await rundy(lista, 3);
      expect(await widoki(u, sid)).toEqual({ P: 'karta 23', K: 'karta 23', C: 'karta 23' });
    }, 120_000);
  }
  // G2c: K przycina z zegarem do przodu, P odpina (stempel po tym przycięciu), a C — z przypiętą kopią, bez wiedzy
  // o odpięciu — realnie później poprawia masę na 74. Obie zmiany dostają stempel po przycięciu „z przyszłości”
  // (Bpp_chwilaZmiany: chwila przycięcia + 1 ms + losowo 0–999 ms, bo nagrobek retencji zostaje przy przypiętej, A3a).
  // W kroku 1 (LWW całej wersji) o wyniku decydowała losowa część stempla: poprawka C przepadała w ok. połowie przebiegów
  // (znane ograniczenie, it.fails). W3 (S4 krok 2, D1 = C): odpięcie P zmienia tylko rejestr gwiazdki, poprawka C — tylko
  // treść, więc oba składniki zostają niezależnie od kolejności stempli: karta 74 bez gwiazdki (świadome odpięcie wygrywa
  // ze starą kopią z gwiazdką, D2 = a; poprawka C nie przepada). Los sterowany deterministycznie (Math.random).
  async function g2c(skos, losP, losC) {
    sztucznyZegar();
    const { u, lista } = await trzyPelne();
    przesunZegar(15 * DZIEN);
    const { sid } = await karta12(u);
    przesunZegar(M); zegar.baza = zegar.t;
    await przypnij(u.P, sid, true);
    przesunZegar(M);
    przesunZegar(skos * M); await przytnij(u.K, sid); przesunZegar(-skos * M);
    przesunZegar(M);
    await rundy(lista, 3);
    przesunZegar(M);
    const los = vi.spyOn(Math, 'random');
    try {
      los.mockReturnValue(losP);
      await przypnij(u.P, sid, false);
      przesunZegar(6 * M);
      los.mockReturnValue(losC);
      await poprawMase(u.C, sid, 74); // C nie zna odpięcia
    } finally { los.mockRestore(); }
    await rundy(lista, 3);
    const w = await widoki(u, sid);
    zeruj(lista);
    await rundy(lista, 1);
    return { w, zapisy: Object.values(zapisy(lista)).map((z) => z.lista + z.wersje + z.karty) };
  }
  for (const skos of [10, 60]) {
    for (const [losP, losC] of [[0.1, 0.9], [0.9, 0.1]]) {
      const opisLosu = losC > losP ? 'stempel C późniejszy' : 'stempel C wcześniejszy';
      it(`G2c: K przycina z zegarem +${skos} min, P odpina, C (z przypiętą kopią) później poprawia na 74 — ${opisLosu}: karta 74 bez gwiazdki na P, K, C, 0 zapisów w rundzie kontrolnej`, async () => {
        const r = await g2c(skos, losP, losC);
        expect(r.w).toEqual({ P: 'karta 74', K: 'karta 74', C: 'karta 74' });
        expect(r.zapisy).toEqual([0, 0, 0]);
      }, 120_000);
    }
  }
});

// --- D4: cień treści --------------------------------------------------------------------------------------------
// Decyzja właściciela D4 = a: treść kosza unieważnionego (i wersji pokonanej przycięciem w scalaniu) zostaje lokalnie
// — zaszyfrowana, niewidoczna w koszu, najwyżej 30 dni od usunięcia, które ją zabrało, nigdy w ładunku synchronizacji.
describe('D4: cień treści — lokalnie, zaszyfrowany, niewidoczny, ≤ 30 dni, nie wysyłany', () => {
  const POLA_NAGROBKA = ['patientId', 'snapshotId', 'deletedAtISO', 'savedAtISO', 'rev', 'updatedAtISO', 'seq', 'powod',
    'przycietoISO', 'zmianaISO', 'koszISO', 'revPary', 'payload'];
  it('X5 na P: P 77, 78, kosz P; C (bez wiedzy) 74 i przycina; P←C — cień 78 tylko lokalnie; po 31 dniach kosz K bierze własną treść', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await poprawMase(u.P, sid, 77);
    przesunZegar(M); await poprawMase(u.P, sid, 78);
    przesunZegar(M); await doKosza(u.P, sid);
    przesunZegar(M); await poprawMase(u.C, sid, 74);
    przesunZegar(M); await przytnij(u.C, sid);
    przesunZegar(M); await sync(u.C, u.P);
    const meta = await u.P.__px.getUserMeta(u.P.__uid);
    const wpis = meta.snapshotTombstones.find((e) => e.snapshotId === sid);
    expect(wpis.powod, 'kosz unieważniony zmianą C — sam nagrobek retencji').toBe('retencja');
    expect(wpis.payloadCipher, 'wpis bez szyfru treści — kosz go nie pokazuje').toBeUndefined();
    expect(wpis.Bpk && wpis.Bpk.t && typeof wpis.Bpk.t.c, 'cień: szyfr w stanie lokalnym').toBe('object');
    // P-CIEN-POZA-LISTA (wariant V, decyzja 2026-10-26): w liście zaślepka { iv, cien }, szyfr w osobnym rekordzie
    // magazynu cienia (tests/unit/polkrata-cien.test.mjs).
    expect(Object.keys(wpis.Bpk.t.c).sort(), 'cień: zaślepka w liście').toEqual(['cien', 'iv']);
    const rek = await u.P.__px.getSnapshotShadowForUser(u.P.__uid, wpis.Bpk.t.c.iv);
    expect(rek && Object.keys(rek.c).sort(), 'cień zaszyfrowany kluczem sejfu (magazyn cienia)').toEqual(['data', 'iv']);
    expect(JSON.stringify(rek), 'bez jawnej treści w magazynie cienia').not.toMatch(/"weight"|Testowy/);
    expect(JSON.stringify(meta.snapshotTombstones), 'bez jawnej treści w liście').not.toMatch(/"weight"|Testowy/);
    expect(await u.P.listTrashedSnapshots(), 'kosz pusty').toEqual([]);
    const l = await u.P.exportSyncPayload();
    for (const e of l.snapshotTombstones) {
      expect(Object.keys(e).filter((k) => !POLA_NAGROBKA.includes(k)), 'w ładunku tylko pola nagrobka (bez Bpk i szyfrów)').toEqual([]);
      if (e.powod === 'retencja') expect(e.payload, 'nagrobek retencji bez treści (F5)').toBeUndefined();
    }
    przesunZegar(31 * DZIEN);
    await doKosza(u.K, sid); // K nic nie wie: kosz z treścią 23 kg, później niż każda znana zmiana
    przesunZegar(M); await sync(u.K, u.P);
    const k = (await u.P.listTrashedSnapshots()).find((e) => e.snapshotId === sid);
    expect(k && k.payload.user.weight, 'cień wygasł (30 dni) — w koszu treść K').toBe(23);
    const po = (await u.P.__px.getUserMeta(u.P.__uid)).snapshotTombstones.find((e) => e.snapshotId === sid);
    expect(po.Bpk.t && po.Bpk.t.o && po.Bpk.t.o.rev, 'cień 78 (rev 2) nie zostaje w stanie lokalnym').not.toBe(2);
  }, 120_000);
  it('kontrola przed upływem 30 dni: późniejszy ważny kosz K bierze treść z cienia (78 kg)', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await poprawMase(u.P, sid, 77);
    przesunZegar(M); await poprawMase(u.P, sid, 78);
    przesunZegar(M); await doKosza(u.P, sid);
    przesunZegar(M); await poprawMase(u.C, sid, 74);
    przesunZegar(M); await przytnij(u.C, sid);
    przesunZegar(M); await sync(u.C, u.P);
    przesunZegar(29 * DZIEN);
    await doKosza(u.K, sid);
    przesunZegar(M); await sync(u.K, u.P);
    const k = (await u.P.listTrashedSnapshots()).find((e) => e.snapshotId === sid);
    expect(k && k.payload.user.weight).toBe(78);
  }, 120_000);
});

// --- W-D6, W-D7 ---------------------------------------------------------------------------------------------------
describe('treść kosza i ponowne scalenie', () => {
  for (const kol of ['K-potem-P', 'P-potem-K']) {
    it(`W-D6 (${kol}): C przypina; K (bez wiedzy) poprawia na 74 i sam przycina; P (bez wiedzy) daje do kosza — kosz C 23* w każdej kolejności`, async () => {
      sztucznyZegar();
      const { u, lista, sid } = await urzadzenia(['P', 'K', 'C']);
      przesunZegar(M); await przypnij(u.C, sid, true);
      przesunZegar(M); await poprawMase(u.K, sid, 74);
      przesunZegar(M); await przytnij(u.K, sid);
      przesunZegar(M); await doKosza(u.P, sid);
      przesunZegar(M);
      if (kol === 'K-potem-P') { await sync(u.K, u.C); await sync(u.P, u.C); } else { await sync(u.P, u.C); await sync(u.K, u.C); }
      expect((await widoki(u, sid, ['C'])).C).toBe('kosz 23*');
      await rundy(lista, 3);
      expect(await widoki(u, sid)).toEqual({ P: 'kosz 23*', K: 'kosz 23*', C: 'kosz 23*' });
    }, 120_000);
  }
  it('W-D7: P poprawia na 99, K daje do kosza, C przycina; P scala C, potem dwa razy ten sam ładunek K — stan bez zmian, 0 zapisów listy', async () => {
    sztucznyZegar();
    const { u, sid } = await urzadzenia(['P', 'K', 'C']);
    przesunZegar(M); await poprawMase(u.P, sid, 99);
    przesunZegar(M); await doKosza(u.K, sid);
    przesunZegar(M); await przytnij(u.C, sid);
    przesunZegar(M); await sync(u.C, u.P);
    const lK = JSON.stringify(await u.K.exportSyncPayload());
    przesunZegar(M); await u.P.mergeSyncPayload(JSON.parse(lK));
    const raz = await stan(u.P, sid);
    zeruj([u.P]);
    przesunZegar(M); await u.P.mergeSyncPayload(JSON.parse(lK));
    expect(await stan(u.P, sid)).toEqual(raz);
    expect(raz.kosz && raz.kosz.masa, 'kosz z poprawką P (cień)').toBe(99);
    expect(u.P.__licz.lista, 'zapisy listy przy ponownym scaleniu').toBe(0);
    // Ponowne scalenie własnego eksportu (pobranie bloba konta, który to urządzenie samo wysłało).
    const wlasny = JSON.stringify(await u.P.exportSyncPayload());
    przesunZegar(M); await u.P.mergeSyncPayload(JSON.parse(wlasny));
    expect(u.P.__licz.lista, 'zapisy listy przy scaleniu własnego eksportu').toBe(0);
    expect(await stan(u.P, sid)).toEqual(raz);
  }, 120_000);
});

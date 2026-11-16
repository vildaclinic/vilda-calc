// Starsza aplikacja w uprzęży testów (E3-PR0b, P-ZBIEZNOSC-ZDARZEN): fikstury sejfu 221, sejfu 276 i retencji v1, ich
// skróty, ładowanie w oknie urządzenia (opcja zrodla — tests/support/urzadzenie-sync.mjs, okno() w
// tests/unit/sesja-zapisu-uprzaz.mjs) i próg delty karty sejfu 221. Strażniki: tests/unit/starsza-aplikacja-fikstury.test.mjs.
// Dane w testach wyłącznie fikcyjne.
//
// FIKSTURY (bajt w bajt, tylko do odczytu; rozszerzenie .txt — nie są skryptami aplikacji):
//   tests/fixtures/vilda_vault-221.js.txt — vilda_vault.js z 54a84da3 (wersja z 21 października: bez dziennika zdarzeń,
//       bez linii „Wersja aplikacji” w Ustawieniach).
//   tests/fixtures/vilda_vault-276.js.txt — vilda_vault.js z 743dba9a (#957, ostatni commit przed #958: ?v=276,
//       SW 1.1.534; ten sam plik od #941, SW 1.1.520). Zdarzenia wysyła od #951 (SW 1.1.530); przy włączonym dzienniku
//       nie wysyła /delta.
//   tests/fixtures/vilda_retention-v1.js.txt — vilda_retention.js z 743dba9a (?v=1), ten sam co w 54a84da3: retencja
//       każdej wersji starszej niż SW 1.1.535 (#958 wprowadził ?v=2). Jedna fikstura dla 221 i 276.
//   vilda_crypto.js, vilda_sync.js i vilda_sync_integration.js z 743dba9a są bajt w bajt równe bieżącym, więc wierność
//   276 zapewniają same fikstury sejfu i retencji.
// SKRÓTY: sha256 treści po zamianie \r\n → \n — kopia z autocrlf daje ten sam skrót (dziś 0 znaków CR w każdej
//   fiksturze, więc skrót równa się skrótowi pliku). Kopie repozytorium w CI są płytkie, więc pochodzenia nie da się
//   sprawdzić przez git show; strażnikiem jest skrót.
//
// EKSPORTY
//   FIKSTURY — { sejf221, sejf276, retencjaV1 }: { plik, bajtow, sha256 }.
//   tekstFikstury(nazwa) → tekst fikstury z FIKSTURY (odczyt raz na plik testu).
//   skrotBezCR(tekst) → sha256 (hex) treści po zamianie \r\n → \n.
//   zaladuj221(win), zaladujRetencjeV1(win) — wykonanie tekstu fikstury w oknie (jak tests/support/load-browser-script.mjs).
//   zrodlo276() → kopia sejfu 276 z rejestrem łańcucha (zRejestremLancucha z tests/support/sejf-bez-wstawek.mjs; raz
//       na plik testu, około 0,5 s).
//   zaladuj276(win) → rejestr łańcucha okna (tablica wpisów Bem_doLancucha); okno dostaje VILDA_EVENT_LOG = true.
//   zrodlaStarszej(app, { retencja = 'v1', lancuch = null }) → opcja zrodla: app 'S221' albo 'S276'; retencja 'v1'
//       (fikstura) albo 'biezaca' (vilda_retention.js z repozytorium — kontrola); lancuch(rejestr) — wywołanie z rejestrem
//       łańcucha okna 276.
//   PROG_DELT_221 — próg data delty karty sejfu 221 w treści uprzęży (niżej).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zRejestremLancucha, zaladujZrodlo } from './sejf-bez-wstawek.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FIKSTURY = Object.freeze({
  sejf221: Object.freeze({ plik: 'tests/fixtures/vilda_vault-221.js.txt', bajtow: 401517, sha256: '3393067d6df04c5763b9b7c294afc77c419c158b1b13542703c3a8c33bcfba70' }),
  sejf276: Object.freeze({ plik: 'tests/fixtures/vilda_vault-276.js.txt', bajtow: 1175528, sha256: '4a545ca00de1a48d7c59036a1433be3513d52815dec3a3a78b7f6b5828c2e7a6' }),
  retencjaV1: Object.freeze({ plik: 'tests/fixtures/vilda_retention-v1.js.txt', bajtow: 1880, sha256: '27995e72aed035a8e7cc705c7b44d11f601375c6cbdda88602490f5024b572fc' }),
});
// Próg delty karty sejfu 221 (vilda_sync_integration.js z 54a84da3: słuchacz zapisu karty buduje buildPatientDelta i
// pomija ją przy data.length > 60 000 — docs/SYNC_PRZYROSTOWA_PLAN.md, rozdz. 2: „60 000 znaków, czyli 2 zapisy”). W aplikacji
// przy 24–34 tys. znaków na wersję przechodzą 1–2 wersje karty. W treści uprzęży (naglowek, około 380 znaków data na
// wersję) odpowiednikiem górnej granicy jest próg między 2 a 3 wersjami: strażnik dł(2 wersje) < PROG_DELT_221 <
// dł(3 wersje).
export const PROG_DELT_221 = 1700;

const TEKSTY = new Map();
export function tekstFikstury(nazwa) {
  const f = FIKSTURY[nazwa];
  if (!f) throw new Error(`nieznana fikstura starszej aplikacji: ${nazwa}`);
  if (!TEKSTY.has(nazwa)) TEKSTY.set(nazwa, readFileSync(path.join(KORZEN, f.plik), 'utf8'));
  return TEKSTY.get(nazwa);
}
export const skrotBezCR = (tekst) => createHash('sha256').update(tekst.replace(/\r\n/g, '\n'), 'utf8').digest('hex');

const wykonaj = (win, tekst) => { new Function('window', 'globalThis', tekst)(win, win); };
export const zaladuj221 = (win) => wykonaj(win, tekstFikstury('sejf221'));
export const zaladujRetencjeV1 = (win) => wykonaj(win, tekstFikstury('retencjaV1'));
let ZRODLO_276 = null;
export function zrodlo276() {
  if (!ZRODLO_276) ZRODLO_276 = zRejestremLancucha(tekstFikstury('sejf276'));
  return ZRODLO_276;
}
export function zaladuj276(win) {
  const lancuch = [];
  win.VILDA_EVENT_LOG = true;
  zaladujZrodlo(win, zrodlo276(), { lancuch: (z) => { lancuch.push(z); } });
  return lancuch;
}
export function zrodlaStarszej(app, { retencja = 'v1', lancuch = null } = {}) {
  if (app !== 'S221' && app !== 'S276') throw new Error(`nieznana starsza aplikacja: ${app}`);
  if (retencja !== 'v1' && retencja !== 'biezaca') throw new Error(`nieznana retencja: ${retencja}`);
  const z = {
    'vilda_vault.js': app === 'S221' ? zaladuj221 : (win) => { const l = zaladuj276(win); if (lancuch) lancuch(l); },
  };
  if (retencja === 'v1') z['vilda_retention.js'] = zaladujRetencjeV1;
  return z;
}

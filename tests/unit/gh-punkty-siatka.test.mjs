import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rodzaje, zrodlo } from '../support/gh-monitor-atrapa.mjs';
import {
  KATEGORIE, KATEGORIE_ODMOW, LISTY, PLIK_WZORCA, PLIKI, idReprezentatywnych, kanon, korzen, pierwszaRoznica,
  podsumowanieKategorii, siatka, wykonajNaSwiezej, wykonajPrzypadki,
} from '../scripts/gh-punkty-wzorzec.mjs';

// P-GH-PUNKTY-TESTY: złota siatka punktów terapii GH. Ok. 10 tys. kombinacji ścieżek Z1 (nowy punkt z karty), Z2 (edycja
// punktu z listy), Z4 (punkt wsteczny) i Z5 (usuwanie) przechodzi przez PRAWDZIWY gh_therapy_monitor.js w atrapie i musi
// dać wynik zapisany we wzorcu tests/fixtures/gh-punkty-wzorzec.json, co do kolejności kluczy i bitu każdej liczby.
// Wzorzec policzył generator tests/scripts/gh-punkty-wzorzec.mjs z dzisiejszego artefaktu; to punkt odniesienia dla
// przeniesienia reguł punktów do wspólnego API. Różnica = zmiana zachowania: najpierw `--roznice`, nigdy `--zapisz` dla
// zielonego wyniku. Opisuje stan obecny, także ten czekający na decyzję właściciela. Dane wyłącznie FIKCYJNE.
// P-GH-PUNKTY-API rata 2: monitor bierze reguły punktu z VildaGhPunkty, a bez modułu wykonuje stary kod. Siatka idzie
// w OBU trybach i w obu musi dać ten sam wzorzec; kontrole negatywne psują kod, który w danym trybie naprawdę działa.

const wzorzec = JSON.parse(fs.readFileSync(path.join(korzen, PLIK_WZORCA), 'utf8'));
const przypadki = siatka();
const wedlugId = new Map(przypadki.map((p) => [p.id, p]));
const reprezentatywne = wzorzec.przypadki;
const TRYBY = [
  { nazwa: 'z modułem VildaGhPunkty', opcje: {} },
  { nazwa: 'bez modułu VildaGhPunkty (ścieżka zapasowa)', opcje: { modulPunktow: false } },
];
const PODPOWIEDZ = 'Lista różnic: node tests/scripts/gh-punkty-wzorzec.mjs --roznice';

// Kategorie siatki i to, co przypinają. Odmowy są osobną, mniejszą podsiatką.
const OPISY = {
  'Z1-modul': 'Z1 nowy punkt z karty z VildaGhDawka: wynik karty przy zgodnej masie; gałąź zapasowa Gmcalc przy masie '
    + 'niezgodnej, bez wyniku karty i dla preparatu nieznanego; „ngenla 60 mg” jako dobowy — stan obecny — do decyzji (pytania 28, 30)',
  'Z1-bez-modulu': 'Z1 nowy punkt z karty bez VildaGhDawka: zawsze gałąź zapasowa (#therDailyDoseAbs albo G()), także '
    + 'dla Increlex — stan obecny — do decyzji (pytania 27, 28, 30)',
  'Z2-modul': 'Z2 edycja punktu z listy z VildaGhDawka: dose = Gmt(dawka)/masa, type z przycisku, program z #therProg '
    + '(punktu Włączenia), id, pozycja i obce pole zostają — stan obecny — do decyzji (pytania 17, 30)',
  'Z2-bez-modulu': 'Z2 edycja punktu z listy bez VildaGhDawka: Increlex bez ×2, program z #therProg — stan obecny — do '
    + 'decyzji (pytania 17, 27, 30)',
  'Z4-modul': 'Z4 punkt wsteczny z VildaGhDawka: dose = Gmt(dawka)/masa, Ngenla doseAbs = dawka/7 i 4 dni przy IGF bez '
    + 'dni; „ngenla 60 mg” jako dobowy — stan obecny — do decyzji (pytanie 30)',
  'Z4-bez-modulu': 'Z4 punkt wsteczny bez VildaGhDawka: Increlex bez ×2 — stan obecny — do decyzji (pytania 27, 30)',
  Z5: 'Z5 usuwanie przyciskiem i nakładką potwierdzenia: znikają wszystkie punkty o tym samym String(id), także wszystkie '
    + 'bez id; „Anuluj” niczego nie zapisuje — stan obecny — do decyzji (pytanie 18)',
  'Z1-odmowy': 'odmowy Z1: zajęty typ, zła masa, wiek lub wzrost, pusty preparat lub program — bez zapisu, dokładny tekst nakładki',
  'Z2-odmowy': 'odmowy Z2 (każda na świeżej atrapie): zajęty typ, zła masa, wiek, wzrost lub dawka, pusty preparat — bez '
    + 'zapisu, formularz edycji zostaje otwarty',
  'Z4-odmowy': 'odmowy Z4: zajęty typ, zła masa, wiek, wzrost lub dawka, pusty preparat lub program — bez zapisu, '
    + 'formularz wsteczny zostaje otwarty',
};

// Komunikaty monitora dosłownie (nakładka #ghInfoOverlay) według powodu odmowy w siatce.
const DRUGIE = { start: 'Punkt „Włączenie leczenia” został już dodany.', end: 'Punkt „Zakończenie leczenia” został już dodany.' };
const DANE = 'Upewnij się, że wprowadziłeś poprawne, dodatnie dane: wiek, wagę, wzrost oraz dawkę.';
const PROGRAM = {
  Z1: 'Wybierz program i preparat w karcie „Leczenie hormonem wzrostu / IGF-1”.',
  Z2: 'Wybierz program i preparat w karcie „Leczenie hormonem wzrostu / IGF-1”.',
  Z4: 'Wybierz program i preparat w formularzu wstecznego punktu.',
};
const komunikatOdmowy = (p) => {
  if (p.powod === 'typ') return DRUGIE[p.sciezka === 'Z4' ? p.pola.ghRetroType : p.typ];
  return p.powod === 'program' || p.powod === 'preparat' ? PROGRAM[p.sciezka] : DANE;
};

// Zapis kończy dziennik wpisami [M, E, BC]: moduł z {force:true}, zdarzenie z listą równą zapisanej, komunikat kanału
// {type:'update', tabId}; nakładki brak, formularz edycji zamknięty. Odmowa daje [E, K] (wsteczny [E, E, K], bo E
// daje też otwarcie formularza), bez zapisu modułu i kanału, z tekstem według powodu i ze swoim formularzem otwartym.
// „Anuluj” przy usuwaniu nie zostawia żadnego wpisu.
function naruszenie(p, w) {
  const r = rodzaje(w.dziennik).join(',');
  if (KATEGORIE_ODMOW.includes(p.kategoria)) {
    if (r !== (p.sciezka === 'Z4' ? 'E,E,K' : 'E,K')) return `odmowa z dziennikiem ${r}`;
    if (w.komunikat !== komunikatOdmowy(p)) return `odmowa „${p.powod}” z komunikatem ${w.komunikat}`;
    if (w.edycjaWidoczna !== (p.sciezka === 'Z2') || w.wstecznyWidoczny !== (p.sciezka === 'Z4')) return 'formularz po odmowie';
    return null;
  }
  if (p.anuluj) return r === '' ? null : `„Anuluj” z wpisami: ${r}`;
  if (!r.endsWith('M,E,BC')) return `zapis bez [M, E, BC]: ${r}`;
  const [m, e, bc] = w.dziennik.slice(-3);
  if (kanon(m.opcje) !== '{"force":true}') return `opcje zapisu ${kanon(m.opcje)}`;
  if (kanon(e.okno) !== kanon(m.wartosc)) return 'lista w chwili E ≠ lista zapisana';
  if (kanon(bc.wiadomosc) !== '{"type":"update","tabId":"fikcyjna-karta-1"}') return `kanał ${kanon(bc.wiadomosc)}`;
  if (w.komunikat !== null || w.edycjaWidoczna) return 'nakładka albo formularz edycji po zapisie';
  return null;
}

describe('Złota siatka punktów GH — budowa siatki i wzorca', () => {
  it('10–20 tys. przypadków; co najmniej połowa to zapisy, a odmowy są osobną, mniejszą podsiatką', () => {
    expect(przypadki.length).toBeGreaterThanOrEqual(10_000);
    expect(przypadki.length).toBeLessThanOrEqual(20_000);
    expect(Object.keys(OPISY)).toEqual(KATEGORIE);
    expect(new Set(przypadki.map((p) => p.kategoria))).toEqual(new Set(KATEGORIE));
    expect(new Set(przypadki.map((p) => p.sciezka))).toEqual(new Set(['Z1', 'Z2', 'Z4', 'Z5']));
    // Liczności wzorca zgadzają się z siatką; zapisy i odmowy sprawdza wynik monitora w kategoriach niżej (skrót).
    for (const k of KATEGORIE) {
      expect(wzorzec.kategorie[k].przypadki, k).toBe(przypadki.filter((p) => p.kategoria === k).length);
    }
    const zapisy = KATEGORIE.reduce((s, k) => s + wzorzec.kategorie[k].zapisy, 0);
    const odmowy = KATEGORIE_ODMOW.reduce((s, k) => s + wzorzec.kategorie[k].przypadki, 0);
    expect(zapisy).toBeGreaterThanOrEqual(przypadki.length / 2);
    expect(odmowy).toBeLessThan(zapisy);
    for (const k of KATEGORIE) {
      const { zapisy: z, bezZapisu: b } = wzorzec.kategorie[k];
      if (KATEGORIE_ODMOW.includes(k)) expect(z, k).toBe(0);
      else if (k === 'Z5') expect(b, k).toBe(przypadki.filter((p) => p.kategoria === k && p.anuluj).length);
      else expect(b, k).toBe(0);
    }
  });

  it('wzorzec ma te same listy punktów, pliki i przypadki reprezentatywne co siatka (ok. 200, wejście bez zmian)', () => {
    expect(kanon(wzorzec.listy)).toBe(kanon(LISTY));
    expect(wzorzec.pliki).toEqual(PLIKI);
    expect(reprezentatywne.length).toBeGreaterThanOrEqual(150);
    expect(reprezentatywne.length).toBeLessThanOrEqual(250);
    expect(reprezentatywne.map((r) => r.wejscie.id)).toEqual(idReprezentatywnych(przypadki));
    for (const r of reprezentatywne) expect(kanon(r.wejscie), r.wejscie.id).toBe(kanon(wedlugId.get(r.wejscie.id)));
    // Każda kategoria ma przypadki reprezentatywne, czyli czytelną różnicę obok skrótu.
    for (const k of KATEGORIE) expect(reprezentatywne.some((r) => r.wejscie.kategoria === k), k).toBe(true);
  });
});

describe.each(TRYBY)('Złota siatka punktów GH — prawdziwy monitor daje wynik wzorca ($nazwa)', ({ opcje }) => {
  for (const kategoria of KATEGORIE) {
    it(OPISY[kategoria], () => {
      const czesc = przypadki.filter((p) => p.kategoria === kategoria);
      const wyniki = wykonajPrzypadki(czesc, {}, opcje);

      // Pełny wynik przypadków reprezentatywnych: najpierw czytelna różnica, potem kolejność kluczy i bity liczb.
      for (const r of reprezentatywne.filter((x) => x.wejscie.kategoria === kategoria)) {
        const w = wyniki.get(r.wejscie.id);
        expect(w, r.wejscie.id).toEqual(r.wynik);
        expect(pierwszaRoznica(r.wynik, w), r.wejscie.id).toBeNull();
      }
      // Niezmienniki czytelne bez wzorca, dla każdego przypadku kategorii.
      const naruszenia = czesc.map((p) => [p.id, naruszenie(p, wyniki.get(p.id))]).filter(([, n]) => n);
      expect(naruszenia).toEqual([]);
      // Całość kategorii: skrót SHA-256 po id, wejściu i wyniku kanonicznym każdego przypadku.
      expect(podsumowanieKategorii(czesc, wyniki)[kategoria], PODPOWIEDZ).toEqual(wzorzec.kategorie[kategoria]);
    }, 60_000);
  }
});

describe.each(TRYBY)('Złota siatka punktów GH — atrapa użyta ponownie nie przenosi stanu między przypadkami ($nazwa)', ({ opcje }) => {
  it('każdy przypadek reprezentatywny na świeżej atrapie (lista w module przed startem monitora) daje wynik wzorca', () => {
    for (const r of reprezentatywne) {
      const w = wykonajNaSwiezej(wedlugId.get(r.wejscie.id), {}, opcje);
      expect(pierwszaRoznica(r.wynik, w), r.wejscie.id).toBeNull();
    }
  }, 60_000);
});

// Kontrole negatywne: kopia źródła monitora albo API zmieniona przez replace z kotwicą występującą dokładnie raz.
// Każda zmiana musi wywrócić porównanie przypadków reprezentatywnych ze wzorcem, i to tylko na ścieżkach, których
// dotyczy. Kod starego monitora psujemy w trybie zapasowym (bez modułu), a API i części monitora wspólne dla obu
// ścieżek (kanał z tabId, rekord nowego punktu z karty) — w trybie z modułem.
const ZAPIS_L = 'try{ve(window.ghTherapyPoints||[])}';
const ZDARZENIE_L = 'try{document.dispatchEvent(new CustomEvent("vilda:therapy-points-changed",{detail:{source:"gh"}}))}catch{}';
// „M po E”: blok zapisu modułu w zapasowym L() (z obsługą błędu) przeniesiony za rozgłoszenie zdarzenia. Zapis
// ve(…||[]) jest tylko w L().
function kontrolaMPoE(tekst) {
  const i = tekst.indexOf(ZAPIS_L);
  const blokZapisu = tekst.slice(i, tekst.indexOf(ZDARZENIE_L, i));
  return [blokZapisu + ZDARZENIE_L, ZDARZENIE_L + blokZapisu];
}
// To samo w VildaGhPunkty.zapisz: krok 1 (zapis modułu) za krokiem 2 (zdarzenie).
const ZAPIS_API = `    try {
      var P = persistence();`;
const ZDARZENIE_API = `    try {
      w.document.dispatchEvent(`;
const KONIEC_ZDARZENIA_API = `    } catch (e) { /* brak document albo CustomEvent */ }
`;
function kontrolaMPoEApi(tekst) {
  const i = tekst.indexOf(ZAPIS_API);
  const j = tekst.indexOf(ZDARZENIE_API, i);
  const k = tekst.indexOf(KONIEC_ZDARZENIA_API, j) + KONIEC_ZDARZENIA_API.length;
  const blokZapisu = tekst.slice(i, j);
  const blokZdarzenia = tekst.slice(j, k);
  return [blokZapisu + blokZdarzenia, blokZdarzenia + blokZapisu];
}
const KONTROLE = [
  { nazwa: 'Increlex ×3 zamiast ×2 w Gmt', kotwica: 'return Gmpod(d)?o*2:o', zamiana: 'return Gmpod(d)?o*3:o',
    dotyczy: (p) => p.modulDawki && (p.sciezka === 'Z2' || p.sciezka === 'Z4') },
  { nazwa: 'doseAbs edycji Ngenla: /7 → /6', kotwica: 'c.doseAbs=/tydz/.test(s)?o/7', zamiana: 'c.doseAbs=/tydz/.test(s)?o/6',
    dotyczy: (p) => p.sciezka === 'Z2' },
  { nazwa: 'zamiana kolejności kluczy weight i height w rekordzie nowego punktu',
    kotwica: 'weight:r,height:i,boneAge:isFinite(a)?a:null,dose:o,', zamiana: 'height:i,weight:r,boneAge:isFinite(a)?a:null,dose:o,',
    dotyczy: (p) => p.sciezka === 'Z1' },
  { nazwa: 'zapis modułu (M) po zdarzeniu (E) w L()', kotwicaZe: kontrolaMPoE, dotyczy: () => true },
  { nazwa: 'brak tabId w komunikacie kanału gh-therapy-sync', kotwica: 'e.tabId=t.getTabId()', zamiana: 'void 0',
    dotyczy: () => true },
  { nazwa: '/^Ngenla/ → /^Ngenla/i przy zapisie z karty i z edycji', kotwica: 'd&&/^Ngenla/.test(d)',
    zamiana: 'd&&/^Ngenla/i.test(d)', dotyczy: (p) => p.sciezka === 'Z1' || p.sciezka === 'Z2' },
  { nazwa: 'dose edycji: Gmt(d,o)/r → o/r*2', kotwica: 'c.dose=Gmt(d,o)/r', zamiana: 'c.dose=o/r*2',
    dotyczy: (p) => p.sciezka === 'Z2' },
];

// Tryb z modułem: API (vilda_gh_punkty.js) i części monitora, którymi idą obie ścieżki.
const KONTROLE_Z_MODULEM = [
  { nazwa: 'API: Increlex ×3 zamiast ×2', plik: 'vilda_gh_punkty.js',
    kotwica: 'return naPodanie(preparat, opcje) ? podawana * 2 : podawana;',
    zamiana: 'return naPodanie(preparat, opcje) ? podawana * 3 : podawana;',
    dotyczy: (p) => p.modulDawki && (p.sciezka === 'Z2' || p.sciezka === 'Z4') },
  { nazwa: 'API: doseAbs Ngenla /7 → /6', plik: 'vilda_gh_punkty.js',
    kotwica: 'doseAbs: /tydz/.test(jednostka) ? podawana / 7 : dobowa',
    zamiana: 'doseAbs: /tydz/.test(jednostka) ? podawana / 6 : dobowa',
    dotyczy: (p) => p.sciezka === 'Z2' || p.sciezka === 'Z4' },
  { nazwa: 'API: zapis modułu (M) po zdarzeniu (E) w zapisz()', plik: 'vilda_gh_punkty.js', kotwicaZe: kontrolaMPoEApi,
    dotyczy: () => true },
  { nazwa: 'API: /^Ngenla/ → /^Ngenla/i w jednostce dawki', plik: 'vilda_gh_punkty.js',
    kotwica: 'preparat && /^Ngenla/.test(preparat)', zamiana: 'preparat && /^Ngenla/i.test(preparat)',
    dotyczy: (p) => p.sciezka === 'Z1' || p.sciezka === 'Z2' || p.sciezka === 'Z4' },
  { nazwa: 'monitor (obie ścieżki): brak tabId w komunikacie kanału', plik: 'gh_therapy_monitor.js',
    kotwica: 'e.tabId=t.getTabId()', zamiana: 'void 0', dotyczy: () => true },
  { nazwa: 'monitor (obie ścieżki): kolejność kluczy weight i height w rekordzie nowego punktu', plik: 'gh_therapy_monitor.js',
    kotwica: 'weight:r,height:i,boneAge:isFinite(a)?a:null,dose:o,', zamiana: 'height:i,weight:r,boneAge:isFinite(a)?a:null,dose:o,',
    dotyczy: (p) => p.sciezka === 'Z1' },
];

describe.each([
  { nazwa: 'bez modułu: kod zapasowy monitora', kontrole: KONTROLE.map((k) => ({ ...k, plik: 'gh_therapy_monitor.js' })),
    opcje: { modulPunktow: false } },
  { nazwa: 'z modułem: API i wspólne części monitora', kontrole: KONTROLE_Z_MODULEM, opcje: {} },
])('Złota siatka punktów GH — kontrole negatywne ($nazwa)', ({ kontrole, opcje }) => {
  const wejscia = reprezentatywne.map((r) => wedlugId.get(r.wejscie.id));

  for (const k of kontrole) {
    it(`${k.nazwa}: wzorzec wykrywa zmianę`, () => {
      const zrodloPliku = zrodlo(k.plik);
      const [kotwica, zamiana] = k.kotwicaZe ? k.kotwicaZe(zrodloPliku) : [k.kotwica, k.zamiana];
      expect(zrodloPliku.split(kotwica).length - 1).toBe(1);
      const zmienione = zrodloPliku.replace(kotwica, () => zamiana);
      expect(zmienione).not.toBe(zrodloPliku);

      const wyniki = wykonajPrzypadki(wejscia, { [k.plik]: zmienione }, opcje);
      const rozne = reprezentatywne.filter((r) => kanon(wyniki.get(r.wejscie.id)) !== kanon(r.wynik)).map((r) => r.wejscie);
      expect(rozne.length).toBeGreaterThan(0);
      expect(rozne.filter((p) => !k.dotyczy(p)).map((p) => p.id)).toEqual([]);
    }, 60_000);
  }
});

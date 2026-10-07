import { describe, expect, it } from 'vitest';
import {
  MONITOR_PRZED_API, idDeterministyczne, opcjePrzedApi, rodzaje, utworzAtrapeMonitoraGh, zrodlo,
} from '../support/gh-monitor-atrapa.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { LISTY, idReprezentatywnych, siatka } from '../scripts/gh-punkty-wzorzec.mjs';

// P-GH-PUNKTY-API rata 1 (PR-3). Test RÓŻNICOWY: VildaGhPunkty (vilda_gh_punkty.js) ↔ ŻYWY monitor punktów terapii GH
// (gh_therapy_monitor.js) w atrapie tests/support/gh-monitor-atrapa.mjs. API ładuje loadBrowserScript do TEGO SAMEGO
// okna atrapy, w którym działa monitor, i oba dostają te same wejścia:
// (a) punkt wsteczny — monitor: formularz wstecznego punktu i „Dodaj punkt” (ghAddRetroPoint); API: sprawdzRodzaj →
//     polaZPodawanej(…, 'wsteczny') → punkt(id nadane przez monitor, pola) dopisany na koniec listy;
// (b) edycja punktu — monitor: „Edytuj”, pola formularza edycji, przycisk W/K/Z (He); API: sprawdzRodzaj(…, {pomin: id})
//     → polaZPodawanej(…, 'karta') → zmienWMiejscu na kopii listy sprzed edycji. Program z #therProg, typ z przycisku
//     — tak jak w monitorze.
// Wejście API to napisy z pól formularza odczytane w chwili kliknięcia przycisku zapisu: słuchacz w fazie
// przechwytywania na dokumencie biegnie przed onclick przycisku. Lista sprzed zapisu to VildaGhPunkty.wczytaj() w tej
// samej chwili; test sprawdza, że równa się liście, którą D() monitora wczytał przy kliknięciu.
// Porównanie: lista po zapisie co do kolejności kluczy (Object.keys) i każdej liczby (Object.is, także NaN i -0),
// lista zapisana do modułu, tekst odmowy (wpis K dziennika = komunikat API) oraz brak zapisu przy odmowie.
// ŹRÓDŁEM PRAWDY JEST MONITOR. Różnica oznacza błąd API albo zmianę monitora — nie dopasowuj oczekiwań do API.
// Kontrole negatywne na końcu pokazują, że porównanie wykrywa zmianę kolejności kluczy, -0, tekstu odmowy i dawki.
// To nie jest test kliniczny: liczby są fikcyjne. Dane wyłącznie FIKCYJNE.
// Od raty 2 (PR-4) monitor bierze reguły z API, a od raty 3 (PR-5, D5) stary kod reguł jest z niego usunięty. Ten test
// porównuje więc API z zamrożonym monitorem sprzed API (MONITOR_PRZED_API, gh_therapy_monitor.js 52; atrapa bez
// VildaGhPunkty, a API ładowane do okna i zaraz z niego zdejmowane), inaczej porównywałby API z samym sobą. Równość
// dzisiejszego monitora z monitorem sprzed API: gh-punkty-monitor-tryby.test.mjs.

// Komunikaty monitora dosłownie (nakładka #ghInfoOverlay, nagłówek „Informacja”).
const DRUGIE_WLACZENIE = 'Punkt „Włączenie leczenia” został już dodany.';
const DRUGIE_ZAKONCZENIE = 'Punkt „Zakończenie leczenia” został już dodany.';
const DANE = 'Upewnij się, że wprowadziłeś poprawne, dodatnie dane: wiek, wagę, wzrost oraz dawkę.';
const PROGRAM_KARTA = 'Wybierz program i preparat w karcie „Leczenie hormonem wzrostu / IGF-1”.';
const PROGRAM_WSTECZNY = 'Wybierz program i preparat w formularzu wstecznego punktu.';
const SPOZA_LISTY = 'Nie zapisano zmian: edytowany punkt nie należy do bieżącej listy punktów. Otwórz edycję ponownie.';

// Przycisk zapisu edycji → typ punktu. Pola czytane przez monitor przy zapisie (edycja: także #therProg).
const TYP_PRZYCISKU = { btnGhStart: 'start', btnGhContinue: 'continue', btnGhEnd: 'end' };
const POLA_WSTECZNEGO = ['ghRetroType', 'ghRetroProg', 'ghRetroDrug', 'ghRetroAge', 'ghRetroAgeMonths', 'ghRetroWeight',
  'ghRetroHeight', 'ghRetroBoneAge', 'ghRetroDose', 'ghRetroIgf1', 'ghRetroIgfDays'];
const POLA_EDYCJI = ['ghEditDrug', 'ghEditAge', 'ghEditAgeMonths', 'ghEditWeight', 'ghEditHeight', 'ghEditBoneAge',
  'ghEditDose', 'ghEditIgf1', 'ghEditIgfDays', 'therProg'];
// Globale, które loadBrowserScript wnosi z ZALEZNOSCI['vilda_gh_punkty.js'] (moduł dawki: dane i silnik).
const Z_ZALEZNOSCI = ['VildaGhDawkaDane', 'VildaGhDawka'];

const kopia = (v) => structuredClone(v);

/* ---------- Okno atrapy z monitorem i API ---------- */

// Atrapa z prawdziwym monitorem sprzed API; w jej okno loadBrowserScript ładuje vilda_gh_punkty.js, a test
// zabiera API z okna (monitor go nie widzi, API dalej czyta okno: moduł dawki, pamięć, dokument). Z modułem dawki atrapa
// wczytała go już przez loadBrowserScript, więc ZALEZNOSCI nie wykonują niczego drugi raz. Bez modułu dawki
// ZALEZNOSCI wnoszą VildaGhDawkaDane i VildaGhDawka; zdejmujemy je, żeby i monitor, i API widziały stronę bez tych
// tagów (oba czytają VildaGhDawka dopiero przy wywołaniu, a moduł dawki niczego nie rejestruje przy ładowaniu).
function atrapaZApi({ modulDawki = true, punkty, zrodla } = {}) {
  const atrapa = utworzAtrapeMonitoraGh(opcjePrzedApi({
    modulDawki, ...(punkty === undefined ? {} : { punkty }), ...(zrodla ? { zrodla } : {}),
  }));
  const { win } = atrapa;
  const przed = new Set(Object.keys(win));
  const dawka = win.VildaGhDawka;
  loadBrowserScript('vilda_gh_punkty.js', win);
  const dodane = Object.keys(win).filter((k) => !przed.has(k));
  const oczekiwane = modulDawki ? ['VildaGhPunkty'] : [...Z_ZALEZNOSCI, 'VildaGhPunkty'];
  if (dodane.join() !== oczekiwane.join() || (modulDawki && win.VildaGhDawka !== dawka)) {
    throw new Error(`Okno atrapy: loadBrowserScript dodał [${dodane}], oczekiwano [${oczekiwane}]`);
  }
  if (!modulDawki) for (const k of Z_ZALEZNOSCI) delete win[k];
  const api = win.VildaGhPunkty;
  delete win.VildaGhPunkty;

  const klikniecia = [];
  atrapa.doc.addEventListener('click', (ev) => {
    const id = ev.target && ev.target.id;
    const wsteczny = id === 'btnGhRetroAdd';
    if (!wsteczny && !Object.hasOwn(TYP_PRZYCISKU, id)) return;
    const pola = {};
    for (const p of wsteczny ? POLA_WSTECZNEGO : POLA_EDYCJI) pola[p] = atrapa.pole(p).value;
    klikniecia.push({
      sciezka: wsteczny ? 'wsteczny' : 'edycja',
      typ: wsteczny ? pola.ghRetroType : TYP_PRZYCISKU[id],
      pola,
      lista: api.wczytaj(),
      modulSurowy: atrapa.stan().modulSurowy,
      od: atrapa.dziennik.length,
    });
  }, true);
  return { atrapa, api, klikniecia };
}

/* ---------- Ścieżka API dla odczytanych pól ---------- */

function wejscieApi(klik) {
  const p = klik.pola;
  if (klik.sciezka === 'wsteczny') {
    return {
      typ: klik.typ, lata: p.ghRetroAge, miesiace: p.ghRetroAgeMonths, masa: p.ghRetroWeight, wzrost: p.ghRetroHeight,
      wiekKostny: p.ghRetroBoneAge, podawana: p.ghRetroDose, preparat: p.ghRetroDrug, program: p.ghRetroProg,
      igf1: p.ghRetroIgf1, dniIgf: p.ghRetroIgfDays,
    };
  }
  return {
    typ: klik.typ, lata: p.ghEditAge, miesiace: p.ghEditAgeMonths, masa: p.ghEditWeight, wzrost: p.ghEditHeight,
    wiekKostny: p.ghEditBoneAge, podawana: p.ghEditDose, preparat: p.ghEditDrug, program: p.therProg,
    igf1: p.ghEditIgf1, dniIgf: p.ghEditIgfDays,
  };
}

// Kolejność kroków jak w monitorze: rodzaj → wartości (z programem i preparatem) → rekord. Lista: klik.lista (kopia
// z wczytaj(), zmieniana w miejscu tak, jak monitor zmienia window.ghTherapyPoints).
function wynikApi(api, klik, cel, idNowego) {
  const lista = klik.lista;
  const wsteczny = klik.sciezka === 'wsteczny';
  const rodzaj = wsteczny ? api.sprawdzRodzaj(lista, klik.typ) : api.sprawdzRodzaj(lista, klik.typ, { pomin: cel });
  if (!rodzaj.ok) return { zapis: false, komunikat: rodzaj.komunikat, lista, kod: rodzaj.kod };
  const pola = api.polaZPodawanej(wejscieApi(klik), wsteczny ? 'wsteczny' : 'karta');
  if (!pola.ok) return { zapis: false, komunikat: pola.komunikat, lista, kod: pola.kod };
  if (wsteczny) {
    lista.push(api.punkt(idNowego, pola.pola));
  } else {
    const zmiana = api.zmienWMiejscu(lista, cel, pola.pola);
    if (!zmiana.ok) return { zapis: false, komunikat: null, lista, kod: zmiana.kod };
  }
  return { zapis: true, komunikat: null, lista, bezModuluDawki: pola.bezModuluDawki };
}

/* ---------- Porównanie ścisłe ---------- */

const opisWartosci = (v) => {
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  return v === undefined ? 'undefined' : JSON.stringify(v);
};
// Różnice API ↔ monitor: kolejność kluczy, Object.is dla liczb, === dla reszty. Pusta tablica = zgodność.
function roznice(api, monitor, sciezka = 'wynik') {
  if (typeof api === 'number' || typeof monitor === 'number') {
    return Object.is(api, monitor) ? [] : [`${sciezka}: API ${opisWartosci(api)} ≠ monitor ${opisWartosci(monitor)}`];
  }
  if (api === null || monitor === null || typeof api !== 'object' || typeof monitor !== 'object') {
    return api === monitor ? [] : [`${sciezka}: API ${opisWartosci(api)} ≠ monitor ${opisWartosci(monitor)}`];
  }
  if (Array.isArray(api) !== Array.isArray(monitor)) return [`${sciezka}: tablica ≠ obiekt`];
  const ka = Object.keys(api);
  const km = Object.keys(monitor);
  if (ka.length !== km.length || ka.some((k, i) => k !== km[i])) {
    return [`${sciezka}: klucze API [${ka}] ≠ monitor [${km}]`];
  }
  return ka.flatMap((k) => roznice(api[k], monitor[k], Array.isArray(api) ? `${sciezka}[${k}]` : `${sciezka}.${k}`));
}

/**
 * Jeden przypadek na świeżej atrapie: monitor, potem API na polach i liście odczytanych przy kliknięciu.
 * @returns {{ roznice: string[], sciezka, modulDawki, cel, klik, monitor, api }}
 */
function porownaj(przypadek, { zrodla } = {}) {
  const { modulDawki = true, punkty, sciezka, pola = {}, cel, typ } = przypadek;
  const { atrapa, api, klikniecia } = atrapaZApi({ modulDawki, punkty, zrodla });
  if (sciezka === 'wsteczny') atrapa.dodajWsteczny(pola);
  else atrapa.edytuj(cel, pola, typ);
  if (klikniecia.length !== 1) return { roznice: [`kliknięć przycisku zapisu: ${klikniecia.length}`] };

  const [klik] = klikniecia;
  const s = atrapa.stan();
  const wpisy = atrapa.dziennik.slice(klik.od);
  const K = wpisy.find((w) => w.rodzaj === 'K');
  const M = wpisy.find((w) => w.rodzaj === 'M');
  const monitor = { zapis: !!M, komunikat: K ? K.tekst : null, lista: s.okno };
  const listaPrzed = kopia(klik.lista);
  const r = [];
  // wczytaj() = be(): ta sama lista, którą D() monitora wczytał przy kliknięciu (pierwsze E po kliknięciu).
  r.push(...roznice(klik.lista, wpisy[0] && wpisy[0].rodzaj === 'E' ? wpisy[0].okno : '(brak E)', 'wczytaj()'));
  // Id nowego punktu nadaje monitor (zegar atrapy); API dostaje to samo id.
  const idNowego = s.okno.length === klik.lista.length + 1 ? s.okno.at(-1).id : idDeterministyczne(0);
  const wynik = wynikApi(api, klik, cel, idNowego);
  r.push(...roznice({ zapis: wynik.zapis, komunikat: wynik.komunikat, lista: wynik.lista }, monitor));
  if (monitor.zapis) {
    if (rodzaje(wpisy).join() !== 'E,M,E,BC') r.push(`dziennik monitora przy zapisie: ${rodzaje(wpisy)}`);
    r.push(...roznice(wynik.lista, M.wartosc, 'lista zapisana do modułu'));
    if (wynik.zapis && wynik.bezModuluDawki !== !modulDawki) r.push(`bezModuluDawki: ${wynik.bezModuluDawki}`);
  } else {
    if (rodzaje(wpisy).join() !== 'E,K') r.push(`dziennik monitora przy odmowie: ${rodzaje(wpisy)}`);
    if (K && K.naglowek !== 'Informacja') r.push(`nagłówek komunikatu: ${K.naglowek}`);
    if (s.modulSurowy !== klik.modulSurowy) r.push('moduł zmieniony mimo odmowy');
  }
  return { roznice: r, sciezka, modulDawki, cel, klik: { ...klik, lista: listaPrzed }, monitor, api: wynik };
}

const rozbieznosci = (wyniki, przypadki) => wyniki
  .map((w, i) => [przypadki[i].opis, w.roznice])
  .filter(([, r]) => r.length);

/* ---------- Przypadki własne ---------- */

const punkt = (id, type, nadpisania = {}) => ({
  id, type, ageYears: 9, ageMonths: 0, weight: 32, height: 130, boneAge: null, dose: 0.025, doseUnit: 'mg/kg/d',
  drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
  ...nadpisania,
});
const WLACZENIE = punkt('fikc-start', 'start');
const WLACZENIE_2 = punkt('fikc-start-2', 'start', { ageYears: 9, ageMonths: 6 });
const KONTYNUACJA = punkt('fikc-kont', 'continue', { ageYears: 10, weight: 36, height: 138, doseAbs: 0.9 });
const ZAKONCZENIE = punkt('fikc-koniec', 'end', { ageYears: 12, weight: 40, height: 150, doseAbs: 1 });
// Punkt w dawnym formacie (bez ageMonths, boneAge, pól IGF-1 i doseAbs) z obcym polem w środku rekordu.
const DAWNY = {
  id: 'fikc-dawny', type: 'continue', ageYears: 9.5, notatkaTestowa: 'fikcyjne obce pole', weight: 30, height: 135,
  dose: 0.66, doseUnit: 'mg/kg/tydz', drug: 'Ngenla 24 mg', program: 'SNP',
};
const ID_LICZBOWE = 1767000000123.5;

// 7 preparatów atrapy z programem, w którym występują w karcie; dawka podawana (Omnitrope i Genotropin mg/dobę,
// Ngenla mg/tydzień, Increlex mg na podanie) i masa niebędąca potęgą dwójki.
const PREPARATY = [
  { drug: 'Omnitrope 5 mg', program: 'SNP', dawka: '0.85', masa: '27.3' },
  { drug: 'Omnitrope 10 mg', program: 'ZT', dawka: '1.1', masa: '32' },
  { drug: 'Genotropin 5,3 mg', program: 'PWS', dawka: '0.97', masa: '33.7' },
  { drug: 'Genotropin 12 mg', program: 'SGA', dawka: '1.05', masa: '41.9' },
  { drug: 'Ngenla 24 mg', program: 'PNN', dawka: '8.4', masa: '27.3' },
  { drug: 'Ngenla 60 mg', program: 'SNP', dawka: '14', masa: '33' },
  { drug: 'Increlex 40 mg', program: 'IGF-1', dawka: '0.5', masa: '30' },
];
// [IGF-1, dni od dawki]: bez IGF-1, IGF-1 bez dni (Ngenla → 4 dni), IGF-1 z dniami.
const IGF = [['', ''], ['250', ''], ['250', '3']];
// [lata, miesiące]: miesiące ≥ 12, ułamkowe lata, puste miesiące, ułamkowe i ujemne miesiące, sam wiek w miesiącach.
const WIEKI = [['10', '14'], ['11', '25'], ['9.5', '0'], ['12.25', ''], ['7', '2.6'], ['10', '-1'], ['0', '5'],
  ['-0', '5']];
const KOSCI = ['', '8.5', '0', '-0', '25'];
// Złe wartości (odmowa „Upewnij się…”): wiek 0 albo pusty, masa, wzrost i dawka ≤ 0 albo puste.
const ZLE = [
  ['wiek 0 l. 0 mies.', { wiek: ['0', '0'] }],
  ['wiek 0 l. bez miesięcy', { wiek: ['0', ''] }],
  ['wiek pusty', { wiek: ['', '3'] }],
  ['wiek -1 l. 6 mies.', { wiek: ['-1', '6'] }],
  ['masa 0', { masa: '0' }], ['masa -1', { masa: '-1' }], ['masa pusta', { masa: '' }],
  ['masa „x” (pole liczbowe daje pusty tekst)', { masa: 'x' }],
  ['wzrost 0', { wzrost: '0' }], ['wzrost -1', { wzrost: '-1' }], ['wzrost pusty', { wzrost: '' }],
  ['dawka 0', { dawka: '0' }], ['dawka -1', { dawka: '-1' }], ['dawka pusta', { dawka: '' }],
];
const naPolaWstecznego = ({ wiek, masa, wzrost, dawka }) => ({
  ...(wiek ? { ghRetroAge: wiek[0], ghRetroAgeMonths: wiek[1] } : {}),
  ...(masa === undefined ? {} : { ghRetroWeight: masa }),
  ...(wzrost === undefined ? {} : { ghRetroHeight: wzrost }),
  ...(dawka === undefined ? {} : { ghRetroDose: dawka }),
});
const naPolaEdycji = ({ wiek, masa, wzrost, dawka }) => ({
  ...(wiek ? { ghEditAge: wiek[0], ghEditAgeMonths: wiek[1] } : {}),
  ...(masa === undefined ? {} : { ghEditWeight: masa }),
  ...(wzrost === undefined ? {} : { ghEditHeight: wzrost }),
  ...(dawka === undefined ? {} : { ghEditDose: dawka }),
});

// Poprawny punkt wsteczny (Omnitrope 10 mg, 0,96 mg/d przy 32 kg); przypadki zmieniają wybrane pola.
const WSTECZNY = {
  ghRetroType: 'continue', ghRetroProg: 'SNP', ghRetroDrug: 'Omnitrope 10 mg', ghRetroAge: '9', ghRetroAgeMonths: '6',
  ghRetroWeight: '32', ghRetroHeight: '133', ghRetroDose: '0.96',
};
const NGENLA_WSTECZNY = { ghRetroProg: 'PNN', ghRetroDrug: 'Ngenla 24 mg', ghRetroDose: '8.4' };

// Przypadek odmowy niesie tekst, którym monitor ma odmówić (sprawdza, że przypadek trafia w zamierzoną gałąź);
// przypadek bez tekstu ma się zapisać. Porównanie z API jest niezależne od tych oczekiwań.
function przypadkiWsteczne(modulDawki) {
  const w = (opis, zmiana, punkty = [], komunikat = null) => ({
    opis: `wsteczny (${modulDawki ? 'z modułem dawki' : 'bez modułu dawki'}): ${opis}`,
    modulDawki, sciezka: 'wsteczny', punkty, pola: { ...WSTECZNY, ...zmiana }, komunikat,
  });
  const odmowa = (opis, zmiana, komunikat, punkty = []) => w(`odmowa: ${opis}`, zmiana, punkty, komunikat);
  return [
    ...PREPARATY.flatMap((p) => IGF.map(([igf, dni]) => w(
      `${p.drug} ${p.dawka} przy ${p.masa} kg, IGF-1 „${igf}”, dni „${dni}”`,
      { ghRetroProg: p.program, ghRetroDrug: p.drug, ghRetroDose: p.dawka, ghRetroWeight: p.masa, ghRetroIgf1: igf, ghRetroIgfDays: dni },
    ))),
    ...WIEKI.map(([lata, mies]) => w(`wiek ${lata} l. „${mies}” mies.`, { ghRetroAge: lata, ghRetroAgeMonths: mies })),
    ...KOSCI.map((kosc) => w(`wiek kostny „${kosc}”`, { ghRetroBoneAge: kosc })),
    w('Ngenla 24 mg, IGF-1 z dniami 0', { ...NGENLA_WSTECZNY, ghRetroIgf1: '250', ghRetroIgfDays: '0' }),
    w('Ngenla 24 mg, dni bez IGF-1', { ...NGENLA_WSTECZNY, ghRetroIgf1: '', ghRetroIgfDays: '2' }),
    w('Ngenla 24 mg, IGF-1 „-0” bez dni', { ...NGENLA_WSTECZNY, ghRetroIgf1: '-0', ghRetroIgfDays: '' }),
    w('IGF-1 i dni ułamkowe, preparat dobowy', { ghRetroIgf1: '187.4', ghRetroIgfDays: '0.5' }),
    w('Włączenie na pustej liście', { ghRetroType: 'start' }),
    w('Zakończenie po Włączeniu', { ghRetroType: 'end' }, [WLACZENIE]),
    w('Kontynuacja po Włączeniu i Zakończeniu', { ghRetroType: 'continue' }, [WLACZENIE, ZAKONCZENIE]),
    w('Kontynuacja przy liście w dawnym formacie', {}, [WLACZENIE, DAWNY]),
    odmowa('drugie Włączenie', { ghRetroType: 'start' }, DRUGIE_WLACZENIE, [WLACZENIE]),
    odmowa('drugie Zakończenie', { ghRetroType: 'end' }, DRUGIE_ZAKONCZENIE, [WLACZENIE, ZAKONCZENIE]),
    odmowa('drugie Włączenie przed złą masą (kolejność sprawdzeń)', { ghRetroType: 'start', ghRetroWeight: '0' },
      DRUGIE_WLACZENIE, [WLACZENIE]),
    ...ZLE.map(([opis, zmiana]) => odmowa(opis, naPolaWstecznego(zmiana), DANE)),
    odmowa('pusty program', { ghRetroProg: '' }, PROGRAM_WSTECZNY),
    odmowa('pusty preparat', { ghRetroDrug: '' }, PROGRAM_WSTECZNY),
    odmowa('preparat z samych spacji', { ghRetroDrug: '   ' }, PROGRAM_WSTECZNY),
    odmowa('zła masa przed pustym programem (kolejność sprawdzeń)', { ghRetroWeight: '0', ghRetroProg: '' }, DANE),
  ];
}

const LISTA_EDYCJI = [WLACZENIE, KONTYNUACJA, ZAKONCZENIE];
function przypadkiEdycji(modulDawki) {
  const e = (opis, pola, { punkty = LISTA_EDYCJI, cel = KONTYNUACJA.id, typ = 'continue', komunikat = null } = {}) => ({
    opis: `edycja (${modulDawki ? 'z modułem dawki' : 'bez modułu dawki'}): ${opis}`,
    modulDawki, sciezka: 'edycja', punkty, cel, typ, pola, komunikat,
  });
  const odmowa = (opis, pola, komunikat, opcje = {}) => e(`odmowa: ${opis}`, pola, { ...opcje, komunikat });
  return [
    ...PREPARATY.flatMap((p) => IGF.map(([igf, dni]) => e(
      `${p.drug} ${p.dawka} przy ${p.masa} kg, IGF-1 „${igf}”, dni „${dni}”`,
      { ghEditDrug: p.drug, ghEditWeight: p.masa, ghEditDose: p.dawka, ghEditIgf1: igf, ghEditIgfDays: dni },
    ))),
    ...WIEKI.map(([lata, mies]) => e(`wiek ${lata} l. „${mies}” mies.`, { ghEditAge: lata, ghEditAgeMonths: mies })),
    ...KOSCI.map((kosc) => e(`wiek kostny „${kosc}”`, { ghEditBoneAge: kosc })),
    e('Ngenla 24 mg, IGF-1 z dniami 0', { ghEditDrug: 'Ngenla 24 mg', ghEditDose: '8.4', ghEditIgf1: '250', ghEditIgfDays: '0' }),
    e('Ngenla 24 mg, dni bez IGF-1', { ghEditDrug: 'Ngenla 24 mg', ghEditDose: '8.4', ghEditIgf1: '', ghEditIgfDays: '2' }),
    e('Ngenla 24 mg, IGF-1 „-0” bez dni', { ghEditDrug: 'Ngenla 24 mg', ghEditDose: '8.4', ghEditIgf1: '-0', ghEditIgfDays: '' }),
    e('bez zmian pól (zapis tego, co formularz odczytał z punktu)', {}),
    e('sama masa: dawka podawana zostaje z formularza', { ghEditWeight: '27.3' }),
    e('Włączenie przyciskiem „Włączenie” (sprawdzenie pomija edytowany punkt)', { ghEditHeight: '131' }, { cel: WLACZENIE.id, typ: 'start' }),
    e('Zakończenie przyciskiem „Zakończenie”', { ghEditHeight: '151' }, { cel: ZAKONCZENIE.id, typ: 'end' }),
    e('Kontynuacja → Zakończenie, gdy Zakończenia nie ma', { ghEditHeight: '139' }, { punkty: [WLACZENIE, KONTYNUACJA], typ: 'end' }),
    e('Kontynuacja → Włączenie, gdy Włączenia nie ma', { ghEditHeight: '139' }, { punkty: [KONTYNUACJA, ZAKONCZENIE], typ: 'start' }),
    e('punkt w dawnym formacie z obcym polem', { ghEditHeight: '136' }, { punkty: [WLACZENIE, DAWNY], cel: DAWNY.id }),
    e('punkt o id liczbowym', { ghEditHeight: '139' }, {
      punkty: [WLACZENIE, punkt(ID_LICZBOWE, 'continue', { ageYears: 10 })], cel: ID_LICZBOWE,
    }),
    e('dwa punkty o tym samym id', { ghEditHeight: '140' }, {
      punkty: [WLACZENIE, punkt('fikc-dup', 'continue', { ageYears: 10 }), punkt('fikc-dup', 'continue', { ageYears: 11, weight: 35 })],
      cel: 'fikc-dup',
    }),
    odmowa('drugie Włączenie', { ghEditHeight: '139' }, DRUGIE_WLACZENIE, { typ: 'start' }),
    odmowa('drugie Zakończenie', { ghEditHeight: '139' }, DRUGIE_ZAKONCZENIE, { typ: 'end' }),
    odmowa('Włączenie przy dwóch Włączeniach na liście', { ghEditHeight: '131' }, DRUGIE_WLACZENIE, {
      punkty: [WLACZENIE, WLACZENIE_2], cel: WLACZENIE.id, typ: 'start',
    }),
    odmowa('drugie Włączenie przed złą masą (kolejność sprawdzeń)', { ghEditWeight: '0' }, DRUGIE_WLACZENIE, { typ: 'start' }),
    ...ZLE.map(([opis, zmiana]) => odmowa(opis, naPolaEdycji(zmiana), DANE)),
    // Zmiana schematu dawki czyści pole dawki (P-GH-DAWKA-PODAWANA): dobowy → tygodniowy zawsze, dobowy → na podanie
    // tylko z modułem dawki (bez niego Increlex jest dla monitora preparatem dobowym i zapisuje dawkę z formularza).
    odmowa('zmiana preparatu na Ngenla bez nowej dawki', { ghEditDrug: 'Ngenla 60 mg' }, DANE),
    e(`${modulDawki ? 'odmowa: ' : ''}zmiana preparatu na Increlex bez nowej dawki`, { ghEditDrug: 'Increlex 40 mg' }, {
      komunikat: modulDawki ? DANE : null,
    }),
    odmowa('pusty preparat', { ghEditDrug: '', ghEditDose: '0.9' }, PROGRAM_KARTA),
    // #therProg bez wyboru: F() wpisuje program Włączenia, którego nie ma na liście programów.
    odmowa('pusty program (Włączenie z programem spoza listy)', { ghEditHeight: '139' }, PROGRAM_KARTA, {
      punkty: [{ ...WLACZENIE, program: 'Program fikcyjny spoza listy' }, KONTYNUACJA],
    }),
    odmowa('zła masa przed pustym preparatem (kolejność sprawdzeń)', { ghEditDrug: '', ghEditDose: '0.9', ghEditWeight: '0' }, DANE),
  ];
}

// Przypadki, w których monitor nie zrobił tego, co zapowiada przypadek (zapis albo odmowa podanym tekstem).
const pozaZamierzeniem = (wyniki, przypadki) => przypadki
  .map((p, i) => [p.opis, wyniki[i].monitor.zapis, wyniki[i].monitor.komunikat, p.komunikat])
  .filter(([, zapis, tekst, oczekiwany]) => tekst !== oczekiwany || zapis !== (oczekiwany === null))
  .map(([opis, , tekst]) => `${opis} → ${tekst ?? 'zapis'}`);

/* ---------- Przypadki ze złotej siatki (tests/scripts/gh-punkty-wzorzec.mjs) ---------- */

const SIATKA = siatka();
const zSiatki = (p) => ({
  opis: p.id, modulDawki: p.modulDawki, punkty: LISTY[p.lista], sciezka: p.sciezka === 'Z4' ? 'wsteczny' : 'edycja',
  pola: p.pola, cel: p.cel, typ: p.typ,
});
const SIATKA_Z2_Z4 = SIATKA.filter((p) => p.sciezka === 'Z2' || p.sciezka === 'Z4');
const REPREZENTATYWNE = (() => {
  const ids = new Set(idReprezentatywnych(SIATKA));
  return SIATKA_Z2_Z4.filter((p) => ids.has(p.id)).map(zSiatki);
})();

/* ---------- Testy ---------- */

describe('VildaGhPunkty ↔ żywy monitor — okno atrapy', () => {
  it('loadBrowserScript ładuje API do okna monitora: z modułem dawki niczego nie wykonuje ponownie, bez niego wnosi moduł dawki, który zdejmujemy', () => {
    const z = utworzAtrapeMonitoraGh({ modulPunktow: false });
    expect(z.win.VildaGhPunkty).toBeUndefined();
    const dawka = z.win.VildaGhDawka;
    expect(typeof dawka.preparat).toBe('function');
    loadBrowserScript('vilda_gh_punkty.js', z.win);
    expect(z.win.VildaGhDawka).toBe(dawka);
    expect(z.win.VildaGhPunkty.wersja).toBe(2);
    // Monitor sprzed API w atrapie z API: API nie zostaje w oknie (dawny monitor i tak go nie zna).
    const zApi = atrapaZApi();
    expect(zApi.atrapa.win.VildaGhPunkty).toBeUndefined();
    expect(zApi.api.wersja).toBe(2);

    const bez = atrapaZApi({ modulDawki: false });
    expect(bez.atrapa.win.VildaGhDawka).toBeUndefined();
    expect(bez.atrapa.win.VildaGhDawkaDane).toBeUndefined();
    expect(bez.api.gotowe({ dawka: true }).braki).toEqual(['VildaGhDawka.preparat']);
    // Strażnik wariantu: bez modułu dawki monitor zapisuje Increlex bez × 2 (etykieta „mg/dobę”), z modułem — × 2.
    const increlex = { ghRetroProg: 'IGF-1', ghRetroDrug: 'Increlex 40 mg', ghRetroDose: '0.5', ghRetroWeight: '30' };
    for (const [modulDawki, doseAbs] of [[true, 1], [false, 0.5]]) {
      const w = porownaj({ modulDawki, sciezka: 'wsteczny', punkty: [], pola: { ...WSTECZNY, ...increlex } });
      expect(w.roznice, String(modulDawki)).toEqual([]);
      expect(w.monitor.lista[0].doseAbs, String(modulDawki)).toBe(doseAbs);
      expect(w.api.bezModuluDawki, String(modulDawki)).toBe(!modulDawki);
    }
  });
});

for (const modulDawki of [true, false]) {
  describe(`VildaGhPunkty ↔ żywy monitor — przypadki własne, ${modulDawki ? 'z VildaGhDawka' : 'bez VildaGhDawka'}`, () => {
    it('(a) punkt wsteczny: 7 preparatów × IGF-1, wiek, wiek kostny, rodzaje i każda odmowa — rekord, kolejność kluczy, liczby i komunikaty jak w monitorze', () => {
      const przypadki = przypadkiWsteczne(modulDawki);
      const wyniki = przypadki.map((p) => porownaj(p));

      expect(rozbieznosci(wyniki, przypadki)).toEqual([]);
      expect(pozaZamierzeniem(wyniki, przypadki)).toEqual([]);
      // Pokrycie: każdy preparat zapisany, każdy rodzaj odmowy wystąpił.
      const zapisane = new Set(wyniki.filter((w) => w.monitor.zapis).map((w) => w.monitor.lista.at(-1).drug));
      for (const p of PREPARATY) expect(zapisane.has(p.drug), p.drug).toBe(true);
      expect(new Set(wyniki.map((w) => w.monitor.komunikat).filter(Boolean)))
        .toEqual(new Set([DRUGIE_WLACZENIE, DRUGIE_ZAKONCZENIE, DANE, PROGRAM_WSTECZNY]));
      // -0 przechodzi do rekordu (wiek kostny, IGF-1) — porównanie Object.is ma tu czym się wykazać.
      expect(wyniki.some((w) => w.monitor.zapis && Object.is(w.monitor.lista.at(-1).boneAge, -0))).toBe(true);
      expect(wyniki.some((w) => w.monitor.zapis && Object.is(w.monitor.lista.at(-1).igf1, -0))).toBe(true);
    });

    it('(b) edycja punktu: 7 preparatów × IGF-1, wiek, wiek kostny, rodzaje, dawny format, id liczbowe i zdublowane oraz każda odmowa — lista po zapisie i komunikaty jak w monitorze', () => {
      const przypadki = przypadkiEdycji(modulDawki);
      const wyniki = przypadki.map((p) => porownaj(p));

      expect(rozbieznosci(wyniki, przypadki)).toEqual([]);
      expect(pozaZamierzeniem(wyniki, przypadki)).toEqual([]);
      // Pokrycie: każdy preparat zapisany w edytowanym punkcie, każdy rodzaj odmowy wystąpił.
      const edytowany = (w) => w.monitor.lista.find((x) => String(x.id) === String(w.cel));
      const zapisane = new Set(wyniki.filter((w) => w.monitor.zapis).map((w) => edytowany(w).drug));
      for (const p of PREPARATY) expect(zapisane.has(p.drug), p.drug).toBe(true);
      expect(new Set(wyniki.map((w) => w.monitor.komunikat).filter(Boolean)))
        .toEqual(new Set([DRUGIE_WLACZENIE, DRUGIE_ZAKONCZENIE, DANE, PROGRAM_KARTA]));
    });
  });
}

describe('VildaGhPunkty ↔ żywy monitor — złota siatka (Z2 edycja, Z4 wsteczny)', () => {
  it(`przypadki reprezentatywne wzorca (${REPREZENTATYWNE.length}), oba warianty modułu dawki, z odmowami`, () => {
    expect(REPREZENTATYWNE.length).toBeGreaterThanOrEqual(90);
    for (const k of ['Z2-modul', 'Z2-bez-modulu', 'Z4-modul', 'Z4-bez-modulu', 'Z2-odmowy', 'Z4-odmowy']) {
      expect(REPREZENTATYWNE.some((p) => p.opis.startsWith(`${k}-`)), k).toBe(true);
    }
    const wyniki = REPREZENTATYWNE.map((p) => porownaj(p));

    expect(rozbieznosci(wyniki, REPREZENTATYWNE)).toEqual([]);
  }, 60_000);

  it('co 10. przypadek siatki Z2 i Z4 (ok. 600: preparat × masa × dawka × IGF-1 × lista × typ)', () => {
    const probka = SIATKA_Z2_Z4.filter((_, i) => i % 10 === 0).map(zSiatki);
    expect(probka.length).toBeGreaterThanOrEqual(550);
    const wyniki = probka.map((p) => porownaj(p));

    expect(rozbieznosci(wyniki, probka)).toEqual([]);
    expect(wyniki.filter((w) => w.monitor.zapis).length).toBeGreaterThan(probka.length / 2);
  }, 60_000);
});

describe('VildaGhPunkty ↔ żywy monitor — pozostałe reguły formularzy', () => {
  it('dostepneRodzaje(wczytaj()) = opcje formularza wstecznego po otwarciu (ghRetroSyncTypeOptions): aktywne Włączenie i Zakończenie oraz rodzaj wybrany', () => {
    const listy = [[], [WLACZENIE], [WLACZENIE, ZAKONCZENIE], [ZAKONCZENIE], [KONTYNUACJA], [WLACZENIE, WLACZENIE_2],
      [WLACZENIE, DAWNY]];
    for (const modulDawki of [true, false]) {
      for (const punkty of listy) {
        const opis = `${modulDawki}: ${punkty.map((p) => p.type).join(',') || 'pusta'}`;
        const { atrapa, api } = atrapaZApi({ modulDawki, punkty });
        atrapa.kliknij('btnGhRetro');
        const sel = atrapa.pole('ghRetroType');
        const opcja = (v) => sel.options.find((o) => o.value === v);
        const monitor = { start: !opcja('start').disabled, end: !opcja('end').disabled, domyslny: sel.value };

        expect(roznice(api.dostepneRodzaje(api.wczytaj()), monitor), opis).toEqual([]);
      }
    }
  });

  it('edycja punktu usuniętego w innej ramce po otwarciu formularza: oba bez zapisu; monitor pokazuje tekst Z3, a API zwraca brak-punktu bez komunikatu i niczego nie dopisuje', () => {
    for (const modulDawki of [true, false]) {
      const { atrapa, api, klikniecia } = atrapaZApi({ modulDawki, punkty: [WLACZENIE, KONTYNUACJA] });
      atrapa.edytuj(KONTYNUACJA.id, { ghEditHeight: '139' });
      atrapa.ustawModul([WLACZENIE]);
      atrapa.kliknij('btnGhContinue');

      expect(klikniecia).toHaveLength(1);
      const [klik] = klikniecia;
      const wpisy = atrapa.dziennik.slice(klik.od);
      expect(rodzaje(wpisy)).toEqual(['E', 'K']);
      expect(wpisy[1].tekst).toBe(SPOZA_LISTY);
      const wynik = wynikApi(api, klik, KONTYNUACJA.id, null);
      expect(wynik).toMatchObject({ zapis: false, komunikat: null, kod: 'brak-punktu' });
      expect(roznice(wynik.lista, atrapa.stan().okno)).toEqual([]);
      expect(roznice(wynik.lista, [WLACZENIE])).toEqual([]);
    }
  });

  // Pusty wpis (null) w pamięci modułu, który pojawił się po starcie monitora (P-GH-PUNKTY-API rata 2, decyzja
  // właściciela 2026-10-07: API ściśle jak monitor). Wyjątek rzucają oba tam, gdzie stary kod, a tam, gdzie stary kod
  // zapisuje, API daje tę samą listę.
  it('null na liście: API rzuca wyjątek tam, gdzie monitor, i zapisuje tam, gdzie monitor zapisuje', () => {
    const WSTECZNY = {
      ghRetroType: 'start', ghRetroProg: 'SNP', ghRetroDrug: 'Omnitrope 10 mg', ghRetroAge: '9', ghRetroAgeMonths: '6',
      ghRetroWeight: '32', ghRetroHeight: '133', ghRetroDose: '0.96',
    };
    for (const modulDawki of [true, false]) {
      // (a) punkt wsteczny „Włączenie” przy liście [null]: oba TypeError, bez zapisu
      const a = atrapaZApi({ modulDawki, punkty: [] });
      a.atrapa.kliknij('btnGhRetro');
      for (const [k, v] of Object.entries(WSTECZNY)) a.atrapa.ustaw(k, v);
      a.atrapa.ustawModul([null]);
      expect(() => a.atrapa.kliknij('btnGhRetroAdd')).toThrow(TypeError);
      expect(a.klikniecia).toHaveLength(1);
      expect(rodzaje(a.atrapa.dziennik.slice(a.klikniecia[0].od))).toEqual(['E']);
      expect(a.atrapa.stan().modul).toEqual([null]);
      expect(() => wynikApi(a.api, a.klikniecia[0], null, 'fikc-nowy')).toThrow(TypeError);

      // (b) edycja Kontynuacji, gdy przed nią pojawił się null: oba TypeError, bez zapisu
      const b = atrapaZApi({ modulDawki, punkty: [KONTYNUACJA] });
      b.atrapa.edytuj(KONTYNUACJA.id, { ghEditHeight: '139' });
      b.atrapa.ustawModul([null, KONTYNUACJA]);
      expect(() => b.atrapa.kliknij('btnGhContinue')).toThrow(TypeError);
      expect(rodzaje(b.atrapa.dziennik.slice(b.klikniecia[0].od))).toEqual(['E']);
      expect(b.atrapa.stan().modul.map((p) => p && p.height)).toEqual([null, KONTYNUACJA.height]);
      expect(() => wynikApi(b.api, b.klikniecia[0], KONTYNUACJA.id, null)).toThrow(TypeError);

      // (c) edycja Kontynuacji z null ZA nią: stary kod zapisuje, a dopiero tabela (F) rzuca — API daje tę samą listę
      const c = atrapaZApi({ modulDawki, punkty: [KONTYNUACJA] });
      c.atrapa.edytuj(KONTYNUACJA.id, { ghEditHeight: '139' });
      c.atrapa.ustawModul([KONTYNUACJA, null]);
      expect(() => c.atrapa.kliknij('btnGhContinue')).toThrow(TypeError);
      expect(rodzaje(c.atrapa.dziennik.slice(c.klikniecia[0].od))).toEqual(['E', 'M', 'E', 'BC']);
      const edycja = wynikApi(c.api, c.klikniecia[0], KONTYNUACJA.id, null);
      expect(edycja.zapis).toBe(true);
      expect(roznice(edycja.lista, c.atrapa.stan().okno)).toEqual([]);
    }
  });
});

/* ---------- Kontrole negatywne ---------- */

// Kopia źródła monitora sprzed API zmieniona przez replace z kotwicą występującą dokładnie raz. Porównanie z API musi wykryć
// różnicę dokładnie w przypadkach, których zmiana dotyczy — także tam, gdzie toEqual by jej nie zauważył
// (kolejność kluczy, -0).
const lekKliku = (w) => w.klik.pola.ghRetroDrug ?? w.klik.pola.ghEditDrug;
const punktPrzed = (w) => w.klik.lista.find((p) => p && String(p.id) === String(w.cel));
const KONTROLE = [
  {
    nazwa: 'Increlex ×3 zamiast ×2 (Gmt)', kotwica: 'return Gmpod(d)?o*2:o', zamiana: 'return Gmpod(d)?o*3:o',
    dotyczy: (w) => w.modulDawki && w.monitor.zapis && lekKliku(w) === 'Increlex 40 mg',
  },
  {
    nazwa: 'rekord wsteczny: igf1DaysSinceDose przed igf1Unit (zmienia tylko kolejność kluczy)',
    kotwica: 'igf1Unit:"ng/mL",igf1DaysSinceDose:H', zamiana: 'igf1DaysSinceDose:H,igf1Unit:"ng/mL"',
    dotyczy: (w) => w.sciezka === 'wsteczny' && w.monitor.zapis,
  },
  {
    nazwa: 'wiek kostny punktu wstecznego: -0 → 0 (toEqual i JSON tego nie odróżniają)', kotwica: 'boneAge:isFinite(v)?v:null',
    zamiana: 'boneAge:isFinite(v)?(Object.is(v,-0)?0:v):null',
    dotyczy: (w) => w.sciezka === 'wsteczny' && w.monitor.zapis && w.klik.pola.ghRetroBoneAge === '-0',
  },
  {
    nazwa: 'tekst odmowy formularza wstecznego', kotwica: PROGRAM_WSTECZNY, zamiana: 'Wybierz program i preparat.',
    dotyczy: (w) => w.monitor.komunikat === 'Wybierz program i preparat.',
  },
  {
    nazwa: 'Ngenla: IGF-1 bez dni → 3 dni zamiast 4 (wsteczny)', kotwica: 'C!=null&&H==null&&m&&(H=4)',
    zamiana: 'C!=null&&H==null&&m&&(H=3)',
    dotyczy: (w) => w.sciezka === 'wsteczny' && w.monitor.zapis && /^Ngenla/.test(lekKliku(w))
      && w.klik.pola.ghRetroIgf1 !== '' && w.klik.pola.ghRetroIgfDays === '',
  },
  {
    nazwa: 'edycja: dni od dawki przypisane przed IGF-1 (kolejność kluczy punktu w dawnym formacie)',
    kotwica: 'c.igf1=y,c.igf1Unit=v,c.igf1DaysSinceDose=g', zamiana: 'c.igf1DaysSinceDose=g,c.igf1=y,c.igf1Unit=v',
    dotyczy: (w) => w.sciezka === 'edycja' && w.monitor.zapis && !('igf1' in punktPrzed(w)),
  },
  {
    nazwa: 'edycja: sprawdzenie drugiego Włączenia nie pomija edytowanego punktu',
    kotwica: 'c.type==="start"&&String(c.id)!==String(x)', zamiana: 'c.type==="start"',
    dotyczy: (w) => w.sciezka === 'edycja' && w.klik.typ === 'start' && punktPrzed(w).type === 'start'
      && !w.klik.lista.some((p) => p.type === 'start' && String(p.id) !== String(w.cel)),
  },
];

describe('VildaGhPunkty ↔ żywy monitor — kontrole negatywne (kopia źródła monitora po replace)', () => {
  const zrodloMonitora = zrodlo(MONITOR_PRZED_API);
  const przypadki = [...przypadkiWsteczne(true), ...przypadkiWsteczne(false), ...przypadkiEdycji(true),
    ...przypadkiEdycji(false), ...REPREZENTATYWNE];

  for (const k of KONTROLE) {
    it(`${k.nazwa}: porównanie wykrywa zmianę dokładnie tam, gdzie powinno`, () => {
      expect(zrodloMonitora.split(k.kotwica).length - 1).toBe(1);
      const zmienione = zrodloMonitora.replace(k.kotwica, () => k.zamiana);
      const zrodla = { 'gh_therapy_monitor.js': zmienione };

      const wyniki = przypadki.map((p) => porownaj(p, { zrodla }));
      const wykryte = przypadki.filter((_, i) => wyniki[i].roznice.length).map((p) => p.opis);
      const oczekiwane = przypadki.filter((_, i) => wyniki[i].klik && k.dotyczy(wyniki[i])).map((p) => p.opis);

      expect(wykryte.length).toBeGreaterThan(0);
      expect(wykryte).toEqual(oczekiwane);
    }, 60_000);
  }
});

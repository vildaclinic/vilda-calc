import { describe, expect, it } from 'vitest';
import { rodzaje, utworzAtrapeMonitoraGh } from '../support/gh-monitor-atrapa.mjs';

// P-GH-PUNKTY-USZKODZONE (rata 4). Uszkodzony wpis listy punktów terapii GH = wpis, który nie jest obiektem (null,
// liczba, napis, true/false; decyzja właściciela 2026-10-07). Na PRAWDZIWYM monitorze (gh_therapy_monitor.js)
// z prawdziwym VildaGhPunkty w atrapie tests/support/gh-monitor-atrapa.mjs:
// - monitor startuje, a tabela, licznik i wyniki monitorowania są takie jak dla listy bez uszkodzonych wpisów;
// - nad tabelą stoi ostrzeżenie; lista w oknie i w pamięci modułu zostaje bez zmian (nic nie zapisuje się samo);
// - zapis z karty, punkt wsteczny, edycja i usunięcie są wstrzymane z komunikatem i przyciskiem naprawy;
// - przycisk naprawy zapisuje listę bez uszkodzonych wpisów (ta sama kolejność punktów), a ten sam przycisk zapisu
//   działa potem jak przy liście, która nigdy nie miała uszkodzonego wpisu; „Anuluj” niczego nie zmienia.
// Teksty jak w makiecie zaakceptowanej przez właściciela 2026-10-07. Dane wyłącznie FIKCYJNE.

const punkt = (id, type, nadpisania = {}) => ({
  id, type, ageYears: 9, ageMonths: 0, weight: 32, height: 130, boneAge: null, dose: 0.025, doseUnit: 'mg/kg/d',
  drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
  ...nadpisania,
});
const WLACZENIE = punkt('fikc-start', 'start');
const KONTYNUACJA = punkt('fikc-kont', 'continue', { ageYears: 10, weight: 36, height: 138, doseAbs: 0.9, igf1: 250 });
const ZAKONCZENIE = punkt('fikc-koniec', 'end', { ageYears: 12, weight: 40, height: 150, doseAbs: 1 });
const TRZECI = punkt('fikc-inna-ramka', 'continue', { ageYears: 11, weight: 38, height: 144, doseAbs: 0.95 });
const KARTA = { drug: 'Omnitrope 10 mg', weight: 32, perDayMg: 0.8, perWeekMg: 5.6 };
const WSTECZNY = {
  ghRetroType: 'continue', ghRetroProg: 'SNP', ghRetroDrug: 'Omnitrope 10 mg', ghRetroAge: '9', ghRetroAgeMonths: '6',
  ghRetroWeight: '32', ghRetroHeight: '133', ghRetroDose: '0.96',
};

const OSTRZEZENIE = {
  1: '⚠ Lista punktów zawiera 1 uszkodzony wpis bez danych. Nie jest pokazywany w tabeli. Zapisywanie i usuwanie '
    + 'punktów jest wstrzymane, dopóki go nie usuniesz.',
  3: '⚠ Lista punktów zawiera 3 uszkodzone wpisy bez danych. Nie są pokazywane w tabeli. Zapisywanie i usuwanie '
    + 'punktów jest wstrzymane, dopóki ich nie usuniesz.',
};
const NAGLOWEK = { 1: 'Uszkodzony wpis na liście punktów', 3: 'Uszkodzone wpisy na liście punktów' };
const TRESC = {
  1: 'Nie zapisano: lista punktów leczenia tego pacjenta zawiera 1 uszkodzony wpis bez danych. Usuń go, aby zapisywać '
    + 'punkty. Pozostałe punkty się nie zmienią.',
  3: 'Nie zapisano: lista punktów leczenia tego pacjenta zawiera 3 uszkodzone wpisy bez danych. Usuń je, aby zapisywać '
    + 'punkty. Pozostałe punkty się nie zmienią.',
};
const PRZYCISK = { 1: 'Usuń uszkodzony wpis', 3: 'Usuń uszkodzone wpisy (3)' };
const SPOZA_LISTY = 'Nie zapisano zmian: edytowany punkt nie należy do bieżącej listy punktów. Otwórz edycję ponownie.';
const ODSWIEZ = 'Nie zapisano: aplikacja nie wczytała się w całości. Odśwież stronę i spróbuj ponownie.';

const bezUszkodzonych = (lista) => lista.filter((c) => Object(c) === c);
const kanon = (v) => JSON.stringify(v, (_k, x) => (x === undefined ? '#undefined' : x));
const zapisy = (wpisy) => rodzaje(wpisy).filter((r) => r === 'M' || r === 'RM' || r === 'BC');
const przyciskWNakladce = (a, napis) => {
  const o = a.pole('ghInfoOverlay');
  return o ? o.querySelectorAll('button').find((b) => b.textContent === napis) || null : null;
};

// Listy z uszkodzonymi wpisami (stan modułu przed startem monitora) i ich liczba.
const LISTY = [
  ['[Włączenie, null, Kontynuacja]', [WLACZENIE, null, KONTYNUACJA], 1],
  ['[null]', [null], 1],
  ['[null, Włączenie]', [null, WLACZENIE], 1],
  ['[Kontynuacja, null, Zakończenie]', [KONTYNUACJA, null, ZAKONCZENIE], 1],
  ['[Włączenie, 5, "x", true, Kontynuacja]', [WLACZENIE, 5, 'x', true, KONTYNUACJA], 3],
];

// Licznik wywołań VildaGhPunkty (jak w gh-punkty-monitor-tryby.test.mjs).
function zliczajApi(atrapa) {
  const api = atrapa.win.VildaGhPunkty;
  const wywolania = [];
  const licznik = { wersja: api.wersja, KLUCZE: api.KLUCZE, RODZAJE: api.RODZAJE, KOMUNIKATY: api.KOMUNIKATY };
  for (const [k, f] of Object.entries(api)) {
    if (typeof f === 'function') licznik[k] = (...a) => { wywolania.push(k); return f(...a); };
  }
  atrapa.win.VildaGhPunkty = licznik;
  return wywolania;
}

describe('P-GH-PUNKTY-USZKODZONE: monitor przy uszkodzonej liście startuje, a dane zostają bez zmian', () => {
  it.each(LISTY)('%s: tabela, licznik i wyniki jak bez uszkodzonych wpisów; ostrzeżenie nad tabelą; nic nie zapisuje się samo', (_opis, lista, n) => {
    const u = utworzAtrapeMonitoraGh({ punkty: lista });
    const czysta = utworzAtrapeMonitoraGh({ punkty: bezUszkodzonych(lista) });

    expect(typeof u.win.refreshGHTherapyMonitor).toBe('function');
    expect(typeof u.win.ghAddTherapyPoint).toBe('function');
    expect(u.idWierszy()).toEqual(czysta.idWierszy());
    expect(u.pole('ghTabMonCount').textContent).toBe(String(bezUszkodzonych(lista).length));
    expect(u.stan().znaczniki).toEqual(czysta.stan().znaczniki);
    expect(kanon(u.win.ghTherapyMetrics)).toBe(kanon(czysta.win.ghTherapyMetrics));
    expect(u.pole('ghTherapyTbody').textContent).toBe(czysta.pole('ghTherapyTbody').textContent);

    expect(u.pole('ghTherapyDamagedNote').textContent).toBe(OSTRZEZENIE[n]);
    expect(u.pole('ghTherapyDamagedNote').getAttribute('role')).toBe('status');
    expect(czysta.pole('ghTherapyDamagedNote') === null).toBe(true);

    // Lista w oknie (z niej zapis stanu DocPro odtwarza pamięć modułu) i w pamięci modułu bez zmian; start bez zapisu.
    expect(kanon(u.stan().okno)).toBe(kanon(lista));
    expect(u.stan().modulSurowy).toBe(JSON.stringify(lista));
    expect(zapisy(u.dziennikStartu)).toEqual([]);
    expect(u.ostrzezenia).toEqual([]);
  });

  it('lista z samych uszkodzonych wpisów: „Brak zapisanych punktów leczenia.” i ostrzeżenie', () => {
    const u = utworzAtrapeMonitoraGh({ punkty: [null, 5] });
    expect(u.idWierszy()).toEqual([]);
    expect(u.pole('ghTherapyTbody').textContent).toBe('Brak zapisanych punktów leczenia.');
    expect(u.pole('ghTherapyDamagedNote').textContent).toContain('2 uszkodzone wpisy bez danych');
  });
});

// Czynności lekarza: przygotowanie (przed zapisem), zapis, ponowienie po naprawie. `formularz` — który formularz ma
// zostać otwarty po odmowie.
const CZYNNOSCI = [
  ...['start', 'continue', 'end'].map((typ) => ({
    nazwa: `karta: ${typ}`, lista: typ === 'start' ? [null, KONTYNUACJA] : [WLACZENIE, null, KONTYNUACJA],
    zapis: (a) => a.dodajZKarty(typ), formularz: null,
  })),
  { nazwa: 'edycja punktu z listy', lista: [WLACZENIE, KONTYNUACJA, null],
    przed: (a) => a.edytuj(KONTYNUACJA.id, { ghEditHeight: '139', ghEditWeight: '36.4' }),
    zapis: (a) => a.kliknij('btnGhContinue'), formularz: 'edycjaWidoczna' },
  // Uszkodzony wpis PRZED edytowanym punktem: otwarcie edycji (szukanie punktu po id) go pomija.
  { nazwa: 'edycja punktu za uszkodzonym wpisem', lista: [WLACZENIE, null, KONTYNUACJA],
    przed: (a) => a.edytuj(KONTYNUACJA.id, { ghEditHeight: '139' }),
    zapis: (a) => a.kliknij('btnGhContinue'), formularz: 'edycjaWidoczna' },
  { nazwa: 'punkt wsteczny', lista: [null, WLACZENIE],
    przed: (a) => { a.kliknij('btnGhRetro'); for (const [id, v] of Object.entries(WSTECZNY)) a.ustaw(id, v); },
    zapis: (a) => a.kliknij('btnGhRetroAdd'), formularz: 'wstecznyWidoczny' },
  { nazwa: 'usunięcie punktu', lista: [WLACZENIE, null, KONTYNUACJA],
    zapis: (a) => a.usun(KONTYNUACJA.id), formularz: null },
];

describe('P-GH-PUNKTY-USZKODZONE: zapis i usunięcie wstrzymane z komunikatem; przycisk naprawy', () => {
  it.each(CZYNNOSCI.map((c) => [c.nazwa, c]))('%s: odmowa, naprawa, ten sam przycisk zapisuje jak przy liście bez uszkodzonego wpisu', (_n, cz) => {
    const a = utworzAtrapeMonitoraGh({ punkty: cz.lista, ghTherapyCalc: KARTA });
    if (cz.przed) cz.przed(a);
    const api = zliczajApi(a);
    const przed = a.stan();

    expect(() => cz.zapis(a)).not.toThrow();
    const po = a.stan();
    const nowe = po.dziennik.slice(przed.dziennik.length);
    // Odmowa: nagłówek, treść i przycisk z makiety; bez zapisu modułu, kanału i wskaźnika; lista bez zmian.
    expect(nowe.at(-1)).toEqual({ rodzaj: 'K', naglowek: NAGLOWEK[1], tekst: TRESC[1] });
    expect(zapisy(nowe)).toEqual([]);
    expect(kanon(po.okno)).toBe(kanon(przed.okno));
    expect(po.modulSurowy).toBe(przed.modulSurowy);
    expect(po.powiadomienia).toEqual(przed.powiadomienia);
    expect(a.pole('ghDamagedRemoveBtn').textContent).toBe(PRZYCISK[1]);
    if (cz.formularz) expect(po[cz.formularz]).toBe(true);
    // Bramka zapada przed regułami punktu: z API tylko liczba uszkodzonych wpisów i teksty.
    expect(api.filter((k) => k !== 'uszkodzone' && k !== 'komunikatyUszkodzonych')).toEqual([]);
    expect(a.ostrzezenia).toEqual([]);

    // Naprawa: dokładnie jeden zapis modułu z listą bez uszkodzonych wpisów, potem zdarzenie i kanał.
    const odNaprawy = a.stan().dziennik.length;
    a.kliknij('ghDamagedRemoveBtn');
    const naprawa = a.stan().dziennik.slice(odNaprawy);
    expect(zapisy(naprawa)).toEqual(['M', 'BC']);
    const m = naprawa.find((w) => w.rodzaj === 'M');
    expect(kanon(m.wartosc)).toBe(kanon(bezUszkodzonych(cz.lista)));
    expect(m.opcje).toEqual({ force: true });
    expect(a.stan().modulSurowy).toBe(JSON.stringify(bezUszkodzonych(cz.lista)));
    expect(a.stan().komunikat).toBeNull();
    expect(a.pole('ghTherapyDamagedNote') === null).toBe(true);
    expect(a.stan().powiadomienia.at(-1)).toBe('gh-damaged-entries-removed');
    if (cz.formularz) expect(a.stan()[cz.formularz]).toBe(true);

    // Ten sam przycisk jeszcze raz: wynik jak na monitorze, który nigdy nie miał uszkodzonego wpisu.
    if (cz.formularz === 'edycjaWidoczna') a.kliknij('btnGhContinue');
    else if (cz.formularz === 'wstecznyWidoczny') a.kliknij('btnGhRetroAdd');
    else cz.zapis(a);
    const wzor = utworzAtrapeMonitoraGh({ punkty: bezUszkodzonych(cz.lista), ghTherapyCalc: KARTA });
    if (cz.przed) cz.przed(wzor);
    cz.zapis(wzor);
    expect(rodzaje(a.stan().dziennik).slice(-3)).toEqual(['M', 'E', 'BC']);
    expect(a.stan().modulSurowy).toBe(wzor.stan().modulSurowy);
    expect(a.idWierszy()).toEqual(wzor.idWierszy());
    expect(a.ostrzezenia).toEqual([]);
  });

  it('trzy uszkodzone wpisy: tekst i przycisk w liczbie mnogiej; naprawa zostawia punkty w tej samej kolejności', () => {
    const lista = [WLACZENIE, 5, 'x', true, KONTYNUACJA];
    const a = utworzAtrapeMonitoraGh({ punkty: lista, ghTherapyCalc: KARTA });
    a.dodajZKarty('end');
    expect(a.stan().dziennik.at(-1)).toEqual({ rodzaj: 'K', naglowek: NAGLOWEK[3], tekst: TRESC[3] });
    expect(a.pole('ghDamagedRemoveBtn').textContent).toBe(PRZYCISK[3]);
    expect(a.pole('ghTherapyDamagedNote').textContent).toBe(OSTRZEZENIE[3]);
    a.kliknij('ghDamagedRemoveBtn');
    expect(JSON.parse(a.stan().modulSurowy)).toEqual([WLACZENIE, KONTYNUACJA]);
  });

  it('„Anuluj” zamyka komunikat i niczego nie zmienia; ostrzeżenie zostaje', () => {
    const lista = [WLACZENIE, null, KONTYNUACJA];
    const a = utworzAtrapeMonitoraGh({ punkty: lista, ghTherapyCalc: KARTA });
    a.dodajZKarty('continue');
    const od = a.stan().dziennik.length;
    a.kliknij(przyciskWNakladce(a, 'Anuluj'));
    expect(a.stan().komunikat).toBeNull();
    expect(a.stan().dziennik.slice(od)).toEqual([]);
    expect(a.stan().modulSurowy).toBe(JSON.stringify(lista));
    expect(a.pole('ghTherapyDamagedNote').textContent).toBe(OSTRZEZENIE[1]);
  });

  it('naprawa czyta listę na nowo: punkt dopisany w innej ramce zostaje', () => {
    const a = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, null, KONTYNUACJA], ghTherapyCalc: KARTA });
    a.dodajZKarty('continue');
    a.ustawModul([WLACZENIE, null, KONTYNUACJA, TRZECI]);
    a.kliknij('ghDamagedRemoveBtn');
    expect(JSON.parse(a.stan().modulSurowy)).toEqual([WLACZENIE, KONTYNUACJA, TRZECI]);
    expect(a.idWierszy()).toContain(TRZECI.id);
  });

  it('naprawa w innej ramce: po odświeżeniu z innej ramki ostrzeżenie znika, a zapis działa bez komunikatu', () => {
    const a = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, null, KONTYNUACJA], ghTherapyCalc: KARTA });
    // Inna ramka zapisała listę bez uszkodzonego wpisu; kanał gh-therapy-sync odświeża monitor (refreshGHTherapyMonitor).
    a.ustawModul([WLACZENIE, KONTYNUACJA]);
    a.win.refreshGHTherapyMonitor();
    expect(a.pole('ghTherapyDamagedNote') === null).toBe(true);
    a.dodajZKarty('continue');
    expect(a.stan().komunikat).toBeNull();
    expect(rodzaje(a.stan().dziennik).slice(-3)).toEqual(['M', 'E', 'BC']);
  });
});

describe('P-GH-PUNKTY-USZKODZONE: kolejność odmów', () => {
  it('edycja spoza bieżącej listy (P-GH-EDYCJA-LISTA) ma pierwszeństwo przed odmową z powodu uszkodzonego wpisu', () => {
    const a = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA, null] });
    a.edytuj(KONTYNUACJA.id, { ghEditHeight: '139' });
    a.ustawModul([WLACZENIE, null]);
    a.kliknij('btnGhContinue');
    expect(a.stan().komunikat).toBe(SPOZA_LISTY);
  });

  it('bez zgodnego modułu VildaGhPunkty: prośba o odświeżenie strony (bez API nie da się ocenić ani naprawić listy)', () => {
    const a = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, null, KONTYNUACJA], modulPunktow: false, ghTherapyCalc: KARTA });
    // Bez API monitor startuje i pokazuje tabelę; ostrzeżenia nie ma (teksty i naprawa należą do API).
    expect(a.idWierszy()).toEqual([WLACZENIE.id, KONTYNUACJA.id]);
    expect(a.pole('ghTherapyDamagedNote') === null).toBe(true);
    a.dodajZKarty('continue');
    expect(a.stan().komunikat).toBe(ODSWIEZ);
    expect(a.pole('ghDamagedRemoveBtn') === null).toBe(true);
  });

  it('API zmienione między odmową a kliknięciem naprawy: naprawa też prosi o odświeżenie i niczego nie zapisuje', () => {
    const a = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, null, KONTYNUACJA], ghTherapyCalc: KARTA });
    a.dodajZKarty('continue');
    a.win.VildaGhPunkty = { wersja: 2 };
    const od = a.stan().dziennik.length;
    a.kliknij('ghDamagedRemoveBtn');
    expect(zapisy(a.stan().dziennik.slice(od))).toEqual([]);
    expect(a.stan().komunikat).toBe(ODSWIEZ);
    expect(a.stan().modulSurowy).toBe(JSON.stringify([WLACZENIE, null, KONTYNUACJA]));
  });
});

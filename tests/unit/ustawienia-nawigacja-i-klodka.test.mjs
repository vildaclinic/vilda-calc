import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plik = (n) => readFileSync(path.join(repoRoot, n), 'utf8');

// Rata porządkowa z audytu sekcji „Ustawienia" — U4, U5, U6.
//
// U4 — mechanizm kłódki (inline_ustawienia_07.js) już istniał i obejmował Kopie zapasowe,
//      Synchronizację i Konto. „Logowanie na innych urządzeniach" go NIE miało, choć wszystkie
//      trzy metody w tej sekcji wymagają odblokowanego sejfu: wylogowany użytkownik widział
//      otwartą sekcję z trzema wyszarzonymi przyciskami i żadnego powodu, dlaczego nie działają.
//
// U5 — trzynaście sekcji, dwanaście pozycji w podnawigacji. Wypadła „Widoczność elementów
//      siatek centylowych" — sekcja, która zmienia wytwarzany dokument, więc akurat nie ta,
//      którą warto chować.
//
// U6 — `document.querySelector(hash)` rzuca wyjątkiem, gdy hasz nie jest poprawnym selektorem
//      CSS („#3", trasa SPA „#!/start"). Wyjątek leciał z bloku DOMContentLoaded i przerywał go
//      razem z rejestracją nasłuchu `hashchange` — jeden taki adres wyłączał deep-linki na całą
//      wizytę, nie tylko dla siebie.

describe('U5: każda sekcja Ustawień ma pozycję w podnawigacji', () => {
  const html = () => plik('ustawienia.html');

  // Reguła strukturalna, nie lista nazw: nowa sekcja bez pozycji w menu zapali ten test sama.
  const sekcje = (s) => [...s.matchAll(/<details class="settings-accordion[^"]*" id="(settings-section-[a-z-]+)"/g)]
    .map((m) => m[1]);
  const pozycje = (s) => [...s.matchAll(/class="settings-subnav-link" data-target="(settings-section-[a-z-]+)"/g)]
    .map((m) => m[1]);

  it('nie ma sekcji bez pozycji w menu', () => {
    const s = html();
    const brakujace = sekcje(s).filter((id) => !pozycje(s).includes(id));
    expect(brakujace, 'sekcja bez pozycji w podnawigacji jest praktycznie nie do znalezienia')
      .toEqual([]);
  });

  it('nie ma pozycji w menu bez sekcji', () => {
    const s = html();
    const wiszace = pozycje(s).filter((id) => !sekcje(s).includes(id));
    expect(wiszace, 'martwa pozycja menu prowadziłaby donikąd').toEqual([]);
  });

  it('pozycja „Widoczność elementów siatek centylowych" stoi w grupie Wykresy', () => {
    const s = html();
    const grupa = s.slice(s.indexOf('>Wykresy<'), s.indexOf('>Kopie<'));
    expect(grupa, 'to ustawienie zmienia siatkę i PDF, więc należy do Wykresów')
      .toContain('data-target="settings-section-chart-visibility"');
  });

  it('kolejność menu zgadza się z kolejnością sekcji na stronie', () => {
    // Podświetlanie aktywnej pozycji jedzie z IntersectionObserver, więc menu w innej
    // kolejności niż strona skakałoby przy przewijaniu.
    const s = html();
    expect(pozycje(s)).toEqual(sekcje(s));
  });

  it('„Strefa niebezpieczna" celowo zostaje poza menu', () => {
    // Kontrola negatywna reguły: ta sekcja ma inny identyfikator i jest chowana w całości
    // po wylogowaniu, więc nie podlega dopasowaniu sekcja↔menu.
    const s = html();
    expect(s).toContain('id="dangerZoneAccordion"');
    expect(pozycje(s)).not.toContain('dangerZoneAccordion');
  });
});

describe('U4: kłódka na sekcjach wymagających logowania', () => {
  const zrodlo = () => plik('inline_ustawienia_07.js');
  const lista = () => {
    const m = zrodlo().match(/var f=\[([^\]]*)\]/);
    return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  };

  it('„Logowanie na innych urządzeniach" jest pod kłódką', () => {
    expect(lista(), 'wszystkie trzy metody w tej sekcji wymagają odblokowanego sejfu')
      .toContain('settings-section-login');
  });

  it('pozostałe bramkowane sekcje zostają pod kłódką', () => {
    // Kontrola dodatnia: te trzy działały przed zmianą i mają działać dalej.
    for (const id of ['settings-section-backup', 'settings-section-sync', 'settings-section-account']) {
      expect(lista()).toContain(id);
    }
  });

  it('sekcje działające bez konta zostają otwarte', () => {
    // Kontrola negatywna: kłódka na wyglądzie czy siatkach byłaby zwykłym utrudnieniem —
    // te ustawienia są lokalne i działają bez logowania.
    for (const id of ['settings-section-appearance', 'settings-section-mobile',
      'settings-section-chart', 'settings-section-chart-visibility', 'settings-section-pal']) {
      expect(lista(), `${id} nie wymaga konta`).not.toContain(id);
    }
  });

  it('kłódka gasi też pozycję w podnawigacji', () => {
    // Bez tego menu prowadziłoby do sekcji, której nie da się otworzyć.
    expect(zrodlo()).toContain('.settings-subnav-link[data-target="');
  });
});

describe('U6: deep-link po haszu nie wywraca strony', () => {
  const blok = () => {
    const s = plik('ustawienia.html');
    const i = s.indexOf('function openSectionFromHash');
    expect(i, 'blok deep-linku istnieje').toBeGreaterThan(-1);
    return s.slice(i, s.indexOf('</script>', i));
  };
  // Komentarze opisują naprawiony błąd i cytują starą wersję, więc asercje o KODZIE
  // muszą je najpierw odciąć — inaczej test czytałby własną dokumentację.
  const kod = () => blok().split('\n').map((w) => w.replace(/\/\/.*$/, '')).join('\n');

  it('szuka po identyfikatorze, a nie selektorem CSS', () => {
    const s = kod();
    expect(s, 'querySelector(hash) rzuca na „#3" i „#!/start"').not.toContain('querySelector(hash)');
    expect(s).toContain('getElementById(');
  });

  it('nasłuch hashchange rejestruje się przed pierwszym wywołaniem', () => {
    const s = kod();
    const nasluch = s.indexOf("addEventListener('hashchange'");
    const wywolanie = s.indexOf('openSectionFromHash();');
    expect(nasluch, 'nasłuch obecny').toBeGreaterThan(-1);
    expect(wywolanie, 'pierwsze wywołanie obecne').toBeGreaterThan(-1);
    expect(nasluch, 'gdyby pierwsze wywołanie padło, kolejne zmiany hasza mają dalej działać')
      .toBeLessThan(wywolanie);
  });

  it('nie otwiera sekcji zamkniętej na kłódkę', () => {
    expect(kod(), 'inaczej wynik zależałby od kolejności ładowania skryptów')
      .toContain('settings-accordion--locked');
  });
});

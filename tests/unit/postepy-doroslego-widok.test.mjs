import { describe, expect, it } from 'vitest';
import { zrodlo } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-POSTEPY rata 2 — warstwa widoku. Testy wołają PRAWDZIWY `buildHtml` na modelu z
// PRAWDZIWEGO `analizuj`; nigdzie nie ma ręcznie sklejonego modelu, bo taki model utrwalałby
// kształt, którego silnik może już nie produkować.

function moduly() {
  const g = loadBrowserScript('vilda_postepy_doroslego_ui.js', {});
  return { P: g.VildaPostepyDoroslego, U: g.VildaPostepyDoroslegoUI };
}

const SERIA_REDUKCJA = [
  { dateISO: '2026-01-08', weight: 112.4, height: 167 },
  { dateISO: '2026-03-05', weight: 104.1, height: 167 },
  { dateISO: '2026-05-14', weight: 96.2, height: 167 },
  { dateISO: '2026-09-10', weight: 88.6, height: 167 },
];
const SERIA_ODZYSK = [
  { dateISO: '2026-01-01', weight: 120, height: 170 },
  { dateISO: '2026-04-02', weight: 108, height: 170 },
  { dateISO: '2026-07-02', weight: 100, height: 170 },
  { dateISO: '2026-10-01', weight: 114, height: 170 },
];

const model = (opts) => moduly().P.analizuj(opts);
const html = (opts) => moduly().U.buildHtml(model(opts));

describe('P-POSTEPY widok — co się rysuje', () => {
  it('dorosły z serią dostaje SVG, kafelki i stopkę', () => {
    const h = html({ wiekLat: 47, lek: 'Wegovy', pomiary: SERIA_REDUKCJA });
    expect(h).toContain('<svg');
    expect(h).toContain('vilda-pd-tiles');
    expect(h).toContain('Postępy redukcji masy ciała');
    expect(h, 'ostatnia masa podpisana').toContain('88,6 kg');
  });

  it('SVG skaluje się do szerokości rodzica — bez poziomego przewijania na telefonie', () => {
    const h = html({ wiekLat: 47, lek: 'Wegovy', pomiary: SERIA_REDUKCJA });
    expect(h).toContain('viewBox="0 0 720 360"');
    expect(h).toContain('width="100%"');
    expect(h).toContain('max-width:100%');
    expect(h, 'żadnej sztywnej szerokości w pikselach').not.toMatch(/<svg[^>]*width="\d+"/);
  });

  it('brama zamknięta → pusto, a nie połowa wykresu', () => {
    const { U } = moduly();
    expect(U.buildHtml(model({ wiekLat: 12, pomiary: SERIA_REDUKCJA })), 'dziecko').toBe('');
    expect(U.buildHtml(model({ wiekLat: 47, pomiary: SERIA_REDUKCJA.slice(0, 1) })), 'jeden pomiar').toBe('');
    expect(U.buildHtml(null)).toBe('');
  });

  it('komunikat zastępczy cytuje powód z silnika, nie wymyśla własnego', () => {
    const { U } = moduly();
    const m = model({ wiekLat: 12, pomiary: SERIA_REDUKCJA });
    expect(U.buildPustyHtml(m)).toContain(m.dostepne.opis);
  });
});

describe('P-POSTEPY widok — nic nie pojawia się bez pokrycia w modelu', () => {
  it('linia istotnego odzysku tylko wtedy, gdy model ją dopuszcza', () => {
    const wTrakcie = html({ wiekLat: 47, lek: 'Wegovy', pomiary: SERIA_REDUKCJA });
    expect(wTrakcie, 'nadir to ostatni pomiar — nie ma czego mierzyć').not.toContain('istotny odzysk');

    const poOdzysku = html({ wiekLat: 52, lek: 'Saxenda', pomiary: SERIA_ODZYSK });
    expect(poOdzysku).toContain('istotny odzysk');
  });

  it('punkt decyzyjny ChPL tylko dla leku, który go ma', () => {
    const lira = html({ wiekLat: 47, lek: 'Saxenda', pomiary: SERIA_REDUKCJA });
    expect(lira, 'liraglutyd: 16. tydzień').toContain('stroke-dasharray="2 3"');
    expect(lira, 'i zaznaczony okres zwiększania dawki').toContain('zwiększanie dawki');

    const sema = html({ wiekLat: 47, lek: 'Wegovy', pomiary: SERIA_REDUKCJA });
    expect(sema, 'ChPL semaglutydu nie podaje u dorosłych ani progu, ani terminu')
      .not.toContain('stroke-dasharray="2 3"');
  });

  it('stopka nazywa założenie kotwicy nominalnej', () => {
    const h = html({ wiekLat: 47, lek: 'Saxenda', pomiary: SERIA_REDUKCJA });
    expect(h).toContain('nominalnym czasie zwiększania dawki');
    expect(h).toContain('4 tyg.');
  });

  it('stopka niesie nazwę i źródło zestawu pasm', () => {
    const h = html({ wiekLat: 47, lek: 'Saxenda', pomiary: SERIA_REDUKCJA });
    expect(h).toContain('Drabinka liraglutydu');
    expect(h).toContain('ChPL liraglutydu');
  });

  it('ostrzeżenie o osi z wieku trafia na ekran, a nie tylko do modelu', () => {
    const h = html({
      wiekLat: 47,
      pomiary: [
        { ageYears: 47, ageMonths: 0, weight: 112, height: 167 },
        { ageYears: 47, ageMonths: 6, weight: 100, height: 167 },
      ],
    });
    expect(h).toContain('przybliżona');
  });

  it('po odstawieniu leku widok mówi, że tę samą liczbę czyta się inaczej', () => {
    const pkt = (typ, dateISO, masa) => ({
      id: typ, type: typ, dateISO, weight: masa, height: 170,
      ageYears: 52, ageMonths: 0, drug: 'Saxenda', substance: 'liraglutide',
    });
    const h = moduly().U.buildHtml(model({
      wiekLat: 52, lek: 'Saxenda', pomiary: SERIA_ODZYSK,
      punktyLeczenia: [pkt('start', '2026-01-01', 120), pkt('end', '2026-07-02', 100)],
    }));
    expect(h).toContain('Leczenie odstawione');
    expect(h).toContain('odzysk masy jest zjawiskiem typowym');
  });
});

describe('P-POSTEPY widok — granice warstwy', () => {
  it('widok nie trzyma żadnego progu ani pasma', () => {
    // Wszystko, co liczbowe, ma przyjść z modelu. Gdyby widok znał własne pasma, zmiana
    // w pliku danych nie ruszyłaby wykresu — i nikt by tego nie zauważył.
    const src = zrodlo('vilda_postepy_doroslego_ui.js');
    for (const zakazane of ['0.75', '0,75', 'thresholdPct', 'titrationWeeksNominal:', 'windowWeeks']) {
      expect(src, zakazane).not.toContain(zakazane);
    }
  });

  it('zmiana pasm w pliku danych przechodzi na wykres', () => {
    // Kontrola pozytywna do testu wyżej: widok naprawdę czyta pasma z modelu.
    const { U } = moduly();
    const wlasny = { id: 'TEST', nazwa: 'Zestaw testowy', progi: [7], zrodlo: 'dane testowe' };
    const h = U.buildHtml(model({ wiekLat: 47, zestaw: wlasny, pomiary: SERIA_REDUKCJA }));
    expect(h).toContain('−7%');
    expect(h).toContain('Zestaw testowy');
    expect(h).not.toContain('−10%');
  });

  it('widok nie dotyka DOM-u poza tym, co dostał', () => {
    const src = zrodlo('vilda_postepy_doroslego_ui.js');
    for (const zakazane of ['document.querySelector(', 'document.getElementById(', 'localStorage', 'VildaVault']) {
      expect(src, zakazane).not.toContain(zakazane);
    }
  });

  it('teksty z modelu są escapowane', () => {
    const { U } = moduly();
    const wlasny = { id: 'X', nazwa: '<script>alert(1)</script>', progi: [5], zrodlo: 'a & b' };
    const h = U.buildHtml(model({ wiekLat: 47, zestaw: wlasny, pomiary: SERIA_REDUKCJA }));
    expect(h).not.toContain('<script>alert(1)</script>');
    expect(h).toContain('&lt;script&gt;');
    expect(h).toContain('a &amp; b');
  });
});

describe('P-POSTEPY rata 2 — wpięcie w strony i service worker', () => {
  const STRONY = ['app.html', 'docpro.html', 'index.html', 'kalkulator-klirens.html',
    'notatki.html', 'subskrypcja.html', 'terminarz.html', 'ustawienia.html'];

  it.each(STRONY)('%s ładuje trzy moduły postępów przed Kartą Pacjenta', (strona) => {
    const s = zrodlo(strona);
    const iDane = s.indexOf('vilda_postepy_doroslego_dane.js');
    const iSilnik = s.indexOf('vilda_postepy_doroslego.js?');
    const iWidok = s.indexOf('vilda_postepy_doroslego_ui.js');
    const iKarta = s.indexOf('vilda_auth_ui.js?v=');   // tag skryptu, nie wzmianka w komentarzu
    expect(iDane, 'plik danych').toBeGreaterThan(-1);
    expect(iSilnik, 'silnik').toBeGreaterThan(-1);
    expect(iWidok, 'widok').toBeGreaterThan(-1);
    expect(iSilnik, 'dane przed silnikiem').toBeGreaterThan(iDane);
    expect(iWidok, 'silnik przed widokiem').toBeGreaterThan(iSilnik);
    expect(iKarta, 'wszystko przed Kartą Pacjenta').toBeGreaterThan(iWidok);
  });

  it('service worker precachuje wszystkie trzy', () => {
    const sw = zrodlo('service-worker-kalorii.js');
    for (const plik of ['vilda_postepy_doroslego_dane.js', 'vilda_postepy_doroslego.js', 'vilda_postepy_doroslego_ui.js']) {
      expect(sw, plik).toContain("'/" + plik + "?v=1'");
    }
  });

  it('Karta Pacjenta montuje panel i nazywa zakładkę dla dorosłego', () => {
    const karta = zrodlo('vilda_auth_ui.js');
    expect(karta, 'montaż przez moduł widoku').toContain('_pdU.renderPanel(Ct,_pdM)');
    expect(karta, 'seria scalana regułą z silnika').toContain('_pdE.scalSerie(');
    expect(karta, 'etykieta zakładki zależy od dorosłości').toContain('at(It,tt?"Post\\u0119py":"Siatki centylowe")');
    expect(karta, 'stary komunikat o siatkach tylko dla dzieci już nie stoi sam')
      .not.toContain('text:tt?"Siatki centylowe dost\\u0119pne tylko dla dzieci');
  });
});

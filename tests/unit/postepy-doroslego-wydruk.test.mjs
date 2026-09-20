import { describe, expect, it } from 'vitest';
import { zrodlo } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-POSTEPY rata 4 — dwa warianty wydruku (decyzja właściciela: „2. poproszę dwa warianty
// do wyboru"). Testy budują dokument PRAWDZIWĄ funkcją na modelu z PRAWDZIWEGO `analizuj`.

function moduly() {
  const g = loadBrowserScript('vilda_postepy_doroslego_wydruk.js', {});
  return { P: g.VildaPostepyDoroslego, U: g.VildaPostepyDoroslegoUI, W: g.VildaPostepyDoroslegoWydruk };
}

const SERIA = [
  { dateISO: '2026-01-01', weight: 120, height: 170 },
  { dateISO: '2026-04-02', weight: 108, height: 170 },
  { dateISO: '2026-07-02', weight: 100, height: 170 },
  { dateISO: '2026-10-01', weight: 114, height: 170 },
];
const PUNKT = {
  id: 'p1', type: 'start', dateISO: '2026-01-01', weight: 120, height: 170,
  ageYears: 52, ageMonths: 0, drug: 'Saxenda (liraglutyd)', substance: 'liraglutide',
};
const OPCJE = { pacjent: 'Testowy Fikcyjny', wiekLat: 52, dataWydruku: '2026-09-20' };

const model = (extra) => moduly().P.analizuj({
  wiekLat: 52, pomiary: SERIA, punktyLeczenia: [PUNKT], ...extra,
});
const dok = (wariant, extra) => moduly().W.buildDokument(model(extra), { ...OPCJE, wariant });

describe('P-POSTEPY wydruk — dokument jest samodzielny', () => {
  it('to kompletny plik HTML, nie fragment', () => {
    const d = dok('pacjent');
    expect(d.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(d).toContain('<html lang="pl">');
    expect(d).toContain('</html>');
    expect(d).toContain('<style>');
  });

  it('nie pobiera ani jednej rzeczy z sieci — aplikacja jest PWA', () => {
    // To jest powód, dla którego wydruk NIE idzie przez html2canvas + jsPDF: obie
    // biblioteki ładują się leniwie z CDN (VildaDeps.ensurePdfLibraries).
    for (const wariant of ['pacjent', 'kliniczny']) {
      const d = dok(wariant);
      expect(d, wariant).not.toMatch(/<script/i);
      expect(d, wariant).not.toMatch(/https?:\/\//);
      expect(d, wariant).not.toMatch(/<link\b/i);
    }
  });

  it('wykres zostaje wektorowy', () => {
    expect(dok('pacjent')).toContain('<svg');
    expect(dok('pacjent'), 'żadnej rasteryzacji').not.toContain('data:image');
  });

  it('ustawia A4 i wymusza druk kolorów tła', () => {
    const d = dok('kliniczny');
    expect(d).toContain('@page{size:A4 portrait');
    expect(d).toContain('print-color-adjust:exact');
  });
});

describe('P-POSTEPY wydruk — dwa warianty różnią się TREŚCIĄ, nie technologią', () => {
  it('wariant dla pacjenta: jeden wykres, bez tabeli, bez ChPL, bez nazwy leku', () => {
    const d = dok('pacjent');
    expect((d.match(/<svg/g) || []), 'sam wykres masy').toHaveLength(1);
    expect(d).not.toContain('<table');
    expect(d, 'ChPL to decyzja lekarza o leku, nie treść dla pacjenta').not.toContain('ChPL');
    expect(d).not.toContain('Saxenda');
    expect(d).toContain('Moje postępy');
  });

  it('wariant do dokumentacji: oba wykresy, tabela pomiarów, ChPL i lek', () => {
    const d = dok('kliniczny');
    expect((d.match(/<svg/g) || []), 'masa + BMI').toHaveLength(2);
    expect(d).toContain('<table');
    expect(d).toContain('ChPL');
    expect(d, 'lek z punktu włączenia').toContain('Saxenda');
    expect(d).toContain('Postępy redukcji masy ciała');
  });

  it('tabela pomiarów ma wiersz na każdy pomiar', () => {
    const d = dok('kliniczny');
    const wiersze = (d.match(/<tr><td>/g) || []).length;
    expect(wiersze).toBe(SERIA.length);
  });

  it('punkt oceny wg ChPL znika z kartki pacjenta, ale zostaje w dokumentacji', () => {
    const m = model();
    expect(m.kamienie.map((k) => k.typ), 'model go ma').toContain('punkt-chpl');
    expect(dok('pacjent')).not.toContain('Punkt oceny odpowiedzi');
    expect(dok('kliniczny')).toContain('Punkt oceny odpowiedzi');
  });

  it('OBA warianty podają te same liczby — jeden model, jeden budowniczy', () => {
    // Sedno decyzji o jednym generatorze: dwa generatory to dwa miejsca, w których te same
    // liczby mogą się rozjechać.
    for (const wariant of ['pacjent', 'kliniczny']) {
      const d = dok(wariant);
      expect(d, wariant + ': masa początkowa').toContain('120,0');
      expect(d, wariant + ': masa ostatnia').toContain('114,0');
      expect(d, wariant + ': zmiana').toContain('−6,0');
    }
  });

  it('nieznany wariant spada do kartki pacjenta, a nie do pustki', () => {
    const d = moduly().W.buildDokument(model(), { ...OPCJE, wariant: 'wymyslony' });
    expect(d).toContain('Moje postępy');
  });
});

describe('P-POSTEPY wydruk — brzegi', () => {
  it('brama zamknięta → brak dokumentu', () => {
    const { P, W } = moduly();
    expect(W.buildDokument(P.analizuj({ wiekLat: 12, pomiary: SERIA }), { wariant: 'pacjent' })).toBe('');
    expect(W.buildDokument(null, { wariant: 'pacjent' })).toBe('');
  });

  it('przyrost masy opisany tak samo rzeczowo jak ubytek', () => {
    // Ominięcie tematu na kartce dla pacjenta czytałoby się jak unik, a wykres i tak go pokazuje.
    const d = moduly().W.buildDokument(
      moduly().P.analizuj({
        wiekLat: 52,
        pomiary: [{ dateISO: '2026-01-01', weight: 100, height: 170 },
          { dateISO: '2026-06-01', weight: 106, height: 170 }],
      }),
      { ...OPCJE, wariant: 'pacjent' },
    );
    expect(d).toContain('zwiększyła się o');
    expect(d).toContain('6,0 kg');
  });

  it('nazwa pliku nie niesie znaków, które psują zapis na dysku', () => {
    const { W } = moduly();
    const n = W.nazwaPliku('kliniczny', { pacjent: 'Ża/łos\\ny: Test?', dataWydruku: '2026-09-20' });
    expect(n).toMatch(/^postepy_kliniczny_[\p{L}\p{N}-]+_2026-09-20\.html$/u);
    expect(n).not.toMatch(/[/\\:?*"<>|]/);
  });

  it('bez nazwiska nazwa pliku nadal jest sensowna', () => {
    expect(moduly().W.nazwaPliku('pacjent', { dataWydruku: '2026-09-20' }))
      .toBe('postepy_pacjent_2026-09-20.html');
  });
});

describe('P-POSTEPY wydruk — granice warstw i wpięcie', () => {
  it('moduł wydruku nie liczy nic klinicznego', () => {
    const src = zrodlo('vilda_postepy_doroslego_wydruk.js');
    for (const zakazane of ['thresholdPct', 'windowWeeks', 'PROGI', 'kategoriaDorosly', '0.75']) {
      expect(src, zakazane).not.toContain(zakazane);
    }
  });

  it('bez modułu widoku nie powstaje dokument — nigdy własna kopia wykresu', () => {
    const win = {};
    win.window = win;
    new Function('window', 'globalThis', zrodlo('vilda_postepy_doroslego_wydruk.js'))(win, win);
    expect(win.VildaPostepyDoroslegoWydruk.buildDokument({ dostepne: { ok: true }, seria: [{}] }, {})).toBe('');
  });

  it('panel pokazuje oba warianty i wiąże je z modułem wydruku', () => {
    const { P, U } = moduly();
    const h = U.buildHtml(model());
    expect(h).toContain('Dla pacjenta');
    expect(h).toContain('Do dokumentacji');
    expect((h.match(/data-akcja="drukuj"/g) || []), 'druk dla obu wariantów').toHaveLength(2);
    expect((h.match(/data-akcja="pobierz"/g) || []), 'pobranie dla obu').toHaveLength(2);
    expect(P.analizuj, 'silnik nadal ten sam').toBeTypeOf('function');
  });

  it('bez modułu wydruku panel nie obiecuje przycisków', () => {
    const g = loadBrowserScript('vilda_postepy_doroslego_ui.js', {});
    const m = g.VildaPostepyDoroslego.analizuj({ wiekLat: 52, pomiary: SERIA });
    const h = g.VildaPostepyDoroslegoUI.buildHtml(m);
    expect(h).not.toContain('data-akcja');
    expect(h, 'i nie ma nagłówka „Wydruk"').not.toMatch(/>Wydruk</);
  });

  it('Karta Pacjenta podaje nazwisko i datę wydruku', () => {
    const karta = zrodlo('vilda_auth_ui.js');
    expect(karta).toContain('_pdU.renderPanel(Ct,_pdM,{pacjent:w');
    expect(karta).toContain('dataWydruku:');
  });

  it('moduł jest wpięty w osiem stron i precachowany', () => {
    const STRONY = ['app.html', 'docpro.html', 'index.html', 'kalkulator-klirens.html',
      'notatki.html', 'subskrypcja.html', 'terminarz.html', 'ustawienia.html'];
    for (const strona of STRONY) {
      const s = zrodlo(strona);
      const iWidok = s.indexOf('vilda_postepy_doroslego_ui.js');
      const iWydruk = s.indexOf('vilda_postepy_doroslego_wydruk.js');
      expect(iWydruk, strona).toBeGreaterThan(-1);
      expect(iWydruk, strona + ': widok przed wydrukiem').toBeGreaterThan(iWidok);
    }
    expect(zrodlo('service-worker-kalorii.js')).toContain("'/vilda_postepy_doroslego_wydruk.js?v=1'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// AUDYT 2026-09-20, znaleziska F5 i F6 po stronie wydruku.
// ─────────────────────────────────────────────────────────────────────────────────────────

const BEZ_DAT = [
  { ageYears: 52, ageMonths: 0, weight: 120, height: 170 },
  { ageYears: 52, ageMonths: 6, weight: 110, height: 170 },
];

describe('P-POSTEPY audyt F5/F6 — kartka mówi prawdę i daje się wydrukować', () => {
  it('kartka DLA PACJENTA przyznaje, że oś tygodni jest przybliżona', () => {
    // Panel na ekranie i wariant kliniczny mówiły to przez `ostrzezenia`; stopka wariantu
    // pacjenta miała treść stałą, więc pacjent czytał „12. tydz." jako datę co do dnia.
    // Oś liczona z wieku w miesiącach myli się o około dwa tygodnie na miesiąc.
    expect(model({ pomiary: BEZ_DAT }).czasZWieku, 'model wie, że oś jest z wieku').toBe(true);
    expect(dok('pacjent', { pomiary: BEZ_DAT })).toContain('przybliżone');
  });

  it('przy komplecie dat kartka pacjenta NIE straszy przybliżeniem', () => {
    // Kontrola negatywna: zdanie ma się pojawiać z powodu, nie zawsze.
    expect(model().czasZWieku).toBe(false);
    expect(dok('pacjent')).not.toContain('przybliżone');
  });

  it('CSS wydruku nie pozwala rozciąć wykresu ani wiersza tabeli między stronami', () => {
    // Wariant kliniczny to dwa wykresy plus tabela pomiarów — przy dłuższej serii nie mieści
    // się na jednej kartce A4, a bez tych reguł przeglądarka tnie wiersz w pół.
    const d = dok('kliniczny');
    expect(d, 'wykres w całości').toMatch(/\.vw-chart[^}]*break-inside:avoid/);
    expect(d, 'wiersz tabeli w całości').toContain('table.vw-tab tr{break-inside:avoid');
    expect(d, 'nagłówek tabeli powtarzany na każdej stronie')
      .toContain('table.vw-tab thead{display:table-header-group;}');
    expect(d, 'nagłówek sekcji nie zostaje sam na dole strony')
      .toContain('.vw-h2{break-after:avoid');
  });
});

describe('P-POSTEPY — przyciski wydruku mówią, co dają', () => {
  // Uwaga właściciela 2026-09-20: „czemu jak klikam pobierz to pobiera mi się plik html?".
  // Przyciski brzmiały „Drukuj" i „Pobierz": drugi obiecywał plik, a dawał HTML, podczas gdy
  // PDF — którego lekarz rozsądnie się spodziewa — siedzi w oknie druku pod pierwszym.
  // Zachowanie zostaje bez zmian; ten test pilnuje, żeby etykiety nie wróciły do dwuznacznych.
  //
  // Ten przypadek MUSI stać w tym pliku, nie w testach widoku: `akcjeHtml()` rysuje przyciski
  // tylko wtedy, gdy moduł wydruku jest w oknie, a łańcuch zależności ładuje go dopiero tutaj.
  const panelHtml = () => moduly().U.buildHtml(model());

  it('etykieta druku wymienia PDF, etykieta pobierania wymienia HTML', () => {
    const h = panelHtml();
    const drukuj = (h.match(/data-akcja="drukuj"[^>]*>([^<]*)</) || [])[1] || '';
    const pobierz = (h.match(/data-akcja="pobierz"[^>]*>([^<]*)</) || [])[1] || '';
    expect(drukuj, 'przycisk druku prowadzi też do PDF').toContain('PDF');
    expect(pobierz, 'przycisk pobierania nazywa format').toContain('HTML');
    expect(pobierz, 'i nie obiecuje PDF, bo go nie daje').not.toContain('PDF');
  });

  it('podpowiedź tłumaczy drogę do PDF-a i naturę pliku HTML', () => {
    const h = panelHtml();
    expect(h, 'gdzie szukać PDF').toContain('Zapisz jako PDF');
    expect(h, 'i po co komu ten HTML').toContain('bez internetu');
  });
});

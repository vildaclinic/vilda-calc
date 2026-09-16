import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { appSrc, funkcjaZ, oknoZSilnikiem } from '../support/silnik-bmi.mjs';

// P-DS-6: obwód głowy pacjenta z rozpoznaniem zespołu Downa.
//
// Do 1.0.972 moduł obwodów czytał obwód głowy WYŁĄCZNIE z siatek populacyjnych (WHO 0–5 lat
// albo IMiD). Małogłowie jest cechą zespołu Downa, więc dziecko leżące dokładnie na MEDIANIE DS
// wypadało tam na ~2. centylu w 3–5 lat — fałszywy alarm u typowego pacjenta, czyli dokładnie
// ta klasa błędu, dla której powstał cały plan P-DS.
//
// Pułapka, którą ten plik pilnuje: moduł liczy z interpolacją między siedmioma liniami
// centylowymi (`zFromRow`). Przy WHO jest to DOKŁADNE, bo WHO ma L = 1 i linie są wtedy liniowe
// w z. Tablice DS mają L ≈ 1,84–3,86, więc ten sam skrót dałby tam przybliżenie. Gałąź DS musi
// liczyć ŁAŃCUCHEM LMS SILNIKA — i test to sprawdza różnicą, a nie deklaracją.
//
// Dane pacjentów FIKCYJNE.

function okno({ ds = false } = {}) {
  const win = oknoZSilnikiem();
  const kod = `${funkcjaZ(appSrc, 'vildaDsTablica')}${funkcjaZ(appSrc, 'vildaDsWiersz')}`
    + 'window.vildaDsWiersz=vildaDsWiersz;window.vildaPopulacjaDs=function(){return window.__ds===true};';
  new Function('window', kod)(win);
  win.__ds = ds;
  win.vildaOnReady = () => {};
  loadBrowserScript('circumference_module.js', win);
  return win;
}

const wiersz = (win, plec, mies) => win.vildaDsWiersz('HC', plec, mies);
const medianaDs = (win, plec, mies) => wiersz(win, plec, mies)[1];

describe('P-DS-6: obwód głowy na siatce zespołu Downa', () => {
  it('bez rozpoznania nic się nie zmienia — moduł zostaje na siatce populacyjnej', () => {
    const win = okno({ ds: false });
    const r = win.VildaCircumference.assessRegular('head', 47.2, 'M', 1);
    expect(r.ok).toBe(true);
    expect(r.dsUsed, 'brak rozpoznania — brak siatki DS').toBeUndefined();
    // ta sama liczba, co przed P-DS-6: tabela IMiD, głowa M 12 mies. (p50 = 47,2)
    expect(r.zScore).toBeCloseTo(0, 5);
    expect(r.perc).toBeCloseTo(50, 3);
  });

  it('z rozpoznaniem: mediana DS to 50. centyl, a nie alarm małogłowia', () => {
    const zDs = okno({ ds: true });
    const bez = okno({ ds: false });
    for (const [plec, mies] of [['M', 48], ['F', 48], ['M', 36], ['F', 60]]) {
      const med = medianaDs(zDs, plec, mies);
      const lata = mies / 12;
      const r = zDs.VildaCircumference.assessRegular('head', med, plec, lata);
      expect(r.dsUsed, `${plec} ${mies} mies.`).toBe(true);
      expect(r.ok).toBe(true);
      expect(r.zScore, `${plec} ${mies} mies.: mediana DS to z = 0`).toBeCloseTo(0, 9);
      expect(r.perc).toBeCloseTo(50, 6);
      expect(r.cls.cat, 'mediana DS nie jest odchyleniem').toBe('normal');

      // kontrola negatywna: ta sama liczba bez rozpoznania to dawny fałszywy alarm
      const p = bez.VildaCircumference.assessRegular('head', med, plec, lata);
      expect(p.dsUsed).toBeUndefined();
      expect(p.perc, `${plec} ${mies} mies.: na siatce populacyjnej ta sama głowa jest „za mała"`).toBeLessThan(10);
      expect(p.cls.severity, 'i podświetlona jako odchylenie').not.toBe('');
    }
  });

  it('z liczy ŁAŃCUCH LMS SILNIKA, nie skrót po siedmiu liniach centylowych', () => {
    const win = okno({ ds: true });
    const T = win.VildaBmi;
    let maxRoznicaDoSilnika = 0;
    let maxRoznicaDoSkrotu = 0;
    for (const plec of ['M', 'F']) {
      for (const mies of [3, 12, 24, 60, 120, 240]) {
        const lms = wiersz(win, plec, mies);
        for (const z of [-3, -2, -1, 0, 1, 2, 3]) {
          const cm = T.xLms(z, lms);
          const r = win.VildaCircumference.assessRegular('head', cm, plec, mies / 12);
          expect(r.dsUsed, `${plec} ${mies} mies.`).toBe(true);
          maxRoznicaDoSilnika = Math.max(maxRoznicaDoSilnika, Math.abs(r.zScore - z));
          // co dałby skrót, gdyby ktoś wpiął tablice DS w istniejącą maszynerię
          maxRoznicaDoSkrotu = Math.max(maxRoznicaDoSkrotu, Math.abs(win.VildaCircumference.zFromRow(cm, r.row) - z));
        }
      }
    }
    expect(maxRoznicaDoSilnika, 'moduł zwraca DOKŁADNIE z silnika').toBeLessThan(1e-9);
    expect(maxRoznicaDoSkrotu, 'a skrót po liniach NIE jest tu dokładny — test nie jest trywialny').toBeGreaterThan(0.05);
  });

  it('decyzja D2: poza 1 mies.–20 lat nie ma wyniku, nigdy ciche zejście na siatkę populacyjną', () => {
    const win = okno({ ds: true });
    for (const lata of [0.05, 20.5, 25]) {
      const r = win.VildaCircumference.assessRegular('head', 47, 'M', lata);
      expect(r.ok, `${lata} lat`).toBe(false);
      expect(r.dsUsed, `${lata} lat — nadal wiadomo, że chodzi o siatkę DS`).toBe(true);
      expect(r.reason).toBe('ds-range');
      expect(r.message).toContain('Downa');
      expect(r.perc, 'żadnej liczby z innej populacji').toBeNaN();
    }
    // granice zakresu działają
    for (const mies of [1, 240]) {
      const r = win.VildaCircumference.assessRegular('head', medianaDs(win, 'M', mies), 'M', mies / 12);
      expect(r.ok, `${mies} mies.`).toBe(true);
      expect(r.zScore).toBeCloseTo(0, 9);
    }
  });

  it('decyzja D4: wynik NAZYWA siatkę, a wybór WHO/IMiD przestaje mieć znaczenie', () => {
    const win = okno({ ds: true });
    const r = win.VildaCircumference.assessRegular('head', 47, 'M', 4);
    expect(r.sourceHtml).toContain('Zemel 2015');
    expect(r.sourceHtml).toContain('zespo');
    expect(r.sourceHtml, 'użytkownik wie, czemu przełącznik WHO/IMiD nic nie robi').toContain('WHO / IMiD');
    expect(r.whoUsed, 'to nie jest siatka WHO').toBe(false);
  });

  it('klatka piersiowa zostaje poza zakresem — Zemel nie publikuje dla niej siatek', () => {
    const zDs = okno({ ds: true });
    const bez = okno({ ds: false });
    const a = zDs.VildaCircumference.assessRegular('chest', 52, 'M', 4);
    const b = bez.VildaCircumference.assessRegular('chest', 52, 'M', 4);
    expect(a.dsUsed).toBeUndefined();
    expect(a.perc).toBeCloseTo(b.perc, 12);
  });
});

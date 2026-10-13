import { expect } from './test-czas.mjs';
import { przejdz, przewin, ramka } from './powloka-przewiniecie.mjs';

// P-SPOZYCIE-POWROT (polecenie właściciela 2026-10-13): po powrocie do panelu Start w powłoce app.html karta
// „Szacowane spożycie energii” przez co najmniej jedną klatkę nie miała wiersza historii: #intakeMeasurements niższe
// o 143 px na desktopie 1440×1000 i o 252 px na telefonie (487 → 235), treść pod kartą podskakiwała. Odtworzenie
// stanu wspólnego (vildaPersistRestoreAll) przebudowuje wiersze synchronicznie, a pusty wiersz historii dorabia
// parowanie zaawansowane↔spożycie w kroku końcowym, który szedł w setTimeout(0). Wspólne kroki testów e2e
// na prawdziwej powłoce — desktop (spozycie-powrot-powloka.spec.mjs) i telefon (…-mobile.spec.mjs). Dane FIKCYJNE.
//
// Asercje czekają na warunek, nie na upływ czasu. Zadania z setTimeout w ramce Start są na czas powrotu celowo
// opóźnione (jak na zajętym procesorze, por. P-USTAWIENIA-CEL), więc krok końcowy oparty na timerze przegrywa
// z pierwszą klatką za każdym razem, a nie tylko na wolnym komputerze.

export const karta = (fr) => fr.evaluate(() => {
  const m = document.getElementById('intakeMeasurements');
  return { hist: m.querySelectorAll('.intake-history-row').length, h: Math.round(m.getBoundingClientRect().height) };
});

// Start → DocPro → Start. DocPro po drodze zapisuje sesję, więc Start po powrocie odtwarza stan wspólny i sesję
// (Gp_p) — dokładnie w oknie, w którym próbnik patrzy. Zwraca stan karty przed wyjściem i próbki z widocznych klatek.
export async function powrotZeSpozyciem(page, start, opis) {
  // Karta gotowa: wiersz historii jest, krok końcowy poprzedniego odtworzenia (jeżeli był) zakończony.
  await start.waitForFunction(() => {
    const m = document.getElementById('intakeMeasurements');
    return Boolean(m && m.getBoundingClientRect().height > 0 && m.querySelector('.intake-history-row')
      && window.__vildaSuspendAdvIntakeSync !== true);
  }, null, { timeout: 30000 });
  // Karta w oknie, jak u użytkownika, który ją czyta i przełącza panel.
  await przewin(start, await start.evaluate(() => {
    const k = document.getElementById('intakeMeasurements').getBoundingClientRect();
    return Math.max(0, Math.round(k.top + window.scrollY - 120));
  }));
  const przed = await karta(start);
  expect(przed.hist, `${opis}: przed wyjściem karta ma wiersz historii`).toBeGreaterThan(0);

  await przejdz(page, 'docpro');
  const docpro = await ramka(page, 'DocPro');
  await docpro.waitForFunction(() => window.VildaVault.isUnlocked(), null, { timeout: 30000 });

  await start.evaluate(() => {
    // Zajęty procesor: zadania z setTimeout w ramce Start ruszają najwcześniej po 250 ms, czyli po kilku klatkach.
    const zwykly = window.setTimeout;
    window.setTimeout = (fn, ms, ...reszta) => zwykly(fn, Math.max(Number(ms) || 0, 250), ...reszta);
    // Próbnik: w każdej klatce, w której ramka jest widoczna, wiersze historii i wysokość karty, okno powrotu
    // (vilda-panel-powrot, 2 s) i czy krok końcowy odtworzenia już się wykonał (flaga zawieszenia zdjęta).
    const P = { klatki: [], odtworzenia: 0, stop: false };
    window.__spozycieProbnik = P;
    document.addEventListener('vilda:persist-restored', () => { P.odtworzenia += 1; });
    const krok = () => {
      if (P.stop) return;
      const fe = window.frameElement;
      if (!(fe && fe.hidden)) {
        const m = document.getElementById('intakeMeasurements');
        P.klatki.push({
          hist: m.querySelectorAll('.intake-history-row').length,
          h: Math.round(m.getBoundingClientRect().height),
          powrot: document.documentElement.classList.contains('vilda-panel-powrot'),
          krokKoncowy: window.__vildaSuspendAdvIntakeSync !== true,
        });
      }
      requestAnimationFrame(krok);
    };
    requestAnimationFrame(krok);
  });
  await przejdz(page, 'start');
  await start.waitForFunction(() => window.__spozycieProbnik.klatki.filter((k) => !k.powrot && k.krokKoncowy).length >= 3,
    null, { timeout: 30000 });
  const P = await start.evaluate(() => { const P = window.__spozycieProbnik; P.stop = true; return P; });

  expect(P.odtworzenia, `${opis}: powrót odtworzył stan wspólny (inaczej test niczego nie rozstrzyga)`).toBeGreaterThan(0);
  expect(P.klatki.length, `${opis}: próbki z widocznych klatek`).toBeGreaterThan(0);
  const zle = P.klatki.map((k, i) => ({ klatka: i, hist: k.hist, h: k.h })).filter((k) => k.hist < 1 || Math.abs(k.h - przed.h) > 1);
  expect(zle.slice(0, 3), `${opis}: karta z wierszem historii i wysokością ${przed.h} px w każdej widocznej klatce, od pierwszej`).toEqual([]);
  return { przed, P };
}

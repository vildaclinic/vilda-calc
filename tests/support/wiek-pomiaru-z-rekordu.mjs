import { expect } from './test-czas.mjs';

// P-WIEK-POMIARU (polecenie właściciela 2026-10-13): pomiar zapisany liczy się w SWOIM wieku — z daty
// urodzenia i daty pomiaru zapisanych w rekordzie — a nie w dokładnym wieku dziecka z formularza.
// Wspólne kroki testów e2e (index.html): desktop (wiek-pomiaru-z-rekordu.spec.mjs) i telefon
// (…-mobile.spec.mjs). Zegar testów: 2026-06-17 (test-czas.mjs). Dane wyłącznie FIKCYJNE.

const DNI_W_MIESIACU = 30.4375;

// Konto testowe z odblokowanym sejfem i trybem PRO (karta porównania pokazuje się w PRO).
export async function kontoPro(page, haslo) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), haslo);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.calcPercentileStats === 'function' && Boolean(window.VildaAuthUI)
    && !document.documentElement.classList.contains('vilda-auth-locked'), null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (!pro) return false;
    if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === true;
  }, null, { timeout: 15000 });
}

// Mediany WHO (długość i masa) w danej dobie życia — z tablic i silników aplikacji, ale BEZ nowego
// argumentu P-WIEK-POMIARU (masa: interpolacja wierszy 0 i 1 mies. jak w DOB-AGE-4), żeby te same
// kroki dały się puścić na kodzie sprzed zmiany (kontrola ujemna).
export const medianyWDobie = (page, dni) => page.evaluate((d) => {
  const wiek = d / 30.4375;
  const dl = window.VildaSdsWzrostu.wartoscDlaSds({ sds: 0, plec: 'M', wiekMies: wiek, zrodlo: 'WHO' });
  const w0 = window.getChildLMS('M', 0, 'WT');
  const w1 = window.getChildLMS('M', 1 / 12, 'WT');
  return { dlugosc: Math.round(dl.wzrost * 10) / 10, masa: Math.round((w0[1] + (w1[1] - w0[1]) * wiek) * 1000) / 1000 };
}, dni);

// Chłopiec z jednym pomiarem zapisanym z datą urodzenia i datą pomiaru (tak zapisuje formularz główny).
export const zapiszPacjenta = (page, { nazwisko, dobISO, dataPomiaru, dlugosc, masa }) => page.evaluate(async (d) => {
  const wynik = await window.VildaVault.savePatient({
    name: `${d.nazwisko} Jan`,
    timestampISO: `${d.dataPomiaru}T10:00:00.000Z`,
    user: {
      lastName: d.nazwisko, firstName: 'Jan', sex: 'M', dobISO: d.dobISO, measuredAtISO: d.dataPomiaru,
      age: 0, ageMonths: 0, height: d.dlugosc, weight: d.masa,
    },
  }, { dedup: false });
  return wynik.patientId;
}, { nazwisko, dobISO, dataPomiaru, dlugosc, masa });

// Etykiety centyla tego samego pomiaru w trzech wiekach: własnym (doba pomiaru), w dobie dziecka
// z formularza (stary błąd) i w pełnych miesiącach. Wzrost — silnik wzrostu; masa — LMS interpolowane
// między wierszami 0 i 1 mies. tych samych tablic (DOB-AGE-4) i normalCDF z app.js. Ta sama etykieta
// co karta. Liczone przy pustym formularzu, więc pełne miesiące nie są uściślane.
export const etykietyKontrolne = (page, { dlugosc, masa, dobaPomiaru, dobaFormularza }) => page.evaluate((d) => {
  const zrodlo = typeof bmiSource !== 'undefined' && bmiSource ? String(bmiSource) : 'OLAF';
  const wzrost = (wiekMies) => {
    const r = window.VildaSdsWzrostu.policz({ wzrost: d.dlugosc, plec: 'M', wiekMies, zrodlo });
    return window.formatCentileLabel(r.centyl);
  };
  const w0 = window.getChildLMS('M', 0, 'WT');
  const w1 = window.getChildLMS('M', 1 / 12, 'WT');
  const waga = (wiekMies) => {
    const [L, M, S] = [0, 1, 2].map((i) => w0[i] + (w1[i] - w0[i]) * wiekMies);
    const z = L !== 0 ? (Math.pow(d.masa / M, L) - 1) / (L * S) : Math.log(d.masa / M) / S;
    return window.formatCentileLabel(window.normalCDF(z) * 100);
  };
  return {
    wzrost: { wlasny: wzrost(d.dobaPomiaru / 30.4375), formularz: wzrost(d.dobaFormularza / 30.4375), pelne: wzrost(0) },
    masa: { wlasny: waga(d.dobaPomiaru / 30.4375), formularz: waga(d.dobaFormularza / 30.4375), pelne: waga(0) },
  };
}, { dlugosc, masa, dobaPomiaru, dobaFormularza });

export function etykietyRozne(k, opis) {
  for (const m of ['wzrost', 'masa']) {
    expect(k[m].wlasny, `${opis}: ${m} — własny wiek ≠ doba z formularza (inaczej test nic nie mierzy)`).not.toBe(k[m].formularz);
    expect(k[m].wlasny, `${opis}: ${m} — własny wiek ≠ pełne miesiące`).not.toBe(k[m].pelne);
  }
}

// Wczytanie z Karty Pacjenta jako „Nowy pomiar" — ta sama droga, co u lekarza.
export async function wczytajNowyPomiar(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null), pid);
  const wczytaj = page.getByRole('button', { name: 'Wczytaj tego pacjenta' });
  await wczytaj.waitFor({ state: 'visible', timeout: 20000 });
  await wczytaj.click();
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'visible', timeout: 8000 });
  await page.click('#vildaLcmNew');
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 8000 }).catch(() => {});
}

// Próbnik karty porównania: w każdej klatce z widoczną kartą — centyl wzrostu i masy „Poprzednio"
// oraz dopiski „było …" w kolumnie „Dziś" (na telefonie kolumna „Poprzednio" jest ukryta).
export const wlaczProbnik = (page) => page.evaluate(() => {
  const P = { klatki: [], stop: false };
  window.__wiekProbnik = P;
  const tekst = (sel) => { const el = document.querySelector(sel); return el ? el.textContent : null; };
  const krok = () => {
    if (P.stop) return;
    const wrap = document.getElementById('prevSummaryWrap');
    const wz = tekst('#prevSummaryContent tr[data-klucz="wzrost"] .pt-kol-poprzednio .pt-s');
    if (wrap && wrap.style.display === 'block' && wz) {
      P.klatki.push({
        wzrost: wz,
        masa: tekst('#prevSummaryContent tr[data-klucz="masa"] .pt-kol-poprzednio .pt-s'),
        byloWzrost: tekst('#prevSummaryContent tr[data-klucz="wzrost"] .pt-dzis .pt-byl') || '',
        data: (document.getElementById('dobInput') || {}).value || '',
      });
    }
    requestAnimationFrame(krok);
  };
  requestAnimationFrame(krok);
});

export const zatrzymajProbnik = (page) => page.evaluate(() => { const P = window.__wiekProbnik; P.stop = true; return P; });

export { DNI_W_MIESIACU };

import { expect } from '@playwright/test';

/**
 * P-KARTA-LECZENIE, etap 1 — wspólne dane i pomocnicy specyfikacji karta-leczenie.spec.mjs (komputer) i
 * karta-leczenie-mobile.spec.mjs (telefon). Pacjenci jak na zaakceptowanej makiecie (dane wyłącznie FIKCYJNE):
 * O1 — nastolatka na Wegovy, 2 punkty, przed oknem oceny; G1 — chłopiec na GH, 7 punktów od Włączenia;
 * X1 — GH zakończone + Wegovy trwa; BEZ — pacjent bez leczenia.
 */
const HASLO = 'E2e#KartaLeczenie!26';
const WEG = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)' };
const DOB_O1 = '2008-12-10';
function wiek(dobISO, dateISO) {
  const [y1, m1, d1] = dobISO.split('-').map(Number);
  const [y2, m2, d2] = dateISO.split('-').map(Number);
  let mies = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) mies -= 1;
  return { ageYears: Math.floor(mies / 12), ageMonths: mies % 12 };
}
const OB = (dob, id, type, dateISO, weight, height, dose) => ({
  id, type, dateISO, ...wiek(dob, dateISO), weight, height, bmi: +(weight / Math.pow(height / 100, 2)).toFixed(1), ...WEG, dose,
});
export const O1 = {
  name: 'Fikcyjna Zuzanna',
  user: { lastName: 'Fikcyjna', firstName: 'Zuzanna', sex: 'F', age: 17, ageMonths: 11, height: 157, weight: 84, dobISO: DOB_O1 },
  obesityTherapyPoints: [OB(DOB_O1, 'o1-start', 'start', '2026-06-23', 91.9, 157, '0,25 mg'), OB(DOB_O1, 'o1-k1', 'continue', '2026-11-10', 84, 157, '2,4 mg')],
};
const GH = (id, type, lata, mies, weight, height, boneAge, dose, drug = 'Genotropin 12 mg') => ({
  id, type, ageYears: lata, ageMonths: mies, weight, height, boneAge, dose, doseUnit: 'mg/kg/d', drug, program: 'SNP', igf1: null,
});
export const G1 = {
  name: 'Fikcyjny Antoni',
  user: { lastName: 'Fikcyjny', firstName: 'Antoni', sex: 'M', age: 10, ageMonths: 0, height: 132.4, weight: 29.8 },
  ghTherapyPoints: [GH('g1-s', 'start', 7, 0, 18, 110, 5.5, 0.025), GH('g1-c1', 'continue', 7, 6, 19.6, 114.6, null, 0.025),
    GH('g1-c2', 'continue', 8, 0, 21.3, 118.7, 6.75, 0.028), GH('g1-c3', 'continue', 8, 6, 23.2, 122.5, null, 0.03),
    GH('g1-c4', 'continue', 9, 0, 25.4, 126.1, 8, 0.03), GH('g1-c5', 'continue', 9, 6, 27.5, 129.3, null, 0.033),
    GH('g1-c6', 'continue', 10, 0, 29.8, 132.4, 9, 0.033)],
};
const DOB_X1 = '2010-11-05';
export const X1 = {
  name: 'Fikcyjny Tomasz',
  user: { lastName: 'Fikcyjny', firstName: 'Tomasz', sex: 'M', age: 16, ageMonths: 0, height: 168, weight: 92.5, dobISO: DOB_X1 },
  ghTherapyPoints: [GH('x1-s', 'start', 9, 0, 24, 121, 7, 0.025, 'Omnitrope 10 mg'), GH('x1-c1', 'continue', 11, 0, 36, 137.5, null, 0.03, 'Omnitrope 10 mg'),
    GH('x1-c2', 'continue', 13, 0, 55, 153, 13, 0.03, 'Omnitrope 10 mg'), GH('x1-e', 'end', 15, 0, 78, 166.5, 15.5, 0.025, 'Omnitrope 10 mg')],
  obesityTherapyPoints: [OB(DOB_X1, 'x1-os', 'start', '2026-06-23', 99.4, 167.6, '0,25 mg'), OB(DOB_X1, 'x1-oc', 'continue', '2026-11-10', 92.5, 168, '2,4 mg')],
};
/**
 * P-KARTA-LECZENIE, etap 2 — O2 (makieta „Wpisy (7)”): Wegovy od 17.02.2026, cztery wizyty i trzy wpisy dziennika od
 * pacjentki (masa bez wzrostu) — 7 wpisów, odpowiedź wystarczająca. Wpisy dziennika: zapiszZDziennikiem.
 */
export const O2 = {
  name: 'Fikcyjna Oliwia',
  user: { lastName: 'Fikcyjna', firstName: 'Oliwia', sex: 'F', age: 17, ageMonths: 11, height: 157.4, weight: 79.4, dobISO: DOB_O1 },
  obesityTherapyPoints: [OB(DOB_O1, 'o2-start', 'start', '2026-02-17', 91.9, 157, '0,25 mg'), OB(DOB_O1, 'o2-k2', 'continue', '2026-04-14', 88.4, 157, '1 mg'),
    OB(DOB_O1, 'o2-k4', 'continue', '2026-06-09', 85.1, 157.2, '2,4 mg'), OB(DOB_O1, 'o2-k6', 'continue', '2026-11-10', 79.4, 157.4, '2,4 mg')],
};
export const O2_DZIENNIK = [{ dateISO: '2026-03-17', weight: 90.3, dose: '0,5 mg' }, { dateISO: '2026-05-12', weight: 86.8, dose: '1,7 mg' },
  { dateISO: '2026-08-18', weight: 82.2, dose: '2,4 mg', comment: 'Masa podana telefonicznie; recepta wysłana.' }];
/** Pacjent z wpisami dziennika od pacjenta (masa bez wzrostu), zapisanymi tak jak „+ Kontynuacja” (planNowego → zapisz). */
export const zapiszZDziennikiem = (page, rekord, dziennik) => page.evaluate(async ({ r, wpisy }) => {
  const id = (await window.VildaVault.savePatient(r, { dedup: false })).patientId;
  const D = window.VildaDziennikOtylosci;
  const migawka = (await window.VildaVault.getPatient(id)).snapshots[0].payload.obesityTherapyPoints;
  const wzor = migawka[0], dob = r.user.dobISO.split('-').map(Number);
  for (const w of wpisy) {
    const d = w.dateISO.split('-').map(Number);
    let mies = (d[0] - dob[0]) * 12 + (d[1] - dob[1]);
    if (d[2] < dob[2]) mies -= 1;
    const dane = { type: 'continue', dateISO: w.dateISO, ageYears: Math.floor(mies / 12), ageMonths: mies % 12, weight: w.weight, weightSource: 'pacjent',
      height: null, heightSource: null, drug: wzor.drug, substance: wzor.substance, dose: w.dose, comment: w.comment || '' };
    const plan = D.planNowego(await D.wczytaj(id, migawka), id, dane);
    if (!plan || !plan.ok) throw new Error('plan dziennika');
    await D.zapisz(id, plan.wersje);
  }
  return id;
}, { r: rekord, wpisy: dziennik });
/** Karta leczenia otyłości (etap 2): przełącznik, wybrany widok, kafelki „Przeglądu” i linia oceny — tekst z DOM do asercji. */
export const kartaOtylosci = (page) => page.locator('.vilda-ko-karta');
export const widokKarty = (page, id) => page.getByRole('tab', { name: id === 'przeglad' ? 'Przegląd' : id === 'analiza' ? 'Analiza' : /^Wpisy/ });
export const opisKarty = (page) => page.locator('.vilda-ko-karta').evaluate((k) => {
  const t = (el) => (el ? el.textContent : null);
  const tabs = [...k.querySelectorAll('.vilda-ko-seg [role="tab"]')];
  return {
    przelacznik: tabs.map(t),
    wybrany: (tabs.find((b) => b.getAttribute('aria-selected') === 'true') || { textContent: null }).textContent,
    widoczne: [...k.querySelectorAll('.vilda-ko-widok')].filter((w) => !w.hidden).map((w) => w.className.replace('vilda-ko-widok vilda-ko-widok--', '')),
    kafelki: [...k.querySelectorAll('.vilda-ko-kafel')].map((x) => [t(x.querySelector('.vilda-ko-k')), t(x.querySelector('.vilda-ko-v')), t(x.querySelector('.vilda-ko-sub'))]),
    linia: t(k.querySelector('.vilda-ko-werdykt')),
  };
});
export const BEZ = { name: 'Fikcyjny Bez Leczenia', user: { lastName: 'Fikcyjny', firstName: 'Bez Leczenia', sex: 'M', age: 9, ageMonths: 0, height: 132, weight: 30 } };
/**
 * P-GH-WZNOWIENIE, część 1 — GR1 (wznowienie): W 7;0 (110) → K 8;0 (117) → Z 9;0 (123) → W 10;0 (130) → K 11;0 (137).
 * DocPro nie pozwala jeszcze wpisać drugiego Włączenia (część 2), więc punkty idą wprost do rekordu, jak po scaleniu
 * duplikatów. Pomiary wizyt z tych samych wieków — siatki pokazują oba kursy.
 */
export const R1 = {
  name: 'Fikcyjny Bartosz',
  user: { lastName: 'Fikcyjny', firstName: 'Bartosz', sex: 'M', age: 11, ageMonths: 0, height: 137, weight: 30 },
  advanced: { data: { measurements: [{ ageMonths: 84, height: 110, weight: 18 }, { ageMonths: 96, height: 117, weight: 21 },
    { ageMonths: 108, height: 123, weight: 24 }, { ageMonths: 120, height: 130, weight: 27 }] } },
  ghTherapyPoints: [GH('r1-s1', 'start', 7, 0, 18, 110, null, 0.025), GH('r1-c1', 'continue', 8, 0, 21, 117, null, 0.028),
    GH('r1-e', 'end', 9, 0, 24, 123, null, 0.03), GH('r1-s2', 'start', 10, 0, 27, 130, null, 0.03),
    GH('r1-c2', 'continue', 11, 0, 30, 137, null, 0.033)],
};

export async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.VildaDziennikOtylosciUI) && Boolean(window.ObesityResponseCriteria));
}
export const zapisz = (page, rekord) => page.evaluate(async (r) => (await window.VildaVault.savePatient(r, { dedup: false })).patientId, rekord);
export async function karta(page, pid, opcje) {
  await page.evaluate(({ id, o }) => window.VildaAuthUI.showPatientCard(id, null, null, o || undefined), { id: pid, o: opcje || null });
  await expect(page.locator('.vilda-auth-patient-card .vilda-patient-tabs')).toBeVisible({ timeout: 15000 });
}
export const zakladki = (page) => page.locator('.vilda-patient-tabs > .vilda-patient-tab');
export const aktywna = (page) => page.locator('.vilda-patient-tabs > .vilda-patient-tab--active');
export const tresc = (page, tab) => page.locator(`.vilda-patient-tab-content[data-tab="${tab}"]`);
export const paski = (page) => page.locator('.vilda-auth-patient-card > .vilda-kl-paski > .vilda-kl-pasek');
/** Pasek: tekst odznaki, stanu, wartości i pigułki (null, gdy brak) oraz wysokość. */
export const opisPaska = (pasek) => pasek.evaluate((b) => {
  const t = (s) => { const el = b.querySelector(s); return el ? el.textContent : null; };
  return { odznaka: t('.vilda-kl-pasek-odznaka'), stan: t('.vilda-kl-pasek-stan'), wartosci: t('.vilda-kl-pasek-t'),
    pigulka: t('.vilda-kl-pigulka'), pominiete: b.getAttribute('data-pominiete'), wysokosc: Math.round(b.getBoundingClientRect().height) };
});
/** Położenie paska zakładek w Karcie (niezależne od przewinięcia) i na ekranie. */
export const polozenieZakladek = (page) => page.evaluate(() => {
  const k = document.querySelector('.vilda-auth-patient-card');
  const z = k.querySelector('.vilda-patient-tabs');
  return { wKarcie: Math.round(z.getBoundingClientRect().top - k.getBoundingClientRect().top), naEkranie: Math.round(z.getBoundingClientRect().top) };
});
/** Cel u góry widoku Karty: jego górna krawędź ≤ 40 px albo Karta przewinięta do końca (dalej się nie da), a cel cały widoczny. */
export const uGory = (page, wybierz) => page.evaluate((kod) => {
  const el = new Function(`return (${kod})()`)();
  const r = document.getElementById('vilda-auth-ui-root');
  const top = Math.round(el.getBoundingClientRect().top);
  const doKonca = r.scrollTop > 0 && r.scrollTop >= r.scrollHeight - r.clientHeight - 1;
  return top >= 0 && (top <= 40 || (doKonca && el.getBoundingClientRect().bottom <= r.clientHeight + 1));
}, wybierz.toString());
/** Siatki Karty: pasy leczenia GH (prostokąty #0F6E56, krycie 0,08) i ich etykiety „GH” na każdej siatce. */
export const pasyGh = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.vilda-siatka-charts svg.vilda-patient-chart')]
  .filter((s) => s._vildaScale).map((s) => [s._vildaScale.metric, {
    pasy: [...s.querySelectorAll('rect')].filter((r) => r.getAttribute('fill') === '#0F6E56' && r.getAttribute('opacity') === '0.08').length,
    etykiety: [...s.querySelectorAll('text')].filter((t) => t.textContent === 'GH').length,
  }])));
export const bezPrzewijaniaWBok = (page) => page.evaluate(() => {
  const r = document.getElementById('vilda-auth-ui-root');
  return r.scrollWidth <= r.clientWidth + 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
});


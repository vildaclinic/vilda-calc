import { expect, test } from '../support/test-czas.mjs';

// P-STATUS-KAFLE-ROWNE (decyzja właściciela 2026-11-23). Zgłoszenie: w zakładce „Status”
// Karty pacjenta kafelki sekcji „Pomiar” były szersze od kafelków „Wzrastania”, a kafelki
// „Tempo wzrastania” i „SDS tempa” długimi opisami wydłużały cały rząd. Pacjentka jak na
// zrzucie właściciela: 6 lat, ostatnie tempo z 34 mies. (poza oknem oceny normy), SDS tempa
// nie policzony, bo odstęp leży poza zakresem norm DONALD (6–18 mies.).
//
// Test patrzy na to, co widać: mierzy kafelki w widocznej zakładce, na komputerze i telefonie.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#KafleRowne!26';

async function otworzKarte(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  const patientId = await page.evaluate(async () => {
    // Zapisany model tempa, jak go zostawia kalkulator: 6,0 cm/rok z 34 mies., wiek 72 mies.
    const tempo = window.VildaTempoWzrastania.ocenWartosc(6.0, 34, 72, 'K');
    const w = await window.VildaVault.savePatient({
      name: 'Testowa Ola',
      user: {
        lastName: 'Testowa', firstName: 'Ola', sex: 'K',
        age: 6, ageMonths: 0, height: 115.3, weight: 22.8,
      },
      advanced: { motherHeight: 160, fatherHeight: 170 },
      birth: { weeks: 39, days: 2, weight: 3200, length: 52, sex: 'female' },
      growthBasic: {
        data: {
          tempo,
          measurements: [
            { ageMonths: 38, ageYears: 3, height: 98.3, weight: 15 },
            { ageMonths: 72, ageYears: 6, height: 115.3, weight: 22.8 },
          ],
        },
      },
    }, { dedup: false });
    return w.patientId;
  });
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await expect(page.locator('.vhv-tile'), 'kafelek SDS tempa jest widoczny').toBeVisible();
}

// Wymiary wszystkich kafelków w widocznej zakładce, sekcjami.
async function wymiary(page) {
  return page.evaluate(() => {
    const pane = [...document.querySelectorAll('.vilda-patient-tab-content')]
      .find((x) => !x.classList.contains('vilda-patient-tab-content--hidden'));
    return [...pane.querySelectorAll('.vilda-patient-stats-grid')].map((g) => [...g.children]
      .filter((t) => t.classList.contains('vilda-patient-stat'))
      .map((t) => {
        const r = t.getBoundingClientRect();
        return {
          // Etykieta SGA niesie w sobie strzałkę „↗” (otwiera okno ze szczegółami).
          etykieta: ((t.querySelector('.vilda-patient-stat-label') || {}).textContent || '')
            .replace('↗', '').trim(),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      }));
  });
}

async function liczbaKolumn(page) {
  return page.evaluate(() => {
    const pane = [...document.querySelectorAll('.vilda-patient-tab-content')]
      .find((x) => !x.classList.contains('vilda-patient-tab-content--hidden'));
    return [...pane.querySelectorAll('.vilda-patient-stats-grid')]
      .map((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
  });
}

function jedenRozmiar(sekcje) {
  const wszystkie = sekcje.flat();
  const w = new Set(wszystkie.map((k) => k.w));
  const h = new Set(wszystkie.map((k) => k.h));
  return { wszystkie, szerokosci: [...w], wysokosci: [...h] };
}

test.describe('Status Karty pacjenta — kafelki jednego rozmiaru (komputer)', () => {
  test('kafelki obu sekcji mają tę samą szerokość i wysokość; podpisy są krótkie', async ({ page }) => {
    await otworzKarte(page);

    const sekcje = await wymiary(page);
    expect(sekcje.length, 'dwie sekcje: Pomiar oraz Wzrastanie i genetyka rodzinna').toBe(2);
    const { wszystkie, szerokosci, wysokosci } = jedenRozmiar(sekcje);
    expect(wszystkie.map((k) => k.etykieta)).toEqual(expect.arrayContaining([
      'Wzrost', 'Waga', 'BMI', 'Tempo wzrastania', 'MPH', 'SDS tempa', 'SGA',
    ]));
    expect(szerokosci, `jedna szerokość: ${JSON.stringify(wszystkie)}`).toHaveLength(1);
    expect(wysokosci, `jedna wysokość: ${JSON.stringify(wszystkie)}`).toHaveLength(1);
    expect(await liczbaKolumn(page), 'cztery kolumny w obu sekcjach (karta 880 px)').toEqual([4, 4]);

    const pane = page.locator('.vilda-patient-tab-content:not(.vilda-patient-tab-content--hidden)');
    const tempo = pane.locator('.vilda-patient-stat', { hasText: 'Tempo wzrastania' });
    await expect(tempo.locator('.vilda-patient-stat-value'), 'w wartości sama liczba')
      .toHaveText('6,0 cm/rok');
    await expect(tempo, 'odstęp i brak oceny normy w podpisie')
      .toContainText('z 34 mies. · poza oknem oceny normy');

    const sds = page.locator('.vhv-tile');
    await expect(sds).toContainText('nie policzono — odstęp poza zakresem norm');
    await expect(sds, 'pełne zdanie nie stoi na kafelku').not.toContainText('Krótsze odstępy');
    await expect(pane, 'o rozwijaniu mówi sama strzałka').not.toContainText('kliknij, aby rozwinąć');
    await expect(sds).toHaveAttribute('aria-expanded', 'false');
    await expect(sds, 'odmowa przygaszona klasą jak dotąd stylem').toHaveCSS('opacity', '0.78');

    await sds.click();
    await expect(sds).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('.vhv-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Krótsze odstępy zawyżają błąd pomiaru, dłuższe zacierają zmianę tempa.');
    await expect(panel).toContainText('Odstęp pomiarów: 34 mies. Zakres odstępów tej normy: 6–18 mies.');
    await expect(panel).toContainText('PMID 40557842');

    const po = await wymiary(page);
    expect(po, 'rozwinięcie nie zmienia rozmiaru żadnego kafelka').toEqual(sekcje);
  });
});

test.describe('Status Karty pacjenta — kafelki jednego rozmiaru (węższa karta, okno 1180 px)', () => {
  // Okno 768–1279 px (m.in. iPad poziomo) daje kartę 675 px. Przy minimum 180 px mieściły się
  // tu tylko trzy kolumny i kafelki „Wskaźnik Cole'a” i SGA zostawały same w rzędzie.
  test.use({ viewport: { width: 1180, height: 820 } });

  test('nadal cztery kolumny i jeden rozmiar kafelków', async ({ page }) => {
    await otworzKarte(page);
    expect(await liczbaKolumn(page)).toEqual([4, 4]);
    const { wszystkie, szerokosci, wysokosci } = jedenRozmiar(await wymiary(page));
    expect(szerokosci, `jedna szerokość: ${JSON.stringify(wszystkie)}`).toHaveLength(1);
    expect(wysokosci, `jedna wysokość: ${JSON.stringify(wszystkie)}`).toHaveLength(1);
  });
});

test.describe('Status Karty pacjenta — kafelki jednego rozmiaru (telefon)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('dwie kolumny, kafelki obu sekcji tej samej szerokości i wysokości', async ({ page }) => {
    await otworzKarte(page);
    const sekcje = await wymiary(page);
    const { wszystkie, szerokosci, wysokosci } = jedenRozmiar(sekcje);
    expect(await liczbaKolumn(page)).toEqual([2, 2]);
    expect(szerokosci, `jedna szerokość: ${JSON.stringify(wszystkie)}`).toHaveLength(1);
    expect(wysokosci, `jedna wysokość: ${JSON.stringify(wszystkie)}`).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      'bez przewijania w bok').toBe(true);
  });
});

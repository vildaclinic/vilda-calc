import { expect, test } from '../support/test-czas.mjs';

// GROWTH-PUB-ONE / GROWTH-HV-KARTA — panel „Dojrzewanie płciowe" w formularzu głównym
// jako jedyne miejsce wpisu (decyzja właściciela 2026-09-09) i HV-SDS w karcie wzrostowej.
//
// Pomiar idzie przez prawdziwy formularz: rozwinięcie panelu, wpis, zapis do rekordu
// i powrót po ponownym wczytaniu. Sprzeczności sprawdzamy na żywym DOM, bo to jedyny
// sposób potwierdzenia, że pola faktycznie ze sobą rozmawiają.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PanelDojrz!26aa';

async function otworz(page) {
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
}

test.describe('Panel jest jednym miejscem wpisu', () => {
  test('domyślnie zwinięty, rozwija się pod przyciskiem i niesie komplet pól', async ({ page }) => {
    await otworz(page);
    const przycisk = page.getByRole('button', { name: '+ Dane pokwitaniowe' });
    await expect(przycisk).toBeVisible();
    await expect(page.locator('#pubertyOnsetAge')).toBeHidden();

    await przycisk.click();
    await expect(page.locator('#tannerStage')).toBeVisible();
    await expect(page.locator('#pubertyOnsetAge')).toBeVisible();
    await expect(page.locator('#pubertyMenarcheAge')).toBeVisible();
    await expect(page.locator('#pubertyMenarcheHeight')).toBeVisible(); // GROWTH-PRED-TW2B
    await expect(page.locator('#pubertyCdgp')).toBeVisible();
    await expect(page.getByRole('button', { name: '− Dane pokwitaniowe' })).toBeVisible();
  });

  test('etykieta nie obiecuje już etapu podstawianego z wieku', async ({ page }) => {
    await otworz(page);
    const opcje = await page.locator('#tannerStage option').allTextContents();
    expect(opcje[0]).toBe('— nieznany —');
    expect(opcje.join(' ')).not.toMatch(/automatycznie z wieku/);
  });

  test('po wpisaniu stadium panel nadal daje się zwinąć', async ({ page }) => {
    // Zgłoszenie właściciela: po zmianie stadium przycisk przestawał chować sekcję.
    // Odsłanianie „samo z siebie" wygrywało z decyzją lekarza przy każdym odświeżeniu.
    await otworz(page);
    await page.getByRole('button', { name: '+ Dane pokwitaniowe' }).click();
    await page.locator('#tannerStage').selectOption('3');
    await expect(page.locator('#tannerStage')).toBeVisible();

    await page.getByRole('button', { name: '− Dane pokwitaniowe' }).click();
    await expect(page.locator('#tannerStage'), 'sekcja się schowała').toBeHidden();
    await expect(page.locator('#pubertyOnsetAge')).toBeHidden();

    // I z powrotem — decyzja lekarza działa w obie strony.
    await page.getByRole('button', { name: '+ Dane pokwitaniowe' }).click();
    await expect(page.locator('#tannerStage')).toBeVisible();
  });

  test('przycisk jest wyśrodkowany', async ({ page }) => {
    await otworz(page);
    const marginesy = await page.locator('#tannerToggleBtn').evaluate((e) => {
      const s = getComputedStyle(e);
      return { l: parseFloat(s.marginLeft), r: parseFloat(s.marginRight) };
    });
    expect(marginesy.l).toBeGreaterThan(1);
    expect(Math.abs(marginesy.l - marginesy.r), 'równe marginesy = wyśrodkowany')
      .toBeLessThan(2);
  });

  test('panel otwiera się sam, gdy rekord niesie dane pokwitaniowe', async ({ page }) => {
    await otworz(page);
    await page.evaluate(() => {
      document.getElementById('pubertyOnsetAge').value = '10.5';
      window.updateTannerVisibility();
    });
    await expect(page.locator('#pubertyOnsetAge')).toBeVisible();
    await expect(page.getByRole('button', { name: '− Dane pokwitaniowe' })).toBeVisible();
  });
});

test.describe('Sprzeczności są pokazywane, nie rozstrzygane', () => {
  test('Tanner I przy wpisanym starcie pokwitania', async ({ page }) => {
    await otworz(page);
    await page.getByRole('button', { name: '+ Dane pokwitaniowe' }).click();
    await page.locator('#age').fill('12');
    await page.locator('#tannerStage').selectOption('1');
    await page.locator('#pubertyOnsetAge').fill('10');

    const nota = page.locator('#pubertyConflicts');
    await expect(nota).toBeVisible();
    await expect(nota).toContainText('nie jest przedpokwitaniowe');
    // Nic nie zostało za lekarza poprawione ani skasowane.
    await expect(page.locator('#tannerStage')).toHaveValue('1');
    await expect(page.locator('#pubertyOnsetAge')).toHaveValue('10');
  });

  test('kontrola negatywna: dane spójne nie generują noty', async ({ page }) => {
    await otworz(page);
    await page.getByRole('button', { name: '+ Dane pokwitaniowe' }).click();
    await page.locator('#age').fill('12');
    await page.locator('#tannerStage').selectOption('3');
    await page.locator('#pubertyOnsetAge').fill('10');
    await expect(page.locator('#pubertyConflicts')).toBeHidden();
  });
});

test.describe('Panel zapisuje do rekordu i z niego wraca', () => {
  test('zapis pacjenta niesie sekcję puberty, wczytanie odtwarza pola', async ({ page }) => {
    await otworz(page);
    await page.getByRole('button', { name: '+ Dane pokwitaniowe' }).click();
    await page.locator('#pubertyOnsetAge').fill('10.5');
    await page.locator('#pubertyMenarcheAge').fill('12.5');
    await page.locator('#pubertyMenarcheHeight').fill('152.5');
    await page.locator('#pubertyCdgp').selectOption('tak');

    const zebrane = await page.evaluate(() => window.collectUserData().puberty);
    expect(zebrane).toEqual({
      onsetAgeYears: 10.5, menarcheAgeYears: 12.5, heightAtMenarcheCm: 152.5, cdgpDeclared: 'tak',
    });

    // Wczytanie rekordu odtwarza panel — bez tego lekarz nadpisałby własne dane pustymi polami.
    await page.evaluate(() => {
      ['pubertyOnsetAge', 'pubertyMenarcheAge', 'pubertyMenarcheHeight', 'pubertyCdgp'].forEach((id) => {
        document.getElementById(id).value = '';
      });
      window.applyLoadedData({
        user: { age: 12, sex: 'K', height: 145, weight: 35 },
        puberty: { onsetAgeYears: 9.8, menarcheAgeYears: 11.9, heightAtMenarcheCm: 143, cdgpDeclared: 'nie' },
      });
    });
    await expect(page.locator('#pubertyOnsetAge')).toHaveValue('9.8');
    await expect(page.locator('#pubertyMenarcheAge')).toHaveValue('11.9');
    await expect(page.locator('#pubertyMenarcheHeight')).toHaveValue('143');
    await expect(page.locator('#pubertyCdgp')).toHaveValue('nie');
  });

  test('rekord bez sekcji czyści pola — nie zostaje po poprzednim pacjencie', async ({ page }) => {
    await otworz(page);
    await page.getByRole('button', { name: '+ Dane pokwitaniowe' }).click();
    await page.locator('#pubertyOnsetAge').fill('10.5');
    await page.evaluate(() => window.applyLoadedData({ user: { age: 8, sex: 'M' } }));
    await expect(page.locator('#pubertyOnsetAge')).toHaveValue('');
    expect(await page.evaluate(() => window.collectUserData().puberty)).toBeNull();
  });
});

test.describe('HV-SDS w karcie wzrostowej', () => {
  const KARTA = async (page, opcje) => page.evaluate((o) => {
    const model = window.VildaTrajectoryAnalysis.analyze({
      sex: o.sex,
      currentAgeMonths: o.nowM,
      measurements: o.pomiary,
      source: 'PALCZEWSKA',
    });
    return model ? window.VildaTrajectoryAnalysis.buildHtml(model) : null;
  }, opcje);

  test('karta podaje SDS tempa razem z populacją odniesienia, bez werdyktu', async ({ page }) => {
    await otworz(page);
    const html = await KARTA(page, {
      sex: 'K',
      nowM: 120,
      pomiary: [
        { ageMonths: 108, height: 125, weight: 25 },
        { ageMonths: 120, height: 128, weight: 27 },
      ],
    });
    expect(html, 'karta się zbudowała').toBeTruthy();
    expect(html).toContain('SDS tempa:');
    expect(html).toMatch(/populacja niemiecka/);
    expect(html).toMatch(/2,8 SD/);
  });

  test('deklaracja KOWD z panelu dokłada gałąź kwartylową', async ({ page }) => {
    await otworz(page);
    await page.getByRole('button', { name: '+ Dane pokwitaniowe' }).click();
    await page.locator('#pubertyCdgp').selectOption('tak');
    const html = await KARTA(page, {
      sex: 'M',
      nowM: 168,
      pomiary: [
        { ageMonths: 156, height: 150, weight: 40 },
        { ageMonths: 168, height: 154.2, weight: 43 },
      ],
    });
    expect(html).toContain('KOWD (deklaracja lekarza):');
    expect(html).toMatch(/centyl|mediany/);
  });

  test('kontrola negatywna: bez deklaracji nie ma gałęzi KOWD', async ({ page }) => {
    await otworz(page);
    const html = await KARTA(page, {
      sex: 'M',
      nowM: 168,
      pomiary: [
        { ageMonths: 156, height: 150, weight: 40 },
        { ageMonths: 168, height: 154.2, weight: 43 },
      ],
    });
    expect(html).not.toContain('KOWD (deklaracja lekarza)');
  });
});

test.describe('Wzrost przy menarche (GROWTH-PRED-TW2B) w panelu', () => {
  test('pole mieszka w panelu i zgłasza sprzeczności: u chłopca; większy niż wzrost obecny', async ({ page }) => {
    await otworz(page);
    await page.locator('#sex').selectOption('M');
    await page.getByRole('button', { name: '+ Dane pokwitaniowe' }).click();
    const pole = page.locator('#pubertyMenarcheHeight');
    await expect(pole).toBeVisible();
    await pole.fill('140');
    await expect(page.locator('#pubertyConflicts')).toContainText('Wzrost przy menarche wpisany u chłopca.');
    await page.locator('#sex').selectOption('F');
    await page.locator('#height').fill('135');
    await page.locator('#pubertyMenarcheAge').fill('12');
    await pole.fill('140');
    await expect(page.locator('#pubertyConflicts')).toContainText('Wzrost przy menarche (140 cm) większy niż wzrost obecny (135 cm)');
    await pole.fill('130');
    await expect(page.locator('#pubertyConflicts')).toBeHidden();
  });
});

test.describe('„Wyczyść wszystkie pola” zostawia formularz w stanie wyjściowym', () => {
  test('czyści pola pokwitaniowe i zwija panel', async ({ page }) => {
    await otworz(page);
    await page.getByRole('button', { name: '+ Dane pokwitaniowe' }).click();
    await page.locator('#tannerStage').selectOption('3');
    await page.locator('#pubertyOnsetAge').fill('11');
    await page.locator('#pubertyMenarcheAge').fill('12.5');
    await page.locator('#pubertyMenarcheHeight').fill('152.5');
    await page.locator('#pubertyCdgp').selectOption('tak');

    await page.locator('#clearAllDataBtn').click();

    // Bez czyszczenia tych pól wiek startu pokwitania poprzedniego pacjenta
    // zostawał w formularzu i wchodził do rekordu następnego.
    await expect(page.locator('#tannerStage')).toBeHidden();
    await expect(page.getByRole('button', { name: '+ Dane pokwitaniowe' })).toBeVisible();
    const wartosci = await page.evaluate(() => ['tannerStage', 'pubertyOnsetAge',
      'pubertyMenarcheAge', 'pubertyMenarcheHeight', 'pubertyCdgp'].map((id) => document.getElementById(id).value));
    expect(wartosci).toEqual(['', '', '', '', '']);
    expect(await page.evaluate(() => window.collectUserData().puberty)).toBeNull();
  });
});

test.describe('Objętość jąder mieszka w panelu, nie w karcie zaawansowanej', () => {
  // GROWTH-PUB-TWO (decyzja właściciela): objętość jąder to „stan na dziś" jak etap
  // Tannera, więc wpisuje się ją obok stadium — w panelu „Dane pokwitaniowe". Ocena KOWD
  // czyta pole nadal po id, więc dostaje wartość jak dotąd, tylko z innego miejsca.
  test('pole zwija się z panelem, a rozwinięte stoi obok stadium poza kartą zaawansowaną', async ({ page }) => {
    await otworz(page);
    await page.selectOption('#sex', 'M');
    await expect(page.locator('#advTesticularVolume')).toBeHidden();
    await page.getByRole('button', { name: '+ Dane pokwitaniowe' }).click();
    await expect(page.locator('#advTesticularVolume')).toBeVisible();

    const polozenie = await page.evaluate(() => {
      const pole = document.getElementById('advTesticularVolume');
      const stadium = document.getElementById('tannerStageWrap');
      const dalsze = document.getElementById('pubertyExtraWrap');
      return {
        wPanelu: Boolean(pole.closest('#testicularVolumeWrap')),
        wKarcieZaawansowanej: Boolean(pole.closest('#advancedGrowthForm')),
        poStadium: Boolean(stadium.compareDocumentPosition(pole) & Node.DOCUMENT_POSITION_FOLLOWING),
        przedDalszymi: Boolean(dalsze.compareDocumentPosition(pole) & Node.DOCUMENT_POSITION_PRECEDING),
      };
    });
    expect(polozenie).toEqual({
      wPanelu: true, wKarcieZaawansowanej: false, poStadium: true, przedDalszymi: true,
    });
  });

  test('u dziewczynki pole jest schowane tą samą regułą co dotąd', async ({ page }) => {
    await otworz(page);
    await page.getByRole('button', { name: '+ Dane pokwitaniowe' }).click();
    await page.selectOption('#sex', 'F');
    await expect(page.locator('#advTesticularVolume')).toBeHidden();
    await expect(page.locator('#tannerStage'), 'reszta panelu zostaje').toBeVisible();
    await page.selectOption('#sex', 'M');
    await expect(page.locator('#advTesticularVolume')).toBeVisible();
  });

  test('rekord z objętością jąder otwiera panel, a wartość nadal wchodzi do rekordu (KOWD)', async ({ page }) => {
    await otworz(page);
    await expect(page.locator('#advTesticularVolume')).toBeHidden();
    await page.evaluate(() => window.applyLoadedData({
      user: { age: 13, sex: 'M', height: 150, weight: 40 },
      advanced: { testicularVolume: '4to6' },
    }));
    await expect(page.locator('#advTesticularVolume')).toBeVisible();
    await expect(page.locator('#advTesticularVolume')).toHaveValue('4to6');
    expect(await page.evaluate(() => window.collectUserData().advanced.testicularVolume)).toBe('4to6');
  });
});

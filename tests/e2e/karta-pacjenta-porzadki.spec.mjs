import { expect, test } from '../support/test-czas.mjs';

// Rata D z audytu sekcji „Pacjenci" — reszta znalezisk, porządkowa.
//
// P1  ekrany „Pacjentów" nie reagowały na zmiany z zewnątrz (0 nasłuchów na `vilda:sync-merged`);
// P4  pamięć podręczna karty (`xa`) trzymała gotowy DOM i nic jej nie unieważniało;
// P2  martwy operator przecinkowy w żetonie terminu — etykieta nie rozróżniała zaległości;
// P6  komunikaty sejfu trafiały na ekran razem z nazwą funkcji („savePatientNote: …");
// P7  długość wizyty spoza zakresu 5–1440 znikała bez słowa;
// P8  wynik badania niepasujący do wzorca liczby cicho nie trafiał na wykres trendu;
// P11 kategoria „Klirens" była w słowniku, ale nie miała chipa — i przegrywała z labResult;
// P12 kliknięcie wpisu w Historii nie wskazywało, o który wpis chodzi.
//
// Service worker zablokowany: przy pierwszej wizycie instaluje się i robi `location.reload()`
// na `controllerchange`, co przerywa nawigację testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Porzadki!2026aa';

async function otworzZKontem(page) {
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
  await page.waitForFunction(() => Boolean(window.VildaAuthUI));
}

const zalozPacjenta = (page, nazwisko = 'Kowalski') => page.evaluate(async (n) => {
  const wynik = await window.VildaVault.savePatient({
    name: n + ' Jan',
    user: { lastName: n, firstName: 'Jan', sex: 'M', age: 5, ageMonths: 0, height: 110, weight: 19 },
  }, { dedup: false });
  return wynik.patientId;
}, nazwisko);

const otworzKarte = async (page, patientId) => {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await expect(page.locator('.vilda-patient-hero-name')).toBeVisible();
};

const zakladka = (page, nazwa) => page.locator(`.vilda-patient-tab[data-tab="${nazwa}"]`);

test.describe('P1 + P4 — karta reaguje na zmianę z innego urządzenia', () => {
  test('zmiana przyniesiona synchronizacją odświeża otwartą kartę', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    await otworzKarte(page, patientId);
    await expect(page.locator('.vilda-patient-hero-name')).toHaveText('Kowalski Jan');

    // Drugie urządzenie zmienia rekord, po czym przychodzi sygnał synchronizacji.
    // Zdarzenie leci na `document` z `bubbles:false` — dokładnie tak, jak wysyła je vilda_sync.js.
    await page.evaluate(async (id) => {
      const rekord = await window.VildaVault.getPatient(id);
      const p = JSON.parse(JSON.stringify(rekord.snapshots[0].payload));
      p.name = 'Nowak-Kowalska Jan';
      p.user.lastName = 'Nowak-Kowalska';
      await window.VildaVault.savePatient(p, { patientId: id, dedup: false });
      document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
    }, patientId);

    await expect(page.locator('.vilda-patient-hero-name'),
      'karta nie może pokazywać stanu sprzed synchronizacji').toHaveText('Nowak-Kowalska Jan');
  });

  test('otwarte okno dialogowe nie jest przerywane renderem', async ({ page }) => {
    // Kontrola negatywna świadomego ograniczenia: gdy nad kartą stoi modal, nie przerywamy go.
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    await otworzKarte(page, patientId);
    await page.evaluate((id) => window.VildaAuthUI.showPatientNoteEditor({ patientId: id }), patientId);
    await expect(page.getByRole('button', { name: 'Dodaj notatkę', exact: true })).toBeVisible();

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('vilda:sync-merged', { bubbles: false }));
    });
    await expect(page.getByRole('button', { name: 'Dodaj notatkę', exact: true }),
      'edytor zostaje otwarty').toBeVisible();
  });
});

test.describe('P6 + P7 + P8 — edytor notatki mówi ludzkim głosem', () => {
  const otworzEdytor = async (page, patientId) => {
    await page.evaluate((id) => window.VildaAuthUI.showPatientNoteEditor({ patientId: id }), patientId);
    await expect(page.getByRole('button', { name: 'Dodaj notatkę', exact: true })).toBeVisible();
  };

  test('P6 — komunikat sejfu bez nazwy funkcji', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    await otworzEdytor(page, patientId);

    // Pusta notatka: sejf rzuca „savePatientNote: notatka musi mieć tytuł lub treść."
    await page.getByRole('button', { name: 'Dodaj notatkę', exact: true }).click();
    const komunikat = page.getByText('otatka musi mie');
    await expect(komunikat).toBeVisible();
    await expect(komunikat, 'żadnych nazw funkcji na ekranie lekarza')
      .not.toContainText('savePatientNote');
    await expect(komunikat).toContainText('Notatka musi mie');
  });

  test('P7 — długość wizyty spoza zakresu zatrzymuje zapis', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    await otworzEdytor(page, patientId);

    await page.getByPlaceholder('np. Wprowadzono Euthyrox').fill('Wizyta kontrolna');
    await page.locator('input[type="number"][max="1440"]').fill('3');
    await page.getByRole('button', { name: 'Dodaj notatkę', exact: true }).click();

    await expect(page.getByText('od 5 do 1440'), 'wartość nie znika bez słowa').toBeVisible();
    await expect(page.getByRole('button', { name: 'Dodaj notatkę', exact: true }),
      'edytor zostaje otwarty').toBeVisible();
    expect(await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id)
      .then((l) => l.length), patientId), 'nic się nie zapisało').toBe(0);
  });

  test('P8 — wynik nieliczbowy zapowiada się jako tekst', async ({ page }) => {
    await otworzZKontem(page);
    const patientId = await zalozPacjenta(page);
    await otworzEdytor(page, patientId);

    await page.locator('.b3-template-select').selectOption('lab');
    const wartosc = page.locator('.b3-lab-value');
    await expect(wartosc).toBeVisible();
    await wartosc.fill('12,5');
    await expect(page.getByText('na wykres trendu trafiają tylko')).toBeHidden();
    await wartosc.fill('<0,01');
    await expect(page.getByText('na wykres trendu trafiają tylko'),
      'obietnica z podpowiedzi nie może milczeć przy wyniku tekstowym').toBeVisible();
  });
});

test.describe('P2 + P11 + P12 — Notatki i Historia', () => {
  async function pacjentZNotatkami(page) {
    const patientId = await zalozPacjenta(page);
    return page.evaluate(async (id) => {
      const zalegly = await window.VildaVault.savePatientNote({
        patientId: id, title: 'Zaległa kontrola', body: 'x',
        category: 'followup', dueDateISO: '2020-01-15T00:00:00.000Z',
      });
      const klirens = await window.VildaVault.savePatientNote({
        patientId: id, title: 'eGFR', body: 'Kalkulator klirensu',
        category: 'wynik-klirens', clinicalDateISO: '2026-03-12',
        labResult: { test: 'eGFR', value: '95 ml/min', valueNum: 95, unit: 'ml/min' },
      });
      return { patientId: id, zaleglyId: zalegly.id, klirensId: klirens.id };
    }, patientId);
  }

  test('P2 — żeton rozróżnia termin zaległy od zwykłego', async ({ page }) => {
    await otworzZKontem(page);
    const { patientId } = await pacjentZNotatkami(page);
    await otworzKarte(page, patientId);
    await zakladka(page, 'notes').click();

    await expect(page.getByText('Zaległy termin:'),
      'porównanie statusu było liczone i wyrzucane').toBeVisible();
  });

  test('P11 — kategoria „Klirens" ma etykietę i własny filtr', async ({ page }) => {
    await otworzZKontem(page);
    const { patientId } = await pacjentZNotatkami(page);
    await otworzKarte(page, patientId);
    await zakladka(page, 'timeline').click();

    const historia = page.locator('.vilda-patient-tab-content[data-tab="timeline"]');
    const chip = historia.getByRole('button', { name: 'Klirens', exact: true });
    await expect(chip, 'kategoria bez chipa znikała przy dowolnym zawężeniu').toHaveCount(1);

    await chip.click();
    await expect(historia.getByText('eGFR').first(),
      'notatka klirensowa pasuje do własnego filtra').toBeVisible();
  });

  test('H7 — kliknięcie wpisu leczenia pokazuje treść, a nie pustą zakładkę', async ({ page }) => {
    // Wpisy leczenia są syntetyzowane z punktów terapii i nie mają identyfikatora notatki,
    // więc kliknięcie przerzucało lekarza na zakładkę Notatki i zostawiało go tam bez
    // niczego wskazanego. Treść wpisu jest samowystarczalna — pokazujemy ją na miejscu.
    await otworzZKontem(page);
    const patientId = await page.evaluate(async () => {
      const wynik = await window.VildaVault.savePatient({
        name: 'Terapia Jan',
        user: { lastName: 'Terapia', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 0, height: 115, weight: 19 },
        advanced: { data: { measurements: [{ ageMonths: 72, ageYears: 6, height: 115, weight: 19 }] } },
        ghTherapyPoints: [{
          id: 'g1', type: 'start', ageYears: 6, ageMonths: 0,
          dose: 0.033, doseUnit: 'mg/kg/d', weight: 19, drug: 'Omnitrope',
        }],
      }, { dedup: false });
      return wynik.patientId;
    });
    await otworzKarte(page, patientId);
    await zakladka(page, 'timeline').click();

    const historia = page.locator('.vilda-patient-tab-content[data-tab="timeline"]');
    await historia.getByText('Leczenie rhGH').first().click();

    const okno = page.locator('.vilda-auth-overlay-sheet');
    await expect(okno, 'treść wpisu pokazuje się na miejscu').toBeVisible();
    await expect(okno).toContainText('Leczenie rhGH');
    await expect(okno).toContainText('Dawka: 0,033 mg/kg/d');
    await expect(zakladka(page, 'timeline'),
      'lekarz zostaje tam, gdzie kliknął').toHaveClass(/is-active|active/);
  });

  test('P12 — kliknięcie wpisu wskazuje konkretną notatkę', async ({ page }) => {
    await otworzZKontem(page);
    const { patientId, klirensId } = await pacjentZNotatkami(page);
    await otworzKarte(page, patientId);
    await zakladka(page, 'timeline').click();

    const historia = page.locator('.vilda-patient-tab-content[data-tab="timeline"]');
    await historia.getByText('eGFR').first().click();

    await expect(page.locator(`.vilda-patient-note-card[data-note-id="${klirensId}"]`),
      'notatka jest w DOM z własnym identyfikatorem').toBeVisible();
    await expect(page.locator('.vilda-note-wskazana'),
      'przejście z Historii nie może kończyć się ślepym zaułkiem').toHaveCount(1);
  });
});

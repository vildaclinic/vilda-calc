import { expect, test } from '../support/test-czas.mjs';

// P-OTYLOSC-DZIENNIK (etapy 3 i 4 projektu „Leczenie otyłości — wpisy poza wizytą”; decyzje właściciela 2026-11-17/18,
// „Etap 3 + 4 razem” 2026-11-18). Karta pacjenta na PRAWDZIWEJ stronie: sekcja „Wpisy leczenia” z dziennika,
// „+ Kontynuacja” bez wczytywania pacjenta (masa od pacjenta NIE tworzy wersji wizyty), poprawka, usunięcie
// z „Cofnij”, konflikt dwóch wersji z wyborem i wstrzymaniem oceny wg ChPL w oknie oceny.
// Dane pacjentów wyłącznie FIKCYJNE (przykład z makiety: Testowa Zuzanna, 13 l., Wegovy); sejf zakładany w teście.
test.use({ serviceWorkers: 'block', chwila: '2026-11-18T12:00:00Z' });

const HASLO = 'E2e#DziennikKarta!26';
const WEGOVY = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const P = (id, type, dateISO, mies, weight, height, dose = '2,4 mg / tydz.') => ({
  id, type, dateISO, ageYears: 13, ageMonths: mies, weight, height,
  bmi: height > 0 ? +(weight / Math.pow(height / 100, 2)).toFixed(1) : null, drug: WEGOVY, substance: '', dose,
});
const MIGAWKA = [
  P('p-start', 'start', '2026-04-14', 0, 80, 160, '0,25 mg / tydz.'),
  P('p-paz', 'continue', '2026-10-13', 6, 75.2, 162.9),
];

async function otworz(page) {
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

async function pacjentka(page, punkty = MIGAWKA) {
  return page.evaluate(async (pts) => (await window.VildaVault.savePatient({
    name: 'Testowa Zuzanna',
    user: { lastName: 'Testowa', firstName: 'Zuzanna', sex: 'F', age: 13, ageMonths: 6, height: 162.9, weight: 75.2, dobISO: '2013-04-11' },
    obesityTherapyPoints: pts,
  }, { dedup: false })).patientId, punkty);
}

async function karta(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), pid);
  // P-KARTA-LECZENIE (etap 1): bloki leczenia stoją w zakładce „Leczenie” (druga, po „Status”).
  await page.locator('.vilda-patient-tab[data-tab="leczenie"]').click();
  await expect(page.locator('.vdo')).toBeVisible({ timeout: 15000 });
}
const wiersze = (page) => page.locator('.vdo-list:not(.vdo-list-deleted) > .vdo-item');
const wersjeWizyty = (page, pid) => page.evaluate(async (id) => {
  const p = await window.VildaVault.getPatient(id);
  return p.snapshotCount || (p.snapshots || []).length;
}, pid);
const notatkiDziennika = (page, pid) => page.evaluate(async (id) => (await window.VildaVault.listPatientNotesForPatient(id))
  .filter((n) => n.category === 'leczenie-otylosci').map((n) => ({ title: n.title, clinicalDateISO: n.clinicalDateISO })), pid);

async function kontynuacja(page, { data, masa, wzrost = '', zrodlo = 'Pacjent' }) {
  await page.getByRole('button', { name: 'Kontynuacja' }).click();
  const okno = page.getByRole('dialog', { name: /Nowy wpis leczenia/ });
  await expect(okno).toBeVisible();
  if (data) await okno.locator('#vdoDate').fill(data);
  await okno.locator('#vdoW').fill(masa);
  await okno.getByRole('radiogroup', { name: 'Kto zmierzył masę' }).getByRole('radio', { name: zrodlo }).click();
  if (wzrost) {
    await okno.locator('#vdoH').fill(wzrost);
    await okno.getByRole('radiogroup', { name: 'Kto zmierzył wzrost' }).getByRole('radio', { name: zrodlo }).click();
  }
  return okno;
}

test.describe('Karta pacjenta — dziennik leczenia otyłości', () => {
  test('DZ-1: dawne punkty widać jako wpisy „gabinet”; „+ Kontynuacja” z masą od pacjenta nie tworzy wersji wizyty', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjentka(page);
    await karta(page, pid);
    await expect(wiersze(page)).toHaveCount(2);
    await expect(wiersze(page).first()).toContainText('13.10.2026');
    await expect(wiersze(page).first()).toContainText('75,2 kg');
    await expect(wiersze(page).first().locator('.vdo-src-gabinet')).toHaveCount(2);
    await expect(page.locator('.vdo')).toContainText('Wpisy z dawnych wizyt przeniesione ze źródłem „gabinet”.');
    const wersjePrzed = await wersjeWizyty(page, pid);

    const okno = await kontynuacja(page, { data: '2026-11-10', masa: '74,6' });
    await expect(okno).toContainText('Od wpisu z 13.10.2026: −0,6 kg.');
    await expect(okno.locator('#vdoHInfo')).toContainText('Trwa okno oceny ChPL (od 27.10.2026). Ostatni wzrost: 162,9 cm z 13.10.2026 — przed oknem.');
    await expect(okno.locator('#vdoDose')).toHaveValue('2,4 mg / tydz.');
    await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(okno).toBeHidden();

    await expect(wiersze(page)).toHaveCount(3);
    await expect(wiersze(page).first()).toContainText('10.11.2026');
    await expect(wiersze(page).first()).toContainText('74,6 kg');
    await expect(wiersze(page).first().locator('.vdo-src-pacjent')).toHaveCount(1);
    await expect(wiersze(page).first()).toContainText('wzrost —');
    // Zapis wpisu: przeniesione dawne punkty + nowy wpis; wizyta bez nowej wersji.
    expect(await wersjeWizyty(page, pid)).toBe(wersjePrzed);
    expect((await notatkiDziennika(page, pid)).map((n) => n.title).sort()).toEqual([
      'Leczenie otyłości — Kontynuacja 10.11.2026', 'Leczenie otyłości — Kontynuacja 13.10.2026', 'Leczenie otyłości — Włączenie 14.04.2026',
    ]);
    // Ocena wg ChPL z dziennika: okno trwa, w oknie brak wzrostu — „Potrzebny pomiar wzrostu”.
    await page.locator('.vilda-gha-btn', { hasText: 'Dane analityczne' }).click();
    await expect(page.locator('.vilda-oba-verdict .vilda-oba-vt')).toHaveText('Potrzebny pomiar wzrostu do oceny ChPL');
  });

  test('DZ-2: walidacja okna — data obowiązkowa, zły wzrost, duplikat z wyborem', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjentka(page);
    await karta(page, pid);
    let okno = await kontynuacja(page, { masa: '74,6' });
    await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(okno.locator('#vdoDateErr')).toHaveText('Podaj datę pomiaru, np. 18.11.2026.');
    await expect(okno.locator('#vdoDate')).toHaveAttribute('aria-invalid', 'true');
    await okno.locator('#vdoDate').fill('2026-10-13');
    await okno.locator('#vdoW').fill('75,2');
    await okno.locator('#vdoH').fill('abc');
    await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(okno.locator('#vdoHErr')).toContainText('Wzrost: wpisz liczbę w cm');
    await okno.locator('#vdoH').fill('');
    await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(okno.locator('.vdo-msg-warn')).toContainText('Możliwy duplikat — 13.10.2026 jest już wpis 75,2 kg (gabinet).');
    await okno.getByRole('button', { name: 'Nie zapisuj' }).click();
    await expect(okno).toBeHidden();
    await expect(wiersze(page)).toHaveCount(2);
    expect(await notatkiDziennika(page, pid)).toEqual([]);
    // Ta sama masa innego dnia — bez ostrzeżenia.
    okno = await kontynuacja(page, { data: '2026-11-17', masa: '74,3', wzrost: '163,4' });
    await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(okno).toBeHidden();
    await expect(wiersze(page).first()).toContainText('163,4 cm');
    await page.locator('.vilda-gha-btn', { hasText: 'Dane analityczne' }).click();
    await expect(page.locator('.vilda-oba-verdict .vilda-oba-vt')).toHaveText('Odpowiedź wystarczająca — kontynuować leczenie');
  });

  test('DZ-3: poprawka i usunięcie z „Cofnij” — usunięty wpis znika z oceny i wraca po cofnięciu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjentka(page);
    await karta(page, pid);
    let okno = await kontynuacja(page, { data: '2026-11-10', masa: '74,6' });
    await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(wiersze(page)).toHaveCount(3);
    await wiersze(page).first().getByRole('button', { name: /Popraw wpis z 10.11.2026/ }).click();
    okno = page.getByRole('dialog', { name: /Popraw wpis/ });
    await okno.locator('#vdoW').fill('74,1');
    await okno.getByRole('button', { name: 'Zapisz poprawkę' }).click();
    await expect(okno).toBeHidden();
    await expect(wiersze(page).first()).toContainText('74,1 kg');
    await expect(wiersze(page)).toHaveCount(3);

    page.once('dialog', (d) => d.accept());
    await wiersze(page).first().getByRole('button', { name: /Usuń wpis z 10.11.2026/ }).click();
    await expect(wiersze(page)).toHaveCount(2);
    await expect(page.locator('.vdo .vdo-msg-info')).toContainText('Wpis z 10.11.2026 usunięty z dziennika.');
    await page.locator('.vdo .vdo-msg-info').getByRole('button', { name: 'Cofnij' }).click();
    await expect(wiersze(page)).toHaveCount(3);
    await expect(wiersze(page).first()).toContainText('74,1 kg');
  });

  test('DZ-4: dwie wersje wpisu z dwóch urządzeń — konflikt, wstrzymana ocena, wybór wersji', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjentka(page);
    // Dziennik zapisany „z dwóch urządzeń”: wpis z 10.11 i dwie równoległe poprawki tej samej wersji.
    await page.evaluate(async (id) => {
      const D = window.VildaDziennikOtylosci;
      const migawka = (await window.VildaVault.getPatient(id)).snapshots[0].payload.obesityTherapyPoints;
      const dane = { type: 'continue', dateISO: '2026-11-10', ageYears: 13, ageMonths: 6, weight: 74.6, weightSource: 'pacjent', drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', dose: '2,4 mg / tydz.' };
      const p0 = D.planNowego(await D.wczytaj(id, migawka), id, dane);
      await D.zapisz(id, p0.wersje);
      const baza = await D.wczytaj(id, migawka);
      const tel = D.planPoprawki(baza, id, p0.entryId, { ...dane, weight: 74.6, comment: 'od rodzica' }, { urzadzenie: 'telefon' });
      const kom = D.planPoprawki(baza, id, p0.entryId, { ...dane, weight: 74.1, weightSource: 'gabinet' }, { urzadzenie: 'komputer' });
      await D.zapisz(id, tel.wersje);
      await D.zapisz(id, kom.wersje);
    }, pid);
    await karta(page, pid);
    await expect(page.locator('.vdo .vdo-msg-err')).toContainText('Jeden wpis ma dwie wersje');
    const konfl = page.locator('.vdo-item-conflict');
    await expect(konfl).toHaveCount(1);
    await page.locator('.vilda-gha-btn', { hasText: 'Dane analityczne' }).click();
    await expect(page.locator('.vilda-oba-verdict .vilda-oba-vt')).toHaveText('Ocena wstrzymana — dwie wersje wpisu z 10.11.2026');
    await expect(page.locator('.vilda-oba-verdict .vilda-oba-vd')).toContainText(/\((74,6 kg i 74,1 kg|74,1 kg i 74,6 kg)\)/);

    await konfl.getByRole('button', { name: 'Wybierz wersję' }).click();
    const okno = page.getByRole('dialog', { name: /Wpis z 10.11.2026 poprawiono na dwóch urządzeniach/ });
    await expect(okno.locator('.vdo-version')).toHaveCount(2);
    await expect(okno.locator('.vdo-diff').first()).toBeVisible();
    await okno.locator('.vdo-version', { hasText: 'Komputer' }).getByRole('button', { name: 'Zostaw tę wersję' }).click();
    await expect(okno).toBeHidden();
    await expect(page.locator('.vdo-item-conflict')).toHaveCount(0);
    await expect(wiersze(page).first()).toContainText('74,1 kg');
    await page.locator('.vilda-gha-btn', { hasText: 'Dane analityczne' }).click();
    await expect(page.locator('.vilda-oba-verdict .vilda-oba-vt')).toHaveText('Potrzebny pomiar wzrostu do oceny ChPL');
  });

  test('DZ-5: bez aktywnego cyklu (po Zakończeniu) — „+ Kontynuacja” wyjaśnia, że nowy cykl zaczyna Włączenie w DocPro', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjentka(page, [...MIGAWKA, P('p-end', 'end', '2026-11-03', 6, 74.9, 163)]);
    await karta(page, pid);
    await expect(page.getByRole('button', { name: 'Kontynuacja' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#vdoAddWhy')).toHaveText('Brak aktywnego cyklu — nowy cykl zaczyna się od Włączenia przy wizycie.');
    // P-OTYLOSC-SKOK (etap 2): obok — przycisk do monitora DocPro (nowy cykl zaczyna Włączenie przy wizycie).
    await expect(page.getByRole('button', { name: 'Włączenie w DocPro →' })).toBeVisible();
    // aria-disabled: przycisk zostaje w kolejności klawiatury i po kliknięciu wyjaśnia powód (jak przyciski monitora).
    await page.getByRole('button', { name: 'Kontynuacja' }).click({ force: true });
    await expect(page.locator('.vdo .vdo-msg-warn')).toContainText('nowy cykl zaczyna się od Włączenia');
    await expect(page.locator('.vdo-dialog')).toHaveCount(0);
  });

  test('DZ-6: Notatki chowają wpisy dziennika za jedną linią; Historia pokazuje „Leczenie otyłości” z masą od pacjenta', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const pid = await pacjentka(page);
    await page.evaluate(async (id) => {
      await window.VildaVault.savePatientNote({ patientId: id, title: 'Fikcyjna obserwacja', body: 'Dobra tolerancja.', category: 'observation', clinicalDateISO: '2026-08-11' });
    }, pid);
    await karta(page, pid);
    const okno = await kontynuacja(page, { data: '2026-11-10', masa: '74,6' });
    await okno.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(wiersze(page)).toHaveCount(3);

    await page.locator('.vilda-patient-tab[data-tab="notes"]').click();
    const notatki = page.locator('.vilda-patient-tab-content[data-tab="notes"]');
    await expect(notatki.getByRole('button', { name: 'Wpisy leczenia otyłości (3) — Leczenie →' })).toBeVisible();
    await expect(notatki.locator('.vilda-patient-note-card')).toHaveCount(1);
    await expect(notatki).toContainText('Fikcyjna obserwacja');
    await expect(notatki).not.toContainText('vildaOtylosc');
    await notatki.getByRole('button', { name: 'Wpisy leczenia otyłości (3) — Leczenie →' }).click();
    await expect(page.locator('.vdo')).toBeInViewport();

    await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
    const historia = page.locator('.vilda-patient-tab-content[data-tab="timeline"]');
    await expect(historia).toContainText('Masa: 74,6 kg (pacjent)');
    await expect(historia).toContainText('Masa: 80 kg (gabinet), wzrost 160 cm (gabinet)');
    await expect(historia).toContainText('z dziennika leczenia — poprawka w „Wpisy leczenia”');
    await expect(historia).not.toContainText('z monitora DocPro');
    await expect(historia).not.toContainText('vildaOtylosc');
    await expect(historia).not.toContainText('Wpis dziennika leczenia otyłości');
  });
});

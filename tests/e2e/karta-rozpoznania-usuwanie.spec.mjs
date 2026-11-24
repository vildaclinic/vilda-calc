import { expect, test } from '../support/test-czas.mjs';
import { BEZ, bezPrzewijaniaWBok, karta, otworz, tresc, zapisz } from '../support/karta-leczenie.mjs';

// P-ROZPOZNANIA, rata 3 (prośba właściciela 2026-11-24): usuwanie rozpoznania w Karcie pacjenta na PRAWDZIWEJ stronie.
// Mechanizm jest ten sam, co w nowej Karcie pacjenta (strona główna): magazyn leczenia w sejfie (removeDiagnosis) usuwa
// zapis istniejącym aktorem notatki — sprawdzenie wersji, jedno niepodzielne usunięcie i zwykły nagrobek notatki do
// synchronizacji; zapisy leczenia wskazujące rozpoznanie zostają. Dane wyłącznie FIKCYJNE; sejf zakładany w teście.
test.use({ serviceWorkers: 'block', chwila: '2026-11-24T11:00:00Z' });

const PYTANIE = 'Usunąć to rozpoznanie z kartoteki pacjenta?';
const sekcja = (page) => tresc(page, 'leczenie').locator('.vilda-kr');
const wiersze = (page) => sekcja(page).locator('.vilda-kr-wiersz');
const arkusz = (page) => page.locator('.vilda-kr-arkusz');
const usun = (page) => arkusz(page).getByRole('button', { name: 'Usuń rozpoznanie' });
const zakladka = (page, id) => page.locator(`.vilda-patient-tabs > .vilda-patient-tab[data-tab="${id}"]`);
const informacja = (page) => page.locator('.vilda-auth-sheet-info:not(.vilda-kr-arkusz)');
// Zapisy leczenia pacjenta i nagrobki notatek — prosto z sejfu strony.
const stan = (page, pid) => page.evaluate(async (id) => {
  const notatki = (await window.VildaVault.listPatientNotesForPatient(id))
    .filter((n) => Object.prototype.hasOwnProperty.call(n, 'treatmentContext'))
    .map((n) => ({ id: n.id, rev: n.rev, rodzaj: n.treatmentContext.kind, nazwa: n.treatmentContext.name || n.treatmentContext.title,
      stan: n.treatmentContext.status, rozpoznania: n.treatmentContext.diagnosisIds || null }));
  const nagrobki = (await window.VildaVault.exportSyncPayload()).patientNoteTombstones.map((t) => ({ id: t.id, rev: t.rev }));
  return { notatki, nagrobki };
}, pid);
// Rozpoznania zakładane przez magazyn leczenia strony (ten sam, którego używa formularz) — test dotyczy usuwania.
async function pacjent(page, rozpoznania) {
  await otworz(page);
  const pid = await zapisz(page, BEZ);
  const ids = await page.evaluate(async ({ id, lista }) => {
    const zakres = window.VildaPatientTreatmentStore.createScope({ vault: window.VildaVault, patientId: id, isCurrent: () => true });
    const wynik = [];
    for (const wartosci of lista) wynik.push((await zakres.createDiagnosis(wartosci)).id);
    return wynik;
  }, { id: pid, lista: rozpoznania });
  await karta(page, pid);
  await zakladka(page, 'leczenie').click();
  await expect(wiersze(page)).toHaveCount(rozpoznania.length);
  return { pid, ids };
}
const OTYLOSC = { name: 'Fikcyjna otyłość prosta', code: 'E66.0', status: 'active', dateISO: '2026-11-20' };
const TURNER = { name: 'Fikcyjny zespół Turnera', code: 'Q96', status: 'active', dateISO: '2026-10-05' };
const edytuj = async (page, nr) => {
  await wiersze(page).nth(nr).getByRole('button', { name: /^Edytuj rozpoznanie/ }).click();
  await expect(arkusz(page)).toBeVisible();
};

test.describe('Karta pacjenta — usuwanie rozpoznania (komputer)', () => {
  test('KU-1 „Usuń rozpoznanie” w formularzu edycji: pytanie, odmowa niczego nie zmienia, zgoda usuwa zapis i zostawia nagrobek', async ({ page }) => {
    test.setTimeout(150_000);
    const { pid, ids } = await pacjent(page, [OTYLOSC, TURNER]);
    const przed = await stan(page, pid);
    expect(przed.nagrobki).toEqual([]);

    // Nowe rozpoznanie nie ma czego usuwać.
    await sekcja(page).getByRole('button', { name: 'Dodaj rozpoznanie' }).click();
    await expect(arkusz(page)).toBeVisible();
    await expect(usun(page)).toHaveCount(0);
    await arkusz(page).getByRole('button', { name: 'Anuluj' }).click();
    await expect(arkusz(page)).toHaveCount(0);

    // Edycja: przycisk jest osobno, na końcu formularza pod „Anuluj”, i działa od razu (nie czeka na katalog ICD-10).
    await edytuj(page, 0);
    await expect(arkusz(page).locator('.vilda-auth-sheet-title')).toHaveText('Edytuj rozpoznanie');
    await expect(usun(page)).toBeEnabled();
    const uklad = await arkusz(page).evaluate((a) => {
      const r = (s) => a.querySelector(s).getBoundingClientRect();
      return { podAnuluj: r('[data-kr="usun"]').top >= r('[data-kr="anuluj"]').bottom, wezszy: r('[data-kr="usun"]').width < r('[data-kr="anuluj"]').width };
    });
    expect(uklad).toEqual({ podAnuluj: true, wezszy: true });

    // Odmowa w pytaniu: formularz zostaje, w sejfie nic się nie zmienia.
    const pytania = [];
    page.once('dialog', (d) => { pytania.push(d.message()); d.dismiss(); });
    await usun(page).click();
    await expect(arkusz(page)).toBeVisible();
    expect(await stan(page, pid)).toEqual(przed);

    // Zmieniony formularz: pytanie mówi, że zmiany przepadną. Zgoda usuwa.
    await arkusz(page).locator('select[name="status"]').selectOption('closed');
    page.once('dialog', (d) => { pytania.push(d.message()); d.accept(); });
    await usun(page).click();
    await expect(arkusz(page)).toHaveCount(0);
    expect(pytania).toEqual([PYTANIE, PYTANIE + ' Zmiany w formularzu zostaną odrzucone.']);

    await expect(wiersze(page)).toHaveCount(1);
    await expect(wiersze(page).locator('strong')).toHaveText('Q96 — Fikcyjny zespół Turnera');
    await expect(sekcja(page).locator('.vilda-kr-komunikat')).toHaveText('Usunięto rozpoznanie.');
    await expect(sekcja(page).getByRole('button', { name: 'Dodaj rozpoznanie' })).toBeFocused();

    // Sejf: zapis zniknął (bez zapisania zmiany statusu), drugi bez zmian, nagrobek niesie wersję usuniętego zapisu.
    const po = await stan(page, pid);
    expect(po.notatki).toEqual(przed.notatki.filter((n) => n.id !== ids[0]));
    expect(po.nagrobki).toEqual([{ id: ids[0], rev: przed.notatki.find((n) => n.id === ids[0]).rev }]);
    // Odczyt, z którego korzystają statystyki Bazy: usunięte rozpoznanie przestaje być liczone.
    expect(await page.evaluate(async () => (await window.VildaVault.listPatientNotesByCategory('treatment'))
      .map((n) => n.treatmentContext && n.treatmentContext.code))).toEqual(['Q96']);

    // „Notatki” i ponowne otwarcie Karty: usuniętego rozpoznania nie ma.
    await zakladka(page, 'notes').click();
    await expect(tresc(page, 'notes')).toContainText('Rozpoznanie · Fikcyjny zespół Turnera');
    await expect(tresc(page, 'notes')).not.toContainText('Fikcyjna otyłość prosta');
    await karta(page, pid, { activeTab: 'leczenie' });
    await expect(wiersze(page).locator('strong')).toHaveText('Q96 — Fikcyjny zespół Turnera');
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });

  test('KU-2 rozpoznanie zmienione w innym miejscu: usunięcie odmawia, zapis zostaje, formularz można już tylko zamknąć', async ({ page }) => {
    test.setTimeout(150_000);
    const { pid, ids } = await pacjent(page, [OTYLOSC]);
    await edytuj(page, 0);
    // Druga karta przeglądarki (tu: drugi zakres magazynu leczenia) zamyka to samo rozpoznanie.
    await page.evaluate(async ({ id, rozpoznanie }) => {
      const zakres = window.VildaPatientTreatmentStore.createScope({ vault: window.VildaVault, patientId: id, isCurrent: () => true });
      const dto = (await zakres.read()).diagnoses.find((x) => x.id === rozpoznanie);
      await zakres.updateDiagnosis(dto, { status: 'closed' });
    }, { id: pid, rozpoznanie: ids[0] });
    const przed = await stan(page, pid);
    expect(przed.notatki[0].stan).toBe('closed');

    page.once('dialog', (d) => d.accept());
    await usun(page).click();
    await expect(arkusz(page).locator('.vilda-kr-blad')).toHaveText('Zapis zmienił się w innym miejscu. Zachowaj wpisaną treść, anuluj formularz i otwórz aktualny zapis.');
    await expect(arkusz(page).locator('.vilda-kr-blad')).toBeFocused();
    await expect(usun(page)).toBeDisabled();
    await expect(arkusz(page).getByRole('button', { name: 'Zapisz' })).toBeDisabled();
    expect(await stan(page, pid)).toEqual(przed);

    // Po zamknięciu lista pokazuje aktualny zapis; z niego usunięcie działa.
    await arkusz(page).getByRole('button', { name: 'Anuluj' }).click();
    await expect(arkusz(page)).toHaveCount(0);
    await expect(wiersze(page).locator('.vilda-kr-opis')).toHaveText('Rozpoznanie zamknięte · 20.11.2026');
    await edytuj(page, 0);
    page.once('dialog', (d) => d.accept());
    await usun(page).click();
    await expect(arkusz(page)).toHaveCount(0);
    await expect(sekcja(page).locator('.vilda-kr-pusto')).toHaveText('Rozpoznania nie uzupełniono.');
    const po = await stan(page, pid);
    expect(po.notatki).toEqual([]);
    expect(po.nagrobki).toEqual([{ id: ids[0], rev: przed.notatki[0].rev }]);
  });

  test('KU-3 „Notatki”: „Usuń” przy rozpoznaniu idzie tym samym mechanizmem, powiązany zapis leczenia zostaje i jest tylko do odczytu', async ({ page }) => {
    test.setTimeout(150_000);
    const { pid, ids } = await pacjent(page, [OTYLOSC]);
    // Zapis leczenia z nowej Karty pacjenta (epizod wskazujący to rozpoznanie) — tu tylko do odczytu.
    const epizod = await page.evaluate(async ({ id, rozpoznanie }) => {
      const zakres = window.VildaPatientTreatmentStore.createScope({ vault: window.VildaVault, patientId: id, isCurrent: () => true });
      return (await zakres.createEpisode({ title: 'Fikcyjny epizod leczenia KU-3', method: 'pharmacological', status: 'active',
        startDateISO: '2026-11-21', medication: 'Fikcyjny preparat PX-311', dose: 'Fikcyjna dawka DX-512', diagnosisIds: [rozpoznanie] })).id;
    }, { id: pid, rozpoznanie: ids[0] });
    await karta(page, pid, { activeTab: 'notes' });
    const notatki = tresc(page, 'notes');
    await expect(notatki).toContainText('Rozpoznanie · Fikcyjna otyłość prosta');
    const przed = await stan(page, pid);
    // Wiersz notatki nie ma własnej klasy: najgłębszy blok, który zawiera i tytuł wpisu, i jego przycisk „Usuń”.
    const wpis = (tekst) => notatki.locator('div', { has: page.getByRole('button', { name: 'Usuń', exact: true }) }).filter({ hasText: tekst }).last();

    // Epizod: „Usuń” nie usuwa — informacja „tylko do odczytu”, sejf bez zmian.
    let pytan = 0;
    page.on('dialog', (d) => { pytan += 1; d.dismiss(); });
    await wpis('Fikcyjny epizod leczenia KU-3').getByRole('button', { name: 'Usuń', exact: true }).click();
    await expect(informacja(page).locator('.vilda-auth-sheet-body')).toHaveText('Ten zapis leczenia jest tutaj tylko do odczytu.');
    await informacja(page).getByRole('button', { name: 'Zamknij' }).click();
    await expect(informacja(page)).toHaveCount(0);
    expect(pytan).toBe(0);
    expect(await stan(page, pid)).toEqual(przed);
    page.removeAllListeners('dialog');

    // Rozpoznanie: pytanie mówi o powiązanym leczeniu; zgoda usuwa rozpoznanie, epizod zostaje ze swoim wskazaniem.
    const pytania = [];
    page.once('dialog', (d) => { pytania.push(d.message()); d.accept(); });
    await wpis('Rozpoznanie · Fikcyjna otyłość prosta').getByRole('button', { name: 'Usuń', exact: true }).click();
    await expect(notatki).not.toContainText('Rozpoznanie · Fikcyjna otyłość prosta');
    expect(pytania).toEqual([PYTANIE + ' Powiązane z nim zapisy leczenia zostaną w karcie bez zmian.']);
    const po = await stan(page, pid);
    expect(po.notatki).toEqual(przed.notatki.filter((n) => n.id !== ids[0]));
    expect(po.notatki).toEqual([expect.objectContaining({ id: epizod, rodzaj: 'therapy', rozpoznania: [ids[0]] })]);
    expect(po.nagrobki).toEqual([{ id: ids[0], rev: przed.notatki.find((n) => n.id === ids[0]).rev }]);
    await zakladka(page, 'leczenie').click();
    await expect(sekcja(page).locator('.vilda-kr-pusto')).toHaveText('Rozpoznania nie uzupełniono.');
    await expect(sekcja(page).locator('.vilda-kr-inne')).toHaveText('Pozostałe zapisy leczenia tego pacjenta (1) są w zakładce „Notatki”.');
  });

  test('KU-4 formularz otwarty z „Notatek” też ma „Usuń rozpoznanie”; po usunięciu wpis znika z historii', async ({ page }) => {
    test.setTimeout(150_000);
    const { pid, ids } = await pacjent(page, [TURNER]);
    await zakladka(page, 'notes').click();
    const notatki = tresc(page, 'notes');
    await notatki.getByRole('button', { name: 'Edytuj', exact: true }).first().click();
    await expect(arkusz(page)).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await usun(page).click();
    await expect(arkusz(page)).toHaveCount(0);
    await expect(notatki).not.toContainText('Rozpoznanie · Fikcyjny zespół Turnera');
    const po = await stan(page, pid);
    expect(po.notatki).toEqual([]);
    expect(po.nagrobki.map((t) => t.id)).toEqual([ids[0]]);
  });
});

test.describe('Karta pacjenta — usuwanie rozpoznania (telefon)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('KU-5 telefon: „Usuń rozpoznanie” mieści się w formularzu, ma co najmniej 44 px i usuwa rozpoznanie', async ({ page }) => {
    test.setTimeout(150_000);
    const { pid } = await pacjent(page, [OTYLOSC]);
    await edytuj(page, 0);
    const miary = await arkusz(page).evaluate((a) => {
      const p = a.querySelector('[data-kr="usun"]').getBoundingClientRect(), r = a.getBoundingClientRect();
      return { wysokosc: p.height, wArkuszu: p.left >= r.left - 1 && p.right <= r.right + 1, wBok: a.scrollWidth - a.clientWidth };
    });
    expect(miary.wysokosc).toBeGreaterThanOrEqual(44);
    expect(miary.wArkuszu).toBe(true);
    expect(miary.wBok).toBeLessThanOrEqual(1);
    // Przycisk jest ostatnim elementem arkusza, pod „Zapisz” i „Anuluj”: nie zmienia ich położenia; arkusz przewija się do niego.
    await expect(arkusz(page).getByRole('button', { name: 'Zapisz' })).toBeInViewport({ ratio: 1 });
    await usun(page).scrollIntoViewIfNeeded();
    await expect(usun(page)).toBeInViewport({ ratio: 1 });
    page.once('dialog', (d) => d.accept());
    await usun(page).click();
    await expect(arkusz(page)).toHaveCount(0);
    await expect(sekcja(page).locator('.vilda-kr-komunikat')).toHaveText('Usunięto rozpoznanie.');
    expect((await stan(page, pid)).notatki).toEqual([]);
    expect(await bezPrzewijaniaWBok(page)).toBe(true);
  });
});

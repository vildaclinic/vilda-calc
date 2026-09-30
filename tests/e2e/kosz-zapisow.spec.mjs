import { expect, test } from '../support/test-czas.mjs';

// P-KOSZ-ZAPISOW (decyzje właściciela 2026-09-30, makieta zaakceptowana w całości): usuwanie pomylonego zapisu do
// kosza ze „Sprawdzenia spójności zapisów”, blokady (brak pomiarów w karcie drugiej osoby, brak jej karty), zapis
// przypięty, kosz w Ustawieniach i w historii wersji, kopia .wiw przed usunięciem, telefon. Warstwę sejfu
// (nagrobki w synchronizacji, 30 dni, import) sprawdza tests/unit/kosz-zapisow.test.mjs.
//
// Własne, fikcyjne konto sejfu. Osoby fikcyjne: „Innyrecz Adam” (karta z pomyłką), „Probna Alicja” (zapis w karcie
// Adama), „Probna Ola” (osoba bez własnej karty).
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#KoszZapisow!26a';

async function przygotuj(page) {
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('analyticsConsent', 'denied');
    } catch (_) { /* brak storage — pomiń */ }
  });
}

async function gotowa(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => {
    const root = document.getElementById('vilda-auth-ui-root');
    return !root || window.getComputedStyle(root).display === 'none';
  });
  await page.waitForFunction(() => document.getElementById('recordConsistencyCard')?.getAttribute('data-spojnosc') === 'gotowa'
    && document.getElementById('recordTrashCard')?.getAttribute('data-kosz') === 'gotowy');
}

async function otworzZKontem(page) {
  await przygotuj(page);
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
}

// wariant: 'jest' — pomiar pomylonego zapisu jest w karcie Alicji; 'brak' — karta Alicji ma tylko starszy pomiar;
// 'bez-karty' — w karcie Adama zapis osoby bez własnej karty.
async function zasiej(page, wariant) {
  return page.evaluate(async (w) => {
    const v = window.VildaVault;
    const krok = () => new Promise((r) => { const t = Date.now(); const f = () => (Date.now() > t + 1 ? r() : setTimeout(f, 1)); f(); });
    const osoba = (lastName, firstName, dobISO, sex, height, weight, age, ageMonths) => ({
      name: `${lastName} ${firstName}`,
      user: { lastName, firstName, dobISO, sex, height, weight, age, ageMonths },
    });
    const zapisz = async (p, o = {}) => { await krok(); return v.savePatient(p, { dedup: false, ...o }); };
    const a = await zapisz(osoba('Innyrecz', 'Adam', '2016-03-12', 'M', 120, 22, 10, 6));
    await zapisz(osoba('Innyrecz', 'Adam', '2016-03-12', 'M', 121, 22.5, 10, 6), { patientId: a.patientId });
    let b = null;
    if (w === 'jest') b = await zapisz(osoba('Probna', 'Alicja', '2012-08-05', 'F', 150, 52, 14, 1));
    if (w === 'brak') b = await zapisz(osoba('Probna', 'Alicja', '2012-08-05', 'F', 149.2, 51.4, 13, 10));
    const obca = w === 'bez-karty' ? osoba('Probna', 'Ola', '2011-02-02', 'F', 151, 45, 15, 7) : osoba('Probna', 'Alicja', '2012-08-05', 'F', 150, 52, 14, 1);
    const zly = await zapisz(obca, { patientId: a.patientId });
    return { a: a.patientId, b: b && b.patientId, zly: zly.snapshotId };
  }, wariant);
}

async function sprawdz(page) {
  const sekcja = page.locator('#settings-section-backup');
  if ((await sekcja.getAttribute('open')) === null) await sekcja.locator('summary').click();
  await page.locator('#recordConsistencyRunBtn').click();
  await expect(page.locator('#recordConsistencyResult article').first()).toBeVisible();
}

const karta = (page, nazwa) => page.locator('#recordConsistencyResult article').filter({ has: page.locator('h4', { hasText: nazwa }) });
const okno = (page) => page.locator('.settings-kosz-okno[role="dialog"]');
const wersje = (page, pid) => page.evaluate(async (id) => (await window.VildaVault.getPatient(id)).snapshots.map((s) => s.snapshotId), pid);
const naglowek = (page, pid) => page.evaluate(async (id) => (await window.VildaVault.getPatient(id)).header.name, pid);

test.describe('P-KOSZ-ZAPISOW — usuwanie pomylonego zapisu do kosza', () => {
  test('pomiary są w karcie drugiej osoby: potwierdzenie, usunięcie, kosz w Ustawieniach, dziennik, „Cofnij”', async ({ page }) => {
    await otworzZKontem(page);
    const id = await zasiej(page, 'jest');
    await sprawdz(page);
    const adam = karta(page, 'Karta: Innyrecz Adam');
    await expect(adam.locator('.settings-spojnosc-stan--ok')).toHaveText('Pomiary z tego zapisu są też w karcie „Probna Alicja” — usunięcie niczego nie skasuje.');

    await adam.getByRole('button', { name: 'Usuń pomylony zapis…' }).click();
    const o = okno(page);
    await expect(o).toBeVisible();
    await expect(o.locator('h2')).toHaveText('Usunąć pomylony zapis?');
    await expect(o.locator('.settings-kosz-zapis-nazwa')).toHaveText('Probna Alicja');
    await expect(o.locator('.settings-kosz-punkt')).toHaveText([
      'Pomiary z tego zapisu są też w karcie „Probna Alicja”. Nic nie zginie.',
      /^Karta wróci do nazwy „Innyrecz Adam” z zapisu \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}\.$/,
      'Zapis trafi do kosza na 30 dni. Przywrócisz go na każdym urządzeniu; potem zniknie na stałe.',
      'Innych danych zapisu (np. terapii, badań) narzędzie nie porównuje — przez 30 dni zostają w koszu razem z zapisem.',
      'Usunięcie zostanie odnotowane w dzienniku dostępu.',
    ]);
    await expect(o.getByRole('button', { name: 'Anuluj' }), 'fokus na bezpiecznym przycisku').toBeFocused();
    expect(await wersje(page, id.a), 'okno niczego jeszcze nie zmieniło').toContain(id.zly);

    await o.getByRole('button', { name: 'Usuń do kosza' }).click();
    await expect(o).toHaveCount(0);
    const po = page.locator('#recordConsistencyResult .settings-spojnosc-karta--usunieta');
    await expect(po.locator('h4')).toHaveText('Karta: Innyrecz Adam — zapis w koszu');
    await expect(po).toContainText('Karta znów nazywa się „Innyrecz Adam”.');
    await expect(page.locator('#recordConsistencyUndoBtn')).toBeFocused();
    expect(await wersje(page, id.a)).not.toContain(id.zly);
    expect(await naglowek(page, id.a)).toBe('Innyrecz Adam');

    const wpis = page.locator('#recordTrashList .settings-kosz-wpis');
    await expect(wpis).toHaveCount(1);
    await expect(wpis.locator('.settings-kosz-wpis-karta')).toHaveText('Karta: Innyrecz Adam');
    await expect(wpis.locator('.settings-kosz-wpis-zapis')).toHaveText(/^Zapis z .+ — „Probna Alicja”, ur\. 05\.08\.2012$/);
    await expect(wpis.locator('.settings-kosz-wpis-meta')).toHaveText(/^Usunięty .+ · zostało 30 dni$/);
    const akcjeDziennika = () => page.evaluate(async () => (await window.VildaAuditLog.list()).map((e) => e.action));
    await expect.poll(akcjeDziennika, { message: 'dziennik dostępu: usunięcie' }).toContain('snapshot.trash');

    await page.locator('#recordConsistencyUndoBtn').click();
    await expect(page.locator('#recordConsistencyResult .settings-spojnosc-karta--cofnieta h4')).toHaveText('Karta: Innyrecz Adam — zapis przywrócony');
    expect(await wersje(page, id.a)).toContain(id.zly);
    await expect(page.locator('#recordTrashStatus')).toHaveText('Kosz jest pusty.');
    await expect.poll(akcjeDziennika, { message: 'dziennik dostępu: przywrócenie' }).toContain('snapshot.restore');
  });

  test('brak pomiaru w karcie drugiej osoby: blokada z tabelą, nic się nie zmienia', async ({ page }) => {
    await otworzZKontem(page);
    const id = await zasiej(page, 'brak');
    await sprawdz(page);
    const adam = karta(page, 'Karta: Innyrecz Adam');
    await expect(adam.locator('.settings-spojnosc-stan--uwaga')).toHaveText('Części pomiarów z tego zapisu nie ma w karcie „Probna Alicja” — najpierw trzeba je tam dopisać.');
    await adam.getByRole('button', { name: 'Usuń pomylony zapis…' }).click();
    const o = okno(page);
    await expect(o.locator('h2')).toHaveText('Tego zapisu nie można jeszcze usunąć');
    await expect(o).toContainText('Ten zapis ma pomiar, którego nie ma w karcie „Probna Alicja”. Usunięcie skasowałoby jego jedyną kopię.');
    await expect(o.locator('tbody tr')).toHaveCount(1);
    await expect(o.locator('tbody tr.settings-kosz-wiersz--brak td')).toHaveText(['14\u00a0l. 1\u00a0mies.', '150,0\u00a0cm · 52,0\u00a0kg', '● brak']);
    await expect(o.getByRole('button')).toHaveText(['Zamknij', 'Otwórz kartę: Probna Alicja']);
    await expect(o.getByRole('button', { name: /Usuń/ })).toHaveCount(0);
    await o.getByRole('button', { name: 'Zamknij' }).click();
    await expect(o).toHaveCount(0);
    await expect(adam.getByRole('button', { name: 'Usuń pomylony zapis…' }), 'fokus wraca do przycisku').toBeFocused();
    expect(await wersje(page, id.a)).toContain(id.zly);
  });

  test('osoba bez własnej karty: blokada, przycisk do historii wersji', async ({ page }) => {
    await otworzZKontem(page);
    const id = await zasiej(page, 'bez-karty');
    await sprawdz(page);
    const adam = karta(page, 'Karta: Innyrecz Adam');
    await expect(adam.locator('.settings-spojnosc-stan--uwaga')).toHaveText('Osoba z tego zapisu nie ma w sejfie własnej karty — tego zapisu nie można usunąć.');
    await adam.getByRole('button', { name: 'Usuń pomylony zapis…' }).click();
    const o = okno(page);
    await expect(o.locator('h2')).toHaveText('Tego zapisu nie można usunąć');
    await expect(o).toContainText('Osoba z tego zapisu („Probna Ola”) nie ma w sejfie własnej karty. Usunięcie skasowałoby jedyną kopię jej danych.');
    await expect(o.getByRole('button')).toHaveText(['Zamknij', 'Otwórz historię wersji']);
    await page.keyboard.press('Escape');
    await expect(o).toHaveCount(0);
    expect(await wersje(page, id.a)).toContain(id.zly);
  });

  test('zapis przypięty: „Odepnij i usuń do kosza”; z kosza wraca przypięty', async ({ page }) => {
    await otworzZKontem(page);
    const id = await zasiej(page, 'jest');
    await page.evaluate(async ({ a, zly }) => window.VildaVault.setSnapshotPinned(a, zly, true), id);
    await sprawdz(page);
    await karta(page, 'Karta: Innyrecz Adam').getByRole('button', { name: 'Usuń pomylony zapis…' }).click();
    const o = okno(page);
    await expect(o.locator('.settings-kosz-zapis-meta')).toContainText('przypięty');
    await expect(o.locator('.settings-kosz-uwaga')).toContainText('Ten zapis jest przypięty');
    await o.getByRole('button', { name: 'Odepnij i usuń do kosza' }).click();
    await expect(o).toHaveCount(0);
    expect(await wersje(page, id.a)).not.toContain(id.zly);

    await page.locator('#recordTrashList .settings-kosz-wpis').getByRole('button', { name: /Przywróć zapis/ }).click();
    await expect(page.locator('#recordTrashStatus')).toHaveText('Kosz jest pusty.');
    const przypiety = await page.evaluate(async ({ a, zly }) => (await window.VildaVault.getPatient(a)).snapshots.find((s) => s.snapshotId === zly).pinned, id);
    expect(przypiety).toBe(true);
  });

  test('kopia .wiw przed usunięciem: osobny plik z datą, potem usunięcie', async ({ page }) => {
    await otworzZKontem(page);
    const id = await zasiej(page, 'jest');
    await sprawdz(page);
    await karta(page, 'Karta: Innyrecz Adam').getByRole('button', { name: 'Usuń pomylony zapis…' }).click();
    const o = okno(page);
    await o.getByLabel(/Pobierz też kopię tej karty/).check();
    // Po zapisach z zasiej() z opóźnieniem rusza też automatyczna kopia konta (wagaiwzrost_konto_*.wiw); pod
    // obciążeniem jej pobranie potrafi wyprzedzić kopię karty, więc czekamy na plik kopii karty.
    const pobranie = page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().startsWith('wagaiwzrost_pacjent_') });
    await o.getByRole('button', { name: 'Usuń do kosza' }).click();
    const plik = await pobranie;
    expect(plik.suggestedFilename()).toMatch(/^wagaiwzrost_pacjent_[0-9a-f]{8}_przed_usunieciem_\d{4}-\d{2}-\d{2}_\d{4}\.wiw$/);
    await expect(o).toHaveCount(0);
    expect(await wersje(page, id.a)).not.toContain(id.zly);
  });

  // P-KOSZ-POPRAWKI (uwaga Codex P1 do #501): okno stoi otwarte, a karty zmieniają się pod nim (synchronizacja, inna
  // karta przeglądarki). Potwierdzenie ocenia obie karty jeszcze raz; zmieniony stan — okno od nowa, z notą.
  const NOTA = 'Zapis albo karta zmieniły się, gdy to okno było otwarte (np. przez synchronizację). Nic nie zostało usunięte — poniżej aktualny stan.';
  const poprawWersje = (page, pid, sid, zmiana) => page.evaluate(async ({ p, s, z }) => {
    const w = (await window.VildaVault.getPatient(p)).snapshots.find((x) => x.snapshotId === s);
    await window.VildaVault.updateSnapshotPayload(p, s, { ...w.payload, ...z, user: { ...w.payload.user, ...(z.user || {}) } }, { preserveSavedAt: true });
  }, { p: pid, s: sid, z: zmiana });

  test('pomiar znika z karty drugiej osoby, gdy okno jest otwarte: przy „Usuń do kosza” blokada z notą, nic nie znika', async ({ page }) => {
    await otworzZKontem(page);
    const id = await zasiej(page, 'jest');
    await sprawdz(page);
    await karta(page, 'Karta: Innyrecz Adam').getByRole('button', { name: 'Usuń pomylony zapis…' }).click();
    const o = okno(page);
    await expect(o.locator('h2')).toHaveText('Usunąć pomylony zapis?');
    const zapisAlicji = await page.evaluate(async (b) => (await window.VildaVault.getPatient(b)).snapshots[0].snapshotId, id.b);
    await poprawWersje(page, id.b, zapisAlicji, { user: { weight: 52.4 } }); // jak poprawka z innego urządzenia

    await o.getByRole('button', { name: 'Usuń do kosza' }).click();
    const nowe = okno(page);
    await expect(nowe.locator('h2')).toHaveText('Tego zapisu nie można jeszcze usunąć');
    await expect(nowe.locator('.settings-kosz-uwaga[role="status"]')).toHaveText(NOTA);
    await expect(nowe.locator('.settings-kosz-tabela')).toBeVisible();
    expect(await wersje(page, id.a), 'zapis zostaje w karcie').toContain(id.zly);
    expect(await page.evaluate(async () => (await window.VildaVault.listTrashedSnapshots()).length)).toBe(0);
    await expect(page.locator('.settings-kosz-okno[role="dialog"]'), 'jedno okno naraz').toHaveCount(1);
  });

  test('pomylony zapis poprawiony, gdy okno jest otwarte: okno od nowa z notą, usuwa dopiero drugie potwierdzenie', async ({ page }) => {
    await otworzZKontem(page);
    const id = await zasiej(page, 'jest');
    await sprawdz(page);
    await karta(page, 'Karta: Innyrecz Adam').getByRole('button', { name: 'Usuń pomylony zapis…' }).click();
    const o = okno(page);
    await expect(o.locator('h2')).toHaveText('Usunąć pomylony zapis?');
    await poprawWersje(page, id.a, id.zly, { testowaPoprawka: 1 }); // nowa wersja zapisu, te same pomiary

    await o.getByRole('button', { name: 'Usuń do kosza' }).click();
    const nowe = okno(page);
    await expect(nowe.locator('.settings-kosz-uwaga[role="status"]')).toHaveText(NOTA);
    await expect(nowe.locator('h2')).toHaveText('Usunąć pomylony zapis?');
    expect(await wersje(page, id.a), 'pierwsze potwierdzenie niczego nie usunęło').toContain(id.zly);

    await nowe.getByRole('button', { name: 'Usuń do kosza' }).click();
    await expect(page.locator('.settings-kosz-okno[role="dialog"]')).toHaveCount(0);
    expect(await wersje(page, id.a)).not.toContain(id.zly);
  });

  test('kosz w historii wersji karty: „Przywróć ten zapis”', async ({ page }) => {
    await otworzZKontem(page);
    const id = await zasiej(page, 'jest');
    await page.evaluate(async ({ a, zly }) => window.VildaVault.moveSnapshotToTrash(a, zly), id);
    await page.evaluate(({ a }) => window.VildaVersionHistory.open(a, { patientName: 'Innyrecz Adam' }), id);
    const kosz = page.locator('.vvh-kosz');
    await expect(kosz.locator('.vvh-day')).toHaveText('Kosz tej karty · 1 zapis');
    await expect(kosz.locator('.vvh-ret')).toHaveText(/^Zapis z .+ — „Probna Alicja”, ur\. 05\.08\.2012\. Usunięty .+ · zostało 30 dni\.$/);
    await kosz.getByRole('button', { name: '↺ Przywróć ten zapis' }).click();
    await expect(page.locator('.vvh-flash')).toHaveText('Przywrócono zapis z kosza.');
    await expect(page.locator('.vvh-kosz .vvh-day')).toHaveCount(0);
    expect(await wersje(page, id.a)).toContain(id.zly);
  });

  test('telefon: okno jako panel od dołu, przyciski na całą szerokość, bez poziomego przewijania', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzZKontem(page);
    await zasiej(page, 'jest');
    await sprawdz(page);
    await karta(page, 'Karta: Innyrecz Adam').getByRole('button', { name: 'Usuń pomylony zapis…' }).click();
    const o = okno(page);
    await expect(o).toBeVisible();
    const uklad = await page.evaluate(() => {
      const okno = document.querySelector('.settings-kosz-okno').getBoundingClientRect();
      const [anuluj, usun] = [...document.querySelectorAll('.settings-kosz-przyciski button')].map((b) => b.getBoundingClientRect());
      return {
        przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dolOkna: Math.round(okno.bottom), wysokosc: window.innerHeight, lewa: Math.round(okno.left), prawa: Math.round(okno.right),
        nakladka: (() => { const r = document.querySelector('.settings-kosz-nakladka').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; })(),
        usunNad: usun.bottom <= anuluj.top + 1, szerokoscUsun: Math.round(usun.width), szerokoscOkna: Math.round(okno.width),
      };
    });
    expect(uklad.przewijanie).toBeLessThanOrEqual(0);
    expect(uklad.dolOkna, 'panel przy dolnej krawędzi').toBe(uklad.wysokosc);
    // Panel na całą szerokość nakładki (w desktopowym Chromium nakładka kończy się przed paskiem przewijania).
    expect([uklad.lewa, uklad.prawa]).toEqual(uklad.nakladka);
    expect(uklad.nakladka[0]).toBe(0);
    expect(uklad.usunNad, '„Usuń do kosza” nad „Anuluj”').toBe(true);
    expect(uklad.szerokoscUsun).toBeGreaterThan(uklad.szerokoscOkna - 40);
    await o.getByRole('button', { name: 'Usuń do kosza' }).click();
    await expect(page.locator('#recordTrashList .settings-kosz-wpis')).toHaveCount(1);
    const kosz = await page.evaluate(() => {
      const li = document.querySelector('#recordTrashList .settings-kosz-wpis');
      const b = li.querySelector('button').getBoundingClientRect();
      return { przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth, b: Math.round(b.width), li: Math.round(li.getBoundingClientRect().width) };
    });
    expect(kosz.przewijanie).toBeLessThanOrEqual(0);
    expect(kosz.b, '„Przywróć” na całą szerokość wpisu').toBeGreaterThan(kosz.li - 40);
  });
});

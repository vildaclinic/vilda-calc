import { expect, test } from '@playwright/test';

// PR 11 (zgłoszenie właściciela 2026-09-03) — nieobecność lekarza („Urlop”) nie jest przypomnieniem.
//
// Terminarz zapisuje urlop jako jedną notatkę category:"absence" NA KAŻDY DZIEŃ, pod
// pseudopacjentem __vilda_activity__ z pustą nazwą. Sejf grupuje wpisy aktywności per notatka,
// więc tydzień urlopu to siedem osobnych „pacjentów” w kanale przypomnień. Modal spod dzwoneczka
// odfiltrowywał je u siebie, ale karta „Przypomnienia” na stronie głównej, odznaka dzwoneczka
// i panel „⚠ Zaległe” w Terminarzu — nie. Filtr stoi teraz w sejfie
// (listPatientNotesDueByDate), więc wszystkie cztery powierzchnie widzą to samo.
//
// Zmierzone przed poprawką: karta „Przypomnienia 3 · Zaległe 1 (Urlop wczoraj) · Dziś 2
// (pacjent + Urlop dziś)”, odznaka data-count="3", Terminarz „⚠ Zaległe: 1 wydarzenie — Urlop”,
// a modal pokazywał tylko jeden wiersz — czyli licznik i lista mówiły co innego.

const HASLO = 'E2e#Urlop!2026guard';

const p = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

async function otworz(page, strona) {
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
  await page.goto(strona, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.evaluate(() => {
    const a = document.getElementById('vilda-auth-ui-root');
    if (a) a.style.display = 'none';
  });
}

/** Urlop na wczoraj i dziś + jedna zwykła wizyta jako kontrola pozytywna. */
async function zasiej(page) {
  return page.evaluate(async ({ wczoraj, dzis }) => {
    const V = window.VildaVault;
    const AID = V.ACTIVITY_PATIENT_ID || '__vilda_activity__';
    for (const dzien of [wczoraj, dzis]) {
      await V.savePatientNote({
        patientId: AID, externalName: '', title: 'Urlop',
        category: 'absence', dueDateISO: dzien, dueTime: null, seriesId: 'urlop-1',
      });
    }
    const pac = await V.savePatient({ name: 'Jan Kontrolny' });
    await V.savePatientNote({
      patientId: pac.id || pac.patientId, title: 'Kontrola', body: '',
      category: 'followup', dueDateISO: dzis,
    });
  }, { wczoraj: iso(new Date(Date.now() - 24 * 60 * 60 * 1000)), dzis: iso(new Date()) });
}

test('karta „Przypomnienia” i odznaka dzwoneczka pomijają dni urlopu', async ({ page }) => {
  await otworz(page, '/index.html');
  await zasiej(page);

  // Wejście na stronę główną z urlopem już zapisanym — tak, jak widzi to lekarz; odznaka
  // dzwoneczka liczy się przy starcie, więc musi zobaczyć komplet danych.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked());
  await page.evaluate(() => {
    const a = document.getElementById('vilda-auth-ui-root');
    if (a) a.style.display = 'none';
  });

  // Karta jest za bramką PRO (podpis tokenem, którego w teście nie podrobimy) — podmieniamy
  // wyłącznie tę bramkę, cała reszta ścieżki renderowania jest prawdziwa.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    // Zdarzenie, którym moduł normalnie reaguje na zmianę uprawnień — dalej idzie własną ścieżką.
    window.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await page.waitForFunction(() => {
    const el = document.getElementById('remindersInline');
    return !!el && el.style.display !== 'none' && el.textContent.includes('Przypomnienia');
  }, null, { timeout: 20000 });

  const karta = await page.evaluate(() => {
    const el = document.getElementById('remindersInline');
    const chip = el && el.querySelector('.vild-rem-chip');
    return {
      widoczna: !!el && el.style.display !== 'none',
      tekst: el ? el.textContent.replace(/\s+/g, ' ').trim() : '',
      chip: chip ? chip.textContent.trim() : null,
    };
  });

  expect(karta.widoczna).toBe(true);
  expect(karta.tekst, 'urlop nie jest przypomnieniem').not.toContain('Urlop');
  expect(karta.tekst, 'sekcja zaległych znika — urlopu nie da się odhaczyć').not.toContain('Zaległe');
  expect(karta.tekst, 'kontrola pozytywna: wizyta pacjenta zostaje').toContain('Jan Kontrolny');
  expect(karta.chip, 'licznik liczy jednego pacjenta, nie dwóch dni urlopu').toBe('1');
  expect(karta.tekst).toContain('Pokaż wszystkie (1)');

  // Odznaka liczy się asynchronicznie po odblokowaniu sejfu — czekamy na jej ustalony stan.
  // Przed poprawką ustalała się na „3” (dwa dni urlopu + pacjent) i nigdy nie schodziła do 1.
  const przycisk = page.locator('#vildaRemindersBtn');
  await expect(przycisk, 'odznaka zgodna z kartą i z modalem').toHaveAttribute('data-count', '1');
  await expect(przycisk).toHaveAttribute('title', /1 pacjent wymaga uwagi/);

  // Modal spod dzwoneczka — powierzchnia, która filtrowała poprawnie już wcześniej.
  await page.evaluate(() => window.VildaAuthUI.maybeShowReminders({ force: true }));
  await page.waitForTimeout(3200);
  const wiersze = await page.evaluate(() => Array.from(
    document.querySelectorAll('.vilda-reminders-row'),
  ).map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  expect(wiersze.length, 'modal bez zmian: jeden wiersz').toBe(1);
  expect(wiersze[0]).toContain('Jan Kontrolny');
});

test('panel „⚠ Zaległe" w Terminarzu nie traktuje minionego urlopu jak zaległości', async ({ page }) => {
  await otworz(page, '/terminarz.html');
  await zasiej(page);
  await page.evaluate(() => window.VildaTerminarz.refresh());
  await page.waitForTimeout(1500);

  const stan = await page.evaluate(() => {
    const o = document.getElementById('tzOverdue');
    return {
      panel: o ? o.textContent.replace(/\s+/g, ' ').trim() : null,
      // Urlop ma nadal być widoczny w samym kalendarzu — filtr dotyczy tylko przypomnień.
      wSiatce: document.body.textContent.includes('Urlop'),
    };
  });

  expect(stan.panel, 'miniony dzień urlopu nie jest zaległością').toBe(null);
  expect(stan.wSiatce, 'kontrola pozytywna: urlop nadal jest w kalendarzu').toBe(true);
});

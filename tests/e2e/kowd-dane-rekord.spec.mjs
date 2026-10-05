import { expect, test } from '../support/test-czas.mjs';

// Dane wejściowe oceny KOWD (konstytucjonalne opóźnienie wzrastania i dojrzewania) giną
// z rekordu pacjenta. Zgłoszone przez właściciela 2026-09-08 przy przeglądzie miejsc,
// w których aplikacja trzyma etap dojrzewania.
//
// Dwie różne usterki, obie kasujące te same cztery pola:
//   1. index.html — applyLoadedData najpierw odtwarza je z rekordu, a kilka kroków dalej
//      BEZWARUNKOWO czyści. Nic ich potem nie przywraca: userData.js synchronizuje tylko
//      name/age/ageMonths/weight/height/sex/tannerStage/advMotherHeight/advFatherHeight.
//   2. docpro.html — tych pól nie ma w ogóle w DOM, a kolektor czyta je przez
//      `E(id) || null`, więc każdy zapis pacjenta z DocPro wpisuje null.
//      (Od P-TOZSAMOSC docpro ma panel pokwitaniowy, więc objętość jąder jest już polem;
//      wywiad rodzinny i wykluczenia nadal wchodzą z rekordu.)
//
// W obu wypadkach jeden cykl „wczytaj → zapisz" niszczy komplet wejścia KOWD:
// wiek kostny, objętość jąder, wywiad rodzinny i wykluczenia.
// P-WIEK-KOSTNY-WIZYTA: wczytanie do nowego pomiaru zachowuje BA jako wcześniejsze
// badanie w kontekście; puste pole nowego badania i current:null są zamierzone.
test.use({ serviceWorkers: 'block' });

const REKORD = {
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 12, ageMonths: 0, height: 141, weight: 34 },
  advanced: {
    name: 'Testowy Jan',
    boneAgeYears: 10.5,
    motherHeight: 163,
    fatherHeight: 180,
    testicularVolume: '4to6',
    familyDelayedPuberty: 'yes',
    growthExclusion: 'no',
    data: {
      measurements: [
        { ageMonths: 120, ageYears: 10, height: 132, weight: 29 },
        { ageMonths: 144, ageYears: 12, height: 141, weight: 34 },
      ],
    },
  },
};

// Ten sam pacjent bez danych KOWD — do kontroli zanieczyszczenia między rekordami.
const REKORD_BEZ_KOWD = {
  name: 'Testowa Zofia',
  user: { lastName: 'Testowa', firstName: 'Zofia', sex: 'F', age: 9, ageMonths: 0, height: 130, weight: 27 },
  advanced: {
    name: 'Testowa Zofia',
    motherHeight: 158,
    fatherHeight: 170,
    data: {
      measurements: [
        { ageMonths: 96, ageYears: 8, height: 124, weight: 24 },
        { ageMonths: 108, ageYears: 9, height: 130, weight: 27 },
      ],
    },
  },
};

async function otworz(page, url) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.collectUserData === 'function'
    && typeof window.applyLoadedData === 'function');
}

const kowd = (zebrane) => ({
  boneAgeYears: zebrane.advanced ? zebrane.advanced.boneAgeYears : undefined,
  testicularVolume: zebrane.advanced ? zebrane.advanced.testicularVolume : undefined,
  familyDelayedPuberty: zebrane.advanced ? zebrane.advanced.familyDelayedPuberty : undefined,
  growthExclusion: zebrane.advanced ? zebrane.advanced.growthExclusion : undefined,
});
const POPRZEDNIE_BA = { years: 10.5, atAgeMonths: 144, dateISO: null, source: 'legacy' };
const zachowaneBadanie = (wynik) => {
  expect(wynik.zebrane.advanced.boneAgeContext).toEqual({ version: 1, current: null, last: POPRZEDNIE_BA });
  expect(wynik.zebrane.advanced.data.boneAgeContext).toEqual(wynik.zebrane.advanced.boneAgeContext);
  expect(wynik.efektywne).toEqual(POPRZEDNIE_BA);
};

test('index.html: nowy pomiar zachowuje wcześniejsze badanie BA i pozostałe wejście KOWD', async ({ page }) => {
  await otworz(page, '/index.html');
  const wynik = await page.evaluate((r) => {
    window.applyLoadedData(JSON.parse(JSON.stringify(r)));
    const wDom = {};
    for (const id of ['advBoneAge', 'advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion']) {
      const el = document.getElementById(id);
      wDom[id] = el ? el.value : '(brak elementu)';
    }
    return { wDom, zebrane: window.collectUserData(), efektywne: window.VildaBoneAge.effective() };
  }, REKORD);

  // Pole BA jest puste dla nowego badania; wcześniejsza wartość pozostaje w kontekście.
  expect(wynik.wDom.advBoneAge).toBe('');
  expect(wynik.wDom.advTesticularVolume).toBe('4to6');
  expect(wynik.wDom.advFamilyDelayedPuberty).toBe('yes');
  expect(wynik.wDom.advGrowthExclusion).toBe('no');

  expect(kowd(wynik.zebrane)).toEqual({
    boneAgeYears: null,
    testicularVolume: '4to6',
    familyDelayedPuberty: 'yes',
    growthExclusion: 'no',
  });
  zachowaneBadanie(wynik);
});

test('docpro.html: nowy pomiar zachowuje wcześniejsze BA oraz KOWD z pól i rekordu', async ({ page }) => {
  await otworz(page, '/docpro.html');
  const wynik = await page.evaluate((r) => {
    window.applyLoadedData(JSON.parse(JSON.stringify(r)));
    return {
      polaIstnieja: ['advBoneAge', 'advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion']
        .map((id) => Boolean(document.getElementById(id))),
      baWDom: document.getElementById('advBoneAge').value,
      zebrane: window.collectUserData(),
      efektywne: window.VildaBoneAge.effective(),
    };
  }, REKORD);

  // Kontrola pozytywna: na DocPro wywiadu rodzinnego i wykluczeń naprawdę nie ma — dlatego
  // potrzebne przeniesienie. Objętość jąder od P-TOZSAMOSC (2026-09-15) mieszka w panelu
  // pokwitaniowym, który docpro ma tak samo jak strona główna — wchodzi więc z pola.
  expect(wynik.polaIstnieja).toEqual([true, true, false, false]);
  expect(wynik.baWDom).toBe('');
  expect(kowd(wynik.zebrane)).toEqual({
    boneAgeYears: null,
    testicularVolume: '4to6',
    familyDelayedPuberty: 'yes',
    growthExclusion: 'no',
  });
  zachowaneBadanie(wynik);
});

test('docpro.html: wczytanie pacjenta BEZ danych KOWD nie przenosi ich po poprzednim', async ({ page }) => {
  await otworz(page, '/docpro.html');
  const zebrane = await page.evaluate((dane) => {
    window.applyLoadedData(JSON.parse(JSON.stringify(dane.zKowd)));
    window.applyLoadedData(JSON.parse(JSON.stringify(dane.bezKowd)));
    return window.collectUserData();
  }, { zKowd: REKORD, bezKowd: REKORD_BEZ_KOWD });

  expect(kowd(zebrane)).toEqual({
    boneAgeYears: null,
    testicularVolume: null,
    familyDelayedPuberty: null,
    growthExclusion: null,
  });
});

test('index.html: wyczyszczenie pola przez lekarza nadal kasuje wartość', async ({ page }) => {
  await otworz(page, '/index.html');
  const wynik = await page.evaluate((r) => {
    window.applyLoadedData(JSON.parse(JSON.stringify(r)), { isSessionRestore: true });
    const baPrzed = document.getElementById('advBoneAge').value;
    const kontekstPrzed = window.VildaBoneAge.capture();
    for (const id of ['advBoneAge', 'advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion']) {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    return { baPrzed, kontekstPrzed, zebrane: window.collectUserData(), efektywne: window.VildaBoneAge.effective() };
  }, REKORD);

  // Przeniesienie NIE może wskrzeszać wartości tam, gdzie pole istnieje i zostało opróżnione.
  expect(wynik.baPrzed).toBe('10.5');
  expect(wynik.kontekstPrzed).toEqual({ version: 1, current: POPRZEDNIE_BA, last: null });
  expect(kowd(wynik.zebrane)).toEqual({
    boneAgeYears: null,
    testicularVolume: null,
    familyDelayedPuberty: null,
    growthExclusion: null,
  });
  expect(wynik.zebrane.advanced.boneAgeContext).toEqual({ version: 1, current: null, last: null });
  expect(wynik.efektywne).toBeNull();
});

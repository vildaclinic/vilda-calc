import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { bezKomentarzy, funkcjaZ, zrodlo } from '../support/silnik-bmi.mjs';
import { odciskSiatki } from '../support/siatka-werdyktow.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-WERDYKT rata 1 (audyt werdyktów, decyzja właściciela „1. robimy silnik").
//
// Werdykt odcinka A→B istniał w aplikacji w DWÓCH pełnych kopiach: w panelu „Porównanie
// z poprzednim pomiarem" (vilda_auth_ui.js) i w module trajektorii. Parytet trzymał się na
// teście i na komentarzach „nie zmieniaj bez zmiany tej drugiej". Ta rata sprowadza obie do
// jednego silnika vilda_werdykt.js — i NIC poza tym. Testy poniżej pilnują dwóch rzeczy:
//  1. że kopii naprawdę nie ma (kto dopisze warunek w karcie, ten zapali czerwone),
//  2. że przeniesienie nie ruszyło ani jednego werdyktu — odciskiem pełnej siatki wejść.

const silnik = () => loadBrowserScript('vilda_werdykt.js', {}).VildaWerdykt;

const WERD = zrodlo('vilda_werdykt.js');
const TRAJ = zrodlo('vilda_trajectory_analysis.js');
const AUTH = zrodlo('vilda_auth_ui.js');

describe('silnik werdyktu — kształt modułu', () => {
  it('window.VildaWerdykt wystawia trzy warstwy i zamrożone progi', () => {
    const W = silnik();
    expect(typeof W.para).toBe('function');
    expect(typeof W.zKontekstem).toBe('function');
    expect(typeof W.nakladkaMasaBmi).toBe('function');
    expect(typeof W.nakladkaPozycjaWzrostu).toBe('function');
    expect(Object.isFrozen(W)).toBe(true);
    expect(Object.isFrozen(W.PROGI)).toBe(true);
    expect(W.PROGI).toEqual({
      ISTOTNA_DECELERACJA_DSDS: -1.0, ISTOTNE_PRZESUNIECIE_DSDS: 0.5,
      MASA_WYSOKA_C: 97, MASA_NISKA_C: 3, BMI_OTYLOSC_C: 97, BMI_NIEDOWAGA_C: 5,
    });
  });

  it('bez danych nie zgaduje: null to „brak werdyktu", nie „stabilnie"', () => {
    const W = silnik();
    expect(W.para('height', null, 0, 50, 50)).toBeNull();
    expect(W.para('height', 0, NaN, 50, 50)).toBeNull();
    expect(W.para('weight', 0, 0.3, null, 50)).toBeNull();
    expect(W.para('weight', 0, 0.3, 50, null)).toBeNull();
    expect(W.zKontekstem('bmi', 0, 0.3, null, 50, 0, null, false)).toBeNull();
  });
});

describe('jedno źródło — kopii reguły już nie ma', () => {
  // Strażnik patrzy na KOD, nie na prozę: komentarz wyjaśniający przeniesioną regułę
  // cytuje etykiety dosłownie, więc bez bezKomentarzy test czerwieniłby się sam na sobie.
  const LABEL = /l:\s*'/;

  it('moduł trajektorii tylko woła silnik — nie ma tam żadnej etykiety werdyktu', () => {
    const czysty = bezKomentarzy(TRAJ);
    for (const fn of ['verdictForPair', 'verdictForPairCtx', 'weightBmiOverlayVerdict', 'heightPositionOverlayVerdict']) {
      const cialo = funkcjaZ(czysty, fn);
      expect(cialo, `${fn} nadal liczy werdykt sam`).not.toMatch(LABEL);
      expect(cialo, `${fn} nie pyta silnika`).toMatch(/silnikWerdyktu\(\)/);
    }
    const odwolania = czysty.split('\n').filter((w) => /VildaWerdykt/.test(w) && !/^\s*(\/\/|\*)/.test(w));
    expect(odwolania.length, 'jedno miejsce w kodzie, w którym karta sięga po silnik').toBe(1);
  });

  it('panel porównania też tylko woła silnik', () => {
    // Bez bezKomentarzy: vilda_auth_ui.js jest zminifikowany, a „/*" trafia się tam
    // w literałach i wyrażeniach regularnych — cięcie komentarzy zjadłoby kawał kodu.
    // Delegacje są jednowierszowe i komentarza w środku nie mają.
    const czysty = AUTH;
    const pary = [
      ['verdictCh', 'para'],
      ['verdictCh2', 'zKontekstem'],
      ['verdictWtBmi', 'nakladkaMasaBmi'],
      ['verdictHtPos', 'nakladkaPozycjaWzrostu'],
    ];
    for (const [fn, metoda] of pary) {
      const cialo = funkcjaZ(czysty, fn);
      expect(cialo, `${fn} nadal liczy werdykt sam`).not.toMatch(/l:"/);
      expect(cialo, `${fn} nie woła ${metoda}`).toContain(`W.${metoda}(`);
    }
  });

  it('etykiety werdyktu odcinka mieszkają wyłącznie w silniku', () => {
    // Trzy etykiety „stabilnego toru" to serce słownika; gdyby wróciły do konsumentów,
    // znaczyłoby to, że ktoś odtworzył regułę obok silnika.
    for (const et of ['stabilny tor wzrastania', 'stabilny tor BMI', 'stabilny tor masy ciała']) {
      expect(WERD, `silnik zna „${et}"`).toContain(et);
      expect(TRAJ, `karta znowu zna „${et}"`).not.toContain(et);
      expect(AUTH, `panel znowu zna „${et}"`).not.toContain(et);
    }
  });
});

describe('silnik jest podany wszędzie, gdzie werdykt jest potrzebny', () => {
  const strony = fs.readdirSync(korzen).filter((f) => f.endsWith('.html'));

  it('każda strona z konsumentem werdyktu ładuje też silnik', () => {
    const zKonsumentem = strony.filter((f) => {
      const h = fs.readFileSync(path.join(korzen, f), 'utf8');
      return /src="vilda_trajectory_analysis\.js/.test(h) || /src="vilda_auth_ui\.js/.test(h);
    });
    expect(zKonsumentem.length, 'strony z konsumentem werdyktu').toBeGreaterThanOrEqual(8);
    for (const f of zKonsumentem) {
      expect(fs.readFileSync(path.join(korzen, f), 'utf8'),
        `${f} ładuje konsumenta bez silnika werdyktu`).toMatch(/src="vilda_werdykt\.js\?v=\d+"/);
    }
  });

  it('service worker precachuje silnik', () => {
    expect(zrodlo('service-worker-kalorii.js')).toMatch(/'\/vilda_werdykt\.js\?v=\d+',/);
  });

  it('bez silnika karta pokazuje liczby, a nie wymyślony werdykt', () => {
    // Celowo BEZ zależności z loadBrowserScript — symulujemy brak pliku na stronie.
    const puste = {};
    new Function('window', 'globalThis', zrodlo('vilda_tempo_wzrastania.js'))(puste, puste);
    new Function('window', 'globalThis', TRAJ)(puste, puste);
    const J = puste.VildaTrajectoryAnalysis;
    expect(J.verdictForPair('bmi', 0, 0.8, 50, 90)).toBeNull();
    expect(J.verdictForPairCtx('height', 0, 0.8, 50, 90, 0, null, false)).toBeNull();
    // Nakładki tylko zaostrzają cudzy werdykt — bez silnika oddają go nietkniętego.
    const v = { t: 'stable', l: 'x' };
    expect(J.weightBmiOverlayVerdict(v, 0.3, { t: 'warn', l: 'y' }, 0.3)).toBe(v);
    expect(J.heightPositionOverlayVerdict(v, 1, null, 0, false)).toBe(v);
  });
});

describe('odcisk siatki — co która rata zmieniła i czego nie tknęła', () => {
  // Odcisk policzony na kodzie SPRZED wydzielenia silnika (commit 7355953e, SW 1.1.2)
  // tą samą funkcją tests/support/siatka-werdyktow.mjs. Siatka celuje w granice reguł:
  // przy każdym progu ΔSDS i każdym progu centylowym stoi sąsiad po obu stronach, więc
  // przesunięcie dowolnej nierówności o jeden krok zmienia odcisk.
  const ODCISK_RATA_1 = 'a9a60858e6926c878cf06b8869a0df725be82a592581320f52fdf71e16d7a93d';
  const ODCISK_RATA_2 = '62fa83552244e0565ce60b42beabbf9b033d794131553abcbe6e71eee2f8e15d';
  const PRZYPADKOW = 6280776;

  // Trzy etykiety, które wprowadziła rata 2 — i nic poza nimi.
  const ETYKIETY_POZIOMU = [
    'tor stabilny, ale masa ciała znacznie powyżej typowego zakresu (>97c)',
    'tor stabilny, masa ciała poniżej 3. centyla',
    'tor stabilny, ale BMI znacznie poniżej typowego zakresu (<5c)',
  ];
  const ST = {
    height: 'stabilny tor wzrastania',
    weight: 'stabilny tor masy ciała',
    bmi: 'stabilny tor BMI',
  };

  it(`odcisk bieżącego silnika jest zamrożony (${PRZYPADKOW} przypadków)`, () => {
    const wynik = odciskSiatki(silnik());
    expect(wynik.przypadkow, 'rozmiar siatki').toBe(PRZYPADKOW);
    expect(wynik.odcisk).toBe(ODCISK_RATA_2);
  });

  it('rata 2 odezwała się WYŁĄCZNIE tam, gdzie silnik dotąd milczał — dowód, nie deklaracja', () => {
    // Zamieniamy każdą etykietę poziomu z powrotem na „stabilny tor" tej miary. Jeżeli rata 2
    // niczego poza stabilnymi werdyktami nie ruszyła, po takim odwzorowaniu MUSI wyjść
    // dokładnie odcisk raty 1 — bez sięgania po nieistniejący już stary kod.
    const W = silnik();
    const cofnij = (met, v) => (v && ETYKIETY_POZIOMU.indexOf(v.l) >= 0 ? { t: 'stable', l: ST[met] } : v);
    const jakPrzed = {
      para: (m, a, b, c, d) => cofnij(m, W.para(m, a, b, c, d)),
      zKontekstem: (m, a, b, c, d, g, p, r) => cofnij(m, W.zKontekstem(m, a, b, c, d, g, p, r)),
      nakladkaMasaBmi: W.nakladkaMasaBmi,
      nakladkaPozycjaWzrostu: W.nakladkaPozycjaWzrostu,
    };
    const wynik = odciskSiatki(jakPrzed);
    expect(wynik.przypadkow).toBe(PRZYPADKOW);
    expect(wynik.odcisk, 'rata 2 ruszyła coś poza werdyktami „stabilny"').toBe(ODCISK_RATA_1);
  });
});

describe('P-WERDYKT rata 2 — „stabilny tor" przestaje milczeć o poziomie', () => {
  // Usterki A i C audytu 2026-09-18: werdykt mówił o KIERUNKU i nic o POZIOMIE, więc
  // odcinek dziecka stojącego na 99. centylu masy brzmiał jak odcinek dziecka ze środka
  // siatki. Ton jest celowo NIEsymetryczny — patrz komentarz przy poziomMasyBmi().

  it('masa ≥97c przy stabilnym torze ostrzega i nazywa poziom', () => {
    const W = silnik();
    expect(W.para('weight', 2.33, 2.29, 99, 99))
      .toEqual({ t: 'warn', l: 'tor stabilny, ale masa ciała znacznie powyżej typowego zakresu (>97c)' });
    expect(W.para('weight', 1.9, 1.92, 97, 97.3).t).toBe('warn');
    expect(W.para('weight', 1.8, 1.82, 96.4, 96.5), 'poniżej progu — bez zmian')
      .toEqual({ t: 'stable', l: 'stabilny tor masy ciała' });
  });

  it('masa ≤3c nazywa poziom, ale NIE stawia alarmu — bo sama miara go nie uzasadnia', () => {
    // Zmierzone na tablicach OLAF: przy BMI ≥5c masa-do-wieku sięga 0. centyla w każdym
    // badanym wieku, czyli niskie proporcjonalne dziecko mieszka w tym paśmie z prawidłowym
    // BMI. Żółty byłby tam fałszywym alarmem; zdanie — nie jest.
    const W = silnik();
    expect(W.para('weight', -2.1, -2.12, 2, 1.9))
      .toEqual({ t: 'stable', l: 'tor stabilny, masa ciała poniżej 3. centyla' });
    expect(W.para('weight', -1.9, -1.92, 3, 3), 'próg domknięty od góry').toEqual({
      t: 'stable', l: 'tor stabilny, masa ciała poniżej 3. centyla',
    });
    expect(W.para('weight', -1.8, -1.82, 3.5, 3.4), 'powyżej progu — bez zmian')
      .toEqual({ t: 'stable', l: 'stabilny tor masy ciała' });
  });

  it('BMI ostrzega po OBU stronach — jest skorygowane o wzrost, więc rozstrzyga samo', () => {
    const W = silnik();
    expect(W.para('bmi', -2.1, -2.12, 4, 3.9))
      .toEqual({ t: 'warn', l: 'tor stabilny, ale BMI znacznie poniżej typowego zakresu (<5c)' });
    expect(W.para('bmi', -1.7, -1.72, 5, 5), 'próg otwarty od góry: 5c to już nie niedowaga')
      .toEqual({ t: 'stable', l: 'stabilny tor BMI' });
    // Górny koniec BMI mówił już wcześniej — rata 2 go nie dubluje ani nie zmienia.
    expect(W.para('bmi', 2.05, 1.89, 98, 97)).toEqual({ t: 'warn', l: 'utrzymująca się otyłość (>97c)' });
  });

  it('wzrost zostaje nietknięty — ma własną nakładkę pozycyjną', () => {
    const W = silnik();
    expect(W.para('height', 2.33, 2.29, 99, 99)).toEqual({ t: 'stable', l: 'stabilny tor wzrastania' });
    expect(W.para('height', -2.1, -2.12, 2, 1.9)).toEqual({ t: 'stable', l: 'stabilny tor wzrastania' });
  });

  it('gałąź poziomu nie odbiera komórek nakładce waga↔BMI', () => {
    // Nakładka wpuszcza tylko werdykty „stable" przy ΔSDS ≥ 0,2. Masa ≥97c z takim
    // przyrostem trafia w gałąź wysokich centyli i nigdy nie była „stabilna", więc
    // ostrzeżenie poziomu nie ma czego przesłonić. Kontrola wprost:
    const W = silnik();
    const v = W.para('weight', 1.5, 1.8, 93, 96);
    expect(v.t, 'przyrost przy wysokim centylu to nie „stabilny"').toBe('warn');
    const stabilna = W.para('weight', -0.25, 0.13, 40, 55);
    expect(stabilna.t).toBe('stable');
    expect(W.nakladkaMasaBmi(stabilna, 0.38, { t: 'warn', l: 'x' }, 0.3))
      .toEqual({ t: 'warn', l: 'przyrost masy szybszy niż wzrastanie — nadmiar ujawnia się w BMI' });
  });
});

describe('dwa przypadki z audytu 2026-09-18', () => {
  // Właściciel pokazał dwa prawdziwe ekrany, na których werdykty brzmiały spójnie
  // z regułą, a nie z sytuacją kliniczną. Te testy UTRWALAJĄ stan dzisiejszy, żeby
  // kolejne raty widać było jako zmianę, a nie jako przypadek. Dane są syntetyczne —
  // odtworzone z opisanych liczb, bez żadnych danych pacjenta.

  it('ekran 1 (trajektoria): waga 99c→99c nazywa już poziom (naprawione w racie 2)', () => {
    const W = silnik();
    // Tu był rdzeń usterki A: wiersz wagi brzmiał uspokajająco obok wiersza BMI mówiącego
    // o utrzymującej się otyłości. Po racie 2 oba wiersze mówią o tym samym dziecku zgodnie.
    expect(W.para('weight', 2.33, 2.29, 99, 99))
      .toEqual({ t: 'warn', l: 'tor stabilny, ale masa ciała znacznie powyżej typowego zakresu (>97c)' });
    expect(W.para('bmi', 2.05, 1.89, 98, 97)).toEqual({ t: 'warn', l: 'utrzymująca się otyłość (>97c)' });
    // Wzrost w kanale rodzicielskim: kontekst wycisza gałąź populacyjną.
    expect(W.zKontekstem('height', 2.05, 2.34, 98, 99.5, 0, 1.6, false))
      .toEqual({ t: 'stable', l: 'w kanale rodzicielskim' });
  });

  it('ekran 2 (porównanie): catch-up masy nie ma hamulca przy BMI wchodzącym w 85c', () => {
    const W = silnik();
    const waga = W.para('weight', -1.34, -0.72, 9, 24);
    expect(waga, 'dziś: sam catch-up, bez słowa o BMI')
      .toEqual({ t: 'good', l: 'wyrównanie niedoboru masy ciała' });
    const bmi = W.para('bmi', 0.41, 1.03, 66, 85);
    expect(bmi).toEqual({ t: 'warn', l: 'istotne przesunięcie centylowe w górę' });
    // Nakładka waga↔BMI istnieje, ale wpuszcza tylko werdykty „stable" — dlatego ten
    // odcinek jej nie dotyka. To jest cała przyczyna usterki B z audytu (rata 3).
    expect(W.nakladkaMasaBmi(waga, 0.62, bmi, 0.62)).toBe(waga);
    expect(W.nakladkaMasaBmi({ t: 'stable', l: 'stabilny tor masy ciała' }, 0.62, bmi, 0.62))
      .toEqual({ t: 'warn', l: 'przyrost masy szybszy niż wzrastanie — nadmiar ujawnia się w BMI' });
  });

  it('ekran 2 (porównanie): tor <3c dostaje nakładkę pozycyjną wzrostu', () => {
    const W = silnik();
    const v = W.para('height', -3.2, -3.18, 0.1, 0.1);
    expect(v).toEqual({ t: 'stable', l: 'stabilny tor wzrastania' });
    expect(W.nakladkaPozycjaWzrostu(v, 0.1, null, -3.2, false))
      .toEqual({ t: 'warn', l: 'tor stabilny, ale poniżej 3. centyla — niedobór wzrostu' });
  });
});

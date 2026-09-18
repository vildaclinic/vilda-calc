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
    expect(W.PROGI).toEqual({ ISTOTNA_DECELERACJA_DSDS: -1.0, ISTOTNE_PRZESUNIECIE_DSDS: 0.5 });
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

describe('rata 1 nie zmieniła ani jednego werdyktu', () => {
  // Odcisk policzony na kodzie SPRZED wydzielenia silnika (commit 7355953e, SW 1.1.2)
  // tą samą funkcją tests/support/siatka-werdyktow.mjs. Siatka celuje w granice reguł:
  // przy każdym progu ΔSDS i każdym progu centylowym stoi sąsiad po obu stronach, więc
  // przesunięcie dowolnej nierówności o jeden krok zmienia odcisk.
  const ODCISK_PRZED_WYDZIELENIEM = 'a9a60858e6926c878cf06b8869a0df725be82a592581320f52fdf71e16d7a93d';
  const PRZYPADKOW = 6280776;

  it(`silnik oddaje dokładnie to, co karta przed rozdzieleniem (${PRZYPADKOW} przypadków)`, () => {
    const wynik = odciskSiatki(silnik());
    expect(wynik.przypadkow, 'rozmiar siatki').toBe(PRZYPADKOW);
    expect(wynik.odcisk).toBe(ODCISK_PRZED_WYDZIELENIEM);
  });
});

describe('dwa przypadki z audytu 2026-09-18 — stan przed ratami 2–4', () => {
  // Właściciel pokazał dwa prawdziwe ekrany, na których werdykty brzmiały spójnie
  // z regułą, a nie z sytuacją kliniczną. Te testy UTRWALAJĄ stan dzisiejszy, żeby
  // kolejne raty widać było jako zmianę, a nie jako przypadek. Dane są syntetyczne —
  // odtworzone z opisanych liczb, bez żadnych danych pacjenta.

  it('ekran 1 (trajektoria): waga 99c→99c mówi „stabilny tor masy ciała"', () => {
    const W = silnik();
    expect(W.para('weight', 2.33, 2.29, 99, 99)).toEqual({ t: 'stable', l: 'stabilny tor masy ciała' });
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

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { korzen, tablica } from '../support/silnik-bmi.mjs';

// P-STATUS-DOROSLY — zakładka „Status" Karty pacjenta u osoby dorosłej.
//
// Decyzje właściciela 2026-09-20:
//   1. wzrost dorosłego — centyl na siatce 18-latków, INFORMACYJNIE, bez koloru;
//   2. waga — kolor wg kategorii BMI („nadwaga i otyłość nie mogą mieć kafelka turkusowego");
//   3. kafelek BMI — stopień otyłości wprost w podpisie;
//   4. masa ciała docelowa z różnicą ± i progiem pośrednim BMI 30;
//   5. kafelek „Siatki centylowe" i sekcja „Wzrastanie i genetyka rodzinna" — nie dla dorosłego.
//
// Testy wołają PRAWDZIWE funkcje: silnik `VildaBmi.celMasyDorosly` oraz `Y`/`xt` WYCIĘTE
// z `vilda_auth_ui.js`. Żadnej kopii reguły w teście — inaczej test zzielenieje na własnym
// wzorze, gdy produkcja się rozjedzie.

const zrodloUi = fs.readFileSync(path.join(korzen, 'vilda_auth_ui.js'), 'utf8');

/** Prawdziwy silnik wzrostu z PRAWDZIWYMI tablicami OLAF i WHO 2007 z app.js. */
function silnikWzrostu() {
  const okno = {
    LMS_HEIGHT_BOYS: tablica('LMS_HEIGHT_BOYS'), LMS_HEIGHT_GIRLS: tablica('LMS_HEIGHT_GIRLS'),
    LMS_HEIGHT_WHO_BOYS: tablica('LMS_HEIGHT_WHO_BOYS'), LMS_HEIGHT_WHO_GIRLS: tablica('LMS_HEIGHT_WHO_GIRLS'),
  };
  new Function('window', 'globalThis', fs.readFileSync(path.join(korzen, 'vilda_sds_wzrostu.js'), 'utf8'))(okno, okno);
  return okno.VildaSdsWzrostu;
}

function silnikBmi() {
  const okno = {};
  new Function('window', 'globalThis', fs.readFileSync(path.join(korzen, 'vilda_bmi.js'), 'utf8'))(okno, okno);
  return okno.VildaBmi;
}

/** Wycięcie funkcji po PEŁNEJ sygnaturze, nie po samej nazwie: plik jest zminifikowany
 *  i nazw jednoliterowych jest w nim po kilka (`function Y(` występuje pięć razy).
 *  Pomocnik `funkcjaZ` z rusztowania szuka po nazwie i przy takim pliku trafiał w obcą
 *  funkcję, która zieleniła się na własnym domknięciu. */
function wytnijPoSygnaturze(src, sygnatura) {
  const i = src.indexOf(sygnatura);
  if (i < 0) throw new Error(`vilda_auth_ui.js nie ma ${sygnatura}`);
  let d = 0;
  for (let k = i + sygnatura.length - 1; k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('niezbalansowane nawiasy');
}

/** `Y` (kolor kafelka) i `xt` (budowa kafelka) z pliku produkcyjnego, z podstawionym
 *  domknięciem: `tt` = dorosły, `$` = BMI pomiaru, `Tb` = silnik, `e` = atrapa elementu. */
function karta({ dorosly, bmi }) {
  const e = (tag, attr, dzieci) => ({ tag, attr: attr || {}, dzieci: dzieci || [] });
  return new Function('tt', '$', 'Tb', 'e',
    `${wytnijPoSygnaturze(zrodloUi, 'function Y(ct,Lt,Yt){')}\n${wytnijPoSygnaturze(zrodloUi, 'function xt(ct,Lt,Yt,ke,Ne){')}\nreturn { Y, xt };`,
  )(dorosly, bmi, silnikBmi(), e);
}

const klasy = (kafelek) => String(kafelek.attr.class || '');
const wiersze = (kafelek) => kafelek.dzieci.map((d) => String(d.attr.text || ''));

describe('P-STATUS-DOROSLY — kolory kafelków u dorosłego', () => {
  it('waga dziedziczy kolor po kategorii BMI, nie po centylu masy', () => {
    // Sedno zgłoszenia właściciela: do tej wersji `Y` zwracało dorosłemu null dla wagi,
    // a brak koloru znaczy w `xt` klasę --ok, czyli turkus. Karta chwaliła wagę 112 kg.
    const otyly = karta({ dorosly: true, bmi: 40.3 });
    expect(otyly.Y('weight', 112.4, null), 'otyłość — alarm').toBe('alert');

    const nadwaga = karta({ dorosly: true, bmi: 26.2 });
    expect(nadwaga.Y('weight', 78, null), 'nadwaga — ostrzeżenie').toBe('improve');

    const norma = karta({ dorosly: true, bmi: 22.5 });
    expect(norma.Y('weight', 70, null), 'w normie — bez koloru').toBeNull();
  });

  it('kafelek wagi dorosłego z nadwagą i otyłością nie jest turkusowy', () => {
    for (const bmi of [26.2, 31.0, 43.8]) {
      const k = karta({ dorosly: true, bmi });
      const kafelek = k.xt('Waga', '112,4 kg', 'ocena wg BMI', k.Y('weight', 112.4, null), null);
      expect(klasy(kafelek), `BMI ${bmi} nie może być --ok`).not.toContain('vilda-patient-stat--ok');
      expect(klasy(kafelek)).toMatch(/vilda-patient-stat--(alert|improve)/);
    }
  });

  it('wzrost dorosłego jest neutralny — ani alarm, ani „ok"', () => {
    const k = karta({ dorosly: true, bmi: 40.3 });
    expect(k.Y('height', 167, null), 'wzrost dorosłego bez werdyktu').toBe('neutral');

    const kafelek = k.xt('Wzrost', '167,0 cm', '5. centyl', 'neutral', 'odniesienie: 18-latkowie, OLAF');
    expect(klasy(kafelek), 'brak koloru nie oznacza pochwały').not.toContain('vilda-patient-stat--ok');
    expect(klasy(kafelek)).not.toContain('--alert');
    expect(klasy(kafelek)).not.toContain('--improve');
    expect(klasy(kafelek).trim(), 'goła klasa bazowa').toBe('vilda-patient-stat');
    expect(wiersze(kafelek), 'centyl i nazwana populacja odniesienia')
      .toEqual(['Wzrost', '167,0 cm', '5. centyl', 'odniesienie: 18-latkowie, OLAF']);
  });

  it('kontrola negatywna: u dziecka nic się nie zmienia', () => {
    const k = karta({ dorosly: false, bmi: 26.2 });
    expect(k.Y('height', 120, 1.4), 'dziecko < 3. centyla').toBe('alert');
    expect(k.Y('height', 120, 8), 'dziecko 3–10. centyl').toBe('improve');
    expect(k.Y('height', 130, 50), 'dziecko w środku siatki').toBeNull();
    expect(k.Y('weight', 40, 99), 'waga dziecka nadal z centyla').toBe('alert');
    const kafelek = k.xt('Wzrost', '130,0 cm', '50. centyl', k.Y('height', 130, 50), null);
    expect(klasy(kafelek), 'dziecko w normie zachowuje turkus').toContain('vilda-patient-stat--ok');
  });
});

describe('P-STATUS-DOROSLY — masa ciała docelowa z silnika', () => {
  const B = silnikBmi();
  const P = B.PROGI.DOROSLY;

  it('przy otyłości daje cel normy i bliższy próg pośredni', () => {
    const r = B.celMasyDorosly({ wzrostCm: 167, masaKg: 112.4 });
    expect(r.kierunek).toBe('redukcja');
    expect(r.kategoria.etykieta).toBe('Otyłość III stopnia');
    expect(r.cel.bmi, 'granica normy z progów silnika').toBe(P.CEL);
    expect(r.cel.masa).toBeCloseTo(P.CEL * 1.67 ** 2, 6);
    expect(r.cel.roznica, 'ujemna = tyle ubytku').toBeCloseTo(r.cel.masa - 112.4, 6);
    expect(r.posredni.bmi, 'próg pośredni to dolna granica otyłości').toBe(P.OTYLOSC_1);
    expect(Math.abs(r.posredni.roznica), 'pośredni jest BLIŻEJ niż cel')
      .toBeLessThan(Math.abs(r.cel.roznica));
  });

  it('przy nadwadze progu pośredniego nie ma', () => {
    // Inaczej pacjent z BMI 26 czytałby „do BMI 30", czyli w stronę, z której już wyszedł.
    const r = B.celMasyDorosly({ wzrostCm: 167, masaKg: 73 });
    expect(r.kategoria.klucz).toBe('nadwaga');
    expect(r.posredni).toBeNull();
    expect(r.cel.roznica).toBeLessThan(0);
  });

  it('przy niedowadze cel to DOLNA granica, a różnica jest dodatnia', () => {
    const r = B.celMasyDorosly({ wzrostCm: 160, masaKg: 42 });
    expect(r.kierunek).toBe('przyrost');
    expect(r.cel.granica).toBe('dolna');
    expect(r.cel.bmi).toBe(P.NIEDOWAGA);
    expect(r.cel.roznica).toBeGreaterThan(0);
    expect(r.posredni).toBeNull();
  });

  it('w normie celu nie ma — jest zakres', () => {
    const r = B.celMasyDorosly({ wzrostCm: 175, masaKg: 72 });
    expect(r.kierunek).toBe('w-normie');
    expect(r.cel).toBeNull();
    expect(r.zakresNormy.odMasa).toBeCloseTo(P.NIEDOWAGA * 1.75 ** 2, 6);
    expect(r.zakresNormy.doMasa).toBeCloseTo(P.CEL * 1.75 ** 2, 6);
    expect(r.zakresNormy.odMasa).toBeLessThan(r.zakresNormy.doMasa);
  });

  it('bez wzrostu albo bez masy nie zgaduje', () => {
    expect(B.celMasyDorosly({ masaKg: 80 })).toBeNull();
    expect(B.celMasyDorosly({ wzrostCm: 0, masaKg: 80 })).toBeNull();
    expect(B.celMasyDorosly({ wzrostCm: 170 })).toBeNull();
    expect(B.celMasyDorosly({ wzrostCm: 170, masaKg: 'brak' })).toBeNull();
  });

  it('progi pochodzą z PROGI.DOROSLY, nie z liczb wpisanych w kafelek', () => {
    // Strażnik na wypadek, gdyby ktoś „poprawił" 24,9 albo 30 wprost w widoku: masa celu
    // musi być dokładnie BMI progu przemnożonym przez kwadrat wzrostu tego pacjenta.
    const r = B.celMasyDorosly({ wzrostCm: 182, masaKg: 130 });
    expect(r.cel.masa / 1.82 ** 2).toBeCloseTo(P.CEL, 9);
    expect(r.posredni.masa / 1.82 ** 2).toBeCloseTo(P.OTYLOSC_1, 9);
  });
});

describe('P-STATUS-DOROSLY-OLAF — populacja odniesienia wzrostu dorosłego', () => {
  // Poprawka 2026-09-20. Pierwsza wersja brała siatkę z rekordu (`zscore.dataSource`),
  // więc pacjent z ustawieniem WHO dostawał centyl wobec siatki WHO. Właściciel wskazał
  // OLAF i to jest wiążące; argument o „niemieszaniu siatek" nie bronił się, bo u dorosłego
  // centyl wzrostu jest jedyną liczbą liczoną z siatki.

  it('silnik wzrostu deklaruje odniesienie jako nazwaną, zamrożoną daną: 18 lat, OLAF', () => {
    const S = silnikWzrostu();
    expect(S.DOROSLY_ODNIESIENIE).toEqual({ wiekMies: 216, zrodlo: 'OLAF' });
    expect(Object.isFrozen(S.DOROSLY_ODNIESIENIE), 'norma jako dana, nie do nadpisania w locie')
      .toBe(true);
  });

  it('Karta czyta odniesienie z silnika, a nie źródło z rekordu pacjenta', () => {
    const src = zrodloUi.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(src).toContain('i.VildaSdsWzrostu.DOROSLY_ODNIESIENIE');
    expect(src).toContain('wiekMies:SDo.wiekMies,zrodlo:SDo.zrodlo');
    expect(src, 'stara wersja brała siatkę z rekordu').not.toContain('zrodlo:h||"OLAF"');
    expect(src, 'nazwa siatki w kafelku też nie wraca do literału').not.toContain('SDsiatka||"OLAF"');
  });

  it('wybór siatki zmienia liczbę, którą zobaczy lekarz — więc nie jest kosmetyczny', () => {
    // 186 cm, mężczyzna: OLAF 87. centyl, WHO 91. Gdyby te dwie siatki dawały to samo,
    // test niczego by nie pilnował — stąd jawna asercja różnicy.
    const S = silnikWzrostu();
    const o = S.DOROSLY_ODNIESIENIE;
    const olaf = S.policz({ wzrost: 186, plec: 'M', wiekMies: o.wiekMies, zrodlo: o.zrodlo });
    expect(olaf.siatka).toBe('OLAF');
    expect(olaf.fallback, 'OLAF sięga 216 mies., więc żadnego zastępstwa nie ma').toBe(false);
    expect(Math.round(olaf.centyl)).toBe(87);

    const who = S.policz({ wzrost: 186, plec: 'M', wiekMies: o.wiekMies, zrodlo: 'WHO' });
    expect(who.siatka).toBe('WHO');
    expect(Math.round(who.centyl)).not.toBe(Math.round(olaf.centyl));
  });
});

describe('P-STATUS-DOROSLY — czego u dorosłego już nie ma', () => {
  it('kafelki pediatryczne i nagłówek o wzrastaniu są zabramkowane wiekiem', () => {
    // Nagłówka „Wzrastanie i genetyka rodzinna" nie wycinamy — gasimy jego zawartość,
    // więc bramka `!tt` musi stać przy KAŻDYM źródle kafelka tej sekcji.
    const bezKomentarzy = zrodloUi.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const [opis, wzorzec] of [
      ['tempo wzrastania', 'var ce=[];'],
      ['MPH', 'if(!tt&&rt!=null){var Oe='],
      ['kafelek siatek', '!tt&&lt&&ce.push(xt("Siatki centylowe"'],
      ['SDS tempa', '!tt&&Bh1&&typeof Bh1.hvSdsKafelek'],
      ['walidacja prognoz', '!tt&&la&&typeof la.buildStatusSection'],
    ]) {
      expect(bezKomentarzy, `${opis} — bramka wieku`).toContain(wzorzec);
    }
    expect(bezKomentarzy, 'tempo wzrastania tylko dla dziecka').toContain('if(!tt&&ut!=null){');
    expect(bezKomentarzy, 'stara, niezabramkowana wersja zniknęła')
      .not.toContain('var ce=[];if(ut!=null){');
  });
});

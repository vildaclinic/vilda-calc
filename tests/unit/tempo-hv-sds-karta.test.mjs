import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// GROWTH-HV-KARTA — HV-SDS jako liczba opisowa w karcie wzrostowej.
//
// Funkcje są WYCIĘTE Z PLIKU PRODUKCYJNEGO i uruchomione na prawdziwym silniku oraz
// prawdziwych tablicach norm. Testujemy zachowanie karty, nie kopię jej logiki.
//
// Rzecz najważniejsza: werdykt tempa („poniżej normy dla wieku") pochodzi wyłącznie
// z velocityAssessment. HV-SDS nie może go dotknąć — ani zmienić klasy, ani dołożyć flagi.

function karta(dodatkoweOkno) {
  const src = fs.readFileSync(path.join(korzen, 'vilda_trajectory_analysis.js'), 'utf8');
  const start = src.indexOf('  var NAZWA_PODGRUPY = {');
  const end = src.indexOf('  function delayedPubertyHtml(');
  expect(start, 'znaleziono blok HV-SDS').toBeGreaterThan(-1);
  expect(end, 'znaleziono koniec bloku').toBeGreaterThan(start);

  const okno = Object.assign({}, dodatkoweOkno);
  for (const plik of ['hv_donald_data.js', 'hv_kelly_data.js', 'hv_cdgp_data.js',
    'vilda_height_velocity.js']) {
    new Function('window', fs.readFileSync(path.join(korzen, plik), 'utf8'))(okno);
  }
  const esc = (x) => String(x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (v, d) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
  const fmtS = (v) => {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    const t = Math.abs(v).toFixed(1);
    return (parseFloat(t) === 0 ? '' : (v > 0 ? '+' : '−')) + t.replace('.', ',');
  };
  const velocityAssessment = () => ({ cls: 'bad', text: 'poniżej normy dla wieku' });
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : (v == null || v === '' ? null
    : (isFinite(parseFloat(String(v).replace(',', '.'))) ? parseFloat(String(v).replace(',', '.')) : null)));
  const sexMK = (v) => (String(v || '').toUpperCase().startsWith('M') ? 'M' : 'F');
  const fmtAgeM = (mo) => `${Math.floor(mo / 12)} lat ${Math.round(mo % 12)} mies.`;
  return new Function(
    'w', 'esc', 'fmt', 'fmtS', 'velocityAssessment', 'num', 'sexMK', 'fmtAgeM',
    `${src.slice(start, end)}\nreturn { hvSdsHtml, velocityHtml, patientHvCardHtml, hvSdsPodsumowanie };`,
  )(okno, esc, fmt, fmtS, velocityAssessment, num, sexMK, fmtAgeM);
}

// Dziewczynka 9,5 r.ż. w środku przedziału, 3,0 cm/rok, odstęp 12 mies.
const VEL = { cmPerYear: 3, gapM: 12, wiekSrodekMies: 114, plec: 'F', usedLastYear: true };
const MODEL = { sex: 'F' };

describe('Liczba opisowa w karcie', () => {
  it('podaje SDS, centyl, medianę i nazwaną populację odniesienia', () => {
    const { hvSdsHtml } = karta();
    const html = hvSdsHtml(VEL, MODEL);
    expect(html).toContain('SDS tempa:');
    expect(html).toContain('−2,4');
    expect(html).toContain('0,8 centyl');
    expect(html).toContain('mediana 5,87 cm/rok');
    expect(html).toMatch(/wg Duran i wsp\., J Pediatr Endocrinol Metab 2025/);
    expect(html, 'etykieta techniczna nie trafia do lekarza').not.toMatch(/DONALD \(Niemcy/);
  });

  it('każdy wynik niesie zastrzeżenie o wahaniach i o braku polskich norm', () => {
    const { hvSdsHtml } = karta();
    const html = hvSdsHtml(VEL, MODEL);
    expect(html).toMatch(/2,8 SD/);
    expect(html).toMatch(/Polskich norm tempa nie ma/);
  });

  it('nie dopisuje żadnej klasy werdyktowej — tylko neutralną vta-stable', () => {
    const { hvSdsHtml } = karta();
    const html = hvSdsHtml(VEL, MODEL);
    expect(html).not.toMatch(/vta-bad|vta-warn|vta-good/);
  });

  it('werdykt tempa zostaje nietknięty obok HV-SDS', () => {
    const { velocityHtml } = karta();
    const html = velocityHtml(VEL, MODEL);
    expect(html).toContain('Tempo wzrastania:');
    expect(html).toContain('<span class="vta-bad">poniżej normy dla wieku</span>');
    expect(html).toContain('SDS tempa:');
  });

  it('bez silnika karta pokazuje samo tempo, bez awarii', () => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_trajectory_analysis.js'), 'utf8');
    const start = src.indexOf('  var NAZWA_PODGRUPY = {');
    const end = src.indexOf('  function delayedPubertyHtml(');
    const puste = new Function('w', 'esc', 'fmt', 'fmtS', 'velocityAssessment', 'num', 'sexMK', 'fmtAgeM',
      `${src.slice(start, end)}\nreturn { velocityHtml };`)(
      {}, (x) => String(x), (v, d) => v.toFixed(d), (v) => String(v),
      () => ({ cls: 'bad', text: 'poniżej normy' }), (v) => v, (v) => v, (v) => String(v));
    const html = puste.velocityHtml(VEL, MODEL);
    expect(html).toContain('Tempo wzrastania:');
    expect(html).not.toContain('SDS tempa:');
  });
});

describe('Podgrupa wg czasu pokwitania', () => {
  const zeStartem = (start) => ({
    VildaPubertalStatus: {
      dane: () => ({ wiekStartuLat: start, wiekMenarcheLat: null, kowd: '' }),
    },
  });

  it('dokładana tylko wtedy, gdy znany jest wiek startu pokwitania', () => {
    const { hvSdsHtml } = karta();
    expect(hvSdsHtml(VEL, MODEL)).not.toContain('Wg czasu pokwitania');
  });

  it('przy znanym wieku startu podaje drugą liczbę i nazwę podgrupy', () => {
    const { hvSdsHtml } = karta(zeStartem(12.5));
    const html = hvSdsHtml({ ...VEL, wiekSrodekMies: 132 }, MODEL);
    expect(html).toContain('Wg czasu pokwitania:');
    expect(html).toContain('dzieci dojrzewające później');
  });

  it('dziecko spoza kryteriów kohorty nie dostaje podgrupy, tylko powód', () => {
    const { hvSdsHtml } = karta(zeStartem(7.5));
    const html = hvSdsHtml({ ...VEL, wiekSrodekMies: 132 }, MODEL);
    expect(html).toContain('podgrupy nie przypisano');
    expect(html).toMatch(/pokwitanie przedwczesne/);
    expect(html).not.toMatch(/dzieci dojrzewające/);
  });

  it('sam wiek menarche nie wywołuje podgrupy', () => {
    const { hvSdsHtml } = karta({
      VildaPubertalStatus: { dane: () => ({ wiekStartuLat: null, wiekMenarcheLat: 12, kowd: '' }) },
    });
    expect(hvSdsHtml(VEL, MODEL)).not.toContain('Wg czasu pokwitania');
  });
});

describe('Gałąź KOWD', () => {
  const zDeklaracja = (kowd) => ({
    VildaPubertalStatus: { dane: () => ({ wiekStartuLat: null, wiekMenarcheLat: null, kowd: kowd }) },
  });

  it('bez deklaracji lekarza gałąź się nie pokazuje', () => {
    const { hvSdsHtml } = karta(zDeklaracja(''));
    expect(hvSdsHtml({ ...VEL, plec: 'M', wiekSrodekMies: 162, cmPerYear: 4.2 }, { sex: 'M' }))
      .not.toContain('KOWD');
  });

  it('odpowiedź „nie” też jej nie pokazuje', () => {
    const { hvSdsHtml } = karta(zDeklaracja('nie'));
    expect(hvSdsHtml({ ...VEL, plec: 'M', wiekSrodekMies: 162, cmPerYear: 4.2 }, { sex: 'M' }))
      .not.toContain('KOWD');
  });

  it('po deklaracji „tak” podaje położenie wobec kwartyli, a nie SDS', () => {
    const { hvSdsHtml } = karta(zDeklaracja('tak'));
    const html = hvSdsHtml({ ...VEL, plec: 'M', wiekSrodekMies: 162, cmPerYear: 4.2 }, { sex: 'M' });
    expect(html).toContain('KOWD (deklaracja lekarza):');
    expect(html).toContain('poniżej 25. centyla');
    expect(html).toMatch(/n = 21/);
  });
});

describe('Kiedy karta milczy, a kiedy mówi dlaczego', () => {
  it('brak środka przedziału to brak zdania — nie ma czym indeksować normy', () => {
    const { hvSdsHtml } = karta();
    expect(hvSdsHtml({ ...VEL, wiekSrodekMies: null }, MODEL)).toBe('');
  });

  it('odstęp poza oknem norm dostaje zdanie z powodem, nie ciszę', () => {
    const { hvSdsHtml } = karta();
    const html = hvSdsHtml({ ...VEL, gapM: 3 }, MODEL);
    expect(html).toContain('nie policzono');
    expect(html).toMatch(/Odstęp między pomiarami/);
  });

  it('wiek poniżej dolnej granicy tablic również', () => {
    const { hvSdsHtml } = karta();
    const html = hvSdsHtml({ ...VEL, wiekSrodekMies: 18 }, MODEL);
    expect(html).toContain('nie policzono');
    expect(html).toMatch(/poniżej dolnej granicy/);
  });
});

// ── Trzy miejsca prezentacji (miejsca wskazane przez właściciela 2026-09-09) ──────────
//
// Jedno liczenie, trzy prezentacje. Gdyby każda liczyła sama, po pierwszej zmianie źródła
// norm mówiłyby o pacjencie co innego — dlatego wszystkie idą przez hvSdsDane().

describe('Zdanie do karty „Podsumowanie wyników”', () => {
  it('jest tekstem, nie HTML-em — tamta karta składa wiersze przez textContent', () => {
    const { hvSdsPodsumowanie } = karta();
    const z = hvSdsPodsumowanie({ sex: 'K', cmPerYear: 3, gapM: 12, currentAgeMonths: 120 });
    expect(z).not.toMatch(/[<>]/);
    expect(z).toContain('SDS tempa:');
    expect(z).toContain('−2,4');
    expect(z).toContain('0,8 centyl');
    expect(z).toMatch(/wg Duran i wsp\., J Pediatr Endocrinol Metab 2025/);
  });

  it('mieści się w jednym zdaniu — wersja kompaktowa', () => {
    const { hvSdsPodsumowanie } = karta();
    const z = hvSdsPodsumowanie({ sex: 'K', cmPerYear: 3, gapM: 12, currentAgeMonths: 120 });
    expect(z.length).toBeLessThan(140);
  });

  it('wiek środkowy liczony jest ze środka przedziału, nie z wieku bieżącego', () => {
    const { hvSdsPodsumowanie, hvSdsHtml } = karta();
    const zPodsumowania = hvSdsPodsumowanie({ sex: 'K', cmPerYear: 3, gapM: 12, currentAgeMonths: 120 });
    const zKarty = hvSdsHtml({ cmPerYear: 3, gapM: 12, wiekSrodekMies: 114, plec: 'F' }, { sex: 'F' });
    expect(zPodsumowania).toContain('−2,4');
    expect(zKarty).toContain('−2,4');
  });

  it('bez danych o odstępie albo wieku nie dopisuje nic', () => {
    const { hvSdsPodsumowanie } = karta();
    expect(hvSdsPodsumowanie({ sex: 'K', cmPerYear: 3 })).toBe('');
    expect(hvSdsPodsumowanie({})).toBe('');
    expect(hvSdsPodsumowanie(null)).toBe('');
  });

  it('deklaracja KOWD dopisuje się do tego samego zdania', () => {
    const { hvSdsPodsumowanie } = karta({
      VildaPubertalStatus: { dane: () => ({ wiekStartuLat: null, wiekMenarcheLat: null, kowd: 'tak' }) },
    });
    const z = hvSdsPodsumowanie({ sex: 'M', cmPerYear: 4.2, gapM: 12, currentAgeMonths: 168 });
    expect(z).toContain('KOWD');
    expect(z).toContain('poniżej 25. centyla');
  });
});

describe('Kafelek obok wzrostu, masy i BMI', () => {
  const VEL_K = { cmPerYear: 3, gapM: 12, wiekSrodekMies: 114, plec: 'F' };

  it('ma klasę kafelka trajektorii, żeby wpaść w ten sam rząd', () => {
    const { patientHvCardHtml } = karta();
    const html = patientHvCardHtml(VEL_K, { sex: 'F' }, {});
    expect(html).toMatch(/class="vtap-card [^"]*vtap-hvc"/);
    expect(html).toContain('SDS tempa');
    expect(html).toContain('−2,4');
    expect(html).toContain('0,8 c.');
    expect(html).toContain('mediana 5,87 cm/rok');
    expect(html, 'źródło podpisane jak w piśmiennictwie')
      .toMatch(/wg Duran i wsp\., J Pediatr Endocrinol Metab 2025/);
    expect(html).not.toMatch(/DONALD \(Niemcy/);
  });

  it('wersja zwykła jest zwięzła — bez rozwijania i bez zastrzeżeń', () => {
    const { patientHvCardHtml } = karta();
    const html = patientHvCardHtml(VEL_K, { sex: 'F' }, {});
    expect(html).not.toContain('<details');
    expect(html).not.toMatch(/2,8 SD/);
  });

  it('wersja rozwijalna niesie komplet opisu pomiaru', () => {
    const { patientHvCardHtml } = karta();
    const html = patientHvCardHtml(VEL_K, { sex: 'F' }, { rozwijalny: true });
    expect(html).toContain('<details');
    expect(html).toContain('vtap-hv-body');
    expect(html).toMatch(/Norma: Duran I i wsp\./);
    expect(html).toMatch(/PMID 40557842/);
    expect(html).toMatch(/Populacja odniesienia: niemiecka/);
    expect(html).toMatch(/Odstęp pomiarów: 12 mies\./);
    expect(html).toMatch(/2,8 SD/);
    expect(html).toMatch(/Polskie normy tempa wzrastania nie istnieją/);
  });

  it('kafelek nie koloruje się werdyktem — pasek jest neutralny', () => {
    const { patientHvCardHtml } = karta();
    const html = patientHvCardHtml(VEL_K, { sex: 'F' }, { rozwijalny: true });
    expect(html).not.toMatch(/vt-b|vt-w|vt-g\b/);
    expect(html).toMatch(/class="vtap-card cs /);
  });

  it('odmowa też ma kafelek — z powodem, nie pustką', () => {
    const { patientHvCardHtml } = karta();
    const html = patientHvCardHtml({ ...VEL_K, gapM: 3 }, { sex: 'F' }, {});
    expect(html).toContain('nie policzono');
    expect(html).toMatch(/Odstęp między pomiarami/);
  });

  it('bez środka przedziału kafelka nie ma — nie ma czym indeksować normy', () => {
    const { patientHvCardHtml } = karta();
    expect(patientHvCardHtml({ ...VEL_K, wiekSrodekMies: null }, { sex: 'F' }, {})).toBe('');
  });
});

describe('Kafelek stoi w rzędzie kart, nie w martwej gałęzi', () => {
  const src = fs.readFileSync(path.join(korzen, 'vilda_trajectory_analysis.js'), 'utf8');

  it('buildPatientHtml wstawia kafelek do .vtap-cards', () => {
    // To jest strażnik pomyłki z SW 1.0.870: blok HV-SDS trafił wtedy do buildHtml,
    // czyli do gałęzi, której aplikacja nie renderuje.
    const i = src.indexOf('function buildPatientHtml');
    const j = src.indexOf('var COLLAPSE_KEY', i);
    const ciało = src.slice(i, j);
    expect(ciało).toContain('patientHvCardHtml(model.velocity, model');
    expect(ciało.indexOf('patientHvCardHtml'), 'kafelek przed zamknięciem .vtap-cards')
      .toBeLessThan(ciało.indexOf("html += '</div>';"));
  });

  it('Karta pacjenta prosi o wersję rozwijalną — i prośba dochodzi', () => {
    const auth = fs.readFileSync(path.join(korzen, 'vilda_auth_ui.js'), 'utf8');
    expect(auth).toContain('hvRozwijalny:!0');
    // Do SW 1.0.871 renderPatientPanel budował panel na samych wartościach domyślnych,
    // więc prośba Karty pacjenta ginęła w drodze i kafelek nigdy nie był rozwijalny.
    const i = src.indexOf('function renderPatientPanel');
    const j = src.indexOf('var COLLAPSE_KEY', i);
    expect(src.slice(i, j)).toContain('hvRozwijalny: !!(opts && opts.hvRozwijalny)');
  });

  it('karta „Podsumowanie wyników” dopisuje wiersz po tempie wzrastania', () => {
    const sum = fs.readFileSync(path.join(korzen, 'vilda_summary_cards.js'), 'utf8');
    expect(sum).toContain('qHvSdsPush(e,C)');
    expect(sum).toContain('T.hvSdsPodsumowanie(');
    expect(sum.indexOf('Aktualne tempo wzrastania'), 'zdanie idzie PO tempie')
      .toBeLessThan(sum.indexOf('qHvSdsPush(e,C)'));
  });
});

describe('Źródło podpisane jak w piśmiennictwie', () => {
  it('każde źródło norm ma krótkie cytowanie, nie tylko etykietę', () => {
    const okno = {};
    for (const plik of ['hv_donald_data.js', 'hv_kelly_data.js', 'hv_cdgp_data.js']) {
      new Function('window', fs.readFileSync(path.join(korzen, plik), 'utf8'))(okno);
    }
    expect(okno.VildaHvDonaldData.META.cytowanieKrotkie)
      .toBe('Duran i wsp., J Pediatr Endocrinol Metab 2025');
    expect(okno.VildaHvKellyData.META.cytowanieKrotkie)
      .toBe('Kelly i wsp., J Clin Endocrinol Metab 2014');
    expect(okno.VildaHvCdgpData.META.cytowanieKrotkie)
      .toBe('Butenandt i Kunze, J Pediatr Endocrinol Metab 2010');
  });

  it('krótkie cytowanie ma kształt „autor, czasopismo rok”, bez nazwy kohorty w nawiasie', () => {
    const okno = {};
    for (const plik of ['hv_donald_data.js', 'hv_kelly_data.js', 'hv_cdgp_data.js']) {
      new Function('window', fs.readFileSync(path.join(korzen, plik), 'utf8'))(okno);
    }
    for (const dane of [okno.VildaHvDonaldData, okno.VildaHvKellyData, okno.VildaHvCdgpData]) {
      expect(dane.META.cytowanieKrotkie, dane.META.id).toMatch(/^[^(]+, [A-Z].+ (19|20)\d\d$/);
    }
  });

  it('silnik przekazuje krótkie cytowanie w wyniku, także w gałęzi KOWD', () => {
    const okno = {};
    for (const plik of ['hv_donald_data.js', 'hv_kelly_data.js', 'hv_cdgp_data.js',
      'vilda_height_velocity.js']) {
      new Function('window', fs.readFileSync(path.join(korzen, plik), 'utf8'))(okno);
    }
    const r = okno.VildaHeightVelocity.oblicz({
      sex: 'M', wiekLat: 13.5, cmPerYear: 4.2, oknoMies: 12, kowd: true,
    });
    expect(r.zrodlo.cytowanieKrotkie).toBe('Duran i wsp., J Pediatr Endocrinol Metab 2025');
    expect(r.kowd.zrodloKrotkie).toBe('Butenandt i Kunze, J Pediatr Endocrinol Metab 2010');
  });

  it('gałąź KOWD w karcie też jest podpisana', () => {
    const { hvSdsHtml } = karta({
      VildaPubertalStatus: { dane: () => ({ wiekStartuLat: null, wiekMenarcheLat: null, kowd: 'tak' }) },
    });
    const html = hvSdsHtml({ cmPerYear: 4.2, gapM: 12, wiekSrodekMies: 162, plec: 'M' }, { sex: 'M' });
    expect(html).toMatch(/wg Butenandt i Kunze, J Pediatr Endocrinol Metab 2010/);
  });
});

describe('Przeliczanie na żywo', () => {
  const src = fs.readFileSync(path.join(korzen, 'vilda_advanced_growth.js'), 'utf8');

  it('zmiana pola pokwitaniowego odświeża kartę — inaczej wynik zostawał stary', () => {
    // Lista pól, których zmiana wywołuje calculateGrowthAdvanced. Bez tych czterech
    // wpisów lekarz zmieniał stadium albo wiek startu i widział poprzedni wynik.
    for (const id of ['tannerStage', 'pubertyOnsetAge', 'pubertyMenarcheAge', 'pubertyCdgp']) {
      expect(src, id).toContain(`"${id}"`);
    }
    const i = src.indexOf('"advGrowthExclusion"');
    const lista = src.slice(i, i + 120);
    expect(lista, 'nowe pola stoją w tej samej liście co dotychczasowe wejścia')
      .toContain('"tannerStage"');
  });
});

describe('Zdanie podsumowania nie zależy od gotowości globalnej', () => {
  const src = fs.readFileSync(path.join(korzen, 'vilda_trajectory_analysis.js'), 'utf8');

  // Tuż po wczytaniu pacjenta `advancedGrowthData` bywa jeszcze niewypełniona. Zdanie ma
  // wtedy powstać z pomiarów — tak samo, jak kafelek w Karcie pacjenta. Zachowanie mierzy
  // e2e (potrzebuje pełnej maszynerii centylowej); tutaj pilnujemy, że droga istnieje
  // i że karta podsumowania ma z czego ją zasilić.
  it('silnik zdania ma drugą drogę: pomiary zamiast odstępu', () => {
    const i = src.indexOf('function hvSdsPodsumowanie');
    const j = src.indexOf('function patientHvCardHtml', i);
    const cialo = src.slice(i, j);
    expect(cialo).toContain('Array.isArray(i.measurements)');
    expect(cialo, 'model tempa liczony tą samą funkcją co karta').toContain('analyze({');
    expect(cialo, 'brak jednego i drugiego to nadal brak danych').toContain("return '';");
  });

  it('karta podsumowania czyta pomiary i wiek z formularza, nie tylko z globalnej', () => {
    const sum = fs.readFileSync(path.join(korzen, 'vilda_summary_cards.js'), 'utf8');
    expect(sum).toContain('#advMeasurements .measure-row');
    expect(sum).toContain('function qWiekMies');
    expect(sum, 'wiek z pól formularza, nie z globalnej funkcji').toContain('num("age")*12+num("ageMonths")');
  });
});

describe('Kafelek Karty pacjenta nie rozpycha siatki', () => {
  const auth = fs.readFileSync(path.join(korzen, 'vilda_auth_ui.js'), 'utf8');

  it('szczegóły idą do osobnego panelu POD siatką, nie do wnętrza kafelka', () => {
    // Zgłoszenie właściciela: <details> w komórce siatki rozciągał ją w dół
    // i ciągnął za sobą sąsiednie kafelki.
    expect(auth).toContain('class:"vhv-panel"');
    expect(auth).toContain('BhPanel&&Nt.appendChild(BhPanel)');
    expect(auth, 'panel dołącza się obok panelu walidacji prognoz, a nie do siatki')
      .toMatch(/BhPanel&&Nt\.appendChild\(BhPanel\),Ce&&Ce\.panel/);
    expect(auth, 'żadnego <details> w komórce siatki').not.toContain('vilda-patient-stat-details');
  });

  it('kafelek ma tę samą klasę wyglądu co wzrost, masa i BMI', () => {
    expect(auth).toContain('vilda-patient-stat vilda-patient-stat--ok vhv-tile');
  });

  it('kafelek jest dostępny z klawiatury', () => {
    expect(auth).toContain('role:"button",tabindex:"0"');
    expect(auth).toContain('Bh9.key==="Enter"||Bh9.key===" "');
  });
});

describe('Czyszczenie formularza', () => {
  const io = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');

  it('„Wyczyść wszystkie pola” czyści też pola pokwitaniowe', () => {
    // Bez tego wiek startu pokwitania poprzedniego pacjenta zostawał w formularzu
    // i wchodził do rekordu następnego.
    const i = io.indexOf('function kt(){[');
    const lista = io.slice(i, i + 400);
    for (const id of ['tannerStage', 'pubertyOnsetAge', 'pubertyMenarcheAge', 'pubertyCdgp']) {
      expect(lista, id).toContain(`"${id}"`);
    }
  });

  it('i zwija panel „Dane pokwitaniowe”', () => {
    expect(io).toContain('vildaZwinDanePokwitaniowe');
    const inline = fs.readFileSync(path.join(korzen, 'inline_index_02.js'), 'utf8');
    expect(inline).toContain('window.vildaZwinDanePokwitaniowe');
    expect(inline, 'zwinięcie kasuje też pamięć decyzji lekarza')
      .toMatch(/vildaZwinDanePokwitaniowe = function \(\) \{\s*decyzjaUzytkownika = false;/);
  });
});

// GROWTH-HV-UI3 — ten sam pacjent, te same dane, dwie różne liczby (zgłoszenie właściciela,
// SW 1.0.874): Karta pacjenta +2,2, „Podsumowanie wyników" −2,5. Przyczyna: zdanie
// podsumowania liczyło model tempa z `measurements` karty zaawansowanej, a to są WYŁĄCZNIE
// pomiary historyczne — bez dzisiejszego wzrostu analyze() brał ostatni z nich za pomiar
// dzisiejszy i liczył tempo z niewłaściwej pary punktów.
describe('Ten sam pacjent — ta sama liczba w podsumowaniu i w kafelku', () => {
  // Chłopiec 9 lat 8 mies., 129,5 cm; rok temu 122 cm (7,5 cm/rok); dwa lata temu 116 cm.
  const HISTORIA = [
    { ageMonths: 92, ageYears: 92 / 12, height: 116, weight: 22 },
    { ageMonths: 104, ageYears: 104 / 12, height: 122, weight: 25 },
  ];

  it('zdanie liczy SDS z tego samego tempa, które karta pokazuje wiersz wyżej', () => {
    const { hvSdsPodsumowanie } = karta();
    // Tak woła je karta podsumowania: tempo już policzone przez aplikację ORAZ pomiary.
    const z = hvSdsPodsumowanie({
      sex: 'M', cmPerYear: 7.5, gapM: 12, currentAgeMonths: 116,
      measurements: HISTORIA, currentHeight: 129.5,
    });
    expect(z, 'tempo aplikacji ma pierwszeństwo przed liczeniem z pomiarów').toContain('+2,2');
    expect(z).toContain('98,6 centyl');
    expect(z).not.toMatch(/nie policzono/);
  });

  it('droga z pomiarów bez dzisiejszego wzrostu milczy — nie podaje liczby z cudzego przedziału', () => {
    const { hvSdsPodsumowanie } = karta();
    // Bez cmPerYear/gapM i bez currentHeight: przed poprawką analyze() liczył tu tempo
    // między pomiarem sprzed dwóch lat a pomiarem sprzed roku, datując ten drugi na dziś.
    const z = hvSdsPodsumowanie({ sex: 'M', currentAgeMonths: 116, measurements: HISTORIA });
    expect(z).toBe('');
  });

  it('karta podsumowania przekazuje dzisiejszy pomiar osobno, a nie dokleja go do historii', () => {
    const sum = fs.readFileSync(path.join(korzen, 'vilda_summary_cards.js'), 'utf8');
    const i = sum.indexOf('function qPomiaryZKarty');
    const j = sum.indexOf('function qVeloSuffix', i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    const wejscia = [];
    const okno = { VildaTrajectoryAnalysis: { hvSdsPodsumowanie: (we) => { wejscia.push(we); return 'SDS tempa: x'; } } };
    const dokument = { getElementById: (id) => ({ value: { height: '129,5', weight: '27,6' }[id] || '' }), querySelectorAll: () => [] };
    const { qHvSdsPush } = new Function('a', 'document', 'bmiSource',
      `${sum.slice(i, j)}\nreturn { qHvSdsPush };`)(okno, dokument, 'OLAF');

    const linie = [];
    qHvSdsPush(linie, {
      sex: 'M', growthVelocity: 7.5, growthVelocityGapM: 12, currentAgeMonths: 116,
      currentHeight: 129.5, currentWeight: 27.6, measurements: HISTORIA,
    });
    expect(linie).toEqual(['SDS tempa: x']);
    expect(wejscia).toHaveLength(1);
    const we = wejscia[0];
    expect(we.cmPerYear, 'tempo aplikacji idzie do zdania').toBe(7.5);
    expect(we.gapM).toBe(12);
    expect(we.currentHeight, 'dzisiejszy wzrost osobnym polem').toBe(129.5);
    expect(we.currentWeight).toBe(27.6);
    expect(we.measurements, 'historia bez doklejonego punktu dzisiejszego').toEqual(HISTORIA);

    // Globalna bez dzisiejszych wartości — biorą się z pól formularza, nadal osobno.
    qHvSdsPush(linie, { sex: 'M', currentAgeMonths: 116, measurements: HISTORIA });
    const we2 = wejscia[1];
    expect(we2.currentHeight).toBe(129.5);
    expect(we2.measurements).toEqual(HISTORIA);
  });
});

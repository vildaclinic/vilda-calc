import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// GROWTH-PRED-PUB1 — profil pokwitaniowy (przedwczesne / wczesne / po menarche / standardowy) i tempo
// z danych, które lekarz już wpisał. Moduł niczego nie waży — tylko rozpoznaje i nazywa dowody.
// Dane FIKCYJNE.

const win = {};
loadBrowserScript('vilda_puberty_profile.js', win);
const P = win.VildaPubertyProfile;
const ocen = (we) => P.ocenProfil(we);

describe('Kategoria startu i progi', () => {
  it('dziewczęta: < 8 przedwczesne, 8–9 wczesne, ≥ 9 prawidłowe; chłopcy: < 9 / 9–10,5 / ≥ 10,5', () => {
    expect(P.kategoriaStartu('F', 7.9)).toBe('przedwczesne');
    expect(P.kategoriaStartu('F', 8.0)).toBe('wczesne');
    expect(P.kategoriaStartu('F', 8.9)).toBe('wczesne');
    expect(P.kategoriaStartu('F', 9.0)).toBe('prawidlowe');
    expect(P.kategoriaStartu('M', 8.9)).toBe('przedwczesne');
    expect(P.kategoriaStartu('M', 9.0)).toBe('wczesne');
    expect(P.kategoriaStartu('M', 10.4)).toBe('wczesne');
    expect(P.kategoriaStartu('M', 10.5)).toBe('prawidlowe');
    expect(P.kategoriaStartu('F', null)).toBeNull();
    expect(P.PROGI).toMatchObject({ dBAdCASzybkie: 1.2, przyspieszenieMiesSzybkie: 24, tanner23LataSzybkie: 1.3 });
  });
});

describe('Profil', () => {
  it('dziewczynka 7 l, Tanner II, start 6,8 → przedwczesne; dowody nazywają start i próg', () => {
    const r = ocen({ plec: 'F', wiekLat: 7.0, etap: 2, wiekStartuLat: 6.8 });
    expect(r).toMatchObject({ profil: 'przedwczesne', kategoriaStartu: 'przedwczesne', zrodloStartu: 'pole', wiekStartuLat: 6.8 });
    expect(r.dowody.join(' | ')).toContain('start pokwitania w wieku 6,8 l — przedwczesne (próg 8/9 l)');
    expect(r.dowody.join(' | ')).toContain('Tanner II');
    expect(r.etykieta).toBe('przedwczesne pokwitanie (tempo nieznane)');
  });
  it('dziewczynka 8,5 l, Tanner II, start 8,2 → wczesne; chłopiec 9,5 l, jądra 4–6 ml, start 9,2 → wczesne; chłopiec 8 l jądra > 6 ml bez startu → przedwczesne z górnej granicy', () => {
    expect(ocen({ plec: 'F', wiekLat: 8.5, etap: 2, wiekStartuLat: 8.2 })).toMatchObject({ profil: 'wczesne' });
    const boy = ocen({ plec: 'M', wiekLat: 9.5, jadra: '4to6', wiekStartuLat: 9.2 });
    expect(boy).toMatchObject({ profil: 'wczesne' });
    expect(boy.dowody.join(' | ')).toContain('jądra 4–6 ml');
    const boy2 = ocen({ plec: 'M', wiekLat: 8.0, jadra: 'gt6' });
    expect(boy2).toMatchObject({ profil: 'przedwczesne', zrodloStartu: 'gorna-granica', wiekStartuLat: 8 });
    expect(boy2.braki.join(' | ')).toContain('wiek startu pokwitania');
  });
  it('po menarche ma pierwszeństwo; kategoria startu zostaje informacją (menarche 8,75 → start nie później niż 8,75 → wczesne)', () => {
    const r = ocen({ plec: 'F', wiekLat: 8.75, etap: 4, postmenarcheal: true, wiekMenarcheLat: 8.75, wiekKostnyLat: 12 });
    expect(r).toMatchObject({ profil: 'po-menarche', kategoriaStartu: 'wczesne', tempo: 'szybkie' });
    expect(r.etykieta).toBe('po menarche (start wczesne)');
    const r2 = ocen({ plec: 'F', wiekLat: 13, etap: 5, postmenarcheal: true, wiekMenarcheLat: 12.2, wiekStartuLat: 10.5 });
    expect(r2).toMatchObject({ profil: 'po-menarche', kategoriaStartu: 'prawidlowe' });
    expect(r2.etykieta).toBe('po menarche');
  });
  it('bez oznak pokwitania → standardowy (Tanner I / jądra < 4 ml / brak danych z listą braków); start w normie → standardowy', () => {
    expect(ocen({ plec: 'F', wiekLat: 7, etap: 1 })).toMatchObject({ profil: 'standardowy', tempo: 'nieoceniane', etykieta: 'standardowy' });
    expect(ocen({ plec: 'M', wiekLat: 8, jadra: 'lt4' })).toMatchObject({ profil: 'standardowy' });
    const brak = ocen({ plec: 'F', wiekLat: 9 });
    expect(brak).toMatchObject({ profil: 'standardowy' });
    expect(brak.braki.join(' | ')).toContain('brak danych pokwitaniowych');
    expect(ocen({ plec: 'F', wiekLat: 11, etap: 3, wiekStartuLat: 10 })).toMatchObject({ profil: 'standardowy', kategoriaStartu: 'prawidlowe' });
  });
  it('oznaki pokwitania bez wieku startu u dziecka poza progiem → nieznany (karta prosi o wiek startu)', () => {
    const r = ocen({ plec: 'F', wiekLat: 9.5, etap: 3 });
    expect(r).toMatchObject({ profil: 'nieznany', zrodloStartu: 'gorna-granica' });
    expect(r.braki.join(' | ')).toContain('oznaki pokwitania bez wieku startu');
    expect(r.etykieta).toBe('nieokreślony (brak wieku startu pokwitania)');
    expect(ocen({ plec: '', wiekLat: 9 })).toMatchObject({ profil: 'nieznany' });
  });
});

describe('Tempo', () => {
  const base = { plec: 'F', wiekLat: 7.5, etap: 2, wiekStartuLat: 7.0 };
  it('przyspieszenie BA ≥ 24 mies. → szybkie (Léger); < 24 bez historii → wolne z brakiem ΔBA/ΔCA', () => {
    const a = ocen({ ...base, wiekKostnyLat: 9.5 });
    expect(a.tempo).toBe('szybkie');
    expect(a.wskazniki.przyspieszenieMies).toBe(24);
    expect(a.dowody.join(' | ')).toContain('tempo szybkie: wiek kostny wyprzedza metrykalny o 24 mies.');
    const b = ocen({ ...base, wiekKostnyLat: 8.5 });
    expect(b.tempo).toBe('wolne');
    expect(b.braki.join(' | ')).toContain('wiek kostny z poprzedniej wizyty');
  });
  it('ΔBA/ΔCA z historii: 1,6 → szybkie mimo przyspieszenia < 24; 1,0 → wolne; pomiar spoza okna 6–24 mies. ignorowany', () => {
    const fast = ocen({ ...base, wiekKostnyLat: 8.6, historia: [{ ageMonths: 78, boneAgeYears: 7.0 }] }); // 12 mies., ΔBA 1,6
    expect(fast.tempo).toBe('szybkie');
    expect(fast.wskazniki.dBAdCA).toBeCloseTo(1.6, 2);
    expect(fast.dowody.join(' | ')).toContain('ΔBA/ΔCA 1,6 z ostatnich 12 mies.');
    const slow = ocen({ ...base, wiekKostnyLat: 8.5, historia: [{ ageMonths: 78, boneAgeYears: 7.5 }] });
    expect(slow.tempo).toBe('wolne');
    expect(slow.wskazniki.dBAdCA).toBeCloseTo(1.0, 2);
    expect(slow.braki.join(' | ')).not.toContain('wiek kostny z poprzedniej wizyty');
    const poza = ocen({ ...base, wiekKostnyLat: 8.5, historia: [{ ageMonths: 87, boneAgeYears: 7.5 }, { ageMonths: 50, boneAgeYears: 4 }] }); // 3 mies. i 40 mies.
    expect(poza.wskazniki.dBAdCA).toBeNull();
    expect(P.tempoKostne([{ ageMonths: 78, boneAgeYears: 7.0 }, { ageMonths: 84, boneAgeYears: 7.8 }], 90, 8.6)).toMatchObject({ odstepMies: 6, dBAdCA: 1.6 }); // najświeższy w oknie
  });
  it('Tanner 2→3 w < 1,3 roku → szybkie; Tanner II ≥ 1,3 roku → wolne; bez wieku kostnego i bez etapu → nieznane', () => {
    const t3 = ocen({ plec: 'F', wiekLat: 7.9, etap: 3, wiekStartuLat: 7.0 });
    expect(t3.tempo).toBe('szybkie');
    expect(t3.wskazniki.tanner23Lata).toBeCloseTo(0.9, 2);
    expect(t3.dowody.join(' | ')).toContain('Tanner III już 0,9 roku po starcie');
    const t2 = ocen({ plec: 'F', wiekLat: 8.5, etap: 2, wiekStartuLat: 7.0 });
    expect(t2.tempo).toBe('wolne');
    expect(t2.dowody.join(' | ')).toContain('Tanner II utrzymuje się 1,5 roku od startu');
    const nn = ocen({ plec: 'F', wiekLat: 7.5, wiekStartuLat: 7.0, etap: 2 });
    expect(nn.tempo).toBe('nieznane');
    expect(nn.braki.join(' | ')).toContain('wiek kostny (bieżący i z poprzedniej wizyty)');
  });
  it('GnRHa: w trakcie → tempo nieoceniane i etykieta z dopiskiem; zakończone → dowód z wiekiem końca; status spoza słownika ignorowany', () => {
    const r = ocen({ ...base, wiekKostnyLat: 10, gnrha: { status: 'w-trakcie', startLat: 7.2 } });
    expect(r.tempo).toBe('nieoceniane');
    expect(r.gnrha).toMatchObject({ status: 'w-trakcie', wTrakcie: true, poLeczeniu: false, startLat: 7.2 });
    expect(r.etykieta).toBe('przedwczesne pokwitanie (tempo nieoceniane), GnRHa w trakcie');
    const z = ocen({ ...base, wiekLat: 11.5, etap: 3, wiekKostnyLat: 12, gnrha: { status: 'zakonczone', startLat: 7.2, stopLat: 11 } });
    expect(z.gnrha.poLeczeniu).toBe(true);
    expect(z.dowody.join(' | ')).toContain('leczenie GnRHa zakończone w wieku 11 l');
    expect(z.etykieta).toContain(', po GnRHa');
    expect(ocen({ ...base, gnrha: { status: 'cos' } }).gnrha.status).toBe('');
  });
  it('GROWTH-PRED-PUB4: wpisany wiek startu bez etapu Tannera jest oznaką pokwitania (docpro bez pola Tannera, etap przeterminowany)', () => {
    const r = ocen({ plec: 'F', wiekLat: 7.5, wiekStartuLat: 7.0, wiekKostnyLat: 9.5 });
    expect(r).toMatchObject({ profil: 'przedwczesne', zrodloStartu: 'pole', tempo: 'szybkie' });
    expect(r.dowody.join(' | ')).not.toContain('bez oznak pokwitania');
    expect(ocen({ plec: 'M', wiekLat: 9.5, wiekStartuLat: 9.2 })).toMatchObject({ profil: 'wczesne' });
    expect(ocen({ plec: 'F', wiekLat: 11, wiekStartuLat: 10 })).toMatchObject({ profil: 'standardowy', kategoriaStartu: 'prawidlowe' });
  });
  it('GROWTH-PRED-PUB4: leczenie GnRHa oznacza rozpoznane przedwczesne pokwitanie — start nie później niż początek leczenia; Tanner I pod leczeniem nie robi profilu standardowego', () => {
    const r = ocen({ plec: 'F', wiekLat: 8, etap: 1, wiekKostnyLat: 10.5, gnrha: { status: 'w-trakcie', startLat: 7.0 } });
    expect(r).toMatchObject({ profil: 'przedwczesne', zrodloStartu: 'gnrha', wiekStartuLat: 7, tempo: 'nieoceniane' });
    expect(r.etykieta).toBe('przedwczesne pokwitanie (tempo nieoceniane), GnRHa w trakcie');
    expect(r.dowody.join(' | ')).toContain('start pokwitania nie później niż początek leczenia GnRHa (7 l)');
    expect(r.braki.join(' | ')).toContain('profil oparto na początku leczenia GnRHa');
    const bez = ocen({ plec: 'M', wiekLat: 9, wiekKostnyLat: 11, gnrha: { status: 'w-trakcie' } });
    expect(bez).toMatchObject({ profil: 'przedwczesne', kategoriaStartu: 'przedwczesne' });
    expect(bez.dowody.join(' | ')).toContain('leczenie GnRHa — podaje się je tylko w przedwczesnym pokwitaniu');
    // start w polu późniejszy niż początek leczenia — sprzeczność: liczy się początek leczenia
    const sp = ocen({ plec: 'F', wiekLat: 12, etap: 4, wiekStartuLat: 10.5, gnrha: { status: 'zakonczone', startLat: 7.5, stopLat: 10.5 } });
    expect(sp).toMatchObject({ profil: 'przedwczesne', zrodloStartu: 'gnrha', wiekStartuLat: 7.5 });
    expect(sp.braki.join(' | ')).toContain('wiek startu pokwitania (10,5 l) późniejszy niż początek leczenia GnRHa (7,5 l)');
    // po menarche zostaje po menarche
    expect(ocen({ plec: 'F', wiekLat: 14, etap: 5, postmenarcheal: true, wiekMenarcheLat: 11, gnrha: { status: 'zakonczone', startLat: 7.5, stopLat: 10.5 } })).toMatchObject({ profil: 'po-menarche', kategoriaStartu: 'przedwczesne' });
  });
  it('GROWTH-PRED-PUB4: start i menarche z przyszłości są pomijane (bez ujemnego odstępu → bez „tempa szybkiego"); u chłopca menarche i status po menarche ignorowane', () => {
    const r = ocen({ plec: 'F', wiekLat: 7.0, etap: 3, wiekStartuLat: 7.5, wiekKostnyLat: 8.0 });
    expect(r).toMatchObject({ profil: 'przedwczesne', zrodloStartu: 'gorna-granica', tempo: 'wolne' });
    expect(r.wskazniki.tanner23Lata).toBeNull();
    expect(r.braki.join(' | ')).toContain('wiek startu pokwitania (7,5 l) późniejszy niż wiek obecny — pominięty');
    const m = ocen({ plec: 'F', wiekLat: 8, etap: 2, postmenarcheal: true, wiekMenarcheLat: 9 });
    expect(m.profil).not.toBe('po-menarche');
    expect(m.braki.join(' | ')).toContain('wiek menarche (9 l) późniejszy niż wiek obecny — pominięty');
    expect(ocen({ plec: 'M', wiekLat: 9, etap: 2, postmenarcheal: true, wiekMenarcheLat: 8, wiekStartuLat: 8 })).toMatchObject({ profil: 'przedwczesne' });
  });
  it('GROWTH-PRED-PUB4: brzmienie — opóźniony wiek kostny nie „wyprzedza o −24 mies."; „1 rok po starcie"', () => {
    const r = ocen({ plec: 'F', wiekLat: 7, etap: 2, wiekStartuLat: 6.5, wiekKostnyLat: 5 });
    expect(r.dowody.join(' | ')).toContain('wiek kostny opóźniony względem metrykalnego o 24 mies. (< 24)');
    expect(r.dowody.join(' | ')).not.toContain('−24');
    expect(ocen({ plec: 'F', wiekLat: 8, etap: 3, wiekStartuLat: 7.0 }).dowody.join(' | ')).toContain('Tanner III już 1 rok po starcie');
    expect(P.VERSION).toBe('2');
  });
  it('wejście nietknięte', () => {
    const we = { plec: 'F', wiekLat: 7.5, etap: 2, wiekStartuLat: 7.0, historia: [{ ageMonths: 78, boneAgeYears: 7 }], gnrha: { status: 'brak' } };
    const kopia = JSON.parse(JSON.stringify(we));
    ocen(we);
    expect(we).toEqual(kopia);
  });
});

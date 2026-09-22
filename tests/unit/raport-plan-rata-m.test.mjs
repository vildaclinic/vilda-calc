import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-RAPORT rata M (2026-09-22): strażnik źródeł trzech poprawek renderu PDF planu.
//  (1) Ramka strony PDF nie używa znaczników <header>/<footer> — globalne reguły aplikacji dla elementu
//      header (ios26-v2.css, vilda_chrome.css, style.css) wchodziły do hosta PDF: overflow:hidden ucinał
//      ogonki liter tytułu, tło dawało białe pole, position:sticky zależało od szerokości okna.
//  (2) Tekst nagłówka sekcji siedzi w <span>, nie gołym węzłem w kontenerze flex — html2canvas rysuje
//      goły tekst w flexie z letter-spacing od złych pozycji („T WOJAD ROGA”).
//  (3) Zdania: bez „Wyliczone dla diety … Zmiana aktywności zmienia te liczby.”, pozycje planu małą literą,
//      zdanie o ruchu „dojdziesz do celu o X wcześniej”.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

describe('P-RAPORT rata M: ramka PDF, nagłówki sekcji, zdania planu', () => {
  const gen = czytaj('vilda_diet_recommendations.js');
  const plan = czytaj('vilda_raport_plan.js');
  const journey = czytaj('vilda_bmi_journey.js');

  it('ramka strony PDF to div-y z klasami, bez <header>/<footer>', () => {
    expect(gen).toContain('<div class="diet-pdf-header">');
    expect(gen).toContain('<div class="diet-pdf-footer">');
    expect(gen).not.toMatch(/<header[\s>]/);
    expect(gen).not.toMatch(/<footer[\s>]/);
    // tytuł w teal jawnie (decyzja właściciela), bez ciasnego line-height
    expect(gen).toMatch(/\.diet-pdf-header h1 \{[^}]*line-height:1\.15;[^}]*color:#00838d;/);
    expect(gen).toMatch(/\.diet-pdf-header \{[^}]*position:static; overflow:visible; background:none;/);
  });

  it('każdy nagłówek sekcji planu ma tekst w <span>', () => {
    const wszystkie = plan.match(/class="vrp-nag-blok">/g) || [];
    const wSpanie = plan.match(/class="vrp-nag-blok"><span>/g) || [];
    expect(wszystkie.length).toBeGreaterThanOrEqual(5);
    expect(wSpanie.length).toBe(wszystkie.length);
    expect(plan).toMatch(/WERSJA = ([5-9]|\d{2,});/); // rata M wprowadziła 5; kolejne raty podnoszą
  });

  it('bez zdania o diecie/PAL pod kaflami; zdanie o tempie u dzieci zostaje', () => {
    // w kodzie (nie w komentarzu) nie ma już składania tego zdania
    expect(plan).not.toContain("'Wyliczone dla diety '");
    expect(plan).not.toContain("'. Zmiana aktywności zmienia te liczby.'");
    expect(plan).not.toContain('palUzyty');
    expect(plan).toContain('Tempo jest w tym wieku celowo ograniczone, aby nie zaburzyć wzrastania.');
  });

  it('pozycje planu małą literą, zdanie o ruchu po polsku', () => {
    expect(plan).toMatch(/malaLitera\(String\(r\[0\]\)\)/);
    expect(journey).toContain("'Dzięki ruchowi dojdziesz do celu o ' + monthsWord(diff) + ' wcześniej niż na samej diecie.'");
    expect(journey).toContain("'Dzięki ruchowi dojdziesz do celu nieco wcześniej niż na samej diecie.'");
    expect(journey).not.toContain('szybciej niż na samej diecie');
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

// ADV-REPORT-8 (zgłoszenie właściciela 2026-09-13). Ten sam „Raport wzrastania" powstawał
// DWIEMA drogami i tylko jedna była naprawiana przez etapy 1–7:
//   • przycisk „Generuj raport" na karcie wzrostowej → pdfMake, prawdziwy tekst;
//   • przycisk „Raport PDF dla pacjenta" w karcie „Podsumowanie wyników" → własny, RASTROWY
//     wariant w `vilda_patient_report.js`: zdjęcie strony cięte po wysokości arkusza.
// Właściciel wygenerował raport tą drugą drogą i dostał plik, w którym nie da się zaznaczyć
// tekstu, a wiersz tabeli jest przecięty poziomo w połowie.
//
// Dane wyłącznie FIKCYJNE.

describe('Raport wzrastania — jedno źródło dla obu dróg', () => {
  it('karta wzrostowa oddaje gotowy dokument jako blob, nie tylko pobranie', () => {
    const src = zrodlo('vilda_advanced_growth.js');
    expect(src).toMatch(/advGrowthBuildPdfDocumentBlob:/);
    expect(src).toMatch(/advGrowthPrepareReportPayload:/);
  });

  it('przygotowanie raportu jest wspólne — brama świeżości liczona raz, nie dwa razy', () => {
    // Gdyby każda droga liczyła świeżość u siebie, jedna mogłaby wydrukować prognozy,
    // których druga by odmówiła (ADV-REPORT-1).
    const src = zrodlo('vilda_advanced_growth.js');
    const przygotowania = src.match(/let recalculated=!1,fresh=Ap\(\)/g) || [];
    expect(przygotowania.length).toBe(1);
  });

  it('okno wyboru PDF bierze dokument z karty, gdy raport jest jedynym zaznaczonym', () => {
    const src = zrodlo('vilda_patient_report.js');
    expect(src).toMatch(/patientReportBuildAdvancedGrowthVectorPdf/);
    expect(src).toMatch(/wy\.length===1&&wy\[0\]==="growth"/);
    expect(src).toMatch(/advGrowthBuildPdfDocumentBlob/);
  });

  it('ścieżka tekstowa stoi PRZED wymaganiem jsPDF', () => {
    // jsPDF jest potrzebny tylko wariantowi rastrowemu. Gdyby kontrakt na niego stał wyżej,
    // brak tej biblioteki blokowałby raport tekstowy, który jej w ogóle nie używa.
    const src = zrodlo('vilda_patient_report.js');
    const i = src.indexOf('async function patientReportBuildSelectedPdfPackage(');
    const cialo = src.slice(i, i + 2600);
    const wektor = cialo.indexOf('patientReportBuildAdvancedGrowthVectorPdf()');
    const jspdf = cialo.indexOf('patient-report-selected-pdf');
    expect(wektor).toBeGreaterThan(0);
    expect(jspdf).toBeGreaterThan(0);
    expect(wektor).toBeLessThan(jspdf);
  });
});

describe('Wariant rastrowy w pakiecie — cięcie po granicach wierszy', () => {
  const src = zrodlo('vilda_patient_report.js');

  it('krajacz przyjmuje granice bloków i korzysta z planisty karty wzrostowej', () => {
    expect(src).toMatch(/patientReportResolveRasterPagePlanner/);
    expect(src).toMatch(/advGrowthPlanRasterPages/);
    expect(src).toMatch(/Array\.isArray\(i\.boundaries\)/);
  });

  it('zbieracz stron raportu wzrastania te granice podaje', () => {
    const i = src.indexOf('async function patientReportCollectAdvancedGrowthPdfPages(');
    const cialo = src.slice(i, src.indexOf('function patientReportBuildSelectedPdfFilename', i));
    expect(cialo).toMatch(/querySelectorAll\("tr,li"\)/);
    expect(cialo).toMatch(/boundaries:gr/);
  });

  it('bez granic krajacz zachowuje się jak dotąd — inni wołający nie zmieniają zachowania', () => {
    // Stała pętla co wysokość arkusza zostaje jako droga zapasowa.
    expect(src).toMatch(/for\(let c=0;c<e\.height;c\+=o\)/);
  });
});

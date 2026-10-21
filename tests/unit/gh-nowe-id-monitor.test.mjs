import { describe, expect, it } from 'vitest';
import {
  ZEGAR_START, idDawneMonitora, idDeterministyczne, utworzAtrapeMonitoraGh, zrodlo,
} from '../support/gh-monitor-atrapa.mjs';

// P-GH-NOWE-ID-MONITOR (2026-10-21). Monitor punktów terapii GH (gh_therapy_monitor.js) nadaje id nowemu punktowi z karty
// (He) i punktowi wstecznemu (ghAddRetroPoint) przez VildaGhPunkty.noweId() (vilda_gh_punkty.js, P-GH-NOWE-ID), a nie
// własnym String(Date.now() + Math.random()). Wszystkie drogi tworzenia punktu w ramce mają więc jeden licznik: punkty
// z karty i z formularza wstecznego w tej samej milisekundzie dostają różne id. Test idzie na PRAWDZIWYM monitorze
// i PRAWDZIWYM module w atrapie tests/support/gh-monitor-atrapa.mjs, która podaje swój zegar monitorowi i modułowi.
// Kontrola negatywna: kopia monitora z dawnym wzorem (replace) przy stojącym zegarze daje cztery razy to samo id. Przy
// stałym Math.random() atrapy dawny wzór powtarza id w każdej parze z tej samej milisekundy; w przeglądarce średnio raz
// na ok. 4000 par (P-GH-NOWE-ID). Wyniki kliniczne bez zmian. Dane wyłącznie FIKCYJNE.

const KARTA = { drug: 'Omnitrope 10 mg', weight: 32, perDayMg: 0.8, perWeekMg: 5.6 };
const WSTECZNY = {
  ghRetroType: 'continue', ghRetroProg: 'SNP', ghRetroDrug: 'Omnitrope 10 mg', ghRetroAge: '9', ghRetroAgeMonths: '6',
  ghRetroWeight: '32', ghRetroHeight: '133', ghRetroDose: '0.96',
};
// Miejsca nadania id w artefakcie po łatce i dawny wzór (monitor do wersji 59).
const ID_KARTY = 'const u={id:Gpk.noweId(),';
const ID_WSTECZNEGO = 'Gpk.punkt(Gpk.noweId(),Gpw.pola)';
const DAWNE_ID_KARTY = 'const u={id:String(Date.now()+Math.random()),';
const DAWNE_ID_WSTECZNEGO = 'Gpk.punkt(String(Date.now()+Math.random()),Gpw.pola)';

// Cztery nowe punkty na przemian: Włączenie z karty, Kontynuacja wsteczna, Kontynuacja z karty, Kontynuacja wsteczna.
function czteryPunkty(opcje = {}) {
  const atrapa = utworzAtrapeMonitoraGh({ ghTherapyCalc: KARTA, ...opcje });
  atrapa.dodajZKarty('start');
  atrapa.dodajWsteczny(WSTECZNY);
  atrapa.dodajZKarty('continue');
  atrapa.dodajWsteczny({ ...WSTECZNY, ghRetroAge: '10', ghRetroAgeMonths: '0' });
  return atrapa;
}
const idListy = (atrapa) => atrapa.stan().okno.map((p) => p.id);

describe('P-GH-NOWE-ID-MONITOR: monitor GH nadaje id nowym punktom przez VildaGhPunkty.noweId()', () => {
  it('w artefakcie: oba miejsca nadania id wołają Gpk.noweId(), własnego wzoru id nie ma', () => {
    const tekst = zrodlo('gh_therapy_monitor.js');
    expect(tekst.split(ID_KARTY).length - 1).toBe(1);
    expect(tekst.split(ID_WSTECZNEGO).length - 1).toBe(1);
    expect(tekst).not.toContain('Math.random');
    // Jedyne Date.now() w monitorze to wiek wpisu skoku z Karty pacjenta (vilda:gh-jump), nie id punktu.
    expect(tekst.split('Date.now()').length - 1).toBe(1);
    expect(tekst.split('Date.now()-n.ts>6e4').length - 1).toBe(1);
  });

  it('k-ty nowy punkt (z karty albo wsteczny) ma id wydane w tej chwili przez noweId() modułu: idDeterministyczne(k)', () => {
    const atrapa = utworzAtrapeMonitoraGh({ ghTherapyCalc: KARTA });
    const api = atrapa.win.VildaGhPunkty;
    const wydane = [];
    atrapa.win.VildaGhPunkty = { ...api, noweId: () => { const id = api.noweId(); wydane.push(id); return id; } };

    atrapa.dodajZKarty('start');
    expect(wydane).toEqual([idDeterministyczne(0)]);
    atrapa.dodajWsteczny(WSTECZNY);
    atrapa.dodajZKarty('continue');
    atrapa.dodajWsteczny({ ...WSTECZNY, ghRetroAge: '10', ghRetroAgeMonths: '0' });

    expect(wydane).toEqual([0, 1, 2, 3].map(idDeterministyczne));
    expect(idListy(atrapa)).toEqual(wydane);
    expect(atrapa.stan().modul.map((p) => p.id)).toEqual(wydane);
    // Postać z P-GH-NOWE-ID na zegarze atrapy: "<Date.now()>.<trzy cyfry>", start Math.floor(0,25 · 500) = 125.
    expect(ZEGAR_START).toBe(1767225600000);
    expect(wydane[0]).toBe('1767225600000.125');
    expect(wydane[3]).toBe('1767225603000.125');
    expect(atrapa.ostrzezenia).toEqual([]);
  });

  it('zegar stoi: cztery punkty w jednej milisekundzie, z karty i wsteczne na przemian — cztery różne, rosnące id; edycja i usunięcie trafiają w jeden punkt', () => {
    const atrapa = czteryPunkty({ krokZegara: 0 });
    const id = idListy(atrapa);

    expect(id).toEqual(['1767225600000.125', '1767225600000.126', '1767225600000.127', '1767225600000.128']);
    expect(new Set(atrapa.idWierszy())).toEqual(new Set(id));
    expect(atrapa.idWierszy()).toHaveLength(4);
    expect(atrapa.stan().modul.map((p) => p.id)).toEqual(id);

    // Edycja trzeciego punktu (Kontynuacja z karty): zmienia się tylko on.
    const przed = atrapa.stan().okno;
    atrapa.edytuj(id[2], { ghEditHeight: '139' }, 'continue');
    const poEdycji = atrapa.stan().okno;
    expect(poEdycji.map((p) => p.id)).toEqual(id);
    expect(poEdycji[2].height).toBe(139);
    expect([poEdycji[0], poEdycji[1], poEdycji[3]]).toEqual([przed[0], przed[1], przed[3]]);

    // Usunięcie drugiego punktu (Kontynuacja wsteczna) zostawia trzy pozostałe.
    atrapa.usun(id[1]);
    expect(idListy(atrapa)).toEqual([id[0], id[2], id[3]]);
    expect(atrapa.stan().modul.map((p) => p.id)).toEqual([id[0], id[2], id[3]]);
    expect(atrapa.ostrzezenia).toEqual([]);
  });

  it('kontrola negatywna: kopia monitora z dawnym wzorem przy stojącym zegarze — cztery razy to samo id, a usunięcie jednego punktu zabiera wszystkie', () => {
    const tekst = zrodlo('gh_therapy_monitor.js');
    const dawny = tekst.replace(ID_KARTY, () => DAWNE_ID_KARTY).replace(ID_WSTECZNEGO, () => DAWNE_ID_WSTECZNEGO);
    expect(dawny.split('Gpk.noweId()').length - 1).toBe(0);

    const atrapa = czteryPunkty({ krokZegara: 0, zrodla: { 'gh_therapy_monitor.js': dawny } });
    const id = idListy(atrapa);
    expect(id).toEqual(Array(4).fill(idDawneMonitora(0)));
    expect(id[0]).toBe('1767225600000.25');

    atrapa.usun(id[1]);
    expect(atrapa.stan().okno).toEqual([]);
  });
});

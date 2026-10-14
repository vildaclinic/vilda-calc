import { describe, expect, it } from 'vitest';

import { powloka } from '../support/powloka-harness.mjs';

// P-POWLOKA-KARTA-ZAKLADKA (LAB-HISTORIA PR3, plan 3.4): pasek „Poprzednie wyniki” w przeliczniku otwiera
// kartę pacjenta od razu na zakładce „Badania”. Wywołanie bez opcji zostaje dokładnie takie jak dotąd —
// istniejące testy powłoki porównują tablice argumentów showPatientCard i nie są tu zmieniane.
describe('Powłoka: karta pacjenta na wskazanej zakładce', () => {
  it('z {activeTab: "lab"} przekazuje zakładkę do showPatientCard', () => {
    const h = powloka(); h.shell.openPatientCardInStart('fikcyjny-a', { activeTab: 'lab' });
    const f = h.load('start'); h.tick(150);
    expect(f.contentWindow.VildaAuthUI.showPatientCard).toHaveBeenCalledExactlyOnceWith('fikcyjny-a', null, null, { activeTab: 'lab' });
  });

  it('bez opcji albo z pustą zakładką wywołanie jak dotąd: sam identyfikator', () => {
    for (const opcje of [undefined, {}, { activeTab: '' }, { activeTab: 3 }]) {
      const h = powloka(); h.shell.openPatientCardInStart('fikcyjny-a', opcje);
      const f = h.load('start'); h.tick(150);
      expect(f.contentWindow.VildaAuthUI.showPatientCard.mock.calls).toEqual([['fikcyjny-a']]);
    }
  });

  it('nowsza karta bez zakładki unieważnia starsze żądanie z zakładką', () => {
    const h = powloka(); h.shell.openPatientCardInStart('fikcyjny-a', { activeTab: 'lab' });
    h.shell.openPatientCardInStart('fikcyjny-b');
    const f = h.load('start'); h.tick(500);
    expect(f.contentWindow.VildaAuthUI.showPatientCard.mock.calls).toEqual([['fikcyjny-b']]);
  });
});

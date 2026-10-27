import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .find((match) => match[1].includes('var SRC_PR ='))?.[1];

function setup() {
  const scripts = [];
  const window = {
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    updateDietRecommendationsVisibility: vi.fn(), updateProfessionalSummaryCard: vi.fn(),
  };
  const document = {
    head: { appendChild(script) { scripts.push(script); } },
    createElement() {
      const events = {};
      return { addEventListener(type, callback) { events[type] = callback; }, remove: vi.fn(), events };
    },
  };
  vm.runInNewContext(source, { window, document, Promise });
  return { window, scripts, ensure: window.VildaPatientReportLoader.ensure };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('loader dokumentów pacjenta na stronie głównej', () => {
  it('współdzieli żądanie i czeka na dietę przed raportem oraz na gotowość raportu', async () => {
    const { ensure, scripts, window } = setup();
    const pending = ensure();
    expect(ensure()).toBe(pending);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toContain('vilda_diet_recommendations.js?');
    scripts[0].events.load();
    await settle();
    expect(scripts).toHaveLength(2);
    expect(scripts[1].src).toContain('vilda_patient_report.js?');
    expect(window.updateProfessionalSummaryCard).not.toHaveBeenCalled();
    scripts[1].events.load();
    await pending;
    await ensure();
    expect(scripts).toHaveLength(2);
    expect(window.updateDietRecommendationsVisibility).toHaveBeenCalledTimes(1);
    expect(window.updateProfessionalSummaryCard).toHaveBeenCalledTimes(1);
  });

  it('po błędzie raportu pozwala ponowić bez drugiego wczytania zależności', async () => {
    const { ensure, scripts } = setup();
    const pending = ensure();
    const failure = expect(pending).rejects.toThrow('Nie udało się wczytać');
    scripts[0].events.load();
    await settle();
    scripts[1].events.error();
    await failure;
    expect(scripts[1].remove).toHaveBeenCalled();
    const retry = ensure();
    await settle();
    expect(scripts).toHaveLength(3);
    expect(scripts[2].src).toContain('vilda_patient_report.js?');
    scripts[2].events.load();
    await retry;
  });

  it('po błędzie diety ponawia ją i nie uruchamia przedwcześnie raportu', async () => {
    const { ensure, scripts } = setup();
    const pending = ensure();
    const failure = expect(pending).rejects.toThrow('Nie udało się wczytać');
    scripts[0].events.error();
    await failure;
    const retry = ensure();
    expect(scripts).toHaveLength(2);
    expect(scripts[1].src).toContain('vilda_diet_recommendations.js?');
    scripts[1].events.load();
    await settle();
    scripts[2].events.load();
    await retry;
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../lab_pin_result.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('function Lh3ConvertedText('), source.indexOf('function Lh3PinAssessment('));
const converted = new Function(`${body}; return Lh3ConvertedText;`)();

describe('przypięcie — zapis wartości i jednostki widocznych w przeliczniku', () => {
  it.each(['<LOD', '<LOQ', '<0,02', '≤0,02', '>10', '2e-2', '2'])('zachowuje zapis %s bez doklejania jednostki ani zmiany liczby', (raw) => {
    const host = {
      textContent: `${raw}IU/L`,
      querySelector: (selector) => ({ textContent: selector.endsWith('-value') ? raw : 'IU/L' }),
    };
    expect(converted(host)).toBe(`${raw} IU/L`);
  });

  it('zachowuje odczyt starszego widoku bez osobnych elementów wartości i jednostki', () => {
    expect(converted({ textContent: ' 2mIU/mL ', querySelector: () => null })).toBe('2 mIU/mL');
  });
});

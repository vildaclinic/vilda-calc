import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dependencies = [
  'bayley_pinneau_data.js',
  'rwt_data.js',
  'reinehr_cdgp_data.js',
  'advanced_growth_kowd.js',
];

function scripts(page) {
  const html = readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');
  return [...html.matchAll(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>/gi)]
    .map(match => ({ src: match[2], file: match[2].split('?')[0], attrs: match[1] + match[3] }));
}

describe('DocPro height forecast production dependencies', () => {
  it.each(dependencies)('loads the same %s as Start once, deferred before app.js', file => {
    const start = scripts('index.html');
    const docpro = scripts('docpro.html');
    const source = start.filter(script => script.file === file);
    const destination = docpro.filter(script => script.file === file);
    expect(source).toHaveLength(1);
    expect(destination).toHaveLength(1);
    expect(destination[0].src).toBe(source[0].src);

    for (const page of [start, docpro]) {
      const dependency = page.find(script => script.file === file);
      const app = page.filter(script => script.file === 'app.js');
      expect(app).toHaveLength(1);
      for (const script of [dependency, app[0]]) {
        expect(script.attrs).toMatch(/\bdefer\b/);
        expect(script.attrs).not.toMatch(/\basync\b/);
      }
      expect(page.indexOf(dependency)).toBeLessThan(page.indexOf(app[0]));
    }
  });

  it('keeps the prediction tables before their KOWD profile adapter on both pages', () => {
    for (const page of ['index.html', 'docpro.html']) {
      expect(scripts(page).filter(script => dependencies.includes(script.file)).map(script => script.file))
        .toEqual(dependencies);
    }
  });
});

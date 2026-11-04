import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { atrapaDokumentu } from './atrapa-dom-lekka.mjs';

// Runs the actual SGA DOM controller and its reference tables. Only the browser is stubbed.
export function sgaBirthEnvironment() {
  const document = atrapaDokumentu();
  const create = document.createElement.bind(document);
  document.createElement = tag => {
    const element = create(tag);
    element.style = {}; element.dataset = {}; element.value = '';
    return element;
  };
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  document.querySelector = selector => document.documentElement.querySelector(selector);
  for (const id of ['sgaBirthButtonWrapper', 'toggleSgaBirth', 'sgaBirthCard', 'computeSgaBirth', 'resetSgaBirth',
    'sgaBirthMessage', 'sgaBirthResults', 'sgaBirthWeeks', 'sgaBirthDays', 'sgaBirthWeight', 'sgaBirthLength', 'sgaBirthHead']) {
    const element = document.createElement('div'); element.id = id; document.body.appendChild(element);
  }
  const controls = (name, type, values) => values.map(value => {
    const input = document.createElement('input'); input.setAttribute('name', name);
    input.type = type; input.value = value; document.body.appendChild(input); return input;
  });
  const sources = controls('sgaBirthSource', 'checkbox', ['niklasson', 'intergrowth', 'malewski']);
  const sex = controls('sgaBirthSex', 'radio', ['male', 'female']);
  const window = {
    document, addEventListener() {}, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    vildaOnReady: (_key, fn) => fn(), getComputedStyle: () => ({ display: 'block' })
  };
  const context = vm.createContext({ window, document, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: fn => fn() });
  for (const file of ['vilda_birth_assessment.js', 'sga_intergrowth_data.js', 'sga_malewski_data.js', 'sga_birth_module.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  return { window, document, sources, sex, context, api: window.vildaSgaBirthPersistApi };
}

import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { parse } = require('espree');
const source = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest' });

function declarations(node, name, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (node.type === 'FunctionDeclaration' && node.id?.name === name) found.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => declarations(child, name, found));
    else if (value && typeof value === 'object') declarations(value, name, found);
  }
  return found;
}

const [create] = declarations(ast, 'remB22Create');
const generators = declarations(create, 'operationId');
if (generators.length !== 1) throw Error(`Expected one native reminder operationId, found ${generators.length}`);
const generator = source.slice(generators[0].start, generators[0].end);

function productionId(crypto) {
  const random = vi.fn(() => { throw Error('Math.random must not generate reminder identifiers'); });
  const now = vi.fn(() => { throw Error('Date.now must not generate reminder identifiers'); });
  const context = vm.createContext({ i: { crypto }, Math: { random }, Date: { now }, Uint8Array });
  vm.runInContext(generator, context);
  return { run: () => context.operationId(), random, now };
}

describe('native reminder secure identifier generator', () => {
  it('preserves the browser randomUUID result and receiver without using the fallback', () => {
    const crypto = {
      randomUUID: vi.fn(function () { expect(this).toBe(crypto); return '5b363b35-9a54-4b7d-ae7e-8379f36275c9'; }),
      getRandomValues: vi.fn(() => { throw Error('Fallback must not run'); }),
    };
    const native = productionId(crypto);
    expect(native.run()).toBe('5b363b35-9a54-4b7d-ae7e-8379f36275c9');
    expect(crypto.randomUUID).toHaveBeenCalledOnce();
    expect(crypto.getRandomValues).not.toHaveBeenCalled();
    expect(native.random).not.toHaveBeenCalled(); expect(native.now).not.toHaveBeenCalled();
  });

  it('uses exactly 128 WebCrypto bits and sets UUID v4 version and variant bits', () => {
    const crypto = { getRandomValues: vi.fn(function (bytes) {
      expect(this).toBe(crypto); expect(bytes).toBeInstanceOf(Uint8Array); expect(bytes.byteLength).toBe(16);
      bytes.set(Array.from({ length: 16 }, (_, index) => index)); return bytes;
    }) };
    const native = productionId(crypto);
    expect(native.run()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(crypto.getRandomValues).toHaveBeenCalledOnce();
    expect(native.random).not.toHaveBeenCalled(); expect(native.now).not.toHaveBeenCalled();
  });

  it('fails closed when WebCrypto is absent or its secure random source fails', () => {
    for (const crypto of [undefined, {}, { getRandomValues() { throw Error('Fictional secure random failure'); } }]) {
      const native = productionId(crypto);
      expect(native.run).toThrow();
      expect(native.random).not.toHaveBeenCalled(); expect(native.now).not.toHaveBeenCalled();
    }
  });
});

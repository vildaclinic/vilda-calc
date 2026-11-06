import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { changedResources, upgradeResourceInventories } from '../support/pwa-changed-resource-inventory.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
let directory, baselineTree, currentTree;
function write(tree, name, value) { fs.writeFileSync(path.join(tree, name), value); }
function inventory(patch = {}) {
  return upgradeResourceInventories({ baselineTree, currentTree, names: ['old.js', 'new.js'], addedNames: ['new.js'], ...patch });
}
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-resource-inventory-test-'));
  baselineTree = path.join(directory, 'baseline'); currentTree = path.join(directory, 'current');
  fs.mkdirSync(baselineTree); fs.mkdirSync(currentTree);
  write(baselineTree, 'service-worker-kalorii.js', "const cached = ['/old.js?v=1'];");
  write(currentTree, 'service-worker-kalorii.js', "const cached = ['/old.js?v=1', '/old.js?v=2', '/new.js?v=1'];");
  write(baselineTree, 'old.js', 'previous production bytes');
  write(currentTree, 'old.js', 'reviewed current bytes');
  write(currentTree, 'new.js', 'newly introduced production bytes');
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

describe('PWA upgrade inventory — changed existing files and genuine additions', () => {
  it('keeps every existing old hash and every current hash while recording actual additions separately', () => {
    const result = inventory();
    expect(result.oldResources).toEqual([{ url: '/old.js?v=1', sha256: hash('previous production bytes'), precached: true }]);
    expect(result.newResources).toEqual([
      { url: '/old.js?v=2', sha256: hash('reviewed current bytes'), precached: true },
      { url: '/new.js?v=1', sha256: hash('newly introduced production bytes'), precached: true },
    ]);
    expect(result.introducedResources).toEqual([{ name: 'new.js', existedInBaseline: false, gitAdded: true, current: result.newResources[1] }]);
    expect(fs.existsSync(path.join(baselineTree, 'new.js'))).toBe(false);
  });

  it('does not silently skip an archived missing file without independent Git Added provenance', () => {
    expect(() => inventory({ addedNames: [] })).toThrow('Missing archived production asset is not a Git addition: new.js');
  });

  it('rejects Added provenance that conflicts with an actual archived source file', () => {
    expect(() => inventory({ addedNames: ['old.js', 'new.js'] })).toThrow('Git Added status conflicts with archived production file: old.js');
  });

  it('requires every new current asset to have a real current precache entry', () => {
    write(currentTree, 'service-worker-kalorii.js', "const cached = ['/old.js?v=2'];");
    expect(() => inventory()).toThrow('Changed production asset is missing from precache: new.js');
  });

  it('requires every existing archived asset to retain its actual old precache check', () => {
    write(baselineTree, 'service-worker-kalorii.js', 'const cached = [];');
    expect(() => inventory()).toThrow('Changed production asset is missing from precache: old.js');
  });

  it('rejects a supposedly absent new asset already referenced by the archived worker', () => {
    write(baselineTree, 'service-worker-kalorii.js', "const cached = ['/old.js?v=1', '/new.js?v=1'];");
    expect(() => inventory()).toThrow('New production asset unexpectedly has an archived precache reference: new.js');
  });

  it('does not permit a removed current source file to disappear from the full inventory', () => {
    fs.unlinkSync(path.join(currentTree, 'new.js'));
    expect(() => inventory()).toThrow(/ENOENT.*new\.js/);
  });

  it('preserves explicitly documented non-precache documents with both source hashes', () => {
    write(baselineTree, 'policy.html', 'old legal document'); write(currentTree, 'policy.html', 'current legal document');
    const result = inventory({ names: ['old.js', 'new.js', 'policy.html'], nonPrecacheDocuments: ['policy.html'] });
    expect(result.oldResources.at(-1)).toEqual({ url: '/policy.html', sha256: hash('old legal document'), precached: false });
    expect(result.newResources.at(-1)).toEqual({ url: '/policy.html', sha256: hash('current legal document'), precached: false });
  });

  it('rejects duplicate paths instead of collapsing the number of assets under review', () => {
    expect(() => inventory({ names: ['old.js', 'new.js', 'new.js'] })).toThrow('Changed asset inventory contains duplicate paths');
  });

  it('continues to use the exact highest numeric current key for an unchanged path', () => {
    write(currentTree, 'service-worker-kalorii.js', "const cached = ['/old.js?v=10', '/old.js', '/old.js?v=2'];");
    expect(changedResources(currentTree, ['old.js'])).toEqual([{ url: '/old.js?v=10', sha256: hash('reviewed current bytes'), precached: true }]);
  });
});

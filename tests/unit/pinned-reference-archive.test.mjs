import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { readPinnedReferenceArchive } from '../scripts/pinned-reference-archive.mjs';

const path = 'tools/icd10-pl-source/source.xml.gz';
const original = () => readFileSync(new URL('../../' + path, import.meta.url));

describe('repository policy: pinned public primary source archive', () => {
  it('returns the complete verified XML for the existing secret/PESEL content scan', () => {
    const text = readPinnedReferenceArchive(path, original);
    expect(Buffer.byteLength(text)).toBe(12713248);
    expect(text).toContain('Cukrzyca insulinozależna');
    expect(text).toContain('Zespół Downa');
    expect(text.trimEnd().endsWith('</hcd>')).toBe(true);
  });
  it('never exempts any other archive, alias, traversal or extension', () => {
    const read = vi.fn();
    for (const other of ['source.xml.gz', './' + path, '../' + path,
      'tools/icd10-pl-source/backup.gz', path + '.bak', path.toUpperCase(), path.replaceAll('/', '\\'), 'backup/source.xml.gz'])
      expect(readPinnedReferenceArchive(other, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it('rejects both changed size and changed bytes before decompression or exemption', () => {
    const valid = original();
    for (const bad of [valid.subarray(0, valid.length - 1), Buffer.concat([valid, Buffer.from('x')]), Buffer.alloc(valid.length)])
      expect(() => readPinnedReferenceArchive(path, () => bad)).toThrow('zmienione przypięte archiwum');
    const changed = Buffer.from(valid); changed[changed.length - 20] ^= 1;
    expect(() => readPinnedReferenceArchive(path, () => changed)).toThrow('zmienione przypięte archiwum');
  });
  it('runs the actual policy without letting a literal-backslash archive impersonate the pinned file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'vilda-reference-policy-'));
    const policy = fileURLToPath(new URL('../scripts/check-repository-policy.mjs', import.meta.url));
    const run = (command, args) => execFileSync(command, args, { cwd: directory, encoding: 'utf8', stdio: 'pipe' });
    try {
      run('git', ['init', '-q']); mkdirSync(join(directory, 'tools/icd10-pl-source'), { recursive: true });
      writeFileSync(join(directory, path), original()); run('git', ['add', '--', path]);
      expect(run(process.execPath, [policy])).toContain('sprawdzono 1 plików');
      const alias = path.replaceAll('/', '\\'); writeFileSync(join(directory, alias), 'Fikcyjny niedozwolony plik QA');
      run('git', ['add', '--', alias]);
      let failure;
      try { run(process.execPath, [policy]); } catch (error) { failure = error; }
      expect(failure?.status).toBe(1);
      expect(failure.stderr).toContain(alias + ': lokalna kopia lub archiwum');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

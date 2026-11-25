import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative));
const json = relative => JSON.parse(read(relative).toString('utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const baseCode = value => value.replace(/[†*]$/, '');
const window = loadBrowserScript('vilda_icd10_pl_data.js', {});
const catalogue = window.VildaICD10PLData;
const manifest = json('runtime/icd10-pl-v1/manifest.json');
const byBase = new Map(catalogue.entries.map(row => [baseCode(row[0]), row]));
const generate = (...args) => execFileSync('python3', ['tools/build-icd10-pl.py', ...args], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
  // A proxy which refuses connections makes accidental network dependence fail.
  env: { ...process.env, HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1' },
  encoding: 'utf8',
});

describe('pełny produkcyjny katalog ICD-10 PL — przypięte źródło CeZ', () => {
  it('ładuje 12 010 posortowanych trójek z datą wydania i jawną licencją', () => {
    expect(catalogue.metadata).toEqual(manifest.metadata);
    expect(catalogue.metadata).toMatchObject({
      id: 'cez-icd10-pl-2021-03-31-v1',
      editionDate: '2021-03-31',
      sourceUrl: 'https://dane.gov.pl/pl/dataset/27/resource/55725',
      publisher: 'Centrum e-Zdrowia',
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      historicalSnapshot: true,
      entryCount: 12010,
    });
    expect(catalogue.entries).toHaveLength(12010);
    expect(byBase.size).toBe(12010);
    expect(catalogue.entries.every(row => Array.isArray(row) && row.length === 3
      && typeof row[0] === 'string' && /^[A-Z][0-9]{2}(?:\.[0-9])?[†*]?$/.test(row[0])
      && typeof row[1] === 'string' && row[1].length > 0
      && (row[2] === null || /^[A-Z][0-9]{2}$/.test(row[2])))).toBe(true);
    const codes = catalogue.entries.map(row => row[0]);
    expect(codes).toEqual([...codes].sort());
    expect(catalogue.entries.filter(row => row[2] === null)).toHaveLength(2050);
    expect(catalogue.entries.filter(row => row[2] !== null)).toHaveLength(9960);
  });

  it('zachowuje klasyfikacyjne †/* i rozwiązuje względne końcówki bez utraty kategorii', () => {
    expect(catalogue.entries.filter(row => row[0].endsWith('†'))).toHaveLength(79);
    expect(catalogue.entries.filter(row => row[0].endsWith('*'))).toHaveLength(371);
    expect(byBase.get('E10')).toEqual(['E10', 'Cukrzyca insulinozależna', null]);
    expect(byBase.get('E10.2')).toEqual(['E10.2†', 'Z powikłaniami nerkowymi', 'E10']);
    expect(byBase.get('F10.0')).toEqual(['F10.0', 'Ostre zatrucie', 'F10']);
    expect(byBase.get('F00')[0]).toBe('F00*');
    expect(byBase.get('F00.0')[2]).toBe('F00');
    expect(catalogue.entries.every(([code, , parent]) => {
      if (parent === null) return baseCode(code).length === 3;
      const category = byBase.get(parent);
      return parent === baseCode(code).slice(0, 3) && category?.[2] === null;
    })).toBe(true);
    expect(manifest.counts).toMatchObject({ relativeCodeNodesResolved: 989, supplementalNodes: 565 });
  });

  it('bierze głębszą kategorię zamiast sześciu powtórzonych nagłówków i nie przycina nazw', () => {
    expect(manifest.removedDuplicateOuterBlocks).toEqual(['B99', 'C50', 'C97', 'F99', 'N99', 'T79']);
    expect(byBase.get('B99')[1]).toBe('Inne i nieokreślone choroby zakaźne');
    expect(byBase.get('F99')[1]).toBe('Zaburzenie psychiczne nieokreślone inaczej');
    expect(byBase.get('N99')[1]).toBe('Pozabiegowe choroby układu moczowo-płciowego, niesklasyfikowane gdzie indziej');
    expect(byBase.get('T79')[1]).toBe('Określone wczesne powikłania urazu, niesklasyfikowane gdzie indziej');
    expect(byBase.get('I10')).toEqual(['I10', 'Nadciśnienie samoistne (pierwotne)', null]);
    expect(byBase.get('F32.1')).toEqual(['F32.1', 'Epizod depresji umiarkowany', 'F32']);
    expect(byBase.get('U07.1')[1]).toBe('COVID-19, wirus zidentyfikowany');
    expect(byBase.get('Y11')[1].length).toBe(180);
    expect(Math.max(...catalogue.entries.map(row => row[1].length))).toBe(180);
    // Preserve this snapshot's source anomaly instead of inventing a correction.
    expect(byBase.get('B96')[1]).toBe('Other bacterial agents as the cause of diseases classified to other chapters');
    expect(Object.keys(catalogue)).toEqual(['metadata', 'entries']);
  });

  it('wiąże artefakt z kompletnym XML, zerowym mtime archiwum i pierwotnymi warunkami wydawcy', () => {
    const compressed = read(manifest.sourceArchive.path);
    const xml = gunzipSync(compressed);
    expect(compressed.length).toBe(606817);
    expect(compressed.readUInt32LE(4)).toBe(0);
    expect(sha256(compressed)).toBe(manifest.sourceArchive.sha256);
    expect(xml.length).toBe(12713248);
    expect(sha256(xml)).toBe('88a0c4ed4e4987d3cdc57f0a534a6c80506d757f197c39c1c22fa3a1ebdba099');
    const artifact = read(manifest.artifact.path);
    expect(artifact.length).toBe(manifest.artifact.bytes);
    expect(sha256(artifact)).toBe(manifest.artifact.sha256);
    expect(manifest.counts).toMatchObject({
      treeNodes: 23975, uncodedNodes: 11104, rangeNodes: 290,
      absoluteCodeNodes: 11027, relativeCodeNodesResolved: 989, supplementalNodes: 565,
    });
    for (const evidence of manifest.licenseEvidence) {
      const original = read(evidence.path);
      expect(original.length).toBe(evidence.bytes);
      expect(sha256(original)).toBe(evidence.sha256);
    }
    const terms = json('tools/icd10-pl-source/dataset27.json').data.attributes;
    expect(terms).toMatchObject({ license_name: 'CC BY 4.0', license_condition_default_cc40: true, license_condition_timestamp: true });
    const resource = json('tools/icd10-pl-source/resource55725.json').data;
    expect(resource.id).toBe('55725');
    expect(resource.attributes.data_date).toBe('2021-03-31');
    expect(resource.relationships.dataset.data.id).toBe('27');
  });

  it('odtwarza produkcyjny JS i manifest bajt w bajt z pełnego źródła bez sieci', () => {
    expect(JSON.parse(generate('--check')).entries).toBe(12010);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-icd10-pl-'));
    try {
      generate('--output-root', temporary);
      for (const relative of ['vilda_icd10_pl_data.js', 'runtime/icd10-pl-v1/manifest.json']) {
        expect(fs.readFileSync(path.join(temporary, relative)).equals(read(relative))).toBe(true);
      }
      generate('--output-root', temporary, '--check');
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
});

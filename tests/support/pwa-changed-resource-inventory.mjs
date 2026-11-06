import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function referencesFor(source, name) {
  return [...source.matchAll(/['"]([^'"\s]+\.(?:js|css|html)(?:\?v=\d+)?)['"]/gu)]
    .map(match => match[1]).filter(url => url.split('?')[0] === '/' + name);
}

export function changedResources(tree, names, nonPrecacheDocuments = []) {
  const source = fs.readFileSync(path.join(tree, 'service-worker-kalorii.js'), 'utf8');
  return names.map(name => {
    const references = referencesFor(source, name);
    // Historical URLs stay append-only. Hash the highest current numeric key.
    references.sort((left, right) => Number(new URL(left, 'http://fixture').searchParams.get('v') || 0)
      - Number(new URL(right, 'http://fixture').searchParams.get('v') || 0));
    const cachedUrl = references.at(-1);
    if (!cachedUrl && !nonPrecacheDocuments.includes(name)) throw new Error('Changed production asset is missing from precache: ' + name);
    return { url: cachedUrl || '/' + name, sha256: sha256(fs.readFileSync(path.join(tree, name))), precached: Boolean(cachedUrl) };
  });
}

// The old deployment must cover every changed file that actually existed then.
// A current addition may be absent only when the archived tree and Git's Added
// status independently agree. It still receives the full current cache/hash check.
export function upgradeResourceInventories({ baselineTree, currentTree, names, addedNames, nonPrecacheDocuments = [] }) {
  if (new Set(names).size !== names.length) throw new Error('Changed asset inventory contains duplicate paths');
  const additions = new Set(addedNames);
  const previousNames = [], introducedNames = [];
  const previousWorker = fs.readFileSync(path.join(baselineTree, 'service-worker-kalorii.js'), 'utf8');
  for (const name of names) {
    const existed = fs.existsSync(path.join(baselineTree, name));
    if (existed && additions.has(name)) throw new Error('Git Added status conflicts with archived production file: ' + name);
    if (existed) { previousNames.push(name); continue; }
    if (!additions.has(name)) throw new Error('Missing archived production asset is not a Git addition: ' + name);
    if (referencesFor(previousWorker, name).length) throw new Error('New production asset unexpectedly has an archived precache reference: ' + name);
    introducedNames.push(name);
  }
  const oldResources = changedResources(baselineTree, previousNames, nonPrecacheDocuments);
  const newResources = changedResources(currentTree, names, nonPrecacheDocuments);
  const introducedResources = introducedNames.map(name => ({
    name, existedInBaseline: false, gitAdded: true,
    current: newResources[names.indexOf(name)],
  }));
  return { oldResources, newResources, introducedResources };
}

// Prepare bounded Git proof before offline version checks. Never imports URLs
// from the candidate itself or changes a working-tree file.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPublishedPrecachePin, verifyPublishedPrecacheHistory } from '../support/podbij-wersje.mjs';

const DEEPEN_STEPS = [2, 4, 8, 16];
function git(katalog, args) {
  return execFileSync('git', args, { cwd: katalog, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 }).trim();
}

export function preparePublishedPrecacheHistory({ katalog = process.cwd() } = {}) {
  const pin = readPublishedPrecachePin({ katalog });
  if (!pin) return null;
  const head = git(katalog, ['rev-parse', '--verify', 'HEAD^{commit}']);
  let fetchedSource = false, fetchedPublication = false, publishedHead = null;
  let candidateRound = 0, publicationRound = 0;
  for (;;) {
    try { return verifyPublishedPrecacheHistory({ katalog }); }
    catch (error) {
      if (error.code === 'PUBLISHED_HISTORY_MISSING_COMMIT' && !fetchedSource) {
        fetchedSource = true;
        git(katalog, ['fetch', '--no-tags', '--depth=1', 'origin', pin.commit]);
        continue;
      }
      if (error.code === 'PUBLISHED_HISTORY_PUBLICATION' && !fetchedPublication) {
        fetchedPublication = true;
        git(katalog, ['fetch', '--no-tags', '--depth=2', 'origin', '+refs/heads/audyt:refs/remotes/origin/audyt']);
        publishedHead = git(katalog, ['rev-parse', '--verify', 'refs/remotes/origin/audyt^{commit}']);
        continue;
      }
      if (!['PUBLISHED_HISTORY_CANDIDATE', 'PUBLISHED_HISTORY_PUBLICATION'].includes(error.code)) throw error;
      if (git(katalog, ['rev-parse', '--is-shallow-repository']) !== 'true') throw error;
      const candidate = error.code === 'PUBLISHED_HISTORY_CANDIDATE';
      const round = candidate ? candidateRound++ : publicationRound++;
      if (round >= DEEPEN_STEPS.length) {
        throw new Error(`opublikowana historia precache: nie udowodniono pochodzenia ${pin.commit} po ograniczonym pogłębieniu historii; ${error.message}`);
      }
      // Fetch exactly the already selected candidate/publication tip. A moving
      // branch cannot replace the commit whose ancestry is being proved.
      git(katalog, ['fetch', '--no-tags', `--deepen=${DEEPEN_STEPS[round]}`, 'origin', candidate ? head : publishedHead]);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('prepare-published-precache-history nie przyjmuje opcji.');
    const history = preparePublishedPrecacheHistory();
    console.log(history ? `Opublikowana historia precache zweryfikowana: ${history.commit}.` : 'Brak dodatkowego pinu opublikowanej historii precache.');
  } catch (error) {
    console.error(`prepare-published-precache-history: ${error.message}`);
    process.exitCode = 2;
  }
}

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname, posix } from 'node:path';

const repositoryFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  },
)
  .split('\0')
  .filter(Boolean)
  .map((file) => file.replaceAll('\\', '/'));

// Plik istniał w publicznym repozytorium przed wprowadzeniem tej polityki.
// Wyjątek nie zezwala na dodawanie kolejnych kopii *.bak.
const legacyPathAllowlist = new Set(['lab_units_data.js.bak']);

const forbiddenPathRules = [
  {
    label: 'eksport danych .wiw',
    matches: (file) => /\.wiw$/i.test(file),
  },
  {
    label: 'plik środowiskowy lub dane lokalne Workera',
    matches: (file) => {
      const name = posix.basename(file).toLowerCase();
      return (
        ((name === '.env' || name.startsWith('.env.')) && name !== '.env.example') ||
        ((name === '.dev.vars' || name.startsWith('.dev.vars.')) &&
          name !== '.dev.vars.example') ||
        (name === '.npmrc' && name !== '.npmrc.example') ||
        file.split('/').includes('.wrangler') ||
        file.split('/').includes('.cache')
      );
    },
  },
  {
    label: 'lokalna baza danych',
    matches: (file) => /\.(?:sqlite3?|db|sql|dump)$/i.test(file),
  },
  {
    label: 'klucz lub certyfikat prywatny',
    matches: (file) => /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(file),
  },
  {
    label: 'lokalna kopia lub archiwum',
    matches: (file) =>
      /\.(?:bak|backup|old|tmp|swp|zip|7z|rar|tar|tar\.gz|tgz|gz)$/i.test(file) ||
      /~$/.test(file),
  },
  {
    label: 'katalog zależności lub eksportów',
    matches: (file) =>
      file.split('/').some((part) =>
        ['node_modules', 'backup', 'backups', 'exports', 'patient-data', 'dane-pacjentow'].includes(
          part.toLowerCase(),
        ),
      ),
  },
  {
    label: 'metadane systemowe',
    matches: (file) => {
      const parts = file.split('/');
      const name = parts.at(-1) || '';
      return (
        name === '.DS_Store' ||
        name === 'Thumbs.db' ||
        name === 'Desktop.ini' ||
        name === '.AppleDouble' ||
        name.startsWith('._') ||
        name.startsWith('~$') ||
        parts.includes('__MACOSX')
      );
    },
  },
  {
    label: 'backup lub eksport danych w pliku użytkowym',
    matches: (file) =>
      /(?:backup|kopia|export|pacjent|patient)/i.test(posix.basename(file)) &&
      /\.(?:json|csv|xlsx?|wiw|zip|db)$/i.test(file),
  },
];

const textExtensions = new Set([
  '.cjs',
  '.conf',
  '.css',
  '.html',
  '.ini',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sh',
  '.toml',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

const secretRules = [
  ['nagłówek klucza prywatnego', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ['token GitHub', /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,})/],
  ['klucz AWS', /AKIA[0-9A-Z]{16}/],
  ['token Slack', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['sekretny klucz Stripe', /sk_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['klucz OpenAI', /(?<![A-Za-z0-9_-])sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/],
  ['klucz Google API', /AIza[0-9A-Za-z_-]{30,}/],
  ['token SendGrid', /SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/],
  ['token npm', /\/\/[\w.-]+\/?:_authToken\s*=\s*(?!\$\{)[A-Za-z0-9_-]{16,}/],
];

const violations = [];

function hasValidPesel(content) {
  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const candidates = content.match(/(?<!\d)\d{11}(?!\d)/g) || [];

  return candidates.some((candidate) => {
    const sum = weights.reduce(
      (total, weight, index) => total + weight * Number(candidate[index]),
      0,
    );
    return (10 - (sum % 10)) % 10 === Number(candidate[10]);
  });
}

for (const file of repositoryFiles) {
  if (!legacyPathAllowlist.has(file)) {
    for (const rule of forbiddenPathRules) {
      if (rule.matches(file)) {
        violations.push(`${file}: ${rule.label}`);
        break;
      }
    }
  }

  if (!textExtensions.has(extname(file).toLowerCase())) continue;

  let size;
  try {
    size = statSync(file).size;
  } catch {
    violations.push(`${file}: nie można odczytać śledzonego pliku`);
    continue;
  }

  // Duży plik tekstowy nie może po cichu ominąć skanu treści.
  if (size > 8 * 1024 * 1024) {
    violations.push(`${file}: plik tekstowy przekracza limit skanu 8 MiB`);
    continue;
  }

  const content = readFileSync(file, 'utf8');
  if (hasValidPesel(content)) violations.push(`${file}: wykryto numer o poprawnej sumie PESEL`);
  for (const [label, pattern] of secretRules) {
    if (pattern.test(content)) violations.push(`${file}: wykryto ${label}`);
  }
}

if (violations.length) {
  console.error('Kontrola polityki repozytorium nie powiodła się:');
  for (const violation of violations) console.error(`- ${violation}`);
  console.error('\nNie commituj danych pacjentów ani sekretów. Zobacz docs/DATA_PROTECTION.md.');
  process.exit(1);
}

console.log(`Polityka repozytorium: sprawdzono ${repositoryFiles.length} plików.`);

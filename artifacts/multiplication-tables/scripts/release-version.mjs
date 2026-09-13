import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const artifactDirectory = path.resolve(scriptDirectory, '..');
const workspaceDirectory = path.resolve(artifactDirectory, '../..');
const packagePath = path.join(artifactDirectory, 'package.json');
const appMetaPath = path.join(artifactDirectory, 'src/app-meta.ts');
const indexPath = path.join(artifactDirectory, 'index.html');
const projectNotesPath = path.join(workspaceDirectory, 'replit.md');

const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
const currentVersion = packageJson.version;

function incrementPatch(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Unsupported version format: ${version}`);

  let [, major, minor, patch] = match.map(Number);
  if (patch < 9) {
    patch += 1;
  } else if (minor < 9) {
    minor += 1;
    patch = 0;
  } else {
    major += 1;
    minor = 0;
    patch = 0;
  }
  return `${major}.${minor}.${patch}`;
}

function releaseDate() {
  const now = new Date();
  return {
    iso: now.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(now),
    at: now.toISOString(),
  };
}

function replaceExactly(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`Could not find ${label}`);
  return text.replace(pattern, replacement);
}

function normalizeDate(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString().slice(0, 10);
}

async function checkVersion(version = currentVersion) {
  const [appMeta, index, projectNotes] = await Promise.all([
    fs.readFile(appMetaPath, 'utf8'),
    fs.readFile(indexPath, 'utf8'),
    fs.readFile(projectNotesPath, 'utf8'),
  ]);
  const expected = [
    [`package.json version`, packageJson.version, version],
    [`app metadata version`, appMeta.match(/APP_VERSION = "v([^"]+)"/)?.[1], version],
    [`HTML application version`, index.match(/application-version" content="([^"]+)"/)?.[1], version],
    [`project notes version`, projectNotes.match(/Current app version: `v([^`]+)`/)?.[1], version],
  ];
  const mismatches = expected.filter(([, actual, wanted]) => actual !== wanted);
  if (mismatches.length > 0) {
    throw new Error(mismatches.map(([label, actual, wanted]) => `${label}: expected ${wanted}, found ${actual ?? 'missing'}`).join('\n'));
  }

  const appPublishDate = appMeta.match(/PUBLISH_DATE = "([^"]+)"/)?.[1];
  const htmlPublishDate = index.match(/publish-date" content="([^"]+)"/)?.[1];
  const notesPublishDate = projectNotes.match(/Publish date: ([^\n]+)/)?.[1];
  const expectedDate = normalizeDate(appPublishDate ?? '');
  const expectedDates = [
    [`app metadata publish date`, appPublishDate, expectedDate],
    [`HTML publish date`, htmlPublishDate, expectedDate],
    [`project notes publish date`, notesPublishDate, expectedDate],
  ];
  const dateMismatches = expectedDates.filter(([, actual]) => normalizeDate(actual ?? '') !== expectedDate);
  if (dateMismatches.length > 0) {
    throw new Error(dateMismatches.map(([label, actual, wanted]) => `${label}: expected ${wanted}, found ${actual ?? 'missing'}`).join('\n'));
  }

  const appPublishAt = appMeta.match(/PUBLISH_AT = "([^"]+)"/)?.[1];
  const htmlPublishAt = index.match(/publish-at" content="([^"]+)"/)?.[1];
  const notesPublishAt = projectNotes.match(/Publish at: ([^\n]+)/)?.[1];
  const expectedPublishAt = appPublishAt ?? '';
  const publishAtMismatches = [
    [`app metadata publish timestamp`, appPublishAt, expectedPublishAt],
    [`HTML publish timestamp`, htmlPublishAt, expectedPublishAt],
    [`project notes publish timestamp`, notesPublishAt, expectedPublishAt],
  ].filter(([, actual]) => actual !== expectedPublishAt);
  if (publishAtMismatches.length > 0) {
    throw new Error(publishAtMismatches.map(([label, actual, wanted]) => `${label}: expected ${wanted}, found ${actual ?? 'missing'}`).join('\n'));
  }
}

const mode = process.argv[2] ?? 'check';
if (mode === 'check') {
  await checkVersion();
  console.log(`Version metadata is synchronized at v${currentVersion}.`);
} else if (mode === 'patch') {
  const nextVersion = incrementPatch(currentVersion);
  const { iso, label, at } = releaseDate();
  packageJson.version = nextVersion;

  const [appMeta, index, projectNotes] = await Promise.all([
    fs.readFile(appMetaPath, 'utf8'),
    fs.readFile(indexPath, 'utf8'),
    fs.readFile(projectNotesPath, 'utf8'),
  ]);

  await Promise.all([
    fs.writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`),
    fs.writeFile(appMetaPath, replaceExactly(
      replaceExactly(
        replaceExactly(appMeta, /APP_VERSION = "v[^"]+"/, `APP_VERSION = "v${nextVersion}"`, 'app version'),
        /PUBLISH_DATE = "[^"]+"/,
        `PUBLISH_DATE = "${label}"`,
        'app publish date',
      ),
      /PUBLISH_AT = "[^"]+"/,
      `PUBLISH_AT = "${at}"`,
      'app publish timestamp',
    )),
    fs.writeFile(indexPath, replaceExactly(
      replaceExactly(
        replaceExactly(index, /application-version" content="[^"]+"/, `application-version" content="${nextVersion}"`, 'HTML version'),
        /publish-date" content="[^"]+"/,
        `publish-date" content="${iso}"`,
        'HTML publish date',
      ),
      /publish-at" content="[^"]+"/,
      `publish-at" content="${at}"`,
      'HTML publish timestamp',
    )),
    fs.writeFile(projectNotesPath, replaceExactly(
      replaceExactly(
        replaceExactly(projectNotes, /Current app version: `v[^`]+`/, `Current app version: \`v${nextVersion}\``, 'project version'),
        /Publish date: [^\n]+/,
        `Publish date: ${label}`,
        'project publish date',
      ),
      /Publish at: [^\n]+/,
      `Publish at: ${at}`,
      'project publish timestamp',
    )),
  ]);

  await checkVersion(nextVersion);
  console.log(`Released v${nextVersion} (${label}).`);
} else {
  throw new Error(`Unknown mode "${mode}". Use "patch" or "check".`);
}
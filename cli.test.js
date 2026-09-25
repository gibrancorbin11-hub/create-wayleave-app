/**
 * The cases that cost someone their work, plus the promise every template
 * makes: it runs with no configuration.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateName, resolveTarget, directoryIsUsable, buildFiles, scaffold } from './index.js';
import { TEMPLATES, byId } from './templates.js';

const tmp = () => mkdtemp(join(tmpdir(), 'cwa-'));

test('a name that would escape the working directory is refused', () => {
  for (const bad of ['../evil', '..', '.', 'a/b', 'a\\b', '/etc/passwd', '']) {
    const v = validateName(bad);
    if (v.ok) assert.fail(`accepted a dangerous name: ${JSON.stringify(bad)}`);
  }
  assert.equal(validateName('my-api').ok, true);
  assert.equal(validateName('app_2').ok, true);
});

test('the escape check is made on the resolved path, not the string', async () => {
  const base = await tmp();
  assert.equal(resolveTarget(base, 'ok').ok, true);
  // Even if a name slipped past validateName, the path check still holds.
  assert.equal(resolveTarget(base, '..').ok, false);
  assert.equal(resolveTarget(base, '../sibling').ok, false);
});

/* The one that matters: never write into someone's existing project. */
test('a directory with files in it is never written into', async () => {
  const base = await tmp();
  const dir = join(base, 'taken');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'server.js'), 'const mine = 1;');
  const r = await directoryIsUsable(dir);
  assert.equal(r.ok, false);
  assert.match(r.why, /not empty/);
  // and the file is still there
  assert.equal(await readFile(join(dir, 'server.js'), 'utf8'), 'const mine = 1;');
});

test('an absent or empty directory is fine, and .git alone does not block', async () => {
  const base = await tmp();
  assert.equal((await directoryIsUsable(join(base, 'nope'))).ok, true);
  const empty = join(base, 'empty');
  await mkdir(empty);
  assert.equal((await directoryIsUsable(empty)).ok, true);
  await mkdir(join(empty, '.git'));
  assert.equal((await directoryIsUsable(empty)).ok, true, 'a fresh git init should not block scaffolding');
});

test('every template scaffolds, and the package name follows the project', async () => {
  for (const t of TEMPLATES) {
    const base = await tmp();
    const dir = join(base, 'proj');
    const written = await scaffold(dir, buildFiles(t, 'my-thing'));
    assert.ok(written.includes('server.js'), `${t.id} has no server.js`);
    assert.ok(written.includes('README.md'), `${t.id} has no README`);
    assert.ok(written.includes('.env.example'), `${t.id} has no .env.example`);
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'my-thing', `${t.id} did not take the project name`);
    assert.equal(pkg.dependencies.wayleave, '^0.5.0', `${t.id} must pull the version with the policy mount`);
  }
});

/* A scaffold that needs a secret before `npm start` works teaches the
   developer this is fiddly, and they leave. */
test('no template requires configuration to start', async () => {
  for (const t of TEMPLATES) {
    const src = t.files['server.js'];
    const required = src.match(/process\.env\.[A-Z_]+/g) || [];
    for (const ref of new Set(required)) {
      const guarded = new RegExp(`\\.\\.\\.\\(${ref.replace(/\./g, '\\.')}\\s*\\?|${ref.replace(/\./g, '\\.')}\\s*\\|\\||${ref.replace(/\./g, '\\.')}\\s*\\?`).test(src);
      assert.ok(guarded, `${t.id}: ${ref} is read without a fallback, so npm start fails unconfigured`);
    }
  }
});

test('no template ships a real secret or a placeholder that looks like one', () => {
  for (const t of TEMPLATES) {
    for (const [name, body] of Object.entries(t.files)) {
      assert.ok(!/sk_live|wl_live_[A-Za-z0-9]{8}|0x[0-9a-fA-F]{40}/.test(body),
        `${t.id}/${name} contains something shaped like a live credential or address`);
    }
  }
});

test('templates name no third-party operator as verified', () => {
  for (const t of TEMPLATES) {
    const all = Object.values(t.files).join('\n') + t.readme;
    assert.ok(!/OpenAI|Anthropic|Perplexity|ChatGPT|Gemini/i.test(all),
      `${t.id} names a third-party operator; zero agents are verified and the claim would be false`);
  }
});

test('byId is exact and unknown ids return null rather than a default', () => {
  assert.equal(byId('paid-api').id, 'paid-api');
  assert.equal(byId('nope'), null);
  assert.equal(byId(''), null);
});

/* The published tarball must contain every file the entry point imports.
   package.json listed a `templates` DIRECTORY while the code is
   templates.js at the root, so npm would have shipped a package that threw
   ERR_MODULE_NOT_FOUND on first run. This repo's sibling shipped exactly
   that bug once: "0.2.1: ship wayleave/meter, which 0.2.0 promised and did
   not include". Once is enough.

   It packs a real tarball and lists it, rather than reading
   `npm pack --json`. That JSON's shape is not stable across npm majors --
   this test passed on npm 10 and crashed on npm 11 in CI with "Cannot read
   properties of undefined (reading 'files')", which is a test breaking on
   its own scaffolding rather than on the thing it guards. The bytes npm
   actually ships are the subject; ask them directly. */
import { execFileSync } from 'node:child_process';
import { readFile as rf, mkdtemp as mkdt, rm } from 'node:fs/promises';

test('everything index.js imports is actually published', async () => {
  const dir = new URL('.', import.meta.url).pathname;
  const entry = await rf(new URL('./index.js', import.meta.url), 'utf8');
  const local = [...entry.matchAll(/from\s+'(\.\/[^']+)'/g)].map(m => m[1].replace('./', ''));
  assert.ok(local.length, 'no local imports found — has the entry point changed?');

  const out = await mkdt(join(tmpdir(), 'cwa-pack-'));
  try {
    const packed = execFileSync('npm', ['pack', '--pack-destination', out],
                                { cwd: dir, encoding: 'utf8' }).trim().split('\n').pop();
    const listing = execFileSync('tar', ['-tzf', join(out, packed)], { encoding: 'utf8' });
    // npm prefixes every entry with "package/".
    const shipped = new Set(listing.split('\n').filter(Boolean).map(f => f.replace(/^package\//, '')));

    for (const dep of local)
      assert.ok(shipped.has(dep), `index.js imports ${dep}, which npm would not publish`);
    assert.ok(shipped.has('index.js'), 'the entry point itself must ship');
    assert.ok(shipped.has('package.json'), 'the manifest must ship');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

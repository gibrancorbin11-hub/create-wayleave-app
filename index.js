#!/usr/bin/env node
/**
 * create-wayleave-app
 *
 * Scaffolds an Express app with the gate already mounted. Zero dependencies:
 * a tool whose job is to prove Wayleave has none should not drag in twelve.
 *
 * It refuses more than it accepts. Writing into a directory that already has
 * files in it, or accepting a name that would land outside the working
 * directory, costs someone their work -- and a scaffold that destroys a repo
 * on first contact never gets a second try.
 */
import { mkdir, writeFile, readdir, access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { TEMPLATES, byId } from './templates.js';

const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,213}$/;

/** npm's rules, minus the ones that do not apply to a directory. */
export function validateName(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return { ok: false, why: 'A project name is required.' };
  if (name === '.' || name === '..') return { ok: false, why: 'That is a directory, not a name.' };
  if (name.includes('/') || name.includes('\\') || name.includes('\0'))
    return { ok: false, why: 'A name cannot contain a path separator.' };
  if (!NAME_RE.test(name))
    return { ok: false, why: 'Use lowercase letters, digits, dot, dash or underscore; start with a letter or digit.' };
  return { ok: true, name };
}

/** The target must stay inside cwd. A name like ".." is refused above, but
 *  this is the check that actually matters, so it is made against the
 *  resolved path rather than the string. */
export function resolveTarget(cwd, name) {
  const dir = resolve(cwd, name);
  if (dir === resolve(cwd) || !dir.startsWith(resolve(cwd) + sep))
    return { ok: false, why: 'Refusing to write outside the current directory.' };
  return { ok: true, dir };
}

/** Empty, or absent, or nothing but the noise a fresh checkout carries. */
const IGNORABLE = new Set(['.git', '.DS_Store', '.gitkeep']);
export async function directoryIsUsable(dir) {
  try { await access(dir); } catch { return { ok: true, existed: false }; }
  const entries = (await readdir(dir)).filter(e => !IGNORABLE.has(e));
  if (entries.length)
    return { ok: false, why: `${dir} is not empty (${entries.length} item${entries.length === 1 ? '' : 's'}). Pick another name.` };
  return { ok: true, existed: true };
}

export function buildFiles(template, projectName) {
  const files = { ...template.files };
  files['package.json'] = files['package.json'].replace(
    /"name":\s*"[^"]*"/, `"name": ${JSON.stringify(projectName)}`);
  files['README.md'] = `# ${projectName}\n\n` + template.readme +
`
---

Scaffolded by \`create-wayleave-app\`. The gate is [wayleave](https://www.npmjs.com/package/wayleave),
MIT licensed and zero-dependency. Docs: <https://wayleave.dev>

Two laws this app already obeys, and which are worth not breaking:

- **Traffic fails open.** If the meter is unreachable, your users are served
  anyway. Nothing about your uptime depends on ours.
- **Money fails closed.** An unverified payment never opens a priced route.
`;
  return files;
}

export async function scaffold(dir, files) {
  await mkdir(dir, { recursive: true });
  const written = [];
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, body);
    written.push(rel);
  }
  return written.sort();
}

function parseArgs(argv) {
  const out = { name: null, template: null, help: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--list') out.list = true;
    else if (a === '--template' || a === '-t') out.template = argv[++i] ?? '';
    else if (a.startsWith('--template=')) out.template = a.slice('--template='.length);
    else if (!a.startsWith('-') && out.name === null) out.name = a;
  }
  return out;
}

const usage = () => `
create-wayleave-app — scaffold an Express app with Wayleave mounted

  npx create-wayleave-app <name> [--template <id>]

Templates:
${TEMPLATES.map(t => `  ${t.id.padEnd(14)} ${t.label}`).join('\n')}

  --list      print the template ids and exit
  --help      this message

Every template runs with no configuration. Priced routes answer 402 until you
set a receiving address, which is the correct failure: money fails closed.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { stdout.write(usage()); return 0; }
  if (args.list) { stdout.write(TEMPLATES.map(t => t.id).join('\n') + '\n'); return 0; }

  const interactive = stdin.isTTY && stdout.isTTY;
  let name = args.name;
  let templateId = args.template;

  if (!name && interactive) {
    const rl = createInterface({ input: stdin, output: stdout });
    name = await rl.question('Project name: ');
    if (!templateId) {
      stdout.write('\n' + TEMPLATES.map((t, i) => `  ${i + 1}. ${t.label}`).join('\n') + '\n\n');
      const pick = await rl.question(`Template [1-${TEMPLATES.length}, default 1]: `);
      const n = pick.trim() === '' ? 1 : Number(pick);
      templateId = Number.isInteger(n) && n >= 1 && n <= TEMPLATES.length ? TEMPLATES[n - 1].id : '';
    }
    rl.close();
  }

  if (!name) { stdout.write(usage()); return 1; }

  const checked = validateName(name);
  if (!checked.ok) { stdout.write(`\n${checked.why}\n`); return 1; }

  const template = byId(templateId || TEMPLATES[0].id);
  if (!template) {
    stdout.write(`\nUnknown template "${templateId}". Known: ${TEMPLATES.map(t => t.id).join(', ')}\n`);
    return 1;
  }

  const target = resolveTarget(process.cwd(), checked.name);
  if (!target.ok) { stdout.write(`\n${target.why}\n`); return 1; }

  const usable = await directoryIsUsable(target.dir);
  if (!usable.ok) { stdout.write(`\n${usable.why}\n`); return 1; }

  const written = await scaffold(target.dir, buildFiles(template, checked.name));

  stdout.write(`\nCreated ${checked.name}/ from "${template.id}"\n`);
  for (const f of written) stdout.write(`  ${f}\n`);
  stdout.write(`\n  cd ${checked.name}\n  npm install\n  npm start\n\n`);
  stdout.write('Then try it the way an agent would:\n');
  stdout.write(`  ${template.tryIt}\n\n`);
  stdout.write(`${template.expect}\n\n`);
  return 0;
}

/* Run only when executed, not when imported by the tests.
 *
 * The previous check compared import.meta.url against process.argv[1]
 * verbatim. npm installs a bin as a SYMLINK -- node_modules/.bin/... ->
 * ../create-wayleave-app/index.js -- so argv[1] is the link and
 * import.meta.url is its target. They never matched, main() never ran, and
 * `npx create-wayleave-app my-api` exited 0 having done nothing at all.
 * It worked in every local test because `node index.js` has no symlink.
 *
 * realpathSync resolves the link, and pathToFileURL handles the encoding
 * a hand-built `file://` + path string gets wrong on spaces. */
let invokedDirectly = false;
try {
  invokedDirectly = Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
} catch { /* argv[1] gone or unreadable: treat as imported */ }

if (invokedDirectly)
  main().then(c => process.exit(c)).catch(err => { stdout.write(`\n${err.message}\n`); process.exit(1); });

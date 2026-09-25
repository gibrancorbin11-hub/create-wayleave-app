/**
 * The four templates, as data.
 *
 * Every one of them runs with no configuration: no API key, no payment rail,
 * no account. That is deliberate. A scaffold whose first `npm start` fails
 * because a secret is missing teaches the developer that this is fiddly, and
 * they leave. Each template starts in observe-only mode and says, in its own
 * README, exactly which line to uncomment to start charging.
 */

const ENV = `# Nothing here is required to start. The app runs without it.
#
# WAYLEAVE_METER_KEY sends crossings to the hosted meter so you can see them
# in a dashboard. Without it the gate still classifies every request and still
# returns 402 on priced routes -- it just keeps the record to itself.
# WAYLEAVE_METER_KEY=

# The address an agent's payment settles to. Until this is set, priced routes
# answer 402 forever and never grant access, which is the correct failure:
# money fails closed.
# WAYLEAVE_PAY_TO=

# Your public origin. Used to build absolute URLs in /.well-known/x402 so
# discovery indexes can read what you sell.
# PUBLIC_ORIGIN=https://api.example.com
`;

const gitignore = `node_modules\n.env\n*.log\n`;

const pkg = (name, extra = {}) => JSON.stringify({
  name, version: '0.1.0', private: true, type: 'module',
  scripts: { start: 'node server.js', ...(extra.scripts || {}) },
  dependencies: { express: '^4.19.2', wayleave: '^0.5.0', ...(extra.dependencies || {}) },
}, null, 2) + '\n';

/* ------------------------------------------------------------------ */

const paidApi = {
  id: 'paid-api',
  tryIt: "curl -s -i -A 'python-requests/2.31' http://localhost:3000/api/premium | head -20",
  expect: 'A browser gets the data. That request gets a price.',
  label: 'Paid data API — one free route, one priced route',
  files: {
    'package.json': pkg('wayleave-paid-api'),
    '.env.example': ENV,
    '.gitignore': gitignore,
    'server.js': `import express from 'express';
import Wayleave from 'wayleave';

const app = express();

/* Humans are never charged and never walled. That is not a setting here --
   it is what the lanes mean: only automated traffic can reach a price. */
const gate = new Wayleave({
  pricedPaths: { '/api/premium': 0.01 },      // 1 cent per agent request
  ...(process.env.WAYLEAVE_PAY_TO
    ? { payment: { payTo: process.env.WAYLEAVE_PAY_TO, network: 'base' } }
    : {}),
  ...(process.env.PUBLIC_ORIGIN ? { publicOrigin: process.env.PUBLIC_ORIGIN } : {}),
  ...(process.env.WAYLEAVE_METER_KEY
    ? { meter: { apiKey: process.env.WAYLEAVE_METER_KEY } }
    : {}),
  onEvent: e => console.log('[wayleave]', e.lane, e.path, e.status),
});

app.use(gate.express());

app.get('/api/free', (_req, res) => {
  res.json({ ok: true, note: 'Open to everyone, human or agent.' });
});

/* Reached only by an agent that has paid, or by a human. */
app.get('/api/premium', (_req, res) => {
  res.json({ ok: true, data: [{ id: 1, value: 'the thing you sell' }] });
});

app.get('/', (_req, res) => res.type('html').send(
  '<h1>Wayleave is mounted.</h1>' +
  '<p>Try <code>/api/free</code> and <code>/api/premium</code>.</p>' +
  '<p>Agents see a price on the second one. You do not.</p>'));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('Listening on http://localhost:' + port);
  console.log('Priced route: /api/premium');
  console.log(process.env.WAYLEAVE_PAY_TO
    ? 'Payments enabled -- an agent can now pay you.'
    : 'Observe mode: set WAYLEAVE_PAY_TO in .env to accept payment.');
});
`,
  },
  readme: `## What this is

An Express API with two routes. \`/api/free\` is open. \`/api/premium\` is
priced at one cent for automated traffic and free for people.

## Run it

\`\`\`sh
npm install
npm start
\`\`\`

Open <http://localhost:3000/api/premium> in a browser. You get the data --
you are a human, and humans are never charged.

Now ask for it the way a scraper would:

\`\`\`sh
curl -s -i -A 'python-requests/2.31' http://localhost:3000/api/premium | head -20
\`\`\`

That is **402 Payment Required**, with an x402-shaped challenge naming the
price. Nothing was blocked and nothing was guessed -- the request simply did
not look like a person, so it was quoted a price.

## An agent can now pay you

Two things have to be true before money can actually move:

1. \`WAYLEAVE_PAY_TO\` in \`.env\` -- the address settlement lands on.
2. A payment verifier, so a claimed payment is checked with a facilitator
   rather than believed. See <https://wayleave.dev> for the x402 rail.

Until both exist, priced routes answer 402 forever and never open. That is
the intended failure: traffic fails open, money fails closed.
`,
};

/* ------------------------------------------------------------------ */

const mcpServer = {
  id: 'mcp-server',
  tryIt: "curl -s -i -A 'python-requests/2.31' -X POST http://localhost:3000/mcp/tools/lookup \\\n    -H 'content-type: application/json' -d '{\"id\":\"r1\"}' | head -20",
  expect: 'Listing the tools stays free. The lookup is priced.',
  label: 'MCP tool server — per-tool access rules',
  files: {
    'package.json': pkg('wayleave-mcp-server'),
    '.env.example': ENV,
    '.gitignore': gitignore,
    'server.js': `import express from 'express';
import Wayleave from 'wayleave';

const app = express();
app.use(express.json());

const gate = new Wayleave({
  pricedPaths: { '/mcp/tools/lookup': 0.02 },
  ...(process.env.WAYLEAVE_PAY_TO
    ? { payment: { payTo: process.env.WAYLEAVE_PAY_TO, network: 'base' } }
    : {}),
  ...(process.env.WAYLEAVE_METER_KEY
    ? { meter: { apiKey: process.env.WAYLEAVE_METER_KEY } }
    : {}),
});

app.use(gate.express());

/* Free to list what exists. An index cannot discover a catalogue it must
   pay to read, and a tool nobody can find earns nothing. */
app.get('/mcp/tools', (_req, res) => {
  res.json({ tools: [
    { name: 'search', description: 'Free. Search the public index.' },
    { name: 'lookup', description: 'Priced. Full record for one id.' },
  ] });
});

app.post('/mcp/tools/search', (req, res) => {
  res.json({ results: [{ id: 'r1', title: 'A public result' }], query: req.body?.query ?? null });
});

app.post('/mcp/tools/lookup', (req, res) => {
  res.json({ id: req.body?.id ?? 'r1', record: { full: 'the part worth paying for' } });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('MCP tool server on http://localhost:' + port));
`,
  },
  readme: `## What this is

An MCP-style tool server where listing the tools is free and one tool costs
two cents per call for automated traffic.

## Run it

\`\`\`sh
npm install
npm start
curl -s http://localhost:3000/mcp/tools
\`\`\`

The catalogue is open on purpose: an agent that cannot read what you offer
without paying will never get as far as paying.

\`\`\`sh
curl -s -i -A 'python-requests/2.31' -X POST http://localhost:3000/mcp/tools/lookup \\
  -H 'content-type: application/json' -d '{"id":"r1"}' | head -20
\`\`\`

402, with the price. Set \`WAYLEAVE_PAY_TO\` and a verifier to let it settle.
`,
};

/* ------------------------------------------------------------------ */

const contentSite = {
  id: 'content-site',
  tryIt: "curl -s -A 'python-requests/2.31' http://localhost:3000/p/agents > /dev/null",
  expect: 'Nothing is blocked or charged. Watch the console for the lane.',
  label: 'Content site — observe only, nothing priced, nothing blocked',
  files: {
    'package.json': pkg('wayleave-content-site'),
    '.env.example': ENV,
    '.gitignore': gitignore,
    'server.js': `import express from 'express';
import Wayleave from 'wayleave';

const app = express();

/* No pricedPaths and no rules: this changes no response. It only tells you
   who is reading. Start here if you do not yet know what your agent traffic
   looks like -- deciding what to charge for before you have looked is how
   you price the wrong thing. */
const gate = new Wayleave({
  ...(process.env.WAYLEAVE_METER_KEY
    ? { meter: { apiKey: process.env.WAYLEAVE_METER_KEY } }
    : {}),
  onEvent: e => console.log('[crossing]', e.lane.padEnd(15), e.path),
});

app.use(gate.express());

const posts = [
  { slug: 'hello', title: 'Hello', body: 'The first post.' },
  { slug: 'agents', title: 'On agents', body: 'Who is actually reading this?' },
];

app.get('/', (_req, res) => res.type('html').send(
  '<h1>A small content site</h1><ul>' +
  posts.map(p => '<li><a href="/p/' + p.slug + '">' + p.title + '</a></li>').join('') +
  '</ul><p>Watch the console. Every crossing is classified.</p>'));

app.get('/p/:slug', (req, res) => {
  const post = posts.find(p => p.slug === req.params.slug);
  if (!post) return res.status(404).type('html').send('<h1>Not found</h1>');
  res.type('html').send('<h1>' + post.title + '</h1><p>' + post.body + '</p>');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Content site on http://localhost:' + port));
`,
  },
  readme: `## What this is

An ordinary content site that changes nothing about what it serves. It only
classifies who is asking and prints it.

## Run it

\`\`\`sh
npm install
npm start
\`\`\`

Visit it in a browser, then:

\`\`\`sh
curl -s -A 'python-requests/2.31' http://localhost:3000/p/agents > /dev/null
curl -s -A 'Mozilla/5.0 (compatible; ExampleBot/1.0; +https://example.com/bot)' http://localhost:3000/ > /dev/null
\`\`\`

The console shows the lane each one landed in. Nobody was blocked and nobody
was charged -- that is the whole point of starting here.

Set \`WAYLEAVE_METER_KEY\` to keep the record somewhere you can chart it.
`,
};

/* ------------------------------------------------------------------ */

const landingPlusApi = {
  id: 'landing-api',
  tryIt: "curl -s -i http://localhost:3000/api/items | head -20",
  expect: 'The page stays free. The API asks automated callers to pay.',
  label: 'Landing page + protected API — humans browse, agents pay',
  files: {
    'package.json': pkg('wayleave-landing-api'),
    '.env.example': ENV,
    '.gitignore': gitignore,
    'server.js': `import express from 'express';
import Wayleave from 'wayleave';

const app = express();

const gate = new Wayleave({
  pricedPaths: { '/api/': 0.005 },
  /* Recommended wherever there is a price. Without it the free lane is
     whatever fails to look automated, so the cheapest way past a paywall is
     to send a browser user-agent. */
  strictPricedPaths: true,
  confirmHuman: req => Boolean(req.session?.userId),
  ...(process.env.WAYLEAVE_PAY_TO
    ? { payment: { payTo: process.env.WAYLEAVE_PAY_TO, network: 'base' } }
    : {}),
  ...(process.env.WAYLEAVE_METER_KEY
    ? { meter: { apiKey: process.env.WAYLEAVE_METER_KEY } }
    : {}),
});

app.use(gate.express());

app.get('/', (_req, res) => res.type('html').send(
  '<main style="font:16px system-ui;max-width:40rem;margin:4rem auto">' +
  '<h1>Your product</h1>' +
  '<p>People read this page for free, always.</p>' +
  '<p>The API underneath it is priced for agents: <code>/api/items</code></p>' +
  '</main>'));

app.get('/api/items', (_req, res) => res.json({ items: [{ id: 1, name: 'An item' }] }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Landing + API on http://localhost:' + port));
`,
  },
  readme: `## What this is

A marketing page anyone can read, in front of an API that charges automated
traffic half a cent a call.

## Run it

\`\`\`sh
npm install
npm start
\`\`\`

The page is free forever. The API is not:

\`\`\`sh
curl -s -i http://localhost:3000/api/items | head -20
\`\`\`

Note this template sets \`strictPricedPaths: true\`, so the priced route admits
exactly two things: a verified signature that pays, and a request your own
\`confirmHuman\` vouches for. Wire that to your session, never to a header --
every header a browser sends, a bot can send too.
`,
};

export const TEMPLATES = [paidApi, mcpServer, contentSite, landingPlusApi];
export const byId = id => TEMPLATES.find(t => t.id === id) || null;

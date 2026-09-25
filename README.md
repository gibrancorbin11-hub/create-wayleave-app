# create-wayleave-app

Scaffold an Express app with [Wayleave](https://www.npmjs.com/package/wayleave)
already mounted: every request classified by signature, one route priced for
agents, humans never charged.

```sh
npx create-wayleave-app my-api
cd my-api
npm install
npm start
```

Then ask for the priced route the way a scraper would:

```sh
curl -s -i -A 'python-requests/2.31' http://localhost:3000/api/premium | head -20
```

That is **402 Payment Required** with the price attached. Open the same URL in
a browser and you get the data — humans are never charged and never walled.

## Templates

```sh
npx create-wayleave-app my-api --template paid-api
```

| id | what it is |
|----|------------|
| `paid-api` | One open route, one priced route. The default. |
| `mcp-server` | MCP-style tool server. Listing the tools is free; one tool is priced. |
| `content-site` | Observe only. Nothing blocked, nothing charged — it just tells you who is reading. |
| `landing-api` | A public page in front of a priced API, with `strictPricedPaths` on. |

Not sure? Start with `content-site`. Deciding what to charge for before you
have looked at your traffic is how you price the wrong thing.

## Every template runs unconfigured

No API key, no wallet, no account. `npm install && npm start` works on a fresh
machine, and there is a test in this repo that fails if any template reads an
environment variable without a fallback.

What configuration adds:

| variable | effect when set |
|----------|-----------------|
| `WAYLEAVE_METER_KEY` | crossings are sent to the hosted meter so you can chart them |
| `WAYLEAVE_PAY_TO` | an agent's payment has somewhere to settle |
| `PUBLIC_ORIGIN` | `/.well-known/x402` advertises absolute URLs, so indexes can read them |

Until `WAYLEAVE_PAY_TO` exists, priced routes answer 402 forever and never
open. That is the intended failure, not a gap: **traffic fails open, money
fails closed.** A gate that granted access because it could not check a
payment would be worse than one that never charged at all.

## What you get

Five files. No build step, no framework beyond Express, no configuration
files to learn.

```
my-api/
  server.js        the gate, mounted, with comments explaining each option
  package.json
  .env.example     every variable, all commented out
  .gitignore
  README.md        how to see a 402, and what to set to accept payment
```

## Safety

This writes to disk, so it refuses more than it accepts:

- it will not write into a directory that already has files in it
- it will not accept a name that resolves outside the working directory
- a bare `.git` does not count as "not empty", so `git init` first is fine

## Licence

MIT. The gate it installs is MIT and has zero runtime dependencies; so does
this. Docs at <https://wayleave.dev>.

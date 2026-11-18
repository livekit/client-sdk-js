# Public tests

These tests are the compatibility contract of `livekit-client`. `pnpm check:breaks` runs
[break-check](https://www.npmjs.com/package/break-check): it restores this folder from the newest
release tag and runs `pnpm test:public` against the current source. A restored test that fails is
a breaking change, and the check then requires a `major` changeset.

- Import only from the entries (`../../src/index`, `../../src/core`), never from a module inside.
- Assert only what a consumer can rely on across releases.
- `exports.json` lists the value exports of both entries. Add a new export there. A removed
  name fails the check.
- `types.ts` is consumer code that must keep compiling. It is never executed.

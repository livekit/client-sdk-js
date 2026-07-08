---
"livekit-client": patch
---

Include the `NonSharedUint8Array` type polyfill in the published declarations.

The type was declared in an ambient `.d.ts` that was resolved during our own
build but never emitted to `dist`, so the published `.d.ts` files referenced a
type consumers could not resolve — surfacing as `Cannot find name
'NonSharedUint8Array'` under `skipLibCheck: false` and as `Unable to follow
symbol for "NonSharedUint8Array"` in API Extractor (which broke downstream
packages such as `@livekit/components-*`). The polyfill is now an exported type
that is imported explicitly wherever it is used, so it ships in `dist` and the
published types type-check standalone.

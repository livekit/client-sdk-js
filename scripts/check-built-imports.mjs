// Imports the built entries in plain Node ESM. The core build leaves dependencies external, so
// a CommonJS dependency imported the wrong way (a namespace import of loglevel) loads through a
// bundler's interop but throws here, and in any consumer that runs the files unbundled.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
for (const file of ['dist/livekit-client.esm.mjs', 'dist/core/core.mjs']) {
  try {
    const mod = await import(pathToFileURL(path.join(REPO, file)).href);
    console.log(`${file}: ${Object.keys(mod).length} exports`);
  } catch (err) {
    console.error(`${file} failed to import: ${err.message}`);
    process.exit(1);
  }
}

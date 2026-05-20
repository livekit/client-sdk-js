// Side-effect require: assertions.js installs `globalThis.__livekitRunSmoke`.
require('../../shared/assertions.js');
const lk = require('livekit-client');

const result = globalThis.__livekitRunSmoke(lk, globalThis.__expectedVersion);
globalThis.__smoke = result;
const el = document.getElementById('result');
if (el) {
  el.textContent = JSON.stringify(result, null, 2);
}

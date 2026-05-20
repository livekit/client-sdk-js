// Side-effect import: assertions.js installs `globalThis.__livekitRunSmoke`.
import '../../shared/assertions.js';
import * as lk from 'livekit-client';

const result = window.__livekitRunSmoke(lk, window.__expectedVersion);
window.__smoke = result;
document.getElementById('result').textContent = JSON.stringify(result, null, 2);

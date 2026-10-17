// Side-effect import: assertions.js installs `globalThis.__livekitRunSmoke`.
import * as lk from 'livekit-client';
import '../../shared/assertions.js';

window.__livekitRunSmoke(lk, window.__expectedVersion).then((result) => {
  window.__smoke = result;
  document.getElementById('result').textContent = JSON.stringify(result, null, 2);
});

---
'livekit-client': patch
---

Defer `onEnterPiP` visibility update until after the next microtask and animation frame so Document Picture-in-Picture embedders can append DOM into the PiP window before `isElementInPiP` runs.

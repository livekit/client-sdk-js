---
'livekit-client': patch
---

Fix Document Picture-in-Picture detection reporting opener-document elements as being in PiP. `isElementInPiP` compared an element's coordinates (computed within its own document) against the PiP window's viewport without checking which document the element belongs to, so while any Document PiP window was open, every observed video element positioned inside the PiP window's bounds - a tile near the top-left of the page, for example - was treated as in PiP. Because `HTMLElementInfo.visible` is `isPiP || isIntersecting`, those elements also counted as visible while scrolled out of view, which affected adaptiveStream subscription and layer selection. Detection now requires the element to live in the PiP window's document, or in a frame nested inside it.

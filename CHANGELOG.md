# Change Log

## 1.1.3

### Patch Changes

- [#275](https://github.com/livekit/client-sdk-js/pull/275) [`591c218`](https://github.com/livekit/client-sdk-js/commit/591c2181d7873b2beb47d00efb66f2dbe01e8200) Thanks [@davidzhao](https://github.com/davidzhao)! - Fixed TrackPublished events not firing correctly in some cases

* [#276](https://github.com/livekit/client-sdk-js/pull/276) [`99fba24`](https://github.com/livekit/client-sdk-js/commit/99fba24acc238cc8e7bec49b1f036ff4fd5d8fa8) Thanks [@lukasIO](https://github.com/lukasIO)! - compute initial visible value for element infos manually

## 1.1.2

### Patch Changes

- [#271](https://github.com/livekit/client-sdk-js/pull/271) [`9df9cbe`](https://github.com/livekit/client-sdk-js/commit/9df9cbeeef141e2b8003c29e1e5a75e85703d8d6) Thanks [@davidzhao](https://github.com/davidzhao)! - Fixed Dynacast not activated when default codec is set to empty

* [#267](https://github.com/livekit/client-sdk-js/pull/267) [`cdc3d3d`](https://github.com/livekit/client-sdk-js/commit/cdc3d3d39f1eb126d41e5eaa430b647329a3770e) Thanks [@cnderrauber](https://github.com/cnderrauber)! - Start publishing backwards-compatible codec only when subscribers need it

- [#273](https://github.com/livekit/client-sdk-js/pull/273) [`ed2d790`](https://github.com/livekit/client-sdk-js/commit/ed2d790d7fbf5a9ad36610166c5d2889a78a420f) Thanks [@lukasIO](https://github.com/lukasIO)! - Increase emtpy video stream size

## 1.1.1

### Patch Changes

- [#268](https://github.com/livekit/client-sdk-js/pull/268) [`fc121f4`](https://github.com/livekit/client-sdk-js/commit/fc121f4cab0503542c76063b66fe13b00fa9b31e) Thanks [@davidzhao](https://github.com/davidzhao)! - Fixed AdaptiveStream incorrectly using element width as height

## 1.1.0

### Minor Changes

- [#251](https://github.com/livekit/client-sdk-js/pull/251) [`48a5e3b`](https://github.com/livekit/client-sdk-js/commit/48a5e3ba605f25530dc1194bb714fab1d7bfa490) Thanks [@lukasIO](https://github.com/lukasIO)! - Add optional CaptureOptions for set-enabled methods

### Patch Changes

- [#262](https://github.com/livekit/client-sdk-js/pull/262) [`879392c`](https://github.com/livekit/client-sdk-js/commit/879392c5bae8eb0ea94c664f63ff9fdba72e1d26) Thanks [@cnderrauber](https://github.com/cnderrauber)! - refine preferred codec

## 1.0.4

### Patch Changes

- 3e5e3b8: Fix dynacast fallback when simulcast codec is not available
- 4a51ae0: Fix getParticipantIdentity returning `undefined` in some cases

## 1.0.3

### Patch Changes

- 9487a4d: Fix typescript declaration location

## 1.0.2

### Patch Changes

- 4effe17: Moving StreamState to Track to improve usability
- 3bca206: Fix: guard against (multiple) simultaneous reconnect attempts

## 0.12.0

- Updated API to create screen share tracks.

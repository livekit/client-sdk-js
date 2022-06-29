# Change Log

## 1.1.7

### Patch Changes

- [#289](https://github.com/livekit/client-sdk-js/pull/289) [`c65e206`](https://github.com/livekit/client-sdk-js/commit/c65e20652e4f0d50a0cfcaa7847e137e2e1d0844) Thanks [@davidzhao](https://github.com/davidzhao)! - Reconcile local mute status after resuming connection

## 1.1.6

### Patch Changes

- [#285](https://github.com/livekit/client-sdk-js/pull/285) [`fccb2cb`](https://github.com/livekit/client-sdk-js/commit/fccb2cb7c11c1a0e550b61ffeea2a74b0615f310) Thanks [@lukasIO](https://github.com/lukasIO)! - Allow AudioCaptureOptions to be passed to ScreenCaptureOptions

* [#287](https://github.com/livekit/client-sdk-js/pull/287) [`3da0099`](https://github.com/livekit/client-sdk-js/commit/3da0099b6b7bc7a7a1f8523f7b66ad48ef3a865f) Thanks [@davidzhao](https://github.com/davidzhao)! - Fix handling of permissions after resubscribe

## 1.1.5

### Patch Changes

- [#282](https://github.com/livekit/client-sdk-js/pull/282) [`20584eb`](https://github.com/livekit/client-sdk-js/commit/20584ebceb4bf8ef9d18d308e39907b41337fef5) Thanks [@davidzhao](https://github.com/davidzhao)! - Improved duplicate connect handling

## 1.1.4

### Patch Changes

- [#279](https://github.com/livekit/client-sdk-js/pull/279) [`301ccc0`](https://github.com/livekit/client-sdk-js/commit/301ccc06054185e4692c18517fba5a09d919f411) Thanks [@lukasIO](https://github.com/lukasIO)! - Only restart tracks if they are internally managed by the sdk

* [#280](https://github.com/livekit/client-sdk-js/pull/280) [`b0a5f6a`](https://github.com/livekit/client-sdk-js/commit/b0a5f6a271b45e2eda5bf22990c97e8adb07224a) Thanks [@davidzhao](https://github.com/davidzhao)! - Fixed reconnection with the same Room object

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

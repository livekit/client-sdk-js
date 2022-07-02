# Change Log

## 1.1.9

### Patch Changes

- [#303](https://github.com/livekit/client-sdk-js/pull/303) [`3a76634`](https://github.com/livekit/client-sdk-js/commit/3a766349a9794ba5da3ec6858d1aad2abe23cf47) Thanks [@davidzhao](https://github.com/davidzhao)! - Do not stop tracks that are userProvided during mute

* [#299](https://github.com/livekit/client-sdk-js/pull/299) [`22ee04a`](https://github.com/livekit/client-sdk-js/commit/22ee04aec41174acc0163c23527b9f979d560c5d) Thanks [@davidzhao](https://github.com/davidzhao)! - Do not attempt to add subscribed track when disconnected

- [#297](https://github.com/livekit/client-sdk-js/pull/297) [`aef3470`](https://github.com/livekit/client-sdk-js/commit/aef34700a052563c77ebd58ff367c3b581a31a67) Thanks [@lukasIO](https://github.com/lukasIO)! - Mirror muted state on remote mediastreamtrack

* [#301](https://github.com/livekit/client-sdk-js/pull/301) [`a2f36d6`](https://github.com/livekit/client-sdk-js/commit/a2f36d63aafd00e5630e39e3ac12ca32ac9d4d30) Thanks [@lukasIO](https://github.com/lukasIO)! - Re-use external queue library for signalling queue

- [#300](https://github.com/livekit/client-sdk-js/pull/300) [`f294120`](https://github.com/livekit/client-sdk-js/commit/f294120d8f2f4f2794b11fd56ac5fd64c70a998a) Thanks [@lukasIO](https://github.com/lukasIO)! - Queue and await parallel calls to mute/unmute for a track

* [#304](https://github.com/livekit/client-sdk-js/pull/304) [`9bb9430`](https://github.com/livekit/client-sdk-js/commit/9bb94303c3cd72d077d2e00af0d0916c7257fc5f) Thanks [@lukasIO](https://github.com/lukasIO)! - Forward reason of disconnected event

## 1.1.8

### Patch Changes

- [#293](https://github.com/livekit/client-sdk-js/pull/293) [`e65443a`](https://github.com/livekit/client-sdk-js/commit/e65443a2433d323a0489d76e347572a37125a971) Thanks [@lukasIO](https://github.com/lukasIO)! - Respect stopLocalTrackOnUnpublish in event of engine disconnect

* [#294](https://github.com/livekit/client-sdk-js/pull/294) [`d389fda`](https://github.com/livekit/client-sdk-js/commit/d389fda5339c4863c86d4e865dd8a9e7c47d0b3c) Thanks [@cnderrauber](https://github.com/cnderrauber)! - keep mediastream id unchange for migration

- [#296](https://github.com/livekit/client-sdk-js/pull/296) [`9e78db7`](https://github.com/livekit/client-sdk-js/commit/9e78db7a41b0ee8c17536649549f84653465f3d0) Thanks [@lukasIO](https://github.com/lukasIO)! - Additional guards against creating localParticipant as remoteParticipant

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

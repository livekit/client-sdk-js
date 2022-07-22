# Change Log

## 1.2.4

### Patch Changes

- [#330](https://github.com/livekit/client-sdk-js/pull/330) [`dbbfe5f`](https://github.com/livekit/client-sdk-js/commit/dbbfe5faa8e9c74f5dd751f93fc6a4cdf49e7408) Thanks [@lukasIO](https://github.com/lukasIO)! - Check for duplicate source publications before adding them to tracks

## 1.2.3

### Patch Changes

- [#328](https://github.com/livekit/client-sdk-js/pull/328) [`aac61a9`](https://github.com/livekit/client-sdk-js/commit/aac61a96b6e47246a3a411a791902159594331b3) Thanks [@lukasIO](https://github.com/lukasIO)! - Make local track publication timeout instead of waiting indefinitely for server response

* [#321](https://github.com/livekit/client-sdk-js/pull/321) [`607aa81`](https://github.com/livekit/client-sdk-js/commit/607aa81106c3d460f15b455ad72f1baf001e41c7) Thanks [@davidzhao](https://github.com/davidzhao)! - Improve reconnect timeout handling

- [#329](https://github.com/livekit/client-sdk-js/pull/329) [`5aea501`](https://github.com/livekit/client-sdk-js/commit/5aea5017d0a01246f1b0f325ed888797571475ca) Thanks [@lukasIO](https://github.com/lukasIO)! - Log warning if multiple tracks of the same source are published

* [#322](https://github.com/livekit/client-sdk-js/pull/322) [`b9555d9`](https://github.com/livekit/client-sdk-js/commit/b9555d915f3ef27455ec51a9ae4a29cd402601c1) Thanks [@cnderrauber](https://github.com/cnderrauber)! - enable audio nack

- [#323](https://github.com/livekit/client-sdk-js/pull/323) [`02c025f`](https://github.com/livekit/client-sdk-js/commit/02c025f526111c814dc55ac595a3a4fca85fb6ef) Thanks [@lukasIO](https://github.com/lukasIO)! - Remove internal event listeners from local participant on disconnect

* [#321](https://github.com/livekit/client-sdk-js/pull/321) [`607aa81`](https://github.com/livekit/client-sdk-js/commit/607aa81106c3d460f15b455ad72f1baf001e41c7) Thanks [@davidzhao](https://github.com/davidzhao)! - Customizable reconnect policy

- [#325](https://github.com/livekit/client-sdk-js/pull/325) [`56694b7`](https://github.com/livekit/client-sdk-js/commit/56694b7b2ecf30c96fff24d517fd9d3fe41ae3b5) Thanks [@lukasIO](https://github.com/lukasIO)! - unpublish track based on published track.sender

## 1.2.2

### Patch Changes

- [#317](https://github.com/livekit/client-sdk-js/pull/317) [`68f6ae2`](https://github.com/livekit/client-sdk-js/commit/68f6ae2bf249e6469fc2c8b9a2acf95b98ed5d4d) Thanks [@theomonnom](https://github.com/theomonnom)! - Fix Unity issue with placeholders '
  '

## 1.2.1

### Patch Changes

- [#316](https://github.com/livekit/client-sdk-js/pull/316) [`b534b95`](https://github.com/livekit/client-sdk-js/commit/b534b955a1b30b35da23a237a0bd98693b326c43) Thanks [@theomonnom](https://github.com/theomonnom)! - Add PublishOptions to Set\*Enabled

* [#314](https://github.com/livekit/client-sdk-js/pull/314) [`d25b86c`](https://github.com/livekit/client-sdk-js/commit/d25b86caf40290310bfbc328f84e175e775dcf1f) Thanks [@cnderrauber](https://github.com/cnderrauber)! - apply av1 bitrate setting

## 1.2.0

### Minor Changes

- [#308](https://github.com/livekit/client-sdk-js/pull/308) [`5b1c5a0`](https://github.com/livekit/client-sdk-js/commit/5b1c5a0192ffdd68546b64ad855156bf1edfcc7e) Thanks [@lukasIO](https://github.com/lukasIO)! - Try to re-aquire mediastreamtrack when device has been disconnected, pause upstream if no device could be acquired

* [#310](https://github.com/livekit/client-sdk-js/pull/310) [`40a51f5`](https://github.com/livekit/client-sdk-js/commit/40a51f52a3428a0a0614d206911eab0ac8b49ea9) Thanks [@lukasIO](https://github.com/lukasIO)! - Deprecate publishOnly connect option

### Patch Changes

- [#309](https://github.com/livekit/client-sdk-js/pull/309) [`9b8599d`](https://github.com/livekit/client-sdk-js/commit/9b8599deb177ebd066b4f9e4718e3e11f809d5e5) Thanks [@cnderrauber](https://github.com/cnderrauber)! - fix safari data channel migration failed

* [#306](https://github.com/livekit/client-sdk-js/pull/306) [`c786143`](https://github.com/livekit/client-sdk-js/commit/c786143291c3cd2281e12eababff5ad71f14e248) Thanks [@davidzhao](https://github.com/davidzhao)! - Determine track allowed status primarily by precense of Track

- [#306](https://github.com/livekit/client-sdk-js/pull/306) [`c786143`](https://github.com/livekit/client-sdk-js/commit/c786143291c3cd2281e12eababff5ad71f14e248) Thanks [@davidzhao](https://github.com/davidzhao)! - Improved Track event handling for permission changed

* [#306](https://github.com/livekit/client-sdk-js/pull/306) [`c786143`](https://github.com/livekit/client-sdk-js/commit/c786143291c3cd2281e12eababff5ad71f14e248) Thanks [@davidzhao](https://github.com/davidzhao)! - Room.disconnect is now an async function

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

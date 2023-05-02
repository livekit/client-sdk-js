# Change Log

## 1.9.2

### Patch Changes

- Ensure engine is always set to undefined when closing - [#682](https://github.com/livekit/client-sdk-js/pull/682) ([@lukasIO](https://github.com/lukasIO))

- Handle connection state mismatch with periodic reconciliation - [#680](https://github.com/livekit/client-sdk-js/pull/680) ([@davidzhao](https://github.com/davidzhao))

## 1.9.1

### Patch Changes

- Only set maxFramerate on encoding if defined - [#676](https://github.com/livekit/client-sdk-js/pull/676) ([@lukasIO](https://github.com/lukasIO))

- added experimental option suppressLocalAudioPlayback - [#675](https://github.com/livekit/client-sdk-js/pull/675) ([@jibon57](https://github.com/jibon57))

- Fix: Emit connected events for participants that connected during signal reconnect - [#672](https://github.com/livekit/client-sdk-js/pull/672) ([@lukasIO](https://github.com/lukasIO))

- Add VP9 SVC support - [#643](https://github.com/livekit/client-sdk-js/pull/643) ([@cnderrauber](https://github.com/cnderrauber))

## 1.9.0

### Minor Changes

- Fix race condition with full reconnect sequence during server restart - [#663](https://github.com/livekit/client-sdk-js/pull/663) ([@davidzhao](https://github.com/davidzhao))

### Patch Changes

- Add support for local participants to update own metadata - [#599](https://github.com/livekit/client-sdk-js/pull/599) ([@lukasIO](https://github.com/lukasIO))

- Expose numParticipants and numPublishers on Room - [#668](https://github.com/livekit/client-sdk-js/pull/668) ([@davidzhao](https://github.com/davidzhao))

- Handle signal reconnect and full reconnection separately #665 - [#670](https://github.com/livekit/client-sdk-js/pull/670) ([@lukasIO](https://github.com/lukasIO))

## 1.8.0

### Minor Changes

- [#633](https://github.com/livekit/client-sdk-js/pull/633) [`95bd94e`](https://github.com/livekit/client-sdk-js/commit/95bd94eae361be8a23ed627bff665275050f8073) Thanks [@lukasIO](https://github.com/lukasIO)! - Give up on reconnections if token is invalid

- [#634](https://github.com/livekit/client-sdk-js/pull/634) [`f085fbe`](https://github.com/livekit/client-sdk-js/commit/f085fbec0bb1c7687f0ea16dfc36d6d34220c35c) Thanks [@lukasIO](https://github.com/lukasIO)! - Allow manual operation on audio publications with adaptiveStream enabled

- [#642](https://github.com/livekit/client-sdk-js/pull/642) [`dd381f1`](https://github.com/livekit/client-sdk-js/commit/dd381f106d68805388b3486b4cc3a23cb12132b5) Thanks [@lukasIO](https://github.com/lukasIO)! - Add Region URL Provider

### Patch Changes

- [#655](https://github.com/livekit/client-sdk-js/pull/655) [`8d7f854`](https://github.com/livekit/client-sdk-js/commit/8d7f85495b4562e629ac3f808407bddf08196f95) Thanks [@lukasIO](https://github.com/lukasIO)! - Remove page visibility listener when last element gets detached

- [#658](https://github.com/livekit/client-sdk-js/pull/658) [`756cf56`](https://github.com/livekit/client-sdk-js/commit/756cf56b6ddab6e1ef2eee7359329a0ef5f9a2be) Thanks [@lukasIO](https://github.com/lukasIO)! - Stop monitoring track on unsubscribe

- [#652](https://github.com/livekit/client-sdk-js/pull/652) [`bda2fa9`](https://github.com/livekit/client-sdk-js/commit/bda2fa91e0971b36ce15e2f481f576a1ecd0d3a9) Thanks [@renovate](https://github.com/apps/renovate)! - chore(deps): update devdependencies (non-major)

- [#653](https://github.com/livekit/client-sdk-js/pull/653) [`201fcda`](https://github.com/livekit/client-sdk-js/commit/201fcdabd9868dd6a205dd85fdb84294af86a9b3) Thanks [@renovate](https://github.com/apps/renovate)! - fix(deps): update dependency webrtc-adapter to v8.2.2

- [#629](https://github.com/livekit/client-sdk-js/pull/629) [`cb380c2`](https://github.com/livekit/client-sdk-js/commit/cb380c20201e590cd9f7e4fa1e1f563a5d3899a0) Thanks [@davidliu](https://github.com/davidliu)! - Identify react-native apps when connecting to server

- [#654](https://github.com/livekit/client-sdk-js/pull/654) [`958eef2`](https://github.com/livekit/client-sdk-js/commit/958eef215454f0a600ae433654babe7bfaef108c) Thanks [@lukasIO](https://github.com/lukasIO)! - Expose DataChannel buffer status events

- [#651](https://github.com/livekit/client-sdk-js/pull/651) [`80ec8d7`](https://github.com/livekit/client-sdk-js/commit/80ec8d7f0a1db1fb65ee18e3cd428474cc06c6d0) Thanks [@davidliu](https://github.com/davidliu)! - Support screen pixel density for react-native

- [#632](https://github.com/livekit/client-sdk-js/pull/632) [`111971d`](https://github.com/livekit/client-sdk-js/commit/111971d43a0510d425950538873aa2482a790ac2) Thanks [@lukasIO](https://github.com/lukasIO)! - Replace async queue with mutex lock for mute operations

## 1.7.1

### Patch Changes

- [#625](https://github.com/livekit/client-sdk-js/pull/625) [`b74da67`](https://github.com/livekit/client-sdk-js/commit/b74da67c3e041ac910a7293c6fded45510a3af69) Thanks [@wjaykim](https://github.com/wjaykim)! - Emit mute status events also for unsubscribed publications

- [#622](https://github.com/livekit/client-sdk-js/pull/622) [`2268333`](https://github.com/livekit/client-sdk-js/commit/22683335c0384541a2d532552dfc812773a19206) Thanks [@lukasIO](https://github.com/lukasIO)! - Don't auto-pause videos when element is in pictureInPicture mode (only applies when adaptiveStream is enabled)

- [#627](https://github.com/livekit/client-sdk-js/pull/627) [`0342650`](https://github.com/livekit/client-sdk-js/commit/03426505cdc8976b700fa2ecd52ed0d62df11a5c) Thanks [@lukasIO](https://github.com/lukasIO)! - Add room option to configure automatic disconnect on page leave

- [#628](https://github.com/livekit/client-sdk-js/pull/628) [`4ed8b89`](https://github.com/livekit/client-sdk-js/commit/4ed8b89a9315e5b358fdfbb955893f480e21c9c5) Thanks [@lukasIO](https://github.com/lukasIO)! - Respect incoming data message order by processing message events sequentially

- [#623](https://github.com/livekit/client-sdk-js/pull/623) [`d8e7a20`](https://github.com/livekit/client-sdk-js/commit/d8e7a20afffefd75377e1638c7461dc8f768ae07) Thanks [@lukasIO](https://github.com/lukasIO)! - Emit `RoomEvent.LocalAudioSilenceDetected` if a `LocalAudioTrack` is silent after publishing

## 1.7.0

### Minor Changes

- [#619](https://github.com/livekit/client-sdk-js/pull/619) [`937a538`](https://github.com/livekit/client-sdk-js/commit/937a538c618f397910d1354cadf165d63eff1da6) Thanks [@lukasIO](https://github.com/lukasIO)! - Return publication of Track.Source.Unknown in getTrack

## 1.6.9

### Patch Changes

- [#612](https://github.com/livekit/client-sdk-js/pull/612) [`347c497`](https://github.com/livekit/client-sdk-js/commit/347c4971fcf3d4cd549134a1341f68a3f215abc2) Thanks [@lukasIO](https://github.com/lukasIO)! - Allow to specify exact constraint for room.switchActiveDevice

- [#609](https://github.com/livekit/client-sdk-js/pull/609) [`068c05e`](https://github.com/livekit/client-sdk-js/commit/068c05e757e7218e12da971e3803834e439e139e) Thanks [@lukasIO](https://github.com/lukasIO)! - Reject publish future if engine disconnects

- [#615](https://github.com/livekit/client-sdk-js/pull/615) [`505a78e`](https://github.com/livekit/client-sdk-js/commit/505a78e459808b0e73ea6737bf333de93a84e390) Thanks [@davidzhao](https://github.com/davidzhao)! - Only trigger AudioPlaybackFailed when error is NotAllowed

## 1.6.8

### Patch Changes

- [#605](https://github.com/livekit/client-sdk-js/pull/605) [`4bc4183`](https://github.com/livekit/client-sdk-js/commit/4bc41831c0da8c3c17f9afd06f9787e6004a644a) Thanks [@cnderrauber](https://github.com/cnderrauber)! - Receive remote participant disconnected updates while reconnecting

- [#592](https://github.com/livekit/client-sdk-js/pull/592) [`fea43e4`](https://github.com/livekit/client-sdk-js/commit/fea43e4de8b79176c6485a1d181467a284242b4b) Thanks [@lukasIO](https://github.com/lukasIO)! - Add support for some experimental getDisplayMedia options in ScreenShareCaptureOptions

- [#608](https://github.com/livekit/client-sdk-js/pull/608) [`5efa607`](https://github.com/livekit/client-sdk-js/commit/5efa60710096bf050ea7438312843e694a0db5fa) Thanks [@lukasIO](https://github.com/lukasIO)! - Defer publishing of tracks during reconnection

- [#597](https://github.com/livekit/client-sdk-js/pull/597) [`27dbd6a`](https://github.com/livekit/client-sdk-js/commit/27dbd6a6d8d2950d7a90bd928bd0229c4a956008) Thanks [@lukasIO](https://github.com/lukasIO)! - Add support for topics on data messages

## 1.6.7

### Patch Changes

- [#593](https://github.com/livekit/client-sdk-js/pull/593) [`f218236`](https://github.com/livekit/client-sdk-js/commit/f21823659bfe7a5e0036be705c1751e30a3611c8) Thanks [@cnderrauber](https://github.com/cnderrauber)! - Disable red by default for stereo track

- [#600](https://github.com/livekit/client-sdk-js/pull/600) [`75d7556`](https://github.com/livekit/client-sdk-js/commit/75d75562ece4b1e57c81a879440b6101599ef7ea) Thanks [@davidzhao](https://github.com/davidzhao)! - internal getter connectedServerAddress is has been changed to an async function getConnectedServerAddress

- [#595](https://github.com/livekit/client-sdk-js/pull/595) [`75776b8`](https://github.com/livekit/client-sdk-js/commit/75776b81885109ac8e2a369c2a4e7583db2406b3) Thanks [@davidzhao](https://github.com/davidzhao)! - Fixed incorrect state with resume then reconnect

- [#596](https://github.com/livekit/client-sdk-js/pull/596) [`a9aa74f`](https://github.com/livekit/client-sdk-js/commit/a9aa74f327efbbb2595f12d121e8ee4dde283d1c) Thanks [@davidzhao](https://github.com/davidzhao)! - Track.streamState defaults to active

## 1.6.6

### Patch Changes

- [#585](https://github.com/livekit/client-sdk-js/pull/585) [`0a33b1a`](https://github.com/livekit/client-sdk-js/commit/0a33b1a7fcb4cefc4e23c12bc5d9ecfe3b41b583) Thanks [@davidzhao](https://github.com/davidzhao)! - Prevent concurrent RTCRtpSender.setParameter call to avoid exception

## 1.6.5

### Patch Changes

- [#575](https://github.com/livekit/client-sdk-js/pull/575) [`b8fd583`](https://github.com/livekit/client-sdk-js/commit/b8fd583610c13d23aa9a8f3778d765e2691807dd) Thanks [@HermanBilous](https://github.com/HermanBilous)! - Provide more context to ConnectionError when connecting to a room

- [#573](https://github.com/livekit/client-sdk-js/pull/573) [`b71ec61`](https://github.com/livekit/client-sdk-js/commit/b71ec6112fd1c6ac79c8be66fd0327824ee6044a) Thanks [@cnderrauber](https://github.com/cnderrauber)! - Add reconnect reason and signal rtt calculation

- [#581](https://github.com/livekit/client-sdk-js/pull/581) [`6b35e07`](https://github.com/livekit/client-sdk-js/commit/6b35e07482249f103ca2cf186a00ca9c6ff26032) Thanks [@lukasIO](https://github.com/lukasIO)! - Only restart track after permission change if not muted

## 1.6.4

### Patch Changes

- [#566](https://github.com/livekit/client-sdk-js/pull/566) [`f06ee24`](https://github.com/livekit/client-sdk-js/commit/f06ee2439132ba4e71444d6685036df455e0d5cd) Thanks [@otakueadwine](https://github.com/otakueadwine)! - Export CheckStatus type

- [#569](https://github.com/livekit/client-sdk-js/pull/569) [`b53f5c5`](https://github.com/livekit/client-sdk-js/commit/b53f5c56751cc2bc76092af53a85ccde6ae92023) Thanks [@lukasIO](https://github.com/lukasIO)! - Emit `Participant.PermissionChanged` event also for remote participants

- [#562](https://github.com/livekit/client-sdk-js/pull/562) [`b9cd661`](https://github.com/livekit/client-sdk-js/commit/b9cd661c3adb2f8be07cc69855243b9b2dfb8098) Thanks [@kilimnik](https://github.com/kilimnik)! - Emit DeviceUnsupportedError when getDisplayMedia is not supported on a device

- [#568](https://github.com/livekit/client-sdk-js/pull/568) [`6e35f39`](https://github.com/livekit/client-sdk-js/commit/6e35f39870bf4571289ff023f69786aa7ea78d36) Thanks [@davidzhao](https://github.com/davidzhao)! - Fixed handling of unknown signal messages

- [#570](https://github.com/livekit/client-sdk-js/pull/570) [`4ee0f5a`](https://github.com/livekit/client-sdk-js/commit/4ee0f5a3bdc1c50a0f861b4dd25522af5764ff56) Thanks [@lukasIO](https://github.com/lukasIO)! - Drop local participant updates with wrong sid

## 1.6.3

### Patch Changes

- [#553](https://github.com/livekit/client-sdk-js/pull/553) [`fe08625`](https://github.com/livekit/client-sdk-js/commit/fe0862538804b7bc6f0b4f97909890cd57703d5e) Thanks [@cnderrauber](https://github.com/cnderrauber)! - add reconnect response to update configuration while reconnecting

- [#555](https://github.com/livekit/client-sdk-js/pull/555) [`0bc67ba`](https://github.com/livekit/client-sdk-js/commit/0bc67badf5c49a51b316bd201503543cbb5e96ca) Thanks [@cnderrauber](https://github.com/cnderrauber)! - Enable nack for audio track only if offer wants it

- [#559](https://github.com/livekit/client-sdk-js/pull/559) [`d88ca0a`](https://github.com/livekit/client-sdk-js/commit/d88ca0ac0d41b7d3a1e0d3da7c7c648df51b4beb) Thanks [@renovate](https://github.com/apps/renovate)! - Update dependency ua-parser-js to v1.0.33

- [#556](https://github.com/livekit/client-sdk-js/pull/556) [`100ac49`](https://github.com/livekit/client-sdk-js/commit/100ac492d7f8e2ddd0c7af5ab7fb8f43cc6683fd) Thanks [@davidliu](https://github.com/davidliu)! - Allow for internal background timer implementation to be overridden

## 1.6.2

### Patch Changes

- [#551](https://github.com/livekit/client-sdk-js/pull/551) [`a1b34d2`](https://github.com/livekit/client-sdk-js/commit/a1b34d2af7b7e101041b37a9154663a0210c8cfe) Thanks [@lukasIO](https://github.com/lukasIO)! - Enable usage of real local tracks for simulated participants

## 1.6.1

### Patch Changes

- [#543](https://github.com/livekit/client-sdk-js/pull/543) [`fc6a015`](https://github.com/livekit/client-sdk-js/commit/fc6a015e21d2e4bfe850f8199bc8ce4872d1aecd) Thanks [@davidzhao](https://github.com/davidzhao)! - Wait for dimensions to become available prior to publishing

- [#541](https://github.com/livekit/client-sdk-js/pull/541) [`af223f4`](https://github.com/livekit/client-sdk-js/commit/af223f4bf97e46c8e5045af2d4ed67a7459619df) Thanks [@lukasIO](https://github.com/lukasIO)! - Make `unpublishTrack` async, emit TrackUnpublished before TrackPublished within the same update

- [#535](https://github.com/livekit/client-sdk-js/pull/535) [`f1ba2ab`](https://github.com/livekit/client-sdk-js/commit/f1ba2ab986b4712836c1714c4e090f20d0acfc66) Thanks [@lukasIO](https://github.com/lukasIO)! - Improve autoplay when multiple streams are attached to the same media element #534

- [#540](https://github.com/livekit/client-sdk-js/pull/540) [`03711ee`](https://github.com/livekit/client-sdk-js/commit/03711ee3e4bfe6fa428058d7173e4e802c24919d) Thanks [@lukasIO](https://github.com/lukasIO)! - Set local name for simulated participants via updateInfo

- [#542](https://github.com/livekit/client-sdk-js/pull/542) [`260ad8b`](https://github.com/livekit/client-sdk-js/commit/260ad8bf04d348f043e9a29841e7a0e3c1caed69) Thanks [@cnderrauber](https://github.com/cnderrauber)! - Add autosubscribe option for sample

- [#538](https://github.com/livekit/client-sdk-js/pull/538) [`c4786ee`](https://github.com/livekit/client-sdk-js/commit/c4786ee3b478f3ec62852ff8f1307e28a187dc90) Thanks [@lukasIO](https://github.com/lukasIO)! - Fix race edgecase between subsequent disconnect and connect calls

## 1.6.0

### Minor Changes

- [#500](https://github.com/livekit/client-sdk-js/pull/500) [`9a57074`](https://github.com/livekit/client-sdk-js/commit/9a57074a75352a5155448cae0e6c5237704927ea) Thanks [@davideberlein](https://github.com/davideberlein)! - add getActiveAudioOutputDevice method to Room

### Patch Changes

- [#531](https://github.com/livekit/client-sdk-js/pull/531) [`b6cb814`](https://github.com/livekit/client-sdk-js/commit/b6cb8140c0912a4739af5e1c319a06285820c959) Thanks [@lukasIO](https://github.com/lukasIO)! - Add util function to simulate participants within a room

- [#498](https://github.com/livekit/client-sdk-js/pull/498) [`9ce03bc`](https://github.com/livekit/client-sdk-js/commit/9ce03bced8f835d278774387cbd842219b679f70) Thanks [@lukasIO](https://github.com/lukasIO)! - mute track if ended event has been fired on underlying mediastreamtrack

- [#525](https://github.com/livekit/client-sdk-js/pull/525) [`5e824b7`](https://github.com/livekit/client-sdk-js/commit/5e824b7edb1c39f4013ec48cef9226a7d6958555) Thanks [@lukasIO](https://github.com/lukasIO)! - use mutex to prevent simultaneous calls to disconnect

- [#511](https://github.com/livekit/client-sdk-js/pull/511) [`c8e8438`](https://github.com/livekit/client-sdk-js/commit/c8e84382438965509018e4776bad3d634331e176) Thanks [@davidliu](https://github.com/davidliu)! - Track event for track restart

- [#506](https://github.com/livekit/client-sdk-js/pull/506) [`d448805`](https://github.com/livekit/client-sdk-js/commit/d448805b7ae0b018bd86a6edb7a13add1ff754e0) Thanks [@davidliu](https://github.com/davidliu)! - Ignore stopObservingElementInfo calls on RemoteVideoTracks when not adaptive stream

- [#510](https://github.com/livekit/client-sdk-js/pull/510) [`cb67610`](https://github.com/livekit/client-sdk-js/commit/cb6761014b6295f8feb97ecbbd1ca5a98a7bb89d) Thanks [@davidliu](https://github.com/davidliu)! - Fix error in getStats for local tracks on react-native

- [#515](https://github.com/livekit/client-sdk-js/pull/515) [`28febc0`](https://github.com/livekit/client-sdk-js/commit/28febc00b36ca909be779c7072f3ee61a44ee421) Thanks [@lukasIO](https://github.com/lukasIO)! - Add createAudioAnalyser util function

- [#513](https://github.com/livekit/client-sdk-js/pull/513) [`dade768`](https://github.com/livekit/client-sdk-js/commit/dade76860d2fc5745c3d7044848f359947abd08d) Thanks [@lukasIO](https://github.com/lukasIO)! - Set minimum of 1 for scaleResolutionDownBy

- [#514](https://github.com/livekit/client-sdk-js/pull/514) [`6a748fc`](https://github.com/livekit/client-sdk-js/commit/6a748fc5344176c6d49d99e5c9d58eec654cf434) Thanks [@lukasIO](https://github.com/lukasIO)! - grace period for WS to close gracefully

- [#505](https://github.com/livekit/client-sdk-js/pull/505) [`1f264cc`](https://github.com/livekit/client-sdk-js/commit/1f264cc73411f9e3eb3bc70c78121d30fc9d77fe) Thanks [@lukasIO](https://github.com/lukasIO)! - Exp: Add option for passing AudioContext as WebAudioOptions

## 1.5.0

### Minor Changes

- [#487](https://github.com/livekit/client-sdk-js/pull/487) [`e1a0a7e`](https://github.com/livekit/client-sdk-js/commit/e1a0a7ed5d7c198b819204258913926a89320473) Thanks [@lukasIO](https://github.com/lukasIO)! - Sync muted state with track.enabled when calling replaceTrack"

- [#485](https://github.com/livekit/client-sdk-js/pull/485) [`1cc2cab`](https://github.com/livekit/client-sdk-js/commit/1cc2cab20a8dd4ea46449c1d8d8f255e65d75b47) Thanks [@lukasIO](https://github.com/lukasIO)! - Don't filter out default devices in order to detect OS Level default switches

### Patch Changes

- [#489](https://github.com/livekit/client-sdk-js/pull/489) [`efc2039`](https://github.com/livekit/client-sdk-js/commit/efc2039f2d6bbe6a5c11a1af1255f7a0bf8265b1) Thanks [@lukasIO](https://github.com/lukasIO)! - Add ConnnectionCheck helper class

- [#493](https://github.com/livekit/client-sdk-js/pull/493) [`859a103`](https://github.com/livekit/client-sdk-js/commit/859a103dbeb003b333da9b7854e99e9ffbfe89a5) Thanks [@lukasIO](https://github.com/lukasIO)! - Check for ws readystate before attempting to send signal request

- [#412](https://github.com/livekit/client-sdk-js/pull/412) [`ebbd669`](https://github.com/livekit/client-sdk-js/commit/ebbd669423d75c8f885ba41af4515d0860f2f9f9) Thanks [@davidzhao](https://github.com/davidzhao)! - Expose Room.isRecording to indicate if the Room is being recorded

- [#484](https://github.com/livekit/client-sdk-js/pull/484) [`9a54cb4`](https://github.com/livekit/client-sdk-js/commit/9a54cb48877e302b7705acb025393082a78b9234) Thanks [@cnderrauber](https://github.com/cnderrauber)! - Add fps field to SubscribeSetting

- [#492](https://github.com/livekit/client-sdk-js/pull/492) [`b9dedaf`](https://github.com/livekit/client-sdk-js/commit/b9dedafbf07cd655e0c957daf41c0a8832ee2665) Thanks [@lukasIO](https://github.com/lukasIO)! - Only emit metadatachanged if the metadata actually changed

- [#494](https://github.com/livekit/client-sdk-js/pull/494) [`00dbd21`](https://github.com/livekit/client-sdk-js/commit/00dbd218b165d9a3674f7fcc7ac3ee3b357ecab3) Thanks [@lukasIO](https://github.com/lukasIO)! - Fix safari v16 screen share

## 1.4.4

### Patch Changes

- [#475](https://github.com/livekit/client-sdk-js/pull/475) [`7af32ad`](https://github.com/livekit/client-sdk-js/commit/7af32ad3637f26b367411a0a18f1fa613f5b84ec) Thanks [@lukasIO](https://github.com/lukasIO)! - Fix reconnection attempts potentially getting stuck

- [#455](https://github.com/livekit/client-sdk-js/pull/455) [`104db9d`](https://github.com/livekit/client-sdk-js/commit/104db9d3f16564e69301254f9fe99b5c83aad96f) Thanks [@lukasIO](https://github.com/lukasIO)! - Add option for `maxJoinAttempts` to retry establishing initial signal connection if it failed

- [#480](https://github.com/livekit/client-sdk-js/pull/480) [`1452210`](https://github.com/livekit/client-sdk-js/commit/1452210bb14d351d58e1f218b5d78c1bd0d6351f) Thanks [@lukasIO](https://github.com/lukasIO)! - Register engine events on localParticipant when updated

- [#470](https://github.com/livekit/client-sdk-js/pull/470) [`0c0e5cc`](https://github.com/livekit/client-sdk-js/commit/0c0e5cc11b4d4dfa8acab9d9f82c087efcaeca5c) Thanks [@cnderrauber](https://github.com/cnderrauber)! - Add stereo and red support for track level

- [#478](https://github.com/livekit/client-sdk-js/pull/478) [`676ecd3`](https://github.com/livekit/client-sdk-js/commit/676ecd3f0ee30ba3b1a15d4296ff41084c1baf0a) Thanks [@davidliu](https://github.com/davidliu)! - Fixes for latest transceiver APIs in react-native-webrtc

- [#472](https://github.com/livekit/client-sdk-js/pull/472) [`859e3bf`](https://github.com/livekit/client-sdk-js/commit/859e3bfe6543058207bbb5ca58b2e7f5b0b95d55) Thanks [@davidzhao](https://github.com/davidzhao)! - Fixes switchAudioDevice not respecting those preferences for future tracks

- [#477](https://github.com/livekit/client-sdk-js/pull/477) [`4aa82a7`](https://github.com/livekit/client-sdk-js/commit/4aa82a7daaa5d53157b6bc55179ccf13effb815c) Thanks [@cnderrauber](https://github.com/cnderrauber)! - Don't override client provide ice servers

- [#472](https://github.com/livekit/client-sdk-js/pull/472) [`859e3bf`](https://github.com/livekit/client-sdk-js/commit/859e3bfe6543058207bbb5ca58b2e7f5b0b95d55) Thanks [@davidzhao](https://github.com/davidzhao)! - peer connnection timeout is now configurable

- [#471](https://github.com/livekit/client-sdk-js/pull/471) [`022f4cb`](https://github.com/livekit/client-sdk-js/commit/022f4cb7d3939985cd79eee89b5725eea71576c3) Thanks [@davidzhao](https://github.com/davidzhao)! - Allow subscription settings before fully subscribed

## 1.4.3

### Patch Changes

- [#446](https://github.com/livekit/client-sdk-js/pull/446) [`88743d4`](https://github.com/livekit/client-sdk-js/commit/88743d4c4deb438140ce6cf520d2f92d975c4f56) Thanks [@lukasIO](https://github.com/lukasIO)! - Add experimental option to pipe attached audio tracks through webaudio API

- [#466](https://github.com/livekit/client-sdk-js/pull/466) [`a34daba`](https://github.com/livekit/client-sdk-js/commit/a34dabacf2901e10efc9b5e2901b6eb6633af649) Thanks [@davidzhao](https://github.com/davidzhao)! - Fail subscription when reusing stopped MediaStreamTrack

- [#467](https://github.com/livekit/client-sdk-js/pull/467) [`951a07c`](https://github.com/livekit/client-sdk-js/commit/951a07ceb3a19fb9ca0606c1cb33b29b9c415f09) Thanks [@cnderrauber](https://github.com/cnderrauber)! - Update ice servers from join response

- [#464](https://github.com/livekit/client-sdk-js/pull/464) [`af04dda`](https://github.com/livekit/client-sdk-js/commit/af04dda814a8400734f08ddd13b703323e4bc70c) Thanks [@davidzhao](https://github.com/davidzhao)! - Increase default audio bitrate; additional audio presets

- [#469](https://github.com/livekit/client-sdk-js/pull/469) [`fcad243`](https://github.com/livekit/client-sdk-js/commit/fcad2432cc4a6800ce32ec7906c2bdcbd5c223c6) Thanks [@lukasIO](https://github.com/lukasIO)! - Add experimental method to prepare connection for speeding up subsequent first connection attempt

- [#468](https://github.com/livekit/client-sdk-js/pull/468) [`91541ab`](https://github.com/livekit/client-sdk-js/commit/91541ab357125fb21d441d9f6669e0df9be31e17) Thanks [@lukasIO](https://github.com/lukasIO)! - Emit AudioPlaybackFailed event also in experimental web audio mix mode"

## 1.4.2

### Patch Changes

- [#451](https://github.com/livekit/client-sdk-js/pull/451) [`627aa3e`](https://github.com/livekit/client-sdk-js/commit/627aa3e84df8a6c26a3488f053250ce2112d3050) Thanks [@lukasIO](https://github.com/lukasIO)! - Add isLocal getter to participant class

- [#462](https://github.com/livekit/client-sdk-js/pull/462) [`5024e26`](https://github.com/livekit/client-sdk-js/commit/5024e26a1c839e17bb073d5316c6a91911474754) Thanks [@KallynGowdy](https://github.com/KallynGowdy)! - Fix local participant events being disabled before tracks unpublished

- [#463](https://github.com/livekit/client-sdk-js/pull/463) [`90260b8`](https://github.com/livekit/client-sdk-js/commit/90260b87ab41813645a87a5c4cbbfd41d688b84a) Thanks [@lukasIO](https://github.com/lukasIO)! - Fix: reset connect future to undefined when promise is rejected

- [#456](https://github.com/livekit/client-sdk-js/pull/456) [`84f00b8`](https://github.com/livekit/client-sdk-js/commit/84f00b893d46bc7b1d0d6fa3785ace85f08f0584) Thanks [@davidzhao](https://github.com/davidzhao)! - Added supportsAV1 helper function

- [#460](https://github.com/livekit/client-sdk-js/pull/460) [`ef3c38f`](https://github.com/livekit/client-sdk-js/commit/ef3c38f60ae77011ffc48b496d4baaff9ffa1214) Thanks [@scott-lc](https://github.com/scott-lc)! - Add missing ESM types subpath export condition to support TS Node16 and NodeNext module resolution

## 1.4.1

### Patch Changes

- [#448](https://github.com/livekit/client-sdk-js/pull/448) [`14f71de`](https://github.com/livekit/client-sdk-js/commit/14f71de26fa06a1fe23a767d0584921a7a7de1a1) Thanks [@lukasIO](https://github.com/lukasIO)! - fix localTrackUnpublish true by default

## 1.4.0

### Minor Changes

- [#443](https://github.com/livekit/client-sdk-js/pull/443) [`438d067`](https://github.com/livekit/client-sdk-js/commit/438d0679bf215b5c5edd20b900d1dca0362d651c) Thanks [@lukasIO](https://github.com/lukasIO)! - **Breaking** Decouple SubscriptionStatus and SubscriptionPermissionStatus

### Patch Changes

- [#440](https://github.com/livekit/client-sdk-js/pull/440) [`b74eae6`](https://github.com/livekit/client-sdk-js/commit/b74eae69adedeed814e1fad09073ac2c431de49c) Thanks [@davidzhao](https://github.com/davidzhao)! - Improve handling of connection resume failures

- [#445](https://github.com/livekit/client-sdk-js/pull/445) [`dabebad`](https://github.com/livekit/client-sdk-js/commit/dabebad0574a874915366223783182338f84f02b) Thanks [@lukasIO](https://github.com/lukasIO)! - Increase event listener limit

## 1.3.3

### Patch Changes

- [#423](https://github.com/livekit/client-sdk-js/pull/423) [`e4ead3d`](https://github.com/livekit/client-sdk-js/commit/e4ead3d0f62d935214b97f76c274da66991c34ea) Thanks [@lukasIO](https://github.com/lukasIO)! - Add subscriptionStatusChanged event and isDesired getter for RemoteTrack Publications

- [#432](https://github.com/livekit/client-sdk-js/pull/432) [`3c80714`](https://github.com/livekit/client-sdk-js/commit/3c807143e69f94950f4969eb309d81200280c41a) Thanks [@cnderrauber](https://github.com/cnderrauber)! - send previous server offer when reconnecting

- [#431](https://github.com/livekit/client-sdk-js/pull/431) [`4004426`](https://github.com/livekit/client-sdk-js/commit/40044262a3c30d039dbc8f66dac8dffb3ecdd8f3) Thanks [@lukasIO](https://github.com/lukasIO)! - Add RoomEvent.Connected, fix connectFuture rejection exception

- [#436](https://github.com/livekit/client-sdk-js/pull/436) [`1715877`](https://github.com/livekit/client-sdk-js/commit/17158772667a221f2fc31d459473f9a049402fbe) Thanks [@lukasIO](https://github.com/lukasIO)! - Use explicit defaults for room and connect options

## 1.3.2

### Patch Changes

- [#425](https://github.com/livekit/client-sdk-js/pull/425) [`6a77802`](https://github.com/livekit/client-sdk-js/commit/6a77802eb4d585b99a1152dbde9e6f70da064862) Thanks [@cnderrauber](https://github.com/cnderrauber)! - add participant id when reconnecting

- [#427](https://github.com/livekit/client-sdk-js/pull/427) [`c477b77`](https://github.com/livekit/client-sdk-js/commit/c477b77e5dac3e2cf8c734193f9f94e529b45311) Thanks [@cnderrauber](https://github.com/cnderrauber)! - fix video attach to incorrect element when tranceiver reuse

## 1.3.1

### Patch Changes

- [#414](https://github.com/livekit/client-sdk-js/pull/414) [`6b748da`](https://github.com/livekit/client-sdk-js/commit/6b748daaff89f3f6c903283af88440d35b0273d5) Thanks [@cnderrauber](https://github.com/cnderrauber)! - add force relay configuration

* [#418](https://github.com/livekit/client-sdk-js/pull/418) [`82107cf`](https://github.com/livekit/client-sdk-js/commit/82107cf5861a5fe903cb3f91ab32900c9d116cf4) Thanks [@davidzhao](https://github.com/davidzhao)! - Fixed compatibility with older browsers with setCodecPreferences (Chrome 96)

- [#419](https://github.com/livekit/client-sdk-js/pull/419) [`84a96b2`](https://github.com/livekit/client-sdk-js/commit/84a96b2bd8d354c68f94f8a3309bf13803aad8ab) Thanks [@cnderrauber](https://github.com/cnderrauber)! - fix video track lost for safari migration

* [#420](https://github.com/livekit/client-sdk-js/pull/420) [`0c45c73`](https://github.com/livekit/client-sdk-js/commit/0c45c73095a46b876810d90306c3d350f4a5f857) Thanks [@lukasIO](https://github.com/lukasIO)! - Add permission track event to typed callbacks

## 1.3.0

### Minor Changes

- [#407](https://github.com/livekit/client-sdk-js/pull/407) [`91f6648`](https://github.com/livekit/client-sdk-js/commit/91f6648da8c3b888b3f063a46f62aeaa47ec0b3d) Thanks [@lukasIO](https://github.com/lukasIO)! - add types for publication events

### Patch Changes

- [#400](https://github.com/livekit/client-sdk-js/pull/400) [`d6dd20c`](https://github.com/livekit/client-sdk-js/commit/d6dd20c00633d9e3303c813ba303812c75783ba9) Thanks [@lukasIO](https://github.com/lukasIO)! - Fallback to unmunged sdp for answer

* [#334](https://github.com/livekit/client-sdk-js/pull/334) [`8cb17ec`](https://github.com/livekit/client-sdk-js/commit/8cb17ecc6170b4d723813c90ee5a04cb0bd5fe2b) Thanks [@lukasIO](https://github.com/lukasIO)! - Add experimental support for fallback codec

- [#396](https://github.com/livekit/client-sdk-js/pull/396) [`027ede3`](https://github.com/livekit/client-sdk-js/commit/027ede3c6f776a1c5e690e38a58a7edca1583fbd) Thanks [@davidzhao](https://github.com/davidzhao)! - Send current network type to server

* [#410](https://github.com/livekit/client-sdk-js/pull/410) [`5b31a19`](https://github.com/livekit/client-sdk-js/commit/5b31a19543b80f90349a086016ac9fc37a91bcb1) Thanks [@lukasIO](https://github.com/lukasIO)! - Move monitor APIs in parent classes

- [#393](https://github.com/livekit/client-sdk-js/pull/393) [`bfad4b3`](https://github.com/livekit/client-sdk-js/commit/bfad4b319398c9c06d439bb9dcc03d185ac37b74) Thanks [@wcarle](https://github.com/wcarle)! - Prevent multiple redundant monitors from being started if start is called multiple times on a RemoteTrack

* [#397](https://github.com/livekit/client-sdk-js/pull/397) [`0f6b399`](https://github.com/livekit/client-sdk-js/commit/0f6b39999b90ceabd83daca7617171a145ad6dca) Thanks [@cnderrauber](https://github.com/cnderrauber)! - enable simucalst codecs for firefox

- [#403](https://github.com/livekit/client-sdk-js/pull/403) [`fb2b221`](https://github.com/livekit/client-sdk-js/commit/fb2b221555eccc9ec0f1bc663d3b383dd513f384) Thanks [@lukasIO](https://github.com/lukasIO)! - Add fallback for addTrack if addTransceiver is not supported

* [#405](https://github.com/livekit/client-sdk-js/pull/405) [`2983939`](https://github.com/livekit/client-sdk-js/commit/2983939a48068def9ee0cf86c18af7f9ef0ec045) Thanks [@lukasIO](https://github.com/lukasIO)! - Update browserslist

## 1.2.11

### Patch Changes

- [#390](https://github.com/livekit/client-sdk-js/pull/390) [`b9ca04f`](https://github.com/livekit/client-sdk-js/commit/b9ca04fccd9c3e7657069a9ad3da7d64c9df5a5a) Thanks [@davidzhao](https://github.com/davidzhao)! - Enable ICE restart for Firefox

* [#388](https://github.com/livekit/client-sdk-js/pull/388) [`5cc13e4`](https://github.com/livekit/client-sdk-js/commit/5cc13e481e65e6fe853fd709d02c0c30b72f0647) Thanks [@cnderrauber](https://github.com/cnderrauber)! - don't declare simulcast codecs for firefox

- [#395](https://github.com/livekit/client-sdk-js/pull/395) [`213233c`](https://github.com/livekit/client-sdk-js/commit/213233c4009c906c75a78b8b2221abfcb3863305) Thanks [@lukasIO](https://github.com/lukasIO)! - Set metadata when creating participant

* [#391](https://github.com/livekit/client-sdk-js/pull/391) [`e5851ea`](https://github.com/livekit/client-sdk-js/commit/e5851ea6c9a8c4be74f60e9ece6f72cdf3560b5b) Thanks [@lukasIO](https://github.com/lukasIO)! - Log consolidated serverinfo on connect

- [#384](https://github.com/livekit/client-sdk-js/pull/384) [`961fcc4`](https://github.com/livekit/client-sdk-js/commit/961fcc42f27e8298daf13e198067268d8b4d12ce) Thanks [@davidzhao](https://github.com/davidzhao)! - Perform full reconnect faster when server is unable to resume

* [#385](https://github.com/livekit/client-sdk-js/pull/385) [`c11d99d`](https://github.com/livekit/client-sdk-js/commit/c11d99d89f8465ffa63ee19b58d1c2d4223e5479) Thanks [@lukasIO](https://github.com/lukasIO)! - Don't reacquire muted tracks when app visibility changes

- [#386](https://github.com/livekit/client-sdk-js/pull/386) [`e64cb2f`](https://github.com/livekit/client-sdk-js/commit/e64cb2fbb7368bc0d45c46f927e705353e8c1882) Thanks [@lukasIO](https://github.com/lukasIO)! - Add fallback to unmunged sdp offer

## 1.2.10

### Patch Changes

- [#377](https://github.com/livekit/client-sdk-js/pull/377) [`08d6c60`](https://github.com/livekit/client-sdk-js/commit/08d6c60bdfa17eeb1dc419d4344dd602c2cec1db) Thanks [@lukasIO](https://github.com/lukasIO)! - Add ping pong heartbeat for signal connection

* [#382](https://github.com/livekit/client-sdk-js/pull/382) [`8499723`](https://github.com/livekit/client-sdk-js/commit/8499723cccb0bba3eed4fe169888dfd412c55de8) Thanks [@lukasIO](https://github.com/lukasIO)! - Disable simulcast if an user provides empty array for custom layers

- [#376](https://github.com/livekit/client-sdk-js/pull/376) [`8ec5c02`](https://github.com/livekit/client-sdk-js/commit/8ec5c02c73fe10ba7e56cd7e8740f44e0db74f23) Thanks [@lukasIO](https://github.com/lukasIO)! - Fix setting name on RemoteParticipant creation

* [#379](https://github.com/livekit/client-sdk-js/pull/379) [`fc97dd1`](https://github.com/livekit/client-sdk-js/commit/fc97dd13f390ceb8d0da4ed398a54f6f400f1efd) Thanks [@davidzhao](https://github.com/davidzhao)! - Use stricter union types for oneof messages

## 1.2.9

### Patch Changes

- [#374](https://github.com/livekit/client-sdk-js/pull/374) [`148b9ff`](https://github.com/livekit/client-sdk-js/commit/148b9ffb78eb07f3bc287eb6f53f05bf900e9118) Thanks [@lukasIO](https://github.com/lukasIO)! - Detach track on unsubscribe

## 1.2.8

### Patch Changes

- [#371](https://github.com/livekit/client-sdk-js/pull/371) [`e1a004e`](https://github.com/livekit/client-sdk-js/commit/e1a004e4edb003c26bc7976546fff959b60bfd25) Thanks [@lukasIO](https://github.com/lukasIO)! - only set volume on attach if elementVolume has been previously set

## 1.2.7

### Patch Changes

- [#369](https://github.com/livekit/client-sdk-js/pull/369) [`a3d6de6`](https://github.com/livekit/client-sdk-js/commit/a3d6de6b342a6650d66e10565d4e18aec250e7e4) Thanks [@lukasIO](https://github.com/lukasIO)! - Fix reconnect promise not being reset after reconnect attempts are exhausted

## 1.2.6

### Patch Changes

- [#365](https://github.com/livekit/client-sdk-js/pull/365) [`d040aff`](https://github.com/livekit/client-sdk-js/commit/d040aff8d2de895cb95bd3928e285a669a698bde) Thanks [@lukasIO](https://github.com/lukasIO)! - Make sure that ParticipantConnected fires before related TrackEvents

* [#368](https://github.com/livekit/client-sdk-js/pull/368) [`7f8d1ce`](https://github.com/livekit/client-sdk-js/commit/7f8d1cec98b707c1c9a8eaf17457cc39e3f8da2c) Thanks [@lukasIO](https://github.com/lukasIO)! - Return after signal connection failed

- [#366](https://github.com/livekit/client-sdk-js/pull/366) [`b52e7b3`](https://github.com/livekit/client-sdk-js/commit/b52e7b3433405759b63e413e1c17b5d3683ef809) Thanks [@lukasIO](https://github.com/lukasIO)! - Handle reconnect case in onTrackAdded

## 1.2.5

### Patch Changes

- [#359](https://github.com/livekit/client-sdk-js/pull/359) [`31e3883`](https://github.com/livekit/client-sdk-js/commit/31e3883ebe7fc57dc0269b374031029dc5730652) Thanks [@lukasIO](https://github.com/lukasIO)! - Only reject connection promise if it was triggered by a call to connect()

* [#358](https://github.com/livekit/client-sdk-js/pull/358) [`8ceceff`](https://github.com/livekit/client-sdk-js/commit/8ceceff691d055191aab61109a56ea64a8984c43) Thanks [@lukasIO](https://github.com/lukasIO)! - Add safari explicitly to browserslist, to ensure compatibility with Safari 11"

- [#363](https://github.com/livekit/client-sdk-js/pull/363) [`4665f74`](https://github.com/livekit/client-sdk-js/commit/4665f740e68c0f049989cdd1db130c38eb5dd624) Thanks [@lukasIO](https://github.com/lukasIO)! - Decrease publication timeout to 10s and clean local state on failed unpublish attempts

* [#311](https://github.com/livekit/client-sdk-js/pull/311) [`61a41e0`](https://github.com/livekit/client-sdk-js/commit/61a41e0c13f6d2e7ea69da2cfab9bf8220df3dcf) Thanks [@lukasIO](https://github.com/lukasIO)! - Avoid multiple calls to getUserMedia for getLocalDevices

- [#332](https://github.com/livekit/client-sdk-js/pull/332) [`b3df000`](https://github.com/livekit/client-sdk-js/commit/b3df0009788ecd86ee06b774253d50339468bf88) Thanks [@lukasIO](https://github.com/lukasIO)! - Clean up simulcast codecs in unpublishTrack

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

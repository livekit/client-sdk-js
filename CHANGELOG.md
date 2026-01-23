# Change Log

## 2.17.0

### Minor Changes

- Add new rtc path that defaults to single peer connection mode and falls back to legacy dual pc - [#1785](https://github.com/livekit/client-sdk-js/pull/1785) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Use TypedPromise for typesafe errors - [#1770](https://github.com/livekit/client-sdk-js/pull/1770) ([@lukasIO](https://github.com/lukasIO))

- e2ee: ensure frame cryptor transform setup works for rapid subscription changes - [#1789](https://github.com/livekit/client-sdk-js/pull/1789) ([@lukasIO](https://github.com/lukasIO))

## 2.16.1

### Patch Changes

- export type RoomEventCallbacks - [#1599](https://github.com/livekit/client-sdk-js/pull/1599) ([@shincurry](https://github.com/shincurry))

- Remove experimental tag on some stabilized features - [#1777](https://github.com/livekit/client-sdk-js/pull/1777) ([@lukasIO](https://github.com/lukasIO))

- Tag errors by name - [#1764](https://github.com/livekit/client-sdk-js/pull/1764) ([@lukasIO](https://github.com/lukasIO))

- Fix connection check issues with pinned regions - [#1775](https://github.com/livekit/client-sdk-js/pull/1775) ([@lukasIO](https://github.com/lukasIO))

- Control latency of lossy data channel - [#1754](https://github.com/livekit/client-sdk-js/pull/1754) ([@cnderrauber](https://github.com/cnderrauber))

- Add docs comments making it clear TokenSource-prefixed exported types shouldn't be used for TokenSource construction - [#1776](https://github.com/livekit/client-sdk-js/pull/1776) ([@1egoman](https://github.com/1egoman))

- Fix leaking memory by removing event listener from correct scope - [#1768](https://github.com/livekit/client-sdk-js/pull/1768) ([@wuhkuh](https://github.com/wuhkuh))

## 2.16.0

### Minor Changes

- Expose new encryption option field - [#1750](https://github.com/livekit/client-sdk-js/pull/1750) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Wait for dc buffer status low for all published packets - [#1691](https://github.com/livekit/client-sdk-js/pull/1691) ([@lukasIO](https://github.com/lukasIO))

- Fix message loss during resuming/migration - [#1757](https://github.com/livekit/client-sdk-js/pull/1757) ([@cnderrauber](https://github.com/cnderrauber))

- Cancel region refresh on invalid tokens - [#1755](https://github.com/livekit/client-sdk-js/pull/1755) ([@lukasIO](https://github.com/lukasIO))

- Add connectionCount tracking and stop auto refetching after timeout - [#1756](https://github.com/livekit/client-sdk-js/pull/1756) ([@lukasIO](https://github.com/lukasIO))

- Add explicit error types for future helper - [#1753](https://github.com/livekit/client-sdk-js/pull/1753) ([@lukasIO](https://github.com/lukasIO))

- fix(LocalTrackAudio): prevent overwriting constraint flags - [#1744](https://github.com/livekit/client-sdk-js/pull/1744) ([@itamayo](https://github.com/itamayo))

## 2.15.16

### Patch Changes

- Fix slow start on vp9 - [#1740](https://github.com/livekit/client-sdk-js/pull/1740) ([@lukasIO](https://github.com/lukasIO))

- Keep text / byte stream handlers between room disconnects - [#1741](https://github.com/livekit/client-sdk-js/pull/1741) ([@1egoman](https://github.com/1egoman))

- Export RoomEventCallbacks - [#1738](https://github.com/livekit/client-sdk-js/pull/1738) ([@haydenbr](https://github.com/haydenbr))

- Speed up network switch recovery - [#1745](https://github.com/livekit/client-sdk-js/pull/1745) ([@lukasIO](https://github.com/lukasIO))

- Ensure unexpected websocket disconnects trigger reconnect flow - [#1748](https://github.com/livekit/client-sdk-js/pull/1748) ([@lukasIO](https://github.com/lukasIO))

## 2.15.15

### Patch Changes

- Add exponential backoff strategy in case of connection failures - [#1715](https://github.com/livekit/client-sdk-js/pull/1715) ([@lukasIO](https://github.com/lukasIO))

- Add participant as an optional parameter to EncryptionError events emitted on room level - [#1723](https://github.com/livekit/client-sdk-js/pull/1723) ([@CSantosM](https://github.com/CSantosM))

- fix(e2ee): propagate worker data decryption errors and reject corresponding promises - [#1729](https://github.com/livekit/client-sdk-js/pull/1729) ([@CSantosM](https://github.com/CSantosM))

- Fix potential undefined access while disconnecting - [#1734](https://github.com/livekit/client-sdk-js/pull/1734) ([@lukasIO](https://github.com/lukasIO))

- Add new areTokenSourceFetchOptionsEqual function - [#1733](https://github.com/livekit/client-sdk-js/pull/1733) ([@1egoman](https://github.com/1egoman))

- Ensure publication isn't attempted after timeout rejected the promise - [#1725](https://github.com/livekit/client-sdk-js/pull/1725) ([@lukasIO](https://github.com/lukasIO))

## 2.15.14

### Patch Changes

- Apply server supplied cache control settings for region url provider - [#1669](https://github.com/livekit/client-sdk-js/pull/1669) ([@lukasIO](https://github.com/lukasIO))

- Only export types for TokenSource variants to try to push users to use the TokenSource.foo static constructors instead - [#1707](https://github.com/livekit/client-sdk-js/pull/1707) ([@1egoman](https://github.com/1egoman))

- Add check to ensure track visibility update only happens when `adaptiveStream` is enabled - [#1712](https://github.com/livekit/client-sdk-js/pull/1712) ([@1egoman](https://github.com/1egoman))

- Cache region settings per project - [#1709](https://github.com/livekit/client-sdk-js/pull/1709) ([@lukasIO](https://github.com/lukasIO))

- Export decodeTokenPayload from package - [#1710](https://github.com/livekit/client-sdk-js/pull/1710) ([@1egoman](https://github.com/1egoman))

## 2.15.13

### Patch Changes

- Disable ScriptTransform for Chromium based browsers - [#1703](https://github.com/livekit/client-sdk-js/pull/1703) ([@lukasIO](https://github.com/lukasIO))

## 2.15.12

### Patch Changes

- Remove AbortSignal.any usage - [#1700](https://github.com/livekit/client-sdk-js/pull/1700) ([@lukasIO](https://github.com/lukasIO))

## 2.15.11

### Patch Changes

- Fix abort race resulting in multiple code paths trying to close the ws connection - [#1695](https://github.com/livekit/client-sdk-js/pull/1695) ([@lukasIO](https://github.com/lukasIO))

- fix the RPC comment and clam the timeout if the provided value is less than 8s - [#1694](https://github.com/livekit/client-sdk-js/pull/1694) ([@xianshijing-lk](https://github.com/xianshijing-lk))

- Fix track mapping when single peer connectionis used - [#1696](https://github.com/livekit/client-sdk-js/pull/1696) ([@lukasIO](https://github.com/lukasIO))

## 2.15.10

### Patch Changes

- Ensure leave requests can be sent before join response is received - [#1687](https://github.com/livekit/client-sdk-js/pull/1687) ([@lukasIO](https://github.com/lukasIO))

- Increase RPC total timeout to 15s and connection timeout to 7s for better reliability under network latency. - [#1692](https://github.com/livekit/client-sdk-js/pull/1692) ([@xianshijing-lk](https://github.com/xianshijing-lk))

- Add sdp to answer debug log - [#1689](https://github.com/livekit/client-sdk-js/pull/1689) ([@lukasIO](https://github.com/lukasIO))

## 2.15.9

### Patch Changes

- Populate participant identity when receiving encrypted e2ee packets - [#1679](https://github.com/livekit/client-sdk-js/pull/1679) ([@lukasIO](https://github.com/lukasIO))

- Export supportsAudioOutputSelection helper - [#1676](https://github.com/livekit/client-sdk-js/pull/1676) ([@lukasIO](https://github.com/lukasIO))

- Fix bug in isResponseExpired token expiry checking logic - [#1683](https://github.com/livekit/client-sdk-js/pull/1683) ([@1egoman](https://github.com/1egoman))

- Use WebSocketStream for sequential signal processing - [#1638](https://github.com/livekit/client-sdk-js/pull/1638) ([@lukasIO](https://github.com/lukasIO))

- Support for data channel encryption on React-Native - [#1678](https://github.com/livekit/client-sdk-js/pull/1678) ([@davidliu](https://github.com/davidliu))

- Single peer connection support - [#1682](https://github.com/livekit/client-sdk-js/pull/1682) ([@lukasIO](https://github.com/lukasIO))

## 2.15.8

### Patch Changes

- Add preliminary support for data message decryption - [#1595](https://github.com/livekit/client-sdk-js/pull/1595) ([@lukasIO](https://github.com/lukasIO))

- Add video autoplay attributes to PublishVideoCheck - [#1648](https://github.com/livekit/client-sdk-js/pull/1648) ([@Doomann](https://github.com/Doomann))

- Ensure handleDisconnect is called also when already in Reconnecting state - [#1671](https://github.com/livekit/client-sdk-js/pull/1671) ([@lukasIO](https://github.com/lukasIO))

- Fix TS 5.9 generic Uint8Array declaration when inferred - [#1668](https://github.com/livekit/client-sdk-js/pull/1668) ([@lukasIO](https://github.com/lukasIO))

- Properly clean up event listeners in getNewAudioContext() - [#1660](https://github.com/livekit/client-sdk-js/pull/1660) ([@indexds](https://github.com/indexds))

- Avoid uncaught errors related to send/disconnect races - [#1674](https://github.com/livekit/client-sdk-js/pull/1674) ([@bryfox](https://github.com/bryfox))

- Register online listener in engine's join - [#1658](https://github.com/livekit/client-sdk-js/pull/1658) ([@lukasIO](https://github.com/lukasIO))

- add TokenSource token fetching abstraction - [#1645](https://github.com/livekit/client-sdk-js/pull/1645) ([@1egoman](https://github.com/1egoman))

## 2.15.7

### Patch Changes

- Ensure permission event is only emitted once for local participant - [#1643](https://github.com/livekit/client-sdk-js/pull/1643) ([@lukasIO](https://github.com/lukasIO))

- internal typing fix - add missing async to postAction - [#1644](https://github.com/livekit/client-sdk-js/pull/1644) ([@1egoman](https://github.com/1egoman))

- Ensure mid is always interpreted as string - [#1641](https://github.com/livekit/client-sdk-js/pull/1641) ([@lukasIO](https://github.com/lukasIO))

## 2.15.6

### Patch Changes

- Query audio track with all constraints present - [#1624](https://github.com/livekit/client-sdk-js/pull/1624) ([@lukasIO](https://github.com/lukasIO))

- Ensure RemoteVideoTracks without any attached elements are stopped by adaptiveStream - [#1625](https://github.com/livekit/client-sdk-js/pull/1625) ([@lukasIO](https://github.com/lukasIO))

- Disable av1 for firefox - [#1631](https://github.com/livekit/client-sdk-js/pull/1631) ([@cnderrauber](https://github.com/cnderrauber))

- Use SIF payload hashes to ensure integrity - [#1629](https://github.com/livekit/client-sdk-js/pull/1629) ([@lukasIO](https://github.com/lukasIO))

- fix(e2ee): h264 publishing with e2ee enabled - [#1632](https://github.com/livekit/client-sdk-js/pull/1632) ([@lukasIO](https://github.com/lukasIO))

- Check for encrypted track if room unencrypted, and if so, emit an event - [#1627](https://github.com/livekit/client-sdk-js/pull/1627) ([@1egoman](https://github.com/1egoman))

## 2.15.5

### Patch Changes

- feat: add ability to include an AbortSignal when reading from a datastream - [#1611](https://github.com/livekit/client-sdk-js/pull/1611) ([@1egoman](https://github.com/1egoman))

- Fix error when `unwrapConstraint` receives an empty deviceId when creating local tracks - [#1594](https://github.com/livekit/client-sdk-js/pull/1594) ([@mpnri](https://github.com/mpnri))

- feat(e2ee): add h265 as supported codec for encryption - [#1618](https://github.com/livekit/client-sdk-js/pull/1618) ([@lukasIO](https://github.com/lukasIO))

- Handle numerous small data stream errors / state inconsistiencies with throwing explicit errors - [#1613](https://github.com/livekit/client-sdk-js/pull/1613) ([@1egoman](https://github.com/1egoman))

- lock all APIs that change underlying track with the same lock - [#1620](https://github.com/livekit/client-sdk-js/pull/1620) ([@lukasIO](https://github.com/lukasIO))

## 2.15.4

### Patch Changes

- Fix iOS local track recorder mimetype for preconnect buffer - [#1609](https://github.com/livekit/client-sdk-js/pull/1609) ([@lukasIO](https://github.com/lukasIO))

- Add support for react-native preconnect audio - [#1598](https://github.com/livekit/client-sdk-js/pull/1598) ([@davidliu](https://github.com/davidliu))

- Clear LocalParticipant futures at start of disconnect, not at end - [#1604](https://github.com/livekit/client-sdk-js/pull/1604) ([@1egoman](https://github.com/1egoman))

- fix: ensure audio output switching is disabled for safari based browsers - [#1602](https://github.com/livekit/client-sdk-js/pull/1602) ([@lukasIO](https://github.com/lukasIO))

- skip errant signal layer leave message when already disconnected - [#1601](https://github.com/livekit/client-sdk-js/pull/1601) ([@1egoman](https://github.com/1egoman))

## 2.15.3

### Patch Changes

- fix: retry processor playback on abort error - [#1592](https://github.com/livekit/client-sdk-js/pull/1592) ([@lukasIO](https://github.com/lukasIO))

- fix: correct handling of signal connect future - [#1600](https://github.com/livekit/client-sdk-js/pull/1600) ([@lukasIO](https://github.com/lukasIO))

## 2.15.2

### Patch Changes

- fix: don't reset signal connect future on setup - [#1587](https://github.com/livekit/client-sdk-js/pull/1587) ([@lukasIO](https://github.com/lukasIO))

## 2.15.1

### Patch Changes

- fix: ensure offerId is only increased when offers are actually generated - [#1585](https://github.com/livekit/client-sdk-js/pull/1585) ([@lukasIO](https://github.com/lukasIO))

## 2.15.0

### Minor Changes

- allow manual controls even when adaptiveStream is enabled - [#1569](https://github.com/livekit/client-sdk-js/pull/1569) ([@davidzhao](https://github.com/davidzhao))

- Add support for H265 - [#1576](https://github.com/livekit/client-sdk-js/pull/1576) ([@cnderrauber](https://github.com/cnderrauber))

### Patch Changes

- Update active device immediately for muted video tracks - [#1573](https://github.com/livekit/client-sdk-js/pull/1573) ([@yashjain-99](https://github.com/yashjain-99))

## 2.14.0

### Minor Changes

- Add ParticipantEvent.LocalTrackCpuConstrained - [#1553](https://github.com/livekit/client-sdk-js/pull/1553) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Ensure feature support checks include iOS checks - [#1563](https://github.com/livekit/client-sdk-js/pull/1563) ([@lukasIO](https://github.com/lukasIO))

- Ensure encryption transforms are set up as soon as sender is created - [#1561](https://github.com/livekit/client-sdk-js/pull/1561) ([@lukasIO](https://github.com/lukasIO))

- Wrap createAndSendOffer with mutex - [#1567](https://github.com/livekit/client-sdk-js/pull/1567) ([@lukasIO](https://github.com/lukasIO))

## 2.13.8

### Patch Changes

- Fix transceiver reuse causing destination stream closed errors - [#1559](https://github.com/livekit/client-sdk-js/pull/1559) ([@lukasIO](https://github.com/lukasIO))

## 2.13.7

### Patch Changes

- Revert "Fix transceiver reuse causing destination stream closed error… - [#1557](https://github.com/livekit/client-sdk-js/pull/1557) ([@lukasIO](https://github.com/lukasIO))

## 2.13.6

### Patch Changes

- Fix transceiver reuse causing destination stream closed errors - [#1554](https://github.com/livekit/client-sdk-js/pull/1554) ([@lukasIO](https://github.com/lukasIO))

- Stop MediaStream tracks at the end of the video check - [#1552](https://github.com/livekit/client-sdk-js/pull/1552) ([@svajunas-budrys](https://github.com/svajunas-budrys))

- disable dyncast for svc encoding - [#1556](https://github.com/livekit/client-sdk-js/pull/1556) ([@cnderrauber](https://github.com/cnderrauber))

- Update active device immediately for muted audio tracks - [#1526](https://github.com/livekit/client-sdk-js/pull/1526) ([@yashjain-99](https://github.com/yashjain-99))

- Drop outdated sdp answers and forward offer ids - [#1547](https://github.com/livekit/client-sdk-js/pull/1547) ([@lukasIO](https://github.com/lukasIO))

## 2.13.5

### Patch Changes

- Improve e2e reliablility of data channel - [#1546](https://github.com/livekit/client-sdk-js/pull/1546) ([@cnderrauber](https://github.com/cnderrauber))

- do not expose token with Moved events - [#1549](https://github.com/livekit/client-sdk-js/pull/1549) ([@davidzhao](https://github.com/davidzhao))

## 2.13.4

### Patch Changes

- fix: ensure signal connect future is reset after disconnecting from room - [#1533](https://github.com/livekit/client-sdk-js/pull/1533) ([@lukasIO](https://github.com/lukasIO))

## 2.13.3

### Patch Changes

- Add media recorder types - [#1530](https://github.com/livekit/client-sdk-js/pull/1530) ([@lukasIO](https://github.com/lukasIO))

## 2.13.2

### Patch Changes

- Add LocalTrackRecorder helper - [#1430](https://github.com/livekit/client-sdk-js/pull/1430) ([@lukasIO](https://github.com/lukasIO))

- fix: skip default device selection on iOS - [#1528](https://github.com/livekit/client-sdk-js/pull/1528) ([@lukasIO](https://github.com/lukasIO))

## 2.13.1

### Patch Changes

- fix: don't try to set audio output on Safari without explicit user interaction - [#1527](https://github.com/livekit/client-sdk-js/pull/1527) ([@lukasIO](https://github.com/lukasIO))

- Fix svc encoding for safari 18.4 - [#1519](https://github.com/livekit/client-sdk-js/pull/1519) ([@cnderrauber](https://github.com/cnderrauber))

- feat: add MediaDeviceKind to media device error event - [#1525](https://github.com/livekit/client-sdk-js/pull/1525) ([@lukasIO](https://github.com/lukasIO))

- fix: remove track from transceiver if add request failed - [#1524](https://github.com/livekit/client-sdk-js/pull/1524) ([@lukasIO](https://github.com/lukasIO))

## 2.13.0

### Minor Changes

- Unorder the lossy data channel - [#1512](https://github.com/livekit/client-sdk-js/pull/1512) ([@bcherry](https://github.com/bcherry))

- Add ParticipantActive event to signal data message readiness - [#1517](https://github.com/livekit/client-sdk-js/pull/1517) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Respect facingMode in createLocalTracks - [#1514](https://github.com/livekit/client-sdk-js/pull/1514) ([@lukasIO](https://github.com/lukasIO))

- fix(datastreams): forward attributes on streamBytes API - [#1518](https://github.com/livekit/client-sdk-js/pull/1518) ([@lukasIO](https://github.com/lukasIO))

## 2.12.0

### Minor Changes

- Support moving participant to another room - [#1511](https://github.com/livekit/client-sdk-js/pull/1511) ([@cnderrauber](https://github.com/cnderrauber))

- feature: E2E Allow sharing ratcheted material out-of-band - [#1503](https://github.com/livekit/client-sdk-js/pull/1503) ([@BillCarsonFr](https://github.com/BillCarsonFr))

### Patch Changes

- Catch failing set sink id promise - [#1508](https://github.com/livekit/client-sdk-js/pull/1508) ([@lukasIO](https://github.com/lukasIO))

## 2.11.4

### Patch Changes

- Ensure userProvided tracks are not overriden from within the SDK - [#1500](https://github.com/livekit/client-sdk-js/pull/1500) ([@lukasIO](https://github.com/lukasIO))

- Revert "Add option (`KeyProviderOptions`) to allowKeyExtraction." - [#1502](https://github.com/livekit/client-sdk-js/pull/1502) ([@toger5](https://github.com/toger5))

## 2.11.3

### Patch Changes

- Convert URL Scheme When Creating WebSocket Object - [#1492](https://github.com/livekit/client-sdk-js/pull/1492) ([@rktguswjd](https://github.com/rktguswjd))

- fix: avoid mutating create track options - [#1497](https://github.com/livekit/client-sdk-js/pull/1497) ([@lukasIO](https://github.com/lukasIO))

## 2.11.2

### Patch Changes

- fix: request audio/video in create local track helpers - [#1485](https://github.com/livekit/client-sdk-js/pull/1485) ([@lukasIO](https://github.com/lukasIO))

## 2.11.1

### Patch Changes

- fix: device handling follow up - [#1483](https://github.com/livekit/client-sdk-js/pull/1483) ([@lukasIO](https://github.com/lukasIO))

## 2.11.0

### Minor Changes

- Defer publishing until signal is connected - [#1465](https://github.com/livekit/client-sdk-js/pull/1465) ([@lukasIO](https://github.com/lukasIO))

- Address chrome ideal device handling change by defaulting to exact device matching - [#1478](https://github.com/livekit/client-sdk-js/pull/1478) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Add streamBytes method - [#1473](https://github.com/livekit/client-sdk-js/pull/1473) ([@lukasIO](https://github.com/lukasIO))

- Default to exact matching and retry on unspecified ideal narrowing - [#1479](https://github.com/livekit/client-sdk-js/pull/1479) ([@lukasIO](https://github.com/lukasIO))

- fix: search params for older browsers - [#1480](https://github.com/livekit/client-sdk-js/pull/1480) ([@radko93](https://github.com/radko93))

## 2.10.0

### Minor Changes

- Add prefer regression for backup codec policy - [#1456](https://github.com/livekit/client-sdk-js/pull/1456) ([@cnderrauber](https://github.com/cnderrauber))

### Patch Changes

- Improve error message for WS errors during connection attempt - [#1466](https://github.com/livekit/client-sdk-js/pull/1466) ([@lukasIO](https://github.com/lukasIO))

- Closable spatial layers for svc encoding - [#1458](https://github.com/livekit/client-sdk-js/pull/1458) ([@cnderrauber](https://github.com/cnderrauber))

- Improve connection URL handling and add unit tests - [#1468](https://github.com/livekit/client-sdk-js/pull/1468) ([@lukasIO](https://github.com/lukasIO))

- Pass facingMode to initial getUserMedia call in track restart - [#1451](https://github.com/livekit/client-sdk-js/pull/1451) ([@lukasIO](https://github.com/lukasIO))

## 2.9.9

### Patch Changes

- Fix trailing slash handling in WebSocket URL pathname - [#1440](https://github.com/livekit/client-sdk-js/pull/1440) ([@Tanney-102](https://github.com/Tanney-102))

- Skip incoming track if it's ended - [#1438](https://github.com/livekit/client-sdk-js/pull/1438) ([@lukasIO](https://github.com/lukasIO))

- Ensure only suspended audio context gets resumed - [#1452](https://github.com/livekit/client-sdk-js/pull/1452) ([@lukasIO](https://github.com/lukasIO))

- Do not log transcription received events - [#1453](https://github.com/livekit/client-sdk-js/pull/1453) ([@lukasIO](https://github.com/lukasIO))

## 2.9.8

### Patch Changes

- Use string instead of passing url object to WebSocket constructor - [#1443](https://github.com/livekit/client-sdk-js/pull/1443) ([@davidliu](https://github.com/davidliu))

## 2.9.7

### Patch Changes

- Add attributes to SendTextOptions - [#1441](https://github.com/livekit/client-sdk-js/pull/1441) ([@lukasIO](https://github.com/lukasIO))

## 2.9.6

### Patch Changes

- Automatically attempt to resume suspended audio contexts on click - [#1431](https://github.com/livekit/client-sdk-js/pull/1431) ([@lukasIO](https://github.com/lukasIO))

- Fix ignored constraints in LocalTrack.restart - [#1435](https://github.com/livekit/client-sdk-js/pull/1435) ([@rktguswjd](https://github.com/rktguswjd))

- log ice candidates as debug rather than trace - [#1437](https://github.com/livekit/client-sdk-js/pull/1437) ([@haydenbr](https://github.com/haydenbr))

- fix: handle server url with params correctly - [#1366](https://github.com/livekit/client-sdk-js/pull/1366) ([@jiyeyuran](https://github.com/jiyeyuran))

## 2.9.5

### Patch Changes

- fix: properly remove text stream controllers on stream close - [#1422](https://github.com/livekit/client-sdk-js/pull/1422) ([@lukasIO](https://github.com/lukasIO))

- Reject publishing with insufficient permissions present - [#1418](https://github.com/livekit/client-sdk-js/pull/1418) ([@lukasIO](https://github.com/lukasIO))

## 2.9.4

### Patch Changes

- Improve utf8 text split and add unit test - [#1414](https://github.com/livekit/client-sdk-js/pull/1414) ([@lukasIO](https://github.com/lukasIO))

- Fix applying default processors from captureDefaults - [#1416](https://github.com/livekit/client-sdk-js/pull/1416) ([@lukasIO](https://github.com/lukasIO))

## 2.9.3

### Patch Changes

- Fix utf8 text split iteration - [#1412](https://github.com/livekit/client-sdk-js/pull/1412) ([@lukasIO](https://github.com/lukasIO))

## 2.9.2

### Patch Changes

- Add auto chunking to text streams - [#1410](https://github.com/livekit/client-sdk-js/pull/1410) ([@lukasIO](https://github.com/lukasIO))

- Disable simulcast for screenshare backup codec - [#1409](https://github.com/livekit/client-sdk-js/pull/1409) ([@cnderrauber](https://github.com/cnderrauber))

- added new connection tests - [#1402](https://github.com/livekit/client-sdk-js/pull/1402) ([@davidzhao](https://github.com/davidzhao))

## 2.9.1

### Patch Changes

- Fix correct typing on async iterator stream readers - [#1401](https://github.com/livekit/client-sdk-js/pull/1401) ([@lukasIO](https://github.com/lukasIO))

## 2.9.0

### Minor Changes

- Add backupCodecPolicy to TrackPublishDefaults - [#1399](https://github.com/livekit/client-sdk-js/pull/1399) ([@cnderrauber](https://github.com/cnderrauber))

  The default policy of backup codec is `codec regression` for maxium compatibility, which means the publisher stops sending primary codec and all subscribers will receive backup codec even primary codec is supported.
  It changes the default behavior `multi-codec simulcast` in the previous version, will not break the functionality of the previous version but only cause potential extra bandwidth usage. The user can set the policy to `multi-codec simulcast` to keep the previous behavior.

- Add DataStream support - [#1301](https://github.com/livekit/client-sdk-js/pull/1301) ([@lukasIO](https://github.com/lukasIO))

- Move RPC registration to room level and deprecate localParticipant level registration - [#1396](https://github.com/livekit/client-sdk-js/pull/1396) ([@lukasIO](https://github.com/lukasIO))

- Populate name property of LiveKit errors and add reasonName for enums - [#1385](https://github.com/livekit/client-sdk-js/pull/1385) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Replace internal instanceof checks with typeguards - [#1378](https://github.com/livekit/client-sdk-js/pull/1378) ([@lukasIO](https://github.com/lukasIO))

- Remove track from pending publishing on device errors - [#1380](https://github.com/livekit/client-sdk-js/pull/1380) ([@lukasIO](https://github.com/lukasIO))

- Refine room event argument logs - [#1382](https://github.com/livekit/client-sdk-js/pull/1382) ([@lukasIO](https://github.com/lukasIO))

- Allow audio processing for react native without AudioContext - [#1395](https://github.com/livekit/client-sdk-js/pull/1395) ([@davidliu](https://github.com/davidliu))

- use a error code 14 for data publish errors - [#1374](https://github.com/livekit/client-sdk-js/pull/1374) ([@davidzhao](https://github.com/davidzhao))

- Export TrackType from @livekit/protocol - [#1370](https://github.com/livekit/client-sdk-js/pull/1370) ([@Philzen](https://github.com/Philzen))

- Only emit TrackSubscriptionEvent once on room - [#1392](https://github.com/livekit/client-sdk-js/pull/1392) ([@lukasIO](https://github.com/lukasIO))

- Redact access_token parameter in debug logs - [#1394](https://github.com/livekit/client-sdk-js/pull/1394) ([@hughns](https://github.com/hughns))

- Don't hang on audio context trying to resume - [#1379](https://github.com/livekit/client-sdk-js/pull/1379) ([@lukasIO](https://github.com/lukasIO))

## 2.8.1

### Patch Changes

- expose inbound-rtp.id as streamId - [#1367](https://github.com/livekit/client-sdk-js/pull/1367) ([@s-hamdananwar](https://github.com/s-hamdananwar))

- Emit ActiveDeviceChanged event also for audio-output - [#1372](https://github.com/livekit/client-sdk-js/pull/1372) ([@lukasIO](https://github.com/lukasIO))

## 2.8.0

### Minor Changes

- Improve default device handling - [#1357](https://github.com/livekit/client-sdk-js/pull/1357) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Ensure maxFps applies for very low framerates - [#1362](https://github.com/livekit/client-sdk-js/pull/1362) ([@lukasIO](https://github.com/lukasIO))

- Emit MediaDeviceError only when acquiring tracks fails - [#1365](https://github.com/livekit/client-sdk-js/pull/1365) ([@lukasIO](https://github.com/lukasIO))

## 2.7.5

### Patch Changes

- fix(deps): update dependency @livekit/protocol to v1.29.4 - [#1352](https://github.com/livekit/client-sdk-js/pull/1352) ([@renovate](https://github.com/apps/renovate))

## 2.7.4

### Patch Changes

- Support swapping out the E2EEManager for react-native - [#1345](https://github.com/livekit/client-sdk-js/pull/1345) ([@davidliu](https://github.com/davidliu))

- fix: prevent monitoring leak when stopOnUnpublish is false - [#1348](https://github.com/livekit/client-sdk-js/pull/1348) ([@davidzhao](https://github.com/davidzhao))

- Prevent undefined access to engine in connection reconciler - [#1349](https://github.com/livekit/client-sdk-js/pull/1349) ([@lukasIO](https://github.com/lukasIO))

- Fix sdp connection address mismatch - [#1342](https://github.com/livekit/client-sdk-js/pull/1342) ([@cnderrauber](https://github.com/cnderrauber))

- Set participant attributes as soon as possible, making them available in all related events - [#1344](https://github.com/livekit/client-sdk-js/pull/1344) ([@holzgeist](https://github.com/holzgeist))

## 2.7.3

### Patch Changes

- Only wait for publications that are pending already - [#1339](https://github.com/livekit/client-sdk-js/pull/1339) ([@lukasIO](https://github.com/lukasIO))

## 2.7.2

### Patch Changes

- Fix blocking main thread on parallel publishing requests - [#1336](https://github.com/livekit/client-sdk-js/pull/1336) ([@lukasIO](https://github.com/lukasIO))

## 2.7.1

### Patch Changes

- Fix processor passing in CreateLocalTracks options - [#1329](https://github.com/livekit/client-sdk-js/pull/1329) ([@lukasIO](https://github.com/lukasIO))

- Await pending publications with timeout - [#1324](https://github.com/livekit/client-sdk-js/pull/1324) ([@lukasIO](https://github.com/lukasIO))

## 2.7.0

### Minor Changes

- Add support for detecting video element visibility in Document PiP (can be tested on the examples/demo) - [#1325](https://github.com/livekit/client-sdk-js/pull/1325) ([@davideberlein](https://github.com/davideberlein))

### Patch Changes

- Expose `ReconnectContext` and `ReconnectPolicy`, for use in custom reconnection implementations. - [#1328](https://github.com/livekit/client-sdk-js/pull/1328) ([@wuhkuh](https://github.com/wuhkuh))

## 2.6.3

### Patch Changes

- Add voiceIsolation constraint to AudioCaptureOptions - [#1320](https://github.com/livekit/client-sdk-js/pull/1320) ([@lukasIO](https://github.com/lukasIO))

- Forward disconnect reason on leave requests and ConnectionErrors - [#1323](https://github.com/livekit/client-sdk-js/pull/1323) ([@lukasIO](https://github.com/lukasIO))

## 2.6.2

### Patch Changes

- Use capturing mediastreamtrack settings for audio feature detection - [#1318](https://github.com/livekit/client-sdk-js/pull/1318) ([@lukasIO](https://github.com/lukasIO))

## 2.6.1

### Patch Changes

- Add ConnectionErrorReason when cancelling ongoing connection attempt - [#1315](https://github.com/livekit/client-sdk-js/pull/1315) ([@lukasIO](https://github.com/lukasIO))

- Make Remote Tracks `getSenderStats` method public - [#1309](https://github.com/livekit/client-sdk-js/pull/1309) ([@mpnri](https://github.com/mpnri))

## 2.6.0

### Minor Changes

- Add RPC feature support - [#1282](https://github.com/livekit/client-sdk-js/pull/1282) ([@bcherry](https://github.com/bcherry))

### Patch Changes

- fix: mimeTypeToVideoCodecString should not throw - [#1302](https://github.com/livekit/client-sdk-js/pull/1302) ([@davidzhao](https://github.com/davidzhao))

- Keep dd extension id in the session - [#1297](https://github.com/livekit/client-sdk-js/pull/1297) ([@cnderrauber](https://github.com/cnderrauber))

## 2.5.10

### Patch Changes

- Reset `joinAttempts` when closing RTCEngine - [#1291](https://github.com/livekit/client-sdk-js/pull/1291) ([@mpnri](https://github.com/mpnri))

- Increase default audio bitrates - [#1295](https://github.com/livekit/client-sdk-js/pull/1295) ([@davidzhao](https://github.com/davidzhao))

- Use shared mutex helper package - [#1289](https://github.com/livekit/client-sdk-js/pull/1289) ([@lukasIO](https://github.com/lukasIO))

## 2.5.9

### Patch Changes

- Track E2EE key validity on a per index basis - [#1284](https://github.com/livekit/client-sdk-js/pull/1284) ([@hughns](https://github.com/hughns))

- Use happy-dom for testing instead of jsdom - [#1283](https://github.com/livekit/client-sdk-js/pull/1283) ([@hughns](https://github.com/hughns))

- Fix attribute deletion - [#1285](https://github.com/livekit/client-sdk-js/pull/1285) ([@lukasIO](https://github.com/lukasIO))

- [e2ee] await key update before emitting key ratchet event - [#1288](https://github.com/livekit/client-sdk-js/pull/1288) ([@hughns](https://github.com/hughns))

## 2.5.8

### Patch Changes

- Add metrics support - [#1278](https://github.com/livekit/client-sdk-js/pull/1278) ([@lukasIO](https://github.com/lukasIO))

- Fix DTX and stereo feature reporting - [#1281](https://github.com/livekit/client-sdk-js/pull/1281) ([@lukasIO](https://github.com/lukasIO))

- Add SIP publish DTMF feature - [#1277](https://github.com/livekit/client-sdk-js/pull/1277) ([@s-hamdananwar](https://github.com/s-hamdananwar))

## 2.5.7

### Patch Changes

- Actually allow E2EE keyring size of 256 - [#1268](https://github.com/livekit/client-sdk-js/pull/1268) ([@hughns](https://github.com/hughns))

- Expose server version info - [#1267](https://github.com/livekit/client-sdk-js/pull/1267) ([@lukasIO](https://github.com/lukasIO))

- Only emit TrackStreamStateChanged events on changed stream state - [#1199](https://github.com/livekit/client-sdk-js/pull/1199) ([@lukasIO](https://github.com/lukasIO))

- Fix duplicate ParticipantPermissionsChanged updates for the local participant - [#1270](https://github.com/livekit/client-sdk-js/pull/1270) ([@davidzhao](https://github.com/davidzhao))

## 2.5.6

### Patch Changes

- Handle e2ee worker messages sequentially - [#1260](https://github.com/livekit/client-sdk-js/pull/1260) ([@lukasIO](https://github.com/lukasIO))

## 2.5.5

### Patch Changes

- Fix changed attribute computation - [#1257](https://github.com/livekit/client-sdk-js/pull/1257) ([@lukasIO](https://github.com/lukasIO))

## 2.5.4

### Patch Changes

- Export ChatMessage type - [#1254](https://github.com/livekit/client-sdk-js/pull/1254) ([@lukasIO](https://github.com/lukasIO))

## 2.5.3

### Patch Changes

- Ensure republishing is finished when calling setTrackEnabled methods - [#1250](https://github.com/livekit/client-sdk-js/pull/1250) ([@lukasIO](https://github.com/lukasIO))

- Add dedicated chat API - [#1224](https://github.com/livekit/client-sdk-js/pull/1224) ([@lukasIO](https://github.com/lukasIO))

- Fix permissions for all devices being requested when connecting/disconnecting devices - [#1249](https://github.com/livekit/client-sdk-js/pull/1249) ([@lukasIO](https://github.com/lukasIO))

## 2.5.2

### Patch Changes

- Pass connect options to room from connection checkers - [#1245](https://github.com/livekit/client-sdk-js/pull/1245) ([@jespermjonsson](https://github.com/jespermjonsson))

- Avoid parallel offer processing - [#1244](https://github.com/livekit/client-sdk-js/pull/1244) ([@lukasIO](https://github.com/lukasIO))

- Switch active device if previously selected device becomes unavailable - [#1237](https://github.com/livekit/client-sdk-js/pull/1237) ([@lukasIO](https://github.com/lukasIO))

- Treat MissingKey as decryption failure to prevent spamming the logs - [#1241](https://github.com/livekit/client-sdk-js/pull/1241) ([@hughns](https://github.com/hughns))

- Update API docs for `room.getLocalDevices` - [#1243](https://github.com/livekit/client-sdk-js/pull/1243) ([@lukasIO](https://github.com/lukasIO))

- Fix trackProcessor creation from LocalParticipant.createTracks - [#1247](https://github.com/livekit/client-sdk-js/pull/1247) ([@lukasIO](https://github.com/lukasIO))

## 2.5.1

### Patch Changes

- Use ReturnTypes of built-in functions for critical timers - [#1236](https://github.com/livekit/client-sdk-js/pull/1236) ([@lukasIO](https://github.com/lukasIO))

- Set default scalabilityMode to L3T3_KEY in sample/comment - [#1238](https://github.com/livekit/client-sdk-js/pull/1238) ([@cnderrauber](https://github.com/cnderrauber))

- Expose localTrackSubscribed event on localParticipant and room - [#1229](https://github.com/livekit/client-sdk-js/pull/1229) ([@lukasIO](https://github.com/lukasIO))

- fast track publication - [#1228](https://github.com/livekit/client-sdk-js/pull/1228) ([@cnderrauber](https://github.com/cnderrauber))

- Add firstReceivedTime and lastReceivedTime to received TranscriptionSegments - [#1223](https://github.com/livekit/client-sdk-js/pull/1223) ([@lukasIO](https://github.com/lukasIO))

- Ensure SVC layers are starting from LOW quality - [#1226](https://github.com/livekit/client-sdk-js/pull/1226) ([@lukasIO](https://github.com/lukasIO))

## 2.5.0

### Minor Changes

- Add RemoteTrack.setPlayoutDelay and make receiver non-optional in RemoteTrack constructor - [#1209](https://github.com/livekit/client-sdk-js/pull/1209) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Update protocol - [#1214](https://github.com/livekit/client-sdk-js/pull/1214) ([@lukasIO](https://github.com/lukasIO))

- Add support for generic RequestResponse - [#1221](https://github.com/livekit/client-sdk-js/pull/1221) ([@lukasIO](https://github.com/lukasIO))

- Clear pingInterval at start of disconnect processing - [#1217](https://github.com/livekit/client-sdk-js/pull/1217) ([@lukasIO](https://github.com/lukasIO))

- Log offer before munging - [#1218](https://github.com/livekit/client-sdk-js/pull/1218) ([@lukasIO](https://github.com/lukasIO))

- Add internal LocalTrackSubscribed engine event - [#1222](https://github.com/livekit/client-sdk-js/pull/1222) ([@lukasIO](https://github.com/lukasIO))

- Use kind instead of mediaType for outbound-rtp stats in PublishVideoCheck and PublishAudioCheck helpers - [#1207](https://github.com/livekit/client-sdk-js/pull/1207) ([@svajunas-budrys](https://github.com/svajunas-budrys))

## 2.4.2

### Patch Changes

- Only retry other regions if connection attempt has not been cancelled - [#1205](https://github.com/livekit/client-sdk-js/pull/1205) ([@lukasIO](https://github.com/lukasIO))

## 2.4.1

### Patch Changes

- Set region settings when fetching them on first connection - [#1201](https://github.com/livekit/client-sdk-js/pull/1201) ([@lukasIO](https://github.com/lukasIO))

- Handle SignalReconnecting event in ReconnectCheck helper - [#1198](https://github.com/livekit/client-sdk-js/pull/1198) ([@svajunas-budrys](https://github.com/svajunas-budrys))

- Fix RoomEvent.ParticipantAttributesChanged not emitting for local participant (#1200) - [#1203](https://github.com/livekit/client-sdk-js/pull/1203) ([@lukasIO](https://github.com/lukasIO))

## 2.4.0

### Minor Changes

- Make metadata updates async and throw after timeout - [#1168](https://github.com/livekit/client-sdk-js/pull/1168) ([@lukasIO](https://github.com/lukasIO))

- Add support for participant attributes - [#1184](https://github.com/livekit/client-sdk-js/pull/1184) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Include participant identity in CryptoError errors - [#1186](https://github.com/livekit/client-sdk-js/pull/1186) ([@hughns](https://github.com/hughns))

- Fix wording in CryptorError debug log - [#1189](https://github.com/livekit/client-sdk-js/pull/1189) ([@zesun96](https://github.com/zesun96))

- Only set loglevel for specified logger if present - [#1196](https://github.com/livekit/client-sdk-js/pull/1196) ([@lukasIO](https://github.com/lukasIO))

- Ensure permission request for listDevices works for audio outputs in Firefox - [#1188](https://github.com/livekit/client-sdk-js/pull/1188) ([@lukasIO](https://github.com/lukasIO))

## 2.3.2

### Patch Changes

- Emit transcription on transcribedParticipantIdentity and update protocol - [#1177](https://github.com/livekit/client-sdk-js/pull/1177) ([@lukasIO](https://github.com/lukasIO))

- Wait for pending publish promise before attempting to unpublish track - [#1178](https://github.com/livekit/client-sdk-js/pull/1178) ([@lukasIO](https://github.com/lukasIO))

- Add vp9 support for E2EE - [#836](https://github.com/livekit/client-sdk-js/pull/836) ([@lukasIO](https://github.com/lukasIO))

- Ensure app visibility listeners are only added for video tracks - [#1173](https://github.com/livekit/client-sdk-js/pull/1173) ([@renovate](https://github.com/apps/renovate))

- Fix activeSpeakers has old participant when participant sid changed - [#1180](https://github.com/livekit/client-sdk-js/pull/1180) ([@zesun96](https://github.com/zesun96))

## 2.3.1

### Patch Changes

- Export audio and video stats types - [#1166](https://github.com/livekit/client-sdk-js/pull/1166) ([@lukasIO](https://github.com/lukasIO))

## 2.3.0

### Minor Changes

- Disable webAudioMix by default - [#1159](https://github.com/livekit/client-sdk-js/pull/1159) ([@lukasIO](https://github.com/lukasIO))

- Add RoomEvent.SignalReconnecting and ConnectionState.SignalReconnecting - [#1158](https://github.com/livekit/client-sdk-js/pull/1158) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Fix normalising of default device Ids in DeviceManager - [#1162](https://github.com/livekit/client-sdk-js/pull/1162) ([@lukasIO](https://github.com/lukasIO))

- Fix resumeUpstream with local track processors enabled - [#1157](https://github.com/livekit/client-sdk-js/pull/1157) ([@kyleparrott](https://github.com/kyleparrott))

## 2.2.0

### Minor Changes

- Allow processors to be set as part of track publish options - [#1143](https://github.com/livekit/client-sdk-js/pull/1143) ([@lukasIO](https://github.com/lukasIO))

- Support SIP DTMF data messages. - [#1130](https://github.com/livekit/client-sdk-js/pull/1130) ([@dennwc](https://github.com/dennwc))

### Patch Changes

- Use legacy SVC encoding specification for React-Native - [#1093](https://github.com/livekit/client-sdk-js/pull/1093) ([@davidzhao](https://github.com/davidzhao))

- Make sure setting a new processor doesn't remove the processor html element - [#1149](https://github.com/livekit/client-sdk-js/pull/1149) ([@lukasIO](https://github.com/lukasIO))

- Add support for ParticipantKind - [#1150](https://github.com/livekit/client-sdk-js/pull/1150) ([@lukasIO](https://github.com/lukasIO))

- Also set audioOutput on audioElements when using webAudioMix - [#1145](https://github.com/livekit/client-sdk-js/pull/1145) ([@lukasIO](https://github.com/lukasIO))

## 2.1.5

### Patch Changes

- Override sender getter on LocalVideoTrack - [#1141](https://github.com/livekit/client-sdk-js/pull/1141) ([@lukasIO](https://github.com/lukasIO))

## 2.1.4

### Patch Changes

- Add degradationPreference option for LocalVideoTrack - [#1138](https://github.com/livekit/client-sdk-js/pull/1138) ([@lukasIO](https://github.com/lukasIO))

- Honor calls to track.stop() during an ongoing restart attempt - [#1131](https://github.com/livekit/client-sdk-js/pull/1131) ([@lukasIO](https://github.com/lukasIO))

- Add check for getSynchronizationSources support - [#1136](https://github.com/livekit/client-sdk-js/pull/1136) ([@lukasIO](https://github.com/lukasIO))

- Add leave req full reconnect simulation scenario - [#1137](https://github.com/livekit/client-sdk-js/pull/1137) ([@lukasIO](https://github.com/lukasIO))

- Ensure DD ext for svc codecs - [#1132](https://github.com/livekit/client-sdk-js/pull/1132) ([@cnderrauber](https://github.com/cnderrauber))

## 2.1.3

### Patch Changes

- Don't create data channel of publisher until sending data message - [#1118](https://github.com/livekit/client-sdk-js/pull/1118) ([@cnderrauber](https://github.com/cnderrauber))

- Add timestamp to exp timeSyncUpdate - [#1126](https://github.com/livekit/client-sdk-js/pull/1126) ([@lukasIO](https://github.com/lukasIO))

- Update to protocol 13 with LeaveRequest Action - [#1127](https://github.com/livekit/client-sdk-js/pull/1127) ([@lukasIO](https://github.com/lukasIO))

## 2.1.2

### Patch Changes

- Add support for transcription handling - [#1119](https://github.com/livekit/client-sdk-js/pull/1119) ([@lukasIO](https://github.com/lukasIO))

## 2.1.1

### Patch Changes

- Allow simulcast together with E2EE for supported Safari versions - [#1117](https://github.com/livekit/client-sdk-js/pull/1117) ([@lukasIO](https://github.com/lukasIO))
  Also fixes the simulcast behaviour for iOS Chrome prior to 17.2

- Remove internal calls to setCodecPreferences on senders - [#1114](https://github.com/livekit/client-sdk-js/pull/1114) ([@lukasIO](https://github.com/lukasIO))

## 2.1.0

### Minor Changes

- Force playback after app visibility changes back to visible - [#1106](https://github.com/livekit/client-sdk-js/pull/1106) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Allow options to be passed into connection checker - [#1102](https://github.com/livekit/client-sdk-js/pull/1102) ([@cscherban](https://github.com/cscherban))

- Await data publisher connection without multiple negotiations - [#1107](https://github.com/livekit/client-sdk-js/pull/1107) ([@lukasIO](https://github.com/lukasIO))

- Signal local audio track feature updates - [#1087](https://github.com/livekit/client-sdk-js/pull/1087) ([@lukasIO](https://github.com/lukasIO))

- Export internal mutex util - [#1110](https://github.com/livekit/client-sdk-js/pull/1110) ([@lukasIO](https://github.com/lukasIO))

- Add non-svc mode (L1T1) for vp9/av1 - [#1109](https://github.com/livekit/client-sdk-js/pull/1109) ([@cnderrauber](https://github.com/cnderrauber))

- Support more scalability mode - [#1104](https://github.com/livekit/client-sdk-js/pull/1104) ([@cnderrauber](https://github.com/cnderrauber))

## 2.0.10

### Patch Changes

- Create processorElement before processor init - [#1091](https://github.com/livekit/client-sdk-js/pull/1091) ([@xdef](https://github.com/xdef))

- Improve VideoSenderStats with FPS and targetBitrate - [#1090](https://github.com/livekit/client-sdk-js/pull/1090) ([@davidzhao](https://github.com/davidzhao))

## 2.0.9

### Patch Changes

- Fix publishing for Chrome M124. Read capabilities from RtcRTPReceiver instead of from sender - [#1088](https://github.com/livekit/client-sdk-js/pull/1088) ([@lukasIO](https://github.com/lukasIO))

- Add keyring size to keyprovider options - [#1085](https://github.com/livekit/client-sdk-js/pull/1085) ([@lukasIO](https://github.com/lukasIO))

## 2.0.8

### Patch Changes

- Set degradationPreference to maintain-resolution for screen share tracks - [#1080](https://github.com/livekit/client-sdk-js/pull/1080) ([@davidzhao](https://github.com/davidzhao))

- Export browser parser - [#1074](https://github.com/livekit/client-sdk-js/pull/1074) ([@lukasIO](https://github.com/lukasIO))

- Don't restart track when processor stops - [#1081](https://github.com/livekit/client-sdk-js/pull/1081) ([@lukasIO](https://github.com/lukasIO))

- Handle SVC compatibility with Safari and Chrome prior to M113 - [#1079](https://github.com/livekit/client-sdk-js/pull/1079) ([@davidzhao](https://github.com/davidzhao))

- Add sanity check for duplicate cryptors and log more errors - [#1082](https://github.com/livekit/client-sdk-js/pull/1082) ([@lukasIO](https://github.com/lukasIO))

- Fix quality issues with SVC screenshares - [#1077](https://github.com/livekit/client-sdk-js/pull/1077) ([@davidzhao](https://github.com/davidzhao))

- Export SubscriptionError from protocol - [#1075](https://github.com/livekit/client-sdk-js/pull/1075) ([@davidzhao](https://github.com/davidzhao))

## 2.0.7

### Patch Changes

- Recreate engine before trying to connect to another region - [#1071](https://github.com/livekit/client-sdk-js/pull/1071) ([@lukasIO](https://github.com/lukasIO))

- Add experimental preferCurrentTab screen share capture option - [#1070](https://github.com/livekit/client-sdk-js/pull/1070) ([@lukasIO](https://github.com/lukasIO))

- Fix FPS and latency issues with VP9 screenshare - [#1069](https://github.com/livekit/client-sdk-js/pull/1069) ([@davidzhao](https://github.com/davidzhao))

## 2.0.6

### Patch Changes

- Read deviceId from source mediastreamtrack - [#1068](https://github.com/livekit/client-sdk-js/pull/1068) ([@lukasIO](https://github.com/lukasIO))

- Replace protocol submodule with npm package - [#1067](https://github.com/livekit/client-sdk-js/pull/1067) ([@lukasIO](https://github.com/lukasIO))

- Demote facingMode logs to trace - [#1065](https://github.com/livekit/client-sdk-js/pull/1065) ([@lukasIO](https://github.com/lukasIO))

## 2.0.5

### Patch Changes

- Set logExtension on all livekit loggers if not specified - [#1061](https://github.com/livekit/client-sdk-js/pull/1061) ([@lukasIO](https://github.com/lukasIO))

- Don't treat PC config error as SignalReconnectError - [#1052](https://github.com/livekit/client-sdk-js/pull/1052) ([@lukasIO](https://github.com/lukasIO))

- Align logContext fields with server naming - [#1062](https://github.com/livekit/client-sdk-js/pull/1062) ([@lukasIO](https://github.com/lukasIO))

- Remove some noisy e2ee logs - [#1057](https://github.com/livekit/client-sdk-js/pull/1057) ([@lukasIO](https://github.com/lukasIO))

- Throw error if trying to connect with a non-compatible browser - [#1064](https://github.com/livekit/client-sdk-js/pull/1064) ([@davidliu](https://github.com/davidliu))

## 2.0.4

### Patch Changes

- Normalize audiooutput device id for webAudio mode - [#1051](https://github.com/livekit/client-sdk-js/pull/1051) ([@lukasIO](https://github.com/lukasIO))

- Add page leave log - [#1056](https://github.com/livekit/client-sdk-js/pull/1056) ([@lukasIO](https://github.com/lukasIO))

- Add `stopProcessor` param to replaceTrack function - [#1040](https://github.com/livekit/client-sdk-js/pull/1040) ([@lukasIO](https://github.com/lukasIO))

- Set audio context on track as early as possible - [#1053](https://github.com/livekit/client-sdk-js/pull/1053) ([@lukasIO](https://github.com/lukasIO))

- Export logger names to configure fine grained logging - [#1042](https://github.com/livekit/client-sdk-js/pull/1042) ([@lukasIO](https://github.com/lukasIO))

- Emit Restarting as soon as both signal and pc connection are severed - [#1047](https://github.com/livekit/client-sdk-js/pull/1047) ([@lukasIO](https://github.com/lukasIO))

- Add VideoPreset overload for more granular options settings - [#1044](https://github.com/livekit/client-sdk-js/pull/1044) ([@lukasIO](https://github.com/lukasIO))

- Send worker loglevel in init message - [#1045](https://github.com/livekit/client-sdk-js/pull/1045) ([@lukasIO](https://github.com/lukasIO))

- Only perform mute/unmute actions if necessary - [#1048](https://github.com/livekit/client-sdk-js/pull/1048) ([@lukasIO](https://github.com/lukasIO))

- Make sure a 401 ConnectionError is thrown on invalid token permissions - [#1049](https://github.com/livekit/client-sdk-js/pull/1049) ([@lukasIO](https://github.com/lukasIO))

## 2.0.3

### Patch Changes

- Fix transceiver reuse for e2ee and add more verbose e2ee debug logging - [#1041](https://github.com/livekit/client-sdk-js/pull/1041) ([@lukasIO](https://github.com/lukasIO))

- Make sure only one track restart request is processed at a time - [#1039](https://github.com/livekit/client-sdk-js/pull/1039) ([@lukasIO](https://github.com/lukasIO))

- Emit event when track processor changes - [#1036](https://github.com/livekit/client-sdk-js/pull/1036) ([@lukasIO](https://github.com/lukasIO))

## 2.0.2

### Patch Changes

- Ignore unknown fields in protobuf parsing - [#1029](https://github.com/livekit/client-sdk-js/pull/1029) ([@lukasIO](https://github.com/lukasIO))

- Stronger kind type for Tracks to improve processor support - [#1033](https://github.com/livekit/client-sdk-js/pull/1033) ([@lukasIO](https://github.com/lukasIO))

- Verify participant identity matching when unsetting transformer for e2ee - [#1032](https://github.com/livekit/client-sdk-js/pull/1032) ([@lukasIO](https://github.com/lukasIO))

## 2.0.1

### Patch Changes

- Sync disabled track sids - [#1025](https://github.com/livekit/client-sdk-js/pull/1025) ([@lukasIO](https://github.com/lukasIO))

- Remove googConstraints from RTCPeerConnection constructor - [#1022](https://github.com/livekit/client-sdk-js/pull/1022) ([@lukasIO](https://github.com/lukasIO))

## 2.0.0

### Major Changes

- Remove experimental hint for webAudioMix and enable it by default - [#1013](https://github.com/livekit/client-sdk-js/pull/1013) ([@lukasIO](https://github.com/lukasIO))

- Add support for async room sid. Removes `room.sid` and replaces it with `await room.getSid()`. - [#983](https://github.com/livekit/client-sdk-js/pull/983) ([@lukasIO](https://github.com/lukasIO))

- Change publishData signature - [#946](https://github.com/livekit/client-sdk-js/pull/946) ([@lukasIO](https://github.com/lukasIO))

- Remote `OFF` option from VideoQuality enum - [#985](https://github.com/livekit/client-sdk-js/pull/985) ([@lukasIO](https://github.com/lukasIO))

- Rename `participant.tracks` to `participant.trackPublications` - [#947](https://github.com/livekit/client-sdk-js/pull/947) ([@lukasIO](https://github.com/lukasIO))

- Rename getTrack to getTrackPublications and participants to remoteParticipants - [#945](https://github.com/livekit/client-sdk-js/pull/945) ([@lukasIO](https://github.com/lukasIO))

- Remove previously deprecated APIs - [#948](https://github.com/livekit/client-sdk-js/pull/948) ([@lukasIO](https://github.com/lukasIO))

### Minor Changes

- Don't emit RoomEvent.Reconnecting for resumes - [#1012](https://github.com/livekit/client-sdk-js/pull/1012) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Update participant info when getting participant - [#1009](https://github.com/livekit/client-sdk-js/pull/1009) ([@lukasIO](https://github.com/lukasIO))

- Log websocket close code - [#1002](https://github.com/livekit/client-sdk-js/pull/1002) ([@lukasIO](https://github.com/lukasIO))

- Avoid throwing unhandled error for simulcast codec tracks - [#999](https://github.com/livekit/client-sdk-js/pull/999) ([@lukasIO](https://github.com/lukasIO))

- Get sid from roomInfo for logContext - [#991](https://github.com/livekit/client-sdk-js/pull/991) ([@lukasIO](https://github.com/lukasIO))

## 1.15.11

### Patch Changes

- Resume audio playback status when switching back to tab on iOS - [`c247f7d67c423f5d7ea09549cd2eb44a95762cbb`](https://github.com/livekit/client-sdk-js/commit/c247f7d67c423f5d7ea09549cd2eb44a95762cbb) ([@lukasIO](https://github.com/lukasIO))

- Buffer room events during reconnect - [`f83124d881dc962ff940b806c45da4d1b8c0b86e`](https://github.com/livekit/client-sdk-js/commit/f83124d881dc962ff940b806c45da4d1b8c0b86e) ([@lukasIO](https://github.com/lukasIO))

- Fix state handling issue in SignalClient - [`1200535d0c87d127cebd0b07330dd0a688843287`](https://github.com/livekit/client-sdk-js/commit/1200535d0c87d127cebd0b07330dd0a688843287) ([@holzgeist](https://github.com/holzgeist))

## 1.15.10

### Patch Changes

- Perform full reconnect on leave during reconnect - [`dc95472cca12ad3b150e824da8e3f7e387de0e12`](https://github.com/livekit/client-sdk-js/commit/dc95472cca12ad3b150e824da8e3f7e387de0e12) ([@lukasIO](https://github.com/lukasIO))

## 1.15.9

### Patch Changes

- Fix for recovering SignalChannel closing during reconnect - [`d1fa7554630d9f9fd787784b154eb460c8568894`](https://github.com/livekit/client-sdk-js/commit/d1fa7554630d9f9fd787784b154eb460c8568894) ([@lukasIO](https://github.com/lukasIO))

- Log server offer sdp - [`6cd3ae5f0c3c30ce852d7b3f000f1adf2e08eb96`](https://github.com/livekit/client-sdk-js/commit/6cd3ae5f0c3c30ce852d7b3f000f1adf2e08eb96) ([@lukasIO](https://github.com/lukasIO))

## 1.15.8

### Patch Changes

- Await unpublish before re-publishing on signal-reconnect - [`eea871c11118ff36a04917dc1008dc9023c662b5`](https://github.com/livekit/client-sdk-js/commit/eea871c11118ff36a04917dc1008dc9023c662b5) ([@lukasIO](https://github.com/lukasIO))

## 1.15.7

### Patch Changes

- Fix stopping old track in `setMediaStreamTrack` - [#980](https://github.com/livekit/client-sdk-js/pull/980) ([@mpnri](https://github.com/mpnri))

- Add class level configurable logger - [#988](https://github.com/livekit/client-sdk-js/pull/988) ([@lukasIO](https://github.com/lukasIO))

- Default screenshare capture resolution to 1080p - [#972](https://github.com/livekit/client-sdk-js/pull/972) ([@davidzhao](https://github.com/davidzhao))

## 1.15.6

### Patch Changes

- Make sure that processorElement stays muted after attach - [#984](https://github.com/livekit/client-sdk-js/pull/984) ([@lukasIO](https://github.com/lukasIO))

## 1.15.5

### Patch Changes

- Add receiver video mime type to stats - [#963](https://github.com/livekit/client-sdk-js/pull/963) ([@cnderrauber](https://github.com/cnderrauber))

- Make sure all signal client callbacks are set up for a reconnect - [#966](https://github.com/livekit/client-sdk-js/pull/966) ([@lukasIO](https://github.com/lukasIO))

- Make sure to apply audio output selection when participant is first created - [#968](https://github.com/livekit/client-sdk-js/pull/968) ([@lukasIO](https://github.com/lukasIO))

## 1.15.4

### Patch Changes

- Add ConnectionQuality.Lost - [#961](https://github.com/livekit/client-sdk-js/pull/961) ([@lukasIO](https://github.com/lukasIO))

- Add isAgent getter on participant - [#960](https://github.com/livekit/client-sdk-js/pull/960) ([@lukasIO](https://github.com/lukasIO))

- Improve auto playback handling - [#958](https://github.com/livekit/client-sdk-js/pull/958) ([@lukasIO](https://github.com/lukasIO))

## 1.15.3

### Patch Changes

- Prevent backup codec publishing when e2ee is enabled - [#943](https://github.com/livekit/client-sdk-js/pull/943) ([@lukasIO](https://github.com/lukasIO))

- Use enum to track connection state of signal client - [#949](https://github.com/livekit/client-sdk-js/pull/949) ([@lukasIO](https://github.com/lukasIO))

- Disable VP9 for Safari 15, AV1 for Safari (incomplete support) - [#950](https://github.com/livekit/client-sdk-js/pull/950) ([@davidzhao](https://github.com/davidzhao))

## 1.15.2

### Patch Changes

- Make sure no backup codecs are published when e2ee is enabled - [#941](https://github.com/livekit/client-sdk-js/pull/941) ([@lukasIO](https://github.com/lukasIO))

## 1.15.1

### Patch Changes

- Move PeerConnection logic into PCTransportManager - [#909](https://github.com/livekit/client-sdk-js/pull/909) ([@lukasIO](https://github.com/lukasIO))

- Add `startVideo` method and `RoomEvent.VideoPlaybackStatusChanged` - [#939](https://github.com/livekit/client-sdk-js/pull/939) ([@lukasIO](https://github.com/lukasIO))

## 1.15.0

### Minor Changes

- Enable backup codec by default - [#929](https://github.com/livekit/client-sdk-js/pull/929) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Reset LocalTrack debounced mute when setting new track - [#936](https://github.com/livekit/client-sdk-js/pull/936) ([@davideberlein](https://github.com/davideberlein))

- Make sleep use critical timers - [#934](https://github.com/livekit/client-sdk-js/pull/934) ([@lukasIO](https://github.com/lukasIO))

- Treat all signal messages as ping response - [#933](https://github.com/livekit/client-sdk-js/pull/933) ([@davidzhao](https://github.com/davidzhao))

- Add getStats() to PCTransport - [#927](https://github.com/livekit/client-sdk-js/pull/927) ([@rnakano](https://github.com/rnakano))

## 1.14.4

### Patch Changes

- Correctly apply elementVolume on attach for webaudioMix - [#922](https://github.com/livekit/client-sdk-js/pull/922) ([@lukasIO](https://github.com/lukasIO))

- Simplify multi-codec simulcast usage, backupCodec: true - [#923](https://github.com/livekit/client-sdk-js/pull/923) ([@davidzhao](https://github.com/davidzhao))

## 1.14.3

### Patch Changes

- Update dependency @bufbuild/protobuf to v1.4.1 - [#913](https://github.com/livekit/client-sdk-js/pull/913) ([@renovate](https://github.com/apps/renovate))

- Demote duplicate source log to info - [#917](https://github.com/livekit/client-sdk-js/pull/917) ([@lukasIO](https://github.com/lukasIO))

- Fix reconnect when E2EE is enabled - [#921](https://github.com/livekit/client-sdk-js/pull/921) ([@lukasIO](https://github.com/lukasIO))

- Don't set the autoplay attribute on video elements in Safari - [#918](https://github.com/livekit/client-sdk-js/pull/918) ([@lukasIO](https://github.com/lukasIO))

- Call startAudio when an audio track has been acquired in order to update audio playback status - [#919](https://github.com/livekit/client-sdk-js/pull/919) ([@lukasIO](https://github.com/lukasIO))

- Round start bitrate for svc - [#920](https://github.com/livekit/client-sdk-js/pull/920) ([@cnderrauber](https://github.com/cnderrauber))

## 1.14.2

### Patch Changes

- Use a deepClone util function for CreateLocalTrackOptions - [#906](https://github.com/livekit/client-sdk-js/pull/906) ([@vas11yev1work](https://github.com/vas11yev1work))

- Guard against overriding newly set key when auto-ratcheting - [#895](https://github.com/livekit/client-sdk-js/pull/895) ([@lukasIO](https://github.com/lukasIO))

- Fix Safari reporting wrong initial track resolution - [#898](https://github.com/livekit/client-sdk-js/pull/898) ([@lukasIO](https://github.com/lukasIO))

- Make peerconnection private on PCTransport - [#903](https://github.com/livekit/client-sdk-js/pull/903) ([@lukasIO](https://github.com/lukasIO))

- Improve handling of incompatible published codecs - [#911](https://github.com/livekit/client-sdk-js/pull/911) ([@davidzhao](https://github.com/davidzhao))

- Fix a race in setKeyFromMaterial that would cause keys to be set at the wrong index if several keys were set in quick succession. - [#908](https://github.com/livekit/client-sdk-js/pull/908) ([@dbkr](https://github.com/dbkr))

- Update protocol - [#902](https://github.com/livekit/client-sdk-js/pull/902) ([@lukasIO](https://github.com/lukasIO))

- Add key index to e2e worker log lines - [#904](https://github.com/livekit/client-sdk-js/pull/904) ([@dbkr](https://github.com/dbkr))

- Fix Typescript compilation error in angular setups - [#901](https://github.com/livekit/client-sdk-js/pull/901) ([@pabloFuente](https://github.com/pabloFuente))

- Don't disconnect room before retrying new regions - [#910](https://github.com/livekit/client-sdk-js/pull/910) ([@lukasIO](https://github.com/lukasIO))

## 1.14.1

### Patch Changes

- Handle new format streamId to better sync a/v tracks - [#881](https://github.com/livekit/client-sdk-js/pull/881) ([@cnderrauber](https://github.com/cnderrauber))

- Do not support VP9 publishing for FF - [#894](https://github.com/livekit/client-sdk-js/pull/894) ([@davidzhao](https://github.com/davidzhao))

## 1.14.0

### Minor Changes

- Do not constrain screenshare resolution by default - [#889](https://github.com/livekit/client-sdk-js/pull/889) ([@davidzhao](https://github.com/davidzhao))

### Patch Changes

- Fix vp9 svc failed for screenshare - [#882](https://github.com/livekit/client-sdk-js/pull/882) ([@cnderrauber](https://github.com/cnderrauber))

## 1.13.4

### Patch Changes

- Log connection error message on region retries - [#879](https://github.com/livekit/client-sdk-js/pull/879) ([@lukasIO](https://github.com/lukasIO))

- Wait for publisher connection after reconnects - [#875](https://github.com/livekit/client-sdk-js/pull/875) ([@lukasIO](https://github.com/lukasIO))

## 1.13.3

### Patch Changes

- Disable opus RED when using E2EE - [#858](https://github.com/livekit/client-sdk-js/pull/858) ([@lukasIO](https://github.com/lukasIO))

- Make audio analyser cleanup function async - [#867](https://github.com/livekit/client-sdk-js/pull/867) ([@kand193](https://github.com/kand193))

- Strip SIF trailer before enqueuing it - [#868](https://github.com/livekit/client-sdk-js/pull/868) ([@lukasIO](https://github.com/lukasIO))

- Update h360 video preset - [#872](https://github.com/livekit/client-sdk-js/pull/872) ([@davidzhao](https://github.com/davidzhao))

- Fix infinite metadata loop when canUpdateOwnMetadata is granted - [#871](https://github.com/livekit/client-sdk-js/pull/871) ([@davidzhao](https://github.com/davidzhao))

## 1.13.2

### Patch Changes

- Fix opus RED publishing option not taking effect - [#856](https://github.com/livekit/client-sdk-js/pull/856) ([@lukasIO](https://github.com/lukasIO))

## 1.13.1

### Patch Changes

- Remove legacy code paths for tracks arriving before participant info - [#854](https://github.com/livekit/client-sdk-js/pull/854) ([@lukasIO](https://github.com/lukasIO))

- Make KeyProvider and ParticipantKeyHandler work consistently for shared key and sender key scenarios (e2ee) - [#850](https://github.com/livekit/client-sdk-js/pull/850) ([@lukasIO](https://github.com/lukasIO))

- Fix track processor blips when restarting tracks - [#842](https://github.com/livekit/client-sdk-js/pull/842) ([@lukasIO](https://github.com/lukasIO))

- Correctly import livekit logger in facingMode helper - [#855](https://github.com/livekit/client-sdk-js/pull/855) ([@lukasIO](https://github.com/lukasIO))

## 1.13.0

### Minor Changes

- Convert pauseUpstream and resumeUpstream to regular class methods - [#830](https://github.com/livekit/client-sdk-js/pull/830) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Add websocketTimeout to RoomConnectOptions - [#834](https://github.com/livekit/client-sdk-js/pull/834) ([@lukasIO](https://github.com/lukasIO))

- Add support for get/setVolume in react-native - [#833](https://github.com/livekit/client-sdk-js/pull/833) ([@davidliu](https://github.com/davidliu))

- Refine pause/resumeUpstream, setProcessor for multi-codecs - [#829](https://github.com/livekit/client-sdk-js/pull/829) ([@cnderrauber](https://github.com/cnderrauber))

- Force enable dynacast when backupCodec is enabled - [#839](https://github.com/livekit/client-sdk-js/pull/839) ([@cnderrauber](https://github.com/cnderrauber))

- Fix video device switch not working for backup codec - [#824](https://github.com/livekit/client-sdk-js/pull/824) ([@cnderrauber](https://github.com/cnderrauber))

- Update dependency webrtc-adapter to v8.2.3 - [#819](https://github.com/livekit/client-sdk-js/pull/819) ([@renovate](https://github.com/apps/renovate))

- Allow ArrayBuffers to be used for ExternalKeyProvider keys - [#844](https://github.com/livekit/client-sdk-js/pull/844) ([@lukasIO](https://github.com/lukasIO))

- Fix passing maxRetries connectOption to RTCEngine - [#838](https://github.com/livekit/client-sdk-js/pull/838) ([@mpnri](https://github.com/mpnri))

- Add support for audio processors - [#822](https://github.com/livekit/client-sdk-js/pull/822) ([@lukasIO](https://github.com/lukasIO))

- Ability to simulate subscriber-bandwidth - [#835](https://github.com/livekit/client-sdk-js/pull/835) ([@davidzhao](https://github.com/davidzhao))

- Fix getDevices permissions when no kind is supplied - [#811](https://github.com/livekit/client-sdk-js/pull/811) ([@Talljoe](https://github.com/Talljoe))

- Fix setTrackMute ignored simulcast-codec - [#827](https://github.com/livekit/client-sdk-js/pull/827) ([@cnderrauber](https://github.com/cnderrauber))

- Add support for server injected frame trailer being passed down - [#812](https://github.com/livekit/client-sdk-js/pull/812) ([@lukasIO](https://github.com/lukasIO))

- Add ceil of width and height when emitting UpdateTrackSettings - [#846](https://github.com/livekit/client-sdk-js/pull/846) ([@HermanBilous](https://github.com/HermanBilous))

- Setup signal callbacks before connecting signal - [#832](https://github.com/livekit/client-sdk-js/pull/832) ([@lukasIO](https://github.com/lukasIO))

- Ensure play requests are invoked synchronously in startAudio - [#841](https://github.com/livekit/client-sdk-js/pull/841) ([@lukasIO](https://github.com/lukasIO))

## 1.12.3

### Patch Changes

- Fix missing ScalabilityMode import when using SVC - [#816](https://github.com/livekit/client-sdk-js/pull/816) ([@davidzhao](https://github.com/davidzhao))

- Adjust default bitrates according to VMAF results - [#817](https://github.com/livekit/client-sdk-js/pull/817) ([@davidzhao](https://github.com/davidzhao))

## 1.12.2

### Patch Changes

- Set a default resolution for createLocalScreenTracks - [#796](https://github.com/livekit/client-sdk-js/pull/796) ([@lukasIO](https://github.com/lukasIO))

- Debounce reacting to mediastreamtrack mute events - [#809](https://github.com/livekit/client-sdk-js/pull/809) ([@lukasIO](https://github.com/lukasIO))

- Remove duplicate options being passed to publish - [#794](https://github.com/livekit/client-sdk-js/pull/794) ([@lukasIO](https://github.com/lukasIO))

- Replace ts-proto with protobuf-es - [#700](https://github.com/livekit/client-sdk-js/pull/700) ([@lukasIO](https://github.com/lukasIO))

- Do not attempt to restart screen share tracks when re-publishing after reconnect - [#802](https://github.com/livekit/client-sdk-js/pull/802) ([@lukasIO](https://github.com/lukasIO))

- Add failureTolerance to KeyProvider options (E2EE) - [#810](https://github.com/livekit/client-sdk-js/pull/810) ([@lukasIO](https://github.com/lukasIO))

- Remove dummy audio element on disconnect - [#793](https://github.com/livekit/client-sdk-js/pull/793) ([@lukasIO](https://github.com/lukasIO))

- Add video options to ScreenShareCaptureOptions - [#792](https://github.com/livekit/client-sdk-js/pull/792) ([@lukasIO](https://github.com/lukasIO))

- Fix iOS browser parser check, add more test cases - [#798](https://github.com/livekit/client-sdk-js/pull/798) ([@lukasIO](https://github.com/lukasIO))

- Improved connection checker with more details about ICE candidates - [#806](https://github.com/livekit/client-sdk-js/pull/806) ([@davidzhao](https://github.com/davidzhao))

- Throw connection error immediately if unauthorized instead of trying alternative URLs - [#804](https://github.com/livekit/client-sdk-js/pull/804) ([@lukasIO](https://github.com/lukasIO))

- Revert event emitter lib usage to 'events' - [#807](https://github.com/livekit/client-sdk-js/pull/807) ([@lukasIO](https://github.com/lukasIO))

- Support for region pinning with LiveKit Cloud using prepareConnection - [#783](https://github.com/livekit/client-sdk-js/pull/783) ([@davidzhao](https://github.com/davidzhao))

- Ensure we do not replace http unless it's in the scheme - [#805](https://github.com/livekit/client-sdk-js/pull/805) ([@davidzhao](https://github.com/davidzhao))

- Stop tracks if publishing fails with `setTrackEnabled` - [#799](https://github.com/livekit/client-sdk-js/pull/799) ([@lukasIO](https://github.com/lukasIO))

## 1.12.1

### Patch Changes

- Allow specifying audio source for participant.setVolume API - [#780](https://github.com/livekit/client-sdk-js/pull/780) ([@lukasIO](https://github.com/lukasIO))

- Add iOS detection to browser parser and only use audio element workar… - [#785](https://github.com/livekit/client-sdk-js/pull/785) ([@lukasIO](https://github.com/lukasIO))

- Skip decryption if maximum ratchet accounts have exceeded until a new key is set - [#786](https://github.com/livekit/client-sdk-js/pull/786) ([@lukasIO](https://github.com/lukasIO))

- Set element Id for dummy audio element - [#778](https://github.com/livekit/client-sdk-js/pull/778) ([@lukasIO](https://github.com/lukasIO))

- Update constraints with actually selected deviceId on track creation - [#773](https://github.com/livekit/client-sdk-js/pull/773) ([@toger5](https://github.com/toger5))

- Always resume AudioContext if in suspended state - [#779](https://github.com/livekit/client-sdk-js/pull/779) ([@lukasIO](https://github.com/lukasIO))

- Only check for setSinkId support on AudioContext if webaudiomix is enabled - [#787](https://github.com/livekit/client-sdk-js/pull/787) ([@lukasIO](https://github.com/lukasIO))

## 1.12.0

### Minor Changes

- Experimental end-to-end encryption support - [#557](https://github.com/livekit/client-sdk-js/pull/557) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Update adaptive stream dimensions when a remote track is being detached - [#766](https://github.com/livekit/client-sdk-js/pull/766) ([@burzomir](https://github.com/burzomir))

- Fixed missed event listeners on MediaStreamTrack - [#768](https://github.com/livekit/client-sdk-js/pull/768) ([@davidzhao](https://github.com/davidzhao))

- Forward signal events through engine - [#772](https://github.com/livekit/client-sdk-js/pull/772) ([@lukasIO](https://github.com/lukasIO))

- Emit activeDeviceChanged when publishing local track - [#759](https://github.com/livekit/client-sdk-js/pull/759) ([@lukasIO](https://github.com/lukasIO))

- Fix peer connections leak - [#767](https://github.com/livekit/client-sdk-js/pull/767) ([@lukasIO](https://github.com/lukasIO))

## 1.11.4

### Patch Changes

- Use mutex lock for queueing calls to setProcessor - [#756](https://github.com/livekit/client-sdk-js/pull/756) ([@lukasIO](https://github.com/lukasIO))

- Use active device when publishing a new track - [#757](https://github.com/livekit/client-sdk-js/pull/757) ([@lukasIO](https://github.com/lukasIO))

- expose facingMode functions - [#753](https://github.com/livekit/client-sdk-js/pull/753) ([@Ocupe](https://github.com/Ocupe))

## 1.11.3

### Patch Changes

- Apply user setting bitrate to maxaveragebitrates for firefox - [#752](https://github.com/livekit/client-sdk-js/pull/752) ([@cnderrauber](https://github.com/cnderrauber))

- Do not override forceStereo=false when publishing stereo input - [#748](https://github.com/livekit/client-sdk-js/pull/748) ([@davidzhao](https://github.com/davidzhao))

- Add helper function to detect camera `facingMode`. - [#738](https://github.com/livekit/client-sdk-js/pull/738) ([@Ocupe](https://github.com/Ocupe))

- Only set priority on Firefox - [#750](https://github.com/livekit/client-sdk-js/pull/750) ([@lukasIO](https://github.com/lukasIO))

## 1.11.2

### Patch Changes

- Fix missing await for async setMediaStreamTrack calls - [#747](https://github.com/livekit/client-sdk-js/pull/747) ([@boris-graeff](https://github.com/boris-graeff))

- Emit RoomEvent.ActiveDeviceChanged when `room.switchActiveDevice` has been called. - [#743](https://github.com/livekit/client-sdk-js/pull/743) ([@lukasIO](https://github.com/lukasIO))
  Add room.getActiveDevice(kind) method.

- Use JSdocs instead of warning for mediastreamtrack access - [#742](https://github.com/livekit/client-sdk-js/pull/742) ([@lukasIO](https://github.com/lukasIO))

## 1.11.1

### Patch Changes

- Fix mute event handling - [#740](https://github.com/livekit/client-sdk-js/pull/740) ([@davidzhao](https://github.com/davidzhao))

## 1.11.0

### Minor Changes

- Increase default adaptiveStream pixelDensity on high-density(mobile) screens - [#735](https://github.com/livekit/client-sdk-js/pull/735) ([@davidzhao](https://github.com/davidzhao))

- Replace event emitter lib with eventemitter3 - [#681](https://github.com/livekit/client-sdk-js/pull/681) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Handle device mute and document freeze events - [#734](https://github.com/livekit/client-sdk-js/pull/734) ([@davidzhao](https://github.com/davidzhao))

- Pass method logLevel to LogExtension instead of configured logLevel - [#730](https://github.com/livekit/client-sdk-js/pull/730) ([@lukasIO](https://github.com/lukasIO))

- Fix svc encodings for safari and chrome before 113 - [#731](https://github.com/livekit/client-sdk-js/pull/731) ([@cnderrauber](https://github.com/cnderrauber))

- Always catch reconnectFuture rejections - [#727](https://github.com/livekit/client-sdk-js/pull/727) ([@HermanBilous](https://github.com/HermanBilous))

- Work around iOS safari audio playback issue when not publishing, by playing back silent audio - [#733](https://github.com/livekit/client-sdk-js/pull/733) ([@lukasIO](https://github.com/lukasIO))

## 1.10.0

### Minor Changes

- Add track processor API - [#711](https://github.com/livekit/client-sdk-js/pull/711) ([@lukasIO](https://github.com/lukasIO))

### Patch Changes

- Use replaceTrack(null) for pauseUpstream - [#716](https://github.com/livekit/client-sdk-js/pull/716) ([@davidzhao](https://github.com/davidzhao))

- Always add codec info to AddTrackRequest - [#728](https://github.com/livekit/client-sdk-js/pull/728) ([@cnderrauber](https://github.com/cnderrauber))

- Surface subscription error via TrackEvent.SubscriptionFailed when trying to subsribe to an unsupported codec - [#722](https://github.com/livekit/client-sdk-js/pull/722) ([@lukasIO](https://github.com/lukasIO))

- Reject signal connection promise immediately when aborted - [#719](https://github.com/livekit/client-sdk-js/pull/719) ([@lukasIO](https://github.com/lukasIO))

- Fix svc mode for chrome v113 - [#720](https://github.com/livekit/client-sdk-js/pull/720) ([@cnderrauber](https://github.com/cnderrauber))

## 1.9.7

### Patch Changes

- Fix browser parser check - [#714](https://github.com/livekit/client-sdk-js/pull/714) ([@lukasIO](https://github.com/lukasIO))

- Ensure same framerates for iOS RN simulcast - [#710](https://github.com/livekit/client-sdk-js/pull/710) ([@davidliu](https://github.com/davidliu))

## 1.9.6

### Patch Changes

- Make sure `TrackUnsubscribed` events are emitted before the publication gets deleted from maps - [#708](https://github.com/livekit/client-sdk-js/pull/708) ([@lukasIO](https://github.com/lukasIO))

- Use body instead of document as intersection observer root - [#703](https://github.com/livekit/client-sdk-js/pull/703) ([@lukasIO](https://github.com/lukasIO))

- Use default video dimensions when they are not available - [#709](https://github.com/livekit/client-sdk-js/pull/709) ([@davidzhao](https://github.com/davidzhao))

## 1.9.5

### Patch Changes

- Remove ua-parser-js dependency and fix browser version comparison - [#697](https://github.com/livekit/client-sdk-js/pull/697) ([@lukasIO](https://github.com/lukasIO))

- Use STATE_MISMATCH disconnect reason in connection reconciliation - [#705](https://github.com/livekit/client-sdk-js/pull/705) ([@lukasIO](https://github.com/lukasIO))

- Make sure engine gets closed when connection reconciliation triggers - [#702](https://github.com/livekit/client-sdk-js/pull/702) ([@lukasIO](https://github.com/lukasIO))

## 1.9.4

### Patch Changes

- Replace async-await-queue with mutex based queue - [`2b09b7c`](https://github.com/livekit/client-sdk-js/commit/2b09b7cd45f5dad132363c0f79b375fa0e71ee48) ([@lukasIO](https://github.com/lukasIO))

## 1.9.3

### Patch Changes

- Update devDependencies (non-major) - [#678](https://github.com/livekit/client-sdk-js/pull/678) ([@renovate](https://github.com/apps/renovate))

- Consolidate ws close action - [#685](https://github.com/livekit/client-sdk-js/pull/685) ([@lukasIO](https://github.com/lukasIO))

- Add support for local priority in presets - [#677](https://github.com/livekit/client-sdk-js/pull/677) ([@lukasIO](https://github.com/lukasIO))

- Fix supportsAV1 and supportsVP9 helper functions on Firefox - [#689](https://github.com/livekit/client-sdk-js/pull/689) ([@davidzhao](https://github.com/davidzhao))

- Change TS target to es2015 - [#687](https://github.com/livekit/client-sdk-js/pull/687) ([@lukasIO](https://github.com/lukasIO))

- Keep reference to latest joinResponse on engine - [#691](https://github.com/livekit/client-sdk-js/pull/691) ([@lukasIO](https://github.com/lukasIO))

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

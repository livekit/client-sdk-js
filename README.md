<!--BEGIN_BANNER_IMAGE-->

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="/.github/banner_dark.png">
  <source media="(prefers-color-scheme: light)" srcset="/.github/banner_light.png">
  <img style="width:100%;" alt="The LiveKit icon, the name of the repository and some sample code in the background." src="https://raw.githubusercontent.com/livekit/client-sdk-js/main/.github/banner_light.png">
</picture>

<!--END_BANNER_IMAGE-->

# JavaScript/TypeScript client SDK for LiveKit

<!--BEGIN_DESCRIPTION-->
Use this SDK to add real-time video, audio and data features to your JavaScript/TypeScript app. By connecting to a self- or cloud-hosted <a href="https://livekit.io/">LiveKit</a> server, you can quickly build applications like interactive live streaming or video calls with just a few lines of code.
<!--END_DESCRIPTION-->

## Docs

Docs and guides at [https://docs.livekit.io](https://docs.livekit.io)

[SDK reference](https://docs.livekit.io/client-sdk-js/)

> [!NOTE]
> This is v2 of `livekit-client`. When migrating from v1.x to v2.x you might encounter a small set of breaking changes.
> Read the [migration guide](https://docs.livekit.io/guides/migrate-from-v1/) for a detailed overview of what has changed.

## Installation

### Yarn

```shell
yarn add livekit-client
```

### NPM

```shell
npm install livekit-client --save
```

### Minified JS

To use the SDK without a package manager, you can include it with a script tag:

```html
<script src="https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js"></script>
```

The module will be exported under `LivekitClient` in the global namespace. When
accessing symbols from the class, you'd need to prefix them with `LivekitClient.`.
For example, `Room` becomes `LivekitClient.Room`.

## Usage

Examples below are in TypeScript, if using JS/CommonJS imports replace import with:

```javascript
const livekit = require('livekit-client');

const room = new livekit.Room(...);

// call this some time before actually connecting to speed up the actual connection
room.prepareConnection(url, token);

await room.connect(...);
```

### Connecting to a room, publish video & audio

```typescript
import {
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
} from 'livekit-client';

// creates a new room with options
const room = new Room({
  // automatically manage subscribed video quality
  adaptiveStream: true,

  // optimize publishing bandwidth and CPU for published tracks
  dynacast: true,

  // default capture settings
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,
  },
});

// pre-warm connection, this can be called as early as your page is loaded
room.prepareConnection(url, token);

// set up event listeners
room
  .on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
  .on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
  .on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakerChange)
  .on(RoomEvent.Disconnected, handleDisconnect)
  .on(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);

// connect to room
await room.connect('ws://localhost:7800', token);
console.log('connected to room', room.name);

// publish local camera and mic tracks
await room.localParticipant.enableCameraAndMicrophone();

function handleTrackSubscribed(
  track: RemoteTrack,
  publication: RemoteTrackPublication,
  participant: RemoteParticipant,
) {
  if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
    // attach it to a new HTMLVideoElement or HTMLAudioElement
    const element = track.attach();
    parentElement.appendChild(element);
  }
}

function handleTrackUnsubscribed(
  track: RemoteTrack,
  publication: RemoteTrackPublication,
  participant: RemoteParticipant,
) {
  // remove tracks from all attached elements
  track.detach();
}

function handleLocalTrackUnpublished(
  publication: LocalTrackPublication,
  participant: LocalParticipant,
) {
  // when local tracks are ended, update UI to remove them from rendering
  publication.track.detach();
}

function handleActiveSpeakerChange(speakers: Participant[]) {
  // show UI indicators when participant is speaking
}

function handleDisconnect() {
  console.log('disconnected from room');
}
```

In order to connect to a room, you need to first create an access token.

See [access token docs](https://docs.livekit.io/guides/access-tokens) for details

### Handling common track types

While LiveKit is designed to be flexible, we've added a few shortcuts that makes working with common track types simple. For a user's camera, microphone, and screen share, you can enable them with the following `LocalParticipant` methods:

```typescript
const p = room.localParticipant;
// turn on the local user's camera and mic, this may trigger a browser prompt
// to ensure permissions are granted
await p.setCameraEnabled(true);
await p.setMicrophoneEnabled(true);

// start sharing the user's screen, this will trigger a browser prompt to select
// the screen to share.
await p.setScreenShareEnabled(true);

// disable camera to mute them, when muted, the user's camera indicator will be turned off
await p.setCameraEnabled(false);
```

Similarly, you can access these common track types on the other participants' end.

```typescript
// get a RemoteParticipant by their identity
const p = room.remoteParticipants.get('participant-identity');
if (p) {
  // if the other user has enabled their camera, attach it to a new HTMLVideoElement
  if (p.isCameraEnabled) {
    const publication = p.getTrackPublication(Track.Source.Camera);
    if (publication?.isSubscribed) {
      const videoElement = publication.videoTrack?.attach();
      // do something with the element
    }
  }
}
```

### Creating a track prior to creating a room

In some cases, it may be useful to create a track before creating a room. For
example, when building a staging area so the user may check their own camera.

You can use our global track creation functions for this:

```typescript
const tracks = await createLocalTracks({
  audio: true,
  video: true,
});
```

### Publish tracks from any source

LiveKit lets you publish any track as long as it can be represented by a MediaStreamTrack. You can specify a name on the track in order to identify it later.

```typescript
const pub = await room.localParticipant.publishTrack(mediaStreamTrack, {
  name: 'mytrack',
  simulcast: true,
  // if this should be treated like a camera feed, tag it as such
  // supported known sources are .Camera, .Microphone, .ScreenShare
  source: Track.Source.Camera,
});

// you may mute or unpublish the track later
pub.setMuted(true);

room.localParticipant.unpublishTrack(mediaStreamTrack);
```

### Device management APIs

Users may have multiple input and output devices available. LiveKit will automatically use the one that's deemed as the `default` device on the system. You may also list and specify an alternative device to use.

We use the same deviceId as one returned by [MediaDevices.enumerateDevices()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices).

#### Example listing and selecting a camera device

```typescript
// list all microphone devices
const devices = await Room.getLocalDevices('audioinput');

// select last device
const device = devices[devices.length - 1];

// in the current room, switch to the selected device and set
// it as default audioinput in the future.
await room.switchActiveDevice('audioinput', device.deviceId);
```

You can also switch devices given a constraint. This could be useful on mobile devices to switch to a back-facing camera:

```typescript
await videoTrack.restartTrack({
  facingMode: 'environment',
});
```

#### Handling device failures

When creating tracks using LiveKit APIs (`connect`, `createLocalTracks`, `setCameraEnabled`, etc), it's possible to encounter errors with the underlying media device. In those cases, LiveKit will emit `RoomEvent.MediaDevicesError`.

You can use the helper `MediaDeviceFailure.getFailure(error)` to determine specific reason for the error.

- `PermissionDenied` - the user disallowed capturing devices
- `NotFound` - the particular device isn't available
- `DeviceInUse` - device is in use by another process (happens on Windows)

These distinctions enables you to provide more specific messaging to the user.

You could also retrieve the last error with `LocalParticipant.lastCameraError` and `LocalParticipant.lastMicrophoneError`.

### Audio playback

Browsers can be restrictive with regards to audio playback that is not initiated by user interaction. What each browser considers as user interaction can vary by vendor (for example, Safari on iOS is very restrictive).

LiveKit will attempt to autoplay all audio tracks when you attach them to audio elements. However, if that fails, we'll notify you via `RoomEvent.AudioPlaybackStatusChanged`. `Room.canPlaybackAudio` will indicate if audio playback is permitted. LiveKit takes an optimistic approach so it's possible for this value to change from `true` to `false` when we encounter a browser error.

In the case user interaction is required, LiveKit provides `Room.startAudio` to start audio playback. This function must be triggered in an onclick or ontap event handler. In the same session, once audio playback is successful, additional audio tracks can be played without further user interactions.

```typescript
room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
  if (!room.canPlaybackAudio) {
    // UI is necessary.
    ...
    button.onclick = () => {
      // startAudio *must* be called in an click/tap handler.
      room.startAudio().then(() => {
        // successful, UI can be removed now
        button.remove();
      });
    }
  }
});
```

### Configuring logging

This library uses [loglevel](https://github.com/pimterry/loglevel) for its internal logs. You can change the effective log level with the `logLevel` field in `ConnectOptions`.
The method `setLogExtension` allows to hook into the livekit internal logs and send them to some third party logging service

```ts
setLogExtension((level: LogLevel, msg: string, context: object) => {
  const enhancedContext = { ...context, timeStamp: Date.now() };
  if (level >= LogLevel.debug) {
    console.log(level, msg, enhancedContext);
  }
});
```

## Examples

### SDK Sample

[example/sample.ts](example/sample.ts) contains a demo webapp that uses the SDK. Run it with `pnpm install && pnpm sample`

## Browser Support

| Browser         | Desktop OS            | Mobile OS |
| --------------- | --------------------- | --------- |
| Chrome          | Windows, macOS, Linux | Android   |
| Firefox         | Windows, macOS, Linux | Android   |
| Safari          | macOS                 | iOS       |
| Edge (Chromium) | Windows, macOS        |           |

We aim to support a broad range of browser versions by transpiling the library code with babel.
You can have a look at the `"browerslist"` section of `package.json` for more details.

> Note that the library requires some specific browser APIs to be present.
> You can check general compatibility with the helper function `isBrowserSupported()`.
> Support for more modern features like adaptiveStream and dynacast can be checked for with `supportsAdaptiveStream()` and `supportsDynacast()`.

If you are targeting legacy browsers, but still want adaptiveStream functionality you'll likely need to use polyfills for [ResizeObserver](https://www.npmjs.com/package/resize-observer-polyfill) and [IntersectionObserver](https://www.npmjs.com/package/intersection-observer).

Also when targeting legacy browsers, older than the ones specified in our browserslist target, make sure to transpile the library code to your desired target and include required polyfills with babel and/or corejs.

<!--BEGIN_REPO_NAV-->
<br/><table>
<thead><tr><th colspan="2">LiveKit Ecosystem</th></tr></thead>
<tbody>
<tr><td>Real-time SDKs</td><td><a href="https://github.com/livekit/components-js">React Components</a> · <b>Browser</b> · <a href="https://github.com/livekit/client-sdk-swift">iOS/macOS</a> · <a href="https://github.com/livekit/client-sdk-android">Android</a> · <a href="https://github.com/livekit/client-sdk-flutter">Flutter</a> · <a href="https://github.com/livekit/client-sdk-react-native">React Native</a> · <a href="https://github.com/livekit/rust-sdks">Rust</a> · <a href="https://github.com/livekit/node-sdks">Node.js</a> · <a href="https://github.com/livekit/python-sdks">Python</a> · <a href="https://github.com/livekit/client-sdk-unity-web">Unity (web)</a> · <a href="https://github.com/livekit/client-sdk-unity">Unity (beta)</a></td></tr><tr></tr>
<tr><td>Server APIs</td><td><a href="https://github.com/livekit/node-sdks">Node.js</a> · <a href="https://github.com/livekit/server-sdk-go">Golang</a> · <a href="https://github.com/livekit/server-sdk-ruby">Ruby</a> · <a href="https://github.com/livekit/server-sdk-kotlin">Java/Kotlin</a> · <a href="https://github.com/livekit/python-sdks">Python</a> · <a href="https://github.com/livekit/rust-sdks">Rust</a> · <a href="https://github.com/agence104/livekit-server-sdk-php">PHP (community)</a></td></tr><tr></tr>
<tr><td>Agents Frameworks</td><td><a href="https://github.com/livekit/agents">Python</a> · <a href="https://github.com/livekit/agent-playground">Playground</a></td></tr><tr></tr>
<tr><td>Services</td><td><a href="https://github.com/livekit/livekit">Livekit server</a> · <a href="https://github.com/livekit/egress">Egress</a> · <a href="https://github.com/livekit/ingress">Ingress</a> · <a href="https://github.com/livekit/sip">SIP</a></td></tr><tr></tr>
<tr><td>Resources</td><td><a href="https://docs.livekit.io">Docs</a> · <a href="https://github.com/livekit-examples">Example apps</a> · <a href="https://livekit.io/cloud">Cloud</a> · <a href="https://docs.livekit.io/oss/deployment">Self-hosting</a> · <a href="https://github.com/livekit/livekit-cli">CLI</a></td></tr>
</tbody>
</table>
<!--END_REPO_NAV-->

# JavaScript/TypeScript client SDK for LiveKit

`livekit-client` is the official client SDK for [LiveKit](https://github.com/livekit/livekit-server). With it, you can add real time video and audio to your web apps.

## Docs

Docs and guides at [https://docs.livekit.io](https://docs.livekit.io)

## Installation

### Yarn

```
yarn add livekit-client
```

### NPM

```
npm install livekit-client --save
```

## Usage

Examples below are in TypeScript, if using JS/CommonJS imports replace import with:

```javascript
const LiveKit = require('livekit-client');

LiveKit.connect(...);
```

### Connecting to a room, publish video & audio

```typescript
import {
  connect,
  RoomEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  Participant,
} from 'livekit-client';

connect('ws://localhost:7800', token, {
  audio: true,
  video: true,
}).then((room) => {
  console.log('connected to room', room.name);
  console.log('participants in room:', room.participants.size);

  room
    .on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    .on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
    .on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakerChange)
    .on(RoomEvent.Disconnected, handleDisconnect);
});

function handleTrackSubscribed(
  track: RemoteTrack,
  publication: RemoteTrackPublication,
  participant: RemoteParticipant
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
  participant: RemoteParticipant
) {
  // remove tracks from all attached elements
  track.detach();
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

### Manually publish, mute, unpublish

When a video track is muted, the camera indicator will be turned off. When the video is unmuted, the same camera source and capture settings will be re-aquired.

```typescript
import { createLocalVideoTrack } from 'livekit-client';

const videoTrack = await createLocalVideoTrack();

const publication = await room.localParticipant.publishTrack(videoTrack, {
  name: 'mytrack',
  simulcast: true,
});

videoTrack.mute();

room.localParticipant.unpublishTrack(videoTrack);
```

### Audio playback

Browsers can be restrictive regarding if audio could be played without user interaction. What each browser considers as user interaction can also be different (with Safari on iOS being the most restrictive). Some browser considers clicking on a button unrelated to audio as interaction, others require audio element's `play` function to be triggered by an onclick event.

LiveKit will attempt to autoplay all audio tracks when you attach them to audio elements. However, if that fails, we'll notify you via `RoomEvent.AudioPlaybackStatusChanged`. `Room.canPlayAudio` will indicate if audio playback is permitted. (Note: LiveKit takes an optimistic approach so it's possible for this value to change from `true` to `false` when we encounter a browser error.

In the case user interaction is required, LiveKit provides `Room.startAudio` to start audio playback. This function must be triggered in an onclick or ontap event handler. In the same session, once audio playback is successful, additional audio tracks can be played without further user interactions.

```typescript
room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
  if (!room.canPlayAudio) {
    // UI is necessary.
    ...
    button.onclick = () => {
      // this function *must* be triggered in an click/tap handler.
      room.startAudio().then(() => {
        // successful, UI can be removed now
        button.remove();
      });
    }
  }
});
```

### Switching input devices

At any point after publishing, you can switch the input devices and other capture settings on both audio and video tracks. For example, switching between regular and selfie camera or changing microphone inputs. This is performed with `restartTrack` on the `LocalAudioTrack` or `LocalVideoTrack`.

```typescript
await room.localParticipant.publishTrack(videoTrack);
await room.localParticipant.publishTrack(audioTrack);

await videoTrack.restartTrack({
  facingMode: 'environment',
});
await audioTrack.restartTrack({
  deviceId: 'microphoneId',
});
```

### Configuring logging

This library uses (loglevel)[] for its internal logs. You can change the effective log level with the `logLevel` field in `ConnectOptions`.

## Examples

### SDK Sample

[example/sample.ts](example/sample.ts) contains a demo webapp that uses the SDK. Run it with `yarn sample`

## Browser Support

| Browser         | Desktop OS            | Mobile OS |
| --------------- | --------------------- | --------- |
| Chrome          | Windows, macOS, Linux | Android   |
| Firefox         | Windows, macOS, Linux | Android   |
| Safari          | macOS                 | iOS       |
| Edge (Chromium) | Windows, macOS        |

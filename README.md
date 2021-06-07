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

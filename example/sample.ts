import {
  connect,
  createLocalVideoTrack,
  LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  LogLevel,
  Participant,
  ParticipantEvent,
  RemoteParticipant,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
} from '../src/index';
import { DataPacket_Kind } from '../src/proto/livekit_rtc';

const $ = (id: string) => document.getElementById(id);

declare global {
  interface Window {
    connectWithFormInput: any;
    connectToRoom: any;
    toggleVideo: any;
    shareScreen: any;
    muteVideo: any;
    muteAudio: any;
    enterText: any;
    disconnectSignal: any;
    disconnectRoom: any;
    currentRoom: any;
  }
}

function appendLog(...args: any[]) {
  const logger = $('log')!;
  for (let i = 0; i < arguments.length; i += 1) {
    if (typeof args[i] === 'object') {
      logger.innerHTML
        += `${JSON && JSON.stringify
          ? JSON.stringify(args[i], undefined, 2)
          : args[i]} `;
    } else {
      logger.innerHTML += `${args[i]} `;
    }
  }
  logger.innerHTML += '\n';
  (() => {
    logger.scrollTop = logger.scrollHeight;
  })();
}

function trackSubscribed(
  div: HTMLDivElement,
  track: Track,
  participant: Participant,
): HTMLMediaElement | null {
  appendLog('track subscribed', track);
  const element = track.attach();
  div.appendChild(element);
  return element;
}

function trackUnsubscribed(
  track: RemoteTrack | LocalTrack,
  participant?: Participant,
) {
  let logName = track.name;
  if (track.sid) {
    logName = track.sid;
  }
  appendLog('track unsubscribed', logName);
  track.detach().forEach((element) => element.remove());
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function handleData(msg: Uint8Array, participant: RemoteParticipant) {
  const str = decoder.decode(msg);
  const chat = <HTMLTextAreaElement>$('chat');
  chat.value += `${participant.identity}: ${str}\n`;
}

function handleSpeakerChanged(speakers: Participant[]) {
  // remove tags from all
  currentRoom.participants.forEach((participant) => {
    setParticipantSpeaking(participant, speakers.includes(participant));
  });

  // do the same for local participant
  setParticipantSpeaking(
    currentRoom.localParticipant,
    speakers.includes(currentRoom.localParticipant),
  );
}

function setParticipantSpeaking(participant: Participant, speaking: boolean) {
  participant.videoTracks.forEach((publication) => {
    const { track } = publication;
    if (track && track.kind === Track.Kind.Video) {
      track.attachedElements.forEach((element) => {
        if (speaking) {
          element.classList.add('speaking');
        } else {
          element.classList.remove('speaking');
        }
      });
    }
  });
}

function participantConnected(participant: RemoteParticipant) {
  appendLog('participant', participant.sid, 'connected', participant.metadata);

  const div = document.createElement('div');
  div.id = participant.sid;
  div.innerText = participant.identity;
  div.className = 'col-md-6 video-container';
  $('remote-area')?.appendChild(div);

  participant.on(ParticipantEvent.TrackSubscribed, (track) => {
    trackSubscribed(div, track, participant);
  });
  participant.on(ParticipantEvent.TrackUnsubscribed, (track) => {
    trackUnsubscribed(track, participant);
  });

  participant.tracks.forEach((publication) => {
    if (!publication.isSubscribed) return;
    trackSubscribed(div, publication.track!, participant);
  });
}

function participantDisconnected(participant: RemoteParticipant) {
  appendLog('participant', participant.sid, 'disconnected');

  $(participant.sid)?.remove();
}

function handleRoomDisconnect() {
  appendLog('disconnected from room');
  setButtonsForState(false);
  if (videoTrack) {
    videoTrack.stop();
    trackUnsubscribed(videoTrack);
  }
  if (audioTrack) {
    audioTrack.stop();
    trackUnsubscribed(audioTrack);
  }
  $('local-video')!.innerHTML = '';
}

let currentRoom: Room;
let videoTrack: LocalVideoTrack | undefined;
let audioTrack: LocalAudioTrack;
let screenTrack: LocalVideoTrack | undefined;
window.connectWithFormInput = () => {
  const url = (<HTMLInputElement>$('url')).value;
  const token = (<HTMLInputElement>$('token')).value;
  const simulcast = (<HTMLInputElement>$('simulcast')).checked;

  window.connectToRoom(url, token, simulcast);
};

window.connectToRoom = async (
  url: string,
  token: string,
  simulcast: boolean = false,
) => {
  let room: Room;
  try {
    room = await connect(url, token, {
      logLevel: LogLevel.debug,
      audio: true,
      video: {
        resolution: VideoPresets.qhd.resolution,
      },
      simulcast,
    });
  } catch (error) {
    let message: any = error;
    if (error.message) {
      message = error.message;
    }
    appendLog('could not connect:', message);
    return;
  }

  window.currentRoom = room;
  appendLog('connected to room', room.name);
  setButtonsForState(true);
  currentRoom = room;
  window.currentRoom = room;

  room
    .on(RoomEvent.ParticipantConnected, participantConnected)
    .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
    .on(RoomEvent.DataReceived, handleData)
    .on(RoomEvent.ActiveSpeakersChanged, handleSpeakerChanged)
    .on(RoomEvent.Disconnected, handleRoomDisconnect)
    .on(RoomEvent.Reconnecting, () => appendLog('Reconnecting to room'))
    .on(RoomEvent.Reconnected, () => appendLog('Successfully reconnected!'));

  appendLog('room participants', room.participants.keys());
  room.participants.forEach((participant) => {
    participantConnected(participant);
  });

  $('local-video')!.innerHTML = `${room.localParticipant.identity} (me)`;

  // add already published tracks
  currentRoom.localParticipant.tracks.forEach((publication) => {
    if (publication.kind === Track.Kind.Video) {
      videoTrack = <LocalVideoTrack>publication.track;
      publishLocalVideo(videoTrack);
    } else if (publication.kind === Track.Kind.Audio) {
      // skip adding local audio track, to avoid your own sound
      // only process local video tracks
      audioTrack = <LocalAudioTrack>publication.track;
    }
  });
};

window.muteVideo = () => {
  if (!currentRoom || !videoTrack) return;
  const video = getMyVideo();
  if (!videoTrack.isMuted) {
    appendLog('muting video');
    videoTrack.mute();
    // hide from display
    if (video) {
      video.style.display = 'none';
    }
  } else {
    appendLog('unmuting video');
    videoTrack.unmute();
    if (video) {
      video.style.display = '';
    }
  }
};

window.muteAudio = () => {
  if (!currentRoom || !audioTrack) return;
  if (!audioTrack.isMuted) {
    appendLog('muting audio');
    audioTrack.mute();
  } else {
    appendLog('unmuting audio');
    audioTrack.unmute();
  }
};

window.toggleVideo = async () => {
  if (!currentRoom) return;
  if (videoTrack) {
    appendLog('turning video off');
    currentRoom.localParticipant.unpublishTrack(videoTrack);
    videoTrack.detach();
    videoTrack = undefined;
    const video = getMyVideo();
    if (video) video.remove();
  } else {
    appendLog('turning video on');
    videoTrack = await createLocalVideoTrack();
    await publishLocalVideo(videoTrack);
  }
};

window.enterText = () => {
  const textField = <HTMLInputElement>$('entry');
  if (textField.value) {
    const msg = encoder.encode(textField.value);
    currentRoom.localParticipant.publishData(msg, DataPacket_Kind.RELIABLE);
    (<HTMLTextAreaElement>(
      $('chat')
    )).value += `${currentRoom.localParticipant.identity} (me): ${textField.value}\n`;
    textField.value = '';
  }
};

window.shareScreen = async () => {
  if (screenTrack !== undefined) {
    currentRoom.localParticipant.unpublishTrack(screenTrack);
    screenTrack = undefined;
    return;
  }

  const preset = VideoPresets.hd;
  // typescript definition is missing getDisplayMedia: https://github.com/microsoft/TypeScript/issues/33232
  // @ts-ignore
  const ssMediaStream: MediaStream = await navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: {
      width: preset.resolution.width,
      height: preset.resolution.height,
    },
  });
  for (const t of ssMediaStream.getTracks()) {
    screenTrack = new LocalVideoTrack(t, 'screen');
    await currentRoom.localParticipant.publishTrack(t, {
      videoEncoding: { maxFramerate: 30, maxBitrate: 3000000 },
      videoCodec: 'h264',
      simulcast: false,
    });
  }
};

window.disconnectSignal = () => {
  if (!currentRoom) return;
  currentRoom.engine.client.close();
  if (currentRoom.engine.client.onClose) {
    currentRoom.engine.client.onClose('manual disconnect');
  }
};

window.disconnectRoom = () => {
  if (currentRoom) {
    currentRoom.disconnect();
  }
};

async function publishLocalVideo(track: LocalVideoTrack) {
  await currentRoom.localParticipant.publishTrack(track);
  const video = track.attach();
  video.style.transform = 'scale(-1, 1)';
  $('local-video')!.appendChild(video);
}

function setButtonsForState(connected: boolean) {
  const connectedSet = [
    'toggle-video-button',
    'mute-video-button',
    'mute-audio-button',
    'share-screen-button',
    'disconnect-ws-button',
    'disconnect-room-button',
  ];
  const disconnectedSet = ['connect-button'];

  const toRemove = connected ? connectedSet : disconnectedSet;
  const toAdd = connected ? disconnectedSet : connectedSet;

  toRemove.forEach((id) => $(id)?.removeAttribute('disabled'));
  toAdd.forEach((id) => $(id)?.setAttribute('disabled', 'true'));
}

function getMyVideo() {
  return <HTMLVideoElement>document.querySelector('#local-video video');
}

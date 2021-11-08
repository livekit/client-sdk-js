import {
  connect, CreateVideoTrackOptions, DataPacket_Kind, LocalTrack, LocalTrackPublication, LogLevel,
  MediaDeviceFailure,
  Participant,
  ParticipantEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track, TrackPublication, VideoPresets,
} from '../src/index';
import { ConnectionQuality } from '../src/room/participant/Participant';

const $ = (id: string) => document.getElementById(id);

declare global {
  interface Window {
    connectWithFormInput: any;
    connectToRoom: any;
    handleDeviceSelected: any;
    shareScreen: any;
    toggleVideo: any;
    toggleAudio: any;
    enterText: any;
    disconnectSignal: any;
    disconnectRoom: any;
    currentRoom: any;
    startAudio: any;
    flipVideo: any;
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
  pub?: RemoteTrackPublication,
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
function handleData(msg: Uint8Array, participant?: RemoteParticipant) {
  const str = decoder.decode(msg);
  const chat = <HTMLTextAreaElement>$('chat');
  let from = 'server';
  if (participant) {
    from = participant.identity;
  }
  chat.value += `${from}: ${str}\n`;
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
  participant.on(ParticipantEvent.TrackUnsubscribed, (track, pub) => {
    trackUnsubscribed(track, pub, participant);
  });
}

function participantDisconnected(participant: RemoteParticipant) {
  appendLog('participant', participant.sid, 'disconnected');

  $(participant.sid)?.remove();
}

function handleRoomDisconnect() {
  appendLog('disconnected from room');
  setButtonsForState(false);
  $('local-video')!.innerHTML = '';

  // clear the chat area on disconnect
  clearChat();

  // clear remote area on disconnect
  clearRemoteArea();
}

function setButtonState(buttonId: string, buttonText: string, isActive: boolean) {
  const el = $(buttonId);
  if (!el) return;

  el.innerHTML = buttonText;
  if (isActive) {
    el.classList.add('active');
  } else {
    el.classList.remove('active');
  }
}

function clearChat() {
  const chat = <HTMLTextAreaElement>$('chat');
  chat.value = '';
}

function clearRemoteArea() {
  const el = $('remote-area');
  if (!el) return;

  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

let currentRoom: Room;
window.connectWithFormInput = () => {
  const url = (<HTMLInputElement>$('url')).value;
  const token = (<HTMLInputElement>$('token')).value;
  const simulcast = (<HTMLInputElement>$('simulcast')).checked;
  const forceTURN = (<HTMLInputElement>$('force-turn')).checked;

  window.connectToRoom(url, token, simulcast, forceTURN);
};

window.connectToRoom = async (
  url: string,
  token: string,
  simulcast: boolean = false,
  forceTURN: boolean = false,
) => {
  let room: Room;
  const rtcConfig: RTCConfiguration = {};
  if (forceTURN) {
    rtcConfig.iceTransportPolicy = 'relay';
  }
  const shouldPublish = (<HTMLInputElement>$('publish-option')).checked;

  try {
    room = await connect(url, token, {
      logLevel: LogLevel.debug,
      rtcConfig,
      audio: shouldPublish,
      video: shouldPublish,
      autoManageVideo: true,
      publishDefaults: {
        simulcast,
      },
    });
  } catch (error) {
    let message: any = error;
    if (error.message) {
      message = error.message;
    }
    appendLog('could not connect:', message);
    return;
  }

  appendLog('connected to room', room.name);
  currentRoom = room;
  window.currentRoom = room;
  setButtonsForState(true);
  updateButtonsForPublishState();

  room
    .on(RoomEvent.ParticipantConnected, participantConnected)
    .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
    .on(RoomEvent.DataReceived, handleData)
    .on(RoomEvent.ActiveSpeakersChanged, handleSpeakerChanged)
    .on(RoomEvent.Disconnected, handleRoomDisconnect)
    .on(RoomEvent.Reconnecting, () => appendLog('Reconnecting to room'))
    .on(RoomEvent.Reconnected, () => appendLog('Successfully reconnected!'))
    .on(RoomEvent.TrackMuted, (pub: TrackPublication, p: Participant) => appendLog('track was muted', pub.trackSid, p.identity))
    .on(RoomEvent.TrackUnmuted, (pub: TrackPublication, p: Participant) => appendLog('track was unmuted', pub.trackSid, p.identity))
    .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
      if (pub.kind === Track.Kind.Video) {
        attachLocalVideo();
      }
      updateButtonsForPublishState();
    })
    .on(RoomEvent.RoomMetadataChanged, (metadata) => {
      appendLog('new metadata for room', metadata);
    })
    .on(RoomEvent.MediaDevicesChanged, handleDevicesChanged)
    .on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (room.canPlaybackAudio) {
        $('start-audio-button')?.setAttribute('disabled', 'true');
      } else {
        $('start-audio-button')?.removeAttribute('disabled');
      }
    })
    .on(RoomEvent.MediaDevicesError, (e: Error) => {
      const failure = MediaDeviceFailure.getFailure(e);
      appendLog('media device failure', failure);
    })
    .on(RoomEvent.ConnectionQualityChanged,
      (quality: ConnectionQuality, participant: Participant) => {
        appendLog('connection quality changed', participant.identity, quality);
      });

  appendLog('room participants', room.participants.keys());
  room.participants.forEach((participant) => {
    participantConnected(participant);
  });

  $('local-video')!.innerHTML = `${room.localParticipant.identity} (me)`;
};

window.toggleVideo = async () => {
  if (!currentRoom) return;
  const video = getMyVideo();
  if (currentRoom.localParticipant.isCameraEnabled) {
    appendLog('disabling video');
    await currentRoom.localParticipant.setCameraEnabled(false);
    // hide from display
    if (video) {
      video.style.display = 'none';
    }
  } else {
    appendLog('enabling video');
    await currentRoom.localParticipant.setCameraEnabled(true);
    attachLocalVideo();
    if (video) {
      video.style.display = '';
    }
  }
  updateButtonsForPublishState();
};

window.toggleAudio = async () => {
  if (!currentRoom) return;
  if (currentRoom.localParticipant.isMicrophoneEnabled) {
    appendLog('disabling audio');
    await currentRoom.localParticipant.setMicrophoneEnabled(false);
  } else {
    appendLog('enabling audio');
    await currentRoom.localParticipant.setMicrophoneEnabled(true);
  }
  updateButtonsForPublishState();
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
  if (!currentRoom) return;

  if (currentRoom.localParticipant.isScreenShareEnabled) {
    appendLog('stopping screen share');
    await currentRoom.localParticipant.setScreenShareEnabled(false);
  } else {
    appendLog('starting screen share');
    await currentRoom.localParticipant.setScreenShareEnabled(true);
    appendLog('started screen share');
  }
  updateButtonsForPublishState();
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

window.startAudio = () => {
  currentRoom.startAudio();
};

let isFrontFacing = true;
window.flipVideo = () => {
  const videoPub = currentRoom.localParticipant.getTrack(Track.Source.Camera);
  if (!videoPub) {
    return;
  }
  if (isFrontFacing) {
    setButtonState('flip-video-button', 'Front Camera', false);
  } else {
    setButtonState('flip-video-button', 'Back Camera', false);
  }
  isFrontFacing = !isFrontFacing;
  const options: CreateVideoTrackOptions = {
    resolution: VideoPresets.qhd.resolution,
    facingMode: isFrontFacing ? 'user' : 'environment',
  };
  videoPub.videoTrack?.restartTrack(options);
};

const defaultDevices = new Map<MediaDeviceKind, string>();
window.handleDeviceSelected = async (e: Event) => {
  const deviceId = (<HTMLSelectElement>e.target).value;
  const elementId = (<HTMLSelectElement>e.target).id;
  const kind = elementMapping[elementId];
  if (!kind) {
    return;
  }

  defaultDevices.set(kind, deviceId);

  if (currentRoom) {
    await currentRoom.switchActiveDevice(kind, deviceId);
  }
};

setTimeout(handleDevicesChanged, 100);

async function attachLocalVideo() {
  const videoPub = currentRoom.localParticipant.getTrack(Track.Source.Camera);
  const videoTrack = videoPub?.videoTrack;
  if (!videoTrack) {
    return;
  }

  if (videoTrack.attachedElements.length === 0) {
    const video = videoTrack.attach();
    video.style.transform = 'scale(-1, 1)';
    $('local-video')!.appendChild(video);
  }
}

function setButtonsForState(connected: boolean) {
  const connectedSet = [
    'toggle-video-button',
    'toggle-audio-button',
    'share-screen-button',
    'disconnect-ws-button',
    'disconnect-room-button',
    'flip-video-button',
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

const elementMapping: { [k: string]: MediaDeviceKind } = {
  'video-input': 'videoinput',
  'audio-input': 'audioinput',
  'audio-output': 'audiooutput',
};
async function handleDevicesChanged() {
  Promise.all(Object.keys(elementMapping).map(async (id) => {
    const kind = elementMapping[id];
    if (!kind) {
      return;
    }
    const devices = await Room.getLocalDevices(kind);
    const element = <HTMLSelectElement>$(id);
    populateSelect(kind, element, devices, defaultDevices.get(kind));
  }));
}

function populateSelect(
  kind: MediaDeviceKind,
  element: HTMLSelectElement,
  devices: MediaDeviceInfo[],
  selectedDeviceId?: string,
) {
  // clear all elements
  element.innerHTML = '';
  const initialOption = document.createElement('option');
  if (kind === 'audioinput') {
    initialOption.text = 'Audio Input (default)';
  } else if (kind === 'videoinput') {
    initialOption.text = 'Video Input (default)';
  } else if (kind === 'audiooutput') {
    initialOption.text = 'Audio Output (default)';
  }
  element.appendChild(initialOption);

  for (const device of devices) {
    const option = document.createElement('option');
    option.text = device.label;
    option.value = device.deviceId;
    if (device.deviceId === selectedDeviceId) {
      option.selected = true;
    }
    element.appendChild(option);
  }
}

function updateButtonsForPublishState() {
  if (!currentRoom) {
    return;
  }
  const lp = currentRoom.localParticipant;

  // video
  setButtonState(
    'toggle-video-button',
    `${lp.isCameraEnabled ? 'Disable' : 'Enable'} Video`,
    lp.isCameraEnabled,
  );

  // audio
  setButtonState(
    'toggle-audio-button',
    `${lp.isMicrophoneEnabled ? 'Disable' : 'Enable'} Audio`,
    lp.isMicrophoneEnabled,
  );

  // screen share
  setButtonState(
    'share-screen-button',
    lp.isScreenShareEnabled ? 'Stop Screen Share' : 'Share Screen',
    lp.isScreenShareEnabled,
  );
}

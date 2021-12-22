import {
  DataPacket_Kind, LocalParticipant,
  MediaDeviceFailure,
  Participant,
  ParticipantEvent,
  RemoteParticipant, Room, RoomConnectOptions, RoomEvent,
  RoomOptions, RoomState, setLogLevel, Track, TrackPublication,
  VideoCaptureOptions, VideoPresets,
} from '../src/index';
import { ConnectionQuality } from '../src/room/participant/Participant';

const $ = (id: string) => document.getElementById(id);

const state = {
  isFrontFacing: false,
  encoder: new TextEncoder(),
  decoder: new TextDecoder(),
  defaultDevices: new Map<MediaDeviceKind, string>(),
};

let currentRoom: Room | undefined;

// handles actions from the HTML
const appActions = {
  connectWithFormInput: async () => {
    const url = (<HTMLInputElement>$('url')).value;
    const token = (<HTMLInputElement>$('token')).value;
    const simulcast = (<HTMLInputElement>$('simulcast')).checked;
    const forceTURN = (<HTMLInputElement>$('force-turn')).checked;
    const adaptiveVideo = (<HTMLInputElement>$('adaptive-video')).checked;
    const shouldPublish = (<HTMLInputElement>$('publish-option')).checked;

    setLogLevel('debug');

    const roomOpts: RoomOptions = {
      autoManageVideo: adaptiveVideo,
      publishDefaults: {
        simulcast,
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.hd.resolution,
      },
    };

    const connectOpts: RoomConnectOptions = {};
    if (forceTURN) {
      connectOpts.rtcConfig = {
        iceTransportPolicy: 'relay',
      };
    }
    const room = await appActions.connectToRoom(url, token, roomOpts, connectOpts);

    if (room && shouldPublish) {
      await room.localParticipant.enableCameraAndMicrophone();
      updateButtonsForPublishState();
    }
  },

  connectToRoom: async (
    url: string,
    token: string,
    roomOptions?: RoomOptions,
    connectOptions?: RoomConnectOptions,
  ): Promise<Room | undefined> => {
    const room = new Room(roomOptions);
    room
      .on(RoomEvent.ParticipantConnected, participantConnected)
      .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
      .on(RoomEvent.DataReceived, handleData)
      .on(RoomEvent.Disconnected, handleRoomDisconnect)
      .on(RoomEvent.Reconnecting, () => appendLog('Reconnecting to room'))
      .on(RoomEvent.Reconnected, () => appendLog('Successfully reconnected!'))
      .on(RoomEvent.LocalTrackPublished, () => {
        renderParticipant(room.localParticipant);
        updateButtonsForPublishState();
        renderScreenShare();
      })
      .on(RoomEvent.LocalTrackUnpublished, () => {
        renderParticipant(room.localParticipant);
        updateButtonsForPublishState();
        renderScreenShare();
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

    try {
      await room.connect(url, token, connectOptions);
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

    appendLog('room participants', room.participants.keys());
    room.participants.forEach((participant) => {
      participantConnected(participant);
    });
    participantConnected(room.localParticipant);

    return room;
  },

  toggleAudio: async () => {
    if (!currentRoom) return;
    const enabled = currentRoom.localParticipant.isMicrophoneEnabled;
    if (enabled) {
      appendLog('disabling audio');
    } else {
      appendLog('enabling audio');
    }
    await currentRoom.localParticipant.setMicrophoneEnabled(!enabled);
    updateButtonsForPublishState();
  },

  toggleVideo: async () => {
    if (!currentRoom) return;
    const enabled = currentRoom.localParticipant.isCameraEnabled;
    if (enabled) {
      appendLog('disabling video');
    } else {
      appendLog('enabling video');
    }
    await currentRoom.localParticipant.setCameraEnabled(!enabled);
    renderParticipant(currentRoom.localParticipant);

    // update display
    updateButtonsForPublishState();
  },

  flipVideo: () => {
    const videoPub = currentRoom?.localParticipant.getTrack(Track.Source.Camera);
    if (!videoPub) {
      return;
    }
    if (state.isFrontFacing) {
      setButtonState('flip-video-button', 'Front Camera', false);
    } else {
      setButtonState('flip-video-button', 'Back Camera', false);
    }
    state.isFrontFacing = !state.isFrontFacing;
    const options: VideoCaptureOptions = {
      resolution: VideoPresets.qhd.resolution,
      facingMode: state.isFrontFacing ? 'user' : 'environment',
    };
    videoPub.videoTrack?.restartTrack(options);
  },

  shareScreen: async () => {
    if (!currentRoom) return;

    const enabled = currentRoom.localParticipant.isScreenShareEnabled;
    appendLog(`${enabled ? 'stopping' : 'starting'} screen share`);
    await currentRoom.localParticipant.setScreenShareEnabled(!enabled);
    updateButtonsForPublishState();
  },

  startAudio: () => {
    currentRoom?.startAudio();
  },

  enterText: () => {
    if (!currentRoom) return;
    const textField = <HTMLInputElement>$('entry');
    if (textField.value) {
      const msg = state.encoder.encode(textField.value);
      currentRoom.localParticipant.publishData(msg, DataPacket_Kind.RELIABLE);
      (<HTMLTextAreaElement>(
      $('chat')
    )).value += `${currentRoom.localParticipant.identity} (me): ${textField.value}\n`;
      textField.value = '';
    }
  },

  disconnectRoom: () => {
    if (currentRoom) {
      currentRoom.disconnect();
    }
  },

  disconnectSignal: () => {
    if (!currentRoom) return;
    currentRoom.engine.client.close();
    if (currentRoom.engine.client.onClose) {
      currentRoom.engine.client.onClose('manual disconnect');
    }
  },

  handleDeviceSelected: async (e: Event) => {
    const deviceId = (<HTMLSelectElement>e.target).value;
    const elementId = (<HTMLSelectElement>e.target).id;
    const kind = elementMapping[elementId];
    if (!kind) {
      return;
    }

    state.defaultDevices.set(kind, deviceId);

    if (currentRoom) {
      await currentRoom.switchActiveDevice(kind, deviceId);
    }
  },
};

declare global {
  interface Window {
    currentRoom: any;
    appActions: typeof appActions;
  }
}

window.appActions = appActions;

// --------------------------- event handlers ------------------------------- //

function handleData(msg: Uint8Array, participant?: RemoteParticipant) {
  const str = state.decoder.decode(msg);
  const chat = <HTMLTextAreaElement>$('chat');
  let from = 'server';
  if (participant) {
    from = participant.identity;
  }
  chat.value += `${from}: ${str}\n`;
}

function participantConnected(participant: Participant) {
  appendLog('participant', participant.identity, 'connected', participant.metadata);
  participant
    .on(ParticipantEvent.TrackSubscribed, (_, pub: TrackPublication) => {
      appendLog('subscribed to track', pub.trackSid, participant.identity);
      renderParticipant(participant);
      renderScreenShare();
    })
    .on(ParticipantEvent.TrackUnsubscribed, (_, pub: TrackPublication) => {
      appendLog('unsubscribed from track', pub.trackSid);
      renderParticipant(participant);
      renderScreenShare();
    })
    .on(ParticipantEvent.TrackMuted, (pub: TrackPublication) => {
      appendLog('track was muted', pub.trackSid, participant.identity);
      renderParticipant(participant);
    })
    .on(ParticipantEvent.TrackUnmuted, (pub: TrackPublication) => {
      appendLog('track was unmuted', pub.trackSid, participant.identity);
      renderParticipant(participant);
    })
    .on(ParticipantEvent.IsSpeakingChanged, () => {
      renderParticipant(participant);
    })
    .on(ParticipantEvent.ConnectionQualityChanged, () => {
      renderParticipant(participant);
    });
}

function participantDisconnected(participant: RemoteParticipant) {
  appendLog('participant', participant.sid, 'disconnected');

  renderParticipant(participant, true);
}

function handleRoomDisconnect() {
  if (!currentRoom) return;
  appendLog('disconnected from room');
  setButtonsForState(false);
  renderParticipant(currentRoom.localParticipant, true);
  currentRoom.participants.forEach((p) => {
    renderParticipant(p, true);
  });
  renderScreenShare();

  const container = $('participants-area');
  if (container) {
    container.innerHTML = '';
  }

  // clear the chat area on disconnect
  const chat = <HTMLTextAreaElement>$('chat');
  chat.value = '';

  currentRoom = undefined;
  window.currentRoom = undefined;
}

// -------------------------- rendering helpers ----------------------------- //

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

// updates participant UI
function renderParticipant(participant: Participant, remove: boolean = false) {
  const container = $('participants-area');
  if (!container) return;
  let div = $(`participant-${participant.sid}`);
  if (!div && !remove) {
    div = document.createElement('div');
    div.id = `participant-${participant.sid}`;
    div.className = 'participant';
    div.innerHTML = `
      <video id="video-${participant.sid}"></video>
      <audio id="audio-${participant.sid}"></audio>
      <div class="info-bar">
        <div id="name-${participant.sid}" class="name">
        </div>
        <div id="size-${participant.sid}" class="size">
        </div>
        <div class="right">
          <span id="signal-${participant.sid}"></span>
          <span id="mic-${participant.sid}" class="mic-on"></span>
        </div>
      </div>
    `;
    container.appendChild(div);

    const sizeElm = $(`size-${participant.sid}`);
    const videoElm = <HTMLVideoElement>$(`video-${participant.sid}`);
    videoElm.onresize = () => {
      updateVideoSize(videoElm!, sizeElm!);
    };
  }
  const videoElm = <HTMLVideoElement>$(`video-${participant.sid}`);
  const audioELm = <HTMLAudioElement>$(`audio-${participant.sid}`);
  if (remove) {
    div?.remove();
    if (videoElm) {
      videoElm.srcObject = null;
      videoElm.src = '';
    }
    if (audioELm) {
      audioELm.srcObject = null;
      audioELm.src = '';
    }
    return;
  }

  // update properties
  $(`name-${participant.sid}`)!.innerHTML = participant.identity;
  const micElm = $(`mic-${participant.sid}`)!;
  const signalElm = $(`signal-${participant.sid}`)!;
  const cameraPub = participant.getTrack(Track.Source.Camera);
  const micPub = participant.getTrack(Track.Source.Microphone);
  if (participant.isSpeaking) {
    div!.classList.add('speaking');
  } else {
    div!.classList.remove('speaking');
  }

  const cameraEnabled = cameraPub && cameraPub.isSubscribed && !cameraPub.isMuted;
  if (cameraEnabled) {
    cameraPub?.videoTrack?.attach(videoElm);
    if (participant instanceof LocalParticipant) {
      // flip
      videoElm.style.transform = 'scale(-1, 1)';
    }
  } else if (cameraPub?.videoTrack) {
    // detach manually whenever possible
    cameraPub.videoTrack?.detach(videoElm);
  } else {
    videoElm.src = '';
    videoElm.srcObject = null;
  }

  const micEnabled = micPub && micPub.isSubscribed && !micPub.isMuted;
  if (micEnabled) {
    if (!(participant instanceof LocalParticipant)) {
      // don't attach local audio
      micPub?.audioTrack?.attach(audioELm);
    }
    micElm.className = 'mic-on';
    micElm.innerHTML = '<i class="fas fa-microphone"></i>';
  } else {
    micElm.className = 'mic-off';
    micElm.innerHTML = '<i class="fas fa-microphone-slash"></i>';
  }

  switch (participant.connectionQuality) {
    case ConnectionQuality.Excellent:
    case ConnectionQuality.Good:
    case ConnectionQuality.Poor:
      signalElm.className = `connection-${participant.connectionQuality}`;
      signalElm.innerHTML = '<i class="fas fa-circle"></i>';
      break;
    default:
      signalElm.innerHTML = '';
      // do nothing
  }
}

function renderScreenShare() {
  const div = $('screenshare-area')!;
  if (!currentRoom || currentRoom.state !== RoomState.Connected) {
    div.style.display = 'none';
    return;
  }
  let participant: Participant | undefined;
  let screenSharePub: TrackPublication | undefined = currentRoom.localParticipant.getTrack(
    Track.Source.ScreenShare,
  );
  if (!screenSharePub) {
    currentRoom.participants.forEach((p) => {
      if (screenSharePub) {
        return;
      }
      participant = p;
      const pub = p.getTrack(Track.Source.ScreenShare);
      if (pub?.isSubscribed) {
        screenSharePub = pub;
      }
    });
  } else {
    participant = currentRoom.localParticipant;
  }

  if (screenSharePub && participant) {
    div.style.display = 'block';
    const videoElm = <HTMLVideoElement>$('screenshare-video');
    screenSharePub.videoTrack?.attach(videoElm);
    videoElm.onresize = () => {
      updateVideoSize(videoElm, <HTMLSpanElement>$('screenshare-resolution'));
    };
    const infoElm = $('screenshare-info')!;
    infoElm.innerHTML = `Screenshare from ${participant.identity}`;
  } else {
    div.style.display = 'none';
  }
}

function updateVideoSize(element: HTMLVideoElement, target: HTMLElement) {
  target.innerHTML = `(${element.videoWidth}x${element.videoHeight})`;
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

setTimeout(handleDevicesChanged, 100);

function setButtonsForState(connected: boolean) {
  const connectedSet = [
    'toggle-video-button',
    'toggle-audio-button',
    'share-screen-button',
    'disconnect-ws-button',
    'disconnect-room-button',
    'flip-video-button',
    'send-button',
  ];
  const disconnectedSet = ['connect-button'];

  const toRemove = connected ? connectedSet : disconnectedSet;
  const toAdd = connected ? disconnectedSet : connectedSet;

  toRemove.forEach((id) => $(id)?.removeAttribute('disabled'));
  toAdd.forEach((id) => $(id)?.setAttribute('disabled', 'true'));
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
    populateSelect(kind, element, devices, state.defaultDevices.get(kind));
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

import {
  ConnectionQuality,
  ConnectionState,
  DataPacket_Kind,
  DisconnectReason,
  LocalParticipant,
  LogLevel,
  MediaDeviceFailure,
  Participant,
  ParticipantEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  RoomConnectOptions,
  RoomEvent,
  RoomOptions,
  setLogLevel,
  Track,
  TrackPublication,
  VideoCaptureOptions,
  VideoCodec,
  VideoPresets,
  VideoQuality
} from '../src/index'

const $ = (id: string) => document.getElementById(id);

const state = {
  isFrontFacing: false,
  encoder: new TextEncoder(),
  decoder: new TextDecoder(),
  defaultDevices: new Map<MediaDeviceKind, string>(),
  bitrateInterval: undefined as any,
};
let currentRoom: Room | undefined;

let startTime: number;

const searchParams = new URLSearchParams(window.location.search);
const storedUrl = searchParams.get('url') ?? 'ws://localhost:7880';
const storedToken = searchParams.get('token') ?? '';
(<HTMLInputElement>$('url')).value = storedUrl;
(<HTMLInputElement>$('token')).value = storedToken;

function updateSearchParams(url: string, token: string) {
  const params = new URLSearchParams({ url, token });
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

// handles actions from the HTML
const appActions = {
  connectWithFormInput: async () => {
    const url = (<HTMLInputElement>$('url')).value;
    const token = (<HTMLInputElement>$('token')).value;
    const simulcast = (<HTMLInputElement>$('simulcast')).checked;
    const dynacast = (<HTMLInputElement>$('dynacast')).checked;
    const forceTURN = (<HTMLInputElement>$('force-turn')).checked;
    const adaptiveStream = (<HTMLInputElement>$('adaptive-stream')).checked;
    const shouldPublish = (<HTMLInputElement>$('publish-option')).checked;
    const preferredCodec = (<HTMLSelectElement>$('preferred-codec')).value as VideoCodec;

    setLogLevel(LogLevel.debug);
    updateSearchParams(url, token);

    const roomOpts: RoomOptions = {
      adaptiveStream,
      dynacast,
      publishDefaults: {
        simulcast,
        videoSimulcastLayers: [VideoPresets.h90, VideoPresets.h216],
        videoCodec: preferredCodec || 'vp8',
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h1080.resolution,
      },
    };

    const connectOpts: RoomConnectOptions = {
      autoSubscribe: true,
    };
    if (forceTURN) {
      connectOpts.rtcConfig = {
        iceTransportPolicy: 'relay',
      };
    }
    await appActions.connectToRoom(url, token, roomOpts, connectOpts, shouldPublish);

    state.bitrateInterval = setInterval(renderBitrate, 1000);
  },

  connectToRoom: async (
    url: string,
    token: string,
    roomOptions?: RoomOptions,
    connectOptions?: RoomConnectOptions,
    shouldPublish?: boolean,
  ): Promise<Room | undefined> => {
    const room = new Room(roomOptions);

    room
      .on(RoomEvent.ParticipantConnected, participantConnected)
      .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
      .on(RoomEvent.DataReceived, handleData)
      .on(RoomEvent.Disconnected, handleRoomDisconnect)
      .on(RoomEvent.Reconnecting, () => appendLog('Reconnecting to room'))
      .on(RoomEvent.Reconnected, () => {
        appendLog('Successfully reconnected. server', room.engine.connectedServerAddress);
      })
      .on(RoomEvent.LocalTrackPublished, () => {
        renderParticipant(room.localParticipant);
        updateButtonsForPublishState();
        renderScreenShare(room);
      })
      .on(RoomEvent.LocalTrackUnpublished, () => {
        renderParticipant(room.localParticipant);
        updateButtonsForPublishState();
        renderScreenShare(room);
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
      .on(
        RoomEvent.ConnectionQualityChanged,
        (quality: ConnectionQuality, participant?: Participant) => {
          appendLog('connection quality changed', participant?.identity, quality);
        },
      )
      .on(RoomEvent.TrackSubscribed, (_1, pub, participant) => {
        appendLog('subscribed to track', pub.trackSid, participant.identity);
        renderParticipant(participant);
        renderScreenShare(room);
      })
      .on(RoomEvent.TrackUnsubscribed, (_, pub, participant) => {
        appendLog('unsubscribed from track', pub.trackSid);
        renderParticipant(participant);
        renderScreenShare(room);
      })
      .on(RoomEvent.SignalConnected, async () => {
        if (shouldPublish) {
          await Promise.all([
            room.localParticipant.setCameraEnabled(true),
            room.localParticipant.setMicrophoneEnabled(true),
          ]);
          updateButtonsForPublishState();
        }
      });

    try {
      startTime = Date.now();
      await room.connect(url, token, connectOptions);
      const elapsed = Date.now() - startTime;
      appendLog(
        `successfully connected to ${room.name} in ${Math.round(elapsed)}ms`,
        room.engine.connectedServerAddress,
      );
    } catch (error: any) {
      let message: any = error;
      if (error.message) {
        message = error.message;
      }
      appendLog('could not connect:', message);
      return;
    }
    currentRoom = room;
    window.currentRoom = room;
    setButtonsForState(true);

    room.participants.forEach((participant) => {
      participantConnected(participant);
    });
    participantConnected(room.localParticipant);

    return room;
  },

  toggleAudio: async () => {
    if (!currentRoom) return;
    const enabled = currentRoom.localParticipant.isMicrophoneEnabled;
    setButtonDisabled('toggle-audio-button', true);
    if (enabled) {
      appendLog('disabling audio');
    } else {
      appendLog('enabling audio');
    }
    await currentRoom.localParticipant.setMicrophoneEnabled(!enabled);
    setButtonDisabled('toggle-audio-button', false);
    updateButtonsForPublishState();
  },

  toggleVideo: async () => {
    if (!currentRoom) return;
    setButtonDisabled('toggle-video-button', true);
    const enabled = currentRoom.localParticipant.isCameraEnabled;
    if (enabled) {
      appendLog('disabling video');
    } else {
      appendLog('enabling video');
    }
    await currentRoom.localParticipant.setCameraEnabled(!enabled);
    setButtonDisabled('toggle-video-button', false);
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
      resolution: VideoPresets.h720.resolution,
      facingMode: state.isFrontFacing ? 'user' : 'environment',
    };
    videoPub.videoTrack?.restartTrack(options);
  },

  shareScreen: async () => {
    if (!currentRoom) return;

    const enabled = currentRoom.localParticipant.isScreenShareEnabled;
    appendLog(`${enabled ? 'stopping' : 'starting'} screen share`);
    setButtonDisabled('share-screen-button', true);
    await currentRoom.localParticipant.setScreenShareEnabled(!enabled, { audio: true });
    setButtonDisabled('share-screen-button', false);
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
    if (state.bitrateInterval) {
      clearInterval(state.bitrateInterval);
    }
  },

  handleScenario: (e: Event) => {
    const scenario = (<HTMLSelectElement>e.target).value;
    if (scenario !== '') {
      currentRoom?.simulateScenario(scenario);
      (<HTMLSelectElement>e.target).value = '';
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

  handlePreferredQuality: (e: Event) => {
    const quality = (<HTMLSelectElement>e.target).value;
    let q = VideoQuality.HIGH;
    switch (quality) {
      case 'low':
        q = VideoQuality.LOW;
        break;
      case 'medium':
        q = VideoQuality.MEDIUM;
        break;
      case 'high':
        q = VideoQuality.HIGH;
        break;
      default:
        break;
    }
    if (currentRoom) {
      currentRoom.participants.forEach((participant) => {
        participant.tracks.forEach((track) => {
          track.setVideoQuality(q);
        });
      });
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

function handleRoomDisconnect(reason?: DisconnectReason) {
  if (!currentRoom) return;
  appendLog('disconnected from room', { reason });
  setButtonsForState(false);
  renderParticipant(currentRoom.localParticipant, true);
  currentRoom.participants.forEach((p) => {
    renderParticipant(p, true);
  });
  renderScreenShare(currentRoom);

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
      logger.innerHTML += `${
        JSON && JSON.stringify ? JSON.stringify(args[i], undefined, 2) : args[i]
      } `;
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
  const { identity } = participant;
  let div = $(`participant-${identity}`);
  if (!div && !remove) {
    div = document.createElement('div');
    div.id = `participant-${identity}`;
    div.className = 'participant';
    div.innerHTML = `
      <video id="video-${identity}"></video>
      <audio id="audio-${identity}"></audio>
      <div class="info-bar">
        <div id="name-${identity}" class="name">
        </div>
        <div style="text-align: center;">
          <span id="codec-${identity}" class="codec">
          </span>
          <span id="size-${identity}" class="size">
          </span>
          <span id="bitrate-${identity}" class="bitrate">
          </span>
        </div>
        <div class="right">
          <span id="signal-${identity}"></span>
          <span id="mic-${identity}" class="mic-on"></span>
        </div>
      </div>
      ${
        participant instanceof RemoteParticipant &&
        `<div class="volume-control">
        <input id="volume-${identity}" type="range" min="0" max="1" step="0.1" value="1" orient="vertical" />
      </div>`
      }

    `;
    container.appendChild(div);

    const sizeElm = $(`size-${identity}`);
    const videoElm = <HTMLVideoElement>$(`video-${identity}`);
    videoElm.onresize = () => {
      updateVideoSize(videoElm!, sizeElm!);
    };
  }
  const videoElm = <HTMLVideoElement>$(`video-${identity}`);
  const audioELm = <HTMLAudioElement>$(`audio-${identity}`);
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
  $(`name-${identity}`)!.innerHTML = participant.identity;
  if (participant instanceof LocalParticipant) {
    $(`name-${identity}`)!.innerHTML += ' (you)';
  }
  const micElm = $(`mic-${identity}`)!;
  const signalElm = $(`signal-${identity}`)!;
  const cameraPub = participant.getTrack(Track.Source.Camera);
  const micPub = participant.getTrack(Track.Source.Microphone);
  if (participant.isSpeaking) {
    div!.classList.add('speaking');
  } else {
    div!.classList.remove('speaking');
  }

  if (participant instanceof RemoteParticipant) {
    const volumeSlider = <HTMLInputElement>$(`volume-${identity}`);
    volumeSlider.addEventListener('input', (ev) => {
      participant.setVolume(Number.parseFloat((ev.target as HTMLInputElement).value));
    });
  }

  const cameraEnabled = cameraPub && cameraPub.isSubscribed && !cameraPub.isMuted;
  if (cameraEnabled) {
    if (participant instanceof LocalParticipant) {
      // flip
      videoElm.style.transform = 'scale(-1, 1)';
    } else if (!cameraPub?.videoTrack?.attachedElements.includes(videoElm)) {
      const renderStartTime = Date.now();
      // measure time to render
      videoElm.onloadeddata = () => {
        const elapsed = Date.now() - renderStartTime;
        let fromJoin = 0;
        if (participant.joinedAt && participant.joinedAt.getTime() < startTime) {
          fromJoin = Date.now() - startTime;
        }
        appendLog(
          `RemoteVideoTrack ${cameraPub?.trackSid} (${videoElm.videoWidth}x${videoElm.videoHeight}) rendered in ${elapsed}ms`,
          fromJoin > 0 ? `, ${fromJoin}ms from start` : '',
        );
      };
    }
    cameraPub?.videoTrack?.attach(videoElm);
  } else {
    // clear information display
    $(`size-${identity}`)!.innerHTML = '';
    if (cameraPub?.videoTrack) {
      // detach manually whenever possible
      cameraPub.videoTrack?.detach(videoElm);
    } else {
      videoElm.src = '';
      videoElm.srcObject = null;
    }
  }

  const micEnabled = micPub && micPub.isSubscribed && !micPub.isMuted;
  if (micEnabled) {
    if (!(participant instanceof LocalParticipant)) {
      // don't attach local audio
      audioELm.onloadeddata = () => {
        if (participant.joinedAt && participant.joinedAt.getTime() < startTime) {
          const fromJoin = Date.now() - startTime;
          appendLog(`RemoteAudioTrack ${micPub?.trackSid} played ${fromJoin}ms from start`);
        }
      };
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

function renderScreenShare(room: Room) {
  const div = $('screenshare-area')!;
  if (room.state !== ConnectionState.Connected) {
    div.style.display = 'none';
    return;
  }
  let participant: Participant | undefined;
  let screenSharePub: TrackPublication | undefined = room.localParticipant.getTrack(
    Track.Source.ScreenShare,
  );
  let screenShareAudioPub: RemoteTrackPublication | undefined;
  if (!screenSharePub) {
    room.participants.forEach((p) => {
      if (screenSharePub) {
        return;
      }
      participant = p;
      const pub = p.getTrack(Track.Source.ScreenShare);
      if (pub?.isSubscribed) {
        screenSharePub = pub;
      }
      const audioPub = p.getTrack(Track.Source.ScreenShareAudio);
      if (audioPub?.isSubscribed) {
        screenShareAudioPub = audioPub;
      }
    });
  } else {
    participant = room.localParticipant;
  }

  if (screenSharePub && participant) {
    div.style.display = 'block';
    const videoElm = <HTMLVideoElement>$('screenshare-video');
    screenSharePub.videoTrack?.attach(videoElm);
    if (screenShareAudioPub) {
      screenShareAudioPub.audioTrack?.attach(videoElm);
    }
    videoElm.onresize = () => {
      updateVideoSize(videoElm, <HTMLSpanElement>$('screenshare-resolution'));
    };
    const infoElm = $('screenshare-info')!;
    infoElm.innerHTML = `Screenshare from ${participant.identity}`;
  } else {
    div.style.display = 'none';
  }
}

function renderBitrate() {
  if (!currentRoom || currentRoom.state !== ConnectionState.Connected) {
    return;
  }
  const participants: Participant[] = [...currentRoom.participants.values()];
  participants.push(currentRoom.localParticipant);

  for (const p of participants) {
    const elm = $(`bitrate-${p.identity}`);
    let totalBitrate = 0;
    for (const t of p.tracks.values()) {
      if (t.track) {
        totalBitrate += t.track.currentBitrate;
      }

      if (t.source === Track.Source.Camera) {
        if (t.videoTrack instanceof RemoteVideoTrack) {
          const codecElm = $(`codec-${p.identity}`)!;
          codecElm.innerHTML = t.videoTrack.getDecoderImplementation() ?? '';
        }
      }
    }
    let displayText = '';
    if (totalBitrate > 0) {
      displayText = `${Math.round(totalBitrate / 1024).toLocaleString()} kbps`;
    }
    if (elm) {
      elm.innerHTML = displayText;
    }
  }
}

function updateVideoSize(element: HTMLVideoElement, target: HTMLElement) {
  target.innerHTML = `(${element.videoWidth}x${element.videoHeight})`;
}

function setButtonState(
  buttonId: string,
  buttonText: string,
  isActive: boolean,
  isDisabled: boolean | undefined = undefined,
) {
  const el = $(buttonId) as HTMLButtonElement;
  if (!el) return;
  if (isDisabled !== undefined) {
    el.disabled = isDisabled;
  }
  el.innerHTML = buttonText;
  if (isActive) {
    el.classList.add('active');
  } else {
    el.classList.remove('active');
  }
}

function setButtonDisabled(buttonId: string, isDisabled: boolean) {
  const el = $(buttonId) as HTMLButtonElement;
  el.disabled = isDisabled;
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
  Promise.all(
    Object.keys(elementMapping).map(async (id) => {
      const kind = elementMapping[id];
      if (!kind) {
        return;
      }
      const devices = await Room.getLocalDevices(kind);
      const element = <HTMLSelectElement>$(id);
      populateSelect(kind, element, devices, state.defaultDevices.get(kind));
    }),
  );
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

async function acquireDeviceList() {
  handleDevicesChanged();
}

acquireDeviceList();

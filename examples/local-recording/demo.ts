//@ts-ignore
import type { LocalAudioTrack, RoomOptions } from '../../src/index';
import {
  ConnectionState,
  DisconnectReason,
  LocalAudioRecorder,
  LogLevel,
  MediaDeviceFailure,
  Participant,
  ParticipantEvent,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  setLogLevel,
} from '../../src/index';

setLogLevel(LogLevel.debug);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  defaultDevices: new Map<MediaDeviceKind, string>([['audioinput', 'default']]),
  microphoneTrack: undefined as LocalAudioTrack | undefined,
  recorder: undefined as LocalAudioRecorder | undefined,
  chunks: [] as Blob[],
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

    if (url && token) {
      updateSearchParams(url, token);
      try {
        await connect(url, token);
      } catch (e) {
        appendLog('error connecting', e);
      }
    } else {
      appendLog('url and token are required');
    }
  },

  createMicrophoneTrack: async () => {
    try {
      appendLog('Creating microphone track...');
      const track = await createLocalAudioTrack();
      track.source = Track.Source.Microphone;
      state.microphoneTrack = track;
      appendLog('Microphone track created successfully');
      updateButtonsForPublishState();
    } catch (e) {
      appendLog('Error creating microphone track:', e);
    }
  },

  publishMicrophoneTrack: async () => {
    if (state.microphoneTrack && currentRoom) {
      try {
        appendLog('Publishing microphone track...');
        await currentRoom.localParticipant.publishTrack(state.microphoneTrack);
        appendLog('Microphone track published successfully');
        updateButtonsForPublishState();
      } catch (e) {
        appendLog('Error publishing microphone track:', e);
      }
    } else {
      appendLog('Cannot publish: No microphone track created or not connected to room');
    }
  },

  unpublishMicrophoneTrack: async () => {
    if (state.microphoneTrack && currentRoom) {
      try {
        appendLog('Unpublishing microphone track...');
        await currentRoom.localParticipant.unpublishTrack(state.microphoneTrack);
        appendLog('Microphone track unpublished successfully');
        updateButtonsForPublishState();
      } catch (e) {
        appendLog('Error unpublishing microphone track:', e);
      }
    } else {
      appendLog('Cannot unpublish: No microphone track created or not connected to room');
    }
  },

  toggleAudioMute: async () => {
    if (state.microphoneTrack) {
      try {
        if (state.microphoneTrack.isMuted) {
          appendLog('Unmuting microphone track...');
          await state.microphoneTrack.unmute();
          appendLog('Microphone track unmuted');
        } else {
          appendLog('Muting microphone track...');
          await state.microphoneTrack.mute();
          appendLog('Microphone track muted');
        }
        updateButtonsForPublishState();
      } catch (e) {
        appendLog('Error toggling mute state:', e);
      }
    } else {
      appendLog('Cannot toggle mute: No microphone track created');
    }
  },

  startLocalRecording: async () => {
    if (state.microphoneTrack) {
      try {
        appendLog('Starting local recording...');
        state.recorder = new LocalAudioRecorder(state.microphoneTrack);
        appendLog('Local recording started');
        updateButtonsForPublishState();
      } catch (e) {
        appendLog('Error starting local recording:', e);
        return;
      }
      const stream = state.recorder.start();

      for await (const chunk of stream) {
        console.log('handle local audio chunk', chunk);
        state.chunks.push(chunk);
      }

      const blob = new Blob(state.chunks, { type: 'audio/ogg; codecs=opus' });
      const url = URL.createObjectURL(blob);
      state.chunks = [];
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recording.ogg';
      a.click();
    } else {
      appendLog('Cannot start recording: No microphone track created');
    }
  },

  stopLocalRecording: async () => {
    if (state.recorder) {
      try {
        appendLog('Stopping local recording...');
        await state.recorder.stop();
        state.recorder = undefined;
        updateButtonsForPublishState();
      } catch (e) {
        appendLog('Error stopping local recording:', e);
      }
    } else {
      appendLog('Cannot stop recording: No recording in progress');
    }
  },

  handleDeviceSelected: (e: Event) => {
    const deviceId = (<HTMLSelectElement>e.target).value;
    const elementId = (<HTMLSelectElement>e.target).id;
    const kind = elementMapping[elementId as keyof typeof elementMapping];
    if (!kind) {
      return;
    }

    state.defaultDevices.set(kind, deviceId);

    if (currentRoom) {
      switch (kind) {
        case 'audioinput':
          currentRoom.switchActiveDevice(kind, deviceId);
          break;
        case 'audiooutput':
          currentRoom.switchActiveDevice(kind, deviceId);
          break;
        default:
          break;
      }
    }
  },

  disconnectRoom: () => {
    if (currentRoom) {
      currentRoom.disconnect();
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

async function participantConnected(participant: Participant) {
  appendLog('participant', participant.identity, 'connected', participant.metadata);
  participant
    .on(ParticipantEvent.TrackMuted, () => {
      appendLog('track was muted', participant.identity);
    })
    .on(ParticipantEvent.TrackUnmuted, () => {
      appendLog('track was unmuted', participant.identity);
    });
}

function participantDisconnected(participant: RemoteParticipant) {
  appendLog('participant', participant.sid, 'disconnected');
}

function handleRoomDisconnect(reason?: DisconnectReason) {
  if (!currentRoom) return;
  appendLog('disconnected from room', { reason });

  // Stop any active recording
  if (state.recorder) {
    appendLog('Stopping recording due to room disconnect');
    try {
      state.recorder.stop();
      appendLog('Recording stopped due to disconnect');
    } catch (error) {
      appendLog('Error stopping recorder on disconnect:', error);
    }
    state.recorder = undefined;
  }

  setButtonsForState(false);

  const container = $('participants-area');
  if (container) {
    container.innerHTML = '';
  }

  currentRoom = undefined;
  window.currentRoom = undefined;
}

// -------------------------- rendering helpers ----------------------------- //

function appendLog(...args: any[]) {
  const logger = $('log')!;
  for (let i = 0; i < arguments.length; i += 1) {
    if (typeof args[i] === 'object') {
      logger.innerText += `${
        JSON && JSON.stringify ? JSON.stringify(args[i], undefined, 2) : args[i]
      } `;
    } else {
      logger.innerText += `${args[i]} `;
    }
  }
  logger.innerText += '\n';
  (() => {
    logger.scrollTop = logger.scrollHeight;
  })();
}

// --------------------------- connection handling -------------------------- //

async function connect(url: string, token: string) {
  if (currentRoom) {
    appendLog('disconnecting existing room');
    currentRoom.disconnect();
  }

  try {
    appendLog('connecting to', url);
    const roomOpts: RoomOptions = {
      stopLocalTrackOnUnpublish: false,
    };

    startTime = Date.now();
    const room = new Room(roomOpts);

    room
      .on(RoomEvent.ParticipantConnected, participantConnected)
      .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
      .on(RoomEvent.Disconnected, handleRoomDisconnect)
      .on(RoomEvent.LocalTrackPublished, () => {
        appendLog('Local track published');
        updateButtonsForPublishState();
      })
      .on(RoomEvent.LocalTrackUnpublished, () => {
        appendLog('Local track unpublished');
        updateButtonsForPublishState();
      })
      .on(RoomEvent.MediaDevicesError, (e: Error) => {
        const failure = MediaDeviceFailure.getFailure(e);
        appendLog('media device failure', failure);
      })
      .on(RoomEvent.ConnectionStateChanged, (connectionState: ConnectionState) => {
        appendLog('connection state changed', connectionState);
      })
      .on(RoomEvent.MediaDevicesChanged, handleDevicesChanged);

    await room.connect(url, token);

    currentRoom = room;
    window.currentRoom = room;

    appendLog('connected to room', room.name);
    appendLog('connection time', Date.now() - startTime);

    // Set button states based on connection
    setButtonsForState(true);

    // Acquire device list
    await acquireDeviceList();

    // Update publish state buttons
    updateButtonsForPublishState();
  } catch (error) {
    appendLog('error connecting to room', error);
  }
}

// ---------------------------- device management --------------------------- //

const elementMapping = {
  'audio-input': 'audioinput',
  'audio-output': 'audiooutput',
} as const;

async function handleDevicesChanged() {
  Promise.all(
    Object.keys(elementMapping).map(async (id) => {
      const kind = elementMapping[id as keyof typeof elementMapping];
      if (!kind) {
        return;
      }
      const devices = await Room.getLocalDevices(kind);
      const element = <HTMLSelectElement>$(id);
      populateSelect(element, devices, state.defaultDevices.get(kind));
    }),
  );
}

function populateSelect(
  element: HTMLSelectElement,
  devices: MediaDeviceInfo[],
  selectedDeviceId?: string,
) {
  // clear all elements
  element.innerHTML = '';

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

  // audio
  setButtonState(
    'toggle-audio-button',
    `${lp.isMicrophoneEnabled ? 'Disable' : 'Enable'} Audio`,
    lp.isMicrophoneEnabled,
  );

  // Update microphone track buttons based on state
  const hasMicTrack = !!state.microphoneTrack;
  const isPublished =
    hasMicTrack &&
    currentRoom.localParticipant
      .getTrackPublications()
      .some((pub) => pub.track === state.microphoneTrack);

  // Create mic track button
  setButtonDisabled('create-mic-track-button', hasMicTrack);

  // Publish/unpublish buttons
  setButtonDisabled('publish-mic-track-button', !hasMicTrack || isPublished);
  setButtonDisabled('unpublish-mic-track-button', !hasMicTrack || !isPublished);

  // Mute toggle button
  setButtonDisabled('toggle-audio-mute-button', !hasMicTrack);
  if (hasMicTrack) {
    setButtonState(
      'toggle-audio-mute-button',
      state.microphoneTrack!.isMuted ? 'Unmute' : 'Mute',
      !state.microphoneTrack!.isMuted,
    );
  }

  // Recording buttons
  const isRecording = !!state.recorder;
  setButtonDisabled('start-recording-button', !hasMicTrack || isRecording);
  setButtonDisabled('stop-recording-button', !isRecording);
}

async function acquireDeviceList() {
  handleDevicesChanged();
}

// -------------------------- button handling ------------------------------ //

function setButtonState(
  buttonId: string,
  buttonText: string,
  isActive: boolean,
  isDisabled: boolean | undefined = undefined,
) {
  const el = <HTMLButtonElement>$(buttonId);
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
  const el = <HTMLButtonElement>$(buttonId);
  if (el) {
    el.disabled = isDisabled;
  }
}

function setButtonsForState(connected: boolean) {
  const connectedButtons = [
    'toggle-audio-button',
    'disconnect-room-button',
    'create-mic-track-button',
  ];

  // Buttons that require both connection and a microphone track
  const trackDependentButtons = [
    'publish-mic-track-button',
    'unpublish-mic-track-button',
    'toggle-audio-mute-button',
    'start-recording-button',
  ];

  connectedButtons.forEach((id) => {
    setButtonDisabled(id, !connected);
  });

  // These buttons will be further controlled by updateButtonsForPublishState
  // based on microphone track state
  trackDependentButtons.forEach((id) => {
    setButtonDisabled(id, !connected || !state.microphoneTrack);
  });

  // Connect button disabled when connected
  setButtonDisabled('connect-button', connected);

  // If we disconnect, also update stop-recording button
  if (!connected) {
    setButtonDisabled('stop-recording-button', true);
  }
}

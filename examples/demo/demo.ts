//@ts-ignore
import E2EEWorker from '../../src/e2ee/worker/e2ee.worker?worker';
import type {
  ChatMessage,
  RoomConnectOptions,
  RoomOptions,
  ScalabilityMode,
  SimulationScenario,
  VideoCaptureOptions,
  VideoCodec,
} from '../../src/index';
import {
  BackupCodecPolicy,
  ConnectionQuality,
  ConnectionState,
  DisconnectReason,
  ExternalE2EEKeyProvider,
  LogLevel,
  MediaDeviceFailure,
  Participant,
  ParticipantEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  TrackPublication,
  VideoPresets,
  VideoQuality,
  createAudioAnalyser,
  isAudioTrack,
  isLocalParticipant,
  isLocalTrack,
  isRemoteParticipant,
  isRemoteTrack,
  setLogLevel,
  supportsAV1,
  supportsVP9,
} from '../../src/index';
import { isSVCCodec, sleep, supportsH265 } from '../../src/room/utils';

setLogLevel(LogLevel.debug);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  isFrontFacing: false,
  encoder: new TextEncoder(),
  decoder: new TextDecoder(),
  defaultDevices: new Map<MediaDeviceKind, string>([['audioinput', 'default']]),
  bitrateInterval: undefined as any,
  e2eeKeyProvider: new ExternalE2EEKeyProvider({ ratchetWindowSize: 100 }),
  chatMessages: new Map<string, { text: string; participant?: Participant }>(),
};
let currentRoom: Room | undefined;

let startTime: number;

let streamReaderAbortController: AbortController | undefined;

const searchParams = new URLSearchParams(window.location.search);
const storedUrl = searchParams.get('url') ?? 'ws://localhost:7880';
const storedToken = searchParams.get('token') ?? '';
(<HTMLInputElement>$('url')).value = storedUrl;
(<HTMLInputElement>$('token')).value = storedToken;
let storedKey = searchParams.get('key');
if (!storedKey) {
  (<HTMLSelectElement>$('crypto-key')).value = 'password';
} else {
  (<HTMLSelectElement>$('crypto-key')).value = storedKey;
}

function updateSearchParams(url: string, token: string, key: string) {
  const params = new URLSearchParams({ url, token, key });
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

// handles actions from the HTML
const appActions = {
  sendFile: async () => {
    console.log('start sending');
    const file = ($('file') as HTMLInputElement).files?.[0]!;
    currentRoom?.localParticipant.sendFile(file, {
      mimeType: file.type,
      topic: 'files',
      onProgress: (progress) => console.log('sending file, progress', Math.ceil(progress * 100)),
    });
  },
  connectWithFormInput: async () => {
    const url = (<HTMLInputElement>$('url')).value;
    const token = (<HTMLInputElement>$('token')).value;
    const simulcast = (<HTMLInputElement>$('simulcast')).checked;
    const dynacast = (<HTMLInputElement>$('dynacast')).checked;
    const forceTURN = (<HTMLInputElement>$('force-turn')).checked;
    const adaptiveStream = (<HTMLInputElement>$('adaptive-stream')).checked;
    const shouldPublish = (<HTMLInputElement>$('publish-option')).checked;
    const preferredCodec = (<HTMLSelectElement>$('preferred-codec')).value as VideoCodec;
    const scalabilityMode = (<HTMLSelectElement>$('scalability-mode')).value;
    const cryptoKey = (<HTMLSelectElement>$('crypto-key')).value;
    const autoSubscribe = (<HTMLInputElement>$('auto-subscribe')).checked;
    const e2eeEnabled = (<HTMLInputElement>$('e2ee')).checked;
    const audioOutputId = (<HTMLSelectElement>$('audio-output')).value;
    let backupCodecPolicy: BackupCodecPolicy | undefined;
    if ((<HTMLInputElement>$('multicodec-simulcast')).checked) {
      backupCodecPolicy = BackupCodecPolicy.SIMULCAST;
    }

    updateSearchParams(url, token, cryptoKey);

    const roomOpts: RoomOptions = {
      adaptiveStream,
      dynacast,
      audioOutput: {
        deviceId: audioOutputId,
      },
      publishDefaults: {
        simulcast,
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
        videoCodec: preferredCodec || 'vp8',
        dtx: true,
        red: true,
        forceStereo: false,
        screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
        scalabilityMode: 'L3T3_KEY',
        backupCodecPolicy: backupCodecPolicy,
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
      encryption: e2eeEnabled
        ? { keyProvider: state.e2eeKeyProvider, worker: new E2EEWorker() }
        : undefined,
    };
    if (
      roomOpts.publishDefaults?.videoCodec === 'av1' ||
      roomOpts.publishDefaults?.videoCodec === 'vp9'
    ) {
      roomOpts.publishDefaults.backupCodec = true;
      if (scalabilityMode !== '') {
        roomOpts.publishDefaults.scalabilityMode = scalabilityMode as ScalabilityMode;
      }
    }

    const connectOpts: RoomConnectOptions = {
      autoSubscribe: autoSubscribe,
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

    startTime = Date.now();
    await room.prepareConnection(url, token);
    const prewarmTime = Date.now() - startTime;
    appendLog(`prewarmed connection in ${prewarmTime}ms`);
    room.localParticipant.on(ParticipantEvent.LocalTrackCpuConstrained, (track, publication) => {
      console.log('track is cpu constrained, lowering capture resolution', track, publication);
      // track.restartTrack({
      //   resolution: VideoPresets.h360.resolution,
      //   frameRate: 15,
      // });
      track.prioritizePerformance();
    });
    room
      .on(RoomEvent.ParticipantConnected, participantConnected)
      .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
      .on(RoomEvent.ChatMessage, handleChatMessage)
      .on(RoomEvent.Disconnected, handleRoomDisconnect)
      .on(RoomEvent.Reconnecting, () => appendLog('Reconnecting to room'))
      .on(RoomEvent.Reconnected, async () => {
        appendLog(
          'Successfully reconnected. server',
          await room.engine.getConnectedServerAddress(),
        );
      })
      .on(RoomEvent.ParticipantActive, async (participant) => {
        appendLog(`participant ${participant.identity} is active and ready to receive messages`);
        await sendGreetingTo(participant);
      })
      .on(RoomEvent.ActiveDeviceChanged, handleActiveDeviceChanged)
      .on(RoomEvent.LocalTrackPublished, (pub) => {
        const track = pub.track;

        if (isLocalTrack(track) && isAudioTrack(track)) {
          const { calculateVolume } = createAudioAnalyser(track);

          setInterval(() => {
            $('local-volume')?.setAttribute('value', calculateVolume().toFixed(4));
          }, 200);
        }
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
      .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
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
        const signalConnectionTime = Date.now() - startTime;
        appendLog(`signal connection established in ${signalConnectionTime}ms`);
        // speed up publishing by starting to publish before it's fully connected
        // publishing is accepted as soon as signal connection has established
      })
      .on(RoomEvent.ParticipantEncryptionStatusChanged, () => {
        updateButtonsForPublishState();
      })
      .on(RoomEvent.TrackStreamStateChanged, (pub, streamState, participant) => {
        appendLog(
          `stream state changed for ${pub.trackSid} (${
            participant.identity
          }) to ${streamState.toString()}`,
        );
      })
      .on(RoomEvent.EncryptionError, (error) => {
        appendLog(`Error encrypting track data: ${error.message}`);
      });

    room.registerTextStreamHandler('lk.chat', async (reader, participant) => {
      streamReaderAbortController = new AbortController();
      (<HTMLButtonElement>$('cancel-chat-receive-button')).style.display = 'block';

      const info = reader.info;

      let message = '';
      try {
        for await (const chunk of reader.withAbortSignal(streamReaderAbortController.signal)) {
          message += chunk;
          console.log('received message', message, participant);
          handleChatMessage(
            {
              id: info.id,
              timestamp: info.timestamp,
              message,
            },
            room.getParticipantByIdentity(participant?.identity),
          );
        }
      } catch (err) {
        message += 'ERROR';
        handleChatMessage(
          {
            id: info.id,
            timestamp: info.timestamp,
            message,
          },
          room.getParticipantByIdentity(participant?.identity),
        );
        throw err;
      }

      if (!info.size) {
        appendLog('text stream finished');
      }
      console.log('final info including close extensions', reader.info);

      streamReaderAbortController = undefined;
      (<HTMLButtonElement>$('cancel-chat-receive-button')).style.display = 'none';
    });

    room.registerByteStreamHandler('files', async (reader, participant) => {
      const info = reader.info;

      appendLog(`started to receive a file called "${info.name}" from ${participant?.identity}`);

      const progressContainer = document.createElement('div');
      progressContainer.style.margin = '10px 0';
      const progressLabel = document.createElement('div');
      progressLabel.innerText = `Receiving "${info.name}" from ${participant?.identity}...`;
      const progressBar = document.createElement('progress');
      progressBar.max = 100;
      progressBar.value = 0;
      progressBar.style.width = '100%';

      progressContainer.appendChild(progressLabel);
      progressContainer.appendChild(progressBar);
      $('chat-area').after(progressContainer);

      appendLog(`Started receiving file "${info.name}" from ${participant?.identity}`);

      streamReaderAbortController = new AbortController();
      (<HTMLButtonElement>$('cancel-chat-receive-button')).style.display = 'block';

      reader.onProgress = (progress) => {
        console.log(`"progress ${progress ? (progress * 100).toFixed(0) : 'undefined'}%`);

        if (progress) {
          progressBar.value = progress * 100;
          progressLabel.innerText = `Receiving "${info.name}" from ${participant?.identity} (${(progress * 100).toFixed(0)}%)`;
        }
      };

      let byteContents;
      try {
        byteContents = await reader.readAll({
          signal: streamReaderAbortController.signal,
        });
      } catch (err) {
        progressLabel.innerText = `Receiving "${info.name}" - readAll aborted!`;
        throw err;
      }
      const result = new Blob(byteContents, { type: info.mimeType });
      appendLog(`Completely received file "${info.name}" from ${participant?.identity}`);

      streamReaderAbortController = undefined;
      (<HTMLButtonElement>$('cancel-chat-receive-button')).style.display = 'none';

      progressContainer.remove();

      if (info.mimeType.startsWith('image/')) {
        // Embed images directly in HTML
        const imgContainer = document.createElement('div');
        imgContainer.style.margin = '10px 0';
        imgContainer.style.padding = '10px';

        const img = document.createElement('img');
        img.style.maxWidth = '300px';
        img.style.maxHeight = '300px';
        img.src = URL.createObjectURL(result);

        const downloadLink = document.createElement('a');
        downloadLink.href = img.src;
        downloadLink.innerText = `Download ${info.name}`;
        downloadLink.setAttribute('download', info.name);
        downloadLink.style.display = 'block';
        downloadLink.style.marginTop = '5px';

        imgContainer.appendChild(img);
        imgContainer.appendChild(downloadLink);
        $('chat-area').after(imgContainer);
      } else {
        // Non-images get a text download link instead
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(result);
        downloadLink.innerText = `Download ${info.name}`;
        downloadLink.setAttribute('download', info.name);
        downloadLink.style.margin = '10px';
        downloadLink.style.padding = '5px';
        downloadLink.style.display = 'block';
        $('chat-area').after(downloadLink);
      }
    });

    try {
      // read and set current key from input
      const cryptoKey = (<HTMLSelectElement>$('crypto-key')).value;
      state.e2eeKeyProvider.setKey(cryptoKey);
      if ((<HTMLInputElement>$('e2ee')).checked) {
        await room.setE2EEEnabled(true);
      }
      const publishPromise = new Promise<void>(async (resolve, reject) => {
        try {
          if (shouldPublish) {
            await room.localParticipant.enableCameraAndMicrophone();
            appendLog(`tracks published in ${Date.now() - startTime}ms`);
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      await Promise.all([
        room.connect(url, token, connectOptions),
        publishPromise.catch(appendLog),
      ]);
      const elapsed = Date.now() - startTime;
      appendLog(
        `successfully connected to ${room.name} in ${Math.round(elapsed)}ms`,
        await room.engine.getConnectedServerAddress(),
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

    room.remoteParticipants.forEach((participant) => {
      participantConnected(participant);
    });
    participantConnected(room.localParticipant);
    updateButtonsForPublishState();

    return room;
  },

  toggleE2EE: async () => {
    if (!currentRoom || !currentRoom.hasE2EESetup) {
      return;
    }
    // read and set current key from input
    const cryptoKey = (<HTMLSelectElement>$('crypto-key')).value;
    state.e2eeKeyProvider.setKey(cryptoKey);

    await currentRoom.setE2EEEnabled(!currentRoom.isE2EEEnabled);
  },

  togglePiP: async () => {
    if (window.documentPictureInPicture?.window) {
      window.documentPictureInPicture?.window.close();
      return;
    }

    const pipWindow = await window.documentPictureInPicture?.requestWindow();
    setButtonState('toggle-pip-button', 'Close PiP', true);
    // Copy style sheets over from the initial document
    // so that the views look the same.
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
        const style = document.createElement('style');
        style.textContent = cssRules;
        pipWindow?.document.head.appendChild(style);
      } catch (e) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = styleSheet.type;
        link.media = styleSheet.media;
        link.href = styleSheet.href!;
        pipWindow?.document.head.appendChild(link);
      }
    });
    // Move participant videos to the Picture-in-Picture window
    const participantsArea = $('participants-area');
    const pipParticipantsArea = document.createElement('div');
    pipParticipantsArea.id = 'participants-area';
    pipWindow?.document.body.append(pipParticipantsArea);
    [...participantsArea.children].forEach((child) => pipParticipantsArea.append(child));

    // Move participant videos back when the Picture-in-Picture window closes.
    pipWindow?.addEventListener('pagehide', () => {
      setButtonState('toggle-pip-button', 'Open PiP', false);
      if (currentRoom?.state === ConnectionState.Connected)
        [...pipParticipantsArea.children].forEach((child) => participantsArea.append(child));
    });

    // Close PiP when room disconnects
    currentRoom!.once('disconnected', () => window.documentPictureInPicture?.window?.close());
  },

  ratchetE2EEKey: async () => {
    if (!currentRoom || !currentRoom.hasE2EESetup) {
      return;
    }
    await state.e2eeKeyProvider.ratchetKey();
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
    const videoPub = currentRoom?.localParticipant.getTrackPublication(Track.Source.Camera);
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
    try {
      await currentRoom.localParticipant.setScreenShareEnabled(!enabled, { audio: true });
    } catch (e) {
      appendLog('error sharing screen', e);
    }
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
      let localParticipant = currentRoom.localParticipant;
      let message = textField.value;
      localParticipant.sendText(message, { topic: 'lk.chat' }).then((info) => {
        handleChatMessage(
          {
            id: info.id,
            timestamp: info.timestamp,
            message: message,
          },
          localParticipant,
        );
      });

      textField.value = '';
    }
  },

  cancelChatReceive: () => {
    if (!streamReaderAbortController) {
      return;
    }
    streamReaderAbortController.abort();

    (<HTMLButtonElement>$('cancel-chat-receive-button')).style.display = 'none';
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
    if (scenario === 'subscribe-all') {
      currentRoom?.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((rp) => rp.setSubscribed(true));
      });
    } else if (scenario === 'unsubscribe-all') {
      currentRoom?.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((rp) => rp.setSubscribed(false));
      });
    } else if (scenario === 'mute-all') {
      currentRoom?.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((rp) => rp.setEnabled(false));
      });
    } else if (scenario === 'unmute-all') {
      currentRoom?.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((rp) => rp.setEnabled(true));
      });
    } else if (scenario !== '') {
      currentRoom?.simulateScenario(scenario as SimulationScenario);
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
      currentRoom.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((track) => {
          track.setVideoQuality(q);
        });
      });
    }
  },

  handlePreferredFPS: (e: Event) => {
    const fps = +(<HTMLSelectElement>e.target).value;
    if (currentRoom) {
      currentRoom.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((track) => {
          track.setVideoFPS(fps);
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
function handleChatMessage(msg: ChatMessage, participant?: Participant) {
  state.chatMessages.set(msg.id, { text: msg.message, participant });

  const chatEl = <HTMLTextAreaElement>$('chat');
  chatEl.value = '';
  for (const chatMsg of state.chatMessages.values()) {
    chatEl.value += `${chatMsg.participant?.identity}${participant && isLocalParticipant(participant) ? ' (me)' : ''}: ${chatMsg.text}\n`;
  }
}

async function sendGreetingTo(participant: Participant) {
  const greeting = `Hello new participant ${participant.identity}. This is just an progressively updating chat message from me, participant ${currentRoom?.localParticipant.identity}.`;

  const streamWriter = await currentRoom!.localParticipant.streamText({
    topic: 'lk.chat',
    destinationIdentities: [participant.identity],
  });

  for (const char of greeting) {
    await streamWriter.write(char);
    await sleep(50);
  }
  await streamWriter.close();
}

async function participantConnected(participant: Participant) {
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
  currentRoom.remoteParticipants.forEach((p) => {
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
  const container = getParticipantsAreaElement();
  if (!container) return;
  const { identity } = participant;
  let div = container.querySelector(`#participant-${identity}`);
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
          <span id="e2ee-${identity}" class="e2ee-on"></span>
        </div>
      </div>
      ${
        !isLocalParticipant(participant)
          ? `<div class="volume-control">
        <input id="volume-${identity}" type="range" min="0" max="1" step="0.1" value="1" orient="vertical" />
      </div>`
          : `<progress id="local-volume" max="1" value="0" />`
      }

    `;
    container.appendChild(div);

    const sizeElm = container.querySelector(`#size-${identity}`);
    const videoElm = <HTMLVideoElement>container.querySelector(`#video-${identity}`);
    videoElm.onresize = () => {
      updateVideoSize(videoElm!, sizeElm!);
    };
  }
  const videoElm = <HTMLVideoElement>container.querySelector(`#video-${identity}`);
  const audioElm = <HTMLAudioElement>container.querySelector(`#audio-${identity}`);
  if (remove) {
    div?.remove();
    if (videoElm) {
      videoElm.srcObject = null;
      videoElm.src = '';
    }
    if (audioElm) {
      audioElm.srcObject = null;
      audioElm.src = '';
    }
    return;
  }

  // update properties
  container.querySelector(`#name-${identity}`)!.innerHTML = participant.identity;
  if (isLocalParticipant(participant)) {
    container.querySelector(`#name-${identity}`)!.innerHTML += ' (you)';
  }
  const micElm = container.querySelector(`#mic-${identity}`)!;
  const signalElm = container.querySelector(`#signal-${identity}`)!;
  const cameraPub = participant.getTrackPublication(Track.Source.Camera);
  const micPub = participant.getTrackPublication(Track.Source.Microphone);
  if (participant.isSpeaking) {
    div!.classList.add('speaking');
  } else {
    div!.classList.remove('speaking');
  }

  if (isRemoteParticipant(participant)) {
    const volumeSlider = <HTMLInputElement>container.querySelector(`#volume-${identity}`);
    volumeSlider.addEventListener('input', (ev) => {
      participant.setVolume(Number.parseFloat((ev.target as HTMLInputElement).value));
    });
  }

  const cameraEnabled = cameraPub && cameraPub.isSubscribed && !cameraPub.isMuted;
  if (cameraEnabled) {
    if (isLocalParticipant(participant)) {
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
    container.querySelector(`#size-${identity}`)!.innerHTML = '';
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
    if (!isLocalParticipant(participant)) {
      // don't attach local audio
      audioElm.onloadeddata = () => {
        if (participant.joinedAt && participant.joinedAt.getTime() < startTime) {
          const fromJoin = Date.now() - startTime;
          appendLog(`RemoteAudioTrack ${micPub?.trackSid} played ${fromJoin}ms from start`);
        }
      };
      micPub?.audioTrack?.attach(audioElm);
    }
    micElm.className = 'mic-on';
    micElm.innerHTML = '<i class="fas fa-microphone"></i>';
  } else {
    micElm.className = 'mic-off';
    micElm.innerHTML = '<i class="fas fa-microphone-slash"></i>';
  }

  const e2eeElm = container.querySelector(`#e2ee-${identity}`)!;
  if (participant.isEncrypted) {
    e2eeElm.className = 'e2ee-on';
    e2eeElm.innerHTML = '<i class="fas fa-lock"></i>';
  } else {
    e2eeElm.className = 'e2ee-off';
    e2eeElm.innerHTML = '<i class="fas fa-unlock"></i>';
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
  let screenSharePub: TrackPublication | undefined = room.localParticipant.getTrackPublication(
    Track.Source.ScreenShare,
  );
  let screenShareAudioPub: RemoteTrackPublication | undefined;
  if (!screenSharePub) {
    room.remoteParticipants.forEach((p) => {
      if (screenSharePub) {
        return;
      }
      participant = p;
      const pub = p.getTrackPublication(Track.Source.ScreenShare);
      if (pub?.isSubscribed) {
        screenSharePub = pub;
      }
      const audioPub = p.getTrackPublication(Track.Source.ScreenShareAudio);
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
  const participants: Participant[] = [...currentRoom.remoteParticipants.values()];
  participants.push(currentRoom.localParticipant);
  const container = getParticipantsAreaElement();

  for (const p of participants) {
    const elm = container.querySelector(`#bitrate-${p.identity}`);
    let totalBitrate = 0;
    for (const t of p.trackPublications.values()) {
      if (t.track) {
        totalBitrate += t.track.currentBitrate;
      }

      if (t.source === Track.Source.Camera) {
        if (isRemoteTrack(t.videoTrack)) {
          const codecElm = container.querySelector(`#codec-${p.identity}`)!;
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

function getParticipantsAreaElement(): HTMLElement {
  return (
    window.documentPictureInPicture?.window?.document.querySelector('#participants-area') ||
    $('participants-area')
  );
}

function updateVideoSize(element: HTMLVideoElement, target: Element) {
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
    'toggle-pip-button',
    'disconnect-ws-button',
    'disconnect-room-button',
    'flip-video-button',
    'send-button',
  ];
  if (currentRoom && currentRoom.hasE2EESetup) {
    connectedSet.push('toggle-e2ee-button', 'e2ee-ratchet-button');
  }
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
} as const;

async function handleDevicesChanged() {
  Promise.all(
    Object.keys(elementMapping).map(async (id) => {
      const kind = elementMapping[id];
      if (!kind) {
        return;
      }
      const devices = await Room.getLocalDevices(kind);
      const element = <HTMLSelectElement>$(id);
      populateSelect(element, devices, state.defaultDevices.get(kind));
    }),
  );
}

async function handleActiveDeviceChanged(kind: MediaDeviceKind, deviceId: string) {
  console.debug('active device changed', kind, deviceId);
  state.defaultDevices.set(kind, deviceId);
  const devices = await Room.getLocalDevices(kind);
  const element = <HTMLSelectElement>$(
    Object.entries(elementMapping)
      .map(([key, value]) => {
        if (value === kind) {
          return key;
        }
        return undefined;
      })
      .filter((val) => val !== undefined)[0],
  );
  populateSelect(element, devices, deviceId);
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

  // e2ee
  setButtonState(
    'toggle-e2ee-button',
    `${currentRoom.isE2EEEnabled ? 'Disable' : 'Enable'} E2EE`,
    currentRoom.isE2EEEnabled,
  );
}

async function acquireDeviceList() {
  handleDevicesChanged();
}

function populateSupportedCodecs() {
  /*
<option value="" selected>PreferredCodec</option>
                <option value="vp8">VP8</option>
                <option value="h264">H.264</option>
                <option value="vp9">VP9</option>
                <option value="av1">AV1</option>
*/
  const codecSelect = $('preferred-codec');
  const options: string[][] = [
    ['', 'Preferred codec'],
    ['h264', 'H.264'],
    ['vp8', 'VP8'],
  ];
  if (supportsVP9()) {
    options.push(['vp9', 'VP9']);
  }
  if (supportsAV1()) {
    options.push(['av1', 'AV1']);
  }
  if (supportsH265()) {
    options.push(['h265', 'H.265']);
  }
  for (const o of options) {
    const n = document.createElement('option');
    n.value = o[0];
    n.appendChild(document.createTextNode(o[1]));
    codecSelect.appendChild(n);
  }
}

function populateScalabilityModes() {
  const modeSelect = $('scalability-mode');
  const modes: string[] = [
    'L1T1',
    'L1T2',
    'L1T3',
    'L2T1',
    'L2T1h',
    'L2T1_KEY',
    'L2T2',
    'L2T2h',
    'L2T2_KEY',
    'L2T3',
    'L2T3h',
    'L2T3_KEY',
    'L3T1',
    'L3T1h',
    'L3T1_KEY',
    'L3T2',
    'L3T2h',
    'L3T2_KEY',
    'L3T3',
    'L3T3h',
    'L3T3_KEY',
  ];
  let n = document.createElement('option');
  n.value = '';
  n.text = 'ScalabilityMode';
  modeSelect.appendChild(n);
  for (const mode of modes) {
    n = document.createElement('option');
    n.value = mode;
    n.text = mode;
    modeSelect.appendChild(n);
  }

  const codecSelect = <HTMLSelectElement>$('preferred-codec');
  codecSelect.onchange = () => {
    if (isSVCCodec(codecSelect.value)) {
      modeSelect.removeAttribute('disabled');
    } else {
      modeSelect.setAttribute('disabled', 'true');
    }
  };
}

acquireDeviceList();
populateSupportedCodecs();
populateScalabilityModes();

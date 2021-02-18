import {
  AudioTrack,
  connect,
  createLocalVideoTrack,
  LocalAudioTrack,
  LocalAudioTrackPublication,
  LocalDataTrack,
  LocalTrack,
  LocalVideoTrack,
  LocalVideoTrackPublication,
  LogLevel,
  Participant,
  ParticipantEvent,
  RemoteAudioTrack,
  RemoteDataTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  VideoTrack,
} from '../src/index';

let $ = function (id: string) {
  return document.getElementById(id);
};

declare global {
  interface Window {
    connectWithFormInput: any;
    connectToRoom: any;
    toggleVideo: any;
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
  for (var i = 0; i < arguments.length; i++) {
    if (typeof arguments[i] == 'object') {
      logger.innerHTML +=
        (JSON && JSON.stringify
          ? JSON.stringify(arguments[i], undefined, 2)
          : arguments[i]) + ' ';
    } else {
      logger.innerHTML += arguments[i] + ' ';
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
  participant: Participant
): HTMLMediaElement | null {
  appendLog('track subscribed', track);
  if (track instanceof AudioTrack || track instanceof VideoTrack) {
    const element = track.attach();
    div.appendChild(element);
    return element;
  }
  return null;
}

function trackUnsubscribed(
  track: RemoteTrack | LocalTrack,
  participant?: Participant
) {
  let logName = track.name;
  if (
    track instanceof RemoteAudioTrack ||
    track instanceof RemoteVideoTrack ||
    track instanceof RemoteDataTrack
  ) {
    logName = track.sid;
  }
  appendLog('track unsubscribed', logName);
  if (track instanceof AudioTrack || track instanceof VideoTrack) {
    track.detach().forEach((element) => element.remove());
  }
}

function handleMessage(
  msg: string | ArrayBuffer,
  track: RemoteDataTrack,
  participant: RemoteParticipant
) {
  if (track.name === 'chat') {
    const chat = <HTMLTextAreaElement>$('chat');
    chat.value += `${participant.identity}: ${msg}\n`;
  }
}

function handleSpeakerChanged(speakers: Participant[]) {
  // remove tags from all
  currentRoom.participants.forEach((participant) => {
    setParticipantSpeaking(participant, speakers.includes(participant));
  });

  // do the same for local participant
  setParticipantSpeaking(
    currentRoom.localParticipant,
    speakers.includes(currentRoom.localParticipant)
  );
}

function setParticipantSpeaking(participant: Participant, speaking: boolean) {
  participant.videoTracks.forEach((publication) => {
    if (publication.track) {
      publication.track.attachedElements.forEach((element) => {
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

  participant.on(ParticipantEvent.TrackSubscribed, (track) =>
    trackSubscribed(div, track, participant)
  );
  participant.on(ParticipantEvent.TrackUnsubscribed, (track) =>
    trackUnsubscribed(track, participant)
  );

  participant.tracks.forEach((publication) => {
    if (!publication.isSubscribed) return;
    if (publication.track! instanceof RemoteDataTrack) {
    } else {
      trackSubscribed(div, publication.track!, participant);
    }
  });
}

function participantDisconnected(participant: RemoteParticipant) {
  appendLog('participant', participant.sid, 'disconnected');

  $(participant.sid)?.remove();
}

let currentRoom: Room;
const chatTrack: LocalDataTrack = new LocalDataTrack({
  name: 'chat',
  ordered: true,
});
let videoTrack: LocalVideoTrack | undefined;
let audioTrack: LocalAudioTrack;
window.connectWithFormInput = () => {
  const url = (<HTMLInputElement>$('url')).value;
  const token = (<HTMLInputElement>$('token')).value;

  window.connectToRoom(url, token);
};

window.connectToRoom = async (url: string, token: string) => {
  const room = await connect(url, token, {
    logLevel: LogLevel.debug,
    audio: true,
    video: true,
    simulcast: (<HTMLInputElement>$('simulcast')).checked,
  });

  window.currentRoom = room;
  appendLog('connected to room', room.name);
  setButtonsForState(true);
  currentRoom = room;
  window.currentRoom = room;

  room
    .on(RoomEvent.ParticipantConnected, participantConnected)
    .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
    .on(RoomEvent.TrackMessage, handleMessage)
    .on(RoomEvent.ActiveSpeakersChanged, handleSpeakerChanged)
    .on(RoomEvent.Disconnected, () => {
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
    });

  room.localParticipant.publishTrack(chatTrack);

  appendLog('room participants', room.participants.keys());
  room.participants.forEach((participant) => {
    participantConnected(participant);
  });

  $('local-video')!.innerHTML = `${room.localParticipant.identity} (local)`;

  // add already published tracks
  currentRoom.localParticipant.tracks.forEach((publication) => {
    if (publication instanceof LocalVideoTrackPublication) {
      videoTrack = publication.track;
      publishLocalVideo(videoTrack);
    } else if (publication instanceof LocalAudioTrackPublication) {
      // skip adding local audio track, to avoid your own sound
      // only process local video tracks
      audioTrack = publication.track;
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
    chatTrack.send(textField.value);
    (<HTMLTextAreaElement>$('chat')).value += `me: ${textField.value}\n`;
    textField.value = '';
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

// uncomment to autoconnect after page load
// setTimeout(() => {
//   window.connectToRoom(
//     'ws://localhost:7880',
//     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MTU2MTUwOTAsImlzcyI6IkFQSXU5SmpLdFpubXRLQmtjcXNFOUJuZkgiLCJqdGkiOiJtZSIsIm1ldGFkYXRhIjp7Im9yZGVyIjoxfSwibmJmIjoxNjEzMDIzMDkwLCJ2aWRlbyI6eyJyb29tIjoibXlyb29tIiwicm9vbUpvaW4iOnRydWV9fQ.MGEzYSO-Vh8gT1iwE_C8x63Km6f5EuqXVP8HKp4qXJA'
//   );
// }, 100);

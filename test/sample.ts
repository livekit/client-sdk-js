import Livekit, {
  AudioTrack,
  LocalAudioTrack,
  LocalAudioTrackPublication,
  LocalDataTrack,
  LocalVideoTrack,
  LocalVideoTrackPublication,
  LogLevel,
  Participant,
  ParticipantEvent,
  RemoteDataTrack,
  RemoteParticipant,
  RemoteTrack,
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

function trackUnsubscribed(track: RemoteTrack, participant: Participant) {
  appendLog('track unsubscribed', track.sid);
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
  const host = (<HTMLInputElement>$('host')).value;
  const port = parseInt((<HTMLInputElement>$('port')).value);
  const token = (<HTMLInputElement>$('token')).value;

  window.connectToRoom(host, port, token);
};

window.connectToRoom = (host: string, port: number, token: string) => {
  Livekit.connect({ host, port }, token, {
    logLevel: LogLevel.debug,
    audio: true,
    video: true,
  })
    .then((room) => {
      appendLog('connected to room', room.name);
      setButtonsForState(true);
      currentRoom = room;
      window.currentRoom = room;

      room
        .on(RoomEvent.ParticipantConnected, participantConnected)
        .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
        .on(RoomEvent.TrackMessage, handleMessage);

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
    })
    .catch((reason) => {
      console.error('error connecting to room', reason);
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
    videoTrack = await Livekit.createLocalVideoTrack();
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
//     'localhost',
//     7880,
//     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MTQxMDkzMDQsImlzcyI6IkFQSU1teGlMOHJxdUt6dFpFb1pKVjlGYiIsImp0aSI6Im1lIiwibmJmIjoxNjExNTE3MzA0LCJ2aWRlbyI6eyJyb29tIjoibXlyb29tIiwicm9vbUpvaW4iOnRydWV9fQ.E_2V2SGcd8eHGvireFqFdM2s5wYoc1R5dtlw_XULcGI'
//   );
// }, 100);

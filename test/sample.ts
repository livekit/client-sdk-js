import Livekit, {
  AudioTrack,
  LocalAudioTrack,
  LocalDataTrack,
  LocalVideoTrack,
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
    connectToRoom: any;
    toggleVideo: any;
    muteVideo: any;
    muteAudio: any;
    enterText: any;
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
  appendLog('participant', participant.sid, 'connected');

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
window.connectToRoom = () => {
  const host = (<HTMLInputElement>$('host')).value;
  const port = (<HTMLInputElement>$('port')).value;
  const token = (<HTMLInputElement>$('token')).value;

  // participant to div mapping

  Livekit.connect({ host: host, port: parseInt(port) }, token, {
    logLevel: LogLevel.debug,
  })
    .then((room) => {
      appendLog('connected to room', room.name);
      setButtonsForState(true);
      currentRoom = room;

      room
        .on(RoomEvent.ParticipantConnected, participantConnected)
        .on(RoomEvent.ParticipantDisconnected, participantDisconnected)
        .on(RoomEvent.TrackMessage, handleMessage);

      room.localParticipant.publishTrack(chatTrack);

      appendLog('room participants', room.participants.keys());
      room.participants.forEach((participant) => {
        participantConnected(participant);
      });

      // publish video
      const div = <HTMLDivElement>$('local-video');
      Livekit.createLocalTracks().then((tracks) => {
        currentRoom.localParticipant.publishTracks(tracks);
        for (const track of tracks) {
          if (track instanceof LocalVideoTrack) {
            videoTrack = track;
            publishLocalVideo(videoTrack);
          } else if (track instanceof LocalAudioTrack) {
            // skip adding local audio track, to avoid your own sound
            // only process local video tracks
            audioTrack = track;
          }
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

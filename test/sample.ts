import {
  connect,
  createLocalTracks,
  RemoteParticipant,
  Room,
  RoomEvent,
} from '../src/index';
import { ParticipantEvent } from '../src/room/events';
import {
  AudioTrack,
  LocalTrack,
  RemoteTrack,
  VideoTrack,
} from '../src/room/track';
import { LocalTrackPublication } from '../src/room/trackPublication';

let $ = function (id: string) {
  return document.getElementById(id);
};

declare global {
  interface Window {
    connectToRoom: any;
    toggleVideo: any;
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

function trackSubscribed(div: HTMLDivElement, track: AudioTrack | VideoTrack) {
  appendLog('track subscribed', track);
  div.appendChild(track.attach());
}

function trackUnsubscribed(track: RemoteTrack) {
  appendLog('track unsubscribed', track.sid);
  track.detach().forEach((element) => element.remove());
}

function participantConnected(participant: RemoteParticipant) {
  appendLog('participant', participant.sid, 'connected');

  const div = document.createElement('div');
  div.id = participant.sid;
  div.innerText = participant.name;
  div.className = 'col-md-6 video-container';
  $('remote-area')?.appendChild(div);

  participant.on(ParticipantEvent.TrackSubscribed, (track) =>
    trackSubscribed(div, track)
  );
  participant.on(ParticipantEvent.TrackUnpublished, (track) =>
    trackUnsubscribed(track)
  );

  Object.values(participant.tracks).forEach((publication) => {
    if (publication.isSubscribed) {
      trackSubscribed(div, publication.track!);
    }
  });
}

function participantDisconnected(participant: RemoteParticipant) {
  appendLog('participant', participant.sid, 'disconnected');

  $(participant.sid)?.remove();
}

let currentRoom: Room;
window.connectToRoom = () => {
  const host = (<HTMLInputElement>$('host')).value;
  const port = (<HTMLInputElement>$('port')).value;
  const roomId = (<HTMLInputElement>$('roomId')).value;
  const token = (<HTMLInputElement>$('token')).value;

  // participant to div mapping

  connect({ host: host, port: parseInt(port) }, roomId, token, {
    name: 'myclient',
  })
    .then((room) => {
      appendLog('connected to room', room.sid);
      $('toggle-video-button')!.removeAttribute('disabled');
      $('connect-button')!.setAttribute('disabled', 'true');
      currentRoom = room;

      room
        .on(RoomEvent.ParticipantConnected, participantConnected)
        .on(RoomEvent.ParticipantDisconnected, participantDisconnected);

      appendLog('room participants', Object.keys(room.participants));
      Object.values(room.participants).forEach((participant) => {
        participantConnected(participant);
      });
    })
    .catch((reason) => {
      console.error('error connecting to room', reason);
    });
};

let videoEnabled = false;
window.toggleVideo = () => {
  if (!currentRoom) return;

  if (videoEnabled) {
    const tracks: LocalTrack[] = [];
    for (const publication of currentRoom.localParticipant.getTracks()) {
      const localPublication = <LocalTrackPublication>publication;
      tracks.push(localPublication.track);
      currentRoom.localParticipant.unpublishTracks(tracks);
    }
  } else {
    const div = <HTMLDivElement>$('local-video');
    createLocalTracks().then((tracks) => {
      currentRoom.localParticipant.publishTracks(tracks);
      for (const track of tracks) {
        trackSubscribed(div, track);
      }
    });
  }
  videoEnabled = !videoEnabled;
};

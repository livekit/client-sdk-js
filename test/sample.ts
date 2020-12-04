import { connect, RemoteParticipant, RoomEvent } from '../src/index';
import { RemoteTrack } from '../src/room/track';

let $ = function (id: string) {
  return document.getElementById(id);
};

declare global {
  interface Window {
    connectToRoom: any;
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

window.connectToRoom = () => {
  const host = (<HTMLInputElement>$('host')).value;
  const port = (<HTMLInputElement>$('port')).value;
  const roomId = (<HTMLInputElement>$('roomId')).value;
  const token = (<HTMLInputElement>$('token')).value;
  connect({ host: host, port: parseInt(port) }, roomId, token, {
    name: 'myclient',
  })
    .then((room) => {
      appendLog('connected to room', room.id);
      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, participant: RemoteParticipant) => {
          appendLog('attaching track to video', track.id);
          track.attach(<HTMLVideoElement>$('video'));
        }
      );
    })
    .catch((reason) => {
      console.error('error connecting to room', reason);
    });
};

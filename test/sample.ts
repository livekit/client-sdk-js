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

window.connectToRoom = () => {
  const host = (<HTMLInputElement>$('host')).value;
  const port = (<HTMLInputElement>$('port')).value;
  const roomId = (<HTMLInputElement>$('roomId')).value;
  const token = (<HTMLInputElement>$('token')).value;
  connect({ host: host, port: parseInt(port) }, roomId, token, {
    name: 'myclient',
  })
    .then((room) => {
      console.log('connected to room', room.id);
      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, participant: RemoteParticipant) => {
          console.log('got subscribe event', track);
          track.attach(<HTMLVideoElement>$('video'));
        }
      );
    })
    .catch((reason) => {
      console.log('error connecting to room', reason);
    });
};

// override console.log
(() => {
  const old = console.log;
  const logger = $('log')!;
  console.log = function () {
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
    old(...arguments);
  };
})();

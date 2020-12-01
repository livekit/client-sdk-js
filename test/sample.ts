import { connect } from '../src/index';

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
  console.log('host', host, 'port', port);
  connect({ host: 'localhost', port: 7881 }, 'randomId', 'token');
};

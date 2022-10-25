import { SignalClient } from '../../../api/SignalClient';
import { Checker } from './Checker';

export class WebSocketCheck extends Checker {
  get description(): string {
    return 'Connecting to signal connection via WebSocket';
  }

  protected async perform(): Promise<void> {
    if (this.url.startsWith('ws:') || this.url.startsWith('http:')) {
      this.appendWarning('Server is insecure, clients may block connections to it');
    }

    let signalClient = new SignalClient();
    const joinRes = await signalClient.join(this.url, this.token, {
      autoSubscribe: true,
      maxRetries: 0,
    });
    this.appendMessage(`Connected to server, version ${joinRes.serverVersion}.`);

    let hasTLS = false;
    let hasTURN = false;
    let hasSTUN = false;

    for (let iceServer of joinRes.iceServers) {
      for (let url of iceServer.urls) {
        if (url.startsWith('turn:')) {
          hasTURN = true;
          hasSTUN = true;
        } else if (url.startsWith('turns:')) {
          hasTURN = true;
          hasSTUN = true;
          hasTLS = true;
        }
        if (url.startsWith('stun:')) {
          hasSTUN = true;
        }
      }
    }
    if (!hasSTUN) {
      this.appendWarning('No STUN servers configured.');
    } else if (hasTURN && !hasTLS) {
      this.appendWarning('TURN is configured, but TURN/TLS is unavailable.');
    }

    // this.sharedData.socketInfo = {
    //   hasSTUN,
    //   hasTURN,
    //   hasTLS,
    // };

    signalClient.close();
  }
}

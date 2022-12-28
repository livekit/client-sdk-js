import { SignalClient } from '../../api/SignalClient';
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
      e2eeEnabled: false,
    });
    this.appendMessage(`Connected to server, version ${joinRes.serverVersion}.`);
    await signalClient.close();
  }
}

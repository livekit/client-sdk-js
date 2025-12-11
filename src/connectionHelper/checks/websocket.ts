import { JoinResponse, ServerInfo_Edition } from '@livekit/protocol';
import { SignalClient } from '../../api/SignalClient';
import { RegionUrlProvider } from '../../room/RegionUrlProvider';
import { isCloud } from '../../room/utils';
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
    let joinRes: JoinResponse | undefined;
    try {
      joinRes = await signalClient.join(this.url, this.token, {
        autoSubscribe: true,
        maxRetries: 0,
        e2eeEnabled: false,
        websocketTimeout: 15_000,
        singlePeerConnection: false,
      });
    } catch (e: any) {
      if (isCloud(new URL(this.url))) {
        this.appendMessage(
          `Initial connection failed with error ${e.message}. Retrying with region fallback`,
        );
        const regionProvider = new RegionUrlProvider(this.url, this.token);
        const regionUrl = await regionProvider.getNextBestRegionUrl();
        if (regionUrl) {
          joinRes = await signalClient.join(regionUrl, this.token, {
            autoSubscribe: true,
            maxRetries: 0,
            e2eeEnabled: false,
            websocketTimeout: 15_000,
            singlePeerConnection: false,
          });
          this.appendMessage(
            `Fallback to region worked. To avoid initial connections failing, ensure you're calling room.prepareConnection() ahead of time`,
          );
        }
      }
    }
    if (joinRes) {
      this.appendMessage(`Connected to server, version ${joinRes.serverVersion}.`);
      if (joinRes.serverInfo?.edition === ServerInfo_Edition.Cloud && joinRes.serverInfo?.region) {
        this.appendMessage(`LiveKit Cloud: ${joinRes.serverInfo?.region}`);
      }
    } else {
      this.appendError(`Websocket connection could not be established`);
    }
    await signalClient.close();
  }
}

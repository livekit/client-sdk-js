import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';

import { Checker, CheckInfo, CheckStatus, InstantiableCheck } from './checks/Checker';
import { PublishAudioCheck } from './checks/publishAudio';
import { PublishVideoCheck } from './checks/publishVideo';
import { ReconnectCheck } from './checks/reconnect';
import { TURNCheck } from './checks/turn';
import { WebRTCCheck } from './checks/webrtc';
import { WebSocketCheck } from './checks/websocket';

export type { CheckInfo };

export class ConnectionCheck extends (EventEmitter as new () => TypedEmitter<ConnectionCheckCallbacks>) {
  token: string;

  url: string;

  private checkResults: Map<number, CheckInfo> = new Map();

  constructor(url: string, token: string) {
    super();
    this.url = url;
    this.token = token;
  }

  private getNextCheckId() {
    const nextId = this.checkResults.size;
    this.checkResults.set(nextId, {
      logs: [],
      status: CheckStatus.IDLE,
      name: '',
      description: '',
    });
    return nextId;
  }

  private updateCheck(checkId: number, info: CheckInfo) {
    this.checkResults.set(checkId, info);
    this.emit('checkUpdate', checkId, info);
  }

  isSuccess() {
    return Array.from(this.checkResults.values()).every((r) => r.status !== CheckStatus.FAILED);
  }

  getResults() {
    return Array.from(this.checkResults.values());
  }

  async createAndRunCheck<T extends Checker>(check: InstantiableCheck<T>) {
    const checkId = this.getNextCheckId();
    const test = new check(this.url, this.token);
    const handleUpdate = (info: CheckInfo) => {
      this.updateCheck(checkId, info);
    };
    test.on('update', handleUpdate);
    const result = await test.run();
    test.off('update', handleUpdate);
    return result;
  }

  async checkWebsocket() {
    return this.createAndRunCheck(WebSocketCheck);
  }

  async checkWebRTC() {
    return this.createAndRunCheck(WebRTCCheck);
  }

  async checkTURN() {
    return this.createAndRunCheck(TURNCheck);
  }

  async checkReconnect() {
    return this.createAndRunCheck(ReconnectCheck);
  }

  async checkPublishAudio() {
    return this.createAndRunCheck(PublishAudioCheck);
  }

  async checkPublishVideo() {
    return this.createAndRunCheck(PublishVideoCheck);
  }
}

type ConnectionCheckCallbacks = {
  checkUpdate: (id: number, info: CheckInfo) => void;
};

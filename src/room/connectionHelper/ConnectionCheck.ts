import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';

import { Checker, CheckInfo, CheckStatus } from './checks/Checker';
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

  isSuccess() {
    return Array.from(this.checkResults.values()).every((r) => r.status !== CheckStatus.FAILED);
  }

  getResults() {
    return Array.from(this.checkResults.values());
  }

  constructor(url: string, token: string) {
    super();
    this.url = url;
    this.token = token;
  }

  getNextCheckId() {
    const nextId = this.checkResults.size;
    this.checkResults.set(nextId, {});
    return nextId;
  }

  updateCheck(checkId: number, info: CheckInfo) {
    this.checkResults.set(checkId, info);
    this.emit('checkUpdate', info);
  }

  async createAndRunCheck(check: typeof Checker) {
    const checkId = this.getNextCheckId();
    const test = new check(this.url, this.token);
    const handleUpdate = (info: CheckInfo) => {
      this.updateCheck(checkId, info);
    };
    test.on('update', handleUpdate);
    await test.run();
    test.off('update', handleUpdate);
    return this;
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
  checkUpdate: (info: CheckInfo) => void;
};

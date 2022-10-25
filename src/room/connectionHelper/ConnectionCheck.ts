import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';

import { Checker, CheckInfo, CheckStatus } from './checks/Checker';
import { WebSocketCheck } from './checks/websocket';

export { CheckInfo };

export class ConnectionCheck extends (EventEmitter as new () => TypedEmitter<ConnectionCheckCallbacks>) {
  token: string;

  url: string;

  private checkResults: Map<number, CheckInfo> = new Map();

  isSuccess() {
    return Array.from(this.checkResults.values()).every((r) => r.status !== CheckStatus.FAILED);
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

  updateCheck(checkId: number, data: CheckInfo) {
    this.checkResults.set(checkId, data);
  }

  async createAndRunCheck(check: typeof Checker) {
    const checkId = this.getNextCheckId();
    const test = new check(this.url, this.token);
    const handleUpdate = (info: CheckInfo) => {
      this.updateCheck(checkId, info);
      this.emit('checkUpdated', info);
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
    return this;
  }
}

type ConnectionCheckCallbacks = {
  checkUpdated: (info: CheckInfo) => void;
};

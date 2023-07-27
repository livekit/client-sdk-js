/**
 * Copyright 2023 LiveKit, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import { CheckStatus, Checker } from './checks/Checker';
import type { CheckInfo, InstantiableCheck } from './checks/Checker';
import { PublishAudioCheck } from './checks/publishAudio';
import { PublishVideoCheck } from './checks/publishVideo';
import { ReconnectCheck } from './checks/reconnect';
import { TURNCheck } from './checks/turn';
import { WebRTCCheck } from './checks/webrtc';
import { WebSocketCheck } from './checks/websocket';

export type { CheckInfo, CheckStatus };

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

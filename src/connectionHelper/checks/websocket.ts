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

import { SignalClient } from '../../api/SignalClient';
import { ServerInfo_Edition } from '../../proto/livekit_models_pb';
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
    if (joinRes.serverInfo?.edition === ServerInfo_Edition.Cloud && joinRes.serverInfo?.region) {
      this.appendMessage(`LiveKit Cloud: ${joinRes.serverInfo?.region}`);
    }
    await signalClient.close();
  }
}

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
import { Checker } from './Checker';

export class TURNCheck extends Checker {
  get description(): string {
    return 'Can connect via TURN';
  }

  async perform(): Promise<void> {
    const signalClient = new SignalClient();
    const joinRes = await signalClient.join(this.url, this.token, {
      autoSubscribe: true,
      maxRetries: 0,
      e2eeEnabled: false,
    });

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
      this.appendWarning('No STUN servers configured on server side.');
    } else if (hasTURN && !hasTLS) {
      this.appendWarning('TURN is configured server side, but TURN/TLS is unavailable.');
    }
    await signalClient.close();
    if (this.connectOptions?.rtcConfig?.iceServers || hasTURN) {
      await this.room!.connect(this.url, this.token, {
        rtcConfig: {
          iceTransportPolicy: 'relay',
        },
      });
    } else {
      this.appendWarning('No TURN servers configured.');
      this.skip();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

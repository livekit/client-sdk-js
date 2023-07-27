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

import { ConnectionState } from '../../room/Room';
import { RoomEvent } from '../../room/events';
import { Checker } from './Checker';

export class ReconnectCheck extends Checker {
  get description(): string {
    return 'Resuming connection after interruption';
  }

  async perform(): Promise<void> {
    const room = await this.connect();
    let reconnectingTriggered = false;
    let reconnected = false;

    let reconnectResolver: (value: unknown) => void;
    const reconnectTimeout = new Promise((resolve) => {
      setTimeout(resolve, 5000);
      reconnectResolver = resolve;
    });

    room
      .on(RoomEvent.Reconnecting, () => {
        reconnectingTriggered = true;
      })
      .on(RoomEvent.Reconnected, () => {
        reconnected = true;
        reconnectResolver(true);
      });

    room.engine.client.ws?.close();
    const onClose = room.engine.client.onClose;
    if (onClose) {
      onClose('');
    }

    await reconnectTimeout;

    if (!reconnectingTriggered) {
      throw new Error('Did not attempt to reconnect');
    } else if (!reconnected || room.state !== ConnectionState.Connected) {
      this.appendWarning('reconnection is only possible in Redis-based configurations');
      throw new Error('Not able to reconnect');
    }
  }
}

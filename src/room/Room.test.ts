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

import { describe, expect, it } from 'vitest';
import Room from './Room';
import { RoomEvent } from './events';

describe('Active device switch', () => {
  it('updates devices correctly', async () => {
    const room = new Room();
    await room.switchActiveDevice('audioinput', 'test');
    expect(room.getActiveDevice('audioinput')).toBe('test');
  });
  it('updates devices with exact constraint', async () => {
    const room = new Room();
    await room.switchActiveDevice('audioinput', 'test', true);
    expect(room.getActiveDevice('audioinput')).toBe('test');
  });
  it('emits changed event', async () => {
    const room = new Room();
    let kind: MediaDeviceKind | undefined;
    let deviceId: string | undefined;
    const deviceChangeHandler = (_kind: MediaDeviceKind, _deviceId: string) => {
      kind = _kind;
      deviceId = _deviceId;
    };
    room.on(RoomEvent.ActiveDeviceChanged, deviceChangeHandler);
    await room.switchActiveDevice('audioinput', 'test', true);

    expect(deviceId).toBe('test');
    expect(kind).toBe('audioinput');
  });
});

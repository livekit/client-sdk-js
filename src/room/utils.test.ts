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
import { toWebsocketUrl } from './utils';

describe('toWebsocketUrl', () => {
  it('leaves wss urls alone', () => {
    expect(toWebsocketUrl('ws://mywebsite.com')).toEqual('ws://mywebsite.com');
  });

  it('converts https to wss', () => {
    expect(toWebsocketUrl('https://mywebsite.com')).toEqual('wss://mywebsite.com');
  });

  it('does not convert other parts of URL', () => {
    expect(toWebsocketUrl('https://httpsmywebsite.com')).toEqual('wss://httpsmywebsite.com');
  });
});

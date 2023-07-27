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

import type { ReconnectContext, ReconnectPolicy } from './ReconnectPolicy';

const maxRetryDelay = 7000;

const DEFAULT_RETRY_DELAYS_IN_MS = [
  0,
  300,
  2 * 2 * 300,
  3 * 3 * 300,
  4 * 4 * 300,
  maxRetryDelay,
  maxRetryDelay,
  maxRetryDelay,
  maxRetryDelay,
  maxRetryDelay,
];

class DefaultReconnectPolicy implements ReconnectPolicy {
  private readonly _retryDelays: number[];

  constructor(retryDelays?: number[]) {
    this._retryDelays = retryDelays !== undefined ? [...retryDelays] : DEFAULT_RETRY_DELAYS_IN_MS;
  }

  public nextRetryDelayInMs(context: ReconnectContext): number | null {
    if (context.retryCount >= this._retryDelays.length) return null;

    const retryDelay = this._retryDelays[context.retryCount];
    if (context.retryCount <= 1) return retryDelay;

    return retryDelay + Math.random() * 1_000;
  }
}

export default DefaultReconnectPolicy;

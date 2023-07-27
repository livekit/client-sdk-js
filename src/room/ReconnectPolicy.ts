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

/** Controls reconnecting of the client */
export interface ReconnectPolicy {
  /** Called after disconnect was detected
   *
   * @returns {number | null} Amount of time in milliseconds to delay the next reconnect attempt, `null` signals to stop retrying.
   */
  nextRetryDelayInMs(context: ReconnectContext): number | null;
}

export interface ReconnectContext {
  /**
   * Number of failed reconnect attempts
   */
  readonly retryCount: number;

  /**
   * Elapsed amount of time in milliseconds since the disconnect.
   */
  readonly elapsedMs: number;

  /**
   * Reason for retrying
   */
  readonly retryReason?: Error;

  readonly serverUrl?: string;
}

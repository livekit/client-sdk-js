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

/**
 * Timers that can be overridden with platform specific implementations
 * that ensure that they are fired. These should be used when it is critical
 * that the timer fires on time.
 */
export default class CriticalTimers {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  static setTimeout = (...args: Parameters<typeof setTimeout>) => setTimeout(...args);

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  static setInterval = (...args: Parameters<typeof setInterval>) => setInterval(...args);

  static clearTimeout = (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args);

  static clearInterval = (...args: Parameters<typeof clearInterval>) => clearInterval(...args);
}

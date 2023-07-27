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

import { Mutex } from '../room/utils';

type QueueTask<T> = () => PromiseLike<T>;

enum QueueTaskStatus {
  'WAITING',
  'RUNNING',
  'COMPLETED',
}

type QueueTaskInfo = {
  id: number;
  enqueuedAt: number;
  executedAt?: number;
  status: QueueTaskStatus;
};

export class AsyncQueue {
  private pendingTasks: Map<number, QueueTaskInfo>;

  private taskMutex: Mutex;

  private nextTaskIndex: number;

  constructor() {
    this.pendingTasks = new Map();
    this.taskMutex = new Mutex();
    this.nextTaskIndex = 0;
  }

  async run<T>(task: QueueTask<T>) {
    const taskInfo: QueueTaskInfo = {
      id: this.nextTaskIndex++,
      enqueuedAt: Date.now(),
      status: QueueTaskStatus.WAITING,
    };
    this.pendingTasks.set(taskInfo.id, taskInfo);
    const unlock = await this.taskMutex.lock();
    try {
      taskInfo.executedAt = Date.now();
      taskInfo.status = QueueTaskStatus.RUNNING;
      return await task();
    } finally {
      taskInfo.status = QueueTaskStatus.COMPLETED;
      this.pendingTasks.delete(taskInfo.id);
      unlock();
    }
  }

  async flush() {
    return this.run(async () => {});
  }

  snapshot() {
    return Array.from(this.pendingTasks.values());
  }
}

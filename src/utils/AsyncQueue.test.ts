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
import { sleep } from '../room/utils';
import { AsyncQueue } from './AsyncQueue';

describe('asyncQueue', () => {
  it('runs multiple tasks in order', async () => {
    const queue = new AsyncQueue();
    const tasksExecuted: number[] = [];

    for (let i = 0; i < 5; i++) {
      queue.run(async () => {
        await sleep(50);
        tasksExecuted.push(i);
      });
    }
    await queue.flush();
    expect(tasksExecuted).toMatchObject([0, 1, 2, 3, 4]);
  });
  it('runs tasks sequentially and not in parallel', async () => {
    const queue = new AsyncQueue();
    const results: number[] = [];
    for (let i = 0; i < 5; i++) {
      queue.run(async () => {
        results.push(i);
        await sleep(10);
        results.push(i);
      });
    }
    await queue.flush();
    expect(results).toMatchObject([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it('continues executing tasks if one task throws an error', async () => {
    const queue = new AsyncQueue();

    let task1threw = false;
    let task2Executed = false;

    queue
      .run(async () => {
        await sleep(100);
        throw Error('task 1 throws');
      })
      .catch(() => {
        task1threw = true;
      });

    await queue
      .run(async () => {
        task2Executed = true;
      })
      .catch(() => {
        fail('task 2 should not have thrown');
      });

    expect(task1threw).toBeTruthy();
    expect(task2Executed).toBeTruthy();
  });
  it('returns the result of the task', async () => {
    const queue = new AsyncQueue();

    const result = await queue.run(async () => {
      await sleep(10);
      return 'result';
    });

    expect(result).toBe('result');
  });
  it('returns only when the enqueued task and all previous tasks have completed', async () => {
    const queue = new AsyncQueue();
    const tasksExecuted: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      queue.run(async () => {
        await sleep(10);
        tasksExecuted.push(i);
        return i;
      });
    }

    const result = await queue.run(async () => {
      await sleep(10);
      tasksExecuted.push(999);
      return 'result';
    });

    expect(result).toBe('result');
    expect(tasksExecuted).toMatchObject([...new Array(10).fill(0).map((_, idx) => idx), 999]);
  });
  it('can handle queue sizes of up to 10_000 tasks', async () => {
    const queue = new AsyncQueue();
    const tasksExecuted: number[] = [];

    for (let i = 0; i < 10_000; i++) {
      queue.run(async () => {
        tasksExecuted.push(i);
      });
    }
    await queue.flush();
    expect(tasksExecuted).toMatchObject(new Array(10_000).fill(0).map((_, idx) => idx));
  });
});

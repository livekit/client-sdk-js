import { Mutex } from './room/utils';

type QueueTask<T> = () => PromiseLike<T>;

enum QueueTaskStatus {
  'WAITING',
  'RUNNING',
  'COMPLETED',
}

type QueueTaskInfo<T> = {
  id: number;
  enqueuedAt: number;
  executedAt?: number;
  status: QueueTaskStatus;
  task: QueueTask<T>;
};

export class Queue {
  private pendingTasks: Map<number, QueueTaskInfo<unknown>>;

  private taskMutex: Mutex;

  private nextTaskIndex: number;

  constructor() {
    this.pendingTasks = new Map();
    this.taskMutex = new Mutex();
    this.nextTaskIndex = 0;
  }

  async run<T>(task: QueueTask<T>) {
    const taskInfo: QueueTaskInfo<T> = {
      id: this.nextTaskIndex++,
      task,
      enqueuedAt: Date.now(),
      status: QueueTaskStatus.WAITING,
    };
    this.pendingTasks.set(taskInfo.id, taskInfo);
    const unlock = await this.taskMutex.lock();
    try {
      taskInfo.executedAt = Date.now();
      taskInfo.status = QueueTaskStatus.RUNNING;
      return await taskInfo.task();
    } finally {
      taskInfo.status = QueueTaskStatus.COMPLETED;
      this.pendingTasks.delete(taskInfo.id);
      unlock();
    }
  }

  async flush() {
    return this.run(async () => {});
  }
}

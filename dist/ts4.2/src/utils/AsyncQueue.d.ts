type QueueTask<T> = () => PromiseLike<T>;
declare enum QueueTaskStatus {
    'WAITING' = 0,
    'RUNNING' = 1,
    'COMPLETED' = 2
}
type QueueTaskInfo = {
    id: number;
    enqueuedAt: number;
    executedAt?: number;
    status: QueueTaskStatus;
};
export declare class AsyncQueue {
    private pendingTasks;
    private taskMutex;
    private nextTaskIndex;
    constructor();
    run<T>(task: QueueTask<T>): Promise<T>;
    flush(): Promise<void>;
    snapshot(): QueueTaskInfo[];
}
export {};
//# sourceMappingURL=AsyncQueue.d.ts.map

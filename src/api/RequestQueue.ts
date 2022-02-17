import log from '../logger';

export default class Queue {
  private queue: Array<() => void>;

  private running: boolean;

  constructor() {
    this.queue = [];
    this.running = false;
  }

  enqueue(cb: () => void) {
    log.trace('enqueuing request to fire later');
    this.queue.push(cb);
  }

  dequeue() {
    const evt = this.queue.shift();
    if (evt) evt();
    log.trace('firing request from queue');
  }

  async run() {
    if (this.running) return;
    log.trace('start queue');
    this.running = true;
    while (this.running && this.queue.length > 0) {
      this.dequeue();
    }
    this.running = false;
    log.trace('queue finished');
  }

  pause() {
    log.trace('pausing queue');
    this.running = false;
  }

  reset() {
    log.trace('resetting queue');
    this.running = false;
    this.queue = [];
  }

  isRunning() {
    return this.running;
  }

  isEmpty() {
    return this.queue.length === 0;
  }
}

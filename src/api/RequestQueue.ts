import logger from '../logger';
export default class Queue {
  private queue: Array<() => void>;

  private running: boolean;

  constructor() {
    this.queue = [];
    this.running = false;
  }

  enqueue(cb: () => void) {
    logger.debug('enqueuing request to fire later');
    this.queue.push(cb);
  }

  dequeue() {
    const evt = this.queue.shift();
    if (evt) evt();
    logger.debug('firing request from queue');
  }

  async run() {
    if (this.running) return;
    logger.debug('start queue');
    this.running = true;
    while (this.running && this.queue.length > 0) {
      this.dequeue();
    }
    this.running = false;
    logger.debug('queue finished');
  }

  pause() {
    logger.debug('pausing queue');
    this.running = false;
  }

  reset() {
    logger.debug('resetting queue');
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

import { sleep } from '../utils';
import type LocalTrack from './LocalTrack';

export class LocalTrackRecorder<T extends LocalTrack> {
  private mediaRecorder: MediaRecorder;

  private chunks: Uint8Array[] = [];

  private isStopped = false;

  private reader: ReadableStream<Uint8Array>;

  constructor(track: T) {
    const mediaStream = new MediaStream([track.mediaStreamTrack]);
    this.mediaRecorder = new MediaRecorder(mediaStream);

    this.reader = new ReadableStream({
      start: async (controller) => {
        this.mediaRecorder.addEventListener('dataavailable', async (event) => {
          if (event.data.size > 0) {
            this.chunks.push(await event.data.bytes());
          }
        });

        this.mediaRecorder.addEventListener('stop', () => {
          this.isStopped = true;
        });

        this.mediaRecorder.addEventListener('error', (event) => {
          controller.error(event);
        });

        while (!this.isStopped) {
          const nextChunk = this.chunks.shift();
          if (nextChunk) {
            controller.enqueue(nextChunk);
          } else {
            await sleep(100);
          }
        }

        controller.close();
      },
    });
  }

  /**
   * Start recording and return an iterator for the recorded chunks
   * @param timeslice Optional time slice in ms for how often to generate data events
   * @returns An iterator that yields recorded Uint8Array chunks
   */
  start(timeslice: number = 100): AsyncIterableIterator<Uint8Array> {
    this.mediaRecorder.start(timeslice);
    return this.createIterator();
  }

  stop() {
    if (!this.isStopped && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  get state() {
    return this.mediaRecorder.state;
  }

  // Private iterator implementation
  private createIterator(): AsyncIterableIterator<Uint8Array> {
    const reader = this.reader.getReader();

    return {
      next: async (): Promise<IteratorResult<Uint8Array>> => {
        const { done, value } = await reader.read();
        if (done) {
          return { done: true, value: undefined as any };
        } else {
          return { done: false, value };
        }
      },

      async return(): Promise<IteratorResult<Uint8Array>> {
        reader.releaseLock();
        return { done: true, value: undefined as any };
      },

      [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
        return this;
      },
    };
  }
}

import { sleep } from '../utils';
import type LocalTrack from './LocalTrack';

export class LocalTrackRecorder<T extends LocalTrack> {
  private mediaRecorder: MediaRecorder;

  private chunks: Blob[] = [];

  private isStopped = false;

  private reader: ReadableStream<Blob>;

  constructor(track: T) {
    const mediaStream = new MediaStream([track.mediaStreamTrack]);
    this.mediaRecorder = new MediaRecorder(mediaStream);

    this.reader = new ReadableStream({
      start: async (controller) => {
        this.mediaRecorder.addEventListener('dataavailable', (event) => {
          if (event.data.size > 0) {
            this.chunks.push(event.data);
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
   * @returns An iterator that yields recorded Blob chunks
   */
  start(timeslice: number = 100): AsyncIterableIterator<Blob> {
    this.mediaRecorder.start(timeslice);
    return this.createIterator();
  }

  stop() {
    if (!this.isStopped && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  // Private iterator implementation
  private createIterator(): AsyncIterableIterator<Blob> {
    const reader = this.reader.getReader();

    return {
      next: async (): Promise<IteratorResult<Blob>> => {
        const { done, value } = await reader.read();
        if (done) {
          return { done: true, value: undefined as any };
        } else {
          return { done: false, value };
        }
      },

      async return(): Promise<IteratorResult<Blob>> {
        reader.releaseLock();
        return { done: true, value: undefined };
      },

      [Symbol.asyncIterator](): AsyncIterableIterator<Blob> {
        return this;
      },
    };
  }
}

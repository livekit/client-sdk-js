import { vi } from 'vitest';

class MockMediaRecorder {
  static isTypeSupported(type: string) {
    return true;
  }

  stream: MediaStream;
  mimeType: string;
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(stream: MediaStream, options: MediaRecorderOptions = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType || 'video/webm';
  }

  start() {
    this.state = 'recording';
    setTimeout(() => {
      const blob = new Blob(['mock data'], { type: this.mimeType });
      const event = { data: blob } as BlobEvent;
      this.ondataavailable?.(event);
    }, 10);
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  requestData() {
    const blob = new Blob(['mock data'], { type: this.mimeType });
    const event = { data: blob } as BlobEvent;
    this.ondataavailable?.(event);
  }
}

vi.stubGlobal('MediaRecorder', MockMediaRecorder);

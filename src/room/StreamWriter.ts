class BaseStreamWriter<T> {
  protected writableStream: WritableStream<T>;

  protected defaultWriter: WritableStreamDefaultWriter<T>;

  protected onClose?: () => void;

  constructor(writableStream: WritableStream<T>, onClose?: () => void) {
    this.writableStream = writableStream;
    this.defaultWriter = writableStream.getWriter();
    this.onClose = onClose;
  }

  write(chunk: T): Promise<void> {
    return this.defaultWriter.write(chunk);
  }

  async close() {
    await this.defaultWriter.close();
    this.defaultWriter.releaseLock();
    this.onClose?.();
  }
}

export class TextStreamWriter extends BaseStreamWriter<string> {}

export class BinaryStreamWriter extends BaseStreamWriter<Uint8Array> {}

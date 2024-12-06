class BaseStreamWriter<T> {
  protected writableStream: WritableStream<T>;

  protected defaultWriter: WritableStreamDefaultWriter<T>;

  constructor(writableStream: WritableStream<T>) {
    this.writableStream = writableStream;
    this.defaultWriter = writableStream.getWriter();
  }

  write(chunk: T): Promise<void> {
    return this.defaultWriter.write(chunk);
  }

  async close() {
    await this.defaultWriter.close();
    this.defaultWriter.releaseLock();
    console.log('stream status', this.writableStream.locked);
  }
}

export class TextStreamWriter extends BaseStreamWriter<string> {}

export class BinaryStreamWriter extends BaseStreamWriter<Uint8Array> {}

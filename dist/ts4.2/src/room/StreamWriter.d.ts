import type { BaseStreamInfo, ByteStreamInfo, TextStreamInfo } from './types';
declare class BaseStreamWriter<T, InfoType extends BaseStreamInfo> {
    protected writableStream: WritableStream<T>;
    protected defaultWriter: WritableStreamDefaultWriter<T>;
    protected onClose?: () => void;
    readonly info: InfoType;
    constructor(writableStream: WritableStream<T>, info: InfoType, onClose?: () => void);
    write(chunk: T): Promise<void>;
    close(): Promise<void>;
}
export declare class TextStreamWriter extends BaseStreamWriter<string, TextStreamInfo> {
}
export declare class BinaryStreamWriter extends BaseStreamWriter<Uint8Array, ByteStreamInfo> {
}
export {};
//# sourceMappingURL=StreamWriter.d.ts.map

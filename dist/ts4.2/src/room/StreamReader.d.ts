import type { DataStream_Chunk } from '@livekit/protocol';
import type { BaseStreamInfo, ByteStreamInfo, TextStreamInfo } from './types';
declare abstract class BaseStreamReader<T extends BaseStreamInfo> {
    protected reader: ReadableStream<DataStream_Chunk>;
    protected totalByteSize?: number;
    protected _info: T;
    protected bytesReceived: number;
    get info(): T;
    constructor(info: T, stream: ReadableStream<DataStream_Chunk>, totalByteSize?: number);
    protected abstract handleChunkReceived(chunk: DataStream_Chunk): void;
    onProgress?: (progress: number | undefined) => void;
    abstract readAll(): Promise<string | Array<Uint8Array>>;
}
export declare class ByteStreamReader extends BaseStreamReader<ByteStreamInfo> {
    protected handleChunkReceived(chunk: DataStream_Chunk): void;
    onProgress?: (progress: number | undefined) => void;
    [Symbol.asyncIterator](): {
        next: () => Promise<IteratorResult<Uint8Array>>;
        return(): Promise<IteratorResult<Uint8Array>>;
    };
    readAll(): Promise<Array<Uint8Array>>;
}
/**
 * A class to read chunks from a ReadableStream and provide them in a structured format.
 */
export declare class TextStreamReader extends BaseStreamReader<TextStreamInfo> {
    private receivedChunks;
    /**
     * A TextStreamReader instance can be used as an AsyncIterator that returns the entire string
     * that has been received up to the current point in time.
     */
    constructor(info: TextStreamInfo, stream: ReadableStream<DataStream_Chunk>, totalChunkCount?: number);
    protected handleChunkReceived(chunk: DataStream_Chunk): void;
    /**
     * @param progress - progress of the stream between 0 and 1. Undefined for streams of unknown size
     */
    onProgress?: (progress: number | undefined) => void;
    /**
     * Async iterator implementation to allow usage of `for await...of` syntax.
     * Yields structured chunks from the stream.
     *
     */
    [Symbol.asyncIterator](): {
        next: () => Promise<IteratorResult<string>>;
        return(): Promise<IteratorResult<string>>;
    };
    readAll(): Promise<string>;
}
export type ByteStreamHandler = (reader: ByteStreamReader, participantInfo: {
    identity: string;
}) => void;
export type TextStreamHandler = (reader: TextStreamReader, participantInfo: {
    identity: string;
}) => void;
export {};
//# sourceMappingURL=StreamReader.d.ts.map

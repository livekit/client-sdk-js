import { describe, expect, it, vitest } from 'vitest';
import { extractPacketTrailer } from '../frameMetadata';
import { EncodePipelineRegistry } from './encodePipelineRegistry';

class TestUnderlyingSource<T> implements UnderlyingSource<T> {
  controller!: ReadableStreamController<T>;

  start(controller: ReadableStreamController<T>): void {
    this.controller = controller;
  }

  write(chunk: T): void {
    this.controller.enqueue(chunk as any);
  }

  error(reason?: unknown): void {
    this.controller.error(reason);
  }

  close(): void {
    this.controller.close();
  }
}

class TestUnderlyingSink<T> implements UnderlyingSink<T> {
  public chunks: T[] = [];

  write(chunk: T): void {
    this.chunks.push(chunk);
  }
}

function mockFrame(data: Uint8Array): RTCEncodedVideoFrame {
  return { data: data.buffer } as RTCEncodedVideoFrame;
}

function setupPipeline(
  registry: EncodePipelineRegistry,
  packetTrailer?: Parameters<EncodePipelineRegistry['setupEncodeTransform']>[2],
  trackId?: string,
) {
  const input = new TestUnderlyingSource<RTCEncodedVideoFrame>();
  const output = new TestUnderlyingSink<RTCEncodedVideoFrame>();
  registry.setupEncodeTransform(
    new ReadableStream(input),
    new WritableStream(output),
    packetTrailer,
    trackId,
  );
  return { input, output };
}

async function writeFrame(
  input: TestUnderlyingSource<RTCEncodedVideoFrame>,
  output: TestUnderlyingSink<RTCEncodedVideoFrame>,
  data: Uint8Array,
) {
  const countBefore = output.chunks.length;
  input.write(mockFrame(data));
  await vitest.waitFor(() => expect(output.chunks.length).toBe(countBefore + 1));
  return output.chunks[countBefore];
}

describe('EncodePipelineRegistry', () => {
  const payload = Uint8Array.from([1, 2, 3, 4]);
  const userData = Uint8Array.from([7, 8, 9]);

  it('attaches pending user data to the next frame only', async () => {
    const registry = new EncodePipelineRegistry();
    const { input, output } = setupPipeline(registry, { userData: true }, 'track');

    registry.setFrameUserData('track', userData);

    const first = await writeFrame(input, output, payload);
    expect(extractPacketTrailer(first.data).metadata?.userData).toEqual(userData);

    const second = await writeFrame(input, output, payload);
    expect(extractPacketTrailer(second.data).metadata).toBeUndefined();
  });

  it('replaces pending user data on subsequent calls (last write wins)', async () => {
    const registry = new EncodePipelineRegistry();
    const { input, output } = setupPipeline(registry, { userData: true }, 'track');

    registry.setFrameUserData('track', Uint8Array.from([1]));
    registry.setFrameUserData('track', userData);

    const frame = await writeFrame(input, output, payload);
    expect(extractPacketTrailer(frame.data).metadata?.userData).toEqual(userData);
  });

  it('fans out pending user data to every pipeline registered under the trackId', async () => {
    const registry = new EncodePipelineRegistry();
    const primary = setupPipeline(registry, { userData: true }, 'track');
    const backup = setupPipeline(registry, { userData: true }, 'track');

    registry.setFrameUserData('track', userData);

    const primaryFrame = await writeFrame(primary.input, primary.output, payload);
    const backupFrame = await writeFrame(backup.input, backup.output, payload);
    expect(extractPacketTrailer(primaryFrame.data).metadata?.userData).toEqual(userData);
    expect(extractPacketTrailer(backupFrame.data).metadata?.userData).toEqual(userData);
  });

  it('does not deliver user data to pipelines of other tracks', async () => {
    const registry = new EncodePipelineRegistry();
    const other = setupPipeline(registry, { userData: true }, 'other-track');

    registry.setFrameUserData('track', userData);

    const frame = await writeFrame(other.input, other.output, payload);
    expect(extractPacketTrailer(frame.data).metadata).toBeUndefined();
  });

  it('stashes user data posted before pipeline registration and lets the first registrant adopt it', async () => {
    const registry = new EncodePipelineRegistry();

    registry.setFrameUserData('track', userData);

    const { input, output } = setupPipeline(registry, { userData: true }, 'track');
    const first = await writeFrame(input, output, payload);
    expect(extractPacketTrailer(first.data).metadata?.userData).toEqual(userData);

    // the stash is consumed by the first registrant
    const late = setupPipeline(registry, { userData: true }, 'track');
    const lateFrame = await writeFrame(late.input, late.output, payload);
    expect(extractPacketTrailer(lateFrame.data).metadata).toBeUndefined();
  });

  it('clears pending user data and stash when called with undefined or empty data', async () => {
    const registry = new EncodePipelineRegistry();
    const { input, output } = setupPipeline(registry, { userData: true }, 'track');

    registry.setFrameUserData('track', userData);
    registry.setFrameUserData('track', undefined);

    const first = await writeFrame(input, output, payload);
    expect(extractPacketTrailer(first.data).metadata).toBeUndefined();

    registry.setFrameUserData('track', userData);
    registry.setFrameUserData('track', new Uint8Array(0));

    const second = await writeFrame(input, output, payload);
    expect(extractPacketTrailer(second.data).metadata).toBeUndefined();

    // clearing a not-yet-adopted stash
    const registry2 = new EncodePipelineRegistry();
    registry2.setFrameUserData('track', userData);
    registry2.setFrameUserData('track', undefined);
    const pipeline2 = setupPipeline(registry2, { userData: true }, 'track');
    const frame2 = await writeFrame(pipeline2.input, pipeline2.output, payload);
    expect(extractPacketTrailer(frame2.data).metadata).toBeUndefined();
  });

  it('does not consume pending user data on empty frames', async () => {
    const registry = new EncodePipelineRegistry();
    const { input, output } = setupPipeline(registry, { userData: true }, 'track');

    registry.setFrameUserData('track', userData);

    const empty = await writeFrame(input, output, new Uint8Array(0));
    expect(empty.data.byteLength).toBe(0);

    const next = await writeFrame(input, output, payload);
    expect(extractPacketTrailer(next.data).metadata?.userData).toEqual(userData);
  });

  it('keeps writing frame ids while user data is one-shot', async () => {
    const registry = new EncodePipelineRegistry();
    const { input, output } = setupPipeline(registry, { userData: true, frameId: true }, 'track');

    registry.setFrameUserData('track', userData);

    const first = await writeFrame(input, output, payload);
    const firstMetadata = extractPacketTrailer(first.data).metadata;
    expect(firstMetadata?.frameId).toBe(1);
    expect(firstMetadata?.userData).toEqual(userData);

    const second = await writeFrame(input, output, payload);
    const secondMetadata = extractPacketTrailer(second.data).metadata;
    expect(secondMetadata?.frameId).toBe(2);
    expect(secondMetadata?.userData).toBeUndefined();
  });

  it('unregisters a pipeline when its stream terminates', async () => {
    const registry = new EncodePipelineRegistry();
    const internals = registry as unknown as {
      pipelines: Map<string, Set<unknown>>;
      pendingByKey: Map<string, Uint8Array>;
    };
    const { input, output } = setupPipeline(registry, { userData: true }, 'track');

    input.error(new Error('stream closed'));
    // wait for the pipe rejection to unregister the pipeline
    await vitest.waitFor(() => {
      expect(internals.pipelines.size).toBe(0);
    });

    // with no registered pipelines the value is stashed again
    registry.setFrameUserData('track', userData);
    expect(internals.pendingByKey.get('track')).toEqual(userData);
    expect(output.chunks.length).toBe(0);
  });
});

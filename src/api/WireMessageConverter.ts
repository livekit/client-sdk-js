import { Envelope, Fragment, Signalv2WireMessage } from '@livekit/protocol';

const MAX_WIRE_MESSAGE_SIZE = 16_000;

export class WireMessageConverter {
  private readonly fragmentBuffer: Map<number, Array<Fragment | null>> = new Map();

  /**
   * @param wireMessage - The wire message to convert to an envelope
   * @returns The envelope of the wire message. If the wire message is a fragment, it will be buffered and returned only when the envelope completing fragment is passed. Immediately returns null if the wire message is a fragment and the envelope is not complete.
   */
  wireMessageToEnvelope(wireMessage: Signalv2WireMessage): Envelope | null {
    if (wireMessage.message.case === 'envelope') {
      return wireMessage.message.value;
    } else if (wireMessage.message.case === 'fragment') {
      const fragment = wireMessage.message.value;

      const buffer =
        this.fragmentBuffer.get(fragment.packetId) ||
        new Array<Fragment | null>(fragment.numFragments).fill(null);
      buffer[fragment.fragmentNumber - 1] = fragment;
      this.fragmentBuffer.set(fragment.packetId, buffer);

      if (buffer.every((f) => f !== null)) {
        const totalDataReceived = buffer.reduce((acc, f) => acc + f.data.byteLength, 0);
        if (totalDataReceived !== fragment.totalSize) {
          console.warn(
            `Fragments of packet ${fragment.packetId} have incorrect size: ${totalDataReceived} !== ${fragment.totalSize}`,
          );
          console.log('buffer', buffer);

          this.fragmentBuffer.delete(fragment.packetId);
          return null;
        }
        const rawEnvelope = new Uint8Array(totalDataReceived);
        let offset = 0;
        for (const f of buffer) {
          rawEnvelope.set(f.data, offset);
          offset += f.data.byteLength;
        }
        const envelope = Envelope.fromBinary(rawEnvelope);
        this.fragmentBuffer.delete(fragment.packetId);
        return envelope;
      }
      return null;
    }
    return null;
  }

  clearFragmentBuffer(): void {
    this.fragmentBuffer.clear();
  }

  /**
   * @param envelope - The envelope to convert to wire messages
   * @returns The wire messages
   */
  envelopeToWireMessages(envelope: Envelope): Array<Signalv2WireMessage> {
    const binaryEnvelope = envelope.toBinary();
    const envelopeSize = binaryEnvelope.byteLength;
    if (envelopeSize > MAX_WIRE_MESSAGE_SIZE) {
      console.info(`Sending fragmented envelope of ${envelopeSize} bytes`);
      const numFragments = Math.ceil(envelopeSize / MAX_WIRE_MESSAGE_SIZE);
      const fragments = [];

      for (let i = 0; i < numFragments; i++) {
        fragments.push(
          new Fragment({
            packetId: 0,
            fragmentNumber: i + 1,
            data: binaryEnvelope.slice(i * MAX_WIRE_MESSAGE_SIZE, (i + 1) * MAX_WIRE_MESSAGE_SIZE),
            totalSize: envelopeSize,
            numFragments,
          }),
        );
      }
      return fragments.map(
        (fragment) =>
          new Signalv2WireMessage({
            message: {
              case: 'fragment',
              value: fragment,
            },
          }),
      );
    } else {
      const wireMessage = new Signalv2WireMessage({
        message: {
          case: 'envelope',
          value: envelope,
        },
      });
      return [wireMessage];
    }
  }
}

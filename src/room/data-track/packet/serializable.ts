/** An abstract class implementing common behavior related to data track binary serialization. */
export default abstract class Serializable {
  /** Returns the expected length of the serialized output in bytes */
  abstract toBinaryLengthBytes(): number;

  /** Given a DataView, serialize the instance inside and return the number of bytes written. */
  abstract toBinaryInto(dataView: DataView): number;

  /** Encodes the instance as binary and returns the data as a Uint8Array. */
  toBinary() {
    const lengthBytes = this.toBinaryLengthBytes();
    const output = new ArrayBuffer(lengthBytes);
    const view = new DataView(output);

    const writtenBytes = this.toBinaryInto(view);

    if (lengthBytes !== writtenBytes) {
      throw new Error(
        `${this.constructor.name}.toBinary: written bytes (${writtenBytes} bytes) not equal to allocated array buffer length (${lengthBytes} bytes).`,
      );
    }

    return new Uint8Array(output); // FIXME: return uint8array here? Or the arraybuffer?
  }
}

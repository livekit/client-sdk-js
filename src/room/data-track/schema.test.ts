import {
  DataBlobKey,
  DataTrackFrameEncoding as ProtocolDataTrackFrameEncoding,
  DataTrackSchemaEncoding as ProtocolDataTrackSchemaEncoding,
  DataTrackSchemaId as ProtocolDataTrackSchemaId,
  DataTrackFrameEncoding_WellKnownFrameEncoding as ProtocolWellKnownFrameEncoding,
  DataTrackSchemaEncoding_WellKnownSchemaEncoding as ProtocolWellKnownSchemaEncoding,
} from '@livekit/protocol';
import { describe, expect, it } from 'vitest';
import {
  DataTrackFrameEncoding,
  DataTrackSchemaEncoding,
  DataTrackSchemaError,
  DataTrackSchemaErrorReason,
  DataTrackSchemaId,
  validateSchemaMetadata,
} from './schema';

describe('DataTrackSchemaEncoding', () => {
  const wellKnown: Array<DataTrackSchemaEncoding> = [
    'protobuf',
    'flatbuffer',
    'ros1Msg',
    'ros2Msg',
    'ros2Idl',
    'omgIdl',
    'jsonSchema',
  ];

  it.each(wellKnown)('round-trips well-known encoding %s', (encoding) => {
    const protobuf = DataTrackSchemaEncoding.toProtobuf(encoding);
    expect(protobuf.value.case).toStrictEqual('wellKnown');
    expect(DataTrackSchemaEncoding.from(protobuf)).toStrictEqual(encoding);
  });

  it('round-trips a custom encoding', () => {
    const encoding: DataTrackSchemaEncoding = { custom: 'my_encoding' };
    const protobuf = DataTrackSchemaEncoding.toProtobuf(encoding);
    expect(protobuf.value).toStrictEqual({ case: 'custom', value: 'my_encoding' });
    expect(DataTrackSchemaEncoding.from(protobuf)).toStrictEqual(encoding);
  });

  it('maps an unspecified well-known value to "other"', () => {
    const protobuf = new ProtocolDataTrackSchemaEncoding({
      value: { case: 'wellKnown', value: ProtocolWellKnownSchemaEncoding.UNSPECIFIED },
    });
    expect(DataTrackSchemaEncoding.from(protobuf)).toStrictEqual('other');
  });

  it('maps a well-known value introduced after this version to "other"', () => {
    const protobuf = new ProtocolDataTrackSchemaEncoding({
      value: { case: 'wellKnown', value: 999 as ProtocolWellKnownSchemaEncoding },
    });
    expect(DataTrackSchemaEncoding.from(protobuf)).toStrictEqual('other');
  });

  it('maps an absent oneof to "other"', () => {
    expect(DataTrackSchemaEncoding.from(new ProtocolDataTrackSchemaEncoding())).toStrictEqual(
      'other',
    );
  });
});

describe('DataTrackFrameEncoding', () => {
  const wellKnown: Array<DataTrackFrameEncoding> = [
    'ros1',
    'cdr',
    'protobuf',
    'flatbuffer',
    'cbor',
    'msgpack',
    'json',
  ];

  it.each(wellKnown)('round-trips well-known encoding %s', (encoding) => {
    const protobuf = DataTrackFrameEncoding.toProtobuf(encoding);
    expect(protobuf.value.case).toStrictEqual('wellKnown');
    expect(DataTrackFrameEncoding.from(protobuf)).toStrictEqual(encoding);
  });

  it('round-trips a custom encoding', () => {
    const encoding: DataTrackFrameEncoding = { custom: 'my_encoding' };
    const protobuf = DataTrackFrameEncoding.toProtobuf(encoding);
    expect(protobuf.value).toStrictEqual({ case: 'custom', value: 'my_encoding' });
    expect(DataTrackFrameEncoding.from(protobuf)).toStrictEqual(encoding);
  });

  it('maps an unspecified well-known value to "other"', () => {
    const protobuf = new ProtocolDataTrackFrameEncoding({
      value: { case: 'wellKnown', value: ProtocolWellKnownFrameEncoding.UNSPECIFIED },
    });
    expect(DataTrackFrameEncoding.from(protobuf)).toStrictEqual('other');
  });

  it('maps a well-known value introduced after this version to "other"', () => {
    const protobuf = new ProtocolDataTrackFrameEncoding({
      value: { case: 'wellKnown', value: 999 as ProtocolWellKnownFrameEncoding },
    });
    expect(DataTrackFrameEncoding.from(protobuf)).toStrictEqual('other');
  });
});

describe('DataTrackSchemaId', () => {
  it('round-trips name and encoding', () => {
    const schemaId: DataTrackSchemaId = { name: 'rgb', encoding: 'protobuf' };
    const protobuf = DataTrackSchemaId.toProtobuf(schemaId);
    expect(protobuf).toBeInstanceOf(ProtocolDataTrackSchemaId);
    expect(protobuf.name).toStrictEqual('rgb');
    expect(DataTrackSchemaId.from(protobuf)).toStrictEqual(schemaId);
  });

  it('defaults encoding to "other" when the protobuf encoding is absent', () => {
    const protobuf = new ProtocolDataTrackSchemaId({ name: 'rgb' });
    expect(DataTrackSchemaId.from(protobuf)).toStrictEqual({ name: 'rgb', encoding: 'other' });
  });

  it.each([
    { title: 'well-known encoding', encoding: 'jsonSchema' as DataTrackSchemaEncoding },
    { title: 'custom encoding', encoding: { custom: 'my_encoding' } },
  ])('converts to a data blob key ($title)', ({ encoding }) => {
    const schemaId: DataTrackSchemaId = { name: 'rgb', encoding };
    const key = DataTrackSchemaId.toDataBlobKey(schemaId);
    expect(key).toBeInstanceOf(DataBlobKey);
    expect(key.key.case).toStrictEqual('schemaId');
    expect(DataTrackSchemaId.from(key.key.value as ProtocolDataTrackSchemaId)).toStrictEqual(
      schemaId,
    );
  });
});

describe('validateSchemaMetadata', () => {
  function expectSchemaError(reason: DataTrackSchemaErrorReason, fn: () => void) {
    let thrown: unknown;
    try {
      fn();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DataTrackSchemaError);
    expect((thrown as DataTrackSchemaError).reason).toStrictEqual(reason);
  }

  it('accepts absent schema metadata', () => {
    expect(() => validateSchemaMetadata(undefined, undefined)).not.toThrow();
  });

  it('accepts a self-describing frame encoding without a schema', () => {
    expect(() => validateSchemaMetadata('json', undefined)).not.toThrow();
  });

  it('accepts compatible frame and schema encodings', () => {
    expect(() => validateSchemaMetadata('cdr', 'ros2Idl')).not.toThrow();
  });

  it('accepts custom encodings, which cannot be validated', () => {
    expect(() =>
      validateSchemaMetadata({ custom: 'my-frame-encoding' }, { custom: 'my-schema-encoding' }),
    ).not.toThrow();
  });

  it('accepts a custom schema encoding with a well-known frame encoding', () => {
    expect(() => validateSchemaMetadata('json', { custom: 'my-schema-encoding' })).not.toThrow();
  });

  it("rejects an 'other' schema encoding", () => {
    expectSchemaError(DataTrackSchemaErrorReason.OtherEncoding, () =>
      validateSchemaMetadata('json', 'other'),
    );
  });

  it("rejects an 'other' frame encoding", () => {
    expectSchemaError(DataTrackSchemaErrorReason.OtherEncoding, () =>
      validateSchemaMetadata('other', undefined),
    );
  });

  it('rejects a schema without a frame encoding', () => {
    expectSchemaError(DataTrackSchemaErrorReason.MissingFrameEncoding, () =>
      validateSchemaMetadata(undefined, 'protobuf'),
    );
  });

  it('rejects a non-self-describing frame encoding without a schema', () => {
    expectSchemaError(DataTrackSchemaErrorReason.MissingSchemaId, () =>
      validateSchemaMetadata('protobuf', undefined),
    );
  });

  it('rejects incompatible frame and schema encodings', () => {
    expectSchemaError(DataTrackSchemaErrorReason.Incompatible, () =>
      validateSchemaMetadata('json', 'protobuf'),
    );
  });
});

import {
  DataTrackFrameEncoding as ProtocolDataTrackFrameEncoding,
  DataTrackSchemaEncoding as ProtocolDataTrackSchemaEncoding,
  DataTrackSchemaId as ProtocolDataTrackSchemaId,
  DataTrackFrameEncoding_WellKnownFrameEncoding as ProtocolWellKnownFrameEncoding,
  DataTrackSchemaEncoding_WellKnownSchemaEncoding as ProtocolWellKnownSchemaEncoding,
} from '@livekit/protocol';
import { describe, expect, it } from 'vitest';
import { DataTrackFrameEncoding, DataTrackSchemaEncoding, DataTrackSchemaId } from './schema';

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
    expect(protobuf.value.case).toEqual('wellKnown');
    expect(DataTrackSchemaEncoding.from(protobuf)).toEqual(encoding);
  });

  it('round-trips a custom encoding', () => {
    const encoding: DataTrackSchemaEncoding = { custom: 'my_encoding' };
    const protobuf = DataTrackSchemaEncoding.toProtobuf(encoding);
    expect(protobuf.value).toEqual({ case: 'custom', value: 'my_encoding' });
    expect(DataTrackSchemaEncoding.from(protobuf)).toEqual(encoding);
  });

  it('maps an unspecified well-known value to "other"', () => {
    const protobuf = new ProtocolDataTrackSchemaEncoding({
      value: { case: 'wellKnown', value: ProtocolWellKnownSchemaEncoding.UNSPECIFIED },
    });
    expect(DataTrackSchemaEncoding.from(protobuf)).toEqual('other');
  });

  it('maps a well-known value introduced after this version to "other"', () => {
    const protobuf = new ProtocolDataTrackSchemaEncoding({
      value: { case: 'wellKnown', value: 999 as ProtocolWellKnownSchemaEncoding },
    });
    expect(DataTrackSchemaEncoding.from(protobuf)).toEqual('other');
  });

  it('maps an absent oneof to "other"', () => {
    expect(DataTrackSchemaEncoding.from(new ProtocolDataTrackSchemaEncoding())).toEqual('other');
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
    expect(protobuf.value.case).toEqual('wellKnown');
    expect(DataTrackFrameEncoding.from(protobuf)).toEqual(encoding);
  });

  it('round-trips a custom encoding', () => {
    const encoding: DataTrackFrameEncoding = { custom: 'my_encoding' };
    const protobuf = DataTrackFrameEncoding.toProtobuf(encoding);
    expect(protobuf.value).toEqual({ case: 'custom', value: 'my_encoding' });
    expect(DataTrackFrameEncoding.from(protobuf)).toEqual(encoding);
  });

  it('maps an unspecified well-known value to "other"', () => {
    const protobuf = new ProtocolDataTrackFrameEncoding({
      value: { case: 'wellKnown', value: ProtocolWellKnownFrameEncoding.UNSPECIFIED },
    });
    expect(DataTrackFrameEncoding.from(protobuf)).toEqual('other');
  });

  it('maps a well-known value introduced after this version to "other"', () => {
    const protobuf = new ProtocolDataTrackFrameEncoding({
      value: { case: 'wellKnown', value: 999 as ProtocolWellKnownFrameEncoding },
    });
    expect(DataTrackFrameEncoding.from(protobuf)).toEqual('other');
  });
});

describe('DataTrackSchemaId', () => {
  it('round-trips name and encoding', () => {
    const schemaId: DataTrackSchemaId = { name: 'rgb', encoding: 'protobuf' };
    const protobuf = DataTrackSchemaId.toProtobuf(schemaId);
    expect(protobuf).toBeInstanceOf(ProtocolDataTrackSchemaId);
    expect(protobuf.name).toEqual('rgb');
    expect(DataTrackSchemaId.from(protobuf)).toEqual(schemaId);
  });

  it('defaults encoding to "other" when the protobuf encoding is absent', () => {
    const protobuf = new ProtocolDataTrackSchemaId({ name: 'rgb' });
    expect(DataTrackSchemaId.from(protobuf)).toEqual({ name: 'rgb', encoding: 'other' });
  });
});

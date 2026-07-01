import {
  DataTrackFrameEncoding as ProtocolDataTrackFrameEncoding,
  DataTrackSchemaEncoding as ProtocolDataTrackSchemaEncoding,
  DataTrackSchemaId as ProtocolDataTrackSchemaId,
  DataTrackFrameEncoding_WellKnownFrameEncoding as ProtocolWellKnownFrameEncoding,
  DataTrackSchemaEncoding_WellKnownSchemaEncoding as ProtocolWellKnownSchemaEncoding,
} from '@livekit/protocol';

/**
 * Encoding used to interpret a data track schema definition.
 *
 * Identifies the interface definition language the schema is written in (e.g. a
 * `.proto` file for `'protobuf'`). This in turn dictates the wire format of the
 * frames the schema describes, captured by {@link DataTrackFrameEncoding}.
 *
 * The well-known encodings mirror the schema encodings from the MCAP spec:
 * https://mcap.dev/spec/registry#schema-encodings. Use `{ custom }` for an
 * application-specific encoding not enumerated here; prefer a well-known encoding
 * where possible. The identifier must be non-empty and no longer than 32 characters.
 *
 * `'other'` is only produced when receiving a well-known encoding introduced after
 * this SDK version; it is not meant to be sent.
 */
export type DataTrackSchemaEncoding =
  /** Protocol Buffer IDL, describes `'protobuf'` encoded frames. */
  | 'protobuf'
  /** FlatBuffer IDL, describes `'flatbuffer'` encoded frames. */
  | 'flatbuffer'
  /** ROS 1 Message, describes `'ros1'` encoded frames. */
  | 'ros1Msg'
  /** ROS 2 Message, describes `'cdr'` encoded frames. */
  | 'ros2Msg'
  /** ROS 2 IDL, describes `'cdr'` encoded frames. */
  | 'ros2Idl'
  /** OMG IDL, describes `'cdr'` encoded frames. */
  | 'omgIdl'
  /** JSON Schema, describes `'json'` encoded frames. */
  | 'jsonSchema'
  /** Another well-known encoding not known to this client version. */
  | 'other'
  /** An application-specific encoding identified by the contained string. */
  | { custom: string };

/**
 * Encoding used for frames pushed on a data track.
 *
 * The serialization format of the frame bytes (e.g. `'protobuf'`); the structure
 * of those bytes is described by a schema, see {@link DataTrackSchemaEncoding}.
 *
 * Use `{ custom }` for an application-specific encoding not enumerated here; prefer
 * a well-known encoding where possible. The identifier must be non-empty and no
 * longer than 32 characters.
 *
 * `'other'` is only produced when receiving a well-known encoding introduced after
 * this SDK version; it is not meant to be sent.
 */
export type DataTrackFrameEncoding =
  /** ROS 1, must be described by a `'ros1Msg'` schema. */
  | 'ros1'
  /** CDR, must be described by a `'ros2Msg'`, `'ros2Idl'`, or `'omgIdl'` schema. */
  | 'cdr'
  /** Protocol Buffer, must be described by a `'protobuf'` schema. */
  | 'protobuf'
  /** FlatBuffer, must be described by a `'flatbuffer'` schema. */
  | 'flatbuffer'
  /** CBOR, self-describing. */
  | 'cbor'
  /** MessagePack, self-describing. */
  | 'msgpack'
  /** JSON, self-describing or described by a `'jsonSchema'` schema. */
  | 'json'
  /** Another well-known encoding not known to this client version. */
  | 'other'
  /** An application-specific encoding identified by the contained string. */
  | { custom: string };

/**
 * Identifier for a data track schema.
 *
 * A compound identifier with two components: {@link name} and {@link encoding}.
 *
 * Two IDs are equal only if both components match; the same name with a different
 * encoding refers to a distinct schema.
 */
export type DataTrackSchemaId = {
  /** Name component of the identifier. Must be non-empty and no longer than 256 characters. */
  name: string;
  /** Encoding component of the identifier. */
  encoding: DataTrackSchemaEncoding;
};

const SCHEMA_ENCODING_TO_WELL_KNOWN: Record<string, ProtocolWellKnownSchemaEncoding> = {
  protobuf: ProtocolWellKnownSchemaEncoding.PROTOBUF,
  flatbuffer: ProtocolWellKnownSchemaEncoding.FLATBUFFER,
  ros1Msg: ProtocolWellKnownSchemaEncoding.ROS1_MSG,
  ros2Msg: ProtocolWellKnownSchemaEncoding.ROS2_MSG,
  ros2Idl: ProtocolWellKnownSchemaEncoding.ROS2_IDL,
  omgIdl: ProtocolWellKnownSchemaEncoding.OMG_IDL,
  jsonSchema: ProtocolWellKnownSchemaEncoding.JSON_SCHEMA,
};

const WELL_KNOWN_TO_SCHEMA_ENCODING: Partial<
  Record<ProtocolWellKnownSchemaEncoding, DataTrackSchemaEncoding>
> = {
  [ProtocolWellKnownSchemaEncoding.PROTOBUF]: 'protobuf',
  [ProtocolWellKnownSchemaEncoding.FLATBUFFER]: 'flatbuffer',
  [ProtocolWellKnownSchemaEncoding.ROS1_MSG]: 'ros1Msg',
  [ProtocolWellKnownSchemaEncoding.ROS2_MSG]: 'ros2Msg',
  [ProtocolWellKnownSchemaEncoding.ROS2_IDL]: 'ros2Idl',
  [ProtocolWellKnownSchemaEncoding.OMG_IDL]: 'omgIdl',
  [ProtocolWellKnownSchemaEncoding.JSON_SCHEMA]: 'jsonSchema',
};

const FRAME_ENCODING_TO_WELL_KNOWN: Record<string, ProtocolWellKnownFrameEncoding> = {
  ros1: ProtocolWellKnownFrameEncoding.ROS1,
  cdr: ProtocolWellKnownFrameEncoding.CDR,
  protobuf: ProtocolWellKnownFrameEncoding.PROTOBUF,
  flatbuffer: ProtocolWellKnownFrameEncoding.FLATBUFFER,
  cbor: ProtocolWellKnownFrameEncoding.CBOR,
  msgpack: ProtocolWellKnownFrameEncoding.MSGPACK,
  json: ProtocolWellKnownFrameEncoding.JSON,
};

const WELL_KNOWN_TO_FRAME_ENCODING: Partial<
  Record<ProtocolWellKnownFrameEncoding, DataTrackFrameEncoding>
> = {
  [ProtocolWellKnownFrameEncoding.ROS1]: 'ros1',
  [ProtocolWellKnownFrameEncoding.CDR]: 'cdr',
  [ProtocolWellKnownFrameEncoding.PROTOBUF]: 'protobuf',
  [ProtocolWellKnownFrameEncoding.FLATBUFFER]: 'flatbuffer',
  [ProtocolWellKnownFrameEncoding.CBOR]: 'cbor',
  [ProtocolWellKnownFrameEncoding.MSGPACK]: 'msgpack',
  [ProtocolWellKnownFrameEncoding.JSON]: 'json',
};

export const DataTrackSchemaEncoding = {
  from(protocol: ProtocolDataTrackSchemaEncoding): DataTrackSchemaEncoding {
    switch (protocol.value.case) {
      case 'wellKnown':
        // Maps unspecified or a value introduced after this client version to 'other'.
        return WELL_KNOWN_TO_SCHEMA_ENCODING[protocol.value.value] ?? 'other';
      case 'custom':
        return { custom: protocol.value.value };
      default:
        return 'other';
    }
  },
  toProtobuf(encoding: DataTrackSchemaEncoding): ProtocolDataTrackSchemaEncoding {
    if (typeof encoding === 'object') {
      return new ProtocolDataTrackSchemaEncoding({
        value: { case: 'custom', value: encoding.custom },
      });
    }
    const wellKnown =
      SCHEMA_ENCODING_TO_WELL_KNOWN[encoding] ?? ProtocolWellKnownSchemaEncoding.UNSPECIFIED;
    return new ProtocolDataTrackSchemaEncoding({ value: { case: 'wellKnown', value: wellKnown } });
  },
};

export const DataTrackFrameEncoding = {
  from(protocol: ProtocolDataTrackFrameEncoding): DataTrackFrameEncoding {
    switch (protocol.value.case) {
      case 'wellKnown':
        // Maps unspecified or a value introduced after this client version to 'other'.
        return WELL_KNOWN_TO_FRAME_ENCODING[protocol.value.value] ?? 'other';
      case 'custom':
        return { custom: protocol.value.value };
      default:
        return 'other';
    }
  },
  toProtobuf(encoding: DataTrackFrameEncoding): ProtocolDataTrackFrameEncoding {
    if (typeof encoding === 'object') {
      return new ProtocolDataTrackFrameEncoding({
        value: { case: 'custom', value: encoding.custom },
      });
    }
    const wellKnown =
      FRAME_ENCODING_TO_WELL_KNOWN[encoding] ?? ProtocolWellKnownFrameEncoding.UNSPECIFIED;
    return new ProtocolDataTrackFrameEncoding({ value: { case: 'wellKnown', value: wellKnown } });
  },
};

export const DataTrackSchemaId = {
  from(protocol: ProtocolDataTrackSchemaId): DataTrackSchemaId {
    return {
      name: protocol.name,
      encoding: protocol.encoding ? DataTrackSchemaEncoding.from(protocol.encoding) : 'other',
    };
  },
  toProtobuf(schemaId: DataTrackSchemaId): ProtocolDataTrackSchemaId {
    return new ProtocolDataTrackSchemaId({
      name: schemaId.name,
      encoding: DataTrackSchemaEncoding.toProtobuf(schemaId.encoding),
    });
  },
};

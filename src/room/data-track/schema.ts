import {
  DataBlobKey,
  DataTrackFrameEncoding as ProtocolDataTrackFrameEncoding,
  DataTrackSchemaEncoding as ProtocolDataTrackSchemaEncoding,
  DataTrackSchemaId as ProtocolDataTrackSchemaId,
  DataTrackFrameEncoding_WellKnownFrameEncoding as ProtocolWellKnownFrameEncoding,
  DataTrackSchemaEncoding_WellKnownSchemaEncoding as ProtocolWellKnownSchemaEncoding,
} from '@livekit/protocol';
import type { Throws } from '@livekit/throws-transformer/throws';
import { LivekitReasonedError } from '../errors';

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
 * this SDK version; it cannot be used when publishing.
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
 * this SDK version; it cannot be used when publishing.
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

// Note: not using Object.fromEntries as it requires ES2019.
function invert<V extends number>(mapping: Record<string, V>): Partial<Record<V, string>> {
  const inverted: Partial<Record<V, string>> = {};
  for (const [key, value] of Object.entries(mapping)) {
    inverted[value] = key;
  }
  return inverted;
}

const WELL_KNOWN_TO_SCHEMA_ENCODING = invert(SCHEMA_ENCODING_TO_WELL_KNOWN) as Partial<
  Record<ProtocolWellKnownSchemaEncoding, DataTrackSchemaEncoding>
>;

const FRAME_ENCODING_TO_WELL_KNOWN: Record<string, ProtocolWellKnownFrameEncoding> = {
  ros1: ProtocolWellKnownFrameEncoding.ROS1,
  cdr: ProtocolWellKnownFrameEncoding.CDR,
  protobuf: ProtocolWellKnownFrameEncoding.PROTOBUF,
  flatbuffer: ProtocolWellKnownFrameEncoding.FLATBUFFER,
  cbor: ProtocolWellKnownFrameEncoding.CBOR,
  msgpack: ProtocolWellKnownFrameEncoding.MSGPACK,
  json: ProtocolWellKnownFrameEncoding.JSON,
};

const WELL_KNOWN_TO_FRAME_ENCODING = invert(FRAME_ENCODING_TO_WELL_KNOWN) as Partial<
  Record<ProtocolWellKnownFrameEncoding, DataTrackFrameEncoding>
>;

/** Frame encodings that are self-describing (i.e. require no schema). */
const SELF_DESCRIBING_FRAME_ENCODINGS: DataTrackFrameEncoding[] = ['cbor', 'msgpack', 'json'];

/** Schema encodings capable of describing frames with each frame encoding. */
const COMPATIBLE_SCHEMA_ENCODINGS: Record<string, DataTrackSchemaEncoding[]> = {
  ros1: ['ros1Msg'],
  cdr: ['ros2Msg', 'ros2Idl', 'omgIdl'],
  protobuf: ['protobuf'],
  flatbuffer: ['flatbuffer'],
  json: ['jsonSchema'],
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
  /**
   * Whether frames with this encoding are self-describing (i.e. require no schema).
   *
   * Returns `undefined` when this cannot be determined ('other' or a custom encoding).
   */
  isSelfDescribing(encoding: DataTrackFrameEncoding): boolean | undefined {
    if (typeof encoding === 'object' || encoding === 'other') {
      return undefined; // Cannot be validated
    }
    return SELF_DESCRIBING_FRAME_ENCODINGS.includes(encoding);
  },
  /**
   * Whether frames with this encoding can be described by a schema with the given encoding.
   *
   * Returns `undefined` when this cannot be determined ('other' or a custom encoding
   * on either side).
   */
  isDescribedBy(
    encoding: DataTrackFrameEncoding,
    schemaEncoding: DataTrackSchemaEncoding,
  ): boolean | undefined {
    if (
      typeof encoding === 'object' ||
      encoding === 'other' ||
      typeof schemaEncoding === 'object' ||
      schemaEncoding === 'other'
    ) {
      return undefined; // Cannot be validated
    }
    return (COMPATIBLE_SCHEMA_ENCODINGS[encoding] ?? []).includes(schemaEncoding);
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
  /** Key under which the schema's definition is stored as a data blob. */
  toDataBlobKey(schemaId: DataTrackSchemaId): DataBlobKey {
    return new DataBlobKey({
      key: { case: 'schemaId', value: DataTrackSchemaId.toProtobuf(schemaId) },
    });
  },
};

export enum DataTrackSchemaErrorReason {
  /** Frame encoding is required when providing a schema ID. */
  MissingFrameEncoding = 0,

  /** Schema ID is required for a frame encoding that is not self-describing. */
  MissingSchemaId = 1,

  /** Specified schema and frame encodings are incompatible. */
  Incompatible = 2,

  /** The 'other' encoding represents an unrecognized encoding on received tracks
   * and cannot be used when publishing. */
  OtherEncoding = 3,
}

export class DataTrackSchemaError<
  Reason extends DataTrackSchemaErrorReason = DataTrackSchemaErrorReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackSchemaError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason) {
    super(23, message);
    this.reason = reason;
    this.reasonName = DataTrackSchemaErrorReason[reason];
  }

  static missingFrameEncoding() {
    return new DataTrackSchemaError(
      'Frame encoding is required when providing schema ID',
      DataTrackSchemaErrorReason.MissingFrameEncoding,
    );
  }

  static missingSchemaId() {
    return new DataTrackSchemaError(
      'Schema ID is required for frame encoding that is not self-describing',
      DataTrackSchemaErrorReason.MissingSchemaId,
    );
  }

  static incompatible() {
    return new DataTrackSchemaError(
      'Specified schema and frame encodings are incompatible',
      DataTrackSchemaErrorReason.Incompatible,
    );
  }

  static otherEncoding() {
    return new DataTrackSchemaError(
      "The 'other' encoding cannot be used when publishing",
      DataTrackSchemaErrorReason.OtherEncoding,
    );
  }
}

/**
 * Validates that the given frame and schema encodings are compatible.
 *
 * Combinations involving custom encodings cannot be validated and are accepted
 * as-is. The 'other' encoding only represents unrecognized encodings on received
 * tracks and is rejected.
 *
 * @internal
 */
export function validateSchemaMetadata(
  frameEncoding: DataTrackFrameEncoding | undefined,
  schemaEncoding: DataTrackSchemaEncoding | undefined,
): Throws<void, DataTrackSchemaError> {
  if (frameEncoding === 'other' || schemaEncoding === 'other') {
    throw DataTrackSchemaError.otherEncoding();
  }
  if (frameEncoding === undefined) {
    if (schemaEncoding !== undefined) {
      throw DataTrackSchemaError.missingFrameEncoding();
    }
    return; // Not using schema metadata
  }
  if (schemaEncoding === undefined) {
    if (DataTrackFrameEncoding.isSelfDescribing(frameEncoding) === false) {
      throw DataTrackSchemaError.missingSchemaId();
    }
    return;
  }
  if (DataTrackFrameEncoding.isDescribedBy(frameEncoding, schemaEncoding) === false) {
    throw DataTrackSchemaError.incompatible();
  }
}

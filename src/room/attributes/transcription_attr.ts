// This file is auto-generated. Do not edit manually.

const SegmentIdAttribute = {
  key: "lk.segment_id",
  values: [], // Any string value allowed
  default: null,
} as const;

const TranscribedTrackIdAttribute = {
  key: "lk.transcribed_track_id",
  values: [], // Any string value allowed
  default: null,
} as const;

const TranscriptionFinalAttribute = {
  key: "lk.transcription_final",
  values: ["true", "false"],
  default: null,
} as const;

export const TranscriptionAttributesRegistry = [
  SegmentIdAttribute,
  TranscribedTrackIdAttribute,
  TranscriptionFinalAttribute,
] as const;

/**
 * The segment id of the transcription
 */
export type SegmentIdType = string;
/**
 * The associated track id of the transcription
 */
export type TranscribedTrackIdType = string;
/**
 * Whether the transcription is final
 */
export type TranscriptionFinalType = (typeof TranscriptionFinalAttribute.values)[number];

export interface TranscriptionAttributes {
  /**
   * The segment id of the transcription
   */
  [SegmentIdAttribute.key]?: SegmentIdType;
  /**
   * The associated track id of the transcription
   */
  [TranscribedTrackIdAttribute.key]?: TranscribedTrackIdType;
  /**
   * Whether the transcription is final
   */
  [TranscriptionFinalAttribute.key]?: TranscriptionFinalType;
}

/**
 * Parse a raw attribute map into a typed TranscriptionAttributesRegistry
 * @param attributes Raw attribute map (key-value pairs)
 * @returns Typed TranscriptionAttributes
 */
export function parseTranscriptionAttributes(
  attributes: Record<string, string>
): TranscriptionAttributes {
  const result: TranscriptionAttributes = {};

  // First add default values from registry
  for (const attribute of TranscriptionAttributesRegistry) {
    if (attribute.default !== null) {
      result[attribute.key] = attribute.default as any;
    }
  }

  // Then override with provided values
  for (const [key, value] of Object.entries(attributes)) {
    for (const attribute of TranscriptionAttributesRegistry) {
      if (key === attribute.key) {
        // For attributes with allowed values (non-empty array), validate the value
        if (attribute.values.length > 0 && !(attribute.values as readonly string[]).includes(value)) {
          // Skip invalid values
          continue;
        }
        result[key] = value as any;
        break;
      }
    }
  }

  return result;
}

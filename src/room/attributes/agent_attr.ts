// This file is auto-generated. Do not edit manually.

const AgentStateAttribute = {
  key: "lk.agent.state",
  values: ["initializing", "idle", "listening", "thinking", "speaking"],
  default: "idle",
} as const;

const PublishOnBehalfAttribute = {
  key: "lk.publish_on_behalf",
  values: [], // Any string value allowed
  default: null,
} as const;

export const AgentAttributesRegistry = [
  AgentStateAttribute,
  PublishOnBehalfAttribute,
] as const;

/**
 * Agent connection state
 */
export type AgentStateType = (typeof AgentStateAttribute.values)[number];
/**
 * The identity of the user that the agent is publishing on behalf of
 */
export type PublishOnBehalfType = string;

export interface AgentAttributes {
  /**
   * Agent connection state
   */
  [AgentStateAttribute.key]?: AgentStateType;
  /**
   * The identity of the user that the agent is publishing on behalf of
   */
  [PublishOnBehalfAttribute.key]?: PublishOnBehalfType;
}

/**
 * Parse a raw attribute map into a typed AgentAttributesRegistry
 * @param attributes Raw attribute map (key-value pairs)
 * @returns Typed AgentAttributes
 */
export function parseAgentAttributes(
  attributes: Record<string, string>
): AgentAttributes {
  const result: AgentAttributes = {};

  // First add default values from registry
  for (const attribute of AgentAttributesRegistry) {
    if (attribute.default !== null) {
      result[attribute.key] = attribute.default as any;
    }
  }

  // Then override with provided values
  for (const [key, value] of Object.entries(attributes)) {
    for (const attribute of AgentAttributesRegistry) {
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

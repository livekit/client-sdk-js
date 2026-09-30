export const ACTIONS_ATTRIBUTE = 'lk.actions';
export const ACTION_METHOD_PREFIX = 'action:';
export const DESCRIBE_METHOD = 'lk.actions.describe';
export const ACTION_DECLINED_CODE = 1710;

export interface ActionSummary {
  name: string;
  summary?: string;
}

export interface ActionEntry {
  name: string;
  description: string;
  /** JSON Schema object describing the arguments */
  parameters: Record<string, unknown>;
  consent?: 'none' | 'confirm';
}

export type ActionHandler = (
  args: any,
  ctx: { callerIdentity: string },
) => unknown | Promise<unknown>;

export interface ActionRegistration extends ActionEntry {
  /** one line, published in the catalog attribute */
  summary?: string;
  /** throw an {@link ActionDeclinedError} to decline the call */
  handler: ActionHandler;
}

export interface ActionHandle {
  unregister(): void;
}

export class ActionDeclinedError extends Error {
  constructor(message = 'action declined') {
    super(message);
    this.name = 'ActionDeclinedError';
  }
}

export function parseActions(attributes: Readonly<Record<string, string>>): ActionSummary[] {
  try {
    const parsed = JSON.parse(attributes[ACTIONS_ATTRIBUTE] ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

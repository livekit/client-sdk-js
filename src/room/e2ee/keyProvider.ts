export interface KeyProvider {
  getKey(participantId: string | undefined, index?: number): Uint8Array;
}

export class SharedKeyProvider implements KeyProvider {
  private sharedKey: Uint8Array;

  constructor(sharedKey: Uint8Array) {
    this.sharedKey = sharedKey;
  }

  getKey(): Uint8Array {
    return this.sharedKey;
  }
}

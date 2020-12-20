const separator = '|';

export function unpackTrackId(packed: string): string[] {
  const parts = packed.split(separator);
  if (parts.length > 1) {
    return [parts[0], packed.substr(parts[0].length + 1)];
  }
  return ['', packed];
}

export function unpackDataTrackLabel(packed: string): string[] {
  const parts = packed.split(separator);
  if (parts.length !== 3) {
    return ['', '', ''];
  }
  return [parts[0], parts[1], parts[2]];
}

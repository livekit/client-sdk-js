import { describe, expect, it } from 'vitest';
import { toWebsocketUrl } from './utils';

describe('toWebsocketUrl', () => {
  it('leaves wss urls alone', () => {
    expect(toWebsocketUrl('ws://mywebsite.com')).toEqual('ws://mywebsite.com');
  });

  it('converts https to wss', () => {
    expect(toWebsocketUrl('https://mywebsite.com')).toEqual('wss://mywebsite.com');
  });

  it('does not convert other parts of URL', () => {
    expect(toWebsocketUrl('https://httpsmywebsite.com')).toEqual('wss://httpsmywebsite.com');
  });
});

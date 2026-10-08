import { CoreRoom, RoomEvent, rpc } from '../../src/core';

// Build the room class once, at module level. `rpc` requires `dataStreams`, which installs too.
const LightRoom = CoreRoom.with(rpc);

const roomName = `core-demo-${Math.floor(Math.random() * 10_000)}`;

async function main() {
  const [callee, caller] = [new LightRoom(), new LightRoom()];
  callee.registerRpcMethod('greet', async (data) => {
    log(`callee: request from ${data.callerIdentity}: ${data.payload}`);
    return `Hello, ${data.callerIdentity}!`;
  });
  for (const [name, room] of [
    ['callee', callee],
    ['caller', caller],
  ] as const) {
    room.on(RoomEvent.ConnectionStateChanged, (state) => log(`${name}: ${state}`));
    const { token, url } = await getToken(name);
    await room.connect(url, token);
  }

  try {
    const response = await caller.localParticipant.performRpc({
      destinationIdentity: 'callee',
      method: 'greet',
      payload: 'hi',
    });
    log(`caller: response "${response}"`);
  } finally {
    await Promise.all([caller.dispose(), callee.dispose()]);
  }
}

async function getToken(identity: string): Promise<{ token: string; url: string }> {
  const response = await fetch('/api/get-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, roomName }),
  });
  return response.json();
}

function log(message: string) {
  const logArea = document.getElementById('log') as HTMLTextAreaElement;
  logArea.value += `${message}\n`;
  logArea.scrollTop = logArea.scrollHeight;
}

document.getElementById('run-demo')?.addEventListener('click', () => {
  main().catch((error) => log(`error: ${error instanceof Error ? error.message : error}`));
});

import {
  type RemoteParticipant,
  Room,
  type RoomConnectOptions,
  RoomEvent,
  RpcError,
} from '../../src/index';

let startTime: number;

async function main() {
  startTime = Date.now();
  const logArea = document.getElementById('log') as HTMLTextAreaElement;
  if (logArea) {
    logArea.value = '';
  }

  const roomName = `rpc-demo-${Math.random().toString(36).substring(7)}`;

  console.log(`Connecting participants to room: ${roomName}`);

  const [callersRoom, greetersRoom, mathGeniusRoom] = await Promise.all([
    connectParticipant('caller', roomName),
    connectParticipant('greeter', roomName),
    connectParticipant('math-genius', roomName),
  ]);

  console.log('All participants connected and found each other.');

  await registerReceiverMethods(greetersRoom, mathGeniusRoom);

  try {
    console.log('\n\nRunning greeting example...');
    await Promise.all([performGreeting(callersRoom)]);
  } catch (error) {
    console.error('Error:', error);
  }

  try {
    console.log('\n\nRunning error handling example...');
    await Promise.all([performDivision(callersRoom)]);
  } catch (error) {
    console.error('Error:', error);
  }

  try {
    console.log('\n\nRunning math example...');
    await Promise.all([
      performSquareRoot(callersRoom)
        .then(() => new Promise<void>((resolve) => setTimeout(resolve, 2000)))
        .then(() => performQuantumHypergeometricSeries(callersRoom)),
    ]);
  } catch (error) {
    console.error('Error:', error);
  }

  try {
    console.log('\n\nRunning disconnection example...');
    const disconnectionAfterPromise = disconnectAfter(greetersRoom, 1000);
    const disconnectionRpcPromise = performDisconnection(callersRoom);

    await Promise.all([disconnectionAfterPromise, disconnectionRpcPromise]);
  } catch (error) {
    console.error('Unexpected error:', error);
  }

  console.log('participants done, disconnecting');
  await Promise.all([
    callersRoom.disconnect(),
    greetersRoom.disconnect(),
    mathGeniusRoom.disconnect(),
  ]);

  console.log('\n\nParticipants disconnected. Example completed.');
}

const registerReceiverMethods = async (greetersRoom: Room, mathGeniusRoom: Room): Promise<void> => {
  await greetersRoom.localParticipant?.registerRpcMethod(
    'arrival',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (
      requestId: string,
      caller: RemoteParticipant,
      payload: string,
      responseTimeoutMs: number,
    ) => {
      console.log(`[Greeter] Oh ${caller.identity} arrived and said "${payload}"`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return 'Welcome and have a wonderful day!';
    },
  );

  await mathGeniusRoom.localParticipant?.registerRpcMethod(
    'square-root',
    async (
      requestId: string,
      caller: RemoteParticipant,
      payload: string,
      responseTimeoutMs: number,
    ) => {
      const jsonData = JSON.parse(payload);
      const number = jsonData.number;
      console.log(
        `[Math Genius] I guess ${caller.identity} wants the square root of ${number}. I've only got ${responseTimeoutMs / 1000} seconds to respond but I think I can pull it off.`,
      );

      console.log(`[Math Genius] *doing math*…`);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const result = Math.sqrt(number);
      console.log(`[Math Genius] Aha! It's ${result}`);
      return JSON.stringify({ result });
    },
  );

  await mathGeniusRoom.localParticipant?.registerRpcMethod(
    'divide',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (
      requestId: string,
      caller: RemoteParticipant,
      payload: string,
      responseTimeoutMs: number,
    ) => {
      const jsonData = JSON.parse(payload);
      const { numerator, denominator } = jsonData;

      console.log(
        `[Math Genius] ${caller.identity} wants to divide ${numerator} by ${denominator}. Let me think...`,
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (denominator === 0) {
        throw new Error('Cannot divide by zero');
      }

      const result = numerator / denominator;
      console.log(`[Math Genius] ${numerator} / ${denominator} = ${result}`);
      return JSON.stringify({ result });
    },
  );
};

const performGreeting = async (room: Room): Promise<void> => {
  console.log("[Caller] Letting the greeter know that I've arrived");
  try {
    const response = await room.localParticipant!.performRpc('greeter', 'arrival', 'Hello');
    console.log(`[Caller] That's nice, the greeter said: "${response}"`);
  } catch (error) {
    console.error('[Caller] RPC call failed:', error);
    throw error;
  }
};

const performDisconnection = async (room: Room): Promise<void> => {
  console.log('[Caller] Checking back in on the greeter...');
  try {
    const response = await room.localParticipant!.performRpc(
      'greeter',
      'arrival',
      'You still there?',
    );
    console.log(`[Caller] That's nice, the greeter said: "${response}"`);
  } catch (error) {
    if (error instanceof RpcError && error.code === RpcError.ErrorCode.RECIPIENT_DISCONNECTED) {
      console.log('[Caller] The greeter disconnected during the request.');
    } else {
      console.error('[Caller] Unexpected error:', error);
      throw error;
    }
  }
};

const performSquareRoot = async (room: Room): Promise<void> => {
  console.log("[Caller] What's the square root of 16?");
  try {
    const response = await room.localParticipant!.performRpc(
      'math-genius',
      'square-root',
      JSON.stringify({ number: 16 }),
    );
    const parsedResponse = JSON.parse(response);
    console.log(`[Caller] Nice, the answer was ${parsedResponse.result}`);
  } catch (error) {
    console.error('[Caller] RPC call failed:', error);
    throw error;
  }
};

const performQuantumHypergeometricSeries = async (room: Room): Promise<void> => {
  console.log("[Caller] What's the quantum hypergeometric series of 42?");
  try {
    const response = await room.localParticipant!.performRpc(
      'math-genius',
      'quantum-hypergeometric-series',
      JSON.stringify({ number: 42 }),
    );
    const parsedResponse = JSON.parse(response);
    console.log(`[Caller] genius says ${parsedResponse.result}!`);
  } catch (error) {
    if (error instanceof RpcError) {
      if (error.code === RpcError.ErrorCode.UNSUPPORTED_METHOD) {
        console.log(`[Caller] Aww looks like the genius doesn't know that one.`);
        return;
      }
    }

    console.error('[Caller] Unexpected error:', error);
    throw error;
  }
};

const performDivision = async (room: Room): Promise<void> => {
  console.log("[Caller] Let's try dividing 10 by 0");
  try {
    const response = await room.localParticipant!.performRpc(
      'math-genius',
      'divide',
      JSON.stringify({ numerator: 10, denominator: 0 }),
    );
    const parsedResponse = JSON.parse(response);
    console.log(`[Caller] The result is ${parsedResponse.result}`);
  } catch (error) {
    if (error instanceof RpcError) {
      if (error.code === RpcError.ErrorCode.APPLICATION_ERROR) {
        console.log(`[Caller] Oops! I guess that didn't work. Let's try something else.`);
      } else {
        console.error('[Caller] Unexpected RPC error:', error);
      }
    } else {
      console.error('[Caller] Unexpected error:', error);
    }
  }
};
const connectParticipant = async (identity: string, roomName: string): Promise<Room> => {
  const room = new Room();
  const { token, url } = await fetchToken(identity, roomName);

  room.on(RoomEvent.Disconnected, () => {
    console.log(`[${identity}] Disconnected from room`);
  });

  await room.connect(url, token, {
    autoSubscribe: true,
  } as RoomConnectOptions);

  await new Promise<void>((resolve) => {
    if (room.state === 'connected') {
      resolve();
    } else {
      room.once(RoomEvent.Connected, () => resolve());
    }
  });

  let remoteParticipants = room.remoteParticipants.size;

  console.log(`[${identity}] I see ${remoteParticipants} others.`);

  if (remoteParticipants < 2) {
    await new Promise<void>((resolve) => {
      const checkParticipants = () => {
        const newRemoteParticipants = room.remoteParticipants.size;
        if (newRemoteParticipants > remoteParticipants) {
          console.log(`[${identity}] I see ${newRemoteParticipants} others.`);
        }
        remoteParticipants = newRemoteParticipants;
        if (remoteParticipants >= 2) {
          resolve();
        } else {
          setTimeout(checkParticipants, 100);
        }
      };
      checkParticipants();
    });
  }

  console.log(`[${identity}] Fully connected!`);

  return room;
};

const fetchToken = async (
  identity: string,
  roomName: string,
): Promise<{ token: string; url: string }> => {
  const response = await fetch('/api/get-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ identity, roomName }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch token');
  }

  const data = await response.json();
  return { token: data.token, url: data.url };
};

(window as any).runRpcDemo = main;

const logToUI = (message: string) => {
  const logArea = document.getElementById('log') as HTMLTextAreaElement;
  logArea.value += message + '\n';
  logArea.scrollTop = logArea.scrollHeight;
};

const originalConsoleLog = console.log;
console.log = (...args) => {
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(3);
  const formattedMessage = `[+${elapsedTime}s] ${args.join(' ')}`;
  originalConsoleLog.apply(console, [formattedMessage]);
  logToUI(formattedMessage);
};

const originalConsoleError = console.error;
console.error = (...args) => {
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(3);
  const formattedMessage = `[+${elapsedTime}s] ERROR: ${args.join(' ')}`;
  originalConsoleError.apply(console, [formattedMessage]);
  logToUI(formattedMessage);
};

document.addEventListener('DOMContentLoaded', () => {
  const runDemoButton = document.getElementById('run-demo') as HTMLButtonElement;
  if (runDemoButton) {
    runDemoButton.addEventListener('click', async () => {
      runDemoButton.disabled = true;
      await (window as any).runRpcDemo();
      runDemoButton.disabled = false;
    });
  }
});

const disconnectAfter = async (room: Room, delay: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, delay));
  await room.disconnect();
};

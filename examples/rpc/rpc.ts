import { Room, RpcError } from '@livekit/rtc-node';
import type { RemoteParticipant } from '@livekit/rtc-node';
import { randomBytes } from 'crypto';
import { config } from 'dotenv';
import { AccessToken } from 'livekit-server-sdk';

config({ path: '.env.local', override: false });
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
  throw new Error('Missing required environment variables. Please check your .env.local file.');
}

async function main() {
  const roomName = `rpc-test-${randomBytes(4).toString('hex')}`;

  console.log(`Connecting participants to room: ${roomName}`);

  const [callersRoom, greetersRoom, mathGeniusRoom] = await Promise.all([
    connectParticipant('caller', roomName),
    connectParticipant('greeter', roomName),
    connectParticipant('math-genius', roomName),
  ]);

  // Register all methods for the receiving participant
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

  console.log('\n\nParticipants done, disconnecting...');
  await callersRoom.disconnect();
  await greetersRoom.disconnect();
  await mathGeniusRoom.disconnect();

  console.log('Participants disconnected. Example completed.');

  process.exit(0);
}

const registerReceiverMethods = async (greetersRoom: Room, mathGeniusRoom: Room): Promise<void> => {
  await greetersRoom.localParticipant?.registerRpcMethod(
    'arrival',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (requestId: string, caller: RemoteParticipant, payload: string, responseTimeoutMs: number) => {
      console.log(`[Greeter] Oh ${caller.identity} arrived and said "${payload}"`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return "Welcome and have a wonderful day!";
    },
  );

  await mathGeniusRoom.localParticipant?.registerRpcMethod(
    'square-root',
    async (requestId: string, caller: RemoteParticipant, payload: string, responseTimeoutMs: number) => {
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
    async (requestId: string, caller: RemoteParticipant, payload: string, responseTimeoutMs: number) => {
      const jsonData = JSON.parse(payload);
      const { numerator, denominator } = jsonData;
      console.log(
        `[Math Genius] ${caller.identity} wants to divide ${numerator} by ${denominator}. This could be interesting...`,
      );

      if (denominator === 0) {
        console.log(`[Math Genius] Uh oh, divide by zero! This won't end well...`);
        throw new Error('Cannot divide by zero');
      }

      const result = numerator / denominator;
      console.log(`[Math Genius] The result is ${result}`);
      return JSON.stringify({ result });
    },
  );
};

const performGreeting = async (room: Room): Promise<void> => {
  console.log('[Caller] Letting the greeter know that I\'ve arrived');
  try {
    const response = await room.localParticipant!.performRpc('greeter', 'arrival', 'Hello');
    console.log(`[Caller] That's nice, the greeter said: "${response}"`);
  } catch (error) {
    console.error('[Caller] RPC call failed:', error);
    throw error;
  }
};

const performSquareRoot = async (room: Room): Promise<void> => {
  console.log("[Caller] What's the square root of 16?");
  try {
    const response = await room.localParticipant!.performRpc('math-genius', 'square-root', JSON.stringify({ number: 16 }));
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
      JSON.stringify({ number: 42 })
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
      JSON.stringify({ numerator: 10, denominator: 0 })
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

const createToken = (identity: string, roomName: string) => {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });
  return token.toJwt();
};

const connectParticipant = async (identity: string, roomName: string): Promise<Room> => {
  const room = new Room();
  const token = await createToken(identity, roomName);

  room.on('disconnected', () => {
    console.log(`[${identity}] Disconnected from room`);
  });

  await room.connect(LIVEKIT_URL, token);

  await Promise.race([
    new Promise<void>((resolve) => {
      if (room.remoteParticipants.size > 0) {
        resolve();
      } else {
        const onParticipantConnected = () => {
          room.off('participantConnected', onParticipantConnected);
          resolve();
        };
        room.on('participantConnected', onParticipantConnected);
      }
    }),
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Timed out waiting for participants')), 5000);
    }),
  ]);

  return room;
};

main();

import type { CoreRoom } from '../CoreRoom';
import type { ExtensionContext, LocalApiProvider, RoomExtension } from '../extensions';
import type { RpcRoomApi } from './extension';
import { rpc } from './extension';

/**
 * The deprecated rpc methods on the local participant.
 * @experimental
 */
export interface RpcLegacyLocalApi {
  /**
   * @deprecated use `room.registerRpcMethod` instead
   */
  registerRpcMethod: RpcRoomApi['registerRpcMethod'];

  /**
   * @deprecated use `room.unregisterRpcMethod` instead
   */
  unregisterRpcMethod: RpcRoomApi['unregisterRpcMethod'];
}

/**
 * `localParticipant.registerRpcMethod` and `unregisterRpcMethod`, which forward to the room.
 * Superseded by the room methods; the full `Room` keeps them, the core entry does not offer them.
 */
export const rpcLegacy = {
  key: /* @__PURE__ */ Symbol('lk.extension.rpcLegacy'),
  requires: [rpc] as const,
  install(_room: CoreRoom, ctx: ExtensionContext): LocalApiProvider<RpcLegacyLocalApi> {
    const { registerRpcMethod, unregisterRpcMethod } = ctx.get(rpc).room;
    return { localParticipant: { registerRpcMethod, unregisterRpcMethod } };
  },
} satisfies RoomExtension<{}, RpcLegacyLocalApi>;

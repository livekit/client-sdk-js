import type { CoreRoom } from '../CoreRoom';
import type { ExtensionContext, ExtensionResult, RoomExtension } from '../extensions';

/** Methods the legacy `chat` extension adds to the local participant. */
export interface MyExtensionRoomAPI {
  testExtension(text: string): Promise<string>;
}

export const myExtension = {
  key: /* @__PURE__ */ Symbol('test'),
  install(room: CoreRoom, ctx: ExtensionContext): ExtensionResult<{}, MyExtensionRoomAPI> {
    return {
      local: {
        testExtension: async (text) => {
          console.log(text);
          return `${text} processed`;
        },
      },
    };
  },
} satisfies RoomExtension<{}, MyExtensionRoomAPI>;

const SerializerSymbol = Symbol.for('lk.serializer');

/**
 * A bidirectional data format descriptor for message payloads.
 *
 * - `parse(raw)` decodes an incoming wire string into `Input` (used by handlers)
 * - `serialize(val)` encodes an `Output` value to a wire string (used by handlers)
 *
 * For symmetric serializers (`serializers.raw`), `Input === Output === string`.
 * For `serializers.json`, both default to `any` so each handler can annotate its own types.
 * Use `serializers.custom` to supply your own `parse`/`serialize` pair.
 *
 * @beta
 */
export type Serializer<Input, Output> = {
  symbol: typeof SerializerSymbol;
  parse: (raw: string) => Input;
  serialize: (val: Output) => string;
};

export function isSerializer(v: unknown): v is Serializer<any, any> {
  return typeof v === 'object' && v !== null && 'symbol' in v && v.symbol === SerializerSymbol;
}

export type SerializerInput<S> = S extends Serializer<infer Input, any> ? Input : any;
export type SerializerOutput<S> = S extends Serializer<any, infer Output> ? Output : any;

/** @internal */
function base<Input = any, Output = any>(
  params: Omit<Serializer<Input, Output>, 'symbol'>,
): Serializer<Input, Output> {
  return { ...params, symbol: SerializerSymbol };
}

/**
 * JSON serializer — `JSON.parse` on the way in, `JSON.stringify` on the way out.
 * Defaults to `any` so individual handlers can annotate their own payload types.
 */
function json<Input = any, Output = any>(): Serializer<Input, Output> {
  return base({
    parse: (rawString: string) => JSON.parse(rawString) as Input,
    serialize: (val: unknown) => JSON.stringify(val),
  });
}

/** Raw string serializer — passes payloads through as plain strings with no encoding. */
function raw() {
  return base({
    parse: (rawString: string) => rawString,
    serialize: (val: string) => val,
  });
}

/** Custom serializer - allows custom defined parse and serialize functions */
function custom<Input = any, Output = any>(
  params: Omit<Serializer<Input, Output>, 'symbol'>,
): Serializer<Input, Output> {
  return base(params);
}

/**
 * Serializer helpers for message payload encoding.
 *
 * @example
 * ```ts
 * const a = serializers.raw(); // Serializer<string, string>
 * const b = serializer.json<{ foo: string }, { bar: string }>(); // Serializer<{ foo: string }, { bar: string }>
 * ```
 *
 * @beta
 */
export const serializers = { json, raw, custom };

# throws-transformer

A TypeScript transformer that enforces error handling via branded `Throws<T, E>` types.

## The Problem

TypeScript doesn't have checked exceptions. When you call a function, you have no compile-time knowledge of what errors it might throw:

```typescript
function parseJSON(input: string): User {
  return JSON.parse(input); // Can throw SyntaxError - nothing tells you!
}
```

## The Solution

This transformer introduces a `Throws<T, E>` branded type that encodes possible errors in the return type:

```typescript
function parseJSON(input: string): Throws<User, SyntaxError> {
  // ...
}
```

The transformer then enforces that callers either:

1. **Catch** the declared errors, or
2. **Propagate** them by declaring them in their own return type

The `Throws<T, E>` type is entirely opt in - ie, if a function doesn't return a branded type or call
functions within that return a branded type, the check will pass. This makes gradual migration
possible.

If you have a situation where you would like to throw inside of a function annotated with a `Throws`
type and don't want this throw to be part of the `Throws` branded type (for example: throwing plain
`Error`s for assertion type cases that should result in "panic"s), you can add a
`// @throws-transformer ignore` comment above and the checker will skip validating the given throw.

For example:
```typescript
// The below should validate successfully.
function parseJSON(input: string): Throws<User, SyntaxError /* Note - no `Error` here. */> {
    if (input.length === 0) {
        // @throws-transformer ignore
        throw new Error('Assertion failed, input was not empty.');
    }

    // ...
}
```


## VS Code Setup (Recommended)

To get real-time error squiggles in VS Code:

### Step 1: Configure tsconfig.json

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "./throws-transformer/plugin.ts" }]
  }
}
```

### Step 2: Configure VS Code to use workspace TypeScript

Create or update `.vscode/settings.json`:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

### Step 3: Select TypeScript version

1. Open any `.ts` file
2. Click the TypeScript version in the bottom-right status bar (e.g., "TypeScript 5.0.0")
3. Select "Use Workspace Version"

Or run the command: `TypeScript: Select TypeScript Version...`

### Step 4: Restart the TypeScript server

Run command: `TypeScript: Restart TS Server`

You should now see red squiggles for unhandled `Throws` errors!

## Build-time Errors with ts-patch

For errors during `tsc` compilation (CI, build scripts):

```bash
npm install ts-patch
npx ts-patch install
```

Add the transformer to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "./throws-transformer/plugin.ts" },
      {
        "name": "throws-transformer/transformer",
        "transform": "./throws-transformer/transformer.ts"
      }
    ]
  }
}
```

Now `tsc` will emit errors for unhandled throws.

## CLI Checker

For quick checks without modifying your build:

```bash
# Check specific files
npx tsx ./throws-transformer/cli.ts src/myfile.ts

# Check multiple files
npx tsx ./throws-transformer/cli.ts src/*.ts
```

## Usage

### 1. Define your functions with `Throws<T, E>`

```typescript
import { Throws } from "./src/utils/throws";

export class NetworkError extends Error {}
export class NotFoundError extends Error {}

function fetchUser(id: string): Throws<User, NetworkError | NotFoundError> {
  if (!id) throw new NotFoundError();
  // ... fetch logic that might throw NetworkError
  return user;
}
```

### 2. Handle or propagate the errors

The checker will report unhandled errors:

```
Unhandled error(s) from 'fetchUser': NetworkError | NotFoundError.
Catch these errors or add 'Throws<..., NetworkError | NotFoundError>' to your function's return type.
```

## Handling Patterns

### Pattern 1: Catch and Handle

```typescript
function getUserName(id: string): string | null {
  try {
    const user = fetchUser(id);
    return user.name;
  } catch (e) {
    if (e instanceof NetworkError) {
      console.error("Network failed");
      return null;
    }
    if (e instanceof NotFoundError) {
      console.error("User not found");
      return null;
    }
    throw e; // Re-throw unknown errors
  }
}
```

### Pattern 2: Propagate in Return Type

```typescript
function fetchAndValidate(
  id: string,
): Throws<ValidatedUser, NetworkError | NotFoundError | ValidationError> {
  const user = fetchUser(id); // NetworkError | NotFoundError propagated
  const validated = validateUser(user); // ValidationError propagated
  return validated;
}
```

### Pattern 3: Partial Handling

```typescript
function fetchWithFallback(id: string): Throws<User, NetworkError> {
  try {
    return fetchUser(id);
  } catch (e) {
    if (e instanceof NotFoundError) {
      return getDefaultUser(); // Handle NotFoundError locally
    }
    throw e; // NetworkError is propagated (declared in return type)
  }
}
```

## Async Functions

Works with `Promise<Throws<T, E>>`:

```typescript
async function fetchUserAsync(id: string): Promise<Throws<User, NetworkError>> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new NetworkError();
  return res.json();
}

// ❌ Error: Unhandled NetworkError
async function getName(id: string): Promise<string> {
  const user = await fetchUserAsync(id);
  return user.name;
}

// ✅ OK: Error is handled
async function getNameSafe(id: string): Promise<string | null> {
  try {
    const user = await fetchUserAsync(id);
    return user.name;
  } catch (e) {
    if (e instanceof NetworkError) return null;
    throw e;
  }
}
```

## API

### Types

```typescript
// Brand a return type with possible errors
type Throws<T, E extends Error = never> = T & { readonly __throws?: E };

// Extract error types from a Throws type
type ExtractErrors<T> = T extends Throws<any, infer E> ? E : never;

// Extract success type from a Throws type
type ExtractSuccess<T> = T extends Throws<infer S, any> ? S : T;
```

## Troubleshooting

### Errors not showing in VS Code

1. Make sure you selected "Use Workspace Version" for TypeScript
2. Run `TypeScript: Restart TS Server`
3. Check the TypeScript output panel for plugin initialization messages

## Limitations

1. **Third-party libraries**: Only works with functions that use `Throws<>` annotations
2. **Dynamic throws**: Static analysis only - can't detect runtime-conditional throws
3. **VS Code only**: The language service plugin is VS Code specific (other editors may vary)

import * as ts from "typescript";
import { checkSourceFile } from "./engine";

/**
 * TypeScript Transformer that enforces handling of declared thrown errors.
 *
 * This transformer:
 * 1. Finds all call expressions
 * 2. Checks if the called function returns Throws<T, E>
 * 3. Extracts the error types E
 * 4. Verifies the call is either:
 *    a) Inside a try-catch that handles those error types
 *    b) Inside a function that propagates those error types in its return type
 * 5. Emits diagnostics for unhandled errors
 *
 * Usage with ts-patch:
 *   // tsconfig.json
 *   {
 *     "compilerOptions": {
 *       "plugins": [{ "transform": "./transformer.ts" }]
 *     }
 *   }
 */

interface TransformerConfig {
  // If true, also warn about partial handling in catch blocks
  strictCatchHandling?: boolean;
}

/**
 * Create the transformer factory.
 */
export default function transformer(
  program: ts.Program,
  config?: TransformerConfig,
): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => {
    return (sourceFile: ts.SourceFile) => {
      const checker = program.getTypeChecker();
      const results = checkSourceFile(sourceFile, checker);

      const diagnostics = results.flatMap((result): ts.Diagnostic => ({
        file: result.sourceFile,
        start: result.start,
        length: result.length,
        messageText: result.message,
        category: ts.DiagnosticCategory.Error,
        code: 90001, // Custom error code
      }));

      // Report diagnostics
      for (const diagnostic of diagnostics) {
        reportDiagnostic(diagnostic);
      }

      // Return unchanged source file (we only emit diagnostics)
      return sourceFile;
    };
  };
}

/**
 * Report a diagnostic to the console (in a real implementation,
 * this would integrate with ts-patch's diagnostic system).
 */
function reportDiagnostic(diagnostic: ts.Diagnostic): void {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  const file = diagnostic.file;

  if (file && diagnostic.start !== undefined) {
    const { line, character } = file.getLineAndCharacterOfPosition(
      diagnostic.start,
    );
    console.error(
      `${file.fileName}:${line + 1}:${character + 1} - error TS${diagnostic.code}: ${message}`,
    );
  } else {
    console.error(`error TS${diagnostic.code}: ${message}`);
  }
}

// =============================================================================
// Standalone checker (can be run without ts-patch)
// =============================================================================

export function checkFile(
  fileName: string,
  compilerOptions: ts.CompilerOptions = {},
): ts.Diagnostic[] {
  const program = ts.createProgram([fileName], {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    strict: true,
    ...compilerOptions,
  });

  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    throw new Error(`Could not load source file: ${fileName}`);
  }

  const checker = program.getTypeChecker();
  const results = checkSourceFile(sourceFile, checker);

  return results.flatMap((result): ts.Diagnostic => ({
    file: result.sourceFile,
    start: result.start,
    length: result.length,
    messageText: result.message,
    category: ts.DiagnosticCategory.Error,
    code: 90001, // Custom error code
  }));
}

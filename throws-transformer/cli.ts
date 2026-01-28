#!/usr/bin/env tsx
/**
 * CLI tool to check TypeScript files for unhandled Throws errors.
 *
 * Usage:
 *   npx tsx ./throws-transformer/cli.ts 'src/*.ts'
 */

import * as ts from "typescript";
import * as path from "path";
import { sync as globSync } from "glob";
import { checkSourceFile } from "./engine";

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: throws-check <file.ts> [file2.ts ...]");
    console.log("");
    console.log("Checks TypeScript files for unhandled Throws<T, E> errors.");
    process.exit(1);
  }

  // Resolve file paths
  const files = args.flatMap((f) => globSync(f));

  // Find tsconfig.json
  const tsconfigPath = ts.findConfigFile(
    process.cwd(),
    ts.sys.fileExists,
    "tsconfig.json",
  );

  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    strict: true,
    esModuleInterop: true,
  };

  if (tsconfigPath) {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
      console.error(`Error reading tsconfig: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`);
      process.exit(1);
    }
    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(tsconfigPath),
    );
    if (parsedConfig.errors.length > 0) {
      const msg = ts.flattenDiagnosticMessageText(
        parsedConfig.errors[0].messageText,
        "\n",
      );
      console.error(`Error parsing tsconfig: ${msg}`);
      process.exit(1);
    }
    compilerOptions = parsedConfig.options;
  }

  // Create program with all files
  const program = ts.createProgram(files, compilerOptions);
  const checker = program.getTypeChecker();

  let totalErrors = 0;

  for (const fileName of files) {
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) {
      console.error(`Could not load: ${fileName}`);
      continue;
    }

    const results = checkSourceFile(sourceFile, checker);

    for (const result of results) {
      totalErrors++;
      const relativePath = path.relative(process.cwd(), result.sourceFile.fileName);
      console.log(
        `\x1b[31m✗\x1b[0m ${relativePath}:${result.line}:${result.column}`,
      );
      console.log(`  ${result.message}`);
      console.log("");
    }
  }

  if (totalErrors === 0) {
    console.log("\x1b[32m✓\x1b[0m All Throws errors are handled correctly!");
    process.exit(0);
  } else {
    console.log(`\x1b[31mFound ${totalErrors} unhandled error(s)\x1b[0m`);
    process.exit(1);
  }
}

main();

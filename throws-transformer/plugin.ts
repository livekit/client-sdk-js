/**
 * TypeScript Language Service Plugin
 *
 * This plugin runs inside VS Code's TypeScript service and adds
 * diagnostics for unhandled Throws<T, E> errors in real-time.
 *
 * Setup:
 * 1. Add to tsconfig.json:
 *    {
 *      "compilerOptions": {
 *        "plugins": [{ "name": "./throws-transformer/plugin.ts" }]
 *      }
 *    }
 *
 * 2. Tell VS Code to use workspace TypeScript (.vscode/settings.json):
 *    {
 *      "typescript.tsdk": "node_modules/typescript/lib",
 *      "typescript.enablePromptUseWorkspaceTsdk": true
 *    }
 *
 * 3. Restart VS Code or run "TypeScript: Restart TS Server"
 */

import type * as ts from "typescript";
import type { server } from "typescript";
import { checkSourceFile } from "./engine";

const PLUGIN_NAME = "throws-transformer";

function init(modules: {
  typescript: typeof import("typescript");
}): server.PluginModule {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const log = (msg: string) => {
      info.project.projectService.logger.info(`[${PLUGIN_NAME}] ${msg}`);
    };

    log("Plugin initialized");

    // Create a proxy for the language service
    const proxy: ts.LanguageService = Object.create(null);

    // Copy all methods from the original language service
    for (const k of Object.keys(info.languageService) as Array<
      keyof ts.LanguageService
    >) {
      const x = info.languageService[k];
      proxy[k] = typeof x === "function" ? x.bind(info.languageService) : x;
    }

    // Override getSemanticDiagnostics to add our custom diagnostics
    proxy.getSemanticDiagnostics = (fileName: string): ts.Diagnostic[] => {
      const original = info.languageService.getSemanticDiagnostics(fileName);

      try {
        const program = info.languageService.getProgram();
        if (!program) {
          return original;
        }

        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) {
          return original;
        }

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

        return [...original, ...diagnostics];
      } catch (e) {
        log(`Error checking file ${fileName}: ${e}`);
        return original;
      }
    };

    return proxy;
  }

  return { create };
}

export default init;

#!/usr/bin/env tsx
/**
 * CLI tool to check TypeScript files for unhandled Throws errors.
 *
 * Usage:
 *   npx ts-node src/cli.ts src/examples.ts
 *   npx ts-node src/cli.ts "src/*.ts"
 */

import * as ts from "typescript";
import * as path from "path";
import { sync as globSync } from "glob";

// Symbol name for the Throws type brand
const THROWS_BRAND = "__throws";

interface CheckResult {
  sourceFile: ts.SourceFile,

  line: number;
  column: number;
  start: number;
  length: number;

  functionName: string;
  unhandledErrors: string[];
  message: string;
}

export function checkSourceFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): CheckResult[] {
  const results: CheckResult[] = [];

  function visit(node: ts.Node): void {
    // Check regular call expressions
    if (ts.isCallExpression(node)) {
      const result = checkCallExpression(node, sourceFile, checker);
      if (result) {
        results.push(result);
      }
      
      // Also check if this is a Promise.reject() call
      const rejectResult = checkPromiseReject(node, sourceFile, checker);
      if (rejectResult) {
        results.push(rejectResult);
      }
    }

    // Check await expressions
    if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression)) {
      const result = checkCallExpression(node.expression, sourceFile, checker);
      if (result) {
        results.push(result);
      }
    }

    // Check throw statements
    if (ts.isThrowStatement(node)) {
      const result = checkThrowStatement(node, sourceFile, checker);
      if (result) {
        results.push(result);
      }
    }

    // Check return statements for Promise<Throws<T, E>> propagation
    if (ts.isReturnStatement(node) && node.expression) {
      const result = checkReturnStatement(node, sourceFile, checker);
      if (result) {
        results.push(result);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

function checkThrowStatement(
  node: ts.ThrowStatement,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): CheckResult | null {
  const containingFunction = getContainingFunction(node);
  if (!containingFunction) {
    return null;
  }

  // Check if handled by local catch
  if (isHandledByLocalCatch(node, containingFunction)) {
    return null;
  }

  // Get declared error types
  const declaredErrors = getDeclaredErrorTypes(containingFunction, checker);
  if (declaredErrors === null) {
    return null; // Not using Throws<>
  }

  if (!node.expression) {
    return null;
  }

  // Check to see if there is a comment about the throw site starting with "@throws-transformer
  // ignore", and if so, disregard.
  const foundComments = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
  if (foundComments) {
    const foundCommentsText = foundComments.map((info) => {
      return sourceFile
        .text
        .slice(info.pos, info.end)
        .replace(/^(\/\/|\/\*)\s*/ /* Remove leading comment prefix */, '');
    });

    const isIgnoreComment = foundCommentsText.find((commentText) => {
      return commentText.startsWith('@throws-transformer ignore');
    });

    if (isIgnoreComment) {
      return null;
    }
  }

  const thrownType = checker.getTypeAtLocation(node.expression);
  const thrownTypeName = checker.typeToString(thrownType);

  const isAllowed = isErrorTypeDeclared(checker, thrownType, declaredErrors);

  if (!isAllowed) {
    const start = node.getStart();
    const length = node.getWidth();
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
    const declaredNames = declaredErrors
      .map((t) => checker.typeToString(t))
      .join(" | ");

    return {
      sourceFile,

      line: line + 1,
      column: character + 1,
      start,
      length,

      functionName: "<throw>",
      unhandledErrors: [thrownTypeName],
      message: `Throwing '${thrownTypeName}' but it's not declared. Declared: ${declaredNames || "never"}. Add it to Throws<> or catch internally.`,
    };
  }

  return null;
}

function checkPromiseReject(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): CheckResult | null {
  // Check if this is a Promise.reject() call
  if (!isPromiseRejectCall(node)) {
    return null;
  }

  const containingFunction = getContainingFunction(node);
  if (!containingFunction) {
    return null;
  }

  // Check if handled by local catch (or .catch() on the promise)
  const tryCatch = getContainingTryCatch(node);
  if (tryCatch) {
    return null; // Handled by try-catch
  }

  // Get declared error types from the function's return type
  const declaredErrors = getDeclaredErrorTypes(containingFunction, checker);
  if (declaredErrors === null) {
    return null; // Not using Throws<>
  }

  // Get the type of the rejected value
  if (node.arguments.length === 0) {
    return null; // Promise.reject() with no argument
  }

  const rejectedType = checker.getTypeAtLocation(node.arguments[0]);
  const rejectedTypeName = checker.typeToString(rejectedType);

  const isAllowed = isErrorTypeDeclared(checker, rejectedType, declaredErrors);

  if (!isAllowed) {
    const start = node.getStart();
    const length = node.getWidth();
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
    const declaredNames = declaredErrors
      .map((t) => checker.typeToString(t))
      .join(" | ");

    return {
      sourceFile,
      line: line + 1,
      column: character + 1,
      start,
      length,

      functionName: "Promise.reject",
      unhandledErrors: [rejectedTypeName],
      message: `Promise.reject('${rejectedTypeName}') but it's not declared. Declared: ${declaredNames || "never"}. Add it to Throws<> in your return type.`,
    };
  }

  return null;
}

function checkReturnStatement(
  node: ts.ReturnStatement,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): CheckResult | null {
  if (!node.expression) {
    return null;
  }

  const containingFunction = getContainingFunction(node);
  if (!containingFunction) {
    return null;
  }

  // Get the type of the returned expression
  const returnedType = checker.getTypeAtLocation(node.expression);
  
  // Extract error types from the returned value
  const returnedErrors = extractThrowsErrorTypes(returnedType, checker);
  
  if (returnedErrors.length === 0) {
    return null; // No errors in returned value
  }

  // Get declared error types from the function's return type
  const declaredErrors = getDeclaredErrorTypes(containingFunction, checker);
  if (declaredErrors === null) {
    return null; // Not using Throws<>
  }

  // Find errors that are in the returned value but not declared
  const unhandledErrors = returnedErrors.filter((errorType) => {
    return !isErrorTypeDeclared(checker, errorType, declaredErrors);
  });

  if (unhandledErrors.length === 0) {
    return null;
  }

  const start = node.getStart();
  const length = node.getWidth();
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
  const errorNames = unhandledErrors.map((e) => checker.typeToString(e));
  const declaredNames = declaredErrors
    .map((t) => checker.typeToString(t))
    .join(" | ");

  return {
    sourceFile,
    line: line + 1,
    column: character + 1,
    start,
    length,

    functionName: "<return>",
    unhandledErrors: errorNames,
    message: `Returning value with errors [${errorNames.join(" | ")}] but only [${declaredNames || "never"}] declared. Add missing errors to your function's Throws<> return type.`,
  };
}

function isHandledByLocalCatch(
  throwNode: ts.ThrowStatement,
  containingFunction: ts.FunctionLikeDeclaration,
): boolean {
  let current: ts.Node | undefined = throwNode.parent;

  while (current && current !== containingFunction) {
    if (ts.isTryStatement(current)) {
      if (isInTryBlock(throwNode, current)) {
        // Check if catch doesn't re-throw (catch-all)
        const catchClause = current.catchClause;
        if (catchClause && !containsThrowStatement(catchClause.block)) {
          return true;
        }
      }
    }
    current = current.parent;
  }

  return false;
}

function getDeclaredErrorTypes(
  func: ts.FunctionLikeDeclaration,
  checker: ts.TypeChecker,
): ts.Type[] | null {
  if (!func.type) {
    return null;
  }

  const returnType = checker.getTypeFromTypeNode(func.type);
  const throwsProperty = returnType.getProperty(THROWS_BRAND);

  if (!throwsProperty) {
    const promiseType = extractPromiseType(returnType, checker);
    if (promiseType) {
      const innerThrows = promiseType.getProperty(THROWS_BRAND);
      if (!innerThrows) {
        return null;
      }
      return extractThrowsErrorTypes(promiseType, checker);
    }
    return null;
  }

  return extractThrowsErrorTypes(returnType, checker);
}

function checkCallExpression(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): CheckResult | null {
  // Get the return type of the call
  const callType = checker.getTypeAtLocation(node);

  // Extract error types
  const errorTypes = extractThrowsErrorTypes(callType, checker);

  if (errorTypes.length === 0) {
    return null;
  }

  // Check handling
  const containingFunction = getContainingFunction(node);
  const tryCatch = getContainingTryCatch(node);

  const handledErrors = tryCatch
    ? getHandledErrorTypes(tryCatch, checker, node)
    : new Set<string>();

  // If catch-all, everything is handled
  if (handledErrors === "all") {
    return null;
  }

  const propagatedErrors = containingFunction
    ? getPropagatedErrorTypes(containingFunction, checker)
    : new Set<string>();

  // Find unhandled
  const unhandledErrors = errorTypes.filter((errorType) => {
    const errorName = checker.typeToString(errorType);
    return !handledErrors.has(errorName) && !propagatedErrors.has(errorName);
  });

  if (unhandledErrors.length === 0) {
    return null;
  }

  const start = node.getStart();
  const length = node.getWidth();
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
  const functionName = getFunctionName(node);
  const errorNames = unhandledErrors.map((e) => checker.typeToString(e));

  return {
    sourceFile,
    line: line + 1,
    column: character + 1,
    start,
    length,

    functionName,
    unhandledErrors: errorNames,
    message:
      `Unhandled errors from '${functionName}': ${errorNames.join(" | ")}. ` +
      `Catch these errors or add 'Throws<..., ${errorNames.join(" | ")}>' to your return type.`,
  };
}

function extractThrowsErrorTypes(
  type: ts.Type,
  checker: ts.TypeChecker,
): ts.Type[] {
  const errors: ts.Type[] = [];

  // Check for __throws property
  const throwsProperty = type.getProperty(THROWS_BRAND);

  if (!throwsProperty) {
    // Check Promise<Throws<T, E>>
    const promiseType = extractPromiseType(type, checker);
    if (promiseType) {
      return extractThrowsErrorTypes(promiseType, checker);
    }
    return [];
  }

  const declaration = throwsProperty.valueDeclaration;
  if (!declaration) {
    return [];
  }

  const throwsType = checker.getTypeOfSymbolAtLocation(
    throwsProperty,
    declaration,
  );

  if (throwsType.isUnion()) {
    for (const t of throwsType.types) {
      if (!isUndefinedType(t) && !isNeverType(t)) {
        errors.push(t);
      }
    }
  } else if (!isUndefinedType(throwsType) && !isNeverType(throwsType)) {
    errors.push(throwsType);
  }

  return errors;
}

function extractPromiseType(
  type: ts.Type,
  checker: ts.TypeChecker,
): ts.Type | null {
  const symbol = type.getSymbol();
  if (!symbol || symbol.getName() !== "Promise") {
    return null;
  }

  const typeRef = type as ts.TypeReference;
  if (typeRef.typeArguments?.length === 1) {
    return typeRef.typeArguments[0];
  }

  return null;
}

function isErrorTypeDeclared(
  checker: ts.TypeChecker,
  thrownType: ts.Type,
  declaredTypes: ts.Type[],
): boolean {
  // Always allow throwing unknown / any (ie, rethrowing errors)
  if (isAnyOrUnknownType(thrownType)) {
    return true;
  }

  const thrownName = checker.typeToString(thrownType);

  for (const declared of declaredTypes) {
    const declaredName = checker.typeToString(declared);

    // Exact name match
    if (thrownName === declaredName) {
      return true;
    }

    // Check if thrown type extends the declared type
    const baseTypes = getBaseTypes(checker, thrownType);
    if (baseTypes.some((base) => checker.typeToString(base) === declaredName)) {
      return true;
    }
  }

  return false;
}

function getBaseTypes(checker: ts.TypeChecker, type: ts.Type): ts.Type[] {
  const bases: ts.Type[] = [];

  const symbol = type.getSymbol();
  if (!symbol) {
    return bases;
  }

  const declarations = symbol.getDeclarations();
  if (!declarations) {
    return bases;
  }

  for (const decl of declarations) {
    if (ts.isClassDeclaration(decl) && decl.heritageClauses) {
      for (const heritage of decl.heritageClauses) {
        if (heritage.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const typeNode of heritage.types) {
            const baseType = checker.getTypeAtLocation(typeNode);
            bases.push(baseType);
            bases.push(...getBaseTypes(checker, baseType));
          }
        }
      }
    }
  }

  return bases;
}

function isNeverType(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.Never) !== 0;
}

function isUndefinedType(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.Undefined) !== 0;
}

function getContainingFunction(
  node: ts.Node,
): ts.FunctionLikeDeclaration | null {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }

  return null;
}

function getContainingTryCatch(node: ts.Node): ts.TryStatement | null {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isTryStatement(current) && isInTryBlock(node, current)) {
      return current;
    }
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      break;
    }
    current = current.parent;
  }

  return null;
}

function isInTryBlock(node: ts.Node, tryStatement: ts.TryStatement): boolean {
  let current: ts.Node | undefined = node;

  while (current && current !== tryStatement) {
    if (current === tryStatement.tryBlock) {
      return true;
    }
    if (
      current === tryStatement.catchClause ||
      current === tryStatement.finallyBlock
    ) {
      return false;
    }
    current = current.parent;
  }

  return false;
}

function getHandledErrorTypes(
  tryStatement: ts.TryStatement,
  checker: ts.TypeChecker,
  callNode: ts.Node,
): Set<string> | "all" {
  const handled = new Set<string>();

  const catchClause = tryStatement.catchClause;
  if (!catchClause) {
    return handled;
  }

  // Check if this is a catch-all (no re-throw)
  if (!containsThrowStatement(catchClause.block)) {
    return "all";
  }

  // If there's re-throwing, use type narrowing to find handled types
  if (!catchClause.variableDeclaration) {
    return handled;
  }

  const narrowedTypes = findNarrowedErrorTypes(
    catchClause.block,
    catchClause.variableDeclaration,
    checker,
    callNode,
  );

  for (const type of narrowedTypes) {
    handled.add(checker.typeToString(type));
  }

  return handled;
}

/**
 * Check if a block contains a throw statement (indicating re-throwing).
 */
function containsThrowStatement(block: ts.Block): boolean {
  let hasThrow = false;

  function visit(node: ts.Node): void {
    if (hasThrow) { return; }

    if (ts.isThrowStatement(node)) {
      hasThrow = true;
      return;
    }

    // Don't recurse into nested functions - their throws don't count
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(block);
  return hasThrow;
}

/**
 * Find error types that are narrowed in the catch block using TypeScript's type narrowing.
 * This supports instanceof checks, type predicates, and other type guards.
 */
function findNarrowedErrorTypes(
  block: ts.Block,
  errorVar: ts.VariableDeclaration,
  checker: ts.TypeChecker,
  originalCallNode: ts.Node,
): ts.Type[] {
  const narrowedTypes: ts.Type[] = [];
  const errorVarName = errorVar.name.getText();

  /**
   * Analyze if-statements to find type narrowing branches that don't re-throw.
   * These represent error types that are handled.
   */
  function visitIfStatement(ifStmt: ts.IfStatement): void {
    // Get the type of the error variable after the type guard in the if condition
    // const condition = ifStmt.expression;
    
    // Check if the then-block handles the error (doesn't re-throw)
    const thenStatement = ifStmt.thenStatement;
    const thenRethrows = ts.isBlock(thenStatement)
      ? containsThrowStatement(thenStatement)
      : ts.isThrowStatement(thenStatement);
    
    if (thenRethrows) {
      // Get narrowed type in the then-block
      const narrowedType = getNarrowedTypeInBlock(
        thenStatement,
        errorVarName,
        checker,
      );
      
      if (narrowedType && !isAnyOrUnknownType(narrowedType)) {
        // For union types, add each constituent type
        if (narrowedType.isUnion()) {
          narrowedTypes.push(...narrowedType.types.filter(t => !isAnyOrUnknownType(t)));
        } else {
          narrowedTypes.push(narrowedType);
        }
      }
    }

    // Check else-if and else branches
    if (ifStmt.elseStatement) {
      if (ts.isIfStatement(ifStmt.elseStatement)) {
        visitIfStatement(ifStmt.elseStatement);
      } else {
        const elseHandles = ts.isBlock(ifStmt.elseStatement)
          ? !containsThrowStatement(ifStmt.elseStatement)
          : !ts.isThrowStatement(ifStmt.elseStatement);
          
        if (elseHandles) {
          const narrowedType = getNarrowedTypeInBlock(
            ifStmt.elseStatement,
            errorVarName,
            checker,
          );
          if (narrowedType && !isAnyOrUnknownType(narrowedType)) {
            if (narrowedType.isUnion()) {
              narrowedTypes.push(...narrowedType.types.filter(t => !isAnyOrUnknownType(t)));
            } else {
              narrowedTypes.push(narrowedType);
            }
          }
        }
      }
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isIfStatement(node)) {
      visitIfStatement(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(block);
  
  // If no narrowed types found but we found type guards with instanceof,
  // fall back to the old method for backwards compatibility
  if (narrowedTypes.length === 0) {
    const instanceofTypes = findInstanceofChecks(block, errorVar);
    for (const typeExpr of instanceofTypes) {
      const type = checker.getTypeAtLocation(typeExpr);
      if (!isAnyOrUnknownType(type)) {
        narrowedTypes.push(type);
      }
    }
  }

  return narrowedTypes;
}

/**
 * Get the narrowed type of a variable within a specific block by finding
 * the first reference to it and checking its type at that location.
 */
function getNarrowedTypeInBlock(
  block: ts.Node,
  varName: string,
  checker: ts.TypeChecker,
): ts.Type | null {
  let foundType: ts.Type | null = null;

  function visit(node: ts.Node): void {
    if (foundType) { return; }

    // Look for references to the error variable
    if (ts.isIdentifier(node) && node.text === varName) {
      // Get the type at this location (after narrowing)
      const type = checker.getTypeAtLocation(node);
      if (!isAnyOrUnknownType(type)) {
        foundType = type;
      }
    }

    // Don't recurse into nested functions
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(block);
  return foundType;
}

/**
 * Check if a type is any or unknown (which we should ignore for error handling).
 */
function isAnyOrUnknownType(type: ts.Type): boolean {
  return (
    (type.flags & ts.TypeFlags.Any) !== 0 ||
    (type.flags & ts.TypeFlags.Unknown) !== 0
  );
}

/**
 * Legacy function kept for backwards compatibility.
 * Finds instanceof checks in the catch block.
 */
function findInstanceofChecks(
  block: ts.Block,
  errorVar: ts.VariableDeclaration,
): ts.Expression[] {
  const checks: ts.Expression[] = [];
  const errorVarName = errorVar.name.getText();

  function visit(node: ts.Node): void {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword
    ) {
      if (ts.isIdentifier(node.left) && node.left.text === errorVarName) {
        checks.push(node.right);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(block);
  return checks;
}

function getPropagatedErrorTypes(
  func: ts.FunctionLikeDeclaration,
  checker: ts.TypeChecker,
): Set<string> {
  const propagated = new Set<string>();

  if (!func.type) { return propagated; }

  const returnType = checker.getTypeFromTypeNode(func.type);
  const errorTypes = extractThrowsErrorTypes(returnType, checker);

  for (const errorType of errorTypes) {
    propagated.add(checker.typeToString(errorType));
  }

  return propagated;
}

function getFunctionName(node: ts.CallExpression): string {
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text;
  }
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text;
  }
  return "<anonymous>";
}

function isPromiseRejectCall(node: ts.CallExpression): boolean {
  // Check for Promise.reject()
  if (ts.isPropertyAccessExpression(node.expression)) {
    const expr = node.expression;
    if (
      ts.isIdentifier(expr.expression) &&
      expr.expression.text === "Promise" &&
      ts.isIdentifier(expr.name) &&
      expr.name.text === "reject"
    ) {
      return true;
    }
  }
  return false;
}

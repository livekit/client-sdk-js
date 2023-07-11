/**
 * ensure that the method isn’t re-bound if it is called as a stand-alone function or passed as a callback.
 * @see https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/#decorators
 * @param _originalMethod
 * @param context
 */
export function bound(_originalMethod: any, context: ClassMethodDecoratorContext) {
  const methodName = context.name;
  if (context.private) {
    throw new Error(`'bound' cannot decorate private properties like ${methodName as string}.`);
  }
  context.addInitializer(function () {
    // @ts-expect-error this is of type unknown
    this[methodName] = this[methodName].bind(this);
  });
}

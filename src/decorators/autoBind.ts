/**
 * ensure that the method isn’t re-bound if it is called as a stand-alone function or passed as a callback.
 * @see https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/#decorators
 */
export function bound<T extends Object>(
  _originalMethod: Function,
  context: ClassMethodDecoratorContext<T>,
) {
  const methodName = context.name as keyof T;
  if (context.private) {
    throw new Error(`'bound' cannot decorate private properties like ${methodName as string}.`);
  }

  context.addInitializer(function () {
    this[methodName] = (this[methodName] as Function).bind(this);
  });
}

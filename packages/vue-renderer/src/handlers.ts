export type HandlerFn = (...args: never[]) => unknown;

export function defineHandlers<T extends Record<string, HandlerFn>>(handlers: T): T {
  return handlers;
}

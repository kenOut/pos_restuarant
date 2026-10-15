import "server-only";
import { EventEmitter } from "node:events";

/**
 * Live events for every till and kitchen screen in one restaurant.
 * "changed": something on the board or an order changed; screens refetch.
 * "ready": the kitchen bumped an order; tills show who it's for.
 */
export type LiveEvent = { type: "changed" } | { type: "ready"; orderNumber: number; label: string };

// One bus per server process (the restaurant's main computer), kept across hot reloads.
const globalForBus = globalThis as unknown as { enyoBus?: EventEmitter };
const bus =
  globalForBus.enyoBus ??
  (globalForBus.enyoBus = (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0); // one listener per open screen
    return emitter;
  })());

export function publish(restaurantId: string, event: LiveEvent): void {
  bus.emit(restaurantId, event);
}

export function subscribe(restaurantId: string, listener: (event: LiveEvent) => void): () => void {
  bus.on(restaurantId, listener);
  return () => bus.off(restaurantId, listener);
}

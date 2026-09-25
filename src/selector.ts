import type { Selector } from './types.js';

/**
 * Engine registry. The pipeline never learns which engine ran — that is what
 * makes `--engine` a config change rather than a leap of faith.
 *
 * `tag` is the floor: no network, no credentials, always available. It exists
 * so that a Jev outage, reprice or behaviour change degrades the shortlist
 * instead of blocking a build.
 */
export type EngineName = Selector['name'];

const registry = new Map<EngineName, () => Promise<Selector>>();

export function register(name: EngineName, load: () => Promise<Selector>): void {
  registry.set(name, load);
}

export async function getSelector(name: EngineName): Promise<Selector> {
  const load = registry.get(name);
  if (!load) {
    throw new Error(
      `Unknown selector "${name}". Registered: ${[...registry.keys()].join(', ') || '(none)'}`,
    );
  }
  return load();
}

export function registeredEngines(): EngineName[] {
  return [...registry.keys()];
}

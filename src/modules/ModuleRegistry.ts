import type {RegisteredModule} from './contracts';

export class ModuleRegistry {
  private readonly modules = new Map<string, RegisteredModule>();

  register(module: RegisteredModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Module "${module.id}" is already registered`);
    }
    const routeNames = new Set<string>();
    for (const route of module.routes) {
      if (routeNames.has(route.name)) {
        throw new Error(`Duplicate route "${route.name}" in module "${module.id}"`);
      }
      routeNames.add(route.name);
    }
    this.modules.set(module.id, module);
  }

  get(id: string): RegisteredModule | undefined {
    return this.modules.get(id);
  }

  all(): RegisteredModule[] {
    return [...this.modules.values()];
  }

  async initialize(): Promise<void> {
    for (const module of this.modules.values()) {
      await module.initialize?.();
    }
  }

  async dispose(): Promise<void> {
    for (const module of [...this.modules.values()].reverse()) {
      await module.dispose?.();
    }
  }
}

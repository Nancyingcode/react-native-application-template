import {ModuleRegistry} from '../src/modules/ModuleRegistry';
import type {RegisteredModule} from '../src/modules/contracts';

const module = (id: string, routes: string[] = ['Home']): RegisteredModule => ({
  id,
  version: '1.0.0',
  routes: routes.map(name => ({name, titleKey: name, component: () => null})),
});

describe('ModuleRegistry', () => {
  it('registers modules in a stable order', () => {
    const registry = new ModuleRegistry();
    registry.register(module('markets'));
    registry.register(module('news', ['News']));
    expect(registry.all().map(item => item.id)).toEqual(['markets', 'news']);
  });

  it('rejects duplicate module ids', () => {
    const registry = new ModuleRegistry();
    registry.register(module('markets'));
    expect(() => registry.register(module('markets'))).toThrow('already registered');
  });

  it('rejects duplicate routes inside a module', () => {
    expect(() => new ModuleRegistry().register(module('markets', ['Markets', 'Markets']))).toThrow(
      'Duplicate route',
    );
  });
});

import type {
  CompareContext,
  Decision,
  DiffEngine,
  EngineModule,
  Layout,
  Matcher,
  Measurement,
  Plugin,
  PluginApi,
  Reporter,
  Store,
  WritePlan,
} from './types';
import type { Manifest } from 'visual-regression-manifest';

export type Hooks = {
  beforeCompare: ((ctx: CompareContext) => void | Promise<void>)[];
  afterCompare: ((
    ctx: CompareContext,
    measurement: Measurement,
  ) => void | Promise<void>)[];
  decide: ((
    ctx: CompareContext,
    decision: Decision,
  ) => Decision | Promise<Decision>)[];
  beforeWrite: ((
    ctx: CompareContext,
    plan: WritePlan,
  ) => WritePlan | Promise<WritePlan>)[];
  end: ((manifest: Manifest) => void | Promise<void>)[];
};

/** What the plugins configured: replaceable parts and the hooks, owned by one comparer. */
export type Registry = {
  store: Store;
  layout: Layout;
  matcher: Matcher;
  reporters: Reporter[];
  engines: Map<string, DiffEngine | EngineModule>;
  hooks: Hooks;
  setup(plugins: Plugin[]): Promise<void>;
};

export const createRegistry = (initial: {
  store: Store;
  layout: Layout;
  matcher: Matcher;
  reporters: Reporter[];
}): Registry => {
  const registry: Registry = {
    ...initial,
    reporters: [...initial.reporters],
    engines: new Map(),
    hooks: {
      beforeCompare: [],
      afterCompare: [],
      decide: [],
      beforeWrite: [],
      end: [],
    },
    async setup(plugins) {
      const api: PluginApi = {
        addEngine: (name, engine) => registry.engines.set(name, engine),
        addReporter: (reporter) => registry.reporters.push(reporter),
        setStore: (store) => (registry.store = store),
        setLayout: (layout) => (registry.layout = layout),
        setMatcher: (matcher) => (registry.matcher = matcher),
        on: ((event: keyof Hooks, fn: Hooks[keyof Hooks][number]) => {
          (registry.hooks[event] as (typeof fn)[]).push(fn);
        }) as PluginApi['on'],
      };
      for (const plugin of plugins) await plugin.setup(api);
    },
  };
  return registry;
};

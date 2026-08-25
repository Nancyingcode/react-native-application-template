import type { BrandConfig } from '../brand/types';
import type { RegisteredModule, RouteContribution } from '../modules/contracts';
import type { RuntimeEntitlements } from './FeatureGate';
import { isContributionVisible } from './FeatureGate';

export interface AssembledApplication {
  routes: RouteContribution[];
  menu: Array<{ id: string; labelKey: string; route: string }>;
  home: Array<{ id: string; titleKey: string; route: string }>;
  initialRoute: string;
}

export function assembleApplication(
  brand: BrandConfig,
  modules: RegisteredModule[],
  runtime: RuntimeEntitlements,
): AssembledApplication {
  const moduleOrder = new Map(
    brand.assembly.modules.map((id, index) => [id, index]),
  );
  const selected = modules
    .filter(module => moduleOrder.has(module.id))
    .sort((a, b) => moduleOrder.get(a.id)! - moduleOrder.get(b.id)!);

  const routes = selected
    .flatMap(module => module.routes)
    .filter(route => isContributionVisible(brand.features, runtime, route));
  const routeNames = new Set(routes.map(route => route.name));
  const assertRoute = (route: string): boolean => routeNames.has(route);

  const menus = selected
    .flatMap(module => module.menus ?? [])
    .filter(item => isContributionVisible(brand.features, runtime, item))
    .filter(
      item => brand.assembly.menu.includes(item.id) && assertRoute(item.route),
    )
    .sort(
      (a, b) =>
        brand.assembly.menu.indexOf(a.id) - brand.assembly.menu.indexOf(b.id) ||
        a.order - b.order,
    )
    .map(({ id, labelKey, route }) => ({ id, labelKey, route }));

  const home = selected
    .flatMap(module => module.home ?? [])
    .filter(item => isContributionVisible(brand.features, runtime, item))
    .filter(
      item => brand.assembly.home.includes(item.id) && assertRoute(item.route),
    )
    .sort(
      (a, b) =>
        brand.assembly.home.indexOf(a.id) - brand.assembly.home.indexOf(b.id) ||
        a.order - b.order,
    )
    .map(({ id, titleKey, route }) => ({ id, titleKey, route }));

  let initialRoute: string | undefined;
  const shouldStartAtHome = brand.assembly.initialRoute === 'Home';
  const canStartAtConfiguredRoute = assertRoute(brand.assembly.initialRoute);

  if (shouldStartAtHome) {
    initialRoute = 'Home';
  } else if (canStartAtConfiguredRoute) {
    initialRoute = brand.assembly.initialRoute;
  } else {
    initialRoute = routes[0]?.name;
  }
  if (!initialRoute) {
    throw new Error(`Brand "${brand.id}" assembled no visible routes`);
  }

  return { routes, menu: menus, home, initialRoute };
}

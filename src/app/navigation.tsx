import React, { createContext, useContext } from 'react';

export type RouteParams = Readonly<Record<string, string>>;
type Navigate = (routeName: string, params?: RouteParams) => void;

interface AppNavigationValue {
  navigate: Navigate;
  params: RouteParams;
}

const AppNavigationContext = createContext<AppNavigationValue | null>(null);

export function AppNavigationProvider({
  navigate,
  params,
  children,
}: React.PropsWithChildren<{
  navigate: Navigate;
  params: RouteParams;
}>): React.JSX.Element {
  return (
    <AppNavigationContext.Provider value={{ navigate, params }}>
      {children}
    </AppNavigationContext.Provider>
  );
}

export function useAppNavigation(): Navigate {
  const context = useContext(AppNavigationContext);
  if (!context) {
    throw new Error(
      'useAppNavigation must be used inside AppNavigationProvider',
    );
  }
  return context.navigate;
}

export function useRouteParams(): RouteParams {
  const context = useContext(AppNavigationContext);
  if (!context) {
    throw new Error('useRouteParams must be used inside AppNavigationProvider');
  }
  return context.params;
}

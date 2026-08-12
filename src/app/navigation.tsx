import React, { createContext, useContext } from 'react';

type Navigate = (routeName: string) => void;

const AppNavigationContext = createContext<Navigate | null>(null);

export function AppNavigationProvider({
  navigate,
  children,
}: React.PropsWithChildren<{ navigate: Navigate }>): React.JSX.Element {
  return (
    <AppNavigationContext.Provider value={navigate}>
      {children}
    </AppNavigationContext.Provider>
  );
}

export function useAppNavigation(): Navigate {
  const navigate = useContext(AppNavigationContext);
  if (!navigate) {
    throw new Error(
      'useAppNavigation must be used inside AppNavigationProvider',
    );
  }
  return navigate;
}

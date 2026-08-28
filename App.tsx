import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApplicationProvider } from './src/app/ApplicationProvider';
import { ApplicationShell } from './src/app/ApplicationShell';
import { useApplication } from './src/app/ApplicationProvider';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ApplicationProvider>
        <ThemedApplication />
      </ApplicationProvider>
    </SafeAreaProvider>
  );
}

function ThemedApplication(): React.JSX.Element {
  const { brand } = useApplication();
  return (
    <>
      <StatusBar
        barStyle={
          isDarkColor(brand.theme.colors.background)
            ? 'light-content'
            : 'dark-content'
        }
      />
      <ApplicationShell />
    </>
  );
}

function isDarkColor(color: string): boolean {
  const hex = color.replace('#', '');
  if (!/^[\dA-Fa-f]{6}$/.test(hex)) {
    return false;
  }
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 < 128;
}

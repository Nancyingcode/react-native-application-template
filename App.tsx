import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ApplicationProvider} from './src/app/ApplicationProvider';
import {ApplicationShell} from './src/app/ApplicationShell';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ApplicationProvider>
        <StatusBar barStyle="light-content" />
        <ApplicationShell />
      </ApplicationProvider>
    </SafeAreaProvider>
  );
}

/* eslint-env jest */

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    Camera: props => React.createElement(View, {testID: 'camera', ...props}),
    useCameraDevice: () => ({hasTorch: false}),
    useCameraPermission: () => ({
      status: 'authorized',
      hasPermission: true,
      canRequestPermission: false,
      requestPermission: jest.fn(async () => true),
    }),
  };
});

jest.mock('react-native-vision-camera-barcode-scanner', () => ({
  useBarcodeScannerOutput: options => ({type: 'barcode-scanner', options}),
}));

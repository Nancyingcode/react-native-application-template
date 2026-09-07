const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = process.env.SPLIT_BUNDLE_OUTPUT
  ? {
      serializer: {
        createModuleIdFactory: require('./scripts/split-bundle')
          .createModuleIdFactory,
        customSerializer: require('./scripts/split-bundle').serialize,
      },
    }
  : {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

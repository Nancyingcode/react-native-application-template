import { Image, NativeModules, Platform } from 'react-native';

// OTA code lives outside the installation directory, but this protocol only
// permits unchanged embedded assets. Keep their original native resource root.
// Recheck this RN adapter when upgrading resolveAssetSource's internal API.
if (!__DEV__ && NativeModules.OtaBundle?.assetRoot) {
  Image.resolveAssetSource.addCustomSourceTransformer(resolver => {
    if (Platform.OS === 'android')
      return resolver.resourceIdentifierWithoutScale();
    resolver.jsbundleUrl = NativeModules.OtaBundle.assetRoot;
    return resolver.scaledAssetURLNearBundle();
  });
}

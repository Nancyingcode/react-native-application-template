export const IOS_CONFIG = {
  scheme: 'WhiteLabelApp',
  workspace: 'WhiteLabelApp.xcworkspace',
  project: 'WhiteLabelApp.xcodeproj',
  archive: 'WhiteLabelApp.xcarchive',
  application: 'WhiteLabelApp.app',
  deploymentTarget: '15.5',
} as const;
export const ANDROID_BUILD_TASK = {
  aab: ':app:bundleRelease',
  apk: ':app:assembleRelease',
} as const;

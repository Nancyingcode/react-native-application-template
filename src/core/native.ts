import {Linking, Platform, Share} from 'react-native';

export interface NativeCapabilities {
  platform: 'ios' | 'android' | 'other';
  openUrl(url: string): Promise<void>;
  share(message: string): Promise<void>;
  canOpenUrl(url: string): Promise<boolean>;
}

export const nativeCapabilities: NativeCapabilities = {
  platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'other',
  async openUrl(url) {
    await Linking.openURL(url);
  },
  async share(message) {
    await Share.share({message});
  },
  canOpenUrl(url) {
    return Linking.canOpenURL(url);
  },
};

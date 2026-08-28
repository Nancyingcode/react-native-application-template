export type BrandId = string;
export type BrandEnvironmentName = 'development' | 'staging' | 'production';
export type ModuleId =
  | 'auth'
  | 'onboarding'
  | 'markets'
  | 'trading'
  | 'portfolio'
  | 'news'
  | 'commerce'
  | (string & {});

export type FeatureValue = boolean | string | number;

export interface ThemeTokens {
  colors: {
    primary: string;
    primaryPressed: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    success: string;
    warning: string;
    danger: string;
    border: string;
  };
  radius: {sm: number; md: number; lg: number};
  spacing: {xs: number; sm: number; md: number; lg: number; xl: number};
  typography: {fontFamily?: string; titleSize: number; bodySize: number};
}

export interface BrandEnvironment {
  apiBaseUrl: string;
  marketDataUrl: string;
  timeoutMs: number;
}

export interface BrandNativeConfig {
  ios: {
    bundleId: string;
    teamId?: string;
    provisioningProfile?: string;
    appStoreId?: string;
  };
  android: {
    applicationId: string;
    keystorePath?: string;
    keyAlias?: string;
    playStorePackage?: string;
  };
  deepLinks: {scheme: string; hosts: string[]};
  push: {provider: 'firebase' | 'none'; environment?: string};
  sdkKeys: Record<string, string>;
  channel: {id: string; campaign?: string};
  permissions: {cameraUsage: string};
}

export interface BrandConfig {
  id: BrandId;
  appName: string;
  logo: string;
  defaultLocale: string;
  supportedLocales: string[];
  theme: ThemeTokens;
  copy: Record<string, Record<string, string>>;
  features: Record<string, FeatureValue>;
  environments: Record<BrandEnvironmentName, BrandEnvironment>;
  compliance: {
    jurisdiction: string;
    riskDisclosureKey: string;
    privacyUrl: string;
    termsUrl: string;
  };
  native: BrandNativeConfig;
  assembly: {
    modules: ModuleId[];
    menu: string[];
    home: string[];
    login?: string[];
    initialRoute: string;
  };
  strategies: {
    kyc: 'standard' | 'enhanced';
    tradingApi: 'rest' | 'broker-adapter';
  };
  commerce?: {
    currency: string;
    paymentProviders: Array<'wechat' | 'alipay'>;
  };
}

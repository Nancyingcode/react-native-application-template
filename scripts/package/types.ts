import type { BrandConfig, BrandEnvironmentName } from '../../src/brand/types';
export type PackagePlatform = 'android' | 'ios';
export type AndroidPackageFormat = 'aab' | 'apk';
export type IosPackageFormat = 'ipa';
export type PackageFormat = AndroidPackageFormat | IosPackageFormat;
export interface BasePackageOptions {
  brandId: string;
  environment: BrandEnvironmentName;
  versionName: string;
  buildNumber: number;
  outputDirectory: string;
  skipChecks: boolean;
  clean: boolean;
  skipPods: boolean;
  allowProvisioningUpdates: boolean;
  iosExportMethod: string;
  iosExportOptions?: string;
}

export type AndroidPackageOptions = BasePackageOptions & {
  platform: 'android';
  format: AndroidPackageFormat;
  unsigned: boolean;
};
export type IosPackageOptions = BasePackageOptions & {
  platform: 'ios';
  format: IosPackageFormat;
  unsigned: false;
};
export type PackageOptions = AndroidPackageOptions | IosPackageOptions;
export type CliResult =
  | { help: true }
  | { help: false; options: PackageOptions };
export interface ArtifactLayout {
  releaseDirectory: string;
  platformDirectory: string;
  artifactName: string;
  artifactPath: string;
  checksumPath: string;
  manifestPath: string;
}

export interface CommandOptions {
  cwd?: string;
  env: NodeJS.ProcessEnv;
}

export interface CommandResult {
  status: number;
  output: string;
}

export interface PublishedArtifact {
  file: string;
  bytes: number;
  sha256: string;
  signed: boolean;
  publishable: boolean;
}

export interface PackageContext {
  options: PackageOptions;
  brand: BrandConfig;
  env: NodeJS.ProcessEnv;
  layout: ArtifactLayout;
  sourceState: { commit: string | null; dirty: boolean | null };
}

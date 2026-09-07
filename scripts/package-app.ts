import { main } from './package';
export { main } from './package';
export { HELP, parsePackageOptions } from './package/cli';
export { resolveArtifactLayout } from './package/artifact';
export { createIosExportOptions } from './package/ios';
export type {
  PackagePlatform,
  PackageFormat,
  PackageOptions,
} from './package/types';

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      `\nPackaging failed: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}

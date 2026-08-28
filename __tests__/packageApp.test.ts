import path from 'node:path';
import { parseGenerateBrandOptions } from '../scripts/generate-brand';
import {
  createIosExportOptions,
  parsePackageOptions,
  resolveArtifactLayout,
} from '../scripts/package-app';

describe('packaging options', () => {
  test('defaults to a production Android App Bundle', () => {
    const options = parsePackageOptions([], { BUILD_NUMBER: '1' });

    expect(options).toMatchObject({
      brandId: 'aurora',
      platform: 'android',
      format: 'aab',
      environment: 'production',
      versionName: '1.0.0',
      buildNumber: 1,
      unsigned: false,
    });
  });

  test('CLI values override CI environment values', () => {
    const options = parsePackageOptions(
      [
        '--brand',
        'cedar',
        '--environment=staging',
        '--format',
        'apk',
        '--version',
        '2.4.1',
        '--build-number',
        '87',
        '--unsigned',
      ],
      {
        BRAND: 'aurora',
        APP_ENV: 'production',
        BUILD_NUMBER: '42',
      },
    );

    expect(options).toMatchObject({
      brandId: 'cedar',
      environment: 'staging',
      format: 'apk',
      versionName: '2.4.1',
      buildNumber: 87,
      unsigned: true,
    });
  });

  test.each([
    [[], /production package requires --build-number/],
    [['--brand', '../aurora'], /Brand id/],
    [['--environment', 'preview'], /Invalid environment/],
    [['--build-number', '0'], /Build number/],
    [['--version', '1.0.0-beta'], /Version/],
    [['--unsigned=false'], /does not accept a value/],
    [['--platform', 'ios', '--unsigned'], /only exports signed IPA/],
    [['--platform', 'ios', '--format', 'apk'], /not valid for ios/],
  ])('rejects invalid arguments %#', (args, expected) => {
    expect(() => parsePackageOptions(args as string[], {})).toThrow(
      expected as RegExp,
    );
  });

  test('uses an unambiguous path for unsigned artifacts', () => {
    const options = parsePackageOptions(
      [
        '--brand',
        'cedar',
        '--environment',
        'staging',
        '--version',
        '2.0.0',
        '--build-number',
        '9',
        '--unsigned',
      ],
      {},
    );
    const layout = resolveArtifactLayout(options);

    expect(layout.artifactName).toBe('cedar-staging-2.0.0-9-unsigned.aab');
    expect(layout.artifactPath).toBe(
      path.join(
        options.outputDirectory,
        'cedar',
        'staging',
        '2.0.0+9',
        'android',
        layout.artifactName,
      ),
    );
  });
});

describe('brand build metadata', () => {
  test('parses environment and native version inputs', () => {
    expect(
      parseGenerateBrandOptions(
        [
          'cedar',
          '--environment',
          'staging',
          '--version-name',
          '3.1.0',
          '--build-number',
          '15',
        ],
        {},
      ),
    ).toEqual({
      brandId: 'cedar',
      environment: 'staging',
      versionName: '3.1.0',
      buildNumber: 15,
    });
  });
});

describe('iOS export options', () => {
  test('renders manual signing without leaking unrelated values', () => {
    const plist = createIosExportOptions(
      'app-store-connect',
      'TEAM&123',
      'com.company.app',
      'Distribution <Profile>',
    );

    expect(plist).toContain('<string>manual</string>');
    expect(plist).toContain('<string>TEAM&amp;123</string>');
    expect(plist).toContain('<key>com.company.app</key>');
    expect(plist).toContain('<string>Distribution &lt;Profile&gt;</string>');
  });
});

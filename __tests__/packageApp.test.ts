import path from 'node:path';
import { parseGenerateBrandOptions } from '../scripts/generate-brand';
import {
  createIosExportOptions,
  parsePackageOptions as parseCli,
  resolveArtifactLayout,
} from '../scripts/package-app';

function parsePackageOptions(args: string[], env: NodeJS.ProcessEnv) {
  const cli = parseCli(args, env);
  if (cli.help) throw new Error('Expected build options');
  return cli.options;
}

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

describe('CLI compatibility', () => {
  test('help does not fabricate build options or require a build number', () => {
    expect(parseCli(['--help'], { BUILD_PLATFORM: 'invalid' })).toEqual({
      help: true,
    });
    expect(() => parseCli(['--help', '--unknown'], {})).toThrow(
      'Unknown option',
    );
  });

  test.each([
    [
      [
        '--platform',
        'android',
        '--format',
        'aab',
        '--brand',
        'aurora',
        '--build-number',
        '42',
      ],
      'android',
      'aab',
      false,
    ],
    [
      [
        '--platform',
        'android',
        '--format',
        'apk',
        '--brand',
        'aurora',
        '--unsigned',
      ],
      'android',
      'apk',
      true,
    ],
    [
      [
        '--platform',
        'ios',
        '--format',
        'ipa',
        '--brand',
        'aurora',
        '--build-number',
        '42',
      ],
      'ios',
      'ipa',
      false,
    ],
  ])(
    'accepts the documented command %#',
    (args, platform, format, unsigned) => {
      expect(parsePackageOptions(args as string[], {})).toMatchObject({
        platform,
        format,
        unsigned,
      });
    },
  );

  test('preserves aliases, positional brand, flags and CI defaults', () => {
    expect(
      parsePackageOptions(
        [
          'cedar',
          '--env=staging',
          '--android-format=apk',
          '--version-name=2.3',
          '--out-dir=out',
          '--clean',
          '--skip-checks',
          '--skip-pods',
          '--allow-provisioning-updates',
        ],
        { GITHUB_RUN_NUMBER: '23' },
      ),
    ).toMatchObject({
      brandId: 'cedar',
      environment: 'staging',
      format: 'apk',
      versionName: '2.3',
      outputDirectory: path.resolve('out'),
      buildNumber: 23,
      clean: true,
      skipChecks: true,
      skipPods: true,
      allowProvisioningUpdates: true,
    });
    expect(
      parsePackageOptions(['--platform=ios'], { BUILD_NUMBER: '42' }),
    ).toMatchObject({ format: 'ipa', unsigned: false });
  });
});

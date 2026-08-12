'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MODULES = {
  auth: { symbol: 'authModule', importPath: '../../modules/auth' },
  onboarding: {
    symbol: 'onboardingModule',
    importPath: '../../modules/onboarding',
  },
  markets: { symbol: 'marketsModule', importPath: '../../modules/markets' },
  trading: { symbol: 'tradingModule', importPath: '../../modules/trading' },
  portfolio: {
    symbol: 'portfolioModule',
    importPath: '../../modules/portfolio',
  },
  news: { symbol: 'newsModule', importPath: '../../modules/news' },
  'qr-login': { symbol: 'qrLoginPlugin', importPath: '../../plugins/qr-login' },
  'advanced-orders': {
    symbol: 'advancedOrdersPlugin',
    importPath: '../../plugins/advanced-orders',
  },
};

function listBrands() {
  return fs
    .readdirSync(path.join(ROOT, 'brands'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
}

function readBrand(id) {
  const file = path.join(ROOT, 'brands', id, 'brand.config.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      `Unknown brand "${id}". Available: ${listBrands().join(', ')}`,
    );
  }
  return { file, config: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

function validateBrand(brand) {
  const errors = [];
  const requiredStrings = ['id', 'appName', 'logo', 'defaultLocale'];
  for (const field of requiredStrings) {
    if (typeof brand[field] !== 'string' || !brand[field]) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!brand.theme?.colors?.primary || !brand.theme?.colors?.background) {
    errors.push('theme colors are incomplete');
  }
  for (const environment of ['development', 'staging', 'production']) {
    if (!brand.environments?.[environment]?.apiBaseUrl) {
      errors.push(`environments.${environment}.apiBaseUrl is required`);
    }
  }
  if (
    !Array.isArray(brand.assembly?.modules) ||
    brand.assembly.modules.length === 0
  ) {
    errors.push('assembly.modules must not be empty');
  } else {
    const duplicates = brand.assembly.modules.filter(
      (id, index, all) => all.indexOf(id) !== index,
    );
    if (duplicates.length) {
      errors.push(
        `assembly.modules contains duplicates: ${[...new Set(duplicates)].join(
          ', ',
        )}`,
      );
    }
    const unknown = brand.assembly.modules.filter(id => !MODULES[id]);
    if (unknown.length) {
      errors.push(
        `assembly.modules contains unknown modules: ${unknown.join(', ')}`,
      );
    }
  }
  if (!brand.native?.ios?.bundleId || !brand.native?.android?.applicationId) {
    errors.push('native bundle identifiers are required');
  }
  if (
    !brand.native?.deepLinks?.scheme ||
    !brand.native?.deepLinks?.hosts?.length
  ) {
    errors.push('at least one deep-link scheme and host are required');
  }
  if (
    brand.assembly?.modules?.includes('qr-login') &&
    !brand.native?.permissions?.cameraUsage
  ) {
    errors.push('native.permissions.cameraUsage is required');
  }
  if (!brand.supportedLocales?.includes(brand.defaultLocale)) {
    errors.push('defaultLocale must be included in supportedLocales');
  }
  return errors;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

module.exports = {
  ROOT,
  MODULES,
  listBrands,
  readBrand,
  validateBrand,
  escapeXml,
};

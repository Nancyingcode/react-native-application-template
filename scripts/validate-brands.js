'use strict';

const {listBrands, readBrand, validateBrand} = require('./brand-utils');

let failed = false;
for (const id of listBrands()) {
  const {config} = readBrand(id);
  const errors = validateBrand(config);
  if (errors.length) {
    failed = true;
    console.error(`✗ ${id}\n  ${errors.join('\n  ')}`);
  } else {
    console.log(`✓ ${id}`);
  }
}
if (failed) {
  process.exitCode = 1;
}

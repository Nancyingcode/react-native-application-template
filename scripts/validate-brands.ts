import { listBrands, readBrand, validateBrand } from './brand-utils';

let failed = false;
for (const id of listBrands()) {
  const { config } = readBrand(id);
  const errors = validateBrand(config);
  if (config.id !== id) {
    errors.unshift(`config id must match directory name "${id}"`);
  }
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

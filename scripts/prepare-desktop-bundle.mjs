import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const release = resolve(process.cwd(), '../../target/release/sorid.exe');
const staged = resolve(process.cwd(), '../../target/debug/sorid.exe');
if (!existsSync(release)) {
  throw new Error(`release daemon missing: ${release}`);
}
copyFileSync(release, staged);
console.log(`staged sorid.exe for Tauri: ${staged}`);

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const configPath = resolve(root, 'apps/desktop/src-tauri/tauri.conf.json');
const packagePath = resolve(root, 'apps/desktop/package.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const resources = config.bundle?.resources ?? [];
const fail = (message) => {
  throw new Error(`Windows packaging contract failed: ${message}`);
};

if (!config.bundle?.active) fail('Tauri bundling is disabled');
for (const target of ['nsis', 'msi']) {
  if (!config.bundle.targets?.includes(target)) fail(`missing ${target} target`);
}
if (resources.length !== 1 || resources[0] !== '../../../target/debug/sorid.exe') {
  fail(`expected only the staged sorid resource, got ${JSON.stringify(resources)}`);
}
if (resources.some((resource) => /whisper|ggml|\.bin/i.test(resource))) {
  fail('Whisper executables, libraries, or models must remain external');
}
const bundleScript = packageJson.scripts?.['build:bundle'] ?? '';
for (const required of ['cargo build', '--release', 'prepare-desktop-bundle.mjs']) {
  if (!bundleScript.includes(required)) fail(`build:bundle does not contain ${required}`);
}
const prepareSource = readFileSync(resolve(root, 'scripts/prepare-desktop-bundle.mjs'), 'utf8');
if (!prepareSource.includes('SORI_WHISPER_CPP_BIN') || !prepareSource.includes('remains external')) {
  fail('bundle preparation does not document external Whisper handling');
}
const nativeSource = readFileSync(resolve(root, 'apps/desktop/src-tauri/src/lib.rs'), 'utf8');
for (const required of ['SORI_DAEMON_PATH', 'resources', 'daemon endpoint is already occupied']) {
  if (!nativeSource.includes(required)) fail(`native launcher is missing ${required} handling`);
}
if (/whisper-runtime|whisper-cli\.exe/.test(nativeSource)) {
  fail('native launcher must not advertise a bundled Whisper runtime');
}
const docs = readFileSync(resolve(root, 'docs/backend/windows-packaging.md'), 'utf8');
for (const required of ['NSIS', 'MSI', 'SORI_WHISPER_CPP_BIN', 'Crash restart', 'UNVERIFIED']) {
  if (!docs.includes(required)) fail(`packaging documentation is missing ${required}`);
}

console.log('PASS: Windows packaging configuration contract');
console.log('PASS: sorid-only resource boundary (Whisper/models remain user-owned)');
console.log('PASS: launch ownership and restart diagnostics are documented');
console.log('SKIP: physical Windows installer execution (run scripts/windows-packaging-acceptance.ps1 on Windows)');

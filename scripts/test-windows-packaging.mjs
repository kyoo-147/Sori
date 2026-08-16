import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const configPath = resolve(root, 'apps/desktop/src-tauri/tauri.conf.json');
const packagePath = resolve(root, 'apps/desktop/package.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const resources = config.bundle?.resources ?? {};
const fail = (message) => {
  throw new Error(`Windows packaging contract failed: ${message}`);
};

if (!config.bundle?.active) fail('Tauri bundling is disabled');
if (config.plugins?.updater || packageJson.dependencies?.['tauri-plugin-updater'] || packageJson.devDependencies?.['tauri-plugin-updater']) {
  fail('automatic updater configuration is not shipped in the MVP without signed endpoint evidence');
}
for (const target of ['nsis', 'msi']) {
  if (!config.bundle.targets?.includes(target)) fail(`missing ${target} target`);
}
if (Object.keys(resources).length !== 1 || resources['../../../target/debug/sorid.exe'] !== 'sorid.exe') {
  fail(`expected only the staged sorid resource, got ${JSON.stringify(resources)}`);
}
if (Object.keys(resources).some((resource) => /whisper|ggml|\.bin/i.test(resource)) || Object.values(resources).some((resource) => /whisper|ggml|\.bin/i.test(resource))) {
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
for (const required of ['SORI_DAEMON_PATH', 'resources', 'local runtime endpoint is already in use by an unknown process', 'daemon-owner.json']) {
  if (!nativeSource.includes(required)) fail(`native launcher is missing ${required} handling`);
}
if (/whisper-runtime|whisper-cli\.exe/.test(nativeSource)) {
  fail('native launcher must not advertise a bundled Whisper runtime');
}
const acceptance = readFileSync(resolve(root, 'scripts/windows-packaging-acceptance.ps1'), 'utf8');
if (!acceptance.includes("ValidateSet('bundle', 'installed', 'launch', 'restart', 'reinstall')")) {
  fail('acceptance phases do not expose the supported launch/restart contract');
}
if (acceptance.includes("'crash-recovery'")) fail('acceptance must not expose unsupported automatic crash recovery');
if (!acceptance.includes('automatic crash recovery is not supported')) fail('acceptance must state truthful restart-on-request behavior');
const docs = readFileSync(resolve(root, 'docs/backend/windows-packaging.md'), 'utf8').replace(/\r\n/g, '\n');
for (const required of ['NSIS', 'MSI', 'SORI_WHISPER_CPP_BIN', 'Crash restart', 'UNVERIFIED', 'Automatic desktop updates are not shipped in the MVP', 'Tauri updater plugin', 'release-signing public key']) {
  if (!docs.includes(required)) fail(`packaging documentation is missing ${required}`);
}
if (!docs.includes('-Phase launch')) fail('packaging documentation must use the valid -Phase launch parameter');
if (docs.includes(' -Launch') || docs.includes('`-Launch`')) fail('packaging documentation must not advertise invalid -Launch');
if (!docs.includes('bundle\nroot') || !docs.includes('installed\nroot')) fail('packaging documentation must distinguish bundle and installed roots');

console.log('PASS: Windows packaging configuration contract');
console.log('PASS: sorid-only resource boundary (Whisper/models remain user-owned)');
console.log('PASS: launch ownership and restart diagnostics are documented');
console.log('SKIP: physical Windows installer execution (run scripts/windows-packaging-acceptance.ps1 on Windows)');

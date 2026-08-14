import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const release = resolve(process.cwd(), '../../target/release/sorid.exe');
const staged = resolve(process.cwd(), '../../target/debug/sorid.exe');
if (!existsSync(release)) {
  throw new Error(`release daemon missing: ${release}`);
}
copyFileSync(release, staged);
console.log(`staged sorid.exe for Tauri: ${staged}`);

// Whisper is an optional, user-owned runtime. Never copy it into the build
// tree: a missing or partial installation must not turn a desktop packaging
// build into an opaque resource error. sorid reports the unavailable capability
// at launch and users can configure SORI_WHISPER_CPP_BIN separately.
const configuredWhisper = process.env.SORI_WHISPER_CPP_BIN;
if (configuredWhisper && !existsSync(resolve(configuredWhisper))) {
  console.log(`UNAVAILABLE: optional Whisper runtime is not present at ${configuredWhisper}; packaging continues without voice runtime.`);
} else if (!configuredWhisper) {
  console.log('UNAVAILABLE: optional user-owned Whisper runtime is not configured; packaging continues without voice runtime.');
} else {
  console.log(`Whisper runtime remains external and user-owned: ${configuredWhisper}`);
}

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const release = resolve(process.cwd(), '../../target/release/sorid.exe');
const staged = resolve(process.cwd(), '../../target/debug/sorid.exe');
if (!existsSync(release)) {
  throw new Error(`release daemon missing: ${release}`);
}
copyFileSync(release, staged);
console.log(`staged sorid.exe for Tauri: ${staged}`);

const runtimeSource = resolve(process.env.SORI_WHISPER_RUNTIME_DIR ?? '../../.tmp/whisper/bin/Release');
const runtimeStaged = resolve(process.cwd(), '../../target/debug/whisper-runtime');
mkdirSync(runtimeStaged, { recursive: true });
const requiredRuntime = ['whisper-cli.exe', 'ggml.dll', 'ggml-base.dll', 'whisper.dll'];
if (!existsSync(runtimeSource)) {
  console.log(`Whisper runtime staging skipped; source is unavailable: ${runtimeSource}`);
} else {
  const available = new Set(readdirSync(runtimeSource));
  const missing = requiredRuntime.filter((name) => !available.has(name));
  if (missing.length > 0) {
    throw new Error(`Whisper runtime source is incomplete: missing ${missing.join(', ')} from ${runtimeSource}`);
  }
  for (const name of requiredRuntime) copyFileSync(resolve(runtimeSource, name), resolve(runtimeStaged, name));
  console.log(`staged Whisper runtime dependencies for Tauri: ${runtimeStaged}`);
}

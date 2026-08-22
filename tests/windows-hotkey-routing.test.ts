import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const daemon = readFileSync('crates/sorid/src/main.rs', 'utf8');
const runtime = readFileSync('crates/sorid/src/runtime.rs', 'utf8');
const acceptance = readFileSync('scripts/windows-native-voice-acceptance.ps1', 'utf8');

describe('Windows hotkey focused-target contract', () => {
  it('captures the foreground target on press and reuses it on release', () => {
    expect(daemon).toContain('let hotkey_target_state = Arc::new(Mutex::new(None::<RuntimeTarget>));');
    expect(daemon).toContain('HotkeyEvent::Pressed => match RuntimeTarget::capture()');
    expect(daemon).toContain('hotkey_target_for_callback.lock()');
    expect(daemon).toContain('HotkeyEvent::Released =>');
    expect(daemon).toContain('held.take()');
    expect(runtime).toContain('global hotkey; target={}');
  });

  it('requires actual foreground ownership in native focus acceptance', () => {
    expect(acceptance).toContain('return foregroundPid == targetPid && (edit == IntPtr.Zero || childFocused);');
  });
});

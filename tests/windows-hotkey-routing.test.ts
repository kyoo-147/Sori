import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const daemon = readFileSync('crates/sorid/src/main.rs', 'utf8');
const runtime = readFileSync('crates/sorid/src/runtime.rs', 'utf8');
const acceptance = readFileSync('scripts/windows-native-voice-acceptance.ps1', 'utf8');
const insertionAcceptance = readFileSync('scripts/windows-text-insertion-acceptance.ps1', 'utf8');

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

  it('keeps automated insertion readback scoped to owned EDIT HWND/PID pairs', () => {
    expect(insertionAcceptance).toContain('Sori Owned EDIT');
    expect(insertionAcceptance).toContain('IsOwned($hwnd,$process.Id)');
    expect(insertionAcceptance).toContain("strategy='DirectInput'");
    expect(insertionAcceptance).toContain("strategy='ClipboardPaste'");
    expect(insertionAcceptance).toContain('target-switch');
    expect(insertionAcceptance).toContain('stalePid');
    expect(insertionAcceptance).toContain('NOT_PHYSICAL_PROOF');
    expect(insertionAcceptance).toContain('windows_direct_edit_probe.exe');
    expect(insertionAcceptance).toContain('Invoke-SoriProbe $title');
    expect(insertionAcceptance).not.toContain('SendInput control key');
    expect(insertionAcceptance).toContain('clipboard_restore_unsupported');
  });
});

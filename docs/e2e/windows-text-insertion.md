# Windows owned text insertion acceptance

Run on an interactive Windows desktop:

```powershell
npm run e2e:windows-text-insertion
```

The script compiles a disposable repo-owned WinForms target with a multiline
Win32 `EDIT`, records its PID/top-level HWND/edit HWND, and refuses input when
that ownership is not true. Every insertion is delegated to the Rust
`windows_direct_edit_probe` example, which invokes Sori's real
`WindowsTextInjector`/`WindowsSendInputAdapter`. It verifies ASCII,
Unicode/surrogate pairs, multiline, punctuation, and repeated long text.
Clipboard mode is attempted for every case; it is marked `UNSUPPORTED` when
the adapter detects unrelated clipboard formats it cannot preserve losslessly.
It also switches to a second owned target and closes the first target to
exercise target-switch, disappearance, and stale-HWND rejection.

The JSON artifact is `.tmp/windows-text-insertion-acceptance.json` by default.
Synthetic input is explicitly **not** physical-hotkey, microphone, ASR, or
Sori voice-path proof. The separate physical acceptance remains user-only.

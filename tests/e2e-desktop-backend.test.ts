import { describe, expect, it } from 'vitest';
import { DEFAULT_IPC_URL, binaryPath, parseEndpoint } from '../scripts/e2e-desktop-backend.js';

describe('desktop backend E2E helpers', () => {
  it('uses the documented local endpoint by default', () => {
    expect(parseEndpoint().toString()).toBe(DEFAULT_IPC_URL);
  });

  it('accepts an endpoint override and rejects non-HTTP transports', () => {
    expect(parseEndpoint('http://127.0.0.1:17374/ipc').port).toBe('17374');
    expect(() => parseEndpoint('\\\\.\\pipe\\sori')).toThrow();
  });

  it('uses the platform debug binary suffix', () => {
    expect(binaryPath('sorid')).toMatch(/target[\\/]debug[\\/]sorid(\.exe)?$/);
  });
});

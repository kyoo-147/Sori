import { Agent, createServer, request } from 'node:http';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAVIGATION, stopServer, UNVERIFIED_HARDWARE_CAPABILITIES } from '../scripts/e2e-product-gate.js';

describe('sequential product E2E gate contract', () => {
  it('keeps every primary desktop route in the semantic navigation sequence', () => {
    expect(PRODUCT_NAVIGATION.map(({ label }) => label)).toEqual([
      'Home',
      'Transcripts',
      'Vocabulary',
      'Voice Edit',
      'Models & Routing',
      'Benchmarks',
      'Extensions',
      'Privacy',
      'Diagnostics',
      'Settings',
      'First-Run Setup',
    ]);
    for (const flow of PRODUCT_NAVIGATION) expect(flow.expected.length).toBeGreaterThanOrEqual(2);
  });

  it('names hardware capabilities as unverified instead of treating the browser gate as voice proof', () => {
    expect(UNVERIFIED_HARDWARE_CAPABILITIES).toEqual([
      'global hotkey',
      'physical microphone capture',
      'Whisper model inference',
      'focused-app text injection',
    ]);
  });
});

describe('production browser state authority', () => {
  it('does not expose fixture toggles or mock-green runtime labels', () => {
    const transcripts = readFileSync(resolve('apps/desktop/src/components/screens/TranscriptsScreen.tsx'), 'utf8');
    const overview = readFileSync(resolve('apps/desktop/src/components/screens/OverviewScreen.tsx'), 'utf8');
    expect(transcripts).not.toContain("(['normal','loading','empty','error'] as ViewState[])");
    expect(transcripts).toContain('loadState');
    expect(overview).not.toContain('Mock fallback is active');
  });
});

describe('native bridge acceptance harness contract', () => {
  it('uses the production RuntimeClient and refuses fabricated fixture success', () => {
    const source = readFileSync(resolve('scripts/e2e-native-bridge.ts'), 'utf8');
    expect(source).toContain("new NativeIpcTransport(invoke, () => true)");
    expect(source).toContain("client.dictationAudio('whisper.cpp/e2e-missing-model', [], 'DirectInput')");
    expect(source).toContain('provider/model/audio failure became fake success');
    expect(source).toContain('SQLite state was not restored after reconnect');
  });
});

describe('product gate daemon ownership isolation', () => {
  it('isolates the daemon ownership lease with the product gate database', () => {
    const source = readFileSync(resolve('scripts/e2e-product-gate.ts'), 'utf8');
    expect(source).toContain("const owner = join(evidenceDir, 'daemon-owner.json');");
    expect(source).toContain('SORI_DAEMON_OWNER_PATH: owner');
  });
  it('closes a keep-alive connection and resolves shutdown within the bound', async () => {
    const server = createServer((_request, response) => response.end('ok'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not expose a TCP address');
    const agent = new Agent({ keepAlive: true });
    try {
      await new Promise<void>((resolveRequest, rejectRequest) => {
        const clientRequest = request({ host: '127.0.0.1', port: address.port, agent }, (response) => {
          response.resume();
          response.once('end', resolveRequest);
        });
        clientRequest.once('error', rejectRequest);
        clientRequest.end();
      });
      const started = Date.now();
      await stopServer(server);
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(server.listening).toBe(false);
    } finally {
      agent.destroy();
      if (server.listening) await stopServer(server);
    }
  });
});

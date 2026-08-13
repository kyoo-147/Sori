import type { AudioChunk } from './ipc-contract.js';

export interface BenchmarkFixture {
  fileName: string;
  audio: AudioChunk[];
  reference: string | null;
}

/** Decode the explicit benchmark input contract: mono PCM16 RIFF/WAVE plus an optional transcript reference. */
export async function readBenchmarkFixture(file: Pick<File, 'name' | 'arrayBuffer'>, reference: string): Promise<BenchmarkFixture> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') {
    throw new Error('benchmark fixture must be a RIFF/WAVE file');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bits = view.getUint16(34, true);
  if (channels !== 1 || bits !== 16 || sampleRate === 0) {
    throw new Error('benchmark fixture must be mono PCM16 WAV');
  }
  const dataOffset = findChunk(bytes, 'data');
  if (dataOffset < 0 || dataOffset + 4 > bytes.length) throw new Error('benchmark fixture data chunk is missing');
  const dataSize = Math.min(view.getUint32(dataOffset, true), bytes.length - dataOffset - 4);
  if (dataSize < 2) throw new Error('benchmark fixture contains no PCM samples');
  const samples: number[] = [];
  for (let offset = dataOffset + 4; offset + 1 < dataOffset + 4 + dataSize; offset += 2) {
    samples.push(view.getInt16(offset, true) / 32767);
  }
  return {
    fileName: file.name,
    audio: [{ captured_at: new Date().toISOString(), format: { sample_rate_hz: sampleRate, channels: 1, sample_format: 'F32' }, samples }],
    reference: reference.trim() || null,
  };
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function findChunk(bytes: Uint8Array, chunk: string): number {
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = ascii(bytes, offset, 4);
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset + 4, true);
    if (id === chunk) return offset + 4;
    offset += 8 + size + (size % 2);
  }
  return -1;
}

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // Tauri serves the built files from its bundled resource directory.
  build: { target: ['es2021', 'chrome105', 'safari13'] },
});

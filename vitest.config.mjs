import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.mjs'],
    // Wymusza niezerowe przesunięcie strefy — patrz tests/setup/strefa.mjs.
    setupFiles: ['./tests/setup/strefa.mjs'],
    passWithNoTests: false,
    reporters: ['default'],
    testTimeout: 10_000
  }
});

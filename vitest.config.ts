import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts','backend/**/*.test.ts','packages/**/*.test.ts'],environment:'node'}});

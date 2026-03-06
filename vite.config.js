import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'events', 'crypto', 'stream', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    })
  ],
  resolve: {
    alias: {
      'jito-ts/dist/sdk/block-engine/types': path.resolve(__dirname, './src/mock-jito.js'),
      'jito-ts/dist/sdk/block-engine/searcher': path.resolve(__dirname, './src/mock-jito.js'),
      'jito-ts': path.resolve(__dirname, './src/mock-jito.js'),
    }
  },
  optimizeDeps: {
    include: ['bn.js', '@pythnetwork/price-service-sdk', 'bs58'],
    exclude: ['jito-ts'],
  },
})

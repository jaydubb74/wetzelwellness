/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // Proxies /api/llm -> https://api.anthropic.com/v1/messages
        // Injects the API key server-side so it never appears in browser network logs.
        // Requires VITE_ANTHROPIC_API_KEY in .env
        '/api/llm': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: () => '/v1/messages',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const key = env.VITE_ANTHROPIC_API_KEY || '';
              proxyReq.setHeader('x-api-key', key);
              proxyReq.setHeader('anthropic-version', '2023-06-01');
              proxyReq.removeHeader('origin');
            });
          },
        },
      },
    },
    test: {
      environment: 'node',
    },
  };
});

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Reads VITE_API_PROXY_TARGET from the monorepo root .env, so the dev server
  // can point at a server running on a non-default port.
  const rootEnv = loadEnv(mode, '../..', 'VITE_');
  const target = rootEnv.VITE_API_PROXY_TARGET ?? 'http://localhost:4000';
  const proxy = { target, changeOrigin: true };

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Lets the app call `/api/...` in dev with no CORS and no absolute URL.
      proxy: { '/api': proxy, '/health': proxy },
    },
  };
});

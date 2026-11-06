import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 开发时 /api 代理到后端 8000；生产时后端直接托管 dist，不需要跨域
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1400,
  },
});

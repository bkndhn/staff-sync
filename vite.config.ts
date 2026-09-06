import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Use root base path for Vercel web hosting to fix blank page errors.
  base: '/',
  server: {
    host: "::",
    port: 8080,
    headers: {
      // Required for onnxruntime-web WASM SIMD/threading (web only - Capacitor WebView handles this differently)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ['lucide-react'],
    exclude: ['onnxruntime-web'],
  },
  build: {
    // Capacitor needs smaller chunks for WebView loading performance
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'EVAL' && warning.id?.includes('onnxruntime-web')) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('onnxruntime-web')) return 'onnx';
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('jspdf')) return 'pdf';
          return undefined;
        },
      },

    },
  },
  assetsInclude: ['**/*.wasm', '**/*.onnx'],
}));


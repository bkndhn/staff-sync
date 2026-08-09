import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // CRITICAL for Capacitor: assets must load from relative paths inside APK
  base: './',
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
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js'],
          'pdf': ['jspdf', 'jspdf-autotable'],
          'xlsx': ['xlsx'],
          'onnx': ['onnxruntime-web'],
        },
      },
    },
  },
  assetsInclude: ['**/*.wasm', '**/*.onnx'],
}));


import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.staffsync.app',
  appName: 'ZenHRMS',
  webDir: 'dist',
  // HTTPS scheme lets crypto.subtle and service workers work inside WebView
  android: {
    allowMixedContent: false,
  },
  // No `server.url`: the app runs from the web assets bundled inside the APK,
  // so it launches instantly and keeps working when the phone is offline.
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Camera: {
      // Request camera permissions on first use
      presentationStyle: 'fullscreen',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0a1a',
      showSpinner: false,
    },
    PrivacyScreen: {
      enable: true,
      imageName: 'Splashscreen',
    },
    // Capgo live updates: new web code downloads in the background and applies on next
    // launch. The bundled copy stays on the phone, so offline punching keeps working.
    CapacitorUpdater: {
      autoUpdate: true,
      resetWhenUpdate: false,
      directUpdate: false,
    },
  },
};

export default config;

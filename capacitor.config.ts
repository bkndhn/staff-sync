import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.staffsync.app',
  appName: 'Staff Sync',
  webDir: 'dist',
  // HTTPS scheme lets crypto.subtle and service workers work inside WebView
  android: {
    allowMixedContent: false,
  },
  server: {
    // During development, point to local dev server (remove for production APK)
    // url: 'http://192.168.1.x:8080',
    // cleartext: true,
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
  },
};

export default config;

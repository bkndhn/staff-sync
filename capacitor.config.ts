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
    // Points to the live production deployment
    url: 'https://staff-managment-system.vercel.app',
    cleartext: true,
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

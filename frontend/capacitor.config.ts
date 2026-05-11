import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config — wraps the Vite-built `dist/` as the webView source for
 * iOS / Android shells. The web build remains the single source of truth;
 * native shells exist only to enable home-screen install, push (APNS/FCM),
 * widget extensions, and microphone permissions on iOS/Android where PWAs
 * are still degraded.
 *
 * Bootstrap commands (run once after `npm run build`):
 *   npx cap add ios
 *   npx cap add android
 *   npx cap sync
 *   npx cap open ios     # opens Xcode
 *   npx cap open android # opens Android Studio
 */
const config: CapacitorConfig = {
  appId: "app.prometheus.mobile",
  appName: "PROMETHEUS",
  webDir: "dist",
  bundledWebRuntime: false,
  loggingBehavior: "production",
  ios: {
    contentInset: "always",
    backgroundColor: "#09090B",
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    backgroundColor: "#09090B",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: "https",
    iosScheme: "prometheus",
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: "#09090B",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#09090B",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
      iconColor: "#FF5A1F",
      sound: "default",
    },
  },
};

export default config;

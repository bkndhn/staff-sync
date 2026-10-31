// Public Firebase web-push settings (safe to ship: marked Public in the Firebase connection).
// Kept in code because the connector's VITE_ variables did not sync into the build, and the Vercel build has no connector env.
export const FIREBASE_WEB = {
  apiKey: "AIzaSyC_oFj3ouNN7d5aclt31gEWuNScr3_dmss",
  projectId: "zenhr-18c3e",
  appId: "1:369089036726:web:3c082e208faa8a2dc68117",
  vapidKey: "BCSLY2pc8kzZMsJJf2lYJritahgAWOmJTCnh-FKTtofG7B-W3nKj0_tcuU6KBl6y3331IDxF1Z8PSnRhbqakdlQ",
} as const;

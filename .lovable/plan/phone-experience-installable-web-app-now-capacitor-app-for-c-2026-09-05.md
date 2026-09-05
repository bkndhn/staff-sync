# Phone experience: installable web app now, Capacitor app for camera features

## The honest answer first

Face recognition and QR scanning will never be reliable in a plain browser/PWA, especially on Android and iPhone:

- iPhone (Safari) blocks camera access in a home-screen web app in several situations, and never gives you continuous background/kiosk camera.
- Browsers throttle the camera and CPU, so the face models run slowly and drop frames.
- Every scan re-downloads or re-reads large model files, and browser storage gets cleared.
- No control over screen-on, torch, autofocus, or preferred camera on many devices.

Capacitor solves almost all of this, and you do NOT need to rewrite the app natively. Your project already has Capacitor and an Android folder configured with camera, vibrate and wake-lock permissions. The right end state is:

- Installable web app for everyone (managers, staff self-service, payslips, leave).
- Capacitor Android app for attendance devices and any staff doing face/QR punching.
- A real from-scratch native app is not justified; Capacitor with native camera plugins gives you the same result at a fraction of the cost.

## What this plan builds

### 1. Installable web app (works today, all phones)
- Clean up the app manifest: correct name, colours, proper icon sizes (192, 512, maskable) instead of one reused image.
- Generate real app icons and an Apple touch icon.
- Add an "Install app" prompt: a small banner/button that appears when the phone offers installation, with iPhone instructions ("Share > Add to Home Screen") since Safari has no automatic prompt.
- Keep the existing offline behaviour untouched.

### 2. Make face + QR work properly in the Capacitor app
- Detect at runtime whether we are inside the installed Android app and switch camera handling to the native path.
- Face page: use the native camera preview with a continuous stream, keep the screen awake during a session, and add torch/front-back control.
- Ship the face model files inside the app bundle so they load from the device instead of the network (this is the single biggest speed win, seconds instead of tens of seconds).
- QR scanning: use a native barcode scanner in the app instead of the browser scanner, which fixes the failures you are seeing. Browser scanner stays as the fallback on the web.
- Clear on-screen message on the web version: "For face and QR punching, install the Staff Sync app" with the download link.

### 3. Ship the Android app
- Fix app id/name consistency and version code, and confirm permissions and splash.
- Document the exact commands to build a signed APK/AAB, plus the existing GitHub Actions APK build workflow.
- Distribution options: direct APK link for internal staff devices, or Play Store listing.

### 4. iPhone
- iPhone staff keep the installable web app for everything except face/QR.
- If iPhone face punching is required later, the same Capacitor project can produce an iOS build; that needs a Mac, Xcode and an Apple developer account, so it is kept as a separate follow-up.

## Recommended rollout order

1. Manifest, icons, install prompt (quick, benefits everyone).
2. Native camera + bundled models + native QR in the Capacitor app.
3. Signed Android build and distribution to attendance devices.
4. Optional iOS build later.

## Technical notes

- `public/manifest.json`: proper icon set, keep `display: standalone`, keep `start_url` and `id` unchanged so already-installed users are not broken.
- New `src/components/InstallPrompt.tsx` capturing `beforeinstallprompt`, with an iOS-specific instruction sheet; dismissal remembered in local storage.
- `src/hooks/useCapacitorCamera.ts` extended; face pages branch on `Capacitor.isNativePlatform()`.
- Add `@capacitor-mlkit/barcode-scanning` (or `@capacitor-community/barcode-scanner`) for native QR; existing `html5-qrcode` path kept for web.
- Copy `public/models` and `public/models-v2` into the Android assets at build time so face-api loads locally; keep the service-worker model cache for the web path.
- Keep `@capacitor/haptics` and add keep-awake handling during face sessions.
- No changes to attendance, payroll or backend logic.

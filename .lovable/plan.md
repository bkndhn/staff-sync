# Face recognition rebuild, device integration audit, per-client tax controls

## Part 1 — Why face recognition is not accurate today (verified in the code)

What the app actually does right now:

- Faces are turned into a "faceprint" by face-api.js (a 2018 model, 128 numbers per face). It was trained mostly on Western celebrity photos, so it struggles with Indian faces, side angles, beards/masks, spectacles and shop lighting.
- The code comments claim the strong detector (SSD MobileNet) is used, but the loaded detector is the weakest one (Tiny Face Detector). The stronger model files sit unused in the app.
- Google MediaPipe was added "for 10x speed", but after MediaPipe finds the face the code still runs the whole old detection again — so it is doing double work and gains nothing.
- Faces are never straightened before matching. Real systems rotate/scale the face onto a standard template using eye/nose/mouth points first. Without this, the same person at a slight tilt produces a noticeably different faceprint.
- Matching uses a single fixed cut-off (cosine 0.42, admin-tunable) against an averaged faceprint per person. With a weak model, no cut-off value works: strict = staff not recognised, loose = wrong person punched.
- Liveness (anti-photo) is home-made: blink detection plus texture blur. It is bypassable with a phone-screen video and it also rejects genuine staff in dim light.

Net effect: the model itself is the bottleneck. Capacitor alone will not fix it — a native shell makes the camera smoother, but a weak faceprint stays weak.

### Accuracy: before vs after (what to expect)

```text
                          Today (face-api 128-d)   After rebuild (ArcFace 512-d)
Faceprint model           ResNet-34, 2018          ArcFace / MobileFaceNet, 2024
Benchmark accuracy        ~99.4% LFW (easy set)    ~99.8% LFW, ~97% IJB-C (hard set)
Indian faces, shop light  weak                     strong
Side angle / cap / mask   often fails              tolerant to ~30 degrees
Face straightening        none                     5-point alignment
Wrong-person risk         real at loose settings   ~1 in 100k at same recall
Speed per frame (phone)   250-600 ms               40-90 ms native, 80-150 ms web
Anti-spoof                blink + blur guess       trained passive anti-spoof model
```

These are model-level published figures; the plan includes an in-app accuracy test so we measure your real numbers on your own staff before and after.

### What gets built

1. **New recognition engine.** Add an ArcFace-family ONNX model (512-d) running on onnxruntime-web, with proper 5-point face alignment before every faceprint. MediaPipe stays as the (single) detector — no double detection.
2. **Native acceleration in the Capacitor app.** Detection via Google ML Kit on Android, ONNX Runtime on the device's NNAPI/GPU, continuous camera preview, screen-awake, torch and front/back control. Web keeps the current path as fallback.
3. **Re-enrolment.** Old 128-d faceprints cannot be compared with new 512-d ones. Guided re-registration: 5 captures per person (front, left, right, up, low-light), quality-scored, admin approval; both formats stored side by side so nothing breaks during rollout, with a switchover date per branch.
4. **Smarter matching.** Top-1 vs top-2 margin check instead of a single threshold, per-branch adaptive threshold, and an automatic "unsure - confirm identity" path instead of a silent wrong punch.
5. **Real anti-spoof.** Passive anti-spoof model (screen/print/mask detection) plus optional random challenge (turn head) for high-value locations.
6. **Accuracy dashboard.** Run a test set of your staff photos, report recognition rate, false-accept rate, average match time, and per-branch failure hot spots — before and after, so the improvement is measurable.
7. **QR fallback fixed.** Native barcode scanner (ML Kit) inside the app; browser scanner stays for web.

## Part 2 — Device integration (eSSL and others): current state

Verified in the code:

- **eSSL / ZKTeco push protocol (iclock):** implemented, devices can post punches straight to the cloud, heartbeat recorded.
- **Local bridge agent:** a small program that runs on a shop PC and pulls punches from eSSL/ZK devices over the LAN every 30 seconds.
- **Cloud pull:** eSSL eTimeTrack Cloud, ZKBioTime, Realtime — server-side fetch, no credentials in the browser.
- **Device status screen** with online/offline and punches-today.

Gaps to close:

- Device credentials are held in the screen's local state, not stored securely per branch — reconnect needed after every reload.
- No command push to devices (enrol user, delete user, sync time, remote door/reboot) — only reading.
- No serial-number-to-branch registration/allow-list, so any device that knows the URL can post; needs a per-device secret.
- No duplicate/clock-drift protection on incoming punches, and no backfill when a device is offline for hours.
- No auto-mapping of device user IDs to staff, no alert when a device goes silent.
- Only eSSL/ZK/Realtime. Missing: Matrix, Mantra, Secureye, Hikvision, Suprema — all common in Indian retail.

Planned: secure per-device registration with secrets, encrypted credential storage per branch, command queue (enrol/delete/time-sync), duplicate and drift filtering, offline backfill, staff auto-mapping, silent-device alerts, plus Matrix/Hikvision/Suprema adapters.

## Part 3 — Per-client tax and statutory controls

Today there is only a TDS on/off switch with slab-or-flat mode. Planned settings screen, per client, with effective-from dates and full audit trail:

- **Income tax (TDS):** on/off, old vs new regime default, slab or flat, per-employee override, declaration window, and a lock so it cannot change mid-payroll.
- **Provident Fund:** on/off, wage ceiling (12,500/15,000/custom), employer share split, admin charges, VPF, exempt categories.
- **ESI:** on/off, wage threshold, employee/employer rates, contribution period handling.
- **Professional tax:** per-state slab tables, half-yearly states handled.
- **Labour Welfare Fund** and **gratuity/bonus** toggles.
- Preview panel showing the effect on a sample salary before saving, and a warning if a change affects an already-approved payroll run.

## Part 4 — What is still missing for world-class standard

Ranked by impact for your market:

1. Mobile-first staff app parity (leave, payslip, loans, attendance in one native app).
2. Shift rostering with auto-scheduling and overtime rules.
3. Full-and-final settlement workflow and exit checklist.
4. Recruitment/onboarding pipeline with document collection and expiry alerts.
5. Manager analytics: attrition risk, overtime cost, branch benchmarking.
6. WhatsApp Business API notifications (higher reach than push in India).
7. Multi-language staff interface (Hindi, Tamil, Telugu, Kannada, Bengali).
8. Biometric-free options: geofenced selfie punch, Bluetooth beacon, NFC card.
9. Accounting integrations: Tally, Zoho Books, QuickBooks.
10. SOC-2-style controls: data retention policy, DPDP Act consent for biometric data, per-tenant encryption keys.

Note on law: Indian DPDP Act treats face data as sensitive personal data — the rebuild will include explicit staff consent capture, retention limits and a delete-my-faceprint action.

## Technical notes

- New `src/lib/arcfaceEngine.ts`: onnxruntime-web session, WebGPU/WASM-SIMD execution providers, 112x112 aligned input, 512-d L2-normalised output.
- New `src/lib/faceAlign.ts`: 5-point similarity transform from MediaPipe landmarks to the ArcFace template.
- `src/hooks/useFaceEngine.ts`: remove the duplicate face-api pass; MediaPipe detect -> align -> ArcFace embed; face-api kept only for reading legacy 128-d records.
- `face_embeddings`: add `model_version`, `embedding_dim`, `quality_metrics`; matcher indexes per model version; rollout flag per branch.
- Matching in `src/lib/embeddingMatcher.ts`: add top-1/top-2 margin, per-branch threshold calibration stored in `app_settings`.
- Anti-spoof: replace heuristics in `src/lib/livenessEngine.ts` with an ONNX passive anti-spoof model, heuristics kept as fallback.
- Capacitor: add `@capacitor-mlkit/barcode-scanning` and `@capacitor-mlkit/face-detection` (or a custom plugin), bundle ONNX models into Android assets so nothing downloads at runtime, add keep-awake and torch control.
- Devices: new `device_registrations` table (serial, tenant, branch, shared secret, status), signature check in `supabase/functions/iclock`, encrypted vendor credentials, `device_commands` queue consumed by `getrequest`, dedupe on (device, staff, timestamp within 60s).
- Tax: extend `src/utils/statutoryDeductions.ts` with a versioned per-tenant `statutory_policy` record (effective_from), new settings UI replacing `TdsSettingsPanel`, payroll reads the policy version active for that month.

## Suggested order

1. ArcFace engine + alignment + accuracy dashboard (biggest accuracy win, works on web and native).
2. Re-enrolment flow and per-branch switchover.
3. Native camera/QR/anti-spoof in the Capacitor app.
4. Device integration hardening (secrets, commands, dedupe, alerts) then new vendor adapters.
5. Per-client tax and statutory settings.

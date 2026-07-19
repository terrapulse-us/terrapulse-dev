---
name: SOS Rollover Detection Feature Plan
description: Full plan for accelerometer-based vehicle rollover detection with auto-SOS — pending one new EAS build, then everything is OTA forever.
---

## What it does
Uses the phone accelerometer to detect a potential vehicle rollover, shows a blocking confirmation popup with a 45-second countdown, and auto-activates the SOS beacon if the rider doesn't respond.

## Requires a new EAS build
`expo-sensors` is NOT in the current native binary (`artifacts/mobile/package.json` has no expo-sensors entry as of 2026-07-19). Adding it requires one new Android + iOS EAS build. After that, all detection logic, UI, and threshold tuning are OTA-updatable forever.

## Detection algorithm
- Use `expo-sensors` `Accelerometer` API (subscribe at ~50–100ms interval)
- Apply a **low-pass filter** to isolate the gravity vector from road vibration/engine noise
- Track the **angle of the gravity vector** relative to its baseline over a rolling window
- **Trigger condition**: gravity vector rotates >~70° within a 2–3 second window AND stays in the new orientation (sustained tilt — the key differentiator from bumps, drops, or rock crawling impacts)
- Start with conservative thresholds; plan to tune against real trail driving and deliberate phone-drop tests before going live

## False-positive risks specific to off-road use
- Rock crawling (extreme body angles, sustained tilt on side-hills)
- Large drops/ledges (big vertical G spike but gravity snaps back)
- Dropped/thrown phone
The "stays there" sustained-tilt requirement is the main guard. May also need a minimum speed threshold or a "driving" gate (GPS speed > 2 mph) to suppress triggers while stationary.

## UX flow (user-confirmed design)
1. Rollover signature detected → **blocking full-screen popup** appears immediately, prevents any other app use
2. Popup shows: "Possible rollover detected — Are you OK?" + 45-second countdown timer
3. Two buttons:
   - **YES, I ROLLED OVER** → activate SOS beacon immediately (pre-filled note: rider confirmed rollover)
   - **FALSE ALARM** (dropped phone / accidental) → dismiss, no SOS
4. If countdown expires with no response → SOS auto-activates with note: **"Potential vehicle rollover — no response from rider"**
5. Nearby riders within **50 miles** receive the existing proximity alert (the pop-up we already built) with that note visible, and View Beacon / Dismiss options

## Integration points in existing code
- SOS beacon activation: reuse `activateSos` callback in `map.tsx` (or a stripped version without the modal flow)
- Proximity alert: already built — fires automatically for new beacons within configurable distance
- The rollover note populates `sosNote` which appears in the beacon detail sheet and the proximity alert body

## Build checklist (for when ready)
1. `pnpm --filter @workspace/mobile add expo-sensors` → triggers lock file change → new EAS build required
2. Implement rollover detector hook (`lib/use-rollover-detector.ts`) — isolated, testable
3. Mount in `map.tsx` (or `_layout.tsx` so it runs app-wide, not just on the map tab)
4. Blocking modal component with countdown
5. Tune thresholds against real-world testing before shipping

## Open questions the user wants to think through before building
- Should detection run app-wide (`_layout`) or only on the map tab?
- Minimum speed gate? (suppress if GPS speed < 2 mph to avoid false trigger while parked on a slope)
- Should the feature be user-toggleable (e.g. a setting in Profile)?
- Any other edge cases specific to their riding scenarios

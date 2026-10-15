# HI Acceptor — implementation plan

## Product scope

Build a free Android ride-request auto-accept utility based on the user-linked video. The app is configured on-device and supports Jeeny and Bolt Driver. It evaluates a request only when the fare is within the driver's inclusive minimum/maximum, pickup time is no greater than the configured maximum, and no excluded destination keyword appears. Unknown or ambiguous fare/time data must fail closed and never trigger a tap. Preferred-location terms are a visible match annotation, not an override of the hard criteria. The example defaults mirror the video: SAR 12–80, pickup limit 5 minutes, exclusions `Airport` and `مطار`, and preferred term `hamara`.

There is no payment, paid activation, account activation, Telegram/WhatsApp gate, subscription, or unlock mechanism. No account, backend, or network call is needed for product behavior; settings and local activity are stored on-device. A built-in web preview can exercise the rule simulator but cannot provide Android Accessibility behavior. Android system permission is explicit and user-controlled. Do not advise disabling Play Protect or other device security controls.

## Implementation approach

- Keep rule parsing/evaluation in a pure TypeScript module for testability and a web simulator. Parse a fare only with a currency/price context and pickup ETA only with a pickup/time context; ambiguous or missing fields produce a no-accept outcome.
- Add a local Expo module with a native Android `AccessibilityService` and a small bridge. Limit screen inspection to the selected official app package IDs (`me.com.easytaxista` for Jeeny Driver and `ee.mtakso.driver` for Bolt Driver). The service reads only accessibility text from those foreground apps, only while the user has enabled both the Android service and HI Acceptor's operation switch. It finds an explicit accept control, taps at most once per request, debounces repeated UI events, and stores a compact local status record. Do not transmit screen text.
- Store rules locally, synchronize them to the native service, and show a clear permission/on/off state. Require explicit Android Accessibility permission. Missing permission, unsupported app, incomplete parse, ambiguous request, or missing accept button means no action.
- Use local notifications for a successful auto-accept when the user grants notification permission. The web preview remains a simulator and labels itself as such.
- Keep the scaffold's unused server/database adapters out of the product flow. Do not implement login, payment, activation, messaging, or remote telemetry.

## Project structure

- `app/(tabs)/index.tsx`: operation dashboard, permission state, active control, local status, and simulator.
- `app/(tabs)/rules.tsx`: fare bounds, pickup limit, currency/region, app selection, and keyword lists.
- `app/(tabs)/privacy.tsx`: local-data explanation, Accessibility disclosure, and permission controls.
- `lib/ride-rules.ts`: pure parsing, eligibility, and preferred-term annotation.
- `lib/hi-acceptor-native.ts`: typed optional native bridge with a non-Android preview fallback.
- `modules/hi-acceptor/`: Android Expo module, AccessibilityService, and local settings/status bridge.
- `plugins/withHiAcceptorAccessibility.ts`: config plugin that registers the service and its XML configuration in Android builds.
- `tests/ride-rules.test.ts`: rule parsing and decision tests.
- `assets/images/`: launcher, splash, adaptive icon and monochrome assets.
- `plan.md` and `TODO.md`: design/implementation decisions and outcome tracking.

## Interface design

### Style options considered (sampled low-probability choices)
- Quiet civic instrument — 0.06.
- High-contrast night dispatch — 0.04.
- Warm utility ledger — 0.02.

### Selected: Quiet civic instrument

- **Design movement:** calm public-service instrument panel, with the clarity of a transit operations console.
- **Core principles:** explicit operational state; transparent reasons for each decision; local-first privacy; one-handed, forgiving controls.
- **Color philosophy:** warm off-white and graphite for neutral surfaces, a distinctive clear teal for enabled/eligible states, and restrained amber for caution; red is reserved for blocked/unsafe states.
- **Layout paradigm:** a vertical mobile flow with a distinctive status rail at the top, a single prominent operation control, then stacked rule/status cards rather than a dense dashboard grid.
- **Signature elements:** a thin route-line motif, compact fare-range meter, and reason chips for accepted/skipped requests.
- **Interaction philosophy:** automation is opt-in, visible, immediately stoppable, and never silently falls back to a different target app.
- **Animation:** a soft, slow pulse only while active; short state transitions; no looping motion when inactive.
- **Typography system:** platform system sans for excellent Android rendering; large numeric fare bounds; clear label/value contrast and readable Arabic text.
- **Brand essence:** a transparent ride-filter assistant for drivers that accepts only the requests they configured; direct, careful, dependable.
- **Brand voice:** concise, factual, and non-promotional. Examples: “Only requests inside your rules can be accepted.” “No request data leaves this phone.”
- **Wordmark & logo:** compact route/check symbol built from two road strokes converging into a check; no tiny lettering.
- **Signature brand color:** clear teal (`#20B7A5`).

## Integration facts

Official Google Play pages identify Jeeny Driver as package `me.com.easytaxista` and Bolt Driver as `ee.mtakso.driver`. Sources: [Jeeny Driver on Google Play](https://play.google.com/store/apps/details?id=me.com.easytaxista&hl=en_US) and [Bolt Driver on Google Play](https://play.google.com/store/apps/details?id=ee.mtakso.driver&hl=en_US). These package names are used solely to scope the Accessibility listener to the selected driver app.

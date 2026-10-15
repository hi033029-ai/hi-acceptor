# HI Acceptor

A free, community-built Android utility for applying driver-defined rules to ride requests in Jeeny Driver and Bolt Driver.

## What it does

HI Acceptor lets the driver configure minimum/maximum fare, maximum pickup time, region/currency, selected driver app, excluded destination terms, and preferred destination terms. A request is eligible only when the fare and pickup time are clearly identified, the fare is inside the inclusive range, pickup is within the configured limit, the currency matches, the destination is known, and no excluded term appears. Preferred terms add a note; they never override hard filters. Missing or ambiguous information is skipped.

The video examples are seeded as SAR 12–80, a five-minute pickup limit, exclusions `Airport` and `مطار`, and preferred term `hamara`.

## Free and account-free

There is no paid activation, account activation, login, subscription, payment, Telegram/WhatsApp gate, or unlock. HI Acceptor does not send ride-screen text or request data to its own backend. Preferences and recent status are stored on-device.

## Android permission and safety

The native Android Accessibility service is scoped to the selected driver app package: Jeeny Driver (`me.com.easytaxista`) or Bolt Driver (`ee.mtakso.driver`). The driver must separately enable the Android service and press Start in HI Acceptor. Android Accessibility can read visible screen content and interact with controls; the service only attempts a tap when all request fields pass and an explicit Accept button is found. Unsupported or unclear screens are skipped. Automation can be stopped in the app or by disabling the service in Android Settings. **Do not disable Play Protect or other device security protections.** HI Acceptor is independent of Jeeny and Bolt; drivers remain responsible for their choices and applicable service rules.

The web Preview is a simulator only. It cannot read other apps or perform real taps. Native behavior requires an Android development or release build and validation on a supported device; screen layouts may change in third-party app updates.

## Development

This project uses Expo Router, React Native, TypeScript, and a small local Kotlin Expo module.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm dev
```

Use an Android custom development build to verify the Accessibility module. The platform Dashboard can build the Android artifact from accepted project source; do not treat a web Preview as device verification.

## Source

This project is maintained in the private GitHub repository [hi033029-ai/hi-acceptor](https://github.com/hi033029-ai/hi-acceptor).

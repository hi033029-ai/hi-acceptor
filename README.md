# HI Acceptor

A free, community-built Android utility for applying driver-defined ride rules in the selected driver app.

## How the rules work

The driver enters their own minimum fare, maximum fare, and pickup-time limit; the app has no seeded 12–80 fare range. A valid user-entered fare range is required before Start is enabled. Fare endpoints are inclusive.

Location filtering is configured entirely inside HI Acceptor and is independent of which supported driver app is monitored. Drivers can draw up to five excluded circles and one optional preferred circle. A circle is a selected map center plus an adjustable 250 m–10 km radius. A ride confirmed inside an excluded circle is declined only when an explicit decline control is found. A ride with an unclear location, or a missing decline control, is not guessed. The preferred circle only marks matching rides; it never overrides fare, pickup, currency, or exclusion rules.

The area picker uses Leaflet and OpenStreetMap tiles with required attribution. Map tiles are online-only and requested only while the user views the map. Ride destination names are resolved with Android's system Geocoder only when circle matching is needed. Android may use a network geocoding provider; if a destination cannot be uniquely resolved, a request is skipped. The app does not call public Nominatim. See [`docs/location-data.md`](docs/location-data.md) for provider constraints.

## Free and account-free

There is no paid activation, account activation, login, subscription, payment, Telegram/WhatsApp gate, or unlock. Settings and activity remain on-device. Screen text is not sent to HI Acceptor servers.

## Android permission and safety

The native Android Accessibility service is scoped to the selected supported driver app package: Jeeny Driver (`me.com.easytaxista`) or Bolt Driver (`ee.mtakso.driver`). The driver must enable the Android service and press Start in HI Acceptor. Accessibility can read visible screen content and interact with controls. HI Acceptor taps Accept only after all configured rules pass; it taps a decline control only after a destination has been confirmed inside an excluded circle and an explicit decline control is found. Unsupported, ambiguous, or unresolved requests are not guessed. Automation can be stopped in the app or by disabling the service in Android Settings. **Do not disable Play Protect or other device security protections.** HI Acceptor is independent of the ride services; drivers remain responsible for their choices and applicable terms.

The web Preview is simulator-only. It cannot read other apps or perform real taps. Native behavior requires an Android build and testing on a supported device because ride-screen layouts may change.

## Development

This project uses Expo Router, React Native, TypeScript, React Native WebView, and a local Kotlin Expo module.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm dev
```

Use a custom Android build to verify the Accessibility service, geocoder, map picker, and screen layouts on-device.

## Source

This project is maintained in the private GitHub repository [hi033029-ai/hi-acceptor](https://github.com/hi033029-ai/hi-acceptor).

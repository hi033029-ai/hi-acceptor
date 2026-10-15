# HI Acceptor — implementation plan

## Product scope

HI Acceptor is a free, account-free Android utility. The driver sets their own inclusive minimum and maximum fare plus a pickup-time limit; there is no seeded SAR 12–80 range. A valid fare range is required before operation can start.

Location circles are created and stored in HI Acceptor, independently from the selected driver app. The driver may configure up to five excluded circles and one optional preferred circle. Each circle contains a user-picked map center and an adjustable radius from 250 metres to 10 kilometres. Any unambiguously located request inside an excluded circle is declined only when an explicit decline control is identified. A preferred circle annotates a match without overriding fare, pickup, currency, or exclusion rules. Unknown location, ambiguous geocoding, missing controls, and unsupported content fail closed.

## Privacy and provider scope

There is no HI Acceptor account, payment/activation, messaging gate, or HI Acceptor backend data path. Rules and status stay on-device. When the map picker is opened, it loads online OpenStreetMap tiles with attribution; there is no offline tile downloading. When configured circles need matching, Android's system Geocoder may send a visible destination name to the device provider to resolve coordinates. Disclose this and do not call the public Nominatim API. See [`docs/location-data.md`](docs/location-data.md) for the reviewed provider constraints.

## Implementation approach

- Keep parsing and circle distance checks in a pure TypeScript module with deterministic tests and a simulator.
- Implement Android Accessibility service support for the selected Jeeny Driver and Bolt Driver package IDs. The service reads only the selected foreground app, only with explicit Android Accessibility and the HI Acceptor Start switch both enabled.
- For excluded zones, resolve the destination with Android's system Geocoder and compare it against saved circles. Decline only a uniquely resolved in-circle request and only via an explicit decline control. If location checks are not possible, do not accept or decline based on a guessed location.
- Accept only a request that passes user-entered fare, currency, pickup, and exclusion rules and has a clearly identified accept control.
- Store settings and status locally. The Preview is simulator-only; real behavior requires a native Android build and device verification. Do not advise disabling Play Protect or other Android security controls.

## Main project areas

- `app/(tabs)/index.tsx`: operation dashboard, user-rule summary, and simulator.
- `app/(tabs)/rules.tsx`: driver-chosen fare bounds, pickup limit, app selection, and independently selected map circles.
- `components/AreaPicker.native.tsx`: Leaflet/OpenStreetMap tap-to-center circle picker with radius control.
- `components/AreaPicker.web.tsx`: preview-only coordinate editor.
- `app/(tabs)/privacy.tsx`: Accessibility, local storage, map, and geocoder disclosures.
- `lib/ride-rules.ts`: request rules, Haversine distance, and circle matching.
- `lib/hi-acceptor-store.ts`: local storage and the five-excluded/one-preferred caps.
- `modules/hi-acceptor/`: Android Expo module and Accessibility service.
- `plugins/withHiAcceptorAccessibility.ts`: Android service manifest configuration.
- `tests/ride-rules.test.ts`: rule and circle tests.
- `docs/location-data.md`: OSM/geocoder usage constraints and official references.

## Visual direction

Use a clear, calm utility interface: large fare values, a visible operation state, one-handed cards, teal for enabled/matched states, amber for cautions, and red for blocked actions. Keep operation opt-in and immediately stoppable. Never silently switch to another target app.

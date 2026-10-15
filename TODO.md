# HI Acceptor — delivery outcomes

- [x] **Free and ungated** — no paid activation, account/Telegram/WhatsApp activation, login, subscription, payment, or unlock.
- [x] **Fare limits chosen by the driver** — the previous 12–80 preset is removed. Start stays blocked until the driver sets a valid minimum and maximum.
- [x] **App-independent circles** — configure up to five excluded circles and one optional preferred circle inside HI Acceptor. Each circle is a map-selected center plus an adjustable 250 m–10 km radius, independent of the selected driver app.
- [x] **Excluded-area handling** — an explicitly resolved destination inside an excluded circle is declined only when an explicit decline control is detected. If the destination cannot be uniquely resolved, or the control cannot be found, no button is guessed.
- [x] **Preferred-area handling** — an optional single preferred circle marks matching requests; it never overrides fare, pickup, currency, or exclusion rules.
- [x] **Provider/privacy transparency** — map tiles load online when viewing the circle picker. Android's system Geocoder may send the visible destination name to the device provider when zone matching is needed; if no unique location is found the request is skipped. Public Nominatim is not called.
- [ ] **Native Android verification** — TypeScript, circle-rule tests, web export and Android prebuild can be checked in this environment; compiling/installing an APK and verifying Geocoder/maps against real Jeeny/Bolt screens still requires an Android SDK and device.

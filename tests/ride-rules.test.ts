import { describe, expect, it } from "vitest";
import { evaluateRide, evaluateText, parseRideRequest } from "../lib/ride-rules";
import { DEFAULT_SETTINGS } from "../lib/hi-acceptor-store";

describe("ride eligibility rules", () => {
  it("accepts an inclusive fare range and pickup boundary", () => {
    const result = evaluateRide({ fare: 12, currency: "SAR", pickupMinutes: 5, destination: "City Center" }, DEFAULT_SETTINGS);
    expect(result.eligible).toBe(true);
  });
  it("rejects fares below or above the configured range", () => {
    expect(evaluateRide({ fare: 11.99, currency: "SAR", pickupMinutes: 2, destination: "Center" }, DEFAULT_SETTINGS).eligible).toBe(false);
    expect(evaluateRide({ fare: 80.01, currency: "SAR", pickupMinutes: 2, destination: "Center" }, DEFAULT_SETTINGS).eligible).toBe(false);
  });
  it("rejects pickup time over the configured limit", () => {
    expect(evaluateRide({ fare: 40, currency: "SAR", pickupMinutes: 5.1, destination: "Center" }, DEFAULT_SETTINGS).eligible).toBe(false);
  });
  it("rejects excluded keywords case-insensitively and in Arabic", () => {
    expect(evaluateRide({ fare: 40, currency: "SAR", pickupMinutes: 3, destination: "Airport Road" }, DEFAULT_SETTINGS).eligible).toBe(false);
    expect(evaluateRide({ fare: 40, currency: "SAR", pickupMinutes: 3, destination: "مطار الملك خالد" }, DEFAULT_SETTINGS).eligible).toBe(false);
  });
  it("marks a preferred destination without changing hard eligibility", () => {
    const result = evaluateRide({ fare: 40, currency: "SAR", pickupMinutes: 3, destination: "hamara" }, DEFAULT_SETTINGS);
    expect(result.eligible).toBe(true);
    expect(result.preferred).toBe(true);
  });
  it("fails closed when fare, ETA, or destination is missing", () => {
    expect(evaluateRide({ text: "", pickupMinutes: 3, destination: "Center" }, DEFAULT_SETTINGS).eligible).toBe(false);
    expect(evaluateRide({ fare: 40, text: "", destination: "Center" }, DEFAULT_SETTINGS).eligible).toBe(false);
    expect(evaluateRide({ fare: 40, pickupMinutes: 3, text: "" }, DEFAULT_SETTINGS).eligible).toBe(false);
  });
  it("parses explicitly labeled request details", () => {
    const parsed = parseRideRequest("Price: SAR 24 · Pickup 4 min · Destination: City Center");
    expect(parsed.fare).toBe(24);
    expect(parsed.currency).toBe("SAR");
    expect(parsed.pickupMinutes).toBe(4);
    expect(parsed.destination).toBe("City Center");
  });
  it("does not infer a fare from an unlabeled number", () => {
    expect(evaluateText("24 SAR · pickup 4 min · destination: Center", DEFAULT_SETTINGS).eligible).toBe(false);
  });
});

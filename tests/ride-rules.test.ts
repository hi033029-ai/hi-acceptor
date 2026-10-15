import { describe, expect, it } from "vitest";
import { distanceMeters, evaluateRide, evaluateText, parseRideRequest } from "../lib/ride-rules";
import { DEFAULT_SETTINGS } from "../lib/hi-acceptor-store";

const excluded = { id: "airport", label: "Airport zone", latitude: 24.7136, longitude: 46.6753, radiusMeters: 1000 };
const preferred = { id: "preferred", label: "Preferred zone", latitude: 24.7136, longitude: 46.6753, radiusMeters: 1000 };
const settings = { ...DEFAULT_SETTINGS, minFare: 20, maxFare: 100, excludedAreas: [excluded], preferredArea: preferred };
const request = { fare: 40, currency: "SAR", pickupMinutes: 3, destination: "Destination", destinationLatitude: 24.7139, destinationLongitude: 46.6755 };

describe("ride eligibility rules", () => {
  it("does not invent fare limits and blocks until the driver sets both", () => {
    expect(DEFAULT_SETTINGS.minFare).toBe(0);
    expect(DEFAULT_SETTINGS.maxFare).toBe(0);
    expect(evaluateRide({ ...request }, DEFAULT_SETTINGS).eligible).toBe(false);
  });
  it("accepts an inclusive user-selected fare range and pickup boundary", () => {
    const result = evaluateRide({ ...request, fare: 20, pickupMinutes: 5, destinationLatitude: 25, destinationLongitude: 47 }, settings);
    expect(result.eligible).toBe(true);
  });
  it("rejects fares below or above the user-selected range", () => {
    expect(evaluateRide({ ...request, fare: 19.99, destinationLatitude: 25, destinationLongitude: 47 }, settings).eligible).toBe(false);
    expect(evaluateRide({ ...request, fare: 100.01, destinationLatitude: 25, destinationLongitude: 47 }, settings).eligible).toBe(false);
  });
  it("rejects pickup time over the configured limit", () => {
    expect(evaluateRide({ ...request, pickupMinutes: 5.1, destinationLatitude: 25, destinationLongitude: 47 }, settings).eligible).toBe(false);
  });
  it("rejects a destination inside an excluded circle, including its boundary", () => {
    const inside = evaluateRide(request, settings);
    expect(inside.eligible).toBe(false);
    expect(inside.reason).toContain("Airport zone");
    const boundaryLat = 24.7136 + 1000 / 111320;
    expect(evaluateRide({ ...request, destinationLatitude: boundaryLat, destinationLongitude: 46.6753 }, settings).eligible).toBe(false);
  });
  it("accepts a point outside the excluded radius and marks an in-circle preferred point", () => {
    const far = evaluateRide({ ...request, destinationLatitude: 24.73, destinationLongitude: 46.6755 }, settings);
    expect(far.eligible).toBe(true);
    expect(far.preferred).toBe(false);
    expect(evaluateRide({ ...request, destinationLatitude: 25, destinationLongitude: 47 }, { ...settings, excludedAreas: [] }).eligible).toBe(true);
  });
  it("fails closed for excluded circles when destination coordinates are missing", () => {
    const result = evaluateRide({ fare: 40, currency: "SAR", pickupMinutes: 3, destination: "Airport" }, settings);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/could not be verified/i);
  });
  it("marks the one configured preferred circle without overriding other rules", () => {
    const result = evaluateRide(request, { ...settings, excludedAreas: [] });
    expect(result.eligible).toBe(true);
    expect(result.preferred).toBe(true);
    expect(evaluateRide({ ...request, fare: 10 }, { ...settings, excludedAreas: [] }).eligible).toBe(false);
  });
  it("measures a circle radius in meters", () => {
    expect(distanceMeters(0, 0, 0, 0)).toBe(0);
    expect(distanceMeters(24.7136, 46.6753, 24.7136, 46.6865)).toBeGreaterThan(1000);
  });
  it("fails closed when fare, ETA, or destination is missing", () => {
    expect(evaluateRide({ text: "", pickupMinutes: 3, destination: "Center" }, settings).eligible).toBe(false);
    expect(evaluateRide({ fare: 40, text: "", destination: "Center" }, settings).eligible).toBe(false);
    expect(evaluateRide({ fare: 40, pickupMinutes: 3, text: "" }, settings).eligible).toBe(false);
  });
  it("parses explicitly labeled request details", () => {
    const parsed = parseRideRequest("Price: SAR 24 · Pickup 4 min · Destination: City Center");
    expect(parsed.fare).toBe(24);
    expect(parsed.currency).toBe("SAR");
    expect(parsed.pickupMinutes).toBe(4);
    expect(parsed.destination).toBe("City Center");
  });
  it("does not infer a fare from an unlabeled number", () => {
    expect(evaluateText("24 SAR · pickup 4 min · destination: Center", settings).eligible).toBe(false);
  });
});

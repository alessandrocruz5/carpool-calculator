import { describe, expect, it } from "vitest";
import {
  fromDbFillup,
  toDbFillupInsert,
  fromDbPassenger,
  fromDbSettings,
  toDbSettingsPatch,
  gasPriceFromDb,
  fromDbTrip,
} from "./mappers";

describe("fillup mappers", () => {
  it("round-trips fillup fields", () => {
    const db = {
      id: "u1",
      date: "2026-05-13",
      liters: 30.5,
      total_php: 2745,
      odometer_km: 12345.6,
      created_at: "2026-05-13T00:00:00Z",
    };
    const f = fromDbFillup(db);
    expect(f).toEqual({
      id: "u1",
      date: "2026-05-13",
      liters: 30.5,
      totalPhp: 2745,
      odometerKm: 12345.6,
    });
    expect(toDbFillupInsert(f)).toEqual({
      date: "2026-05-13",
      liters: 30.5,
      total_php: 2745,
      odometer_km: 12345.6,
    });
  });
});

describe("passenger mapper", () => {
  it("strips created_at", () => {
    expect(
      fromDbPassenger({
        id: "p1",
        name: "Ana",
        active: true,
        created_at: "x",
      })
    ).toEqual({ id: "p1", name: "Ana", active: true });
  });
});

describe("settings mappers", () => {
  it("returns 0 mileage when override is null", () => {
    const r = fromDbSettings({
      id: 1,
      mileage_kml_override: null,
      round_trip_km: 42,
      parking_fee_php: 90,
      toll_skyway_php: 164,
      toll_slex_php: 124,
      split_1p_driver: 40,
      split_2p_driver: 25,
      split_3p_driver: 19,
      updated_at: "x",
    });
    expect(r.mileageKmPerL).toBe(0);
    expect(r.roundTripKm).toBe(42);
    expect(r.split2pDriver).toBe(25);
  });

  it("converts partial patches to snake_case, dropping unset fields", () => {
    expect(toDbSettingsPatch({ parkingFeePhp: 100 })).toEqual({
      parking_fee_php: 100,
    });
    expect(toDbSettingsPatch({ mileageKmPerL: 11.2, split1pDriver: 45 })).toEqual({
      mileage_kml_override: 11.2,
      split_1p_driver: 45,
    });
  });
});

describe("gas price mapper", () => {
  it("reads price and timestamp", () => {
    expect(
      gasPriceFromDb({
        id: "g1",
        effective_date: "2026-05-13",
        price_per_liter: 65.55,
        station_name: "Petron",
        created_at: "2026-05-13T03:00:00Z",
      })
    ).toEqual({ gasPrice: 65.55, gasPriceUpdatedAt: "2026-05-13T03:00:00Z" });
  });
});

describe("trip mapper", () => {
  it("flattens legs and riders", () => {
    const t = fromDbTrip(
      {
        id: "t1",
        date: "2026-05-13",
        gas_price_id: "g1",
        parking_fee_php: 90,
        notes: null,
        created_at: "x",
        trip_legs: [
          {
            id: "l1",
            trip_id: "t1",
            leg: "morning",
            route: "skyway",
            trip_leg_riders: [
              { trip_leg_id: "l1", passenger_id: "p1" },
              { trip_leg_id: "l1", passenger_id: "p2" },
            ],
          },
          {
            id: "l2",
            trip_id: "t1",
            leg: "evening",
            route: "slex",
            trip_leg_riders: [{ trip_leg_id: "l2", passenger_id: "p1" }],
          },
        ],
      },
      65.5
    );
    expect(t.morning.route).toBe("skyway");
    expect(t.morning.passengerIds).toEqual(["p1", "p2"]);
    expect(t.evening.route).toBe("slex");
    expect(t.evening.passengerIds).toEqual(["p1"]);
    expect(t.gasPrice).toBe(65.5);
    expect(t.parkingFee).toBe(90);
  });
});

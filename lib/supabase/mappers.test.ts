import { describe, expect, it } from "vitest";
import {
  fromDbCar,
  fromDbFillup,
  fromDbGroup,
  fromDbPassenger,
  fromDbProfile,
  fromDbSettings,
  fromDbTrip,
  gasPriceFromDb,
  toDbCarInsert,
  toDbFillupInsert,
  toDbGroupInsert,
  toDbProfilePatch,
  toDbSettingsPatch,
} from "./mappers";

describe("fillup mappers", () => {
  it("round-trips fillup fields", () => {
    const db = {
      id: "u1",
      group_id: "g1",
      car_id: null,
      date: "2026-05-13",
      liters: 30.5,
      total_php: 2745,
      odometer_km: 12345.6,
      created_at: "2026-05-13T00:00:00Z",
    };
    const f = fromDbFillup({ ...db, car_id: "c1", owner_user_id: "u9" });
    expect(f).toEqual({
      id: "u1",
      carId: "c1",
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
      car_id: "c1",
    });
    expect(toDbFillupInsert(f, { groupId: "g1", ownerUserId: "u9" })).toEqual({
      date: "2026-05-13",
      liters: 30.5,
      total_php: 2745,
      odometer_km: 12345.6,
      car_id: "c1",
      group_id: "g1",
      owner_user_id: "u9",
    });
  });
});

describe("passenger mapper", () => {
  it("strips created_at", () => {
    expect(
      fromDbPassenger({
        id: "p1",
        group_id: "g1",
        name: "Ana",
        active: true,
        created_at: "x",
      })
    ).toEqual({ id: "p1", name: "Ana", active: true });
  });
});

describe("settings mappers", () => {
  it("reports no override (0) when mileage override is null", () => {
    const r = fromDbSettings({
      group_id: "g1",
      mileage_kml_override: null,
      mileage_override_enabled: false,
      round_trip_km: 42,
      parking_fee_php: 90,
      toll_skyway_php: 164,
      toll_slex_php: 124,
      split_1p_driver: 40,
      split_2p_driver: 25,
      split_3p_driver: 19,
      split_4p_driver: 16,
      updated_at: "x",
    });
    // 0 signals "no manual override" so callers fall back to the measured
    // rolling average instead of masking it with the default.
    expect(r.mileageKmPerL).toBe(0);
    expect(r.mileageOverrideEnabled).toBe(false);
    expect(r.roundTripKm).toBe(42);
    expect(r.split2pDriver).toBe(25);
  });

  it("reads the mileage override toggle", () => {
    const base = {
      group_id: "g1",
      mileage_kml_override: 12.5,
      round_trip_km: 42,
      parking_fee_php: 90,
      toll_skyway_php: 164,
      toll_slex_php: 124,
      split_1p_driver: 40,
      split_2p_driver: 25,
      split_3p_driver: 19,
      split_4p_driver: 16,
      updated_at: "x",
    };
    expect(
      fromDbSettings({ ...base, mileage_override_enabled: true }).mileageOverrideEnabled
    ).toBe(true);
    expect(toDbSettingsPatch({ mileageOverrideEnabled: true })).toEqual({
      mileage_override_enabled: true,
    });
    expect(toDbSettingsPatch({ mileageOverrideEnabled: false })).toEqual({
      mileage_override_enabled: false,
    });
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

  it("clears the mileage override to NULL when set to 0", () => {
    expect(toDbSettingsPatch({ mileageKmPerL: 0 })).toEqual({
      mileage_kml_override: null,
    });
  });
});

describe("gas price mapper", () => {
  it("reads price and timestamp", () => {
    expect(
      gasPriceFromDb({
        id: "g1",
        group_id: "g1",
        effective_date: "2026-05-13",
        price_per_liter: 65.55,
        station_name: "Petron",
        created_at: "2026-05-13T03:00:00Z",
      })
    ).toEqual({ gasPrice: 65.55, gasPriceUpdatedAt: "2026-05-13T03:00:00Z" });
  });
});

describe("group mappers", () => {
  it("maps from db row", () => {
    expect(
      fromDbGroup({
        id: "g1",
        name: "Carpool",
        owner_user_id: "u1",
        created_at: "x",
      })
    ).toEqual({ id: "g1", name: "Carpool", ownerUserId: "u1", createdAt: "x" });
  });

  it("converts new-group payload to snake_case", () => {
    expect(toDbGroupInsert({ name: "Carpool", ownerUserId: "u1" })).toEqual({
      name: "Carpool",
      owner_user_id: "u1",
    });
  });
});

describe("profile mappers", () => {
  it("maps from db row", () => {
    expect(
      fromDbProfile({
        user_id: "u1",
        display_name: "Ana",
        avatar_url: null,
        created_at: "x",
        updated_at: "x",
      })
    ).toEqual({ userId: "u1", displayName: "Ana", avatarUrl: null });
  });

  it("converts partial patches, dropping unset fields", () => {
    expect(toDbProfilePatch({ displayName: "Ana" })).toEqual({
      display_name: "Ana",
    });
    expect(toDbProfilePatch({ avatarUrl: null })).toEqual({ avatar_url: null });
    expect(toDbProfilePatch({})).toEqual({});
  });
});

describe("car mappers", () => {
  it("maps from db row and coerces numeric strings", () => {
    expect(
      fromDbCar({
        id: "c1",
        owner_user_id: "u1",
        name: "Civic",
        fuel_efficiency_kml: "12.5" as unknown as number,
        tank_size_liters: "45" as unknown as number,
        max_passengers: null,
        created_at: "x",
      })
    ).toEqual({
      id: "c1",
      ownerUserId: "u1",
      name: "Civic",
      fuelEfficiencyKml: 12.5,
      tankSizeLiters: 45,
      maxPassengers: null,
    });
  });

  it("passes null efficiency/tank through", () => {
    const c = fromDbCar({
      id: "c1",
      owner_user_id: "u1",
      name: "Civic",
      fuel_efficiency_kml: null,
      tank_size_liters: null,
      max_passengers: null,
      created_at: "x",
    });
    expect(c.fuelEfficiencyKml).toBeNull();
    expect(c.tankSizeLiters).toBeNull();
    expect(c.maxPassengers).toBeNull();
  });

  it("converts new-car payload to snake_case", () => {
    expect(
      toDbCarInsert({
        ownerUserId: "u1",
        name: "Civic",
        fuelEfficiencyKml: 12.5,
        tankSizeLiters: 45,
        maxPassengers: 4,
      })
    ).toEqual({
      owner_user_id: "u1",
      name: "Civic",
      fuel_efficiency_kml: 12.5,
      tank_size_liters: 45,
      max_passengers: 4,
    });
  });
});

describe("trip mapper", () => {
  it("flattens legs and riders", () => {
    const t = fromDbTrip(
      {
        id: "t1",
        group_id: "g1",
        car_id: null,
        driver_user_id: null,
        date: "2026-05-13",
        gas_price_id: "g1",
        parking_fee_php: 90,
        notes: null,
        created_at: "x",
        trip_legs: [
          {
            id: "l1",
            group_id: "g1",
            trip_id: "t1",
            leg: "morning",
            route: "skyway",
            distance_km: 21,
            trip_leg_riders: [
              { group_id: "g1", trip_leg_id: "l1", passenger_id: "p1" },
              { group_id: "g1", trip_leg_id: "l1", passenger_id: "p2" },
            ],
          },
          {
            id: "l2",
            group_id: "g1",
            trip_id: "t1",
            leg: "evening",
            route: "slex",
            distance_km: 25,
            trip_leg_riders: [
              { group_id: "g1", trip_leg_id: "l2", passenger_id: "p1" },
            ],
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

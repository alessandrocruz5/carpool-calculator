import type { Fillup } from "@/lib/mileage";
import type { CalcSettings } from "@/lib/calc";
import type { Passenger } from "@/lib/store/roster";
import type { StoredTrip } from "@/lib/store/trips";
import type {
  DbFillup,
  DbGasPrice,
  DbPassenger,
  DbSettings,
  DbTrip,
  DbTripLeg,
  DbTripLegRider,
} from "./types";

export function fromDbFillup(r: DbFillup): Fillup {
  return {
    id: r.id,
    date: r.date,
    liters: Number(r.liters),
    totalPhp: Number(r.total_php),
    odometerKm: Number(r.odometer_km),
  };
}

export function toDbFillupInsert(f: Omit<Fillup, "id">): Omit<DbFillup, "id" | "created_at"> {
  return {
    date: f.date,
    liters: f.liters,
    total_php: f.totalPhp,
    odometer_km: f.odometerKm,
  };
}

export function fromDbPassenger(r: DbPassenger): Passenger {
  return { id: r.id, name: r.name, active: r.active };
}

export function fromDbSettings(r: DbSettings): CalcSettings {
  return {
    roundTripKm: Number(r.round_trip_km),
    mileageKmPerL:
      r.mileage_kml_override != null ? Number(r.mileage_kml_override) : 0,
    parkingFeePhp: Number(r.parking_fee_php),
    tollSkywayPhp: Number(r.toll_skyway_php),
    tollSlexPhp: Number(r.toll_slex_php),
    split1pDriver: r.split_1p_driver,
    split2pDriver: r.split_2p_driver,
    split3pDriver: r.split_3p_driver,
  };
}

export function toDbSettingsPatch(
  s: Partial<CalcSettings>
): Partial<Omit<DbSettings, "id" | "updated_at">> {
  const out: Partial<Omit<DbSettings, "id" | "updated_at">> = {};
  if (s.roundTripKm !== undefined) out.round_trip_km = s.roundTripKm;
  if (s.mileageKmPerL !== undefined) out.mileage_kml_override = s.mileageKmPerL;
  if (s.parkingFeePhp !== undefined) out.parking_fee_php = s.parkingFeePhp;
  if (s.tollSkywayPhp !== undefined) out.toll_skyway_php = s.tollSkywayPhp;
  if (s.tollSlexPhp !== undefined) out.toll_slex_php = s.tollSlexPhp;
  if (s.split1pDriver !== undefined) out.split_1p_driver = s.split1pDriver;
  if (s.split2pDriver !== undefined) out.split_2p_driver = s.split2pDriver;
  if (s.split3pDriver !== undefined) out.split_3p_driver = s.split3pDriver;
  return out;
}

export function gasPriceFromDb(r: DbGasPrice): {
  gasPrice: number;
  gasPriceUpdatedAt: string;
} {
  return {
    gasPrice: Number(r.price_per_liter),
    gasPriceUpdatedAt: r.updated_at ?? r.created_at,
  };
}

export interface DbTripWithLegs extends DbTrip {
  trip_legs: (DbTripLeg & { trip_leg_riders: DbTripLegRider[] })[];
}

export function fromDbTrip(r: DbTripWithLegs, gasPrice: number): StoredTrip {
  const morning = r.trip_legs.find((l) => l.leg === "morning");
  const evening = r.trip_legs.find((l) => l.leg === "evening");
  return {
    id: r.id,
    date: r.date,
    gasPrice,
    parkingFee: Number(r.parking_fee_php),
    morning: {
      route: morning?.route ?? "skyway",
      passengerIds: morning?.trip_leg_riders.map((x) => x.passenger_id) ?? [],
    },
    evening: {
      route: evening?.route ?? "skyway",
      passengerIds: evening?.trip_leg_riders.map((x) => x.passenger_id) ?? [],
    },
    notes: r.notes ?? undefined,
  };
}

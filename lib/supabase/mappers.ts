import type { Fillup } from "@/lib/mileage";
import { DEFAULT_SETTINGS, type CalcSettings } from "@/lib/calc";
import type { Passenger } from "@/lib/store/roster";
import type { StoredTrip } from "@/lib/store/trips";
import type { Group } from "@/lib/store/groups";
import type { Member } from "@/lib/store/members";
import type { Profile } from "@/lib/store/profile";
import type {
  DbCar,
  DbFillup,
  DbGasPrice,
  DbGroup,
  DbMember,
  DbPassenger,
  DbProfile,
  DbSettings,
  DbTrip,
  DbTripLeg,
  DbTripLegRider,
} from "./types";

export interface Car {
  id: string;
  ownerUserId: string;
  name: string;
  fuelEfficiencyKml: number | null;
  tankSizeLiters: number | null;
  maxPassengers: number | null;
}

export function toDbGroupInsert(
  g: Omit<Group, "id" | "createdAt">
): Omit<DbGroup, "id" | "created_at"> {
  return { name: g.name, owner_user_id: g.ownerUserId };
}

export function toDbProfilePatch(
  p: Partial<Omit<Profile, "userId">>
): Partial<Pick<DbProfile, "display_name" | "avatar_url">> {
  const out: Partial<Pick<DbProfile, "display_name" | "avatar_url">> = {};
  if (p.displayName !== undefined) out.display_name = p.displayName;
  if (p.avatarUrl !== undefined) out.avatar_url = p.avatarUrl;
  return out;
}

export function fromDbCar(r: DbCar): Car {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    name: r.name,
    fuelEfficiencyKml: r.fuel_efficiency_kml != null ? Number(r.fuel_efficiency_kml) : null,
    tankSizeLiters: r.tank_size_liters != null ? Number(r.tank_size_liters) : null,
    maxPassengers: r.max_passengers != null ? Number(r.max_passengers) : null,
  };
}

export function toDbCarInsert(
  c: Omit<Car, "id">
): Omit<DbCar, "id" | "created_at"> {
  return {
    owner_user_id: c.ownerUserId,
    name: c.name,
    fuel_efficiency_kml: c.fuelEfficiencyKml,
    tank_size_liters: c.tankSizeLiters,
    max_passengers: c.maxPassengers ?? null,
  };
}

export function fromDbFillup(r: DbFillup): Fillup {
  return {
    id: r.id,
    carId: r.car_id,
    date: r.date,
    liters: Number(r.liters),
    totalPhp: Number(r.total_php),
    odometerKm: Number(r.odometer_km),
  };
}

export function toDbFillupInsert(
  f: Omit<Fillup, "id">,
  ctx?: { groupId?: string; ownerUserId?: string }
): Partial<DbFillup> {
  const out: Partial<DbFillup> = {
    date: f.date,
    liters: f.liters,
    total_php: f.totalPhp,
    odometer_km: f.odometerKm,
    car_id: f.carId ?? null,
  };
  if (ctx?.groupId !== undefined) out.group_id = ctx.groupId;
  if (ctx?.ownerUserId !== undefined) out.owner_user_id = ctx.ownerUserId;
  return out;
}

export function fromDbPassenger(r: DbPassenger): Passenger {
  return { id: r.id, name: r.name, active: r.active };
}

export function fromDbGroup(r: DbGroup): Group {
  return {
    id: r.id,
    name: r.name,
    ownerUserId: r.owner_user_id,
    createdAt: r.created_at,
  };
}

export function fromDbMember(r: DbMember): Member {
  return {
    userId: r.user_id,
    groupId: r.group_id,
    role: r.role,
    passengerId: r.passenger_id,
    createdAt: r.created_at,
    displayName: null,
  };
}

export function fromDbProfile(r: DbProfile): Profile {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
  };
}

export function fromDbSettings(r: DbSettings): CalcSettings {

  return {
    roundTripKm: Number(r.round_trip_km),
    mileageKmPerL:
      r.mileage_kml_override != null && Number(r.mileage_kml_override) > 0
        ? Number(r.mileage_kml_override)
        : DEFAULT_SETTINGS.mileageKmPerL,
    parkingFeePhp: Number(r.parking_fee_php),
    tollSkywayPhp: Number(r.toll_skyway_php),
    tollSlexPhp: Number(r.toll_slex_php),
    split1pDriver: r.split_1p_driver,
    split2pDriver: r.split_2p_driver,
    split3pDriver: r.split_3p_driver,
    split4pDriver: r.split_4p_driver ?? DEFAULT_SETTINGS.split4pDriver,
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
  if (s.split4pDriver !== undefined) out.split_4p_driver = s.split4pDriver;
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
    carId: r.car_id,
    driverUserId: r.driver_user_id,
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

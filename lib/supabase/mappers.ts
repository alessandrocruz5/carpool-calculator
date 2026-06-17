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
): Partial<
  Pick<DbProfile, "display_name" | "first_name" | "last_name" | "avatar_url">
> {
  const out: Partial<
    Pick<DbProfile, "display_name" | "first_name" | "last_name" | "avatar_url">
  > = {};
  if (p.displayName !== undefined) out.display_name = p.displayName;
  if (p.firstName !== undefined) out.first_name = p.firstName;
  if (p.lastName !== undefined) out.last_name = p.lastName;
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
    firstName: r.first_name ?? null,
    lastName: r.last_name ?? null,
    avatarUrl: r.avatar_url,
  };
}

export function fromDbSettings(r: DbSettings): CalcSettings {

  return {
    roundTripKm: Number(r.round_trip_km),
    // 0 means "no manual override" so callers can fall back to the measured
    // rolling average; only a positive stored value is treated as an override.
    mileageKmPerL:
      r.mileage_kml_override != null && Number(r.mileage_kml_override) > 0
        ? Number(r.mileage_kml_override)
        : 0,
    mileageOverrideEnabled: r.mileage_override_enabled ?? false,
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
  // Store a cleared/zero override as NULL so it reads back as "no override".
  if (s.mileageKmPerL !== undefined)
    out.mileage_kml_override = s.mileageKmPerL > 0 ? s.mileageKmPerL : null;
  if (s.mileageOverrideEnabled !== undefined)
    out.mileage_override_enabled = s.mileageOverrideEnabled;
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

// Model A per-rider detour. Build a passenger_id → extra-km map from the leg's
// riders, keeping only positive values so legacy trips (all 0) stay clean and
// produce identical numbers downstream.
function extraKmByRider(
  riders: DbTripLegRider[] | undefined
): Record<string, number> | undefined {
  if (!riders) return undefined;
  const out: Record<string, number> = {};
  for (const x of riders) {
    const km = Number(x.extra_distance_km ?? 0);
    if (km > 0) out[x.passenger_id] = km;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// Ordering key for a leg: prefer the explicit `position`. The fallback to the
// legacy enum is deliberate defensive depth — `position` is non-null in the
// enforced schema, but rows reaching this mapper via untyped DB casts (the GET
// route casts `as unknown as DbTripWithLegs`) or older fixtures may omit it.
function legOrder(l: DbTripLeg): number {
  if (l.position != null) return l.position;
  if (l.leg === "morning") return 0;
  if (l.leg === "evening") return 1;
  return Number.MAX_SAFE_INTEGER;
}

function toLegState(l: DbTripLeg & { trip_leg_riders: DbTripLegRider[] }) {
  return {
    route: l.route,
    passengerIds: l.trip_leg_riders.map((x) => x.passenger_id),
    distanceKm: Number(l.distance_km),
    extraKmByRider: extraKmByRider(l.trip_leg_riders),
  };
}

export function fromDbTrip(r: DbTripWithLegs, gasPrice: number): StoredTrip {
  // Authoritative ordered legs (N legs, ascending position).
  const ordered = [...r.trip_legs].sort((a, b) => legOrder(a) - legOrder(b));
  const legs = ordered.map(toLegState);

  // Legacy mirror: keep the morning/evening surfaces deriving by leg name so
  // existing two-leg readers are byte-identical to before this unit.
  const morning = r.trip_legs.find((l) => l.leg === "morning");
  const evening = r.trip_legs.find((l) => l.leg === "evening");
  return {
    id: r.id,
    date: r.date,
    gasPrice,
    parkingFee: Number(r.parking_fee_php),
    carId: r.car_id,
    driverUserId: r.driver_user_id,
    legs,
    morning: {
      route: morning?.route ?? "skyway",
      passengerIds: morning?.trip_leg_riders.map((x) => x.passenger_id) ?? [],
      distanceKm: Number(morning?.distance_km ?? 21),
      extraKmByRider: extraKmByRider(morning?.trip_leg_riders),
    },
    evening: {
      route: evening?.route ?? "skyway",
      passengerIds: evening?.trip_leg_riders.map((x) => x.passenger_id) ?? [],
      distanceKm: Number(evening?.distance_km ?? 21),
      extraKmByRider: extraKmByRider(evening?.trip_leg_riders),
    },
    notes: r.notes ?? undefined,
  };
}

export type MemberRole = "driver" | "passenger" | "both";

export interface DbGroup {
  id: string;
  name: string;
  owner_user_id: string;
  created_at: string;
}

export interface DbProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbCar {
  id: string;
  owner_user_id: string;
  name: string;
  fuel_efficiency_kml: number | null;
  tank_size_liters: number | null;
  max_passengers: number | null;
  created_at: string;
}

export interface DbMember {
  group_id: string;
  user_id: string;
  role: MemberRole;
  passenger_id: string | null;
  created_at: string;
}

export interface DbMemberInvite {
  group_id: string;
  email: string;
  role: MemberRole;
  invited_by: string;
  created_at: string;
}

export interface DbPassenger {
  id: string;
  group_id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface DbGasPrice {
  id: string;
  group_id: string;
  effective_date: string;
  price_per_liter: number;
  station_name: string;
  created_at: string;
  updated_at?: string;
}

export interface DbFillup {
  id: string;
  group_id: string;
  car_id: string | null;
  owner_user_id: string | null;
  date: string;
  liters: number;
  total_php: number;
  odometer_km: number;
  created_at: string;
}

export interface DbSettings {
  group_id: string;
  mileage_kml_override: number | null;
  mileage_override_enabled: boolean;
  round_trip_km: number;
  parking_fee_php: number;
  toll_skyway_php: number;
  toll_slex_php: number;
  split_1p_driver: number;
  split_2p_driver: number;
  split_3p_driver: number;
  split_4p_driver: number;
  updated_at: string;
}

export interface DbTrip {
  id: string;
  group_id: string;
  car_id: string | null;
  driver_user_id: string | null;
  date: string;
  gas_price_id: string | null;
  parking_fee_php: number;
  notes: string | null;
  created_at: string;
}

export interface DbTripLeg {
  id: string;
  group_id: string;
  trip_id: string;
  leg: "morning" | "evening";
  route: "skyway" | "slex";
  distance_km: number;
}

export interface DbTripLegRider {
  group_id: string;
  trip_leg_id: string;
  passenger_id: string;
}

export interface DbTripPayment {
  group_id: string;
  trip_id: string;
  passenger_id: string;
  amount_php: number;
  paid: boolean;
  paid_at: string | null;
}

export type TripDisputeStatus = "open" | "resolved" | "dismissed";

export interface DbTripDispute {
  id: string;
  group_id: string;
  trip_id: string;
  reporter_user_id: string;
  reason: string;
  status: TripDisputeStatus;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

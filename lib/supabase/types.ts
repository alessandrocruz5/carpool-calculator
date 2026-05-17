export interface DbPassenger {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface DbGasPrice {
  id: string;
  effective_date: string;
  price_per_liter: number;
  station_name: string;
  created_at: string;
  updated_at?: string;
}

export interface DbFillup {
  id: string;
  date: string;
  liters: number;
  total_php: number;
  odometer_km: number;
  created_at: string;
}

export interface DbSettings {
  id: number;
  mileage_kml_override: number | null;
  round_trip_km: number;
  parking_fee_php: number;
  toll_skyway_php: number;
  toll_slex_php: number;
  split_1p_driver: number;
  split_2p_driver: number;
  split_3p_driver: number;
  updated_at: string;
}

export interface DbTrip {
  id: string;
  date: string;
  gas_price_id: string | null;
  parking_fee_php: number;
  notes: string | null;
  created_at: string;
}

export interface DbTripLeg {
  id: string;
  trip_id: string;
  leg: "morning" | "evening";
  route: "skyway" | "slex";
}

export interface DbTripLegRider {
  trip_leg_id: string;
  passenger_id: string;
}

export interface DbTripPayment {
  trip_id: string;
  passenger_id: string;
  amount_php: number;
  paid: boolean;
  paid_at: string | null;
}

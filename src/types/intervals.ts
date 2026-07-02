/**
 * Types partiels des réponses de l'API Intervals.icu.
 * L'API renvoie de nombreux champs supplémentaires (~50+ par activité) ;
 * seuls ceux utilisés par les tools sont typés explicitement, le reste
 * reste accessible via l'index signature pour ne pas casser en cas
 * d'évolution du schéma côté Intervals.icu.
 */

export interface IntervalsActivity {
  id: string;
  start_date_local?: string;
  type?: string;
  name?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  icu_training_load?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  icu_average_watts?: number;
  icu_weighted_avg_watts?: number;
  average_speed?: number;
  max_speed?: number;
  average_cadence?: number;
  total_elevation_gain?: number;
  icu_ftp?: number;
  icu_atl?: number;
  icu_ctl?: number;
  perceived_exertion?: number;
  icu_rpe?: number;
  feel?: number;
  [key: string]: unknown;
}

export interface IntervalsActivityInterval {
  id?: number | string;
  type?: string;
  start_index?: number;
  end_index?: number;
  moving_time?: number;
  distance?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  average_speed?: number;
  label?: string;
  [key: string]: unknown;
}

export interface IntervalsIntervalsResponse {
  icu_intervals?: IntervalsActivityInterval[];
  [key: string]: unknown;
}

export interface IntervalsActivityDetail extends IntervalsActivity {
  icu_intervals?: IntervalsActivityInterval[];
  [key: string]: unknown;
}

export interface IntervalsWellnessEntry {
  id: string; // date au format YYYY-MM-DD
  restingHR?: number;
  hrv?: number;
  hrvSDNN?: number;
  weight?: number;
  sleepSecs?: number;
  sleepScore?: number;
  sleepQuality?: number;
  soreness?: number;
  fatigue?: number;
  stress?: number;
  mood?: number;
  ctl?: number;
  atl?: number;
  rampRate?: number;
  [key: string]: unknown;
}

export interface IntervalsSportSettings {
  id?: string;
  types?: string[];
  ftp?: number;
  lthr?: number;
  max_hr?: number;
  hr_zones?: number[];
  hr_zone_names?: string[];
  pace_zones?: number[];
  power_zones?: number[];
  threshold_pace?: number;
  [key: string]: unknown;
}

export interface IntervalsAthlete {
  id: string;
  name?: string;
  email?: string;
  sex?: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
  measurement_preference?: string; // "METRIC" | "IMPERIAL"
  weight?: number;
  sportSettings?: IntervalsSportSettings[];
  icu_resting_hr?: number;
  [key: string]: unknown;
}

export interface IntervalsEvent {
  id: number | string;
  start_date_local?: string;
  category?: string; // WORKOUT, NOTE, RACE_A, ...
  type?: string; // Run, Ride, ...
  name?: string;
  description?: string;
  moving_time?: number;
  distance?: number;
  icu_training_load?: number;
  target?: string;
  [key: string]: unknown;
}

import { parseSuspension } from "./suspension";

export type VehicleType = '4x4' | 'sxs' | 'atv' | 'dirtbike';

export const VEHICLE_TYPE_CONFIG: Record<VehicleType, {
  label: string;
  shortLabel: string;
  emoji: string;
  color: string;
}> = {
  '4x4':      { label: '4x4 / Truck / Jeep', shortLabel: '4x4',  emoji: '🚙', color: '#1E3A1E' },
  'sxs':      { label: 'SxS / UTV',          shortLabel: 'SxS',  emoji: '🏎', color: '#1A3F6F' },
  'atv':      { label: 'ATV / Quad',          shortLabel: 'ATV',  emoji: '🏍', color: '#7A4500' },
  'dirtbike': { label: 'Dirt Bike',           shortLabel: 'Moto', emoji: '💨', color: '#7A2820' },
};

export function deriveVehicleTypes(size: string): VehicleType[] {
  const s = size.toLowerCase();
  const v = new Set<VehicleType>();

  // Explicit 4x4 / truck / jeep keywords
  if (
    s.includes('jeep') || s.includes('full size') || s.includes('short wheelbase') ||
    s.includes('high clearance') || s.includes('rock crawl') || s.includes('rock crawler')
  ) {
    v.add('4x4');
  }

  // Mid-size and larger → supports both 4x4 trucks and SxS/UTVs
  if (s.includes('mid-size') || s.includes('mid size')) {
    v.add('4x4');
    v.add('sxs');
  }

  // SxS / UTV specific keywords
  if (s.includes('side-by-side') || s.includes('utv') || s.includes('sxs')) v.add('sxs');

  // ATV / quad specific keywords
  if (s.includes('atv') || s.includes('quad') || s.includes('dune')) v.add('atv');

  // Sand-specific (dunes, sand vehicles) → atv + dirtbike
  if (s.includes('sand vehicle') || s.includes('sand')) { v.add('atv'); v.add('dirtbike'); }

  // Dirt bike specific keywords
  if (s.includes('dirt bike') || s.includes('moto')) v.add('dirtbike');

  // Plain "All Sizes" (without a specific vehicle qualifier already matched)
  // → trail is open to all vehicle types
  if (s.includes('all sizes') && v.size === 0) {
    v.add('4x4'); v.add('sxs'); v.add('atv'); v.add('dirtbike');
  }

  // Generic stock/clearance trails with no other qualifier → 4x4
  if (v.size === 0) v.add('4x4');

  return Array.from(v);
}

export interface Trail {
  id: string;
  title: string;
  coords: { latitude: number; longitude: number };
  difficulty: string;
  difficultyRating: number;
  size: string;
  suspension: string;
  region: string;
  state: string;
  vehicleTypes: VehicleType[];
  /** Deterministic, structured vehicle-fit requirements derived from `suspension`. */
  minLiftIn: number;
  lockersRecommended: boolean;
  longTravel: boolean;
}

type TrailInput = Omit<Trail, 'vehicleTypes' | 'minLiftIn' | 'lockersRecommended' | 'longTravel'>;

const _TRAIL_DATA: TrailInput[] = [
  // ── CALIFORNIA ─────────────────────────────────────────────────────────────
  { id: "ca-1",  title: "Rubicon Trail",                        state: "CA", coords: { latitude: 39.0041,  longitude: -120.3122 }, difficulty: "10/10 Hardcore",    difficultyRating: 10, size: "Jeep / Short Wheelbase",    suspension: "3-4\" Lift + Lockers",    region: "El Dorado County" },
  { id: "ca-2",  title: "Hungry Valley SVRA",                   state: "CA", coords: { latitude: 34.7578,  longitude: -118.8788 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Side-by-Side",   suspension: "Stock Friendly",          region: "Los Angeles County" },
  { id: "ca-3",  title: "Johnson Valley (KOH)",                 state: "CA", coords: { latitude: 34.4214,  longitude: -116.6833 }, difficulty: "9/10 Extreme",      difficultyRating: 9,  size: "Full Size / Rock Crawlers",  suspension: "Long Travel Required",    region: "San Bernardino County" },
  { id: "ca-4",  title: "Big Bear OHV Trails",                  state: "CA", coords: { latitude: 34.2439,  longitude: -116.8824 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Mid-Size & Larger",          suspension: "2\" Lift Recommended",    region: "San Bernardino County" },
  { id: "ca-5",  title: "Ocotillo Wells SVRA",                  state: "CA", coords: { latitude: 33.1536,  longitude: -116.1334 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "San Diego County" },
  { id: "ca-6",  title: "Fordyce Lake Trail",                   state: "CA", coords: { latitude: 39.3697,  longitude: -120.5125 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / Short Wheelbase",    suspension: "3\" Lift + Skid Plates",  region: "Nevada County" },
  { id: "ca-7",  title: "Hollister Hills SVRA",                 state: "CA", coords: { latitude: 36.8341,  longitude: -121.3974 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "San Benito County" },
  { id: "ca-8",  title: "Oceano Dunes SVRA (Pismo)",            state: "CA", coords: { latitude: 35.0997,  longitude: -120.6318 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "San Luis Obispo County" },
  { id: "ca-9",  title: "Dumont Dunes OHV",                     state: "CA", coords: { latitude: 35.6658,  longitude: -116.2279 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Sand Vehicles",  suspension: "Stock OK",                region: "San Bernardino County" },
  { id: "ca-10", title: "Stoddard Valley OHV",                  state: "CA", coords: { latitude: 34.5836,  longitude: -117.0753 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Mid-Size & Larger",          suspension: "2\" Lift Recommended",    region: "San Bernardino County" },
  { id: "ca-11", title: "Dove Springs OHV (Jawbone)",           state: "CA", coords: { latitude: 35.2677,  longitude: -118.0355 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Kern County" },
  { id: "ca-12", title: "Carnegie SVRA",                        state: "CA", coords: { latitude: 37.6777,  longitude: -121.6130 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Alameda County" },
  { id: "ca-13", title: "Prairie City SVRA",                    state: "CA", coords: { latitude: 38.6221,  longitude: -121.2046 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Sacramento County" },
  { id: "ca-14", title: "El Mirage OHV",                        state: "CA", coords: { latitude: 34.6436,  longitude: -117.5847 }, difficulty: "2/10 Easy",         difficultyRating: 2,  size: "All Sizes",                  suspension: "Stock Friendly",          region: "San Bernardino County" },
  { id: "ca-15", title: "Ballinger Canyon OHV",                 state: "CA", coords: { latitude: 34.8658,  longitude: -119.7561 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Santa Barbara County" },
  { id: "ca-16", title: "Rowher Flats OHV",                     state: "CA", coords: { latitude: 34.4522,  longitude: -118.4736 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Los Angeles County" },
  { id: "ca-17", title: "Corral Canyon OHV",                    state: "CA", coords: { latitude: 32.9783,  longitude: -116.6039 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Mid-Size & Larger",          suspension: "2-3\" Lift",              region: "San Diego County" },
  { id: "ca-18", title: "Cleghorn Ridge OHV",                   state: "CA", coords: { latitude: 34.3319,  longitude: -117.4081 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Mid-Size & Larger",          suspension: "3\" Lift Recommended",    region: "San Bernardino County" },
  { id: "ca-19", title: "Saline Valley Road",                   state: "CA", coords: { latitude: 36.7455,  longitude: -117.7697 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Inyo County" },
  { id: "ca-20", title: "Mojave Road",                          state: "CA", coords: { latitude: 34.9747,  longitude: -116.6303 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "San Bernardino County" },
  { id: "ca-21", title: "Mammoth Bar OHV",                      state: "CA", coords: { latitude: 39.0069,  longitude: -120.9533 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Mid-Size & Larger",          suspension: "2\" Lift Recommended",    region: "El Dorado County" },
  { id: "ca-22", title: "Alamo Mountain OHV",                   state: "CA", coords: { latitude: 34.6983,  longitude: -118.9192 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Los Angeles / Ventura County" },
  { id: "ca-23", title: "Surprise Canyon (Panamint)",           state: "CA", coords: { latitude: 36.1783,  longitude: -117.2461 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / Short Wheelbase",    suspension: "3\" Lift + Lockers",      region: "Inyo County" },
  { id: "ca-24", title: "Picacho State Recreation Area",        state: "CA", coords: { latitude: 32.9397,  longitude: -114.6247 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes",                  suspension: "Stock Friendly",          region: "Imperial County" },
  { id: "ca-25", title: "Randsburg OHV",                        state: "CA", coords: { latitude: 35.3683,  longitude: -117.6503 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Kern County" },
  { id: "ca-26", title: "Bodie Hills OHV",                      state: "CA", coords: { latitude: 38.2128,  longitude: -119.0061 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Mono County" },
  { id: "ca-27", title: "Plumas Eureka OHV Trails",             state: "CA", coords: { latitude: 39.7519,  longitude: -120.7058 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Mid-Size & Larger",          suspension: "2\" Lift Recommended",    region: "Plumas County" },

  // ── ALASKA ─────────────────────────────────────────────────────────────────
  { id: "ak-1",  title: "Dalton Highway (Haul Road)",           state: "AK", coords: { latitude: 66.5628,  longitude: -150.8781 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance / Full Size", suspension: "2-3\" Lift + Skids",      region: "Yukon-Koyukuk Borough" },
  { id: "ak-2",  title: "Matanuska-Susitna OHV Trails",         state: "AK", coords: { latitude: 61.5753,  longitude: -149.2283 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Matanuska-Susitna Borough" },
  { id: "ak-3",  title: "Denali State Park OHV",                state: "AK", coords: { latitude: 62.5683,  longitude: -150.6317 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Matanuska-Susitna Borough" },
  { id: "ak-4",  title: "Kenai Peninsula OHV Trails",           state: "AK", coords: { latitude: 60.5569,  longitude: -150.7819 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Kenai Peninsula Borough" },

  // ── ALABAMA ────────────────────────────────────────────────────────────────
  { id: "al-1",  title: "Oak Mountain OHV Trails",              state: "AL", coords: { latitude: 33.3539,  longitude: -86.6997  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Shelby County" },
  { id: "al-2",  title: "Talladega NF OHV (Tatum Creek)",       state: "AL", coords: { latitude: 33.4783,  longitude: -86.1781  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Talladega County" },
  { id: "al-3",  title: "Crooked Creek OHV Park",               state: "AL", coords: { latitude: 33.0658,  longitude: -87.7728  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Greene County" },
  { id: "al-4",  title: "Little River Canyon OHV",              state: "AL", coords: { latitude: 34.3514,  longitude: -85.6233  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock OK",                region: "DeKalb County" },

  // ── ARIZONA ────────────────────────────────────────────────────────────────
  { id: "az-1",  title: "Maricopa Trail (OHV Sections)",        state: "AZ", coords: { latitude: 33.4617,  longitude: -111.9890 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Maricopa County" },
  { id: "az-2",  title: "Vulture Mountains OHV",                state: "AZ", coords: { latitude: 33.8136,  longitude: -112.7192 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Maricopa County" },
  { id: "az-3",  title: "Bulldog Canyon OHV",                   state: "AZ", coords: { latitude: 33.4931,  longitude: -111.5308 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Maricopa County" },
  { id: "az-4",  title: "White Mountains Trail System",         state: "AZ", coords: { latitude: 33.9039,  longitude: -109.7778 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Apache County" },
  { id: "az-5",  title: "Cibola OHV Area",                      state: "AZ", coords: { latitude: 32.9944,  longitude: -114.7183 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Dunes",          suspension: "Stock Friendly",          region: "La Paz County" },
  { id: "az-6",  title: "Harquahala Mountains OHV",             state: "AZ", coords: { latitude: 33.5919,  longitude: -113.3033 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Maricopa County" },
  { id: "az-7",  title: "Sedona Pink Jeep Trails",              state: "AZ", coords: { latitude: 34.8697,  longitude: -111.7610 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Jeep / Short Wheelbase",    suspension: "3\" Lift + Skids",        region: "Yavapai County" },
  { id: "az-8",  title: "Kofa NWR - Palm Canyon Road",          state: "AZ", coords: { latitude: 33.3631,  longitude: -114.1014 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Yuma County" },
  { id: "az-9",  title: "Oracle State Park OHV Trails",         state: "AZ", coords: { latitude: 32.6147,  longitude: -110.7581 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Pinal County" },

  // ── ARKANSAS ───────────────────────────────────────────────────────────────
  { id: "ar-1",  title: "Byrd's Adventure Center",              state: "AR", coords: { latitude: 35.4917,  longitude: -93.8906  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Yell County" },
  { id: "ar-2",  title: "Ouachita NF OHV Area",                 state: "AR", coords: { latitude: 34.5683,  longitude: -93.0481  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Garland County" },
  { id: "ar-3",  title: "Ozark NF OHV Trails",                  state: "AR", coords: { latitude: 35.5589,  longitude: -93.8344  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Johnson County" },
  { id: "ar-4",  title: "Muddy Creek OHV Area",                 state: "AR", coords: { latitude: 35.0264,  longitude: -93.2247  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Yell County" },
  { id: "ar-5",  title: "Heber Springs OHV Trails",             state: "AR", coords: { latitude: 35.4917,  longitude: -92.0333  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Cleburne County" },

  // ── COLORADO ───────────────────────────────────────────────────────────────
  { id: "co-1",  title: "Black Bear Road (Telluride)",          state: "CO", coords: { latitude: 37.9253,  longitude: -107.7261 }, difficulty: "10/10 Hardcore",    difficultyRating: 10, size: "Jeep / Short Wheelbase",    suspension: "3-4\" Lift + Lockers",    region: "San Miguel County" },
  { id: "co-2",  title: "Alpine Loop",                          state: "CO", coords: { latitude: 37.9589,  longitude: -107.6694 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / High Clearance",     suspension: "3\" Lift Recommended",    region: "San Juan County" },
  { id: "co-3",  title: "Imogene Pass",                         state: "CO", coords: { latitude: 37.9561,  longitude: -107.7442 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / High Clearance",     suspension: "3\" Lift",                region: "Ouray County" },
  { id: "co-4",  title: "Medano Pass Primitive Road",           state: "CO", coords: { latitude: 37.8458,  longitude: -105.5289 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance / 4WD",      suspension: "Stock 4WD OK",            region: "Huerfano County" },
  { id: "co-5",  title: "Rampart Range OHV",                    state: "CO", coords: { latitude: 39.1947,  longitude: -105.0692 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Teller County" },
  { id: "co-6",  title: "Phantom Canyon Road",                  state: "CO", coords: { latitude: 38.4886,  longitude: -105.1258 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Fremont County" },
  { id: "co-7",  title: "Shelf Road Recreation Area",           state: "CO", coords: { latitude: 38.6372,  longitude: -105.2033 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock OK",                region: "Fremont County" },
  { id: "co-8",  title: "Ophir Pass",                           state: "CO", coords: { latitude: 37.8711,  longitude: -107.7914 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Jeep / High Clearance",     suspension: "2-3\" Lift",              region: "San Juan County" },
  { id: "co-9",  title: "Corkscrew Gulch (Red Mountain)",       state: "CO", coords: { latitude: 37.9028,  longitude: -107.6736 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Jeep / Short Wheelbase",    suspension: "3\" Lift + Skids",        region: "Ouray County" },

  // ── CONNECTICUT ────────────────────────────────────────────────────────────
  { id: "ct-1",  title: "Meshomasic State Forest OHV",          state: "CT", coords: { latitude: 41.6103,  longitude: -72.5019  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Dirt Bikes",     suspension: "Stock Friendly",          region: "Hartford County" },
  { id: "ct-2",  title: "Cockaponset State Forest OHV",         state: "CT", coords: { latitude: 41.4122,  longitude: -72.5847  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Middlesex County" },

  // ── DELAWARE ───────────────────────────────────────────────────────────────
  { id: "de-1",  title: "Blackbird State Forest OHV",           state: "DE", coords: { latitude: 39.3678,  longitude: -75.6819  }, difficulty: "2/10 Easy",         difficultyRating: 2,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "New Castle County" },
  { id: "de-2",  title: "Redden State Forest OHV",              state: "DE", coords: { latitude: 38.7919,  longitude: -75.4628  }, difficulty: "2/10 Easy",         difficultyRating: 2,  size: "All Sizes / Dirt Bikes",     suspension: "Stock Friendly",          region: "Sussex County" },

  // ── FLORIDA ────────────────────────────────────────────────────────────────
  { id: "fl-1",  title: "Croom Motorcycle Area",                state: "FL", coords: { latitude: 28.4708,  longitude: -82.2036  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "Dirt Bikes / ATVs",          suspension: "Stock OK",                region: "Hernando County" },
  { id: "fl-2",  title: "Ocala NF OHV Trails",                  state: "FL", coords: { latitude: 29.1853,  longitude: -81.7244  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Marion County" },
  { id: "fl-3",  title: "Big Shoals OHV Trails",                state: "FL", coords: { latitude: 30.4022,  longitude: -82.9739  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Hamilton County" },
  { id: "fl-4",  title: "Twin Lakes OHV Park",                  state: "FL", coords: { latitude: 28.6978,  longitude: -81.6211  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Lake County" },
  { id: "fl-5",  title: "Blackwater River SF OHV",              state: "FL", coords: { latitude: 30.8569,  longitude: -86.9081  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Santa Rosa County" },

  // ── GEORGIA ────────────────────────────────────────────────────────────────
  { id: "ga-1",  title: "Blue Ridge WMA OHV",                   state: "GA", coords: { latitude: 34.8636,  longitude: -84.3228  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Fannin County" },
  { id: "ga-2",  title: "Rich Mountain OHV Trails",             state: "GA", coords: { latitude: 34.7128,  longitude: -84.5611  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "All Sizes / ATVs",           suspension: "2-3\" Lift",              region: "Gilmer County" },
  { id: "ga-3",  title: "Paulding Forest OHV",                  state: "GA", coords: { latitude: 33.9281,  longitude: -85.0583  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Paulding County" },
  { id: "ga-4",  title: "Chattahoochee NF OHV (Lake Blue Ridge)",state: "GA", coords: { latitude: 34.8919, longitude: -84.2206  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Fannin County" },
  { id: "ga-5",  title: "Ocmulgee WMA OHV Trails",              state: "GA", coords: { latitude: 32.4069,  longitude: -83.3278  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Telfair County" },

  // ── HAWAII ─────────────────────────────────────────────────────────────────
  { id: "hi-1",  title: "Waipio Valley Rd (Big Island)",        state: "HI", coords: { latitude: 20.1097,  longitude: -155.5864 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / Short Wheelbase",    suspension: "3\" Lift + Lockers",      region: "Hawaii County" },
  { id: "hi-2",  title: "Mauna Kea Access Road",                state: "HI", coords: { latitude: 19.8228,  longitude: -155.4681 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance 4WD",         suspension: "Stock 4WD OK",            region: "Hawaii County" },
  { id: "hi-3",  title: "Molokai North Shore Jeep Trail",       state: "HI", coords: { latitude: 21.1628,  longitude: -156.8978 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Jeep / Short Wheelbase",    suspension: "2-3\" Lift",              region: "Maui County" },

  // ── IDAHO ──────────────────────────────────────────────────────────────────
  { id: "id-1",  title: "Bruneau Dunes OHV",                    state: "ID", coords: { latitude: 42.8889,  longitude: -115.7928 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dunes",          suspension: "Stock Friendly",          region: "Owyhee County" },
  { id: "id-2",  title: "Salmon River Mountains OHV",           state: "ID", coords: { latitude: 44.8833,  longitude: -114.3667 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Lemhi County" },
  { id: "id-3",  title: "Clear Creek OHV Area",                 state: "ID", coords: { latitude: 46.4208,  longitude: -116.2478 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Clearwater County" },
  { id: "id-4",  title: "Owyhee Canyonlands OHV",               state: "ID", coords: { latitude: 43.1247,  longitude: -117.0019 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance",             suspension: "2-3\" Lift",              region: "Owyhee County" },
  { id: "id-5",  title: "Priest Lake OHV Trails",               state: "ID", coords: { latitude: 48.4178,  longitude: -116.8769 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Bonner County" },
  { id: "id-6",  title: "Caribou-Targhee NF OHV",               state: "ID", coords: { latitude: 43.5719,  longitude: -111.4003 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Bonneville County" },
  { id: "id-7",  title: "Frank Church Wilderness Perimeter",    state: "ID", coords: { latitude: 45.0031,  longitude: -115.0178 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance",             suspension: "2-3\" Lift",              region: "Valley County" },

  // ── ILLINOIS ───────────────────────────────────────────────────────────────
  { id: "il-1",  title: "Shawnee NF Trail of Tears OHV",        state: "IL", coords: { latitude: 37.5036,  longitude: -89.3028  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Union County" },
  { id: "il-2",  title: "Sand Ridge State Forest OHV",          state: "IL", coords: { latitude: 40.1714,  longitude: -89.7822  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Mason County" },
  { id: "il-3",  title: "Clinton Lake OHV Area",                state: "IL", coords: { latitude: 40.1394,  longitude: -88.8561  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes",                  suspension: "Stock Friendly",          region: "De Witt County" },

  // ── INDIANA ────────────────────────────────────────────────────────────────
  { id: "in-1",  title: "Badlands OHV Area",                    state: "IN", coords: { latitude: 39.7847,  longitude: -85.5267  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Henry County" },
  { id: "in-2",  title: "Otter Creek OHV Park",                 state: "IN", coords: { latitude: 38.3658,  longitude: -85.9894  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Clark County" },
  { id: "in-3",  title: "Salamonie River SF OHV",               state: "IN", coords: { latitude: 40.8653,  longitude: -85.6867  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Wabash County" },

  // ── IOWA ───────────────────────────────────────────────────────────────────
  { id: "ia-1",  title: "Yellow River State Forest OHV",        state: "IA", coords: { latitude: 43.2217,  longitude: -91.2308  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Allamakee County" },
  { id: "ia-2",  title: "Mines of Spain OHV Area",              state: "IA", coords: { latitude: 42.4697,  longitude: -90.6172  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Dubuque County" },
  { id: "ia-3",  title: "Stephens State Forest OHV",            state: "IA", coords: { latitude: 41.0367,  longitude: -92.8639  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Lucas County" },

  // ── KANSAS ─────────────────────────────────────────────────────────────────
  { id: "ks-1",  title: "Perry Lake OHV Area",                  state: "KS", coords: { latitude: 39.0856,  longitude: -95.3806  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Jefferson County" },
  { id: "ks-2",  title: "Kanopolis Lake OHV Trails",            state: "KS", coords: { latitude: 38.6436,  longitude: -98.0178  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Ellsworth County" },
  { id: "ks-3",  title: "Glen Elder OHV Area",                  state: "KS", coords: { latitude: 39.5064,  longitude: -98.3092  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes",                  suspension: "Stock Friendly",          region: "Mitchell County" },

  // ── KENTUCKY ───────────────────────────────────────────────────────────────
  { id: "ky-1",  title: "Redbird Crest OHV Trail",              state: "KY", coords: { latitude: 37.0731,  longitude: -83.8256  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",           suspension: "2\" Lift Recommended",    region: "Clay County" },
  { id: "ky-2",  title: "Daniel Boone NF OHV Trails",           state: "KY", coords: { latitude: 37.6439,  longitude: -83.5156  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Lee County" },
  { id: "ky-3",  title: "Kentenia State Forest OHV",            state: "KY", coords: { latitude: 37.1308,  longitude: -82.6072  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Harlan County" },
  { id: "ky-4",  title: "Pennyrile State Forest OHV",           state: "KY", coords: { latitude: 37.0511,  longitude: -87.6572  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Christian County" },

  // ── LOUISIANA ──────────────────────────────────────────────────────────────
  { id: "la-1",  title: "Kisatchie NF OHV Trails",              state: "LA", coords: { latitude: 31.5903,  longitude: -92.8972  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Rapides Parish" },
  { id: "la-2",  title: "Indian Creek Recreation OHV",          state: "LA", coords: { latitude: 32.0214,  longitude: -92.4839  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Lincoln Parish" },
  { id: "la-3",  title: "Sabine River Authority OHV",           state: "LA", coords: { latitude: 31.8817,  longitude: -93.5383  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes",                  suspension: "Stock Friendly",          region: "Sabine Parish" },
  { id: "la-4",  title: "Atchafalaya Basin OHV Levees",         state: "LA", coords: { latitude: 30.3906,  longitude: -91.6569  }, difficulty: "2/10 Easy",         difficultyRating: 2,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "St. Martin Parish" },

  // ── MAINE ──────────────────────────────────────────────────────────────────
  { id: "me-1",  title: "North Maine Woods OHV",                state: "ME", coords: { latitude: 46.8019,  longitude: -69.7528  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Aroostook County" },
  { id: "me-2",  title: "Baxter State Park Access OHV",         state: "ME", coords: { latitude: 46.1117,  longitude: -68.9228  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock OK",                region: "Piscataquis County" },
  { id: "me-3",  title: "Allagash Wilderness OHV Trails",       state: "ME", coords: { latitude: 47.0592,  longitude: -69.5678  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Aroostook County" },

  // ── MARYLAND ───────────────────────────────────────────────────────────────
  { id: "md-1",  title: "Green Ridge State Forest OHV",         state: "MD", coords: { latitude: 39.6597,  longitude: -78.5419  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Allegany County" },
  { id: "md-2",  title: "Potomac State Forest OHV",             state: "MD", coords: { latitude: 39.4611,  longitude: -79.3214  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Garrett County" },
  { id: "md-3",  title: "Savage River State Forest OHV",        state: "MD", coords: { latitude: 39.5233,  longitude: -79.1044  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Garrett County" },

  // ── MASSACHUSETTS ──────────────────────────────────────────────────────────
  { id: "ma-1",  title: "Beartown State Forest OHV",            state: "MA", coords: { latitude: 42.2406,  longitude: -73.3522  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Berkshire County" },
  { id: "ma-2",  title: "Savoy Mountain State Forest OHV",      state: "MA", coords: { latitude: 42.6092,  longitude: -73.0144  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Berkshire County" },
  { id: "ma-3",  title: "Erving State Forest OHV",              state: "MA", coords: { latitude: 42.6214,  longitude: -72.4258  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Dirt Bikes",     suspension: "Stock Friendly",          region: "Franklin County" },

  // ── MICHIGAN ───────────────────────────────────────────────────────────────
  { id: "mi-1",  title: "Newaygo State Park OHV",               state: "MI", coords: { latitude: 43.4458,  longitude: -85.8006  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Newaygo County" },
  { id: "mi-2",  title: "Silver Lake Sand Dunes OHV",           state: "MI", coords: { latitude: 43.6853,  longitude: -86.5036  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dunes",          suspension: "Stock Friendly",          region: "Oceana County" },
  { id: "mi-3",  title: "Drummond Island OHV",                  state: "MI", coords: { latitude: 46.0064,  longitude: -83.7453  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Chippewa County" },
  { id: "mi-4",  title: "Highbanks Lake OHV Area",              state: "MI", coords: { latitude: 44.3614,  longitude: -84.1194  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Roscommon County" },
  { id: "mi-5",  title: "Pigeon River Country OHV",             state: "MI", coords: { latitude: 45.1108,  longitude: -84.5831  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Otsego County" },

  // ── MINNESOTA ──────────────────────────────────────────────────────────────
  { id: "mn-1",  title: "Nemadji State Forest OHV",             state: "MN", coords: { latitude: 46.4633,  longitude: -92.4306  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Carlton County" },
  { id: "mn-2",  title: "Sand Dunes State Forest OHV",          state: "MN", coords: { latitude: 45.4986,  longitude: -93.5281  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Sherburne County" },
  { id: "mn-3",  title: "Superior NF OHV Trails",               state: "MN", coords: { latitude: 47.8928,  longitude: -91.8561  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Lake County" },
  { id: "mn-4",  title: "Remer OHV Trail System",               state: "MN", coords: { latitude: 47.0597,  longitude: -93.9006  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Cass County" },

  // ── MISSISSIPPI ────────────────────────────────────────────────────────────
  { id: "ms-1",  title: "Bienville NF OHV Trails",              state: "MS", coords: { latitude: 32.2519,  longitude: -89.2894  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Scott County" },
  { id: "ms-2",  title: "DeSoto NF OHV Area",                   state: "MS", coords: { latitude: 30.6903,  longitude: -89.0019  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Dirt Bikes",     suspension: "Stock Friendly",          region: "Harrison County" },
  { id: "ms-3",  title: "Homochitto NF OHV Trails",             state: "MS", coords: { latitude: 31.5092,  longitude: -90.9756  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Franklin County" },

  // ── MISSOURI ───────────────────────────────────────────────────────────────
  { id: "mo-1",  title: "Mark Twain NF OHV Trails",             state: "MO", coords: { latitude: 37.3522,  longitude: -91.4256  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Shannon County" },
  { id: "mo-2",  title: "Chadwick Motorcycle Area",              state: "MO", coords: { latitude: 36.8711,  longitude: -92.9319  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Dirt Bikes / ATVs",          suspension: "Stock OK",                region: "Christian County" },
  { id: "mo-3",  title: "Trace Creek OHV Area",                 state: "MO", coords: { latitude: 37.5139,  longitude: -90.9356  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Reynolds County" },
  { id: "mo-4",  title: "Eleven Point OHV (Mark Twain NF)",     state: "MO", coords: { latitude: 36.7197,  longitude: -90.9778  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Oregon County" },

  // ── MONTANA ────────────────────────────────────────────────────────────────
  { id: "mt-1",  title: "Beaverhead-Deerlodge OHV",             state: "MT", coords: { latitude: 45.8833,  longitude: -113.5500 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Beaverhead County" },
  { id: "mt-2",  title: "Gallatin NF OHV Trails",               state: "MT", coords: { latitude: 45.6589,  longitude: -111.0481 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Gallatin County" },
  { id: "mt-3",  title: "Lolo National Forest Trails",          state: "MT", coords: { latitude: 46.8914,  longitude: -114.3108 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Missoula County" },
  { id: "mt-4",  title: "Kootenai NF OHV Trails",               state: "MT", coords: { latitude: 48.4261,  longitude: -115.5628 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Lincoln County" },
  { id: "mt-5",  title: "Custer Gallatin NF (Billings Area)",   state: "MT", coords: { latitude: 45.4997,  longitude: -108.5986 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Carbon County" },
  { id: "mt-6",  title: "Lost Trail OHV Network",               state: "MT", coords: { latitude: 45.6939,  longitude: -113.9606 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Ravalli County" },

  // ── NEBRASKA ───────────────────────────────────────────────────────────────
  { id: "ne-1",  title: "Nebraska NF OHV Trails",               state: "NE", coords: { latitude: 41.9847,  longitude: -100.4281 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Thomas County" },
  { id: "ne-2",  title: "Fort Robinson State Park OHV",         state: "NE", coords: { latitude: 42.6908,  longitude: -103.4633 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock OK",                region: "Dawes County" },
  { id: "ne-3",  title: "Niobrara State Park OHV",              state: "NE", coords: { latitude: 42.7639,  longitude: -98.0428  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Knox County" },
  { id: "ne-4",  title: "Wildcat Hills OHV Trails",             state: "NE", coords: { latitude: 41.7908,  longitude: -103.6506 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock OK",                region: "Scotts Bluff County" },

  // ── NEVADA ─────────────────────────────────────────────────────────────────
  { id: "nv-1",  title: "Eldorado Valley OHV",                  state: "NV", coords: { latitude: 35.7633,  longitude: -114.9158 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Clark County" },
  { id: "nv-2",  title: "Logandale Trails",                     state: "NV", coords: { latitude: 36.5980,  longitude: -114.4786 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Clark County" },
  { id: "nv-3",  title: "Nellis Dunes OHV",                     state: "NV", coords: { latitude: 36.2697,  longitude: -115.0181 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Sand",           suspension: "Stock Friendly",          region: "Clark County" },
  { id: "nv-4",  title: "Winnemucca Sand Dunes",                state: "NV", coords: { latitude: 40.9633,  longitude: -117.6869 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dunes",          suspension: "Stock OK",                region: "Humboldt County" },
  { id: "nv-5",  title: "Muddy Mountains OHV",                  state: "NV", coords: { latitude: 36.4547,  longitude: -114.6133 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Clark County" },
  { id: "nv-6",  title: "Reno Area Desert OHV",                 state: "NV", coords: { latitude: 39.7119,  longitude: -119.8589 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Washoe County" },
  { id: "nv-7",  title: "Walker Lake OHV Trails",               state: "NV", coords: { latitude: 38.6933,  longitude: -118.7136 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Mineral County" },
  { id: "nv-8",  title: "Ely OHV Trail Network",                state: "NV", coords: { latitude: 39.2478,  longitude: -114.8836 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "White Pine County" },

  // ── NEW HAMPSHIRE ──────────────────────────────────────────────────────────
  { id: "nh-1",  title: "Jericho Mountain State Park OHV",      state: "NH", coords: { latitude: 44.8097,  longitude: -71.2203  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Coos County" },
  { id: "nh-2",  title: "White Mountain NF OHV",                state: "NH", coords: { latitude: 44.0717,  longitude: -71.6614  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Carroll County" },
  { id: "nh-3",  title: "Bear Brook State Park OHV",            state: "NH", coords: { latitude: 43.1608,  longitude: -71.3628  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Merrimack County" },

  // ── NEW JERSEY ─────────────────────────────────────────────────────────────
  { id: "nj-1",  title: "Wharton State Forest OHV",             state: "NJ", coords: { latitude: 39.6908,  longitude: -74.6722  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Burlington County" },
  { id: "nj-2",  title: "Tuckahoe WMA OHV Area",                state: "NJ", coords: { latitude: 39.4278,  longitude: -74.8006  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Dirt Bikes",     suspension: "Stock Friendly",          region: "Atlantic County" },

  // ── NEW MEXICO ─────────────────────────────────────────────────────────────
  { id: "nm-1",  title: "White Sands OHV Area",                 state: "NM", coords: { latitude: 32.8697,  longitude: -106.3319 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Dunes",          suspension: "Stock Friendly",          region: "Otero County" },
  { id: "nm-2",  title: "Jemez Mountains OHV",                  state: "NM", coords: { latitude: 35.8753,  longitude: -106.6508 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Sandoval County" },
  { id: "nm-3",  title: "Otero Mesa OHV Trails",                state: "NM", coords: { latitude: 32.1197,  longitude: -105.7014 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Otero County" },
  { id: "nm-4",  title: "Taos Valley OHV Park",                 state: "NM", coords: { latitude: 36.3567,  longitude: -105.5928 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Taos County" },
  { id: "nm-5",  title: "Valles Caldera OHV Trails",            state: "NM", coords: { latitude: 35.8703,  longitude: -106.5247 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock OK",                region: "Sandoval County" },
  { id: "nm-6",  title: "Lincoln NF OHV Trails",                state: "NM", coords: { latitude: 33.0489,  longitude: -105.7408 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Lincoln County" },

  // ── NEW YORK ───────────────────────────────────────────────────────────────
  { id: "ny-1",  title: "Finger Lakes NF OHV Trails",           state: "NY", coords: { latitude: 42.5717,  longitude: -76.8431  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Schuyler County" },
  { id: "ny-2",  title: "Allegany State Park OHV",              state: "NY", coords: { latitude: 42.0708,  longitude: -78.7592  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Cattaraugus County" },
  { id: "ny-3",  title: "Adirondack OHV Trails",                state: "NY", coords: { latitude: 43.9778,  longitude: -74.4494  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Hamilton County" },

  // ── NORTH CAROLINA ─────────────────────────────────────────────────────────
  { id: "nc-1",  title: "Uwharrie National Forest OHV",         state: "NC", coords: { latitude: 35.4008,  longitude: -79.9761  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",           suspension: "2\" Lift Recommended",    region: "Montgomery County" },
  { id: "nc-2",  title: "Tasmania OHV (Uwharrie)",              state: "NC", coords: { latitude: 35.3886,  longitude: -80.0308  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "All Sizes",                  suspension: "2-3\" Lift",              region: "Montgomery County" },
  { id: "nc-3",  title: "Foothills Trail System OHV",           state: "NC", coords: { latitude: 36.0219,  longitude: -81.2664  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Wilkes County" },
  { id: "nc-4",  title: "Nantahala NF OHV Trails",              state: "NC", coords: { latitude: 35.3314,  longitude: -83.6839  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Macon County" },
  { id: "nc-5",  title: "Pisgah NF OHV Trails",                 state: "NC", coords: { latitude: 35.4311,  longitude: -82.7361  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Transylvania County" },

  // ── NORTH DAKOTA ───────────────────────────────────────────────────────────
  { id: "nd-1",  title: "Little Missouri Grasslands OHV",       state: "ND", coords: { latitude: 46.9503,  longitude: -103.3028 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Billings County" },
  { id: "nd-2",  title: "Sully Creek State Park OHV",           state: "ND", coords: { latitude: 46.7781,  longitude: -103.2539 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Mercer County" },
  { id: "nd-3",  title: "Sheyenne National Grassland OHV",      state: "ND", coords: { latitude: 46.3439,  longitude: -97.8306  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Ransom County" },

  // ── OHIO ───────────────────────────────────────────────────────────────────
  { id: "oh-1",  title: "Mohican State Forest OHV",             state: "OH", coords: { latitude: 40.6058,  longitude: -82.3378  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Ashland County" },
  { id: "oh-2",  title: "Pike State Forest OHV",                state: "OH", coords: { latitude: 39.0869,  longitude: -83.0583  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Pike County" },
  { id: "oh-3",  title: "Tar Hollow State Forest OHV",          state: "OH", coords: { latitude: 39.3431,  longitude: -82.7522  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Ross County" },
  { id: "oh-4",  title: "Brush Creek State Forest OHV",         state: "OH", coords: { latitude: 38.7667,  longitude: -83.3072  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Scioto County" },

  // ── OKLAHOMA ───────────────────────────────────────────────────────────────
  { id: "ok-1",  title: "Little Sahara OHV Area",               state: "OK", coords: { latitude: 36.5358,  longitude: -98.8783  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dunes",          suspension: "Stock Friendly",          region: "Woodward County" },
  { id: "ok-2",  title: "Robbers Cave OHV Trails",              state: "OK", coords: { latitude: 34.9281,  longitude: -95.0239  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",           suspension: "2\" Lift Recommended",    region: "Latimer County" },
  { id: "ok-3",  title: "Ouachita NF OHV (Oklahoma Side)",      state: "OK", coords: { latitude: 34.5939,  longitude: -94.8711  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "LeFlore County" },
  { id: "ok-4",  title: "Oologah Lake OHV Trails",              state: "OK", coords: { latitude: 36.4403,  longitude: -95.6986  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Rogers County" },
  { id: "ok-5",  title: "Wichita Mountains OHV",                state: "OK", coords: { latitude: 34.7397,  longitude: -98.6878  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock OK",                region: "Comanche County" },

  // ── OREGON ─────────────────────────────────────────────────────────────────
  { id: "or-1",  title: "Oregon Dunes NRA",                     state: "OR", coords: { latitude: 43.9039,  longitude: -124.1081 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dunes",          suspension: "Stock Friendly",          region: "Lane County" },
  { id: "or-2",  title: "Tillamook State Forest OHV",           state: "OR", coords: { latitude: 45.6814,  longitude: -123.5008 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",           suspension: "2\" Lift Recommended",    region: "Tillamook County" },
  { id: "or-3",  title: "Millican Valley OHV",                  state: "OR", coords: { latitude: 43.9167,  longitude: -120.7008 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Deschutes County" },
  { id: "or-4",  title: "Sumpter Valley OHV Area",              state: "OR", coords: { latitude: 44.7447,  longitude: -118.1989 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Baker County" },
  { id: "or-5",  title: "Ochoco National Forest OHV",           state: "OR", coords: { latitude: 44.3678,  longitude: -120.3419 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Crook County" },
  { id: "or-6",  title: "Umpqua National Forest OHV",           state: "OR", coords: { latitude: 43.3614,  longitude: -122.4319 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / Dirt Bikes",     suspension: "2\" Lift Recommended",    region: "Douglas County" },
  { id: "or-7",  title: "Hart Mountain OHV Trails",             state: "OR", coords: { latitude: 42.5317,  longitude: -119.6689 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Lake County" },

  // ── PENNSYLVANIA ───────────────────────────────────────────────────────────
  { id: "pa-1",  title: "Bald Eagle State Forest OHV",          state: "PA", coords: { latitude: 41.0628,  longitude: -77.6361  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Centre County" },
  { id: "pa-2",  title: "Michaux State Forest OHV",             state: "PA", coords: { latitude: 39.9672,  longitude: -77.2189  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Adams County" },
  { id: "pa-3",  title: "Tuscarora State Forest OHV",           state: "PA", coords: { latitude: 40.4458,  longitude: -77.1761  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Perry County" },
  { id: "pa-4",  title: "Tiadaghton State Forest OHV",          state: "PA", coords: { latitude: 41.4714,  longitude: -77.3317  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Lycoming County" },
  { id: "pa-5",  title: "State Game Lands 44 OHV",              state: "PA", coords: { latitude: 40.8061,  longitude: -77.8661  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Union County" },

  // ── RHODE ISLAND ───────────────────────────────────────────────────────────
  { id: "ri-1",  title: "Arcadia Management Area OHV",          state: "RI", coords: { latitude: 41.5808,  longitude: -71.7158  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Washington County" },
  { id: "ri-2",  title: "Durfee Hill Management Area OHV",      state: "RI", coords: { latitude: 41.9511,  longitude: -71.7308  }, difficulty: "2/10 Easy",         difficultyRating: 2,  size: "All Sizes / Dirt Bikes",     suspension: "Stock Friendly",          region: "Providence County" },

  // ── SOUTH CAROLINA ─────────────────────────────────────────────────────────
  { id: "sc-1",  title: "Long Cane OHV Area (Sumter NF)",       state: "SC", coords: { latitude: 34.1494,  longitude: -82.2519  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Abbeville County" },
  { id: "sc-2",  title: "Wambaw Creek OHV Trails",              state: "SC", coords: { latitude: 33.0878,  longitude: -79.7403  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Berkeley County" },
  { id: "sc-3",  title: "Kings Mountain OHV Area",              state: "SC", coords: { latitude: 35.1197,  longitude: -81.3878  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "York County" },
  { id: "sc-4",  title: "Wambaw Cycle Trail (Francis Marion)",  state: "SC", coords: { latitude: 33.2119,  longitude: -79.6603  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "Dirt Bikes / ATVs",          suspension: "Stock OK",                region: "Berkeley County" },

  // ── SOUTH DAKOTA ───────────────────────────────────────────────────────────
  { id: "sd-1",  title: "Black Hills NF OHV Trails",            state: "SD", coords: { latitude: 44.1339,  longitude: -103.7006 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Pennington County" },
  { id: "sd-2",  title: "Slim Buttes OHV Area",                 state: "SD", coords: { latitude: 45.7419,  longitude: -103.4778 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Harding County" },
  { id: "sd-3",  title: "Badlands OHV Trails",                  state: "SD", coords: { latitude: 43.8553,  longitude: -102.3397 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock OK",                region: "Jackson County" },
  { id: "sd-4",  title: "Custer State Park Jeep Trails",        state: "SD", coords: { latitude: 43.7494,  longitude: -103.5831 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Jeep / High Clearance",     suspension: "2\" Lift Recommended",    region: "Custer County" },

  // ── TENNESSEE ──────────────────────────────────────────────────────────────
  { id: "tn-1",  title: "Windrock Park OHV",                    state: "TN", coords: { latitude: 36.0736,  longitude: -84.2453  }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "All Sizes",                  suspension: "3\" Lift Recommended",    region: "Anderson County" },
  { id: "tn-2",  title: "Brimstone Recreation OHV",             state: "TN", coords: { latitude: 36.2867,  longitude: -84.3764  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "All Sizes / ATVs",           suspension: "2-3\" Lift",              region: "Scott County" },
  { id: "tn-3",  title: "Royal Blue Wildlife Mgmt OHV",         state: "TN", coords: { latitude: 36.5114,  longitude: -83.7789  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift",                region: "Campbell County" },
  { id: "tn-4",  title: "Big South Fork OHV Trails",            state: "TN", coords: { latitude: 36.5019,  longitude: -84.6897  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",           suspension: "2\" Lift Recommended",    region: "Scott County" },
  { id: "tn-5",  title: "Ocoee OHV Trail System",               state: "TN", coords: { latitude: 35.0553,  longitude: -84.6044  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Polk County" },
  { id: "tn-6",  title: "Pickett CCC Memorial OHV",             state: "TN", coords: { latitude: 36.5892,  longitude: -84.8131  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Pickett County" },

  // ── TEXAS ──────────────────────────────────────────────────────────────────
  { id: "tx-1",  title: "Barnwell Mountain Recreation",         state: "TX", coords: { latitude: 32.8561,  longitude: -94.3519  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "All Sizes",                  suspension: "2-3\" Lift",              region: "Gregg County" },
  { id: "tx-2",  title: "Caddo-LBJ National Grasslands",        state: "TX", coords: { latitude: 33.6419,  longitude: -98.1183  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Montague County" },
  { id: "tx-3",  title: "Hidden Falls Adventure Park",          state: "TX", coords: { latitude: 30.3989,  longitude: -98.2886  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Blanco County" },
  { id: "tx-4",  title: "Windmill Ranch OHV",                   state: "TX", coords: { latitude: 32.6367,  longitude: -98.4519  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Palo Pinto County" },
  { id: "tx-5",  title: "Big Bend Ranch OHV Roads",             state: "TX", coords: { latitude: 29.5056,  longitude: -104.0178 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Presidio County" },
  { id: "tx-6",  title: "Bandera OHV Park",                     state: "TX", coords: { latitude: 29.7267,  longitude: -99.0761  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Bandera County" },
  { id: "tx-7",  title: "Texas Motorplex OHV Trails",           state: "TX", coords: { latitude: 32.3167,  longitude: -97.1178  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Ellis County" },
  { id: "tx-8",  title: "Palo Duro Canyon OHV",                 state: "TX", coords: { latitude: 34.7219,  longitude: -101.6703 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock OK",                region: "Randall County" },

  // ── UTAH ───────────────────────────────────────────────────────────────────
  { id: "ut-1",  title: "Hell's Revenge (Moab)",                state: "UT", coords: { latitude: 38.5436,  longitude: -109.5386 }, difficulty: "9/10 Extreme",      difficultyRating: 9,  size: "Jeep / Rock Crawlers",       suspension: "Long Travel + Lockers",   region: "Grand County" },
  { id: "ut-2",  title: "Fins N Things (Moab)",                 state: "UT", coords: { latitude: 38.6303,  longitude: -109.5892 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Mid-Size & Larger",          suspension: "3\" Lift + Lockers",      region: "Grand County" },
  { id: "ut-3",  title: "White Rim Road (Canyonlands)",         state: "UT", coords: { latitude: 38.2136,  longitude: -109.9003 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "San Juan County" },
  { id: "ut-4",  title: "Chicken Corners",                      state: "UT", coords: { latitude: 38.3122,  longitude: -109.7619 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Grand County" },
  { id: "ut-5",  title: "Little Sahara Recreation Area",        state: "UT", coords: { latitude: 39.6547,  longitude: -112.2894 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Dunes",          suspension: "Stock Friendly",          region: "Juab County" },
  { id: "ut-6",  title: "Paiute ATV Trail System",              state: "UT", coords: { latitude: 38.3911,  longitude: -112.0869 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "ATVs / Mid-Size",            suspension: "Stock OK",                region: "Sevier County" },
  { id: "ut-7",  title: "Rattlesnake OHV Area",                 state: "UT", coords: { latitude: 41.0778,  longitude: -112.1592 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Weber County" },
  { id: "ut-8",  title: "Sand Hollow OHV Area",                 state: "UT", coords: { latitude: 37.1367,  longitude: -113.3978 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dunes",          suspension: "Stock Friendly",          region: "Washington County" },
  { id: "ut-9",  title: "Onion Creek Trail (Moab)",             state: "UT", coords: { latitude: 38.6856,  longitude: -109.4447 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Grand County" },
  { id: "ut-10", title: "Steel Bender (Moab)",                  state: "UT", coords: { latitude: 38.5489,  longitude: -109.5728 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / Short Wheelbase",    suspension: "3-4\" Lift + Lockers",    region: "Grand County" },

  // ── VERMONT ────────────────────────────────────────────────────────────────
  { id: "vt-1",  title: "Green Mountain NF OHV Trails",         state: "VT", coords: { latitude: 43.8919,  longitude: -72.9456  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Rutland County" },
  { id: "vt-2",  title: "Groton State Forest OHV",              state: "VT", coords: { latitude: 44.3411,  longitude: -72.2961  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Caledonia County" },
  { id: "vt-3",  title: "Northeast Kingdom OHV Trails",         state: "VT", coords: { latitude: 44.9278,  longitude: -72.0417  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Essex County" },

  // ── VIRGINIA ───────────────────────────────────────────────────────────────
  { id: "va-1",  title: "George Washington NF OHV",             state: "VA", coords: { latitude: 38.4322,  longitude: -79.3928  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Augusta County" },
  { id: "va-2",  title: "New River Trail OHV Section",          state: "VA", coords: { latitude: 36.8761,  longitude: -80.8764  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Grayson County" },
  { id: "va-3",  title: "Jefferson NF OHV Trails",              state: "VA", coords: { latitude: 37.3917,  longitude: -80.6006  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Montgomery County" },
  { id: "va-4",  title: "Pocahontas State Park OHV",            state: "VA", coords: { latitude: 37.3578,  longitude: -77.5806  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Chesterfield County" },
  { id: "va-5",  title: "Sherando Lake OHV Area",               state: "VA", coords: { latitude: 38.0908,  longitude: -79.0031  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock OK",                region: "Augusta County" },

  // ── WASHINGTON ─────────────────────────────────────────────────────────────
  { id: "wa-1",  title: "Tahuya State Forest OHV",              state: "WA", coords: { latitude: 47.4319,  longitude: -122.9836 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Mason County" },
  { id: "wa-2",  title: "Capitol State Forest OHV",             state: "WA", coords: { latitude: 46.9178,  longitude: -123.0864 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Thurston County" },
  { id: "wa-3",  title: "Ahtanum State Forest",                 state: "WA", coords: { latitude: 46.5367,  longitude: -120.7053 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Yakima County" },
  { id: "wa-4",  title: "Reiter Foothills Forest",              state: "WA", coords: { latitude: 47.8803,  longitude: -121.7106 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / Dirt Bikes",     suspension: "2\" Lift Recommended",    region: "Snohomish County" },
  { id: "wa-5",  title: "Tiger Mountain State Forest OHV",      state: "WA", coords: { latitude: 47.5172,  longitude: -121.9728 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "King County" },
  { id: "wa-6",  title: "Colockum WMA OHV Trails",              state: "WA", coords: { latitude: 47.2361,  longitude: -120.1458 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock OK",                region: "Chelan County" },
  { id: "wa-7",  title: "Methow Valley OHV Trails",             state: "WA", coords: { latitude: 48.4378,  longitude: -120.0989 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Okanogan County" },

  // ── WEST VIRGINIA ──────────────────────────────────────────────────────────
  { id: "wv-1",  title: "Hatfield-McCoy Trails (Main)",         state: "WV", coords: { latitude: 37.6522,  longitude: -82.0431  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Mingo County" },
  { id: "wv-2",  title: "Hatfield-McCoy (Devil Anse)",          state: "WV", coords: { latitude: 37.7344,  longitude: -82.1678  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Logan County" },
  { id: "wv-3",  title: "Pocahontas County Trails",             state: "WV", coords: { latitude: 38.3328,  longitude: -80.2308  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Pocahontas County" },
  { id: "wv-4",  title: "Hatfield-McCoy (Bear Wallow)",         state: "WV", coords: { latitude: 37.5789,  longitude: -81.9364  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Wyoming County" },
  { id: "wv-5",  title: "Monongahela NF OHV Trails",            state: "WV", coords: { latitude: 38.6831,  longitude: -79.8128  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Randolph County" },

  // ── WISCONSIN ──────────────────────────────────────────────────────────────
  { id: "wi-1",  title: "Pine Line / ATV Trails",               state: "WI", coords: { latitude: 45.4708,  longitude: -90.3981  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Taylor County" },
  { id: "wi-2",  title: "Nicolet NF OHV Trails",                state: "WI", coords: { latitude: 45.8028,  longitude: -88.9461  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Forest County" },
  { id: "wi-3",  title: "Flambeau River State Forest OHV",      state: "WI", coords: { latitude: 45.7081,  longitude: -90.8094  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Price County" },
  { id: "wi-4",  title: "Chequamegon NF OHV Trails",            state: "WI", coords: { latitude: 46.0444,  longitude: -91.1533  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Ashland County" },
  { id: "wi-5",  title: "Brule River State Forest OHV",         state: "WI", coords: { latitude: 46.5561,  longitude: -91.6519  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Douglas County" },

  // ── WYOMING ────────────────────────────────────────────────────────────────
  { id: "wy-1",  title: "Bridger-Teton OHV Trails",             state: "WY", coords: { latitude: 43.4833,  longitude: -110.7667 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Teton County" },
  { id: "wy-2",  title: "Snowy Range OHV Area",                 state: "WY", coords: { latitude: 41.3547,  longitude: -106.1608 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Albany County" },
  { id: "wy-3",  title: "Medicine Bow OHV Trails",              state: "WY", coords: { latitude: 41.6500,  longitude: -106.2167 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Carbon County" },
  { id: "wy-4",  title: "Bighorn National Forest OHV",          state: "WY", coords: { latitude: 44.4881,  longitude: -107.4633 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Sheridan County" },
  { id: "wy-5",  title: "Thunder Basin National Grassland",     state: "WY", coords: { latitude: 43.4511,  longitude: -105.0228 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Converse County" },
  { id: "wy-6",  title: "Vedauwoo OHV Trails",                  state: "WY", coords: { latitude: 41.1631,  longitude: -105.3747 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Jeep / Short Wheelbase",    suspension: "3\" Lift + Lockers",      region: "Albany County" },
  { id: "wy-7",  title: "Shirley Mountains OHV",                state: "WY", coords: { latitude: 42.1181,  longitude: -106.2844 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Carbon County" },
  { id: "wy-8",  title: "Mule Creek Junction OHV",              state: "WY", coords: { latitude: 42.7581,  longitude: -104.7844 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Niobrara County" },

  // ── ADDITIONAL COLORADO ─────────────────────────────────────────────────────
  { id: "co-10", title: "Gold Hill OHV Trail (Ouray)",          state: "CO", coords: { latitude: 38.0228,  longitude: -107.5786 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / Short Wheelbase",    suspension: "3-4\" Lift + Lockers",    region: "Ouray County" },
  { id: "co-11", title: "Ophir Pass",                           state: "CO", coords: { latitude: 37.8481,  longitude: -107.8247 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance",             suspension: "3\" Lift",                region: "San Miguel County" },
  { id: "co-12", title: "Black Bear Pass (Telluride)",          state: "CO", coords: { latitude: 37.9019,  longitude: -107.7417 }, difficulty: "9/10 Extreme",      difficultyRating: 9,  size: "Jeep / Short Wheelbase",    suspension: "4\" Lift + Lockers",      region: "San Miguel County" },
  { id: "co-13", title: "Engineer Pass",                        state: "CO", coords: { latitude: 37.9808,  longitude: -107.5961 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / Short Wheelbase",    suspension: "3-4\" Lift",              region: "Ouray County" },
  { id: "co-14", title: "Imogene Pass",                         state: "CO", coords: { latitude: 37.9325,  longitude: -107.7097 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / Short Wheelbase",    suspension: "3\" Lift",                region: "Ouray / San Miguel County" },
  { id: "co-15", title: "Cinnamon Pass (Lake City)",            state: "CO", coords: { latitude: 37.9553,  longitude: -107.5217 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance",             suspension: "2-3\" Lift",              region: "Hinsdale County" },
  { id: "co-16", title: "Alpine Loop (Silverton)",              state: "CO", coords: { latitude: 37.8117,  longitude: -107.6597 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance",             suspension: "3\" Lift",                region: "San Juan County" },
  { id: "co-17", title: "Phantom Canyon Road",                  state: "CO", coords: { latitude: 38.4672,  longitude: -105.2197 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Fremont County" },

  // ── ADDITIONAL ARIZONA ──────────────────────────────────────────────────────
  { id: "az-10", title: "Crown King Road (Prescott NF)",        state: "AZ", coords: { latitude: 34.2242,  longitude: -112.3444 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Yavapai County" },
  { id: "az-11", title: "Bloody Basin Road",                    state: "AZ", coords: { latitude: 34.1583,  longitude: -111.9567 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Yavapai County" },
  { id: "az-12", title: "Four Peaks Wilderness 4WD",            state: "AZ", coords: { latitude: 33.7133,  longitude: -111.3261 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Jeep / Short Wheelbase",    suspension: "3\" Lift",                region: "Maricopa County" },
  { id: "az-13", title: "Lynx Creek OHV (Prescott)",            state: "AZ", coords: { latitude: 34.5736,  longitude: -112.4442 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Yavapai County" },
  { id: "az-14", title: "Harquahala Mountain Road",             state: "AZ", coords: { latitude: 33.8069,  longitude: -113.3522 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Maricopa County" },
  { id: "az-15", title: "Box Canyon Road (Tucson)",             state: "AZ", coords: { latitude: 32.4433,  longitude: -110.7881 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Pima County" },

  // ── ADDITIONAL TEXAS ────────────────────────────────────────────────────────
  { id: "tx-9",  title: "Palo Duro Canyon 4WD",                 state: "TX", coords: { latitude: 34.6878,  longitude: -101.6747 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Randall County" },
  { id: "tx-10", title: "Enchanted Rock 4WD Routes",            state: "TX", coords: { latitude: 30.5073,  longitude: -98.8194  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock OK",                region: "Gillespie County" },
  { id: "tx-11", title: "Barton Warnock OHV (Terlingua)",       state: "TX", coords: { latitude: 29.3147,  longitude: -103.6283 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Brewster County" },
  { id: "tx-12", title: "Angelina NF East TX OHV",              state: "TX", coords: { latitude: 31.3436,  longitude: -94.7200  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Angelina County" },
  { id: "tx-13", title: "Hill Country Trail System (Kerrville)",state: "TX", coords: { latitude: 30.0469,  longitude: -99.1403  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Kerr County" },
  { id: "tx-14", title: "San Angelo OHV Loop",                  state: "TX", coords: { latitude: 31.4638,  longitude: -100.4370 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Tom Green County" },
  { id: "tx-15", title: "Longhorn Cavern OHV (Burnet)",         state: "TX", coords: { latitude: 30.6869,  longitude: -98.3561  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Burnet County" },
  { id: "tx-16", title: "Davy Crockett NF OHV Trails",         state: "TX", coords: { latitude: 31.3286,  longitude: -95.1356  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Houston County" },

  // ── ADDITIONAL UTAH ─────────────────────────────────────────────────────────
  { id: "ut-11", title: "White Rim Trail (Canyonlands)",        state: "UT", coords: { latitude: 38.2969,  longitude: -109.8583 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance",             suspension: "2-3\" Lift",              region: "Grand County" },
  { id: "ut-12", title: "Hell's Revenge (Moab)",                state: "UT", coords: { latitude: 38.5908,  longitude: -109.5547 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / Short Wheelbase",    suspension: "3\" Lift + Lockers",      region: "Grand County" },
  { id: "ut-13", title: "Fins & Things (Moab)",                 state: "UT", coords: { latitude: 38.5839,  longitude: -109.5231 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance",             suspension: "3\" Lift",                region: "Grand County" },
  { id: "ut-14", title: "Elephant Hill 4WD (Canyonlands)",      state: "UT", coords: { latitude: 38.1522,  longitude: -109.8081 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / Short Wheelbase",    suspension: "3-4\" Lift + Lockers",    region: "San Juan County" },
  { id: "ut-15", title: "Onion Creek Trail (Castle Valley)",    state: "UT", coords: { latitude: 38.7542,  longitude: -109.5036 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Grand County" },
  { id: "ut-16", title: "Chicken Corners (Moab)",               state: "UT", coords: { latitude: 38.2081,  longitude: -109.9117 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Grand County" },

  // ── ADDITIONAL NEVADA ───────────────────────────────────────────────────────
  { id: "nv-9",  title: "Eldorado Canyon 4WD (Nelson)",         state: "NV", coords: { latitude: 35.7181,  longitude: -114.8383 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Clark County" },
  { id: "nv-10", title: "Rye Patch OHV Area",                   state: "NV", coords: { latitude: 40.4644,  longitude: -118.2244 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Pershing County" },
  { id: "nv-11", title: "Dixie Valley OHV (Fallon)",            state: "NV", coords: { latitude: 39.8867,  longitude: -117.8361 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Churchill County" },
  { id: "nv-12", title: "Gold Butte NM 4WD Trails",            state: "NV", coords: { latitude: 36.4697,  longitude: -114.2358 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Clark County" },
  { id: "nv-13", title: "Wheeler Pass Trail (Las Vegas)",       state: "NV", coords: { latitude: 36.5317,  longitude: -116.2347 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance",             suspension: "2-3\" Lift",              region: "Clark County" },

  // ── ADDITIONAL WASHINGTON ───────────────────────────────────────────────────
  { id: "wa-8",  title: "Ahtanum State Forest OHV",             state: "WA", coords: { latitude: 46.5569,  longitude: -120.7658 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Yakima County" },
  { id: "wa-9",  title: "Cle Elum OHV Trails",                  state: "WA", coords: { latitude: 47.1936,  longitude: -120.9353 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Kittitas County" },
  { id: "wa-10", title: "Capitol State Forest OHV",             state: "WA", coords: { latitude: 46.9317,  longitude: -123.0672 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Thurston County" },
  { id: "wa-11", title: "Sinlahekin Wildlife OHV",              state: "WA", coords: { latitude: 48.6558,  longitude: -119.5347 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Okanogan County" },
  { id: "wa-12", title: "Taneum Ridge OHV (Ellensburg)",        state: "WA", coords: { latitude: 47.0636,  longitude: -120.8347 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Kittitas County" },

  // ── ADDITIONAL OREGON ───────────────────────────────────────────────────────
  { id: "or-8",  title: "Millican Valley OHV",                  state: "OR", coords: { latitude: 43.8547,  longitude: -120.7744 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Deschutes County" },
  { id: "or-9",  title: "Ochoco Divide OHV",                    state: "OR", coords: { latitude: 44.3214,  longitude: -120.6247 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Crook County" },
  { id: "or-10", title: "Fort Rock OHV Area",                   state: "OR", coords: { latitude: 43.3664,  longitude: -121.0647 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Lake County" },
  { id: "or-11", title: "Siltcoos OHV Area (Florence)",         state: "OR", coords: { latitude: 43.9147,  longitude: -124.0922 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Dune Vehicles",  suspension: "Stock Friendly",          region: "Lane County" },
  { id: "or-12", title: "Badlands OHV (Bend)",                  state: "OR", coords: { latitude: 43.9081,  longitude: -121.0314 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Deschutes County" },

  // ── ADDITIONAL IDAHO ────────────────────────────────────────────────────────
  { id: "id-8",  title: "Payette NF OHV Trails",                state: "ID", coords: { latitude: 44.8581,  longitude: -115.4822 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",           suspension: "2\" Lift Recommended",    region: "Valley County" },
  { id: "id-9",  title: "Clearwater NF OHV Trails",             state: "ID", coords: { latitude: 46.5881,  longitude: -115.4022 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Clearwater County" },
  { id: "id-10", title: "Island Park OHV Area",                 state: "ID", coords: { latitude: 44.4081,  longitude: -111.3022 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Fremont County" },
  { id: "id-11", title: "Red Rock Pass OHV",                    state: "ID", coords: { latitude: 42.4814,  longitude: -111.9522 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Caribou County" },
  { id: "id-12", title: "Curlew NF OHV Trails",                 state: "ID", coords: { latitude: 42.2814,  longitude: -112.5522 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Oneida County" },

  // ── ADDITIONAL MONTANA ──────────────────────────────────────────────────────
  { id: "mt-7",  title: "Beartooth OHV Trails (Red Lodge)",     state: "MT", coords: { latitude: 45.1931,  longitude: -109.2044 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance",             suspension: "2-3\" Lift",              region: "Carbon County" },
  { id: "mt-8",  title: "Highwood Mountains OHV",               state: "MT", coords: { latitude: 47.1931,  longitude: -110.2044 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Chouteau County" },
  { id: "mt-9",  title: "Bitterroot Valley 4WD",                state: "MT", coords: { latitude: 46.1581,  longitude: -114.0844 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Ravalli County" },
  { id: "mt-10", title: "Tobacco Root Mountains OHV",           state: "MT", coords: { latitude: 45.5581,  longitude: -112.0844 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Madison County" },
  { id: "mt-11", title: "Clark Fork OHV (Superior)",            state: "MT", coords: { latitude: 47.1881,  longitude: -114.8844 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Mineral County" },

  // ── ADDITIONAL NEW MEXICO ────────────────────────────────────────────────────
  { id: "nm-7",  title: "Jemez Mountains OHV (Santa Fe NF)",    state: "NM", coords: { latitude: 35.8422,  longitude: -106.6214 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Sandoval County" },
  { id: "nm-8",  title: "Lincoln NF OHV (Ruidoso)",             state: "NM", coords: { latitude: 33.3622,  longitude: -105.8214 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Lincoln County" },
  { id: "nm-9",  title: "Gila NF OHV (Silver City)",            state: "NM", coords: { latitude: 33.2122,  longitude: -108.2814 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Grant County" },
  { id: "nm-10", title: "Carson NF OHV (Taos)",                 state: "NM", coords: { latitude: 36.5522,  longitude: -105.6214 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Taos County" },

  // ── ADDITIONAL FLORIDA ──────────────────────────────────────────────────────
  { id: "fl-6",  title: "Croom OHV Trails (Brooksville)",       state: "FL", coords: { latitude: 28.6097,  longitude: -82.4408  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Hernando County" },
  { id: "fl-7",  title: "Tate's Hell 4WD (Carrabelle)",         state: "FL", coords: { latitude: 29.9597,  longitude: -84.6808  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Franklin County" },
  { id: "fl-8",  title: "Richloam OHV (Dade City)",             state: "FL", coords: { latitude: 28.3797,  longitude: -82.2208  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Pasco County" },
  { id: "fl-9",  title: "Blackwater State Forest OHV",          state: "FL", coords: { latitude: 30.7247,  longitude: -86.9408  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Santa Rosa County" },

  // ── ADDITIONAL GEORGIA ──────────────────────────────────────────────────────
  { id: "ga-6",  title: "Cohutta Wilderness 4WD (Blue Ridge NF)",state: "GA", coords: { latitude: 34.9222, longitude: -84.6814  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Jeep / Short Wheelbase",    suspension: "3\" Lift",                region: "Fannin County" },
  { id: "ga-7",  title: "Cloudland Canyon OHV (Rising Fawn)",   state: "GA", coords: { latitude: 34.8322,  longitude: -85.4814  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Walker County" },
  { id: "ga-8",  title: "Dawson Forest OHV",                    state: "GA", coords: { latitude: 34.4022,  longitude: -84.1814  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Dawson County" },
  { id: "ga-9",  title: "Raven Rock OHV Trails",                state: "GA", coords: { latitude: 34.6522,  longitude: -84.9214  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Gilmer County" },

  // ── ADDITIONAL TENNESSEE ─────────────────────────────────────────────────────
  { id: "tn-7",  title: "Rogers Creek OHV (Wartburg)",          state: "TN", coords: { latitude: 36.1022,  longitude: -84.5814  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Morgan County" },
  { id: "tn-8",  title: "Bald Mountain OHV (Cosby)",            state: "TN", coords: { latitude: 35.8522,  longitude: -83.1814  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance",             suspension: "3\" Lift",                region: "Cocke County" },
  { id: "tn-9",  title: "North Cherokee OHV (Etowah)",          state: "TN", coords: { latitude: 35.2522,  longitude: -84.5314  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Polk County" },

  // ── ADDITIONAL NORTH CAROLINA ────────────────────────────────────────────────
  { id: "nc-6",  title: "Uwharrie NF OHV Trails (Troy)",        state: "NC", coords: { latitude: 35.3822,  longitude: -80.0614  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Mid-Size & Larger",          suspension: "2\" Lift",                region: "Montgomery County" },
  { id: "nc-7",  title: "Wayah Bald 4WD (Franklin)",            state: "NC", coords: { latitude: 35.1722,  longitude: -83.5814  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Macon County" },
  { id: "nc-8",  title: "Wilson Creek OHV Area (Lenoir)",       state: "NC", coords: { latitude: 36.0322,  longitude: -81.7514  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Caldwell County" },

  // ── ADDITIONAL VIRGINIA ──────────────────────────────────────────────────────
  { id: "va-6",  title: "Dragon's Back OHV (Clinch District)",  state: "VA", coords: { latitude: 36.8222,  longitude: -82.6814  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Scott County" },
  { id: "va-7",  title: "Taskers Gap 4WD (Shenandoah NF)",      state: "VA", coords: { latitude: 38.9222,  longitude: -78.3814  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Shenandoah County" },
  { id: "va-8",  title: "Mt Rogers OHV Trails",                 state: "VA", coords: { latitude: 36.6622,  longitude: -81.5414  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Grayson County" },

  // ── ADDITIONAL WEST VIRGINIA ─────────────────────────────────────────────────
  { id: "wv-6",  title: "Hatfield-McCoy Trails (Maidsville)",   state: "WV", coords: { latitude: 37.7222,  longitude: -81.8514  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Mingo County" },
  { id: "wv-7",  title: "Stonewall Country OHV",                state: "WV", coords: { latitude: 39.1922,  longitude: -80.7614  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Lewis County" },
  { id: "wv-8",  title: "Chestnut Ridge OHV (Morgantown)",      state: "WV", coords: { latitude: 39.6322,  longitude: -80.0614  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Monongalia County" },

  // ── ADDITIONAL MICHIGAN ──────────────────────────────────────────────────────
  { id: "mi-6",  title: "Silver Lake Sand Dunes OHV",           state: "MI", coords: { latitude: 43.6622,  longitude: -86.4214  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Oceana County" },
  { id: "mi-7",  title: "Mio OHV Trails (AuSable NF)",          state: "MI", coords: { latitude: 44.6522,  longitude: -84.1214  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Oscoda County" },
  { id: "mi-8",  title: "Briar Hill OHV (Cadillac)",            state: "MI", coords: { latitude: 44.2522,  longitude: -85.3214  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Wexford County" },

  // ── ADDITIONAL MINNESOTA ─────────────────────────────────────────────────────
  { id: "mn-5",  title: "Soo Line OHV Trail (Cloquet)",         state: "MN", coords: { latitude: 46.7222,  longitude: -92.4814  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Carlton County" },
  { id: "mn-6",  title: "Camp Ripley OHV Area",                 state: "MN", coords: { latitude: 46.0922,  longitude: -94.3614  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Morrison County" },
  { id: "mn-7",  title: "Nemadji State Forest OHV",             state: "MN", coords: { latitude: 46.5822,  longitude: -92.3414  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Carlton County" },

  // ── ADDITIONAL ARKANSAS ──────────────────────────────────────────────────────
  { id: "ar-6",  title: "Mill Creek OHV (Ouachita NF)",         state: "AR", coords: { latitude: 34.6322,  longitude: -93.7614  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Polk County" },
  { id: "ar-7",  title: "Buffalo NR 4WD (Boxley Valley)",       state: "AR", coords: { latitude: 35.9822,  longitude: -93.3614  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Newton County" },
  { id: "ar-8",  title: "Sylamore OHV (Ozark NF)",              state: "AR", coords: { latitude: 35.8522,  longitude: -92.1614  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Stone County" },

  // ── ADDITIONAL OKLAHOMA ──────────────────────────────────────────────────────
  { id: "ok-6",  title: "Cedar Lake OHV (Ouachita NF)",         state: "OK", coords: { latitude: 34.6922,  longitude: -94.9614  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Leflore County" },
  { id: "ok-7",  title: "Natural Dam OHV (Cedarville)",         state: "OK", coords: { latitude: 35.4422,  longitude: -94.5614  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Crawford County" },
  { id: "ok-8",  title: "Quartz Mountain OHV",                  state: "OK", coords: { latitude: 34.9422,  longitude: -99.2214  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Greer County" },

  // ── ADDITIONAL NEW YORK ───────────────────────────────────────────────────────
  { id: "ny-4",  title: "Tug Hill OHV Area (Lowville)",         state: "NY", coords: { latitude: 43.7922,  longitude: -75.4914  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Lewis County" },
  { id: "ny-5",  title: "Finger Lakes NF OHV (Hector)",         state: "NY", coords: { latitude: 42.4822,  longitude: -76.8714  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Schuyler County" },
  { id: "ny-6",  title: "Catskill 4WD Trails (Roxbury)",        state: "NY", coords: { latitude: 42.0722,  longitude: -74.3514  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Delaware County" },

  // ── ADDITIONAL KENTUCKY ──────────────────────────────────────────────────────
  { id: "ky-5",  title: "Redbird Crest OHV (Big Creek)",        state: "KY", coords: { latitude: 36.9822,  longitude: -83.7514  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",           suspension: "2\" Lift Recommended",    region: "Clay County" },
  { id: "ky-6",  title: "Morehead OHV Area",                    state: "KY", coords: { latitude: 38.1822,  longitude: -83.4514  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Rowan County" },
  { id: "ky-7",  title: "Pine Mountain OHV (Pikeville)",        state: "KY", coords: { latitude: 37.4822,  longitude: -82.5214  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Pike County" },

  // ── ADDITIONAL OHIO ───────────────────────────────────────────────────────────
  { id: "oh-5",  title: "Woodbury Wildlife OHV",                state: "OH", coords: { latitude: 40.3822,  longitude: -82.2714  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Coshocton County" },
  { id: "oh-6",  title: "Lawrence Woods OHV (Marion)",          state: "OH", coords: { latitude: 40.5922,  longitude: -83.1714  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Marion County" },
  { id: "oh-7",  title: "Perry State Forest OHV",               state: "OH", coords: { latitude: 39.7222,  longitude: -82.2514  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Perry County" },

  // ── ADDITIONAL MISSOURI ──────────────────────────────────────────────────────
  { id: "mo-5",  title: "Berryman OHV Trail (Potosi)",          state: "MO", coords: { latitude: 37.9222,  longitude: -90.8714  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Washington County" },
  { id: "mo-6",  title: "Council Bluff OHV (Steelville)",       state: "MO", coords: { latitude: 38.0822,  longitude: -91.5714  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Crawford County" },
  { id: "mo-7",  title: "Chadwick OHV Area (Springfield)",      state: "MO", coords: { latitude: 36.7822,  longitude: -93.0514  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Christian County" },

  // ── ADDITIONAL ALASKA ────────────────────────────────────────────────────────
  { id: "ak-5",  title: "Chugach State Park OHV (Anchorage)",   state: "AK", coords: { latitude: 61.2181,  longitude: -149.4081 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",           suspension: "2\" Lift Recommended",    region: "Anchorage Borough" },
  { id: "ak-6",  title: "Tok River OHV Trails",                 state: "AK", coords: { latitude: 63.3381,  longitude: -143.0081 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Southeast Fairbanks Borough" },
  { id: "ak-7",  title: "Nome OHV Trails",                      state: "AK", coords: { latitude: 64.5031,  longitude: -165.4081 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Nome Census Area" },

  // ── ADDITIONAL SOUTH CAROLINA ────────────────────────────────────────────────
  { id: "sc-5",  title: "Sumter NF OHV (Edgefield)",            state: "SC", coords: { latitude: 33.8022,  longitude: -81.9714  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Edgefield County" },
  { id: "sc-6",  title: "Broad River OHV (Gaffney)",            state: "SC", coords: { latitude: 35.0622,  longitude: -81.6514  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Cherokee County" },

  // ── ADDITIONAL PENNSYLVANIA ──────────────────────────────────────────────────
  { id: "pa-6",  title: "Bald Eagle State Forest OHV",          state: "PA", coords: { latitude: 41.1522,  longitude: -77.4714  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Clinton County" },
  { id: "pa-7",  title: "Laurel Highlands OHV (Ligonier)",      state: "PA", coords: { latitude: 40.2522,  longitude: -79.2714  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Westmoreland County" },

  // ── ADDITIONAL INDIANA ───────────────────────────────────────────────────────
  { id: "in-4",  title: "Hoosier NF 4WD (Paoli)",               state: "IN", coords: { latitude: 38.4822,  longitude: -86.5014  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Orange County" },
  { id: "in-5",  title: "Redbird Hollow OHV (Bedford)",         state: "IN", coords: { latitude: 38.8622,  longitude: -86.5214  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Lawrence County" },

  // ── ADDITIONAL ILLINOIS ──────────────────────────────────────────────────────
  { id: "il-4",  title: "Shawnee NF OHV (Murphysboro)",         state: "IL", coords: { latitude: 37.7622,  longitude: -89.3314  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Jackson County" },
  { id: "il-5",  title: "Rend Lake OHV (Benton)",               state: "IL", coords: { latitude: 38.0822,  longitude: -89.0014  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Franklin County" },

  // ── ADDITIONAL KANSAS ────────────────────────────────────────────────────────
  { id: "ks-4",  title: "Kanopolis Lake OHV",                   state: "KS", coords: { latitude: 38.6922,  longitude: -98.1914  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Ellsworth County" },
  { id: "ks-5",  title: "Cheney Reservoir OHV",                 state: "KS", coords: { latitude: 37.7622,  longitude: -97.8214  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Reno County" },

  // ── ADDITIONAL LOUISIANA ─────────────────────────────────────────────────────
  { id: "la-5",  title: "Kisatchie NF OHV (Natchitoches)",      state: "LA", coords: { latitude: 31.7622,  longitude: -93.0814  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Natchitoches Parish" },
  { id: "la-6",  title: "Lake Bistineau OHV Area",              state: "LA", coords: { latitude: 32.4822,  longitude: -93.3614  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Bossier Parish" },

  // ── ADDITIONAL MISSISSIPPI ───────────────────────────────────────────────────
  { id: "ms-4",  title: "Bienville NF OHV (Forest)",            state: "MS", coords: { latitude: 32.0622,  longitude: -89.4714  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Scott County" },
  { id: "ms-5",  title: "Tombigbee NF OHV (Ackerman)",          state: "MS", coords: { latitude: 33.3022,  longitude: -89.1714  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Choctaw County" },

  // ── ADDITIONAL ALABAMA ───────────────────────────────────────────────────────
  { id: "al-5",  title: "Sipsey Wilderness 4WD (Bankhead NF)",  state: "AL", coords: { latitude: 34.3322,  longitude: -87.3714  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift",                region: "Lawrence County" },
  { id: "al-6",  title: "Choccolocco OHV (Talladega NF)",       state: "AL", coords: { latitude: 33.5722,  longitude: -86.0614  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Talladega County" },

  // ── ADDITIONAL SOUTH DAKOTA ──────────────────────────────────────────────────
  { id: "sd-5",  title: "Black Hills NF OHV (Hill City)",       state: "SD", coords: { latitude: 43.9322,  longitude: -103.5714 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Pennington County" },
  { id: "sd-6",  title: "Custer State Park 4WD",                state: "SD", coords: { latitude: 43.7422,  longitude: -103.3514 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Custer County" },

  // ── ADDITIONAL NORTH DAKOTA ──────────────────────────────────────────────────
  { id: "nd-4",  title: "Little Missouri NF OHV",               state: "ND", coords: { latitude: 47.4022,  longitude: -103.7714 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Billings County" },
  { id: "nd-5",  title: "Sheyenne NF OHV (Lisbon)",             state: "ND", coords: { latitude: 46.4722,  longitude: -97.9814  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Ransom County" },

  // ── ADDITIONAL NEBRASKA ──────────────────────────────────────────────────────
  { id: "ne-5",  title: "Pine Ridge OHV (Crawford)",            state: "NE", coords: { latitude: 42.6722,  longitude: -103.4014 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Dawes County" },
  { id: "ne-6",  title: "Niobrara River Valley OHV",            state: "NE", coords: { latitude: 42.8622,  longitude: -99.7814  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Keya Paha County" },

  // ── ADDITIONAL IOWA ──────────────────────────────────────────────────────────
  { id: "ia-4",  title: "Shimek State Forest OHV (Farmington)", state: "IA", coords: { latitude: 40.6622,  longitude: -91.7814  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Van Buren County" },
  { id: "ia-5",  title: "Yellow River State Forest OHV",        state: "IA", coords: { latitude: 43.2022,  longitude: -91.3814  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Allamakee County" },

  // ── ADDITIONAL HAWAII ────────────────────────────────────────────────────────
  { id: "hi-4",  title: "Kahuku OHV Area (Big Island)",         state: "HI", coords: { latitude: 18.9422,  longitude: -155.6614 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Hawaii County" },
  { id: "hi-5",  title: "Polipoli Spring OHV (Maui)",           state: "HI", coords: { latitude: 20.5722,  longitude: -156.3214 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Maui County" },

  // ── ADDITIONAL NEW ENGLAND ───────────────────────────────────────────────────
  { id: "nh-4",  title: "Franconia Notch OHV Area",             state: "NH", coords: { latitude: 44.1422,  longitude: -71.6814  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Grafton County" },
  { id: "nh-5",  title: "Lake Sunapee OHV Trails",              state: "NH", coords: { latitude: 43.3922,  longitude: -72.1514  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Merrimack County" },
  { id: "me-4",  title: "Katahdin Woods OHV Trails",            state: "ME", coords: { latitude: 45.8622,  longitude: -68.7814  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Piscataquis County" },
  { id: "me-5",  title: "Moosehead Lake OHV (Greenville)",      state: "ME", coords: { latitude: 45.4622,  longitude: -69.6414  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Piscataquis County" },
  { id: "vt-4",  title: "Green Mountain NF OHV (Rochester)",    state: "VT", coords: { latitude: 43.8722,  longitude: -72.9414  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Windsor County" },
  { id: "vt-5",  title: "Groton State Forest OHV",              state: "VT", coords: { latitude: 44.2222,  longitude: -72.3614  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Caledonia County" },
  { id: "ma-4",  title: "Otis State Forest OHV (Blandford)",    state: "MA", coords: { latitude: 42.1822,  longitude: -72.9514  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Hampden County" },
  { id: "ma-5",  title: "Myles Standish State Forest OHV",      state: "MA", coords: { latitude: 41.8622,  longitude: -70.6514  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Plymouth County" },
  { id: "ct-3",  title: "Pachaug State Forest OHV (Voluntown)", state: "CT", coords: { latitude: 41.5922,  longitude: -71.8814  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "New London County" },
  { id: "ct-4",  title: "Cockaponset State Forest OHV",         state: "CT", coords: { latitude: 41.4722,  longitude: -72.5514  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",           suspension: "Stock OK",                region: "Middlesex County" },
  { id: "ri-3",  title: "Arcadia Management Area OHV",          state: "RI", coords: { latitude: 41.5422,  longitude: -71.6814  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Washington County" },
  { id: "ri-4",  title: "Wickaboxet Management OHV",            state: "RI", coords: { latitude: 41.6022,  longitude: -71.7514  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Kent County" },
  { id: "nj-3",  title: "Wharton State Forest OHV (Batsto)",    state: "NJ", coords: { latitude: 39.6422,  longitude: -74.6514  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Burlington County" },
  { id: "nj-4",  title: "Brendan T. Byrne State Forest OHV",    state: "NJ", coords: { latitude: 39.9122,  longitude: -74.5314  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Burlington County" },
  { id: "de-3",  title: "Redden State Forest OHV (Georgetown)", state: "DE", coords: { latitude: 38.7522,  longitude: -75.4214  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Sussex County" },
  { id: "md-4",  title: "Patuxent State Park OHV (Laurel)",     state: "MD", coords: { latitude: 39.1822,  longitude: -76.8914  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Anne Arundel County" },
  { id: "md-5",  title: "Savage River State Forest OHV",        state: "MD", coords: { latitude: 39.5822,  longitude: -79.1014  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Garrett County" },

  // ─── RIDB (Recreation.gov) OHV Facilities — activity ID 18 "OFF HIGHWAY VEHICLE" ───
  // Alabama
  { id: "al-7",  title: "Kentuck ORV Area",                      state: "AL", coords: { latitude: 33.5308,  longitude: -85.8536  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Cleburne County" },
  // California — USFS OHV areas (Eldorado / Tahoe / Angeles / Los Padres / Klamath NF)
  { id: "ca-31", title: "Black Springs OHV Area",                state: "CA", coords: { latitude: 38.3798,  longitude: -120.1963 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Amador County" },
  { id: "ca-32", title: "Interface OHV Area",                    state: "CA", coords: { latitude: 38.2653,  longitude: -120.3448 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Calaveras County" },
  { id: "ca-33", title: "Prosser Pits OHV Area",                 state: "CA", coords: { latitude: 39.3869,  longitude: -120.1857 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Nevada County" },
  { id: "ca-34", title: "San Gabriel Canyon OHV Area",           state: "CA", coords: { latitude: 34.2377,  longitude: -117.8601 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "San Bernardino County" },
  { id: "ca-35", title: "Figueroa OHV Recreation Area",          state: "CA", coords: { latitude: 34.7440,  longitude: -119.9845 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Santa Barbara County" },
  { id: "ca-36", title: "Humbug OHV Recreation Area",            state: "CA", coords: { latitude: 41.7750,  longitude: -122.7285 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Siskiyou County" },
  { id: "ca-37", title: "Juniper Flat OHV Area",                 state: "CA", coords: { latitude: 41.5689,  longitude: -122.2673 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Siskiyou County" },
  // Colorado — BLM OHV areas near Grand Mesa / Gunnison Gorge NCA
  { id: "co-20", title: "Peach Valley OHV Area",                 state: "CO", coords: { latitude: 38.5958,  longitude: -107.8925 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Delta County" },
  { id: "co-21", title: "North Delta OHV Area",                  state: "CO", coords: { latitude: 38.7858,  longitude: -108.0317 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Delta County" },
  // Montana — BLM eastern MT OHV areas
  { id: "mt-13", title: "Glasgow OHV Area",                      state: "MT", coords: { latitude: 48.2231,  longitude: -106.6313 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Valley County" },
  { id: "mt-14", title: "Glendive OHV Area",                     state: "MT", coords: { latitude: 46.9941,  longitude: -104.7415 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Dawson County" },
  { id: "mt-15", title: "Shepherd Ah-Nei OHV Area",              state: "MT", coords: { latitude: 46.0333,  longitude: -108.2831 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Yellowstone County" },
  // Nevada — additional BLM dune / desert OHV areas
  { id: "nv-17", title: "Big Dune OHV Area",                     state: "NV", coords: { latitude: 36.6474,  longitude: -116.5850 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Nye County" },
  { id: "nv-18", title: "Clayton Valley Sand Dunes",             state: "NV", coords: { latitude: 37.6828,  longitude: -117.6129 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Sand Vehicles",  suspension: "Stock Friendly",          region: "Esmeralda County" },
  { id: "nv-19", title: "Crescent Sand Dunes OHV",              state: "NV", coords: { latitude: 38.2289,  longitude: -117.3342 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Nye County" },
  // Ohio — Wayne National Forest OHV systems
  { id: "oh-8",  title: "Monday Creek OHV System",               state: "OH", coords: { latitude: 39.4978,  longitude: -82.2102  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Perry County" },
  { id: "oh-9",  title: "Superior OHV System",                   state: "OH", coords: { latitude: 38.6749,  longitude: -82.6927  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Lawrence County" },
  // Utah — Three Peaks BLM OHV trail system
  { id: "ut-28", title: "Three Peaks OHV Trail System",          state: "UT", coords: { latitude: 37.7650,  longitude: -113.1761 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Iron County" },
  // Wyoming — Poison Spider near Casper
  { id: "wy-11", title: "Poison Spider OHV Park",                state: "WY", coords: { latitude: 42.8441,  longitude: -106.5527 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Natrona County" },

  // ─── BLM OHV Designated Areas — national dataset (BLM_Natl_Recs_poly, FET_SUBTYPE='OHV Designated Area') ───
  // Arizona — La Paz County corridor (Parker Strip / Colorado River area)
  { id: "az-16", title: "Copper Basin Dunes Open Area",          state: "AZ", coords: { latitude: 34.2583,  longitude: -114.1781 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "La Paz County" },
  { id: "az-17", title: "Crossroads Open Area",                  state: "AZ", coords: { latitude: 34.2389,  longitude: -114.2180 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "La Paz County" },
  { id: "az-18", title: "Hot Well Dunes Recreation Area",        state: "AZ", coords: { latitude: 32.5258,  longitude: -109.4259 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Graham County" },
  { id: "az-19", title: "Shea Road / Osborne Wash Open Area",    state: "AZ", coords: { latitude: 34.1281,  longitude: -114.1635 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "La Paz County" },
  { id: "az-20", title: "Standard Wash Open Area",               state: "AZ", coords: { latitude: 34.4328,  longitude: -114.1669 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "La Paz County" },

  // California — BLM OHV areas not yet in database
  { id: "ca-28", title: "Chappie-Shasta OHV Area",              state: "CA", coords: { latitude: 40.7392,  longitude: -122.5133 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Mid-Size & Larger",          suspension: "2\" Lift Recommended",    region: "Shasta County" },
  { id: "ca-29", title: "Fort Sage OHV Area",                   state: "CA", coords: { latitude: 40.0705,  longitude: -120.0438 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Lassen County" },
  { id: "ca-30", title: "Imperial Sand Dunes (Glamis)",         state: "CA", coords: { latitude: 32.8816,  longitude: -115.0043 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Sand Vehicles",  suspension: "Stock Friendly",          region: "Imperial County" },

  // Colorado — BLM OHV areas
  { id: "co-18", title: "18 Road OHV Area",                     state: "CO", coords: { latitude: 39.2556,  longitude: -108.7087 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "Stock OK",                region: "Mesa County" },
  { id: "co-19", title: "Hubbard Mesa OHV Area",                state: "CO", coords: { latitude: 39.5789,  longitude: -107.7933 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Garfield County" },

  // Montana — BLM OHV areas
  { id: "mt-12", title: "Radersburg OHV Area",                  state: "MT", coords: { latitude: 46.1885,  longitude: -111.6468 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Broadwater County" },

  // New Mexico — BLM OHV areas
  { id: "nm-11", title: "Aden Hills OHV Area",                  state: "NM", coords: { latitude: 32.2008,  longitude: -107.0481 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",             suspension: "2\" Lift Recommended",    region: "Doña Ana County" },
  { id: "nm-12", title: "Alkali Lake OHV Area",                 state: "NM", coords: { latitude: 32.5129,  longitude: -104.2094 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Eddy County" },
  { id: "nm-13", title: "Hackberry Lake OHV Area",              state: "NM", coords: { latitude: 32.6574,  longitude: -103.9200 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Lea County" },
  { id: "nm-14", title: "Haystack Mountain OHV Area",           state: "NM", coords: { latitude: 33.6386,  longitude: -104.2530 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Chaves County" },
  { id: "nm-15", title: "Mescalero Sands North Dune OHV",       state: "NM", coords: { latitude: 33.3982,  longitude: -103.8547 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Chaves County" },
  { id: "nm-16", title: "Red Sands OHV Area",                   state: "NM", coords: { latitude: 32.5650,  longitude: -106.0778 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Doña Ana County" },

  // Nevada — BLM OHV areas
  { id: "nv-14", title: "Black Rock Desert OHV Area",           state: "NV", coords: { latitude: 40.8522,  longitude: -119.1524 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",             suspension: "Stock w/ Clearance",      region: "Humboldt County" },
  { id: "nv-15", title: "Sand Mountain OHV Area",               state: "NV", coords: { latitude: 39.3147,  longitude: -118.3955 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Churchill County" },
  { id: "nv-16", title: "Shoshone OHV Trail System",            state: "NV", coords: { latitude: 40.1553,  longitude: -117.0219 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "2\" Lift Recommended",    region: "Elko County" },

  // Oregon — BLM OHV areas not yet in database
  { id: "or-13", title: "Christmas Valley Sand Dunes",          state: "OR", coords: { latitude: 43.3176,  longitude: -120.3598 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Lake County" },
  { id: "or-14", title: "Cline Buttes OHV Area",                state: "OR", coords: { latitude: 44.3081,  longitude: -121.3302 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Deschutes County" },
  { id: "or-15", title: "Radar Hill OHV Area",                  state: "OR", coords: { latitude: 43.5575,  longitude: -119.1354 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Harney County" },
  { id: "or-16", title: "Shotgun OHV Trail System",             state: "OR", coords: { latitude: 44.2516,  longitude: -122.8915 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "2\" Lift Recommended",    region: "Lane County" },
  { id: "or-17", title: "Upper Nestucca OHV Trail System",      state: "OR", coords: { latitude: 45.2422,  longitude: -123.5111 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",     suspension: "2\" Lift Recommended",    region: "Tillamook County" },
  { id: "or-18", title: "Virtue Flat OHV Area",                 state: "OR", coords: { latitude: 44.8088,  longitude: -117.6315 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Baker County" },

  // Utah — BLM OHV areas not yet in database
  { id: "ut-17", title: "Auroura OHV Area",                     state: "UT", coords: { latitude: 38.9245,  longitude: -111.9608 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Sevier County" },
  { id: "ut-18", title: "Buckskin Hills OHV Area",              state: "UT", coords: { latitude: 40.5223,  longitude: -109.4939 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Uintah County" },
  { id: "ut-19", title: "Coral Pink Sand Dunes OHV",            state: "UT", coords: { latitude: 37.0724,  longitude: -112.6773 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Kane County" },
  { id: "ut-20", title: "Factory Butte OHV Area",               state: "UT", coords: { latitude: 38.4439,  longitude: -110.9251 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Wayne County" },
  { id: "ut-21", title: "Glenwood OHV Area",                    state: "UT", coords: { latitude: 38.7822,  longitude: -111.9674 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Sevier County" },
  { id: "ut-22", title: "Jensen Hills OHV Area",                state: "UT", coords: { latitude: 40.4022,  longitude: -109.3860 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Uintah County" },
  { id: "ut-23", title: "Knolls ORV Area",                      state: "UT", coords: { latitude: 40.6850,  longitude: -113.2996 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                  suspension: "Stock OK",                region: "Tooele County" },
  { id: "ut-24", title: "Red Wash OHV Area",                    state: "UT", coords: { latitude: 40.1046,  longitude: -109.4054 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Uintah County" },
  { id: "ut-25", title: "Sand Mountain OHV Area",               state: "UT", coords: { latitude: 37.0569,  longitude: -113.3798 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Sand Vehicles",  suspension: "Stock Friendly",          region: "Washington County" },
  { id: "ut-26", title: "Swing Arm City OHV Area",              state: "UT", coords: { latitude: 38.3881,  longitude: -110.9247 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Mid-Size & Larger",          suspension: "2\" Lift Recommended",    region: "Wayne County" },
  { id: "ut-27", title: "White Wash Sand Dunes",                state: "UT", coords: { latitude: 38.8016,  longitude: -110.0319 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Grand County" },

  // Washington — BLM OHV area (Juniper Dunes, listed as OR in BLM dataset but physically in WA)
  { id: "wa-13", title: "Juniper Dunes OHV Area",               state: "WA", coords: { latitude: 46.3849,  longitude: -118.8962 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",           suspension: "Stock Friendly",          region: "Franklin County" },

  // Wyoming — BLM OHV areas
  { id: "wy-9",  title: "Basin Gardens ORV Area",               state: "WY", coords: { latitude: 44.4204,  longitude: -108.0000 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                  suspension: "Stock OK",                region: "Big Horn County" },
  { id: "wy-10", title: "Killpecker Sand Dunes OHV",            state: "WY", coords: { latitude: 41.9839,  longitude: -109.0921 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Sand Vehicles",  suspension: "Stock Friendly",          region: "Sweetwater County" },
];

export const ALL_TRAILS: Trail[] = _TRAIL_DATA.map(t => ({
  ...t,
  vehicleTypes: deriveVehicleTypes(t.size),
  ...parseSuspension(t.suspension),
}));

export function getTrailById(id: string): Trail | undefined {
  return ALL_TRAILS.find(t => t.id === id);
}

/**
 * Resolve a trail from a free-text name (as typed by a user in chat) or an
 * exact trail ID. Used by server-side tools that only have a natural-language
 * reference to work with. Returns `undefined` when nothing reasonably matches.
 */
export function findTrailByNameOrId(query: string): Trail | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;

  const byId = ALL_TRAILS.find(t => t.id.toLowerCase() === q);
  if (byId) return byId;

  const exactTitle = ALL_TRAILS.find(t => t.title.toLowerCase() === q);
  if (exactTitle) return exactTitle;

  const substringMatches = ALL_TRAILS.filter(t => t.title.toLowerCase().includes(q));
  if (substringMatches.length > 0) {
    substringMatches.sort((a, b) => a.title.length - b.title.length);
    return substringMatches[0];
  }

  return undefined;
}

/**
 * Best-effort fuzzy search across trail titles, used to suggest alternatives
 * when `findTrailByNameOrId` finds no confident match.
 */
export function searchTrails(query: string, limit = 5): Trail[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const scored = ALL_TRAILS
    .map(t => {
      const title = t.title.toLowerCase();
      const region = t.region.toLowerCase();
      const score = words.reduce(
        (acc, w) => acc + (title.includes(w) ? 2 : 0) + (region.includes(w) ? 1 : 0),
        0,
      );
      return { trail: t, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(s => s.trail);
}

export const US_STATES: string[] = [
  "All States",
  ...Array.from(new Set(ALL_TRAILS.map((t) => t.state))).sort(),
];

export function getTrailsByState(state: string): Trail[] {
  if (state === "All States") return ALL_TRAILS;
  return ALL_TRAILS.filter((t) => t.state === state);
}

export const STATE_NAMES: Record<string, string> = {
  "All States": "All States",
  AK: "Alaska",
  AL: "Alabama",
  AR: "Arkansas",
  AZ: "Arizona",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  IA: "Iowa",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  MA: "Massachusetts",
  MD: "Maryland",
  ME: "Maine",
  MI: "Michigan",
  MN: "Minnesota",
  MO: "Missouri",
  MS: "Mississippi",
  MT: "Montana",
  NC: "North Carolina",
  ND: "North Dakota",
  NE: "Nebraska",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NV: "Nevada",
  NY: "New York",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VA: "Virginia",
  VT: "Vermont",
  WA: "Washington",
  WI: "Wisconsin",
  WV: "West Virginia",
  WY: "Wyoming",
};

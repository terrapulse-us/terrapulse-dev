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
}

export const ALL_TRAILS: Trail[] = [
  // ── CALIFORNIA ─────────────────────────────────────────────────────────────
  { id: "ca-1",  title: "Rubicon Trail",                   state: "CA", coords: { latitude: 39.0041,  longitude: -120.3122 }, difficulty: "10/10 Hardcore",    difficultyRating: 10, size: "Jeep / Short Wheelbase",   suspension: "3-4\" Lift + Lockers",    region: "El Dorado County" },
  { id: "ca-2",  title: "Hungry Valley SVRA",              state: "CA", coords: { latitude: 34.7578,  longitude: -118.8788 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Side-by-Side",  suspension: "Stock Friendly",          region: "Los Angeles County" },
  { id: "ca-3",  title: "Johnson Valley (KOH)",            state: "CA", coords: { latitude: 34.4214,  longitude: -116.6833 }, difficulty: "9/10 Extreme",      difficultyRating: 9,  size: "Full Size / Rock Crawlers", suspension: "Long Travel Required",    region: "San Bernardino County" },
  { id: "ca-4",  title: "Big Bear OHV Trails",             state: "CA", coords: { latitude: 34.2439,  longitude: -116.8824 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Mid-Size & Larger",         suspension: "2\" Lift Recommended",    region: "San Bernardino County" },
  { id: "ca-5",  title: "Ocotillo Wells SVRA",             state: "CA", coords: { latitude: 33.1536,  longitude: -116.1334 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                 suspension: "Stock OK",                region: "San Diego County" },
  { id: "ca-6",  title: "Fordyce Lake Trail",              state: "CA", coords: { latitude: 39.3697,  longitude: -120.5125 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / Short Wheelbase",   suspension: "3\" Lift + Skid Plates",  region: "Nevada County" },
  { id: "ca-7",  title: "Hollister Hills SVRA",            state: "CA", coords: { latitude: 36.8341,  longitude: -121.3974 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",    suspension: "Stock OK",                region: "San Benito County" },
  { id: "ca-8",  title: "Oceano Dunes SVRA (Pismo)",       state: "CA", coords: { latitude: 35.0997,  longitude: -120.6318 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",          suspension: "Stock Friendly",          region: "San Luis Obispo County" },
  { id: "ca-9",  title: "Dumont Dunes OHV",                state: "CA", coords: { latitude: 35.6658,  longitude: -116.2279 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Sand Vehicles", suspension: "Stock OK",                region: "San Bernardino County" },
  { id: "ca-10", title: "Stoddard Valley OHV",             state: "CA", coords: { latitude: 34.5836,  longitude: -117.0753 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Mid-Size & Larger",         suspension: "2\" Lift Recommended",    region: "San Bernardino County" },
  { id: "ca-11", title: "Dove Springs OHV (Jawbone)",      state: "CA", coords: { latitude: 35.2677,  longitude: -118.0355 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                 suspension: "Stock OK",                region: "Kern County" },
  { id: "ca-12", title: "Carnegie SVRA",                   state: "CA", coords: { latitude: 37.6777,  longitude: -121.6130 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",    suspension: "Stock OK",                region: "Alameda County" },
  { id: "ca-13", title: "Prairie City SVRA",               state: "CA", coords: { latitude: 38.6221,  longitude: -121.2046 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",          suspension: "Stock Friendly",          region: "Sacramento County" },
  { id: "ca-14", title: "El Mirage OHV",                   state: "CA", coords: { latitude: 34.6436,  longitude: -117.5847 }, difficulty: "2/10 Easy",         difficultyRating: 2,  size: "All Sizes",                 suspension: "Stock Friendly",          region: "San Bernardino County" },
  { id: "ca-15", title: "Ballinger Canyon OHV",            state: "CA", coords: { latitude: 34.8658,  longitude: -119.7561 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                 suspension: "Stock OK",                region: "Santa Barbara County" },
  { id: "ca-16", title: "Rowher Flats OHV",                state: "CA", coords: { latitude: 34.4522,  longitude: -118.4736 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",    suspension: "Stock OK",                region: "Los Angeles County" },
  { id: "ca-17", title: "Corral Canyon OHV",               state: "CA", coords: { latitude: 32.9783,  longitude: -116.6039 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Mid-Size & Larger",         suspension: "2-3\" Lift",              region: "San Diego County" },
  { id: "ca-18", title: "Cleghorn Ridge OHV",              state: "CA", coords: { latitude: 34.3319,  longitude: -117.4081 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Mid-Size & Larger",         suspension: "3\" Lift Recommended",    region: "San Bernardino County" },
  { id: "ca-19", title: "Saline Valley Road",              state: "CA", coords: { latitude: 36.7455,  longitude: -117.7697 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",            suspension: "Stock w/ Clearance",      region: "Inyo County" },
  { id: "ca-20", title: "Mojave Road",                     state: "CA", coords: { latitude: 34.9747,  longitude: -116.6303 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",            suspension: "Stock w/ Clearance",      region: "San Bernardino County" },
  { id: "ca-21", title: "Mammoth Bar OHV",                 state: "CA", coords: { latitude: 39.0069,  longitude: -120.9533 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Mid-Size & Larger",         suspension: "2\" Lift Recommended",    region: "El Dorado County" },
  { id: "ca-22", title: "Alamo Mountain OHV",              state: "CA", coords: { latitude: 34.6983,  longitude: -118.9192 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",            suspension: "2\" Lift Recommended",    region: "Los Angeles / Ventura County" },
  { id: "ca-23", title: "Surprise Canyon (Panamint)",      state: "CA", coords: { latitude: 36.1783,  longitude: -117.2461 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / Short Wheelbase",   suspension: "3\" Lift + Lockers",      region: "Inyo County" },
  { id: "ca-24", title: "Picacho State Recreation Area",   state: "CA", coords: { latitude: 32.9397,  longitude: -114.6247 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes",                 suspension: "Stock Friendly",          region: "Imperial County" },
  { id: "ca-25", title: "Randsburg OHV",                   state: "CA", coords: { latitude: 35.3683,  longitude: -117.6503 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Kern County" },
  { id: "ca-26", title: "Bodie Hills OHV",                 state: "CA", coords: { latitude: 38.2128,  longitude: -119.0061 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",            suspension: "Stock w/ Clearance",      region: "Mono County" },
  { id: "ca-27", title: "Plumas Eureka OHV Trails",        state: "CA", coords: { latitude: 39.7519,  longitude: -120.7058 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Mid-Size & Larger",         suspension: "2\" Lift Recommended",    region: "Plumas County" },

  // ── ARIZONA ────────────────────────────────────────────────────────────────
  { id: "az-1",  title: "Maricopa Trail (OHV Sections)",  state: "AZ", coords: { latitude: 33.4617,  longitude: -111.9890 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Maricopa County" },
  { id: "az-2",  title: "Vulture Mountains OHV",          state: "AZ", coords: { latitude: 33.8136,  longitude: -112.7192 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                 suspension: "Stock OK",                region: "Maricopa County" },
  { id: "az-3",  title: "Bulldog Canyon OHV",             state: "AZ", coords: { latitude: 33.4931,  longitude: -111.5308 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",            suspension: "2\" Lift Recommended",    region: "Maricopa County" },
  { id: "az-4",  title: "White Mountains Trail System",   state: "AZ", coords: { latitude: 33.9039,  longitude: -109.7778 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Apache County" },
  { id: "az-5",  title: "Cibola OHV Area",                state: "AZ", coords: { latitude: 32.9944,  longitude: -114.7183 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Dunes",         suspension: "Stock Friendly",          region: "La Paz County" },
  { id: "az-6",  title: "Harquahala Mountains OHV",       state: "AZ", coords: { latitude: 33.5919,  longitude: -113.3033 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",            suspension: "2\" Lift",                region: "Maricopa County" },

  // ── NEVADA ─────────────────────────────────────────────────────────────────
  { id: "nv-1",  title: "Eldorado Valley OHV",            state: "NV", coords: { latitude: 35.7633,  longitude: -114.9158 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                 suspension: "Stock OK",                region: "Clark County" },
  { id: "nv-2",  title: "Logandale Trails",               state: "NV", coords: { latitude: 36.5980,  longitude: -114.4786 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Clark County" },
  { id: "nv-3",  title: "Nellis Dunes OHV",               state: "NV", coords: { latitude: 36.2697,  longitude: -115.0181 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Sand",          suspension: "Stock Friendly",          region: "Clark County" },
  { id: "nv-4",  title: "Winnemucca Sand Dunes",          state: "NV", coords: { latitude: 40.9633,  longitude: -117.6869 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dunes",         suspension: "Stock OK",                region: "Humboldt County" },
  { id: "nv-5",  title: "Muddy Mountains Wilderness OHV", state: "NV", coords: { latitude: 36.4547,  longitude: -114.6133 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",            suspension: "2\" Lift",                region: "Clark County" },

  // ── UTAH ───────────────────────────────────────────────────────────────────
  { id: "ut-1",  title: "Hell's Revenge (Moab)",          state: "UT", coords: { latitude: 38.5436,  longitude: -109.5386 }, difficulty: "9/10 Extreme",      difficultyRating: 9,  size: "Jeep / Rock Crawlers",      suspension: "Long Travel + Lockers",   region: "Grand County" },
  { id: "ut-2",  title: "Fins N Things (Moab)",           state: "UT", coords: { latitude: 38.6303,  longitude: -109.5892 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "Mid-Size & Larger",         suspension: "3\" Lift + Lockers",      region: "Grand County" },
  { id: "ut-3",  title: "White Rim Road (Canyonlands)",   state: "UT", coords: { latitude: 38.2136,  longitude: -109.9003 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",            suspension: "Stock w/ Clearance",      region: "San Juan County" },
  { id: "ut-4",  title: "Chicken Corners",                state: "UT", coords: { latitude: 38.3122,  longitude: -109.7619 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",            suspension: "2\" Lift Recommended",    region: "Grand County" },
  { id: "ut-5",  title: "Little Sahara Recreation Area",  state: "UT", coords: { latitude: 39.6547,  longitude: -112.2894 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Dunes",         suspension: "Stock Friendly",          region: "Juab County" },
  { id: "ut-6",  title: "Paiute ATV Trail System",        state: "UT", coords: { latitude: 38.3911,  longitude: -112.0869 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "ATVs / Mid-Size",           suspension: "Stock OK",                region: "Sevier County" },
  { id: "ut-7",  title: "Rattlesnake OHV Area",           state: "UT", coords: { latitude: 41.0778,  longitude: -112.1592 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                 suspension: "Stock OK",                region: "Weber County" },

  // ── COLORADO ───────────────────────────────────────────────────────────────
  { id: "co-1",  title: "Black Bear Road (Telluride)",    state: "CO", coords: { latitude: 37.9253,  longitude: -107.7261 }, difficulty: "10/10 Hardcore",    difficultyRating: 10, size: "Jeep / Short Wheelbase",   suspension: "3-4\" Lift + Lockers",    region: "San Miguel County" },
  { id: "co-2",  title: "Alpine Loop",                    state: "CO", coords: { latitude: 37.9589,  longitude: -107.6694 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / High Clearance",    suspension: "3\" Lift Recommended",    region: "San Juan County" },
  { id: "co-3",  title: "Imogene Pass",                   state: "CO", coords: { latitude: 37.9561,  longitude: -107.7442 }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "Jeep / High Clearance",    suspension: "3\" Lift",                region: "Ouray County" },
  { id: "co-4",  title: "Medano Pass Primitive Road",     state: "CO", coords: { latitude: 37.8458,  longitude: -105.5289 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance / 4WD",     suspension: "Stock 4WD OK",            region: "Huerfano County" },
  { id: "co-5",  title: "Rampart Range OHV",              state: "CO", coords: { latitude: 39.1947,  longitude: -105.0692 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Teller County" },
  { id: "co-6",  title: "Phantom Canyon Road",            state: "CO", coords: { latitude: 38.4886,  longitude: -105.1258 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",            suspension: "Stock w/ Clearance",      region: "Fremont County" },

  // ── TEXAS ──────────────────────────────────────────────────────────────────
  { id: "tx-1",  title: "Barnwell Mountain Recreation",   state: "TX", coords: { latitude: 32.8561,  longitude: -94.3519  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "All Sizes",                 suspension: "2-3\" Lift",              region: "Gregg County" },
  { id: "tx-2",  title: "Caddo-LBJ National Grasslands", state: "TX", coords: { latitude: 33.6419,  longitude: -98.1183  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Montague County" },
  { id: "tx-3",  title: "Hidden Falls Adventure Park",    state: "TX", coords: { latitude: 30.3989,  longitude: -98.2886  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                 suspension: "2\" Lift Recommended",    region: "Blanco County" },
  { id: "tx-4",  title: "Windmill Ranch OHV",             state: "TX", coords: { latitude: 32.6367,  longitude: -98.4519  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                 suspension: "Stock OK",                region: "Palo Pinto County" },
  { id: "tx-5",  title: "Big Bend Ranch OHV Roads",       state: "TX", coords: { latitude: 29.5056,  longitude: -104.0178 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "High Clearance",            suspension: "Stock w/ Clearance",      region: "Presidio County" },

  // ── OREGON ─────────────────────────────────────────────────────────────────
  { id: "or-1",  title: "Oregon Dunes NRA",               state: "OR", coords: { latitude: 43.9039,  longitude: -124.1081 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dunes",         suspension: "Stock Friendly",          region: "Lane County" },
  { id: "or-2",  title: "Tillamook State Forest OHV",     state: "OR", coords: { latitude: 45.6814,  longitude: -123.5008 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",          suspension: "2\" Lift Recommended",    region: "Tillamook County" },
  { id: "or-3",  title: "Weyerhaeuser Roads (Longview)",  state: "OR", coords: { latitude: 46.1381,  longitude: -122.9381 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                 suspension: "Stock OK",                region: "Clatsop County" },
  { id: "or-4",  title: "Millican Valley OHV",            state: "OR", coords: { latitude: 43.9167,  longitude: -120.7008 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                 suspension: "Stock OK",                region: "Deschutes County" },

  // ── WASHINGTON ─────────────────────────────────────────────────────────────
  { id: "wa-1",  title: "Tahuya State Forest OHV",        state: "WA", coords: { latitude: 47.4319,  longitude: -122.9836 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Mason County" },
  { id: "wa-2",  title: "Capitol State Forest OHV",       state: "WA", coords: { latitude: 46.9178,  longitude: -123.0864 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Thurston County" },
  { id: "wa-3",  title: "Ahtanum State Forest",           state: "WA", coords: { latitude: 46.5367,  longitude: -120.7053 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                 suspension: "Stock OK",                region: "Yakima County" },
  { id: "wa-4",  title: "Reiter Foothills Forest",        state: "WA", coords: { latitude: 47.8803,  longitude: -121.7106 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / Dirt Bikes",    suspension: "2\" Lift Recommended",    region: "Snohomish County" },

  // ── IDAHO ──────────────────────────────────────────────────────────────────
  { id: "id-1",  title: "Bruneau Dunes OHV",              state: "ID", coords: { latitude: 42.8889,  longitude: -115.7928 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dunes",         suspension: "Stock Friendly",          region: "Owyhee County" },
  { id: "id-2",  title: "Salmon River Mountains OHV",     state: "ID", coords: { latitude: 44.8833,  longitude: -114.3667 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",            suspension: "2\" Lift",                region: "Lemhi County" },
  { id: "id-3",  title: "Clear Creek OHV Area",           state: "ID", coords: { latitude: 46.4208,  longitude: -116.2478 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Clearwater County" },
  { id: "id-4",  title: "Owyhee Canyonlands OHV",         state: "ID", coords: { latitude: 43.1247,  longitude: -117.0019 }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "High Clearance",            suspension: "2-3\" Lift",              region: "Owyhee County" },

  // ── MONTANA ────────────────────────────────────────────────────────────────
  { id: "mt-1",  title: "Beaverhead-Deerlodge OHV",       state: "MT", coords: { latitude: 45.8833,  longitude: -113.5500 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Beaverhead County" },
  { id: "mt-2",  title: "Gallatin National Forest OHV",   state: "MT", coords: { latitude: 45.6589,  longitude: -111.0481 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",            suspension: "2\" Lift",                region: "Gallatin County" },
  { id: "mt-3",  title: "Lolo National Forest Trails",    state: "MT", coords: { latitude: 46.8914,  longitude: -114.3108 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",    suspension: "Stock OK",                region: "Missoula County" },

  // ── WYOMING ────────────────────────────────────────────────────────────────
  { id: "wy-1",  title: "Bridger-Teton OHV Trails",       state: "WY", coords: { latitude: 43.4833,  longitude: -110.7667 }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "High Clearance",            suspension: "2\" Lift",                region: "Teton County" },
  { id: "wy-2",  title: "Snowy Range OHV Area",           state: "WY", coords: { latitude: 41.3547,  longitude: -106.1608 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Albany County" },
  { id: "wy-3",  title: "Medicine Bow OHV Trails",        state: "WY", coords: { latitude: 41.6500,  longitude: -106.2167 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                 suspension: "Stock OK",                region: "Carbon County" },

  // ── NEW MEXICO ─────────────────────────────────────────────────────────────
  { id: "nm-1",  title: "White Sands OHV Area",           state: "NM", coords: { latitude: 32.8697,  longitude: -106.3319 }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / Dunes",         suspension: "Stock Friendly",          region: "Otero County" },
  { id: "nm-2",  title: "Jemez Mountains OHV",            state: "NM", coords: { latitude: 35.8753,  longitude: -106.6508 }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Sandoval County" },
  { id: "nm-3",  title: "Otero Mesa OHV Trails",          state: "NM", coords: { latitude: 32.1197,  longitude: -105.7014 }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "High Clearance",            suspension: "Stock w/ Clearance",      region: "Otero County" },

  // ── TENNESSEE ──────────────────────────────────────────────────────────────
  { id: "tn-1",  title: "Windrock Park OHV",              state: "TN", coords: { latitude: 36.0736,  longitude: -84.2453  }, difficulty: "8/10 Very Hard",    difficultyRating: 8,  size: "All Sizes",                 suspension: "3\" Lift Recommended",    region: "Anderson County" },
  { id: "tn-2",  title: "Brimstone Recreation OHV",       state: "TN", coords: { latitude: 36.2867,  longitude: -84.3764  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "All Sizes / ATVs",          suspension: "2-3\" Lift",              region: "Scott County" },
  { id: "tn-3",  title: "Royal Blue Wildlife Mgmt OHV",   state: "TN", coords: { latitude: 36.5114,  longitude: -83.7789  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                 suspension: "2\" Lift",                region: "Campbell County" },

  // ── WEST VIRGINIA ──────────────────────────────────────────────────────────
  { id: "wv-1",  title: "Hatfield-McCoy Trails (Main)",   state: "WV", coords: { latitude: 37.6522,  longitude: -82.0431  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Mingo County" },
  { id: "wv-2",  title: "Hatfield-McCoy (Devil Anse)",    state: "WV", coords: { latitude: 37.7344,  longitude: -82.1678  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "All Sizes",                 suspension: "2\" Lift Recommended",    region: "Logan County" },
  { id: "wv-3",  title: "Pocahontas County Trails",       state: "WV", coords: { latitude: 38.3328,  longitude: -80.2308  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Pocahontas County" },

  // ── NORTH CAROLINA ─────────────────────────────────────────────────────────
  { id: "nc-1",  title: "Uwharrie National Forest OHV",   state: "NC", coords: { latitude: 35.4008,  longitude: -79.9761  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes / ATVs",          suspension: "2\" Lift Recommended",    region: "Montgomery County" },
  { id: "nc-2",  title: "Tasmania OHV (Uwharrie)",        state: "NC", coords: { latitude: 35.3886,  longitude: -80.0308  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "All Sizes",                 suspension: "2-3\" Lift",              region: "Montgomery County" },
  { id: "nc-3",  title: "Foothills Trail System OHV",     state: "NC", coords: { latitude: 36.0219,  longitude: -81.2664  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / Dirt Bikes",    suspension: "Stock OK",                region: "Wilkes County" },

  // ── GEORGIA ────────────────────────────────────────────────────────────────
  { id: "ga-1",  title: "Blue Ridge WMA OHV",             state: "GA", coords: { latitude: 34.8636,  longitude: -84.3228  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                 suspension: "2\" Lift Recommended",    region: "Fannin County" },
  { id: "ga-2",  title: "Rich Mountain OHV Trails",       state: "GA", coords: { latitude: 34.7128,  longitude: -84.5611  }, difficulty: "7/10 Hard",         difficultyRating: 7,  size: "All Sizes / ATVs",          suspension: "2-3\" Lift",              region: "Gilmer County" },
  { id: "ga-3",  title: "Paulding Forest OHV",            state: "GA", coords: { latitude: 33.9281,  longitude: -85.0583  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dirt Bikes",    suspension: "Stock OK",                region: "Paulding County" },

  // ── VIRGINIA ───────────────────────────────────────────────────────────────
  { id: "va-1",  title: "George Washington NF OHV",       state: "VA", coords: { latitude: 38.4322,  longitude: -79.3928  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Augusta County" },
  { id: "va-2",  title: "New River Trail OHV Section",    state: "VA", coords: { latitude: 36.8761,  longitude: -80.8764  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes",                 suspension: "Stock OK",                region: "Grayson County" },

  // ── MICHIGAN ───────────────────────────────────────────────────────────────
  { id: "mi-1",  title: "Newaygo State Park OHV",         state: "MI", coords: { latitude: 43.4458,  longitude: -85.8006  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Newaygo County" },
  { id: "mi-2",  title: "Silver Lake Sand Dunes OHV",     state: "MI", coords: { latitude: 43.6853,  longitude: -86.5036  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dunes",         suspension: "Stock Friendly",          region: "Oceana County" },
  { id: "mi-3",  title: "Drummond Island OHV",            state: "MI", coords: { latitude: 46.0064,  longitude: -83.7453  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes",                 suspension: "Stock OK",                region: "Chippewa County" },

  // ── WISCONSIN ──────────────────────────────────────────────────────────────
  { id: "wi-1",  title: "Pine Line / ATV Trails",         state: "WI", coords: { latitude: 45.4708,  longitude: -90.3981  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",          suspension: "Stock Friendly",          region: "Taylor County" },
  { id: "wi-2",  title: "Nicolet NF OHV Trails",          state: "WI", coords: { latitude: 45.8028,  longitude: -88.9461  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "All Sizes / Dirt Bikes",    suspension: "Stock OK",                region: "Forest County" },

  // ── MISSOURI ───────────────────────────────────────────────────────────────
  { id: "mo-1",  title: "Mark Twain NF OHV Trails",       state: "MO", coords: { latitude: 37.3522,  longitude: -91.4256  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Shannon County" },
  { id: "mo-2",  title: "Chadwick Motorcycle Area",        state: "MO", coords: { latitude: 36.8711,  longitude: -92.9319  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "Dirt Bikes / ATVs",         suspension: "Stock OK",                region: "Christian County" },

  // ── ARKANSAS ───────────────────────────────────────────────────────────────
  { id: "ar-1",  title: "Byrd's Adventure Center",        state: "AR", coords: { latitude: 35.4917,  longitude: -93.8906  }, difficulty: "6/10 Challenging",  difficultyRating: 6,  size: "All Sizes",                 suspension: "2\" Lift Recommended",    region: "Yell County" },
  { id: "ar-2",  title: "Ouachita NF OHV Area",           state: "AR", coords: { latitude: 34.5683,  longitude: -93.0481  }, difficulty: "5/10 Moderate",     difficultyRating: 5,  size: "All Sizes / ATVs",          suspension: "Stock OK",                region: "Garland County" },

  // ── FLORIDA ────────────────────────────────────────────────────────────────
  { id: "fl-1",  title: "Croom Motorcycle Area",           state: "FL", coords: { latitude: 28.4708,  longitude: -82.2036  }, difficulty: "4/10 Moderate",     difficultyRating: 4,  size: "Dirt Bikes / ATVs",         suspension: "Stock OK",                region: "Hernando County" },
  { id: "fl-2",  title: "Ocala National Forest OHV",       state: "FL", coords: { latitude: 29.1853,  longitude: -81.7244  }, difficulty: "3/10 Beginner",     difficultyRating: 3,  size: "All Sizes / ATVs",          suspension: "Stock Friendly",          region: "Marion County" },
];

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
  AR: "Arkansas",
  AZ: "Arizona",
  CA: "California",
  CO: "Colorado",
  FL: "Florida",
  GA: "Georgia",
  ID: "Idaho",
  MI: "Michigan",
  MO: "Missouri",
  MT: "Montana",
  NC: "North Carolina",
  NM: "New Mexico",
  NV: "Nevada",
  OR: "Oregon",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VA: "Virginia",
  WA: "Washington",
  WI: "Wisconsin",
  WV: "West Virginia",
  WY: "Wyoming",
};

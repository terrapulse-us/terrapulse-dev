import { ALL_TRAILS } from "./trails";

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
}

// Non-overlapping US geographic regions used for "region roamer" badges.
// Only states that actually have trails in the catalog count toward completion.
export const REGIONS: Record<string, { label: string; states: string[] }> = {
  pacific:   { label: "Pacific",       states: ["CA", "OR", "WA", "AK", "HI"] },
  mountain:  { label: "Mountain West", states: ["NV", "UT", "CO", "AZ", "NM", "ID", "MT", "WY"] },
  midwest:   { label: "Midwest",       states: ["ND", "SD", "NE", "KS", "MN", "IA", "MO", "WI", "IL", "IN", "OH", "MI"] },
  south:     { label: "South",         states: ["TX", "OK", "AR", "LA", "MS", "AL", "GA", "FL", "SC", "NC", "TN", "KY", "WV", "VA"] },
  northeast: { label: "Northeast",     states: ["PA", "NY", "NJ", "CT", "RI", "MA", "VT", "NH", "ME", "MD", "DE"] },
};

const STATES_WITH_TRAILS = Array.from(new Set(ALL_TRAILS.map((t) => t.state))).sort();

function regionStatesPresent(states: string[]): string[] {
  return states.filter((s) => STATES_WITH_TRAILS.includes(s));
}

const MILESTONES: AchievementDef[] = [
  { id: "first_trail", title: "Trail Breaker",       description: "Complete your first trail",              icon: "flag" },
  { id: "trails_3",    title: "Trail Veteran",        description: "Complete 3 trails",                      icon: "trending-up" },
  { id: "trails_6",    title: "Half Dozen Hero",      description: "Complete 6 trails",                      icon: "layers" },
  { id: "trails_10",   title: "Trail Addict",         description: "Complete 10 trails",                     icon: "zap" },
  { id: "trails_20",   title: "Trail Legend",         description: "Complete 20 trails",                     icon: "star" },
  { id: "trails_27",   title: "Ultimate OHV Master",  description: "Complete 27 trails",                     icon: "award" },
  { id: "trails_50",   title: "Half-Century Rider",   description: "Complete 50 trails nationwide",          icon: "compass" },
  { id: "trails_100",  title: "Century Club",         description: "Complete 100 trails nationwide",         icon: "target" },
  { id: "trails_200",  title: "Cross-Country Crusher",description: "Complete 200 trails nationwide",         icon: "map" },
  { id: "trails_all",  title: "American Trailblazer", description: `Complete all ${ALL_TRAILS.length} trails nationwide`, icon: "globe" },
];

const REGIONAL_CA: AchievementDef[] = [
  { id: "regional_nocal",  title: "NorCal Dominator", description: "Complete all NorCal route trails",    icon: "triangle" },
  { id: "regional_socal",  title: "SoCal Dominator",  description: "Complete all SoCal route trails",     icon: "sun" },
  { id: "regional_desert", title: "Desert Demon",     description: "Complete all desert route trails",    icon: "thermometer" },
];

const CONTRIBUTOR_BADGES: AchievementDef[] = [
  { id: "contributor_1",  title: "Trail Scout",     description: "Submit your first trail to the community", icon: "plus-circle" },
  { id: "contributor_5",  title: "Trail Mapper",    description: "Submit 5 trails to the community",         icon: "map-pin" },
  { id: "contributor_10", title: "Trail Builder",   description: "Submit 10 trails to the community",        icon: "tool" },
  { id: "contributor_25", title: "Trail Architect", description: "Submit 25 trails to the community",        icon: "layers" },
  { id: "contributor_50", title: "Trail Authority", description: "Submit 50 trails to the community",        icon: "award" },
];

const SPECIAL: AchievementDef[] = [
  { id: "beta_explorer", title: "Beta Explorer", description: "Founding beta tester of TerraPulse", icon: "cpu" },
  { id: "went_live",     title: "Broadcaster",   description: "Go live from a trail",                icon: "radio" },
];

// Per-trail badges for the original 27 CA trails. IDs are unchanged from the
// legacy CA-only catalog so existing users keep their earned badges.
const CA_TRAIL_BADGES: AchievementDef[] = [
  { id: "trail_rubicon",         title: "Rubicon Conqueror",       description: "Conquer the legendary Rubicon Trail",       icon: "shield" },
  { id: "trail_hungry_valley",   title: "Hungry Valley Crusher",   description: "Tear up Hungry Valley SVRA",                icon: "activity" },
  { id: "trail_johnson_valley",  title: "Hammertown Hero",         description: "King of the Hammers — Johnson Valley",      icon: "shield" },
  { id: "trail_big_bear",        title: "Big Bear Bandit",         description: "Shred the Big Bear OHV trails",             icon: "activity" },
  { id: "trail_ocotillo",        title: "Desert Rat",              description: "Conquer Ocotillo Wells SVRA",               icon: "sun" },
  { id: "trail_fordyce",         title: "Fordyce Legend",          description: "Tackle the gnarly Fordyce Lake Trail",      icon: "star" },
  { id: "trail_hollister",       title: "Hollister Hills Handler", description: "Rip through Hollister Hills SVRA",          icon: "zap" },
  { id: "trail_pismo",           title: "Dune Runner",             description: "Cruise Oceano Dunes at Pismo Beach",        icon: "wind" },
  { id: "trail_dumont",          title: "Sand Dune King",          description: "Conquer the massive Dumont Dunes",          icon: "wind" },
  { id: "trail_stoddard",        title: "Stoddard Slayer",         description: "Dominate Stoddard Valley OHV",              icon: "activity" },
  { id: "trail_dove_springs",    title: "Jawbone Warrior",         description: "Battle through Dove Springs / Jawbone",     icon: "zap" },
  { id: "trail_carnegie",        title: "Bay Area Brawler",        description: "Rip Carnegie SVRA",                         icon: "activity" },
  { id: "trail_prairie_city",    title: "Capital Crusher",         description: "Tear up Prairie City SVRA",                 icon: "flag" },
  { id: "trail_el_mirage",       title: "Mirage Maker",            description: "Blast across El Mirage OHV",                icon: "sun" },
  { id: "trail_ballinger",       title: "Central Coast Crusher",   description: "Conquer Ballinger Canyon OHV",              icon: "map-pin" },
  { id: "trail_rowher",          title: "LA Hills Shredder",       description: "Rip Rowher Flats OHV",                      icon: "activity" },
  { id: "trail_corral_canyon",   title: "Canyon Carver",           description: "Carve through Corral Canyon OHV",           icon: "scissors" },
  { id: "trail_cleghorn",        title: "Ridge Runner",            description: "Conquer Cleghorn Ridge OHV",                icon: "trending-up" },
  { id: "trail_saline_valley",   title: "Death Valley Drifter",    description: "Traverse the remote Saline Valley Road",    icon: "thermometer" },
  { id: "trail_mojave_road",     title: "Mojave Pioneer",          description: "Follow the historic Mojave Road",           icon: "compass" },
  { id: "trail_mammoth_bar",     title: "Mammoth Masher",          description: "Tackle Mammoth Bar OHV trails",             icon: "layers" },
  { id: "trail_alamo",           title: "Alamo Maverick",          description: "Summit Alamo Mountain OHV",                 icon: "triangle" },
  { id: "trail_surprise_canyon", title: "Panamint Pioneer",        description: "Explore the legendary Surprise Canyon",     icon: "star" },
  { id: "trail_picacho",         title: "Imperial Explorer",       description: "Ride Picacho State Recreation Area",        icon: "compass" },
  { id: "trail_randsburg",       title: "Ghost Town Raider",       description: "Raid the trails around Randsburg OHV",      icon: "anchor" },
  { id: "trail_bodie",           title: "High Desert Drifter",     description: "Drift through Bodie Hills OHV",             icon: "wind" },
  { id: "trail_plumas",          title: "Sierra Norte Shredder",   description: "Shred Plumas Eureka OHV trails",            icon: "triangle" },
];

const REGION_BADGES: AchievementDef[] = Object.entries(REGIONS)
  .filter(([, region]) => regionStatesPresent(region.states).length > 0)
  .map(([key, region]) => ({
    id: `region_${key}`,
    title: `${region.label} Roamer`,
    description: `Complete a trail in every ${region.label} state`,
    icon: "compass",
  }));

const MULTI_STATE_BADGES: AchievementDef[] = [
  { id: "states_5",   title: "Interstate Rider",     description: "Ride trails in 5 different states",  icon: "map" },
  { id: "states_10",  title: "Cross-Country Rider",  description: "Ride trails in 10 different states", icon: "map" },
  { id: "states_25",  title: "Half-States Hero",     description: "Ride trails in 25 different states", icon: "flag" },
  { id: "states_all", title: "All-America Adventurer", description: `Ride trails in all ${STATES_WITH_TRAILS.length} states`, icon: "globe" },
];

export const ALL_ACHIEVEMENTS: AchievementDef[] = [
  ...MILESTONES,
  ...CONTRIBUTOR_BADGES,
  ...REGIONAL_CA,
  ...REGION_BADGES,
  ...MULTI_STATE_BADGES,
  ...SPECIAL,
  ...CA_TRAIL_BADGES,
];

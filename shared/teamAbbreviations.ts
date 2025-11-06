/**
 * Team abbreviation mapper to handle differences between:
 * - ESPN API
 * - Fantasy Pros
 * - NFL official data
 * 
 * Each team has an array of possible abbreviations, with the first one being the "canonical" version
 */

export const TEAM_ABBREVIATION_MAP: Record<string, string[]> = {
  'ARI': ['ARI', 'ARZ'],
  'ATL': ['ATL'],
  'BAL': ['BAL'],
  'BUF': ['BUF'],
  'CAR': ['CAR'],
  'CHI': ['CHI'],
  'CIN': ['CIN'],
  'CLE': ['CLE'],
  'DAL': ['DAL'],
  'DEN': ['DEN'],
  'DET': ['DET'],
  'GB': ['GB', 'GBP'],
  'HOU': ['HOU'],
  'IND': ['IND'],
  'JAX': ['JAX', 'JAC'],
  'KC': ['KC', 'KCC'],
  'LAC': ['LAC', 'SD', 'SDC'],
  'LAR': ['LAR', 'LA', 'STL'],
  'LV': ['LV', 'OAK', 'LVR'],
  'MIA': ['MIA'],
  'MIN': ['MIN'],
  'NE': ['NE', 'NEP'],
  'NO': ['NO', 'NOS'],
  'NYG': ['NYG'],
  'NYJ': ['NYJ'],
  'PHI': ['PHI'],
  'PIT': ['PIT'],
  'SF': ['SF', 'SFO'],
  'SEA': ['SEA'],
  'TB': ['TB', 'TBB'],
  'TEN': ['TEN'],
  'WAS': ['WAS', 'WSH'],
};

/**
 * Reverse lookup: given any abbreviation variant, find the canonical abbreviation
 */
export const ABBREVIATION_TO_CANONICAL: Record<string, string> = {};
Object.entries(TEAM_ABBREVIATION_MAP).forEach(([canonical, variants]) => {
  variants.forEach(variant => {
    ABBREVIATION_TO_CANONICAL[variant] = canonical;
  });
});

/**
 * Normalize a team abbreviation to its canonical form
 * @param abbr - Any team abbreviation variant
 * @returns The canonical abbreviation, or null if not found
 */
export function normalizeTeamAbbreviation(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const normalized = abbr.toUpperCase().trim();
  return ABBREVIATION_TO_CANONICAL[normalized] || null;
}

/**
 * Check if two team abbreviations refer to the same team
 * @param abbr1 - First abbreviation
 * @param abbr2 - Second abbreviation
 * @returns True if they refer to the same team
 */
export function isSameTeam(abbr1: string | null | undefined, abbr2: string | null | undefined): boolean {
  if (!abbr1 || !abbr2) return false;
  const canonical1 = normalizeTeamAbbreviation(abbr1);
  const canonical2 = normalizeTeamAbbreviation(abbr2);
  return canonical1 !== null && canonical1 === canonical2;
}

/**
 * Get all possible abbreviation variants for a team
 * @param abbr - Any team abbreviation variant
 * @returns Array of all variants, or empty array if not found
 */
export function getTeamAbbreviationVariants(abbr: string | null | undefined): string[] {
  if (!abbr) return [];
  const canonical = normalizeTeamAbbreviation(abbr);
  if (!canonical) return [];
  return TEAM_ABBREVIATION_MAP[canonical] || [];
}

// Stadium timezone mappings for NFL teams
// Maps team abbreviation to IANA timezone string
export const STADIUM_TIMEZONES: Record<string, string> = {
  // Eastern Time
  BUF: 'America/New_York',
  MIA: 'America/New_York',
  NE: 'America/New_York',
  NYJ: 'America/New_York',
  BAL: 'America/New_York',
  CIN: 'America/New_York',
  CLE: 'America/New_York',
  PIT: 'America/New_York',
  IND: 'America/New_York',
  JAX: 'America/New_York',
  TEN: 'America/New_York',
  ATL: 'America/New_York',
  CAR: 'America/New_York',
  TB: 'America/New_York',
  WAS: 'America/New_York',
  NYG: 'America/New_York',
  PHI: 'America/New_York',
  DET: 'America/New_York',
  
  // Central Time
  CHI: 'America/Chicago',
  GB: 'America/Chicago',
  MIN: 'America/Chicago',
  HOU: 'America/Chicago',
  KC: 'America/Chicago',
  DAL: 'America/Chicago',
  NO: 'America/Chicago',
  
  // Mountain Time
  DEN: 'America/Denver',
  
  // Arizona (no DST)
  ARI: 'America/Phoenix',
  
  // Pacific Time
  SF: 'America/Los_Angeles',
  LAR: 'America/Los_Angeles',
  LAC: 'America/Los_Angeles',
  SEA: 'America/Los_Angeles',
  LV: 'America/Los_Angeles',
};

/**
 * Formats a game time from UTC to local stadium time with day abbreviation
 * Example outputs:
 * - "Sun 1:00 PM ET"
 * - "Mon 8:15 PM ET"
 * - "Thu 1:00 PM PT"
 * 
 * @param gameTimeUtc - UTC timestamp of the game
 * @param teamAbbr - Team abbreviation to determine home stadium timezone
 * @param gameDay - Day of the week (e.g., "Sun", "Mon", "Thu")
 * @returns Formatted string with day, time, and timezone abbreviation
 */
export function formatGameTime(
  gameTimeUtc: Date | string, 
  teamAbbr: string, 
  gameDay: string
): string {
  const gameDate = typeof gameTimeUtc === 'string' ? new Date(gameTimeUtc) : gameTimeUtc;
  
  // Get stadium timezone for this team
  const timezone = STADIUM_TIMEZONES[teamAbbr] || 'America/New_York';
  
  // Format time in local timezone
  const timeStr = gameDate.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  // Get timezone abbreviation (ET, PT, CT, MT, AZ)
  const tzAbbr = getTimezoneAbbreviation(timezone, gameDate);
  
  return `${gameDay} ${timeStr} ${tzAbbr}`;
}

/**
 * Gets the timezone abbreviation for display
 */
function getTimezoneAbbreviation(timezone: string, date: Date): string {
  const tzMap: Record<string, string> = {
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Phoenix': 'AZ',
    'America/Los_Angeles': 'PT'
  };
  
  return tzMap[timezone] || 'ET';
}

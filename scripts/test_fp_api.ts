import fetch from 'node-fetch';

const FP_BASE_URL = 'https://www.fantasypros.com/api/v2/json';

async function fetchFromFantasyPros(endpoint: string): Promise<any> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://www.fantasypros.com/'
  };

  const apiKey = process.env.FANTASY_PROS_API_KEY;
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(endpoint, { headers });
  
  if (!response.ok) {
    throw new Error(`FP API error: ${response.status}`);
  }
  
  return response.json();
}

async function testFpApi() {
  console.log('=== Testing FantasyPros API ===\n');
  
  const endpoint = `${FP_BASE_URL}/NFL/players`;
  console.log('Fetching from:', endpoint);
  
  const data = await fetchFromFantasyPros(endpoint);
  
  if (!data?.players || !Array.isArray(data.players)) {
    console.log('Invalid response:', data);
    return;
  }
  
  console.log(`\nTotal players returned: ${data.players.length}`);
  
  // Look for specific players
  const searchNames = ['Thielen', 'Amari Cooper', 'AJ Dillon', 'Brian Robinson', 'Brandin Cooks', 'Adonai Mitchell'];
  
  console.log('\n=== Searching for specific players ===');
  
  for (const searchName of searchNames) {
    const matches = data.players.filter((p: any) => {
      const name = (p.player_name || p.name || '').toLowerCase();
      return name.includes(searchName.toLowerCase());
    });
    
    if (matches.length > 0) {
      console.log(`\n${searchName}:`);
      matches.forEach((p: any) => {
        const name = p.player_name || p.name;
        const team = p.player_team_id || p.team_id || p.team_abbr || p.team;
        const pos = p.player_position_id || p.position_id || p.position;
        console.log(`  - ${name} (${team} ${pos})`);
      });
    } else {
      console.log(`\n${searchName}: NOT FOUND in FP API`);
    }
  }
  
  // Show position breakdown
  const positionCounts = new Map<string, number>();
  data.players.forEach((p: any) => {
    const pos = (p.player_position_id || p.position_id || p.position || 'UNKNOWN').toUpperCase();
    positionCounts.set(pos, (positionCounts.get(pos) || 0) + 1);
  });
  
  console.log('\n=== Position Breakdown ===');
  Array.from(positionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([pos, count]) => console.log(`  ${pos}: ${count}`));
}

testFpApi().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

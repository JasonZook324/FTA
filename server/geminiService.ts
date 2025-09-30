import { GoogleGenAI } from "@google/genai";

// Initialize Gemini AI with debug logging
const apiKey = process.env.GEMINI_API_KEY;
console.log('Gemini API Key exists:', !!apiKey);
console.log('Gemini API Key length:', apiKey?.length || 0);

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export interface FantasyRecommendation {
  type: 'waiver_wire' | 'trade' | 'lineup' | 'general';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface FantasyAnalysis {
  recommendations: FantasyRecommendation[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

export interface TradeOption {
  targetTeam: string;
  targetTeamId: string;
  playersOffered: string[];
  playersRequested: string[];
  tradeRationale: string;
  fairnessRating: number; // 1-10 scale
  benefitAnalysis: string;
}

export interface TradeAnalysis {
  selectedPlayer: string;
  playerValue: string;
  tradeOptions: TradeOption[];
  marketAnalysis: string;
  summary: string;
}

export interface LineupOptimization {
  recommendedLineup: {
    position: string;
    player: string;
    reason: string;
  }[];
  benchPlayers: {
    player: string;
    reason: string;
  }[];
  keyChanges: string[];
  projectedImpact: string;
  summary: string;
}

export class FantasyGeminiService {
  async analyzeLeague(leagueData: any, teamData?: any): Promise<FantasyAnalysis> {
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const prompt = this.buildAnalysisPrompt(leagueData, teamData);
        
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt
        });

        const rawJson = response.text;
        if (rawJson) {
          console.log('Raw AI response (first 200 chars):', rawJson.substring(0, 200));
          
          // Strip markdown code blocks and any other formatting
          let cleanJson = rawJson.trim();
          
          console.log('After initial trim (first 100 chars):', cleanJson.substring(0, 100));
          
          // Remove markdown code blocks more aggressively
          cleanJson = cleanJson.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```\s*$/, '');
          
          console.log('After removing markdown (first 100 chars):', cleanJson.substring(0, 100));
          
          // Remove any leading/trailing whitespace and newlines
          cleanJson = cleanJson.trim();
          
          // Find the JSON object (starts with { and ends with })
          const jsonStart = cleanJson.indexOf('{');
          const jsonEnd = cleanJson.lastIndexOf('}');
          
          console.log('JSON bounds found:', { jsonStart, jsonEnd, length: cleanJson.length });
          
          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
          }
          
          console.log('Final JSON to parse (first 200 chars):', cleanJson.substring(0, 200));
          return JSON.parse(cleanJson) as FantasyAnalysis;
        } else {
          throw new Error("Empty response from AI model");
        }
      } catch (error: any) {
        console.log(`AI Analysis attempt ${attempt} failed:`, error.message);
        
        // Check if it's a rate limit or overload error
        if (error.message?.includes('overloaded') || error.message?.includes('503') || error.message?.includes('UNAVAILABLE')) {
          if (attempt < maxRetries) {
            const delay = baseDelay * attempt; // Exponential backoff
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // If it's the last attempt or not a retryable error, throw
        if (attempt === maxRetries) {
          throw new Error(`Failed to analyze fantasy data after ${maxRetries} attempts: ${error.message}`);
        }
      }
    }
    
    throw new Error("Unexpected error in analyzeLeague");
  }

  async askQuestion(question: string, leagueData: any): Promise<string> {
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const userTeam = leagueData.userTeam || {};
        const scoringSettings = leagueData.scoringSettings || {};
        const weekContext = leagueData.weekContext || {};

        // Format scoring type for display
        let scoringFormat = 'Standard';
        if (scoringSettings.isFullPPR) {
          scoringFormat = 'Full PPR';
        } else if (scoringSettings.isHalfPPR) {
          scoringFormat = 'Half PPR';
        }

        const contextPrompt = `
You are a fantasy football expert assistant. Answer the user's question using this comprehensive league context:

==== YOUR TEAM ROSTER ====
Team: ${userTeam.name}
Starters: ${userTeam.roster?.filter((p: any) => p.isStarter).map((p: any) => p.name).join(', ') || 'Unknown'}
Bench: ${userTeam.roster?.filter((p: any) => p.isBench).map((p: any) => p.name).join(', ') || 'Unknown'}

==== LEAGUE SETTINGS ====
Scoring: ${scoringFormat} (${scoringSettings.receptionPoints || 0} points per reception)
Current Week: ${weekContext.currentWeek} (${weekContext.seasonType})
Season: ${weekContext.season}

==== LEAGUE TEAMS ====
${leagueData.teams?.map((team: any) => `${team.location} ${team.nickname}: ${team.record?.overall?.wins || 0}-${team.record?.overall?.losses || 0}`).join('\n') || 'No team data'}

User Question: ${question}

Provide a detailed, specific response that considers:
- The user's actual roster and team situation
- The league's scoring format and how it affects strategy
- The current week and season context
- Specific actionable advice based on the data above
`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contextPrompt
        });

        return response.text || "I couldn't generate a response to your question.";
      } catch (error: any) {
        console.log(`AI Question attempt ${attempt} failed:`, error.message);
        
        // Check if it's a rate limit or overload error
        if (error.message?.includes('overloaded') || error.message?.includes('503') || error.message?.includes('UNAVAILABLE')) {
          if (attempt < maxRetries) {
            const delay = baseDelay * attempt; // Exponential backoff
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // If it's the last attempt or not a retryable error, throw
        if (attempt === maxRetries) {
          throw new Error(`Failed to answer question after ${maxRetries} attempts. The AI service is currently overloaded - please try again in a few moments.`);
        }
      }
    }
    
    throw new Error("Unexpected error in askQuestion");
  }

  private buildAnalysisPrompt(leagueData: any, teamData?: any): string {
    const userTeam = leagueData.userTeam || {};
    const waiverWire = leagueData.waiverWire || {};
    const scoringSettings = leagueData.scoringSettings || {};
    const weekContext = leagueData.weekContext || {};

    // Format scoring type for display
    let scoringFormat = 'Standard';
    if (scoringSettings.isFullPPR) {
      scoringFormat = 'Full PPR (1 point per reception)';
    } else if (scoringSettings.isHalfPPR) {
      scoringFormat = 'Half PPR (0.5 points per reception)';
    }

    // Format roster by lineup position
    const starters = userTeam.roster?.filter((p: any) => p.isStarter) || [];
    const bench = userTeam.roster?.filter((p: any) => p.isBench) || [];
    const ir = userTeam.roster?.filter((p: any) => p.isIR) || [];

    return `
You are a fantasy football expert providing strategic recommendations. Analyze the following comprehensive data:

==== 1. YOUR TEAM'S ROSTER ====
Team: ${userTeam.name}

STARTERS:
${starters.map((p: any) => `- ${p.name} (Position: ${p.position})`).join('\n') || 'No starters found'}

BENCH:
${bench.map((p: any) => `- ${p.name} (Position: ${p.position})`).join('\n') || 'No bench players found'}

INJURED RESERVE:
${ir.map((p: any) => `- ${p.name} (Position: ${p.position})`).join('\n') || 'No IR players'}

==== 2. AVAILABLE WAIVER WIRE PLAYERS ====
Top Available Players by Position:
${waiverWire.topAvailable?.map((p: any) => `- ${p.name} (${p.position}) - ${p.projectedPoints} proj pts, ${p.ownership}% owned`).join('\n') || 'No waiver wire data available'}

==== 3. LEAGUE'S SCORING SETTINGS ====
Scoring Format: ${scoringFormat}
Reception Points: ${scoringSettings.receptionPoints || 0}
Scoring Type: ${scoringSettings.scoringType || 'Standard'}

==== 4. CURRENT WEEK/CONTEXT ====
Season: ${weekContext.season}
Current Week: ${weekContext.currentWeek}
Season Type: ${weekContext.seasonType}
Total Weeks: ${weekContext.totalWeeks || 'Unknown'}

==== LEAGUE STANDINGS ====
${leagueData.standings?.map((team: any) => `${team.teamName}: ${team.wins}-${team.losses} (${team.pointsFor} PF, ${team.pointsAgainst} PA)`).join('\n') || 'No standings data'}

==== ANALYSIS REQUESTED ====
Based on the above data (especially the 4 key data points), provide:

1. RECOMMENDATIONS: Specific actionable advice prioritized by impact
   - Waiver wire pickups that address your team's weaknesses
   - Trade opportunities based on your roster construction
   - Lineup optimization for upcoming weeks
   - Strategy adjustments based on league scoring and context

2. SUMMARY: Overall assessment considering your roster, league position, and available options

3. STRENGTHS: What's working well with your current roster and approach

4. WEAKNESSES: Specific gaps in your roster that need immediate attention

Focus on:
- How the scoring format affects player values (PPR vs Standard)
- Your team's specific positional needs based on current roster
- Which available waiver players fit your scoring system
- Whether you should target short-term or long-term value based on current week/season context
- Specific players to drop to make roster moves

Provide specific player names and detailed reasoning for each recommendation.

**IMPORTANT: Return your response as pure JSON only, no markdown formatting, no code blocks, just the raw JSON in this exact format:**

{
  "recommendations": [
    {
      "type": "waiver_wire" | "trade" | "lineup" | "general",
      "title": "Brief recommendation title",
      "description": "Detailed description of the recommendation",
      "priority": "high" | "medium" | "low",
      "reasoning": "Specific reasoning with player names and data"
    }
  ],
  "summary": "Overall assessment of the team and situation",
  "strengths": ["List of team strengths"],
  "weaknesses": ["List of team weaknesses and gaps"]
}
`;
  }

  async analyzeTrade(selectedPlayer: string, userTeam: any, allTeams: any[], leagueSettings: any): Promise<TradeAnalysis> {
    const maxRetries = 3;
    const baseDelay = 2000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const prompt = this.buildTradeAnalysisPrompt(selectedPlayer, userTeam, allTeams, leagueSettings);
        
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt
        });

        const rawJson = response.text;
        if (rawJson) {
          console.log('Raw trade analysis response (first 200 chars):', rawJson.substring(0, 200));
          
          // Clean JSON response using same logic as analyzeLeague
          let cleanJson = rawJson.trim();
          cleanJson = cleanJson.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```\s*$/, '');
          cleanJson = cleanJson.trim();
          
          const jsonStart = cleanJson.indexOf('{');
          const jsonEnd = cleanJson.lastIndexOf('}');
          
          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
          }
          
          return JSON.parse(cleanJson) as TradeAnalysis;
        } else {
          throw new Error("Empty response from AI model");
        }
      } catch (error: any) {
        console.log(`Trade analysis attempt ${attempt} failed:`, error.message);
        
        if (error.message?.includes('overloaded') || error.message?.includes('503') || error.message?.includes('UNAVAILABLE')) {
          if (attempt < maxRetries) {
            const delay = baseDelay * attempt;
            console.log(`Retrying trade analysis in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to analyze trade options after ${maxRetries} attempts: ${error.message}`);
        }
      }
    }
    
    throw new Error("Unexpected error in analyzeTrade");
  }

  private buildTradeAnalysisPrompt(selectedPlayer: string, userTeam: any, allTeams: any[], leagueSettings: any): string {
    // Format scoring type
    let scoringFormat = 'Standard';
    if (leagueSettings.receptionPoints === 1) {
      scoringFormat = 'Full PPR';
    } else if (leagueSettings.receptionPoints === 0.5) {
      scoringFormat = 'Half PPR';
    }

    // Format user roster
    const userRoster = userTeam.roster?.map((player: any) => {
      return `${player.name} (${player.position}) - ${player.isStarter ? 'Starter' : 'Bench'}`;
    }).join('\n') || 'No roster data';

    // Format other teams with their rosters
    const otherTeamsData = allTeams.filter(team => team.id !== userTeam.id).map(team => {
      const teamRoster = team.roster?.map((player: any) => {
        return `${player.name} (${player.position}) - ${player.isStarter ? 'Starter' : 'Bench'}`;
      }).join('\n  ') || 'No roster data';

      return `=== ${team.name} (${team.record?.wins}-${team.record?.losses}) ===
  ${teamRoster}`;
    }).join('\n\n');

    return `
You are an expert fantasy football trade analyzer. Analyze potential trade opportunities for the selected player.

==== YOUR TEAM: ${userTeam.name} ====
Record: ${userTeam.record?.wins}-${userTeam.record?.losses}
Points For: ${userTeam.record?.pointsFor}
Points Against: ${userTeam.record?.pointsAgainst}

Your Current Roster:
${userRoster}

==== SELECTED PLAYER FOR TRADE ====
${selectedPlayer}

==== LEAGUE SETTINGS ====
Scoring: ${scoringFormat} (${leagueSettings.receptionPoints || 0} points per reception)
Season: ${leagueSettings.season}

==== ALL OTHER TEAMS ====
${otherTeamsData}

==== TRADE ANALYSIS REQUESTED ====
Based on the data above, provide a comprehensive trade analysis for "${selectedPlayer}". Focus on:

1. **Player Value Assessment**: Analyze the selected player's current value and trade appeal
2. **Realistic Trade Partners**: Identify teams that would benefit from this player and have valuable pieces to offer
3. **Fair Trade Proposals**: Suggest 3-5 specific trade scenarios with different teams
4. **Market Analysis**: Overall trade market assessment for this player type

For each trade option, consider:
- Team needs and roster construction
- Player values in your scoring format
- Team records and playoff positioning
- Realistic likelihood of acceptance

**IMPORTANT: Return your response as pure JSON only, no markdown formatting, no code blocks, just the raw JSON in this exact format:**

{
  "selectedPlayer": "${selectedPlayer}",
  "playerValue": "Assessment of player's current trade value and appeal",
  "tradeOptions": [
    {
      "targetTeam": "Team Name",
      "targetTeamId": "team_id",
      "playersOffered": ["${selectedPlayer}"],
      "playersRequested": ["Player from target team"],
      "tradeRationale": "Why this trade makes sense for both teams",
      "fairnessRating": 7,
      "benefitAnalysis": "How this helps your team specifically"
    }
  ],
  "marketAnalysis": "Overall analysis of trade market for this player position/type",
  "summary": "Overall assessment and trading strategy recommendations"
}`;
  }

  async optimizeLineup(roster: any[], leagueSettings: any, currentDate: string, nflWeek: number): Promise<LineupOptimization> {
    const maxRetries = 3;
    const baseDelay = 2000;
    
    // Format scoring type
    let scoringFormat = 'Standard';
    if (leagueSettings.receptionPoints === 1) {
      scoringFormat = 'Full PPR';
    } else if (leagueSettings.receptionPoints === 0.5) {
      scoringFormat = 'Half PPR';
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const prompt = this.buildLineupOptimizationPrompt(roster, leagueSettings, currentDate, nflWeek);
        
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          config: {
            systemInstruction: `You are an expert fantasy football analyst with access to real-time NFL data and player information. 
Today's date is ${currentDate} and we are in NFL Week ${nflWeek} of the 2025 season.
This is a ${leagueSettings.teamCount}-team ${scoringFormat} league.
Use your knowledge of current player performance, injuries, matchups, and trends to provide accurate lineup optimization advice.
Consider that in a ${leagueSettings.teamCount}-team league, roster depth and player availability are ${leagueSettings.teamCount >= 12 ? 'shallower' : 'deeper'} than standard leagues.`
          },
          contents: prompt
        });

        const rawJson = response.text;
        if (rawJson) {
          console.log('Raw lineup optimization response (first 200 chars):', rawJson.substring(0, 200));
          
          // Clean JSON response
          let cleanJson = rawJson.trim();
          cleanJson = cleanJson.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```\s*$/, '');
          cleanJson = cleanJson.trim();
          
          const jsonStart = cleanJson.indexOf('{');
          const jsonEnd = cleanJson.lastIndexOf('}');
          
          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
          }
          
          return JSON.parse(cleanJson) as LineupOptimization;
        } else {
          throw new Error("Empty response from AI model");
        }
      } catch (error: any) {
        console.log(`Lineup optimization attempt ${attempt} failed:`, error.message);
        
        if (error.message?.includes('overloaded') || error.message?.includes('503') || error.message?.includes('UNAVAILABLE')) {
          if (attempt < maxRetries) {
            const delay = baseDelay * attempt;
            console.log(`Retrying lineup optimization in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to optimize lineup after ${maxRetries} attempts: ${error.message}`);
        }
      }
    }
    
    throw new Error("Unexpected error in optimizeLineup");
  }

  private buildLineupOptimizationPrompt(roster: any[], leagueSettings: any, currentDate: string, nflWeek: number): string {
    // Format scoring type
    let scoringFormat = 'Standard';
    if (leagueSettings.receptionPoints === 1) {
      scoringFormat = 'Full PPR';
    } else if (leagueSettings.receptionPoints === 0.5) {
      scoringFormat = 'Half PPR';
    }

    // Separate starters, bench, and IR
    const starters = roster.filter((entry: any) => entry.lineupSlotId !== 20 && entry.lineupSlotId !== 21);
    const bench = roster.filter((entry: any) => entry.lineupSlotId === 20 || entry.lineupSlotId === 21);

    // Format starter info
    const startersInfo = starters.map((entry: any) => {
      const player = entry.playerPoolEntry?.player;
      if (!player) return null;
      
      const position = player.defaultPositionId === 1 ? "QB" : 
                       player.defaultPositionId === 2 ? "RB" :
                       player.defaultPositionId === 3 ? "WR" :
                       player.defaultPositionId === 4 ? "TE" :
                       player.defaultPositionId === 5 ? "K" : "DEF";
      
      return `${player.fullName} (${position}) - Lineup Slot: ${entry.lineupSlotId}`;
    }).filter(Boolean).join('\n');

    // Format bench info
    const benchInfo = bench.map((entry: any) => {
      const player = entry.playerPoolEntry?.player;
      if (!player) return null;
      
      const position = player.defaultPositionId === 1 ? "QB" : 
                       player.defaultPositionId === 2 ? "RB" :
                       player.defaultPositionId === 3 ? "WR" :
                       player.defaultPositionId === 4 ? "TE" :
                       player.defaultPositionId === 5 ? "K" : "DEF";
      
      return `${player.fullName} (${position})`;
    }).filter(Boolean).join('\n');

    return `
You are an expert fantasy football analyst optimizing a lineup for Week ${nflWeek} of the 2025 NFL season.

==== CURRENT DATE & CONTEXT ====
Today: ${currentDate}
NFL Week: ${nflWeek}
Note: Use your knowledge of current player performance, injuries, matchups, and recent news to provide accurate recommendations.

==== LEAGUE SETTINGS ====
League Size: ${leagueSettings.teamCount}-team league
Scoring: ${scoringFormat} (${leagueSettings.receptionPoints || 0} points per reception)
Season: ${leagueSettings.season}

==== CURRENT STARTING LINEUP ====
${startersInfo || 'No starters found'}

==== BENCH PLAYERS ====
${benchInfo || 'No bench players'}

==== LINEUP OPTIMIZATION REQUESTED ====
Analyze this roster and provide an optimized lineup for Week ${nflWeek}. Consider:

1. **Current Week Matchups**: Which players have favorable matchups this week?
2. **Recent Performance**: Who's hot and who's cold right now?
3. **Injury Status**: Are there any injury concerns affecting the current lineup?
4. **Scoring Format**: How does ${scoringFormat} scoring affect player values?
5. **Start/Sit Decisions**: Should any bench players be starting over current starters?

**IMPORTANT: Return your response as pure JSON only, no markdown formatting, no code blocks, just the raw JSON in this exact format:**

{
  "recommendedLineup": [
    {
      "position": "QB/RB/WR/TE/FLEX/K/DEF",
      "player": "Player Full Name",
      "reason": "Why this player should start (matchup, performance, etc.)"
    }
  ],
  "benchPlayers": [
    {
      "player": "Player Full Name",
      "reason": "Why this player should sit this week"
    }
  ],
  "keyChanges": [
    "List of key lineup changes recommended (e.g., 'Start Player X over Player Y')"
  ],
  "projectedImpact": "Expected point differential or impact of recommended changes",
  "summary": "Overall lineup assessment and confidence in recommendations"
}`;
  }
}

export const geminiService = new FantasyGeminiService();
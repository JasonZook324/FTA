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
  // Public method to get the prompt without calling AI
  getAnalysisPrompt(leagueData: any, teamData?: any): string {
    return this.buildAnalysisPrompt(leagueData, teamData);
  }

  // Public method to get the question prompt without calling AI
  getQuestionPrompt(question: string, leagueData: any): string {
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

    return `
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
  }

  // Public method to get trade analysis prompt
  getTradeAnalysisPrompt(selectedPlayer: string, userTeam: any, allTeams: any[], leagueSettings: any): string {
    return this.buildTradeAnalysisPrompt(selectedPlayer, userTeam, allTeams, leagueSettings);
  }

  // Public method to get lineup optimization prompt
  getLineupOptimizationPrompt(roster: any[], leagueSettings: any, currentDate: string, nflWeek: number): string {
    return this.buildLineupOptimizationPrompt(roster, leagueSettings, currentDate, nflWeek);
  }

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
    const league = leagueData.league || {};

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

    // Build plain text prompt that requests HTML response
    return `You are a fantasy football expert. Analyze the following ESPN Fantasy Football data and provide comprehensive recommendations.

==== LEAGUE INFORMATION ====
League: ${league.name || 'Unknown League'}
Season: ${weekContext.season}
Current Week: ${weekContext.currentWeek}
Scoring Format: ${scoringFormat}
Teams in League: ${league.teamCount || 'Unknown'}

==== MY TEAM ROSTER: ${userTeam.name || 'Your Team'} ====

STARTERS:
${starters.length > 0 ? starters.map((p: any) => 
  `- [${p.lineupSlot || 'FLEX'}] ${p.name || 'Unknown'} (${p.position || 'FLEX'}, ${p.nflTeam || 'FA'}) - Proj: ${p.projectedPoints || '0.0'} pts - Status: ${p.injuryStatus || 'Active'}`
).join('\n') : '- No starters found'}

BENCH:
${bench.length > 0 ? bench.map((p: any) => 
  `- [Bench] ${p.name || 'Unknown'} (${p.position || 'FLEX'}, ${p.nflTeam || 'FA'}) - Proj: ${p.projectedPoints || '0.0'} pts - Status: ${p.injuryStatus || 'Active'}`
).join('\n') : '- No bench players'}

${ir.length > 0 ? `INJURED RESERVE:
${ir.map((p: any) => 
  `- [I.R.] ${p.name || 'Unknown'} (${p.position || 'FLEX'}, ${p.nflTeam || 'FA'}) - Proj: ${p.projectedPoints || '0.0'} pts - Status: ${p.injuryStatus || 'Injured'}`
).join('\n')}` : ''}

==== TOP AVAILABLE WAIVER WIRE PLAYERS ====
${waiverWire.topAvailable && waiverWire.topAvailable.length > 0 ? waiverWire.topAvailable.map((p: any) => 
  `- ${p.name || 'Unknown'} (${p.position || 'FLEX'}, ${p.nflTeam || 'FA'}) - Proj: ${p.projectedPoints || '0.0'} pts - Owned: ${p.ownershipPercent || '0.0'}% - Status: ${p.injuryStatus || 'Active'}`
).join('\n') : '- No waiver wire data available'}

==== REQUESTED ANALYSIS ====
Please provide a comprehensive fantasy football analysis with the following sections:

1. **Roster Strengths** - What's working well with my current lineup
2. **Roster Weaknesses** - Gaps and concerns in my roster
3. **Waiver Wire Recommendations** - Specific players to target and who to drop
4. **Lineup Optimization** - Suggested starter/bench changes for this week
5. **Strategic Advice** - Overall strategy based on the scoring format and current situation
6. **Research & Trends Analysis** - Reference multiple expert sources including FantasyPros consensus rankings, start/sit advice, betting trends, and moneylines to provide comprehensive data-driven insights from recent NFL data

**IMPORTANT: Base your analysis on current research from multiple sources, including:**
- FantasyPros expert consensus rankings and start/sit recommendations
- Player target shares, snap counts, and usage trends
- Matchup analysis and defensive rankings against positions
- Injury reports and their fantasy impact
- Betting moneylines and trends that may indicate game script expectations
- Vegas over/under totals and implied team scoring
- Waiver wire pickup percentages and expert recommendations

Format your response with clear visual structure using:
- Headers and section titles
- Bullet points and numbered lists
- Tables for player comparisons
- Bold text for player names and key recommendations
- Use emojis to highlight important points (✅ for strengths, ⚠️ for concerns, 🎯 for recommendations, 📊 for stats)

Make your recommendations specific with player names, projected points, and clear reasoning based on the ${scoringFormat} scoring format.`;
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

    // Safely extract user team record with defaults
    //const userRecord = userTeam.record || {};
    //const userWins = userRecord.wins ?? 0;
    //const userLosses = userRecord.losses ?? 0;
    //const userPointsFor = userRecord.pointsFor ?? 0;
    //const userPointsAgainst = userRecord.pointsAgainst ?? 0;
    const userTeamName = userTeam.name || 'Your Team';

    // Format user roster
    const userRoster = userTeam.roster?.map((player: any) => {
      return `${player.name || 'Unknown Player'} (${player.position || 'FLEX'}) - ${player.isStarter ? 'Starter' : 'Bench'}`;
    }).join('\n') || 'No roster data';
    // Format other teams with their rosters
    const otherTeamsData = allTeams.filter(team => team.id !== userTeam.id).map(team => {
      const teamName = team.name || `Team ${team.id}`;
      
      const teamRoster = team.roster?.map((player: any) => {
        return `${player.name || 'Unknown Player'} (${player.position || 'FLEX'}) - ${player.isStarter ? 'Starter' : 'Bench'}`;
      }).join('\n  ') || 'No roster data';

      return `=== ${teamName} ===
  ${teamRoster}`;
    }).join('\n\n');

    return `
You are an expert fantasy football trade analyzer. Analyze potential trade opportunities for the selected player.

==== YOUR TEAM: ${userTeamName} ====
Your Current Roster:
${userRoster}

==== SELECTED PLAYER FOR TRADE ====
${selectedPlayer}

==== LEAGUE SETTINGS ====
Scoring: ${scoringFormat} (${leagueSettings.receptionPoints || 0} points per reception)
Season: ${leagueSettings.season || 'Unknown'}

==== ALL OTHER TEAMS ====
${otherTeamsData}

==== TRADE ANALYSIS REQUESTED ====
Based on the data above, provide a comprehensive trade analysis for "${selectedPlayer}". Focus on:

1. **Player Value Assessment**: Analyze the selected player's current value and trade appeal
2. **Realistic Trade Partners**: Identify teams that would benefit from this player and have valuable pieces to offer
3. **Fair Trade Proposals**: Suggest 3-5 specific trade scenarios with different teams
4. **Market Analysis**: Overall trade market assessment for this player type
5. **Strategic Advice** - Overall strategy based on the scoring format and current situation
6. **Research & Trends Analysis** - Reference multiple expert sources including FantasyPros consensus rankings, start/sit advice, betting trends, and moneylines to provide comprehensive data-driven insights from recent NFL data

**IMPORTANT: Base your analysis on current research from multiple sources, including:**
- FantasyPros expert consensus rankings and start/sit recommendations
- Player target shares, snap counts, and usage trends
- Matchup analysis and defensive rankings against positions
- Injury reports and their fantasy impact
- Betting moneylines and trends that may indicate game script expectations
- Vegas over/under totals and implied team scoring

Format your response with clear visual structure using:
- Headers and section titles
- Bullet points and numbered lists
- Tables for player comparisons
- Bold text for player names and key recommendations
- Use emojis to highlight important points (✅ for strengths, ⚠️ for concerns, 🎯 for recommendations, 📊 for stats)


For each trade option, consider:
- Team needs and roster construction
- Player values in your scoring format
- Team records and playoff positioning
- Realistic likelihood of acceptance

**IMPORTANT: Return your response as pure JSON only, no markdown formatting, no code blocks, just the raw JSON in this exact format:**`;
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
    // Helper function to get lineup slot name
    const getLineupSlotName = (slotId: number): string => {
      const slots: Record<number, string> = {
        0: "QB",
        2: "RB",
        4: "WR",
        6: "TE",
        16: "D/ST",
        17: "K",
        20: "Bench",
        21: "I.R.",
        23: "FLEX",
        7: "OP",
        10: "UTIL",
        12: "RB/WR/TE"
      };
      return slots[slotId] || `Slot_${slotId}`;
    };

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
      
      const lineupSlotName = getLineupSlotName(entry.lineupSlotId);
      return `[${lineupSlotName}] ${player.fullName} (${position})`;
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
      
      const lineupSlotName = getLineupSlotName(entry.lineupSlotId);
      return `[${lineupSlotName}] ${player.fullName} (${position})`;
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
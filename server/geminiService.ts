import { GoogleGenAI } from "@google/genai";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

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

export class FantasyGeminiService {
  async analyzeLeague(leagueData: any, teamData?: any): Promise<FantasyAnalysis> {
    try {
      const prompt = this.buildAnalysisPrompt(leagueData, teamData);
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              recommendations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["waiver_wire", "trade", "lineup", "general"] },
                    title: { type: "string" },
                    description: { type: "string" },
                    priority: { type: "string", enum: ["high", "medium", "low"] },
                    reasoning: { type: "string" }
                  },
                  required: ["type", "title", "description", "priority", "reasoning"]
                }
              },
              summary: { type: "string" },
              strengths: {
                type: "array",
                items: { type: "string" }
              },
              weaknesses: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["recommendations", "summary", "strengths", "weaknesses"]
          }
        },
        contents: prompt
      });

      const rawJson = response.text;
      if (rawJson) {
        return JSON.parse(rawJson) as FantasyAnalysis;
      } else {
        throw new Error("Empty response from AI model");
      }
    } catch (error) {
      throw new Error(`Failed to analyze fantasy data: ${error}`);
    }
  }

  async askQuestion(question: string, leagueData: any): Promise<string> {
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
    } catch (error) {
      throw new Error(`Failed to answer question: ${error}`);
    }
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
`;
  }
}

export const geminiService = new FantasyGeminiService();
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
      const contextPrompt = `
You are a fantasy football expert assistant. Use the following league data to answer the user's question with specific, actionable advice.

League Context:
${JSON.stringify(leagueData, null, 2)}

User Question: ${question}

Provide a detailed, helpful response based on the league data and general fantasy football strategy.
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
    return `
You are a fantasy football expert analyzing league data. Provide strategic recommendations based on the following information:

LEAGUE DATA:
${JSON.stringify(leagueData, null, 2)}

${teamData ? `USER TEAM DATA:\n${JSON.stringify(teamData, null, 2)}` : ''}

Please analyze this fantasy football league and provide:

1. RECOMMENDATIONS: Specific actionable advice for improving performance
   - Waiver wire pickups to consider
   - Trade opportunities 
   - Lineup optimization suggestions
   - General strategy advice

2. SUMMARY: Overall assessment of the league situation

3. STRENGTHS: What's working well in this league/team

4. WEAKNESSES: Areas that need improvement

Focus on practical, actionable advice that can be implemented immediately. Consider:
- Player performance trends
- Team needs and depth
- League scoring settings
- Available players on waivers
- Trade opportunities with other teams
- Upcoming matchups and schedules

Provide specific player names and detailed reasoning for each recommendation.
`;
  }
}

export const geminiService = new FantasyGeminiService();
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
console.log('OpenAI API Key loaded:', apiKey ? `${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 4)}` : 'NOT FOUND');
console.log('OpenAI API Key length:', apiKey?.length || 0);

const openai = new OpenAI({
  apiKey: apiKey,
});

export interface OpenAIPromptRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface OpenAIPromptResponse {
  responseText: string;
  tokensUsed: number;
  model: string;
  responseTime: number;
}

export class OpenAIService {
  async submitPrompt(request: OpenAIPromptRequest): Promise<OpenAIPromptResponse> {
    const startTime = Date.now();
    
    try {
      const response = await openai.chat.completions.create({
        model: request.model || "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an expert fantasy football analyst. Provide detailed, actionable advice based on the provided data. Format your response with clear sections, use bullet points for recommendations, and be specific with player names and reasoning."
          },
          {
            role: "user",
            content: request.prompt
          }
        ],
        max_tokens: request.maxTokens || 2000,
        temperature: request.temperature || 0.7,
      });

      const responseTime = Date.now() - startTime;

      return {
        responseText: response.choices[0]?.message?.content || "No response generated",
        tokensUsed: response.usage?.total_tokens || 0,
        model: response.model,
        responseTime,
      };
    } catch (error: any) {
      console.error('OpenAI API Error:', error);
      throw new Error(`OpenAI API failed: ${error.message}`);
    }
  }
}

export const openaiService = new OpenAIService();

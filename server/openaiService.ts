import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
console.log('OpenAI API Key loaded:', apiKey ? `${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 4)}` : 'NOT FOUND');
console.log('OpenAI API Key length:', apiKey?.length || 0);

if (!apiKey) {
  console.error('OPENAI_API_KEY is missing. Set it in your environment.');
}

const openai = new OpenAI({ apiKey });

function normalizeModelName(requested?: string): string[] {
  const req = (requested || '').toLowerCase();
  // Map legacy/alias names to current recommended models
  const aliases: Record<string, string> = {
    'gpt-4-turbo': 'gpt-4o',
    'gpt-4': 'gpt-4o',
    'gpt4': 'gpt-4o',
    'gpt-3.5-turbo': 'gpt-4o-mini',
    'gpt3.5': 'gpt-4o-mini',
  };

  const primary = aliases[req] || requested || 'gpt-4o-mini';
  const fallbacks = ['gpt-4o', 'gpt-4o-mini'];
  const candidates = [primary, ...fallbacks];
  // De-duplicate while preserving order
  return Array.from(new Set(candidates));
}

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
      if (!apiKey) {
        throw new Error('Missing OPENAI_API_KEY. Please set it in your environment.');
      }

      const models = normalizeModelName(request.model);
      let lastError: any = null;
      for (const model of models) {
        try {
          const response = await openai.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content: "You are an expert fantasy football analyst. Provide detailed, actionable advice based on the provided data. Format your response with clear sections, use bullet points for recommendations, and be specific with player names and reasoning."
              },
              { role: "user", content: request.prompt }
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
        } catch (err: any) {
          lastError = err;
          console.warn(`Model ${model} failed, trying fallback if available:`, err?.message || err);
        }
      }

      throw lastError || new Error('All model attempts failed');
    } catch (error: any) {
      console.error('OpenAI API Error:', error);
      throw new Error(`OpenAI API failed: ${error.message}`);
    }
  }
}

export const openaiService = new OpenAIService();

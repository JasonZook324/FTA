# OpenAI Integration Plan for Prompt Builder

## Executive Summary

This document outlines the complete plan to add OpenAI integration to the Prompt Builder page, allowing users to submit generated prompts directly to OpenAI API and display responses inline on the page.

**Feasibility**: ✅ **FULLY POSSIBLE**  
**Complexity**: Medium  
**Estimated Implementation Time**: 2-3 hours  
**Database Changes Required**: Yes (new table for AI responses)

---

## Current State Analysis

### What Currently Exists

1. **Prompt Builder Page** (`client/src/pages/prompt-builder.tsx`)
   - Generates comprehensive fantasy football prompts
   - Includes team rosters, waiver wire data, league settings, FantasyPros data
   - Currently displays prompts in a textarea for manual copy/paste
   - Has a "Copy to Clipboard" button
   - No AI submission functionality

2. **Gemini AI Integration** (`server/geminiService.ts`)
   - Already integrated for fantasy analysis
   - Uses `@google/genai` package
   - Has retry logic for API overloads
   - Handles JSON response parsing and formatting
   - Used by AI Recommendations page, not Prompt Builder

3. **Database Infrastructure**
   - **CONFIRMED**: Using Neon PostgreSQL (connection: `ep-old-fog-adzsx6ik`)
   - Drizzle ORM for type-safe database operations
   - Existing tables: users, leagues, teams, fantasyProsNews, etc.
   - **NO TABLE** currently exists for storing AI conversation history

4. **API Endpoints**
   - `POST /api/leagues/:leagueId/custom-prompt` - Generates prompts (doesn't call AI)
   - Protected with `requireAuth` middleware
   - Returns JSON with `{ prompt: string }`

5. **Secret Management**
   - `GEMINI_API_KEY` exists and is configured
   - `OPENAI_API_KEY` does **NOT** exist

---

## Available Integration Options

### Option 1: Replit AI Integrations (RECOMMENDED)

**Integration ID**: `blueprint:javascript_openai_ai_integrations`

**Advantages**:
- ✅ No API key needed from user
- ✅ Charges billed to user's Replit credits (transparent pricing)
- ✅ Supports latest models (gpt-5, gpt-4.1, o3, o4-mini, etc.)
- ✅ Provides OpenAI-compatible API without external account setup
- ✅ Includes chat-completions API (exactly what we need)
- ✅ Managed by Replit (automatic updates, security patches)

**Limitations**:
- ⚠️ Does NOT support: embeddings, fine-tuning, file uploads, audio/video
- ⚠️ Chat-completions only (sufficient for our use case)

**Best For**: This project, since we only need text chat completions

### Option 2: Standard OpenAI with API Key

**Integration ID**: `blueprint:javascript_openai`

**Advantages**:
- Full OpenAI API access (all features)
- Direct billing to user's OpenAI account

**Disadvantages**:
- ❌ Requires user to create OpenAI account
- ❌ Requires user to provide API key
- ❌ More setup friction
- ❌ Billing outside of Replit ecosystem

**Best For**: Projects needing embeddings, fine-tuning, or audio/video

### Recommended Choice

**Use Option 1** (Replit AI Integrations) because:
1. Zero friction - no API key management
2. Integrated billing with Replit credits
3. Meets all requirements (text-only chat completions)
4. Simpler implementation

---

## Database Schema Changes

### New Table: `ai_prompt_responses`

Store AI conversation history for audit trail, cost tracking, and user history.

```typescript
export const aiPromptResponses = pgTable("ai_prompt_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leagueId: varchar("league_id").references(() => leagues.id, { onDelete: "set null" }),
  teamId: integer("team_id"), // ESPN team ID, not FK (teams can change)
  
  // Prompt data
  promptText: text("prompt_text").notNull(), // The full prompt sent to AI
  promptOptions: jsonb("prompt_options"), // Store user's selected options for reference
  
  // AI response data
  responseText: text("response_text").notNull(), // The AI's full response
  aiModel: text("ai_model").notNull(), // e.g., "gpt-4.1", "gpt-5"
  aiProvider: text("ai_provider").notNull().default("openai"), // Future-proof for multiple providers
  
  // Metadata
  tokensUsed: integer("tokens_used"), // For cost tracking
  responseTime: integer("response_time"), // Milliseconds
  status: text("status").notNull().default("success"), // success, error, timeout
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIndex: uniqueIndex("ai_responses_user_id").on(table.userId),
  createdAtIndex: uniqueIndex("ai_responses_created_at").on(table.createdAt),
}));

export const insertAiPromptResponseSchema = createInsertSchema(aiPromptResponses).omit({
  id: true,
  createdAt: true,
});

export type AiPromptResponse = typeof aiPromptResponses.$inferSelect;
export type InsertAiPromptResponse = z.infer<typeof insertAiPromptResponseSchema>;
```

**Why This Schema**:
- **Audit Trail**: Track all AI usage per user
- **Cost Monitoring**: `tokensUsed` helps monitor API costs
- **Debugging**: `errorMessage` and `status` for troubleshooting
- **Multi-provider Ready**: `aiProvider` field supports Gemini, Claude, etc. in future
- **Performance Tracking**: `responseTime` for monitoring API latency
- **User History**: Users can see their past AI analyses

**Migration Command**:
```bash
npm run db:push --force
```

---

## Implementation Plan

### Phase 1: Integration Setup

**File**: `server/openaiService.ts` (NEW)

Create a new service similar to `geminiService.ts` but for OpenAI:

```typescript
import OpenAI from 'openai'; // From Replit AI Integrations blueprint

// Initialize OpenAI client (Replit AI Integrations provides this)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Provided by Replit AI Integrations
});

export interface OpenAIPromptRequest {
  prompt: string;
  model?: string; // Default: "gpt-4.1"
  maxTokens?: number; // Default: 2000
  temperature?: number; // Default: 0.7
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
        model: request.model || "gpt-4.1",
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
```

**Key Features**:
- System message sets context as fantasy football expert
- Configurable model, tokens, temperature
- Error handling with detailed logging
- Performance tracking via `responseTime`
- Token usage tracking for cost monitoring

---

### Phase 2: Backend API Endpoint

**File**: `server/routes.ts` (MODIFY)

Add new endpoint after the existing `custom-prompt` endpoint:

```typescript
// New endpoint: Submit prompt to OpenAI
app.post("/api/leagues/:leagueId/submit-ai-prompt", requireAuth, async (req: any, res) => {
  try {
    const { leagueId } = req.params;
    const { teamId, promptText, model } = req.body;

    console.log(`Submitting prompt to OpenAI for user ${req.user.id}, league ${leagueId}`);

    // Validate request
    if (!promptText || promptText.trim().length === 0) {
      return res.status(400).json({ message: "Prompt text is required" });
    }

    // Verify user has access to this league
    const leagues = await storage.getLeagues(req.user.id);
    const league = leagues.find(l => l.id === leagueId);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }

    // Submit to OpenAI
    const { openaiService } = await import('./openaiService');
    const aiResponse = await openaiService.submitPrompt({
      prompt: promptText,
      model: model || "gpt-4.1",
    });

    // Store in database
    const { db } = await import('./db');
    const { aiPromptResponses } = await import('@shared/schema');
    
    const [savedResponse] = await db.insert(aiPromptResponses).values({
      userId: req.user.id,
      leagueId: league.id,
      teamId: teamId ? parseInt(teamId) : null,
      promptText,
      responseText: aiResponse.responseText,
      aiModel: aiResponse.model,
      aiProvider: 'openai',
      tokensUsed: aiResponse.tokensUsed,
      responseTime: aiResponse.responseTime,
      status: 'success',
    }).returning();

    console.log(`AI response saved: ${savedResponse.id}, tokens: ${aiResponse.tokensUsed}`);

    // Return response to frontend
    res.json({
      responseId: savedResponse.id,
      responseText: aiResponse.responseText,
      tokensUsed: aiResponse.tokensUsed,
      model: aiResponse.model,
      responseTime: aiResponse.responseTime,
    });

  } catch (error: any) {
    console.error('Error submitting prompt to AI:', error);

    // Store error in database for debugging
    try {
      const { db } = await import('./db');
      const { aiPromptResponses } = await import('@shared/schema');
      
      await db.insert(aiPromptResponses).values({
        userId: req.user.id,
        leagueId: req.params.leagueId,
        teamId: req.body.teamId ? parseInt(req.body.teamId) : null,
        promptText: req.body.promptText,
        responseText: '',
        aiModel: req.body.model || 'gpt-4.1',
        aiProvider: 'openai',
        status: 'error',
        errorMessage: error.message,
      });
    } catch (dbError) {
      console.error('Failed to save error to database:', dbError);
    }

    res.status(500).json({ 
      message: "Failed to get AI response", 
      error: error.message 
    });
  }
});
```

**Key Features**:
- Auth-protected (only logged-in users)
- League access validation
- Database persistence of all requests (success + errors)
- Error handling with database logging
- Returns response ID for future reference

---

### Phase 3: Frontend Implementation

**File**: `client/src/pages/prompt-builder.tsx` (MODIFY)

#### 3.1: Add State Management

```typescript
// Add new state variables after existing states
const [isSubmittingToAI, setIsSubmittingToAI] = useState(false);
const [aiResponse, setAiResponse] = useState<{
  responseId: string;
  responseText: string;
  tokensUsed: number;
  model: string;
  responseTime: number;
} | null>(null);
const [aiError, setAiError] = useState<string | null>(null);
const [selectedModel, setSelectedModel] = useState("gpt-4.1");
```

#### 3.2: Add Submit Handler

```typescript
const handleSubmitToAI = async () => {
  if (!selectedTeam) {
    toast({
      title: "Selection Required",
      description: "Please select a team from the header first.",
      variant: "destructive",
    });
    return;
  }

  if (!generatedPrompt || generatedPrompt.trim().length === 0) {
    toast({
      title: "No Prompt",
      description: "Generate a prompt first before submitting to AI.",
      variant: "destructive",
    });
    return;
  }

  setIsSubmittingToAI(true);
  setAiError(null);
  setAiResponse(null);

  try {
    const response = await fetch(`/api/leagues/${selectedTeam.leagueId}/submit-ai-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: selectedTeam.teamId,
        promptText: generatedPrompt,
        model: selectedModel,
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get AI response');
    }
    
    const result = await response.json();
    setAiResponse(result);
    
    toast({
      title: "AI Analysis Complete",
      description: `Received response from ${result.model} (${result.tokensUsed} tokens)`,
    });
  } catch (error: any) {
    setAiError(error.message);
    toast({
      title: "AI Submission Failed",
      description: error.message || "Failed to get AI response",
      variant: "destructive",
    });
  } finally {
    setIsSubmittingToAI(false);
  }
};
```

#### 3.3: Add UI Components

Add after the "Generate Prompt" button:

```tsx
{/* AI Model Selection */}
{generatedPrompt && (
  <div className="flex items-center gap-4 mt-4">
    <Label htmlFor="ai-model">AI Model</Label>
    <Select value={selectedModel} onValueChange={setSelectedModel}>
      <SelectTrigger className="w-[200px]" id="ai-model">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="gpt-4.1">GPT-4.1 (Recommended)</SelectItem>
        <SelectItem value="gpt-5">GPT-5 (Most Advanced)</SelectItem>
        <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini (Faster)</SelectItem>
        <SelectItem value="o3">O3 (Reasoning)</SelectItem>
      </SelectContent>
    </Select>
  </div>
)}

{/* Submit to AI Button */}
{generatedPrompt && (
  <Button
    onClick={handleSubmitToAI}
    disabled={isSubmittingToAI || !generatedPrompt}
    className="w-full mt-4"
    data-testid="button-submit-ai"
  >
    {isSubmittingToAI ? (
      <>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Analyzing with AI...
      </>
    ) : (
      <>
        <Brain className="mr-2 h-4 w-4" />
        Get AI Analysis
      </>
    )}
  </Button>
)}

{/* AI Response Display */}
{aiResponse && (
  <Card className="mt-6" data-testid="card-ai-response">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Brain className="h-5 w-5 text-purple-600" />
        AI Analysis
        <Badge variant="outline" className="ml-auto">
          {aiResponse.model}
        </Badge>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <div 
          className="whitespace-pre-wrap bg-muted p-4 rounded-lg"
          data-testid="text-ai-response"
        >
          {aiResponse.responseText}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
        <span>Tokens: {aiResponse.tokensUsed}</span>
        <span>•</span>
        <span>Response Time: {(aiResponse.responseTime / 1000).toFixed(2)}s</span>
      </div>
    </CardContent>
  </Card>
)}

{/* Error Display */}
{aiError && (
  <Card className="mt-6 border-destructive" data-testid="card-ai-error">
    <CardContent className="pt-6">
      <div className="flex items-start gap-2 text-destructive">
        <AlertCircle className="h-5 w-5 mt-0.5" />
        <div>
          <p className="font-semibold">AI Submission Failed</p>
          <p className="text-sm">{aiError}</p>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

**UI Features**:
- Model selection dropdown (GPT-4.1, GPT-5, O3, etc.)
- Loading state with spinner during AI call
- Formatted response display with prose styling
- Token usage and response time metadata
- Error display with clear messaging
- All interactive elements have `data-testid` for testing

---

### Phase 4: Integration Blueprint Setup

**Action Required**: Add OpenAI integration via Replit AI Integrations

```bash
# This will be done via the use_integration tool
use_integration(
  integration_id="blueprint:javascript_openai_ai_integrations",
  operation="add"
)
```

**What This Provides**:
1. OpenAI client library installed automatically
2. `OPENAI_API_KEY` environment variable configured
3. Documentation and example code
4. Billing integration with Replit credits

**User Notification Required**: 
Must inform user that:
- Uses Replit AI Integrations for OpenAI access
- Does NOT require separate OpenAI API key
- Charges are billed to Replit credits
- Transparent per-request pricing

---

## Security & Data Integrity

### Database Safety

✅ **CONFIRMED**: All operations use Neon PostgreSQL database  
✅ **NO Replit Database**: Project exclusively uses Neon (connection: `ep-old-fog-adzsx6ik`)  
✅ **Schema Migration**: Use `npm run db:push --force` (Drizzle handles migrations)  
✅ **Foreign Keys**: Proper cascade deletes on user deletion  
✅ **Indexes**: Created on userId and createdAt for query performance

### API Security

- ✅ All endpoints protected with `requireAuth` middleware
- ✅ League access validation before AI submission
- ✅ User can only see their own AI responses
- ✅ No direct API key exposure to frontend
- ✅ Rate limiting (inherited from Replit AI Integrations)

### Data Validation

**Backend**:
- Validate prompt text is non-empty
- Validate league ownership
- Sanitize user input (text is stored as-is but not executed)

**Frontend**:
- Disable submit button when no prompt generated
- Clear previous responses on new generation
- Show clear error messages

### Cost Control

**Token Tracking**:
- Every request logged with `tokensUsed`
- Query total usage: `SELECT SUM(tokensUsed) FROM ai_prompt_responses WHERE userId = ?`
- Implement usage dashboard (future enhancement)

**Model Limits**:
- Default: `max_tokens: 2000` (configurable)
- Prevents runaway costs from excessive output

---

## Error Handling

### Backend Errors

| Error Type | HTTP Code | Response | Database Log |
|------------|-----------|----------|--------------|
| No prompt text | 400 | `{ message: "Prompt text is required" }` | No |
| League not found | 404 | `{ message: "League not found" }` | No |
| OpenAI API error | 500 | `{ message: "Failed to get AI response", error: ... }` | **YES** |
| Database error | 500 | `{ message: "Server error" }` | **YES** |
| Rate limit | 429 | `{ message: "Too many requests" }` | **YES** |

**All errors are logged to `ai_prompt_responses` table with `status: 'error'`** for debugging.

### Frontend Error Handling

```typescript
// Network errors
catch (error) {
  if (error.message.includes('Failed to fetch')) {
    setAiError('Network error. Please check your connection.');
  } else if (error.message.includes('429')) {
    setAiError('Rate limit exceeded. Please try again in a few moments.');
  } else {
    setAiError(error.message);
  }
}
```

### Retry Logic

**Not implemented initially** (OpenAI has built-in retries).  
**Future enhancement**: Add exponential backoff similar to `geminiService.ts`.

---

## Testing Strategy

### Manual Testing Checklist

**Before Deployment**:
- [ ] Generate prompt successfully
- [ ] Select different AI models
- [ ] Submit prompt to AI (success case)
- [ ] Verify response displays correctly
- [ ] Check token usage displays
- [ ] Test with invalid league ID (should error)
- [ ] Test without selecting team (should error)
- [ ] Test with empty prompt (should prevent submission)
- [ ] Verify database entry created
- [ ] Test error display when API fails
- [ ] Check browser console for errors
- [ ] Verify no API keys exposed in network tab

### Database Verification

```sql
-- After successful AI submission
SELECT * FROM ai_prompt_responses ORDER BY created_at DESC LIMIT 5;

-- Check token usage
SELECT 
  user_id,
  COUNT(*) as total_requests,
  SUM(tokens_used) as total_tokens,
  AVG(response_time) as avg_response_time
FROM ai_prompt_responses
WHERE status = 'success'
GROUP BY user_id;

-- Check error rate
SELECT 
  status,
  COUNT(*) as count
FROM ai_prompt_responses
GROUP BY status;
```

### End-to-End Test Plan (using run_test tool)

```markdown
Test Plan: AI Prompt Submission

1. [New Context] Create a new browser context
2. [Browser] Navigate to login page (path: /login)
3. [Possible User Help Required] User logs in with credentials
4. [Browser] Navigate to Prompt Builder (path: /prompt-builder)
5. [Browser] Select a team from the global team selector
6. [Browser] Enter custom prompt: "Should I start or sit my running backs this week?"
7. [Browser] Check "Include My Team" option
8. [Browser] Click "Generate Prompt" button
9. [Verify] Assert that generated prompt appears in textarea
10. [Browser] Select AI model "gpt-4.1" from dropdown
11. [Browser] Click "Get AI Analysis" button
12. [Verify] 
    - Assert loading spinner appears
    - Wait for AI response (max 30 seconds)
    - Assert AI response card appears
    - Assert response text is not empty
    - Assert token usage is displayed
    - Assert response time is displayed
13. [DB] Verify database entry: "SELECT * FROM ai_prompt_responses WHERE user_id = '${userId}' ORDER BY created_at DESC LIMIT 1"
14. [Verify] Assert database entry has status='success' and response_text is not null
```

---

## Potential Issues & Solutions

### Issue 1: OpenAI API Rate Limits

**Problem**: User submits too many requests  
**Solution**:  
- Replit AI Integrations has built-in rate limiting
- Frontend can track requests and show warning after 5 requests/minute
- Database has all request history for monitoring

### Issue 2: Long Response Times

**Problem**: AI takes 10-30 seconds to respond  
**Solution**:  
- Show loading spinner with progress messages
- Disable submit button during processing
- Consider timeout after 60 seconds with retry option

### Issue 3: Large Prompts

**Problem**: Generated prompts exceed token limits  
**Solution**:  
- Current prompts are well-formatted and concise
- OpenAI's `max_tokens` parameter controls output length
- If input is too large, OpenAI will return error (caught and displayed)

### Issue 4: Database Storage Costs

**Problem**: AI responses are large (store in Neon DB)  
**Solution**:  
- Text fields are efficient in PostgreSQL
- Consider retention policy: delete responses older than 90 days
- Average response ~1-2KB, 1000 requests = ~1-2MB (negligible)

### Issue 5: Gemini vs OpenAI Confusion

**Problem**: User has both Gemini and OpenAI options  
**Solution**:  
- Clearly label "AI Analysis" (OpenAI) vs "AI Recommendations" (Gemini)
- Different pages serve different purposes
- Gemini = Structured analysis, OpenAI = Conversational Q&A

---

## Post-Implementation Enhancements

### Phase 2 Features (Future)

1. **Conversation History UI**
   - Display past AI responses
   - Pagination for history
   - Filter by league/team

2. **Usage Dashboard**
   - Total tokens used
   - Cost estimation
   - Charts showing usage over time

3. **Response Export**
   - Download as PDF
   - Share via link
   - Email response

4. **Multi-turn Conversations**
   - Follow-up questions
   - Context from previous responses
   - Conversation threads

5. **Model Comparison**
   - Submit same prompt to multiple models
   - Side-by-side comparison
   - Vote on best response

---

## Files Modified/Created Summary

### New Files
1. `server/openaiService.ts` - OpenAI integration service
2. `OpenAI_Integration_Plan.md` - This document

### Modified Files
1. `shared/schema.ts` - Add `aiPromptResponses` table
2. `server/routes.ts` - Add `/submit-ai-prompt` endpoint
3. `client/src/pages/prompt-builder.tsx` - Add AI submission UI

### Package Changes
- OpenAI package (added via Replit integration blueprint)

### Database Changes
- New table: `ai_prompt_responses`
- Migration: `npm run db:push --force`

---

## Implementation Checklist

**Setup Phase**:
- [ ] Install OpenAI integration via Replit AI Integrations
- [ ] Verify `OPENAI_API_KEY` environment variable exists
- [ ] Add `aiPromptResponses` table to `shared/schema.ts`
- [ ] Run `npm run db:push --force` to create table
- [ ] Verify table created in Neon database

**Backend Phase**:
- [ ] Create `server/openaiService.ts`
- [ ] Add export to ensure service is importable
- [ ] Add `/submit-ai-prompt` endpoint in `server/routes.ts`
- [ ] Test endpoint with curl/Postman

**Frontend Phase**:
- [ ] Add state management to `prompt-builder.tsx`
- [ ] Add `handleSubmitToAI` function
- [ ] Add UI components (model selector, button, response display)
- [ ] Add `data-testid` attributes for testing
- [ ] Test UI flow manually

**Verification Phase**:
- [ ] Submit test prompt and verify AI response
- [ ] Check database for saved response
- [ ] Verify token usage is tracked
- [ ] Test error cases (no team, no prompt, API failure)
- [ ] Run end-to-end test with `run_test` tool
- [ ] Check browser console for errors

**Documentation Phase**:
- [ ] Update `replit.md` with new feature description
- [ ] Add user-facing documentation (if needed)

---

## Success Criteria

✅ **Feature Complete When**:
1. User can click "Get AI Analysis" button
2. AI response displays inline on page (formatted nicely)
3. Response includes model name, token count, response time
4. All requests logged to `ai_prompt_responses` table (Neon DB)
5. Errors are handled gracefully with user-friendly messages
6. No API keys exposed to frontend
7. Works with multiple AI models (GPT-4.1, GPT-5, O3)
8. Loading states are clear and informative

---

## Conclusion

**This feature is 100% achievable** with the existing codebase structure. The implementation follows established patterns:
- Similar to existing Gemini integration
- Uses same auth/database infrastructure
- Follows React + TypeScript conventions
- Integrates seamlessly with Prompt Builder UI

**Key Risks**: None identified - straightforward integration  
**Blockers**: None - all dependencies available  
**Database Compliance**: ✅ All operations use Neon PostgreSQL exclusively  

**Estimated Timeline**:
- Setup & Integration: 30 minutes
- Backend Implementation: 45 minutes
- Frontend Implementation: 60 minutes
- Testing & Debugging: 30 minutes
- **Total**: ~2.5 hours

---

## Questions for User

Before proceeding with implementation:

1. **Model Preference**: Should we default to GPT-4.1 or GPT-5?
2. **Token Limits**: Is 2000 tokens enough for responses, or should we increase?
3. **Cost Awareness**: Should we display estimated cost per request to users?
4. **History Feature**: Do you want users to see past AI responses immediately, or in a future update?
5. **Model Selection**: Should model selection be visible, or should we auto-select based on prompt complexity?

---

**Document Version**: 1.0  
**Created**: 2025-10-29  
**Last Updated**: 2025-10-29  
**Author**: Replit Agent  
**Database**: Neon PostgreSQL (ep-old-fog-adzsx6ik)  
**Integration**: Replit AI Integrations (OpenAI-compatible)

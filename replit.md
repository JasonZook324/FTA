# ESPN Fantasy API Manager

## Overview

This is a full-stack web application designed to manage and visualize ESPN Fantasy Sports data. It enables users to authenticate with ESPN, import and manage fantasy leagues across various sports (NFL, NBA, NHL, MLB), and access detailed analytics including standings, rosters, matchups, and player information. The project aims to provide a modern, comprehensive interface to ESPN's Fantasy API, enhancing user experience and offering in-depth data insights. It supports multi-user authentication and data isolation, allowing personalized management of fantasy sports data.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is a React 18 application with TypeScript, utilizing a component-based architecture. It uses Radix UI primitives and shadcn/ui for a consistent and accessible design, Wouter for routing, and TanStack React Query for server state management. Styling is handled with Tailwind CSS.

**Global Team Selection (Updated - October 2025)**
The application uses a centralized team selection pattern for improved UX consistency:
- **Single Source of Truth**: A global team selector in the league header banner (`league-header.tsx`) drives team context across the entire application
- **Team Context**: React Context (`TeamContext.tsx`) maintains the selected team state (teamId, teamName, leagueId) accessible to all components
- **Consolidated UI**: Individual page-level team selectors have been removed from AI Recommendations and Prompt Builder pages in favor of the global selector
- **Empty States**: Pages requiring team selection display instructional empty states directing users to the header selector when no team is chosen
- **Comprehensive Team Display**: Team names use fallback logic (location+nickname → name → owner's team → Team ID) for consistent display across all views

### Backend Architecture
The backend is an Express.js application with TypeScript, following a RESTful API design. It incorporates a service layer for ESPN API communication and separate route handlers for different resources. Middleware is used for logging and error handling.

### Data Storage Solutions
The application exclusively uses **Neon PostgreSQL** for all data storage, configured via the `.env` file. Drizzle ORM is used for type-safe database operations. The schema includes tables for:
- User management: users, ESPN credentials
- ESPN data: leagues, teams, matchups, players
- Fantasy Pros data: players, rankings, projections, news, refresh logs
- NFL Stats & Odds (for kicker streaming): stadiums, Vegas odds, team stats
An in-memory storage option exists for development but is not used in production.

### Authentication and Authorization
A dual-layer authentication system is in place. User authentication uses `passport-local` with `bcrypt` for secure account management, and sessions are stored in PostgreSQL. All API routes are protected, ensuring data isolation per user. ESPN API authentication uses user-managed S2 session tokens and SWID stored in the database, allowing personalized access to ESPN's Fantasy API.

### Shareable League Credentials (New - October 2025)
A collaborative feature allowing multiple users to access the same ESPN league without individually providing credentials:
- **League Profiles**: Central storage for unique leagues (identified by ESPN league ID + season) with metadata automatically fetched from ESPN API
- **Shared Credentials**: ESPN S2 and SWID tokens stored per league profile, enabling all members to access league data
- **User Workflows**: 
  - Join Existing League: Browse and join leagues already connected by other users
  - Connect New League: Create new shareable league profiles (league name automatically populated from ESPN API)
- **Database Schema**: Three new tables (`league_profiles`, `league_credentials`, `user_leagues`) enable many-to-many user-league relationships
- **Smart Credential Selection**: League loading endpoints prioritize shared credentials from league profiles over personal credentials
- **API Endpoints**: GET `/api/leagues/available`, POST `/api/leagues/connect`, POST `/api/leagues/:id/join`

### External Service Integrations
The primary integration is with ESPN's Fantasy Sports API v3, providing league data, player information, and statistics across multiple sports. The system handles ESPN's authentication and data transformation. It also integrates with:
- **Fantasy Pros API**: Player rankings, projections, injury data, and news across all major sports
- **The Odds API**: NFL Vegas betting lines (spreads, moneylines, over/under) for kicker streaming analysis (free tier: 500 requests/month)
- **ESPN NFL Stats API** (unofficial): Team-level statistics including general, offensive, defensive, and kicking stats (free, no authentication required)
- **ESPN Play-by-Play API**: Game-level play-by-play data used to calculate red zone statistics (attempts, TDs, FGs, TD rates) for both offensive and defensive units
- **Neon Database**: PostgreSQL hosting with connection pooling
- **Vite**: Development tooling and build system

### Red Zone Statistics Feature
The application calculates comprehensive red zone statistics (plays inside the opponent's 20-yard line) from ESPN's play-by-play data for kicker streaming analysis. Key features:
- **Offensive metrics**: Red zone attempts, touchdowns, field goals, and TD rate
- **Defensive metrics**: Opponent red zone attempts, touchdowns allowed, field goals allowed, and opponent TD rate
- **Per-game processing**: Prevents drive state bleed between games and ensures accurate statistics
- **Parallel fetching**: Efficiently processes 100+ plays per game across multiple games per week
- **Drive tracking**: Continues tracking red zone drives even when the offense exits the red zone, capturing field goals kicked from outside (e.g., team reaches 10-yard line, then kicks 27-yard FG from 17-yard line)
- **Database integration**: Merges calculated stats with existing team statistics in the nflTeamStats table

### Kicker Streaming Feature (New - October 2025)
A comprehensive waiver wire analysis tool that ranks NFL kickers by matchup quality for fantasy football streaming. The feature combines multiple data sources to generate actionable recommendations:
- **Scoring Algorithm** (0-100 point scale):
  - Dome Advantage (0-30 pts): Prioritizes kickers in dome or retractable roof stadiums for weather-protected conditions
  - Vegas Matchup (0-30 pts): Favors underdogs (+15 pts) and high over/under totals (47+: 15 pts) for increased FG opportunities
  - Red Zone Efficiency (0-25 pts): Targets teams with low TD conversion rates that stall in the red zone
  - Opponent Defense (0-15 pts): Considers defensive red zone TD rates that force more field goal attempts
- **User Interface**: Weekly rankings with visual indicators (dome, underdog, high totals), score breakdowns, projections, and "Find in ESPN" links
- **Data Pipeline**: Integrates stadium data, Vegas odds (The Odds API), and red zone statistics from play-by-play analysis
- **Location**: `/streaming` page with week selector (1-18) and comprehensive "How It Works" instructional section
- **Limitation**: Read-only ESPN API means users must manually add recommended kickers via ESPN Fantasy interface

### Jobs Page (Improved - October 2025)
The Jobs page provides automated data refresh workflows with visual progress tracking:
- **Sequential Execution**: Single "Refresh All" button per data category runs jobs in the correct order automatically
- **Visual Progress**: Real-time progress bar and step-by-step status indicators show which job is currently running
- **Status Icons**: Pending (circle) → Running (spinner) → Completed (checkmark) or Error (alert) states for each step
- **NFL Kicker Streaming Pipeline**: Automatically runs 4 jobs in sequence: Load Stadium Data → Refresh Vegas Odds → Refresh Team Stats → Calculate Red Zone Stats
- **Fantasy Pros Pipeline**: Automatically refreshes player data, rankings, projections, and news in correct order
- **User Experience**: Eliminates need for manual job sequencing, prevents errors from running jobs out of order, provides clear feedback on progress

## External Dependencies

-   **Database**: PostgreSQL via Neon Database (`@neondatabase/serverless`)
-   **ORM**: Drizzle ORM
-   **Frontend Framework**: React 18 with TypeScript
-   **Backend Framework**: Express.js
-   **Authentication**: Passport.js (`passport-local`), `bcrypt`
-   **Session Management**: `express-session` with `connect-pg-simple`
-   **State Management**: TanStack React Query
-   **UI Components**: Radix UI, shadcn/ui
-   **Styling**: Tailwind CSS
-   **Routing**: Wouter
-   **Form Handling**: React Hook Form with Zod
-   **Build Tools**: Vite
-   **External APIs**: 
    -   ESPN Fantasy Sports API v3
    -   Fantasy Pros API (player data, rankings, projections)
    -   The Odds API (NFL betting lines)
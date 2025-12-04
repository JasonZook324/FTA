# ESPN Fantasy API Manager

## Overview
This is a full-stack web application for managing and visualizing ESPN Fantasy Sports data across NFL, NBA, NHL, and MLB. It allows users to authenticate with ESPN, import and manage fantasy leagues, and access detailed analytics like standings, rosters, matchups, and player information. The project aims to provide a modern, comprehensive interface to ESPN's Fantasy API, offering in-depth data insights, multi-user authentication, and data isolation for personalized management of fantasy sports data.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a React 18 application with TypeScript, built with a component-based architecture. It uses Radix UI primitives and shadcn/ui for consistent design, Wouter for routing, and Tailwind CSS for styling. A global team selector in the league header ensures consistent team context across the application, replacing page-level selectors and displaying instructional empty states when no team is selected. Team names use robust fallback logic for consistent display.

### Technical Implementations
- **Frontend**: React 18, TypeScript, TanStack React Query for server state management.
- **Backend**: Express.js with TypeScript, RESTful API design, service layer for ESPN API communication, and middleware for logging and error handling.
- **Data Storage**: Neon PostgreSQL via Drizzle ORM.
- **Authentication**: `passport-local` with `bcrypt` for user accounts, PostgreSQL for session storage. ESPN API authentication uses user-managed S2 session tokens and SWID.
- **Role-Based Access Control**: Four user roles (Standard, Paid, Developer, Administrator) restrict access to specific features like AI Recommendations, Trade Analyzer, Streaming, Matchups, Jobs, and API Playground.
- **Shareable League Credentials**: Allows multiple users to access the same ESPN league data through shared credentials stored in League Profiles. This involves new database tables (`league_profiles`, `league_credentials`, `user_leagues`) and API endpoints for connecting and joining leagues.
- **Red Zone Statistics**: Calculates offensive and defensive red zone metrics from ESPN play-by-play data, including attempts, touchdowns, field goals, and TD rates, integrated into team statistics.
- **Kicker Streaming**: A waiver wire analysis tool ranking NFL kickers based on matchup quality using a scoring algorithm that considers dome advantage, Vegas matchup data, red zone efficiency, and opponent defense.
- **Jobs Page**: Provides automated, sequential data refresh workflows with visual progress tracking for tasks like refreshing NFL Kicker Streaming data and Fantasy Pros data.
- **AI Prompt Builder**: Generates customizable prompts for AI assistants, including league settings, team rosters, waiver wire players, matchups, and standings. It automatically enriches player listings with injury status, news headlines, and optional rankings/projections.
- **OpenAI Integration**: Allows direct submission of generated prompts to OpenAI's API for in-app AI analysis, with model selection (GPT-4 Turbo, GPT-4, GPT-3.5 Turbo), request tracking, and robust error handling.
- **Unified Player Data System**: Consolidates ESPN and FantasyPros player data into a single player object. This system includes `espn_player_data`, `fp_player_data`, `defense_vs_position_stats`, `player_crosswalk` tables, and a `players_master` materialized view. It also calculates OPRK (Opponent Rank) for NFL defenses.

## External Dependencies

-   **Database**: Neon PostgreSQL (`@neondatabase/serverless`)
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
    -   OpenAI API (AI-powered fantasy analysis)
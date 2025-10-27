# ESPN Fantasy API Manager

## Overview

This is a full-stack web application designed to manage and visualize ESPN Fantasy Sports data. It enables users to authenticate with ESPN, import and manage fantasy leagues across various sports (NFL, NBA, NHL, MLB), and access detailed analytics including standings, rosters, matchups, and player information. The project aims to provide a modern, comprehensive interface to ESPN's Fantasy API, enhancing user experience and offering in-depth data insights. It supports multi-user authentication and data isolation, allowing personalized management of fantasy sports data.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is a React 18 application with TypeScript, utilizing a component-based architecture. It uses Radix UI primitives and shadcn/ui for a consistent and accessible design, Wouter for routing, and TanStack React Query for server state management. Styling is handled with Tailwind CSS.

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
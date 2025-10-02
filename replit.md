# ESPN Fantasy API Manager

## Overview

This is a full-stack web application that provides a comprehensive interface for managing and viewing ESPN Fantasy Sports data. The application allows users to authenticate with their ESPN credentials, import and manage multiple fantasy leagues across different sports (NFL, NBA, NHL, MLB), and view detailed analytics including standings, rosters, matchups, and player information.

The system acts as a bridge between ESPN's Fantasy API and users, providing a clean, modern interface built with React and TypeScript on the frontend, Express.js on the backend, and PostgreSQL for data persistence.

## Recent Changes

**October 2, 2025** - Multi-User Authentication System Implementation
- Implemented complete username/password authentication system using passport-local strategy
- Replaced hardcoded "default-user" with session-based authentication for true multi-user support
- Users can now register accounts, login, and manage their own ESPN credentials and leagues
- All 26 API routes protected with requireAuth middleware - data completely isolated per user
- Database schema updated with foreign key constraints (users → espnCredentials, leagues) with ON DELETE CASCADE
- Password security: bcrypt hashing with 10 salt rounds (replaced initial scrypt implementation)
- Session management: PostgreSQL-backed session store with 7-day cookie expiration
- Frontend: useAuth hook, AuthProvider context, ProtectedRoute wrapper, and authentication page at /auth
- Sidebar now shows logged-in username and includes logout button with user context
- Application now portable - can deploy anywhere (not tied to Replit Auth infrastructure)
- End-to-end tested: registration, login, logout, protected route access, and session persistence

**September 30, 2025** - Mobile Responsiveness Improvements
- Fixed main layout overflow issue by removing h-screen overflow-hidden and implementing min-h-screen with scrollable main content area
- Redesigned league header to be fully responsive - stacks vertically on small screens with full-width buttons
- Implemented 44px minimum touch targets for all interactive elements (buttons, inputs, links)
- Added responsive typography and spacing adjustments for mobile devices
- Enhanced page headers (standings, rosters, etc.) to stack content on small screens
- Added iOS-specific fixes (16px input font size to prevent zoom, proper touch targets)
- All screen elements now visible and accessible on mobile devices

**September 30, 2025** - Enhanced Generate Analysis Prompt Feature
- Updated the Generate Analysis Prompt to use real ESPN API data instead of mock data
- Integrated live team roster data (starters/bench/injured reserve) using TeamContext for selected team
- Added waiver wire player data with projections and ownership percentages (top 50 available players)
- Implemented plain text prompt generation that requests AI to respond with user-friendly formatting
- Frontend displays plain text prompts in scrollable pre element with copy-to-clipboard functionality
- Backend helper functions (getNFLTeamName, getPositionNameLocal, getProjectedPoints, getInjuryStatus, getLineupSlotName) defined locally to handle ESPN data transformation
- Prompt includes comprehensive league information, team roster details with lineup slot assignments (QB, RB, WR, TE, FLEX, D/ST, K, Bench, I.R.), waiver wire data, and instructions for AI to format response with headers, bullet points, tables, and emojis
- Each player in the roster now shows their actual lineup slot position (e.g., [FLEX] David Montgomery) rather than just their player position, enabling better analysis and recommendations

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client-side application is built using React 18 with TypeScript, implementing a component-based architecture with modern React patterns. The UI framework leverages Radix UI primitives with shadcn/ui components for consistent, accessible design. The application uses Wouter for client-side routing and TanStack React Query for efficient server state management and caching.

The component structure follows a clear separation of concerns with reusable UI components, page-specific components, and shared utilities. The styling is handled through Tailwind CSS with a custom design system including CSS variables for theming and consistent spacing.

### Backend Architecture
The server is built on Express.js with TypeScript, following a RESTful API design pattern. The application implements a service layer architecture where the ESPN API service handles all external API communications with ESPN's Fantasy Sports endpoints. The routing layer is cleanly separated with dedicated route handlers for different resources (users, leagues, credentials, etc.).

The backend includes middleware for request logging, error handling, and development-specific features like Vite integration for hot module replacement during development.

### Data Storage Solutions
The application uses PostgreSQL as the primary database with Drizzle ORM for type-safe database operations and migrations. The database schema includes tables for users, ESPN credentials, leagues, teams, matchups, and players with proper foreign key relationships.

For development flexibility, the system includes an in-memory storage implementation that mirrors the database interface, allowing for rapid prototyping and testing without database dependencies.

### Authentication and Authorization
The application implements a dual-layer authentication system:

**User Authentication**: Uses passport-local strategy with bcrypt-hashed passwords for secure user account management. Sessions are stored in PostgreSQL with connect-pg-simple, providing persistent login state across server restarts. All API routes are protected with requireAuth middleware that verifies session authentication before processing requests.

**ESPN API Authentication**: Once logged in, users manage their own ESPN credentials (S2 session tokens and SWID) which are stored per-user in the database. These credentials authenticate requests to ESPN's Fantasy API and are validated to ensure they remain active.

This architecture provides complete data isolation between users - each user can only access their own ESPN credentials, leagues, and team data.

### External Service Integrations
The primary external integration is with ESPN's Fantasy Sports API v3, which provides access to league data, player information, matchups, and statistics. The ESPN API service includes comprehensive support for different sports (football, basketball, hockey, baseball) and various data views (team info, rosters, matchups, settings, standings).

The system handles ESPN's authentication requirements, rate limiting considerations, and data transformation from ESPN's API format to the application's internal data models. The integration supports real-time data fetching and periodic updates to keep league information current.

The application also integrates with Neon Database for PostgreSQL hosting and includes development tooling integrations with Vite for fast development builds and hot reloading.

## External Dependencies

- **Database**: PostgreSQL via Neon Database (@neondatabase/serverless)
- **ORM**: Drizzle ORM with PostgreSQL dialect for type-safe database operations
- **Frontend Framework**: React 18 with TypeScript for component-based UI
- **Backend Framework**: Express.js for RESTful API server
- **Authentication**: Passport.js with passport-local strategy and bcrypt for password hashing
- **Session Management**: express-session with connect-pg-simple PostgreSQL store
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with custom design system
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation
- **Build Tools**: Vite for fast development and optimized production builds
- **External API**: ESPN Fantasy Sports API v3 for league and player data
- **Development Tools**: Replit-specific plugins for development environment integration
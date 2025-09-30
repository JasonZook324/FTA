# ESPN Fantasy API Manager

## Overview

This is a full-stack web application that provides a comprehensive interface for managing and viewing ESPN Fantasy Sports data. The application allows users to authenticate with their ESPN credentials, import and manage multiple fantasy leagues across different sports (NFL, NBA, NHL, MLB), and view detailed analytics including standings, rosters, matchups, and player information.

The system acts as a bridge between ESPN's Fantasy API and users, providing a clean, modern interface built with React and TypeScript on the frontend, Express.js on the backend, and PostgreSQL for data persistence.

## Recent Changes

**September 30, 2025** - Enhanced Generate Analysis Prompt Feature
- Updated the Generate Analysis Prompt to use real ESPN API data instead of mock data
- Integrated live team roster data (starters/bench/injured reserve) using TeamContext for selected team
- Added waiver wire player data with projections and ownership percentages (top 20 available players)
- Implemented HTML-formatted prompt generation with styled tables and color-coded sections
- Frontend now displays HTML prompts in iframe with full copy-to-clipboard functionality
- Backend helper functions (getNFLTeamName, getPositionNameLocal, getProjectedPoints, getInjuryStatus) defined locally to handle ESPN data transformation

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
The system implements ESPN-specific authentication using ESPN's S2 session tokens and SWID (Sports Web ID) credentials. These credentials are securely stored and validated against ESPN's API endpoints. The application includes credential validation functionality to ensure tokens remain active and valid.

### External Service Integrations
The primary external integration is with ESPN's Fantasy Sports API v3, which provides access to league data, player information, matchups, and statistics. The ESPN API service includes comprehensive support for different sports (football, basketball, hockey, baseball) and various data views (team info, rosters, matchups, settings, standings).

The system handles ESPN's authentication requirements, rate limiting considerations, and data transformation from ESPN's API format to the application's internal data models. The integration supports real-time data fetching and periodic updates to keep league information current.

The application also integrates with Neon Database for PostgreSQL hosting and includes development tooling integrations with Vite for fast development builds and hot reloading.

## External Dependencies

- **Database**: PostgreSQL via Neon Database (@neondatabase/serverless)
- **ORM**: Drizzle ORM with PostgreSQL dialect for type-safe database operations
- **Frontend Framework**: React 18 with TypeScript for component-based UI
- **Backend Framework**: Express.js for RESTful API server
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with custom design system
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation
- **Build Tools**: Vite for fast development and optimized production builds
- **External API**: ESPN Fantasy Sports API v3 for league and player data
- **Development Tools**: Replit-specific plugins for development environment integration
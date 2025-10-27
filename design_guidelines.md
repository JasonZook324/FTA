# ESPN Fantasy Sports - Kicker Streaming Analysis Design Guidelines

## Design Approach

**Reference-Based Strategy**: Drawing inspiration from ESPN Fantasy, Yahoo Sports, and FiveThirtyEight's data-driven aesthetics. This creates a professional sports analytics feel that fantasy users immediately recognize while presenting complex data accessibly.

**Key Design Principles**:
- Data-first hierarchy: Rankings and metrics take visual priority
- Scannable information: Quick decision-making through visual indicators
- Professional analytics aesthetic: Credible, trustworthy data presentation
- Sports media energy: Dynamic without sacrificing clarity

---

## Typography System

**Font Families** (via Google Fonts CDN):
- Primary: 'Inter' - Clean, readable for data and UI elements
- Display: 'Space Grotesk' - Bold headlines and section titles
- Monospace: 'JetBrains Mono' - Statistical values and numerical data

**Type Scale**:
- Hero Title: 48px/56px, Space Grotesk, Bold (text-5xl)
- Section Headers: 32px/40px, Space Grotesk, Bold (text-3xl)
- Card Titles: 20px/28px, Inter, Semibold (text-xl)
- Body Text: 16px/24px, Inter, Regular (text-base)
- Data Labels: 14px/20px, Inter, Medium (text-sm)
- Stats/Numbers: 18px/24px, JetBrains Mono, Semibold
- Small Meta: 12px/16px, Inter, Regular (text-xs)

---

## Layout System

**Spacing Primitives**: Tailwind units of 1, 2, 4, 6, 8, 12, 16, 20
- Micro spacing (badges, icons): 1, 2
- Component padding: 4, 6, 8
- Section spacing: 12, 16, 20
- Page margins: 8, 12, 16

**Grid Structure**:
- Container: max-w-7xl with px-4 md:px-8 margins
- Dashboard Layout: 12-column grid system
- Responsive breakpoints: Mobile-first, stack to multi-column at md (768px)

---

## Page Structure

### Header Navigation
- Fixed top bar with subtle shadow on scroll
- Left: ESPN Fantasy logo with "Kicker Streamer" subtitle
- Center: Main navigation (Dashboard, Rankings, My Team, Waiver Wire, Analytics)
- Right: Week selector dropdown, user avatar, settings icon
- Height: h-16, padding px-6
- Search bar integrated into navigation on desktop, collapsible on mobile

### Dashboard Hero Section (No traditional hero image)
**Immediate Data Presentation** - Lead with value, not imagery:
- Full-width stats banner (h-32) showing: Current NFL Week, Active Waivers Count, Top Recommendation Preview
- Three-column quick stats with large numerical displays
- Each stat card includes icon, number (JetBrains Mono, large), and contextual label
- No background image - solid treatment with subtle gradient or texture pattern

### Main Content Area

**Primary Rankings Table** (largest viewport allocation):
- Sticky header row with sortable columns
- Columns: Rank, Player Name/Team, Matchup, Dome Status, Vegas Total, Red Zone %, Projection, Add Button
- Row height: h-20 for comfortable scanning
- Alternating row treatment for readability
- Visual indicators integrated into cells (not separate columns)

**Filter Sidebar** (collapsible on mobile):
- Width: w-72 on desktop, slides in on mobile
- Filter groups with expand/collapse
- Sections: Stadium Type, Vegas Odds Range, Team Stats, Availability
- Real-time filtering with visual feedback

**Secondary Widgets Grid** (below main table):
- Three-column grid (grid-cols-1 md:grid-cols-3 gap-6)
- Widget 1: "Dome Kickers This Week" - List with logos
- Widget 2: "Best Matchups" - Visual odds display
- Widget 3: "Sleeper Picks" - Under-rostered recommendations

---

## Component Library

### Player Ranking Card
- Compact horizontal layout: flex items-center
- Left section (w-16): Large rank number, JetBrains Mono
- Middle section (flex-1): Player name (bold), team abbreviation + opponent, padding py-4
- Right section: Metric badges and action button, px-4
- Border treatment on hover, not shadow
- Height: min-h-20

### Metric Badges (Visual Indicators)
- **Dome Advantage**: Rounded pill badge with roof icon (Heroicons)
- **Vegas Favorable**: Upward trend icon with odds number
- **Red Zone Elite**: Target icon with percentage
- Size: px-3 py-1, text-xs font-medium
- Icons: w-4 h-4 inline with text
- Badges group together with gap-2

### Data Visualization Cards
- Padding: p-6
- Header with title and info icon
- Body contains chart/graph area (h-64 for consistency)
- Footer with legend or data source
- Rounded corners, subtle border

### Action Buttons
- Primary (Add to Team): px-6 py-2.5, rounded-lg, font-medium
- Secondary (View Details): px-4 py-2, rounded-md
- Icon-only (More options): w-10 h-10, rounded-full
- All buttons include focus states and active states

### Comparison Panel (slide-out)
- Slides from right, width w-96
- Shows head-to-head player comparison
- Split-screen layout with vs. divider
- Close button top-right
- Stats displayed in matching rows for easy scanning

### Quick Stats Display
- Numerical emphasis: Large number (text-4xl), small label below
- Trend indicators: Small arrow icons showing up/down/neutral
- Compact footprint: Works in 3-4 column grids
- Padding: p-4 for breathing room

---

## Images Section

**No Large Hero Image**: This application leads with data, not imagery. The "hero" is the live rankings table and quick stats.

**Strategic Image Use**:
1. **Team Logos**: Small icons (w-8 h-8) next to player names throughout rankings
2. **Player Headshots**: Circular thumbnails (w-12 h-12) in detailed views only
3. **Stadium Icons**: Decorative dome/outdoor indicators (w-6 h-6) as visual metadata
4. **Empty States**: Illustration when no recommendations match filters (max-w-md, centered)
5. **Background Patterns**: Subtle grid/topographic patterns for section backgrounds (not photos)

**Placement Guidelines**:
- Keep images small and functional, never decorative
- Team logos always precede player names
- Stadium type shown as icon badge, not large image
- Charts/graphs take priority over photography

---

## Accessibility & Interaction

**Visual Hierarchy**:
- Rank numbers most prominent (largest, boldest)
- Player names second-level emphasis
- Metrics tertiary but easily scannable
- Actions clearly separated from data

**Responsive Behavior**:
- Mobile: Stack to single column, collapsible filters
- Tablet: Two-column grids, condensed table
- Desktop: Full multi-column layouts, expanded data views

**Focus Management**:
- Sticky table headers maintain context during scroll
- Filter changes update counts in real-time
- Sort indicators clearly show active column
- Loading states for async data updates

**Consistent Form Styling**:
- Input fields: h-10, px-3, rounded-md borders
- Dropdowns: Match input height, chevron icons
- Checkboxes/Radio: w-4 h-4 with labels
- All interactive elements have visible focus rings

---

## Special Features

**Live Update Indicators**: Small pulse animations on stats that change (injury updates, odds shifts)

**Comparison Mode**: Toggle to select multiple players for side-by-side analysis

**Projection Confidence**: Visual bar showing projection accuracy percentage alongside numbers

**Waiver Priority Calculator**: Inline widget showing recommended FAAB bid or priority usage

This design creates a professional, data-rich experience that fantasy users will immediately understand while providing the analytical depth serious players demand.
# Event Analytics Dashboard

## Overview

This project will implement that prompt as a small product analytics system for a ride marketplace. The dashboard will be tailored around Kamel Ride-style workflows: route searches, ride postings, booking starts, seat reservations, rider-driver messages, payments, errors, and real-user performance samples.

## Product Goals

- Collect meaningful user and system events through a clear ingestion boundary.
- Display analytics that help a product team understand marketplace health.
- Keep the implementation small enough for a take-home assignment while still showing production-oriented judgment.
- Make TypeScript do useful work through explicit domain types, validation, and pure analytics functions.
- Document tradeoffs clearly so reviewers can see what is intentionally omitted.

## Core Requirements

- A user can submit an event from the dashboard.
- Submitted events flow through an API route before appearing in analytics.
- The dashboard starts with realistic seeded data so it is useful on first load.
- Events persist locally across refreshes.
- Analytics update immediately after a new event is collected.
- The UI shows both business events and real-user performance signals.
- The codebase separates UI concerns from event modeling, validation, and analytics logic.

## Non-Goals

- No production database for this version.
- No authentication or real user accounts.
- No external charting library.
- No queue, batch processor, or event streaming infrastructure.
- No attempt to clone a full real-user-monitoring product.

These are reasonable omissions for the timebox. The architecture should leave a clean path to add them later.

## Domain Model

The primary domain object is a tracked event.

```ts
type EventType =
  | "ride_search"
  | "ride_posted"
  | "booking_started"
  | "seat_reserved"
  | "message_sent"
  | "payment_completed"
  | "error"
  | "performance";

type EventSource = "web" | "mobile" | "email" | "api";

type TrackedEvent = {
  id: string;
  type: EventType;
  userId: string;
  timestamp: string;
  source: EventSource;
  value?: number;
  metadata?: string;
};
```

`value` depends on the event type:

- `payment_completed`: fare or booking value in dollars.
- `performance`: real-user timing sample in milliseconds.
- Other events: optional, usually omitted.

`metadata` stores human-readable context for the demo, such as `Ithaca -> NYC, 2 seats available`.

## Analytics Model

Analytics will be derived from the current event list rather than stored separately.

The dashboard should compute:

- total events
- active users
- search-to-seat conversion
- seats reserved
- total booking value
- average fare
- p75 real-user performance
- event counts by type
- event counts by source
- recent events
- product insights

Product insights should be simple, deterministic observations derived from the same analytics summary:

- searches outpacing posted rides suggests supply constraints
- booking starts without reservations suggests booking friction
- message volume near reservations suggests trust-building behavior
- high error rate suggests reliability work before growth experiments
- high p75 performance suggests slow search or checkout pages may hurt conversion

## Architecture

The app will use Next.js App Router with a small client dashboard and one API route.

Planned structure:

```txt
src/
  app/
    api/
      events/
        route.ts
    layout.tsx
    page.tsx
  lib/
    events/
      analytics.ts
      seed-events.ts
      types.ts
      validation.ts
```

Responsibilities:

- `src/app/page.tsx`: interactive dashboard, form state, persistence, rendering.
- `src/app/api/events/route.ts`: event ingestion endpoint.
- `src/lib/events/types.ts`: domain and API response types.
- `src/lib/events/validation.ts`: validate and normalize event input.
- `src/lib/events/analytics.ts`: pure analytics and insight functions.
- `src/lib/events/seed-events.ts`: realistic demo events.

## Event Ingestion Flow

1. The dashboard form collects event input.
2. The client submits the payload to `POST /api/events`.
3. The API validates the event type, source, user ID, and optional value.
4. The API returns a normalized `TrackedEvent` with `id` and `timestamp`.
5. The client appends the event to local state.
6. The event list is saved to `localStorage`.
7. Derived analytics recompute from the updated event list.

The API route should also return a `Server-Timing` header so the UI can show that the event passed through an ingestion boundary and expose basic collection latency.

## Persistence Strategy

For this take-home version, persistence will use `localStorage`.

Why:

- it keeps the demo reliable without setup
- it supports refresh persistence
- it avoids spending time on database scaffolding
- the API route still demonstrates a backend boundary

Production path:

- replace local state persistence with database-backed `GET /api/events`
- keep `POST /api/events` as the ingestion endpoint
- add pagination and date filtering
- add server-side aggregation for large datasets

## UI Plan

The first screen should be the dashboard, not a landing page. The app should feel like an operational tool a product team could keep open while watching marketplace behavior.

Application shell:

- fixed header, full width, 64px tall
- fixed left sidebar, 240px wide
- fluid main content area with vertical scrolling
- sidebar collapses below 768px
- main content should never scroll the whole page behind the fixed navigation

Visual style:

- clean operational dashboard
- structured shell layout instead of a marketing-style page
- dense but readable information
- cards are acceptable for KPI modules, but the overall page should not be a loose card stack
- no decorative hero section
- no external chart library for v1

Main content sections:

1. Page title and action buttons.
2. KPI row with four equal-width cards.
3. Chart grid with two columns: trend line chart and event/source bar chart.
4. Full-width data table with pagination.
5. Event collection form in a side panel, drawer, or compact section reachable from the action row.

Responsive behavior:

- below 768px, collapse the sidebar into a compact top control or hidden drawer
- KPI cards stack vertically or in a two-column grid depending on available width
- chart grid becomes one column
- table remains horizontally scrollable if needed

## Implementation Plan

1. Replace the starter page with a typed client dashboard.
2. Add domain types and realistic Kamel Ride-style seed events.
3. Extract analytics functions into a pure library module.
4. Add `POST /api/events` for validation and event normalization.
5. Wire the dashboard form through the API route.
6. Persist collected events in `localStorage`.
7. Build the fixed header/sidebar dashboard shell.
8. Add KPI modules, chart grid, paginated table, and event collection flow.
9. Add product insights and performance timing display.
10. Update project metadata and final README notes.
11. Run lint/build and do a manual UX pass.

## Testing Plan

Required verification:

```bash
pnpm lint
pnpm build
```

Manual acceptance checks:

- seeded events appear on first load
- adding an event updates KPI cards, charts, table, and insights
- invalid payloads are rejected by the API
- refresh preserves locally collected events
- reset restores seeded data
- performance events display milliseconds, not dollars
- payment events display dollars
- fixed header and sidebar do not overlap main content
- sidebar collapses below 768px
- KPI cards stack or reflow cleanly on mobile
- charts reflow from two columns to one column on mobile
- table pagination works and remains readable

Optional follow-up:

- add unit tests for validation
- add unit tests for analytics summaries
- add API route tests for valid and invalid payloads

## Production Considerations

If this moved beyond a take-home:

- Store raw events in a database or event pipeline.
- Add authentication and derive user IDs from session data.
- Batch client events and retry failed submissions.
- Add schema validation with a dedicated library.
- Aggregate analytics server-side for larger datasets.
- Add time windows, route filters, and campus filters.
- Track real browser metrics with `PerformanceObserver`.
- Add observability around event ingestion failures.

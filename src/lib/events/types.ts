export type EventType =
  | "ride_search"
  | "ride_posted"
  | "booking_started"
  | "seat_reserved"
  | "message_sent"
  | "payment_completed"
  | "error"
  | "performance";

export type EventSource = "web" | "mobile" | "email" | "api";

export type TrackedEvent = {
  id: string;
  type: EventType;
  userId: string;
  timestamp: string;
  source: EventSource;
  value?: number;
  metadata?: string;
};

export type EventCollectionInput = {
  type: EventType;
  userId: string;
  source: EventSource;
  value?: number;
  metadata?: string;
};

export type EventCollectionResponse = {
  event: TrackedEvent;
};

export type EventFormState = {
  type: EventType;
  userId: string;
  source: EventSource;
  value: string;
  metadata: string;
};

export type AnalyticsSummary = {
  totalEvents: number;
  activeUsers: number;
  searchToSeatRate: number;
  seatsReserved: number;
  totalBookingValue: number;
  averageFare: number;
  p75PerformanceMs: number;
  performanceSampleCount: number;
  errorRate: number;
  topEventType: EventType | "none";
  eventCounts: Record<EventType, number>;
  sourceCounts: Record<EventSource, number>;
  recentEvents: TrackedEvent[];
  trend: Array<{
    label: string;
    searches: number;
    reservations: number;
  }>;
};

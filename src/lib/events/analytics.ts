import type {
  AnalyticsSummary,
  EventSource,
  EventType,
  TrackedEvent,
} from "./types";

export const EVENT_TYPES: EventType[] = [
  "ride_search",
  "ride_posted",
  "booking_started",
  "seat_reserved",
  "message_sent",
  "payment_completed",
  "error",
  "performance",
];

export const EVENT_SOURCES: EventSource[] = ["web", "mobile", "email", "api"];

const EMPTY_EVENT_COUNTS = EVENT_TYPES.reduce(
  (counts, type) => ({ ...counts, [type]: 0 }),
  {} as Record<EventType, number>,
);

const EMPTY_SOURCE_COUNTS = EVENT_SOURCES.reduce(
  (counts, source) => ({ ...counts, [source]: 0 }),
  {} as Record<EventSource, number>,
);

export function getAnalyticsSummary(events: TrackedEvent[]): AnalyticsSummary {
  const eventCounts = { ...EMPTY_EVENT_COUNTS };
  const sourceCounts = { ...EMPTY_SOURCE_COUNTS };
  const users = new Set<string>();
  const performanceValues: number[] = [];
  let totalBookingValue = 0;
  let fareEventCount = 0;

  for (const event of events) {
    eventCounts[event.type] += 1;
    sourceCounts[event.source] += 1;
    users.add(event.userId);

    if (typeof event.value === "number") {
      if (event.type === "performance") {
        performanceValues.push(event.value);
      }

      if (event.type === "payment_completed") {
        totalBookingValue += event.value;
        fareEventCount += 1;
      }
    }
  }

  const totalEvents = events.length;
  const searchCount = eventCounts.ride_search;
  const seatsReserved = eventCounts.seat_reserved;

  return {
    totalEvents,
    activeUsers: users.size,
    searchToSeatRate: searchCount === 0 ? 0 : (seatsReserved / searchCount) * 100,
    seatsReserved,
    totalBookingValue,
    averageFare: fareEventCount === 0 ? 0 : totalBookingValue / fareEventCount,
    p75PerformanceMs: getPercentile(performanceValues, 75),
    performanceSampleCount: performanceValues.length,
    errorRate: totalEvents === 0 ? 0 : (eventCounts.error / totalEvents) * 100,
    topEventType: getTopEventType(eventCounts, totalEvents),
    eventCounts,
    sourceCounts,
    recentEvents: [...events]
      .sort(
        (first, second) =>
          new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime(),
      )
      .slice(0, 10),
    trend: getTrend(events),
  };
}

export function getProductInsights(
  summary: AnalyticsSummary,
  formatPercent: (value: number) => string,
) {
  const insights: string[] = [];
  const searches = summary.eventCounts.ride_search;
  const ridePosts = summary.eventCounts.ride_posted;
  const bookingStarts = summary.eventCounts.booking_started;
  const messages = summary.eventCounts.message_sent;

  if (searches > ridePosts * 2) {
    insights.push(
      "Search demand is outpacing posted ride supply. Help drivers publish seats faster on high-demand routes.",
    );
  } else {
    insights.push(
      "Posted ride supply is keeping up with search demand, a healthy sign for planned student travel.",
    );
  }

  if (summary.searchToSeatRate >= 35) {
    insights.push(
      `Search-to-seat conversion is strong at ${formatPercent(
        summary.searchToSeatRate,
      )}. Study the routes that convert best and repeat that flow for new campuses.`,
    );
  } else if (summary.searchToSeatRate > 0) {
    insights.push(
      `Search-to-seat conversion is ${formatPercent(
        summary.searchToSeatRate,
      )}. Inspect drop-off between route search, booking start, and reservation confirmation.`,
    );
  } else {
    insights.push(
      "Searches have not converted into reserved seats yet. Instrument unavailable routes and booking friction next.",
    );
  }

  if (messages >= summary.seatsReserved && bookingStarts > 0) {
    insights.push(
      "Messaging is at least as active as reservations, suggesting trust-building chat matters before students share a ride.",
    );
  }

  if (summary.errorRate >= 12) {
    insights.push(
      `Errors are ${formatPercent(
        summary.errorRate,
      )} of tracked activity. Reliability work should come before marketplace growth experiments.`,
    );
  }

  if (summary.performanceSampleCount > 0 && summary.p75PerformanceMs > 2500) {
    insights.push(
      `p75 real-user performance is ${summary.p75PerformanceMs.toFixed(
        0,
      )} ms. Slow search or checkout pages may hide route demand.`,
    );
  }

  return insights;
}

function getTopEventType(
  counts: Record<EventType, number>,
  totalEvents: number,
): EventType | "none" {
  if (totalEvents === 0) {
    return "none";
  }

  return EVENT_TYPES.reduce((topType, type) =>
    counts[type] > counts[topType] ? type : topType,
  );
}

function getPercentile(values: number[], percentile: number) {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((first, second) => first - second);
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;

  return sortedValues[Math.max(0, index)];
}

function getTrend(events: TrackedEvent[]) {
  const sortedEvents = [...events].sort(
    (first, second) =>
      new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime(),
  );
  const buckets = sortedEvents.slice(-8).map((event, index) => ({
    label: `${index + 1}`,
    searches: event.type === "ride_search" ? 1 : 0,
    reservations: event.type === "seat_reserved" ? 1 : 0,
  }));

  return buckets.length > 0 ? buckets : [{ label: "1", searches: 0, reservations: 0 }];
}

"use client";

import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import {
  EVENT_SOURCES,
  EVENT_TYPES,
  getAnalyticsSummary,
  getProductInsights,
} from "@/lib/events/analytics";
import { SEED_EVENTS } from "@/lib/events/seed-events";
import type {
  EventCollectionInput,
  EventCollectionResponse,
  EventFormState,
  EventSource,
  EventType,
  TrackedEvent,
} from "@/lib/events/types";

const STORAGE_KEY = "kamel-ride-analytics-events";
const STORAGE_CHANGE_EVENT = "kamel-ride-events-changed";
const PAGE_SIZE = 8;
let cachedStoredValue: string | null = null;
let cachedStoredEvents = SEED_EVENTS;

const EVENT_LABELS: Record<EventType, string> = {
  ride_search: "Ride search",
  ride_posted: "Ride posted",
  booking_started: "Booking started",
  seat_reserved: "Seat reserved",
  message_sent: "Message sent",
  payment_completed: "Payment completed",
  error: "Error",
  performance: "Performance",
};

const SOURCE_LABELS: Record<EventSource, string> = {
  web: "Web",
  mobile: "Mobile",
  email: "Email",
  api: "API",
};

const initialFormState: EventFormState = {
  type: "ride_search",
  userId: "",
  source: "web",
  value: "",
  metadata: "",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDuration(value: number) {
  return value === 0 ? "No samples" : `${value.toFixed(0)} ms`;
}

function formatDateTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatEventValue(event: TrackedEvent) {
  if (event.value === undefined) {
    return "-";
  }

  if (event.type === "performance") {
    return formatDuration(event.value);
  }

  if (event.type === "payment_completed") {
    return formatCurrency(event.value);
  }

  return event.value.toString();
}

function parseStoredEvents(value: string | null) {
  if (!value) {
    return SEED_EVENTS;
  }

  try {
    const parsed = JSON.parse(value) as TrackedEvent[];
    if (!Array.isArray(parsed)) {
      return SEED_EVENTS;
    }

    const supportedEvents = parsed.filter(isSupportedStoredEvent);
    return supportedEvents.length > 0 ? supportedEvents : SEED_EVENTS;
  } catch {
    return SEED_EVENTS;
  }
}

function getSeedEventsSnapshot() {
  return SEED_EVENTS;
}

function getStoredEventsSnapshot() {
  const storedValue = localStorage.getItem(STORAGE_KEY);

  if (storedValue === cachedStoredValue) {
    return cachedStoredEvents;
  }

  cachedStoredValue = storedValue;
  cachedStoredEvents = parseStoredEvents(storedValue);

  return cachedStoredEvents;
}

function subscribeToStoredEvents(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORAGE_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORAGE_CHANGE_EVENT, onStoreChange);
  };
}

function writeStoredEvents(events: TrackedEvent[]) {
  const storedValue = JSON.stringify(events);
  cachedStoredValue = storedValue;
  cachedStoredEvents = events;
  localStorage.setItem(STORAGE_KEY, storedValue);
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

function isSupportedStoredEvent(event: TrackedEvent) {
  return (
    EVENT_TYPES.includes(event.type) && EVENT_SOURCES.includes(event.source)
  );
}

function getCollectionApiTiming(serverTimingHeader: string | null) {
  const totalTiming = serverTimingHeader
    ?.split(",")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("total;dur="));
  const totalDuration = totalTiming?.split("total;dur=").at(1);

  if (totalDuration) {
    return `Collection API accepted event in ${Number(totalDuration).toFixed(1)} ms`;
  }

  return "Collection API accepted event.";
}

export default function Home() {
  const events = useSyncExternalStore(
    subscribeToStoredEvents,
    getStoredEventsSnapshot,
    getSeedEventsSnapshot,
  );
  const [formState, setFormState] = useState<EventFormState>(initialFormState);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [collectionStatus, setCollectionStatus] = useState("");

  const summary = useMemo(() => getAnalyticsSummary(events), [events]);
  const insights = useMemo(
    () => getProductInsights(summary, formatPercent),
    [summary],
  );
  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (first, second) =>
          new Date(second.timestamp).getTime() -
          new Date(first.timestamp).getTime(),
      ),
    [events],
  );
  const pageCount = Math.max(1, Math.ceil(sortedEvents.length / PAGE_SIZE));
  const visibleEvents = sortedEvents.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const largestEventCount = Math.max(1, ...Object.values(summary.eventCounts));
  const largestSourceCount = Math.max(
    1,
    ...Object.values(summary.sourceCounts),
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedUserId = formState.userId.trim();
    const trimmedMetadata = formState.metadata.trim();
    const parsedValue =
      formState.value === "" ? undefined : Number(formState.value);

    if (!trimmedUserId) {
      setFormError("User ID is required.");
      return;
    }

    if (
      parsedValue !== undefined &&
      (Number.isNaN(parsedValue) || parsedValue < 0)
    ) {
      setFormError("Value must be a positive number.");
      return;
    }

    const eventInput: EventCollectionInput = {
      type: formState.type,
      userId: trimmedUserId,
      source: formState.source,
      ...(parsedValue !== undefined ? { value: parsedValue } : {}),
      ...(trimmedMetadata ? { metadata: trimmedMetadata } : {}),
    };

    setIsSubmitting(true);
    setFormError("");

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventInput),
      });
      const data = (await response.json()) as
        | EventCollectionResponse
        | { error?: string };

      if (!response.ok || !("event" in data)) {
        const errorMessage = "error" in data ? data.error : undefined;
        setFormError(errorMessage || "The collection API rejected this event.");
        return;
      }

      writeStoredEvents([data.event, ...events]);
      setFormState({ ...initialFormState, userId: trimmedUserId });
      setCurrentPage(1);
      setCollectionStatus(
        getCollectionApiTiming(response.headers.get("Server-Timing")),
      );
    } catch {
      setFormError("Unable to reach the collection API. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetDemoData() {
    writeStoredEvents(SEED_EVENTS);
    setCurrentPage(1);
    setFormError("");
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center border-b border-slate-200 bg-white px-4 shadow-sm md:px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-700 text-sm font-bold text-white">
          KR
        </div>
        <div className="ml-3">
          <p className="text-sm font-semibold text-slate-950">
            Kamel Ride Analytics
          </p>
          <p className="hidden text-xs text-slate-500 sm:block">
            Marketplace events and real-user experience
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
          >
            Collect event
          </button>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-16 z-20 hidden w-60 border-r border-slate-200 bg-white px-4 py-5 md:block">
        <nav className="space-y-1 text-sm">
          {["Overview", "Marketplace", "Performance", "Events"].map((item) => (
            <a
              key={item}
              href="#dashboard"
              className="block rounded-md px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
            >
              {item}
            </a>
          ))}
        </nav>
        <div className="mt-8 border-t border-slate-200 pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Health
          </p>
          <p className="mt-3 text-sm text-slate-600">
            {summary.totalEvents} events across {summary.activeUsers} users.
          </p>
        </div>
      </aside>

      <main id="dashboard" className="h-screen overflow-y-auto pt-16 md:pl-60">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
                Dashboard
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">
                Ride marketplace overview
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={resetDemoData}
                className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Reset data
              </button>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                New event
              </button>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Active users"
              value={summary.activeUsers.toString()}
            />
            <MetricCard
              label="Search to seat"
              value={formatPercent(summary.searchToSeatRate)}
            />
            <MetricCard
              label="Seats reserved"
              value={summary.seatsReserved.toString()}
            />
            <MetricCard
              label="p75 experience"
              value={formatDuration(summary.p75PerformanceMs)}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Panel title="Search and reservation trend">
              <LineChart data={summary.trend} />
            </Panel>
            <Panel title="Event distribution">
              <div className="space-y-4">
                {EVENT_TYPES.map((type) => (
                  <BarRow
                    key={type}
                    label={EVENT_LABELS[type]}
                    value={summary.eventCounts[type]}
                    maxValue={largestEventCount}
                  />
                ))}
              </div>
            </Panel>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Panel title="Event log">
              <EventTable events={visibleEvents} />
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Page {currentPage} of {pageCount}. Showing{" "}
                  {visibleEvents.length} of {sortedEvents.length} events.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={currentPage === pageCount}
                    onClick={() =>
                      setCurrentPage((page) => Math.min(pageCount, page + 1))
                    }
                    className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </Panel>

            <div className="space-y-6">
              <Panel title="Product insights">
                <div className="space-y-3">
                  {insights.map((insight) => (
                    <p
                      key={insight}
                      className="rounded-md border border-teal-100 bg-teal-50 px-3 py-3 text-sm leading-6 text-slate-700"
                    >
                      {insight}
                    </p>
                  ))}
                </div>
              </Panel>

              <Panel title="Sources">
                <div className="space-y-4">
                  {EVENT_SOURCES.map((source) => (
                    <BarRow
                      key={source}
                      label={SOURCE_LABELS[source]}
                      value={summary.sourceCounts[source]}
                      maxValue={largestSourceCount}
                    />
                  ))}
                </div>
              </Panel>
            </div>
          </section>
        </div>
      </main>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close event drawer"
            className="absolute inset-0 bg-slate-950/30"
            onClick={() => setIsDrawerOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Collect event
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Submit through the event ingestion API.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="h-9 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700"
              >
                Close
              </button>
            </div>

            <EventForm
              formState={formState}
              formError={formError}
              collectionStatus={collectionStatus}
              isSubmitting={isSubmitting}
              onSubmit={handleSubmit}
              onChange={setFormState}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-normal text-slate-950">
        {value}
      </p>
    </article>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function BarRow({
  label,
  value,
  maxValue,
}: {
  label: string;
  value: number;
  maxValue: number;
}) {
  const width = `${Math.max(3, (value / maxValue) * 100)}%`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-mono text-xs text-slate-500">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-600 transition-all"
          style={{ width }}
        />
      </div>
    </div>
  );
}

function LineChart({
  data,
}: {
  data: Array<{ label: string; searches: number; reservations: number }>;
}) {
  const maxValue = Math.max(
    1,
    ...data.flatMap((point) => [point.searches, point.reservations]),
  );
  const chartWidth = 640;
  const chartHeight = 220;
  const padding = 28;
  const searchPoints = data.map((point, index) =>
    getPoint(
      index,
      point.searches,
      data.length,
      maxValue,
      chartWidth,
      chartHeight,
      padding,
    ),
  );
  const reservationPoints = data.map((point, index) =>
    getPoint(
      index,
      point.reservations,
      data.length,
      maxValue,
      chartWidth,
      chartHeight,
      padding,
    ),
  );

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="min-h-[220px] w-full min-w-[480px]"
        role="img"
        aria-label="Search and reservation trend"
      >
        <line
          x1={padding}
          x2={chartWidth - padding}
          y1={chartHeight - padding}
          y2={chartHeight - padding}
          stroke="#cbd5e1"
        />
        <polyline
          fill="none"
          stroke="#0f766e"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={searchPoints.join(" ")}
        />
        <polyline
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={reservationPoints.join(" ")}
        />
        {data.map((point, index) => {
          const x =
            padding +
            (index / Math.max(1, data.length - 1)) * (chartWidth - padding * 2);
          return (
            <text
              key={point.label}
              x={x}
              y={chartHeight - 6}
              textAnchor="middle"
              className="fill-slate-500 text-[11px]"
            >
              {point.label}
            </text>
          );
        })}
      </svg>
      <div className="mt-3 flex gap-4 text-sm text-slate-600">
        <span>
          <span className="mr-2 inline-block h-2 w-5 rounded-full bg-teal-700" />
          Searches
        </span>
        <span>
          <span className="mr-2 inline-block h-2 w-5 rounded-full bg-blue-700" />
          Reservations
        </span>
      </div>
    </div>
  );
}

function getPoint(
  index: number,
  value: number,
  length: number,
  maxValue: number,
  width: number,
  height: number,
  padding: number,
) {
  const x = padding + (index / Math.max(1, length - 1)) * (width - padding * 2);
  const y = height - padding - (value / maxValue) * (height - padding * 2);

  return `${x},${y}`;
}

function EventTable({ events }: { events: TrackedEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.12em] text-slate-500">
            <th className="py-3 pr-4 font-semibold">Event</th>
            <th className="py-3 pr-4 font-semibold">User</th>
            <th className="py-3 pr-4 font-semibold">Source</th>
            <th className="py-3 pr-4 font-semibold">Value</th>
            <th className="py-3 font-semibold">Time</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-b border-slate-100">
              <td className="py-3 pr-4">
                <div className="font-medium text-slate-800">
                  {EVENT_LABELS[event.type]}
                </div>
                <div className="max-w-[280px] truncate text-xs text-slate-500">
                  {event.metadata || "No metadata"}
                </div>
              </td>
              <td className="py-3 pr-4 font-mono text-xs text-slate-600">
                {event.userId}
              </td>
              <td className="py-3 pr-4 text-slate-600">
                {SOURCE_LABELS[event.source]}
              </td>
              <td className="py-3 pr-4 text-slate-600">
                {formatEventValue(event)}
              </td>
              <td className="py-3 text-slate-600">
                {formatDateTime(event.timestamp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventForm({
  formState,
  formError,
  collectionStatus,
  isSubmitting,
  onSubmit,
  onChange,
}: {
  formState: EventFormState;
  formError: string;
  collectionStatus: string;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: React.Dispatch<React.SetStateAction<EventFormState>>;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Event type
        <select
          value={formState.type}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              type: event.target.value as EventType,
            }))
          }
          className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        >
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {EVENT_LABELS[type]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        User ID
        <input
          value={formState.userId}
          onChange={(event) =>
            onChange((current) => ({ ...current, userId: event.target.value }))
          }
          placeholder="cornell-rider-521"
          className="h-11 rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Source
          <select
            value={formState.source}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                source: event.target.value as EventSource,
              }))
            }
            className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          >
            {EVENT_SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Value
          <input
            value={formState.value}
            onChange={(event) =>
              onChange((current) => ({ ...current, value: event.target.value }))
            }
            type="number"
            min="0"
            step="0.01"
            placeholder={formState.type === "performance" ? "1800 ms" : "35"}
            className="h-11 rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Metadata
        <input
          value={formState.metadata}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              metadata: event.target.value,
            }))
          }
          placeholder="Ithaca -> NYC, 2 seats, checkout load..."
          className="h-11 rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
      </label>

      {formError ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {formError}
        </p>
      ) : null}

      <p
        aria-live="polite"
        className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500"
      >
        {collectionStatus}
      </p>

      <button
        type="submit"
        disabled={isSubmitting}
        className="h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isSubmitting ? "Tracking..." : "Track event"}
      </button>
    </form>
  );
}

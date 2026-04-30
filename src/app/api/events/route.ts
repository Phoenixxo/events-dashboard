import { createTrackedEvent, validateEventInput } from "@/lib/events/validation";

export async function POST(request: Request) {
  const startedAt = performance.now();
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return timedJson({ error: "Request body must be valid JSON." }, 400, startedAt, 0);
  }

  const validationStartedAt = performance.now();
  const validation = validateEventInput(body);
  const validationDuration = performance.now() - validationStartedAt;

  if (!validation.ok) {
    return timedJson({ error: validation.error }, 400, startedAt, validationDuration);
  }

  return timedJson(
    { event: createTrackedEvent(validation.input) },
    201,
    startedAt,
    validationDuration,
  );
}

function timedJson(
  body: unknown,
  status: number,
  startedAt: number,
  validationDuration: number,
) {
  const totalDuration = performance.now() - startedAt;

  return Response.json(body, {
    status,
    headers: {
      "Server-Timing": [
        `validation;dur=${validationDuration.toFixed(1)}`,
        `total;dur=${totalDuration.toFixed(1)}`,
      ].join(", "),
    },
  });
}

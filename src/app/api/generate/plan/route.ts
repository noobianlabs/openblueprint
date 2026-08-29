/**
 * GET  → { available: boolean } — the availability probe getEngine() uses.
 * POST → { decisions, questions } from Claude, or 503 when no key is set.
 */

import { NextResponse } from "next/server";
import { describeFailure, hasApiKey, planWithClaude } from "@/lib/engine/claude-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ available: hasApiKey() });
}

export async function POST(request: Request) {
  if (!hasApiKey()) {
    return NextResponse.json({ error: "no-key" }, { status: 503 });
  }

  let prompt: unknown;
  try {
    ({ prompt } = (await request.json()) as { prompt?: unknown });
  } catch {
    return NextResponse.json({ error: "body is not valid JSON" }, { status: 400 });
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const plan = await planWithClaude(prompt.trim());
    if (!Array.isArray(plan?.decisions) || !Array.isArray(plan?.questions)) {
      return NextResponse.json(
        { error: "model returned an unusable plan", issues: ["decisions and questions must both be arrays"] },
        { status: 422 },
      );
    }
    return NextResponse.json(plan);
  } catch (err) {
    const { status, error } = describeFailure(err);
    return NextResponse.json({ error }, { status });
  }
}

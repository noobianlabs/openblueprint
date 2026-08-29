/**
 * POST → a DesignPackage from Claude, 503 when no key is set, or 422 with
 * the specific integrity failures when the model's package does not pass
 * the same validator the local engine is held to. The client falls back to
 * the local engine on any of these.
 */

import { NextResponse } from "next/server";
import { buildWithClaude, describeFailure, hasApiKey } from "@/lib/engine/claude-server";
import { validateDesign } from "@/lib/engine/local/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasApiKey()) {
    return NextResponse.json({ error: "no-key" }, { status: 503 });
  }

  let body: { prompt?: unknown; answers?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "body is not valid JSON" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const answers: Record<string, string> = {};
  if (body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)) {
    for (const [key, value] of Object.entries(body.answers as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) answers[key] = value.trim();
    }
  }

  try {
    const pkg = await buildWithClaude(prompt, answers);
    const issues = validateDesign(pkg, { prompt });
    if (issues.length) {
      return NextResponse.json(
        { error: "model returned an invalid design package", issues },
        { status: 422 },
      );
    }
    return NextResponse.json(pkg);
  } catch (err) {
    const { status, error } = describeFailure(err);
    return NextResponse.json({ error }, { status });
  }
}

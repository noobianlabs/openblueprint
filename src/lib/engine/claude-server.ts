/**
 * Claude engine — the server half.
 *
 * Imported only by the two route handlers, so the SDK never reaches the
 * client bundle. Both calls force a tool call whose input schema mirrors
 * schema.ts, and the build result is run through the same validate.ts the
 * local engine uses before it is allowed out of the route.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { DesignPackage } from "../design/schema";
import type { PlanResult } from "./types";

export const DEFAULT_MODEL = "claude-sonnet-5";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client(): Anthropic {
  return new Anthropic();
}

function model(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/* ---------- shared prompt material ---------- */

const HOUSE_STYLE = `You are the design engine behind OpenBlueprint, an open-source hardware design tool.
A user describes a project in one sentence; you produce a complete, buildable design package.

Voice: terse, concrete, and opinionated, the way a good engineer talks to another engineer.
State the reason a choice was made when the reason is not obvious. Never pad, never hedge,
never use marketing language, and never use emoji.

Ground every design in real, orderable parts with their actual product names
(e.g. "Bosch BME280", "TB6612FNG Motor Driver", "MCP1700-3302E LDO") and plausible
2026 street prices in USD.`;

/* ---------- plan ---------- */

const PLAN_TOOL: Anthropic.Tool = {
  name: "emit_plan",
  description:
    "Emit the design decisions for this project and the questions worth asking before building it.",
  input_schema: {
    type: "object",
    properties: {
      decisions: {
        type: "array",
        minItems: 5,
        maxItems: 6,
        items: { type: "string" },
        description:
          "Design-decision bullets, one sentence each, in the imperative: 'Select an ESP32-C3 for…', 'Switch the pump through a logic-level MOSFET…'. Each names a specific part or technique and the reason for it.",
      },
      questions: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Short lowercase identifier, e.g. 'switching', 'power', 'sensing'.",
            },
            question: { type: "string" },
            options: {
              type: "array",
              minItems: 3,
              maxItems: 4,
              items: { type: "string" },
              description: "Short concrete choices, each naming a part or approach.",
            },
          },
          required: ["id", "question", "options"],
          additionalProperties: false,
        },
        description:
          "Exactly three questions whose answers would change which parts end up in the design — typically a switching/driver method, a power strategy, and a sensor or actuator choice.",
      },
    },
    required: ["decisions", "questions"],
    additionalProperties: false,
  },
};

export async function planWithClaude(prompt: string): Promise<PlanResult> {
  const stream = client().messages.stream({
    model: model(),
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: HOUSE_STYLE,
    messages: [
      {
        role: "user",
        content: `Plan a hardware design for this request, then call emit_plan.\n\nRequest: ${prompt}`,
      },
    ],
    tools: [PLAN_TOOL],
    tool_choice: { type: "tool", name: "emit_plan" },
  });

  const message = await stream.finalMessage();
  const input = toolInput(message, "emit_plan");
  return input as unknown as PlanResult;
}

/* ---------- build ---------- */

const CATEGORIES = [
  "mcu", "sensor", "actuator", "power", "comms", "display", "module", "enclosure", "print3d", "misc",
];

const PART_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Short kebab-case id, unique within the package." },
    name: { type: "string", description: "Product-style name, e.g. 'Bosch BME280'." },
    role: { type: "string", description: "Role in this design, e.g. 'Main Logic Controller'." },
    description: { type: "string", description: "One or two sentences on what it does here and why it was chosen." },
    category: { type: "string", enum: CATEGORIES },
    domain: {
      type: "string",
      enum: ["electrical", "mechanical"],
      description:
        "Must match the category: mcu/sensor/actuator/power/comms/display/module are electrical; enclosure/print3d/misc are mechanical.",
    },
    qty: { type: "integer", minimum: 1 },
    unitCost: { type: "number", minimum: 0, description: "Estimated unit cost in USD." },
    pins: {
      type: "array",
      items: { type: "string" },
      description: "Required on every electrical part: the pin names used in connections, e.g. ['VCC','GND','SDA','SCL'].",
    },
    printSettings: {
      type: "string",
      description: "Required on print3d parts, e.g. 'PETG · 40% infill, 0.2mm layer'.",
    },
  },
  required: ["id", "name", "role", "description", "category", "domain", "qty", "unitCost"],
  additionalProperties: false,
};

const PIN_REF_SCHEMA = {
  type: "object",
  properties: {
    part: { type: "string", description: "An existing part id." },
    pin: { type: "string", description: "A pin name present on that part's pins array." },
  },
  required: ["part", "pin"],
  additionalProperties: false,
};

/** AssemblyNode is recursive; inline it to a bounded depth instead. */
function assemblyNodeSchema(depth: number): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    part: { type: "string", description: "An existing part id. Every part appears exactly once in the whole tree." },
  };
  if (depth > 1) {
    properties.children = { type: "array", items: assemblyNodeSchema(depth - 1) };
  }
  return {
    type: "object",
    properties,
    required: ["part"],
    additionalProperties: false,
  };
}

const STEP_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Display id, e.g. '2.1'." },
    title: { type: "string" },
    detail: { type: "string", description: "Two or three sentences of real, specific guidance — including what goes wrong." },
    tools: { type: "array", items: { type: "string" }, description: "Tool names, each also present in the package's tools array." },
    parts: { type: "array", items: { type: "string" }, description: "Part ids used in this step." },
  },
  required: ["id", "title", "detail", "tools", "parts"],
  additionalProperties: false,
};

const DESIGN_TOOL: Anthropic.Tool = {
  name: "emit_design",
  description: "Emit the complete design package for this project.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Title-cased project name, at most 5 words, derived from the user's own words." },
      summary: {
        type: "string",
        description:
          "One paragraph, 4–6 sentences, explaining how the system actually works. It must mention the user's subject in their own terms.",
      },
      tags: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: { type: "string" },
        description: "UPPERCASE feature tags, e.g. 'SOLAR POWERED'.",
      },
      parts: { type: "array", minItems: 10, maxItems: 16, items: PART_SCHEMA },
      connections: {
        type: "array",
        minItems: 8,
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique, e.g. 'c1'." },
            from: PIN_REF_SCHEMA,
            to: PIN_REF_SCHEMA,
            net: { type: "string", enum: ["data", "power", "ground"] },
            label: { type: "string", description: "Rendered on the wire, e.g. '5V', 'I2C', 'PWM'." },
          },
          required: ["id", "from", "to", "net"],
          additionalProperties: false,
        },
        description:
          "A complete net: every electrical part appears at least once, and there is at least one data, one power, and one ground connection.",
      },
      assembly: {
        type: "array",
        items: assemblyNodeSchema(4),
        description: "Physical containment tree. Every part id appears exactly once across the whole tree.",
      },
      tools: { type: "array", items: { type: "string" }, description: "Every tool named by a step, and no others." },
      assumptions: { type: "array", minItems: 3, items: { type: "string" }, description: "What the builder is assumed to have or accept." },
      instructions: {
        type: "array",
        minItems: 3,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string", description: "e.g. 'Fabricate', 'Wire', 'Bring-up', 'Assemble'." },
            steps: { type: "array", minItems: 3, maxItems: 4, items: STEP_SCHEMA },
          },
          required: ["id", "title", "steps"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "name", "summary", "tags", "parts", "connections", "assembly", "tools", "assumptions", "instructions",
    ],
    additionalProperties: false,
  },
};

const BUILD_RULES = `Hard requirements — the package is rejected outright if any is broken:
- 10 to 16 part lines, with at least one electrical part and at least one mechanical part.
- Every electrical part carries a pins array and appears in at least one connection.
- Every connection endpoint names an existing part id and a pin name present on that part.
- The nets include at least one data, one power, and one ground connection.
- The assembly tree contains every part id exactly once — no omissions, no duplicates.
- 3 or 4 instruction phases, each with 3 or 4 steps.
- Every tool named by a step also appears in the package's tools array, and every listed tool is used by some step.
- Every part id named by a step exists.
- 3 to 5 UPPERCASE tags.
- A part's domain must match its category.`;

export async function buildWithClaude(
  prompt: string,
  answers: Record<string, string>,
): Promise<unknown> {
  const answerLines = Object.entries(answers)
    .map(([id, value]) => `- ${id}: ${value}`)
    .join("\n");

  const stream = client().messages.stream({
    model: model(),
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system: `${HOUSE_STYLE}\n\n${BUILD_RULES}`,
    messages: [
      {
        role: "user",
        content:
          `Design this project, then call emit_design.\n\nRequest: ${prompt}\n\n` +
          (answerLines
            ? `The user answered the refinement questions as follows; these choices must be reflected in the parts you pick:\n${answerLines}`
            : "The user skipped the refinement questions — use sensible defaults."),
      },
    ],
    tools: [DESIGN_TOOL],
    tool_choice: { type: "tool", name: "emit_design" },
  });

  const message = await stream.finalMessage();
  return toolInput(message, "emit_design") as unknown as DesignPackage;
}

/* ---------- shared ---------- */

function toolInput(message: Anthropic.Message, name: string): unknown {
  for (const block of message.content) {
    if (block.type === "tool_use" && block.name === name) return block.input;
  }
  throw new Error(`model did not call ${name} (stop_reason: ${message.stop_reason})`);
}

/** Turn any thrown value into an HTTP status and a message. */
export function describeFailure(err: unknown): { status: number; error: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 502, error: "anthropic rejected the configured key" };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 502, error: "anthropic rate limit reached" };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, error: `anthropic api error ${err.status}: ${err.message}` };
  }
  return { status: 500, error: err instanceof Error ? err.message : "unknown failure" };
}

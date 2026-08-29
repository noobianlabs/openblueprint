/**
 * DesignBuilder — the shared spine every archetype composes against.
 *
 * Archetypes describe *what* goes in the design; the builder owns the
 * bookkeeping that has to be right every time: unique part ids, sequential
 * connection ids, pin allocation without collisions, the instruction
 * skeleton, and the tool list derived from the steps that actually use them.
 */

import type {
  AssemblyNode,
  Connection,
  DesignPackage,
  NetType,
  Part,
  PinRef,
} from "../../design/schema";
import type { McuProfile } from "./part-library";

export const TOOLS = {
  printer: "3D printer",
  soldering: "Soldering station",
  strippers: "Wire strippers",
  inserts: "Heat-set insert tool",
  hex: "M3 hex driver",
  multimeter: "Digital multimeter",
  usb: "USB-C cable",
  knife: "Hobby knife",
  cutters: "Side cutters",
  pliers: "Needle-nose pliers",
  glue: "Hot glue gun",
  needle: "Needle and thread",
  scale: "Kitchen scale",
} as const;

export interface StepSpec {
  title: string;
  detail: string;
  tools: string[];
  parts: string[];
}

/** Archetype-specific steps slotted into the standard four phases. */
export interface InstructionFlavor {
  /** Wiring steps, placed after the power chain and logic bus. */
  wiring: StepSpec[];
  /** Bring-up steps, placed after the firmware flash. */
  bringUp: StepSpec[];
  /** Mechanical steps, placed after the electronics are mounted. */
  assemble: StepSpec[];
  /** Final "it lives where it lives now" step. */
  install: StepSpec;
}

type RailName = "3V3" | "5V" | "VIN" | "GND";

export class DesignBuilder {
  private parts: Part[] = [];
  private connections: Connection[] = [];
  private phases: { title: string; steps: StepSpec[] }[] = [];
  private tree: AssemblyNode[] = [];
  private assumptionList: string[] = [];
  private rails = new Map<RailName, PinRef>();
  private mcuId = "";
  private profile: McuProfile | null = null;
  private gpioCursor = 0;
  private adcCursor = 0;

  constructor(
    public name: string,
    public summary: string,
    public tags: string[],
  ) {}

  /* ---------- parts ---------- */

  add(part: Part): string {
    if (this.parts.some((p) => p.id === part.id)) {
      throw new Error(`duplicate part id: ${part.id}`);
    }
    this.parts.push(part);
    return part.id;
  }

  /** Add the controller and publish its logic rails. */
  addMcu(part: Part, profile: McuProfile): string {
    this.add(part);
    this.mcuId = part.id;
    this.profile = profile;
    this.rails.set("3V3", { part: part.id, pin: profile.logic });
    this.rails.set("GND", { part: part.id, pin: profile.gnd });
    return part.id;
  }

  get mcu(): string {
    if (!this.mcuId) throw new Error("no MCU set");
    return this.mcuId;
  }

  ids(filter: (p: Part) => boolean): string[] {
    return this.parts.filter(filter).map((p) => p.id);
  }

  nameOf(id: string): string {
    const p = this.parts.find((x) => x.id === id);
    if (!p) throw new Error(`unknown part: ${id}`);
    return p.name;
  }

  /* ---------- rails and pins ---------- */

  setRail(rail: RailName, ref: PinRef): void {
    this.rails.set(rail, ref);
  }

  railRef(rail: RailName): PinRef {
    const ref = this.rails.get(rail);
    if (!ref) throw new Error(`rail not defined: ${rail}`);
    return ref;
  }

  nextGpio(): string {
    const prof = this.requireProfile();
    const pin = prof.gpio[this.gpioCursor];
    if (!pin) throw new Error(`${this.mcuId}: out of GPIO pins`);
    this.gpioCursor += 1;
    return pin;
  }

  nextAdc(): string {
    const prof = this.requireProfile();
    const pin = prof.adc[this.adcCursor];
    if (!pin) throw new Error(`${this.mcuId}: out of ADC pins`);
    this.adcCursor += 1;
    return pin;
  }

  private requireProfile(): McuProfile {
    if (!this.profile) throw new Error("no MCU profile set");
    return this.profile;
  }

  /** Raw supply input pin (USB/VSYS), falling back to the logic pin. */
  mcuVin(): string {
    const prof = this.requireProfile();
    return prof.vin ?? prof.logic;
  }

  mcuLogic(): string {
    return this.requireProfile().logic;
  }

  mcuGnd(): string {
    return this.requireProfile().gnd;
  }

  /* ---------- wiring ---------- */

  wire(from: PinRef, to: PinRef, net: NetType, label?: string): void {
    this.connections.push({
      id: `c${this.connections.length + 1}`,
      from,
      to,
      net,
      ...(label ? { label } : {}),
    });
  }

  /** Feed a part's supply pin from a rail. */
  powerFrom(partId: string, pin: string, rail: RailName = "3V3", label?: string): void {
    const railLabel = label ?? (rail === "3V3" ? "3.3V" : rail === "5V" ? "5V" : "VIN");
    this.wire({ part: partId, pin }, this.railRef(rail), "power", railLabel);
  }

  ground(partId: string, pin = "GND"): void {
    this.wire({ part: partId, pin }, this.railRef("GND"), "ground");
  }

  /** Standard supply + ground pair for a 3.3V peripheral. */
  supply(partId: string, vcc = "VCC", gnd = "GND", rail: RailName = "3V3"): void {
    this.powerFrom(partId, vcc, rail);
    this.ground(partId, gnd);
  }

  /** Hang an I2C device off the shared bus. */
  i2c(partId: string, opts: { vcc?: string; gnd?: string; sda?: string; scl?: string; rail?: RailName } = {}): void {
    const prof = this.requireProfile();
    this.wire({ part: partId, pin: opts.sda ?? "SDA" }, { part: this.mcu, pin: prof.sda }, "data", "I2C");
    this.wire({ part: partId, pin: opts.scl ?? "SCL" }, { part: this.mcu, pin: prof.scl }, "data", "I2C");
    this.supply(partId, opts.vcc ?? "VCC", opts.gnd ?? "GND", opts.rail ?? "3V3");
  }

  /** Analog sensor: allocate an ADC channel and wire supply + ground. */
  analogIn(partId: string, out: string, label = "analog", opts: { vcc?: string | null; gnd?: string; rail?: RailName } = {}): string {
    const pin = this.nextAdc();
    this.wire({ part: partId, pin: out }, { part: this.mcu, pin }, "data", label);
    if (opts.vcc !== null) this.powerFrom(partId, opts.vcc ?? "VCC", opts.rail ?? "3V3");
    this.ground(partId, opts.gnd ?? "GND");
    return pin;
  }

  /** Digital in/out: allocate a GPIO and wire supply + ground. */
  digital(partId: string, sig: string, label: string, opts: { vcc?: string | null; gnd?: string; rail?: RailName } = {}): string {
    const pin = this.nextGpio();
    this.wire({ part: partId, pin: sig }, { part: this.mcu, pin }, "data", label);
    if (opts.vcc !== null && opts.vcc !== undefined) this.powerFrom(partId, opts.vcc, opts.rail ?? "3V3");
    this.ground(partId, opts.gnd ?? "GND");
    return pin;
  }

  /** Signal-only line (the peer already has its own supply). */
  signal(partId: string, sig: string, label: string): string {
    const pin = this.nextGpio();
    this.wire({ part: partId, pin: sig }, { part: this.mcu, pin }, "data", label);
    return pin;
  }

  /** SPI peripheral: clock, data, chip select, plus any extra control lines. */
  spi(partId: string, lines: string[], opts: { vcc?: string; gnd?: string; rail?: RailName } = {}): void {
    for (const line of lines) {
      this.wire({ part: partId, pin: line }, { part: this.mcu, pin: this.nextGpio() }, "data", "SPI");
    }
    this.supply(partId, opts.vcc ?? "VCC", opts.gnd ?? "GND", opts.rail ?? "3V3");
  }

  /* ---------- structure ---------- */

  assembly(nodes: AssemblyNode[]): void {
    this.tree = nodes;
  }

  assume(...lines: string[]): void {
    this.assumptionList.push(...lines);
  }

  /**
   * The four-phase build: fabricate, wire, bring-up, assemble. The generic
   * steps are derived from what the design actually contains; the flavor
   * supplies the archetype-specific ones.
   */
  instructions(flavor: InstructionFlavor): void {
    // Two generic steps lead each phase, so the flavor gets the remaining
    // one or two slots. Anything else would blow the 3–4 step budget.
    for (const [key, list] of [
      ["wiring", flavor.wiring],
      ["bringUp", flavor.bringUp],
      ["assemble", flavor.assemble],
    ] as const) {
      if (list.length < 1 || list.length > 2) {
        throw new Error(`instruction flavor "${key}" must supply 1 or 2 steps, got ${list.length}`);
      }
    }

    const printed = this.ids((p) => p.category === "print3d");
    const mech = this.ids((p) => p.domain === "mechanical");
    const powerParts = this.ids((p) => p.category === "power");
    const busParts = this.ids(
      (p) => p.category === "sensor" || p.category === "display" || p.category === "module",
    );
    const electronics = this.ids((p) => p.domain === "electrical").slice(0, 5);
    const enclosure = this.ids((p) => p.category === "enclosure");
    const printList = printed.map((id) => this.nameOf(id)).join(", ");

    this.phases = [
      {
        title: "Fabricate",
        steps: [
          {
            title: "Print the mechanical parts",
            detail: `Print ${printList}. Follow the per-part material and infill in the BOM — the load-bearing parts want more perimeters, not more infill.`,
            tools: [TOOLS.printer],
            parts: printed,
          },
          {
            title: "Clean up and install inserts",
            detail:
              "Deburr the printed holes with a hobby knife, then press the M3 brass inserts in with a heated tip. Keep each insert square as it melts down — a leaning insert cracks the boss when you torque the screw.",
            tools: [TOOLS.knife, TOOLS.inserts],
            parts: [...printed.slice(0, 3), ...this.ids((p) => p.category === "misc")].slice(0, 4),
          },
          {
            title: "Dry-fit the mechanics",
            detail:
              "Assemble everything mechanical with no electronics fitted. Check clearances and moving parts now, while a misprint costs a reprint rather than a rewire.",
            tools: [TOOLS.hex],
            parts: mech.slice(0, 5),
          },
        ],
      },
      {
        title: "Wire",
        steps: [
          {
            title: "Build the power chain",
            detail: `Wire ${powerParts.map((id) => this.nameOf(id)).join(" → ")} on the bench, before anything else is connected. Check polarity twice; most of the parts here fail permanently and instantly when reversed.`,
            tools: [TOOLS.soldering, TOOLS.strippers],
            parts: powerParts,
          },
          {
            title: "Wire the logic bus",
            detail: `Bring 3.3V and ground to ${this.nameOf(this.mcu)}, then daisy-chain the shared bus out to ${busParts.slice(0, 3).map((id) => this.nameOf(id)).join(", ")}. Keep bus runs short and twisted with their ground return.`,
            tools: [TOOLS.soldering, TOOLS.strippers],
            parts: [this.mcu, ...busParts.slice(0, 3)],
          },
          ...flavor.wiring,
        ],
      },
      {
        title: "Bring-up",
        steps: [
          {
            title: "Verify the rails before power-up",
            detail:
              "With the controller unseated, confirm each rail reads its nominal voltage and that there is no continuity between any rail and ground. Only then plug the board in.",
            tools: [TOOLS.multimeter],
            parts: [...powerParts.slice(-1), this.mcu],
          },
          {
            title: "Flash the firmware",
            detail: `Flash ${this.nameOf(this.mcu)} over USB with the peripherals connected but the actuators unpowered. Watch the serial log through one full boot before trusting anything it prints.`,
            tools: [TOOLS.usb],
            parts: [this.mcu],
          },
          ...flavor.bringUp,
        ],
      },
      {
        title: "Assemble",
        steps: [
          {
            title: "Mount the electronics",
            detail: `Fasten ${electronics.map((id) => this.nameOf(id)).join(", ")} to their standoffs and route every harness away from moving parts and heat. Leave enough slack to lift the board out without unplugging it.`,
            tools: [TOOLS.hex],
            parts: [...enclosure, ...electronics].slice(0, 6),
          },
          ...flavor.assemble,
          flavor.install,
        ],
      },
    ];
  }

  /* ---------- output ---------- */

  finish(): DesignPackage {
    const tools: string[] = [];
    for (const phase of this.phases) {
      for (const step of phase.steps) {
        for (const tool of step.tools) {
          if (!tools.includes(tool)) tools.push(tool);
        }
      }
    }

    return {
      name: this.name,
      summary: this.summary,
      tags: [...this.tags],
      parts: this.parts,
      connections: this.connections,
      assembly: this.tree,
      tools,
      assumptions: [...this.assumptionList],
      instructions: this.phases.map((phase, i) => ({
        id: String(i + 1),
        title: phase.title,
        steps: phase.steps.map((step, j) => ({
          id: `${i + 1}.${j + 1}`,
          title: step.title,
          detail: step.detail,
          tools: [...new Set(step.tools)],
          parts: [...new Set(step.parts)],
        })),
      })),
    };
  }
}

/** Shorthand for an assembly node with children. */
export function node(part: string, children?: AssemblyNode[]): AssemblyNode {
  return children && children.length ? { part, children } : { part };
}

export type { Connection, PinRef };

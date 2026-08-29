import type { Archetype, BuildContext } from "./base";
import { choice, customNote } from "./base";
import { DesignBuilder, TOOLS, node } from "../compose";
import { hardware, part, printedPart, MCU_PROFILES } from "../part-library";
import { buildPower } from "../power";

const EMITTER = ["Addressable RGB ring", "Addressable RGB strip", "Warm-white COB + driver"];
const CONTROL = ["Capacitive touch pad", "Panel buttons", "Wi-Fi only"];
const POWER = ["5V 3A adapter", "USB-C 5V", "Battery + USB-C charging"];

export const lamp: Archetype = {
  id: "lamp",
  label: "Smart lamp",
  keywords: ["lamp", "light", "lighting", "sunrise", "sunset", "glow", "night", "luminaire", "sconce", "dawn", "mood", "ambient"],
  fallbackSubject: "sunrise lamp",
  fallbackTitle: "Sunrise Lamp",
  cover: { glyph: "☼", hueA: "#fbbf24", hueB: "#f472b6" },

  decisions(ctx) {
    return [
      `Select an ESP32-C3 for the ${ctx.subject} — Wi-Fi time sync means the schedule survives a power cut without a button press.`,
      "Add a battery-backed RTC anyway; a lamp that forgets its alarm during an outage is a lamp nobody trusts.",
      "Drive the emitter with gamma-corrected PWM — a linear fade looks like it jumps at the bottom of the range.",
      "Read ambient light so the lamp can cap its own brightness at night instead of blinding the room.",
      "Give the fade a floor of several hundred steps over its full run, so the first minutes are visible but not startling.",
      "Print the diffuser in white PLA at low infill and high wall count — the walls do the diffusing, not the infill.",
    ];
  },

  questions() {
    return [
      { id: "emitter", question: "What kind of light engine?", options: EMITTER },
      { id: "control", question: "How should it be controlled by hand?", options: CONTROL },
      { id: "power", question: "Where does power come from?", options: POWER },
    ];
  },

  build(ctx: BuildContext) {
    const emitterChoice = choice(ctx, "emitter", EMITTER);
    const controlChoice = choice(ctx, "control", CONTROL);
    const powerChoice = choice(ctx, "power", POWER);

    const cob = emitterChoice === 2;
    const emitterKey = cob ? "cobled" : emitterChoice === 1 ? "ws2812strip" : "ws2812ring";
    const controlKey = controlChoice === 1 ? "buttons" : controlChoice === 2 ? null : "ttp223";
    const strategy = powerChoice === 1 ? "usb5v" : powerChoice === 2 ? "lipoBoost" : "adapter5v";

    const b = new DesignBuilder("", "", []);
    b.addMcu(part("esp32c3"), MCU_PROFILES.esp32c3);
    const power = buildPower(b, strategy);

    b.add(part(emitterKey));
    if (cob) b.add(part("ccdriver"));
    b.add(part("ds3231", { role: "Schedule Keeper" }));
    b.add(part("ldr", { role: "Ambient Light Sensor" }));
    if (controlKey) {
      b.add(part(controlKey, controlKey === "buttons" ? { role: "Panel Input" } : { role: "Touch Input" }));
    }

    if (cob) {
      b.powerFrom("ccdriver", "VIN", "5V");
      b.ground("ccdriver", "GND");
      b.signal("ccdriver", "DIM", "PWM");
      b.wire({ part: "ccdriver", pin: "LED+" }, { part: "cobled", pin: "LED+" }, "power", "constant current");
      b.wire({ part: "cobled", pin: "LED-" }, { part: "ccdriver", pin: "LED-" }, "ground");
    } else {
      b.powerFrom(emitterKey, "5V", "5V");
      b.ground(emitterKey, "GND");
      b.signal(emitterKey, "DIN", "WS2812");
    }

    b.i2c("ds3231");
    b.analogIn("ldr", "AOUT", "ambient");
    if (controlKey === "ttp223") b.digital("ttp223", "OUT", "touch", { vcc: "VCC" });
    if (controlKey === "buttons") b.digital("buttons", "SIG", "input", { gnd: "GND" });

    /* --- mechanics --- */
    b.add(
      printedPart({
        id: "base",
        name: "Weighted Base",
        role: "Body",
        description:
          "Printed base carrying the electronics and a cavity for ballast, so a lamp on a bedside table cannot be pulled over by its own cable.",
        printSettings: "PLA · 20% infill, 0.2mm layer, 4 perimeters",
        unitCost: 5.0,
      }),
    );
    b.add(
      printedPart({
        id: "diffuser",
        name: "Diffuser Shade",
        role: "Optics",
        description:
          "White vase-mode shade at 1.2mm wall — thick enough to hide the individual emitters, thin enough to pass most of the light.",
        printSettings: "White PLA · vase mode, 1.2mm wall, 0.3mm layer",
        unitCost: 4.0,
      }),
    );
    b.add(
      printedPart({
        id: "collar",
        name: "Emitter Collar",
        role: "Light Mount",
        description: "Ring that holds the emitter concentric inside the shade and sets the standoff that stops hot-spotting.",
        printSettings: "PLA · 30% infill, 0.2mm layer",
        unitCost: 1.5,
      }),
    );
    b.add(
      hardware({
        id: "ballast",
        name: "Steel Ballast Washers",
        role: "Base Weight",
        description: "Stack of M8 washers epoxied into the base cavity — roughly 200g is enough to make the lamp feel planted.",
        qty: 12,
        unitCost: 0.15,
      }),
    );
    b.add(
      hardware({
        id: "m3-kit",
        name: "M3 Screws + Heat-Set Inserts",
        role: "Fastener Set",
        description: "Socket-head M3 screws and brass inserts for the base, collar, and shade.",
        qty: 10,
        unitCost: 0.2,
      }),
    );

    b.assembly([
      node("base", [
        node(b.mcu),
        node("ds3231"),
        node("ldr"),
        ...(controlKey ? [node(controlKey)] : []),
        ...(cob ? [node("ccdriver")] : []),
        ...power.ids.map((id) => node(id)),
        node("ballast"),
        node("collar", [node(emitterKey)]),
        node("m3-kit"),
      ]),
      node("diffuser"),
    ]);

    const emitterName = b.nameOf(emitterKey);
    const controlClause = controlKey
      ? `A ${b.nameOf(controlKey).toLowerCase()} handles the manual override`
      : "There are no controls on the body — everything happens on schedule or over the network";

    b.name = ctx.title;
    b.summary =
      `This ${ctx.subject} fades up over a set window rather than switching on, which is the whole point: the light has to ` +
      `arrive before you notice it did. The ESP32-C3 syncs time over Wi-Fi and keeps a DS3231 as backup, then walks the ` +
      `${emitterName} through a gamma-corrected ramp so the early minutes are perceptibly smooth instead of stepping. ` +
      `An ambient light divider caps the ceiling at night. ${controlClause}. ${power.sentence}. ` +
      `The shade prints in vase mode at a 1.2mm wall, which hides the individual emitters without eating the output.`;
    b.tags = [
      "SUNRISE FADE",
      cob ? "WARM WHITE" : "ADDRESSABLE RGB",
      power.tag,
      "RTC BACKED",
      "AMBIENT DIMMING",
    ];

    b.assume(
      "A bedside or desk surface within reach of its power lead",
      power.assumption,
      "2.4GHz Wi-Fi for time sync; the RTC covers the schedule when the network is down",
      cob
        ? "The COB emitter needs its heatsink — running it against bare plastic will discolour the print and shorten the LED's life"
        : "Full-white on a long strip draws real current; size the supply for the whole strip, not the average scene",
      ...customNote(ctx, "emitter", EMITTER, "light engine"),
      ...customNote(ctx, "control", CONTROL, "manual control"),
    );

    b.instructions({
      wiring: [
        {
          title: "Wire the light engine",
          detail: cob
            ? "Feed the constant-current driver from the 5V rail and take its DIM input to a PWM pin. Bolt the COB to its heatsink with thermal compound before powering it — a few seconds unheatsinked is enough to damage the emitter."
            : `Take 5V and ground to the ${emitterName} on their own heavier leads, and the data line to a GPIO with a series resistor near the controller. Inject power at both ends of a long strip or the far end will read visibly warmer than the near end.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: cob ? ["ccdriver", "cobled", b.mcu] : [emitterKey, b.mcu],
        },
        {
          title: "Wire the clock, sensor, and controls",
          detail: `Hang the DS3231 off the I2C bus, take the ambient divider to the ADC, and ${controlKey ? "run the manual control to its own GPIO." : "leave the control header unpopulated — this build has no manual input."} Fit the RTC's backup cell before the base closes; it is the only part that is awkward to reach afterwards.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: controlKey ? ["ds3231", "ldr", controlKey] : ["ds3231", "ldr", b.mcu],
        },
      ],
      bringUp: [
        {
          title: "Set the clock and run a compressed fade",
          detail:
            "Sync the RTC from network time, then run the full sunrise sequence compressed into a minute. Watch the bottom of the ramp specifically — that is where an uncorrected curve looks like it jumps rather than fades.",
          tools: [TOOLS.usb],
          parts: [b.mcu, "ds3231", emitterKey],
        },
        {
          title: "Check thermals at full output",
          detail:
            "Hold the emitter at maximum for ten minutes and feel the base and collar. Warm is expected; too hot to hold means the print will creep, and the standoff or the current limit needs changing before the shade goes on.",
          tools: [TOOLS.multimeter],
          parts: [emitterKey, "collar"],
        },
      ],
      assemble: [
        {
          title: "Mount the emitter and ballast the base",
          detail:
            "Epoxy the washer stack into the base cavity and let it cure fully before handling. Fit the emitter to its collar concentric with the shade opening, and confirm the standoff distance kills the hot spot.",
          tools: [TOOLS.hex, TOOLS.glue],
          parts: ["ballast", "base", "collar", emitterKey],
        },
      ],
      install: {
        title: "Fit the shade and set the alarm",
        detail:
          "Drop the diffuser over the collar, close the base, and set a real alarm for the next morning. Judge the result in a dark room — a fade that looks gentle at your desk can still be harsh at 6am.",
        tools: [TOOLS.hex],
        parts: ["diffuser", "base", "m3-kit"],
      },
    });

    return b.finish();
  },
};

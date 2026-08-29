import type { Archetype, BuildContext } from "./base";
import { choice, customNote } from "./base";
import { DesignBuilder, TOOLS, node } from "../compose";
import type { PartKey } from "../part-library";
import { hardware, part, printedPart, MCU_PROFILES } from "../part-library";
import { buildPower } from "../power";

const MCU = ["ESP32-C3 (Wi-Fi + BLE)", "Raspberry Pi Pico 2 (no radio)", "ESP32-S3 (more IO)"];
const SENSE = ["Ambient light", "Motion (PIR)", "Temperature and humidity", "Buttons only"];
const POWER = ["USB-C 5V", "Battery + USB-C charging", "4×AA cells"];

export const generic: Archetype = {
  id: "generic",
  label: "Desk gadget",
  keywords: [],
  fallbackSubject: "desk gadget",
  fallbackTitle: "Connected Desk Gadget",
  cover: { glyph: "◈", hueA: "#a78bfa", hueB: "#3ddbb4" },

  decisions(ctx) {
    return [
      `Select an ESP32-C3 for the ${ctx.subject} — Wi-Fi, BLE, and deep sleep on a board the size of a stamp.`,
      "Give it a local display so the device is legible on its own, not only through a dashboard.",
      "Read inputs on the shared I2C bus wherever possible; it keeps the pin budget open for later additions.",
      "Add two panel buttons and a piezo so the design can be operated and can answer back without a phone.",
      "Regulate the logic rail from a switched input so the design can sit idle without draining anything.",
      "Print a two-part shell with a separate face plate, so the electronics can change without reprinting the body.",
    ];
  },

  questions() {
    return [
      { id: "mcu", question: "Which controller should run it?", options: MCU },
      { id: "sense", question: "What should it sense?", options: SENSE },
      { id: "power", question: "Where does power come from?", options: POWER },
    ];
  },

  build(ctx: BuildContext) {
    const mcuChoice = choice(ctx, "mcu", MCU);
    const senseChoice = choice(ctx, "sense", SENSE);
    const powerChoice = choice(ctx, "power", POWER);

    const mcuKey = mcuChoice === 1 ? "rp2040" : mcuChoice === 2 ? "esp32s3" : "esp32c3";
    const strategy = powerChoice === 1 ? "lipo" : powerChoice === 2 ? "aa" : "usb5v";

    const b = new DesignBuilder("", "", []);
    b.addMcu(part(mcuKey), MCU_PROFILES[mcuKey]);
    const power = buildPower(b, strategy);

    b.add(part("oled"));
    b.add(part("buttons", { role: "Panel Input" }));
    b.add(part("buzzer", { role: "Audible Feedback" }));

    let sensorKey: PartKey | null = null;
    if (senseChoice === 0) sensorKey = "ldr";
    else if (senseChoice === 1) sensorKey = "pir";
    else if (senseChoice === 2) sensorKey = "sht41";
    if (sensorKey) b.add(part(sensorKey));

    b.i2c("oled");
    if (sensorKey === "ldr") b.analogIn("ldr", "AOUT", "light");
    else if (sensorKey === "pir") b.digital("pir", "OUT", "motion", { vcc: "VCC" });
    else if (sensorKey === "sht41") b.i2c("sht41");

    b.digital("buttons", "SIG", "input", { gnd: "GND" });
    b.digital("buzzer", "SIG", "PWM", { gnd: "GND" });

    b.add(part("encdesk", { role: "Main Housing" }));
    b.add(
      printedPart({
        id: "faceplate",
        name: "Face Plate",
        role: "Front Panel",
        description: "Front panel carrying the display window, button caps, and a slot for the sensor's line of sight.",
        printSettings: "PLA · 20% infill, 0.2mm layer, 4 top layers",
        unitCost: 2.0,
      }),
    );
    b.add(
      printedPart({
        id: "tray",
        name: "Board Tray",
        role: "Electronics Carrier",
        description: "Drop-in tray with standoffs for the controller and power boards; lifts out as one piece for servicing.",
        printSettings: "PLA · 25% infill, 0.2mm layer",
        unitCost: 2.5,
      }),
    );
    b.add(
      printedPart({
        id: "feet",
        name: "Rubber-Lined Feet",
        role: "Desk Feet",
        description: "Printed feet with a recess for adhesive rubber pads, tilting the face about 12° toward the reader.",
        printSettings: "TPU · 30% infill, 0.2mm layer",
        unitCost: 0.8,
        qty: 4,
      }),
    );
    b.add(
      hardware({
        id: "m3-kit",
        name: "M3 Screws + Heat-Set Inserts",
        role: "Fastener Set",
        description: "Socket-head M3 screws and brass inserts for the shell, tray, and face plate.",
        qty: 10,
        unitCost: 0.2,
      }),
    );

    b.assembly([
      node("encdesk", [
        node("tray", [node(b.mcu), ...power.ids.map((id) => node(id))]),
        node("faceplate", [
          node("oled"),
          node("buttons"),
          ...(sensorKey ? [node(sensorKey)] : []),
        ]),
        node("buzzer"),
        node("feet"),
        node("m3-kit"),
      ]),
    ]);

    const sensorName = sensorKey ? b.nameOf(sensorKey) : "the panel buttons";
    b.name = ctx.title;
    b.summary =
      `This ${ctx.subject} is a small, self-contained ${b.nameOf(b.mcu)} build: it reads ${sensorName}, ` +
      `shows state on a 128×64 OLED, and takes input from two panel buttons with a piezo for confirmation. ` +
      `${power.sentence}. Everything but the display shares the I2C bus, so there is pin headroom left for whatever ` +
      `you add next. The shell prints in two parts with a separate face plate, which means the panel layout can ` +
      `change without reprinting the body.`;
    b.tags = [
      "OLED STATUS",
      power.tag,
      senseChoice === 3 ? "BUTTON DRIVEN" : "SENSOR INPUT",
      "3D PRINTED SHELL",
    ];

    b.assume(
      "A flat desk or shelf — the feet assume the design sits rather than hangs",
      power.assumption,
      mcuKey === "rp2040"
        ? "No network: the Pico 2 build is local-only, so state lives on the display"
        : "2.4GHz Wi-Fi in range for updates and remote state",
      ...customNote(ctx, "sense", SENSE, "input sensor"),
      ...customNote(ctx, "mcu", MCU, "controller"),
    );

    b.instructions({
      wiring: [
        {
          title: "Wire the panel inputs and buzzer",
          detail:
            "Take both buttons to GPIO with the internal pull-ups enabled and their common leg to ground. The piezo is passive, so it needs a PWM pin rather than a steady level — a DC level just makes it click once.",
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: ["buttons", "buzzer", b.mcu],
        },
      ],
      bringUp: [
        {
          title: "Confirm the bus enumerates",
          detail:
            "Run an I2C scan before writing any application code. The OLED should answer at 0x3C; if a device is missing, it is nearly always a swapped SDA/SCL pair or a missing common ground.",
          tools: [TOOLS.usb],
          parts: [b.mcu, "oled"],
        },
        {
          title: "Exercise every input and output",
          detail: `Press each button, trigger ${sensorName.toLowerCase()}, and sound the piezo from a test sketch. Fix anything odd now, while the shell is still open.`,
          tools: [TOOLS.usb],
          parts: sensorKey ? [sensorKey, "buttons", "buzzer"] : ["buttons", "buzzer"],
        },
      ],
      assemble: [
        {
          title: "Fit the face plate",
          detail:
            "Seat the OLED behind its window, press the buttons into their bosses, and check the caps return freely. A button that binds against a printed hole feels broken long before it is.",
          tools: [TOOLS.hex, TOOLS.knife],
          parts: ["faceplate", "oled", "buttons"],
        },
      ],
      install: {
        title: "Close the shell and set it down",
        detail:
          "Drop the tray into the body, connect the face plate harness, and close the shell. Stick the rubber pads into the feet, then confirm the display is readable from where the design will actually live.",
        tools: [TOOLS.hex],
        parts: ["encdesk", "tray", "feet", "m3-kit"],
      },
    });

    return b.finish();
  },
};

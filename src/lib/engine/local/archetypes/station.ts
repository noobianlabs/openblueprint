import type { Archetype, BuildContext } from "./base";
import { choice, customNote } from "./base";
import { DesignBuilder, TOOLS, node } from "../compose";
import { hardware, part, printedPart, MCU_PROFILES } from "../part-library";
import { buildPower } from "../power";

const MEASURE = ["Temperature, humidity, pressure", "CO2 and temperature", "Particulates (PM2.5)", "VOC air quality"];
const DISPLAY = ["OLED", "E-ink (holds without power)", "No display — telemetry only"];
const POWER = ["USB-C 5V", "Battery + USB-C charging", "Solar + 18650"];

export const station: Archetype = {
  id: "station",
  label: "Sensing station",
  keywords: ["station", "monitor", "sensor", "air", "weather", "quality", "climate", "co2", "humidity", "temperature", "particulate", "pm2.5", "logger", "aqi"],
  fallbackSubject: "desktop sensing station",
  fallbackTitle: "Desktop Sensing Station",
  cover: { glyph: "◉", hueA: "#22d3ee", hueB: "#4ade80" },

  decisions(ctx) {
    return [
      `Select an ESP32-C3 for the ${ctx.subject} — a Wi-Fi radio and a deep-sleep current low enough to matter on battery.`,
      "Put every sensor that can be on I2C on one bus, so adding a channel later costs two wires rather than a redesign.",
      "Include a reference climate sensor alongside the headline measurement; most air readings are meaningless without temperature.",
      "Duty-cycle the sample loop and publish over MQTT, rather than holding a socket open between readings.",
      "Screen the sensor from the enclosure's own heat — a board that warms its own thermometer reads high forever.",
      "Print a vented sensor cage rather than drilling the case, so airflow past the element is deliberate.",
    ];
  },

  questions() {
    return [
      { id: "measure", question: "What should it measure?", options: MEASURE },
      { id: "display", question: "How should readings be shown?", options: DISPLAY },
      { id: "power", question: "Where does power come from?", options: POWER },
    ];
  },

  build(ctx: BuildContext) {
    const measure = choice(ctx, "measure", MEASURE);
    const displayChoice = choice(ctx, "display", DISPLAY);
    const powerChoice = choice(ctx, "power", POWER);

    const primaryKey = measure === 1 ? "scd40" : measure === 2 ? "pms5003" : measure === 3 ? "sgp40" : "bme280";
    const referenceKey = primaryKey === "bme280" ? "sht41" : "bme280";
    const displayKey = displayChoice === 1 ? "eink" : displayChoice === 2 ? null : "oled";
    // The particulate sensor's fan rules out a battery build, so it pins
    // the power strategy whatever else was asked for.
    const strategy =
      primaryKey === "pms5003" ? "usb5v" : powerChoice === 1 ? "lipo" : powerChoice === 2 ? "solar" : "usb5v";

    const b = new DesignBuilder("", "", []);
    b.addMcu(part("esp32c3"), MCU_PROFILES.esp32c3);
    const power = buildPower(b, strategy);

    b.add(part(primaryKey, { role: "Primary Sensor" }));
    b.add(part(referenceKey, { role: "Reference Climate Sensor" }));
    if (displayKey) b.add(part(displayKey));
    b.add(part("buttons", { name: "12mm Tactile Button", role: "Mode Button", qty: 1 }));

    if (primaryKey === "pms5003") {
      b.powerFrom("pms5003", "VCC", "5V");
      b.ground("pms5003", "GND");
      b.signal("pms5003", "TX", "UART");
      b.signal("pms5003", "SET", "sleep");
    } else {
      b.i2c(primaryKey);
    }
    b.i2c(referenceKey);
    if (displayKey === "oled") b.i2c("oled");
    if (displayKey === "eink") b.spi("eink", ["SCK", "MOSI", "CS", "DC", "BUSY"]);
    b.digital("buttons", "SIG", "mode", { gnd: "GND" });

    /* --- mechanics --- */
    b.add(part(strategy === "solar" ? "encip65" : "encdesk", { role: "Main Housing" }));
    b.add(
      printedPart({
        id: "cage",
        name: "Vented Sensor Cage",
        role: "Sensor Screen",
        description:
          "Stacked-louvre cage that shades the sensing element while letting air move past it — the difference between ambient and case temperature.",
        printSettings: "PETG · 25% infill, 0.2mm layer",
        unitCost: 2.5,
      }),
    );
    b.add(
      printedPart({
        id: "tray",
        name: "Board Tray",
        role: "Electronics Carrier",
        description: "Standoff tray holding the controller and power boards clear of the case floor for airflow.",
        printSettings: "PLA · 25% infill, 0.2mm layer",
        unitCost: 2.0,
      }),
    );
    b.add(
      printedPart({
        id: "stand",
        name: "Angled Stand",
        role: "Mount",
        description: "Wedge stand tilting the face about 15° upward, with a keyhole slot on the back for wall mounting.",
        printSettings: "PLA · 20% infill, 0.2mm layer",
        unitCost: 2.0,
      }),
    );
    b.add(
      hardware({
        id: "m3-kit",
        name: "M3 Screws + Heat-Set Inserts",
        role: "Fastener Set",
        description: "Socket-head M3 screws and brass inserts for the tray, cage, and stand.",
        qty: 12,
        unitCost: 0.2,
      }),
    );

    const enclosureId = strategy === "solar" ? "encip65" : "encdesk";
    b.assembly([
      node("stand", [
        node(enclosureId, [
          node("tray", [node(b.mcu), ...power.ids.map((id) => node(id))]),
          ...(displayKey ? [node(displayKey)] : []),
          node("buttons"),
          node("cage", [node(primaryKey), node(referenceKey)]),
          node("m3-kit"),
        ]),
      ]),
    ]);

    const primaryName = b.nameOf(primaryKey);
    const referenceName = b.nameOf(referenceKey);
    const displayClause = displayKey
      ? `Readings land on the ${b.nameOf(displayKey)} as well as the broker, so the station is legible with the network down`
      : "There is no display: the station is a telemetry source, and everything is read on the dashboard";

    b.name = ctx.title;
    b.summary =
      `This ${ctx.subject} samples on a duty cycle rather than continuously, which is what makes the battery numbers work. ` +
      `The ${primaryName} carries the headline measurement and the ${referenceName} supplies the temperature and humidity ` +
      `reference that makes it interpretable. An ESP32-C3 wakes on a timer, reads the bus, publishes over MQTT, and goes ` +
      `back to sleep. ${displayClause}. ${power.sentence}. The sensing elements sit in a printed louvre cage rather than ` +
      `behind a drilled hole, so the air they read is the room's, not the enclosure's.`;
    b.tags = [
      measure === 1 ? "CO2 MONITORING" : measure === 2 ? "PARTICULATE SENSING" : measure === 3 ? "VOC INDEX" : "CLIMATE SENSING",
      "MQTT TELEMETRY",
      power.tag,
      "DUTY CYCLED",
      displayKey === "eink" ? "E-INK DISPLAY" : displayKey ? "OLED STATUS" : "HEADLESS",
    ];

    b.assume(
      "2.4GHz Wi-Fi and an MQTT broker or dashboard endpoint to receive the telemetry",
      power.assumption,
      ...(primaryKey === "pms5003" && powerChoice !== 0
        ? ["The particulate sensor's fan rules out a battery build — this design stays on USB power whatever was asked for"]
        : []),
      "Readings are indicative, not certified — none of these sensors is a reference instrument",
      primaryKey === "scd40"
        ? "The CO2 sensor needs about a week of exposure to outdoor-equivalent air before its self-calibration settles"
        : "Sensor placement matters more than sensor choice: away from vents, doorways, and direct sun",
      ...customNote(ctx, "measure", MEASURE, "primary sensor"),
      ...customNote(ctx, "display", DISPLAY, "display"),
    );

    b.instructions({
      wiring: [
        {
          title: `Wire the ${primaryName}`,
          detail:
            primaryKey === "pms5003"
              ? "The particulate sensor talks 9600-baud serial, not I2C. Take its TX to a spare GPIO, hold SET high for continuous mode, and give it its own supply lead — the fan draws far more than the bus can carry."
              : `Add the ${primaryName} to the I2C bus with the reference sensor. Confirm the two devices do not share an address before soldering; if they do, one of them needs its address strap moved.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: [primaryKey, referenceKey, b.mcu],
        },
      ],
      bringUp: [
        {
          title: "Scan the bus and log a first sample",
          detail: `Run an I2C scan and confirm every device answers, then log one full sample set to serial. Sanity-check the numbers against a second thermometer before believing anything the ${primaryName} reports.`,
          tools: [TOOLS.usb],
          parts: [b.mcu, primaryKey, referenceKey],
        },
        {
          title: "Verify a sleep/wake/publish cycle",
          detail:
            "Watch one complete cycle: wake, sample, publish, sleep. Measure the sleep current with a multimeter in series — if it is milliamps rather than microamps, something on the bus is still powered and the battery estimate is wrong.",
          tools: [TOOLS.usb, TOOLS.multimeter],
          parts: [b.mcu, ...power.ids.slice(-1)],
        },
      ],
      assemble: [
        {
          title: "Fit the sensor cage",
          detail:
            "Mount the sensing elements inside the louvre cage with their vents clear, and keep the harness back from the controller's regulator. Any part of the case that gets warm should be on the far side of the cage from the sensor.",
          tools: [TOOLS.hex],
          parts: ["cage", primaryKey, referenceKey],
        },
      ],
      install: {
        title: "Close up and place the station",
        detail:
          "Close the case, seat it on the stand, and put it where the measurement is meaningful — away from vents, doorways, and direct sun. Leave it a full day before drawing conclusions from the first readings.",
        tools: [TOOLS.hex],
        parts: [enclosureId, "stand", "m3-kit"],
      },
    });

    return b.finish();
  },
};

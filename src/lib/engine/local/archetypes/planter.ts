import type { Archetype, BuildContext } from "./base";
import { choice, customNote } from "./base";
import { DesignBuilder, TOOLS, node } from "../compose";
import { hardware, part, printedPart, MCU_PROFILES } from "../part-library";
import { buildPower } from "../power";

const SWITCHING = ["Logic-level MOSFET", "Opto-isolated relay", "L298N H-bridge"];
const POWER = ["USB-C 5V", "12V wall adapter", "Battery + USB-C charging"];
const SENSING = ["Capacitive probe", "Gypsum resistance probe", "Capacitive probe + reservoir float"];

export const planter: Archetype = {
  id: "planter",
  label: "Irrigation",
  keywords: ["planter", "plant", "garden", "water", "watering", "soil", "irrigat", "greenhouse", "herb", "pot", "seedling", "hydro"],
  fallbackSubject: "self-watering planter",
  fallbackTitle: "Self-Watering Planter",
  cover: { glyph: "❖", hueA: "#4ade80", hueB: "#22d3ee" },

  decisions(ctx) {
    return [
      `Select an ESP32-C3 as the controller for the ${ctx.subject} — Wi-Fi for logging, and deep sleep between moisture samples.`,
      "Integrate a capacitive soil moisture probe on the ADC; a bare resistive fork corrodes within a season of wet soil.",
      "Switch the pump through a logic-level MOSFET with a flyback diode, never directly from a GPIO pin.",
      "Add an OLED so the last dose and current moisture read at a glance, without opening an app.",
      "Cap each watering dose in firmware and enforce a lockout, so a stuck sensor cannot flood the pot.",
      "Print the reservoir lid, probe stake, and pump bracket in PETG — PLA creeps and crazes in constant damp.",
    ];
  },

  questions() {
    return [
      { id: "switching", question: "How should the pump be switched?", options: SWITCHING },
      { id: "power", question: "Where does power come from?", options: POWER },
      { id: "sensing", question: "How should moisture be measured?", options: SENSING },
    ];
  },

  build(ctx: BuildContext) {
    const sw = choice(ctx, "switching", SWITCHING);
    const pw = choice(ctx, "power", POWER);
    const sense = choice(ctx, "sensing", SENSING);

    const strategy = pw === 1 ? "adapter12v" : pw === 2 ? "lipoBoost" : "usb5v";
    const pumpKey = pw === 1 ? "peristaltic" : "pump5v";
    const soilKey = sense === 1 ? "soilres" : "soilcap";
    const withFloat = sense === 2;
    const loadRail = pw === 1 ? "VIN" : "5V";

    const b = new DesignBuilder("", "", []);

    /* --- electronics --- */
    b.addMcu(part("esp32c3"), MCU_PROFILES.esp32c3);
    const power = buildPower(b, strategy);

    b.add(part(soilKey, { role: "Soil Moisture Sensor" }));
    b.add(part("oled", { role: "Status Display" }));
    b.add(part(pumpKey));
    if (withFloat) b.add(part("floatsw"));

    const driverKey = sw === 1 ? "relay" : sw === 2 ? "l298n" : "mosfet";
    b.add(part(driverKey, { role: "Pump Switch" }));

    b.i2c("oled");
    b.analogIn(soilKey, "AOUT", "moisture");
    if (withFloat) b.digital("floatsw", "SIG", "level", { gnd: "GND" });

    if (driverKey === "mosfet") {
      b.powerFrom("mosfet", "VIN", loadRail);
      b.ground("mosfet", "GND");
      b.signal("mosfet", "SIG", "gate");
      b.wire({ part: "mosfet", pin: "OUT+" }, { part: pumpKey, pin: "V+" }, "power", "pump+");
      b.wire({ part: pumpKey, pin: "V-" }, { part: "mosfet", pin: "OUT-" }, "ground");
    } else if (driverKey === "relay") {
      b.supply("relay", "VCC", "GND", "3V3");
      b.signal("relay", "IN", "coil");
      b.powerFrom("relay", "COM", loadRail);
      b.wire({ part: "relay", pin: "NO" }, { part: pumpKey, pin: "V+" }, "power", "switched");
      b.wire({ part: pumpKey, pin: "V-" }, b.railRef("GND"), "ground");
    } else {
      b.powerFrom("l298n", "12V", loadRail);
      b.ground("l298n", "GND");
      b.signal("l298n", "IN1", "dir");
      b.signal("l298n", "ENA", "PWM");
      b.wire({ part: "l298n", pin: "OUT1" }, { part: pumpKey, pin: "V+" }, "power", "pump+");
      b.wire({ part: pumpKey, pin: "V-" }, { part: "l298n", pin: "OUT2" }, "ground");
    }

    /* --- mechanics --- */
    b.add(part("encsealed", { role: "Electronics Housing" }));
    b.add(
      printedPart({
        id: "lid",
        name: "Reservoir Lid",
        role: "Tank Cover",
        description:
          "Snap-on lid for a 2L reservoir, carrying the electronics box, a tube pass-through, and a fill port that keeps light off the water.",
        printSettings: "PETG · 25% infill, 0.2mm layer",
        unitCost: 4.0,
      }),
    );
    b.add(
      printedPart({
        id: "stake",
        name: "Probe Stake",
        role: "Sensor Mount",
        description:
          "Ribbed stake holding the probe at a fixed depth with its electronics above the soil line — the depth is what makes readings comparable day to day.",
        printSettings: "PETG · 40% infill, 0.2mm layer",
        unitCost: 1.5,
      }),
    );
    b.add(
      printedPart({
        id: "pump-bracket",
        name: "Pump Bracket",
        role: "Pump Mount",
        description: "Clamp holding the pump upright against the reservoir wall so its inlet stays below the float trip point.",
        printSettings: "PETG · 40% infill, 0.2mm layer",
        unitCost: 2.0,
      }),
    );
    b.add(
      hardware({
        id: "tubing",
        name: "6mm Silicone Tubing",
        role: "Water Line",
        description: "One metre of food-grade silicone from the pump outlet to the soil, cut to length on assembly.",
        qty: 1,
        unitCost: 3.0,
      }),
    );
    b.add(
      hardware({
        id: "m3-kit",
        name: "M3 Screws + Heat-Set Inserts",
        role: "Fastener Set",
        description: "Socket-head M3 screws and brass inserts for every printed joint.",
        qty: 12,
        unitCost: 0.2,
      }),
    );

    b.assembly([
      node("lid", [
        node("encsealed", [
          node(b.mcu),
          node("oled"),
          node(driverKey),
          ...power.ids.map((id) => node(id)),
          node("m3-kit"),
        ]),
        node("pump-bracket", [node(pumpKey)]),
        node("tubing"),
        ...(withFloat ? [node("floatsw")] : []),
        node("stake", [node(soilKey)]),
      ]),
    ]);

    /* --- narrative --- */
    const driverName = b.nameOf(driverKey);
    const pumpName = b.nameOf(pumpKey);
    const probeName = b.nameOf(soilKey);

    b.name = ctx.title;
    b.summary =
      `This ${ctx.subject} keeps one pot inside a moisture band instead of on a schedule. ` +
      `The ${probeName} is read on the ADC every few minutes; when the reading crosses the dry threshold and the ` +
      `lockout has expired, the ESP32-C3 opens the ${driverName} for a measured dose from the ${pumpName} and logs it over Wi-Fi. ` +
      `${power.sentence}. The OLED shows current moisture and time since the last watering, and every dose is ` +
      `capped in firmware so a failed probe drains the reservoir slowly rather than drowning the plant.`;
    b.tags = [
      "SOIL SENSING",
      "AUTOMATIC WATERING",
      power.tag,
      "DOSE LOCKOUT",
      withFloat ? "DRY-RUN PROTECTED" : "OLED STATUS",
    ];

    b.assume(
      "A pot that drains — closed-bottom planters waterlog whatever the firmware does",
      "A 1–2L reservoir sitting below the pot rim, refilled by hand",
      power.assumption,
      "2.4GHz Wi-Fi in range if you want the watering log off the device",
      ...customNote(ctx, "switching", SWITCHING, "pump switch"),
      ...customNote(ctx, "sensing", SENSING, "moisture sensor"),
    );

    b.instructions({
      wiring: [
        {
          title: "Wire the pump switch",
          detail:
            driverKey === "relay"
              ? `Feed the relay coil from 3.3V and its contact side from the load rail, then run the ${pumpName} through the normally-open contact. Confirm the coil pulls in at 3.3V before trusting it — some modules need 5V.`
              : driverKey === "l298n"
                ? `Bring the load rail into the L298N supply input, tie the grounds, and take the pump off OUT1/OUT2. Drive ENA with PWM so the dose rate is adjustable rather than full-on.`
                : `Put the MOSFET in the pump's ground leg: load rail to the pump's positive, pump negative to the drain terminal, gate to the controller through the module's series resistor. The flyback diode across the pump is not optional with an inductive load.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: [driverKey, pumpKey, b.mcu],
        },
        {
          title: "Wire the probe and level sensing",
          detail: withFloat
            ? `Run the ${probeName} to the ADC on shielded or twisted pair, and the float switch to a GPIO with the internal pull-up enabled. Keep both leads away from the pump wiring — the motor's switching noise lands squarely in the analog reading.`
            : `Run the ${probeName} to the ADC on twisted pair with its own ground return. Keep it away from the pump wiring; motor noise couples straight into the analog reading if they share a bundle.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: withFloat ? [soilKey, "floatsw", b.mcu] : [soilKey, b.mcu],
        },
      ],
      bringUp: [
        {
          title: "Calibrate dry and wet",
          detail:
            "Read the probe in air, then in a glass of water, and record both counts as the calibration endpoints. Repeat in the actual soil once it is planted — substrate density shifts the curve more than most people expect.",
          tools: [TOOLS.usb],
          parts: [soilKey, b.mcu],
        },
        {
          title: "Prime the line and time a dose",
          detail: `Fill the reservoir, prime the ${pumpName} until the line runs bubble-free, then time a five-second dose into a measuring cup. Set the millilitres-per-second constant from that number, not from the pump's datasheet.`,
          tools: [TOOLS.usb, TOOLS.scale],
          parts: [pumpKey, "tubing", driverKey],
        },
      ],
      assemble: [
        {
          title: "Mount the pump and plumb the line",
          detail:
            "Clamp the pump to its bracket low in the reservoir, route the tube through the lid's pass-through, and leave a drip loop so water cannot wick back along the cable into the enclosure.",
          tools: [TOOLS.hex, TOOLS.cutters],
          parts: ["pump-bracket", pumpKey, "tubing", "lid"],
        },
      ],
      install: {
        title: "Set the stake and fill the reservoir",
        detail:
          "Push the stake in halfway between the stem and the pot wall, at the depth you calibrated. Fill the reservoir, run one manual dose, and check nothing drips onto the electronics box before leaving it alone for a week.",
        tools: [TOOLS.hex],
        parts: ["stake", soilKey, "encsealed"],
      },
    });

    return b.finish();
  },
};

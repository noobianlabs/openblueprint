import type { Archetype, BuildContext } from "./base";
import { choice, customNote } from "./base";
import { DesignBuilder, TOOLS, node } from "../compose";
import { hardware, part, printedPart, MCU_PROFILES } from "../part-library";
import { buildPower } from "../power";

const ACTUATOR = ["Micro servo", "Metal-gear servo", "Geared stepper", "12V solenoid latch"];
const TRIGGER = ["RFID collar tag", "Scheduled (RTC)", "Presence (PIR)", "Manual button"];
const POWER = ["USB-C 5V", "12V wall adapter", "4×AA cells"];

export const gadget: Archetype = {
  id: "gadget",
  label: "Actuated gadget",
  keywords: ["door", "lock", "latch", "feeder", "dispenser", "opener", "curtain", "blind", "valve", "cat", "pet", "hatch", "gate", "flap", "treat"],
  fallbackSubject: "actuated hatch",
  fallbackTitle: "Actuated Hatch",
  cover: { glyph: "⎔", hueA: "#fb923c", hueB: "#a78bfa" },

  decisions(ctx) {
    return [
      `Select an ESP32-C3 for the ${ctx.subject} — enough IO for the actuator, the trigger, and a position sensor, with Wi-Fi for the log.`,
      "Sense the closed position with a hall switch and a magnet rather than trusting the actuator's commanded angle.",
      "Give the mechanism a hard mechanical stop, so a runaway command jams against plastic instead of stripping a gearbox.",
      "Fail safe on power loss: the resting state is the one that is safe to be in when nothing is powered.",
      "Keep the actuator rail separate from the logic rail — the inrush on a stalled motor will otherwise reset the controller.",
      "Log every open with its trigger, so an unexplained cycle can be traced rather than guessed at.",
    ];
  },

  questions() {
    return [
      { id: "actuator", question: "What moves the mechanism?", options: ACTUATOR },
      { id: "trigger", question: "What decides when it opens?", options: TRIGGER },
      { id: "power", question: "Where does power come from?", options: POWER },
    ];
  },

  build(ctx: BuildContext) {
    const actuatorChoice = choice(ctx, "actuator", ACTUATOR);
    const triggerChoice = choice(ctx, "trigger", TRIGGER);
    const powerChoice = choice(ctx, "power", POWER);

    const solenoid = actuatorChoice === 3;
    const stepper = actuatorChoice === 2;
    const actuatorKey = solenoid ? "solenoid" : stepper ? "stepper28byj" : actuatorChoice === 1 ? "mg996r" : "sg90";
    const triggerKey = triggerChoice === 1 ? "ds3231" : triggerChoice === 2 ? "pir" : triggerChoice === 3 ? "buttons" : "rc522";
    // A 12V solenoid forces the adapter regardless of what was asked for.
    const strategy = solenoid ? "adapter12v" : powerChoice === 1 ? "adapter12v" : powerChoice === 2 ? "aa" : "usb5v";
    const actuatorRail = strategy === "adapter12v" && solenoid ? "VIN" : "5V";

    const b = new DesignBuilder("", "", []);
    b.addMcu(part("esp32c3"), MCU_PROFILES.esp32c3);
    const power = buildPower(b, strategy);

    b.add(part(actuatorKey, { role: solenoid ? "Lock Actuator" : "Mechanism Actuator" }));
    if (stepper) b.add(part("uln2003"));
    if (solenoid) b.add(part("mosfet", { role: "Solenoid Switch" }));
    b.add(part(triggerKey, { role: "Trigger Input" }));
    b.add(part("hall", { role: "Closed-Position Sensor" }));
    b.add(part("buzzer", { role: "Cycle Cue" }));

    if (solenoid) {
      b.powerFrom("mosfet", "VIN", actuatorRail, "12V");
      b.ground("mosfet", "GND");
      b.signal("mosfet", "SIG", "gate");
      b.wire({ part: "mosfet", pin: "OUT+" }, { part: "solenoid", pin: "V+" }, "power", "12V");
      b.wire({ part: "solenoid", pin: "V-" }, { part: "mosfet", pin: "OUT-" }, "ground");
    } else if (stepper) {
      b.powerFrom("uln2003", "VCC", actuatorRail);
      b.ground("uln2003", "GND");
      b.signal("uln2003", "IN1", "step A");
      b.signal("uln2003", "IN2", "step B");
      b.signal("uln2003", "IN3", "step C");
      b.signal("uln2003", "IN4", "step D");
      b.wire({ part: "uln2003", pin: "OUT-A" }, { part: "stepper28byj", pin: "A" }, "power", "coil A");
      b.wire({ part: "uln2003", pin: "OUT-B" }, { part: "stepper28byj", pin: "B" }, "power", "coil B");
      b.wire({ part: "uln2003", pin: "OUT-C" }, { part: "stepper28byj", pin: "C" }, "power", "coil C");
      b.wire({ part: "uln2003", pin: "OUT-D" }, { part: "stepper28byj", pin: "D" }, "power", "coil D");
      b.wire({ part: "stepper28byj", pin: "COM" }, { part: "uln2003", pin: "OUT-COM" }, "power", "common");
    } else {
      b.powerFrom(actuatorKey, "VCC", actuatorRail);
      b.ground(actuatorKey, "GND");
      b.signal(actuatorKey, "SIG", "PWM");
    }

    if (triggerKey === "rc522") {
      b.spi("rc522", ["SCK", "MOSI", "MISO", "SS"]);
      b.powerFrom("rc522", "RST", "3V3", "held high");
    }
    else if (triggerKey === "ds3231") b.i2c("ds3231");
    else if (triggerKey === "pir") b.digital("pir", "OUT", "presence", { vcc: "VCC" });
    else b.digital("buttons", "SIG", "input", { gnd: "GND" });

    b.digital("hall", "OUT", "closed", { vcc: "VCC" });
    b.digital("buzzer", "SIG", "PWM", { gnd: "GND" });

    /* --- mechanics --- */
    b.add(part("encdesk", { role: "Electronics Housing" }));
    b.add(
      printedPart({
        id: "mount-plate",
        name: "Mount Plate",
        role: "Structural Backplate",
        description:
          "Backplate carrying the actuator, the enclosure, and the hard stop, with slotted holes so the mechanism can be shimmed square after fitting.",
        printSettings: "PETG · 40% infill, 0.2mm layer, 4 perimeters",
        unitCost: 4.0,
      }),
    );
    b.add(
      printedPart({
        id: "latch-arm",
        name: "Latch Arm",
        role: "Moving Linkage",
        description:
          "Printed arm on the output shaft, with a magnet pocket at the closed end so the hall switch confirms position rather than inferring it.",
        printSettings: "PETG · 60% infill, 0.2mm layer, 5 perimeters",
        unitCost: 1.5,
      }),
    );
    b.add(
      printedPart({
        id: "guide",
        name: "Guide and Hard Stop",
        role: "Travel Limiter",
        description: "Guide channel that constrains the arm and stops it dead at both ends, so a bad command jams against plastic.",
        printSettings: "PETG · 50% infill, 0.2mm layer",
        unitCost: 1.2,
      }),
    );
    b.add(
      hardware({
        id: "magnet-kit",
        name: "6mm Neodymium Magnets",
        role: "Position Marker",
        description: "Press-fit magnets for the latch arm's closed position, plus a spare for calibration.",
        qty: 2,
        unitCost: 0.5,
      }),
    );
    b.add(
      hardware({
        id: "m3-kit",
        name: "M3 Screws + Heat-Set Inserts",
        role: "Fastener Set",
        description: "Socket-head M3 screws and brass inserts joining the plate, guide, and enclosure.",
        qty: 14,
        unitCost: 0.2,
      }),
    );

    b.assembly([
      node("mount-plate", [
        node("encdesk", [
          node(b.mcu),
          node(triggerKey),
          node("buzzer"),
          ...(stepper ? [node("uln2003")] : []),
          ...(solenoid ? [node("mosfet")] : []),
          ...power.ids.map((id) => node(id)),
        ]),
        node(actuatorKey, [node("latch-arm", [node("magnet-kit")])]),
        node("guide", [node("hall")]),
        node("m3-kit"),
      ]),
    ]);

    const actuatorName = b.nameOf(actuatorKey);
    const triggerName = b.nameOf(triggerKey);
    const triggerClause =
      triggerKey === "rc522"
        ? "An RFID reader checks the presented tag against an allow-list before anything moves"
        : triggerKey === "ds3231"
          ? "A battery-backed RTC drives the schedule, so the cycle happens whether or not the network is up"
          : triggerKey === "pir"
            ? "A PIR sensor watches the approach and opens on presence, with a hold-off so one visit is one cycle"
            : "A panel button starts a cycle, and the network can start one remotely";

    b.name = ctx.title;
    b.summary =
      `This ${ctx.subject} moves one mechanism reliably and knows where that mechanism actually is. The ` +
      `${actuatorName} drives a printed latch arm inside a guide with hard stops at both ends, and a hall switch ` +
      `reading a magnet in the arm confirms the closed position rather than trusting a commanded angle. ` +
      `${triggerClause}. ${power.sentence}, with the actuator on its own rail so a stall cannot reset the controller. ` +
      `Every cycle is logged with the trigger that caused it, and the resting state on power loss is the safe one.`;
    b.tags = [
      solenoid ? "SOLENOID LATCH" : stepper ? "STEPPER DRIVEN" : "SERVO DRIVEN",
      triggerKey === "rc522" ? "TAG AUTHENTICATED" : triggerKey === "ds3231" ? "SCHEDULED" : "TRIGGERED",
      "POSITION SENSED",
      power.tag,
      "FAIL SAFE",
    ];

    b.assume(
      "A flat surface to fasten the mount plate to, with clearance for the arm's full travel",
      power.assumption,
      solenoid && powerChoice !== 1
        ? "The 12V solenoid needs the 12V adapter regardless of the power option chosen — a 5V rail will not pull the bolt"
        : "The mechanism is sized for a light door or hatch, not for anything load-bearing",
      "This is a convenience mechanism, not a security device: treat the printed parts as the weakest link they are",
      ...customNote(ctx, "actuator", ACTUATOR, "actuator"),
      ...customNote(ctx, "trigger", TRIGGER, "trigger"),
    );

    b.instructions({
      wiring: [
        {
          title: "Wire the actuator",
          detail: solenoid
            ? "Put the MOSFET in the solenoid's ground leg with the 12V rail on the coil's positive. The flyback diode across the coil is mandatory — without it the switching spike will take out the MOSFET, and probably the controller with it."
            : stepper
              ? "Wire the coil harness to the driver board in its labelled order and the common lead to COM. A swapped pair does not fail loudly; it just makes the motor buzz and refuse to turn."
              : `Feed the ${actuatorName} from the actuator rail, not from the controller's regulator, and take its signal lead to a PWM-capable pin. Tie the grounds at a single point near the supply.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: [actuatorKey, ...(stepper ? ["uln2003"] : []), ...(solenoid ? ["mosfet"] : []), b.mcu],
        },
        {
          title: "Wire the trigger and position sensor",
          detail: `Run the ${triggerName} to the controller, then mount the hall switch where the arm's magnet passes closest at the closed position. Get the gap right on the bench — under about 5mm for a 6mm magnet — because it is awkward to adjust once the plate is mounted.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: [triggerKey, "hall", b.mcu],
        },
      ],
      bringUp: [
        {
          title: "Find the travel limits",
          detail:
            "Drive the mechanism slowly by hand from firmware and record the positions where the arm meets each hard stop. Set the software limits inside those, so the actuator never pushes against the stop continuously.",
          tools: [TOOLS.usb],
          parts: [actuatorKey, "guide", "latch-arm"],
        },
        {
          title: "Verify the position sensor and one full cycle",
          detail: `Confirm the hall switch reads closed only when the arm is genuinely closed, then run a complete cycle from a real ${triggerName.toLowerCase()} event. Cut power mid-cycle and check the mechanism ends up in the safe state.`,
          tools: [TOOLS.usb, TOOLS.multimeter],
          parts: ["hall", triggerKey, actuatorKey],
        },
      ],
      assemble: [
        {
          title: "Fit the linkage",
          detail:
            "Press the magnet into the arm pocket, fit the arm to the output shaft at the angle you recorded, and check it sweeps the full travel without touching anything but the stops. Shim the plate until the motion is square.",
          tools: [TOOLS.hex, TOOLS.pliers],
          parts: ["latch-arm", "magnet-kit", actuatorKey, "guide"],
        },
      ],
      install: {
        title: "Mount the plate and cycle it in place",
        detail:
          "Fasten the mount plate where the mechanism will live, dress the harness clear of the arm's sweep, and run a dozen cycles while watching it. Anything that rubs now will be worn through in a month.",
        tools: [TOOLS.hex],
        parts: ["mount-plate", "encdesk", "m3-kit"],
      },
    });

    return b.finish();
  },
};

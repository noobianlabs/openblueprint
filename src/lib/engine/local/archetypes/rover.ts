import type { Archetype, BuildContext } from "./base";
import { choice, customNote } from "./base";
import { DesignBuilder, TOOLS, node } from "../compose";
import { hardware, part, printedPart, MCU_PROFILES } from "../part-library";
import { buildPower } from "../power";

const DRIVE = ["TB6612FNG dual driver", "DRV8833 low-voltage driver", "L298N H-bridge", "Continuous-rotation servos"];
const NAV = ["Ultrasonic ranger", "Laser time-of-flight", "IR line-follow array", "Bump switches only"];
const POWER = ["2S Li-ion pack", "4×AA cells", "USB power bank"];

export const rover: Archetype = {
  id: "rover",
  label: "Wheeled robot",
  keywords: ["rover", "robot", "follower", "car", "tank", "bot", "drive", "wheel", "chassis", "crawler", "buggy", "line-follow"],
  fallbackSubject: "two-wheeled rover",
  fallbackTitle: "Two-Wheel Rover",
  cover: { glyph: "◫", hueA: "#f87171", hueB: "#fbbf24" },

  decisions(ctx) {
    return [
      `Select an ESP32-S3 for the ${ctx.subject} — two cores means the drive loop keeps running while the radio talks.`,
      "Drive the pair of gearmotors through a MOSFET H-bridge; a bipolar bridge throws away nearly two volts as heat.",
      "Separate the motor rail from the logic rail behind a buck converter, so a stall cannot brown out the controller.",
      "Add a forward-looking range sensor and treat anything closer than the stopping distance as a hard stop.",
      "Put the battery low and between the axles — a rover that tips on braking is a chassis problem, not a firmware one.",
      "Print the chassis flat with the deck as a separate part, so the electronics layout can change without a 4-hour reprint.",
    ];
  },

  questions() {
    return [
      { id: "drive", question: "How should the motors be driven?", options: DRIVE },
      { id: "nav", question: "How should it sense what is ahead?", options: NAV },
      { id: "power", question: "Where does power come from?", options: POWER },
    ];
  },

  build(ctx: BuildContext) {
    const driveChoice = choice(ctx, "drive", DRIVE);
    const navChoice = choice(ctx, "nav", NAV);
    const powerChoice = choice(ctx, "power", POWER);

    const strategy = powerChoice === 1 ? "aa" : powerChoice === 2 ? "powerbank" : "pack2s";
    const servoDrive = driveChoice === 3;
    const driverKey = driveChoice === 1 ? "drv8833" : driveChoice === 2 ? "l298n" : "tb6612";
    const motorKey = servoDrive ? "crservo" : powerChoice === 1 ? "ttmotor" : "n20motor";
    const navKey = navChoice === 1 ? "vl53l0x" : navChoice === 2 ? "irarray" : navChoice === 3 ? "bumper" : "hcsr04";
    const motorRail = powerChoice === 2 ? "5V" : "VIN";

    const b = new DesignBuilder("", "", []);
    b.addMcu(part("esp32s3"), MCU_PROFILES.esp32s3);
    const power = buildPower(b, strategy);

    b.add(part(motorKey));
    if (!servoDrive) b.add(part(driverKey));
    b.add(part(navKey));
    b.add(part("buttons", { role: "Run/Stop Input", qty: 2 }));

    /* --- drivetrain wiring --- */
    if (servoDrive) {
      b.powerFrom(motorKey, "VCC", "5V");
      b.ground(motorKey, "GND");
      b.signal(motorKey, "SIG-L", "PWM L");
      b.signal(motorKey, "SIG-R", "PWM R");
    } else if (driverKey === "tb6612") {
      b.powerFrom("tb6612", "VM", motorRail, "motor rail");
      b.powerFrom("tb6612", "VCC", "3V3");
      b.powerFrom("tb6612", "STBY", "3V3");
      b.ground("tb6612", "GND");
      b.signal("tb6612", "AIN1", "dir L");
      b.signal("tb6612", "BIN1", "dir R");
      b.signal("tb6612", "PWMA", "PWM L");
      b.signal("tb6612", "PWMB", "PWM R");
      b.wire({ part: "tb6612", pin: "AO1" }, { part: motorKey, pin: "A+" }, "power", "motor L");
      b.wire({ part: motorKey, pin: "A-" }, { part: "tb6612", pin: "AO2" }, "ground");
      b.wire({ part: "tb6612", pin: "BO1" }, { part: motorKey, pin: "B+" }, "power", "motor R");
      b.wire({ part: motorKey, pin: "B-" }, { part: "tb6612", pin: "BO2" }, "ground");
    } else if (driverKey === "drv8833") {
      b.powerFrom("drv8833", "VM", motorRail, "motor rail");
      b.ground("drv8833", "GND");
      b.signal("drv8833", "AIN1", "PWM L");
      b.signal("drv8833", "AIN2", "dir L");
      b.signal("drv8833", "BIN1", "PWM R");
      b.signal("drv8833", "BIN2", "dir R");
      b.wire({ part: "drv8833", pin: "AO1" }, { part: motorKey, pin: "A+" }, "power", "motor L");
      b.wire({ part: motorKey, pin: "A-" }, { part: "drv8833", pin: "AO2" }, "ground");
      b.wire({ part: "drv8833", pin: "BO1" }, { part: motorKey, pin: "B+" }, "power", "motor R");
      b.wire({ part: motorKey, pin: "B-" }, { part: "drv8833", pin: "BO2" }, "ground");
    } else {
      b.powerFrom("l298n", "12V", motorRail, "motor rail");
      b.ground("l298n", "GND");
      b.signal("l298n", "IN1", "dir L");
      b.signal("l298n", "IN3", "dir R");
      b.signal("l298n", "ENA", "PWM L");
      b.signal("l298n", "ENB", "PWM R");
      b.wire({ part: "l298n", pin: "OUT1" }, { part: motorKey, pin: "A+" }, "power", "motor L");
      b.wire({ part: motorKey, pin: "A-" }, { part: "l298n", pin: "OUT2" }, "ground");
      b.wire({ part: "l298n", pin: "OUT3" }, { part: motorKey, pin: "B+" }, "power", "motor R");
      b.wire({ part: motorKey, pin: "B-" }, { part: "l298n", pin: "OUT4" }, "ground");
    }

    /* --- sensing --- */
    if (navKey === "hcsr04") {
      b.powerFrom("hcsr04", "VCC", "5V");
      b.ground("hcsr04", "GND");
      b.signal("hcsr04", "TRIG", "trigger");
      b.signal("hcsr04", "ECHO", "echo");
    } else if (navKey === "vl53l0x") {
      b.i2c("vl53l0x");
    } else if (navKey === "irarray") {
      b.supply("irarray", "VCC", "GND", "3V3");
      b.signal("irarray", "OUT1", "left");
      b.signal("irarray", "OUT2", "centre");
      b.signal("irarray", "OUT3", "right");
    } else {
      b.digital("bumper", "SIG", "bump", { gnd: "GND" });
    }
    b.digital("buttons", "SIG", "run/stop", { gnd: "GND" });

    /* --- mechanics --- */
    b.add(
      printedPart({
        id: "chassis",
        name: "Chassis Plate",
        role: "Structural Base",
        description:
          "Flat base carrying the motor pockets, caster boss, and a slotted battery bay between the axles to keep the mass low.",
        printSettings: "PETG · 30% infill, 0.2mm layer, 4 perimeters",
        unitCost: 5.0,
      }),
    );
    b.add(
      printedPart({
        id: "motor-mount",
        name: "Motor Clamp",
        role: "Drivetrain Mount",
        description: "Split clamp holding each gearbox square to the chassis; misalignment here shows up as a permanent drift.",
        printSettings: "PETG · 50% infill, 0.2mm layer",
        unitCost: 1.2,
        qty: 2,
      }),
    );
    b.add(
      printedPart({
        id: "wheels",
        name: "Wheels with TPU Tyres",
        role: "Traction",
        description: "Rigid hubs printed to the motor's D-shaft with separately printed TPU tyres pressed on for grip.",
        printSettings: "PETG hub + TPU tyre · 40% infill, 0.2mm layer",
        unitCost: 2.5,
        qty: 2,
      }),
    );
    b.add(
      printedPart({
        id: "caster",
        name: "Ball Caster",
        role: "Third Contact",
        description: "Printed socket for a 12mm steel ball, giving a low-friction third point without a second driven axle.",
        printSettings: "PETG · 40% infill, 0.2mm layer",
        unitCost: 1.0,
      }),
    );
    b.add(
      printedPart({
        id: "deck",
        name: "Electronics Deck",
        role: "Upper Platform",
        description: "Standoff-mounted upper plate carrying the controller and driver, with the range sensor at the front edge.",
        printSettings: "PLA · 25% infill, 0.2mm layer",
        unitCost: 3.0,
      }),
    );
    b.add(
      hardware({
        id: "m3-kit",
        name: "M3 Hardware + Standoffs",
        role: "Fastener Set",
        description: "M3 screws, nylon standoffs, and heat-set inserts joining the deck to the chassis.",
        qty: 16,
        unitCost: 0.2,
      }),
    );

    b.assembly([
      node("chassis", [
        node("motor-mount", [node(motorKey, [node("wheels")])]),
        node("caster"),
        ...power.ids.map((id) => node(id)),
        node("deck", [
          node(b.mcu),
          ...(servoDrive ? [] : [node(driverKey)]),
          node(navKey),
          node("buttons"),
        ]),
        node("m3-kit"),
      ]),
    ]);

    const navName = b.nameOf(navKey);
    const driveName = servoDrive ? b.nameOf(motorKey) : b.nameOf(driverKey);

    b.name = ctx.title;
    b.summary =
      `This ${ctx.subject} is a differential-drive platform: two gearmotors on a printed chassis with a ball caster ` +
      `as the third contact, so it turns on the spot. The ESP32-S3 runs the drive loop on one core and the radio on ` +
      `the other, taking speed and direction commands over Wi-Fi. Steering comes from the ${driveName}, and the ` +
      `${navName} at the front edge gives the stop condition — anything inside the stopping distance halts the drive ` +
      `before the firmware decides what to do about it. ${power.sentence}, and the pack sits low between the axles so ` +
      `hard braking does not tip it forward.`;
    b.tags = [
      "DIFFERENTIAL DRIVE",
      navChoice === 2 ? "LINE FOLLOWING" : "OBSTACLE AVOIDANCE",
      power.tag,
      "WI-FI CONTROLLED",
      "PRINTED CHASSIS",
    ];

    b.assume(
      "A smooth indoor floor — printed wheels and a ball caster do not cope with deep carpet or thresholds",
      power.assumption,
      "2.4GHz Wi-Fi in range, or an ESP-NOW peer, for anything beyond an autonomous loop",
      "A 12mm steel ball for the caster socket, which is not printable",
      ...customNote(ctx, "drive", DRIVE, "motor driver"),
      ...customNote(ctx, "nav", NAV, "obstacle sensor"),
    );

    b.instructions({
      wiring: [
        {
          title: "Wire the drivetrain",
          detail: servoDrive
            ? "Take both servo signal leads to their own PWM pins and feed the servos from the 5V rail rather than the controller's regulator — a stalled servo will pull more than the board can source."
            : `Bring the motor rail into the ${driveName} supply input, tie its ground to the logic ground at a single point, and take the motors off the output pairs. Wire the left motor to channel A and the right to channel B, and expect to swap one pair's polarity after the first direction test.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: servoDrive ? [motorKey, b.mcu] : [driverKey, motorKey, b.mcu],
        },
        {
          title: "Wire sensing and the run switch",
          detail:
            navKey === "hcsr04"
              ? "The ultrasonic module wants 5V, and its echo pin returns 5V — put a divider on that line before it reaches a 3.3V input. Mount the run/stop buttons where you can reach them while the rover is moving."
              : `Run the ${navName} to the controller on its own short harness, kept clear of the motor leads. Motor brush noise is the usual cause of phantom readings. Mount the run/stop buttons within reach of a moving rover.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: [navKey, "buttons", b.mcu],
        },
      ],
      bringUp: [
        {
          title: "Check motor direction and trim",
          detail:
            "With the chassis on blocks, command each side forward on its own. Swap the leads on whichever side runs backwards, then drive both at equal duty and note the drift — the trim constant that removes it belongs in firmware, not in a bent axle.",
          tools: [TOOLS.usb],
          parts: [motorKey, ...(servoDrive ? [] : [driverKey])],
        },
        {
          title: "Calibrate the stop distance",
          detail: `Roll the rover at full speed toward a wall and measure how far it travels after the ${navName} first sees it. Set the stop threshold above that figure with margin; a sensor that reads correctly but too late is indistinguishable from one that failed.`,
          tools: [TOOLS.usb],
          parts: [navKey, b.mcu],
        },
      ],
      assemble: [
        {
          title: "Build up the drivetrain",
          detail:
            "Clamp the motors into their mounts, press the tyres onto the hubs, and fit the wheels to the D-shafts. Drop the steel ball into the caster socket last — it will fall out of an upturned chassis every time otherwise.",
          tools: [TOOLS.hex, TOOLS.pliers],
          parts: ["motor-mount", motorKey, "wheels", "caster", "chassis"],
        },
      ],
      install: {
        title: "Fit the deck and balance the rover",
        detail:
          "Stand the deck on its standoffs, route the motor harness away from the wheels, and set the battery position so the rover sits level and does not lift a wheel under acceleration. Then drive it, gently, at floor level.",
        tools: [TOOLS.hex],
        parts: ["deck", "m3-kit", ...power.ids.slice(0, 1)],
      },
    });

    return b.finish();
  },
};

import type { Archetype, BuildContext } from "./base";
import { choice, customNote } from "./base";
import { DesignBuilder, TOOLS, node } from "../compose";
import { hardware, part, printedPart, MCU_PROFILES } from "../part-library";
import { buildPower } from "../power";

const START = ["Flip the cube (IMU)", "Capacitive touch", "Panel buttons"];
const READOUT = ["OLED", "4-digit segment display", "LED progress ring"];
const ALERT = ["Piezo buzzer", "Silent haptic", "Buzzer and haptic"];

export const timer: Archetype = {
  id: "timer",
  label: "Timer cube",
  keywords: ["timer", "pomodoro", "countdown", "clock", "stopwatch", "interval", "focus", "cube", "session"],
  fallbackSubject: "pomodoro timer cube",
  fallbackTitle: "Pomodoro Timer Cube",
  cover: { glyph: "◷", hueA: "#a78bfa", hueB: "#22d3ee" },

  decisions(ctx) {
    return [
      `Select an RP2040 for the ${ctx.subject} — no radio to manage, and timing that stays exact while the display refreshes.`,
      "Detect the active face from an accelerometer rather than a switch; there is nothing to wear out and no orientation to get wrong.",
      "Keep the running deadline in an RTC, so a knocked cable does not silently reset a session that looks fine.",
      "Debounce the face change over a couple of seconds — a cube nudged while reaching for a pen should not start a session.",
      "Signal the end with a short, quiet cue rather than an alarm; this sits on a desk, next to a person.",
      "Print the shell in two halves split along an edge, so the seam disappears into the geometry.",
    ];
  },

  questions() {
    return [
      { id: "start", question: "How should a session start?", options: START },
      { id: "readout", question: "How should time be shown?", options: READOUT },
      { id: "alert", question: "How should it signal the end?", options: ALERT },
    ];
  },

  build(ctx: BuildContext) {
    const startChoice = choice(ctx, "start", START);
    const readoutChoice = choice(ctx, "readout", READOUT);
    const alertChoice = choice(ctx, "alert", ALERT);

    const inputKey = startChoice === 1 ? "ttp223" : startChoice === 2 ? "buttons" : "mpu6050";
    const readoutKey = readoutChoice === 1 ? "segdisplay" : readoutChoice === 2 ? "ws2812ring" : "oled";
    const buzz = alertChoice !== 1;
    const haptic = alertChoice !== 0;

    const b = new DesignBuilder("", "", []);
    b.addMcu(part("rp2040"), MCU_PROFILES.rp2040);
    const power = buildPower(b, "lipoBoost");

    b.add(part(inputKey, inputKey === "mpu6050" ? { role: "Face Detector" } : { role: "Session Input" }));
    b.add(part(readoutKey, { role: "Time Readout" }));
    b.add(part("ds3231", { role: "Deadline Keeper" }));
    if (buzz) b.add(part("buzzer", { role: "End-of-Session Cue" }));
    if (haptic) b.add(part("vibemotor", { role: "Silent Cue" }));

    if (inputKey === "mpu6050") b.i2c("mpu6050");
    else if (inputKey === "ttp223") b.digital("ttp223", "OUT", "touch", { vcc: "VCC" });
    else b.digital("buttons", "SIG", "input", { gnd: "GND" });

    if (readoutKey === "ws2812ring") {
      b.powerFrom("ws2812ring", "5V", "5V");
      b.ground("ws2812ring", "GND");
      b.signal("ws2812ring", "DIN", "WS2812");
    } else {
      b.i2c(readoutKey);
    }
    b.i2c("ds3231");
    if (buzz) b.digital("buzzer", "SIG", "PWM", { gnd: "GND" });
    if (haptic) {
      b.signal("vibemotor", "V+", "haptic");
      b.ground("vibemotor", "V-");
    }

    /* --- mechanics --- */
    b.add(
      printedPart({
        id: "shell-lower",
        name: "Cube Shell — Lower",
        role: "Body",
        description: "Lower half of the cube, carrying the board tray, cell pocket, and the USB-C cut-out on the base face.",
        printSettings: "PLA · 20% infill, 0.2mm layer, 3 perimeters",
        unitCost: 3.5,
      }),
    );
    b.add(
      printedPart({
        id: "shell-upper",
        name: "Cube Shell — Upper",
        role: "Body",
        description: "Upper half split along an edge so the seam reads as geometry, with a recess for the readout window.",
        printSettings: "PLA · 20% infill, 0.2mm layer, 3 perimeters",
        unitCost: 3.5,
      }),
    );
    b.add(
      printedPart({
        id: "window",
        name: "Readout Window",
        role: "Optics",
        description: "Flush translucent insert over the readout, printed thin enough to pass the display and thick enough to hide it when dark.",
        printSettings: "White PLA · 100% infill, 0.15mm layer, 0.8mm thick",
        unitCost: 0.8,
      }),
    );
    b.add(
      hardware({
        id: "m3-kit",
        name: "M3 Screws + Heat-Set Inserts",
        role: "Fastener Set",
        description: "Short M3 screws and brass inserts joining the two shell halves and the internal tray.",
        qty: 8,
        unitCost: 0.2,
      }),
    );
    b.add(
      hardware({
        id: "pads",
        name: "Silicone Face Pads",
        role: "Face Grip",
        description: "Self-adhesive pads on each face so the cube lands quietly and does not skate across the desk.",
        qty: 6,
        unitCost: 0.1,
      }),
    );

    b.assembly([
      node("shell-lower", [
        node(b.mcu),
        node("ds3231"),
        node(inputKey),
        ...(buzz ? [node("buzzer")] : []),
        ...(haptic ? [node("vibemotor")] : []),
        ...power.ids.map((id) => node(id)),
        node("m3-kit"),
      ]),
      node("shell-upper", [node("window", [node(readoutKey)]), node("pads")]),
    ]);

    const inputName = b.nameOf(inputKey);
    const readoutName = b.nameOf(readoutKey);
    const alertName = buzz && haptic ? "a short tone and a haptic pulse" : buzz ? "a short tone" : "a silent haptic pulse";

    b.name = ctx.title;
    b.summary =
      `This ${ctx.subject} runs a session by being put down a particular way up. The ${inputName} decides which face is ` +
      `active and starts the matching interval — twenty-five minutes, five, or off — with a couple of seconds of debounce ` +
      `so a nudge does not count. The RP2040 keeps the countdown exact while driving the ${readoutName}, and the deadline ` +
      `itself lives in a DS3231, so an interrupted session is recoverable rather than silently lost. The end of an ` +
      `interval is ${alertName}. ${power.sentence}.`;
    b.tags = [
      "FLIP TO START",
      "RTC BACKED",
      "BATTERY POWERED",
      buzz && haptic ? "DUAL ALERT" : buzz ? "AUDIBLE ALERT" : "SILENT ALERT",
    ];

    b.assume(
      "A desk the cube can sit flat on — the face detection assumes it comes to rest, not that it is held",
      "Roughly a week of intermittent use between USB-C charges",
      "Interval lengths are set in firmware; there is no on-device configuration screen",
      ...customNote(ctx, "start", START, "session trigger"),
      ...customNote(ctx, "readout", READOUT, "readout"),
    );

    b.instructions({
      wiring: [
        {
          title: "Wire the readout and cue",
          detail:
            readoutKey === "ws2812ring"
              ? `Take 5V, ground, and one data line to the ring, and keep the data lead short — a metre of unshielded data on an addressable ring is where flicker comes from. Wire the end-of-session cue to its own pin.`
              : `Hang the ${readoutName} off the I2C bus alongside the RTC, and confirm the two answer at different addresses before soldering. Wire the end-of-session cue to its own pin.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: [readoutKey, ...(buzz ? ["buzzer"] : []), ...(haptic ? ["vibemotor"] : [])],
        },
        {
          title: "Wire the input and charge port",
          detail: `Mount the ${inputName} rigidly to the lower shell — anything that can shift will read as a face change. Align the charge board's USB-C receptacle with the base cut-out before soldering its leads to length.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: [inputKey, "usbc", b.mcu],
        },
      ],
      bringUp: [
        {
          title: "Map the faces to intervals",
          detail:
            inputKey === "mpu6050"
              ? "Log the raw accelerometer vector for each face and record the six sets. Map them to intervals with a generous angular tolerance, then confirm a deliberately sloppy placement still resolves to the right face."
              : "Set each interval against its input and confirm a session starts, runs, and ends cleanly. Repeat the start action quickly several times — the debounce should swallow the repeats, not stack sessions.",
          tools: [TOOLS.usb],
          parts: [inputKey, b.mcu],
        },
        {
          title: "Run a full session end to end",
          detail: `Run one complete interval, watch the ${readoutName} through the last minute, and confirm the cue fires exactly once. Pull power mid-session and check that the deadline survives in the RTC.`,
          tools: [TOOLS.usb],
          parts: [readoutKey, "ds3231", b.mcu],
        },
      ],
      assemble: [
        {
          title: "Close the shell",
          detail:
            "Seat the readout behind the window insert, route the harness so it does not press on the cell, and bring the two halves together. Check the seam closes without force — a shell that needs squeezing will pop open when the cube is flipped.",
          tools: [TOOLS.hex],
          parts: ["shell-upper", "shell-lower", "window", readoutKey],
        },
      ],
      install: {
        title: "Pad the faces and put it to work",
        detail:
          "Stick a silicone pad on each face so the cube lands quietly, then use it for a day before changing any interval lengths. The right durations are the ones you stop noticing.",
        tools: [TOOLS.knife],
        parts: ["pads", "m3-kit"],
      },
    });

    return b.finish();
  },
};

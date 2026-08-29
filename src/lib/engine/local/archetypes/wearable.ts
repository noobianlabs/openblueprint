import type { Archetype, BuildContext } from "./base";
import { choice, customNote } from "./base";
import { DesignBuilder, TOOLS, node } from "../compose";
import { hardware, part, printedPart, MCU_PROFILES } from "../part-library";
import { buildPower } from "../power";

const LIGHT = ["Addressable strip", "Addressable ring badge", "Strip with haptic confirmation"];
const REMOTE = ["Wireless remote (ESP-NOW)", "nRF24 handlebar remote", "Buttons on the garment"];
const POWER = ["500mAh LiPo, charged on-board", "1200mAh LiPo + USB-C charger board", "USB power bank in a pocket"];

export const wearable: Archetype = {
  id: "wearable",
  label: "Wearable",
  keywords: ["wearable", "vest", "jacket", "badge", "glove", "hat", "shirt", "backpack", "wrist", "belt", "harness", "cyclist", "bicycle", "helmet", "garment"],
  fallbackSubject: "signal vest",
  fallbackTitle: "Wearable Signal Vest",
  cover: { glyph: "✦", hueA: "#f472b6", hueB: "#fbbf24" },

  decisions(ctx) {
    return [
      `Select a XIAO ESP32-C3 for the ${ctx.subject} — thumbnail-sized, with an on-board LiPo charger, so nothing rigid presses on the wearer.`,
      "Trigger from a separate wireless remote rather than a switch on the garment; a control you have to reach behind you is a control you do not use.",
      "Add an accelerometer so deceleration can light the pattern automatically, without waiting for a button press.",
      "Keep every rigid part in one printed housing with a clip, so the electronics come off before the garment is washed.",
      "Cap the strip brightness in firmware — the visibility gain above roughly half output is small, and the runtime cost is not.",
      "Route the strip along a seam and strain-relieve every solder joint; flex fatigue is what actually kills wearables.",
    ];
  },

  questions() {
    return [
      { id: "light", question: "What goes on the garment?", options: LIGHT },
      { id: "remote", question: "How is it triggered?", options: REMOTE },
      { id: "power", question: "Where does power come from?", options: POWER },
    ];
  },

  build(ctx: BuildContext) {
    const lightChoice = choice(ctx, "light", LIGHT);
    const remoteChoice = choice(ctx, "remote", REMOTE);
    const powerChoice = choice(ctx, "power", POWER);

    const lightKey = lightChoice === 1 ? "ws2812ring" : "ws2812strip";
    const haptic = lightChoice === 2;
    const remoteKey = remoteChoice === 1 ? "nrf24" : remoteChoice === 2 ? "buttons" : "espnowremote";

    const b = new DesignBuilder("", "", []);
    b.addMcu(part("xiaoc3"), MCU_PROFILES.xiaoc3);

    /* --- power: the XIAO's own charger makes the small-cell case simplest --- */
    let powerIds: string[];
    let powerSentence: string;
    let powerTag: string;
    let powerAssumption: string;
    if (powerChoice === 1) {
      const chain = buildPower(b, "lipoBoost");
      powerIds = chain.ids;
      powerSentence = chain.sentence;
      powerTag = chain.tag;
      powerAssumption = chain.assumption;
    } else if (powerChoice === 2) {
      const chain = buildPower(b, "powerbank");
      powerIds = chain.ids;
      powerSentence = chain.sentence;
      powerTag = chain.tag;
      powerAssumption = chain.assumption;
    } else {
      b.add(part("lipo500"));
      b.add(part("slideswitch"));
      b.add(part("boost5v"));
      b.wire({ part: "lipo500", pin: "B+" }, { part: "slideswitch", pin: "IN" }, "power", "3.7V");
      b.wire({ part: "slideswitch", pin: "OUT" }, { part: b.mcu, pin: "BAT+" }, "power", "3.7V");
      b.wire({ part: "lipo500", pin: "B-" }, { part: b.mcu, pin: "BAT-" }, "ground");
      b.wire({ part: "slideswitch", pin: "OUT" }, { part: "boost5v", pin: "VIN" }, "power", "3.7V");
      b.wire({ part: "boost5v", pin: "GND" }, { part: b.mcu, pin: b.mcuGnd() }, "ground");
      b.setRail("5V", { part: "boost5v", pin: "VOUT" });
      powerIds = ["lipo500", "slideswitch", "boost5v"];
      powerSentence =
        "A flat 500mAh cell charges through the controller's own USB-C port and a boost converter holds 5V for the strip";
      powerTag = "BATTERY POWERED";
      powerAssumption = "An hour or two of flashing patterns per charge — a solid-on pattern is considerably shorter";
    }

    b.add(part(lightKey, { role: "Signal Light" }));
    b.add(part("mpu6050", { role: "Deceleration Sensor" }));
    b.add(part(remoteKey, remoteKey === "buttons" ? { role: "Garment Input" } : { role: "Trigger Link" }));
    if (remoteKey === "espnowremote") b.add(part("coincell"));
    if (haptic) b.add(part("vibemotor", { role: "Confirmation Cue" }));

    b.powerFrom(lightKey, "5V", "5V");
    b.ground(lightKey, "GND");
    b.signal(lightKey, "DIN", "WS2812");
    b.i2c("mpu6050");

    if (remoteKey === "nrf24") {
      b.spi("nrf24", ["CE", "CSN", "SCK", "MOSI", "MISO"]);
    } else if (remoteKey === "buttons") {
      b.digital("buttons", "SIG", "input", { gnd: "GND" });
    } else {
      // The remote is a peer, not a peripheral — it has its own supply and
      // reaches the vest over the air, so it forms its own island here.
      b.wire({ part: "coincell", pin: "B+" }, { part: "espnowremote", pin: "3V3" }, "power", "3V");
      b.wire({ part: "coincell", pin: "B-" }, { part: "espnowremote", pin: "GND" }, "ground");
    }
    if (haptic) {
      b.signal("vibemotor", "V+", "haptic");
      b.ground("vibemotor", "V-");
    }

    /* --- mechanics --- */
    b.add(
      printedPart({
        id: "housing",
        name: "Controller Housing",
        role: "Electronics Pod",
        description:
          "Slim pod holding the controller, cell, and connectors, with rounded edges so nothing digs in through a layer of fabric.",
        printSettings: "PETG · 30% infill, 0.2mm layer",
        unitCost: 3.0,
      }),
    );
    b.add(
      printedPart({
        id: "clip",
        name: "Belt Clip",
        role: "Garment Attachment",
        description: "Sprung clip printed in one piece, sized for a belt or a strap so the pod comes off before the garment is washed.",
        printSettings: "PETG · 40% infill, 0.2mm layer, 4 perimeters",
        unitCost: 1.2,
      }),
    );
    b.add(
      printedPart({
        id: "light-channel",
        name: "Diffuser Channel",
        role: "Strip Carrier",
        description:
          "Flexible channel that carries the light along a seam, diffusing the individual emitters into a continuous line.",
        printSettings: "TPU · 20% infill, 0.2mm layer",
        unitCost: 2.5,
      }),
    );
    b.add(
      hardware({
        id: "straps",
        name: "Hook-and-Loop Straps",
        role: "Garment Mounting",
        description: "Sewn-on hook-and-loop pads holding the channel and pod without piercing the outer fabric.",
        qty: 6,
        unitCost: 0.4,
      }),
    );
    b.add(
      hardware({
        id: "m2-kit",
        name: "M2 Screws + Inserts",
        role: "Fastener Set",
        description: "Short M2 screws and inserts for the pod, sized down because there is no room for M3 here.",
        qty: 8,
        unitCost: 0.15,
      }),
    );

    b.assembly([
      node("clip", [
        node("housing", [
          node(b.mcu),
          node("mpu6050"),
          ...(remoteKey === "espnowremote" ? [] : [node(remoteKey)]),
          ...(haptic ? [node("vibemotor")] : []),
          ...powerIds.map((id) => node(id)),
          node("m2-kit"),
        ]),
      ]),
      node("light-channel", [node(lightKey), node("straps")]),
      ...(remoteKey === "espnowremote" ? [node("espnowremote", [node("coincell")])] : []),
    ]);

    const lightName = b.nameOf(lightKey);
    const remoteName = b.nameOf(remoteKey);
    const triggerClause =
      remoteKey === "buttons"
        ? "Buttons sewn to the front of the garment select the pattern"
        : `A ${remoteName.toLowerCase()} mounted where the hand already rests selects the pattern`;

    b.name = ctx.title;
    b.summary =
      `This ${ctx.subject} puts a ${lightName} along a seam and everything rigid in a single clip-on pod, so the ` +
      `garment can still be washed. ${triggerClause}, and an MPU-6050 in the pod watches for deceleration so a hard ` +
      `slowdown lights the pattern without anyone reaching for anything. ${powerSentence}. Brightness is capped in ` +
      `firmware: past roughly half output the visibility gain is small and the runtime cost is not. ` +
      `Every joint that moves with the wearer is strain-relieved, because flex fatigue is what actually kills a wearable.`;
    b.tags = [
      "WEARABLE",
      remoteKey === "buttons" ? "ON-GARMENT CONTROL" : "WIRELESS TRIGGER",
      "MOTION TRIGGERED",
      powerTag,
      "WASHABLE MOUNTING",
    ];

    b.assume(
      "A garment with a seam or strap the channel can follow, and somewhere to clip the pod",
      powerAssumption,
      "The pod is not waterproof — it comes off before the garment goes in the wash, and before heavy rain",
      "This supplements visibility; it does not replace the lights a road vehicle is legally required to carry",
      ...customNote(ctx, "light", LIGHT, "light engine"),
      ...customNote(ctx, "remote", REMOTE, "trigger"),
    );

    b.instructions({
      wiring: [
        {
          title: "Wire the light channel",
          detail: `Solder 5V, ground, and data to the ${lightName} with a service loop at the pod end, then flood the joint with flexible adhesive. This is the joint that fails first, and it always fails from flexing rather than from current.`,
          tools: [TOOLS.soldering, TOOLS.strippers, TOOLS.glue],
          parts: [lightKey, "light-channel", b.mcu],
        },
        {
          title: "Wire the trigger and motion sensor",
          detail:
            remoteKey === "espnowremote"
              ? "The remote is a separate board, not a peripheral — pair it over ESP-NOW rather than wiring it in. Mount the accelerometer rigidly inside the pod; one that can shift reads phantom decelerations."
              : `Wire the ${remoteName.toLowerCase()} into the pod on the shortest run that still reaches, and mount the accelerometer rigidly. A sensor that can shift inside the housing reads phantom decelerations.`,
          tools: [TOOLS.soldering, TOOLS.strippers],
          parts: [remoteKey, "mpu6050", b.mcu],
        },
      ],
      bringUp: [
        {
          title: "Set the deceleration threshold",
          detail:
            "Log the accelerometer while walking, then while stopping hard, and pick a threshold clear of the walking band. Test it while actually moving, not by shaking the pod on a bench — the two signals look nothing alike.",
          tools: [TOOLS.usb],
          parts: ["mpu6050", b.mcu],
        },
        {
          title: "Measure runtime at the capped brightness",
          detail:
            "Run the real pattern at the firmware's brightness cap and time it to cut-off. If the number is short, lower the cap before adding cell capacity — brightness costs far more runtime than it buys visibility.",
          tools: [TOOLS.usb, TOOLS.multimeter],
          parts: [lightKey, ...powerIds.slice(-1)],
        },
      ],
      assemble: [
        {
          title: "Close the pod and fit the clip",
          detail:
            "Pack the cell against the flat face with nothing pressing on it, close the housing on its M2 screws, and check the clip springs without cracking. Anything sharp inside will be felt through one layer of fabric.",
          tools: [TOOLS.hex, TOOLS.knife],
          parts: ["housing", "clip", "m2-kit"],
        },
      ],
      install: {
        title: "Mount it to the garment",
        detail:
          "Sew the hook-and-loop pads along the seam, press the channel on, and clip the pod where it will not swing. Wear it once in the dark before trusting it — sightlines from a car are not what they look like from arm's length.",
        tools: [TOOLS.needle],
        parts: ["straps", "light-channel", "clip"],
      },
    });

    return b.finish();
  },
};

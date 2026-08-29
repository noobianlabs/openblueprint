/**
 * Power chains.
 *
 * Every archetype needs one and they repeat across designs, so they live
 * here: each strategy adds its parts, wires the chain end to end, and
 * publishes the rails the rest of the design draws from.
 *
 * Call after the MCU is added — the 3.3V and ground rails hang off it.
 */

import type { DesignBuilder } from "./compose";
import { part } from "./part-library";

export type PowerStrategy =
  | "usb5v"
  | "adapter5v"
  | "adapter12v"
  | "powerbank"
  | "aa"
  | "pack2s"
  | "lipo"
  | "lipoBoost"
  | "solar";

export interface PowerChain {
  /** Part ids added, in chain order. */
  ids: string[];
  /** Clause for the design summary, e.g. "runs from a USB-C supply". */
  sentence: string;
  /** Uppercase feature tag. */
  tag: string;
  assumption: string;
}

export function buildPower(b: DesignBuilder, strategy: PowerStrategy): PowerChain {
  const vin = b.mcuVin();

  switch (strategy) {
    case "usb5v": {
      b.add(part("usbc"));
      b.add(part("slideswitch"));
      b.wire({ part: "usbc", pin: "VBUS" }, { part: "slideswitch", pin: "IN" }, "power", "5V");
      b.wire({ part: "slideswitch", pin: "OUT" }, { part: b.mcu, pin: vin }, "power", "5V");
      b.wire({ part: "usbc", pin: "GND" }, { part: b.mcu, pin: b.mcuGnd() }, "ground");
      b.setRail("5V", { part: "slideswitch", pin: "OUT" });
      return {
        ids: ["usbc", "slideswitch"],
        sentence: "It runs from any USB-C charger, with a panel switch on the incoming rail",
        tag: "USB POWERED",
        assumption: "A spare USB-C charger able to supply at least 1A",
      };
    }

    case "adapter5v": {
      b.add(part("psu5v"));
      b.add(part("slideswitch"));
      b.wire({ part: "psu5v", pin: "V+" }, { part: "slideswitch", pin: "IN" }, "power", "5V");
      b.wire({ part: "slideswitch", pin: "OUT" }, { part: b.mcu, pin: vin }, "power", "5V");
      b.wire({ part: "psu5v", pin: "V-" }, { part: b.mcu, pin: b.mcuGnd() }, "ground");
      b.setRail("5V", { part: "slideswitch", pin: "OUT" });
      return {
        ids: ["psu5v", "slideswitch"],
        sentence: "A 5V 3A adapter feeds both the logic and the load rail, switched at the panel",
        tag: "MAINS POWERED",
        assumption: "A mains outlet within reach of the adapter's lead",
      };
    }

    case "adapter12v": {
      b.add(part("psu12v"));
      b.add(part("slideswitch"));
      b.add(part("buck5v"));
      b.wire({ part: "psu12v", pin: "V+" }, { part: "slideswitch", pin: "IN" }, "power", "12V");
      b.wire({ part: "slideswitch", pin: "OUT" }, { part: "buck5v", pin: "VIN" }, "power", "12V");
      b.wire({ part: "psu12v", pin: "V-" }, { part: "buck5v", pin: "GND" }, "ground");
      b.wire({ part: "buck5v", pin: "VOUT" }, { part: b.mcu, pin: vin }, "power", "5V");
      b.wire({ part: "buck5v", pin: "GND" }, { part: b.mcu, pin: b.mcuGnd() }, "ground");
      b.setRail("VIN", { part: "slideswitch", pin: "OUT" });
      b.setRail("5V", { part: "buck5v", pin: "VOUT" });
      return {
        ids: ["psu12v", "slideswitch", "buck5v"],
        sentence: "A 12V adapter drives the actuator rail directly and a buck converter steps it down for logic",
        tag: "12V RAIL",
        assumption: "A mains outlet within reach, and a 12V adapter with a matching barrel jack",
      };
    }

    case "powerbank": {
      b.add(part("powerbank"));
      b.add(part("slideswitch"));
      b.wire({ part: "powerbank", pin: "V+" }, { part: "slideswitch", pin: "IN" }, "power", "5V");
      b.wire({ part: "slideswitch", pin: "OUT" }, { part: b.mcu, pin: vin }, "power", "5V");
      b.wire({ part: "powerbank", pin: "V-" }, { part: b.mcu, pin: b.mcuGnd() }, "ground");
      b.setRail("5V", { part: "slideswitch", pin: "OUT" });
      return {
        ids: ["powerbank", "slideswitch"],
        sentence: "A USB power bank carries the whole system, so there is no lithium cell to manage in the build",
        tag: "PORTABLE POWER",
        assumption:
          "A power bank that does not auto-shut-off under a light load — some banks cut out below 100mA",
      };
    }

    case "aa": {
      b.add(part("aaholder"));
      b.add(part("slideswitch"));
      b.add(part("buck5v"));
      b.wire({ part: "aaholder", pin: "B+" }, { part: "slideswitch", pin: "IN" }, "power", "6V");
      b.wire({ part: "slideswitch", pin: "OUT" }, { part: "buck5v", pin: "VIN" }, "power", "6V");
      b.wire({ part: "aaholder", pin: "B-" }, { part: "buck5v", pin: "GND" }, "ground");
      b.wire({ part: "buck5v", pin: "VOUT" }, { part: b.mcu, pin: vin }, "power", "5V");
      b.wire({ part: "buck5v", pin: "GND" }, { part: b.mcu, pin: b.mcuGnd() }, "ground");
      b.setRail("VIN", { part: "slideswitch", pin: "OUT" });
      b.setRail("5V", { part: "buck5v", pin: "VOUT" });
      return {
        ids: ["aaholder", "slideswitch", "buck5v"],
        sentence: "Four alkaline cells feed a buck converter, keeping lithium out of the enclosure entirely",
        tag: "ALKALINE CELLS",
        assumption: "Alkaline AA cells will need replacing — budget roughly a set per month of continuous use",
      };
    }

    case "pack2s": {
      b.add(part("pack2s"));
      b.add(part("slideswitch"));
      b.add(part("buck5v"));
      b.wire({ part: "pack2s", pin: "P+" }, { part: "slideswitch", pin: "IN" }, "power", "7.4V");
      b.wire({ part: "slideswitch", pin: "OUT" }, { part: "buck5v", pin: "VIN" }, "power", "7.4V");
      b.wire({ part: "pack2s", pin: "P-" }, { part: "buck5v", pin: "GND" }, "ground");
      b.wire({ part: "buck5v", pin: "VOUT" }, { part: b.mcu, pin: vin }, "power", "5V");
      b.wire({ part: "buck5v", pin: "GND" }, { part: b.mcu, pin: b.mcuGnd() }, "ground");
      b.setRail("VIN", { part: "slideswitch", pin: "OUT" });
      b.setRail("5V", { part: "buck5v", pin: "VOUT" });
      return {
        ids: ["pack2s", "slideswitch", "buck5v"],
        sentence: "A 2S pack behind a protection board gives the motors headroom while a buck holds the logic rail steady",
        tag: "LI-ION PACK",
        assumption: "A balance charger for the 2S pack — the on-board BMS protects, it does not charge",
      };
    }

    case "lipo": {
      b.add(part("usbc"));
      b.add(part("tp4056"));
      b.add(part("lipo1200"));
      b.add(part("ldo3v3"));
      b.wire({ part: "usbc", pin: "VBUS" }, { part: "tp4056", pin: "IN+" }, "power", "5V");
      b.wire({ part: "usbc", pin: "GND" }, { part: "tp4056", pin: "IN-" }, "ground");
      b.wire({ part: "tp4056", pin: "BAT+" }, { part: "lipo1200", pin: "B+" }, "power", "3.7V");
      b.wire({ part: "tp4056", pin: "BAT-" }, { part: "lipo1200", pin: "B-" }, "ground");
      b.wire({ part: "tp4056", pin: "OUT+" }, { part: "ldo3v3", pin: "VIN" }, "power", "VBAT");
      b.wire({ part: "tp4056", pin: "OUT-" }, { part: "ldo3v3", pin: "GND" }, "ground");
      b.wire({ part: "ldo3v3", pin: "VOUT" }, { part: b.mcu, pin: b.mcuLogic() }, "power", "3.3V");
      b.wire({ part: "ldo3v3", pin: "GND" }, { part: b.mcu, pin: b.mcuGnd() }, "ground");
      return {
        ids: ["usbc", "tp4056", "lipo1200", "ldo3v3"],
        sentence:
          "A 1200mAh cell charges over USB-C through a load-sharing TP4056 and feeds a micro-power LDO, so the design keeps running while it charges",
        tag: "BATTERY POWERED",
        assumption: "Charging over USB-C every few weeks, depending on how often the design wakes",
      };
    }

    case "lipoBoost": {
      b.add(part("usbc"));
      b.add(part("tp4056"));
      b.add(part("lipo1200"));
      b.add(part("boost5v"));
      b.wire({ part: "usbc", pin: "VBUS" }, { part: "tp4056", pin: "IN+" }, "power", "5V");
      b.wire({ part: "usbc", pin: "GND" }, { part: "tp4056", pin: "IN-" }, "ground");
      b.wire({ part: "tp4056", pin: "BAT+" }, { part: "lipo1200", pin: "B+" }, "power", "3.7V");
      b.wire({ part: "tp4056", pin: "BAT-" }, { part: "lipo1200", pin: "B-" }, "ground");
      b.wire({ part: "tp4056", pin: "OUT+" }, { part: "boost5v", pin: "VIN" }, "power", "VBAT");
      b.wire({ part: "tp4056", pin: "OUT-" }, { part: "boost5v", pin: "GND" }, "ground");
      b.wire({ part: "boost5v", pin: "VOUT" }, { part: b.mcu, pin: vin }, "power", "5V");
      b.wire({ part: "boost5v", pin: "GND" }, { part: b.mcu, pin: b.mcuGnd() }, "ground");
      b.setRail("5V", { part: "boost5v", pin: "VOUT" });
      return {
        ids: ["usbc", "tp4056", "lipo1200", "boost5v"],
        sentence:
          "A single LiPo charges over USB-C and a boost converter holds 5V as the cell sags from 4.2V toward 3.4V",
        tag: "BATTERY POWERED",
        assumption:
          "Runtime follows the duty cycle, not the average current — size the cell against the load's worst-case, not its idle draw",
      };
    }

    case "solar": {
      b.add(part("solar"));
      b.add(part("tp4056"));
      b.add(part("cell18650"));
      b.add(part("ldo3v3"));
      b.wire({ part: "solar", pin: "V+" }, { part: "tp4056", pin: "IN+" }, "power", "6V");
      b.wire({ part: "solar", pin: "V-" }, { part: "tp4056", pin: "IN-" }, "ground");
      b.wire({ part: "tp4056", pin: "BAT+" }, { part: "cell18650", pin: "B+" }, "power", "3.7V");
      b.wire({ part: "tp4056", pin: "BAT-" }, { part: "cell18650", pin: "B-" }, "ground");
      b.wire({ part: "tp4056", pin: "OUT+" }, { part: "ldo3v3", pin: "VIN" }, "power", "VBAT");
      b.wire({ part: "tp4056", pin: "OUT-" }, { part: "ldo3v3", pin: "GND" }, "ground");
      b.wire({ part: "ldo3v3", pin: "VOUT" }, { part: b.mcu, pin: b.mcuLogic() }, "power", "3.3V");
      b.wire({ part: "ldo3v3", pin: "GND" }, { part: b.mcu, pin: b.mcuGnd() }, "ground");
      return {
        ids: ["solar", "tp4056", "cell18650", "ldo3v3"],
        sentence:
          "A 2W panel tops up an 18650 through a TP4056, and a 1.6µA-quiescent LDO means deep sleep costs almost nothing",
        tag: "SOLAR POWERED",
        assumption: "A mounting spot with several hours of direct sun — shade cuts the panel's yield disproportionately",
      };
    }
  }
}

/**
 * Part library.
 *
 * Real, orderable hobby-electronics parts with plausible pin names and
 * 2026-ish street prices. Archetype builders compose designs out of these
 * entries; nothing here knows about any particular project.
 *
 * Invariant: `domain` always agrees with CATEGORY_META[category].domain —
 * the BOM rollup groups by category, so a mismatch would file a part under
 * the wrong domain heading.
 */

import type { Part } from "../../design/schema";

type Entry = Omit<Part, "qty"> & { qty?: number };

/** Pin roles for an MCU, so the composer can allocate without collisions. */
export interface McuProfile {
  logic: string;
  gnd: string;
  sda: string;
  scl: string;
  /** Digital IO, handed out in order. */
  gpio: string[];
  /** Analog inputs, handed out in order. */
  adc: string[];
  /** Raw USB/battery input pin, when the board exposes one. */
  vin?: string;
}

const LIB = {
  /* ---------- MCUs ---------- */
  esp32c3: {
    id: "esp32c3",
    name: "ESP32-C3 SuperMini",
    role: "Main Logic Controller",
    description:
      "RISC-V microcontroller with Wi-Fi and BLE. Runs the control loop, drives the peripheral buses, and sleeps between samples.",
    category: "mcu",
    domain: "electrical",
    unitCost: 4.5,
    pins: ["3V3", "5V", "GND", "SDA", "SCL", "GPIO2", "GPIO3", "GPIO4", "GPIO5", "GPIO6", "GPIO7", "GPIO8", "GPIO9", "GPIO10", "GPIO20", "GPIO21", "ADC0", "ADC1"],
  },
  esp32s3: {
    id: "esp32s3",
    name: "ESP32-S3 DevKitC-1",
    role: "Main Logic Controller",
    description:
      "Dual-core Xtensa MCU with Wi-Fi, BLE, and enough PWM channels and RAM for closed-loop control.",
    category: "mcu",
    domain: "electrical",
    unitCost: 9.0,
    pins: ["3V3", "5V", "GND", "SDA", "SCL", "GPIO4", "GPIO5", "GPIO6", "GPIO7", "GPIO8", "GPIO9", "GPIO15", "GPIO16", "GPIO17", "GPIO18", "ADC0", "ADC1", "ADC2"],
  },
  rp2040: {
    id: "rp2040",
    name: "Raspberry Pi Pico 2",
    role: "Main Logic Controller",
    description:
      "Dual-core MCU with programmable IO. Deterministic timing makes it a good fit when the display and inputs must stay responsive.",
    category: "mcu",
    domain: "electrical",
    unitCost: 5.0,
    pins: ["3V3", "VSYS", "GND", "SDA", "SCL", "GP2", "GP3", "GP4", "GP5", "GP6", "GP7", "GP8", "GP9", "GP10", "ADC0", "ADC1"],
  },
  xiaoc3: {
    id: "xiaoc3",
    name: "Seeed XIAO ESP32-C3",
    role: "Main Logic Controller",
    description:
      "Thumbnail-sized Wi-Fi/BLE board with an on-board LiPo charger — small and light enough to carry on the body.",
    category: "mcu",
    domain: "electrical",
    unitCost: 5.5,
    pins: ["3V3", "5V", "GND", "SDA", "SCL", "D0", "D1", "D2", "D3", "D6", "D7", "D8", "D9", "D10", "ADC0", "BAT+", "BAT-"],
  },

  /* ---------- Sensors ---------- */
  bme280: {
    id: "bme280",
    name: "Bosch BME280",
    role: "Climate Sensor",
    description: "Temperature, humidity, and barometric pressure in one I2C package.",
    category: "sensor",
    domain: "electrical",
    unitCost: 6.0,
    pins: ["VCC", "GND", "SDA", "SCL"],
  },
  sht41: {
    id: "sht41",
    name: "Sensirion SHT41",
    role: "Humidity Sensor",
    description: "Fast, low-drift temperature and relative-humidity sensor on the I2C bus.",
    category: "sensor",
    domain: "electrical",
    unitCost: 6.5,
    pins: ["VCC", "GND", "SDA", "SCL"],
  },
  scd40: {
    id: "scd40",
    name: "Sensirion SCD40",
    role: "CO2 Sensor",
    description: "True NDIR carbon-dioxide sensor; self-calibrates against clean-air minima over a week of samples.",
    category: "sensor",
    domain: "electrical",
    unitCost: 22.0,
    pins: ["VCC", "GND", "SDA", "SCL"],
  },
  sgp40: {
    id: "sgp40",
    name: "Sensirion SGP40",
    role: "VOC Sensor",
    description: "Metal-oxide gas sensor reporting a volatile-organic-compound index rather than absolute ppm.",
    category: "sensor",
    domain: "electrical",
    unitCost: 12.0,
    pins: ["VCC", "GND", "SDA", "SCL"],
  },
  pms5003: {
    id: "pms5003",
    name: "Plantower PMS5003",
    role: "Particulate Sensor",
    description: "Laser scattering sensor reporting PM1.0/PM2.5/PM10 mass concentration over a 9600-baud serial link.",
    category: "sensor",
    domain: "electrical",
    unitCost: 19.0,
    pins: ["VCC", "GND", "TX", "RX", "SET"],
  },
  soilcap: {
    id: "soilcap",
    name: "Capacitive Soil Moisture Sensor v2",
    role: "Soil Moisture Sensor",
    description:
      "Corrosion-free capacitive probe. Outputs an analog voltage that falls as the substrate takes up water.",
    category: "sensor",
    domain: "electrical",
    unitCost: 3.5,
    pins: ["VCC", "GND", "AOUT"],
  },
  soilres: {
    id: "soilres",
    name: "Gypsum Resistance Probe",
    role: "Soil Moisture Sensor",
    description:
      "Gypsum-block resistance probe read through an AC-excited divider, which keeps it from corroding like a bare fork probe.",
    category: "sensor",
    domain: "electrical",
    unitCost: 9.0,
    pins: ["VCC", "GND", "AOUT"],
  },
  floatsw: {
    id: "floatsw",
    name: "Vertical Float Switch",
    role: "Reservoir Level Switch",
    description: "Magnetic float closing a reed contact when the tank drops below the pump inlet.",
    category: "sensor",
    domain: "electrical",
    unitCost: 2.5,
    pins: ["SIG", "GND"],
  },
  hcsr04: {
    id: "hcsr04",
    name: "HC-SR04 Ultrasonic Ranger",
    role: "Obstacle Sensor",
    description: "40kHz time-of-flight ranger, 2cm–4m, read by timing the echo pulse.",
    category: "sensor",
    domain: "electrical",
    unitCost: 2.5,
    pins: ["VCC", "GND", "TRIG", "ECHO"],
  },
  vl53l0x: {
    id: "vl53l0x",
    name: "VL53L0X Laser Ranger",
    role: "Obstacle Sensor",
    description: "Infrared time-of-flight ranger on I2C; immune to the acoustic dead zones an ultrasonic module suffers.",
    category: "sensor",
    domain: "electrical",
    unitCost: 6.0,
    pins: ["VCC", "GND", "SDA", "SCL"],
  },
  irarray: {
    id: "irarray",
    name: "5-Channel IR Reflectance Array",
    role: "Line Sensor",
    description: "Downward-facing IR emitter/phototransistor pairs reporting contrast under the chassis.",
    category: "sensor",
    domain: "electrical",
    unitCost: 7.0,
    pins: ["VCC", "GND", "OUT1", "OUT2", "OUT3"],
  },
  bumper: {
    id: "bumper",
    name: "Lever Microswitch Pair",
    role: "Bump Sensor",
    description: "Long-lever snap-action switches wired as normally-open collision detectors.",
    category: "sensor",
    domain: "electrical",
    unitCost: 1.2,
    pins: ["SIG", "GND"],
  },
  mpu6050: {
    id: "mpu6050",
    name: "MPU-6050 IMU",
    role: "Orientation Sensor",
    description: "6-axis accelerometer and gyro on I2C; the accelerometer alone resolves which face is up.",
    category: "sensor",
    domain: "electrical",
    unitCost: 4.0,
    pins: ["VCC", "GND", "SDA", "SCL", "INT"],
  },
  hall: {
    id: "hall",
    name: "A3144 Hall Switch",
    role: "Position Sensor",
    description: "Open-collector hall-effect switch reporting when a magnet passes the housing.",
    category: "sensor",
    domain: "electrical",
    unitCost: 1.0,
    pins: ["VCC", "GND", "OUT"],
  },
  pir: {
    id: "pir",
    name: "AM312 PIR Sensor",
    role: "Presence Sensor",
    description: "Miniature pyroelectric motion detector with a 3.3V-friendly digital output.",
    category: "sensor",
    domain: "electrical",
    unitCost: 2.5,
    pins: ["VCC", "GND", "OUT"],
  },
  ldr: {
    id: "ldr",
    name: "Ambient Light Divider",
    role: "Light Sensor",
    description: "Photoresistor in a fixed divider, giving a rough ambient-brightness reading for auto-dimming.",
    category: "sensor",
    domain: "electrical",
    unitCost: 0.8,
    pins: ["VCC", "GND", "AOUT"],
  },
  rc522: {
    id: "rc522",
    name: "MFRC522 RFID Reader",
    role: "Tag Reader",
    description: "13.56MHz reader over SPI; matches a tag UID against the allow-list before actuating.",
    category: "sensor",
    domain: "electrical",
    unitCost: 4.0,
    pins: ["VCC", "GND", "SCK", "MOSI", "MISO", "SS", "RST"],
  },
  ttp223: {
    id: "ttp223",
    name: "TTP223 Capacitive Pad",
    role: "Touch Input",
    description: "Single-electrode touch sensor that reads through 3mm of printed wall — no hole in the shell.",
    category: "sensor",
    domain: "electrical",
    unitCost: 1.0,
    pins: ["VCC", "GND", "OUT"],
  },

  /* ---------- Actuators ---------- */
  n20motor: {
    id: "n20motor",
    name: "N20 Gearmotor 6V 200RPM",
    role: "Drive Motor",
    description:
      "Metal-gearbox micro motors with 3mm D-shafts, sized for a sub-kilogram chassis. Left wires to channel A, right to channel B.",
    category: "actuator",
    domain: "electrical",
    qty: 2,
    unitCost: 5.0,
    pins: ["A+", "A-", "B+", "B-"],
  },
  ttmotor: {
    id: "ttmotor",
    name: "TT Gearmotor 1:48",
    role: "Drive Motor",
    description:
      "Yellow plastic-gearbox motors — slow, torquey, and forgiving of a rough first chassis. Left wires to channel A, right to channel B.",
    category: "actuator",
    domain: "electrical",
    qty: 2,
    unitCost: 2.5,
    pins: ["A+", "A-", "B+", "B-"],
  },
  crservo: {
    id: "crservo",
    name: "FS90R Continuous-Rotation Servo",
    role: "Drive Motor",
    description:
      "Servos with the feedback pot removed, so one PWM line per side sets speed and direction — no H-bridge needed.",
    category: "actuator",
    domain: "electrical",
    qty: 2,
    unitCost: 6.0,
    pins: ["VCC", "GND", "SIG-L", "SIG-R"],
  },
  sg90: {
    id: "sg90",
    name: "SG90 Micro Servo",
    role: "Latch Actuator",
    description: "9g hobby servo with roughly 180° of travel; enough torque to throw a printed latch arm.",
    category: "actuator",
    domain: "electrical",
    unitCost: 3.0,
    pins: ["VCC", "GND", "SIG"],
  },
  mg996r: {
    id: "mg996r",
    name: "MG996R Metal-Gear Servo",
    role: "Latch Actuator",
    description: "10kg·cm metal-gear servo for latches that must move against a spring or a stuck seal.",
    category: "actuator",
    domain: "electrical",
    unitCost: 8.0,
    pins: ["VCC", "GND", "SIG"],
  },
  stepper28byj: {
    id: "stepper28byj",
    name: "28BYJ-48 Geared Stepper",
    role: "Positioning Motor",
    description: "Unipolar geared stepper — slow but holds position without drawing stall current from a servo.",
    category: "actuator",
    domain: "electrical",
    unitCost: 4.0,
    pins: ["A", "B", "C", "D", "COM"],
  },
  solenoid: {
    id: "solenoid",
    name: "12V Solenoid Latch",
    role: "Lock Actuator",
    description: "Fail-secure solenoid bolt; energise to retract, spring returns it when power drops.",
    category: "actuator",
    domain: "electrical",
    unitCost: 9.0,
    pins: ["V+", "V-"],
  },
  pump5v: {
    id: "pump5v",
    name: "5V Submersible Pump",
    role: "Water Pump",
    description: "Brushed 5V pump, roughly 100 L/h at zero head; sits in the reservoir and pushes through 6mm tube.",
    category: "actuator",
    domain: "electrical",
    unitCost: 4.5,
    pins: ["V+", "V-"],
  },
  peristaltic: {
    id: "peristaltic",
    name: "12V Peristaltic Pump",
    role: "Water Pump",
    description: "Tube-squeeze pump with a repeatable millilitres-per-second rate and no wetted motor parts.",
    category: "actuator",
    domain: "electrical",
    unitCost: 14.0,
    pins: ["V+", "V-"],
  },
  ws2812strip: {
    id: "ws2812strip",
    name: "WS2812B Strip (60 LED/m)",
    role: "Light Engine",
    description: "Addressable RGB strip on a single data line; each LED is individually colour- and brightness-addressable.",
    category: "actuator",
    domain: "electrical",
    unitCost: 9.0,
    pins: ["5V", "GND", "DIN"],
  },
  ws2812ring: {
    id: "ws2812ring",
    name: "WS2812B 24-LED Ring",
    role: "Light Engine",
    description: "Addressable ring giving an even wash behind a diffuser without a long strip run.",
    category: "actuator",
    domain: "electrical",
    unitCost: 7.0,
    pins: ["5V", "GND", "DIN"],
  },
  cobled: {
    id: "cobled",
    name: "10W Warm-White COB LED",
    role: "Light Engine",
    description: "Single high-CRI emitter run from a constant-current driver — far more lumens per watt than a strip.",
    category: "actuator",
    domain: "electrical",
    unitCost: 4.0,
    pins: ["LED+", "LED-"],
  },
  buzzer: {
    id: "buzzer",
    name: "Passive Piezo Buzzer",
    role: "Audible Alert",
    description: "Driven with a PWM tone, so pitch and pattern are both under firmware control.",
    category: "actuator",
    domain: "electrical",
    unitCost: 1.0,
    pins: ["SIG", "GND"],
  },
  vibemotor: {
    id: "vibemotor",
    name: "Coin Vibration Motor + Driver",
    role: "Haptic Alert",
    description:
      "10mm ERM motor on a small driver board with its own transistor and flyback diode, so a logic pin can switch it — a silent cue where a buzzer would be rude.",
    category: "actuator",
    domain: "electrical",
    unitCost: 2.0,
    pins: ["V+", "V-"],
  },

  /* ---------- Displays ---------- */
  oled: {
    id: "oled",
    name: 'SSD1306 0.96" OLED',
    role: "Status Display",
    description: "128×64 monochrome OLED sharing the I2C bus; readable in a dark room without backlight glare.",
    category: "display",
    domain: "electrical",
    unitCost: 5.0,
    pins: ["VCC", "GND", "SDA", "SCL"],
  },
  eink: {
    id: "eink",
    name: 'Waveshare 2.9" E-Ink',
    role: "Status Display",
    description: "Partial-refresh e-paper over SPI. Holds the last frame with zero current, which suits a battery build.",
    category: "display",
    domain: "electrical",
    unitCost: 22.0,
    pins: ["VCC", "GND", "SCK", "MOSI", "CS", "DC", "RST", "BUSY"],
  },
  segdisplay: {
    id: "segdisplay",
    name: "HT16K33 4-Digit Display",
    role: "Status Display",
    description: "Backpack-driven 14-segment display; legible across a room at a glance.",
    category: "display",
    domain: "electrical",
    unitCost: 8.0,
    pins: ["VCC", "GND", "SDA", "SCL"],
  },

  /* ---------- Modules (drivers, switches, radios) ---------- */
  tb6612: {
    id: "tb6612",
    name: "TB6612FNG Motor Driver",
    role: "Motor Driver",
    description: "MOSFET dual H-bridge, 1.2A per channel continuous. Far lower drop than a bipolar bridge.",
    category: "module",
    domain: "electrical",
    unitCost: 5.0,
    pins: ["VM", "VCC", "GND", "AIN1", "AIN2", "BIN1", "BIN2", "PWMA", "PWMB", "STBY", "AO1", "AO2", "BO1", "BO2"],
  },
  drv8833: {
    id: "drv8833",
    name: "DRV8833 Motor Driver",
    role: "Motor Driver",
    description: "Low-voltage dual H-bridge that still starts motors cleanly at 3V, unlike an L298N.",
    category: "module",
    domain: "electrical",
    unitCost: 4.0,
    pins: ["VM", "GND", "AIN1", "AIN2", "BIN1", "BIN2", "AO1", "AO2", "BO1", "BO2"],
  },
  l298n: {
    id: "l298n",
    name: "L298N H-Bridge Module",
    role: "Motor Driver",
    description: "Rugged bipolar dual bridge with a heatsink; forgiving of stalls, at the cost of ~2V across the transistors.",
    category: "module",
    domain: "electrical",
    unitCost: 3.5,
    pins: ["12V", "5V", "GND", "IN1", "IN2", "IN3", "IN4", "ENA", "ENB", "OUT1", "OUT2", "OUT3", "OUT4"],
  },
  uln2003: {
    id: "uln2003",
    name: "ULN2003 Stepper Board",
    role: "Stepper Driver",
    description: "Darlington-array board that matches the 28BYJ-48 coil order and clamps the flyback spikes.",
    category: "module",
    domain: "electrical",
    unitCost: 2.0,
    pins: ["VCC", "GND", "IN1", "IN2", "IN3", "IN4", "OUT-A", "OUT-B", "OUT-C", "OUT-D", "OUT-COM"],
  },
  mosfet: {
    id: "mosfet",
    name: "IRLZ44N Logic-Level MOSFET Board",
    role: "Low-Side Switch",
    description:
      "Logic-level N-channel MOSFET with a gate resistor and flyback diode, switching the load's ground leg from a 3.3V pin.",
    category: "module",
    domain: "electrical",
    unitCost: 2.0,
    pins: ["VIN", "GND", "SIG", "OUT+", "OUT-"],
  },
  relay: {
    id: "relay",
    name: "Opto-Isolated Relay Module",
    role: "Load Switch",
    description: "Mechanical relay behind an optocoupler — heavier and slower than a MOSFET, but galvanically isolated.",
    category: "module",
    domain: "electrical",
    unitCost: 3.0,
    pins: ["VCC", "GND", "IN", "COM", "NO", "NC"],
  },
  ccdriver: {
    id: "ccdriver",
    name: "PT4115 Constant-Current Driver",
    role: "LED Driver",
    description: "Buck constant-current driver with a PWM dimming input, holding the emitter at a fixed forward current.",
    category: "module",
    domain: "electrical",
    unitCost: 3.0,
    pins: ["VIN", "GND", "DIM", "LED+", "LED-"],
  },
  ds3231: {
    id: "ds3231",
    name: "DS3231 RTC Module",
    role: "Real-Time Clock",
    description: "Temperature-compensated clock with a coin-cell backup; keeps schedule across power cuts and Wi-Fi outages.",
    category: "module",
    domain: "electrical",
    unitCost: 4.0,
    pins: ["VCC", "GND", "SDA", "SCL", "SQW"],
  },
  buttons: {
    id: "buttons",
    name: "12mm Tactile Buttons",
    role: "User Input",
    description: "Panel-mount momentary switches read with the MCU's internal pull-ups.",
    category: "module",
    domain: "electrical",
    qty: 2,
    unitCost: 0.8,
    pins: ["SIG", "GND"],
  },
  slideswitch: {
    id: "slideswitch",
    name: "SPDT Slide Switch",
    role: "Power Switch",
    description: "Panel switch breaking the battery's positive leg so the pack can sit charged and idle.",
    category: "module",
    domain: "electrical",
    unitCost: 0.6,
    pins: ["IN", "OUT"],
  },
  nrf24: {
    id: "nrf24",
    name: "nRF24L01+ Transceiver",
    role: "Wireless Link",
    description: "2.4GHz packet radio for the handlebar remote — lower latency and power than re-associating Wi-Fi.",
    category: "comms",
    domain: "electrical",
    unitCost: 3.0,
    pins: ["VCC", "GND", "CE", "CSN", "SCK", "MOSI", "MISO"],
  },
  espnowremote: {
    id: "espnowremote",
    name: "ESP32-C3 Remote Board",
    role: "Wireless Remote",
    description: "Second C3 running ESP-NOW, sleeping until a button wakes it — no pairing, no router.",
    category: "comms",
    domain: "electrical",
    unitCost: 4.5,
    pins: ["3V3", "GND", "GPIO2", "GPIO3"],
  },

  /* ---------- Power ---------- */
  usbc: {
    id: "usbc",
    name: "USB-C Power Breakout",
    role: "Power Inlet",
    description: "USB-C receptacle with CC pull-downs so any charger presents a clean 5V.",
    category: "power",
    domain: "electrical",
    unitCost: 1.5,
    pins: ["VBUS", "GND", "D+", "D-"],
  },
  psu5v: {
    id: "psu5v",
    name: "5V 3A Wall Adapter",
    role: "Mains Supply",
    description: "Sealed switching adapter sized for the LED load plus logic headroom.",
    category: "power",
    domain: "electrical",
    unitCost: 8.0,
    pins: ["V+", "V-"],
  },
  psu12v: {
    id: "psu12v",
    name: "12V 2A Wall Adapter",
    role: "Mains Supply",
    description: "Barrel-jack adapter feeding the actuator rail, stepped down separately for logic.",
    category: "power",
    domain: "electrical",
    unitCost: 9.0,
    pins: ["V+", "V-"],
  },
  powerbank: {
    id: "powerbank",
    name: "5V USB Power Bank",
    role: "Portable Supply",
    description: "Off-the-shelf bank with its own protection circuit — the least effort way to get a safe, swappable pack.",
    category: "power",
    domain: "electrical",
    unitCost: 12.0,
    pins: ["V+", "V-"],
  },
  aaholder: {
    id: "aaholder",
    name: "4×AA Battery Holder",
    role: "Energy Storage",
    description: "Six volts of alkaline cells with a switch tail — no charge circuit, no lithium in the enclosure.",
    category: "power",
    domain: "electrical",
    unitCost: 2.0,
    pins: ["B+", "B-"],
  },
  lipo1200: {
    id: "lipo1200",
    name: "1200mAh LiPo Cell",
    role: "Energy Storage",
    description: "Single-cell pouch with an integrated protection board, sized to fit a printed pocket.",
    category: "power",
    domain: "electrical",
    unitCost: 8.0,
    pins: ["B+", "B-"],
  },
  lipo500: {
    id: "lipo500",
    name: "500mAh LiPo Cell",
    role: "Energy Storage",
    description: "Flat 500mAh pouch, light enough to sit against fabric without pulling on a seam.",
    category: "power",
    domain: "electrical",
    unitCost: 6.0,
    pins: ["B+", "B-"],
  },
  cell18650: {
    id: "cell18650",
    name: "18650 Cell + Holder",
    role: "Energy Storage",
    description: "3.7V 3000mAh cell in a PCB-mount holder; swappable without unsoldering anything.",
    category: "power",
    domain: "electrical",
    unitCost: 7.0,
    pins: ["B+", "B-"],
  },
  pack2s: {
    id: "pack2s",
    name: "2S Li-ion Pack + BMS",
    role: "Energy Storage",
    description: "Two 18650s in series behind a balance/protection board, giving 7.4V for the motor rail.",
    category: "power",
    domain: "electrical",
    unitCost: 16.0,
    pins: ["P+", "P-"],
  },
  tp4056: {
    id: "tp4056",
    name: "TP4056 Charge Module",
    role: "Charge Controller",
    description: "Single-cell charger with protection and load sharing, so the design runs while it charges.",
    category: "power",
    domain: "electrical",
    unitCost: 2.0,
    pins: ["IN+", "IN-", "BAT+", "BAT-", "OUT+", "OUT-"],
  },
  solar: {
    id: "solar",
    name: "6V 2W Solar Panel",
    role: "Energy Harvester",
    description: "Epoxy panel angled at the sun path, sized to replace a day of duty-cycled sampling.",
    category: "power",
    domain: "electrical",
    unitCost: 10.0,
    pins: ["V+", "V-"],
  },
  coincell: {
    id: "coincell",
    name: "CR2032 Cell + Holder",
    role: "Remote Power",
    description: "Coin cell and PCB holder powering the handheld remote, which sleeps between button presses and lasts months.",
    category: "power",
    domain: "electrical",
    unitCost: 1.2,
    pins: ["B+", "B-"],
  },
  ldo3v3: {
    id: "ldo3v3",
    name: "MCP1700-3302E LDO",
    role: "3.3V Regulator",
    description: "1.6µA quiescent regulator — the difference between weeks and days of standby on one cell.",
    category: "power",
    domain: "electrical",
    unitCost: 0.6,
    pins: ["VIN", "GND", "VOUT"],
  },
  buck5v: {
    id: "buck5v",
    name: "MP1584 Buck Converter",
    role: "5V Regulator",
    description: "Switching step-down holding 5V across the pack's discharge curve at ~90% efficiency.",
    category: "power",
    domain: "electrical",
    unitCost: 2.5,
    pins: ["VIN", "GND", "VOUT"],
  },
  boost5v: {
    id: "boost5v",
    name: "MT3608 Boost Converter",
    role: "5V Regulator",
    description: "Step-up holding a 5V rail from a single cell as it sags from 4.2V toward 3.4V.",
    category: "power",
    domain: "electrical",
    unitCost: 2.0,
    pins: ["VIN", "GND", "VOUT"],
  },

  /* ---------- Enclosures ---------- */
  encdesk: {
    id: "encdesk",
    name: "Printed Desk Enclosure",
    role: "Main Housing",
    description: "Two-part printed shell with a snap lid and cable relief, sized around the board stack.",
    category: "enclosure",
    domain: "mechanical",
    unitCost: 6.0,
  },
  encip65: {
    id: "encip65",
    name: "IP65 ABS Enclosure",
    role: "Weatherproof Housing",
    description: "Gasketed ABS box with a membrane vent, so the sensor sees ambient air but not rain.",
    category: "enclosure",
    domain: "mechanical",
    unitCost: 9.0,
  },
  encsealed: {
    id: "encsealed",
    name: "Sealed Splash Enclosure",
    role: "Electronics Housing",
    description: "Gasketed box mounted above the waterline, keeping the driver electronics clear of the reservoir.",
    category: "enclosure",
    domain: "mechanical",
    unitCost: 7.0,
  },
} satisfies Record<string, Entry>;

export type PartKey = keyof typeof LIB;

/** Pin-role map per MCU, keyed by library id. */
export const MCU_PROFILES: Record<string, McuProfile> = {
  esp32c3: {
    logic: "3V3", gnd: "GND", sda: "SDA", scl: "SCL", vin: "5V",
    gpio: ["GPIO2", "GPIO3", "GPIO4", "GPIO5", "GPIO6", "GPIO7", "GPIO8", "GPIO9", "GPIO10", "GPIO20", "GPIO21"],
    adc: ["ADC0", "ADC1"],
  },
  esp32s3: {
    logic: "3V3", gnd: "GND", sda: "SDA", scl: "SCL", vin: "5V",
    gpio: ["GPIO4", "GPIO5", "GPIO6", "GPIO7", "GPIO8", "GPIO9", "GPIO15", "GPIO16", "GPIO17", "GPIO18"],
    adc: ["ADC0", "ADC1", "ADC2"],
  },
  rp2040: {
    logic: "3V3", gnd: "GND", sda: "SDA", scl: "SCL", vin: "VSYS",
    gpio: ["GP2", "GP3", "GP4", "GP5", "GP6", "GP7", "GP8", "GP9", "GP10"],
    adc: ["ADC0", "ADC1"],
  },
  xiaoc3: {
    logic: "3V3", gnd: "GND", sda: "SDA", scl: "SCL", vin: "5V",
    gpio: ["D0", "D1", "D2", "D3", "D6", "D7", "D8", "D9", "D10"],
    adc: ["ADC0"],
  },
};

/** Clone a library entry. Overrides let a design restate role/qty/cost. */
export function part(key: PartKey, overrides: Partial<Part> = {}): Part {
  const base = LIB[key] as Entry;
  return {
    ...base,
    qty: base.qty ?? 1,
    pins: base.pins ? [...base.pins] : undefined,
    ...overrides,
  };
}

export interface PrintSpec {
  id: string;
  name: string;
  role: string;
  description: string;
  /** e.g. "PETG · 40% infill, 0.2mm layer" */
  printSettings: string;
  unitCost: number;
  qty?: number;
}

/** Printed parts are per-design geometry, so they are built, not looked up. */
export function printedPart(spec: PrintSpec): Part {
  return {
    id: spec.id,
    name: spec.name,
    role: spec.role,
    description: spec.description,
    category: "print3d",
    domain: "mechanical",
    qty: spec.qty ?? 1,
    unitCost: spec.unitCost,
    printSettings: spec.printSettings,
  };
}

export interface HardwareSpec {
  id: string;
  name: string;
  role: string;
  description: string;
  qty: number;
  unitCost: number;
}

/** Fasteners, tubing, wire — mechanical miscellany. */
export function hardware(spec: HardwareSpec): Part {
  return {
    id: spec.id,
    name: spec.name,
    role: spec.role,
    description: spec.description,
    category: "misc",
    domain: "mechanical",
    qty: spec.qty,
    unitCost: spec.unitCost,
  };
}

/** Total library size, reported by the validation script. */
export const LIBRARY_SIZE = Object.keys(LIB).length;

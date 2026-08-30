/**
 * Sourcing — where to go looking for a part.
 *
 * A bill of materials you cannot buy from is half a deliverable, so every
 * purchasable part carries links out to vendors. Those links are *searches*,
 * built from the part name and nothing else. A DesignPackage names parts; it
 * never carries a manufacturer part number, an SKU or an ASIN, so there is no
 * honest way to produce an exact-product URL from one. An invented product
 * link that 404s — or worse, quietly points at the wrong component — is more
 * expensive to the builder than no link at all.
 *
 * Rules this module keeps:
 *   - search URLs only, query = the part name;
 *   - no affiliate or referral parameters;
 *   - no claim about price, stock or availability;
 *   - `print3d` parts are printed from the STL, not bought, so they source
 *     from nobody.
 *
 * Pure and deterministic: the same part always yields the same links.
 */

import type { Part, PartCategory } from "./schema";

export interface Vendor {
  /** Stable key, used for React keys and nothing else. */
  id: string;
  /** Short display name, as it appears in the parts list. */
  name: string;
  /** Full name, for link titles and screen readers. */
  fullName: string;
  /** Builds this vendor's search URL for a part. Encodes the query. */
  searchUrl: (part: Part) => string;
}

/**
 * The query sent to every vendor: the part name, whitespace collapsed.
 *
 * Nothing is stripped — punctuation, revision suffixes and voltages are all
 * part of how a builder would search for the thing, and the vendors tokenize
 * them fine.
 */
export function sourcingQuery(part: Part): string {
  return part.name.trim().replace(/\s+/g, " ");
}

function q(part: Part): string {
  return encodeURIComponent(sourcingQuery(part));
}

/** Every vendor this app knows how to search. Keyed lookup lives below. */
export const VENDORS: Record<string, Vendor> = {
  digikey: {
    id: "digikey",
    name: "DigiKey",
    fullName: "DigiKey",
    searchUrl: (part) => `https://www.digikey.com/en/products/result?keywords=${q(part)}`,
  },
  mouser: {
    id: "mouser",
    name: "Mouser",
    fullName: "Mouser Electronics",
    searchUrl: (part) => `https://www.mouser.com/c/?q=${q(part)}`,
  },
  adafruit: {
    id: "adafruit",
    name: "Adafruit",
    fullName: "Adafruit",
    searchUrl: (part) => `https://www.adafruit.com/search?q=${q(part)}`,
  },
  amazon: {
    id: "amazon",
    name: "Amazon",
    fullName: "Amazon",
    searchUrl: (part) => `https://www.amazon.com/s?k=${q(part)}`,
  },
};

/**
 * Vendors per category. Electrical parts go to the distributors first, because
 * that is where a datasheet-accurate match lives; mechanical hardware and
 * enclosures skip them, since neither distributor stocks a printed bracket's
 * neighbours. `print3d` is empty by design — see `sourcingLinks`.
 */
const ELECTRONICS: readonly string[] = ["digikey", "mouser", "adafruit", "amazon"];
const HARDWARE: readonly string[] = ["amazon", "adafruit"];

const VENDORS_BY_CATEGORY: Record<PartCategory, readonly string[]> = {
  mcu: ELECTRONICS,
  sensor: ELECTRONICS,
  actuator: ELECTRONICS,
  power: ELECTRONICS,
  comms: ELECTRONICS,
  display: ELECTRONICS,
  module: ELECTRONICS,
  enclosure: HARDWARE,
  print3d: [],
  misc: HARDWARE,
};

export interface SourcingLink {
  vendor: string;
  /** Vendor short name, the visible link text. */
  label: string;
  url: string;
  /** Spelled-out destination, for `title` and `aria-label`. */
  description: string;
}

/** True when this part is bought rather than fabricated. */
export function isSourceable(part: Part): boolean {
  return VENDORS_BY_CATEGORY[part.category].length > 0;
}

/**
 * Vendor searches for a part, in display order. Empty for `print3d` parts —
 * those come off the printer, and the assembly STL is their source.
 */
export function sourcingLinks(part: Part): SourcingLink[] {
  const query = sourcingQuery(part);
  if (!query) return [];
  return VENDORS_BY_CATEGORY[part.category]
    .map((id) => VENDORS[id])
    .filter((v): v is Vendor => Boolean(v))
    .map((vendor) => ({
      vendor: vendor.id,
      label: vendor.name,
      url: vendor.searchUrl(part),
      description: `Search ${vendor.fullName} for "${query}" (opens in a new tab)`,
    }));
}

/** Shown beside the links so nobody mistakes a search for a product page. */
export const SOURCING_DISCLAIMER =
  "Keyword searches, not specific products. Verify the match before ordering.";

/** Stand-in shown where a printed part's vendor links would be. */
export const PRINTED_PART_NOTE = "Printed, not purchased — export the STL to make this part.";

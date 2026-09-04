import type { Metadata } from "next";
import { SharedResolver } from "./SharedResolver";

export const metadata: Metadata = {
  title: "Shared design — OpenBlueprint",
  description:
    "View a hardware design shared via a link. Nothing is uploaded — the whole design travels compressed in the URL.",
};

export default function SharedPage() {
  return <SharedResolver />;
}

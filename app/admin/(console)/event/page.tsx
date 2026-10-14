import type { Metadata } from "next";
import { EventClient } from "./event-client";

export const metadata: Metadata = { title: "Event controls" };

export default function Page() {
  return <EventClient />;
}

import type { Metadata } from "next";
import { ValidationClient } from "./validation-client";

export const metadata: Metadata = { title: "Data validation" };

export default function Page() {
  return <ValidationClient />;
}

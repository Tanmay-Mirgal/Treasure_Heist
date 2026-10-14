import type { Metadata } from "next";
import { QrClient } from "./qr-client";

export const metadata: Metadata = { title: "QR codes" };

export default function Page() {
  return <QrClient />;
}

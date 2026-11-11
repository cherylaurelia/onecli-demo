import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Young_Serif } from "next/font/google";
import "./globals.css";

const sans = Inter({ variable: "--ff-sans", subsets: ["latin"] });
const serif = Young_Serif({ variable: "--ff-serif", subsets: ["latin"], weight: "400" });
const mono = JetBrains_Mono({ variable: "--ff-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Large WebSocket messages through the OneCLI gateway",
  description:
    "Why the tail of a large WebSocket message can wait in the OneCLI gateway until the client writes again, measured on the real binary, with a one-line fix. Unofficial demo by Cheryl Aurelia.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}

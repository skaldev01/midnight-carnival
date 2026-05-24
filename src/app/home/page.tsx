import type { Metadata } from "next";
import HomeApp from "./components/HomeApp";

export const metadata: Metadata = {
  title: "Midnight Carnival — Screenwriting Tool",
};

export default function HomePage() {
  return <HomeApp />;
}

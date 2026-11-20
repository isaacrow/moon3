// Moved out of WolfMoon.tsx unchanged; see that file for how they are used.
import React, {  } from "react";
import {
  
  BookOpen, 
  
  Music, Map, 
  Newspaper, Archive, Image as ImageIcon
  
  
  
  } from "lucide-react";

// ============================== THEME CONSTANTS ==============================

export type GlassTheme = "dark" | "legacy" | "classic";

export const BM_DARK = {
  bg: "radial-gradient(circle at 50% 0%, rgba(30, 58, 138, 0.35) 0%, rgba(10, 15, 30, 0.95) 45%, #030408 100%)",
  navBg: "rgba(255, 255, 255, 0.12)",
  navBorder: "rgba(255, 255, 255, 0.20)",
  cardBg: "rgba(255, 255, 255, 0.12)",
  cardBorder: "rgba(255, 255, 255, 0.20)",
  cardHover: "rgba(255, 255, 255, 0.18)",
  accent: "#38bdf8",
  accentDim: "#60a5fa",
  accentGlow: "rgba(56, 189, 248, 0.25)",
  accentBorder: "rgba(255, 255, 255, 0.25)",
  secondary: "#c084fc",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  text: "#ffffff",
  textMuted: "rgba(255, 255, 255, 0.85)",
  textDim: "rgba(255, 255, 255, 0.60)",
  inputBg: "rgba(0, 0, 0, 0.35)",
  inputBorder: "rgba(255, 255, 255, 0.20)",
};

export const BM_LEGACY = {
  bg: "transparent",
  navBg: "rgba(255,255,255,0.8)",
  navBorder: "rgba(255,255,255,0.5)",
  cardBg: "rgba(255,255,255,0.75)",
  cardBorder: "rgba(255,255,255,0.4)",
  cardHover: "rgba(0,0,0,0.05)",
  accent: "#3b82f6",
  accentDim: "#2563eb",
  accentGlow: "rgba(59,130,246,0.12)",
  accentBorder: "rgba(59,130,246,0.3)",
  secondary: "#1e40af",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
  text: "#000000",
  textMuted: "#374151",
  textDim: "#6b7280",
  inputBg: "rgba(255,255,255,0.5)",
  inputBorder: "rgba(255,255,255,0.4)",
};

export const BM_CLASSIC = {
  bg: "#ffffff",
  navBg: "#ffffff",
  navBorder: "#e5e7eb",
  cardBg: "#ffffff",
  cardBorder: "#e5e7eb",
  cardHover: "#f9fafb",
  accent: "#2563eb",
  accentDim: "#3b82f6",
  accentGlow: "rgba(37,99,235,0.08)",
  accentBorder: "#bfdbfe",
  secondary: "#1d4ed8",
  success: "#16a34a",
  warning: "#ca8a04",
  danger: "#dc2626",
  text: "#111827",
  textMuted: "#4b5563",
  textDim: "#9ca3af",
  inputBg: "#f9fafb",
  inputBorder: "#d1d5db",
};

export const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  "monograph-complete": <BookOpen className="h-4 w-4" />,
  serial: <Newspaper className="h-4 w-4" />,
  manuscript: <Archive className="h-4 w-4" />,
  music: <Music className="h-4 w-4" />,
  map: <Map className="h-4 w-4" />,
  "still-image": <ImageIcon className="h-4 w-4" />,
};

export type BMTheme = typeof BM_DARK;

export const BMThemeContext = React.createContext<BMTheme>(BM_DARK);

export function useBMTheme() { return React.useContext(BMThemeContext); }

export const space = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48] as const;
export const radius = { xl: 16, "2xl": 20, "3xl": 28, full: 9999 } as const;
export const shadow = {
  soft: "0 8px 24px -8px rgba(67,56,202,0.10)",
  lift: "0 16px 40px -12px rgba(67,56,202,0.18)",
} as const;
export const motion = { hover: 180, sheet: 280, tap: 120 } as const;
export const bg = { default: "#f8fafc", surface: "#ffffff", gradient: "linear-gradient(135deg, #eef2ff 0%, #fffbeb 100%)" } as const;
export const tabBarHeight = 64;

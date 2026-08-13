/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    background: '#EAF1FF',           // App background
    backgroundElement: '#FFFFFF',    // Navigation bar background
    textSecondary: '#ACACAC',        // Divider color
    text: '#272727',                 // Navigation bar text color & unselected icons
    bodyText: '#000000',             // Main app text color (on background)
    backgroundSelected: '#EFF6FF',   // Selected button background
    textSelected: '#0900FF',         // Selected text/icon color
  },
  dark: {
    background: '#0B111E',           // App background (dark mode equivalent)
    backgroundElement: '#151D2A',    // Navigation bar background
    textSecondary: '#4A5568',        // Divider color
    text: '#E2E8F0',                 // Navigation bar text color & unselected icons
    bodyText: '#FFFFFF',             // Main app text color (on background)
    backgroundSelected: '#1E293B',   // Selected button background
    textSelected: '#60A5FA',         // Selected text/icon color
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
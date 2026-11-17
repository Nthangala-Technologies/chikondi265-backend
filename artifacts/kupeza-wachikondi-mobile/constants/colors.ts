/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens provide a consistent palette for the native app.
 *
 * Replace the placeholder values below with values that match the project's
 * brand.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#2d2332',
    tint: '#df4e78',

    // Core surfaces
    background: '#f7efeb',
    foreground: '#2d2332',

    // Cards / elevated surfaces
    card: '#fffaf7',
    cardForeground: '#2d2332',

    // Primary action color (buttons, links, active states)
    primary: '#df4e78',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#e8f1f5',
    secondaryForeground: '#2a657c',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#eee4e1',
    mutedForeground: '#806d7a',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#f5c86f',
    accentForeground: '#2d2332',

    // Destructive actions (delete, error states)
    destructive: '#bd4d5e',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#e5d8d4',
    input: '#e5d8d4',
  },

  dark: {
    text: '#f6edf1',
    tint: '#f16b91',
    background: '#11131d',
    foreground: '#f6edf1',
    card: '#1b1e2a',
    cardForeground: '#f6edf1',
    primary: '#ef6289',
    primaryForeground: '#ffffff',
    secondary: '#242a3b',
    secondaryForeground: '#a9d2df',
    muted: '#262a38',
    mutedForeground: '#aaaebd',
    accent: '#f2c66e',
    accentForeground: '#24202a',
    destructive: '#e76878',
    destructiveForeground: '#ffffff',
    border: '#343747',
    input: '#383b4b',
  },

  // Border radius in points for cards, buttons, inputs, and modals.
  radius: 22,
};

export default colors;

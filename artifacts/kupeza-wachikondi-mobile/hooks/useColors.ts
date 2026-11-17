import colors from '@/constants/colors';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Falls back to the light palette when no dark key is defined in
 * constants/colors.ts. Add a `dark` palette there to automatically switch
 * based on the device's appearance setting.
 */
export function useColors() {
  const { scheme } = useTheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  return {
    ...palette,
    radius: colors.radius,
    surface: palette.card,
    onSurface: palette.foreground,
    surfaceVariant: palette.secondary,
    onSurfaceVariant: palette.mutedForeground,
    divider: palette.border,
    ripple: palette.muted,
    onImage: palette.primaryForeground,
    shadow: '#000000',
    overlay: scheme === 'dark' ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.48)',
    imageShade: scheme === 'dark' ? 'rgba(0,0,0,0.48)' : 'rgba(0,0,0,0.24)',
  };
}

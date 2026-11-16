export const INTENTION_OPTIONS = [
  { value: 'long-term', label: 'Long-term partner' },
  { value: 'short-term', label: 'Short-term' },
  { value: 'casual', label: 'Short-term fun' },
  { value: 'friendship', label: 'New friends' },
  { value: 'marriage', label: 'Marriage' },
  { value: 'unsure', label: 'Still figuring it out' },
] as const;

export type Intention = (typeof INTENTION_OPTIONS)[number]['value'];

export function isIntention(value: unknown): value is Intention {
  return (
    typeof value === 'string' &&
    INTENTION_OPTIONS.some((option) => option.value === value)
  );
}

export function getIntentionLabel(value: string | null | undefined): string {
  return (
    INTENTION_OPTIONS.find((option) => option.value === value)?.label ??
    'Not specified'
  );
}

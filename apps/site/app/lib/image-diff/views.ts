export type ViewMode = 'slider' | 'blink' | 'diff' | 'side-by-side';

export const viewModes: { id: ViewMode; label: string; icon: string }[] = [
  { id: 'slider', label: 'Slider', icon: 'i-lucide-columns-2' },
  { id: 'blink', label: 'Blink', icon: 'i-lucide-zap' },
  { id: 'diff', label: 'Diff', icon: 'i-lucide-diff' },
  {
    id: 'side-by-side',
    label: 'Side by side',
    icon: 'i-lucide-panels-left-right',
  },
];

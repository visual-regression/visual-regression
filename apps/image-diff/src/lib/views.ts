export type ViewMode = 'side-by-side' | 'slider' | 'blink' | 'overlay';

export const viewModes: { id: ViewMode; label: string }[] = [
  { id: 'side-by-side', label: 'Side by side' },
  { id: 'slider', label: 'Slider' },
  { id: 'blink', label: 'Blink' },
  { id: 'overlay', label: 'Diff overlay' },
];

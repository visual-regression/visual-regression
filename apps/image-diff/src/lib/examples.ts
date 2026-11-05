export interface Example {
  id: string;
  name: string;
  description: string;
  lookFor: string;
  engine: string;
}

export const loadExamples = async (): Promise<Example[]> => {
  const response = await fetch('/examples/index.json');
  if (!response.ok) return [];
  return (await response.json()) as Example[];
};

export const exampleImage = async (
  id: string,
  which: 'baseline' | 'actual',
) => {
  const response = await fetch(`/examples/${id}/${which}.png`);
  if (!response.ok) throw new Error(`Could not load the ${id} example`);
  return response.blob();
};

export const semanticColor = {
  gain: 'text-gain',
  loss: 'text-loss',
  risk: 'text-risk',
  neutral: 'text-neutral',
} as const;

export type SemanticColor = keyof typeof semanticColor;

/** Estimated AI credits until real token billing is connected */

export function estimateCredits(
  model: string,
  question: string,
  answer: string,
  cached = false
): number {
  if (cached) return 0;

  const chars = question.length + answer.length;

  if (model === "phi" || model === "qwen") {
    return Math.max(1, Math.ceil(1 + chars / 250));
  }

  if (model === "qwen35" || model === "deepseek") {
    return Math.max(2, Math.ceil(3 + chars / 100));
  }

  return Math.max(1, Math.ceil(1 + chars / 200));
}

export function isSmallBillingModel(model: string): boolean {
  return model === "phi" || model === "qwen";
}

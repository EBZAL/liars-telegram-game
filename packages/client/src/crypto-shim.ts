export function randomBytes(size: number): { toString: (encoding?: string) => string } {
  const bytes = new Uint8Array(size);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  }
  return {
    toString: (_encoding?: string) =>
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
  };
}

export function createHmac() {
  return {
    update: () => ({
      digest: () => '',
    }),
  };
}

export function timingSafeEqual(): boolean {
  return false;
}

export default {
  randomBytes,
  createHmac,
  timingSafeEqual,
};

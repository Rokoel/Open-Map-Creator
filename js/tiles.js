export const tileDefaults = {
  tileset: [],
  mirrorHorizontal: false,
  mirrorVertical: false,
  randomRotation: false,
  hueRandomness: 0,
  saturationRandomness: 0,
  brightnessRandomness: 0,
  contrastRandomness: 0,
};
export function tileVariation(settings) {
  const range = (amount) => (Math.random() * 2 - 1) * (amount || 0);
  return {
    textureRotation: settings.randomRotation
      ? (Math.floor(Math.random() * 4) * Math.PI) / 2
      : 0,
    textureMirrorX: !!settings.mirrorHorizontal && Math.random() < 0.5,
    textureMirrorY: !!settings.mirrorVertical && Math.random() < 0.5,
    hueShift: range(settings.hueRandomness),
    saturation: Math.max(0, 1 + range(settings.saturationRandomness)),
    brightness: Math.max(0, 1 + range(settings.brightnessRandomness)),
    contrast: Math.max(0, 1 + range(settings.contrastRandomness)),
  };
}

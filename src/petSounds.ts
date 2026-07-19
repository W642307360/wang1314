export type PetSound = {
  id: string;
  label: string;
  url: string;
};

const buildSounds = (kind: "cat" | "dog", label: string): PetSound[] =>
  Array.from({ length: 30 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return {
      id: `${kind}-${number}`,
      label: `${label} ${number}`,
      url: `/assets/sounds/${kind === "cat" ? "cats" : "dogs"}/${kind}-${number}.mp3`,
    };
  });

export const catSounds = buildSounds("cat", "真实幼猫声音");
export const dogSounds = buildSounds("dog", "真实幼犬声音");

const stableIndex = (value: string, length: number) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
};

export function soundForPet(breedId: string, breedName: string, petId?: number | null) {
  const library = breedId.startsWith("cats-")
    ? catSounds
    : breedId.startsWith("dogs-")
      ? dogSounds
      : null;
  if (!library) return null;
  const key = `${breedId}:${breedName}:${petId || "breed"}`;
  return library[stableIndex(key, library.length)];
}

type PetNamingInput = {
  id?: number | string | null;
  name?: string | null;
  breed?: string | null;
};

const atmospheres = [
  "月桂", "银河", "雾凇", "奶油", "琥珀", "极光", "初雪", "暮云",
  "星砂", "白桃", "晨露", "蜜糖", "云端", "月汐", "风铃", "蔷薇",
  "松间", "雪原", "晴空", "海盐", "花朝", "夜航", "微光", "春野",
  "落樱", "暖阳", "薄荷", "蓝莓", "银月", "金穗", "珊瑚", "萤火",
];

const features = [
  "星瞳", "云尾", "雪团", "月耳", "蜜鼻", "花脸", "绒领", "奶爪",
  "蝶耳", "桃心", "烟尾", "霜眉", "糖豆", "铃铛", "绵云", "鹿眼",
  "银瞳", "羽尾", "月脸", "棉糖", "琉瞳", "围脖", "星脸", "软爪",
  "雾尾", "蜜眼", "雪鼻", "糖耳", "珠脸", "星眉", "披风", "绒球",
];

const characters = [
  "星", "月", "云", "糖", "暖", "萌", "灵", "梦",
  "光", "甜", "乖", "乐", "晴", "宁", "柔", "酷",
];

const stableIndex = (value: string, length: number) => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
};

const shortBreedName = (breed: string) =>
  breed.replace(/(?:猫|犬|狗)$/u, "").replace(/^其他/u, "萌宠") || breed;

export function generatedPetName(pet: PetNamingInput | null | undefined, fallbackBreed = "萌宠") {
  const breed = String(pet?.breed || fallbackBreed || "萌宠").trim();
  const shortBreed = shortBreedName(breed);
  const numericId = Number(pet?.id);
  const key = `${pet?.id || pet?.name || "new"}:${breed}`;
  const capacity = atmospheres.length * features.length * characters.length;
  const baseIndex = Number.isSafeInteger(numericId) && numericId > 0
    ? numericId - 1
    : stableIndex(key, capacity);
  // 7919 与 16384 互质：在当前容量内保持一一对应，同时让相邻商品的三层意象明显不同。
  const uniqueIndex = (baseIndex * 7919) % capacity;
  const atmosphere = atmospheres[uniqueIndex % atmospheres.length];
  const featureIndex = Math.floor(uniqueIndex / atmospheres.length);
  const feature = features[featureIndex % features.length];
  const characterIndex = Math.floor(featureIndex / features.length);
  const character = characters[characterIndex % characters.length];
  const overflowMark = baseIndex >= capacity ? `·${baseIndex.toString(36).toUpperCase()}` : "";
  return `${atmosphere}${feature}${character}${shortBreed}${overflowMark}`;
}

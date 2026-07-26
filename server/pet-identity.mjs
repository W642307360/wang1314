import { enrichPetDetails, normalizePetBirthDate } from "./pet-details.mjs";

const stableSeed = (value) =>
  String(value).split("").reduce(
    (sum, char, index) => (sum + char.charCodeAt(0) * (index + 11)) % 100003,
    37,
  );

const parseDatabaseTime = (value) => {
  const text = String(value || "").trim();
  if (!text) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(" ", "T")}Z`
    : text;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatIdentityDate = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${String(date.getUTCDate()).padStart(2, "0")}`
    : "待核验";
};

const normalizeGender = (value) => {
  const text = String(value || "").trim();
  if (["male", "公", "公犬", "公猫", "男"].includes(text)) return "公";
  if (["female", "母", "母犬", "母猫", "女"].includes(text)) return "母";
  return text || "待核验";
};

const speciesCodeFor = (breed) => {
  const value = String(breed || "");
  if (/猫|狸|喵/.test(value)) return "C";
  if (/犬|狗/.test(value)) return "D";
  if (/鸟|鹦鹉/.test(value)) return "B";
  if (/鱼|龟|水族/.test(value)) return "A";
  return "P";
};

const generatedPersonalityFor = (seed) => {
  const traits = [
    "温顺亲人",
    "活泼好奇",
    "安静贴心",
    "聪明爱玩",
    "慢热温柔",
    "元气外向",
    "稳重乖巧",
    "黏人爱互动",
    "独立安静",
    "友善随和",
    "机灵敏捷",
    "细腻敏锐",
  ];
  const firstIndex = seed % traits.length;
  const secondIndex = (seed * 7 + 5) % traits.length;
  return [traits[firstIndex], traits[secondIndex]]
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" · ");
};

export const buildPetIdentityProfile = (pet, existing = null) => {
  const resolvedPet = enrichPetDetails(pet);
  const rawId = Number(pet?.id || 0);
  if (!Number.isInteger(rawId) || rawId <= 0)
    throw new Error("宠物身份证缺少有效商品ID");
  const stableId = rawId;
  const issuedAt =
    parseDatabaseTime(pet?.created_at) ||
    parseDatabaseTime(String(existing?.issued_date || "").replaceAll(".", "-")) ||
    Date.now();
  const ageMonths = Math.max(1, Number(resolvedPet?.age_months || 3));
  const explicitBirthDate = normalizePetBirthDate(resolvedPet?.birth_date);
  const derivedBirth = new Date(issuedAt);
  derivedBirth.setUTCDate(1);
  derivedBirth.setUTCMonth(derivedBirth.getUTCMonth() - ageMonths);
  derivedBirth.setUTCDate(
    1 +
      (stableSeed(
        `${stableId}|${pet?.external_id || ""}|${pet?.created_at || ""}|birth`,
      ) %
        28),
  );
  const seed = stableSeed([
    stableId,
    resolvedPet?.breed || "",
    resolvedPet?.gender || "",
    resolvedPet?.color || "",
    pet?.created_at || "",
  ].join("|"));
  const check = String((seed * 17 + stableId * 31) % 97).padStart(2, "0");
  const suppliedPersonality = String(resolvedPet?.personality || "").trim();
  const personality =
    suppliedPersonality ||
    (
      existing?.personality &&
      !["待商家补充", "待核验"].includes(String(existing.personality))
        ? String(existing.personality)
        : generatedPersonalityFor(seed)
    );
  return {
    pet_id: stableId,
    display_name: "待宠物主起名",
    breed: String(resolvedPet?.breed || "宠物档案").trim() || "宠物档案",
    gender: normalizeGender(resolvedPet?.gender),
    birth_date: explicitBirthDate
      ? explicitBirthDate.replaceAll("-", ".")
      : existing?.birth_date || formatIdentityDate(derivedBirth),
    color:
      String(resolvedPet?.color || "自然综合色").trim() || "自然综合色",
    body_type: String(resolvedPet?.body_type || "中型").trim() || "中型",
    fur_length:
      String(resolvedPet?.fur_length || "待商家补充").trim() || "待商家补充",
    personality,
    health_status:
      String(resolvedPet?.health_status || "健康").trim() || "健康",
    vaccine_record:
      String(
        resolvedPet?.vaccine_record || "健康（待商家补充详细记录）",
      ).trim() || "健康（待商家补充详细记录）",
    identity_no:
      existing?.identity_no ||
      `FC-${speciesCodeFor(resolvedPet?.breed)}${String(stableId).padStart(6, "0")}-${check}`,
    chip_no:
      existing?.chip_no ||
      `VFC-${String(stableId).padStart(6, "0")}-${String(seed % 1_000_000).padStart(6, "0")}`,
    issued_date: existing?.issued_date || formatIdentityDate(issuedAt),
    algorithm_version: "pet-identity-v2",
    source_json: JSON.stringify({
      name: "platform_fixed",
      breed: resolvedPet?.breed ? "field" : "default",
      ...resolvedPet.detail_sources,
      personality: suppliedPersonality
        ? resolvedPet.detail_sources?.personality || "field"
        : "generated",
    }),
  };
};

export const upsertPetIdentityProfile = (db, pet) => {
  const existing = db
    .prepare("SELECT * FROM pet_identity_profiles WHERE pet_id=?")
    .get(Number(pet?.id));
  const profile = buildPetIdentityProfile(pet, existing);
  db.prepare(
    `INSERT INTO pet_identity_profiles
      (pet_id,display_name,breed,gender,birth_date,color,body_type,fur_length,
       personality,health_status,vaccine_record,identity_no,chip_no,issued_date,
       algorithm_version,source_json)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(pet_id) DO UPDATE SET
       display_name=excluded.display_name,
       breed=excluded.breed,
       gender=excluded.gender,
       birth_date=excluded.birth_date,
       color=excluded.color,
       body_type=excluded.body_type,
       fur_length=excluded.fur_length,
       personality=excluded.personality,
       health_status=excluded.health_status,
       vaccine_record=excluded.vaccine_record,
       algorithm_version=excluded.algorithm_version,
       source_json=excluded.source_json,
       updated_at=CURRENT_TIMESTAMP`,
  ).run(
    profile.pet_id,
    profile.display_name,
    profile.breed,
    profile.gender,
    profile.birth_date,
    profile.color,
    profile.body_type,
    profile.fur_length,
    profile.personality,
    profile.health_status,
    profile.vaccine_record,
    profile.identity_no,
    profile.chip_no,
    profile.issued_date,
    profile.algorithm_version,
    profile.source_json,
  );
  return db
    .prepare("SELECT * FROM pet_identity_profiles WHERE pet_id=?")
    .get(profile.pet_id);
};

export const backfillPetIdentityProfiles = (db) => {
  const pets = db.prepare(
    `SELECT id,name,breed,gender,birth_date,age_months,color,body_type,fur_length,
            personality,health_status,vaccine_record,description,source,external_id,created_at
     FROM pets WHERE status<>'deleted' ORDER BY id`,
  ).all();
  let created = 0;
  let updated = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const pet of pets) {
      const existed = Boolean(
        db.prepare("SELECT 1 FROM pet_identity_profiles WHERE pet_id=?").get(pet.id),
      );
      upsertPetIdentityProfile(db, pet);
      if (existed) updated++;
      else created++;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { total: pets.length, created, updated };
};

const cleanText = (value) => String(value ?? "").trim();

const labeledValue = (text, labels) => {
  const source = cleanText(text);
  for (const label of labels) {
    const match = source.match(
      new RegExp(`${label}\\s*[：:]?\\s*([^\\n，,；;。|]{1,40})`, "i"),
    );
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
};

export const normalizePetBirthDate = (value) => {
  const text = cleanText(value);
  if (!text) return "";
  if (/^\d{10,13}$/.test(text)) {
    const numeric = Number(text);
    const date = new Date(text.length === 10 ? numeric * 1000 : numeric);
    if (Number.isFinite(date.getTime()))
      return date.toISOString().slice(0, 10);
  }
  const chinese = text.match(
    /((?:19|20)\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?/,
  );
  if (chinese) {
    const year = Number(chinese[1]);
    const month = Number(chinese[2]);
    const day = Number(chinese[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
};

export const normalizePetGender = (value, description = "") => {
  const explicit = cleanText(value).toLowerCase();
  if (["male", "公", "公犬", "公猫", "男", "弟弟"].includes(explicit)) return "公";
  if (["female", "母", "母犬", "母猫", "女", "妹妹"].includes(explicit)) return "母";
  const text = cleanText(description);
  if (/(?:性别|公母)\s*[：:]?\s*(?:公|男)|(?:小公|公猫|公犬|弟弟)/.test(text))
    return "公";
  if (/(?:性别|公母)\s*[：:]?\s*(?:母|女)|(?:小母|母猫|母犬|妹妹)/.test(text))
    return "母";
  return explicit ? cleanText(value) : "";
};

const normalizeBodyType = (value, description = "") => {
  const text = `${cleanText(value)} ${cleanText(description)}`;
  if (/(小型|迷你|小体|小体型|小型犬|小型猫)/.test(text)) return "小型";
  if (/(大型|巨型|大体|大体型|大型犬|大型猫)/.test(text)) return "大型";
  if (/(中型|中等|标准体型|中型犬|中型猫)/.test(text)) return "中型";
  return "";
};

const normalizeAgeMonths = (value, description = "") => {
  const explicit = Number(value || 0);
  if (Number.isFinite(explicit) && explicit > 0)
    return Math.max(1, Math.min(360, Math.round(explicit)));
  const match = cleanText(description).match(
    /(?:月龄\s*[：:]?\s*)?(\d{1,3})\s*(?:个月|月龄|月大)/,
  );
  return match ? Math.max(1, Math.min(360, Number(match[1]))) : null;
};

const normalizeFurLength = (value, description = "") => {
  const explicit = cleanText(value);
  if (explicit) return explicit;
  const labeled = labeledValue(description, ["毛发长度", "毛长", "被毛"]);
  if (labeled) return labeled;
  const text = cleanText(description);
  if (/(中长毛|中长绒)/.test(text)) return "中长毛";
  if (/(长毛|长绒|长被毛)/.test(text)) return "长毛";
  if (/(短毛|短绒|短被毛)/.test(text)) return "短毛";
  return "";
};

const normalizeVaccine = (value, description = "") => {
  const explicit = cleanText(value);
  if (explicit) return explicit;
  return labeledValue(description, ["疫苗记录", "免疫记录", "疫苗", "免疫"]);
};

export const enrichPetDetails = (input = {}) => {
  const description = cleanText(input.description);
  const directBirthDate = normalizePetBirthDate(input.birth_date);
  const describedBirthDate = normalizePetBirthDate(
    labeledValue(description, ["出生日期", "出生时间", "生日"]),
  );
  const color =
    cleanText(input.color) ||
    labeledValue(description, ["毛色", "花色", "颜色"]);
  const personality =
    cleanText(input.personality) ||
    labeledValue(description, ["性格", "性格特点", "性格描述"]);
  const describedHealth = labeledValue(description, ["健康状态", "健康等级", "健康"]);
  const healthStatus = cleanText(input.health_status) || describedHealth || "健康";
  return {
    ...input,
    gender: normalizePetGender(input.gender, description) || null,
    birth_date: directBirthDate || describedBirthDate || null,
    age_months: normalizeAgeMonths(input.age_months, description),
    color: color || null,
    body_type:
      normalizeBodyType(input.body_type, description) ||
      cleanText(input.body_type) ||
      "中型",
    fur_length: normalizeFurLength(input.fur_length, description) || null,
    personality: personality || null,
    health_status: healthStatus,
    vaccine_record: normalizeVaccine(input.vaccine_record, description) || null,
    detail_sources: {
      gender: cleanText(input.gender) ? "field" : normalizePetGender("", description) ? "description" : "default",
      birth_date: directBirthDate ? "field" : describedBirthDate ? "description" : "derived",
      color: cleanText(input.color) ? "field" : color ? "description" : "default",
      body_type: cleanText(input.body_type) ? "field" : normalizeBodyType("", description) ? "description" : "default",
      fur_length: cleanText(input.fur_length) ? "field" : normalizeFurLength("", description) ? "description" : "default",
      personality: cleanText(input.personality) ? "field" : personality ? "description" : "default",
      health_status: cleanText(input.health_status) ? "field" : describedHealth ? "description" : "default",
      vaccine_record: cleanText(input.vaccine_record) ? "field" : normalizeVaccine("", description) ? "description" : "default",
    },
  };
};

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const enabled = !["0", "false", "off"].includes(
  String(process.env.CUSTOMER_SERVICE_CORPUS_ENABLED ?? "1").toLowerCase(),
);

const semanticReplacements = [
  [/毛(?:发)?(?:是|是不是|会不会|看着|比较|很|特别|有点|不太)*蓬松/g, "毛发蓬松"],
  [/不(?:太|怎么|怎么太|怎么爱)?爱?叫/g, "不爱叫"],
  [/(?:突然)?(?:没有|没什么|没啥|不太有)精神|精神(?:突然)?(?:不好|不佳|很差)/g, "不动不吃"],
  [/平时的(?=性格)/g, ""],
  [/还有没有货|有没有货|还有没有|是不是还有|是否还有|还有货不|还卖不卖/g, "还有吗"],
  [/脾气怎么样|性格怎么样|脾气如何|性格如何|温不温顺|凶不凶/g, "性格"],
  [/多长时间可以收到|多长时间能收到|多久可以收到|多久能收到|多久会收到|多久收到/g, "几天到"],
  [/多长时间可以到|多长时间能到|多久可以到|多久能到|多久会到|多久到/g, "几天到"],
  [/多少天|几天可以|几天能|几天会/g, "几天"],
  [/什么时候可以|什么时候能|什么时候会/g, "什么时候"],
  [/可以收到|能收到|会收到|收到货|收得到/g, "到"],
  [/配送到|运送到|寄送到|送达到|送到|运到|寄到/g, "到"],
  [/大约|大概|差不多|通常|一般要/g, ""],
];

const normalize = (value) => {
  let text = String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
  for (const [pattern, replacement] of semanticReplacements)
    text = text.replace(pattern, replacement);
  return text
    .replace(/^(您好|你好|亲|那个|就是)*(我想咨询一下|我想了解一下|我想问一下|我想咨询|我想了解|我想问|请问一下|请问下|请问|麻烦问一下|麻烦问下|麻烦)+/g, "")
    .replace(/(能帮我确认一下吗|帮我确认一下|可以帮我看看吗|帮我看一下|我想确认一下|可以吗|行不行|行吗|好不好|呢|呀|啊|哦|哈)+$/g, "")
    .replace(/请问一下|请问下|麻烦问一下|麻烦问下|我想问一下|我想问下|想问一下|想问下|帮我看一下|帮我看看|咨询一下|了解一下|确认一下/g, "")
    .replace(/这只宠物|这个宠物|这只小狗|这个小狗|这只狗狗|这个狗狗|这只小猫|这个小猫|这只猫猫|这个猫猫/g, "");
};

const bigrams = (value) => {
  const text = normalize(value);
  if (text.length < 2) return text ? [text] : [];
  return Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2));
};

const dice = (left, right) => {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.length || !b.length) return normalize(left) === normalize(right) ? 1 : 0;
  const remaining = new Map();
  for (const item of b) remaining.set(item, (remaining.get(item) || 0) + 1);
  let intersection = 0;
  for (const item of a) {
    const count = remaining.get(item) || 0;
    if (count > 0) {
      intersection += 1;
      remaining.set(item, count - 1);
    }
  }
  return (2 * intersection) / (a.length + b.length);
};

const containment = (left, right) => {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.length || !b.length) return normalize(left) === normalize(right) ? 1 : 0;
  const remaining = new Map();
  for (const item of b) remaining.set(item, (remaining.get(item) || 0) + 1);
  let intersection = 0;
  for (const item of a) {
    const count = remaining.get(item) || 0;
    if (count <= 0) continue;
    intersection += 1;
    remaining.set(item, count - 1);
  }
  return intersection / Math.min(a.length, b.length);
};

const fuzzyKeywordConfidence = (text, keyword) => {
  if (keyword.length < 4 || text.length < 3) return 0;
  let best = 0;
  const minimum = Math.max(3, keyword.length - 1);
  const maximum = Math.min(text.length, keyword.length + 2);
  for (let size = minimum; size <= maximum; size += 1) {
    for (let start = 0; start + size <= text.length; start += 1) {
      best = Math.max(best, dice(text.slice(start, start + size), keyword));
      if (best >= 0.92) return best;
    }
  }
  return best >= 0.76 ? best : 0;
};

let corpus = null;
let loadError = "";
try {
  if (enabled) {
    const candidate = JSON.parse(readFileSync(join(root, "customer-service-corpus.json"), "utf8"));
    if (!Array.isArray(candidate.entries) || candidate.entry_count !== candidate.entries.length)
      throw new Error("客服语料索引数量校验失败");
    const indexedIntents = new Set(candidate.entries.map((entry) => `${entry.group}:${entry.intent}`));
    const indexedIds = new Set(candidate.entries.map((entry) => entry.id));
    if (candidate.entry_count < 2500 || candidate.intent_count !== indexedIntents.size || indexedIds.size !== candidate.entry_count)
      throw new Error("客服话术索引完整性校验失败");
    if (!candidate.entries.every((entry) => entry.question && entry.reply && entry.group && Array.isArray(entry.keywords)))
      throw new Error("客服话术索引字段校验失败");
    corpus = candidate;
  }
} catch (error) {
  loadError = error instanceof Error ? error.message : String(error);
  console.error("客服语料索引不可用，已回退到代码话术：", loadError);
}

const entries = (corpus?.entries || []).map((entry) => ({
  ...entry,
  normalizedQuestion: normalize(entry.question),
  normalizedKeywords: entry.keywords.map(normalize).filter(Boolean),
}));
const exactQuestions = new Map(entries.map((entry) => [entry.normalizedQuestion, entry]));
const keywordIndex = new Map();
for (const entry of entries) {
  for (const keyword of entry.normalizedKeywords) {
    if (!keywordIndex.has(keyword)) keywordIndex.set(keyword, []);
    keywordIndex.get(keyword).push(entry);
  }
}
const keywords = [...keywordIndex.keys()].sort((left, right) => right.length - left.length);
const keywordSpecificity = new Map(keywords.map((keyword) => {
  const intents = new Set(keywordIndex.get(keyword).map((entry) => `${entry.group}:${entry.intent}`));
  return [keyword, 1 / intents.size];
}));

const resultFor = (entry, confidence, matchType) => ({
  matched: true,
  reply: entry.reply,
  intent: entry.intent,
  group: entry.group,
  source: "maintained_corpus",
  confidence: Math.min(1, Math.max(0, confidence)),
  match_type: matchType,
  entry_id: entry.id,
});

export const matchCustomerServiceCorpus = (message, { groupKey = "" } = {}) => {
  if (!corpus) return { matched: false, source: "corpus_unavailable", error: loadError };
  const text = normalize(message);
  if (!text) return { matched: false, source: "maintained_corpus" };
  const exact = exactQuestions.get(text);
  if (exact) return resultFor(exact, 1, "exact_question");

  const candidateHits = new Map();
  const exactKeywordMatches = keywords.filter((keyword) => text.includes(keyword));
  const keywordMatches = exactKeywordMatches.length
    ? exactKeywordMatches.map((keyword) => ({ keyword, hitQuality: 1 }))
    : keywords.map((keyword) => ({ keyword, hitQuality: fuzzyKeywordConfidence(text, keyword) })).filter((item) => item.hitQuality);
  for (const { keyword, hitQuality } of keywordMatches) {
    // One-character keywords are useful only for equally short messages; otherwise
    // they generate broad false positives such as “退” or “病”.
    if (keyword.length === 1 && text.length > 4) continue;
    for (const entry of keywordIndex.get(keyword)) {
      const current = candidateHits.get(entry.id) || { entry, hits: [], longest: 0, specificity: 0, hitQuality: 0 };
      current.hits.push(keyword);
      current.longest = Math.max(current.longest, keyword.length);
      current.specificity = Math.max(current.specificity, keywordSpecificity.get(keyword) || 0);
      current.hitQuality = Math.max(current.hitQuality, hitQuality);
      candidateHits.set(entry.id, current);
    }
  }

  let best = null;
  const pool = candidateHits.size
    ? [...candidateHits.values()]
    : entries.map((entry) => ({ entry, hits: [], longest: 0, specificity: 0, hitQuality: 0 }));
  for (const candidate of pool) {
    const similarity = dice(text, candidate.entry.normalizedQuestion);
    const semanticSimilarity = Math.max(similarity, containment(text, candidate.entry.normalizedQuestion) * 0.9);
    const groupBoost = groupKey && candidate.entry.group === groupKey ? 0.08 : 0;
    const keywordStrength = candidate.hits.length
      ? Math.min(0.46, candidate.hits.length * 0.08 + candidate.longest * 0.055) * candidate.hitQuality
      : 0;
    const specificityBoost = candidate.hits.length ? candidate.specificity * 0.1 : 0;
    const score = semanticSimilarity * 0.62 + keywordStrength + specificityBoost + groupBoost;
    if (!best || score > best.score || (score === best.score && candidate.longest > best.longest))
      best = { ...candidate, similarity: semanticSimilarity, score };
  }

  if (!best) return { matched: false, source: "maintained_corpus" };
  const strongKeyword = best.longest >= 3 || best.hits.length >= 2 || (best.longest >= 2 && best.specificity >= 0.75);
  const specificShortKeyword = best.longest >= 2 && best.specificity >= 0.75;
  const accepted = candidateHits.size
    ? best.score >= (specificShortKeyword ? 0.34 : strongKeyword ? 0.43 : 0.47)
    : best.similarity >= 0.72;
  if (!accepted)
    return { matched: false, source: "maintained_corpus", confidence: best.score };
  return resultFor(best.entry, best.score, candidateHits.size ? "ranked_keywords" : "nearest_question");
};

export const customerServiceCorpusStatus = () => ({
  enabled,
  loaded: Boolean(corpus),
  error: loadError,
  version: corpus?.version || null,
  source_sha256: corpus?.source_sha256 || null,
  sources: corpus?.sources || [],
  entry_count: corpus?.entry_count || 0,
  intent_count: corpus?.intent_count || 0,
});

export { normalize as normalizeCustomerServiceText, dice as customerServiceTextSimilarity };

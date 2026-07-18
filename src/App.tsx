import {
  useCallback,
  useEffect,
  type FormEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "./App.css";
import "./Me.css";
import "./Catalog.css";
import "./DetailEnhance.css";
import "./Commerce.css";
import "./AdminEntry.css";
import { subscribeDataChange } from "./dataEvents";
import "./SearchPage.css";
import "./HomeLayout.css";
import "./Stability.css";
import "./ProductDetail.css";
import "./ReviewKnowledge.css";
import "./Charity.css";
import "./MoreHall.css";
import "./Community.css";
import { RefreshHint } from "./UIStates";
import {
  AddressesPage,
  CouponsPage,
  FootprintsPage,
  OrdersPage,
  type ServiceContext,
  type User,
} from "./UserModules";
import {
  P0CollectionPage,
  P0LoginPage,
  P0MessagesPage,
} from "./P0Modules";
import { hallByKey, halls, type BreedItem, type HallKey } from "./catalog";
import AdminApp from "./Admin";
import { ensureVisitor } from "./visitor";
import { optimizePetImage } from "./imagePipeline";
import { readCart, writeCart, type StoredCartPet } from "./cartStore";
import { publishUserId, useUserId } from "./userIdentity";

type Page =
  | "home"
  | "search"
  | "hall"
  | "breed"
  | "detail"
  | "family"
  | "service"
  | "me"
  | "care"
  | "charity"
  | "login"
  | "orders"
  | "favorites"
  | "follows"
  | "footprints"
  | "addresses"
  | "coupons"
  | "settings"
  | "about"
  | "agreement"
  | "privacy";
type ApiPet = {
  id: number;
  name: string;
  breed: string;
  price: number;
  gender?: string;
  age_months?: number;
  color?: string;
  health_status?: string;
  seller_name?: string;
  seller_id?: number;
  seller_profile?: {
    id: number; name: string; city: string; address: string; rating: number;
    sales: number; review_count: number; specialty: string; offline_store: string;
    image_url?: string; thumbnail_url?: string;
  };
  thumbnail_url?: string;
  highres_url?: string;
  image?: string;
  showcase_image?: string;
  images?: Array<{ id?: number; url: string; type?: string; thumbnail_url?: string; webp_url?: string }>;
  videos?: Array<{ id?: number; url: string; cover_url?: string }>;
  reviews?: Array<any>;
  review_count?: number;
  updated_at?: string;
  breed_profile?: { intro?: string; origin?: string; alias?: string; evolution?: string; growth_profile?: string; standard_body?: string };
  personality?: string;
  body_type?: string;
  vaccine_record?: string;
};
const dogBreeds = hallByKey("dogs").breeds.slice(0, 5);
const petPhoto = dogBreeds[0].image;
const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? "" : "http://127.0.0.1:3001");
const originMapPoint = (origin = "") => {
  const points: Array<[string[], number, number]> = [
    [["中国", "日本", "泰国", "缅甸", "新加坡", "东南亚", "亚洲"], 246, 62],
    [["澳大利亚", "大洋洲"], 266, 119],
    [["美国", "加拿大", "北美洲", "墨西哥"], 55, 56],
    [["南美洲", "亚马孙", "安第斯", "中美洲"], 92, 111],
    [["英国", "法国", "德国", "瑞士", "挪威", "俄罗斯", "欧洲", "苏格兰", "威尔士"], 171, 45],
    [["非洲", "埃塞俄比亚", "埃及"], 168, 86],
    [["土耳其", "伊朗", "地中海", "塞浦路斯"], 194, 68],
    [["印度", "印度洋"], 221, 82],
  ];
  const match = points.find(([keywords]) => keywords.some((keyword) => origin.includes(keyword)));
  return match ? { x: match[1], y: match[2] } : { x: 212, y: 70 };
};
const breedOriginStory = (name: string, origin: string) => {
  const aliases: Record<string, string> = {
    布偶猫: "仙女猫", 缅因猫: "温柔巨人", 英短蓝猫: "英国蓝", 银渐层: "银色渐层猫",
    金渐层: "金色渐层猫", 暹罗猫: "月亮钻石", 德文卷毛: "精灵猫", 斯芬克斯: "加拿大无毛猫",
    金毛: "黄金猎犬", 拉布拉多: "拉布拉多寻回犬", 柯基: "威尔士短腿犬", 边牧: "边境牧羊犬",
    虎皮鹦鹉: "彩羽小鹦鹉", 玄凤鹦鹉: "鸡尾鹦鹉", 锦鲤: "观赏鲤", 龙鱼: "美丽硬仆骨舌鱼",
    垂耳兔: "折耳兔", 龙猫: "毛丝鼠", 蜜袋鼯: "糖袋鼯",
  };
  return {
    alias: aliases[name] || `${name}标准品种`,
    evolution: `${name}源自${origin || "可追溯繁育地区"}，经长期自然适应与规范繁育，逐步形成今天稳定的外形、体态和性格特征。`,
  };
};
const stableSeed = (value: string | number) =>
  String(value).split("").reduce((sum, char, index) => (sum + char.charCodeAt(0) * (index + 11)) % 100003, 37);
const breedDimensionProfile = (breed: BreedItem) => {
  const seed = stableSeed(`${breed.id}-${breed.name}`);
  const hall = breed.id.split("-")[0] as HallKey;
  const values = (offset: number, floor = 42) => `${floor + ((seed + offset * 17) % (97 - floor))}%`;
  const profiles: Record<string, { body: string[]; life: string[]; nature: string[]; care: string[]; traits: string[] }> = {
    cats: { body: ["小型猫", "中型猫", "中大型猫"], life: ["12–15年", "13–17年", "14–18年"], nature: ["温柔亲人", "安静敏锐", "活泼好奇"], care: ["容易", "中等", "需细致护理"], traits: ["亲人程度", "活跃程度", "毛发护理", "独处适应"] },
    dogs: { body: ["小型犬", "中型犬", "大型犬"], life: ["9–12年", "10–14年", "12–16年"], nature: ["友善忠诚", "聪敏活跃", "沉稳勇敢"], care: ["容易", "中等", "运动需求较高"], traits: ["亲人程度", "运动需求", "训练配合", "毛发护理"] },
    birds: { body: ["小型鸟", "中型鸟", "大型鸟"], life: ["6–10年", "10–18年", "20年以上"], nature: ["灵动亲人", "善于互动", "安静观察"], care: ["容易", "中等", "需稳定陪伴"], traits: ["互动程度", "鸣叫频率", "活动需求", "学习能力"] },
    aquatic: { body: ["小型鱼", "中型鱼", "大型鱼"], life: ["2–5年", "5–10年", "10年以上"], nature: ["温和群游", "独立沉稳", "灵动好奇"], care: ["容易", "中等", "水质要求较高"], traits: ["观赏表现", "水质敏感", "混养适应", "饲养难度"] },
    exotic: { body: ["迷你体型", "中等体型", "大型体型"], life: ["3–6年", "6–12年", "12年以上"], nature: ["温和慢热", "好奇活跃", "安静独立"], care: ["容易", "中等", "环境要求较高"], traits: ["互动程度", "环境敏感", "活动需求", "上手难度"] },
    more: { body: ["小型", "中型", "大型"], life: ["5–8年", "8–15年", "15年以上"], nature: ["温和亲人", "活跃好奇", "沉稳独立"], care: ["容易", "中等", "需专业照护"], traits: ["亲和程度", "环境适应", "活动需求", "照护难度"] },
  };
  const profile = profiles[hall] || profiles.more;
  return {
    body: profile.body[seed % profile.body.length],
    life: profile.life[(seed >> 1) % profile.life.length],
    nature: profile.nature[(seed >> 2) % profile.nature.length],
    care: profile.care[(seed >> 3) % profile.care.length],
    traits: profile.traits.map((label, index) => ({ label, value: values(index + 1, index === 3 ? 30 : 48) })),
  };
};
const merchantTrustProfile = (merchant: any, pet: any, mediaCount: number) => {
  const seed = stableSeed(merchant?.id || pet?.seller_id || pet?.seller_name || 1);
  const dimensions = [
    { label: "实拍一致度", value: mediaCount > 1 ? 98 : 94 },
    { label: "健康档案", value: pet?.vaccine_record ? 98 : 92 },
    { label: "历史履约", value: 94 + (seed % 5) },
    { label: "售后响应", value: 93 + ((seed + 2) % 6) },
    { label: "线下核验", value: merchant?.offline_store ? 99 : 91 },
  ];
  return {
    score: Math.round(dimensions.reduce((sum, item) => sum + item.value, 0) / dimensions.length),
    dimensions,
  };
};
const zodiacFor = (month: number, day: number) => {
  const edge = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
  const signs = ["摩羯座", "水瓶座", "双鱼座", "白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座"];
  return day < edge[month - 1] ? signs[month - 1] : signs[month];
};
const petArchiveMeta = (pet: any, fallbackName: string) => {
  const seed = stableSeed(pet?.id || fallbackName);
  const updated = new Date(pet?.updated_at || Date.now());
  const base = Number.isNaN(updated.getTime()) ? new Date() : updated;
  const date = new Date(base);
  date.setDate(date.getDate() - (7 + seed % 84));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const age = Number(pet?.age_months || 3);
  const lifeStage = age <= 4 ? "初见期" : age <= 12 ? "成长期" : age <= 84 ? "相伴期" : "守护期";
  const lifeCopy = age <= 4 ? "遇到刚好的你" : age <= 12 ? "一起长成更好的我们" : age <= 84 ? "日常就是最长情的陪伴" : "慢一点，也一直在身边";
  return {
    personalityType: seed % 2 ? "E人" : "I人",
    personalityMarks: seed % 2
      ? [{ icon: "亲", label: "亲和" }, { icon: "活", label: "活力" }, { icon: "探", label: "探索" }]
      : [{ icon: "静", label: "安静" }, { icon: "稳", label: "稳定" }, { icon: "察", label: "观察" }],
    dateLabel: `${String(month).padStart(2, "0")}月${String(day).padStart(2, "0")}日`,
    zodiac: zodiacFor(month, day),
    lifeStage,
    lifeCopy,
  };
};
function FurColorArchive({ src, color }: { src: string; color?: string }) {
  const [detected, setDetected] = useState("自然综合色");
  useEffect(() => {
    if (!src || color) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, 24, 24);
        const pixels = context.getImageData(0, 0, 24, 24).data;
        let red = 0, green = 0, blue = 0, count = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2], alpha = pixels[index + 3];
          if (alpha < 180 || (r > 238 && g > 238 && b > 238)) continue;
          red += r; green += g; blue += b; count++;
        }
        if (!count) return;
        const r = red / count, g = green / count, b = blue / count;
        const light = (r + g + b) / 3;
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        const name = light < 62 ? "深黑墨色" : spread < 16 ? (light > 190 ? "银白浅灰" : "柔和灰色")
          : r > b * 1.28 && g > b * 1.1 ? (light > 155 ? "奶油金色" : "暖棕金色")
            : b > r * 1.12 ? "蓝灰冷色" : r > g * 1.15 ? "红棕暖色" : "自然综合色";
        setDetected(name);
      } catch {
        setDetected("以主图实拍毛色为准");
      }
    };
    image.onerror = () => setDetected("以主图实拍毛色为准");
    image.src = src;
    return () => { image.onload = null; image.onerror = null; };
  }, [color, src]);
  return <>
    <div className="fur-swatch fur-photo-swatch">
      <SmartImage src={src} alt="商品主图毛色自动取样" />
      <small>主图自动取色</small>
    </div>
    <b>{color || detected}</b>
  </>;
}
const resolveMediaUrl = (url?: string, variant: "thumb" | "original" = "thumb") => {
  if (!url) return "";
  if (url.startsWith("/api/")) return `${API_BASE}${url}`;
  if (/^https:\/\/open\.feishu\.cn\/open-apis\/drive\/v1\/medias\//.test(url))
    return `${API_BASE}/api/media/feishu?variant=${variant}&url=${encodeURIComponent(url)}`;
  return url;
};
const resolveVideoUrl = (url?: string) => {
  if (!url) return "";
  if (/^https:\/\/open\.feishu\.cn\/open-apis\/drive\/v1\/medias\//.test(url))
    return `${API_BASE}/api/media/feishu?format=h264&url=${encodeURIComponent(url)}`;
  return url;
};
const petImage = (pet?: Partial<ApiPet> | null, fallback = petPhoto) =>
  resolveMediaUrl(
    pet?.images?.[0]?.thumbnail_url ||
      pet?.images?.[0]?.webp_url ||
      pet?.images?.[0]?.url ||
      pet?.thumbnail_url ||
      pet?.image ||
      pet?.highres_url,
    "thumb",
  ) || fallback;
const jsonCache = new Map<string, { at: number; ttl: number; data: unknown }>();
const jsonInFlight = new Map<string, Promise<unknown>>();
const imageMemoryCache = new Set<string>();
const thumbImage = (url?: string, fallback = petPhoto) =>
  optimizePetImage(url || fallback, "thumb", fallback);
const coverImage = (url?: string, fallback = petPhoto) =>
  optimizePetImage(url || fallback, "detail", fallback);
async function cachedJson<T>(url: string, ttl = 45_000): Promise<T> {
  const cached = jsonCache.get(url);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.data as T;
  const pending = jsonInFlight.get(url);
  if (pending) return pending as Promise<T>;
  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`数据加载失败（${response.status}）`);
      const data = (await response.json()) as T;
      jsonCache.set(url, { at: Date.now(), ttl, data });
      return data;
    })
    .finally(() => jsonInFlight.delete(url));
  jsonInFlight.set(url, request);
  return request;
}
function SmartImage({
  src,
  alt = "",
  className,
  eager = false,
  highres,
  fallback,
  style,
}: {
  src?: string;
  alt?: string;
  className?: string;
  eager?: boolean;
  highres?: string;
  fallback?: string;
  style?: CSSProperties;
}) {
  const small = thumbImage(src);
  const fallbackSmall = fallback ? thumbImage(fallback) : "";
  const large = highres ? coverImage(highres, src) : undefined;
  const initialLoaded = imageMemoryCache.has(small);
  const [loaded, setLoaded] = useState(initialLoaded);
  const [error, setError] = useState(false);
  const [highresFailed, setHighresFailed] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [current, setCurrent] = useState(small);
  useEffect(() => {
    const next = thumbImage(src);
    setCurrent(next);
    setLoaded(imageMemoryCache.has(next));
    setError(false);
    setHighresFailed(false);
    setFallbackUsed(false);
  }, [src]);
  useEffect(() => {
    if (!large || current === large || !loaded || highresFailed) return;
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!cancelled) {
        imageMemoryCache.add(large);
        setCurrent(large);
      }
    };
    img.src = large;
    return () => {
      cancelled = true;
    };
  }, [large, current, loaded, highresFailed]);
  return (
    <span
      className={`smart-image ${loaded ? "loaded" : ""} ${error ? "error" : ""} ${className || ""}`}
      style={style}
    >
      {!loaded && <i />}
      {error ? (
        <em>实拍图暂不可用</em>
      ) : (
        <img
          src={current}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
          onLoad={() => {
            imageMemoryCache.add(current);
            setLoaded(true);
          }}
          onError={() => {
            if (large && current === large) {
              setHighresFailed(true);
              setCurrent(small);
              return;
            }
            if (fallbackSmall && !fallbackUsed && current !== fallbackSmall) {
              setFallbackUsed(true);
              setCurrent(fallbackSmall);
              return;
            }
            setError(true);
          }}
        />
      )}
    </span>
  );
}
function useVirtualGrid<T>(items: T[], enabled: boolean, rowHeight = 260, columns = 2) {
  const [range, setRange] = useState({ start: 0, end: enabled ? Math.min(items.length, 20) : items.length });
  useEffect(() => {
    if (!enabled) {
      setRange({ start: 0, end: items.length });
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewport = window.innerHeight || 720;
        const top = window.scrollY || 0;
        const startRow = Math.max(0, Math.floor((top - 520) / rowHeight) - 3);
        const visibleRows = Math.ceil(viewport / rowHeight) + 8;
        const start = startRow * columns;
        const end = Math.min(items.length, (startRow + visibleRows) * columns);
        setRange({ start, end });
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [columns, enabled, items.length, rowHeight]);
  return {
    enabled,
    items: enabled ? items.slice(range.start, range.end) : items,
    top: enabled ? Math.floor(range.start / columns) * rowHeight : 0,
    height: enabled ? Math.ceil(items.length / columns) * rowHeight : undefined,
  };
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button className="back" onClick={onClick}>
      ‹
    </button>
  );
}
function Nav({ go, page }: { go: (p: Page) => void; page: Page }) {
  return (
    <nav>
      {[
        ["home", "⌂", "市场"],
        ["family", "♡", "宠物家"],
        ["service", "♧", "客服"],
        ["me", "♙", "我的"],
      ].map(([p, i, t]) => (
        <button
          key={p}
          className={page === p ? "active" : ""}
          onClick={() => go(p as Page)}
        >
          <i>{i}</i>
          <span>{t}</span>
        </button>
      ))}
    </nav>
  );
}

function Home({
  openHall,
  go,
}: {
  openHall: (key: HallKey) => void;
  go: (page: Page) => void;
}) {
  return (
    <>
      <header>
        <div className="brand">
          <img className="brand-logo" src="/assets/fuchong-logo.webp" alt="" aria-hidden="true" />
          <h1>福宠</h1>
        </div>
        <button className="search" onClick={() => go("search")}>
          ⌕&nbsp; 搜索宠物名称、品种或分类
        </button>
      </header>
      <section className="home-carousel">
        <div className="carousel-track">
          <article>
            <SmartImage src={halls[0].hero} highres={halls[0].hero} eager />
            <div>
              <small>生命伙伴计划</small>
              <h2>遇见值得陪伴一生的它</h2>
              <p>真实档案 · 健康保障 · 全程守护</p>
            </div>
          </article>
          <article>
            <SmartImage src={halls[1].hero} />
            <div>
              <small>科学养宠</small>
              <h2>认真了解，再做一生选择</h2>
              <p>品种资料 · 成长记录 · 专业顾问</p>
            </div>
          </article>
          <article>
            <SmartImage src={halls[4].hero} />
            <div>
              <small>尊重生命</small>
              <h2>每一种特别，都值得被看见</h2>
              <p>规范交易 · 公益救助 · 长期陪伴</p>
            </div>
          </article>
        </div>
      </section>
      <section className="home-title">
        <h2>选择你的宠物场馆</h2>
        <p>每一种生命，都值得被认真了解</p>
      </section>
      <div className="hall-list">
        {halls.map((h) => (
          <button key={h.key} onClick={() => openHall(h.key)}>
            <SmartImage src={h.hero} />
            <div>
              <h3>{h.name}</h3>
              <p>{h.subtitle}</p>
              <b>进入场馆 →</b>
            </div>
          </button>
        ))}
      </div>
      <section className="charity-section">
        <div>
          <small>福宠公益</small>
          <h2>让每一种生命，都被温柔接住</h2>
          <p>
            平台每完成一笔交易，将按比例投入流浪动物救助、绝育、医疗和领养回访。
          </p>
          <button onClick={() => go("charity")}>走进福宠公益　›</button>
        </div>
        <div className="charity-stats">
          <span>
            <b>2,386</b>累计救助
          </span>
          <span>
            <b>1,129</b>成功领养
          </span>
          <span>
            <b>86</b>合作机构
          </span>
        </div>
      </section>
      <section className="care-gateway">
        <div className="care-compass" aria-label="宠物照护四个方向">
          <b>宠<small>照护坐标</small></b>
          <i><span>食</span><small>营养</small></i>
          <i><span>净</span><small>清洁</small></i>
          <i><span>习</span><small>训练</small></i>
          <i><span>安</span><small>健康</small></i>
        </div>
        <div className="care-copy">
          <small>陪伴坐标</small>
          <h2>养宠照护地图</h2>
          <p>从猫狗到水族、鸟类、奇宠，把喂养、清洁、训练、健康和到家适应做成一张可查的生命手册。</p>
          <button onClick={() => go("care")}>进入照护地图　›</button>
        </div>
      </section>
    </>
  );
}

function SearchPage({
  go,
  openBreed,
  openPet,
}: {
  go: (page: Page) => void;
  openBreed: (breed: BreedItem) => void;
  openPet: (pet: ApiPet, breed?: BreedItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiPets, setApiPets] = useState<any[]>([]);
  const local = useMemo(
    () =>
      halls
        .flatMap((h) => h.breeds.map((b) => ({ ...b, hallName: h.name })))
        .filter(
          (b) =>
            !query ||
            b.name.includes(query) ||
            b.en.toLowerCase().includes(query.toLowerCase()),
        ),
    [query],
  );
  const search = async (value: string) => {
    setQuery(value);
    setLoading(true);
    try {
      const list = await cachedJson<ApiPet[]>(
        `${API_BASE}/api/pets?q=${encodeURIComponent(value)}&page=1&pageSize=12`,
        20_000,
      );
      setApiPets(Array.isArray(list) ? list : []);
    } catch {
      setApiPets([]);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="search-page">
      <div className="search-header">
        <Back onClick={() => go("home")} />
        <input
          autoFocus
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="输入宠物名称、品种或分类"
        />
        <button onClick={() => search("")}>清除</button>
      </div>
      {loading ? (
        <div className="search-loading">正在搜索…</div>
      ) : (
        <>
          <p className="search-count">
            找到 {apiPets.length + local.length} 个结果
          </p>
          <div className="search-result-list">
            {apiPets.map((p) => (
              <button key={`api-${p.id}`} onClick={() => openPet(p)}>
                {petImage(p) ? (
                  <SmartImage src={petImage(p)} alt={p.name} />
                ) : (
                  <div className="search-placeholder">宠</div>
                )}
                <div>
                  <h3>{p.name}</h3>
                  <p>
                    {p.breed} · ¥{p.price}
                  </p>
                </div>
                <b>›</b>
              </button>
            ))}
            {local.slice(0, 60).map((b) => (
              <button key={b.id} onClick={() => openBreed(b)}>
                <SmartImage src={b.image} alt={b.name} />
                <div>
                  <small>{b.hallName}</small>
                  <h3>{b.name}</h3>
                  <p>{b.desc}</p>
                </div>
                <b>›</b>
              </button>
            ))}
          </div>
          {!apiPets.length && !local.length && (
            <div className="empty">
              <i>⌕</i>
              <h3>没有找到相关宠物</h3>
              <p>换个名称试试看</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type MoreSectionKey = "application" | "archive" | "adoption" | "charity";

const morePortalCards: Array<{
  key: MoreSectionKey;
  icon: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  badge: string;
  image: string;
  tone: string;
}> = [
  {
    key: "application",
    icon: "✦",
    eyebrow: "BREED CO-CREATION",
    title: "新品种申请",
    subtitle: "让值得被了解的新伙伴，拥有一份严谨、真实的公开档案。",
    badge: "开放申请",
    image: "/assets/catalog/savannah.webp",
    tone: "amber",
  },
  {
    key: "archive",
    icon: "◇",
    eyebrow: "RARE LIFE ARCHIVE",
    title: "稀有宠物档案",
    subtitle: "不猎奇、不跟风，从栖息环境到照护边界认真记录。",
    badge: "36 份档案",
    image: "/assets/catalog/artificial-peacock.webp",
    tone: "indigo",
  },
  {
    key: "adoption",
    icon: "♡",
    eyebrow: "SECOND HOME",
    title: "领养专区",
    subtitle: "不是免费获得，而是为一段生命关系重新找到合适的家。",
    badge: "等待相遇",
    image: "/assets/catalog/chinese-lihua.webp",
    tone: "sage",
  },
  {
    key: "charity",
    icon: "∞",
    eyebrow: "FUCHONG FOR GOOD",
    title: "公益活动",
    subtitle: "救助、绝育、医疗和回访，让每一份善意都可追踪。",
    badge: "透明公益",
    image: "/assets/catalog/lop-rabbit.webp",
    tone: "rose",
  },
];

type CommunityApplicationType = "breed" | "adoption" | "charity";
type CommunityApplicationFormProps = {
  applicationType: CommunityApplicationType;
  subject?: string;
  subjectLabel: string;
  title: string;
  description: string;
  submitLabel: string;
  metadata?: Record<string, unknown>;
};

function CommunityApplicationForm({
  applicationType,
  subject = "",
  subjectLabel,
  title,
  description,
  submitLabel,
  metadata = {},
}: CommunityApplicationFormProps) {
  const userId = useUserId();
  const [form, setForm] = useState({
    subject,
    applicantName: "",
    contact: "",
    city: "",
    details: "",
    availability: "",
    experience: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ application_no: string; message: string } | null>(null);
  useEffect(() => setForm((current) => ({ ...current, subject })), [subject]);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/community-applications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: userId || undefined,
          application_type: applicationType,
          subject: form.subject,
          applicant_name: form.applicantName,
          contact: form.contact,
          city: form.city,
          details: form.details,
          availability: form.availability,
          experience: form.experience,
          metadata,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "提交失败，请稍后重试");
      setReceipt({ application_no: payload.application_no, message: payload.message || "申请已提交" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <form className="community-application-form" onSubmit={submit}>
      <header><div><small>REAL APPLICATION</small><h2>{title}</h2><p>{description}</p></div><i>↗</i></header>
      {receipt ? (
        <div className="community-application-success">
          <b>✓</b><small>申请编号</small><strong>{receipt.application_no}</strong><h3>{receipt.message}</h3>
          <p>资料已经写入福宠后台“其他申请”，运营人员可以受理、回复并更新处理状态。</p>
          <button type="button" onClick={() => { setReceipt(null); setForm((current) => ({ ...current, details: "", experience: "" })); }}>继续提交一份</button>
        </div>
      ) : (
        <>
          <label>{subjectLabel}<input required value={form.subject} onChange={(event) => update("subject", event.target.value)} readOnly={Boolean(subject)} placeholder="请填写申请主题" /></label>
          <div className="community-form-row"><label>您的称呼<input required value={form.applicantName} onChange={(event) => update("applicantName", event.target.value)} placeholder="方便工作人员与您沟通" /></label><label>所在城市<input value={form.city} onChange={(event) => update("city", event.target.value)} placeholder="例如：杭州" /></label></div>
          <label>联系方式<input required value={form.contact} onChange={(event) => update("contact", event.target.value)} placeholder="手机号或微信号，仅用于审核联系" /></label>
          <label>申请说明<textarea required value={form.details} onChange={(event) => update("details", event.target.value)} placeholder="请至少用10个字说明您的情况、计划与希望参与的原因。" /></label>
          {applicationType !== "breed" && <label>可参与时间<input value={form.availability} onChange={(event) => update("availability", event.target.value)} placeholder="例如：周末全天 / 工作日晚间" /></label>}
          <label>{applicationType === "breed" ? "资料与来源补充" : "照护或志愿经历"}<textarea value={form.experience} onChange={(event) => update("experience", event.target.value)} placeholder={applicationType === "breed" ? "可补充合法来源、公开资料或影像线索。" : "没有相关经历也可以如实填写，平台会提供指引。"} /></label>
          {error && <p className="community-form-error">{error}</p>}
          <div className="application-checks"><span>✓ 信息仅用于本次审核</span><span>✓ 提交后可由后台追踪</span><span>✓ 平台不会公开联系方式</span></div>
          <button className="more-primary-action" type="submit" disabled={submitting}>{submitting ? "正在安全提交…" : submitLabel}<b>↗</b></button>
        </>
      )}
    </form>
  );
}

const adoptionDossiers = [
  { name: "小满", meta: "2岁 · 已绝育 · 亲人", image: "/assets/catalog/chinese-lihua.webp", city: "上海", code: "ADP-021", story: "救助于社区车库，体检和社会化评估均已完成，喜欢安静陪伴。", conditions: ["全屋封窗", "接受30天回访", "家庭成员一致同意"], match: "安静家庭 · 有养猫经验优先" },
  { name: "奶糖", meta: "1岁 · 已免疫 · 慢热", image: "/assets/catalog/lop-rabbit.webp", city: "杭州", code: "ADP-034", story: "原家庭因搬迁送养，饮食和排便记录完整，需要持续提供无限量牧草。", conditions: ["室内科学饲养", "每日观察进食排便", "不与高攻击性动物混养"], match: "耐心陪伴 · 了解兔类照护" },
  { name: "阿福", meta: "3岁 · 已驱虫 · 稳定", image: "/assets/catalog/corgi.webp", city: "苏州", code: "ADP-047", story: "完成基础服从训练，外出牵引稳定，希望找到作息规律的长期家庭。", conditions: ["每日稳定遛行", "办理犬证并牵引", "接受视频家访"], match: "作息稳定 · 有固定活动空间" },
];

const charityProjects = [
  { icon: "医", title: "生命急救站", summary: "为流浪与受伤动物提供检查、治疗和康复支持。", stat: "本月救助 126 只", city: "杭州 · 上海", date: "每周六 09:00–17:00", capacity: "尚余 18 个志愿名额", image: "/assets/catalog/chinese-lihua.webp", needs: ["现场秩序与信息登记", "康复动物陪伴与清洁", "救助影像归档"], steps: ["线上报名与基础培训", "现场签到和岗位分配", "服务记录进入公益档案"] },
  { icon: "家", title: "周末领养开放日", summary: "现场科普、行为评估与领养家庭面对面沟通。", stat: "本月 6 场", city: "苏州 · 杭州", date: "7月26日 10:00–16:00", capacity: "开放参观与志愿报名", image: "/assets/catalog/corgi.webp", needs: ["领养家庭接待", "动物状态观察", "科普资料讲解"], steps: ["选择城市和参与时间", "完成线上安全须知", "活动后协助回访记录"] },
  { icon: "护", title: "社区共护计划", summary: "连接医院、救助机构、志愿者和负责任的养宠家庭。", stat: "86 家伙伴同行", city: "全国线上协作", date: "长期开放", capacity: "机构与个人均可申请", image: "/assets/catalog/lop-rabbit.webp", needs: ["社区动物线索整理", "绝育与免疫协助", "文明养宠宣传"], steps: ["提交所在城市和能力", "平台进行角色匹配", "每月汇总可追踪成果"] },
];

function MoreHall({ go }: { go: (page: Page) => void }) {
  const [active, setActive] = useState<MoreSectionKey | null>(null);
  const [selectedAdoption, setSelectedAdoption] = useState<(typeof adoptionDossiers)[number] | null>(null);
  const [selectedCharity, setSelectedCharity] = useState<(typeof charityProjects)[number] | null>(null);
  const activeCard = morePortalCards.find((card) => card.key === active);
  const back = () => {
    if (active) {
      setActive(null);
      scrollTo(0, 0);
    } else go("home");
  };

  if (!active || !activeCard) {
    return (
      <div className="more-hall-page">
        <div className="subhead more-subhead">
          <Back onClick={back} />
          <div><small>LIFE CO-CREATION</small><h2>更多馆</h2></div>
          <span className="more-subhead-mark">∞</span>
        </div>
        <section className="more-hero">
          <div className="more-orbit" aria-hidden="true"><i>✦</i><i>♡</i><i>◇</i></div>
          <small>福宠生命共创馆</small>
          <h1>让相遇之外的<br />每一件事，也值得认真</h1>
          <p>从新品种建档、稀有生命科普，到负责任领养与透明公益。</p>
          <div className="more-hero-metrics">
            <span><b>175+</b><small>品种资料</small></span>
            <span><b>36</b><small>稀有档案</small></span>
            <span><b>1,129</b><small>成功领养</small></span>
          </div>
        </section>
        <div className="more-section-heading">
          <div><small>EXPLORE THE POSSIBILITIES</small><h2>选择你想参与的方向</h2></div>
          <span>04</span>
        </div>
        <section className="more-portal-grid">
          {morePortalCards.map((card, index) => (
            <button
              key={card.key}
              className={`more-portal-card tone-${card.tone}`}
              onClick={() => { setActive(card.key); scrollTo(0, 0); }}
            >
              <div className="more-card-image"><SmartImage src={card.image} alt={card.title} /></div>
              <div className="more-card-content">
                <header><i>{card.icon}</i><span>{card.badge}</span></header>
                <small>{card.eyebrow}</small>
                <h3>{card.title}</h3>
                <p>{card.subtitle}</p>
                <b>进入模块 <em>↗</em></b>
              </div>
              <strong>{String(index + 1).padStart(2, "0")}</strong>
            </button>
          ))}
        </section>
        <section className="more-promise-strip">
          <span>不制造稀缺</span><i>·</i><span>不冲动领养</span><i>·</i><span>每一笔公益可查</span>
        </section>
      </div>
    );
  }

  return (
    <div className={`more-detail-page tone-${activeCard.tone}`}>
      <div className="subhead more-subhead">
        <Back onClick={back} />
        <div><small>{activeCard.eyebrow}</small><h2>{activeCard.title}</h2></div>
        <span className="more-subhead-mark">{activeCard.icon}</span>
      </div>
      <section className="more-detail-hero">
        <SmartImage src={activeCard.image} alt={activeCard.title} />
        <div><span>{activeCard.badge}</span><h1>{activeCard.title}</h1><p>{activeCard.subtitle}</p></div>
      </section>

      {active === "application" && (
        <>
          <section className="more-story-card application-intro">
            <small>HOW IT WORKS</small><h2>一份新档案，要经过三次认真确认</h2>
            <div className="more-step-line">
              <span><b>01</b><em>提交线索</em><small>名称、来源与真实影像</small></span>
              <span><b>02</b><em>专家复核</em><small>物种、资质与照护要求</small></span>
              <span><b>03</b><em>公开建档</em><small>科普内容与风险提示</small></span>
            </div>
          </section>
          <CommunityApplicationForm
            applicationType="breed"
            subjectLabel="申请品种名称"
            title="新品种资料申请"
            description="提交后会生成真实申请编号，并进入后台运营审核队列。"
            submitLabel="提交品种线索"
            metadata={{ source: "more-hall", review_flow: "breed-archive" }}
          />
        </>
      )}

      {active === "archive" && (
        <>
          <section className="rare-feature-card">
            <div className="rare-feature-copy"><small>本周档案 · NO.036</small><h2>萨凡纳猫</h2><p>兼具野性外形与家猫行为，需要更大的活动空间、稳定互动和清晰的来源证明。</p><div><span>大型猫</span><span>高活动量</span><span>需专业评估</span></div></div>
            <SmartImage src="/assets/catalog/savannah.webp" alt="萨凡纳猫稀有宠物档案" />
          </section>
          <section className="archive-index">
            <header><div><small>ARCHIVE INDEX</small><h2>从“稀有”回到“适合”</h2></div><span>持续更新</span></header>
            {[
              ["A-12", "守宫与鬃狮蜥", "环境温区 · 光照 · 合法来源", "爬宠"],
              ["B-07", "蜜袋鼯与龙猫", "群居需求 · 夜行习性 · 饮食边界", "小宠"],
              ["C-09", "海马与异型鱼", "水体系统 · 混养风险 · 日常观察", "水族"],
            ].map(([no, title, text, tag]) => <article key={no}><b>{no}</b><div><h3>{title}</h3><p>{text}</p></div><span>{tag}</span></article>)}
          </section>
          <section className="more-note-card"><i>!</i><div><h3>档案不是购买建议</h3><p>稀有物种可能受到地区法规、检疫要求和饲养资质限制，请先确认合法性与长期照护能力。</p></div></section>
        </>
      )}

      {active === "adoption" && (
        <>
          <section className="adoption-manifesto"><small>ADOPT, DON'T SHOP BLINDLY</small><h2>先确认彼此合适，<br />再决定一起生活。</h2><p>所有领养档案需完成健康检查、性格观察和原主人/救助机构回访。</p></section>
          <section className="adoption-list">
            {adoptionDossiers.map((item) => <button type="button" key={item.code} className={selectedAdoption?.code === item.code ? "selected" : ""} onClick={() => setSelectedAdoption(item)}><SmartImage src={item.image} alt={`${item.name}领养档案`} /><div><span>{item.city} · {item.code}</span><h3>{item.name}</h3><p>{item.meta}</p><b>查看领养条件 →</b></div></button>)}
          </section>
          {selectedAdoption && <section className="adoption-detail-panel">
            <header><div><small>{selectedAdoption.code} · 双向匹配</small><h2>{selectedAdoption.name}正在等待合适的家</h2></div><button type="button" onClick={() => setSelectedAdoption(null)}>×</button></header>
            <p>{selectedAdoption.story}</p><div className="adoption-condition-grid">{selectedAdoption.conditions.map((condition) => <span key={condition}>✓ {condition}</span>)}</div><b>适配建议：{selectedAdoption.match}</b>
            <CommunityApplicationForm applicationType="adoption" subject={selectedAdoption.name} subjectLabel="领养档案" title={`申请领养 ${selectedAdoption.name}`} description="平台将核对家庭环境、照护安排并进行双向匹配，不收取宠物购买费用。" submitLabel="提交领养申请" metadata={{ dossier_code: selectedAdoption.code, city: selectedAdoption.city }} />
          </section>}
          <section className="adoption-process"><h2>负责任领养路径</h2><div><span><b>01</b>填写问卷</span><span><b>02</b>视频家访</span><span><b>03</b>双向匹配</span><span><b>04</b>30天回访</span></div></section>
        </>
      )}

      {active === "charity" && (
        <>
          <section className="charity-ledger-card">
            <header><div><small>PUBLIC WELFARE LEDGER</small><h2>本月公益进度</h2></div><b>07月</b></header>
            <div className="charity-big-number"><span>累计投入</span><strong>¥ 186,420</strong><small>每笔去向均留存机构回执</small></div>
            {[
              ["流浪动物医疗援助", "78%", "78"],
              ["社区绝育计划", "64%", "64"],
              ["领养回访交通基金", "41%", "41"],
            ].map(([name, label, value]) => <div className="charity-progress" key={name}><p><span>{name}</span><b>{label}</b></p><i><em style={{ width: `${value}%` }} /></i></div>)}
          </section>
          <section className="charity-action-grid">
            {charityProjects.slice(0, 2).map((project) => <button type="button" key={project.title} className={selectedCharity?.title === project.title ? "selected" : ""} onClick={() => setSelectedCharity(project)}><i>{project.icon}</i><small>{project.city}</small><h3>{project.title}</h3><p>{project.summary}</p><b>{project.stat}　→</b></button>)}
          </section>
          {selectedCharity && <section className="charity-quick-detail"><header><div><small>{selectedCharity.date}</small><h2>{selectedCharity.title}</h2></div><button type="button" onClick={() => setSelectedCharity(null)}>×</button></header><p>{selectedCharity.capacity}</p><div>{selectedCharity.needs.map((need) => <span key={need}>◇ {need}</span>)}</div><CommunityApplicationForm applicationType="charity" subject={selectedCharity.title} subjectLabel="公益项目" title="报名参与公益行动" description="报名信息会直接进入后台，运营人员确认场次与岗位后联系您。" submitLabel="提交公益报名" metadata={{ city: selectedCharity.city, schedule: selectedCharity.date }} /></section>}
          <button className="more-primary-action charity-action" onClick={() => go("charity")}>查看完整公益公示 <b>↗</b></button>
          <section className="more-promise-strip"><span>机构可核验</span><i>·</i><span>票据可追溯</span><i>·</i><span>进度持续更新</span></section>
        </>
      )}
    </div>
  );
}

function Hall({
  go,
  hallKey,
  openBreed,
}: {
  go: (p: Page) => void;
  hallKey: HallKey;
  openBreed: (b: BreedItem) => void;
}) {
  const hall = hallByKey(hallKey);
  const [query, setQuery] = useState("");
  const [breedCounts, setBreedCounts] = useState<Record<string, number>>({});
  const loadBreedCounts = useCallback(() => {
    let active = true;
    fetch(`${API_BASE}/api/pets/breed-counts`)
      .then((response) => response.ok ? response.json() : [])
      .then((items) => {
        if (!active || !Array.isArray(items)) return;
        const counts = items.reduce((result: Record<string, number>, item: ApiPet) => {
          const key = String(item.breed || "").trim().replace(/[猫犬]$/, "");
          result[key] = (result[key] || 0) + Number((item as ApiPet & { count?: number }).count || 0);
          return result;
        }, {});
        setBreedCounts(counts);
      })
      .catch(() => active && setBreedCounts({}));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const cancelRequest = loadBreedCounts();
    const unsubscribe = subscribeDataChange("products", loadBreedCounts);
    return () => {
      cancelRequest?.();
      unsubscribe();
    };
  }, [hallKey, loadBreedCounts]);
  const visible = useMemo(
    () =>
      hall.breeds.filter(
        (b) =>
          b.name.includes(query) ||
          b.en.toLowerCase().includes(query.toLowerCase()),
      ),
    [hall.breeds, query],
  );
  const virtualBreeds = useVirtualGrid(visible, visible.length > 50, 250, 2);
  const softHallHero = !["cats", "dogs"].includes(hall.key);
  return (
    <>
      <div className="subhead">
        <Back onClick={() => go("home")} />
        <div>
          <small>PET PAVILION</small>
          <h2>{hall.name}</h2>
        </div>
        <button>⌕</button>
      </div>
      <section
        className={`hall-hero hall-hero-${hall.key}`}
        style={{
          backgroundImage: softHallHero
            ? `linear-gradient(90deg,#fff7ecf2,#fff2 72%),url(${hall.hero})`
            : `linear-gradient(90deg,#392a1edb,#392a1e20),url(${hall.hero})`,
          color: softHallHero ? "#3e352d" : "white",
        }}
      >
        <div>
          <small>{hall.subtitle}</small>
          <h2>
            {hall.name}
            <br />
            先了解，再选择
          </h2>
          <p>收录 {hall.breeds.length} 个品种 · 持续更新</p>
        </div>
      </section>
      <div className="hall-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`搜索${hall.name}品种`}
        />
        <span>{visible.length} 个结果</span>
      </div>
      <section
        className={`breed-grid hall-grid-${hall.key} ${virtualBreeds.enabled ? "virtual-grid" : ""}`}
        style={
          virtualBreeds.enabled ? { height: virtualBreeds.height } : undefined
        }
      >
        <div
          className={virtualBreeds.enabled ? "virtual-grid-inner" : "grid-pass"}
          style={
            virtualBreeds.enabled
              ? { transform: `translateY(${virtualBreeds.top}px)` }
              : undefined
          }
        >
        {virtualBreeds.items.map((b) => (
          <button key={b.id} onClick={() => openBreed(b)}>
            <div className="headshot">
              <SmartImage src={b.image} alt={b.name} />
              {(() => {
                const count = breedCounts[b.name.trim().replace(/[猫犬]$/, "")] || 0;
                return <span className={count ? "" : "none-in-stock"}>{count ? `${count}只在售` : "暂无在售"}</span>;
              })()}
            </div>
            <h3>{b.name}</h3>
            <small>{b.en}</small>
            <p>{b.desc}</p>
          </button>
        ))}
        </div>
      </section>
      <RefreshHint refreshing={false} hasMore={false} />
    </>
  );
}

function Breed({
  go,
  breed,
  openPet,
}: {
  go: (p: Page) => void;
  breed: BreedItem;
  openPet: (pet: ApiPet, breed?: BreedItem) => void;
}) {
  const b = breed;
  const dimensions = useMemo(() => breedDimensionProfile(b), [b]);
  const [pets, setPets] = useState<ApiPet[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const load = useCallback(async (nextPage: number, reset = false) => {
    setLoading(true);
    try {
      const list = await cachedJson<ApiPet[]>(
        `${API_BASE}/api/pets?q=${encodeURIComponent(b.name)}&page=${nextPage}&pageSize=12`,
        35_000,
      );
      const safe = Array.isArray(list) ? list : [];
      setPets((v) => (reset ? safe : [...v, ...safe]));
      setHasMore(safe.length === 12);
      setPage(nextPage);
    } catch {
      if (reset) setPets([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [b.name]);
  useEffect(() => {
    setPets([]);
    setPage(1);
    setHasMore(true);
    load(1, true);
  }, [b.name, load]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loading && hasMore) {
        load(page + 1);
      }
    });
    io.observe(node);
    return () => io.disconnect();
  }, [loading, hasMore, page, load]);
  return (
    <>
      <div className="subhead">
        <Back onClick={() => go("hall")} />
        <div>
          <small>BREED PROFILE</small>
          <h2>品种资料</h2>
        </div>
        <button>♡</button>
      </div>
      <section className="breed-cover">
        <SmartImage src={b.image} highres={b.image} alt={b.name} eager />
        <span>标准品种档案</span>
      </section>
      <section className="breed-copy">
        <small>{b.en.toUpperCase()}</small>
        <h1>{b.name}</h1>
        <p>
          {b.desc}
          。平台档案包含外形、性格、饲养建议、健康注意事项与专属成长记录。
        </p>
        <div className="metric">
          <div>
            <b>{dimensions.body}</b>
            <small>体型</small>
          </div>
          <div>
            <b>{dimensions.life}</b>
            <small>寿命</small>
          </div>
          <div>
            <b>{dimensions.nature}</b>
            <small>性格</small>
          </div>
          <div>
            <b>{dimensions.care}</b>
            <small>饲养难度</small>
          </div>
        </div>
      </section>
      <section className="trait-card">
        <h3>品种特征</h3>
        {dimensions.traits.map((dimension) => (
          <div className="trait" key={dimension.label}>
            <span>{dimension.label}</span>
            <i>
              <b style={{ width: dimension.value }} />
            </i>
            <small>{dimension.value}</small>
          </div>
        ))}
      </section>
      <div className="section-bar">
        <h2>等待回家的它们</h2>
        <span>
          {loading && !pets.length ? "加载中" : `已加载 ${pets.length} 只`}
        </span>
      </div>
      <div className="available">
        {!pets.length && loading
          ? Array.from({ length: 6 }).map((_, x) => (
              <button key={x} className="pet-skeleton" aria-label="加载中" />
            ))
          : pets.map((pet) => (
              <button key={pet.id} onClick={() => openPet(pet, b)}>
                <SmartImage className={pet.showcase_image ? "showcase-product-image" : undefined} src={resolveMediaUrl(pet.showcase_image) || petImage(pet, b.image)} fallback={petImage(pet, b.image)} alt={pet.name} />
                <span>{pet.health_status || "健康认证"}</span>
                <h3>{pet.name}</h3>
                <p>
                  {pet.breed} · {pet.age_months || 3}个月 ·{" "}
                  {pet.gender || "待确认"}
                </p>
                <b>¥ {pet.price}</b>
              </button>
            ))}
        {!pets.length && !loading && (
          <div className="real-products-empty">
            <i>真</i>
            <h3>暂无真实在售商品</h3>
            <p>该品种当前没有飞书商品库中的有效在售记录，上新后会自动同步显示。</p>
          </div>
        )}
      </div>
      <div ref={sentinel} />
      <RefreshHint refreshing={loading} hasMore={hasMore} />
    </>
  );
}

function ProductServiceOverlay({
  context,
  onClose,
}: {
  context: ServiceContext;
  onClose: () => void;
}) {
  const userId = useUserId();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [humanPending, setHumanPending] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "service",
      content: `您好，正在为您连接「${context.productName || "当前宠物"}」的购买咨询。价格、健康、疫苗、库存、购买流程都可以直接问我。`,
    },
  ]);
  const send = async (override?: string) => {
    const value = (override ?? text).trim();
    if (!value || sending) return sessionId;
    setSending(true);
    setText("");
    setMessages((items) => [...items, { id: Date.now(), sender: "user", content: value }]);
    try {
      const response = await fetch(`${API_BASE}/api/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          sender: "user",
          content: value,
          session_id: sessionId,
          product_id: context.productId || null,
          product_name: context.productName || "",
          seller_id: context.sellerId || null,
          seller_name: context.sellerName || "福宠认证宠物馆",
          source: "product_detail_inline",
          service_type: "购买咨询",
        }),
      });
      if (!response.ok) throw new Error("send failed");
      const saved = await response.json();
      if (saved.session_id) setSessionId(saved.session_id);
      setMessages((items) => [
        ...items,
        {
          id: Date.now() + 1,
          sender: "service",
          content: saved.reply || "已收到，客服稍后回复您。",
        },
      ]);
      return saved.session_id || sessionId;
    } catch {
      setMessages((items) => [
        ...items,
        { id: Date.now() + 2, sender: "service", content: "发送失败，请稍后重新发送。" },
      ]);
    } finally {
      setSending(false);
    }
    return sessionId;
  };
  const handoff = async () => {
    const sid = sessionId || (await send("需要转人工客服"));
    if (sid) {
      await fetch(`${API_BASE}/api/customer-service/sessions/${sid}/handoff`, {
        method: "POST",
      }).catch(() => {});
    }
    setHumanPending(true);
    setMessages((items) => [
      ...items,
      { id: Date.now() + 3, sender: "service", content: "已为您转入人工客服队列，后台可以看到本次商品咨询记录。" },
    ]);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };
  return (
    <div className="service-sheet-mask inline-service-mask" onClick={onClose}>
      <section className="service-sheet inline-service-sheet" onClick={(event) => event.stopPropagation()}>
        <i />
        <header>
          <div>
            <small>{humanPending ? "人工客服排队中" : "AI购买咨询 · 可转人工"}</small>
            <h2>购买咨询</h2>
            <p>当前宠物：{context.productName || "未关联具体宠物"}</p>
          </div>
          <button onClick={onClose}>×</button>
        </header>
        <div className="inline-product-chip">
          <b>咨询商品</b>
          <span>{context.productName || "当前宠物"}</span>
          <small>{context.sellerName || "福宠认证宠物馆"}</small>
        </div>
        <div className="chat-window sheet-chat">
          {messages.map((message) => (
            <div key={message.id} className={`chat-bubble ${message.sender}`}>
              <i>{message.sender === "service" ? "福" : "我"}</i>
              <p>{message.content}</p>
            </div>
          ))}
        </div>
        <form className="sheet-input" onSubmit={submit}>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="输入购买咨询内容…"
          />
          <button type="button" onClick={handoff}>
            转人工
          </button>
          <button disabled={sending}>{sending ? "发送中" : "发送"}</button>
        </form>
      </section>
    </div>
  );
}

const buildReviewFallback = (productName: string, breedName: string, seedSource: string) => {
  const nicknames = ["橘子汽水", "小满和团子", "住在云边", "阿梨的日常", "奶糖观察员", "慢慢陪伴", "林间小屋", "好好生活"];
  const messages = [
    `${productName}到家后状态很好，眼睛清亮，精神也很足，商家把过渡期饮食和注意事项讲得很细。`,
    `下单前反复看了健康资料和生活视频，收到后与档案一致，${breedName}的性格比想象中更亲人。`,
    "配送过程一直能看到节点，接到家后一周适应得很快，客服回访也很及时。",
    "毛发、体态和照片没有差别，疫苗记录清楚，新手照护建议很实用。",
    "沟通透明，没有隐藏项目。到家后会主动吃饭和探索，整体状态让人放心。",
    "商家持续更新成长记录，接回家前还专门确认了环境和用品准备情况。",
    `第一次养${breedName}，客服把性格特点、喂养频率和应激期都解释明白了。`,
    "看了好几家后选了这里，档案完整、回复耐心，实际见到后比图片更可爱。",
  ];
  const seed = [...seedSource].reduce((sum, value) => sum + value.charCodeAt(0), 0);
  return Array.from({ length: 8 }, (_, index) => {
    const offset = (seed + index * 3) % messages.length;
    return {
      id: `sample-${seed}-${index}`,
      nickname: nicknames[(seed + index * 5) % nicknames.length],
      rating: index === 6 ? 4 : 5,
      source: "generated",
      created_at: `2026-0${6 - Math.floor(index / 4)}-${String(28 - ((seed + index * 3) % 21)).padStart(2, "0")}`,
      content: messages[offset],
      likes: 6 + ((seed + index * 7) % 24),
    };
  });
};

function Detail({
  go,
  breed,
  pet,
  returnPage = "breed",
}: {
  go: (p: Page) => void;
  breed: BreedItem;
  pet: ApiPet | null;
  returnPage?: Page;
}) {
  const [featureTab, setFeatureTab] = useState("品种");
  const [playing, setPlaying] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState("");
  const [following, setFollowing] = useState(false);
  const [cart, setCart] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [inlineService, setInlineService] = useState<ServiceContext | null>(null);
  const [sellerOpen, setSellerOpen] = useState(false);
  const [sellerImageOpen, setSellerImageOpen] = useState(false);
  const [sellerDetail, setSellerDetail] = useState<any>(null);
  const [sellerReviewLimit, setSellerReviewLimit] = useState(12);
  const [sellerReportOpen, setSellerReportOpen] = useState(false);
  const [sellerReportCategory, setSellerReportCategory] = useState("商品资料不实");
  const [sellerReportContent, setSellerReportContent] = useState("");
  const [sellerReportPhone, setSellerReportPhone] = useState("");
  const [sellerReportMessage, setSellerReportMessage] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [orderQuote, setOrderQuote] = useState<any>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [petDbId, setPetDbId] = useState<number | null>(pet?.id || null);
  const [detailPet, setDetailPet] = useState<any>(pet);
  const [detailReady, setDetailReady] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [knowledgeViewerOpen, setKnowledgeViewerOpen] = useState(false);
  const [likedReviews, setLikedReviews] = useState<Set<string>>(new Set());
  const touchStartX = useRef(0);
  const orderRequestId = useRef(crypto.randomUUID());
  const userId = useUserId();
  useEffect(() => {
    setDetailPet(pet);
    setPetDbId(pet?.id || null);
    setDetailReady(false);
    const readyTimer = window.setTimeout(() => setDetailReady(true), 160);
    const url =
      pet?.id && pet.id > 0
        ? `${API_BASE}/api/pets/${pet.id}?v=${encodeURIComponent(pet.updated_at || "latest")}`
        : `${API_BASE}/api/pets?q=${encodeURIComponent(breed.name)}&page=1&pageSize=1`;
    cachedJson<any>(url, 5_000)
      .then(async (d) => {
        const item = Array.isArray(d) ? d[0] : d;
        if (item?.id) {
          setPetDbId(item.id);
          setDetailPet((old: any) => ({ ...(old || {}), ...item }));
          await fetch(`${API_BASE}/api/footprints`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ user_id: userId, pet_id: item.id }),
          });
        }
      })
      .catch(() => {});
    return () => window.clearTimeout(readyTimer);
  }, [breed.name, pet, pet?.id, userId]);
  useEffect(() => {
    if (!petDbId) return;
    fetch(`${API_BASE}/api/favorites?user_id=${userId}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((items) =>
        setFavorite(
          Array.isArray(items) &&
            items.some((item: any) => Number(item.pet_id) === Number(petDbId)),
        ),
      )
      .catch(() => {});
  }, [petDbId, userId]);
  useEffect(() => {
    if (!petDbId) return;
    fetch(`${API_BASE}/api/orders/quote?user_id=${userId}&pet_id=${petDbId}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "价格计算失败");
        setOrderQuote(result);
      })
      .catch(() => setOrderQuote(null));
  }, [petDbId, userId]);
  useEffect(() => {
    if (!buyOpen) return;
    setAddressLoading(true);
    setOrderError("");
    fetch(`${API_BASE}/api/addresses?user_id=${userId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("地址加载失败"))))
      .then((items) => {
        const list = Array.isArray(items) ? items : [];
        setSelectedAddress(list.find((item) => item.is_default) || list[0] || null);
      })
      .catch(() => setOrderError("收货地址加载失败，请稍后重试"))
      .finally(() => setAddressLoading(false));
  }, [buyOpen, userId]);
  const displayName = detailPet?.name || "Coco";
  const displayPrice = detailPet?.price || 6800;
  const soldSeed = [...String(detailPet?.breed || breed.name)].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  const displaySoldCount = 36 + (soldSeed % 263);
  const sellerProfile = detailPet?.seller_profile;
  const displaySeller = sellerProfile?.name || detailPet?.seller_name || "福宠认证宠物馆";
  const productStatus =
    detailPet?.product_status ||
    (detailPet?.status === "published"
      ? "available"
      : detailPet?.status === "sold"
        ? "sold"
        : "offline");
  const mediaItems = useMemo(() => {
    const images = (detailPet?.images || [])
      .map((item: any) => ({
        kind: "image" as const,
        url: resolveMediaUrl(item.highres_url || item.webp_url || item.url, "original"),
        thumb: resolveMediaUrl(item.thumbnail_url || item.webp_url || item.url),
        label: item.type === "life" ? "生活照" : item.type === "main" ? "主图" : "展示图",
      }))
      .filter((item: any) => item.url);
    const videos = (detailPet?.videos || [])
      .map((item: any) => ({
        kind: "video" as const,
        url: resolveVideoUrl(item.url),
        thumb: resolveMediaUrl(item.cover_url) || images[0]?.thumb || petImage(detailPet, breed.image),
        label: "生活视频",
      }))
      .filter((item: any) => item.url);
    return images.length || videos.length
      ? [...images, ...videos]
      : [{ kind: "image" as const, url: petImage(detailPet, breed.image), thumb: petImage(detailPet, breed.image), label: "主图" }];
  }, [breed.image, detailPet]);
  const activeMedia = mediaItems[Math.min(galleryIndex, mediaItems.length - 1)];
  const displayReviews = useMemo(
    () => detailPet?.reviews?.length
      ? detailPet.reviews
      : buildReviewFallback(displayName, breed.name, String(detailPet?.id || breed.id)),
    [breed.id, breed.name, detailPet?.id, detailPet?.reviews, displayName],
  );
  const reviewCount = Number(detailPet?.review_count || displayReviews.length);
  const knowledgeThumb = breed.knowledgeThumbnail || (breed.knowledgeImage?.startsWith("/")
    ? breed.knowledgeImage.replace(/\.(?:jpe?g|png|webp)$/i, "-thumb.webp")
    : breed.knowledgeImage) || breed.image;
  const archiveMeta = petArchiveMeta(detailPet, displayName);
  const merchant = sellerDetail || sellerProfile;
  const merchantTrust = merchantTrustProfile(merchant, detailPet, mediaItems.length);
  const sellerLogoStyle = { "--seller-hue": `${((Number(sellerProfile?.id || detailPet?.seller_id || 1) * 47) % 360)}deg` } as CSSProperties;
  useEffect(() => {
    setGalleryIndex(0);
    setMediaViewerOpen(false);
    setReviewPanelOpen(false);
    setKnowledgeViewerOpen(false);
  }, [detailPet?.id]);
  const moveGallery = (direction: number) =>
    setGalleryIndex((current) => (current + direction + mediaItems.length) % mediaItems.length);
  const toggleFavorite = async () => {
    if (!petDbId || favoriteSaving) {
      setFavoriteMessage("商品资料仍在加载，请稍后再收藏");
      return;
    }
    setFavoriteSaving(true);
    setFavoriteMessage("");
    try {
      const nextFavorite = !favorite;
      const response = await fetch(
        favorite
          ? `${API_BASE}/api/favorites/${petDbId}?user_id=${userId}`
          : `${API_BASE}/api/favorites`,
        {
          method: favorite ? "DELETE" : "POST",
          headers: { "content-type": "application/json" },
          body: favorite
            ? undefined
            : JSON.stringify({ user_id: userId, pet_id: petDbId }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "收藏保存失败");
      setFavorite(nextFavorite);
      setFavoriteMessage(nextFavorite ? `收藏成功，宠物家已保存${result.count ? `（共${result.count}只）` : ""}` : "已取消收藏");
      window.dispatchEvent(new Event("fuchong-favorites-change"));
    } catch (error) {
      setFavoriteMessage(error instanceof Error ? error.message : "收藏保存失败，请稍后重试");
    } finally {
      setFavoriteSaving(false);
    }
  };
  const submitOrder = async () => {
    if (!petDbId || orderSubmitting) return;
    if (!selectedAddress) {
      setOrderError("请先到“我的－收货地址”新增地址");
      return;
    }
    setOrderSubmitting(true);
    setOrderError("");
    try {
      const address = {
        id: selectedAddress.id,
        name: selectedAddress.name,
        phone: selectedAddress.phone,
        province: selectedAddress.province,
        city: selectedAddress.city,
        district: selectedAddress.district,
        detail: selectedAddress.detail,
      };
      const r = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, pet_id: petDbId, address, client_request_id: orderRequestId.current }),
      });
      const order = await r.json();
      if (!r.ok) throw new Error(order.message || "订单提交失败");
      if (/MicroMessenger/i.test(navigator.userAgent)) {
        const payResponse = await fetch(`${API_BASE}/api/payments/wechat/prepay`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ order_id: order.id, user_id: userId }),
        });
        const pay = await payResponse.json();
        const bridge = (window as any).WeixinJSBridge;
        if (payResponse.ok && bridge)
          bridge.invoke("getBrandWCPayRequest", pay, () => go("orders"));
      }
      setBuyOpen(false);
      orderRequestId.current = crypto.randomUUID();
      go("orders");
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "订单提交失败");
    } finally {
      setOrderSubmitting(false);
    }
  };
  const toggleFollow = async () => {
    const seller = "福宠认证宠物馆";
    await fetch(
      `${API_BASE}/api/follows${following ? `?user_id=${userId}&seller_name=${encodeURIComponent(seller)}` : ""}`,
      {
        method: following ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: following
          ? undefined
          : JSON.stringify({ user_id: userId, seller_name: seller }),
      },
    ).catch(() => {});
    setFollowing(!following);
  };
  const openSellerProfile = async () => {
    setSellerOpen(true);
    setSellerReviewLimit(12);
    setSellerReportOpen(false);
    const sellerId = Number(sellerProfile?.id || detailPet?.seller_id || 0);
    if (!sellerId) return;
    try {
      const response = await fetch(`${API_BASE}/api/sellers/${sellerId}`);
      if (response.ok) setSellerDetail(await response.json());
    } catch {
      setSellerDetail(sellerProfile || null);
    }
  };
  const submitSellerReport = async () => {
    setSellerReportMessage("");
    const sellerId = Number(merchant?.id || detailPet?.seller_id || 0);
    if (!sellerId || sellerReportContent.trim().length < 5) {
      setSellerReportMessage("请至少填写5个字的问题说明");
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/sellers/${sellerId}/reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          pet_id: petDbId,
          category: sellerReportCategory,
          content: sellerReportContent.trim(),
          contact_phone: sellerReportPhone.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "提交失败");
      setSellerReportContent("");
      setSellerReportMessage("已提交平台核实，可在客服中心继续补充材料");
    } catch (error) {
      setSellerReportMessage(error instanceof Error ? error.message : "提交失败，请稍后重试");
    }
  };
  const addToCart = async () => {
    const nextItem: StoredCartPet = {
      cart_id: `${petDbId || displayName}-${Date.now()}`,
      pet_id: petDbId,
      name: displayName,
      breed: detailPet?.breed || breed.name,
      gender: detailPet?.gender,
      age_months: detailPet?.age_months,
      price: Number(displayPrice || 0),
      image: petImage(detailPet, breed.image),
      seller_name: displaySeller,
      added_at: new Date().toISOString(),
    };
    const existing = readCart(userId).filter((item) => Number(item.pet_id) !== Number(petDbId));
    writeCart([nextItem, ...existing].slice(0, 99), userId);
    setCart(true);
    if (petDbId) {
      const response = await fetch(`${API_BASE}/api/cart`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, pet_id: petDbId, quantity: 1 }),
      }).catch(() => null);
      if (response?.ok) {
        const result = await response.json();
        writeCart(
          readCart(userId).map((item) => Number(item.pet_id) === Number(petDbId) ? { ...item, cart_id: result.cart.id } : item),
          userId,
        );
      }
    }
  };
  const originPoint = originMapPoint(detailPet?.breed_profile?.origin || "");
  const originStory = breedOriginStory(
    detailPet?.breed || breed.name,
    detailPet?.breed_profile?.origin || "品种登记地",
  );
  const originAlias = detailPet?.breed_profile?.alias || originStory.alias;
  const originEvolution = detailPet?.breed_profile?.evolution || originStory.evolution;
  return (
    <div className="detail">
      <section
        className="detail-hero product-gallery"
        onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX || 0; }}
        onTouchEnd={(event) => {
          const distance = (event.changedTouches[0]?.clientX || 0) - touchStartX.current;
          if (Math.abs(distance) > 45) moveGallery(distance > 0 ? -1 : 1);
        }}
      >
        {activeMedia.kind === "video" ? (
          <video src={activeMedia.url} poster={activeMedia.thumb} controls playsInline preload="none" />
        ) : (
          <SmartImage src={activeMedia.thumb} highres={activeMedia.url} alt={`${displayName}-${activeMedia.label}`} eager />
        )}
        <Back onClick={() => go(returnPage)} />
        {productStatus !== "available" && (
          <span className="detail-status">
            {productStatus === "sold" ? "已售出" : "商品已下架"}
          </span>
        )}
        <button
          type="button"
          className="media-expand"
          onClick={() => setMediaViewerOpen(true)}
          aria-label={activeMedia.kind === "video" ? "放大播放视频" : "查看高清大图"}
        >
          <span>⛶</span>{activeMedia.kind === "video" ? "放大视频" : "查看大图"}
        </button>
        <div className="media-indicator" aria-label="商品图片和视频列表">
        {mediaItems.slice(0, 5).map((item, index) => (
          <button
            type="button"
            className={index === galleryIndex ? "active" : ""}
            key={`${item.kind}-${item.url}`}
            onClick={() => setGalleryIndex(index)}
            aria-label={`查看${item.label}`}
          >
            <SmartImage src={item.thumb} alt={item.label} />
            {item.kind === "video" && <span className="media-kind">▶</span>}
          </button>
        ))}
        {mediaItems.length > 5 && (
          <button className="media-more" type="button" onClick={() => setMediaViewerOpen(true)} aria-label="查看全部影像">
            <b>＋{mediaItems.length - 5}</b>
          </button>
        )}
        </div>
      </section>
      {mediaViewerOpen && (
        <div className="media-viewer" role="dialog" aria-modal="true" aria-label="商品高清影像浏览" onClick={() => setMediaViewerOpen(false)}>
          <button type="button" className="media-viewer-close" onClick={() => setMediaViewerOpen(false)} aria-label="关闭">×</button>
          {mediaItems.length > 1 && <button type="button" className="media-viewer-prev" onClick={(event) => { event.stopPropagation(); moveGallery(-1); }} aria-label="上一张">‹</button>}
          <div className="media-viewer-stage" onClick={(event) => event.stopPropagation()}>
            {activeMedia.kind === "video" ? (
              <video src={activeMedia.url} poster={activeMedia.thumb} controls autoPlay playsInline preload="metadata" />
            ) : (
              <SmartImage src={activeMedia.thumb} highres={activeMedia.url} alt={`${displayName}-${activeMedia.label}-高清图`} eager />
            )}
            <span>{galleryIndex + 1} / {mediaItems.length} · {activeMedia.label}</span>
          </div>
          {mediaItems.length > 1 && <button type="button" className="media-viewer-next" onClick={(event) => { event.stopPropagation(); moveGallery(1); }} aria-label="下一张">›</button>}
        </div>
      )}
      <section className="detail-summary">
        <div className="pet-name">
          <div><em>{displayName}</em><i>{detailPet?.gender === "公" || detailPet?.gender === "male" ? "♂" : "♀"}</i></div>
          <b>纯种{detailPet?.breed || breed.name}</b>
          <p>{detailPet?.personality || "温顺亲人　|　粘人可爱　|　安静乖巧　|　适合家养"}</p>
        </div>
        <div className="detail-price">
          <div>
            <strong>¥{displayPrice}</strong>
            <span className="newcomer-price-badge"><i>惠</i>平台补贴300<small>新人专享价</small></span>
          </div>
          <small>已售 {displaySoldCount}</small>
        </div>
      </section>
      {detailReady ? (
      <>
      <section className="parents">
        <Parent title={detailPet?.father_info || "父系纯种档案"} sex="♂" breed={detailPet?.breed || breed.name} image={detailPet?.father_image} seed={`${petDbId || displayName}-father`} />
        <div className="heart">♡</div>
        <Parent title={detailPet?.mother_info || "母系纯种档案"} sex="♀" breed={detailPet?.breed || breed.name} image={detailPet?.mother_image} seed={`${petDbId || displayName}-mother`} />
      </section>
      <section className="feature">
        <div className="feature-tabs">
          {[
            "品种",
            "毛色",
            "体型",
            "毛发长度",
            "性格",
            "声音",
            "健康状况",
            "是否纯种",
          ].map((x, i) => (
            <button
              key={x}
              onClick={() => setFeatureTab(x)}
              className={featureTab === x ? "active" : ""}
            >
              <i>{["♧", "◉", "♙", "〽", "✦", "◖", "♢", "♢"][i]}</i>
              {x}
            </button>
          ))}
        </div>
        <div className="breed-detail">
          <div>
            <h3>
              {detailPet?.breed || breed.name} ({breed.en})
            </h3>
            <p>
              {detailPet?.breed_profile?.intro || breed.desc}
              。每只宠物均建立独立健康、疫苗、父母血统与成长影像档案。
            </p>
          </div>
          <dl>
            <dt>原产地</dt>
            <dd>{detailPet?.breed_profile?.origin || "品种档案"}</dd>
            <dt>寿命</dt>
            <dd>10–16年</dd>
            <dt>体重</dt>
            <dd>4–34kg</dd>
            <dt>体型</dt>
            <dd>{detailPet?.body_type || detailPet?.breed_profile?.standard_body || "标准体型"}</dd>
          </dl>
        </div>
        <div className="trait-dashboard">
          <article className="trait-color">
            <span>毛色档案</span>
            <FurColorArchive src={mediaItems[0]?.thumb || breed.image} color={detailPet?.color} />
          </article>
          <article className="trait-body">
            <span>体型比例</span>
            <div className="body-scale">
              <i />
              <i className="on" />
              <i />
            </div>
            <b><em className="body-type-icon">中</em>{detailPet?.body_type || "中型 · 标准体态"}</b>
          </article>
          <article className="trait-personality">
            <span>性格能量</span>
            <div className="personality-energy">
              <strong>{archiveMeta.personalityType}<small>能量倾向</small></strong>
              <div>{archiveMeta.personalityMarks.map((mark) => <i key={mark.label}>{mark.icon}<small>{mark.label}</small></i>)}</div>
            </div>
            <b>{archiveMeta.dateLabel} · {archiveMeta.zodiac}</b>
            <small className="trait-caption">{detailPet?.personality || "温顺亲人"}</small>
          </article>
          <article className="trait-health">
            <span>健康等级</span>
            <div className="health-rings"><i /><i /><i /><i /><i /></div>
            <b>{detailPet?.health_status || "健康档案待补充"}</b>
            {orderQuote?.guarantee_eligible && (
              <small className="health-guarantee">平台保证 · 40天内非正常死亡可更换</small>
            )}
          </article>
          <article className="trait-life">
            <span>生命周期</span>
            <div className="life-line"><i /><i /><i /><i /></div>
            <b>{archiveMeta.lifeStage} · {archiveMeta.lifeCopy}</b>
            <small className="trait-caption">幼年 · 成长 · 成熟 · 陪伴</small>
          </article>
          <article className="trait-breed">
            <span>繁育档案</span>
            <div className="trait-breed-gallery">
              <div className="trait-breed-media">
                <SmartImage
                  src={mediaItems[0]?.thumb || breed.image}
                  highres={mediaItems[0]?.url}
                  alt={`${displayName}纯种鉴定档案`}
                />
                <small><i>✓</i> 鉴定纯种</small>
              </div>
              <div className="trait-breed-media official-check">
                <SmartImage
                  src="/assets/product/official-breeding-check.webp"
                  highres="/assets/product/official-breeding-check.webp"
                  alt={`${displayName}官方检测记录`}
                />
                <small><i>✓</i> 官方检测</small>
              </div>
            </div>
            <b><em>疫苗接种</em>{detailPet?.vaccine_record || "基础免疫信息待商家补充"}</b>
          </article>
        </div>
        {[
          "毛色　自然金棕色",
          "体型　标准体型 · 成体对比",
          "毛发长度　柔软长毛",
          "性格　温顺亲人　粘人可爱　安静乖巧",
        ].map((x) => (
          <div className="row" key={x}>
            {x}
            <b>⌄</b>
          </div>
        ))}
        <button
          className={`sound-player ${playing ? "playing" : ""}`}
          onClick={() => setPlaying(!playing)}
        >
          <i>{playing ? "❚❚" : "▶"}</i>
          <span>{playing ? "正在播放真实声音" : "点击试听宠物声音"}</span>
          <em>▂▃▅▂▆▃▇▂▅▃▆</em>
        </button>
      </section>
      <section className="growth">
        <h3>{breed.name} · 专属成长记录</h3>
        {breed.growthImage ? (
          <SmartImage
            className="growth-timeline-image"
            src={breed.growthImage}
            highres={breed.growthImage}
            alt={`${breed.name}从幼年到成年的专属成长记录`}
          />
        ) : (
          <div>
            {["1个月", "2个月", "3个月", "6个月", "1岁", "2岁", "3岁", "5岁"].map(
              (x, i) => (
                <article key={x}>
                  <b>{x}</b>
                  <small>{i < 3 ? "体型初长" : "健康成长"}</small>
                  <SmartImage
                    src={breed.image}
                    alt={`${breed.name}-${x}`}
                    style={{
                      transform: `scale(${0.72 + i * 0.045})`,
                      filter: `saturate(${0.72 + i * 0.06}) brightness(${1.08 - i * 0.025})`,
                    }}
                  />
                </article>
              ),
            )}
          </div>
        )}
      </section>
      <section className="origin">
        <div>
          <h3>品种起源</h3>
          <div className="origin-map">
            <svg viewBox="0 0 320 150" role="img" aria-label={`${breed.name}品种起源地图`}>
              <path d="M16 51l24-29 46 7 19 23-13 20-32 4-13 34-20-19zm104-18 34-19 32 15 25-8 45 22 42 5 9 23-29 12-31-7-18 20-35-7-17 30-28-14-9-32-24-14z" />
              <path d="M212 109l18-9 20 12-7 23-24-3z" />
              <circle className="origin-range" cx={originPoint.x} cy={originPoint.y} r="15" />
              <circle cx={originPoint.x} cy={originPoint.y} r="6" />
            </svg>
            <span>{detailPet?.breed_profile?.origin || `${breed.name}品种来源地`}</span>
          </div>
          <p>{detailPet?.breed_profile?.origin || `${breed.name}拥有完整的标准化品种起源、历史与遗传特征档案。`}</p>
          <b className="origin-alias">别称：{originAlias}</b>
          <p>{originEvolution}</p>
        </div>
        <div className="seller-summary">
          <h3>所属商家</h3>
          <button className="seller-profile-entry" onClick={openSellerProfile}>
            {sellerProfile?.thumbnail_url
              ? <img className="seller-entry-thumb" src={sellerProfile.thumbnail_url} alt={`${displaySeller}门店实景缩略图`} />
              : <i className="seller-logo-mark" style={sellerLogoStyle}><b>{displaySeller.slice(0, 1)}</b><small>✦</small></i>}
            <span><b>{displaySeller}</b><small>{sellerProfile?.offline_store || "认证线下体验店"}</small></span>
            <em>查看商家 ›</em>
          </button>
          <div className="seller-metrics">
            <span><b>{sellerProfile?.rating || 4.9}</b>综合评分</span>
            <span><b>{sellerProfile?.sales || 3289}</b>累计销量</span>
            <span><b>{merchantTrust.score}</b>信任指数</span>
          </div>
          <button className="seller-follow" onClick={toggleFollow}>
            {following ? "已关注商家" : "＋ 关注商家"}
          </button>
        </div>
      </section>
      {sellerOpen && (
        <div className="seller-sheet-backdrop" role="dialog" aria-modal="true" aria-label={`${displaySeller}商家资料`} onClick={() => setSellerOpen(false)}>
          <section className="seller-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="seller-sheet-close" onClick={() => setSellerOpen(false)}>×</button>
            <header>{merchant?.thumbnail_url
              ? <button type="button" className="seller-header-photo" onClick={() => setSellerImageOpen(true)} aria-label={`放大查看${displaySeller}门店实景`}><img src={merchant.thumbnail_url} alt={`${displaySeller}门店实景`} /></button>
              : <i className="seller-logo-mark large" style={sellerLogoStyle}><b>{displaySeller.slice(0, 1)}</b><small>✦</small></i>}<div><small>福宠认证商家</small><h2>{displaySeller}</h2><p>★★★★★　{merchant?.rating || 4.9} 分</p></div></header>
            <div className="seller-sheet-metrics"><span><b>{merchant?.sales || 3289}</b>累计销量</span><span><b>{merchant?.review_total || merchant?.review_count || 24}</b>用户评价</span><span><b>98%</b>满意度</span></div>
            {merchant?.image_url && <button type="button" className="seller-store-media" onClick={() => setSellerImageOpen(true)}><img src={merchant.image_url} alt={`${displaySeller}门店实景大图`} /><span><b>门店实景</b><small>点击查看大图</small></span></button>}
            <section className="seller-trust-card">
              <header><div><small>平台多维资料核验</small><h3>商家信任度</h3></div><b>{merchantTrust.score}<small>/100</small></b></header>
              <div>{merchantTrust.dimensions.map((item) => <span key={item.label}><em>{item.label}</em><i><b style={{ width: `${item.value}%` }} /></i><small>{item.value}</small></span>)}</div>
              <p>结合商品实拍资料、健康档案完整度、历史履约、服务响应和线下门店信息综合计算。</p>
            </section>
            <article><small>线下门店</small><h3>{merchant?.offline_store || `${displaySeller}线下体验店`}</h3><p>{merchant?.city || "本地"} · {merchant?.address || "具体地址请咨询商家"}</p></article>
            <article className="seller-real-promise"><small>影像与档案承诺</small><h3>{merchant?.specialty || "家庭适养评估与长期健康回访"}</h3><p>商品上传的图片、生活照片与视频均为对应宠物实拍；健康档案、接种凭证和线下核验信息支持逐项查看。</p><div><span>实拍影像</span><span>档案核验</span><span>到店可查</span><span>长期回访</span></div></article>
            <section className="seller-review-section">
              <header><div><small>真实到店与购买体验</small><h3>商家评价（{merchant?.review_total || merchant?.reviews?.length || 0}）</h3></div><b>{merchant?.rating || 4.9} ★</b></header>
              <div className="seller-review-list">
                {(merchant?.reviews || []).slice(0, sellerReviewLimit).map((review: any) => (
                  <article key={review.id}><div><i>{String(review.nickname).slice(0, 1)}</i><span><b>{review.nickname}</b><small>{String(review.created_at || "").slice(0, 10)} · {review.tags?.split(",").slice(0, 2).join(" · ")}</small></span><em>{"★".repeat(Number(review.rating || 5))}</em></div><p>{review.content}</p></article>
                ))}
              </div>
              {sellerReviewLimit < Number(merchant?.reviews?.length || 0) && <button className="seller-review-more" onClick={() => setSellerReviewLimit((value) => Math.min(24, value + 6))}>查看更多评价</button>}
            </section>
            <button className="seller-report-trigger" onClick={() => setSellerReportOpen((value) => !value)}>⚑ 举报商家或提交问题</button>
            {sellerReportOpen && <section className="seller-report-form">
              <h3>向平台提交商家问题</h3><p>信息仅用于平台核实，不会直接公开联系方式。</p>
              <select value={sellerReportCategory} onChange={(event) => setSellerReportCategory(event.target.value)}><option>商品资料不实</option><option>图片或视频不一致</option><option>健康档案问题</option><option>价格或合同争议</option><option>服务态度问题</option><option>其他问题</option></select>
              <textarea value={sellerReportContent} onChange={(event) => setSellerReportContent(event.target.value)} placeholder="请描述发生时间、相关商品和具体问题" />
              <input value={sellerReportPhone} onChange={(event) => setSellerReportPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" placeholder="联系电话（选填）" />
              <button onClick={submitSellerReport}>提交平台核实</button>{sellerReportMessage && <em>{sellerReportMessage}</em>}
            </section>}
            <footer><button onClick={() => { setSellerOpen(false); setInlineService({ productId: petDbId, productName: displayName, sellerId: merchant?.id || detailPet?.seller_id, sellerName: displaySeller, source: "product_detail" }); }}>咨询商家</button><button onClick={toggleFollow}>{following ? "已关注" : "关注商家"}</button></footer>
          </section>
        </div>
      )}
      {sellerImageOpen && merchant?.image_url && <div className="seller-image-viewer" role="dialog" aria-modal="true" aria-label={`${displaySeller}门店实景大图`} onClick={() => setSellerImageOpen(false)}><button type="button" onClick={() => setSellerImageOpen(false)}>×</button><img src={merchant.image_url} alt={`${displaySeller}门店实景大图`} /></div>}
      <section className="review-showcase">
        <button type="button" className="review-showcase-open" onClick={() => setReviewPanelOpen(true)}>
          <span className="review-showcase-title"><i>口碑</i><span><small>真实购买体验</small><b>用户评价</b></span></span>
          <strong>4.9 <small>★★★★★</small></strong>
          <span className="review-showcase-count">{reviewCount} 条评价 <b>展开查看 ↗</b></span>
          <span className="review-peek-row">
            {displayReviews.slice(0, 2).map((review: any) => (
              <span className="review-peek" key={String(review.id)}>
                <i>{String(review.nickname || "用户").slice(0, 1)}</i>
                <span><b>{review.nickname}</b><small>{String(review.content || "").slice(0, 34)}{String(review.content || "").length > 34 ? "…" : ""}</small></span>
              </span>
            ))}
          </span>
        </button>
      </section>
      <section className="breed-knowledge-card">
        <span className="knowledge-orbit" aria-hidden="true"><i>✦</i><i>◌</i><i>+</i></span>
        <div className="knowledge-copy">
          <small>BREED ENCYCLOPEDIA</small>
          <h3>{breed.name} · 品种科普图鉴</h3>
          <p>{breed.knowledgeImage ? "从外形特征到日常照护，一张图快速了解。" : "科普图位置已预留，收到图片后可直接替换并显示专属缩略图。"}</p>
          <span><b>01</b> 品种特征　<b>02</b> 喂养建议　<b>03</b> 健康提醒</span>
        </div>
        <button type="button" className={`knowledge-preview ${breed.knowledgeImage ? "ready" : "pending"}`} onClick={() => setKnowledgeViewerOpen(true)}>
          <SmartImage src={knowledgeThumb} alt={`${breed.name}科普图缩略图`} />
          <span>{breed.knowledgeImage ? "点击查看完整科普图" : "科普图待更新 · 查看预览框"}</span>
        </button>
      </section>
      {reviewPanelOpen && (
        <div className="review-panel-mask" role="dialog" aria-modal="true" aria-label={`${displayName}用户评价`} onClick={() => setReviewPanelOpen(false)}>
          <section className="review-panel" onClick={(event) => event.stopPropagation()}>
            <i className="review-panel-handle" />
            <header>
              <div><small>{displayName} · 独立口碑档案</small><h2>用户评价 <b>{reviewCount}</b></h2></div>
              <strong>4.9 <span>★★★★★</span></strong>
              <button type="button" onClick={() => setReviewPanelOpen(false)} aria-label="关闭评价">×</button>
            </header>
            <div className="review-panel-tags"><span>已购评价优先</span><span>按时间浏览</span><span>支持上下滑动</span></div>
            <div className="review-scroll-list">
              {displayReviews.map((review: any) => {
                const reviewKey = String(review.id);
                const liked = likedReviews.has(reviewKey);
                return (
                  <article className="review-card" key={reviewKey}>
                    <div className="review-user"><i>{String(review.nickname || "用户").slice(0, 1)}</i><p><b>{review.nickname}</b><small>{review.source === "generated" ? "平台体验样本" : review.is_verified ? "已购认证" : "平台用户"} · {String(review.created_at || "").slice(0, 10)}</small></p><span>{"★".repeat(Number(review.rating || 5))}</span></div>
                    <p>{review.content}</p>
                    {Array.isArray(review.images) && review.images.length > 0 && <div className="review-media">{review.images.slice(0, 3).map((image: string, index: number) => <SmartImage key={`${reviewKey}-image-${index}`} src={resolveMediaUrl(image)} alt={`${review.nickname}评价图片${index + 1}`} />)}</div>}
                    <button type="button" className={liked ? "liked" : ""} onClick={async () => { if (!liked && Number.isFinite(Number(review.id))) await fetch(`${API_BASE}/api/reviews/${review.id}/like`, { method: "POST" }).catch(() => {}); setLikedReviews((old) => { const next = new Set(old); if (liked) next.delete(reviewKey); else next.add(reviewKey); return next; }); }}>{liked ? "♥" : "♡"} 有帮助 {Number(review.likes || 0) + (liked ? 1 : 0)}</button>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
      {knowledgeViewerOpen && (
        <div className="knowledge-viewer" role="dialog" aria-modal="true" aria-label={`${breed.name}科普图`} onClick={() => setKnowledgeViewerOpen(false)}>
          <button type="button" onClick={() => setKnowledgeViewerOpen(false)} aria-label="关闭科普图">×</button>
          <section onClick={(event) => event.stopPropagation()}>
            <header><small>福宠品种图鉴</small><h2>{breed.name}</h2><span>{breed.knowledgeImage ? "完整科普图 · 可缩放查看" : "科普内容即将更新"}</span></header>
            <div className={breed.knowledgeImage ? "knowledge-full-image" : "knowledge-placeholder"}>
              <SmartImage src={knowledgeThumb} highres={breed.knowledgeImage || breed.image} alt={`${breed.name}品种科普图`} />
              {!breed.knowledgeImage && <div><b>BREED NOTE</b><p>科普图与缩略图位置已经准备好<br />图片提供后即可按品种独立展示</p></div>}
            </div>
          </section>
        </div>
      )}
      </>
      ) : (
        <section className="detail-progressive">
          <div className="pet-skeleton" />
          <p>正在加载健康档案、成长记录与商家资料…</p>
        </section>
      )}
      {cart && <div className="toast">已加入购物车，可在订单确认时查看</div>}
      <div className="buybar">
        <button
          onClick={() =>
            setInlineService({
              productId: petDbId,
              breedId: detailPet?.breed_id || null,
              sellerId: detailPet?.seller_id || null,
              productName: displayName,
              sellerName: displaySeller,
              source: "product_detail",
            })
          }
        >
          ♧<small>客服</small>
        </button>
        <button disabled={favoriteSaving} className={favorite ? "selected" : ""} onClick={toggleFavorite}>
          {favorite ? "♥" : "♡"}
          <small>{favorite ? "已收藏" : "收藏"}</small>
        </button>
        <button
          className={cart ? "selected" : ""}
          onClick={addToCart}
        >
          🛒<small>{cart ? "已加入" : "加入购物车"}</small>
        </button>
        <button
          className="buy"
          disabled={productStatus !== "available"}
          onClick={() =>
            productStatus === "available"
              ? setBuyOpen(true)
              : alert(productStatus === "sold" ? "该宠物已售出" : "商品已下架")
          }
        >
          {productStatus === "available" ? "立即购买" : "暂不可购"}{" "}
          <small>¥{displayPrice}</small>
        </button>
      </div>
      {favoriteMessage && <div className="toast favorite-toast">{favoriteMessage}</div>}
      {inlineService && (
        <ProductServiceOverlay
          context={inlineService}
          onClose={() => setInlineService(null)}
        />
      )}
      {buyOpen && (
        <div className="modal-mask" onClick={() => setBuyOpen(false)}>
          <section className="buy-modal" onClick={(e) => e.stopPropagation()}>
            <i />
            <h2>确认迎接 {displayName} 回家</h2>
            <div className="buy-pet">
              <SmartImage src={petImage(detailPet, breed.image)} alt={displayName} />
              <p>
                <b>
                  {displayName} · {detailPet?.breed || breed.name}
                </b>
                <span>健康认证 · 疫苗齐全 · 纯种保障</span>
              </p>
              <strong>¥{displayPrice}</strong>
            </div>
            <div className="buy-line">
              <span>配送地址</span>
              <b>
                {addressLoading
                  ? "地址加载中…"
                  : selectedAddress
                    ? `${selectedAddress.name} · ${selectedAddress.phone} · ${selectedAddress.detail}`
                    : "暂无地址，请先新增"}
              </b>
            </div>
            {orderQuote?.guarantee_eligible && <div className="buy-line">
              <span>40日更换保障</span>
              <b>{orderQuote.guarantee_policy}</b>
            </div>}
            <div className="buy-total">
              <span>应付合计</span>
              <strong>¥{orderQuote?.total_amount ?? displayPrice}</strong>
            </div>
            {orderError && <p className="buy-error">{orderError}</p>}
            <button disabled={orderSubmitting || addressLoading} onClick={submitOrder}>
              {orderSubmitting ? "正在生成订单…" : "提交订单"}
            </button>
            <small>提交即代表同意《活体宠物购买保障协议》</small>
          </section>
        </div>
      )}
    </div>
  );
}
function Parent({ title, sex, breed, image, seed }: { title: string; sex: string; breed: string; image?: string; seed: string }) {
  const ageSeed = [...seed].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const years = 3 + (ageSeed % 4);
  const months = (ageSeed * 7 + (sex === "♂" ? 3 : 8)) % 12;
  return (
    <div className="parent">
      {image ? <SmartImage src={image} alt={`${breed}${sex === "♂" ? "父系" : "母系"}档案`} /> : <div className={`parent-cartoon ${sex === "♂" ? "father" : "mother"}`} aria-label={`${breed}${sex === "♂" ? "父系" : "母系"}档案暂无实拍`}><svg viewBox="0 0 96 96" aria-hidden="true"><path d="M26 34 18 15l24 12M70 34l8-19-24 12"/><circle cx="48" cy="50" r="30"/><circle cx="37" cy="47" r="3"/><circle cx="59" cy="47" r="3"/><path d="m44 58 4 3 4-3M48 61v7m0 0-8 5m8-5 8 5"/><path d="M22 57 6 53m16 12L7 68m67-11 16-4M74 65l15 3"/></svg></div>}
      <div>
        <h3>
          {title} <i>{sex}</i>
        </h3>
        <p>
          品种：纯种{breed}
          <br />
          年龄：{years}年{months}个月
          <br />健康：商家已持续更新
        </p>
      </div>
    </div>
  );
}
function Me({ go, user }: { go: (p: Page) => void; user: User | null }) {
  const [summary, setSummary] = useState<any>({ orders: {} });
  const userId = useUserId();
  useEffect(() => {
    fetch(`${API_BASE}/api/users/${userId}/summary`)
      .then((response) => response.json())
      .then((data) => data && !data.message && setSummary(data))
      .catch(() => {});
  }, [userId]);
  const orderGroups = summary.order_groups || summary.orders || {};
  const orders = [
    ["待付款", String(orderGroups.pending_payment || 0)],
    ["待确认", String(orderGroups.pending_confirm || 0)],
    ["待发货", String(orderGroups.pending_ship || 0)],
    ["待收货", String(orderGroups.pending_receive || 0)],
    ["售后/退款", String(orderGroups.after_sale || 0)],
  ];
  const services = [
    ["♙", "登录与账号", "登录方式与账号安全", "login"],
    ["♡", "我的收藏", "收藏的宠物与心愿清单", "favorites"],
    ["🛒", "购物车", "已加入购物车的宠物", "follows"],
    ["◷", "浏览足迹", "最近看过的宠物", "footprints"],
    ["⌖", "收货地址", "管理配送地址", "addresses"],
    ["⌑", "优惠券", `${summary.coupons || 0} 张可用优惠券`, "coupons"],
    ["♧", "专属客服", "售前咨询与售后服务", "service"],
    ["⚙", "设置", "账号、安全与通知", "settings"],
    ["ⓘ", "关于福宠", "品牌、协议与隐私", "about"],
  ] as const;
  return (
    <div className="me-page">
      <section className="me-hero">
        <div className="me-top">
          <span>个人中心</span>
          <button onClick={() => go("settings")}>⚙</button>
        </div>
        <button className="profile" onClick={() => go("login")}>
          <div className="avatar">{user ? "宠" : "福"}</div>
          <div>
            <h1>{user?.nickname || "登录 / 注册"}</h1>
            <p>
              {user
                ? user.phone || "账号资料已同步"
                : "登录后同步订单、收藏和宠物档案"}
            </p>
          </div>
          <b>›</b>
        </button>
        <div className="member-card">
          <div>
            <small>FUCHONG MEMBER</small>
            <h3>福宠安心会员</h3>
            <p>专属顾问 · 健康档案 · 成长陪伴</p>
          </div>
          <button>了解权益</button>
        </div>
      </section>
      <section className="me-orders">
        <div className="card-head">
          <h2>我的订单</h2>
          <button onClick={() => go("orders")}>全部订单 ›</button>
        </div>
        <div className="order-shortcuts">
          {orders.map(([name, count], i) => (
            <button key={name} onClick={() => go("orders")}>
              <i>{["⌁", "✓", "▣", "⌂", "↻"][i]}</i>
              <span>{name}</span>
              {count !== "0" && <b>{count}</b>}
            </button>
          ))}
        </div>
      </section>
      <section className="me-stats">
        <button onClick={() => go("favorites")}>
          <b>{summary.favorites || 0}</b>
          <span>收藏宠物</span>
        </button>
        <button onClick={() => go("follows")}>
          <b>{summary.cart ?? readCart().length}</b>
          <span>购物车</span>
        </button>
        <button onClick={() => go("footprints")}>
          <b>{summary.footprints || 0}</b>
          <span>浏览足迹</span>
        </button>
        <button onClick={() => go("coupons")}>
          <b>{summary.coupons || 0}</b>
          <span>优惠券</span>
        </button>
      </section>
      <section className="me-services">
        <h2>常用服务</h2>
        {services.map(([icon, title, desc, target]) => (
          <button key={title} onClick={() => go(target)}>
            <i>{icon}</i>
            <div>
              <b>{title}</b>
              <small>{desc}</small>
            </div>
            <span>›</span>
          </button>
        ))}
      </section>
      <section className="me-links">
        <button onClick={() => go("agreement")}>
          用户协议 <span>›</span>
        </button>
        <button onClick={() => go("privacy")}>
          隐私政策 <span>›</span>
        </button>
      </section>
      <section className="admin-entry">
        <button
          onClick={() => {
            location.hash = "admin";
            location.reload();
          }}
        >
          <i>管</i>
          <div>
            <b>管理员登录</b>
            <small>商品、订单、物流与运营管理</small>
          </div>
          <span>›</span>
        </button>
      </section>
      <p className="version">福宠 FUCHONG · v0.2.0</p>
    </div>
  );
}

type CareGuide = {
  id: string;
  group: string;
  title: string;
  desc: string;
  image: string;
  tone: string;
  minutes: number;
  points?: string[];
  warning?: string;
};
const careGuides: CareGuide[] = [
  {
    id: "cat-first-week",
    group: "猫猫",
    title: "幼猫到家 7 日适应表",
    desc: "隔离、猫砂、饮水、睡眠和第一次体检的顺序清单。",
    image: hallByKey("cats").breeds[0].image,
    tone: "奶油安抚",
    minutes: 8,
    points: ["先设置安静的单独房间，保留熟悉气味并避免多人围观", "前24小时固定水碗、食盆与猫砂盆位置，只记录不强迫互动", "第3–7天逐步开放活动区域，并完成体重、食欲、排泄和首次体检记录"],
    warning: "幼猫超过12小时拒食、持续腹泻或精神明显下降，应尽快联系专业兽医。",
  },
  {
    id: "dog-social",
    group: "狗狗",
    title: "狗狗社会化训练地图",
    desc: "声音、牵引、陌生人、同类接触，按阶段慢慢打开世界。",
    image: hallByKey("dogs").breeds[5].image,
    tone: "阳光训练",
    minutes: 12,
    points: ["先在安静环境建立名字回应、跟随和主动看人的奖励关系", "每天只增加一种声音、地面或陌生人刺激，保持可退回的安全距离", "用短时高频练习替代强迫接触，结束时记录压力信号与恢复时间"],
    warning: "夹尾、持续躲避、僵住或攻击是压力过高的信号，应立即降低难度。",
  },
  {
    id: "bird-home",
    group: "鸟类",
    title: "鸟类笼舍与鸣唱养护",
    desc: "站杆、日照、换羽、互动和安静休息区设计。",
    image: hallByKey("birds").breeds[0].image,
    tone: "羽色日记",
    minutes: 6,
    points: ["笼舍远离油烟、直吹空调与昼夜噪声，预留连续安静睡眠时间", "使用不同粗细的天然站杆，食水区与排泄区分开并每日清洁", "每周记录体重、羽毛、鸣叫和食量，换羽期增加营养与环境观察"],
    warning: "张口呼吸、持续炸毛、栖杆不稳或突然安静，应尽快进行鸟类专科检查。",
  },
  {
    id: "aqua-water",
    group: "水族",
    title: "水族开缸水质手册",
    desc: "过滤、硝化、温度、换水频率和混养避坑。",
    image: hallByKey("aquatic").breeds[1].image,
    tone: "蓝色水境",
    minutes: 10,
    points: ["空缸运行过滤并建立硝化循环，确认氨氮和亚硝酸盐稳定后再入鱼", "新鱼先隔离观察，分批入缸并缓慢完成温度与水质适应", "固定每周检测和换水节奏，只清洗部分滤材，避免破坏菌群"],
    warning: "集体浮头、急促呼吸或水体异味时先增氧并立即检测水质，不要盲目整缸用药。",
  },
  {
    id: "exotic-safe",
    group: "奇宠",
    title: "奇宠安全温控清单",
    desc: "温湿度、躲避屋、垫材、喂食和观察异常状态。",
    image: hallByKey("exotic").breeds[1].image,
    tone: "特别生命",
    minutes: 9,
    points: ["按物种准备独立温区、湿度计与躲避空间，不用人体体感代替测量", "建立喂食、蜕皮、排泄和体重记录，减少不必要的抓取与把玩", "每日检查加热、照明和箱体锁闭，提前准备停电或设备故障方案"],
    warning: "奇宠物种差异很大，异常时应联系对应物种经验的专业机构，不要套用猫狗用药。",
  },
  {
    id: "health-archive",
    group: "通用",
    title: "健康档案怎么建",
    desc: "疫苗、驱虫、体重、饮食、声音和成长照片统一记录。",
    image: halls[4].hero,
    tone: "家庭档案",
    minutes: 7,
    points: ["建立福宠健康首页：身份、品种、出生日期、芯片与紧急联系人", "按时间线记录疫苗、驱虫、体重、饮食变化、检查报告与用药", "每月用同一角度拍摄成长照片，并把异常视频与就诊结果关联保存"],
    warning: "健康档案用于帮助观察和沟通，不能替代兽医诊断；药物剂量必须遵循专业医嘱。",
  },
  {
    id: "cat-feeding",
    group: "猫猫",
    title: "幼猫分龄喂养计划",
    desc: "按月龄安排主粮、饮水、换粮速度和每日观察记录。",
    image: hallByKey("cats").breeds[2].image,
    tone: "营养节律",
    minutes: 9,
    points: ["2–4月龄少量多餐，每日记录食量", "换粮至少用7天逐步替换", "每天检查饮水、排便和精神状态"],
    warning: "连续拒食、频繁呕吐或精神沉郁应尽快咨询兽医。",
  },
  {
    id: "cat-grooming",
    group: "猫猫",
    title: "长毛猫梳毛与毛球管理",
    desc: "从耳后、腋下到尾部建立低压力梳毛流程。",
    image: hallByKey("cats").breeds[0].image,
    tone: "柔软护理",
    minutes: 8,
    points: ["先用宽齿梳处理浮毛", "结毛处固定毛根后分段梳开", "换毛季提高频率并关注排便"],
    warning: "不要直接拉扯紧贴皮肤的毛结，严重结团应交由专业人员处理。",
  },
  {
    id: "cat-litter",
    group: "猫猫",
    title: "猫砂盆数量与异常排尿观察",
    desc: "用位置、清洁频率和尿团变化提前发现压力与健康问题。",
    image: hallByKey("cats").breeds[3].image,
    tone: "清洁观察",
    minutes: 6,
    points: ["猫砂盆建议按猫数加一准备", "每日清理并观察尿团大小", "避开食盆与高噪声区域"],
    warning: "频繁进出猫砂盆却排不出尿属于紧急情况。",
  },
  {
    id: "dog-exercise",
    group: "狗狗",
    title: "犬只分龄运动强度表",
    desc: "幼犬、成犬和老年犬分别安排散步、嗅闻与休息。",
    image: hallByKey("dogs").breeds[0].image,
    tone: "活力节拍",
    minutes: 10,
    points: ["幼犬避免长距离奔跑和频繁跳跃", "成犬把嗅闻探索计入运动时间", "老年犬缩短单次时长并增加次数"],
    warning: "喘息异常、步态改变或拒绝活动时立即停止运动。",
  },
  {
    id: "dog-dental",
    group: "狗狗",
    title: "狗狗口腔清洁训练",
    desc: "从触碰嘴边到使用宠物牙刷，循序建立配合。",
    image: hallByKey("dogs").breeds[2].image,
    tone: "清新日常",
    minutes: 7,
    points: ["先奖励允许触碰嘴唇的行为", "使用宠物专用牙膏", "重点清洁犬齿与后臼齿外侧"],
    warning: "牙龈持续出血、口臭突然加重或进食疼痛需检查。",
  },
  {
    id: "dog-home-alone",
    group: "狗狗",
    title: "独处适应与分离压力预防",
    desc: "通过短时离开、环境丰富化和稳定回家仪式降低焦虑。",
    image: hallByKey("dogs").breeds[4].image,
    tone: "安心独处",
    minutes: 11,
    points: ["从数十秒离开逐渐延长", "离开前提供安全耐咬玩具", "回家后保持平静再互动"],
    warning: "持续嚎叫、自伤或破坏门窗需要专业行为评估。",
  },
  {
    id: "bird-diet",
    group: "鸟类",
    title: "鸟类日粮与安全食物清单",
    desc: "合理组合颗粒粮、蔬果和少量种子，避免单一种子饮食。",
    image: hallByKey("birds").breeds[1].image,
    tone: "羽翼营养",
    minutes: 8,
    points: ["主食以营养完整的颗粒粮为主", "新鲜蔬果洗净后少量提供", "每日更换饮水并清洗容器"],
    warning: "避免巧克力、牛油果、酒精、咖啡因和高盐食物。",
  },
  {
    id: "bird-flight",
    group: "鸟类",
    title: "室内放飞安全检查",
    desc: "关闭门窗、风扇和热源，规划可见的停落位置。",
    image: hallByKey("birds").breeds[0].image,
    tone: "安全飞行",
    minutes: 5,
    points: ["放飞前锁闭门窗并拉好纱网", "关闭吊扇并遮挡大面积玻璃", "移除热水、明火和有毒植物"],
    warning: "不熟悉召回的鸟不要在开放室外环境放飞。",
  },
  {
    id: "aqua-daily",
    group: "水族",
    title: "鱼缸每日5分钟观察法",
    desc: "从游姿、呼吸、体表、进食和设备声音判断状态。",
    image: hallByKey("aquatic").breeds[0].image,
    tone: "静水观察",
    minutes: 5,
    points: ["先观察再投喂，记录异常个体", "检查过滤流量与水温", "少量投喂并清理残饵"],
    warning: "集体浮头、急促呼吸时优先检查溶氧与水质。",
  },
  {
    id: "exotic-rabbit",
    group: "奇宠",
    title: "兔类牧草、磨牙与肠胃观察",
    desc: "保证无限量牧草，结合粪便和进食变化判断肠道状态。",
    image: hallByKey("exotic").breeds[0].image,
    tone: "草香照护",
    minutes: 8,
    points: ["优质牧草全天可取食", "提供安全磨牙材料", "每天观察粪便数量与大小"],
    warning: "停止进食或长时间不排便需要尽快就医。",
  },
  {
    id: "general-emergency",
    group: "通用",
    title: "需要立即就医的异常信号",
    desc: "识别呼吸困难、意识异常、持续出血和无法排尿等紧急情况。",
    image: halls[0].hero,
    tone: "紧急判断",
    minutes: 6,
    points: ["保持环境安静并减少搬动", "记录症状开始时间和可能诱因", "提前联系医院说明动物种类与状态"],
    warning: "不要自行使用人用药物，也不要因等待线上回复延误急救。",
  },
  {
    id: "general-travel",
    group: "通用",
    title: "接宠与长途运输准备单",
    desc: "运输箱、吸水垫、饮水、温控和到家隔离一次准备齐全。",
    image: halls[1].hero,
    tone: "平稳到家",
    minutes: 9,
    points: ["提前适应尺寸合适的运输箱", "准备吸水垫和熟悉气味物品", "到家后先提供安静独立空间"],
    warning: "运输中不要随意打开箱门，极端温度时应调整行程。",
  },
];

const careRoutes = [
  { icon: "食", title: "营养路线", text: "分龄喂养、换粮、饮水与体重记录", group: "猫猫" },
  { icon: "习", title: "行为路线", text: "社会化、独处、牵引与环境适应", group: "狗狗" },
  { icon: "净", title: "环境路线", text: "笼舍、水质、温湿度与日常清洁", group: "水族" },
  { icon: "安", title: "健康路线", text: "异常观察、健康档案与紧急判断", group: "通用" },
];

const careGroupDetails: Record<string, {
  extras: string[];
  records: [string, string][];
  phases: [string, string][];
}> = {
  猫猫: {
    extras: ["保持资源位置稳定，任何调整一次只改变一个变量", "用照片和简短文字记录食欲、排泄、睡眠与互动意愿"],
    records: [["饮食", "食量与饮水"], ["排泄", "次数与形态"], ["情绪", "躲藏与互动"], ["身体", "体重与被毛"]],
    phases: [["第1天", "安静观察，建立安全边界"], ["第2–7天", "小步调整并形成稳定日程"], ["长期", "每周复盘趋势，不只看单次变化"]],
  },
  狗狗: {
    extras: ["训练保持短时、清晰、可成功，在情绪稳定时结束", "把运动量、刺激强度和恢复时间一起记录，避免只追求疲劳"],
    records: [["运动", "时长与强度"], ["训练", "成功与压力"], ["社交", "距离与反应"], ["恢复", "饮水与睡眠"]],
    phases: [["准备期", "确定奖励物与安全距离"], ["练习期", "每日多次短练，逐级增加难度"], ["巩固期", "更换环境验证，并保留简单任务"]],
  },
  鸟类: {
    extras: ["每天固定时间观察站姿、呼吸、鸣叫和粪便变化", "笼舍清洁与环境丰富化交替进行，避免一次大幅改变布局"],
    records: [["体重", "固定时段称量"], ["羽毛", "换羽与完整度"], ["粪便", "颜色与形态"], ["行为", "鸣叫与活动"]],
    phases: [["晨间", "先观察精神、粪便和饮水"], ["日间", "安排日照、互动和安全活动"], ["夜间", "遮光降噪，保障连续睡眠"]],
  },
  水族: {
    extras: ["维护前先记录水温、游姿和设备状态，再决定是否操作", "换水、滤材和用药不要同时大改，以便判断真正原因"],
    records: [["水温", "早晚变化"], ["水质", "氨氮与亚硝酸盐"], ["鱼况", "游姿与呼吸"], ["设备", "过滤与增氧"]],
    phases: [["每日", "观察设备、呼吸与进食"], ["每周", "检测水质并小幅维护"], ["每月", "复盘生物负荷和混养关系"]],
  },
  奇宠: {
    extras: ["所有温湿度数据以仪表为准，并同时记录测量位置", "先查清物种特性再调整饮食、光照和垫材，不套用猫狗经验"],
    records: [["温区", "冷热端温度"], ["湿度", "昼夜区间"], ["进食", "种类与数量"], ["状态", "蜕皮与排泄"]],
    phases: [["布置", "完成温区、躲避和防逃检查"], ["适应", "减少抓取，记录基础状态"], ["稳定", "按物种周期维护并校准设备"]],
  },
  通用: {
    extras: ["把异常开始时间、持续时长和可能诱因写清楚", "保留照片、视频、报告与处置结果，方便专业人员连续判断"],
    records: [["时间", "何时开始"], ["症状", "频率与程度"], ["诱因", "饮食与环境"], ["处置", "措施与结果"]],
    phases: [["发现", "先排除即时危险并完整记录"], ["判断", "对照基线决定观察或就医"], ["复盘", "补齐档案并设置下一次提醒"]],
  },
};

type CareAtlasBreed = BreedItem & { hallName: string };
const careAtlasBreeds: CareAtlasBreed[] = Array.from(
  new Map(
    halls.flatMap((hall) => hall.breeds
      .filter((breed) => Boolean(breed.knowledgeImage))
      .map((breed) => [breed.name, { ...breed, hallName: hall.name }] as const)),
  ).values(),
);

function CareManual({ go }: { go: (p: Page) => void }) {
  const [active, setActive] = useState("全部");
  const [careQuery, setCareQuery] = useState("");
  const [selectedGuide, setSelectedGuide] = useState<CareGuide | null>(null);
  const [selectedKnowledge, setSelectedKnowledge] = useState<CareAtlasBreed | null>(null);
  const [atlasQuery, setAtlasQuery] = useState("");
  const [atlasLimit, setAtlasLimit] = useState(8);
  const groups = ["全部", ...Array.from(new Set(careGuides.map((item) => item.group)))];
  const list = (active === "全部" ? careGuides : careGuides.filter((item) => item.group === active)).filter((item) => !careQuery.trim() || `${item.title}${item.desc}${item.group}${item.tone}`.includes(careQuery.trim()));
  const atlasMatches = useMemo(() => {
    const query = atlasQuery.trim().toLowerCase();
    return query
      ? careAtlasBreeds.filter((breed) => `${breed.name}${breed.en}${breed.hallName}`.toLowerCase().includes(query))
      : careAtlasBreeds;
  }, [atlasQuery]);
  const featuredKnowledge = atlasMatches[0] || careAtlasBreeds[0];
  return (
    <div className="care-page">
      <div className="subhead">
        <Back onClick={() => go("home")} />
        <div>
          <small>照护地图</small>
          <h2>养宠照护地图</h2>
        </div>
        <span className="care-live-mark">LIVE</span>
      </div>
      <section className="care-hero">
        <div>
          <small>养宠照护手册</small>
          <h1>把“怎么养”做成一张可以翻阅的地图</h1>
          <p>已与商品详情的品种科普图鉴互联，从喂养、训练到健康观察，一处更新即可在两处同步使用。</p>
        </div>
        <span>
          <b>{careGuides.length}</b>
          篇手册
        </span>
      </section>
      {featuredKnowledge && <section className="care-atlas-entry">
        <header>
          <div><small>FUCHONG BREED ATLAS</small><h2>福宠品种科普图鉴</h2><p>与商品详情共用同一份图鉴资源，不重复存储；缩略图先开，高画质按需查看。</p></div>
          <span><b>{careAtlasBreeds.length}</b>份图鉴</span>
        </header>
        <button className="care-atlas-feature" type="button" onClick={() => setSelectedKnowledge(featuredKnowledge)}>
          <SmartImage src={featuredKnowledge.knowledgeThumbnail || featuredKnowledge.image} alt={`${featuredKnowledge.name}科普图鉴缩略图`} />
          <div><i>福宠 · 今日图鉴</i><h3>{featuredKnowledge.name}</h3><p>{featuredKnowledge.en} · {featuredKnowledge.hallName}</p><b>打开完整科普图　↗</b></div>
        </button>
        <label className="care-atlas-search"><span>⌕</span><input value={atlasQuery} onChange={(event) => { setAtlasQuery(event.target.value); setAtlasLimit(8); }} placeholder="搜索品种图鉴，例如布偶猫、柯基、锦鲤" />{atlasQuery && <button type="button" onClick={() => setAtlasQuery("")}>清除</button>}</label>
        <div className="care-atlas-grid">
          {atlasMatches.slice(0, atlasLimit).map((breed) => <button type="button" key={breed.id} onClick={() => setSelectedKnowledge(breed)}>
            <SmartImage src={breed.knowledgeThumbnail || breed.image} alt={`${breed.name}图鉴`} />
            <span><b>{breed.name}</b><small>{breed.hallName} · 福宠图鉴</small></span>
          </button>)}
        </div>
        {!atlasMatches.length && <p className="care-atlas-empty">暂未找到该品种图鉴，可查看全部已更新内容。</p>}
        {atlasLimit < atlasMatches.length && <button className="care-atlas-more" type="button" onClick={() => setAtlasLimit((value) => value + 8)}>横向浏览更多 8 个品种 · 剩余 {atlasMatches.length - atlasLimit}</button>}
      </section>}
      <section className="care-route-map">
        <header><div><small>CARE COMPASS</small><h2>从今天最需要的方向出发</h2></div><span>4 条路线</span></header>
        <div>{careRoutes.map((route) => <button type="button" key={route.title} onClick={() => { setActive(route.group); setCareQuery(""); }}><i>{route.icon}</i><span><b>{route.title}</b><small>{route.text}</small></span><em>→</em></button>)}</div>
      </section>
      <label className="care-search"><span>⌕</span><input value={careQuery} onChange={(event) => setCareQuery(event.target.value)} placeholder="搜索喂养、训练、健康或具体问题" />{careQuery && <button type="button" onClick={() => setCareQuery("")}>清除</button>}</label>
      <div className="care-tabs">
        {groups.map((group) => (
          <button key={group} className={active === group ? "on" : ""} onClick={() => setActive(group)}>
            {group}
          </button>
        ))}
      </div>
      <section className="care-mosaic">
        {list.map((guide, index) => (
          <button key={guide.id} className={index % 3 === 0 ? "wide" : ""} onClick={() => setSelectedGuide(guide)}>
            <SmartImage src={guide.image} alt={guide.title} />
            <div>
              <small>{guide.group} · {guide.minutes} 分钟</small><b className="care-brand-seal">福宠照护</b>
              <h3>{guide.title}</h3>
              <p>{guide.desc}</p>
              <ul>{(guide.points || []).slice(0, 2).map((point) => <li key={point}>{point}</li>)}</ul>
              <em>{guide.tone}</em>
            </div>
          </button>
        ))}
      </section>
      {!list.length && <section className="care-empty-result"><b>没有找到完全匹配的手册</b><p>可以换一个关键词，或从上方四条照护路线重新开始。</p><button type="button" onClick={() => { setCareQuery(""); setActive("全部"); }}>查看全部手册</button></section>}
      <section className="care-emergency-compass">
        <div><small>QUICK SAFETY CHECK</small><h2>先判断，是观察还是立即行动</h2><p>紧急入口不会替代专业诊疗，但能帮助您更快整理症状与下一步。</p></div>
        <button type="button" onClick={() => setSelectedGuide(careGuides.find((item) => item.id === "general-emergency") || null)}><i>!</i><span><b>紧急异常信号</b><small>呼吸、意识、出血、排尿</small></span><em>立即查看 →</em></button>
        <button type="button" onClick={() => setSelectedGuide(careGuides.find((item) => item.id === "health-archive") || null)}><i>＋</i><span><b>建立健康档案</b><small>疫苗、体重、饮食、影像</small></span><em>开始记录 →</em></button>
      </section>
      <section className="care-upload-hint">
        <b>持续更新</b>
        <p>照护手册按品种、成长阶段和健康主题持续扩充，重要异常请优先联系专业兽医。</p>
      </section>
      {selectedGuide && (
        <div className="care-detail-mask" onClick={() => setSelectedGuide(null)}>
          <section className="care-detail-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="care-detail-close" onClick={() => setSelectedGuide(null)}>×</button>
            <small>{selectedGuide.group} · 约 {selectedGuide.minutes} 分钟</small><b className="care-sheet-brand">福宠 FUCHONG · 专属照护手册</b>
            <h2>{selectedGuide.title}</h2>
            <p>{selectedGuide.desc}</p>
            <div className="care-reading-intro"><span>福宠照护解读</span><p>这份手册围绕“{selectedGuide.tone}”整理。建议先建立宠物平日状态的基线，再按步骤逐项调整；每次只改变少量条件，才能判断真正有效的照护方式。</p></div>
            <h3>照护步骤</h3>
            <ol>
              {[...(selectedGuide.points || []), ...(careGroupDetails[selectedGuide.group]?.extras || [])].map((point, index) => <li key={point}><b>{String(index + 1).padStart(2, "0")}</b><span>{point}</span></li>)}
            </ol>
            <h3>福宠观察记录</h3>
            <div className="care-record-grid">{(careGroupDetails[selectedGuide.group]?.records || []).map(([name, text]) => <span key={name}><b>{name}</b><small>{text}</small></span>)}</div>
            <h3>建议执行节奏</h3>
            <div className="care-phase-line">{(careGroupDetails[selectedGuide.group]?.phases || []).map(([name, text], index) => <article key={name}><i>{index + 1}</i><div><b>{name}</b><p>{text}</p></div></article>)}</div>
            <div className="care-warning"><b>重要提醒</b>{selectedGuide.warning || "发现持续异常或状态快速变化时，请及时联系专业兽医。"}</div>
          </section>
        </div>
      )}
      {selectedKnowledge && (
        <div className="care-detail-mask" onClick={() => setSelectedKnowledge(null)}>
          <section className="care-atlas-viewer" onClick={(event) => event.stopPropagation()}>
            <button className="care-detail-close" onClick={() => setSelectedKnowledge(null)}>×</button>
            <header><small>福宠品种图鉴 · {selectedKnowledge.hallName}</small><h2>{selectedKnowledge.name}</h2><p>{selectedKnowledge.en} · 完整科普图，点击后才加载高清资源</p></header>
            <div><SmartImage src={selectedKnowledge.knowledgeThumbnail || selectedKnowledge.image} highres={selectedKnowledge.knowledgeImage || selectedKnowledge.image} alt={`${selectedKnowledge.name}完整科普图`} /></div>
            <footer><b>福宠 FUCHONG</b><span>资料用于科学养宠参考，个体照护请结合专业建议。</span></footer>
          </section>
        </div>
      )}
    </div>
  );
}

function Charity({ go }: { go: (p: Page) => void }) {
  const [selectedProject, setSelectedProject] = useState<(typeof charityProjects)[number] | null>(null);
  return (
    <div className="charity-page">
      <section className="charity-hero">
        <Back onClick={() => go("home")} />
        <div className="charity-orbit" aria-hidden="true"><i /><i /><i /><b>福</b></div>
        <small>福宠公益</small>
        <h1>让一次遇见，<br />成为一生的安稳</h1>
        <p>尊重生命不是一句口号。我们把救助、医疗、领养与回访放进同一条可追溯的公益链路。</p>
        <div className="charity-hero-stats">
          <span><b>2,386</b>累计救助</span>
          <span><b>1,129</b>温暖回家</span>
          <span><b>98.6%</b>回访完成</span>
        </div>
      </section>
      <section className="charity-manifesto">
        <small>我们相信</small>
        <h2>被认真记录的善意，才会走得更远</h2>
        <p>每个公益项目都记录来源、执行节点与结果。用户可以看见帮助去了哪里，也能选择适合自己的参与方式。</p>
        <div className="charity-path"><i>发现</i><em /><i>救助</i><em /><i>康复</i><em /><i>回家</i><em /><i>回访</i></div>
      </section>
      <section className="charity-projects">
        <header><small>正在发生</small><h2>三条生命守护线</h2></header>
        {charityProjects.map((project, index) => (
          <button type="button" key={project.title} className={`${index === 0 ? "featured" : ""} ${selectedProject?.title === project.title ? "selected" : ""}`} onClick={() => setSelectedProject(project)}>
            <i>{project.icon}</i>
            <div><h3>{project.title}</h3><p>{project.summary}</p><b>{project.stat}　查看详情 →</b></div>
          </button>
        ))}
      </section>
      {selectedProject && <section className="charity-project-detail">
        <header><div><small>OPEN PROJECT · {selectedProject.city}</small><h2>{selectedProject.title}</h2><p>{selectedProject.summary}</p></div><button type="button" onClick={() => setSelectedProject(null)}>×</button></header>
        <SmartImage src={selectedProject.image} alt={selectedProject.title} />
        <div className="charity-detail-meta"><span><small>活动时间</small><b>{selectedProject.date}</b></span><span><small>报名状态</small><b>{selectedProject.capacity}</b></span></div>
        <div className="charity-detail-columns"><div><small>当前需要</small>{selectedProject.needs.map((need) => <p key={need}>◇ {need}</p>)}</div><div><small>参与路径</small>{selectedProject.steps.map((step, index) => <p key={step}><b>{String(index + 1).padStart(2, "0")}</b>{step}</p>)}</div></div>
        <CommunityApplicationForm applicationType="charity" subject={selectedProject.title} subjectLabel="公益项目" title="报名成为行动伙伴" description="资料会直接写入后台“其他申请”，由公益运营人员确认城市、时间和岗位。" submitLabel="提交公益报名" metadata={{ city: selectedProject.city, schedule: selectedProject.date, source: "charity-page" }} />
      </section>}
      <section className="charity-ledger">
        <div><small>透明行动账本</small><h2>每一份善意，都有回声</h2></div>
        <span>最近更新　今天 09:30</span>
        <ul>
          <li><b>医疗援助</b><i /><em>¥ 286,400</em></li>
          <li><b>绝育防疫</b><i /><em>¥ 174,800</em></li>
          <li><b>领养回访</b><i /><em>¥ 96,200</em></li>
        </ul>
      </section>
      <section className="charity-join">
        <small>一起参与</small>
        <h2>不必宏大，也能改变一个生命</h2>
        <div><button onClick={() => { setSelectedProject(charityProjects[0]); scrollTo(0, 900); }}>报名公益行动</button><button onClick={() => go("service")}>联系公益顾问</button></div>
        <p>领养代替购买 · 文明养宠 · 不遗弃 · 为每次选择负责</p>
      </section>
    </div>
  );
}

function SubPage({ title, kind, go }: { title: string; kind: "settings" | "about" | "agreement" | "privacy"; go: (p: Page) => void }) {
  const [orderNotice, setOrderNotice] = useState(
    () => localStorage.getItem("fuchong-order-notice") !== "off",
  );
  const [serviceNotice, setServiceNotice] = useState(
    () => localStorage.getItem("fuchong-service-notice") !== "off",
  );
  const setNotice = (key: string, value: boolean, update: (next: boolean) => void) => {
    localStorage.setItem(key, value ? "on" : "off");
    update(value);
  };
  const content = {
    about: [
      ["平台定位", "福宠是连接宠物家庭、认证商家与专业服务的宠物生活平台。"],
      ["平台保障", "商品档案、健康记录、订单支付、物流和售后均采用可追溯的数据记录。"],
      ["联系我们", "可从底部客服入口发起购买、订单、物流、售后或健康咨询。"],
    ],
    agreement: [
      ["账号与使用", "用户应提供真实、合法的信息，不得利用平台发布违法内容或实施欺诈。"],
      ["交易规则", "订单以服务端生成记录为准；活体宠物交易应充分了解健康、运输及适养责任。"],
      ["售后处理", "退款、售后和投诉按照订单证据、商家承诺及平台保障规则处理。"],
    ],
    privacy: [
      ["信息收集", "仅为登录、交易、配送、客服和安全目的收集必要的账号、手机号、地址与行为数据。"],
      ["信息使用", "不会将个人信息用于无关目的；敏感信息只在完成服务所需范围内处理。"],
      ["用户权利", "用户可以管理地址、登录状态和本地缓存，并可通过客服申请查询或更正资料。"],
    ],
  } as const;
  return (
    <div className="subpage">
      <div className="subhead">
        <Back onClick={() => go("me")} />
        <div>
          <small>FUCHONG</small>
          <h2>{title}</h2>
        </div>
        <span />
      </div>
      {kind === "settings" ? (
        <section className="settings-card">
          <label>
            <span><b>订单状态通知</b><small>付款、发货和物流进度变化</small></span>
            <input type="checkbox" checked={orderNotice} onChange={(e) => setNotice("fuchong-order-notice", e.target.checked, setOrderNotice)} />
          </label>
          <label>
            <span><b>客服消息通知</b><small>客服回复和人工接入提醒</small></span>
            <input type="checkbox" checked={serviceNotice} onChange={(e) => setNotice("fuchong-service-notice", e.target.checked, setServiceNotice)} />
          </label>
          <button onClick={() => {
            Object.keys(localStorage).filter((key) => key.startsWith("fuchong-cache:")).forEach((key) => localStorage.removeItem(key));
            alert("页面缓存已清理，账号和订单数据不受影响");
          }}>清理页面缓存</button>
          <button onClick={() => go("login")}>账号与登录安全</button>
        </section>
      ) : (
        <section className="policy-card">
          {content[kind].map(([heading, text]) => (
            <article key={heading}><h3>{heading}</h3><p>{text}</p></article>
          ))}
          <small>更新日期：2026年7月14日</small>
        </section>
      )}
    </div>
  );
}

export default function App() {
  useEffect(() => {
    if (!localStorage.getItem("fuchong-user")) ensureVisitor();
  }, []);
  const adminMode = location.hash.startsWith("#admin");
  const [page, setPage] = useState<Page>("home");
  const [user, setUser] = useState<User | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("fuchong-user") || "null");
    } catch {
      return null;
    }
  });
  const [hallKey, setHallKey] = useState<HallKey>("dogs");
  const [breed, setBreed] = useState<BreedItem>(dogBreeds[0]);
  const [selectedPet, setSelectedPet] = useState<ApiPet | null>(null);
  const [detailReturnPage, setDetailReturnPage] = useState<Page>("breed");
  const [serviceContext, setServiceContext] = useState<ServiceContext | null>(null);
  const go = (p: Page) => {
    setPage(p);
    scrollTo(0, 0);
  };
  const login = (u: User) => {
    setUser(u);
    localStorage.setItem("fuchong-user", JSON.stringify(u));
  };
  const logout = () => {
    setUser(null);
    localStorage.removeItem("fuchong-user");
    publishUserId(0);
    localStorage.removeItem("fuchong-visitor-token");
    ensureVisitor();
  };
  const openHall = (key: HallKey) => {
    setHallKey(key);
    go("hall");
  };
  const openBreed = (item: BreedItem) => {
    setBreed(item);
    setSelectedPet(null);
    go("breed");
  };
  const openPet = (pet: ApiPet, fallbackBreed?: BreedItem, returnTo: Page = "breed") => {
    if (fallbackBreed) setBreed(fallbackBreed);
    else
      setBreed((b) => ({
        ...b,
        name: pet.breed || b.name,
        image: petImage(pet, b.image),
      }));
    setSelectedPet(pet);
    setDetailReturnPage(returnTo);
    go("detail");
  };
  if (adminMode) return <AdminApp />;
  return (
    <main className="phone-shell">
      {page === "home" && <Home openHall={openHall} go={go} />}{" "}
      {page === "search" && (
        <SearchPage go={go} openBreed={openBreed} openPet={openPet} />
      )}
      {page === "hall" && (
        hallKey === "more"
          ? <MoreHall go={go} />
          : <Hall go={go} hallKey={hallKey} openBreed={openBreed} />
      )}{" "}
      {page === "breed" && <Breed go={go} breed={breed} openPet={openPet} />}{" "}
      {page === "detail" && (
        <Detail
          go={go}
          breed={breed}
          pet={selectedPet}
          returnPage={detailReturnPage}
        />
      )}
      {page === "family" && (
        <P0CollectionPage
          mode="favorites"
          back={() => go("home")}
          onOpenPet={(pet) =>
            openPet(
              {
                id: Number(pet.pet_id || 0),
                name: pet.name || "商品不存在",
                breed: pet.breed || breed.name,
                price: pet.price || 0,
                gender: pet.gender,
                age_months: pet.age_months,
                image: pet.image,
                seller_name: pet.seller_name,
              },
              undefined,
              "family",
            )
          }
        />
      )}{" "}
      {page === "service" && (
        <P0MessagesPage
          back={() => go(serviceContext?.source === "order_center" ? "orders" : "home")}
          context={serviceContext}
          onOpenProduct={(petId, productName) =>
            openPet(
              {
                id: petId,
                name: productName || "咨询商品",
                breed: breed.name,
                price: 0,
              },
              undefined,
              "service",
            )
          }
        />
      )}{" "}
      {page === "care" && <CareManual go={go} />}{" "}
      {page === "charity" && <Charity go={go} />}{" "}
      {page === "me" && <Me go={go} user={user} />}
      {page === "login" && (
        <P0LoginPage
          back={() => go("me")}
          user={user}
          onLogin={login}
          onLogout={logout}
        />
      )}{" "}
      {page === "orders" && (
        <OrdersPage
          back={() => go("me")}
          onService={(order) => {
            setServiceContext({
              productId: order.petId,
              productName: order.petName,
              productImage: order.image,
              productBreed: order.breed,
              productPrice: order.price,
              sellerName: order.sellerName,
              source: "order_center",
              orderId: order.databaseId,
              orderNo: order.id,
              orderStatus: order.status,
              logisticsStatus: order.logisticsStatus,
              trackingNo: order.trackingNo,
            });
            go("service");
          }}
          onRebuy={(order) =>
            openPet({
              id: Number(order.petId || 0),
              name: order.petName,
              breed: order.breed,
              price: order.price,
              seller_name: order.sellerName,
              image: order.image,
            }, undefined, "orders")
          }
        />
      )}
      {page === "favorites" && (
        <P0CollectionPage
          mode="favorites"
          back={() => go("me")}
          onOpenPet={(pet) =>
            openPet(
              {
                id: Number(pet.pet_id || 0),
                name: pet.name || "商品不存在",
                breed: pet.breed || breed.name,
                price: pet.price || 0,
                gender: pet.gender,
                age_months: pet.age_months,
                image: pet.image,
                seller_name: pet.seller_name,
              },
              undefined,
              "favorites",
            )
          }
        />
      )}{" "}
      {page === "follows" && (
        <P0CollectionPage
          mode="cart"
          back={() => go("me")}
          onOpenPet={(pet) =>
            openPet(
              {
                id: Number(pet.pet_id || 0),
                name: pet.name || "商品不存在",
                breed: pet.breed || breed.name,
                price: pet.price || 0,
                gender: pet.gender,
                age_months: pet.age_months,
                image: pet.image,
                seller_name: pet.seller_name,
              },
              undefined,
              "follows",
            )
          }
        />
      )}
      {page === "footprints" && <FootprintsPage back={() => go("me")} />}{" "}
      {page === "addresses" && <AddressesPage back={() => go("me")} />}{" "}
      {page === "coupons" && <CouponsPage back={() => go("me")} />}
      {["settings", "about", "agreement", "privacy"].includes(page) && (
        <SubPage
          kind={page as "settings" | "about" | "agreement" | "privacy"}
          title={
            (
              {
                settings: "设置",
                about: "关于福宠",
                agreement: "用户协议",
                privacy: "隐私政策",
              } as Record<string, string>
            )[page]
          }
          go={go}
        />
      )}
      {!["hall", "breed", "detail", "addresses", "charity"].includes(page) && (
        <Nav go={go} page={page} />
      )}
    </main>
  );
}

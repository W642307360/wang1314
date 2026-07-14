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
import "./SearchPage.css";
import "./HomeLayout.css";
import "./Stability.css";
import "./ProductDetail.css";
import "./Charity.css";
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
  };
  thumbnail_url?: string;
  highres_url?: string;
  image?: string;
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
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:3001";
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
const resolveMediaUrl = (url?: string) => {
  if (!url) return "";
  if (/^https:\/\/open\.feishu\.cn\/open-apis\/drive\/v1\/medias\//.test(url))
    return `${API_BASE}/api/media/feishu?url=${encodeURIComponent(url)}`;
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
  ) || fallback;
const jsonCache = new Map<string, { at: number; ttl: number; data: unknown }>();
const imageMemoryCache = new Set<string>();
const thumbImage = (url?: string, fallback = petPhoto) =>
  optimizePetImage(url || fallback, "thumb", fallback);
const coverImage = (url?: string, fallback = petPhoto) =>
  optimizePetImage(url || fallback, "detail", fallback);
const CART_KEY = "fuchong-cart";
type LocalCartPet = {
  cart_id: string;
  pet_id?: number | null;
  name: string;
  breed: string;
  gender?: string;
  age_months?: number;
  price: number;
  image?: string;
  seller_name?: string;
  added_at: string;
};
const readLocalCart = (): LocalCartPet[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const writeLocalCart = (items: LocalCartPet[]) => {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("fuchong-cart-change"));
};
async function cachedJson<T>(url: string, ttl = 45_000): Promise<T> {
  const cached = jsonCache.get(url);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.data as T;
  const r = await fetch(url);
  const data = (await r.json()) as T;
  jsonCache.set(url, { at: Date.now(), ttl, data });
  return data;
}
function SmartImage({
  src,
  alt = "",
  className,
  eager = false,
  highres,
  style,
}: {
  src?: string;
  alt?: string;
  className?: string;
  eager?: boolean;
  highres?: string;
  style?: CSSProperties;
}) {
  const small = thumbImage(src);
  const large = highres ? coverImage(highres, src) : undefined;
  const initialLoaded = imageMemoryCache.has(small);
  const [loaded, setLoaded] = useState(initialLoaded);
  const [error, setError] = useState(false);
  const [highresFailed, setHighresFailed] = useState(false);
  const [current, setCurrent] = useState(small);
  useEffect(() => {
    const next = thumbImage(src);
    setCurrent(next);
    setLoaded(imageMemoryCache.has(next));
    setError(false);
    setHighresFailed(false);
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
        <em>图片加载中</em>
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
            if (current !== small) {
              setHighresFailed(true);
              setCurrent(small);
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
          <span className="brand-logo" aria-hidden="true">
            <i />
            <b />
          </span>
          <h1>福宠</h1>
        </div>
        <button className="search" onClick={() => go("search")}>
          ⌕&nbsp; 搜索宠物名称、品种或分类
        </button>
      </header>
      <section className="home-carousel">
        <div className="carousel-track">
          <article>
            <SmartImage src={halls[0].hero} eager />
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
        {virtualBreeds.items.map((b, i) => (
          <button key={b.id} onClick={() => openBreed(b)}>
            <div className="headshot">
              <SmartImage src={b.image} alt={b.name} />
              <span>{(i % 7) + 3}只在售</span>
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
          <h2>犬种资料</h2>
        </div>
        <button>♡</button>
      </div>
      <section className="breed-cover">
        <SmartImage src={b.image} alt={b.name} eager />
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
            <b>大型犬</b>
            <small>体型</small>
          </div>
          <div>
            <b>10–12年</b>
            <small>寿命</small>
          </div>
          <div>
            <b>友善</b>
            <small>性格</small>
          </div>
          <div>
            <b>中等</b>
            <small>饲养难度</small>
          </div>
        </div>
      </section>
      <section className="trait-card">
        <h3>犬种特征</h3>
        {[
          ["亲人程度", "95%"],
          ["运动需求", "85%"],
          ["掉毛程度", "70%"],
          ["训练难度", "30%"],
        ].map((x) => (
          <div className="trait" key={x[0]}>
            <span>{x[0]}</span>
            <i>
              <b style={{ width: x[1] }} />
            </i>
            <small>{x[1]}</small>
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
                <SmartImage src={petImage(pet, b.image)} alt={pet.name} />
                <span>{pet.health_status || "健康认证"}</span>
                <h3>{pet.name}</h3>
                <p>
                  {pet.breed} · {pet.age_months || 3}个月 ·{" "}
                  {pet.gender || "待确认"}
                </p>
                <b>¥ {pet.price}</b>
              </button>
            ))}
        {!pets.length &&
          !loading &&
          Array.from({ length: 6 }).map((_, index) => {
            const mockPet: ApiPet = {
              id: 0,
              name: `${b.name}精选宠物 ${String(index + 1).padStart(2, "0")}`,
              breed: b.name,
              price: 3600 + index * 500,
              gender: index % 2 ? "妹妹" : "弟弟",
              age_months: 2 + index,
              health_status: "健康认证",
              seller_name: "福宠认证宠物馆",
              image: b.image,
            };
            return (
              <button
                key={`${b.name}-mock-${index}`}
                className="breed-showcase-card"
                onClick={() => openPet(mockPet, b)}
              >
                <SmartImage src={b.image} alt={mockPet.name} />
                <span>{index < 2 ? "今日可咨询" : "健康认证"}</span>
                <h3>{mockPet.name}</h3>
                <p>
                  {mockPet.breed} · {mockPet.age_months}个月 · {mockPet.gender}
                </p>
                <b>{index < 2 ? `¥ ${mockPet.price}` : "预约咨询"}</b>
              </button>
            );
          })}
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
  const userId = Number(localStorage.getItem("fuchong-user-id") || 1);
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
  const [sellerDetail, setSellerDetail] = useState<any>(null);
  const [sellerReviewLimit, setSellerReviewLimit] = useState(8);
  const [sellerReportOpen, setSellerReportOpen] = useState(false);
  const [sellerReportCategory, setSellerReportCategory] = useState("商品资料不实");
  const [sellerReportContent, setSellerReportContent] = useState("");
  const [sellerReportPhone, setSellerReportPhone] = useState("");
  const [sellerReportMessage, setSellerReportMessage] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [petDbId, setPetDbId] = useState<number | null>(pet?.id || null);
  const [detailPet, setDetailPet] = useState<any>(pet);
  const [detailReady, setDetailReady] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [likedReviews, setLikedReviews] = useState<Set<string>>(new Set());
  const touchStartX = useRef(0);
  const userId = Number(localStorage.getItem("fuchong-user-id") || 1);
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
        url: resolveMediaUrl(item.highres_url || item.webp_url || item.url),
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
  const archiveMeta = petArchiveMeta(detailPet, displayName);
  const merchant = sellerDetail || sellerProfile;
  const sellerLogoStyle = { "--seller-hue": `${((Number(sellerProfile?.id || detailPet?.seller_id || 1) * 47) % 360)}deg` } as CSSProperties;
  useEffect(() => {
    setGalleryIndex(0);
    setMediaViewerOpen(false);
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
        body: JSON.stringify({ user_id: userId, pet_id: petDbId, address }),
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
    setSellerReviewLimit(8);
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
  const addToCart = () => {
    const nextItem: LocalCartPet = {
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
    writeLocalCart([nextItem, ...readLocalCart()].slice(0, 99));
    setCart(true);
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
          <video src={activeMedia.url} poster={activeMedia.thumb} controls playsInline preload="metadata" />
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
              <video src={activeMedia.url} poster={activeMedia.thumb} controls autoPlay playsInline preload="auto" />
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
        <strong className="price">¥{displayPrice} <small>已售 128</small></strong>
      </section>
      {detailReady ? (
      <>
      <section className="parents">
        <Parent title={detailPet?.father_info || "父系档案待商家补充"} sex="♂" breed={detailPet?.breed || breed.name} image={mediaItems[0]?.thumb} />
        <div className="heart">♡</div>
        <Parent title={detailPet?.mother_info || "母系档案待商家补充"} sex="♀" breed={detailPet?.breed || breed.name} image={mediaItems[0]?.thumb} />
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
            <div className="trait-orbit">{archiveMeta.personalityType}<i>亲</i><i>稳</i><i>灵</i></div>
            <b>{archiveMeta.dateLabel} · {archiveMeta.zodiac}</b>
            <small className="trait-caption">{detailPet?.personality || "温顺亲人"}</small>
          </article>
          <article className="trait-health">
            <span>健康等级</span>
            <div className="health-rings"><i /><i /><i /><i /><i /></div>
            <b>{detailPet?.health_status || "健康档案待补充"}</b>
          </article>
          <article className="trait-life">
            <span>生命周期</span>
            <div className="life-line"><i /><i /><i /><i /></div>
            <b>{archiveMeta.lifeStage} · {archiveMeta.lifeCopy}</b>
            <small className="trait-caption">幼年 · 成长 · 成熟 · 陪伴</small>
          </article>
          <article className="trait-breed">
            <span>繁育档案</span>
            <div className="trait-breed-media">
              <SmartImage
                src={mediaItems[0]?.thumb || breed.image}
                highres={mediaItems[0]?.url}
                alt={`${displayName}繁育档案`}
              />
              <small><i>✓</i> 鉴定纯种</small>
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
            <i className="seller-logo-mark" style={sellerLogoStyle}><b>{displaySeller.slice(0, 1)}</b><small>✦</small></i>
            <span><b>{displaySeller}</b><small>{sellerProfile?.offline_store || "认证线下体验店"}</small></span>
            <em>查看商家 ›</em>
          </button>
          <div className="seller-metrics">
            <span><b>{sellerProfile?.rating || 4.9}</b>综合评分</span>
            <span><b>{sellerProfile?.sales || 3289}</b>累计销量</span>
            <span><b>{sellerProfile?.review_count || 862}</b>真实评价</span>
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
            <header><i className="seller-logo-mark large" style={sellerLogoStyle}><b>{displaySeller.slice(0, 1)}</b><small>✦</small></i><div><small>福宠认证商家</small><h2>{displaySeller}</h2><p>★★★★★　{merchant?.rating || 4.9} 分</p></div></header>
            <div className="seller-sheet-metrics"><span><b>{merchant?.sales || 3289}</b>累计销量</span><span><b>{merchant?.review_total || merchant?.review_count || 24}</b>用户评价</span><span><b>98%</b>满意度</span></div>
            <article><small>线下门店</small><h3>{merchant?.offline_store || `${displaySeller}线下体验店`}</h3><p>{merchant?.city || "本地"} · {merchant?.address || "具体地址请咨询商家"}</p></article>
            <article className="seller-real-promise"><small>影像与档案承诺</small><h3>{merchant?.specialty || "家庭适养评估与长期健康回访"}</h3><p>商品上传的图片、生活照片与视频均为对应宠物实拍；健康档案、接种凭证和线下核验信息支持逐项查看。</p><div><span>实拍影像</span><span>档案核验</span><span>到店可查</span><span>长期回访</span></div></article>
            <section className="seller-review-section">
              <header><div><small>真实到店与购买体验</small><h3>商家评价（{merchant?.review_total || merchant?.reviews?.length || 0}）</h3></div><b>{merchant?.rating || 4.9} ★</b></header>
              <div className="seller-review-list">
                {(merchant?.reviews || []).slice(0, sellerReviewLimit).map((review: any) => (
                  <article key={review.id}><div><i>{String(review.nickname).slice(0, 1)}</i><span><b>{review.nickname}</b><small>{String(review.created_at || "").slice(0, 10)} · {review.tags?.split(",").slice(0, 2).join(" · ")}</small></span><em>{"★".repeat(Number(review.rating || 5))}</em></div><p>{review.content}</p></article>
                ))}
              </div>
              {sellerReviewLimit < Number(merchant?.reviews?.length || 0) && <button className="seller-review-more" onClick={() => setSellerReviewLimit((value) => value + 8)}>查看更多评价</button>}
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
      <section className="reviews">
        <header><div><small>文字评价</small><h3>用户评价（{Math.min(25, detailPet?.review_count || detailPet?.reviews?.length || 3)}）</h3></div><b>4.9 <span>★★★★★</span></b></header>
        {(detailPet?.reviews?.length ? detailPet.reviews : [
          { id: "demo-1", nickname: "林间小屋", rating: 5, is_verified: 1, created_at: "2026-06-28", content: `${displayName}到家后状态特别好，眼睛清亮，毛发柔软。客服提前讲了饮食和应激期注意事项，第一晚就愿意靠近我们。`, images: mediaItems.filter((x) => x.kind === "image").slice(0, 2).map((x) => x.thumb), likes: 18 },
          { id: "demo-2", nickname: "阿梨的日常", rating: 5, is_verified: 1, created_at: "2026-06-19", content: "整个购买流程很透明，健康资料和疫苗记录都能查看。接回家一周适应得很快，性格比照片里还亲人。", images: mediaItems.filter((x) => x.kind === "image").slice(1, 3).map((x) => x.thumb), likes: 11 },
          { id: "demo-3", nickname: "慢慢陪伴", rating: 5, is_verified: 1, created_at: "2026-06-03", content: "商家会持续回访，喂养建议很细。外观、年龄和商品资料一致，生活视频也让我们下单前更放心。", videos: mediaItems.filter((x) => x.kind === "video").slice(0, 1).map((x) => x.url), likes: 9 },
        ]).map((review: any) => {
          const reviewKey = String(review.id);
          const liked = likedReviews.has(reviewKey);
          return (
            <article className="review-card" key={reviewKey}>
              <div className="review-user"><i>{String(review.nickname || "用户").slice(0, 1)}</i><p><b>{review.nickname}</b><small>{review.source === "generated" ? "平台体验样本" : review.is_verified ? "已购认证" : "平台用户"} · {String(review.created_at || "").slice(0, 10)}</small></p><span>{"★".repeat(Number(review.rating || 5))}</span></div>
              <p>{review.content}</p>
              <button type="button" onClick={async () => { if (!liked && Number.isFinite(Number(review.id))) await fetch(`${API_BASE}/api/reviews/${review.id}/like`, { method: "POST" }).catch(() => {}); setLikedReviews((old) => { const next = new Set(old); if (liked) next.delete(reviewKey); else next.add(reviewKey); return next; }); }}>♡ 有帮助 {Number(review.likes || 0) + (liked ? 1 : 0)}</button>
            </article>
          );
        })}
      </section>
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
            <div className="buy-line">
              <span>平台保障</span>
              <b>30天健康保障</b>
            </div>
            <div className="buy-total">
              <span>应付合计</span>
              <strong>¥{displayPrice}</strong>
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
function Parent({ title, sex, breed, image }: { title: string; sex: string; breed: string; image?: string }) {
  return (
    <div className="parent">
      <SmartImage src={image || petPhoto} alt={`${breed}${sex === "♂" ? "父系" : "母系"}档案`} />
      <div>
        <h3>
          {title} <i>{sex}</i>
        </h3>
        <p>
          品种：{breed}
          <br />
          档案：平台血统资料
          <br />健康：商家持续更新
        </p>
      </div>
    </div>
  );
}
function Me({ go, user }: { go: (p: Page) => void; user: User | null }) {
  const [summary, setSummary] = useState<any>({ orders: {} });
  const userId = Number(localStorage.getItem("fuchong-user-id") || 1);
  useEffect(() => {
    fetch(`${API_BASE}/api/users/${userId}/summary`)
      .then((response) => response.json())
      .then((data) => data && !data.message && setSummary(data))
      .catch(() => {});
  }, [userId]);
  const orders = [
    ["待付款", String(summary.orders?.pending_payment || 0)],
    ["待确认", String(summary.orders?.pending_confirm || 0)],
    ["待发货", String(summary.orders?.pending_ship || 0)],
    ["待收货", String(summary.orders?.pending_receive || 0)],
    ["售后/退款", String(summary.orders?.after_sale || 0)],
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
          <b>{readLocalCart().length}</b>
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

const careGuides = [
  {
    id: "cat-first-week",
    group: "猫猫",
    title: "幼猫到家 7 日适应表",
    desc: "隔离、猫砂、饮水、睡眠和第一次体检的顺序清单。",
    image: hallByKey("cats").breeds[0].image,
    tone: "奶油安抚",
    minutes: 8,
  },
  {
    id: "dog-social",
    group: "狗狗",
    title: "狗狗社会化训练地图",
    desc: "声音、牵引、陌生人、同类接触，按阶段慢慢打开世界。",
    image: hallByKey("dogs").breeds[5].image,
    tone: "阳光训练",
    minutes: 12,
  },
  {
    id: "bird-home",
    group: "鸟类",
    title: "鸟类笼舍与鸣唱养护",
    desc: "站杆、日照、换羽、互动和安静休息区设计。",
    image: hallByKey("birds").breeds[0].image,
    tone: "羽色日记",
    minutes: 6,
  },
  {
    id: "aqua-water",
    group: "水族",
    title: "水族开缸水质手册",
    desc: "过滤、硝化、温度、换水频率和混养避坑。",
    image: hallByKey("aquatic").breeds[1].image,
    tone: "蓝色水境",
    minutes: 10,
  },
  {
    id: "exotic-safe",
    group: "奇宠",
    title: "奇宠安全温控清单",
    desc: "温湿度、躲避屋、垫材、喂食和观察异常状态。",
    image: hallByKey("exotic").breeds[1].image,
    tone: "特别生命",
    minutes: 9,
  },
  {
    id: "health-archive",
    group: "通用",
    title: "健康档案怎么建",
    desc: "疫苗、驱虫、体重、饮食、声音和成长照片统一记录。",
    image: halls[4].hero,
    tone: "家庭档案",
    minutes: 7,
  },
];

function CareManual({ go }: { go: (p: Page) => void }) {
  const [active, setActive] = useState("全部");
  const groups = ["全部", ...Array.from(new Set(careGuides.map((item) => item.group)))];
  const list = active === "全部" ? careGuides : careGuides.filter((item) => item.group === active);
  return (
    <div className="care-page">
      <div className="subhead">
        <Back onClick={() => go("home")} />
        <div>
          <small>照护地图</small>
          <h2>养宠照护地图</h2>
        </div>
        <button>⌕</button>
      </div>
      <section className="care-hero">
        <div>
          <small>养宠照护手册</small>
          <h1>把“怎么养”做成一张可以翻阅的地图</h1>
          <p>后续接入飞书或后台数据后，每个品种都能拥有自己的喂养、训练、健康和成长图片手册。</p>
        </div>
        <span>
          <b>{careGuides.length}</b>
          篇手册
        </span>
      </section>
      <div className="care-tabs">
        {groups.map((group) => (
          <button key={group} className={active === group ? "on" : ""} onClick={() => setActive(group)}>
            {group}
          </button>
        ))}
      </div>
      <section className="care-mosaic">
        {list.map((guide, index) => (
          <button key={guide.id} className={index % 3 === 0 ? "wide" : ""}>
            <SmartImage src={guide.image} alt={guide.title} />
            <div>
              <small>{guide.group} · {guide.minutes} 分钟</small>
              <h3>{guide.title}</h3>
              <p>{guide.desc}</p>
              <em>{guide.tone}</em>
            </div>
          </button>
        ))}
      </section>
      <section className="care-upload-hint">
        <b>后续数据位</b>
        <p>可接飞书云文档字段：品种、阶段、图片、视频、喂养步骤、禁忌、健康提醒、适用年龄。</p>
      </section>
    </div>
  );
}

function Charity({ go }: { go: (p: Page) => void }) {
  const projects = [
    { icon: "医", title: "生命急救站", text: "为流浪与受伤动物提供紧急检查、治疗和康复支持。", stat: "本月救助 126 只" },
    { icon: "家", title: "回家计划", text: "完成健康评估、性格观察、领养匹配与长期回访。", stat: "持续回访 365 天" },
    { icon: "伴", title: "社区共护", text: "连接医院、救助机构、志愿者和负责任的养宠家庭。", stat: "86 家伙伴同行" },
  ];
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
        {projects.map((project, index) => (
          <article key={project.title} className={index === 0 ? "featured" : ""}>
            <i>{project.icon}</i>
            <div><h3>{project.title}</h3><p>{project.text}</p><b>{project.stat}</b></div>
          </article>
        ))}
      </section>
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
        <div><button onClick={() => go("service")}>联系公益顾问</button><button onClick={() => go("home")}>浏览公益伙伴</button></div>
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
    ensureVisitor();
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
    localStorage.removeItem("fuchong-user-id");
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
        <Hall go={go} hallKey={hallKey} openBreed={openBreed} />
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
              sellerName: order.sellerName,
              source: "order_center",
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

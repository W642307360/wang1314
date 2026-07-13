import { useCallback, useEffect, useState } from "react";
import "./UserModules.css";
import "./Chat.css";

export type User = {
  id: string;
  nickname: string;
  phone: string;
  avatar: string;
  login_method?: string;
};
export type ServiceContext = {
  productId?: number | null;
  breedId?: number | null;
  sellerId?: number | null;
  productName?: string;
  sellerName?: string;
  source?: string;
};
export type Order = {
  id: string;
  databaseId?: number;
  status: string;
  rawStatus?: string;
  petName: string;
  breed: string;
  price: number;
  image: string;
  logisticsPercent?: number;
  logisticsStatus?: string;
  trackingNo?: string;
};
const petImg =
  "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=88";
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: "待付款",
  pending_confirm: "待确认",
  pending_ship: "待发货",
  pending_receive: "待收货",
  completed: "已完成",
  cancelled: "已取消",
  after_sale: "售后",
};

function Header({ title, back }: { title: string; back: () => void }) {
  return (
    <div className="module-head">
      <button onClick={back}>‹</button>
      <div>
        <small>FUCHONG</small>
        <h2>{title}</h2>
      </div>
      <span />
    </div>
  );
}
function Empty({
  icon = "♡",
  title,
  text,
}: {
  icon?: string;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <i>{icon}</i>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function LoginPage({
  back,
  user,
  onLogin,
  onLogout,
}: {
  back: () => void;
  user: User | null;
  onLogin: (u: User) => void;
  onLogout: () => void;
}) {
  const [phone, setPhone] = useState("");
  const doLogin = async (payload: Partial<User> & { login_type: string }) => {
    const r = await fetch("http://127.0.0.1:3001/api/users/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const saved = await r.json();
    localStorage.setItem("fuchong-user-id", String(saved.id));
    onLogin({
      id: String(saved.id),
      nickname: saved.nickname || "福宠新朋友",
      phone: saved.phone || "",
      avatar:
        saved.avatar ||
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
    });
  };
  if (user)
    return (
      <div className="module-page">
        <Header title="账号与登录" back={back} />
        <section className="logged-card">
          <img src={user.avatar} />
          <h2>{user.nickname}</h2>
          <p>{user.phone || "尚未绑定手机号"}</p>
          <button>绑定手机号</button>
          <button className="danger" onClick={onLogout}>
            退出登录
          </button>
        </section>
      </div>
    );
  return (
    <div className="module-page login-page">
      <Header title="登录 / 注册" back={back} />
      <div className="login-brand">
        <b>福</b>
        <h1>欢迎来到福宠</h1>
        <p>登录后同步收藏、订单与宠物成长档案</p>
      </div>
      <button
        className="wechat"
        onClick={() =>
          doLogin({
            nickname: "福宠新朋友",
            phone: "",
            avatar:
              "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
            login_type: "mock_wechat",
          })
        }
      >
        微信一键登录
      </button>
      <div className="divider">或使用手机号</div>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="输入手机号（功能预留）"
      />
      <button
        className="phone-login"
        disabled={phone.length < 11}
        onClick={() =>
          doLogin({
            nickname: `手机用户${phone.slice(-4)}`,
            phone,
            login_type: "phone",
          })
        }
      >
        手机号登录
      </button>
      <small>登录即代表同意《用户协议》和《隐私政策》</small>
    </div>
  );
}

export function CollectionPage({
  mode,
  back,
}: {
  mode: "favorites" | "follows";
  back: () => void;
}) {
  const [tab, setTab] = useState(mode);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [follows, setFollows] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = Number(localStorage.getItem("fuchong-user-id") || 1);
  useEffect(() => {
    setLoading(true);
    fetch(`http://127.0.0.1:3001/api/favorites?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setFavorites(d))
      .catch(() => setFavorites([]))
      .finally(() => setLoading(false));
  }, [userId]);
  useEffect(() => {
    fetch(`http://127.0.0.1:3001/api/follows?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setFollows(d.map((x) => x.seller_name)))
      .catch(() => {});
  }, [userId]);
  const removeFavorite = async (petId: number) => {
    await fetch(
      `http://127.0.0.1:3001/api/favorites/${petId}?user_id=${userId}`,
      { method: "DELETE" },
    ).catch(() => {});
    setFavorites((v) => v.filter((i) => i.pet_id !== petId));
  };
  const removeFollow = async (seller: string) => {
    await fetch(
      `http://127.0.0.1:3001/api/follows?user_id=${userId}&seller_name=${encodeURIComponent(seller)}`,
      { method: "DELETE" },
    ).catch(() => {});
    setFollows((v) => v.filter((x) => x !== seller));
  };
  return (
    <div className="module-page">
      <Header title="宠物家" back={back} />
      <div className="seg">
        <button
          className={tab === "favorites" ? "on" : ""}
          onClick={() => setTab("favorites")}
        >
          收藏宠物
        </button>
        <button
          className={tab === "follows" ? "on" : ""}
          onClick={() => setTab("follows")}
        >
          关注商家
        </button>
      </div>
      {tab === "favorites" ? (
        loading ? (
          <div className="collection-grid">
            {[1, 2, 3, 4].map((x) => (
              <article className="pet-skeleton" key={x} />
            ))}
          </div>
        ) : favorites.length ? (
          <div className="collection-grid">
            {favorites.map((x) => (
              <article key={x.id}>
                <img src={x.image || petImg} loading="lazy" decoding="async" />
                <button
                  onClick={() =>
                    confirm("确定取消收藏吗？") && removeFavorite(x.pet_id)
                  }
                >
                  ♥
                </button>
                <h3>{x.name}</h3>
                <p>
                  {x.breed} · {x.age_months || 3}个月 ·{" "}
                  {x.health_status || "健康认证"}
                </p>
                <b>¥ {x.price}</b>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="还没有收藏宠物" text="去市场遇见心动的生命伙伴" />
        )
      ) : follows.length ? (
        <div className="seller-list">
          {follows.map((x) => (
            <article key={x}>
              <div className="seller-logo">宠</div>
              <div>
                <h3>{x}</h3>
                <p>实名认证 · 健康保障 · 评分 5.0</p>
              </div>
              <button
                onClick={() => confirm("确定取消关注吗？") && removeFollow(x)}
              >
                已关注
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="还没有关注商家" text="关注后及时了解新宠动态" />
      )}
    </div>
  );
}

export function FootprintsPage({ back }: { back: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const userId = Number(localStorage.getItem("fuchong-user-id") || 1);
  useEffect(() => {
    fetch(`http://127.0.0.1:3001/api/footprints?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setItems(d))
      .catch(() => {});
  }, [userId]);
  const clear = async () => {
    await fetch(`http://127.0.0.1:3001/api/footprints?user_id=${userId}`, {
      method: "DELETE",
    });
    setItems([]);
  };
  const remove = async (id: number) => {
    await fetch(
      `http://127.0.0.1:3001/api/footprints/${id}?user_id=${userId}`,
      { method: "DELETE" },
    );
    setItems((v) => v.filter((x) => x.id !== id));
  };
  return (
    <div className="module-page">
      <Header title="浏览足迹" back={back} />
      <div className="list-tools">
        <b>今天</b>
        <button onClick={() => confirm("清空全部浏览记录？") && clear()}>
          清空
        </button>
      </div>
      {items.length ? (
        <div className="foot-grid">
          {items.map((x) => (
            <article key={x.id}>
              <img src={petImg} />
              <div>
                <h3>{x.name}</h3>
                <p>{new Date(x.viewed_at).toLocaleString()}</p>
                <b>¥ {x.price}</b>
              </div>
              <button onClick={() => remove(x.id)}>×</button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon="◷"
          title="暂无浏览足迹"
          text="浏览过的宠物会按日期保存在这里"
        />
      )}
    </div>
  );
}

export function AddressesPage({ back }: { back: () => void }) {
  type AddressItem = {
    id: number;
    name: string;
    phone: string;
    province?: string;
    city?: string;
    district?: string;
    detail: string;
    is_default: number;
  };
  const emptyForm = {
    name: "",
    phone: "",
    region: "",
    detail: "",
    isDefault: false,
  };
  const [items, setItems] = useState<AddressItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const userId = Number(localStorage.getItem("fuchong-user-id") || 1);
  const load = useCallback(() =>
    fetch(`http://127.0.0.1:3001/api/addresses?user_id=${userId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || "地址加载失败");
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "地址加载失败")), [userId]);
  useEffect(() => {
    load();
  }, [load]);
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setEditing(true);
  };
  const openEdit = (item: AddressItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      phone: item.phone,
      region: [item.province, item.city, item.district].filter(Boolean).join(" "),
      detail: item.detail,
      isDefault: Boolean(item.is_default),
    });
    setError("");
    setEditing(true);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `http://127.0.0.1:3001/api/addresses${editingId ? `/${editingId}` : ""}`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            name: form.name.trim(),
            phone: form.phone.trim(),
            province: form.region.trim(),
            detail: form.detail.trim(),
            is_default: form.isDefault,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "地址保存失败");
      await load();
      setEditing(false);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "地址保存失败");
    } finally {
      setSaving(false);
    }
  };
  const remove = async (item: AddressItem) => {
    if (!confirm("删除该地址？")) return;
    const response = await fetch(
      `http://127.0.0.1:3001/api/addresses/${item.id}?user_id=${userId}`,
      { method: "DELETE" },
    );
    const result = await response.json();
    if (!response.ok) return setError(result.message || "删除失败");
    setItems((current) => current.filter((address) => address.id !== item.id));
  };
  return (
    <div className="module-page">
      <Header title="收货地址" back={back} />
      {editing ? (
        <form className="address-form" onSubmit={save}>
          <h3>{editingId ? "编辑收货地址" : "新增收货地址"}</h3>
          <input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} required placeholder="收货人" />
          <input inputMode="tel" maxLength={11} value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value.replace(/\D/g, "") }))} required placeholder="11位手机号" />
          <input value={form.region} onChange={(e) => setForm((v) => ({ ...v, region: e.target.value }))} required placeholder="省 / 市 / 区" />
          <textarea value={form.detail} onChange={(e) => setForm((v) => ({ ...v, detail: e.target.value }))} required placeholder="街道、门牌号等详细地址" />
          <label>
            <input checked={form.isDefault} onChange={(e) => setForm((v) => ({ ...v, isDefault: e.target.checked }))} type="checkbox" /> 设为默认地址
          </label>
          {error && <p className="form-error">{error}</p>}
          <button disabled={saving}>{saving ? "保存中…" : "保存地址"}</button>
          <button className="form-cancel" type="button" onClick={() => setEditing(false)}>取消</button>
        </form>
      ) : (
        <>
          {items.length ? (
            items.map((a) => (
              <article className="address-card" key={a.id}>
                <b>
                  {a.name}　{a.phone}
                </b>
                <p>{[a.province, a.city, a.district, a.detail].filter(Boolean).join(" ")}</p>
                <small>{a.is_default ? "默认地址" : "普通地址"}</small>
                <div>
                  <button onClick={() => openEdit(a)}>编辑</button>
                  <button onClick={() => remove(a)}>删除</button>
                </div>
              </article>
            ))
          ) : (
            <Empty
              icon="⌖"
              title="暂无收货地址"
              text="添加地址后可用于订单配送"
            />
          )}
          {error && <p className="address-error">{error}</p>}
          <button className="fixed-primary" onClick={openCreate}>
            ＋ 新增收货地址
          </button>
        </>
      )}
    </div>
  );
}

export function CouponsPage({ back }: { back: () => void }) {
  const [tab, setTab] = useState("available");
  return (
    <div className="module-page">
      <Header title="我的优惠券" back={back} />
      <div className="seg">
        <button
          className={tab === "available" ? "on" : ""}
          onClick={() => setTab("available")}
        >
          可使用 3
        </button>
        <button
          className={tab === "used" ? "on" : ""}
          onClick={() => setTab("used")}
        >
          已使用
        </button>
        <button
          className={tab === "expired" ? "on" : ""}
          onClick={() => setTab("expired")}
        >
          已过期
        </button>
      </div>
      {tab === "available" ? (
        <div className="coupon-list">
          {[
            [300, "新人专享"],
            [500, "宠物到家礼"],
            [1000, "安心购补贴"],
          ].map(([n, t]) => (
            <article key={t}>
              <strong>¥{n}</strong>
              <div>
                <h3>{t}</h3>
                <p>满 ¥5000 可用 · 全平台宠物</p>
                <small>有效期至 2026-12-31</small>
              </div>
              <button>去使用</button>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon="⌑" title="暂无优惠券" text="这里暂时空空的" />
      )}
    </div>
  );
}

export function OrdersPage({ back }: { back: () => void }) {
  const tabs = [
    "全部",
    "待付款",
    "待确认",
    "待发货",
    "待收货",
    "已完成",
    "已取消",
    "售后",
  ];
  const [tab, setTab] = useState("全部");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = Number(localStorage.getItem("fuchong-user-id") || 1);
  const cancelOrder = async (order: Order) => {
    if (!order.databaseId || !window.confirm("确认取消这个订单吗？")) return;
    const response = await fetch(
      `http://127.0.0.1:3001/api/orders/${order.databaseId}/cancel`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      },
    );
    const result = await response.json();
    if (!response.ok) return window.alert(result.message || "取消失败");
    setOrders((current) =>
      current.map((item) =>
        item.databaseId === order.databaseId
          ? { ...item, status: "已取消", rawStatus: "cancelled" }
          : item,
      ),
    );
  };
  useEffect(() => {
    fetch(`http://127.0.0.1:3001/api/orders?user_id=${userId}`)
      .then((r) => r.json())
      .then(
        (d) =>
          Array.isArray(d) &&
          setOrders(
            d.map((o) => {
              let pet: any = {};
              try {
                pet = JSON.parse(o.pet_snapshot || "{}");
              } catch {}
              return {
                id: o.order_no,
                databaseId: o.id,
                status: ORDER_STATUS_LABEL[o.status] || o.status,
                rawStatus: o.status,
                petName: pet.name || "宠物订单",
                breed: pet.breed || "宠物档案",
                price: o.total_amount,
                image: pet.images?.[0]?.url || petImg,
                logisticsPercent: Number(o.logistics_percent || 0),
                logisticsStatus: o.logistics_status,
                trackingNo: o.tracking_no,
              };
            }),
          ),
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);
  const visible =
    tab === "全部" ? orders : orders.filter((o) => o.status === tab);
  return (
    <div className="module-page">
      <Header title="我的订单" back={back} />
      <div className="order-tabs">
        {tabs.map((t) => (
          <button
            key={t}
            className={tab === t ? "on" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="module-loading">订单加载中…</div>
      ) : visible.length ? (
        <div className="orders">
          {visible.map((o) => (
            <article key={o.id}>
              <header>
                <span>汪星宠物馆 ›</span>
                <b>{o.status}</b>
              </header>
              <div>
                <img src={o.image} />
                <p>
                  <strong>{o.petName}</strong>
                  <small>{o.breed}</small>
                  <em>健康档案完整 · 平台保障</em>
                </p>
                <b>¥{o.price}</b>
              </div>
              {(o.logisticsPercent || 0) > 0 && (
                <div className="order-logistics">
                  <span>
                    物流进度 {o.logisticsPercent}%
                    {o.trackingNo ? ` · ${o.trackingNo}` : ""}
                  </span>
                  <i>
                    <b style={{ width: `${o.logisticsPercent}%` }} />
                  </i>
                </div>
              )}
              <footer>
                <small>订单号 {o.id}</small>
                <button>联系商家</button>
                <button
                  onClick={() =>
                    ["pending_payment", "pending_confirm"].includes(o.rawStatus || "")
                      ? cancelOrder(o)
                      : undefined
                  }
                >
                  {["pending_payment", "pending_confirm"].includes(o.rawStatus || "")
                    ? "取消订单"
                    : "再次购买"}
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon="▣"
          title={`暂无${tab}订单`}
          text="每一次相遇，都值得安心守护"
        />
      )}
    </div>
  );
}

export function MessagesPage({
  back,
  context,
}: {
  back: () => void;
  context?: ServiceContext | null;
}) {
  const userId = Number(localStorage.getItem("fuchong-user-id") || 1);
  const [chat, setChat] = useState([
    {
      id: 1,
      sender: "service",
      content: context?.productName
        ? `您好，我是福宠 AI 客服，正在为您查看「${context.productName}」。`
        : "您好，我是福宠专属客服，请问有什么可以帮助您？",
    },
  ]);
  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [humanPending, setHumanPending] = useState(false);
  const send = async (override?: string) => {
    const value = (override ?? text).trim();
    if (!value) return sessionId;
    setChat((v) => [...v, { id: Date.now(), sender: "user", content: value }]);
    if (!override) setText("");
    try {
      await fetch("http://127.0.0.1:3001/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          sender: "user",
          content: value,
          session_id: sessionId,
          product_id: context?.productId || null,
          product_name: context?.productName || "",
          seller_name: context?.sellerName || "福宠认证宠物馆",
          source: context?.source || "message_center",
        }),
      });
      const r = await fetch(
        `http://127.0.0.1:3001/api/messages?user_id=${userId}`,
      );
      const messages = await r.json();
      if (Array.isArray(messages)) {
        const latestSession = messages[messages.length - 1]?.session_id;
        if (latestSession) setSessionId(latestSession);
        setChat(
          messages
            .filter((m) => !latestSession || m.session_id === latestSession)
            .map((m) => ({
              id: m.id,
              sender: m.sender,
              content: m.content,
            })),
        );
        return latestSession || sessionId;
      }
    } catch {
      setChat((v) => [
        ...v,
        {
          id: Date.now() + 2,
          sender: "service",
          content: "网络暂时不可用，请稍后重试。",
        },
      ]);
    }
    return sessionId;
  };
  const handoff = async () => {
    const sid = sessionId || (await send("需要转人工客服"));
    if (!sid) return;
    await fetch(
      `http://127.0.0.1:3001/api/customer-service/sessions/${sid}/handoff`,
      { method: "POST" },
    ).catch(() => {});
    setHumanPending(true);
    setChat((v) => [
      ...v,
      {
        id: Date.now() + 3,
        sender: "service",
        content: "已为您转入人工客服队列，后台客服会看到商品和聊天记录。",
      },
    ]);
  };
  return (
    <div className="module-page">
      <Header title={context?.sellerName || "专属客服"} back={back} />
      <div className="chat-status">
        <i />
        {context?.productName || "福宠客服在线"}{" "}
        <span>{humanPending ? "人工排队中" : "AI 即时回复 · 可转人工"}</span>
      </div>
      <div className="chat-window">
        {chat.map((m) => (
          <div key={m.id} className={`chat-bubble ${m.sender}`}>
            <i>{m.sender === "service" ? "福" : "我"}</i>
            <p>{m.content}</p>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="输入咨询内容…"
        />
        <button onClick={handoff}>转人工</button>
        <button onClick={() => send()}>发送</button>
      </div>
    </div>
  );
}

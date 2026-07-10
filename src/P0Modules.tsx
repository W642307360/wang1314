import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ServiceContext, User } from "./UserModules";

type FavoritePet = {
  id: number;
  pet_id: number;
  name?: string;
  breed?: string;
  breed_id?: number | null;
  seller_id?: number | null;
  gender?: string;
  age_months?: number;
  price?: number;
  image?: string;
  product_status?: string;
  pet_status?: string;
  created_at?: string;
  seller_name?: string;
};

export type CartPet = {
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

type ChatMessage = {
  id: number;
  sender: string;
  content: string;
  session_id?: number;
  product_id?: number | null;
  product_name?: string;
  service_type?: string;
  created_at?: string;
};

const API_BASE = "http://127.0.0.1:3001";
const CART_KEY = "fuchong-cart";
const fallbackImg =
  "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=88";

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

const maskPhone = (phone?: string) =>
  phone && phone.length >= 7
    ? `${phone.slice(0, 3)}****${phone.slice(-4)}`
    : "未绑定手机号";

const loginMethodText = (value?: string) =>
  value === "phone" ? "手机号登录" : value ? "微信登录" : "游客状态";

const statusText = (status?: string) =>
  status === "sold"
    ? "已售出"
    : status === "offline"
      ? "商品已下架"
      : status === "missing"
        ? "商品不存在"
        : "正常销售";

const readCart = (): CartPet[] => {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
};

const writeCart = (items: CartPet[]) => {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("fuchong-cart-change"));
};

export function P0LoginPage({
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
  const saveLogin = async (payload: Partial<User> & { login_type: string }) => {
    const response = await fetch(`${API_BASE}/api/users/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("login failed");
    const saved = await response.json();
    localStorage.setItem("fuchong-user-id", String(saved.id));
    const next = {
      id: String(saved.id),
      nickname: saved.nickname || payload.nickname || "福宠用户",
      phone: saved.phone || payload.phone || "",
      avatar:
        saved.avatar ||
        payload.avatar ||
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
      login_method: saved.login_method || payload.login_type,
    };
    localStorage.setItem("fuchong-user", JSON.stringify(next));
    onLogin(next);
    return next;
  };
  const bindPhone = async () => {
    const mockPhone = `138${String(Date.now()).slice(-8)}`;
    await saveLogin({
      nickname: user?.nickname || "福宠用户",
      avatar: user?.avatar,
      phone: mockPhone,
      login_type: "mock_wechat_phone",
    });
    alert(`手机号授权绑定成功：${maskPhone(mockPhone)}`);
  };
  const linkAuth = async (type: "wechat" | "phone") => {
    try {
      await saveLogin({
        nickname: user?.nickname || (type === "wechat" ? "微信关联用户" : "手机号关联用户"),
        avatar: user?.avatar,
        phone:
          type === "phone"
            ? user?.phone || `139${String(Date.now()).slice(-8)}`
            : user?.phone,
        login_type: type === "phone" ? "phone" : "mock_wechat",
      });
      alert(type === "wechat" ? "关联微信成功" : "关联手机号成功");
    } catch (error) {
      alert(`关联失败：${error instanceof Error ? error.message : "请稍后重试"}`);
    }
  };
  if (user) {
    return (
      <div className="module-page">
        <Header title="账号与登录" back={back} />
        <section className="logged-card">
          <img src={user.avatar} />
          <h2>{user.nickname}</h2>
          <small>登录方式：{loginMethodText(user.login_method)}</small>
          <p>{maskPhone(user.phone)}</p>
          <button onClick={bindPhone}>微信授权绑定手机号</button>
          <button onClick={() => linkAuth("wechat")}>关联微信</button>
          <button onClick={() => linkAuth("phone")}>关联手机号</button>
          <button className="danger" onClick={onLogout}>
            退出登录
          </button>
        </section>
      </div>
    );
  }
  return (
    <div className="module-page login-page">
      <Header title="登录 / 注册" back={back} />
      <div className="login-brand">
        <b>福</b>
        <h1>欢迎来到福宠</h1>
        <p>登录后同步收藏、订单、客服和宠物档案</p>
      </div>
      <button
        className="wechat"
        onClick={() =>
          saveLogin({
            nickname: "福宠新朋友",
            phone: "",
            login_type: "mock_wechat",
          })
        }
      >
        微信一键登录
      </button>
      <div className="divider">或使用手机号预留入口</div>
      <input
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="输入手机号"
      />
      <button
        className="phone-login"
        disabled={phone.length < 11}
        onClick={() =>
          saveLogin({
            nickname: `手机用户${phone.slice(-4)}`,
            phone,
            login_type: "phone",
          })
        }
      >
        手机号登录
      </button>
    </div>
  );
}

export function P0CollectionPage({
  mode,
  back,
  onOpenPet,
}: {
  mode: "favorites" | "cart";
  back: () => void;
  onOpenPet: (pet: FavoritePet | CartPet) => void;
}) {
  const [tab, setTab] = useState<"favorites" | "cart">(mode);
  const [favorites, setFavorites] = useState<FavoritePet[]>([]);
  const [cart, setCart] = useState<CartPet[]>(() => readCart());
  const [loading, setLoading] = useState(true);
  const userId = Number(localStorage.getItem("fuchong-user-id") || 1);
  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/favorites?user_id=${userId}`)
      .then((response) => response.json())
      .then((data) => setFavorites(Array.isArray(data) ? data : []))
      .catch(() => setFavorites([]))
      .finally(() => setLoading(false));
  }, [userId]);
  useEffect(() => {
    const refresh = () => setCart(readCart());
    window.addEventListener("fuchong-cart-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("fuchong-cart-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const removeFavorite = async (petId: number) => {
    await fetch(`${API_BASE}/api/favorites/${petId}?user_id=${userId}`, {
      method: "DELETE",
    }).catch(() => {});
    setFavorites((items) => items.filter((item) => item.pet_id !== petId));
  };
  const removeCart = (cartId: string) => {
    const next = cart.filter((item) => item.cart_id !== cartId);
    setCart(next);
    writeCart(next);
  };
  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price || 0), 0),
    [cart],
  );
  return (
    <div className="module-page">
      <Header title="宠物家" back={back} />
      <div className="seg">
        <button className={tab === "favorites" ? "on" : ""} onClick={() => setTab("favorites")}>
          收藏宠物
        </button>
        <button className={tab === "cart" ? "on" : ""} onClick={() => setTab("cart")}>
          购物车
        </button>
      </div>
      {tab === "favorites" ? (
        loading ? (
          <div className="collection-grid">
            {[1, 2, 3, 4].map((item) => (
              <article className="pet-skeleton" key={item} />
            ))}
          </div>
        ) : favorites.length ? (
          <div className="collection-grid">
            {favorites.map((pet) => (
              <article
                key={pet.id}
                className={`favorite-card status-${pet.product_status || "available"}`}
              >
                <button
                  className="favorite-open"
                  onClick={() =>
                    pet.product_status === "missing"
                      ? alert("商品不存在，已保留收藏记录，可返回市场查看类似宠物")
                      : onOpenPet(pet)
                  }
                >
                  <span className="collection-photo">
                    <img src={pet.image || fallbackImg} loading="lazy" decoding="async" />
                  </span>
                  <em>{statusText(pet.product_status)}</em>
                </button>
                <button
                  className="favorite-remove"
                  onClick={() => confirm("确定取消收藏吗？") && removeFavorite(pet.pet_id)}
                >
                  ♥
                </button>
                <h3>{pet.name || "商品不存在"}</h3>
                <p>
                  {pet.breed || "未知品种"} · {pet.age_months || "-"}个月 ·{" "}
                  {pet.gender || "待确认"}
                </p>
                <small>收藏时间：{String(pet.created_at || "").slice(0, 10)}</small>
                <b>{pet.price ? `¥ ${pet.price}` : "推荐类似宠物"}</b>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <i>♡</i>
            <h3>还没有收藏宠物</h3>
            <p>去市场遇见心动的生命伙伴</p>
          </div>
        )
      ) : cart.length ? (
        <>
          <div className="cart-summary">
            <span>共 {cart.length} 只宠物</span>
            <b>合计 ¥{cartTotal}</b>
          </div>
          <div className="collection-grid cart-grid">
            {cart.map((pet) => (
              <article key={pet.cart_id} className="favorite-card cart-card">
                <button className="favorite-open" onClick={() => onOpenPet(pet)}>
                  <span className="collection-photo">
                    <img src={pet.image || fallbackImg} loading="lazy" decoding="async" />
                  </span>
                  <em>购物车</em>
                </button>
                <button
                  className="favorite-remove"
                  onClick={() => confirm("确定移出购物车吗？") && removeCart(pet.cart_id)}
                >
                  ×
                </button>
                <h3>{pet.name}</h3>
                <p>
                  {pet.breed} · {pet.age_months || "-"}个月 · {pet.gender || "待确认"}
                </p>
                <small>加入时间：{String(pet.added_at || "").slice(0, 10)}</small>
                <b>¥ {pet.price}</b>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="empty">
          <i>🛒</i>
          <h3>购物车还是空的</h3>
          <p>进入宠物详情页，可以把多个心仪宠物加入购物车</p>
        </div>
      )}
    </div>
  );
}

export function P0MessagesPage({
  back,
  context,
  onOpenProduct,
}: {
  back: () => void;
  context?: ServiceContext | null;
  onOpenProduct?: (petId: number, productName?: string) => void;
}) {
  const userId = Number(localStorage.getItem("fuchong-user-id") || 1);
  const serviceTypes = [
    ["购买咨询", "了解价格、健康、疫苗和购买流程"],
    ["订单咨询", "查询订单、支付和确认信息"],
    ["售后服务", "退款、售后和投诉处理"],
    ["宠物健康咨询", "咨询喂养、疫苗和到家适应"],
    ["物流帮助", "发货、运输和到家时间"],
  ] as const;
  const [activeType, setActiveType] = useState<string | null>(
    context?.productName ? "购买咨询" : null,
  );
  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [humanPending, setHumanPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [failedText, setFailedText] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      id: 1,
      sender: "service",
      content: context?.productName
        ? `您好，正在为您连接「${context.productName}」的购买咨询。`
        : "请选择需要咨询的服务类型。",
    },
  ]);
  const loadHistory = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/messages?user_id=${userId}`);
      const messages = await response.json();
      if (Array.isArray(messages)) {
        setHistory(messages.slice(-30).reverse());
      }
    } catch {
      setHistory([]);
    }
  };
  useEffect(() => {
    loadHistory();
  }, [userId]);
  useEffect(() => {
    if (context?.productName) setActiveType("购买咨询");
  }, [context?.productName]);
  const openType = (type: string) => {
    setActiveType(type);
    setFailedText("");
    setChat([
      {
        id: Date.now(),
        sender: "service",
        content: context?.productName
          ? `已进入${type}，当前宠物：${context.productName}。您可以直接发送问题。`
          : `已进入${type}，请描述您遇到的问题。`,
      },
    ]);
  };
  const continueSession = async (message: ChatMessage) => {
    if (message.session_id) setSessionId(message.session_id);
    setActiveType(message.service_type || "购买咨询");
    try {
      const response = await fetch(`${API_BASE}/api/messages?session_id=${message.session_id}`);
      const messages = await response.json();
      setChat(
        Array.isArray(messages)
          ? messages.map((item) => ({
              id: item.id,
              sender: item.sender,
              content: item.content,
              session_id: item.session_id,
              product_id: item.product_id,
              product_name: item.product_name,
              service_type: item.service_type,
            }))
          : [],
      );
    } catch {
      setChat([{ id: Date.now(), sender: "service", content: "历史记录加载失败，请重新发送。" }]);
    }
  };
  const send = async (override?: string) => {
    const value = (override ?? text).trim();
    if (!value || sending) return sessionId;
    setSending(true);
    setFailedText("");
    setChat((items) => [...items, { id: Date.now(), sender: "user", content: value }]);
    if (!override) setText("");
    try {
      const response = await fetch(`${API_BASE}/api/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          sender: "user",
          content: value,
          session_id: sessionId,
          product_id: context?.productId || null,
          product_name: context?.productName || "",
          seller_id: context?.sellerId || null,
          seller_name: context?.sellerName || "福宠认证宠物馆",
          source: context?.source || "message_center",
          service_type: activeType || "购买咨询",
        }),
      });
      if (!response.ok) throw new Error("send failed");
      const saved = await response.json();
      if (saved.session_id) setSessionId(saved.session_id);
      setChat((items) => [
        ...items,
        {
          id: Date.now() + 1,
          sender: "service",
          content: saved.reply || "已收到，客服稍后回复您。",
          session_id: saved.session_id,
        },
      ]);
      loadHistory();
      return saved.session_id || sessionId;
    } catch {
      setFailedText(value);
      setChat((items) => [
        ...items,
        { id: Date.now() + 2, sender: "service", content: "发送失败，请重新发送。" },
      ]);
    } finally {
      setSending(false);
    }
    return sessionId;
  };
  const handoff = async () => {
    const sid = sessionId || (await send("需要转人工客服"));
    if (!sid) return;
    await fetch(`${API_BASE}/api/customer-service/sessions/${sid}/handoff`, {
      method: "POST",
    }).catch(() => {});
    setHumanPending(true);
    setChat((items) => [
      ...items,
      { id: Date.now() + 3, sender: "service", content: "已为您转入人工客服队列。" },
    ]);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };
  return (
    <div className="module-page service-center">
      <Header title="客服中心" back={back} />
      <section className="service-context-card">
        <small>ONLINE SERVICE</small>
        <h2>{context?.sellerName || "福宠专业客服"}</h2>
        <p>{context?.productName ? `当前宠物：${context.productName}` : "选择服务类型后即可发起咨询"}</p>
      </section>
      <section className="service-type-list">
        {serviceTypes.map(([title, desc]) => (
          <button key={title} onClick={() => openType(title)}>
            <i>♧</i>
            <span>
              <b>{title}</b>
              <small>{desc}</small>
            </span>
            <em>›</em>
          </button>
        ))}
      </section>
      <section className="service-history">
        <button onClick={() => setShowHistory((value) => !value)}>
          <b>购买咨询记录</b>
          <span>{history.length} 条 ›</span>
        </button>
        {showHistory && (
          <div>
            {history.slice(0, 6).map((item) => (
              <article key={item.id} className="service-history-item">
                <button
                  className="service-history-pet"
                  disabled={!item.product_id}
                  onClick={() => item.product_id && onOpenProduct?.(item.product_id, item.product_name)}
                >
                  宠
                </button>
                <button className="service-history-main" onClick={() => continueSession(item)}>
                  <strong>{item.product_name || item.service_type || "客服咨询"}</strong>
                  <small>{item.content}</small>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      {activeType && (
        <div className="service-sheet-mask" onClick={() => setActiveType(null)}>
          <section className="service-sheet" onClick={(event) => event.stopPropagation()}>
            <i />
            <header>
              <div>
                <small>{humanPending ? "人工排队中" : "AI 即时回复 · 可转人工"}</small>
                <h2>{activeType}</h2>
                <p>{context?.productName ? `当前宠物：${context.productName}` : "未关联具体宠物"}</p>
              </div>
              <button onClick={() => setActiveType(null)}>×</button>
            </header>
            <div className="chat-window sheet-chat">
              {chat.map((message) => (
                <div key={message.id} className={`chat-bubble ${message.sender}`}>
                  <i>{message.sender === "service" ? "福" : "我"}</i>
                  <p>{message.content}</p>
                </div>
              ))}
              {failedText && (
                <button className="retry-send" onClick={() => send(failedText)}>
                  重新发送
                </button>
              )}
            </div>
            <form className="sheet-input" onSubmit={onSubmit}>
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="输入咨询内容…"
              />
              <button type="button" onClick={handoff}>
                转人工
              </button>
              <button disabled={sending}>{sending ? "发送中" : "发送"}</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
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

const API_BASE = "http://127.0.0.1:3001";
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
        phone: type === "phone" ? user?.phone || `139${String(Date.now()).slice(-8)}` : user?.phone,
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
  mode: "favorites" | "follows";
  back: () => void;
  onOpenPet: (pet: FavoritePet) => void;
}) {
  const [tab, setTab] = useState(mode);
  const [favorites, setFavorites] = useState<FavoritePet[]>([]);
  const [follows, setFollows] = useState<string[]>([]);
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
    fetch(`${API_BASE}/api/follows?user_id=${userId}`)
      .then((response) => response.json())
      .then((data) =>
        setFollows(Array.isArray(data) ? data.map((item) => item.seller_name) : []),
      )
      .catch(() => setFollows([]));
  }, [userId]);
  const removeFavorite = async (petId: number) => {
    await fetch(`${API_BASE}/api/favorites/${petId}?user_id=${userId}`, {
      method: "DELETE",
    }).catch(() => {});
    setFavorites((items) => items.filter((item) => item.pet_id !== petId));
  };
  const removeFollow = async (seller: string) => {
    await fetch(
      `${API_BASE}/api/follows?user_id=${userId}&seller_name=${encodeURIComponent(seller)}`,
      { method: "DELETE" },
    ).catch(() => {});
    setFollows((items) => items.filter((item) => item !== seller));
  };
  return (
    <div className="module-page">
      <Header title="宠物家" back={back} />
      <div className="seg">
        <button className={tab === "favorites" ? "on" : ""} onClick={() => setTab("favorites")}>
          收藏宠物
        </button>
        <button className={tab === "follows" ? "on" : ""} onClick={() => setTab("follows")}>
          关注商家
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
      ) : follows.length ? (
        <div className="seller-list">
          {follows.map((seller) => (
            <article key={seller}>
              <div className="seller-logo">宠</div>
              <div>
                <h3>{seller}</h3>
                <p>实名认证 · 健康保障 · 评分 5.0</p>
              </div>
              <button onClick={() => confirm("确定取消关注吗？") && removeFollow(seller)}>
                已关注
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <i>♡</i>
          <h3>还没有关注商家</h3>
          <p>关注后及时了解新宠动态</p>
        </div>
      )}
    </div>
  );
}

export function P0MessagesPage({
  back,
  context,
}: {
  back: () => void;
  context?: ServiceContext | null;
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
  const [chat, setChat] = useState([
    {
      id: 1,
      sender: "service",
      content: context?.productName
        ? `您好，正在为您连接「${context.productName}」的购买咨询。`
        : "请选择需要咨询的服务类型。",
    },
  ]);
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
        },
      ]);
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

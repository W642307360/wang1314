import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ServiceContext, User } from "./UserModules";
import {
  currentCartUserId,
  loadCartFromServer,
  mergeCartToServer,
  readCart,
  writeCart,
  type StoredCartPet,
} from "./cartStore";
import { publishUserId, useUserId } from "./userIdentity";
import { mediaUrl } from "./mediaUrl";

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
  showcase_image?: string;
  product_status?: string;
  pet_status?: string;
  created_at?: string;
  seller_name?: string;
};

export type CartPet = StoredCartPet;

type ChatMessage = {
  id: number;
  sender: string;
  content: string;
  session_id?: number;
  product_id?: number | null;
  product_name?: string;
  product_image?: string;
  product_breed?: string;
  product_price?: number;
  type?: string;
  service_type?: string;
  created_at?: string;
};

type ServiceOrder = {
  id: number;
  orderNo: string;
  status: string;
  total: number;
  productId?: number;
  productName: string;
  productImage?: string;
  productBreed?: string;
  logisticsStatus?: string;
  trackingNo?: string;
};

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? "" : "http://127.0.0.1:3001");
const fallbackImg =
  "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=88";
const displayMedia = (url?: string) => mediaUrl(url) || fallbackImg;

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
    : "手机号信息未同步";

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
  const [nickname, setNickname] = useState(user?.nickname || "");
  const [profileMessage, setProfileMessage] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  useEffect(() => {
    setNickname(user?.nickname || "");
  }, [user?.nickname]);
  const saveLogin = async (payload: Partial<User> & { login_type: string }) => {
    const previousUserId = currentCartUserId();
    const previousCart = readCart(previousUserId);
    const response = await fetch(`${API_BASE}/api/users/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, previous_user_id: previousUserId }),
    });
    if (!response.ok) throw new Error("login failed");
    const saved = await response.json();
    publishUserId(Number(saved.id));
    const next = {
      id: String(saved.id),
      nickname: saved.nickname || payload.nickname || "福宠用户",
      phone: saved.phone || payload.phone || "",
      avatar: saved.avatar && !String(saved.avatar).includes("photo-1494790108377") ? saved.avatar : "",
      login_method: saved.login_method || payload.login_type,
    };
    localStorage.setItem("fuchong-user", JSON.stringify(next));
    await mergeCartToServer(Number(saved.id), previousCart).catch(() => {});
    onLogin(next);
    return next;
  };
  const saveProfile = async () => {
    if (!user) return;
    setProfileMessage("");
    const response = await fetch(`${API_BASE}/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: Number(user.id), nickname }),
    });
    const saved = await response.json();
    if (!response.ok) return setProfileMessage(saved.message || "资料保存失败");
    const next = { ...user, nickname: saved.nickname };
    localStorage.setItem("fuchong-user", JSON.stringify(next));
    onLogin(next);
    setProfileMessage("资料已保存");
  };
  if (user) {
    const realAvatar = user.avatar && !user.avatar.includes("photo-1494790108377");
    return (
      <div className="module-page">
        <Header title="账号与登录" back={back} />
        <section className="logged-card">
          {realAvatar ? <img src={user.avatar} alt={user.nickname} /> : <div className="profile-initial">{user.nickname.slice(0, 1)}</div>}
          <h2>{user.nickname}</h2>
          <small>登录方式：{loginMethodText(user.login_method)}</small>
          <p>{maskPhone(user.phone)}</p>
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="昵称" />
          <button onClick={saveProfile}>保存用户资料</button>
          {profileMessage && <em>{profileMessage}</em>}
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
      <input
        value={phone}
        onChange={(event) => { setPhone(event.target.value.replace(/\D/g, "").slice(0, 11)); setLoginMessage(""); }}
        placeholder="输入本人手机号"
        inputMode="numeric"
      />
      <button
        className="wechat"
        disabled={!/^1\d{10}$/.test(phone)}
        onClick={() => {
          if (!/^1\d{10}$/.test(phone)) return setLoginMessage("请输入正确的11位手机号");
          void saveLogin({
            nickname: "福宠新朋友",
            phone,
            login_type: "mock_wechat",
          }).catch(() => setLoginMessage("登录失败，请稍后重试"));
        }}
      >
        微信手机号一键登录
      </button>
      <div className="divider">或使用手机号登录</div>
      <button
        className="phone-login"
        disabled={!/^1\d{10}$/.test(phone)}
        onClick={() => {
          if (!/^1\d{10}$/.test(phone)) return setLoginMessage("请输入正确的11位手机号");
          void saveLogin({
            nickname: `手机用户${phone.slice(-4)}`,
            phone,
            login_type: "phone",
          }).catch(() => setLoginMessage("登录失败，请稍后重试"));
        }}
      >
        手机号登录
      </button>
      {loginMessage && <p className="login-message">{loginMessage}</p>}
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
  const userId = useUserId();
  useEffect(() => {
    const loadFavorites = () => {
      setLoading(true);
      fetch(`${API_BASE}/api/favorites?user_id=${userId}`)
        .then((response) => response.json())
        .then((data) => setFavorites(Array.isArray(data) ? data : []))
        .catch(() => setFavorites([]))
        .finally(() => setLoading(false));
    };
    loadFavorites();
    window.addEventListener("fuchong-favorites-change", loadFavorites);
    return () => window.removeEventListener("fuchong-favorites-change", loadFavorites);
  }, [userId]);
  useEffect(() => {
    loadCartFromServer(userId).then(setCart).catch(() => setCart(readCart(userId)));
    const refresh = () => setCart(readCart(userId));
    window.addEventListener("fuchong-cart-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("fuchong-cart-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userId]);
  const removeFavorite = async (petId: number) => {
    await fetch(`${API_BASE}/api/favorites/${petId}?user_id=${userId}`, {
      method: "DELETE",
    }).catch(() => {});
    setFavorites((items) => items.filter((item) => item.pet_id !== petId));
    window.dispatchEvent(new Event("fuchong-favorites-change"));
  };
  const removeCart = (pet: CartPet) => {
    const next = cart.filter((item) => item.cart_id !== pet.cart_id);
    setCart(next);
    writeCart(next, userId);
    if (Number.isFinite(Number(pet.cart_id)))
      fetch(`${API_BASE}/api/cart/${pet.cart_id}?user_id=${userId}&pet_id=${Number(pet.pet_id || 0)}`, { method: "DELETE" }).catch(() => {});
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
                  <span className={`collection-photo${pet.showcase_image ? " showcase-collection-photo" : ""}`}>
                    <img
                      src={displayMedia(pet.showcase_image || pet.image)}
                      loading="lazy"
                      decoding="async"
                      alt={pet.name || pet.breed || "收藏宠物"}
                      onError={(event) => {
                        if (pet.showcase_image && pet.image)
                          event.currentTarget.src = displayMedia(pet.image);
                      }}
                    />
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
                  <span className={`collection-photo${pet.showcase_image ? " showcase-collection-photo" : ""}`}>
                    <img
                      src={displayMedia(pet.showcase_image || pet.image)}
                      loading="lazy"
                      decoding="async"
                      alt={pet.name || pet.breed || "购物车宠物"}
                      onError={(event) => {
                        if (pet.showcase_image && pet.image)
                          event.currentTarget.src = displayMedia(pet.image);
                      }}
                    />
                  </span>
                  <em>购物车</em>
                </button>
                <button
                  className="favorite-remove"
                  onClick={() => confirm("确定移出购物车吗？") && removeCart(pet)}
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
  const userId = useUserId();
  const serviceTypes = [
    ["购买咨询", "了解价格、健康、疫苗和购买流程"],
    ["订单咨询", "查询订单、支付和确认信息"],
    ["售后服务", "退款、售后和投诉处理"],
    ["宠物健康咨询", "咨询喂养、疫苗和到家适应"],
    ["物流帮助", "发货、运输和到家时间"],
    ["官方客服", "综合咨询、特殊问题和高级客户服务"],
  ] as const;
  const [activeType, setActiveType] = useState<string | null>(
    context?.productName ? "购买咨询" : null,
  );
  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [humanPending, setHumanPending] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<"ai" | "human_pending" | "human">("ai");
  const [customerCode, setCustomerCode] = useState("");
  const [sending, setSending] = useState(false);
  const [failedText, setFailedText] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [sharedProduct, setSharedProduct] = useState<ServiceContext | null>(context || null);
  const [recentOrders, setRecentOrders] = useState<ServiceOrder[]>([]);
  const [showOrderPicker, setShowOrderPicker] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      id: 1,
      sender: "service",
      content: context?.productName
        ? `您好，正在为您连接「${context.productName}」的购买咨询。`
        : "请选择需要咨询的服务类型。",
    },
  ]);
  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/messages?user_id=${userId}`);
      const messages = await response.json();
      if (Array.isArray(messages)) {
        const latestBySession = new Map<number | string, ChatMessage>();
        messages.slice().sort((a: ChatMessage, b: ChatMessage) => Number(b.id) - Number(a.id)).forEach((message: ChatMessage) => {
          const key = message.session_id || `message-${message.id}`;
          if (!latestBySession.has(key)) latestBySession.set(key, message);
        });
        setHistory(Array.from(latestBySession.values()).slice(0, 12));
      }
    } catch {
      setHistory([]);
    }
  }, [userId]);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);
  useEffect(() => {
    if (context?.productName) setActiveType("购买咨询");
  }, [context?.productName]);
  useEffect(() => {
    setSharedProduct(context || null);
  }, [context]);
  const refreshSession = useCallback(async (sid: number) => {
    try {
      const [messagesResponse, statusResponse] = await Promise.all([
        fetch(`${API_BASE}/api/messages?user_id=${userId}&session_id=${sid}`),
        fetch(`${API_BASE}/api/customer-service/sessions/${sid}?user_id=${userId}`),
      ]);
      if (messagesResponse.ok) {
        const messages = await messagesResponse.json();
        if (Array.isArray(messages)) setChat(messages.map((item) => ({
          id: item.id,
          sender: item.sender,
          content: item.content,
          session_id: item.session_id,
          product_id: item.product_id,
          product_name: item.product_name,
          product_image: item.product_image,
          product_breed: item.product_breed,
          product_price: item.product_price,
          type: item.type,
          service_type: item.service_type,
        })));
      }
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        setServiceStatus(status.status || "ai");
        setHumanPending(["human_pending", "human"].includes(status.status));
        setCustomerCode(status.customer_code || "");
        if (status.service_type) setActiveType(status.service_type);
      }
    } catch {
      // 短暂断网时保留当前会话，下一轮自动重试。
    }
  }, [userId]);
  useEffect(() => {
    if (!activeType || !sessionId) return;
    refreshSession(sessionId);
    const timer = window.setInterval(() => refreshSession(sessionId), 2500);
    return () => window.clearInterval(timer);
  }, [activeType, sessionId, refreshSession]);
  useEffect(() => {
    fetch(`${API_BASE}/api/orders?user_id=${userId}`)
      .then((response) => response.json())
      .then((orders) => {
        if (!Array.isArray(orders)) return setRecentOrders([]);
        setRecentOrders(orders.slice(0, 8).map((order: any) => {
          let pet: any = {};
          try { pet = JSON.parse(order.pet_snapshot || "{}"); } catch {}
          return {
            id: Number(order.id),
            orderNo: String(order.order_no || order.id),
            status: String(order.status || "待处理"),
            total: Number(order.total_amount || 0),
            productId: Number(pet.id || order.pet_id || 0) || undefined,
            productName: pet.name || "宠物订单",
            productImage: displayMedia(pet.images?.[0]?.thumbnail_url || pet.images?.[0]?.webp_url || pet.images?.[0]?.url || pet.image),
            productBreed: pet.breed || "宠物档案",
            logisticsStatus: order.logistics_status || "等待物流更新",
            trackingNo: order.tracking_no || "物流单号生成中",
          } satisfies ServiceOrder;
        }));
      })
      .catch(() => setRecentOrders([]));
  }, [userId]);
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
    if (message.product_id || message.product_name) {
      setSharedProduct({
        productId: message.product_id,
        productName: message.product_name,
        productImage: message.product_image,
        productBreed: message.product_breed,
        productPrice: message.product_price,
        source: "service_history",
      });
    }
    try {
      const response = await fetch(`${API_BASE}/api/messages?user_id=${userId}&session_id=${message.session_id}`);
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
              product_image: item.product_image,
              product_breed: item.product_breed,
              product_price: item.product_price,
              type: item.type,
              service_type: item.service_type,
            }))
          : [],
      );
    } catch {
      setChat([{ id: Date.now(), sender: "service", content: "历史记录加载失败，请重新发送。" }]);
    }
  };
  const send = async (
    override?: string,
    meta?: { type?: string; productId?: number | null; productName?: string; productImage?: string },
  ) => {
    const value = (override ?? text).trim();
    if (!value || sending) return sessionId;
    setSending(true);
    setFailedText("");
    setChat((items) => [...items, {
      id: Date.now(), sender: "user", content: value, type: meta?.type,
      product_id: meta?.productId || sharedProduct?.productId || undefined,
      product_name: meta?.productName || sharedProduct?.productName,
      product_image: meta?.productImage || sharedProduct?.productImage,
    }]);
    if (!override) setText("");
    try {
      const response = await fetch(`${API_BASE}/api/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          sender: "user",
          type: meta?.type || "service",
          content: value,
          session_id: sessionId,
          product_id: meta?.productId || sharedProduct?.productId || null,
          product_name: meta?.productName || sharedProduct?.productName || "",
          seller_id: sharedProduct?.sellerId || null,
          seller_name: sharedProduct?.sellerName || "福宠认证宠物馆",
          source: sharedProduct?.source || "message_center",
          service_type: activeType || "购买咨询",
        }),
      });
      if (!response.ok) throw new Error("send failed");
      const saved = await response.json();
      if (saved.session_id) setSessionId(saved.session_id);
      if (saved.customer_code) setCustomerCode(saved.customer_code);
      if (saved.status) {
        setServiceStatus(saved.status);
        setHumanPending(["human_pending", "human"].includes(saved.status));
      }
      if (saved.service_type) setActiveType(saved.service_type);
      if (saved.reply) setChat((items) => [...items, {
        id: Date.now() + 1,
        sender: "service",
        content: saved.reply,
        session_id: saved.session_id,
      }]);
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
  const sendProductCard = async () => {
    if (!sharedProduct?.productName) return;
    const summary = [
      "【福宠商品资料】",
      `商品：${sharedProduct.productName}`,
      `品种：${sharedProduct.productBreed || "待客服核实"}`,
      `价格：${sharedProduct.productPrice ? `¥${sharedProduct.productPrice}` : "以商品页实时价格为准"}`,
      `商品ID：${sharedProduct.productId || "未关联"}`,
      `商家：${sharedProduct.sellerName || "福宠认证宠物馆"}`,
      "咨询诉求：请客服结合当前商品资料继续解答。",
    ].join("\n");
    await send(summary, {
      type: "product_card",
      productId: sharedProduct.productId,
      productName: sharedProduct.productName,
      productImage: sharedProduct.productImage,
    });
  };
  const sendOrderCard = async (order: ServiceOrder) => {
    const serviceLabel = activeType === "物流帮助" ? "物流咨询" : activeType === "售后服务" ? "订单售后" : "订单咨询";
    const summary = [
      `【福宠${serviceLabel}资料】`,
      `订单号：${order.orderNo}`,
      `商品：${order.productName}（${order.productBreed || "宠物档案"}）`,
      `订单状态：${order.status}`,
      `订单金额：¥${order.total}`,
      `物流状态：${order.logisticsStatus || "等待更新"}`,
      `物流单号：${order.trackingNo || "尚未生成"}`,
      "咨询诉求：请客服根据订单与物流记录继续处理。",
    ].join("\n");
    setSharedProduct((current) => ({
      ...current,
      productId: order.productId,
      productName: order.productName,
      productImage: order.productImage,
      productBreed: order.productBreed,
      orderId: order.id,
      orderNo: order.orderNo,
    }));
    setShowOrderPicker(false);
    await send(summary, {
      type: activeType === "物流帮助" ? "logistics_card" : activeType === "售后服务" ? "after_sale_card" : "order_card",
      productId: order.productId,
      productName: order.productName,
      productImage: order.productImage,
    });
  };
  const handoff = async () => {
    const sid = sessionId || (await send("需要转人工客服"));
    if (!sid) return;
    await fetch(`${API_BASE}/api/customer-service/sessions/${sid}/handoff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId, reason: "客户主动要求人工", preview: text || "客户请求人工服务" }),
    }).catch(() => {});
    setHumanPending(true);
    setServiceStatus("human_pending");
    setChat((items) => [
      ...items,
      { id: Date.now() + 3, sender: "service", content: "已为您转入人工客服队列。" },
    ]);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };
  const shareableOrders = useMemo(() => {
    const fromContext: ServiceOrder | null = context?.orderId ? {
      id: context.orderId,
      orderNo: context.orderNo || String(context.orderId),
      status: context.orderStatus || "待处理",
      total: Number(context.productPrice || 0),
      productId: context.productId || undefined,
      productName: context.productName || "宠物订单",
      productImage: context.productImage,
      productBreed: context.productBreed,
      logisticsStatus: context.logisticsStatus,
      trackingNo: context.trackingNo,
    } : null;
    return fromContext
      ? [fromContext, ...recentOrders.filter((order) => order.id !== fromContext.id)]
      : recentOrders;
  }, [context, recentOrders]);
  const needsOrder = ["订单咨询", "售后服务", "物流帮助"].includes(activeType || "");
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
                  {item.product_image ? <img src={displayMedia(item.product_image)} alt={item.product_name || "咨询宠物"} loading="lazy" /> : "宠"}
                </button>
                <button className="service-history-main" onClick={() => continueSession(item)}>
                  <strong>{item.product_name || item.service_type || "客服咨询"}</strong>
                  <small>{item.content}</small>
                </button>
                <button className="service-history-continue" onClick={() => continueSession(item)}>继续聊天　›</button>
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
                <small>{serviceStatus === "human" ? "人工客服已接入" : humanPending ? "正在通知对应人工客服" : "AI 即时回复 · 可转人工"}</small>
                <h2>{activeType}</h2>
                <p>{customerCode ? `会话 ${customerCode} · ` : ""}{sharedProduct?.productName ? `当前宠物：${sharedProduct.productName}` : "独立客户会话"}</p>
              </div>
              <button onClick={() => setActiveType(null)}>×</button>
            </header>
            <div className="service-share-tools">
              {sharedProduct?.productName && <button type="button" onClick={sendProductCard} disabled={sending}>
                {sharedProduct.productImage ? <img src={displayMedia(sharedProduct.productImage)} alt={sharedProduct.productName} /> : <i>宠</i>}
                <span><b>发送商品</b><small>{sharedProduct.productName}</small></span><em>＋</em>
              </button>}
              {needsOrder && <button type="button" onClick={() => setShowOrderPicker((value) => !value)} disabled={!shareableOrders.length}>
                <i>{activeType === "物流帮助" ? "运" : activeType === "售后服务" ? "后" : "单"}</i>
                <span><b>{activeType === "物流帮助" ? "发送物流订单" : activeType === "售后服务" ? "发送售后订单" : "发送订单"}</b><small>{shareableOrders.length ? `${shareableOrders.length} 个订单可选择` : "暂无订单"}</small></span><em>＋</em>
              </button>}
            </div>
            {showOrderPicker && needsOrder && <div className="service-order-picker">
              <header><b>选择要发送的订单</b><button type="button" onClick={() => setShowOrderPicker(false)}>收起</button></header>
              {shareableOrders.slice(0, 5).map((order) => <button type="button" key={order.id} onClick={() => sendOrderCard(order)}>
                {order.productImage ? <img src={order.productImage} alt={order.productName} /> : <i>单</i>}
                <span><b>{order.productName}</b><small>{order.orderNo} · {order.status}</small></span><em>发送</em>
              </button>)}
            </div>}
            <div className="chat-window sheet-chat">
              {chat.map((message) => (
                <div key={message.id} className={`chat-bubble ${message.sender}`}>
                  <i>{message.sender === "user" ? "我" : message.sender === "agent" ? "客" : "福"}</i>
                  {message.type && message.type !== "service" ? <div className={`chat-share-card ${message.type}`}>
                    <small>{message.type === "product_card" ? "已发送商品" : message.type === "logistics_card" ? "已发送物流订单" : message.type === "after_sale_card" ? "已发送售后订单" : "已发送订单"}</small>
                    <b>{message.product_name || "福宠资料"}</b>
                    <p>{message.content}</p>
                  </div> : <p>{message.content}</p>}
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

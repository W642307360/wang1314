import { useEffect, useState } from "react";
import "./UserModules.css";
import "./Chat.css";

export type User = {
  id: string;
  nickname: string;
  phone: string;
  avatar: string;
};
export type Order = {
  id: string;
  status: string;
  petName: string;
  breed: string;
  price: number;
  image: string;
};
const petImg =
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
          onLogin({
            id: "u_mock_001",
            nickname: "福宠新朋友",
            phone: "",
            avatar:
              "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
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
      <button className="phone-login" disabled={phone.length < 11}>
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
  const [favorites, setFavorites] = useState([1, 2, 3]);
  const [follows, setFollows] = useState([1, 2]);
  const userId=Number(localStorage.getItem("fuchong-user-id")||1)
  useEffect(()=>{fetch(`http://127.0.0.1:3001/api/favorites?user_id=${userId}`).then(r=>r.json()).then(d=>Array.isArray(d)&&d.length&&setFavorites(d.map(x=>x.pet_id))).catch(()=>{})},[userId])
  const removeFavorite=async(petId:number)=>{await fetch(`http://127.0.0.1:3001/api/favorites/${petId}?user_id=${userId}`,{method:"DELETE"}).catch(()=>{});setFavorites(v=>v.filter(i=>i!==petId))}
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
        favorites.length ? (
          <div className="collection-grid">
            {favorites.map((x) => (
              <article key={x}>
                <img src={petImg} />
                <button
                  onClick={() =>
                    confirm("确定取消收藏吗？") &&
                    removeFavorite(x)
                  }
                >
                  ♥
                </button>
                <h3>小太阳 {x}号</h3>
                <p>金毛 · {x + 2}个月 · 健康认证</p>
                <b>¥ {6800 + x * 300}</b>
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
                <h3>汪星宠物馆 {x}</h3>
                <p>实名认证 · 健康保障 · 评分 5.0</p>
              </div>
              <button
                onClick={() =>
                  confirm("确定取消关注吗？") &&
                  setFollows((v) => v.filter((i) => i !== x))
                }
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
  const [items, setItems] = useState([1, 2, 3, 4]);
  return (
    <div className="module-page">
      <Header title="浏览足迹" back={back} />
      <div className="list-tools">
        <b>今天</b>
        <button onClick={() => confirm("清空全部浏览记录？") && setItems([])}>
          清空
        </button>
      </div>
      {items.length ? (
        <div className="foot-grid">
          {items.map((x) => (
            <article key={x}>
              <img src={petImg} />
              <div>
                <h3>金毛小太阳 {x}号</h3>
                <p>今天 {10 + x}:26 浏览</p>
                <b>¥ {6800 + x * 300}</b>
              </div>
              <button onClick={() => setItems((v) => v.filter((i) => i !== x))}>
                ×
              </button>
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
  const [items, setItems] = useState<Array<{id:number;name:string;phone:string;address:string;isDefault:boolean}>>([]);
  const [editing, setEditing] = useState(false);
  const userId=Number(localStorage.getItem("fuchong-user-id")||1)
  useEffect(()=>{fetch(`http://127.0.0.1:3001/api/addresses?user_id=${userId}`).then(r=>r.json()).then(d=>Array.isArray(d)&&setItems(d.map(a=>({id:a.id,name:a.name,phone:a.phone,address:[a.province,a.city,a.district,a.detail].filter(Boolean).join(" "),isDefault:Boolean(a.is_default)})))).catch(()=>{})},[userId])
  return (
    <div className="module-page">
      <Header title="收货地址" back={back} />
      {editing ? (
        <form
          className="address-form"
          onSubmit={async(e) => {
            e.preventDefault();
            const f=new FormData(e.currentTarget);const payload={user_id:userId,name:String(f.get("name")||""),phone:String(f.get("phone")||""),province:String(f.get("region")||""),detail:String(f.get("detail")||""),is_default:Boolean(f.get("default"))};const r=await fetch("http://127.0.0.1:3001/api/addresses",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const saved=await r.json();setItems(v=>[...v,{id:saved.id,name:payload.name,phone:payload.phone,address:`${payload.province} ${payload.detail}`,isDefault:payload.is_default}])
            setEditing(false);
          }}
        >
          <input name="name" required placeholder="收货人" />
          <input name="phone" required placeholder="手机号" />
          <input name="region" required placeholder="省 / 市 / 区" />
          <textarea name="detail" required placeholder="详细地址" />
          <label>
            <input name="default" type="checkbox" /> 设为默认地址
          </label>
          <button>保存地址</button>
        </form>
      ) : (
        <>
          {items.length ? (
            items.map((a) => (
              <article className="address-card" key={a.id}>
                <b>
                  {a.name}　{a.phone}
                </b>
                <p>{a.address}</p>
                <small>{a.isDefault ? "默认地址" : ""}</small>
                <div>
                  <button onClick={() => setEditing(true)}>编辑</button>
                  <button
                    onClick={() =>
                      confirm("删除该地址？") &&
                      setItems((v) => v.filter((x) => x.id !== a.id))
                    }
                  >
                    删除
                  </button>
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
          <button className="fixed-primary" onClick={() => setEditing(true)}>
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
  const [orders,setOrders] = useState<Order[]>([
    {
      id: "FC20260709001",
      status: "待确认",
      petName: "小太阳 1号",
      breed: "金毛寻回犬 · 3个月",
      price: 7300,
      image: petImg,
    },
    {
      id: "FC20260708012",
      status: "待收货",
      petName: "小太阳 2号",
      breed: "金毛寻回犬 · 4个月",
      price: 7600,
      image: petImg,
    },
  ]);
  const userId=Number(localStorage.getItem("fuchong-user-id")||1)
  useEffect(()=>{fetch(`http://127.0.0.1:3001/api/orders?user_id=${userId}`).then(r=>r.json()).then(d=>Array.isArray(d)&&setOrders(d.map(o=>{let pet:any={};try{pet=JSON.parse(o.pet_snapshot||"{}")}catch{}return{id:o.order_no,status:o.status,petName:pet.name||"宠物订单",breed:pet.breed||"宠物档案",price:o.total_amount,image:pet.images?.[0]?.url||petImg}}))).catch(()=>{})},[userId])
  const visible =
    tab === "全部" ? orders : orders.filter((o) => o.status === tab);
  return (
    <div className="module-page">
      <Header title="我的订单" back={back} />
      <div className="order-tabs">
        {tabs.map((t) => (
          <button className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {visible.length ? (
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
              <footer>
                <small>订单号 {o.id}</small>
                <button>联系商家</button>
                <button>
                  {o.status === "待确认" ? "取消订单" : "再次购买"}
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

export function MessagesPage({ back }: { back: () => void }) {
  const [chat, setChat] = useState([
    {
      id: 1,
      sender: "service",
      content: "您好，我是福宠专属客服，请问有什么可以帮助您？",
    },
  ]);
  const [text, setText] = useState("");
  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setChat((v) => [...v, { id: Date.now(), sender: "user", content: value }]);
    setText("");
    try {
      await fetch("http://127.0.0.1:3001/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: 1, sender: "user", content: value }),
      });
      setTimeout(
        () =>
          setChat((v) => [
            ...v,
            {
              id: Date.now() + 1,
              sender: "service",
              content: "已收到您的消息，客服正在为您查询。",
            },
          ]),
        500,
      );
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
  };
  return (
    <div className="module-page">
      <Header title="专属客服" back={back} />
      <div className="chat-status">
        <i />
        福宠客服在线 <span>通常 1 分钟内回复</span>
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
        <button onClick={send}>发送</button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { halls } from "./catalog";
import "./Admin.css";
import "./AdminLogin.css";
import "./Feishu.css";

type AdminTab =
  | "dashboard"
  | "products"
  | "users"
  | "orders"
  | "transactions"
  | "logistics"
  | "afterSales"
  | "content"
  | "feishu";
type ProductForm = {
  name: string;
  hall: string;
  breed: string;
  price: string;
  gender: string;
  age: string;
  color: string;
  bodyType: string;
  personality: string;
  health: string;
  vaccine: string;
  father: string;
  mother: string;
  growth: string;
  images: string;
  videos: string;
  seller: string;
  stock: string;
  status: string;
};
const emptyProduct: ProductForm = {
  name: "",
  hall: "cats",
  breed: "",
  price: "",
  gender: "female",
  age: "",
  color: "",
  bodyType: "",
  personality: "",
  health: "健康",
  vaccine: "已完成基础疫苗",
  father: "",
  mother: "",
  growth: "1个月,2个月,3个月,6个月,1岁,2岁",
  images: "",
  videos: "",
  seller: "",
  stock: "1",
  status: "draft",
};
export default function AdminApp() {
  const [token, setToken] = useState(
    () => localStorage.getItem("fuchong-admin-token") || "",
  );
  const [checking, setChecking] = useState(Boolean(token));
  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    fetch("http://127.0.0.1:3001/api/admin/stats", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (response.status === 401) {
          localStorage.removeItem("fuchong-admin-token");
          setToken("");
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [token]);
  if (checking) return <div className="admin-checking">正在验证管理员身份…</div>;
  if (!token)
    return (
      <AdminLogin
        success={(t) => {
          localStorage.setItem("fuchong-admin-token", t);
          setToken(t);
        }}
      />
    );
  return (
    <AdminPanel
      token={token}
      logout={() => {
        localStorage.removeItem("fuchong-admin-token");
        setToken("");
      }}
    />
  );
}
function AdminLogin({ success }: { success: (token: string) => void }) {
  const [username, setUsername] = useState("admin"),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const r = await fetch("http://127.0.0.1:3001/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      success(d.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    }
  };
  return (
    <div className="admin-login">
      <form onSubmit={submit}>
        <b>福</b>
        <h1>福宠管理后台</h1>
        <p>使用管理员账号登录运营系统</p>
        <label>
          管理员账号
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          登录密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <em>{error}</em>}
        <button>安全登录</button>
        <small>初始账号：admin　初始密码：123456789</small>
      </form>
    </div>
  );
}
function AdminPanel({ token, logout }: { token: string; logout: () => void }) {
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  useEffect(() => {
    fetch("http://127.0.0.1:3001/api/admin/pets", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || "商品加载失败");
        setProducts(Array.isArray(data) ? data : []);
      })
      .catch((e) => setProductsError(e instanceof Error ? e.message : "商品加载失败"))
      .finally(() => setProductsLoading(false));
  }, [token]);
  const breeds = useMemo(
    () => halls.find((h) => h.key === form.hall)?.breeds || [],
    [form.hall],
  );
  const update = (key: keyof ProductForm, value: string) =>
    setForm((v) => ({ ...v, [key]: value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      category_id: halls.findIndex((h) => h.key === form.hall) + 1,
      breed: form.breed,
      price: Number(form.price),
      gender: form.gender,
      age_months: Number(form.age),
      color: form.color,
      body_type: form.bodyType,
      personality: form.personality,
      health_status: form.health,
      vaccine_record: form.vaccine,
      father_info: form.father,
      mother_info: form.mother,
      description: "管理员后台同步商品",
      seller_name: form.seller,
      status: form.status,
    };
    const r = await fetch("http://127.0.0.1:3001/api/admin/pets", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      const saved = await r.json();
      setProducts((v) => [saved, ...v]);
      setShowForm(false);
      setForm(emptyProduct);
    }
  };
  return (
    <div className="admin-shell">
      <aside>
        <div className="admin-brand">
          <b>福</b>
          <span>
            福宠运营后台<small>FUCHONG ADMIN</small>
          </span>
        </div>
        {(
          [
            ["dashboard", "⌂", "经营概览"],
            ["products", "◇", "宠物商品"],
            ["users", "♙", "用户管理"],
            ["orders", "▣", "订单管理"],
            ["transactions", "¥", "交易中心"],
            ["logistics", "⌖", "物流管理"],
            ["afterSales", "↻", "客诉售后"],
            ["content", "▤", "首页内容"],
            ["feishu", "云", "飞书同步"],
          ] as const
        ).map(([id, icon, name]) => (
          <button
            className={tab === id ? "on" : ""}
            onClick={() => setTab(id)}
            key={id}
          >
            <i>{icon}</i>
            {name}
          </button>
        ))}
        <a href="#">返回用户端</a>
      </aside>
      <main>
        <header>
          <div>
            <small>2026年7月9日 · 星期四</small>
            <h1>
              {
                {
                  dashboard: "经营概览",
                  products: "宠物商品",
                  users: "用户管理",
                  orders: "订单管理",
                  transactions: "交易中心",
                  logistics: "物流管理",
                  afterSales: "客诉与售后",
                  content: "首页内容",
                  feishu: "飞书同步",
                }[tab]
              }
            </h1>
          </div>
          <div className="admin-user">
            运营管理员 <b>管</b>
            <button className="admin-logout" onClick={logout}>退出</button>
          </div>
        </header>
        {tab === "dashboard" && <Dashboard token={token} />}
        {tab === "products" && (
          productsLoading ? <div className="admin-state">商品数据加载中…</div> : productsError ? <div className="admin-state error">{productsError}</div> : <Products
              products={products}
              open={() => setShowForm(true)}
              token={token}
              update={(id, patch) =>
                setProducts((v) =>
                  v.map((p) => (p.id === id ? { ...p, ...patch } : p)),
                )
              }
              remove={async (id) => {
                await fetch(`http://127.0.0.1:3001/api/admin/pets/${id}`, {
                  method: "DELETE",
                  headers: { authorization: `Bearer ${token}` },
                });
                setProducts((v) => v.filter((p) => p.id !== id));
              }}
            />
        )}{" "}
        {tab === "users" && <UsersManager token={token} />}{" "}
        {tab === "orders" && <OrdersManager token={token} />}{" "}
        {tab === "transactions" && <Transactions token={token} />}
        {tab === "logistics" && <Logistics token={token} />}
        {tab === "afterSales" && <AfterSales token={token} />}
        {tab === "content" && <ContentManager token={token} />}
        {tab === "feishu" && <FeishuManager token={token} />}
      </main>
      {showForm && (
        <div className="admin-modal">
          <form onSubmit={save}>
            <header>
              <div>
                <small>PRODUCT PROFILE</small>
                <h2>新增宠物商品</h2>
              </div>
              <button type="button" onClick={() => setShowForm(false)}>
                ×
              </button>
            </header>
            <div className="form-grid">
              <Field
                label="宠物名称*"
                value={form.name}
                set={(v) => update("name", v)}
              />
              <label>
                所属场馆
                <select
                  value={form.hall}
                  onChange={(e) => update("hall", e.target.value)}
                >
                  {halls.map((h) => (
                    <option key={h.key} value={h.key}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                标准品种*
                <select
                  value={form.breed}
                  onChange={(e) => update("breed", e.target.value)}
                  required
                >
                  <option value="">请选择</option>
                  {breeds.map((b) => (
                    <option key={b.name}>{b.name}</option>
                  ))}
                </select>
              </label>
              <Field
                label="售价（元）*"
                value={form.price}
                set={(v) => update("price", v)}
              />
              <label>
                性别
                <select
                  value={form.gender}
                  onChange={(e) => update("gender", e.target.value)}
                >
                  <option value="female">母</option>
                  <option value="male">公</option>
                </select>
              </label>
              <Field
                label="年龄（月）"
                value={form.age}
                set={(v) => update("age", v)}
              />
              <Field
                label="毛色"
                value={form.color}
                set={(v) => update("color", v)}
              />
              <Field
                label="体型"
                value={form.bodyType}
                set={(v) => update("bodyType", v)}
              />
              <Field
                label="性格标签"
                value={form.personality}
                set={(v) => update("personality", v)}
              />
              <Field
                label="健康状态"
                value={form.health}
                set={(v) => update("health", v)}
              />
              <Field
                label="疫苗记录"
                value={form.vaccine}
                set={(v) => update("vaccine", v)}
              />
              <Field
                label="父亲信息"
                value={form.father}
                set={(v) => update("father", v)}
              />
              <Field
                label="母亲信息"
                value={form.mother}
                set={(v) => update("mother", v)}
              />
              <Field
                label="成长节点"
                value={form.growth}
                set={(v) => update("growth", v)}
              />
              <Field
                label="图片地址（逗号分隔）"
                value={form.images}
                set={(v) => update("images", v)}
              />
              <Field
                label="视频地址（逗号分隔）"
                value={form.videos}
                set={(v) => update("videos", v)}
              />
              <Field
                label="所属商家"
                value={form.seller}
                set={(v) => update("seller", v)}
              />
              <Field
                label="库存"
                value={form.stock}
                set={(v) => update("stock", v)}
              />
              <label>
                发布状态
                <select
                  value={form.status}
                  onChange={(e) => update("status", e.target.value)}
                >
                  <option value="draft">保存草稿</option>
                  <option value="published">立即上架</option>
                </select>
              </label>
            </div>
            <footer>
              <button type="button" onClick={() => setShowForm(false)}>
                取消
              </button>
              <button className="primary">保存商品</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
function Field({
  label,
  value,
  set,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <input value={value} onChange={(e) => set(e.target.value)} />
    </label>
  );
}
function Dashboard({ token }: { token: string }) {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => {
    fetch("http://127.0.0.1:3001/api/admin/stats", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setStats);
  }, [token]);
  const cards = [
    ["在售宠物", stats?.products?.published ?? "—", "实时商品库"],
    ["累计订单", stats?.orders?.total ?? "—", `已付款 ${stats?.orders?.paid ?? 0}`],
    ["成交金额", `¥${stats?.orders?.revenue ?? 0}`, "真实支付订单"],
    ["用户总数", stats?.users?.total ?? "—", `访客 ${stats?.users?.visitors ?? 0}`],
  ];
  return (
    <>
      <section className="admin-stats">
        {cards.map((x) => (
          <article key={x[0]}>
            <small>{x[0]}</small>
            <h2>{x[1]}</h2>
            <span>{x[2]}</span>
          </article>
        ))}
      </section>
      <section className="admin-panels">
        <article>
          <h3>订单趋势</h3>
          <div className="chart">
            {[35, 52, 42, 68, 62, 85, 76, 92, 70, 95, 88, 100].map((x, i) => (
              <i style={{ height: `${x}%` }} key={i} />
            ))}
          </div>
        </article>
        <article>
          <h3>待处理事项</h3>
          {[
            ["低库存商品", String(stats?.products?.low_stock ?? 0)],
            ["待付款订单", String(stats?.orders?.pending_payment ?? 0)],
            ["售后申请", String(stats?.operations?.pending_after_sales ?? 0)],
            ["同步错误记录", String(stats?.operations?.sync_errors ?? 0)],
          ].map((x) => (
            <button key={x[0]}>
              {x[0]}
              <b>{x[1]}</b>
            </button>
          ))}
        </article>
      </section>
    </>
  );
}
function Products({
  products,
  open,
  remove,
  update,
  token,
}: {
  products: any[];
  open: () => void;
  remove: (id: number) => void;
  update: (id: number, patch: any) => void;
  token: string;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const patch = async (id: number, data: any) => {
    const r = await fetch(`http://127.0.0.1:3001/api/admin/pets/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(data),
    });
    if (r.ok) update(id, data);
  };
  const edit = async (p: any) => {
    const price = prompt("修改商品价格", String(p.price));
    if (price) await patch(p.id, { price: Number(price) });
  };
  const sku = async (p: any) => {
    const name = prompt("SKU 名称", "标准档案");
    const stock = prompt("库存数量", "1");
    if (name && stock)
      await fetch(`http://127.0.0.1:3001/api/admin/pets/${p.id}/skus`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          sku_name: name,
          price: p.price,
          stock: Number(stock),
        }),
      });
  };
  const media = async (p: any, type: "images" | "videos") => {
    const url = prompt(type === "images" ? "图片地址" : "视频地址");
    if (url)
      await fetch(`http://127.0.0.1:3001/api/admin/pets/${p.id}/${type}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url }),
      });
  };
  const batch = async (status: string) => {
    await Promise.all(selected.map((id) => patch(id, { status })));
    setSelected([]);
  };
  const bulkImport = async () => {
    const text = prompt("粘贴商品 JSON 数组");
    if (!text) return;
    try {
      const list = JSON.parse(text);
      for (const item of list) {
        await fetch("http://127.0.0.1:3001/api/admin/pets", {
          method: "POST",
          headers,
          body: JSON.stringify(item),
        });
      }
      location.reload();
    } catch {
      alert("JSON 格式错误");
    }
  };
  return (
    <section className="admin-table">
      <div>
        <h3>宠物商品管理</h3>
        <span>
          <button onClick={bulkImport}>批量上传</button>{" "}
          <button onClick={() => batch("published")}>批量上架</button>{" "}
          <button onClick={() => batch("offline")}>批量下架</button>{" "}
          <button onClick={open}>＋ 新增宠物</button>
        </span>
      </div>
      <table>
        <thead>
          <tr>
            {["选择", "商品ID", "宠物名称", "品种", "售价", "状态", "操作"].map(
              (x) => (
                <th key={x}>{x}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((v) =>
                      e.target.checked
                        ? [...v, p.id]
                        : v.filter((id) => id !== p.id),
                    )
                  }
                />
              </td>
              <td>{p.id}</td>
              <td>
                <b>{p.name}</b>
              </td>
              <td>{p.breed}</td>
              <td>¥{p.price}</td>
              <td>
                <span>{p.status}</span>
              </td>
              <td>
                <button onClick={() => edit(p)}>编辑价格</button>
                <button
                  onClick={() =>
                    patch(p.id, {
                      status:
                        p.status === "published" ? "offline" : "published",
                    })
                  }
                >
                  {p.status === "published" ? "下架" : "上架"}
                </button>
                <button onClick={() => sku(p)}>SKU/库存</button>
                <button onClick={() => media(p, "images")}>图片</button>
                <button onClick={() => media(p, "videos")}>视频</button>
                <button
                  onClick={() => confirm("确定删除该商品吗？") && remove(p.id)}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function DataTable({
  title,
  heads,
  rows,
}: {
  title: string;
  heads: string[];
  rows: string[][];
}) {
  return (
    <section className="admin-table">
      <div>
        <h3>{title}</h3>
        <button>导出数据</button>
      </div>
      <table>
        <thead>
          <tr>
            {heads.map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((x, j) => (
                <td key={j}>{x}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td className="admin-empty" colSpan={cols}>{text}</td>
    </tr>
  );
}
function Transactions({ token }: { token: string }) {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("http://127.0.0.1:3001/api/admin/payments", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "交易数据加载失败");
        setPayments(Array.isArray(data) ? data : []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "交易数据加载失败"))
      .finally(() => setLoading(false));
  }, [token]);
  const paid = payments.filter((item) => item.status === "paid");
  const pending = payments.filter((item) => item.status === "pending");
  const refunds = payments.filter((item) => item.status === "refunded");
  return (
    <>
      <section className="admin-stats">
        <article>
          <small>今日入账</small>
          <h2>¥{paid.reduce((sum, item) => sum + Number(item.amount || 0), 0)}</h2>
          <span>{paid.length} 笔成功交易</span>
        </article>
        <article>
          <small>待结算</small>
          <h2>¥{pending.reduce((sum, item) => sum + Number(item.amount || 0), 0)}</h2>
          <span>{pending.length} 笔待确认</span>
        </article>
        <article>
          <small>退款金额</small>
          <h2>¥{refunds.reduce((sum, item) => sum + Number(item.amount || 0), 0)}</h2>
          <span>{refunds.length} 笔退款</span>
        </article>
      </section>
      <DataTable
        title="交易流水"
        heads={["流水号", "类型", "关联订单", "金额", "状态"]}
        rows={loading ? [["—", "—", "—", "加载中…", "—"]] : error ? [["—", "—", "—", error, "失败"]] : payments.map((item) => [item.payment_no, item.channel, item.order_no, `¥${item.amount}`, item.status])}
      />
    </>
  );
}

function UsersManager({ token }: { token: string }) {
  const [users, setUsers] = useState<any[]>([]),
    [detail, setDetail] = useState<any>(null);
  const headers = useMemo(
    () => ({ authorization: `Bearer ${token}` }),
    [token],
  );
  useEffect(() => {
    fetch("http://127.0.0.1:3001/api/admin/users", { headers })
      .then((r) => r.json())
      .then(setUsers);
  }, [headers]);
  const open = async (id: number) =>
    setDetail(
      await fetch(`http://127.0.0.1:3001/api/admin/users/${id}`, {
        headers,
      }).then((r) => r.json()),
    );
  return (
    <section className="admin-table">
      <div>
        <h3>用户管理</h3>
      </div>
      <table>
        <thead>
          <tr>
            <th>用户</th>
            <th>手机号</th>
            <th>状态</th>
            <th>注册时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {!users.length && <EmptyRow cols={5} text="暂无用户数据" />}
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.nickname}</td>
              <td>{u.phone || "未绑定"}</td>
              <td>{u.status}</td>
              <td>{u.created_at}</td>
              <td>
                <button onClick={() => open(u.id)}>查看详情</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {detail && (
        <div className="user-detail">
          <h3>{detail.nickname}</h3>
          <p>
            订单 {detail.orders.length} · 收藏 {detail.favorites.length} · 足迹{" "}
            {detail.footprints.length} · 地址 {detail.addresses.length}
          </p>
          <button onClick={() => setDetail(null)}>关闭</button>
        </div>
      )}
    </section>
  );
}
function OrdersManager({ token }: { token: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const headers = useMemo(
    () => ({ authorization: `Bearer ${token}` }),
    [token],
  );
  useEffect(() => {
    fetch("http://127.0.0.1:3001/api/admin/orders", { headers })
      .then((r) => r.json())
      .then(setOrders);
  }, [headers]);
  const update = async (
    id: number,
    patch: { status?: string; payment_status?: string },
  ) => {
    await fetch(`http://127.0.0.1:3001/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setOrders((v) => v.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };
  const open = async (id: number) =>
    setDetail(
      await fetch(`http://127.0.0.1:3001/api/admin/orders/${id}`, {
        headers,
      }).then((r) => r.json()),
    );
  return (
    <section className="admin-table">
      <div>
        <h3>订单管理</h3>
      </div>
      <table>
        <thead>
          <tr>
            <th>订单号</th>
            <th>买家</th>
            <th>金额</th>
            <th>支付</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {!orders.length && <EmptyRow cols={6} text="暂无订单数据" />}
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.order_no}</td>
              <td>
                {o.nickname} {o.phone}
              </td>
              <td>¥{o.total_amount}</td>
              <td>{o.payment_status}</td>
              <td>{o.status}</td>
              <td>
                <button onClick={() => open(o.id)}>详情</button>
                <button
                  disabled={o.payment_status === "paid"}
                  onClick={() =>
                    update(o.id, {
                      status: "pending_ship",
                      payment_status: "paid",
                    })
                  }
                >
                  确认付款
                </button>
                <button onClick={() => update(o.id, { status: "completed" })}>
                  完成
                </button>
                <button
                  onClick={() =>
                    alert(`联系买家：${o.phone || "未绑定手机号"}`)
                  }
                >
                  联系买家
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {detail && (
        <div className="user-detail">
          <h3>订单 {detail.order_no}</h3>
          <p>
            买家：{detail.nickname} {detail.phone}
          </p>
          <p>
            商品项目：{detail.items?.length || 0} · 支付：
            {detail.payment_status} · 物流：
            {detail.logistics?.status || "待发货"}
          </p>
          <button onClick={() => setDetail(null)}>关闭详情</button>
        </div>
      )}
    </section>
  );
}
function Logistics({ token }: { token: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [company, setCompany] = useState("");
  const [tracking, setTracking] = useState("");
  const [stage, setStage] = useState("packed");
  const stages: Record<string, { percent: number; label: string }> = {
    pending: { percent: 0, label: "待处理/待打包" },
    packed: { percent: 25, label: "商品打包完成" },
    shipped: { percent: 50, label: "已发货/运输中" },
    delivering: { percent: 75, label: "配送中" },
    delivered: { percent: 100, label: "已完成/用户收货" },
  };
  const headers = useMemo(
    () => ({
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    }),
    [token],
  );
  useEffect(() => {
    fetch("http://127.0.0.1:3001/api/admin/orders", { headers })
      .then((r) => r.json())
      .then(setOrders);
  }, [headers]);
  const update = async (id: number) => {
    const response = await fetch(
      `http://127.0.0.1:3001/api/admin/orders/${id}/logistics`,
      {
      method: "PUT",
      headers,
      body: JSON.stringify({
        company,
        tracking_no: tracking,
        status: stage,
        progress_percent: stages[stage].percent,
        note: stages[stage].label,
      }),
      },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return alert(error.message || "物流更新失败");
    }
    alert(`物流已更新到 ${stages[stage].percent}%`);
  };
  return (
    <section className="admin-table">
      <div>
        <h3>物流管理</h3>
      </div>
      <div className="feishu-form">
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="物流公司"
        />
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder="物流单号"
        />
        <select value={stage} onChange={(e) => setStage(e.target.value)}>
          {Object.entries(stages).map(([value, item]) => (
            <option value={value} key={value}>
              {item.percent}% · {item.label}
            </option>
          ))}
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>订单号</th>
            <th>买家</th>
            <th>订单状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {!orders.length && <EmptyRow cols={4} text="暂无可处理物流订单" />}
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.order_no}</td>
              <td>
                {o.nickname} {o.phone}
              </td>
              <td>{o.status}</td>
              <td>
                <button onClick={() => update(o.id)}>更新并发货</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function AfterSales({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const headers = useMemo(
    () => ({
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    }),
    [token],
  );
  const load = useCallback(
    () =>
      Promise.all(
        ["complaints", "after-sales"].map((x) =>
          fetch(`http://127.0.0.1:3001/api/admin/${x}`, { headers }).then((r) =>
            r.json(),
          ),
        ),
      ).then(([a, b]) =>
        setItems([
          ...a.map((x: any) => ({ ...x, kind: "投诉" })),
          ...b.map((x: any) => ({ ...x, kind: "售后" })),
        ]),
      ),
    [headers],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const resolve = async (x: any) => {
    const result = prompt(
      x.kind === "投诉" ? "回复客户" : "填写处理结果",
      "已处理完成",
    );
    if (!result) return;
    const resource = x.kind === "投诉" ? "complaints" : "after-sales";
    await fetch(`http://127.0.0.1:3001/api/admin/${resource}/${x.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(
        x.kind === "投诉"
          ? { reply: result, status: "completed" }
          : { result, status: "completed" },
      ),
    });
    load();
  };
  return (
    <section className="admin-table">
      <div>
        <h3>客诉与售后</h3>
      </div>
      <table>
        <thead>
          <tr>
            <th>类型</th>
            <th>关联订单</th>
            <th>原因/内容</th>
            <th>状态</th>
            <th>处理</th>
          </tr>
        </thead>
        <tbody>
          {!items.length && <EmptyRow cols={5} text="暂无客诉或售后申请" />}
          {items.map((x) => (
            <tr key={`${x.kind}-${x.id}`}>
              <td>{x.kind}</td>
              <td>{x.order_id}</td>
              <td>{x.reason || x.content}</td>
              <td>{x.status}</td>
              <td>
                <button onClick={() => resolve(x)}>回复并完成</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function ContentManager({ token }: { token: string }) {
  const [banners, setBanners] = useState<any[]>([]),
    [categories, setCategories] = useState<any[]>([]);
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerImage, setBannerImage] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryImage, setCategoryImage] = useState("");
  const headers = useMemo(
    () => ({
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    }),
    [token],
  );
  const load = useCallback(() => {
    fetch("http://127.0.0.1:3001/api/admin/banners", { headers })
      .then((r) => r.json())
      .then(setBanners);
    fetch("http://127.0.0.1:3001/api/admin/categories", { headers })
      .then((r) => r.json())
      .then(setCategories);
  }, [headers]);
  useEffect(() => {
    load();
  }, [load]);
  const addBanner = async () => {
    if (!bannerTitle || !bannerImage) return alert("请填写 Banner 标题和图片");
    await fetch("http://127.0.0.1:3001/api/admin/banners", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: bannerTitle,
        image: bannerImage,
        link: "#",
        sort_order: banners.length + 1,
        status: "active",
      }),
    });
    setBannerTitle("");
    setBannerImage("");
    load();
  };
  const addCategory = async () => {
    if (!categoryName) return alert("请填写分类名称");
    await fetch("http://127.0.0.1:3001/api/admin/categories", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: categoryName,
        image: categoryImage,
        sort_order: categories.length + 1,
        status: "active",
      }),
    });
    setCategoryName("");
    setCategoryImage("");
    load();
  };
  return (
    <section className="admin-table">
      <div>
        <h3>首页内容管理</h3>
      </div>
      <div className="feishu-form">
        <input
          value={bannerTitle}
          onChange={(e) => setBannerTitle(e.target.value)}
          placeholder="Banner 标题"
        />
        <input
          value={bannerImage}
          onChange={(e) => setBannerImage(e.target.value)}
          placeholder="Banner 图片地址"
        />
        <button onClick={addBanner}>新增 Banner</button>
      </div>
      <div className="feishu-form">
        <input
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
          placeholder="分类名称"
        />
        <input
          value={categoryImage}
          onChange={(e) => setCategoryImage(e.target.value)}
          placeholder="分类图片地址"
        />
        <button onClick={addCategory}>新增分类</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>类型</th>
            <th>标题</th>
            <th>排序</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {banners.map((x) => (
            <tr key={`b-${x.id}`}>
              <td>Banner</td>
              <td>{x.title}</td>
              <td>{x.sort_order}</td>
              <td>{x.status}</td>
            </tr>
          ))}
          {categories.map((x) => (
            <tr key={`c-${x.id}`}>
              <td>分类</td>
              <td>{x.name}</td>
              <td>{x.sort_order}</td>
              <td>{x.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FeishuManager({ token }: { token: string }) {
  const [configs, setConfigs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [appId, setAppId] = useState("cli_a902ca6a2cb85cc0");
  const [tableId, setTableId] = useState("tblUaCqyE3xkk1Bj");
  const [notice, setNotice] = useState("");
  const headers = useMemo(
    () => ({
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    }),
    [token],
  );
  const load = useCallback(() => {
    fetch("http://127.0.0.1:3001/api/admin/feishu/configs", { headers })
      .then((r) => r.json())
      .then(setConfigs);
    fetch("http://127.0.0.1:3001/api/admin/feishu/tasks", { headers })
      .then((r) => r.json())
      .then(setTasks);
  }, [headers]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async () => {
    setNotice("");
    const response = await fetch("http://127.0.0.1:3001/api/admin/feishu/configs", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name,
        document_url: url,
        app_id: appId,
        table_id: tableId,
        field_mapping: {
          name: "宠物名称",
          breed: "品种",
          price: "价格",
          images: "图片",
          videos: "视频",
        },
      }),
    });
    const result = await response.json();
    if (!response.ok) return setNotice(result.message || "保存失败");
    setName("");
    setUrl("");
    load();
    setNotice("飞书连接配置已保存；真实读取还需要服务端 FEISHU_APP_SECRET。 ");
  };
  const sync = async (id: number) => {
    setNotice("正在创建真实飞书读取任务…");
    const response = await fetch("http://127.0.0.1:3001/api/admin/feishu/sync", {
      method: "POST",
      headers,
      body: JSON.stringify({
        config_id: id,
        mode: "incremental",
        read_remote: true,
        batch_size: 500,
      }),
    });
    const result = await response.json();
    if (!response.ok) return setNotice(result.message || "同步任务创建失败");
    setNotice(`任务 #${result.taskId} 已创建，请点击“刷新任务”查看真实结果。`);
    window.setTimeout(load, 800);
  };
  const taskAction = async (
    id: number,
    action: "pause" | "resume" | "retry",
  ) => {
    await fetch(
      `http://127.0.0.1:3001/api/admin/feishu/tasks/${id}/${action}`,
      {
        method: "POST",
        headers,
      },
    );
    load();
  };
  return (
    <section className="admin-table">
      <div>
        <h3>飞书数据源</h3>
      </div>
      <div className="feishu-form">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="数据源名称"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="飞书多维表格链接"
        />
        <input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="飞书 App ID" />
        <input value={tableId} onChange={(e) => setTableId(e.target.value)} placeholder="数据表 Table ID" />
        <button onClick={save}>保存连接</button>
      </div>
      {notice && <p className="feishu-notice">{notice}</p>}
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>文档链接</th>
            <th>字段映射</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {!configs.length && <EmptyRow cols={4} text="暂无飞书数据源，请先填写上方连接信息" />}
          {configs.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.document_url}</td>
              <td>名称、品种、价格、媒体</td>
              <td>
                <button onClick={() => sync(c.id)}>增量同步</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <h3>同步任务队列</h3>
        <button onClick={load}>刷新任务</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>任务</th>
            <th>状态</th>
            <th>进度</th>
            <th>成功/失败</th>
            <th>批量</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {!tasks.length && <EmptyRow cols={6} text="暂无同步任务" />}
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>#{t.id}</td>
              <td>{t.status}</td>
              <td>
                {t.processed || 0}/{t.total || 0}
              </td>
              <td>
                {t.success || 0}/{t.failed || 0}
              </td>
              <td>{t.batch_size || 500}</td>
              <td>
                <button onClick={() => taskAction(t.id, "pause")}>暂停</button>
                <button onClick={() => taskAction(t.id, "resume")}>继续</button>
                <button onClick={() => taskAction(t.id, "retry")}>重试</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tasks.some((task) => task.error) && (
        <div className="feishu-errors">
          <h3>最近同步错误</h3>
          {tasks.filter((task) => task.error).slice(0, 5).map((task) => (
            <p key={`error-${task.id}`}>任务 #{task.id}：{task.error}</p>
          ))}
        </div>
      )}
    </section>
  );
}

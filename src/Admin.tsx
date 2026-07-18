import { useCallback, useEffect, useMemo, useState } from "react";
import { halls } from "./catalog";
import "./Admin.css";
import "./AdminLogin.css";
import "./Feishu.css";
import "./AdminCommunity.css";
import { announceDataChange, subscribeDataChange } from "./dataEvents";
import { mediaUrl } from "./mediaUrl";
const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? "" : "http://127.0.0.1:3001");
const adminMediaUrl = (url?: string) => mediaUrl(url);

type AdminTab =
  | "dashboard"
  | "products"
  | "users"
  | "orders"
  | "transactions"
  | "logistics"
  | "afterSales"
  | "other"
  | "merchants"
  | "reviews"
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
    fetch(`${API_BASE}/api/admin/stats`, {
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
      updateToken={(nextToken) => {
        localStorage.setItem("fuchong-admin-token", nextToken);
        setToken(nextToken);
      }}
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
      const r = await fetch(`${API_BASE}/api/admin/login`, {
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
        <small>登录凭证由平台管理员单独配置，请勿向他人透露</small>
      </form>
    </div>
  );
}
function AdminPanel({ token, logout, updateToken }: { token: string; logout: () => void; updateToken: (token: string) => void }) {
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [formError, setFormError] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const changeAdminPassword = async () => {
    const currentPassword = prompt("请输入当前管理员密码");
    if (!currentPassword) return;
    const newPassword = prompt("请输入新密码（至少12位，包含大小写字母和数字）");
    if (!newPassword) return;
    const response = await fetch(`${API_BASE}/api/admin/change-password`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return alert(result.message || "密码修改失败");
    updateToken(result.token);
    alert("管理员密码已更新，其他旧登录凭证已失效");
  };
  const loadProducts = useCallback(() => {
    setProductsLoading(true);
    setProductsError("");
    fetch(`${API_BASE}/api/admin/pets?pageSize=500`, {
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
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);
  useEffect(() => subscribeDataChange("products", loadProducts), [loadProducts]);
  const breeds = useMemo(
    () => halls.find((h) => h.key === form.hall)?.breeds || [],
    [form.hall],
  );
  const update = (key: keyof ProductForm, value: string) =>
    setForm((v) => ({ ...v, [key]: value }));
  const uploadMedia = async (file: File, key: "images" | "videos") => {
    setFormError("");
    if (file.size > 10 * 1024 * 1024)
      return setFormError("单个文件不能超过 10MB");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsDataURL(file);
    });
    const response = await fetch(`${API_BASE}/api/admin/uploads`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        fileName: file.name,
        type: file.type,
        data: dataUrl.split(",")[1] || "",
      }),
    });
    const result = await response.json();
    if (!response.ok) return setFormError(result.message || "文件上传失败");
    setForm((current) => ({
      ...current,
      [key]: [current[key], result.url].filter(Boolean).join(","),
    }));
  };
  const openNewProduct = () => {
    setEditingProductId(null);
    setForm(emptyProduct);
    setFormError("");
    setShowForm(true);
  };
  const openEditProduct = async (product: any) => {
    setFormError("");
    const headers = { authorization: `Bearer ${token}` };
    const [detailResponse, inventoryResponse] = await Promise.all([
      fetch(`${API_BASE}/api/admin/pets/${product.id}`, { headers }),
      fetch(`${API_BASE}/api/admin/pets/${product.id}/inventory`, { headers }),
    ]);
    const detail = await detailResponse.json();
    const inventory = await inventoryResponse.json();
    if (!detailResponse.ok) return setProductsError(detail.message || "商品详情加载失败");
    setEditingProductId(product.id);
    setForm({
      name: detail.name || "",
      hall: halls[Math.max(0, Number(detail.category_id || 1) - 1)]?.key || "cats",
      breed: detail.breed || "",
      price: String(detail.price || ""),
      gender: detail.gender || "female",
      age: String(detail.age_months || ""),
      color: detail.color || "",
      bodyType: detail.body_type || "",
      personality: detail.personality || "",
      health: detail.health_status || "",
      vaccine: detail.vaccine_record || "",
      father: detail.father_info || "",
      mother: detail.mother_info || "",
      growth: detail.growth_profile || "1个月,2个月,3个月,6个月,1岁,2岁",
      images: Array.isArray(detail.images) ? detail.images.map((item: any) => item.url).join(",") : "",
      videos: Array.isArray(detail.videos) ? detail.videos.map((item: any) => item.url).join(",") : "",
      seller: detail.seller_name || "",
      stock: String(Array.isArray(inventory) ? inventory.reduce((sum: number, item: any) => sum + Number(item.total_stock || 0), 0) : 0),
      status: detail.status || "draft",
    });
    setShowForm(true);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
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
      stock: Number(form.stock || 0),
    };
    const r = await fetch(
      `${API_BASE}/api/admin/pets${editingProductId ? `/${editingProductId}` : ""}`,
      {
      method: editingProductId ? "PATCH" : "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      },
    );
    if (r.ok) {
      const saved = await r.json();
      const productId = Number(saved.id || editingProductId);
      if (editingProductId) {
        await fetch(`${API_BASE}/api/admin/pets/${productId}/inventory`, {
          method: "PATCH",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ total_stock: Number(form.stock || 0) }),
        });
      }
      const mediaHeaders = { "content-type": "application/json", authorization: `Bearer ${token}` };
      for (const [index, url] of form.images.split(",").map((item) => item.trim()).filter(Boolean).entries())
        await fetch(`${API_BASE}/api/admin/pets/${productId}/images`, { method: "POST", headers: mediaHeaders, body: JSON.stringify({ url, type: index === 0 ? "main" : "gallery", sort_order: index, replace_main: Boolean(editingProductId && index === 0) }) });
      for (const [index, url] of form.videos.split(",").map((item) => item.trim()).filter(Boolean).entries())
        await fetch(`${API_BASE}/api/admin/pets/${productId}/videos`, { method: "POST", headers: mediaHeaders, body: JSON.stringify({ url, replace_main: Boolean(editingProductId && index === 0) }) });
      setProducts((v) =>
        editingProductId
          ? v.map((item) => (item.id === productId ? { ...item, ...saved } : item))
          : [saved, ...v],
      );
      setShowForm(false);
      setForm(emptyProduct);
      setEditingProductId(null);
    } else {
      const error = await r.json().catch(() => ({}));
      setFormError(error.message || "商品保存失败");
    }
  };
  return (
    <div className="admin-shell">
      <aside>
        <div className="admin-brand">
          <b>福</b>
          <span>
            福宠运营后台<small>运营管理中心</small>
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
            ["other", "✦", "其他申请"],
            ["merchants", "店", "商家入驻"],
            ["reviews", "言", "评价内容"],
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
            <small>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "full" }).format(new Date())}</small>
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
                  other: "其他申请",
                  merchants: "商家入驻审核",
                  reviews: "评价内容",
                  content: "首页内容",
                  feishu: "飞书同步",
                }[tab]
              }
            </h1>
          </div>
          <div className="admin-user">
            运营管理员 <b>管</b>
            <button className="admin-logout" onClick={changeAdminPassword}>修改密码</button>
            <button className="admin-logout" onClick={logout}>退出</button>
          </div>
        </header>
        {tab === "dashboard" && <Dashboard token={token} />}
        {tab === "products" && (
          productsLoading ? <div className="admin-state">商品数据加载中…</div> : productsError ? <div className="admin-state error">{productsError}</div> : <Products
              products={products}
              open={openNewProduct}
              edit={openEditProduct}
              token={token}
              reload={loadProducts}
              update={(id, patch) =>
                setProducts((v) =>
                  v.map((p) => (p.id === id ? { ...p, ...patch } : p)),
                )
              }
              remove={async (id) => {
                await fetch(`${API_BASE}/api/admin/pets/${id}`, {
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
        {tab === "other" && <CommunityApplications token={token} />}
        {tab === "merchants" && <MerchantApplications token={token} />}
        {tab === "reviews" && <ReviewsManager token={token} products={products} />}
        {tab === "content" && <ContentManager token={token} />}
        {tab === "feishu" && <FeishuManager token={token} />}
      </main>
      {showForm && (
        <div className="admin-modal">
          <form onSubmit={save}>
            <header>
              <div>
                <small>宠物商品资料</small>
                <h2>{editingProductId ? "编辑宠物商品" : "新增宠物商品"}</h2>
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
              <label>
                上传商品图片
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], "images")} />
              </label>
              <Field
                label="视频地址（逗号分隔）"
                value={form.videos}
                set={(v) => update("videos", v)}
              />
              <label>
                上传商品视频
                <input type="file" accept="video/mp4" onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], "videos")} />
              </label>
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
                  <option value="offline">下架</option>
                  <option value="sold">已售出</option>
                </select>
              </label>
            </div>
            {formError && <p className="admin-form-error">{formError}</p>}
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
    fetch(`${API_BASE}/api/admin/stats`, {
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
  const trend = Array.isArray(stats?.trends) ? stats.trends : [];
  const maxTrend = Math.max(1, ...trend.map((item: any) => Number(item.orders || 0)));
  const trendTotals = trend.reduce((summary: any, item: any) => ({
    orders: summary.orders + Number(item.orders || 0),
    paid: summary.paid + Number(item.paid_orders || 0),
    revenue: summary.revenue + Number(item.revenue || 0),
    activeUsers: summary.activeUsers + Number(item.active_users || 0),
    views: summary.views + Number(item.views || 0),
  }), { orders: 0, paid: 0, revenue: 0, activeUsers: 0, views: 0 });
  const paidRate = trendTotals.orders ? Math.round((trendTotals.paid / trendTotals.orders) * 100) : 0;
  const averageOrderValue = trendTotals.paid ? Math.round(trendTotals.revenue / trendTotals.paid) : 0;
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
            {trend.length ? trend.map((item: any) => (
              <span className="chart-column" title={`${item.day}：下单${item.orders}，支付${item.paid_orders}，成交¥${item.revenue}`} key={item.day}>
                <b>{item.orders}</b>
                <i style={{ height: `${Math.max(8, (Number(item.orders || 0) / maxTrend) * 100)}%` }} />
                <small>{String(item.day).slice(5)}</small>
              </span>
            )) : <span>暂无订单趋势数据</span>}
          </div>
          <div className="trend-analysis">
            <span><b>{trendTotals.orders}</b><small>7日下单</small></span>
            <span><b>{trendTotals.paid}</b><small>支付订单</small></span>
            <span><b>{paidRate}%</b><small>支付转化</small></span>
            <span><b>¥{trendTotals.revenue}</b><small>成交金额</small></span>
            <span><b>¥{averageOrderValue}</b><small>实付客单价</small></span>
          </div>
          <p className="chart-summary">真实数据库近7日 · 活跃用户 {trendTotals.activeUsers} · 商品浏览 {trendTotals.views}</p>
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
  edit,
  remove,
  update,
  token,
  reload,
}: {
  products: any[];
  open: () => void;
  edit: (product: any) => void;
  remove: (id: number) => void;
  update: (id: number, patch: any) => void;
  token: string;
  reload: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [batching, setBatching] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const patch = async (id: number, data: any) => {
    try {
      const r = await fetch(`${API_BASE}/api/admin/pets/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(data),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(result.message || "商品状态更新失败");
      update(id, result);
      setNotice(result.product_status === "available" ? "商品已上架，前台已同步显示。" : "商品已下架，用户端已同步更新。");
      announceDataChange("products");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "商品状态更新失败");
    }
  };
  const sku = async (p: any) => {
    const name = prompt("SKU 名称", "标准档案");
    const stock = prompt("库存数量", "1");
    if (name && stock)
      await fetch(`${API_BASE}/api/admin/pets/${p.id}/skus`, {
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
      await fetch(`${API_BASE}/api/admin/pets/${p.id}/${type}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url }),
      });
  };
  const batch = async (status: string) => {
    if (!selected.length) return setNotice("请先勾选需要批量处理的商品。");
    setBatching(true);
    setNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/pets/bulk-status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ ids: selected, status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "批量更新失败");
      const productStatus = result.product_status || (status === "published" ? "available" : "offline");
      selected.forEach((id) => update(id, { status, product_status: productStatus }));
      announceDataChange("products");
      setSelected([]);
      setNotice(`已更新 ${result.changed} 个商品。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "批量更新失败");
    } finally {
      setBatching(false);
    }
  };
  const offlineAll = async () => {
    if (!window.confirm("确定一键下架全部宠物商品吗？此操作不会删除商品资料。")) return;
    setBatching(true);
    setNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/pets/bulk-status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ scope: "all", status: "offline" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "全部下架失败");
      products.forEach((product) => update(product.id, { status: "offline", product_status: "offline" }));
      announceDataChange("products");
      setSelected([]);
      setNotice(`全部商品已下架，共处理 ${result.changed} 个商品。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "全部下架失败");
    } finally {
      setBatching(false);
    }
  };
  const bulkImport = async () => {
    const text = prompt("粘贴商品 JSON 数组");
    if (!text) return;
    try {
      const list = JSON.parse(text);
      for (const item of list) {
        await fetch(`${API_BASE}/api/admin/pets`, {
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
  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const productStatus = product.product_status || (product.status === "published" ? "available" : "offline");
      if (statusFilter !== "all" && productStatus !== statusFilter) return false;
      if (!needle) return true;
      return [product.id, product.name, product.breed, product.seller_name, product.business_id, product.external_id]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [products, query, statusFilter]);
  return (
    <section className="admin-table">
      <div>
        <h3>宠物商品管理</h3>
        <span>
          <button onClick={bulkImport}>批量上传</button>{" "}
          <button disabled={batching || !selected.length} onClick={() => batch("published")}>批量上架</button>{" "}
          <button disabled={batching || !selected.length} onClick={() => batch("offline")}>批量下架</button>{" "}
          <button className="danger" disabled={batching || !products.length} onClick={offlineAll}>{batching ? "处理中…" : "一键下架全部"}</button>{" "}
          <button onClick={open}>＋ 新增宠物</button>
        </span>
      </div>
      <div className="product-search-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索商品名、品种、商家或商品 ID" />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">全部状态</option>
          <option value="available">前台在售</option>
          <option value="offline">已下架</option>
          <option value="sold">已售出</option>
        </select>
        <span>找到 {visibleProducts.length} / {products.length} 个商品</span>
        <button onClick={reload}>刷新商品</button>
      </div>
      {notice && <p className="feishu-notice">{notice}</p>}
      <table>
        <thead>
          <tr>
            {["选择", "商品ID", "媒体", "宠物名称", "品种", "售价", "状态", "操作"].map(
              (x) => (
                <th key={x}>{x}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {visibleProducts.map((p) => (
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
              <td>{p.image ? <div className="admin-product-media"><img src={adminMediaUrl(p.image)} alt={p.name} loading="lazy" /><small>{p.image_count || 0}图 · {p.video_count || 0}视频</small></div> : <span>待上传</span>}</td>
              <td>
                <b>{p.name}</b>
              </td>
              <td>{p.breed}</td>
              <td>¥{p.price}</td>
              <td>
                <span>{p.product_status === "available" && p.status === "published" ? "前台在售" : p.product_status === "sold" ? "已售出" : "已下架"}</span>
                <small>{p.status} / {p.product_status || "未建销售记录"}</small>
              </td>
              <td>
                <button onClick={() => edit(p)}>编辑资料</button>
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
    fetch(`${API_BASE}/api/admin/payments`, {
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
    fetch(`${API_BASE}/api/admin/users`, { headers })
      .then((r) => r.json())
      .then(setUsers);
  }, [headers]);
  const open = async (id: number) =>
    setDetail(
      await fetch(`${API_BASE}/api/admin/users/${id}`, {
        headers,
      }).then((r) => r.json()),
    );
  const toggleStatus = async (user: any) => {
    const status = user.status === "disabled" ? "active" : "disabled";
    const response = await fetch(
      `${API_BASE}/api/admin/users/${user.id}`,
      {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    const result = await response.json();
    if (!response.ok) return alert(result.message || "用户状态更新失败");
    setUsers((current) =>
      current.map((item) => (item.id === user.id ? { ...item, status } : item)),
    );
  };
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
                <button onClick={() => toggleStatus(u)}>{u.status === "disabled" ? "启用" : "停用"}</button>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const headers = useMemo(
    () => ({ authorization: `Bearer ${token}` }),
    [token],
  );
  const statusOptions: [string, string][] = [
    ["pending_payment", "待付款"],
    ["pending_confirm", "已付款/待处理"],
    ["pending_ship", "已确认/待发货"],
    ["packed", "打包中"],
    ["shipped", "已发货"],
    ["in_transit", "运输中"],
    ["delivering", "配送中"],
    ["pending_receive", "待收货"],
    ["completed", "已完成"],
    ["cancelled", "已取消"],
    ["after_sale", "售后"],
  ];
  const transitions: Record<string, string[]> = {
    pending_payment: ["pending_confirm", "cancelled"],
    pending_confirm: ["pending_ship", "packed", "cancelled", "after_sale"],
    pending_ship: ["packed", "shipped", "cancelled", "after_sale"],
    packed: ["shipped", "cancelled", "after_sale"],
    shipped: ["in_transit", "delivering", "pending_receive", "after_sale"],
    in_transit: ["delivering", "pending_receive", "after_sale"],
    delivering: ["pending_receive", "completed", "after_sale"],
    pending_receive: ["completed", "after_sale"],
    completed: ["after_sale"],
    cancelled: [],
    after_sale: ["completed", "cancelled"],
  };
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders`, { headers });
      const result = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(result))
        throw new Error(result?.message || `订单服务响应异常（${response.status}）`);
      setOrders(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "订单加载失败");
    } finally {
      setLoading(false);
    }
  }, [headers]);
  useEffect(() => {
    void load();
  }, [load]);
  const update = async (
    id: number,
    patch: { status?: string; payment_status?: string },
  ) => {
    setBusyId(id);
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `订单更新失败（${response.status}）`);
      setOrders((current) => current.map((order) => (order.id === id ? { ...order, ...result } : order)));
      announceDataChange("orders");
    } catch (updateError) {
      alert(updateError instanceof Error ? updateError.message : "订单更新失败");
      await load();
    } finally {
      setBusyId(null);
    }
  };
  const markPaid = async (id: number) => {
    setBusyId(id);
    try {
      let paidOrder: any = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(`${API_BASE}/api/admin/orders/${id}/payment`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ method: "admin_manual", note: "管理员确认已付款" }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          paidOrder = result;
          break;
        }
        if ((response.status < 500 && !result.retryable) || attempt === 2)
          throw new Error(result.message || `确认付款失败（${response.status}）`);
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
      if (!paidOrder) throw new Error("付款状态暂未确认，请刷新后重试");
      setOrders((current) => current.map((order) => (order.id === id ? { ...order, ...paidOrder } : order)));
      if (detail?.id === id) setDetail((current: any) => current ? { ...current, ...paidOrder } : current);
      announceDataChange("orders");
    } catch (paymentError) {
      alert(paymentError instanceof Error ? paymentError.message : "确认付款失败");
      await load();
    } finally {
      setBusyId(null);
    }
  };
  const confirmOrder = async (id: number) => {
    setBusyId(id);
    try {
      let confirmed: any = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(`${API_BASE}/api/admin/orders/${id}/confirm`, {
          method: "POST",
          headers,
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          confirmed = result;
          break;
        }
        const retryable = response.status >= 500 || result.retryable;
        if (!retryable || attempt === 2)
          throw new Error(result.message || `确认订单失败（${response.status}）`);
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
      if (!confirmed) throw new Error("确认订单暂未完成，请刷新后重试");
      setOrders((current) => current.map((order) => (order.id === id ? { ...order, ...confirmed } : order)));
      if (detail?.id === id) setDetail((current: any) => current ? { ...current, ...confirmed } : current);
      announceDataChange("orders");
    } catch (confirmError) {
      alert(confirmError instanceof Error ? confirmError.message : "确认订单失败");
      await load();
    } finally {
      setBusyId(null);
    }
  };
  const open = async (id: number) => {
    setBusyId(id);
    try {
      const response = await fetch(`${API_BASE}/api/admin/orders/${id}`, { headers });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "订单详情加载失败");
      setDetail(result);
    } catch (detailError) {
      alert(detailError instanceof Error ? detailError.message : "订单详情加载失败");
    } finally {
      setBusyId(null);
    }
  };
  return (
    <section className="admin-table">
      <div>
        <h3>订单管理</h3>
        <button onClick={load} disabled={loading}>刷新订单</button>
      </div>
      {error && <p className="feishu-notice">{error}　<button onClick={load}>重新加载</button></p>}
      <table>
        <thead>
          <tr>
            <th>订单号</th>
            <th>买家</th>
            <th>访问/绑定</th>
            <th>金额</th>
            <th>支付</th>
            <th>支付时间</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {loading && <EmptyRow cols={8} text="订单数据加载中…" />}
          {!loading && !orders.length && <EmptyRow cols={8} text={error ? "订单服务暂不可用" : "暂无订单数据"} />}
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.order_no}</td>
              <td>
                {o.nickname || "访问用户"}
              </td>
              <td>{o.visitor_sessions ? `访问用户 · ${o.visit_count} 次` : "注册用户"}<small>{o.phone_bound ? `已绑定 ${o.phone}` : "未绑定手机号"}</small></td>
              <td>¥{o.total_amount}</td>
              <td>{o.payment_status}</td>
              <td>{o.paid_at ? String(o.paid_at).replace("T", " ").slice(0, 19) : "尚未支付"}</td>
              <td>{o.status}</td>
              <td>
                <button disabled={busyId === o.id} onClick={() => open(o.id)}>详情</button>
                <button
                  disabled={busyId === o.id || o.payment_status === "paid"}
                  onClick={() => markPaid(o.id)}
                >
                  确认付款
                </button>
                <button
                  className="primary"
                  disabled={busyId === o.id || o.payment_status !== "paid" || o.status !== "pending_confirm"}
                  onClick={() => confirmOrder(o.id)}
                >
                  {busyId === o.id
                    ? "处理中…"
                    : ["pending_ship", "packed", "shipped", "in_transit", "delivering", "pending_receive", "completed"].includes(o.status)
                      ? "订单已确认"
                      : "确认订单"}
                </button>
                <select disabled={busyId === o.id} value={o.status} onChange={(event) => update(o.id, { status: event.target.value })}>
                  {statusOptions.filter(([value]) => value === o.status || (transitions[o.status] || []).includes(value)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
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
            买家：{detail.nickname || "访问用户"} · {detail.phone_bound ? `手机号 ${detail.phone}` : "手机号未绑定"}
          </p>
          <p>访问记录：{detail.visit_count || 0} 次 · 支付时间：{detail.paid_at ? String(detail.paid_at).replace("T", " ").slice(0, 19) : "尚未支付"}</p>
          <p>
            商品项目：{detail.items?.length || 0} · 支付：
            {detail.payment_status} · 物流：
            {detail.logistics?.status || "待发货"}
          </p>
          <p>宠物原价：¥{detail.subtotal_amount ?? detail.total_amount} · 新人补贴：¥{detail.discount_amount || 0} · 托运费：¥{detail.shipping_fee || 0}</p>
          <p>40日更换保障：{detail.guarantee_eligible ? "已包含（补贴后宠物成交价不高于3000元）" : "不包含"}</p>
          {!!detail.status_history?.length && <div className="order-history"><b>订单状态记录</b>{detail.status_history.map((event: any) => <p key={event.id}>{event.created_at}　{event.from_status || "创建"} → {event.to_status}</p>)}</div>}
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
    fetch(`${API_BASE}/api/admin/orders`, { headers })
      .then((r) => r.json())
      .then(setOrders);
  }, [headers]);
  const update = async (id: number) => {
    const response = await fetch(
      `${API_BASE}/api/admin/orders/${id}/logistics`,
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
        ["complaints", "after-sales", "seller-reports"].map((x) =>
          fetch(`${API_BASE}/api/admin/${x}`, { headers }).then((r) =>
            r.json(),
          ),
        ),
      ).then(([a, b, c]) =>
        setItems([
          ...a.map((x: any) => ({ ...x, kind: "投诉" })),
          ...b.map((x: any) => ({ ...x, kind: "售后" })),
          ...c.map((x: any) => ({ ...x, kind: "商家举报" })),
        ]),
      ),
    [headers],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const resolve = async (x: any, status: "processing" | "rejected" | "completed") => {
    const result = prompt(
      x.kind === "投诉" ? "回复客户" : x.kind === "商家举报" ? "填写平台核实结果" : "填写处理结果",
      status === "processing" ? "已受理，正在核实" : status === "rejected" ? "申请资料不符合退款条件" : "已处理完成",
    );
    if (!result) return;
    const resource = x.kind === "投诉" ? "complaints" : x.kind === "商家举报" ? "seller-reports" : "after-sales";
    const response = await fetch(`${API_BASE}/api/admin/${resource}/${x.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(
        x.kind === "投诉"
          ? { reply: result, status: "completed" }
          : x.kind === "商家举报"
            ? { reply: result, status }
            : { result, status },
      ),
    });
    const payload = await response.json();
    if (!response.ok) return alert(payload.message || "处理失败");
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
            <th>关联对象</th>
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
              <td>{x.kind === "商家举报" ? <>{x.seller_name}<small>{x.pet_name || "未关联具体商品"} · {x.contact_phone || "未留联系电话"}</small></> : x.order_id}</td>
              <td>{x.kind === "商家举报" ? <><b>{x.category}</b><small>{x.content}</small></> : x.reason || x.content}</td>
              <td>{x.status}</td>
              <td>
                {x.kind === "售后" && x.status !== "completed" && <button onClick={() => resolve(x, "processing")}>受理</button>}
                {x.kind === "售后" && x.status !== "completed" && <button onClick={() => resolve(x, "rejected")}>驳回</button>}
                {x.kind === "商家举报" && x.status === "pending" && <button onClick={() => resolve(x, "processing")}>受理核实</button>}
                <button onClick={() => resolve(x, "completed")}>回复并完成</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function MerchantApplications({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [accountDrafts, setAccountDrafts] = useState<Record<number, { username: string; password: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const headers = useMemo(() => ({ authorization: `Bearer ${token}`, "content-type": "application/json" }), [token]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/merchant-applications`, { headers, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "商家申请加载失败");
      setItems(payload);
      setAccountDrafts(Object.fromEntries(payload.map((item: any) => [item.id, {
        username: item.account_username || `merchant_${item.id}`,
        password: "",
      }])));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "商家申请加载失败"); }
    finally { setLoading(false); }
  }, [headers]);
  useEffect(() => { void load(); }, [load]);
  const review = async (item: any, status: "approved" | "rejected") => {
    const reply = status === "approved" ? "资料审核通过，商家账号已启用" : prompt("填写未通过原因", "资料暂不符合平台入驻要求");
    if (!reply) return;
    let username: string | undefined = accountDrafts[item.id]?.username.trim();
    let password: string | undefined = accountDrafts[item.id]?.password;
    if (status === "approved") {
      if (!/^[a-zA-Z0-9_]{4,24}$/.test(username || "")) return alert("请填写 4-24 位字母、数字或下划线登录账号");
      if ((password || "").length < 8) return alert("请填写至少 8 位的登录密码");
    }
    const response = await fetch(`${API_BASE}/api/admin/merchant-applications/${item.id}`, { method: "PATCH", headers, body: JSON.stringify({ status, admin_reply: reply, username, password }) });
    const payload = await response.json();
    if (!response.ok) return alert(payload.message || "审核失败");
    await load();
  };
  const toggleAccount = async (item: any) => {
    const next = item.account_status === "active" ? "disabled" : "active";
    if (!confirm(next === "disabled" ? "确认停用该商家登录账号？已上架商品不会自动删除。" : "确认重新启用该商家账号？")) return;
    const response = await fetch(`${API_BASE}/api/admin/merchant-accounts/${item.merchant_account_id}`, { method: "PATCH", headers, body: JSON.stringify({ status: next }) });
    if (!response.ok) return alert("账号状态更新失败");
    await load();
  };
  const resetAccount = async (item: any) => {
    const username = accountDrafts[item.id]?.username.trim() || "";
    const password = accountDrafts[item.id]?.password || "";
    if (!/^[a-zA-Z0-9_]{4,24}$/.test(username)) return alert("请填写 4-24 位字母、数字或下划线登录账号");
    if (password.length < 8) return alert("请输入至少 8 位的新密码");
    const response = await fetch(`${API_BASE}/api/admin/merchant-accounts/${item.merchant_account_id}`, { method: "PATCH", headers, body: JSON.stringify({ username, password }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return alert(payload.message || "账号密码更新失败");
    alert("商家登录账号与密码已更新"); await load();
  };
  return <section className="admin-table merchant-review-table">
    <div><h3>商家入驻与账号审核</h3><small>经营账号与商品详情展示商家完全分离；这里只审核操作权限，不改变前台随机商家档案。</small></div>
    {loading ? <div className="admin-state">商家申请加载中…</div> : error ? <div className="admin-state error">{error}<button onClick={() => void load()}>重试</button></div> : <table>
      <thead><tr><th>申请与店铺</th><th>联系人</th><th>经营资料</th><th>账号状态</th><th>审核操作</th></tr></thead>
      <tbody>{!items.length && <EmptyRow cols={5} text="暂无商家入驻申请" />}{items.map((item) => <tr key={item.id}>
        <td><b>{item.shop_name}</b><small>{item.application_no}<br />登录账号：{item.account_username || "待管理员设置"}</small></td>
        <td>{item.applicant_name}<small>{item.contact_phone}<br />{item.city || "未填写城市"}</small></td>
        <td><small>{item.business_description || "未填写补充说明"}</small></td>
        <td><span className={`community-status ${item.status}`}>{item.status === "pending" ? "待审核" : item.status === "approved" ? "已通过" : "未通过"}</span><small>{item.account_status ? `账号：${item.account_status === "active" ? "可登录" : "已停用"}` : "尚未创建账号"}<br />商品 {item.product_count || 0} 件</small></td>
        <td><div className="merchant-account-editor">
          {(item.status === "pending" || item.merchant_account_id) && <>
            <input aria-label={`${item.shop_name}商家登录账号`} value={accountDrafts[item.id]?.username || ""} placeholder="登录账号" onChange={(event) => setAccountDrafts((current) => ({ ...current, [item.id]: { username: event.target.value, password: current[item.id]?.password || "" } }))} />
            <input aria-label={`${item.shop_name}商家登录密码`} value={accountDrafts[item.id]?.password || ""} type="password" autoComplete="new-password" placeholder={item.merchant_account_id ? "输入新密码后重设" : "设置至少 8 位密码"} onChange={(event) => setAccountDrafts((current) => ({ ...current, [item.id]: { username: current[item.id]?.username || "", password: event.target.value } }))} />
          </>}
          <div className="community-admin-actions">{item.status === "pending" && <><button className="primary" onClick={() => review(item, "approved")}>审核通过并启用登录</button><button onClick={() => review(item, "rejected")}>驳回</button></>}{item.merchant_account_id && <><button className="primary" onClick={() => resetAccount(item)}>保存新账号密码</button><button onClick={() => toggleAccount(item)}>{item.account_status === "active" ? "停用账号" : "启用账号"}</button></>}</div>
        </div></td>
      </tr>)}</tbody>
    </table>}
  </section>;
}
function CommunityApplications({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const headers = useMemo(() => ({ authorization: `Bearer ${token}`, "content-type": "application/json" }), [token]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/community-applications`, { headers });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "申请数据加载失败");
      setItems(Array.isArray(payload) ? payload : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "申请数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [headers]);
  useEffect(() => { void load(); }, [load]);
  const resolve = async (item: any, status: "processing" | "approved" | "rejected" | "completed") => {
    const reply = prompt(
      status === "processing" ? "填写受理备注" : status === "approved" ? "填写通过说明" : status === "rejected" ? "填写未通过原因" : "填写完成说明",
      status === "processing" ? "已受理，运营人员将尽快联系" : status === "approved" ? "资料审核通过，请留意后续联系" : status === "rejected" ? "当前资料暂不符合申请条件" : "申请事项已处理完成",
    );
    if (!reply) return;
    const response = await fetch(`${API_BASE}/api/admin/community-applications/${item.id}`, { method: "PATCH", headers, body: JSON.stringify({ status, admin_reply: reply }) });
    const payload = await response.json();
    if (!response.ok) return alert(payload.message || payload.error || "处理失败");
    setItems((current) => current.map((record) => record.id === item.id ? payload : record));
  };
  const remove = async (item: any) => {
    if (!confirm(`确认删除申请 ${item.application_no}？此操作仅建议用于测试或无效记录。`)) return;
    const response = await fetch(`${API_BASE}/api/admin/community-applications/${item.id}`, { method: "DELETE", headers });
    if (!response.ok) return alert("删除失败");
    setItems((current) => current.filter((record) => record.id !== item.id));
  };
  const typeNames: Record<string, string> = { breed: "新品种申请", adoption: "领养申请", charity: "公益报名" };
  const statusNames: Record<string, string> = { pending: "待处理", processing: "处理中", approved: "已通过", rejected: "未通过", completed: "已完成" };
  const visible = typeFilter === "all" ? items : items.filter((item) => item.application_type === typeFilter);
  return (
    <section className="admin-table community-admin-table">
      <div className="community-admin-head"><div><h3>其他申请</h3><small>新品种、领养与公益报名统一进入这里处理</small></div><div className="community-admin-filters">{[["all","全部"],["breed","新品种"],["adoption","领养"],["charity","公益"]].map(([value,label]) => <button type="button" key={value} className={typeFilter === value ? "on" : ""} onClick={() => setTypeFilter(value)}>{label}</button>)}</div></div>
      {loading ? <div className="admin-state">申请数据加载中…</div> : error ? <div className="admin-state error">{error}<button type="button" onClick={() => void load()}>重试</button></div> : <table>
        <thead><tr><th>申请</th><th>申请人</th><th>内容</th><th>状态</th><th>处理</th></tr></thead>
        <tbody>
          {!visible.length && <EmptyRow cols={5} text="暂无对应申请" />}
          {visible.map((item) => <tr key={item.id}>
            <td><b>{typeNames[item.application_type] || item.application_type}</b><small>{item.application_no}<br />{new Date(`${item.created_at}Z`).toLocaleString("zh-CN")}</small></td>
            <td>{item.applicant_name}<small>{item.city || "未填写城市"} · {item.contact}<br />{item.user_nickname || "访客提交"}</small></td>
            <td><b>{item.subject}</b><small>{item.details}</small>{item.availability && <small>可参与：{item.availability}</small>}{item.experience && <details><summary>补充经历</summary>{item.experience}</details>}</td>
            <td><span className={`community-status ${item.status}`}>{statusNames[item.status] || item.status}</span>{item.admin_reply && <small>回复：{item.admin_reply}</small>}</td>
            <td><div className="community-admin-actions">{item.status === "pending" && <button onClick={() => resolve(item, "processing")}>受理</button>}{["pending","processing"].includes(item.status) && <button onClick={() => resolve(item, "approved")}>通过</button>}{["pending","processing"].includes(item.status) && <button onClick={() => resolve(item, "rejected")}>驳回</button>}<button onClick={() => resolve(item, "completed")}>完成</button>{["rejected","completed"].includes(item.status) && <button onClick={() => remove(item)}>删除</button>}</div></td>
          </tr>)}
        </tbody>
      </table>}
    </section>
  );
}
function ContentManager({ token }: { token: string }) {
  const [banners, setBanners] = useState<any[]>([]),
    [categories, setCategories] = useState<any[]>([]),
    [coupons, setCoupons] = useState<any[]>([]);
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerImage, setBannerImage] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryImage, setCategoryImage] = useState("");
  const [couponTitle, setCouponTitle] = useState("");
  const [couponAmount, setCouponAmount] = useState("");
  const [couponThreshold, setCouponThreshold] = useState("");
  const [couponExpires, setCouponExpires] = useState("");
  const headers = useMemo(
    () => ({
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    }),
    [token],
  );
  const load = useCallback(() => {
    fetch(`${API_BASE}/api/admin/banners`, { headers })
      .then((r) => r.json())
      .then(setBanners);
    fetch(`${API_BASE}/api/admin/categories`, { headers })
      .then((r) => r.json())
      .then(setCategories);
    fetch(`${API_BASE}/api/admin/coupons`, { headers })
      .then((r) => r.json())
      .then(setCoupons);
  }, [headers]);
  useEffect(() => {
    load();
  }, [load]);
  const addBanner = async () => {
    if (!bannerTitle || !bannerImage) return alert("请填写 Banner 标题和图片");
    await fetch(`${API_BASE}/api/admin/banners`, {
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
    await fetch(`${API_BASE}/api/admin/categories`, {
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
  const addCoupon = async () => {
    if (!couponTitle || Number(couponAmount) <= 0)
      return alert("请填写优惠券名称和有效面额");
    const response = await fetch(`${API_BASE}/api/admin/coupons`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: couponTitle,
        amount: Number(couponAmount),
        threshold: Number(couponThreshold || 0),
        expires_at: couponExpires || null,
        status: "active",
      }),
    });
    const result = await response.json();
    if (!response.ok) return alert(result.message || "新增优惠券失败");
    setCouponTitle("");
    setCouponAmount("");
    setCouponThreshold("");
    setCouponExpires("");
    load();
  };
  const couponAction = async (item: any, action: "toggle" | "issue") => {
    if (action === "issue") {
      const userId = prompt("请输入领取用户 ID");
      if (!userId) return;
      const response = await fetch(`${API_BASE}/api/admin/coupons/${item.id}/issue`, {
        method: "POST",
        headers,
        body: JSON.stringify({ user_id: Number(userId) }),
      });
      const result = await response.json();
      if (!response.ok) return alert(result.message || "发放失败");
      alert(result.duplicated ? "该用户已领取此券" : "优惠券已发放");
    } else {
      await fetch(`${API_BASE}/api/admin/coupons/${item.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: item.status === "active" ? "inactive" : "active" }),
      });
    }
    load();
  };
  const contentAction = async (
    resource: "banners" | "categories",
    item: any,
    action: "toggle" | "delete",
  ) => {
    if (action === "delete" && !confirm("确认删除或停用这条内容吗？")) return;
    const response = await fetch(
      `${API_BASE}/api/admin/${resource}/${item.id}`,
      {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers,
        body:
          action === "toggle"
            ? JSON.stringify({ status: item.status === "active" ? "inactive" : "active" })
            : undefined,
      },
    );
    const result = await response.json();
    if (!response.ok) return alert(result.message || "操作失败");
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
      <div className="content-subtitle">优惠券运营</div>
      <div className="feishu-form coupon-form">
        <input value={couponTitle} onChange={(e) => setCouponTitle(e.target.value)} placeholder="优惠券名称" />
        <input type="number" min="1" value={couponAmount} onChange={(e) => setCouponAmount(e.target.value)} placeholder="面额" />
        <input type="number" min="0" value={couponThreshold} onChange={(e) => setCouponThreshold(e.target.value)} placeholder="使用门槛" />
        <input type="date" value={couponExpires} onChange={(e) => setCouponExpires(e.target.value)} />
        <button onClick={addCoupon}>新增优惠券</button>
      </div>
      <table>
        <thead><tr><th>优惠券</th><th>面额/门槛</th><th>有效期</th><th>发放/使用</th><th>操作</th></tr></thead>
        <tbody>
          {!coupons.length && <EmptyRow cols={5} text="暂无优惠券" />}
          {coupons.map((x) => (
            <tr key={`coupon-${x.id}`}>
              <td>{x.title}</td><td>¥{x.amount} / 满{x.threshold || 0}</td>
              <td>{x.expires_at || "长期有效"}</td><td>{x.issued_count || 0} / {x.used_count || 0}</td>
              <td><button onClick={() => couponAction(x, "issue")}>发放</button><button onClick={() => couponAction(x, "toggle")}>{x.status === "active" ? "停用" : "启用"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="content-subtitle">Banner 与场馆分类</div>
      <table>
        <thead>
          <tr>
            <th>类型</th>
            <th>标题</th>
            <th>排序</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {banners.map((x) => (
            <tr key={`b-${x.id}`}>
              <td>Banner</td>
              <td>{x.title}</td>
              <td>{x.sort_order}</td>
              <td>{x.status}</td>
              <td><button onClick={() => contentAction("banners", x, "toggle")}>{x.status === "active" ? "停用" : "启用"}</button><button onClick={() => contentAction("banners", x, "delete")}>删除</button></td>
            </tr>
          ))}
          {categories.map((x) => (
            <tr key={`c-${x.id}`}>
              <td>分类</td>
              <td>{x.name}</td>
              <td>{x.sort_order}</td>
              <td>{x.status}</td>
              <td><button onClick={() => contentAction("categories", x, "toggle")}>{x.status === "active" ? "停用" : "启用"}</button><button onClick={() => contentAction("categories", x, "delete")}>删除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ReviewsManager({ token, products }: { token: string; products: any[] }) {
  const [petId, setPetId] = useState("");
  const [count, setCount] = useState("18");
  const [reviews, setReviews] = useState<any[]>([]);
  const [notice, setNotice] = useState("");
  const headers = useMemo(() => ({ authorization: `Bearer ${token}`, "content-type": "application/json" }), [token]);
  const load = useCallback(async (selected = petId) => {
    if (!selected) return setReviews([]);
    const response = await fetch(`${API_BASE}/api/admin/reviews?pet_id=${selected}&pageSize=150`, { headers });
    const result = await response.json();
    setReviews(Array.isArray(result) ? result : []);
  }, [headers, petId]);
  const generate = async () => {
    if (!petId) return setNotice("请先选择具体宠物商品");
    const response = await fetch(`${API_BASE}/api/admin/reviews/generate`, {
      method: "POST", headers, body: JSON.stringify({ pet_id: Number(petId), count: Number(count) }),
    });
    const result = await response.json();
    if (!response.ok) return setNotice(result.message || "生成失败");
    setNotice(`已生成 ${result.created} 条，本商品现有 ${result.count} 条平台候选评价。`);
    await load(petId);
  };
  const moderate = async (review: any) => {
    const status = review.status === "hidden" ? "published" : "hidden";
    await fetch(`${API_BASE}/api/admin/reviews/${review.id}`, { method: "PATCH", headers, body: JSON.stringify({ status }) });
    setReviews((items) => items.map((item) => item.id === review.id ? { ...item, status } : item));
  };
  return (
    <section className="admin-table">
      <div><h3>评价内容库</h3><p>按商品分配 10–25 条不重复的纯文字候选评价，可逐条隐藏或启用。</p></div>
      <div className="feishu-form">
        <select value={petId} onChange={(event) => { setPetId(event.target.value); void load(event.target.value); }}>
          <option value="">选择宠物商品</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.breed}</option>)}
        </select>
        <input type="number" min="10" max="25" value={count} onChange={(event) => setCount(event.target.value)} placeholder="生成数量" />
        <button onClick={generate}>生成候选评价</button>
      </div>
      {notice && <p className="feishu-notice">{notice}</p>}
      <table><thead><tr><th>用户</th><th>商品</th><th>评价内容</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          {!reviews.length && <EmptyRow cols={5} text="选择商品后查看或生成评价" />}
          {reviews.map((review) => <tr key={review.id}><td>{review.nickname}<small>{review.created_at?.slice(0, 10)}</small></td><td>{review.pet_name}<small>{review.breed}</small></td><td className="review-admin-content">{review.content}</td><td>{review.status === "hidden" ? "已隐藏" : "展示中"}</td><td><button onClick={() => moderate(review)}>{review.status === "hidden" ? "启用" : "隐藏"}</button></td></tr>)}
        </tbody>
      </table>
    </section>
  );
}

function FeishuManager({ token }: { token: string }) {
  const [configs, setConfigs] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [previews, setPreviews] = useState<any[]>([]);
  const [activePreview, setActivePreview] = useState<any>(null);
  const [connectionTest, setConnectionTest] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
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
  const connected = configs.some(
    (config) =>
      config.status === "active" &&
      String(config.document_url || "").includes("/base/"),
  );
  const activeConfig = configs.find(
    (config) => config.status === "active" && String(config.document_url || "").includes("/base/"),
  ) || configs.find((config) => String(config.document_url || "").includes("/base/"));
  const load = useCallback(() => {
    fetch(`${API_BASE}/api/admin/feishu/configs`, { headers })
      .then((r) => r.json())
      .then(setConfigs);
    fetch(`${API_BASE}/api/admin/feishu/tasks`, { headers })
      .then((r) => r.json())
      .then(setTasks);
    fetch(`${API_BASE}/api/admin/feishu/previews`, { headers })
      .then((r) => r.json())
      .then(setPreviews);
  }, [headers]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!tasks.some((task) => ["pending", "running", "processing_images"].includes(task.status))) return;
    const timer = window.setInterval(() => {
      fetch(`${API_BASE}/api/admin/feishu/tasks`, { headers })
        .then((response) => response.json())
        .then(setTasks)
        .catch(() => {});
    }, 1000);
    return () => window.clearInterval(timer);
  }, [headers, tasks]);
  useEffect(() => {
    if (!activeConfig || name || url) return;
    setName(activeConfig.name || "福宠商品库");
    setUrl(activeConfig.document_url || "");
    setAppId(activeConfig.app_id || appId);
    setTableId(activeConfig.table_id || tableId);
  }, [activeConfig, appId, name, tableId, url]);
  const save = async () => {
    setNotice("");
    if (!name.trim() || !url.trim() || !appId.trim() || !tableId.trim()) {
      setNotice("请完整填写数据源名称、飞书链接、App ID 和数据表 ID。");
      return;
    }
    setSavingConfig(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/feishu/configs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: name.trim(),
          document_url: url.trim(),
          app_id: appId.trim(),
          table_id: tableId.trim(),
          field_mapping: {
          name: "商品名称",
          category_id: "场馆",
          breed: "品种",
          gender: "性别",
          price: "价格",
          description: "详细介绍",
          breed_origin: "品种起源",
          breed_alias: "品种别称",
          breed_evolution: "品种演化",
          images: "主图文件",
          videos: "视频文件",
          age_months: "年龄（月）",
          color: "毛色",
          body_type: "体型",
          personality: "性格",
          health_status: "健康状态",
          vaccine_record: "疫苗记录",
          seller_name: "商家名称",
          status: "商品状态",
          stock: "库存",
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "保存失败");
      setName("");
      setUrl("");
      load();
      setNotice("同步配置已保存到后台。现在可直接执行“测试连接”和“同步预览”。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存同步配置失败");
    } finally {
      setSavingConfig(false);
    }
  };
  const editConfig = (config: any) => {
    setName(config.name || "");
    setUrl(config.document_url || "");
    setAppId(config.app_id || "");
    setTableId(config.table_id || "");
    setNotice("已载入该连接，可修改后保存；密钥仍由服务端安全保管，不会显示在页面中。");
  };
  const preview = async (id: number) => {
    setSyncing(true);
    setNotice("正在读取飞书并检测数据，不会写入正式数据库…");
    try {
      const response = await fetch(`${API_BASE}/api/admin/feishu/preview`, {
        method: "POST",
        headers,
        body: JSON.stringify({ config_id: id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "同步预览失败");
      setActivePreview(result);
      setNotice(`预览 #${result.id} 已完成：发现 ${result.stats.products} 条，确认后才会写入数据库。`);
      load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "同步预览失败，请稍后重试");
    } finally {
      setSyncing(false);
    }
  };
  const testConnection = async (id: number) => {
    setSyncing(true);
    setNotice("正在测试授权、数据表和字段访问，不会写入商品数据库…");
    try {
      const response = await fetch(`${API_BASE}/api/admin/feishu/test-connection`, {
        method: "POST", headers, body: JSON.stringify({ config_id: id }),
      });
      const result = await response.json();
      setConnectionTest(result);
      if (!response.ok) throw new Error(result.message || "请检查配置");
      setNotice(result.message || "连接测试通过");
    } catch (error) {
      const message = error instanceof Error ? error.message : "请检查配置";
      setConnectionTest({ connected: false, message });
      setNotice(`连接失败：${message}`);
    } finally {
      setSyncing(false);
    }
  };
  const exportProducts = async (id: number) => {
    if (!window.confirm("确定把当前商品库回写到飞书吗？将更新商品标题与资料；已有主图、视频附件会保留，缺失附件会自动上传。")) return;
    setSyncing(true);
    setNotice("正在把商品标题、资料、主图和视频回写飞书；媒体上传可能需要一些时间，请勿重复操作…");
    try {
      const response = await fetch(`${API_BASE}/api/admin/feishu/export-products`, {
        method: "POST",
        headers,
        body: JSON.stringify({ config_id: id, replace_media: false }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207)
        throw new Error(result.message || "商品回写飞书失败");
      setNotice(
        `飞书回写完成：新增 ${result.created || 0} 条、更新 ${result.updated || 0} 条、上传主图 ${result.images || 0} 个、视频 ${result.videos || 0} 个${result.failed ? `，失败 ${result.failed} 条` : "，无失败记录"}。`,
      );
      load();
    } catch (exportError) {
      setNotice(exportError instanceof Error ? exportError.message : "商品回写飞书失败");
    } finally {
      setSyncing(false);
    }
  };
  const commitPreview = async (id: number, publishAfterSync = false) => {
    setSyncing(true);
    setNotice(publishAfterSync ? "正在同步并上架商品，每批处理 100 条…" : "正在同步为草稿，每批处理 100 条…");
    try {
      const response = await fetch(`${API_BASE}/api/admin/feishu/previews/${id}/commit`, {
        method: "POST",
        headers,
        body: JSON.stringify({ batch_size: 100, publish_after_sync: publishAfterSync }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "正式同步提交失败");
      setActivePreview(null);
      setNotice(`正式任务 #${result.taskId} 已进入队列，共 ${result.total} 条${publishAfterSync ? "，完成后自动上架" : "，同步后进入商品管理"}。`);
      window.setTimeout(() => {
        load();
        announceDataChange("products");
      }, 500);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "正式同步提交失败");
    } finally {
      setSyncing(false);
    }
  };
  const taskAction = async (
    id: number,
    action: "pause" | "resume" | "retry",
  ) => {
    await fetch(
      `${API_BASE}/api/admin/feishu/tasks/${id}/${action}`,
      {
        method: "POST",
        headers,
      },
    );
    load();
  };
  const taskStatusLabel = (status: string) => ({
    pending: "等待同步",
    running: "同步商品数据",
    processing_images: "处理白底轮廓图",
    completed: "已完成",
    completed_with_warnings: "完成（部分图片失败）",
    failed: "失败",
    paused: "已暂停",
  }[status] || status);
  const taskPercent = (done: number, total: number) =>
    total ? Math.min(100, Math.round((Number(done || 0) / Number(total)) * 100)) : 0;
  return (
    <section className="admin-table">
      <div>
        <h3>飞书同步配置</h3>
        <p className="feishu-guide">配置保存在系统后台。先保存，再测试授权和数据表，最后生成不写库的同步预览。</p>
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
        <button onClick={save} disabled={savingConfig}>{savingConfig ? "保存中…" : "保存同步配置"}</button>
      </div>
      {notice && <p className="feishu-notice">{notice}</p>}
      <div className="sync-connection">
        <span className={connected ? "online" : "offline"}>{connected ? "● 已连接" : "● 未连接"}</span>
        <p>已保存连接 {configs.length} 个，启用 {configs.filter((item) => item.status === "active").length} 个。固定流程：测试连接 → 同步预览 → 管理员确认 → 分批写入 → 前台更新</p>
      </div>
      <section className="sync-command-center">
        <div><small>管理员同步控制台</small><b>{activeConfig ? activeConfig.name || "已保存飞书连接" : "请先保存同步配置"}</b><span>测试不会写库，预览确认后才会同步商品。</span></div>
        <button disabled={syncing || !activeConfig} onClick={() => activeConfig && testConnection(activeConfig.id)}>① 测试连接</button>
        <button disabled={syncing || !activeConfig} onClick={() => activeConfig && preview(activeConfig.id)}>② 同步预览</button>
        <button disabled={syncing || !activeConfig} onClick={() => activeConfig && exportProducts(activeConfig.id)}>③ 商品库回写飞书</button>
      </section>
      {connectionTest && <div className={`connection-result ${connectionTest.connected ? "ok" : "error"}`}>
        <b>{connectionTest.connected ? "连接测试通过" : "连接测试失败"}</b>
        {connectionTest.connected && <p>已保存 {connectionTest.saved_connections} 个连接 · 当前表 {connectionTest.records} 条记录 · {connectionTest.fields} 个字段 · 密钥{connectionTest.secret_configured ? "已安全配置" : "未配置"}</p>}
      </div>}
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>文档链接</th>
            <th>接口与凭据</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {!configs.length && <EmptyRow cols={4} text="暂无飞书数据源，请先填写上方连接信息" />}
          {configs.map((c) => (
            <tr key={c.id}>
              <td>{c.name || "未命名数据源"}<small>{c.status === "active" ? "已启用" : "已停用"}</small></td>
              <td>{c.document_url}</td>
              <td>App ID：{c.app_id}<small>Table：{c.table_id} · 密钥：{c.secret_configured ? "环境变量已配置" : "未配置"}</small></td>
              <td>
                <div className="sync-actions">
                  <button className="edit" disabled={syncing} onClick={() => editConfig(c)}>编辑配置</button>
                  <button className="test" disabled={syncing || !String(c.document_url || "").includes("/base/")} onClick={() => testConnection(c.id)}>{syncing ? "处理中…" : "测试连接"}</button>
                  <button className="preview" disabled={syncing || !String(c.document_url || "").includes("/base/")} onClick={() => preview(c.id)}>同步预览</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {activePreview && (
        <section className="sync-preview-panel">
          <header><div><small>同步预览 #{activePreview.id}</small><h3>请确认本次数据变化</h3></div><button onClick={() => setActivePreview(null)}>×</button></header>
          <div className="sync-stat-grid">
            <article><span>发现商品</span><b>{activePreview.stats.products}</b></article>
            <article><span>主图/图片</span><b>{activePreview.stats.images}</b></article>
            <article><span>视频</span><b>{activePreview.stats.videos}</b></article>
            <article><span>新增</span><b>{activePreview.stats.additions}</b></article>
            <article><span>更新</span><b>{activePreview.stats.updates}</b></article>
            <article><span>重复</span><b>{activePreview.stats.duplicates}</b></article>
            <article><span>异常</span><b>{activePreview.stats.errors}</b></article>
          </div>
          {!!activePreview.sample?.length && <div className="sync-sample">{activePreview.sample.slice(0, 8).map((item: any) => <p key={item.external_id}><b>{item.name}</b><span>{item.breed} · ¥{item.price} · 图片 {item.images?.length || 0} · 视频 {item.videos?.length || 0}</span></p>)}</div>}
          {!!activePreview.errors?.length && <div className="sync-preview-errors">{activePreview.errors.slice(0, 10).map((error: any) => <p key={`${error.row}-${error.external_id}`}>第 {error.row} 行：{error.error}</p>)}</div>}
          <footer className="sync-confirm-actions"><button onClick={() => setActivePreview(null)}>取消</button><button disabled={syncing || !activePreview.stats.valid} onClick={() => commitPreview(activePreview.id, false)}>同步到商品库</button><button disabled={syncing || !activePreview.stats.valid} onClick={() => commitPreview(activePreview.id, true)}>同步并立即上架</button></footer>
        </section>
      )}
      {!!previews.length && <p className="sync-history">最近预览：{previews.slice(0, 3).map((p) => `#${p.id} ${p.status === "confirmed" ? "已提交" : "待确认"}`).join("　")}</p>}
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
              <td><span className={`sync-status sync-status-${t.status}`}>{taskStatusLabel(t.status)}</span></td>
              <td>
                <div className="sync-stage-progress">
                  <label><span>商品数据</span><b>{t.processed || 0}/{t.total || 0}</b></label>
                  <div className="sync-progress"><i style={{ width: `${taskPercent(t.processed, t.total)}%` }} /><span>{taskPercent(t.processed, t.total)}%</span></div>
                </div>
                <div className="sync-stage-progress sync-stage-media">
                  <label><span>白底轮廓</span><b>{t.media_processed || 0}/{t.media_total || 0}</b></label>
                  <div className="sync-progress"><i style={{ width: `${taskPercent(t.media_processed, t.media_total)}%` }} /><span>{taskPercent(t.media_processed, t.media_total)}%</span></div>
                </div>
              </td>
              <td>
                <span>数据 {t.success || 0}/{t.failed || 0}</span>
                <small>白底 {t.media_success || 0}/{t.media_failed || 0}</small>
              </td>
              <td>{t.batch_size || 500}<small>白底单并发稳态处理</small></td>
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

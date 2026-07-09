import { useEffect, useMemo, useState } from "react";
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
const seedProducts = [
  {
    id: "P001",
    name: "Coco",
    breed: "布偶猫",
    price: 6800,
    status: "在售",
    stock: 1,
  },
  {
    id: "P002",
    name: "小太阳",
    breed: "金毛",
    price: 7300,
    status: "待审核",
    stock: 1,
  },
  {
    id: "P003",
    name: "雪球",
    breed: "萨摩耶",
    price: 8600,
    status: "已下架",
    stock: 0,
  },
];

export default function AdminApp() {
  const [token, setToken] = useState(
    () => localStorage.getItem("fuchong-admin-token") || "",
  );
  if (!token)
    return (
      <AdminLogin
        success={(t) => {
          localStorage.setItem("fuchong-admin-token", t);
          setToken(t);
        }}
      />
    );
  return <AdminPanel token={token} />;
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
        <small>初始账号：admin　初始密码：123123123</small>
      </form>
    </div>
  );
}
function AdminPanel({ token }: { token: string }) {
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [products, setProducts] = useState<any[]>(seedProducts);
  useEffect(() => {
    fetch("http://127.0.0.1:3001/api/admin/pets", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setProducts(d))
      .catch(() => {});
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
          </div>
        </header>
        {tab === "dashboard" && <Dashboard />}
        {tab === "products" && (
          <Products
            products={products}
            open={() => setShowForm(true)}
            remove={async (id) => {
              await fetch(`http://127.0.0.1:3001/api/admin/pets/${id}`, {
                method: "DELETE",
                headers: { authorization: `Bearer ${token}` },
              });
              setProducts((v) => v.filter((p) => p.id !== id));
            }}
          />
        )}{" "}
        {tab === "users" && <UsersManager token={token}/>}{" "}
        {tab === "orders" && <OrdersManager token={token}/>}{" "}
        {tab === "transactions" && <Transactions />}
        {tab === "logistics" && <Logistics token={token}/>}
        {tab === "afterSales" && <AfterSales token={token}/>}
        {tab === "content" && <ContentManager token={token}/>}
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
                    <option value={h.key}>{h.name}</option>
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
                    <option>{b.name}</option>
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
function Dashboard() {
  return (
    <>
      <section className="admin-stats">
        {[
          ["在售宠物", "128", "+12.5%"],
          ["今日订单", "36", "+8.2%"],
          ["成交金额", "¥126,800", "+18.6%"],
          ["注册用户", "8,629", "+6.4%"],
        ].map((x) => (
          <article>
            <small>{x[0]}</small>
            <h2>{x[1]}</h2>
            <span>{x[2]} 较昨日</span>
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
            ["待审核商品", "18"],
            ["待确认订单", "12"],
            ["售后申请", "6"],
            ["异常同步", "2"],
          ].map((x) => (
            <button>
              {x[0]}
              <b>{x[1]}</b>
            </button>
          ))}
        </article>
      </section>
    </>
  );
}
function Products({ products, open, remove }: { products: any[]; open: () => void; remove: (id: number) => void }) {
  return (
    <section className="admin-table">
      <div>
        <h3>宠物商品列表</h3>
        <button onClick={open}>＋ 新增宠物</button>
      </div>
      <table>
        <thead>
          <tr>
            {["商品ID", "宠物名称", "品种", "售价", "库存", "状态", "操作"].map(
              (x) => (
                <th>{x}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr onDoubleClick={() => confirm("确定删除该商品吗？") && remove(p.id)}>
              <td>{p.id}</td>
              <td>
                <b>{p.name}</b>
              </td>
              <td>{p.breed}</td>
              <td>¥{p.price}</td>
              <td>{p.stock}</td>
              <td>
                <span>{p.status}</span>
              </td>
              <td>
                <button>编辑</button> <button>更多</button>
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
              <th>{x}</th>
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
function Transactions() {
  return (
    <>
      <section className="admin-stats">
        <article>
          <small>今日入账</small>
          <h2>¥126,800</h2>
          <span>36 笔交易</span>
        </article>
        <article>
          <small>待结算</small>
          <h2>¥42,600</h2>
          <span>预计 T+1</span>
        </article>
        <article>
          <small>退款金额</small>
          <h2>¥6,800</h2>
          <span>1 笔退款</span>
        </article>
      </section>
      <DataTable
        title="交易流水"
        heads={["流水号", "类型", "关联订单", "金额", "状态"]}
        rows={[
          ["TX260709001", "支付", "FC20260709001", "+¥6,800", "成功"],
          ["TX260709002", "退款", "FC20260707002", "-¥6,800", "处理中"],
        ]}
      />
    </>
  );
}

function UsersManager({token}:{token:string}){const [users,setUsers]=useState<any[]>([]),[detail,setDetail]=useState<any>(null);const headers={authorization:`Bearer ${token}`};useEffect(()=>{fetch("http://127.0.0.1:3001/api/admin/users",{headers}).then(r=>r.json()).then(setUsers)},[]);const open=async(id:number)=>setDetail(await fetch(`http://127.0.0.1:3001/api/admin/users/${id}`,{headers}).then(r=>r.json()));return <section className="admin-table"><div><h3>用户管理</h3></div><table><thead><tr><th>用户</th><th>手机号</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.nickname}</td><td>{u.phone||"未绑定"}</td><td>{u.status}</td><td>{u.created_at}</td><td><button onClick={()=>open(u.id)}>查看详情</button></td></tr>)}</tbody></table>{detail&&<div className="user-detail"><h3>{detail.nickname}</h3><p>订单 {detail.orders.length} · 收藏 {detail.favorites.length} · 足迹 {detail.footprints.length} · 地址 {detail.addresses.length}</p><button onClick={()=>setDetail(null)}>关闭</button></div>}</section>}
function OrdersManager({token}:{token:string}){const [orders,setOrders]=useState<any[]>([]);const headers={authorization:`Bearer ${token}`};useEffect(()=>{fetch("http://127.0.0.1:3001/api/admin/orders",{headers}).then(r=>r.json()).then(setOrders)},[]);return <section className="admin-table"><div><h3>订单管理</h3></div><table><thead><tr><th>订单号</th><th>买家</th><th>金额</th><th>支付</th><th>状态</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{o.order_no}</td><td>{o.nickname} {o.phone}</td><td>¥{o.total_amount}</td><td>{o.payment_status}</td><td>{o.status}</td></tr>)}</tbody></table></section>}
function Logistics({token}:{token:string}) {
  const [orders,setOrders]=useState<any[]>([]);const [company,setCompany]=useState("");const [tracking,setTracking]=useState("");const headers={authorization:`Bearer ${token}`,"content-type":"application/json"};useEffect(()=>{fetch("http://127.0.0.1:3001/api/admin/orders",{headers}).then(r=>r.json()).then(setOrders)},[])
  const update=async(id:number)=>{await fetch(`http://127.0.0.1:3001/api/admin/orders/${id}/logistics`,{method:"PUT",headers,body:JSON.stringify({company,tracking_no:tracking,status:"shipped",progress:[{time:new Date().toISOString(),text:"已发货"}]})});alert("物流已更新")}
  return <section className="admin-table"><div><h3>物流管理</h3></div><div className="feishu-form"><input value={company} onChange={e=>setCompany(e.target.value)} placeholder="物流公司"/><input value={tracking} onChange={e=>setTracking(e.target.value)} placeholder="物流单号"/></div><table><thead><tr><th>订单号</th><th>买家</th><th>订单状态</th><th>操作</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{o.order_no}</td><td>{o.nickname} {o.phone}</td><td>{o.status}</td><td><button onClick={()=>update(o.id)}>更新并发货</button></td></tr>)}</tbody></table></section>;
}
function AfterSales({token}:{token:string}) {
  const [items,setItems]=useState<any[]>([]);const headers={authorization:`Bearer ${token}`,"content-type":"application/json"};const load=()=>Promise.all(["complaints","after-sales"].map(x=>fetch(`http://127.0.0.1:3001/api/admin/${x}`,{headers}).then(r=>r.json()))).then(([a,b])=>setItems([...a.map((x:any)=>({...x,kind:"投诉"})),...b.map((x:any)=>({...x,kind:"售后"}))]));useEffect(()=>{void load()},[])
  return <section className="admin-table"><div><h3>客诉与售后</h3></div><table><thead><tr><th>类型</th><th>关联订单</th><th>原因/内容</th><th>状态</th></tr></thead><tbody>{items.map(x=><tr key={`${x.kind}-${x.id}`}><td>{x.kind}</td><td>{x.order_id}</td><td>{x.reason||x.content}</td><td>{x.status}</td></tr>)}</tbody></table></section>;
}
function ContentManager({token}:{token:string}) {
  const [banners,setBanners]=useState<any[]>([]),[categories,setCategories]=useState<any[]>([]);const headers={authorization:`Bearer ${token}`};useEffect(()=>{fetch("http://127.0.0.1:3001/api/admin/banners",{headers}).then(r=>r.json()).then(setBanners);fetch("http://127.0.0.1:3001/api/admin/categories",{headers}).then(r=>r.json()).then(setCategories)},[])
  return <section className="admin-table"><div><h3>首页内容管理</h3></div><table><thead><tr><th>类型</th><th>标题</th><th>排序</th><th>状态</th></tr></thead><tbody>{banners.map(x=><tr key={`b-${x.id}`}><td>Banner</td><td>{x.title}</td><td>{x.sort_order}</td><td>{x.status}</td></tr>)}{categories.map(x=><tr key={`c-${x.id}`}><td>分类</td><td>{x.name}</td><td>{x.sort_order}</td><td>{x.status}</td></tr>)}</tbody></table></section>;
}

function FeishuManager({token}:{token:string}){
  const [configs,setConfigs]=useState<any[]>([]);const [name,setName]=useState("");const [url,setUrl]=useState("");const headers={authorization:`Bearer ${token}`,"content-type":"application/json"}
  const load=()=>fetch("http://127.0.0.1:3001/api/admin/feishu/configs",{headers}).then(r=>r.json()).then(setConfigs)
  useEffect(()=>{void load()},[])
  const save=async()=>{await fetch("http://127.0.0.1:3001/api/admin/feishu/configs",{method:"POST",headers,body:JSON.stringify({name,document_url:url,field_mapping:{name:"宠物名称",breed:"品种",price:"价格",images:"图片",videos:"视频"}})});setName("");setUrl("");load()}
  const sync=async(id:number)=>{await fetch("http://127.0.0.1:3001/api/admin/feishu/sync",{method:"POST",headers,body:JSON.stringify({config_id:id,mode:"incremental"})});alert("同步任务已进入队列")}
  return <section className="admin-table"><div><h3>飞书数据源</h3></div><div className="feishu-form"><input value={name} onChange={e=>setName(e.target.value)} placeholder="数据源名称"/><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="飞书多维表格链接"/><button onClick={save}>保存连接</button></div><table><thead><tr><th>名称</th><th>文档链接</th><th>字段映射</th><th>操作</th></tr></thead><tbody>{configs.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.document_url}</td><td>名称、品种、价格、媒体</td><td><button onClick={()=>sync(c.id)}>增量同步</button></td></tr>)}</tbody></table></section>
}

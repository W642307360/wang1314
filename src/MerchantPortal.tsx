import { useCallback, useEffect, useMemo, useState } from "react";
import { halls } from "./catalog";
import { mediaUrl } from "./mediaUrl";
import "./MerchantPortal.css";

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? "" : "http://127.0.0.1:3001");
type View = "login" | "apply" | "dashboard" | "products" | "orders";
const tokenKey = "fuchong-merchant-token";

const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
  reader.onerror = () => reject(new Error("文件读取失败"));
  reader.readAsDataURL(file);
});

export default function MerchantPortal({ back }: { back: () => void }) {
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey) || "");
  const [view, setView] = useState<View>(token ? "dashboard" : "apply");
  const [me, setMe] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedHallKey, setSelectedHallKey] = useState(halls[0].key);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const headers = useMemo(() => ({ authorization: `Bearer ${token}`, "content-type": "application/json" }), [token]);
  const api = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "请求失败，请稍后重试");
    return payload;
  }, [headers]);
  const loadMe = useCallback(async () => {
    if (!token) return;
    try { setMe(await api("/api/merchant/me")); }
    catch { localStorage.removeItem(tokenKey); setToken(""); setView("login"); }
  }, [api, token]);
  useEffect(() => { void loadMe(); }, [loadMe]);
  const loadProducts = useCallback(async () => { setProducts(await api("/api/merchant/products")); }, [api]);
  const loadCatalog = useCallback(async () => {
    const catalog = await api("/api/merchant/catalog");
    setCategories(Array.isArray(catalog.categories) ? catalog.categories : []);
  }, [api]);
  const loadOrders = useCallback(async () => { setOrders(await api("/api/merchant/orders")); }, [api]);
  useEffect(() => {
    if (view === "products" && token) void Promise.all([loadProducts(), loadCatalog()]).catch((error) => setMessage(error.message));
    if (view === "orders" && token) void loadOrders().catch((error) => setMessage(error.message));
  }, [view, token, loadProducts, loadCatalog, loadOrders]);

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const payload = await api("/api/merchant/login", { method: "POST", body: JSON.stringify(Object.fromEntries(data)) });
      localStorage.setItem(tokenKey, payload.token); setToken(payload.token); setView("dashboard");
    } catch (error) { setMessage(error instanceof Error ? error.message : "登录失败"); }
    finally { setBusy(false); }
  };
  const apply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const payload = await api("/api/merchant/applications", { method: "POST", body: JSON.stringify(data) });
      setMessage(`申请已提交：${payload.application_no}。管理员审核后会为你设置登录账号与密码。`);
      event.currentTarget.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : "提交失败"); }
    finally { setBusy(false); }
  };
  const createProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const image = data.get("image") as File;
    const video = data.get("video") as File;
    try {
      const product = await api("/api/merchant/products", { method: "POST", body: JSON.stringify({
        name: data.get("name"), category_id: Number(data.get("category_id")), breed: data.get("breed"),
        price: Number(data.get("price")), stock: Number(data.get("stock")), description: data.get("description"), status: data.get("status"),
      }) });
      for (const [file, kind] of [[image, "images"], [video, "videos"]] as const) {
        if (!file?.size) continue;
        if (file.size > 10 * 1024 * 1024) throw new Error("单个图片或视频不能超过 10MB");
        const uploaded = await api("/api/merchant/uploads", { method: "POST", body: JSON.stringify({ fileName: file.name, type: file.type, data: await readFile(file) }) });
        await api(`/api/merchant/products/${product.id}/${kind}`, { method: "POST", body: JSON.stringify({ url: uploaded.url, type: kind === "images" ? "main" : undefined, sort_order: 0 }) });
      }
      const published = data.get("status") === "published";
      form.reset(); setSelectedHallKey(halls[0].key); setMessage(published ? "商品已上架并同步到对应品种橱窗。" : "商品草稿已保存，主图白底轮廓正在后台轻量处理。"); await loadProducts();
    } catch (error) { setMessage(error instanceof Error ? error.message : "商品保存失败"); }
    finally { setBusy(false); }
  };
  const setProductStatus = async (id: number, status: string) => {
    try { await api(`/api/merchant/products/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await loadProducts(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "状态更新失败"); }
  };
  const editProduct = async (product: any) => {
    const name = prompt("商品名称", product.name || ""); if (!name) return;
    const price = prompt("商品价格", String(product.price || "")); if (!price || Number(price) <= 0) return;
    const stock = prompt("可售库存", String(product.stock ?? 0)); if (stock === null || Number(stock) < 0) return;
    const description = prompt("商品介绍", product.description || ""); if (description === null) return;
    try {
      await api(`/api/merchant/products/${product.id}`, {
        method: "PATCH", body: JSON.stringify({ name, price: Number(price), stock: Number(stock), description }),
      });
      await loadProducts(); setMessage("商品资料已更新，前后台读取同一条商品记录。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "商品更新失败"); }
  };
  const updateShop = async () => {
    const shopName = prompt("新的店铺名称", me?.shop_name || "");
    if (!shopName) return;
    try { await api("/api/merchant/me", { method: "PATCH", body: JSON.stringify({ shop_name: shopName }) }); await loadMe(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "店铺名称更新失败"); }
  };
  const updateLogistics = async (order: any) => {
    const company = prompt("物流公司", order.company || "顺丰速运"); if (!company) return;
    const tracking_no = prompt("物流单号", order.tracking_no || ""); if (!tracking_no) return;
    const status = prompt("物流状态：packed / shipped / in_transit / delivering / pending_receive / delivered", order.logistics_status || "packed"); if (!status) return;
    try { await api(`/api/merchant/orders/${order.id}/logistics`, { method: "PUT", body: JSON.stringify({ company, tracking_no, status, note: "商家更新配送进度" }) }); await loadOrders(); setMessage("物流已更新，用户订单状态已同步。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "物流更新失败"); }
  };
  const logout = () => { localStorage.removeItem(tokenKey); setToken(""); setMe(null); setView("login"); };

  return <div className="merchant-page">
    <header className="merchant-head"><button onClick={back}>‹</button><div><small>FUCHONG PARTNER</small><h1>福宠商家中心</h1></div>{token && <button onClick={logout}>退出</button>}</header>
    {!token && <>
      <div className="merchant-switch"><button className={view === "apply" ? "on" : ""} onClick={() => setView("apply")}>申请入驻</button><button className={view === "login" ? "on" : ""} onClick={() => setView("login")}>商家登录</button></div>
      {view === "login" ? <form className="merchant-form" onSubmit={login}><h3>已审核商家登录</h3><label>登录账号<input name="username" required autoComplete="username" /></label><label>登录密码<input name="password" type="password" required autoComplete="current-password" /></label><button disabled={busy}>{busy ? "正在登录…" : "登录商家中心"}</button></form>
        : <form className="merchant-form" onSubmit={apply}><h3>商家入驻申请表</h3><div className="merchant-grid"><label>店铺名称<input name="shop_name" required maxLength={60} /></label><label>申请人<input name="applicant_name" required maxLength={30} /></label><label>联系电话<input name="contact_phone" required inputMode="numeric" pattern="1[0-9]{10}" /></label><label>所在城市<input name="city" maxLength={40} /></label></div><label>经营与资质说明<textarea name="business_description" rows={4} maxLength={1200} required /></label><button disabled={busy}>{busy ? "正在安全提交…" : "提交管理员审核"}</button></form>}
    </>}
    {token && <>
      <section className="merchant-summary"><div><small>当前经营主体</small><h2>{me?.shop_name || "商家资料加载中"}</h2><p>账号 {me?.username} · 商品 {me?.products || 0} · 订单 {me?.orders || 0}</p></div><button onClick={updateShop}>修改店名</button></section>
      <div className="merchant-tabs">{[["dashboard","概览"],["products","商品"],["orders","订单物流"]].map(([id,label]) => <button key={id} className={view === id ? "on" : ""} onClick={() => setView(id as View)}>{label}</button>)}</div>
      {view === "dashboard" && <section className="merchant-cards"><article><b>一份商品数据</b><p>上传后直接进入现有商品库，前台、管理员和商家端读取同一条记录。</p></article><article><b>白底轮廓自动处理</b><p>主图保存后进入现有单并发队列，不阻塞上传或商品列表。</p></article><article><b>严格归属隔离</b><p>商家接口只返回自己的商品与订单，不能访问其他经营主体。</p></article></section>}
      {view === "products" && <><form className="merchant-form product-create" onSubmit={createProduct}><h3>新增商品</h3><div className="merchant-grid"><label>商品名称<input name="name" required /></label><label>所属场馆<select name="category_id" value={categories.find((category) => category.name === halls.find((hall) => hall.key === selectedHallKey)?.name)?.id || halls.findIndex((hall) => hall.key === selectedHallKey) + 1} onChange={(event) => { const category = categories.find((item) => item.id === Number(event.target.value)); const hall = halls.find((item) => item.name === category?.name); if (hall) setSelectedHallKey(hall.key); }}>{halls.map((hall, index) => <option value={categories.find((category) => category.name === hall.name)?.id || index + 1} key={hall.key}>{hall.name}</option>)}</select></label><label>品种<select name="breed" required>{halls.find((hall) => hall.key === selectedHallKey)?.breeds.map((breed) => <option value={breed.name} key={breed.id}>{breed.name}</option>)}</select></label><label>价格<input name="price" type="number" min="1" required /></label><label>库存<input name="stock" type="number" min="0" defaultValue="1" /></label><label>发布方式<select name="status" defaultValue="published"><option value="published">直接上架到前台</option><option value="draft">保存为草稿</option></select></label><label>主图（自动白底）<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label><label>视频<input name="video" type="file" accept="video/mp4" /></label></div><label>商品介绍<textarea name="description" rows={3} /></label><button disabled={busy}>{busy ? "正在保存…" : "保存商品"}</button></form><section className="merchant-list">{products.map((product) => <article key={product.id}>{product.image ? <img src={mediaUrl(product.image)} /> : <span className="media-empty">待上传</span>}<div><b>{product.name}</b><small>{product.breed} · ¥{product.price} · 库存 {product.stock}</small><small>{product.status === "published" ? "前台在售" : product.status === "draft" ? "草稿未展示" : "已下架"} · 白底图：{{ pending:"排队中",processing:"处理中",success:"已完成",failed:"待重试",not_required:"待上传主图" }[product.showcase_status as string] || "待处理"}</small></div><span className="merchant-product-actions"><button onClick={() => editProduct(product)}>编辑</button><button onClick={() => setProductStatus(product.id, product.status === "published" ? "offline" : "published")}>{product.status === "published" ? "下架" : "上架"}</button></span></article>)}</section></>}
      {view === "orders" && <section className="merchant-orders">{orders.length ? orders.map((order) => <article key={order.id}><div><b>{order.order_no}</b><small>{order.nickname} · {order.phone || "未绑定手机号"}</small><p>{JSON.parse(order.items || "[]").map((item: any) => item.name).join("、")}</p></div><div><strong>{order.payment_status === "paid" ? "已付款" : "待付款"}</strong><small>{order.logistics_status || order.status}</small><button disabled={order.payment_status !== "paid"} onClick={() => updateLogistics(order)}>更新物流</button></div></article>) : <div className="merchant-empty">暂无归属于当前商家的订单</div>}</section>}
    </>}
    {message && <div className="merchant-message" onClick={() => setMessage("")}>{message}</div>}
  </div>;
}

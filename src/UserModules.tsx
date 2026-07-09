import { useState } from 'react'
import './UserModules.css'

export type User = { id:string; nickname:string; phone:string; avatar:string }
export type Order = { id:string; status:string; petName:string; breed:string; price:number; image:string }
const petImg='https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=88'

function Header({title,back}:{title:string;back:()=>void}){return <div className="module-head"><button onClick={back}>‹</button><div><small>FUCHONG</small><h2>{title}</h2></div><span/></div>}
function Empty({icon='♡',title,text}:{icon?:string;title:string;text:string}){return <div className="empty"><i>{icon}</i><h3>{title}</h3><p>{text}</p></div>}

export function LoginPage({back,user,onLogin,onLogout}:{back:()=>void;user:User|null;onLogin:(u:User)=>void;onLogout:()=>void}){
 const [phone,setPhone]=useState('')
 if(user)return <div className="module-page"><Header title="账号与登录" back={back}/><section className="logged-card"><img src={user.avatar}/><h2>{user.nickname}</h2><p>{user.phone||'尚未绑定手机号'}</p><button>绑定手机号</button><button className="danger" onClick={onLogout}>退出登录</button></section></div>
 return <div className="module-page login-page"><Header title="登录 / 注册" back={back}/><div className="login-brand"><b>福</b><h1>欢迎来到福宠</h1><p>登录后同步收藏、订单与宠物成长档案</p></div><button className="wechat" onClick={()=>onLogin({id:'u_mock_001',nickname:'福宠新朋友',phone:'',avatar:'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80'})}>微信一键登录</button><div className="divider">或使用手机号</div><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="输入手机号（功能预留）"/><button className="phone-login" disabled={phone.length<11}>手机号登录</button><small>登录即代表同意《用户协议》和《隐私政策》</small></div>
}

export function CollectionPage({mode,back}:{mode:'favorites'|'follows';back:()=>void}){
 const [tab,setTab]=useState(mode);const [favorites,setFavorites]=useState([1,2,3]);const [follows,setFollows]=useState([1,2])
 return <div className="module-page"><Header title="宠物家" back={back}/><div className="seg"><button className={tab==='favorites'?'on':''} onClick={()=>setTab('favorites')}>收藏宠物</button><button className={tab==='follows'?'on':''} onClick={()=>setTab('follows')}>关注商家</button></div>
 {tab==='favorites'?(favorites.length?<div className="collection-grid">{favorites.map(x=><article key={x}><img src={petImg}/><button onClick={()=>confirm('确定取消收藏吗？')&&setFavorites(v=>v.filter(i=>i!==x))}>♥</button><h3>小太阳 {x}号</h3><p>金毛 · {x+2}个月 · 健康认证</p><b>¥ {6800+x*300}</b></article>)}</div>:<Empty title="还没有收藏宠物" text="去市场遇见心动的生命伙伴"/>):(follows.length?<div className="seller-list">{follows.map(x=><article key={x}><div className="seller-logo">宠</div><div><h3>汪星宠物馆 {x}</h3><p>实名认证 · 健康保障 · 评分 5.0</p></div><button onClick={()=>confirm('确定取消关注吗？')&&setFollows(v=>v.filter(i=>i!==x))}>已关注</button></article>)}</div>:<Empty title="还没有关注商家" text="关注后及时了解新宠动态"/>)}</div>
}

export function FootprintsPage({back}:{back:()=>void}){
 const [items,setItems]=useState([1,2,3,4]);return <div className="module-page"><Header title="浏览足迹" back={back}/><div className="list-tools"><b>今天</b><button onClick={()=>confirm('清空全部浏览记录？')&&setItems([])}>清空</button></div>{items.length?<div className="foot-grid">{items.map(x=><article key={x}><img src={petImg}/><div><h3>金毛小太阳 {x}号</h3><p>今天 {10+x}:26 浏览</p><b>¥ {6800+x*300}</b></div><button onClick={()=>setItems(v=>v.filter(i=>i!==x))}>×</button></article>)}</div>:<Empty icon="◷" title="暂无浏览足迹" text="浏览过的宠物会按日期保存在这里"/>}</div>
}

export function AddressesPage({back}:{back:()=>void}){
 const [items,setItems]=useState([{id:1,name:'王先生',phone:'138****8866',address:'四川省成都市高新区 天府大道 888 号',isDefault:true}]);const [editing,setEditing]=useState(false)
 return <div className="module-page"><Header title="收货地址" back={back}/>{editing?<form className="address-form" onSubmit={e=>{e.preventDefault();setItems(v=>[...v,{id:Date.now(),name:'新联系人',phone:'139****0000',address:'新添加的示例地址',isDefault:false}]);setEditing(false)}}><input placeholder="收货人"/><input placeholder="手机号"/><input placeholder="省 / 市 / 区"/><textarea placeholder="详细地址"/><label><input type="checkbox"/> 设为默认地址</label><button>保存地址</button></form>:<>{items.length?items.map(a=><article className="address-card" key={a.id}><b>{a.name}　{a.phone}</b><p>{a.address}</p><small>{a.isDefault?'默认地址':''}</small><div><button onClick={()=>setEditing(true)}>编辑</button><button onClick={()=>confirm('删除该地址？')&&setItems(v=>v.filter(x=>x.id!==a.id))}>删除</button></div></article>):<Empty icon="⌖" title="暂无收货地址" text="添加地址后可用于订单配送"/>}<button className="fixed-primary" onClick={()=>setEditing(true)}>＋ 新增收货地址</button></>}</div>
}

export function CouponsPage({back}:{back:()=>void}){const [tab,setTab]=useState('available');return <div className="module-page"><Header title="我的优惠券" back={back}/><div className="seg"><button className={tab==='available'?'on':''} onClick={()=>setTab('available')}>可使用 3</button><button className={tab==='used'?'on':''} onClick={()=>setTab('used')}>已使用</button><button className={tab==='expired'?'on':''} onClick={()=>setTab('expired')}>已过期</button></div>{tab==='available'?<div className="coupon-list">{[[300,'新人专享'],[500,'宠物到家礼'],[1000,'安心购补贴']].map(([n,t])=><article key={t}><strong>¥{n}</strong><div><h3>{t}</h3><p>满 ¥5000 可用 · 全平台宠物</p><small>有效期至 2026-12-31</small></div><button>去使用</button></article>)}</div>:<Empty icon="⌑" title="暂无优惠券" text="这里暂时空空的"/>}</div>}

export function OrdersPage({back}:{back:()=>void}){
 const tabs=['全部','待付款','待确认','待发货','待收货','已完成','已取消','售后'];const [tab,setTab]=useState('全部');const orders:Order[]=[{id:'FC20260709001',status:'待确认',petName:'小太阳 1号',breed:'金毛寻回犬 · 3个月',price:7300,image:petImg},{id:'FC20260708012',status:'待收货',petName:'小太阳 2号',breed:'金毛寻回犬 · 4个月',price:7600,image:petImg}]
 const visible=tab==='全部'?orders:orders.filter(o=>o.status===tab)
 return <div className="module-page"><Header title="我的订单" back={back}/><div className="order-tabs">{tabs.map(t=><button className={tab===t?'on':''} onClick={()=>setTab(t)}>{t}</button>)}</div>{visible.length?<div className="orders">{visible.map(o=><article key={o.id}><header><span>汪星宠物馆 ›</span><b>{o.status}</b></header><div><img src={o.image}/><p><strong>{o.petName}</strong><small>{o.breed}</small><em>健康档案完整 · 平台保障</em></p><b>¥{o.price}</b></div><footer><small>订单号 {o.id}</small><button>联系商家</button><button>{o.status==='待确认'?'取消订单':'再次购买'}</button></footer></article>)}</div>:<Empty icon="▣" title={`暂无${tab}订单`} text="每一次相遇，都值得安心守护"/>}</div>
}

export function MessagesPage({back}:{back:()=>void}){
 const messages=[['✦','系统消息','欢迎加入福宠安心养宠计划','2'],['▣','订单消息','订单 FC20260709001 已提交','1'],['宠','汪星宠物馆','您好，Coco 的健康档案已更新','3'],['♧','福宠专属客服','需要帮助可以随时联系我们','']]
 return <div className="module-page"><Header title="消息中心" back={back}/><div className="message-types"><button><i>✦</i>系统消息<b>2</b></button><button><i>▣</i>订单消息<b>1</b></button><button><i>宠</i>商家消息<b>3</b></button><button><i>♧</i>客服消息</button></div><div className="message-list">{messages.map(([icon,title,text,count])=><button key={title}><i>{icon}</i><div><b>{title}</b><p>{text}</p></div><small>10:26</small>{count&&<em>{count}</em>}</button>)}</div></div>
}

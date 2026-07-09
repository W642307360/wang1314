import { useState } from 'react'
import './App.css'
import './Me.css'
import './Catalog.css'
import './DetailEnhance.css'
import { AddressesPage, CollectionPage, CouponsPage, FootprintsPage, LoginPage, MessagesPage, OrdersPage, type User } from './UserModules'
import { hallByKey, halls, type BreedItem, type HallKey } from './catalog'

type Page = 'home' | 'hall' | 'breed' | 'detail' | 'family' | 'service' | 'me' | 'login' | 'orders' | 'favorites' | 'follows' | 'footprints' | 'addresses' | 'coupons' | 'settings' | 'about' | 'agreement' | 'privacy'
const dogBreeds=hallByKey('dogs').breeds.slice(0,5)
const petPhoto=dogBreeds[0].image

function Back({onClick}:{onClick:()=>void}) { return <button className="back" onClick={onClick}>‹</button> }
function Nav({go,page}:{go:(p:Page)=>void,page:Page}) {
  return <nav>{[['home','⌂','市场'],['family','♡','宠物家'],['service','♧','客服'],['me','♙','我的']].map(([p,i,t])=>
    <button key={p} className={page===p?'active':''} onClick={()=>go(p as Page)}><i>{i}</i><span>{t}</span></button>)}</nav>
}

function Home({openHall}:{openHall:(key:HallKey)=>void}) {
  return <><header><div className="brand"><small>FUCHONG PET FAMILY</small><h1>福宠</h1><span>成都⌄</span></div><button className="search">⌕&nbsp; 搜索宠物品种、昵称或商家</button></header>
    <section className="home-title"><small>SELECT YOUR COMPANION</small><h2>选择你的宠物场馆</h2><p>每一种生命，都值得被认真了解</p></section>
    <div className="hall-list">{halls.map(h=><button key={h.key} onClick={()=>openHall(h.key)}><img src={h.hero}/><div><h3>{h.name}</h3><p>{h.subtitle}</p><b>进入场馆 →</b></div></button>)}</div></>
}

function Hall({go,hallKey,openBreed}:{go:(p:Page)=>void;hallKey:HallKey;openBreed:(b:BreedItem)=>void}) {
 const hall=hallByKey(hallKey);const [query,setQuery]=useState('');const visible=hall.breeds.filter(b=>b.name.includes(query)||b.en.toLowerCase().includes(query.toLowerCase()))
 return <><div className="subhead"><Back onClick={()=>go('home')}/><div><small>PET PAVILION</small><h2>{hall.name}</h2></div><button>⌕</button></div>
   <section className="hall-hero" style={{backgroundImage:`linear-gradient(90deg,#392a1edb,#392a1e20),url(${hall.hero})`}}><div><small>{hall.subtitle}</small><h2>{hall.name}<br/>先了解，再选择</h2><p>收录 {hall.breeds.length} 个品种 · 持续更新</p></div></section>
   <div className="hall-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`搜索${hall.name}品种`}/><span>{visible.length} 个结果</span></div>
   <section className="breed-grid">{visible.map((b,i)=><button key={b.id} onClick={()=>openBreed(b)}><div className="headshot"><img src={b.image}/><span>{i%7+3}只在售</span></div><h3>{b.name}</h3><small>{b.en}</small><p>{b.desc}</p></button>)}</section></>
}

function Breed({go,breed}:{go:(p:Page)=>void;breed:BreedItem}) {
 const b=breed
 return <><div className="subhead"><Back onClick={()=>go('hall')}/><div><small>BREED PROFILE</small><h2>犬种资料</h2></div><button>♡</button></div>
  <section className="breed-cover"><img src={b.image}/><span>标准品种档案</span></section>
  <section className="breed-copy"><small>{b.en.toUpperCase()}</small><h1>{b.name}</h1><p>{b.desc}。平台档案包含外形、性格、饲养建议、健康注意事项与专属成长记录。</p>
    <div className="metric"><div><b>大型犬</b><small>体型</small></div><div><b>10–12年</b><small>寿命</small></div><div><b>友善</b><small>性格</small></div><div><b>中等</b><small>饲养难度</small></div></div>
  </section>
  <section className="trait-card"><h3>犬种特征</h3>{[['亲人程度','95%'],['运动需求','85%'],['掉毛程度','70%'],['训练难度','30%']].map(x=><div className="trait" key={x[0]}><span>{x[0]}</span><i><b style={{width:x[1]}}/></i><small>{x[1]}</small></div>)}</section>
  <div className="section-bar"><h2>等待回家的它们</h2><span>共 12 只</span></div>
  <div className="available">{[1,2,3,4].map((x)=><button key={x} onClick={()=>go('detail')}><img src={petPhoto}/><span>健康认证</span><h3>小太阳 {x}号</h3><p>金毛寻回犬 · {x+2}个月 · ♂</p><b>¥ {6800+x*500}</b></button>)}</div></>
}

function Detail({go,breed}:{go:(p:Page)=>void;breed:BreedItem}) {
 const [featureTab,setFeatureTab]=useState('品种');const [playing,setPlaying]=useState(false)
 return <div className="detail"><section className="detail-hero"><img src={breed.image}/><Back onClick={()=>go('breed')}/><span className="life">♢ 可查看3日常生活照</span><div className="pet-name"><em>Coco</em><i>♀</i><b>纯种{breed.name}</b><p>温顺亲人　|　粘人可爱　|　安静乖巧　|　适合家养</p></div><strong className="price">¥6800 <small>已售 128</small></strong><span className="count">1/6</span></section>
   <section className="parents"><Parent title="爸爸　阿布 (Abu)" sex="♂"/><div className="heart">♡</div><Parent title="妈妈　拉拉 (Lala)" sex="♀"/></section>
   <section className="feature"><div className="feature-tabs">{['品种','毛色','体型','毛发长度','性格','声音','健康状况','是否纯种'].map((x,i)=><button key={x} onClick={()=>setFeatureTab(x)} className={featureTab===x?'active':''}><i>{['♧','◉','♙','〽','✦','◖','♢','♢'][i]}</i>{x}</button>)}</div>
    <div className="breed-detail"><div><h3>{breed.name} ({breed.en})</h3><p>{breed.desc}。每只宠物均建立独立健康、疫苗、父母血统与成长影像档案。</p></div><dl><dt>原产地</dt><dd>品种档案</dd><dt>寿命</dt><dd>10–16年</dd><dt>体重</dt><dd>4–34kg</dd><dt>体型</dt><dd>标准体型</dd></dl></div>
    <div className="visual-traits"><article><span>真实毛色</span><div className="fur-swatch"/><b>自然金棕</b></article><article><span>体型对比</span><div className="body-scale"><i/><i/><i className="on"/></div><b>标准体型</b></article><article><span>毛发长度</span><div className="fur-length">﹏﹏﹏</div><b>柔软长毛</b></article></div>
    {['毛色　自然金棕色','体型　标准体型 · 成体对比','毛发长度　柔软长毛','性格　温顺亲人　粘人可爱　安静乖巧'].map(x=><div className="row" key={x}>{x}<b>⌄</b></div>)}
    <button className={`sound-player ${playing?'playing':''}`} onClick={()=>setPlaying(!playing)}><i>{playing?'❚❚':'▶'}</i><span>{playing?'正在播放真实声音':'点击试听宠物声音'}</span><em>▂▃▅▂▆▃▇▂▅▃▆</em></button>
   </section>
   <section className="growth"><h3>{breed.name} · 专属成长记录</h3><div>{['1个月','2个月','3个月','6个月','1岁','2岁'].map((x,i)=><article key={x}><b>{x}</b><small>{i<3?'体型初长':'健康成长'}</small><img src={breed.image}/></article>)}</div></section>
   <section className="origin"><div><h3>品种起源</h3><div className="origin-map"><i>●</i><span>{breed.name}<br/>ORIGIN</span></div><p>{breed.name}拥有完整的标准化品种起源、历史与遗传特征档案。</p></div><div><h3>所属商家</h3><b>福宠认证宠物馆　★★★★★</b><p>健康保障 · 售后无忧 · 已售3289+</p><button>进入店铺 ›</button></div></section>
   <section className="reviews"><h3>用户评价（128）</h3>{['小可爱','糖糖不甜','爱好者'].map(n=><article key={n}><b>●　{n}　<span>★★★★★</span></b><p>Coco太可爱了，到家很健康，性格温顺，非常亲人。</p></article>)}</section>
   <div className="buybar"><button>♧<small>客服</small></button><button>♡<small>收藏</small></button><button>🛒<small>加入购物车</small></button><button className="buy">立即购买 <small>¥6800</small></button></div>
  </div>
}
function Parent({title,sex}:{title:string,sex:string}) {return <div className="parent"><img src={petPhoto}/><div><h3>{title} <i>{sex}</i></h3><p>品种：金毛寻回犬<br/>毛色：金黄色<br/>血统：纯种<br/>年龄：3岁　体重：32kg</p></div></div>}
function Me({go,user}:{go:(p:Page)=>void;user:User|null}) {
 const orders=[['待付款','0'],['待确认','1'],['待发货','0'],['待收货','2'],['售后/退款','0']]
 const services=[
  ['♡','我的收藏','收藏的宠物与心愿清单','favorites'],['☆','我的关注','关注的商家与动态','follows'],
  ['◷','浏览足迹','最近看过的宠物','footprints'],['⌖','收货地址','管理配送地址','addresses'],
  ['⌑','优惠券','3 张可用优惠券','coupons'],['♧','专属客服','售前咨询与售后服务','service'],
  ['⚙','设置','账号、安全与通知','settings'],['ⓘ','关于福宠','品牌、协议与隐私','about']
 ] as const
 return <div className="me-page">
   <section className="me-hero">
    <div className="me-top"><span>个人中心</span><button onClick={()=>go('settings')}>⚙</button></div>
    <button className="profile" onClick={()=>go('login')}><div className="avatar">{user?'宠':'福'}</div><div><h1>{user?.nickname||'登录 / 注册'}</h1><p>{user?(user.phone||'点击绑定手机号'):'登录后同步订单、收藏和宠物档案'}</p></div><b>›</b></button>
    <div className="member-card"><div><small>FUCHONG MEMBER</small><h3>福宠安心会员</h3><p>专属顾问 · 健康档案 · 成长陪伴</p></div><button>了解权益</button></div>
   </section>
   <section className="me-orders"><div className="card-head"><h2>我的订单</h2><button onClick={()=>go('orders')}>全部订单 ›</button></div>
    <div className="order-shortcuts">{orders.map(([name,count],i)=><button key={name} onClick={()=>go('orders')}><i>{['⌁','✓','▣','⌂','↻'][i]}</i><span>{name}</span>{count!=='0'&&<b>{count}</b>}</button>)}</div>
   </section>
   <section className="me-stats"><button onClick={()=>go('favorites')}><b>12</b><span>收藏宠物</span></button><button onClick={()=>go('follows')}><b>5</b><span>关注商家</span></button><button onClick={()=>go('footprints')}><b>36</b><span>浏览足迹</span></button><button onClick={()=>go('coupons')}><b>3</b><span>优惠券</span></button></section>
   <section className="me-services"><h2>常用服务</h2>{services.map(([icon,title,desc,target])=><button key={title} onClick={()=>go(target)}><i>{icon}</i><div><b>{title}</b><small>{desc}</small></div><span>›</span></button>)}</section>
   <section className="me-links"><button onClick={()=>go('agreement')}>用户协议 <span>›</span></button><button onClick={()=>go('privacy')}>隐私政策 <span>›</span></button></section>
   <p className="version">福宠 FUCHONG · v0.2.0</p>
  </div>
}

function SubPage({title,go}:{title:string,go:(p:Page)=>void}) {
 return <div className="subpage"><div className="subhead"><Back onClick={()=>go('me')}/><div><small>FUCHONG</small><h2>{title}</h2></div><span/></div><div className="simple-card">该入口已建立，将在对应模块阶段补齐完整交互。</div></div>
}

export default function App(){
 const [page,setPage]=useState<Page>('home'); const [user,setUser]=useState<User|null>(()=>{try{return JSON.parse(localStorage.getItem('fuchong-user')||'null')}catch{return null}})
 const [hallKey,setHallKey]=useState<HallKey>('dogs');const [breed,setBreed]=useState<BreedItem>(dogBreeds[0])
 const go=(p:Page)=>{setPage(p);scrollTo(0,0)};const login=(u:User)=>{setUser(u);localStorage.setItem('fuchong-user',JSON.stringify(u))};const logout=()=>{setUser(null);localStorage.removeItem('fuchong-user')}
 const openHall=(key:HallKey)=>{setHallKey(key);go('hall')};const openBreed=(item:BreedItem)=>{setBreed(item);go('breed')}
 return <main className="phone-shell">{page==='home'&&<Home openHall={openHall}/>} {page==='hall'&&<Hall go={go} hallKey={hallKey} openBreed={openBreed}/>} {page==='breed'&&<Breed go={go} breed={breed}/>} {page==='detail'&&<Detail go={go} breed={breed}/>}
 {page==='family'&&<CollectionPage mode="favorites" back={()=>go('home')}/>} {page==='service'&&<MessagesPage back={()=>go('home')}/>} {page==='me'&&<Me go={go} user={user}/>}
 {page==='login'&&<LoginPage back={()=>go('me')} user={user} onLogin={login} onLogout={logout}/>} {page==='orders'&&<OrdersPage back={()=>go('me')}/>}
 {page==='favorites'&&<CollectionPage mode="favorites" back={()=>go('me')}/>} {page==='follows'&&<CollectionPage mode="follows" back={()=>go('me')}/>}
 {page==='footprints'&&<FootprintsPage back={()=>go('me')}/>} {page==='addresses'&&<AddressesPage back={()=>go('me')}/>} {page==='coupons'&&<CouponsPage back={()=>go('me')}/>}
 {['settings','about','agreement','privacy'].includes(page)&&<SubPage title={({settings:'设置',about:'关于福宠',agreement:'用户协议',privacy:'隐私政策'} as Record<string,string>)[page]} go={go}/>}
 {!['hall','breed','detail'].includes(page)&&<Nav go={go} page={page}/>}</main>
}

import { useState } from 'react'
import './App.css'
import './Me.css'

type Page = 'home' | 'hall' | 'breed' | 'detail' | 'family' | 'service' | 'me' | 'login' | 'orders' | 'favorites' | 'follows' | 'footprints' | 'addresses' | 'coupons' | 'settings' | 'about' | 'agreement' | 'privacy'
const dogBreeds = [
  { name:'金毛寻回犬', en:'Golden Retriever', desc:'温顺友善 · 聪明忠诚', img:'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=90' },
  { name:'柴犬', en:'Shiba Inu', desc:'独立勇敢 · 干净安静', img:'https://images.unsplash.com/photo-1561037404-61cd46aa615b?auto=format&fit=crop&w=600&q=90' },
  { name:'边境牧羊犬', en:'Border Collie', desc:'聪颖敏捷 · 活力充沛', img:'https://images.unsplash.com/photo-1503256207526-0d5d80fa2f47?auto=format&fit=crop&w=600&q=90' },
  { name:'萨摩耶', en:'Samoyed', desc:'微笑天使 · 亲人活泼', img:'https://images.unsplash.com/photo-1529429617124-aee711a7078b?auto=format&fit=crop&w=600&q=90' },
  { name:'柯基犬', en:'Welsh Corgi', desc:'热情大胆 · 短腿萌趣', img:'https://images.unsplash.com/photo-1546975490-e8b92a360b24?auto=format&fit=crop&w=600&q=90' },
]
const petPhoto=dogBreeds[0].img

function Back({onClick}:{onClick:()=>void}) { return <button className="back" onClick={onClick}>‹</button> }
function Nav({go,page}:{go:(p:Page)=>void,page:Page}) {
  return <nav>{[['home','⌂','市场'],['family','♡','宠物家'],['service','♧','客服'],['me','♙','我的']].map(([p,i,t])=>
    <button key={p} className={page===p?'active':''} onClick={()=>go(p as Page)}><i>{i}</i><span>{t}</span></button>)}</nav>
}

function Home({go}:{go:(p:Page)=>void}) {
  const halls=[['猫猫馆','布偶、英短、缅因等','https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=700&q=88'],['狗狗馆','金毛、柴犬、柯基等',dogBreeds[0].img],['鸟类馆','鹦鹉、文鸟、金丝雀','https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=700&q=88'],['水族馆','观赏鱼与水生萌宠','https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?auto=format&fit=crop&w=700&q=88'],['异宠馆','守宫、蜜袋鼯、龙猫','https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=700&q=88'],['更多馆','发现更多生命伙伴','https://images.unsplash.com/photo-1452857297128-d9c29adba80b?auto=format&fit=crop&w=700&q=88']]
  return <><header><div className="brand"><small>FUCHONG PET FAMILY</small><h1>福宠</h1><span>成都⌄</span></div><button className="search">⌕&nbsp; 搜索宠物品种、昵称或商家</button></header>
    <section className="home-title"><small>SELECT YOUR COMPANION</small><h2>选择你的宠物场馆</h2><p>每一种生命，都值得被认真了解</p></section>
    <div className="hall-list">{halls.map((h,i)=><button key={h[0]} onClick={()=>i===1?go('hall'):undefined}><img src={h[2]} /><div><h3>{h[0]}</h3><p>{h[1]}</p><b>{i===1?'进入场馆':'即将开放'} →</b></div></button>)}</div></>
}

function Hall({go}:{go:(p:Page)=>void}) {
 return <><div className="subhead"><Back onClick={()=>go('home')}/><div><small>PET PAVILION</small><h2>狗狗馆</h2></div><button>⌕</button></div>
   <section className="hall-hero"><div><small>找到你的忠诚伙伴</small><h2>认识每一个犬种<br/>再做一生的选择</h2><p>收录 68 个犬种 · 326 只在售</p></div></section>
   <div className="filter"><b>热门犬种</b><span>小型犬</span><span>中型犬</span><span>大型犬</span></div>
   <section className="breed-grid">{dogBreeds.map((b,i)=><button key={b.name} onClick={()=>go('breed')}><div className="headshot"><img src={b.img}/><span>{i+12}只在售</span></div><h3>{b.name}</h3><small>{b.en}</small><p>{b.desc}</p></button>)}</section></>
}

function Breed({go}:{go:(p:Page)=>void}) {
 const b=dogBreeds[0]
 return <><div className="subhead"><Back onClick={()=>go('hall')}/><div><small>BREED PROFILE</small><h2>犬种资料</h2></div><button>♡</button></div>
  <section className="breed-cover"><img src={b.img}/><span>AKC 认证犬种</span></section>
  <section className="breed-copy"><small>{b.en.toUpperCase()}</small><h1>{b.name}</h1><p>忠诚、温和而聪慧的家庭伙伴。它们热爱人与户外活动，对儿童友善，拥有稳定且包容的性格。</p>
    <div className="metric"><div><b>大型犬</b><small>体型</small></div><div><b>10–12年</b><small>寿命</small></div><div><b>友善</b><small>性格</small></div><div><b>中等</b><small>饲养难度</small></div></div>
  </section>
  <section className="trait-card"><h3>犬种特征</h3>{[['亲人程度','95%'],['运动需求','85%'],['掉毛程度','70%'],['训练难度','30%']].map(x=><div className="trait" key={x[0]}><span>{x[0]}</span><i><b style={{width:x[1]}}/></i><small>{x[1]}</small></div>)}</section>
  <div className="section-bar"><h2>等待回家的它们</h2><span>共 12 只</span></div>
  <div className="available">{[1,2,3,4].map((x)=><button key={x} onClick={()=>go('detail')}><img src={petPhoto}/><span>健康认证</span><h3>小太阳 {x}号</h3><p>金毛寻回犬 · {x+2}个月 · ♂</p><b>¥ {6800+x*500}</b></button>)}</div></>
}

function Detail({go}:{go:(p:Page)=>void}) {
 return <div className="detail"><section className="detail-hero"><img src={petPhoto}/><Back onClick={()=>go('breed')}/><span className="life">♢ 可查看3日常生活照</span><div className="pet-name"><em>Coco</em><i>♀</i><b>纯种金毛寻回犬</b><p>温顺亲人　|　粘人可爱　|　安静乖巧　|　适合家养</p></div><strong className="price">¥6800 <small>已售 128</small></strong><span className="count">1/6</span></section>
   <section className="parents"><Parent title="爸爸　阿布 (Abu)" sex="♂"/><div className="heart">♡</div><Parent title="妈妈　拉拉 (Lala)" sex="♀"/></section>
   <section className="feature"><div className="feature-tabs">{['品种','毛色','体型','毛发长度','性格','声音','健康状况','是否纯种'].map((x,i)=><button key={x} className={i===0?'active':''}><i>{['♧','♡','♙','⌁','♙','◖','♢','♢'][i]}</i>{x}</button>)}</div>
    <div className="breed-detail"><div><h3>金毛寻回犬 (Golden Retriever)</h3><p>金毛犬原产于英国，是一种大型、温顺的长毛犬，性格温和、友善且聪明，被誉为最适合家庭陪伴的犬种之一。</p></div><dl><dt>原产地</dt><dd>英国</dd><dt>寿命</dt><dd>10–12年</dd><dt>体重</dt><dd>25–34kg</dd><dt>体型</dt><dd>大型犬</dd></dl></div>
    {['毛色　金黄色','体型　大型犬','毛发长度　长毛','性格　温顺亲人　粘人可爱　安静乖巧','声音　▶ 点击试听'].map(x=><div className="row" key={x}>{x}<b>⌄</b></div>)}
   </section>
   <section className="growth"><h3>成长记录</h3><div>{['1个月','2个月','3个月','6个月','1岁','2岁'].map((x,i)=><article key={x}><b>{x}</b><small>{i<3?'好奇探索':'快乐成长'}</small><img src={petPhoto}/></article>)}</div></section>
   <section className="origin"><div><h3>品种起源</h3><p>金毛寻回犬起源于19世纪的英国，因其温顺、喜爱与人相处，被称为“阳光般的狗狗”。</p></div><div><h3>所属商家</h3><b>汪星宠物馆　★★★★★</b><p>健康保障 · 售后无忧 · 已售3289+</p><button>进入店铺 ›</button></div></section>
   <section className="reviews"><h3>用户评价（128）</h3>{['小可爱','糖糖不甜','爱好者'].map(n=><article key={n}><b>●　{n}　<span>★★★★★</span></b><p>Coco太可爱了，到家很健康，性格温顺，非常亲人。</p></article>)}</section>
   <div className="buybar"><button>♧<small>客服</small></button><button>♡<small>收藏</small></button><button>🛒<small>加入购物车</small></button><button className="buy">立即购买 <small>¥6800</small></button></div>
  </div>
}
function Parent({title,sex}:{title:string,sex:string}) {return <div className="parent"><img src={petPhoto}/><div><h3>{title} <i>{sex}</i></h3><p>品种：金毛寻回犬<br/>毛色：金黄色<br/>血统：纯种<br/>年龄：3岁　体重：32kg</p></div></div>}
function Simple({title,text}:{title:string,text:string}) {return <section className="simple"><h1>{title}</h1><p>{text}</p><div className="simple-card">功能内容正在按正式业务数据结构接入</div></section>}

function Me({go}:{go:(p:Page)=>void}) {
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
    <button className="profile" onClick={()=>go('login')}><div className="avatar">福</div><div><h1>登录 / 注册</h1><p>登录后同步订单、收藏和宠物档案</p></div><b>›</b></button>
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
 const [page,setPage]=useState<Page>('home'); const go=(p:Page)=>{setPage(p);scrollTo(0,0)}
 return <main className="phone-shell">{page==='home'&&<Home go={go}/>} {page==='hall'&&<Hall go={go}/>} {page==='breed'&&<Breed go={go}/>} {page==='detail'&&<Detail go={go}/>}
 {page==='family'&&<Simple title="宠物家" text="收藏、关注、到家档案与成长记录"/>}{page==='service'&&<Simple title="专属客服" text="售前咨询、订单服务与售后保障"/>}{page==='me'&&<Me go={go}/>}
 {!['home','hall','breed','detail','family','service','me'].includes(page)&&<SubPage title={({login:'登录 / 注册',orders:'我的订单',favorites:'我的收藏',follows:'我的关注',footprints:'浏览足迹',addresses:'收货地址',coupons:'优惠券',settings:'设置',about:'关于福宠',agreement:'用户协议',privacy:'隐私政策'} as Record<string,string>)[page]} go={go}/>}
 {!['hall','breed','detail'].includes(page)&&<Nav go={go} page={page}/>}</main>
}

import type { LoadState } from './domain'
import './UIStates.css'

export function Skeleton({rows=4}:{rows?:number}){return <div className="skeleton-list" aria-label="正在加载">{Array.from({length:rows},(_,i)=><div className="skeleton-card" key={i}><i/><span><b/><b/><b/></span></div>)}</div>}
export function StateView({state,retry}:{state:LoadState;retry?:()=>void}){
 if(state==='loading')return <Skeleton/>
 const map={empty:['♡','这里暂时空空的','去市场看看心动宠物'],error:['!','加载失败','请稍后重试'],offline:['⌁','网络开小差了','检查网络后重试']} as const
 if(state==='empty'||state==='error'||state==='offline'){const [icon,title,text]=map[state];return <div className="state-view"><i>{icon}</i><h3>{title}</h3><p>{text}</p>{retry&&<button onClick={retry}>重新加载</button>}</div>}
 return null
}
export function RefreshHint({refreshing,hasMore}:{refreshing:boolean;hasMore:boolean}){return <div className="refresh-hint">{refreshing?'正在刷新最新内容…':hasMore?'继续上拉加载更多':'已经看到全部内容'}</div>}

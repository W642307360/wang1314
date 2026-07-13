export type VisitorSession={token:string;userId:number;visitorId:number}
const API_BASE=import.meta.env.VITE_API_BASE||'http://127.0.0.1:3001'
export async function ensureVisitor():Promise<VisitorSession|null>{
  let token=localStorage.getItem('fuchong-visitor-token')
  if(!token){token=crypto.randomUUID();localStorage.setItem('fuchong-visitor-token',token)}
  try{const r=await fetch(`${API_BASE}/api/visitors/session`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});const session=await r.json();localStorage.setItem('fuchong-user-id',String(session.userId));return session}catch{return null}
}

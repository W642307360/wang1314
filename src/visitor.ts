import { publishUserId } from './userIdentity'

export type VisitorSession={token:string;userId:number;visitorId:number}
const API_BASE=import.meta.env.VITE_API_BASE||(import.meta.env.PROD?'':'http://127.0.0.1:3001')
export async function ensureVisitor():Promise<VisitorSession|null>{
  let token=localStorage.getItem('fuchong-visitor-token')
  if(!token){token=crypto.randomUUID();localStorage.setItem('fuchong-visitor-token',token)}
  try{const r=await fetch(`${API_BASE}/api/visitors/session`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});if(!r.ok)return null;const session=await r.json();publishUserId(Number(session.userId));return session}catch{return null}
}

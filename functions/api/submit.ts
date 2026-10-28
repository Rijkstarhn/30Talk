interface Env { ADMIN_TOKEN:string; GITHUB_TOKEN:string; GITHUB_REPO?:string }
interface Context { request:Request; env:Env }
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
function idFromUrl(value:string):string|null {
 try {const u=new URL(value);if(u.protocol!=='https:')return null;const host=u.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');let id:string|null=null;
 if(host==='youtu.be')id=u.pathname.split('/')[1]||null;
 if(host==='youtube.com' || host==='youtube-nocookie.com')id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:live|shorts|embed)\/([^/]+)/)?.[1]||null;
 return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:null;
 }catch{return null;}
}
async function equalSecret(a:string,b:string){const enc=new TextEncoder();const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);return new Uint8Array(x).every((v,i)=>v===new Uint8Array(y)[i]);}
export async function onRequestPost({request,env}:Context):Promise<Response>{
 if(!env.ADMIN_TOKEN||!env.GITHUB_TOKEN)return json({error:'Server secrets are not configured'},503);
 const auth=request.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer ')||!(await equalSecret(auth.slice(7),env.ADMIN_TOKEN)))return json({error:'管理员口令错误'},401);
 const len=Number(request.headers.get('content-length')||0);if(len>2048)return json({error:'Request too large'},413);
 let input:unknown;try{input=await request.json()}catch{return json({error:'Invalid JSON'},400)}
 const value=(input as {url?:unknown})?.url;if(typeof value!=='string'||value.length>500)return json({error:'Invalid URL'},400);
 const id=idFromUrl(value);if(!id)return json({error:'仅支持有效的 YouTube HTTPS 链接'},400);
 const repo=env.GITHUB_REPO||'Rijkstarhn/30Talk';if(!/^[\w.-]+\/[\w.-]+$/.test(repo))return json({error:'Invalid repo config'},500);
 const headers={'authorization':`Bearer ${env.GITHUB_TOKEN}`,'accept':'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'30talk-pages'};
 const gh=async(path:string,init?:RequestInit)=>fetch(`https://api.github.com/repos/${repo}${path}`,{...init,headers:{...headers,...init?.headers}});
 const exists=await gh(`/contents/content/${id}/metadata.json`);
 if(exists.ok)return json({status:'ready',id,message:'该视频已发布'});
 if(exists.status!==404)return json({error:'GitHub 内容检查失败'},502);
 const issues=await gh('/issues?state=open&per_page=100');if(!issues.ok)return json({error:'GitHub 队列检查失败'},502);
 const open=await issues.json() as Array<{number:number;title:string;pull_request?:unknown}>;
 const duplicate=open.find(i=>!i.pull_request&&i.title===`[30Talk] ${id}`);
 if(duplicate)return json({status:'pending',id,issue:duplicate.number,message:'该视频已在队列中'});
 const created=await gh('/issues',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:`[30Talk] ${id}`,body:`Submitted by 30Talk admin.\n\nVideo: https://www.youtube.com/watch?v=${id}\nVideo ID: ${id}\n`,labels:['30talk-request']})});
 if(!created.ok)return json({error:'创建 GitHub Issue 失败；请确认 Issues 已开启且 Token 有 Issues 写权限',details:created.status},502);
 const issue=await created.json() as {number:number};return json({status:'pending',id,issue:issue.number,message:'已提交处理队列'},202);
}

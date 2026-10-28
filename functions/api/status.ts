interface Env {GITHUB_TOKEN:string;GITHUB_REPO?:string}
export async function onRequestGet({request,env}:{request:Request;env:Env}):Promise<Response>{
 const url=new URL(request.url);const id=url.searchParams.get('id')||'';
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(!/^[A-Za-z0-9_-]{11}$/.test(id))return reply({error:'Invalid ID'},400);
 if(!env.GITHUB_TOKEN)return reply({error:'Not configured'},503);
 const repo=env.GITHUB_REPO||'Rijkstarhn/30Talk';const headers={authorization:`Bearer ${env.GITHUB_TOKEN}`,accept:'application/vnd.github+json','user-agent':'30talk-pages'};
 const file=await fetch(`https://api.github.com/repos/${repo}/contents/content/${id}/metadata.json`,{headers});
 if(file.ok)return reply({id,status:'ready'});
 if(file.status!==404)return reply({id,status:'unknown'},502);
 const issues=await fetch(`https://api.github.com/repos/${repo}/issues?state=all&per_page=100`,{headers});
 if(!issues.ok)return reply({id,status:'unknown'},502);
 const data=await issues.json() as Array<{number:number;title:string;state:string;labels:Array<{name:string}>;pull_request?:unknown}>;
 const match=data.find(x=>!x.pull_request&&x.title===`[30Talk] ${id}`);
 return reply({id,status:match?(match.labels?.some(x=>x.name==='30talk-failed')?'failed':'pending'):'not_found',issue:match?.number});
}

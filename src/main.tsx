import React, {useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

type Interview={id:string;url:string;title:string;description:string;language:string;ready:boolean;hasOriginal:boolean};
type Cue={start:number;end:number;text:string};
type YTPlayer={getCurrentTime:()=>number;getDuration:()=>number;seekTo:(s:number,allowSeekAhead:boolean)=>void;destroy:()=>void;pauseVideo:()=>void;playVideo:()=>void};
declare global {interface Window {YT?:{Player:new(id:string,options:object)=>YTPlayer};onYouTubeIframeAPIReady?:()=>void}}
function parseVtt(input:string):Cue[]{
  const blocks=input.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/);
  const cues:Cue[]=[];
  const time=(s:string)=>{const p=s.replace(',','.').split(':').map(Number);return p.reduce((a,b)=>a*60+b,0)};
  for(const block of blocks){const lines=block.trim().split('\n');const i=lines.findIndex(l=>l.includes(' --> '));if(i<0)continue;
    const m=lines[i].match(/(\d{2}:\d{2}(?::\d{2})?[.,]\d{3})\s+-->\s+(\d{2}:\d{2}(?::\d{2})?[.,]\d{3})/);
    if(!m)continue;const text=lines.slice(i+1).join('\n').replace(/<[^>]*>/g,'').trim();if(text)cues.push({start:time(m[1]),end:time(m[2]),text});
  }return cues;
}
let ytPromise:Promise<void>|undefined;
function loadYoutube(){if(window.YT?.Player)return Promise.resolve();if(ytPromise)return ytPromise;
  ytPromise=new Promise((resolve,reject)=>{const previous=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{previous?.();resolve()};const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=()=>reject(new Error('YouTube API 加载失败'));document.head.appendChild(s)});return ytPromise;
}
function formatTime(t:number){const n=Math.max(0,Math.floor(t));return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}
function videoIdFromUrl(value:string):string|null{
 try{const u=new URL(value.trim());if(u.protocol!=='https:')return null;const host=u.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');let id:string|null=null;
 if(host==='youtu.be')id=u.pathname.split('/')[1]||null;
 else if(host==='youtube.com'||host==='youtube-nocookie.com')id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]||null;
 return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:null;
 }catch{return null;}
}
function App(){
 const [catalog,setCatalog]=useState<Interview[]>([]),[urlInput,setUrlInput]=useState(''),[adminToken,setAdminToken]=useState(''),[addMessage,setAddMessage]=useState(''),[submitting,setSubmitting]=useState(false),[pendingId,setPendingId]=useState(''),[selected,setSelected]=useState<string>(''),[error,setError]=useState(''),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[en,setEn]=useState<Cue[]>([]),[zh,setZh]=useState<Cue[]>([]),[mode,setMode]=useState<'both'|'zh'|'en'>('both'),[fontSize,setFontSize]=useState(19),[ready,setReady]=useState(false);
 const player=useRef<YTPlayer|null>(null),timer=useRef<number|undefined>(undefined),restored=useRef(false);
 useEffect(()=>{fetch('/catalog.json').then(r=>{if(!r.ok)throw Error('无法加载访谈列表');return r.json()}).then((items:Interview[])=>{setCatalog(items);if(items.length)setSelected(items[0].id)}).catch(e=>setError(String(e)))},[]);
 const allItems=catalog;
 const item=allItems.find(v=>v.id===selected);
 const addVideo=async(e:React.FormEvent)=>{
  e.preventDefault();setAddMessage('');const id=videoIdFromUrl(urlInput);
  if(!id){setAddMessage('请输入有效的 YouTube HTTPS 链接。');return;}
  if(!adminToken){setAddMessage('请输入管理员口令。');return;}
  setSubmitting(true);
  try{
   const response=await fetch('/api/submit',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${adminToken}`},body:JSON.stringify({url:urlInput})});
   const data=await response.json() as {message?:string;error?:string;status?:string};
   if(!response.ok)throw new Error(data.error||'提交失败');
   setAddMessage(data.message||'已提交');setPendingId(data.status==='pending'?id:'');setUrlInput('');
   if(data.status==='ready')window.location.reload();
  }catch(err){setAddMessage(err instanceof Error?err.message:'提交失败')}
  finally{setSubmitting(false)}
 };
 useEffect(()=>{if(!pendingId)return;const check=async()=>{
  try{const r=await fetch(`/api/status?id=${pendingId}`,{cache:'no-store'});if(!r.ok)return;
   const data=await r.json() as {status:string};
   if(data.status==='ready'){setPendingId('');setAddMessage('字幕处理完成，正在更新页面。部署完成后刷新即可查看。')}
   else if(data.status==='failed'){setPendingId('');setAddMessage('字幕处理失败，请管理员检查 GitHub Issue。')}
  }catch{/* retry later */}
 };void check();const timer=window.setInterval(check,30000);return()=>window.clearInterval(timer)},[pendingId]);
 useEffect(()=>{if(!selected)return;let cancelled=false;setEn([]);setZh([]);setTime(0);setReady(false);setError('');restored.current=false;
   Promise.all([fetch(`/content/${selected}/en.vtt`).then(r=>r.ok?r.text():'').catch(()=>''),fetch(`/content/${selected}/zh.vtt`).then(r=>r.ok?r.text():'').catch(()=>'')]).then(([a,b])=>{if(!cancelled){setEn(parseVtt(a));setZh(parseVtt(b))}});
   return ()=>{cancelled=true};
 },[selected]);
 useEffect(()=>{if(!selected)return;let cancelled=false;
   loadYoutube().then(()=>{if(cancelled)return;const instance=new window.YT!.Player('yt-player',{videoId:selected,playerVars:{playsinline:1,rel:0},events:{onReady:()=>{if(cancelled)return;setReady(true);try{setDuration(instance.getDuration()||0);const saved=Number(localStorage.getItem(`30talk-progress-${selected}`)||0);if(saved>5&&!restored.current){instance.seekTo(saved,true);restored.current=true}}catch{}},onError:()=>setError('视频无法嵌入播放，请尝试在 YouTube 打开。')}});player.current=instance;
     timer.current=window.setInterval(()=>{try{const t=instance.getCurrentTime();if(Number.isFinite(t)){setTime(t);localStorage.setItem(`30talk-progress-${selected}`,String(t))}setDuration(instance.getDuration()||0)}catch{}},500);
   }).catch(e=>{if(!cancelled)setError(String(e))});
   return ()=>{cancelled=true;window.clearInterval(timer.current);timer.current=undefined;try{player.current?.destroy()}catch{}player.current=null};
 },[selected]);
 const active=(cues:Cue[])=>cues.find(c=>c.start<=time&&c.end>time)??null;
 const activeEn=active(en),activeZh=active(zh);
 const rows=useMemo(()=>{const primary=zh.length?zh:en;return primary.map((c,i)=>({start:c.start,zh:zh.length?c.text:'',en:en[i]?.text||''}))},[en,zh]);
 const seek=(t:number)=>{player.current?.seekTo(t,true);setTime(t)};
 return <div className="app"><header><div className="brand"><span className="mark">30</span><span>Talk</span></div><span className="tagline">值得反复思考的访谈</span><a href="https://github.com/Rijkstarhn/30Talk" target="_blank" rel="noreferrer">GitHub ↗</a></header>
 <main><div className="intro"><div className="eyebrow">INTERVIEW LIBRARY</div><h1>深度对话，双语聆听。</h1><p>精选人物访谈，原视频播放，中文翻译与英文字幕同步呈现。</p></div>
 <form className="add-video" onSubmit={addVideo}><label htmlFor="video-url">管理员 · 添加 YouTube 视频</label><div className="add-video-row"><input id="video-url" type="url" value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." required/><input aria-label="管理员口令" type="password" value={adminToken} onChange={e=>setAdminToken(e.target.value)} placeholder="管理员口令" autoComplete="off" required/><button type="submit" disabled={submitting}>{submitting?'提交中…':'提交处理'}</button></div><p>提交后由 Mac mini 获取字幕、Codex 翻译、校验并发布。仅管理员可以提交；处理完成后所有访客可观看。</p>{addMessage&&<div className="add-message" role="status">{addMessage}</div>}{pendingId&&<p role="status">任务处理中：{pendingId}（每 30 秒检查状态）</p>}</form>
 {error&&<div role="alert" className="error">{error}</div>}
 {allItems.length===0?<section className="empty">尚无访谈。请确认仓库的 content/ 目录包含 metadata.json 与字幕文件，然后重新构建。</section>:<div className="layout"><aside><div className="aside-title">访谈库 <span>{allItems.length}</span></div>{allItems.map(v=><button key={v.id} className={`interview ${v.id===selected?'chosen':''}`} onClick={()=>setSelected(v.id)}><img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy"/><span><strong>{v.title}</strong><small>{v.ready?'中文字幕已就绪':'暂无中文字幕'}</small></span></button>)}</aside>
 <section className="watch"><div className="player-frame"><div id="yt-player"/></div><div className="video-info"><h2>{item?.title}</h2><a href={item?.url} target="_blank" rel="noreferrer">在 YouTube 打开 ↗</a></div>
 <div className="timebar"><span>{formatTime(time)}</span><input aria-label="播放进度" type="range" min={0} max={Math.max(duration,1)} step="1" value={Math.min(time,Math.max(duration,1))} onChange={e=>seek(Number(e.target.value))} disabled={!ready}/><span>{formatTime(duration)}</span></div>
 <div className="subtitle-controls"><div className="modes"><button className={mode==='both'?'active':''} onClick={()=>setMode('both')}>中英双语</button><button className={mode==='zh'?'active':''} onClick={()=>setMode('zh')}>中文</button><button className={mode==='en'?'active':''} onClick={()=>setMode('en')}>English</button></div><label>字号 <input type="range" min="14" max="30" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))}/></label></div>
 <div className="current-subtitles" style={{fontSize}} aria-live="off">{(mode!=='en')&&<div className="zh">{activeZh?.text||(!zh.length?'暂无中文字幕':'\u00a0')}</div>}{mode!=='zh'&&<div className="en">{activeEn?.text||(!en.length?'暂无原文字幕':'\u00a0')}</div>}</div>
 <div className="transcript-head"><h3>字幕时间轴</h3><span>点击字幕跳转</span></div><div className="transcript">{rows.length?rows.map((r,i)=><button key={i} onClick={()=>seek(r.start)} className={`cue ${time>=r.start&&time<(rows[i+1]?.start??Infinity)?'playing':''}`}><time>{formatTime(r.start)}</time><span>{mode!=='en'&&<strong>{r.zh||'—'}</strong>}{mode!=='zh'&&<small>{r.en||'—'}</small>}</span></button>):<div className="no-cues">当前访谈尚无可用字幕。</div>}</div>
 </section></div>}</main><footer>30Talk · 视频由 YouTube 提供 · 字幕可能包含翻译误差</footer></div>
}
createRoot(document.getElementById('root')!).render(<App/>);

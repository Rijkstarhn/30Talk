import React, {useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

type Interview={id:string;url:string;title:string;description:string;language:string;ready:boolean;hasOriginal:boolean;publishedAt?:string;dailyPickDate?:string};
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
  ytPromise=new Promise((resolve,reject)=>{const previous=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{previous?.();resolve()};const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=()=>reject(new Error('Failed to load YouTube player'));document.head.appendChild(s)});return ytPromise;
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
 useEffect(()=>{fetch('/catalog.json').then(r=>{if(!r.ok)throw Error('Unable to load the interview library');return r.json()}).then((items:Interview[])=>{setCatalog(items);if(items.length)setSelected(items[0].id)}).catch(e=>setError(String(e)))},[]);
 const allItems=catalog;
 const dailyPick=allItems.find(v=>v.dailyPickDate) || allItems[0];
 const item=allItems.find(v=>v.id===selected);
 const addVideo=async(e:React.FormEvent)=>{
  e.preventDefault();setAddMessage('');const id=videoIdFromUrl(urlInput);
  if(!id){setAddMessage('Enter a valid YouTube HTTPS URL.');return;}
  if(!adminToken){setAddMessage('Enter the admin access key.');return;}
  setSubmitting(true);
  try{
   const response=await fetch('/api/submit',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${adminToken}`},body:JSON.stringify({url:urlInput})});
   const data=await response.json() as {message?:string;error?:string;status?:string};
   if(!response.ok)throw new Error(data.error||'Submission failed');
   setAddMessage(data.message||'Submitted');setPendingId(data.status==='pending'?id:'');setUrlInput('');
   if(data.status==='ready')window.location.reload();
  }catch(err){setAddMessage(err instanceof Error?err.message:'Submission failed')}
  finally{setSubmitting(false)}
 };
 useEffect(()=>{if(!pendingId)return;const check=async()=>{
  try{const r=await fetch(`/api/status?id=${pendingId}`,{cache:'no-store'});if(!r.ok)return;
   const data=await r.json() as {status:string};
   if(data.status==='ready'){setPendingId('');setAddMessage('Subtitles are ready. Refresh after deployment to see the new interview.')}
   else if(data.status==='failed'){setPendingId('');setAddMessage('Processing failed. Please review the GitHub issue.')}
  }catch{/* retry later */}
 };void check();const timer=window.setInterval(check,30000);return()=>window.clearInterval(timer)},[pendingId]);
 useEffect(()=>{if(!selected)return;let cancelled=false;setEn([]);setZh([]);setTime(0);setReady(false);setError('');restored.current=false;
   Promise.all([fetch(`/content/${selected}/en.vtt`).then(r=>r.ok?r.text():'').catch(()=>''),fetch(`/content/${selected}/zh.vtt`).then(r=>r.ok?r.text():'').catch(()=>'')]).then(([a,b])=>{if(!cancelled){setEn(parseVtt(a));setZh(parseVtt(b))}});
   return ()=>{cancelled=true};
 },[selected]);
 useEffect(()=>{if(!selected)return;let cancelled=false;
   loadYoutube().then(()=>{if(cancelled)return;const instance=new window.YT!.Player('yt-player',{videoId:selected,playerVars:{playsinline:1,rel:0},events:{onReady:()=>{if(cancelled)return;setReady(true);try{setDuration(instance.getDuration()||0);const saved=Number(localStorage.getItem(`30talk-progress-${selected}`)||0);if(saved>5&&!restored.current){instance.seekTo(saved,true);restored.current=true}}catch{}},onError:()=>setError('This video cannot be embedded. Try watching on YouTube.')}});player.current=instance;
     timer.current=window.setInterval(()=>{try{const t=instance.getCurrentTime();if(Number.isFinite(t)){setTime(t);localStorage.setItem(`30talk-progress-${selected}`,String(t))}setDuration(instance.getDuration()||0)}catch{}},500);
   }).catch(e=>{if(!cancelled)setError(String(e))});
   return ()=>{cancelled=true;window.clearInterval(timer.current);timer.current=undefined;try{player.current?.destroy()}catch{}player.current=null};
 },[selected]);
 const active=(cues:Cue[])=>cues.find(c=>c.start<=time&&c.end>time)??null;
 const activeEn=active(en),activeZh=active(zh);
 const rows=useMemo(()=>{const primary=zh.length?zh:en;return primary.map((c,i)=>({start:c.start,zh:zh.length?c.text:'',en:en[i]?.text||''}))},[en,zh]);
 const seek=(t:number)=>{player.current?.seekTo(t,true);setTime(t)};
 return <div className="app"><header><div className="brand"><span className="mark">30</span><span>Talk</span></div><span className="tagline">Ideas worth exploring</span></header>
 <main><div className="intro"><div className="eyebrow">CURATED CONVERSATIONS</div><h1>Deep Conversations. Bilingual Listening.</h1><p>Thoughtful long-form interviews, with synchronized original and Chinese subtitles.</p></div>
 <section className="daily-feature" aria-label="Featured interview"><div className="eyebrow">DAILY DISCOVERY</div><div className="daily-feature-inner"><div><h2>Today’s Perspective</h2><p>One carefully selected conversation at a time. New discoveries are published after subtitle processing.</p>{dailyPick&&<strong>{dailyPick.title}</strong>}</div>{dailyPick&&<button type="button" onClick={()=>setSelected(dailyPick.id)}>Listen now →</button>}</div></section>
 <form className="add-video" onSubmit={addVideo}><label htmlFor="video-url">Admin · Submit a YouTube interview</label><div className="add-video-row"><input id="video-url" type="url" value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." required/><input aria-label="Admin access key" type="password" value={adminToken} onChange={e=>setAdminToken(e.target.value)} placeholder="Admin access key" autoComplete="off" required/><button type="submit" disabled={submitting}>{submitting?'Submitting…':'Submit for processing'}</button></div><p>Admin-only submissions. New interviews are transcribed, translated, verified, and published automatically.</p>{addMessage&&<div className="add-message" role="status">{addMessage}</div>}{pendingId&&<p role="status">Processing: {pendingId} (checking every 30 seconds)</p>}</form>
 {error&&<div role="alert" className="error">{error}</div>}
 {allItems.length===0?<section className="empty">No interviews yet. Add a video with valid subtitles and rebuild the site.</section>:<div className="layout"><aside><div className="aside-title">Interview Library <span>{allItems.length}</span></div>{allItems.map(v=><button key={v.id} className={`interview ${v.id===selected?'chosen':''}`} onClick={()=>setSelected(v.id)}><img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy"/><span><strong>{v.title}</strong><small>{v.ready?'Bilingual subtitles ready':'Chinese subtitles unavailable'}</small></span></button>)}</aside>
 <section className="watch"><div className="player-frame"><div id="yt-player"/></div><div className="video-info"><h2>{item?.title}</h2><a href={item?.url} target="_blank" rel="noreferrer">Watch on YouTube ↗</a></div>
 <div className="timebar"><span>{formatTime(time)}</span><input aria-label="Playback progress" type="range" min={0} max={Math.max(duration,1)} step="1" value={Math.min(time,Math.max(duration,1))} onChange={e=>seek(Number(e.target.value))} disabled={!ready}/><span>{formatTime(duration)}</span></div>
 <div className="subtitle-controls"><div className="modes"><button className={mode==='both'?'active':''} onClick={()=>setMode('both')}>Bilingual</button><button className={mode==='zh'?'active':''} onClick={()=>setMode('zh')}>Chinese</button><button className={mode==='en'?'active':''} onClick={()=>setMode('en')}>English</button></div><label>Text size <input type="range" min="14" max="30" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))}/></label></div>
 <div className="current-subtitles" style={{fontSize}} aria-live="off">{(mode!=='en')&&<div className="zh">{activeZh?.text||(!zh.length?'Chinese subtitles unavailable':'\u00a0')}</div>}{mode!=='zh'&&<div className="en">{activeEn?.text||(!en.length?'Original subtitles unavailable':'\u00a0')}</div>}</div>
 <div className="transcript-head"><h3>Transcript</h3><span>Click any line to jump</span></div><div className="transcript">{rows.length?rows.map((r,i)=><button key={i} onClick={()=>seek(r.start)} className={`cue ${time>=r.start&&time<(rows[i+1]?.start??Infinity)?'playing':''}`}><time>{formatTime(r.start)}</time><span>{mode!=='en'&&<strong>{r.zh||'—'}</strong>}{mode!=='zh'&&<small>{r.en||'—'}</small>}</span></button>):<div className="no-cues">No transcript available for this interview.</div>}</div>
 </section></div>}</main><footer>30Talk · Videos hosted on YouTube · AI translations may contain errors</footer></div>
}
createRoot(document.getElementById('root')!).render(<App/>);

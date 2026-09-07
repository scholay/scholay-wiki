import React, {useEffect,useState,useRef,useCallback,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {Excalidraw,MainMenu,viewportCoordsToSceneCoords} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {createDocumentStore} from './store.js';
import './style.css';

async function request(kind,key,payload){
 const response=await fetch(`/api/${kind}${key?'?key='+encodeURIComponent(key):''}`,payload?{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:undefined);
 const data=await response.json();if(!response.ok){const e=new Error(data.error||'请求失败');e.status=response.status;throw e;}return data;
}
const docs=createDocumentStore({request,storage:localStorage});
const states={loading:'读取中',saved:'已保存',pending:'等待保存',saving:'保存中',error:'保存失败',conflict:'需要核对'};
function useDocument(slug){useSyncExternalStore(docs.subscribe,docs.getVersion);useEffect(()=>{if(slug)docs.load(slug)},[slug]);return docs.docs.get(slug);}
function DocumentEditor({article,compact=false,onExpand,onNavigate,catalog}){
 const d=useDocument(article.slug);const [editing,setEditing]=useState(!compact);if(!d||d.status==='loading')return <div className="doc-loading">读取正文…</div>;
 if(!d.revision)return <div className="error">{d.error}<button onClick={()=>docs.load(article.slug)}>重新读取</button></div>;
 return <section className={'document '+(compact?'compact':'')} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <header><strong>{article.title}</strong><span className={'save-state '+d.status}>{states[d.status]}</span></header>
  <div className="doc-actions"><button onClick={()=>setEditing(!editing)}>{editing?'预览':'编辑正文'}</button>{compact&&<button onClick={onExpand}>展开编辑 ↗</button>}<a href={d.obsidianUrl}>在 Obsidian 打开 ↗</a></div>
  {d.error&&d.status!=='conflict'&&<div className="error">{d.error}<button onClick={()=>docs.save(article.slug)}>重试保存</button></div>}
  {d.status==='conflict'&&<div className="conflict"><b>Obsidian 或其他窗口也修改了这篇词条。</b><p>你的文字仍然保留，请比较后选择。</p><details><summary>查看外部版本</summary><pre>{d.remote?.body||'读取外部版本中…'}</pre></details><button onClick={()=>docs.resolve(article.slug,'remote').catch(e=>alert(e.message))}>采用外部版本</button><button onClick={()=>docs.resolve(article.slug,'mine').catch(e=>alert(e.message))}>保留我的修改</button></div>}
  {editing?<textarea aria-label={'Markdown 正文：'+article.title} value={d.body} spellCheck={false} onChange={e=>docs.edit(article.slug,e.target.value)} onBlur={()=>docs.save(article.slug)} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();docs.save(article.slug)}}}/>:<div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=>{
    const path=new URL(href||'', 'http://vault/'+article.path).pathname.slice(1);
    const target=catalog?.articles.find(a=>a.path===path||href?.startsWith('https://www.scholay.com/wiki/'+a.slug+'#')||href==='https://www.scholay.com/wiki/'+a.slug);
    return <a href={href} onClick={event=>{if(target){event.preventDefault();onNavigate?.(target)}}} target={target?undefined:'_blank'} rel="noreferrer">{children}</a>
  }}}>{d.body}</ReactMarkdown></div>}
 </section>;
}
const signature=scene=>JSON.stringify({elements:scene.elements,files:scene.files,background:scene.appState?.viewBackgroundColor});
function Board({name,catalog,onArticle,onBoard,onStatus}){
 const [loaded,setLoaded]=useState(null),[error,setError]=useState(null),[conflict,setConflict]=useState(false),[api,setApi]=useState(null),[arranging,setArranging]=useState(false),[focused,setFocused]=useState(null);
 const current=useRef(null),saved=useRef(''),revision=useRef(null),busy=useRef(false),timer=useRef(null),alive=useRef(true),initialized=useRef(false),pending=useRef(false),blocked=useRef(false),generation=useRef(0),restoring=useRef(false);
 const pointerStart=useRef(null);
 const draftKey='scholay-board-draft:'+name;
 const persistBoard=()=>{try{if(pending.current)localStorage.setItem(draftKey,JSON.stringify({revision:revision.current,scene:current.current}));else localStorage.removeItem(draftKey)}catch{setError('画布草稿无法写入浏览器，请保持页面打开并重试保存。')}};
 const articleFor=useCallback(link=>catalog.articles.find(a=>link?.split('#')[0].replace(/^\[\[/,'').replace(/\]\]$/,'').split('|')[0]===a.path),[catalog]);
 useEffect(()=>{alive.current=true;request('board',name).then(data=>{if(!alive.current)return;revision.current=data.revision;current.current=data.scene;saved.current=signature(data.scene);let draft=null;try{draft=JSON.parse(localStorage.getItem(draftKey)||'null')}catch{};if(draft&&signature(draft.scene)!==saved.current){current.current=draft.scene;pending.current=true;restoring.current=true;blocked.current=true;setConflict(true);onStatus('画布草稿待核对')}else onStatus('已保存');setLoaded(current.current);}).catch(e=>setError(e.message));return()=>{alive.current=false;clearTimeout(timer.current)}},[name]);
 async function save(){
  if(busy.current||blocked.current||!current.current||!initialized.current||!pending.current)return;
  busy.current=true;const scene=structuredClone(current.current),sig=signature(scene);onStatus('保存中');let success=false;
  try{const result=await request('board',name,{revision:revision.current,scene});revision.current=result.revision;saved.current=sig;pending.current=signature(current.current)!==sig;persistBoard();generation.current++;success=true;onStatus(pending.current?'等待保存':'已保存');setError(null);}
  catch(e){setError(e.message);if(e.status===409){blocked.current=true;setConflict(true)};onStatus(e.status===409?'画布需要核对':'保存失败');}
  finally{busy.current=false;if(success&&pending.current&&!blocked.current)timer.current=setTimeout(save,700);}
 }
 useEffect(()=>{const before=e=>{if(pending.current||docs.hasPending()){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before)},[]);
 useEffect(()=>{
  const polling=setInterval(async()=>{try{
   const snapshot=await request('snapshot');
   await Promise.all([...docs.docs.keys()].map(key=>docs.refresh(key,snapshot.articles[key])));
   const rev=snapshot.boards[name];if(!rev||!revision.current||rev===revision.current||busy.current||!api)return;
   if(pending.current){blocked.current=true;setConflict(true);clearTimeout(timer.current);onStatus('画布需要核对');return;}
   const observed=generation.current;const data=await request('board',name);if(busy.current||pending.current||observed!==generation.current)return;
   revision.current=data.revision;current.current=data.scene;saved.current=signature(data.scene);initialized.current=false;
   const viewport=api.getAppState();api.updateScene({...data.scene,appState:{...data.scene.appState,scrollX:viewport.scrollX,scrollY:viewport.scrollY,zoom:viewport.zoom,selectedElementIds:viewport.selectedElementIds},captureUpdate:'NEVER'});api.addFiles(Object.values(data.scene.files||{}));
  }catch(e){onStatus('连接中断，修改暂存于本页');}},1200);return()=>clearInterval(polling);
 },[api,name]);
 const changed=useCallback((elements,appState,files)=>{
  if(!current.current)return;
  const scene={...current.current,elements,files:{...current.current.files,...files},appState:{...current.current.appState,viewBackgroundColor:appState.viewBackgroundColor}};
  current.current=scene;
  if(!initialized.current){initialized.current=true;if(!restoring.current)saved.current=signature(scene);restoring.current=false;return;}
  generation.current++;
  pending.current=signature(scene)!==saved.current;
  persistBoard();if(pending.current&&!blocked.current){onStatus('等待保存');clearTimeout(timer.current);timer.current=setTimeout(save,750);}
 },[conflict,error]);
 async function settle(choice){
  if(busy.current)return;busy.current=true;const observed=generation.current;
  try{const latest=await request('board',name);
   if(generation.current!==observed)throw new Error('核对期间又有画布修改，已保留当前画布，请重新选择。');
   revision.current=latest.revision;
   if(choice==='remote'){current.current=latest.scene;saved.current=signature(latest.scene);pending.current=false;initialized.current=false;api.updateScene({...latest.scene,captureUpdate:'NEVER'});api.addFiles(Object.values(latest.scene.files||{}));}
   else{const sent=structuredClone(current.current),sig=signature(sent);const result=await request('board',name,{revision:latest.revision,scene:sent});revision.current=result.revision;saved.current=sig;pending.current=signature(current.current)!==sig;}
   generation.current++;blocked.current=false;setConflict(false);setError(null);persistBoard();onStatus(pending.current?'等待保存':'已保存');
  }finally{busy.current=false;if(!blocked.current&&pending.current)timer.current=setTimeout(save,700)}
 }
 useEffect(()=>{if(api){const frame=requestAnimationFrame(()=>api.scrollToContent(api.getSceneElements(),{fitToViewport:true,viewportZoomFactor:0.85}));return()=>cancelAnimationFrame(frame)}},[api]);
 useEffect(()=>{window.scholayBoard={flush:save,isDirty:()=>pending.current};return()=>delete window.scholayBoard},[save]);
 if(error&&!loaded)return <div className="error">{error}</div>;
 if(!loaded)return <div className="loading">正在打开画布…</div>;
 const branches=(loaded.elements||[]).filter(e=>!e.isDeleted&&e.customData?.scholay?.focusTitle);
 const focusBranch=branch=>api?.scrollToContent(api.getSceneElements().filter(e=>e.customData?.scholay?.branch===branch),{fitToViewport:true,viewportZoomFactor:0.8});
 const openElement=element=>{if(!element)return;const meta=element.customData?.scholay;const a=catalog.articles.find(a=>a.slug===meta?.articleSlug)||articleFor(element.link);if(a){onArticle(a);return;}const board=meta?.board||catalog.boards.find(b=>element.link?.includes('wiki/boards/'+b));if(board){onBoard(board);return;}if(meta?.branch)focusBranch(meta.branch)};
 const pointerUp=event=>{
  const start=pointerStart.current;pointerStart.current=null;
  if(arranging||!api||!start||event.target.tagName!=='CANVAS'||Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)return;
  const point=viewportCoordsToSceneCoords(event,api.getAppState());
  const hit=[...api.getSceneElements()].reverse().find(e=>{if(e.type!=='rectangle'||!e.customData?.scholay)return false;const cx=e.x+e.width/2,cy=e.y+e.height/2,dx=point.x-cx,dy=point.y-cy;const x=dx*Math.cos(e.angle)+dy*Math.sin(e.angle),y=-dx*Math.sin(e.angle)+dy*Math.cos(e.angle);return Math.abs(x)<=e.width/2&&Math.abs(y)<=e.height/2});
  openElement(hit);
 };
 return <div className="board-area" onPointerDownCapture={event=>{pointerStart.current=event.target.tagName==='CANVAS'?{x:event.clientX,y:event.clientY}:null}} onPointerUpCapture={pointerUp}><div className="structure-toolbar"><button className={arranging?'is-editing':''} onClick={()=>setArranging(!arranging)}>{arranging?'完成结构整理':'整理结构'}</button><span className="toolbar-divider"/>{branches.map(e=><button key={e.id} onClick={()=>focusBranch(e.customData.scholay.branch)}>{e.customData.scholay.focusTitle}</button>)}</div>
 {arranging&&focused&&(focused.customData?.scholay?.articleSlug||focused.link)&&<div className="node-action"><button onClick={()=>openElement(focused)}>打开选中节点 ↗</button></div>}
 <div className="canvas-actions"><button onClick={()=>api?.scrollToContent(api.getSceneElements(),{fitToViewport:true,viewportZoomFactor:0.85})}>适应画布</button><button onClick={()=>{const state=api.getAppState();api.updateScene({appState:{zoom:{value:Math.min(3,state.zoom.value*1.3)}}})}}>放大 +</button><button onClick={()=>{const state=api.getAppState();api.updateScene({appState:{zoom:{value:Math.max(.1,state.zoom.value/1.3)}}})}}>缩小 −</button></div>
 {conflict?<div className="board-alert">画布在其他窗口发生修改。当前编辑仍保留。<button onClick={()=>settle('remote').catch(e=>setError(e.message))}>加载外部画布</button><button onClick={()=>settle('mine').catch(e=>setError(e.message))}>保留当前画布</button></div>:error&&<div className="board-alert">{error}<button onClick={save}>重试保存</button></div>}
 <Excalidraw viewModeEnabled={!arranging} onPointerUp={(tool,state)=>{if(state.drag.hasOccurred||state.boxSelection.hasOccurred||state.resize.isResizing)return;const el=state.hit.element;setFocused(el)}} excalidrawAPI={setApi} initialData={{...loaded,scrollToContent:true}} onChange={changed} langCode="zh-CN" name={name} handleKeyboardGlobally={false}
 validateEmbeddable={link=>!!articleFor(link)} renderEmbeddable={element=>{const a=articleFor(element.link);return a?<DocumentEditor article={a} catalog={catalog} onNavigate={onArticle} compact onExpand={()=>onArticle(a)}/>:null;}}
 onLinkOpen={(element,event)=>{const a=articleFor(element.link);if(a){event.preventDefault();onArticle(a);return;}const board=catalog.boards.find(b=>element.link?.includes('wiki/boards/'+b));if(board){event.preventDefault();onBoard(board)}}}
 UIOptions={{canvasActions:{loadScene:false,saveToActiveFile:false,export:false,saveAsImage:false}}}>
 <MainMenu><MainMenu.DefaultItems.ClearCanvas/><MainMenu.DefaultItems.ChangeCanvasBackground/><MainMenu.DefaultItems.ToggleTheme/><MainMenu.DefaultItems.Help/></MainMenu>
 </Excalidraw></div>;
}
function App(){
 const [catalog,setCatalog]=useState(null),[board,setBoard]=useState('Scholay.excalidraw.md'),[selected,setSelected]=useState(null),[query,setQuery]=useState(''),[navMode,setNavMode]=useState('tasks'),[status,setStatus]=useState('读取中'),[error,setError]=useState(null);
 useEffect(()=>{request('catalog').then(setCatalog).catch(e=>setError(e.message))},[]);
 async function navigate(name){await window.scholayBoard?.flush();if(window.scholayBoard?.isDirty()){setError('当前画布尚未保存，请处理保存提示后再切换。');return;}setSelected(null);setBoard(name);setError(null);}
 useEffect(()=>{const ctx=document.modelContext;if(!ctx?.registerTool||!catalog)return;const life=new AbortController();
  ctx.registerTool({name:'open_scholay_article',description:'在工作台中打开指定词条的 Markdown 编辑器，不修改内容。',inputSchema:{type:'object',properties:{slug:{type:'string'}},required:['slug'],additionalProperties:false},annotations:{readOnlyHint:true},execute:async input=>{const a=catalog.articles.find(a=>a.slug===input?.slug);if(!a)throw new Error('词条不存在');await docs.load(a.slug);setSelected(a);return {slug:a.slug,path:a.path}}},{signal:life.signal});return()=>life.abort();},[catalog]);
 if(!catalog)return <div className="loading">{error||'正在读取 Scholay 内容库…'}</div>;
 const navGroup=catalog.navigation.find(n=>board==='nav-'+n.slug+'.excalidraw.md');
 const category=catalog.categories.find(c=>board===c.slug+'.excalidraw.md');
 const navSlugs=new Set();const collect=n=>{if(n.target?.articleSlug)navSlugs.add(n.target.articleSlug);n.children?.forEach(collect)};if(navGroup)collect(navGroup);
 const matches=catalog.articles.filter(a=>(query?a.title.includes(query)||a.slug.includes(query):navGroup?navSlugs.has(a.slug):a.category===category?.slug));
 return <div className="app"><aside className="sidebar"><div className="brand"><b>Scholay<span>.</span></b><span>内容工作台</span></div><label className="search">⌕ <input aria-label="查找词条" placeholder="查找词条" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <nav><button className={board==='Scholay.excalidraw.md'?'active':''} onClick={()=>navigate('Scholay.excalidraw.md')}>研究路径 <small>总览</small></button>
 <div className="nav-switch"><button className={navMode==='tasks'?'selected':''} onClick={()=>setNavMode('tasks')}>功能结构</button><button className={navMode==='categories'?'selected':''} onClick={()=>setNavMode('categories')}>内容分类</button></div>
 <div className="board-list">{navMode==='tasks'?catalog.navigation.map((n,i)=><button key={n.slug} className={navGroup?.slug===n.slug?'active':''} onClick={()=>navigate('nav-'+n.slug+'.excalidraw.md')}><span className={'dot dot-'+(i%8)}/>{n.title}</button>):catalog.categories.map((c,i)=><button key={c.slug} className={category?.slug===c.slug?'active':''} onClick={()=>navigate(c.slug+'.excalidraw.md')}><span className={'dot dot-'+i}/>{c.title}<small>{catalog.articles.filter(a=>a.category===c.slug).length}</small></button>)}</div></nav>
 <div className="nav-label">{query?'搜索结果':'当前结构词条'}</div><div className="article-list">{matches.map(a=><button className={selected?.slug===a.slug?'selected':''} key={a.slug} onClick={()=>setSelected(a)}>{a.title}</button>)}</div><footer>96 篇词条 · 同一份 Markdown</footer></aside>
 <main><header className="topbar"><div><span className="eyebrow">SCHOLAY WIKI</span><h1>{category?.title||navGroup?.title||'研究路径'}</h1></div><div className="top-actions"><span className={'status '+(status.includes('已保存')?'ok':'')}>● 画布{status}</span><a href={'obsidian://open?vault=scholay&file='+encodeURIComponent('wiki/boards/'+board)}>在 Obsidian 打开 ↗</a></div></header>
 {error&&<div className="board-alert">{error}<button onClick={()=>setError(null)}>关闭</button></div>}
 <div className="hint">点击节点进入主题或编辑正文；点击上方主题聚焦分支。「整理结构」可移动节点、调整连线和批注。</div>
 <div className="workspace"><Board key={board} name={board} catalog={catalog} onArticle={setSelected} onBoard={navigate} onStatus={setStatus}/>{selected&&<aside className="editor-panel"><button className="close-editor" onClick={()=>setSelected(null)} aria-label="关闭正文编辑器">×</button><DocumentEditor key={selected.slug} article={selected} catalog={catalog} onNavigate={setSelected}/></aside>}</div>
 </main></div>;
}
createRoot(document.getElementById('root')).render(<App/>);

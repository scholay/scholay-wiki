// One state per canonical Markdown file, shared by canvas and side editor.
export function createDocumentStore({request, storage, delay=650, schedule=setTimeout, cancel=clearTimeout}) {
 const docs=new Map(),listeners=new Set();let version=0;
 const emit=()=>{version++;listeners.forEach(f=>f())},keyOf=k=>'scholay-draft:'+k;
 const persist=(key,d)=>{try{d.body===d.base?storage?.removeItem(keyOf(key)):storage?.setItem(keyOf(key),JSON.stringify({body:d.body,revision:d.revision}));}catch{}};
 async function load(key){
  let d=docs.get(key);if(d?.revision||d?.loading)return d;
  if(!d){d={status:'loading',body:'',base:'',revision:null,generation:0};docs.set(key,d)}
  d.loading=true;d.status='loading';emit();
  try{
   const data=await request('article',key);Object.assign(d,data,{base:data.body,status:'saved',error:null});
   let draft=null;try{draft=JSON.parse(storage?.getItem(keyOf(key))||'null')}catch{}
   if(draft&&draft.body!==data.body){d.body=draft.body;d.status=draft.revision===data.revision?'pending':'conflict';d.remote=data;if(d.status==='pending')queue(key)}
  }catch(e){d.status='error';d.error=e.message}finally{d.loading=false;emit()}return d;
 }
 function queue(key){const d=docs.get(key);cancel(d.timer);d.timer=schedule(()=>save(key),delay)}
 function edit(key,body){const d=docs.get(key);if(!d?.revision)return;d.body=body;d.generation++;persist(key,d);
  if(d.status!=='conflict'){d.status=body===d.base?'saved':'pending';d.error=null;queue(key)}emit()}
 async function save(key){
  const d=docs.get(key);if(!d)return;cancel(d.timer);
  if(d.inflight||d.resolving||d.status==='conflict'||!d.revision||d.body===d.base)return;
  const body=d.body;d.inflight=true;d.status='saving';emit();let success=false;
  try{
   const data=await request('article',key,{revision:d.revision,body});
   if(d.body===body)d.body=data.body;
   d.revision=data.revision;d.base=data.body;d.generation++;d.error=null;d.status=d.body===d.base?'saved':'pending';persist(key,d);success=true;
  }catch(e){d.error=e.message;d.status=e.status===409?'conflict':'error';if(e.status===409)try{d.remote=await request('article',key)}catch{}}
  finally{d.inflight=false;emit();if(success&&d.body!==d.base)queue(key)}
 }
 async function refresh(key,rev){
  const d=docs.get(key);if(!d)return;if(!d.revision){await load(key);return}
  if(d.revision===rev||d.inflight||d.refreshing||d.resolving)return;
  d.refreshing=true;const generation=d.generation,revision=d.revision;
  try{const data=await request('article',key);if(d.inflight||d.resolving||d.generation!==generation||d.revision!==revision)return;
   if(data.revision!==d.revision){if(d.body!==d.base){d.status='conflict';d.remote=data;cancel(d.timer)}else{Object.assign(d,data,{base:data.body,status:'saved',error:null});d.generation++}}emit();
  }catch(e){d.error=e.message;emit()}finally{d.refreshing=false}
 }
 async function resolve(key,choice){
  const d=docs.get(key);if(d.resolving||d.inflight)return;
  d.resolving=true;const generation=d.generation;emit();
  try{const latest=await request('article',key);
   if(d.generation!==generation){d.remote=latest;throw new Error('选择后又有新编辑，已保留全部文字。请重新核对。')}
   d.revision=latest.revision;d.base=latest.body;d.remote=null;d.error=null;d.generation++;
   if(choice==='remote'){d.body=latest.body;d.status='saved';persist(key,d)}else d.status='pending';
  }finally{d.resolving=false;emit()}
  if(choice==='mine')await save(key);
 }
 return {docs,load,edit,save,refresh,resolve,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},getVersion:()=>version,hasPending:()=>[...docs.values()].some(d=>d.body!==d.base||d.inflight)};
}

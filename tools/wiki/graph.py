"""Native, bound Excalidraw trees and workflow edges. No article body copies."""
import json, math, unicodedata

PALETTE=['#9b2c47','#216ba5','#21795d','#7650aa','#976414','#247985','#596574','#7d5184']

def structure(c,path):
    if path.exists():
        s=json.loads(path.read_text())
    else:
        # A small/new vault can start from its catalog, then add semantic groups.
        s={'categories':{cat['slug']:[{'id':'articles','title':'词条','articles':[a['slug'] for a in c['articles'] if a['category']==cat['slug']]}] for cat in c['categories']},'workflow':[],'support':[]}
    by={a['slug']:a for a in c['articles']}
    if set(s['categories'])!={cat['slug'] for cat in c['categories']}:raise ValueError('structure categories differ from catalog')
    seen=[]
    for cat,groups in s['categories'].items():
        ids=[g['id'] for g in groups]
        if len(ids)!=len(set(ids)):raise ValueError('Duplicate structure group: '+cat)
        for group in groups:
            for slug in group['articles']:
                if slug not in by or by[slug]['category']!=cat:raise ValueError('Invalid structure article: '+slug)
                seen.append(slug)
    if len(seen)!=len(set(seen)) or set(seen)!=set(by):raise ValueError('structure must include each article exactly once; update wiki/structure.json with catalog')
    nav={n.get('slug',n.get('id')) for n in c['navigation']}
    refs=[]
    for phase in s['workflow']+s['support']:
        refs.extend(phase.get('navigation',[]))
        if any(a not in by for a in phase.get('articles',[])):raise ValueError('Unknown workflow article')
    if refs and (len(refs)!=len(set(refs)) or set(refs)!=nav):raise ValueError('workflow must include each navigation group once')
    return s


def text_height(title,width,size):
    lines=1;used=0
    for char in title:
        if char=='\n':lines+=1;used=0;continue
        unit=size*(1 if unicodedata.east_asian_width(char) in 'WF' else .57)
        if used+unit>width:lines+=1;used=0
        used+=unit
    return math.ceil(lines*size*1.25)


class Graph:
    def __init__(self,element,prefix):self.element=element;self.prefix='graph:v2:'+prefix+':';self.es=[]
    def item(self,key,kind,*args,**kwargs):
        e=self.element(self.prefix+key,kind,*args,**kwargs)
        e['customData']['scholay']['layoutVersion']=2
        self.es.append(e);return e
    def text(self,key,text,x,y,size=20,color='#697586',link=None):
        return self.item(key,'text',x,y,max(len(text)*size,100),size*1.25,color,text,link,size)
    def node(self,key,title,x,y,w=310,color='#216ba5',role='article',link=None,branch=None,**data):
        size=24 if role in ('root','group','phase') else 22
        th=text_height(title,w-32,size);h=max(64,th+28)
        shape=self.item(key,'rectangle',x,y,w,h,color,link=link)
        shape.update(backgroundColor=color if role=='root' else '#ffffff',strokeWidth=2 if role in ('root','phase') else 1.3,roundness={'type':3})
        label=self.item(key+':label','text',x+16,y+(h-th)/2,w-32,th,'#ffffff' if role=='root' else color,title,size=size)
        label.update(containerId=shape['id'],textAlign='center',verticalAlign='middle')
        shape['boundElements']=[{'id':label['id'],'type':'text'}]
        group=[shape['id']];shape['groupIds']=label['groupIds']=group
        for e in (shape,label):e['customData']['scholay'].update(role=role if e is shape else 'label',branch=branch,**data)
        return shape
    def edge(self,key,a,b,relation='contains',axis='horizontal',direction=1):
        e=self.item('edge:'+key,'arrow',0,0,1,1,a['strokeColor'])
        e.update(startArrowhead=None,endArrowhead='arrow' if relation!='contains' else None,
                 strokeStyle='dashed' if relation=='supports' else 'solid',strokeWidth=1.5,
                 startBinding={'elementId':a['id'],'focus':0,'gap':8},endBinding={'elementId':b['id'],'focus':0,'gap':8},elbowed=False)
        e['customData']['scholay'].update(role='edge',relation=relation,axis=axis,direction=direction,branch=b['customData']['scholay'].get('branch'))
        route(e,a,b)
        for node in (a,b):node['boundElements'].append({'id':e['id'],'type':'arrow'})
        if relation=='contains':
            b['customData']['scholay']['parent']=a['id']
        return e
    def elements(self):
        # Lines behind nodes, labels above nodes.
        return sorted(self.es,key=lambda e:0 if e['type']=='arrow' else 1 if e['type']=='rectangle' else 2)


def route(e,a,b):
    meta=e['customData']['scholay'];d=meta.get('direction',1)
    if meta.get('axis')=='vertical':
        start=[a['x']+a['width']/2,a['y']+(a['height']+8 if d==1 else -8)]
        end=[b['x']+b['width']/2,b['y']+(-8 if d==1 else b['height']+8)]
        mid=(start[1]+end[1])/2;points=[start,[start[0],mid],[end[0],mid],end]
    else:
        start=[a['x']+(a['width']+8 if d==1 else -8),a['y']+a['height']/2]
        end=[b['x']+(-8 if d==1 else b['width']+8),b['y']+b['height']/2]
        mid=(start[0]+end[0])/2;points=[start,[mid,start[1]],[mid,end[1]],end]
    if start[0]==end[0] or start[1]==end[1]:points=[start,end]
    e.update(x=start[0],y=start[1],width=abs(end[0]-start[0]),height=abs(end[1]-start[1]),points=[[p[0]-start[0],p[1]-start[1]] for p in points])


def boardlink(name):return '[[wiki/boards/'+name+'.excalidraw.md]]'

def article_node(a):
    return {'id':'article:'+a['slug'],'title':a['title'],'link':'[['+a['path']+']]','articleSlug':a['slug'],'status':a.get('status','current')}


def tree(element,key,title,branches,color):
    """Balanced two-sided tree; siblings share space and native connector bindings."""
    g=Graph(element,key)
    def height(n):
        own=max(72,text_height(n['title'],298,22)+28)
        return max(own,sum(height(c)+24 for c in n.get('children',[]))-24)
    halves=[[],[]];totals=[0,0]
    for branch in branches:
        side=min(range(2),key=lambda i:totals[i]);h=height(branch)
        halves[side].append((branch,h));totals[side]+=h+64
    root=g.node('root',title,-140,-40,w=280,color=color,role='root')
    for side,items in enumerate(halves):
        direction=1 if side==0 else -1;y=-totals[side]/2
        def walk(n,parent,depth,top,space,branch):
            w=330 if n.get('children') else 360
            x=direction*(280+(depth-1)*490)-(w if direction==-1 else 0)
            role='group' if n.get('children') else 'article'
            node=g.node(n['id'],n['title'],x,0,w=w,color=color,role=role,link=n.get('link'),branch=branch,
                        **{k:n[k] for k in ('articleSlug','board','status') if k in n})
            # Move the label together with its container to the centre of the allocated subtree.
            yy=top+space/2-node['height']/2
            node['y']=yy;g.es[-1]['y']+=yy
            if depth==1:node['customData']['scholay']['focusTitle']=n['title']
            g.edge(parent['id']+':'+node['id'],parent,node,direction=direction)
            cursor=top
            for child in n.get('children',[]):
                ch=height(child);walk(child,node,depth+1,cursor,ch,branch);cursor+=ch+24
        for n,h in items:walk(n,root,1,y,h,n['id']);y+=h+64
    g.text('home','← 研究路径',-140,-max(totals+[240])/2-80,22,link=boardlink('Scholay'))
    return g.elements()


def generate(c,element,path):
    s=structure(c,path);by={a['slug']:a for a in c['articles']};boards={}
    for i,cat in enumerate(c['categories']):
        branches=[{'id':'group:'+group['id'],'title':group['title'],'children':[article_node(by[slug]) for slug in group['articles']]} for group in s['categories'][cat['slug']]]
        boards[cat['slug']+'.excalidraw.md']=tree(element,'category:'+cat['slug'],cat['title'],branches,PALETTE[i%8])
    navs={n.get('slug',n.get('id')):n for n in c['navigation']}
    def navigation_node(n,trail):
        key=n.get('id',trail);out={'id':'nav:'+key,'title':n['title']}
        target=n.get('target',{});slug=target.get('articleSlug')
        if slug:out.update(articleSlug=slug,link='[['+by[slug]['path']+('#'+target['sectionId'] if target.get('sectionId') else '')+']]')
        out['children']=[navigation_node(child,key+':'+str(i)) for i,child in enumerate(n.get('children',[]))]
        return out
    for i,(slug,n) in enumerate(navs.items()):
        children=n.get('children') or [n]
        boards['nav-'+slug+'.excalidraw.md']=tree(element,'nav:'+slug,n['title'],[navigation_node(ch,slug+':'+str(j)) for j,ch in enumerate(children)],PALETTE[i%8])
    g=Graph(element,'overview')
    # Five phases are a common task path, not the eight filesystem categories in sequence.
    g.text('heading','Scholay · 研究路径',0,-110,38,'#25364c')
    g.text('legend','箭头：任务流转     实线：内容归属     虚线：跨阶段支持',0,-40,19)
    g.text('hint','常见任务路径，可按研究需要往返；点击节点打开主题或正文。',0,0,19)
    workflow=s.get('workflow') or [{'id':'catalog','title':'内容目录','navigation':list(navs)}]
    phases=[]
    for i,p in enumerate(workflow):
        x=i*290
        phase=g.node('phase:'+p['id'],f'{i+1:02d}  '+p['title'],x,100,240,PALETTE[i%8],role='phase',branch=p['id'])
        phase['customData']['scholay']['focusTitle']=p['title'];phases.append(phase)
        if i:g.edge('flow:'+p['id'],phases[i-1],phase,'sequence')
        entries=[{'id':'nav:'+slug,'title':navs[slug]['title'],'board':'nav-'+slug+'.excalidraw.md','link':boardlink('nav-'+slug)} for slug in p.get('navigation',[])]+[article_node(by[slug]) for slug in p.get('articles',[])]
        # Fan out from the phase along a shared side gutter, with no line crossing a leaf.
        for j,n in enumerate(entries):
            child=g.node(n['id'],n['title'],x+30,235+j*105,210,PALETTE[i%8],link=n['link'],branch=p['id'],**{k:n[k] for k in ('board','articleSlug') if k in n})
            e=g.edge('phase-child:'+n['id'],phase,child)
            start=[phase['x']+12,phase['y']+phase['height']+8];end=[child['x']-8,child['y']+child['height']/2]
            e.update(x=start[0],y=start[1],width=abs(end[0]-start[0]),height=abs(end[1]-start[1]),points=[[0,0],[0,end[1]-start[1]],[end[0]-start[0],end[1]-start[1]]],startBinding={'elementId':phase['id'],'focus':-.9,'gap':8})
    support=s.get('support',[])
    if support:
        hub=g.node('support-root','贯穿研究过程的支持',490,620,350,'#65758b',role='group')
        g.edge('supports',hub,phases[len(phases)//2],'supports',axis='vertical',direction=-1)
        # This edge routes outside the main graph so it cannot run through resource leaves.
        e=g.es[-1];start=[hub['x']-8,hub['y']+hub['height']/2];target=phases[0];end=[target['x']-8,target['y']+target['height']/2]
        e.update(x=start[0],y=start[1],width=start[0]-end[0]+60,height=start[1]-end[1],points=[[0,0],[-550,0],[-550,end[1]-start[1]],[end[0]-start[0],end[1]-start[1]]],endBinding={'elementId':target['id'],'focus':0,'gap':8})
        # Replace the originally bound target consistently.
        phases[len(phases)//2]['boundElements']=[b for b in phases[len(phases)//2]['boundElements'] if b['id']!=e['id']]
        target['boundElements'].append({'id':e['id'],'type':'arrow'})
        for i,p in enumerate(support):
            x=i*365
            group=g.node('support:'+p['id'],p['title'],x,790,270,'#65758b',role='group',branch=p['id'])
            group['customData']['scholay']['focusTitle']=p['title'];g.edge('support-group:'+p['id'],hub,group,axis='vertical')
            for j,slug in enumerate(p['navigation']):
                leaf=g.node('nav:'+slug,navs[slug]['title'],x+30,915+j*90,240,'#65758b',link=boardlink('nav-'+slug),board='nav-'+slug+'.excalidraw.md',branch=p['id'])
                e=g.edge('support-nav:'+slug,group,leaf)
                start=[group['x']+10,group['y']+group['height']+8];end=[leaf['x']-8,leaf['y']+leaf['height']/2]
                e.update(x=start[0],y=start[1],width=end[0]-start[0],height=end[1]-start[1],points=[[0,0],[0,end[1]-start[1]],[end[0]-start[0],end[1]-start[1]]],startBinding={'elementId':group['id'],'focus':-.9,'gap':8})
    boards['Scholay.excalidraw.md']=g.elements()
    return boards

const steps = [
  ['Account / center sun','design-accountSun','.account-sun','The center identifies the account. Try an identity sun, avatar, or evidence-backed Developer Profile.',{accountSun:'sun'}],
  ['Choose repositories','repository-search','.star','Choose projects from the loaded account. Search and check projects in this real picker; explicit data-loading buttons remain optional.'],
  ['Read the nodes','design-nodeSize','.star','Each repository is a node. Size can show stars or be uniform. Category views use repository membership.',{nodeSize:'stars',nodeColorMode:'language'}],
  ['Give rings meaning','design-ringMeaning','.semantic-rings','Legacy identity rings are decorative. Capability sectors show strongest evidence; inner bands mean stronger evidence. Missing evidence stays explicit.',{arrangement:'rings',nodeMode:'repositories',ringMeaning:'capability',temporalStack:{enabled:false},layoutEngine:undefined,layoutOptions:undefined}],
  ['Read connections','connection-density','.connections','Connections explain shared languages, topics or memberships. Dotted bridges are decorative, not dependencies.',{connectionBasis:'both',connectionWeight:'overlap'}],
  ['Developer Profile','design-accountSun','.profile-segment','Six labelled rays reuse Developer Topology evidence. Select a ray or a dimension button to inspect the repositories and reasons behind it.',{accountSun:'profile'}],
  ['Choose an intentional preset','builtin-preset','.star','Read a preset’s mappings before applying it. Existing named presets remain available.'],
  ['Randomize with locks','randomize-design','.star','Choose parts to randomize and lock the parts you like. What changed summarizes the draw; Undo restores the previous design.'],
  ['Motion and reduced motion','animate-rings','.identity-ring','Ring motion, camera movement and floating are decorative. Semantic bands stay still so motion cannot change their meaning. Reduced motion retains all information.',{animate:false,ringAnimation:{enabled:false},floatingAnimation:{enabled:false},perspective:{enabled:false,animate:false}}],
  ['Save a named design','preset-name','.star','Give this design a name, then choose Save this as a preset. Saving is explicit; the tour never overwrites a named design.'],
  ['Export and share','download-config','.star','Download SVG or PNG, save config JSON, share a link, or generate a workflow. Enable Include explanation in exported graphic for a static reading guide.'],
];
export function mountStudioTour({host,reveal,apply,config}) {
  let index = 0, active = false, returnFocus, busy = false;
  let storage; try { storage = window.localStorage; } catch {}
  const key = 'constellation-studio-tour-v1';
  const start = document.createElement('button'); start.type='button'; start.id='teach-studio'; start.className='secondary'; start.textContent='Teach me the Studio'; host.append(start);
  const panel=document.createElement('section'); panel.id='studio-tour'; panel.hidden=true; panel.setAttribute('aria-labelledby','tour-heading');
  const heading=document.createElement('h2'); heading.id='tour-heading'; heading.tabIndex=-1;
  const description=document.createElement('p'); description.id='tour-description';
  const status=document.createElement('p'); status.setAttribute('role','status');
  const actions=document.createElement('div'); actions.className='tour-actions'; panel.append(heading,description,status,actions); host.after(panel);
  const button=(id,label,run)=>{const b=document.createElement('button');b.type='button';b.id=id;b.textContent=label;b.addEventListener('click',run);actions.append(b);return b;};
  const preview = () => document.querySelector('#preview')?.firstChild?.shadowRoot;
  function clear() { for(const root of [document,preview()].filter(Boolean)) for(const e of root.querySelectorAll('[data-tour-spotlight]')) e.removeAttribute('data-tour-spotlight'); }
  function refresh() {
    if(!active)return;
    clear(); const [,id,selector]=steps[index]; const control=document.getElementById(id);
    control?.setAttribute('data-tour-spotlight','control');
    for(const el of preview()?.querySelectorAll(selector) || []) el.setAttribute('data-tour-spotlight','graphic');
  }
  function close() { active=false;panel.hidden=true;clear();returnFocus?.focus(); }
  function draw() {
    heading.textContent=`${index+1} of ${steps.length} · ${steps[index][0]}`; description.textContent=steps[index][3];
    previous.disabled=index===0; next.textContent=index===steps.length-1?'Finish':'Next'; status.textContent='';
    try { storage?.setItem(key,String(index)); } catch {}
    reveal(steps[index][1]); for(let parent=document.getElementById(steps[index][1]);parent;parent=parent.parentElement) if(parent.tagName==='DETAILS') parent.open=true; refresh(); heading.focus({preventScroll:true});
  }
  const previous=button('tour-back','Back',()=>{if(!busy&&index>0){index--;draw();}});
  button('tour-try','Try it',async()=>{
    if(busy)return;busy=true;
    try { const patch=steps[index][4];if(patch){const current=config();await apply({...current,options:{...current.options,...patch}});status.textContent='The real preview is updated. Edit the highlighted control to explore further.';refresh();}
      else {reveal(steps[index][1]);status.textContent='Use the highlighted Studio control, then return here for the next step.';}
    } catch(error){status.textContent=error.message;} finally{busy=false;}
  });
  const next=button('tour-next','Next',()=>{if(busy)return;if(index===steps.length-1)close();else{index++;draw();}});
  button('tour-skip','Skip step',()=>{if(!busy){if(index===steps.length-1)close();else{index++;draw();}}});
  button('tour-exit','Exit tour',close);
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
  function open(resume=false) {if(!config())return;returnFocus=document.activeElement;index=0;if(resume)try{index=Math.max(0,Math.min(steps.length-1,Number(storage?.getItem(key))||0));}catch{}active=true;panel.hidden=false;draw();}
  start.addEventListener('click',()=>open());
  const resume=document.createElement('button');resume.type='button';resume.className='secondary';resume.textContent='Resume tour';resume.id='resume-studio-tour';resume.addEventListener('click',()=>open(true));host.append(resume);
  return {open,close,refresh};
}

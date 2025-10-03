
export function h(tag, attrs={}, ...children){
  const el=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k==='class') el.className=v;
    else if(k==='style') el.style.cssText = v;
    else if(k.startsWith('on') && typeof v==='function') el.addEventListener(k.substring(2), v);
    else if(k==='checked') el.checked = !!v;
    else if(k==='disabled') el.disabled = !!v;
    else if(k==='value') el.value = v;
    else if(k==='selected') el.selected = !!v;
    else if(v!==null && v!==undefined) el.setAttribute(k, v);
  }
  for(const c of children.flat()){
    if(c===null||c===undefined) continue;
    if(typeof c==='string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}
export function clear(el){ while(el.firstChild) el.removeChild(el.firstChild); }
export function fmtDate(d){ const x=new Date(d); return x.toLocaleDateString('de-DE'); }

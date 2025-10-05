// /scripts/ui.js
export function h(tag, props, ...children){
  const el = document.createElement(tag);

  // Attribute / Props
  if (props){
    for (const [k,v] of Object.entries(props)){
      if (v === null || v === undefined || v === false) continue;

      if (k === 'class' || k === 'className'){
        el.className = String(v);
      } else if (k === 'style'){
        if (typeof v === 'object' && v){
          // style als Objekt { key: value }
          el.setAttribute('style', Object.entries(v).map(([a,b])=>`${a}:${b}`).join(';'));
        } else {
          // style als String
          el.setAttribute('style', String(v));
        }
      } else if (k.startsWith('on') && typeof v === 'function'){
        // Events: onclick, onchange, ...
        el[k.toLowerCase()] = v;
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }

  // Kinder
  const append = (c)=>{
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)){ c.forEach(append); return; }
    // Node?
    if (c instanceof Node){ el.appendChild(c); return; }
    // alles andere -> Text
    el.appendChild(document.createTextNode(String(c)));
  };

  children.forEach(append);
  return el;
}

export function clear(el){
  while (el && el.firstChild) el.removeChild(el.firstChild);
}

export function fmtDate(iso){
  try{
    const d = new Date(iso);
    if (isNaN(d)) return iso || '';
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  }catch{
    return iso || '';
  }
}

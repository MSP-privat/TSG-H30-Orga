// /scripts/ui.js

// Minimales h() – robust gegen Strings/Zahlen
export function h(tag, props, ...children){
  const el = document.createElement(tag);

  if (props){
    for (const [k,v] of Object.entries(props)){
      if (v === null || v === undefined || v === false) continue;

      if (k === 'class' || k === 'className'){
        el.className = String(v);
      } else if (k === 'style'){
        if (typeof v === 'object' && v){
          el.setAttribute('style', Object.entries(v).map(([a,b])=>`${a}:${b}`).join(';'));
        } else {
          el.setAttribute('style', String(v));
        }
      } else if (k.startsWith('on') && typeof v === 'function'){
        el[k.toLowerCase()] = v;
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }

  const append = (c)=>{
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)){ c.forEach(append); return; }
    if (c instanceof Node){ el.appendChild(c); return; }
    el.appendChild(document.createTextNode(String(c)));
  };
  children.forEach(append);
  return el;
}

export function clear(el){
  while (el && el.firstChild) el.removeChild(el.firstChild);
}

// ---- Zeitzonen-sichere Datumsutils ----

// "2025-10-15" -> Date(LOCAL, 2025, 9, 15)
export function parseISODateLocal(s){
  if (typeof s === 'string'){
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  }
  // Fallback: normale Date-Paarung (kann UTC sein)
  return new Date(s);
}

// Date -> "YYYY-MM-DD" in LOKALER Zeitzone
export function toLocalISO(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// "YYYY-MM-DD" oder Date -> hübsch formatiert (lokal, ohne Off-by-one)
export function fmtDate(val){
  if (!val) return '';
  const d = typeof val === 'string' ? parseISODateLocal(val) : val;
  if (isNaN(d)) return String(val);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

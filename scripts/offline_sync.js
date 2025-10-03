
import {DB} from './db.js';
export async function exportJSON(){
  const stores=['seasons','players','teams','games','assignments','meta'];
  const out={};
  for(const s of stores){ out[s]=await DB.getAll(s); }
  return out;
}
export async function importJSON(data){
  const stores=['seasons','players','teams','games','assignments','meta'];
  for(const s of stores){
    if(Array.isArray(data[s])){
      for(const row of data[s]) await DB.put(s,row);
    }
  }
}


export const DB = {
  name: 'tsg-tennis-db-offline-seasons-v3-full',
  version: 10,
  async open(){
    return await new Promise((resolve,reject)=>{
      const req = indexedDB.open(this.name, this.version);
      req.onupgradeneeded = ()=>{
        const db = req.result;
        if (!db.objectStoreNames.contains('seasons')) db.createObjectStore('seasons', {keyPath:'id'});
        if (!db.objectStoreNames.contains('players')) db.createObjectStore('players', {keyPath:'id'});
        if (!db.objectStoreNames.contains('teams')) db.createObjectStore('teams', {keyPath:'id'});
        if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', {keyPath:'id'});
        if (!db.objectStoreNames.contains('assignments')) db.createObjectStore('assignments', {keyPath:'id'});
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', {keyPath:'key'});
        if (!db.objectStoreNames.contains('penalties')) db.createObjectStore('penalties', {keyPath:'id'});
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  },
  async getAll(store){
    const db=await this.open();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readonly').objectStore(store).getAll();
      tx.onsuccess=()=>resolve(tx.result||[]);
      tx.onerror=()=>reject(tx.error);
    });
  },
  async get(store, key){
    const db=await this.open();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readonly').objectStore(store).get(key);
      tx.onsuccess=()=>resolve(tx.result||null);
      tx.onerror=()=>reject(tx.error);
    });
  },
  async put(store, value){
    const db=await this.open();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readwrite').objectStore(store).put(value);
      tx.onsuccess=()=>resolve(value);
      tx.onerror=()=>reject(tx.error);
    });
  },
  async delete(store, key){
    const db=await this.open();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readwrite').objectStore(store).delete(key);
      tx.onsuccess=()=>resolve(true);
      tx.onerror=()=>reject(tx.error);
    });
  }
};
export const uuid = ()=> crypto.randomUUID();

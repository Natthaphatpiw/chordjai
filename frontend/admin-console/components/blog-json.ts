/** PostgreSQL JSONB may reorder object keys; document comparisons must ignore key order. */
export function blogStableJson(value:unknown):string{
 return JSON.stringify(value,(_key,current)=>current&&typeof current==='object'&&!Array.isArray(current)?Object.fromEntries(Object.keys(current).sort().map(key=>[key,current[key]])):current);
}

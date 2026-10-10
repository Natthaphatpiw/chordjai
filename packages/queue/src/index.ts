import { withSystem, type PoolClient } from '@chordjai/db';
export type Job={id:string;topic:string;payload:Record<string,unknown>;lease_token:string;attempts:number};
/** Same transaction as business write when client is supplied, avoiding lost side effects. */
export async function enqueue(topic:string,payload:unknown,key:string,client?:PoolClient){
  const write=async(db:PoolClient)=>{const result=await db.query('SELECT ops.enqueue($1,$2::jsonb,$3,now(),5) AS id',[topic,JSON.stringify(payload),key]);return result.rows[0].id as string;};
  return client?write(client):withSystem(write);
}
export async function runJobs(handlers:Record<string,(payload:Record<string,unknown>,job:Job)=>Promise<void>>,limit=5){
  const jobs=await withSystem(async db=>(await db.query('SELECT * FROM ops.claim_jobs($1,$2,180)',[crypto.randomUUID(),limit])).rows as Job[]);
  // Start the bounded batch together so slow network calls fit one serverless invocation.
  return Promise.all(jobs.map(async job=>{
    try{
      const handler=handlers[job.topic];if(!handler)throw new Error('unsupported_topic');await handler(job.payload,job);
      const completed=await withSystem(async db=>(await db.query('SELECT ops.complete_job($1,$2) AS accepted',[job.id,job.lease_token])).rows[0]?.accepted===true);
      return {id:job.id,status:completed?'completed':'lease_lost'};
    }catch{
      const failed=await withSystem(async db=>(await db.query('SELECT ops.fail_job($1,$2,$3) AS accepted',[job.id,job.lease_token,'processing_failed'])).rows[0]?.accepted===true);
      return {id:job.id,status:failed?'retry_or_dead':'lease_lost'};
    }
  }));
}

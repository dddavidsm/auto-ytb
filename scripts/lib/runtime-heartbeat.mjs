const now=()=>Date.now();

export function createRuntimeHeartbeat(db,{role,instanceId,minIntervalMs=15_000}={}){
  if(!db)throw new Error('createRuntimeHeartbeat requires db');
  if(!role||!instanceId)throw new Error('createRuntimeHeartbeat requires role and instanceId');
  let lastWrite=0;
  return async function heartbeat(state='idle',metadata={},force=false){
    const current=now();
    if(!force&&current-lastWrite<Math.max(1000,Number(minIntervalMs)||15_000))return false;
    await db.query(`insert into runtime_heartbeats (role,instance_id,state,metadata,last_seen_at) values ($1,$2,$3,$4::jsonb,now()) on conflict (role,instance_id) do update set state=excluded.state,metadata=excluded.metadata,last_seen_at=now()`,[role,instanceId,state,JSON.stringify(metadata??{})]);
    lastWrite=current;
    return true;
  };
}

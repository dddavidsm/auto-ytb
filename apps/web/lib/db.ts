import 'server-only';
import { Pool } from 'pg';

declare global { var __autoYtbWebPool: Pool | undefined; }

function connectionString(){const value=process.env.DATABASE_URL?.trim();if(!value)throw new Error('DATABASE_URL is required');return value;}
export function pool(){
  if(!globalThis.__autoYtbWebPool)globalThis.__autoYtbWebPool=new Pool({connectionString:connectionString(),max:6,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
  return globalThis.__autoYtbWebPool;
}
export async function query<T=Record<string,unknown>>(text:string,values:unknown[]=[]){const result=await pool().query(text,values);return result.rows as T[];}
export async function transaction<T>(callback:(client:import('pg').PoolClient)=>Promise<T>){const client=await pool().connect();try{await client.query('begin');const result=await callback(client);await client.query('commit');return result;}catch(error){await client.query('rollback').catch(()=>{});throw error;}finally{client.release();}}

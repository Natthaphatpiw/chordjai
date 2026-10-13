import type { PoolClient } from 'pg';

export type CareSummaryOptions={sharedOnly?:boolean;includeCosts?:boolean;limit?:number};
/** Clinical projection only: never select narrative, reflection or media. */
export async function careSummary(db:PoolClient,petId:string,options:CareSummaryOptions={}) {
  const limit=Math.max(1,Math.min(200,options.limit??100));
  const entries=(await db.query(`SELECT e.id,e.kind,e.title,e.observed_at,e.clinical_note,e.observations,e.visit,e.provenance,e.updated_at,e.passport_source,
    CASE WHEN ep.id IS NULL THEN NULL ELSE jsonb_build_object('id',ep.id,'title',ep.title,'status',ep.status,'startedAt',ep.started_at,'resolvedAt',ep.resolved_at) END AS episode,
    CASE WHEN $3::boolean AND e.share_costs THEN coalesce((SELECT jsonb_agg(jsonb_build_object('label',c.label,'amountMinor',c.amount_minor,'currency',c.currency,'kind',c.kind) ORDER BY c.position) FROM health.care_costs c WHERE c.entry_id=e.id),'[]'::jsonb) ELSE '[]'::jsonb END AS costs
    FROM health.care_entries e LEFT JOIN health.care_episodes ep ON ep.id=e.episode_id
    WHERE e.pet_id=$1 AND (NOT $2::boolean OR e.share_with_clinic)
    ORDER BY e.observed_at DESC,e.id DESC LIMIT $4`,[petId,options.sharedOnly??false,options.includeCosts??false,limit+1])).rows;
  return {entries:entries.slice(0,limit),truncated:entries.length>limit,generatedAt:new Date().toISOString(),provenance:'owner_reported' as const};
}

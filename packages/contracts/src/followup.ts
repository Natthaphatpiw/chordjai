import {z} from 'zod';
export const FOLLOWUP_CONSENT_VERSION='2026-10-12.followup.v1';
export const followupSourcesSchema=z.object({care:z.boolean(),booklet:z.boolean(),journal:z.boolean(),assistantMemory:z.boolean()}).strict();
export const followupPreferencesSchema=z.object({
  enabled:z.boolean(),cadenceDays:z.union([z.literal(5),z.literal(7)]).default(7),language:z.enum(['th','en']).default('th'),
  pausedUntil:z.iso.datetime({offset:true}).nullable().default(null),sources:followupSourcesSchema,
  consentVersion:z.literal(FOLLOWUP_CONSENT_VERSION).nullable().default(null),expectedVersion:z.number().int().nonnegative()
}).strict().superRefine((value,ctx)=>{if(value.enabled&&(!value.consentVersion||!Object.values(value.sources).some(Boolean)))ctx.addIssue({code:'custom',message:'Choose at least one source and explicitly consent before enabling followups'});});
export type FollowupPreferencesInput=z.infer<typeof followupPreferencesSchema>;
export const followupDecisionSchema=z.object({
  shouldSend:z.boolean(),sourceId:z.uuid().nullable(),petId:z.uuid().nullable(),
  intent:z.enum(['care_checkin','vet_followup','memory_checkin','care_reminder','skip']),
  topic:z.enum(['general','ear','appetite','weight','skin','activity']),
  greeting:z.enum(['warm','playful','concise']),reason:z.enum(['ongoing_care','post_visit','new_memory','upcoming_care','no_useful_context'])
}).strict();
export type FollowupDecision=z.infer<typeof followupDecisionSchema>;

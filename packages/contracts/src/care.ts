import { z } from 'zod';

const instant=z.iso.datetime({offset:true});
export const careObservationsSchema=z.object({
  symptoms:z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  severity:z.enum(['unknown','mild','moderate','severe']).default('unknown'),
  appetite:z.enum(['unknown','normal','reduced','none']).default('unknown'),
  energy:z.enum(['unknown','normal','low','restless']).default('unknown'),
  trend:z.enum(['unknown','new','same','better','worse']).default('unknown'),
  water:z.enum(['unknown','normal','less','more']).default('unknown'),
  toilet:z.enum(['unknown','normal','changed']).default('unknown'),
  onsetAt:instant.nullable().default(null),frequency:z.string().trim().max(200).default(''),
});
export const careCostSchema=z.object({label:z.string().trim().min(1).max(120),amountMinor:z.number().int().min(0).max(100_000_000),currency:z.enum(['THB','USD']),kind:z.enum(['paid','estimate']).default('paid'),expenseDate:z.iso.date().refine(value=>!value.startsWith('0000-'),{message:'Expense date must use a year from 0001 through 9999'}).nullable().default(null)});
export const careVisitSchema=z.object({clinicName:z.string().trim().max(200).default(''),reason:z.string().trim().max(2000).default(''),vetReportedFindings:z.string().trim().max(4000).default(''),treatment:z.string().trim().max(4000).default(''),nextFollowupAt:instant.nullable().default(null)});
export const careEntryFieldsSchema=z.object({
  episodeId:z.uuid().nullable().default(null),kind:z.enum(['daily','symptom','visit','followup']),title:z.string().trim().min(1).max(160),observedAt:instant,
  narrative:z.string().trim().max(6000).default(''),clinicalNote:z.string().trim().max(4000).default(''),reflection:z.string().trim().max(6000).default(''),
  observations:careObservationsSchema.default(()=>careObservationsSchema.parse({})),visit:careVisitSchema.nullable().default(null),
  costs:z.array(careCostSchema).max(30).default([]),mediaIds:z.array(z.uuid()).max(5).default([]),shareWithClinic:z.boolean().default(false),shareCosts:z.boolean().default(false),
}).refine(body=>new Set(body.mediaIds).size===body.mediaIds.length,{message:'Each photo can be added only once',path:['mediaIds']});
export const careEntryCreateSchema=careEntryFieldsSchema.safeExtend({petId:z.uuid(),clientEntryId:z.uuid()});
export const careEntryUpdateSchema=careEntryFieldsSchema.safeExtend({version:z.number().int().positive()});
export const careEpisodeCreateSchema=z.object({petId:z.uuid(),clientEpisodeId:z.uuid(),title:z.string().trim().min(1).max(160),startedAt:instant});
export const careEpisodeUpdateSchema=z.object({version:z.number().int().positive(),title:z.string().trim().min(1).max(160),status:z.enum(['ongoing','improving','resolved']),resolvedAt:instant.nullable().default(null)}).refine(body=>body.status==='resolved'||body.resolvedAt===null,{message:'Only a resolved episode can have a resolution date',path:['resolvedAt']});
export type CareEntryInput=z.infer<typeof careEntryCreateSchema>;
export type CareCost=z.infer<typeof careCostSchema>;

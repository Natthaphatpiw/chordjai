import { z } from 'zod';
export * from './care';
export * from './passport';
export * from './followup';
export * from './petid-research';
export * from './petid-review';
export const petSchema=z.object({name:z.string().trim().min(1).max(80),species:z.enum(['cat','dog']),sex:z.enum(['male','female','unknown']).default('unknown'),neutered:z.boolean().nullable().optional(),birthDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),breed:z.string().max(100).optional(),weightKg:z.number().positive().max(150).nullable().optional(),photoUrl:z.string().max(1000).nullable().optional(),microchip:z.string().regex(/^\d{15}$/).nullable().optional()});
export const recordSchema=z.object({petId:z.uuid(),kind:z.enum(['vaccine','weight','medication','parasite','checkin','note']),title:z.string().trim().min(1).max(200),recordedAt:z.string().min(10).max(35),nextDueAt:z.string().max(35).nullable().optional(),notes:z.string().max(4000).optional(),value:z.number().nullable().optional(),data:z.record(z.string(),z.unknown()).optional()});
export const journalElementSchema=z.object({id:z.string().min(1).max(80),type:z.enum(['text','sticker','photo']),x:z.number().min(0).max(800),y:z.number().min(0).max(1422),width:z.number().min(10).max(800),height:z.number().min(10).max(1422),rotation:z.number().min(-180).max(180),content:z.string().max(4000),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()});
export const journalThemeSchema=z.object({background:z.string().regex(/^#[0-9a-fA-F]{6}$/),font:z.enum(['sans','serif','handwritten']),accent:z.string().regex(/^#[0-9a-fA-F]{6}$/)});
export const journalPageSchema=z.object({title:z.string().trim().min(1).max(120),theme:journalThemeSchema,elements:z.array(journalElementSchema).max(100),canvasHeight:z.union([z.literal(1000),z.literal(1422)]).default(1000),storyDate:z.iso.date().nullable().optional(),location:z.string().trim().max(160).default(''),pageOrder:z.number().int().min(0).default(0)});

export * from './passport-plan';

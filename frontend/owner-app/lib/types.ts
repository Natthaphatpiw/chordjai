export interface Pet { canEdit?:boolean;id: string; name: string; species: 'cat' | 'dog'; sex: 'male' | 'female' | 'unknown'; birthDate?: string; neutered: boolean | null; weightKg?: number; photoUrl?: string; }
export interface HealthRecord { id: string; petId: string; kind: 'vaccine' | 'weight' | 'medication' | 'parasite' | 'checkin' | 'note'; title: string; recordedAt: string; nextDueAt?: string | null; notes?: string; value?: number | null; revision?: string; canEdit?: boolean; canDelete?: boolean; }
export interface JournalElement { id: string; type: 'text' | 'sticker' | 'photo'; x: number; y: number; width: number; height: number; rotation: number; content: string; color?: string; }
export interface JournalTheme { background: string; font: string; accent: string; }
export interface JournalPage { id: string; petId: string; title: string; theme: JournalTheme; elements: JournalElement[]; version: number; canvasHeight?: 1000 | 1422; storyDate?: string | null; location?: string; pageOrder?: number; createdAt?: string; updatedAt?: string; }
export interface JournalBook { id: string; petId: string; title: string; coverTheme: JournalTheme; coverElements: JournalElement[]; version: number; updatedAt?: string; }
export interface Preferences { assistantName: string; tone: string; aboutUser: string; memoryEnabled: boolean; }
export interface Memory { id: string; content: string; kind: string; petId?: string | null; }
export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; createdAt?: string; }
export interface Conversation { id: string; title?: string; petId?: string | null; }
export interface Clinic { id: string; name: string; district?: string; address?: string; phone?: string; is24h?: boolean; lat?: number; lng?: number; }
export interface LostCase { id: string; petId: string; title?: string; petName?: string; description: string; createdAt: string; district: string; status: string; publicSlug: string; }
export interface Notification { id: string; title: string; body?: string; createdAt: string; }

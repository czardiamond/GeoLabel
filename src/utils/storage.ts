export interface SavedQuoteRecord { id: string; timestamp: string; fullName: string; email: string; organization: string; projectType: string; estimatedVolume: string; targetAccuracy: string; status: 'Received' | 'In Review' | 'SLA Approved'; }
export interface SavedPodEstimate { id: string; timestamp: string; podSize: number; imageryType: string; areaKm2: number; estimatedHours: number; monthlyCostUsd: number; }

type MemoryState = { user?: { uid?: string; isAnonymous?: boolean } | null; authenticated?: boolean; loading?: boolean; error?: unknown };
type MemoryClient = MemoryState & { get: (key: string) => unknown; set: (key: string, value: unknown) => Promise<void>; remove: (key: string) => Promise<void>; whenReady?: () => Promise<void>; };
const client = (): MemoryClient => {
  const value = (window as any).projectMemory as MemoryClient | undefined;
  if (!value) throw new Error('Authenticated project memory is not configured');
  return value;
};
const requireOwner = (): MemoryClient => {
  const value = client();
  if (!value.authenticated || value.loading || value.error || !value.user?.uid || value.user.isAnonymous) throw new Error('Sign in to use private GeoLabel memory.');
  return value;
};
const text = (value: unknown, max = 500): value is string => typeof value === 'string' && value.length <= max;
const requireArray = <T>(value: unknown, valid: (item: unknown) => item is T): T[] => Array.isArray(value) ? value.filter(valid) : [];
const validQuote = (value: unknown): value is SavedQuoteRecord => {
  const x = value as SavedQuoteRecord;
  return !!x && text(x.id, 80) && text(x.timestamp, 80) && text(x.fullName) && text(x.email) && text(x.organization) && text(x.projectType, 120) && text(x.estimatedVolume, 240) && text(x.targetAccuracy, 120) && ['Received','In Review','SLA Approved'].includes(x.status);
};
const validEstimate = (value: unknown): value is SavedPodEstimate => {
  const x = value as SavedPodEstimate;
  return !!x && text(x.id, 80) && text(x.timestamp, 80) && Number.isFinite(x.podSize) && Number.isFinite(x.areaKm2) && x.areaKm2 >= 0 && Number.isFinite(x.estimatedHours) && x.estimatedHours >= 0 && Number.isFinite(x.monthlyCostUsd) && x.monthlyCostUsd >= 0 && text(x.imageryType, 120);
};
const validBookmark = (value: unknown): value is string => text(value, 160) && !!value.trim();

export const getSavedQuotes = (): SavedQuoteRecord[] => requireArray(client().get('quotes'), validQuote);
export const saveQuoteRecord = async (quote: Omit<SavedQuoteRecord, 'id' | 'timestamp' | 'status'>): Promise<SavedQuoteRecord> => {
  const memory = requireOwner(); const record = {...quote, id: `GL-QT-${crypto.randomUUID()}`, timestamp: new Date().toISOString(), status: 'In Review' as const};
  await memory.set('quotes', [record, ...getSavedQuotes()]); return record;
};
export const getSavedEstimates = (): SavedPodEstimate[] => requireArray(client().get('estimates'), validEstimate);
export const savePodEstimateRecord = async (estimate: Omit<SavedPodEstimate, 'id' | 'timestamp'>): Promise<SavedPodEstimate> => {
  const memory = requireOwner(); const record = {...estimate, id: `EST-${crypto.randomUUID()}`, timestamp: new Date().toISOString()};
  await memory.set('estimates', [record, ...getSavedEstimates()]); return record;
};
export const getBookmarkedDatasets = (): string[] => requireArray(client().get('bookmarks'), validBookmark);
export const toggleBookmarkDataset = async (datasetId: string): Promise<string[]> => {
  if (!validBookmark(datasetId)) throw new Error('Invalid dataset identifier.');
  const memory = requireOwner(); const current = getBookmarkedDatasets(); const updated = current.includes(datasetId) ? current.filter(id => id !== datasetId) : [...current, datasetId];
  await memory.set('bookmarks', updated); return updated;
};

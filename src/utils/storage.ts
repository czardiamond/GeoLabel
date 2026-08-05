export interface SavedQuoteRecord {
  id: string;
  timestamp: string;
  fullName: string;
  email: string;
  organization: string;
  projectType: string;
  estimatedVolume: string;
  targetAccuracy: string;
  status: 'Received' | 'In Review' | 'SLA Approved';
}

export interface SavedPodEstimate {
  id: string;
  timestamp: string;
  podSize: number;
  imageryType: string;
  areaKm2: number;
  estimatedHours: number;
  monthlyCostUsd: number;
}

const QUOTES_STORAGE_KEY = 'geolabel_saved_quotes_v1';
const ESTIMATES_STORAGE_KEY = 'geolabel_saved_estimates_v1';
const BOOKMARKS_STORAGE_KEY = 'geolabel_bookmarked_datasets_v1';

export const getSavedQuotes = (): SavedQuoteRecord[] => {
  try {
    const data = localStorage.getItem(QUOTES_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to load quotes from localStorage', err);
    return [];
  }
};

export const saveQuoteRecord = (quote: Omit<SavedQuoteRecord, 'id' | 'timestamp' | 'status'>): SavedQuoteRecord => {
  const existing = getSavedQuotes();
  const newRecord: SavedQuoteRecord = {
    ...quote,
    id: `GL-QT-${Math.floor(100000 + Math.random() * 900000)}`,
    timestamp: new Date().toISOString(),
    status: 'In Review',
  };
  const updated = [newRecord, ...existing];
  try {
    localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save quote to localStorage', err);
  }
  return newRecord;
};

export const getSavedEstimates = (): SavedPodEstimate[] => {
  try {
    const data = localStorage.getItem(ESTIMATES_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to load estimates from localStorage', err);
    return [];
  }
};

export const savePodEstimateRecord = (estimate: Omit<SavedPodEstimate, 'id' | 'timestamp'>): SavedPodEstimate => {
  const existing = getSavedEstimates();
  const newRecord: SavedPodEstimate = {
    ...estimate,
    id: `EST-${Math.floor(10000 + Math.random() * 90000)}`,
    timestamp: new Date().toISOString(),
  };
  const updated = [newRecord, ...existing];
  try {
    localStorage.setItem(ESTIMATES_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save estimate to localStorage', err);
  }
  return newRecord;
};

export const getBookmarkedDatasets = (): string[] => {
  try {
    const data = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    return [];
  }
};

export const toggleBookmarkDataset = (datasetId: string): string[] => {
  const existing = getBookmarkedDatasets();
  const exists = existing.includes(datasetId);
  const updated = exists ? existing.filter(id => id !== datasetId) : [...existing, datasetId];
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save bookmark', err);
  }
  return updated;
};

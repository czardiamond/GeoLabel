export interface ServiceCategory {
  id: string;
  title: string;
  subtitle: string;
  iconName: string;
  description: string;
  keyUseCases: string[];
  supportedFormats: string[];
  annotationTypes: string[];
  taxonomyExample: {
    label: string;
    attributes: Record<string, string>;
  };
  sampleStats: {
    typicalAccuracy: string;
    sampleVolume: string;
  };
}

export interface ComparisonPoint {
  feature: string;
  genericPlatforms: string;
  geoLabelApproach: string;
  impact: string;
}

export interface HowItWorksStep {
  stepNumber: number;
  title: string;
  subtitle: string;
  description: string;
  details: string[];
  deliverables: string[];
  icon: string;
}

export interface QualityMetric {
  title: string;
  value: string;
  unit: string;
  description: string;
  icon: string;
}

export interface QuoteFormData {
  fullName: string;
  email: string;
  organization: string;
  role: string;
  projectType: string;
  imageryType: string;
  spatialResolution: string;
  estimatedVolume: string;
  timeline: string;
  targetAccuracy: string;
  budgetRange: string;
  hasSampleData: boolean;
  sampleFileName?: string;
  requirementsDescription: string;
  acceptsTerms: boolean;
}

export interface QuoteSubmissionResult extends QuoteFormData {
  quoteId: string;
  submittedAt: string;
  estimatedHours: number;
  recommendedTeamSize: string;
  status: 'Received' | 'In Review' | 'Scoping Scheduled';
}

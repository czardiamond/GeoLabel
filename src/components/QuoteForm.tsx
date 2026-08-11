import React, { useState, useEffect } from 'react';
import { GEO_SERVICES } from '../data/geospatialData';
import { QuoteFormData, QuoteSubmissionResult } from '../types';
import {
  Send,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Layers,
  Calendar,
  Building,
  User,
  Mail,
  DollarSign,
  Compass,
  Download,
  Sparkles,
  FileSpreadsheet,
  Save,
  Check
} from 'lucide-react';

import { saveQuoteRecord } from '../utils/storage';

interface QuoteFormProps {
  preselectedCategoryId?: string | null;
}

const DRAFT_STORAGE_KEY = 'geolabel_quote_form_draft_v1';

export const QuoteForm: React.FC<QuoteFormProps> = ({ preselectedCategoryId }) => {
  const [formData, setFormData] = useState<QuoteFormData>({
    fullName: '',
    email: '',
    organization: '',
    role: '',
    projectType: preselectedCategoryId || 'ai-ml-training',
    imageryType: 'Satellite RGB',
    spatialResolution: 'Sub-meter (0.15m - 0.5m GSD)',
    estimatedVolume: '10,000 km² / 50,000 Objects',
    timeline: 'Standard (2-4 Weeks)',
    targetAccuracy: '≥ 0.88 IoU SLA',
    budgetRange: '$5,000 - $25,000',
    hasSampleData: false,
    sampleFileName: '',
    requirementsDescription: '',
    acceptsTerms: true
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionResult, setSubmissionResult] = useState<QuoteSubmissionResult | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [draftSavedToast, setDraftSavedToast] = useState<boolean>(false);
  const [emailNotificationToast, setEmailNotificationToast] = useState<string | null>(null);

  // Restore draft from localStorage on mount
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed && typeof parsed === 'object') {
          setFormData(prev => ({
            ...prev,
            ...parsed,
            projectType: preselectedCategoryId || parsed.projectType || 'ai-ml-training',
          }));
          setDraftSavedToast(true);
          setTimeout(() => setDraftSavedToast(false), 4000);
        }
      }
    } catch (e) {
      console.warn('Failed to restore quote draft from localStorage:', e);
    }
  }, [preselectedCategoryId]);

  // Auto-save form inputs to localStorage as user types
  useEffect(() => {
    if (!submissionResult) {
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData));
      } catch (e) {
        console.warn('Failed to save quote draft to localStorage:', e);
      }
    }
  }, [formData, submissionResult]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Work email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid work email address';
    }
    if (!formData.organization.trim()) newErrors.organization = 'Company or Organization name is required';
    if (!formData.requirementsDescription.trim()) newErrors.requirementsDescription = 'Please describe your annotation scope or requirements';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFormData(prev => ({
        ...prev,
        hasSampleData: true,
        sampleFileName: file.name
      }));
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setFormData(prev => ({
        ...prev,
        hasSampleData: true,
        sampleFileName: file.name
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    // Simulate intake scoping engine response
    setTimeout(() => {
      const randomId = `GL-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const result: QuoteSubmissionResult = {
        ...formData,
        quoteId: randomId,
        submittedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
        estimatedHours: 85,
        recommendedTeamSize: '3 Dedicated GIS Analysts + 1 Lead Auditor',
        status: 'In Review'
      };

      console.log('Intake Form Submitted Successfully:', result);
      console.log(`[MOCK EMAIL NOTIFICATION SERVICE] Confirmation dispatch sent to: ${formData.email} for Quote ID: ${randomId}`);
      
      saveQuoteRecord({
        fullName: formData.fullName,
        email: formData.email,
        organization: formData.organization,
        projectType: formData.projectType,
        estimatedVolume: formData.estimatedVolume,
        targetAccuracy: formData.targetAccuracy,
      });

      // Clear auto-saved draft upon successful submission
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch (e) {
        console.warn('Failed to clear draft from localStorage:', e);
      }

      setEmailNotificationToast(`Mock Email Dispatched: Confirmation email sent to ${formData.email}!`);
      setSubmissionResult(result);
      setIsSubmitting(false);
    }, 1200);
  };

  const handleResetForm = () => {
    setSubmissionResult(null);
    setEmailNotificationToast(null);
    setFormData(prev => ({
      ...prev,
      requirementsDescription: '',
      hasSampleData: false,
      sampleFileName: ''
    }));
  };

  return (
    <section id="quote-section" className="py-20 bg-slate-900 border-b border-slate-800/80 relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Toast Alerts */}
        {emailNotificationToast && (
          <div className="bg-emerald-950 border border-emerald-500 text-emerald-300 px-4 py-3 rounded-xl flex items-center justify-between text-xs font-mono shadow-lg animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{emailNotificationToast}</span>
            </div>
            <button
              onClick={() => setEmailNotificationToast(null)}
              className="text-emerald-400 hover:text-white ml-4 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {draftSavedToast && !submissionResult && (
          <div className="bg-teal-950/90 border border-teal-600 text-teal-300 px-3.5 py-2 rounded-xl flex items-center justify-between text-xs font-mono shadow-md animate-in fade-in">
            <div className="flex items-center gap-2">
              <Save className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>Restored auto-saved quote request draft from your last session.</span>
            </div>
            <button
              onClick={() => setDraftSavedToast(false)}
              className="text-teal-400 hover:text-white font-bold text-sm"
            >
              ×
            </button>
          </div>
        )}

        {/* Section Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-800/80 text-teal-300 text-xs font-mono">
            <Send className="w-3.5 h-3.5 text-teal-400" />
            <span>PROJECT SCOPING INTAKE</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight">
            Request a Geospatial Annotation Quote
          </h2>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            Provide your imagery volume, target coordinate system, and accuracy requirements. Our senior GIS lead will review your scope and respond with a formal pilot proposal within 12 hours.
          </p>
        </div>

        {/* Confirmation State Modal/Card after Submission */}
        {submissionResult ? (
          <div className="bg-slate-950 border border-teal-500/80 rounded-2xl p-6 sm:p-10 space-y-8 animate-in fade-in zoom-in-95 shadow-2xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-teal-950 border border-teal-600 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-teal-400" />
                </div>
                <div>
                  <span className="text-xs font-mono text-teal-400 uppercase tracking-wider">INTAKE SCOPING RECEIVED</span>
                  <h3 className="text-xl font-bold text-white">Project Scope Confirmed</h3>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-lg font-mono text-xs text-right">
                <span className="text-slate-400 block text-[10px]">REFERENCE ID</span>
                <span className="text-teal-300 font-bold">{submissionResult.quoteId}</span>
              </div>
            </div>

            {/* Submission Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-mono">
              <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-500 block text-[10px]">CLIENT & ORGANIZATION</span>
                <div className="text-white font-bold">{submissionResult.fullName}</div>
                <div className="text-slate-400">{submissionResult.organization} ({submissionResult.role || 'Lead'})</div>
              </div>

              <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-500 block text-[10px]">PROJECT CATEGORY</span>
                <div className="text-teal-300 font-bold">
                  {GEO_SERVICES.find(s => s.id === submissionResult.projectType)?.title || submissionResult.projectType}
                </div>
                <div className="text-slate-400">{submissionResult.imageryType}</div>
              </div>

              <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800 space-y-1">
                <span className="text-slate-500 block text-[10px]">RECOMMENDED TEAM POD</span>
                <div className="text-emerald-400 font-bold">{submissionResult.recommendedTeamSize}</div>
                <div className="text-slate-400">Target SLA: {submissionResult.targetAccuracy}</div>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
              <span className="text-xs font-mono text-teal-400 block uppercase">Requirements Brief</span>
              <p className="text-xs text-slate-300 leading-relaxed font-mono italic">
                "{submissionResult.requirementsDescription}"
              </p>
              {submissionResult.sampleFileName && (
                <div className="text-[11px] font-mono text-slate-400 pt-1 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-teal-400" />
                  <span>Attached Sample File: {submissionResult.sampleFileName}</span>
                </div>
              )}
            </div>

            {/* Next Steps Info */}
            <div className="bg-teal-950/40 border border-teal-800/80 p-4 rounded-xl flex items-start gap-3 text-xs text-slate-300">
              <Compass className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-bold text-white">What Happens Next?</h4>
                <p className="text-slate-300 leading-relaxed">
                  Our Senior GIS Lead will examine your sample schema and imagery. You will receive an email at <strong className="text-teal-300">{submissionResult.email}</strong> within 12 hours containing a preliminary pilot agreement, pricing tiers, and a calendar link to finalize your taxonomy.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <button
                onClick={handleResetForm}
                className="w-full sm:w-auto px-5 py-2.5 text-xs font-mono font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
              >
                Submit Another Request
              </button>

              <div className="text-xs text-slate-400 font-mono">
                Direct Contact: <a href="mailto:intake@geolabel.ai" className="text-teal-300 underline">intake@geolabel.ai</a>
              </div>
            </div>

          </div>
        ) : (
          /* Intake Form */
          <form
            onSubmit={handleSubmit}
            className="bg-slate-950 border border-slate-800 rounded-2xl p-6 sm:p-10 space-y-8 shadow-2xl"
          >
            {/* Auto-Save Status Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-900/90 px-4 py-2.5 rounded-xl border border-slate-800 text-xs font-mono gap-2">
              <div className="flex items-center gap-2 text-teal-300 font-semibold">
                <Save className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span>Auto-Save Enabled (localStorage)</span>
              </div>
              <span className="text-[11px] text-slate-400">
                Your draft progress is continuously saved to your browser so you won't lose work.
              </span>
            </div>
            
            {/* Form Section 1: Contact & Organization */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-teal-400" />
                <span>1. Contact & Organization Details</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Full Name <span className="text-teal-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    placeholder="e.g. Dr. Alex Chen"
                    className={`w-full px-3.5 py-2.5 bg-slate-900 border rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 ${
                      errors.fullName ? 'border-red-500' : 'border-slate-800'
                    }`}
                  />
                  {errors.fullName && <p className="text-[10px] text-red-400 mt-1">{errors.fullName}</p>}
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Work Email Address <span className="text-teal-400">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="alex.chen@gis-ai.com"
                    className={`w-full px-3.5 py-2.5 bg-slate-900 border rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 ${
                      errors.email ? 'border-red-500' : 'border-slate-800'
                    }`}
                  />
                  {errors.email && <p className="text-[10px] text-red-400 mt-1">{errors.email}</p>}
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Organization / Company <span className="text-teal-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="organization"
                    value={formData.organization}
                    onChange={handleChange}
                    placeholder="e.g. Orbital Analytics Inc."
                    className={`w-full px-3.5 py-2.5 bg-slate-900 border rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 ${
                      errors.organization ? 'border-red-500' : 'border-slate-800'
                    }`}
                  />
                  {errors.organization && <p className="text-[10px] text-red-400 mt-1">{errors.organization}</p>}
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Role / Title
                  </label>
                  <input
                    type="text"
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    placeholder="e.g. Lead Computer Vision Engineer / GIS Director"
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* Form Section 2: Project Parameters */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-400" />
                <span>2. Imagery & Annotation Scope</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Project Service Category
                  </label>
                  <select
                    name="projectType"
                    value={formData.projectType}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-teal-500"
                  >
                    {GEO_SERVICES.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Imagery Modality Source
                  </label>
                  <select
                    name="imageryType"
                    value={formData.imageryType}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="Satellite RGB">High-Res Satellite RGB (WorldView, PlanetScope)</option>
                    <option value="Aerial / Drone RGB">Sub-Decimeter Aerial / Drone RGB</option>
                    <option value="Multispectral">Multispectral (Sentinel-2, Landsat 8/9, Planet)</option>
                    <option value="SAR Radar">Synthetic Aperture Radar (Sentinel-1 SAR)</option>
                    <option value="LiDAR">LiDAR Point Cloud (.LAS / .LAZ)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Estimated Volume / Area
                  </label>
                  <input
                    type="text"
                    name="estimatedVolume"
                    value={formData.estimatedVolume}
                    onChange={handleChange}
                    placeholder="e.g. 5,000 sq km / 25,000 buildings"
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Timeline SLA Target
                  </label>
                  <select
                    name="timeline"
                    value={formData.timeline}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="Rapid Emergency (48-72 Hours)">Rapid Emergency (48-72 Hours)</option>
                    <option value="Standard (2-4 Weeks)">Standard Delivery (2-4 Weeks)</option>
                    <option value="Ongoing Monthly Retainer">Ongoing Monthly Retainer / Stream</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Target Accuracy SLA
                  </label>
                  <select
                    name="targetAccuracy"
                    value={formData.targetAccuracy}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="≥ 0.88 IoU SLA">≥ 0.88 IoU SLA (Standard High Precision)</option>
                    <option value="≥ 0.95 IoU SLA">≥ 0.95 IoU SLA (Defense / Sub-Pixel Critical)</option>
                    <option value="Custom Taxonomy Agreement">Custom Taxonomy SLA Agreement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Budget Range (Optional)
                  </label>
                  <select
                    name="budgetRange"
                    value={formData.budgetRange}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="< $5,000">&lt; $5,000 (Pilot Batch)</option>
                    <option value="$5,000 - $25,000">$5,000 - $25,000 (Standard Production)</option>
                    <option value="$25,000 - $100,000">$25,000 - $100,000 (Large Scale Campaign)</option>
                    <option value="> $100,000">&gt; $100,000 (Enterprise Retainer)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Form Section 3: Detailed Description & Sample Upload */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-teal-400" />
                <span>3. Specific Requirements & Sample Data</span>
              </h3>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  Project Description & Taxonomy Guidelines <span className="text-teal-400">*</span>
                </label>
                <textarea
                  name="requirementsDescription"
                  rows={4}
                  value={formData.requirementsDescription}
                  onChange={handleChange}
                  placeholder="Describe target classes, edge cases, requested coordinate system (e.g. EPSG:4326), output format (GeoJSON, COCO JSON, Shapefile), and any specific topological constraints..."
                  className={`w-full px-3.5 py-2.5 bg-slate-900 border rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 ${
                    errors.requirementsDescription ? 'border-red-500' : 'border-slate-800'
                  }`}
                />
                {errors.requirementsDescription && (
                  <p className="text-[10px] text-red-400 mt-1">{errors.requirementsDescription}</p>
                )}
              </div>

              {/* File Dropzone Mockup */}
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  Sample Imagery / Spec Document (Optional)
                </label>

                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                    dragActive
                      ? 'border-teal-400 bg-teal-950/40'
                      : formData.hasSampleData
                      ? 'border-teal-600 bg-teal-950/20'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="file"
                    id="sample-upload"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept=".tiff,.geotiff,.geojson,.json,.png,.jpg,.zip,.pdf"
                  />

                  <label htmlFor="sample-upload" className="cursor-pointer space-y-2 block">
                    <Upload className="w-8 h-8 text-teal-400 mx-auto" />
                    {formData.hasSampleData ? (
                      <div>
                        <span className="text-xs font-mono text-teal-300 font-bold block">
                          File Ready: {formData.sampleFileName}
                        </span>
                        <span className="text-[11px] text-slate-400">Click or drop another file to replace</span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-xs font-mono text-slate-300 block font-semibold">
                          Drag & drop sample image file, GeoJSON schema, or PDF specs
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono block mt-1">
                          Supports .GeoTIFF, .GeoJSON, .COCO, .ZIP (Max 50MB)
                        </span>
                      </div>
                    )}
                  </label>
                </div>
              </div>

            </div>

            {/* Terms & Submit Button */}
            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-xs font-mono text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  name="acceptsTerms"
                  checked={formData.acceptsTerms}
                  onChange={handleChange}
                  className="rounded border-slate-700 text-teal-600 focus:ring-teal-500 bg-slate-900"
                />
                <span>I agree to receive a technical scoping proposal and NDA</span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-8 py-3.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 border border-teal-500/80 rounded-lg shadow-lg shadow-teal-950/50 transition-all flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                    <span>Analyzing Scope...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Scoping Request</span>
                    <Send className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </div>

          </form>
        )}

      </div>
    </section>
  );
};

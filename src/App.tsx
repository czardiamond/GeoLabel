import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { WhyNiche } from './components/WhyNiche';
import { Services } from './components/Services';
import { InteractiveAnnotationStudio } from './components/InteractiveAnnotationStudio';
import { GisToolsCalculator } from './components/GisToolsCalculator';
import { SplitSliderComparison } from './components/SplitSliderComparison';
import { ProjectEstimator } from './components/ProjectEstimator';
import { DatasetBenchmarkGallery } from './components/DatasetBenchmarkGallery';
import { EnterpriseRoiCalculator } from './components/EnterpriseRoiCalculator';
import { TrustCenterModal } from './components/TrustCenterModal';
import { ApiPipelineExplorer } from './components/ApiPipelineExplorer';
import { ComplianceMatrix } from './components/ComplianceMatrix';
import { CaseStudies } from './components/CaseStudies';
import { HowItWorks } from './components/HowItWorks';
import { QualityQA } from './components/QualityQA';
import { CommercialStrategy } from './components/CommercialStrategy';
import { Credentials } from './components/Credentials';
import { QuoteForm } from './components/QuoteForm';
import { Footer } from './components/Footer';

export default function App() {
  const [selectedCategoryForQuote, setSelectedCategoryForQuote] = useState<string | null>(null);

  const scrollToQuote = () => {
    const quoteElement = document.getElementById('quote-section');
    if (quoteElement) {
      quoteElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToDemo = () => {
    const demoElement = document.getElementById('interactive-studio');
    if (demoElement) {
      demoElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectCategoryForQuote = (categoryId: string) => {
    setSelectedCategoryForQuote(categoryId);
    scrollToQuote();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-teal-500 selection:text-white">
      {/* Sticky Header Navigation */}
      <Navbar onQuoteClick={scrollToQuote} onDemoClick={scrollToDemo} />

      {/* Main Content Sections */}
      <main>
        {/* Hero Section */}
        <Hero onQuoteClick={scrollToQuote} onDemoClick={scrollToDemo} />

        {/* Why Niche Geospatial Differentiation */}
        <WhyNiche />

        {/* 6 Category Interactive Services */}
        <Services onSelectCategoryForQuote={handleSelectCategoryForQuote} />

        {/* Interactive Sample Annotation Studio */}
        <InteractiveAnnotationStudio />

        {/* Interactive GIS Tools & Calculators */}
        <GisToolsCalculator />

        {/* Split Slider Before/After Vector Precision */}
        <SplitSliderComparison />

        {/* Interactive Project Pod & Scope Estimator */}
        <ProjectEstimator />

        {/* MLOps API & STAC Pipeline Integration Explorer */}
        <ApiPipelineExplorer />

        {/* OGC & Defense Security Compliance Matrix */}
        <ComplianceMatrix />

        {/* Enterprise Case Studies & Outcome Metrics */}
        <CaseStudies />

        {/* Pre-Annotated Benchmark Dataset Gallery */}
        <DatasetBenchmarkGallery />

        {/* In-House vs GeoLabel Pod ROI Calculator */}
        <EnterpriseRoiCalculator />

        {/* Defense & Security Trust Center */}
        <TrustCenterModal />

        {/* 4-Step How It Works Process */}
        <HowItWorks />

        {/* Quality & QA Codified SLA Rigor */}
        <QualityQA />

        {/* Commercial Operations & Business Strategy Blueprint */}
        <CommercialStrategy />

        {/* Founder Bio & Credentials */}
        <Credentials />

        {/* Custom Quote / Intake Form */}
        <QuoteForm preselectedCategoryId={selectedCategoryForQuote} />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

import { AlertCircle, Check, Database, KeyRound, Layers3, MapPinned, Workflow } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { InteractiveAnnotationStudio } from './components/InteractiveAnnotationStudio';
import { ApiPipelineExplorer } from './components/ApiPipelineExplorer';
import { QuoteForm } from './components/QuoteForm';
import { Footer } from './components/Footer';
import OrganizationWorkspace from './components/OrganizationWorkspace';

const currentCapabilities = [
  { icon: Database, title: 'Persist task and scoping records', text: 'Task metadata and scoping requests are stored through the configured database.' },
  { icon: KeyRound, title: 'Organizations, invitations, and roles', text: 'Local accounts use expiring sessions and organization-scoped owner, admin, annotator, reviewer, and analyst roles.' },
  { icon: Layers3, title: 'Submit and reproject GeoJSON', text: 'The API accepts GeoJSON FeatureCollections and transforms submitted geometries into the task CRS.' },
  { icon: Workflow, title: 'Projects, datasets, annotation and review', text: 'Private raster uploads, interactive vector drawing, priority queues, reservations, comments, review/rework, and temporal video segments are supported.' },
  { icon: Workflow, title: 'Gold-set quality and reviewable suggestions', text: 'Reviewers can maintain reference GeoJSON and calculate heuristic worker scores; provider-supplied pre-annotations can be reviewed.' },
];

const notYetAvailable = [
  'SSO, LDAP, MFA, password recovery, and automatic invitation email',
  'Credentialed S3/GCS object-storage adapters and deployment-shared asset storage',
  'AI detection, tracking, segmentation, and inference-provider credentials',
  'Independently validated quality thresholds, compliance attestations, or service-level guarantees',
];

export default function App() {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const scrollToQuote = () => scrollTo('quote-section');
  const scrollToAnnotator = () => scrollTo('organization-workspace');

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 selection:bg-teal-500 selection:text-white">
      <Navbar onQuoteClick={scrollToQuote} onDemoClick={scrollToAnnotator} />
      <main>
        <Hero onQuoteClick={scrollToQuote} onDemoClick={scrollToAnnotator} />

        <section id="product-status" className="scroll-mt-24 border-y border-slate-800 bg-slate-900/45 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 flex items-start gap-3">
              <MapPinned className="mt-1 h-5 w-5 shrink-0 text-teal-300" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-300">Current implementation</p>
                <h2 className="mt-2 text-2xl font-bold text-white">A working, organization-scoped annotation workflow with geospatial data controls.</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">The workspace calls the configured API and displays actual responses. It does not invent model predictions, scores, or successful submissions.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {currentCapabilities.map(({ icon: Icon, title, text }) => (
                <article key={title} className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white"><Check className="h-4 w-4 text-emerald-400" /><Icon className="h-4 w-4 text-teal-300" />{title}</div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
                </article>
              ))}
            </div>
            <div className="mt-6 rounded-xl border border-amber-900/70 bg-amber-950/20 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-100"><AlertCircle className="h-4 w-4" />Not available in this build</div>
              <ul className="mt-3 grid gap-2 text-sm text-amber-100/75 sm:grid-cols-2">
                {notYetAvailable.map((item) => <li key={item}>• {item}</li>)}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-slate-400">Agreement, consensus, and gold-set metrics use heuristic spatial matching and are not independently validated quality guarantees. Uploaded files are stored on the configured local volume; configure durable, private storage before multi-instance or production use.</p>
            </div>
          </div>
        </section>

        <div id="organization-workspace"><OrganizationWorkspace /></div>
        <details className="mx-auto my-12 max-w-6xl rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-slate-200">
          <summary className="cursor-pointer font-semibold">Legacy task-key API tools</summary>
          <p className="my-4 text-sm text-slate-400">These compatibility tools use the deployment-wide service key or an existing task-bound annotator key. Prefer the organization workspace for new projects.</p>
          <ApiPipelineExplorer />
          <InteractiveAnnotationStudio />
        </details>
        <QuoteForm />
      </main>
      <Footer />
    </div>
  );
}

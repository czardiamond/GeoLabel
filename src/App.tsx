import { AlertCircle, Check, Database, KeyRound, Layers3, MapPinned, Workflow } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { InteractiveAnnotationStudio } from './components/InteractiveAnnotationStudio';
import { ApiPipelineExplorer } from './components/ApiPipelineExplorer';
import { QuoteForm } from './components/QuoteForm';
import { Footer } from './components/Footer';

const currentCapabilities = [
  { icon: Database, title: 'Persist task and scoping records', text: 'Task metadata and scoping requests are stored through the configured database.' },
  { icon: KeyRound, title: 'Task-scoped annotator keys', text: 'Owners can issue one-time credentials assigned to a single task; workers can read and submit only to that task.' },
  { icon: Layers3, title: 'Submit and reproject GeoJSON', text: 'The API accepts GeoJSON FeatureCollections and transforms submitted geometries into the task CRS.' },
  { icon: Workflow, title: 'Agreement and consensus output', text: 'When the target annotation count is reached, the backend computes its current agreement score and returns majority-supported GeoJSON.' },
];

const notYetAvailable = [
  'Raster upload, storage, tile service, or in-browser imagery rendering',
  'Interactive drawing tools, automatic labeling, or AI-assisted annotation',
  'Organization accounts, user roles, billing, and customer-facing task queues',
  'Email notifications or priced quotes from the scoping form',
  'Independently validated scoring thresholds, compliance attestations, or service-level guarantees',
];

export default function App() {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const scrollToQuote = () => scrollTo('quote-section');
  const scrollToAnnotator = () => scrollTo('interactive-studio');

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
                <h2 className="mt-2 text-2xl font-bold text-white">A working GeoJSON-first API foundation, not a finished annotation service.</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">The controls below call the backend you configure. They report live server responses; an empty state or connection error is not replaced with a fabricated success.</p>
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
              <p className="mt-4 text-xs leading-relaxed text-slate-400">Agreement and consensus are implemented as an initial, heuristic spatial-matching approach. They are not an independently validated quality guarantee. Review the code and test against your domain data before using the scores for operational decisions.</p>
            </div>
          </div>
        </section>

        <ApiPipelineExplorer />
        <InteractiveAnnotationStudio />
        <QuoteForm />
      </main>
      <Footer />
    </div>
  );
}

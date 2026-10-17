import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  UserCheck, 
  HelpCircle, 
  AlertTriangle, 
  FileCheck2, 
  ExternalLink,
  Check
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const ResponsibleAi: React.FC = () => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');

  const policies = [
    {
      id: 'r-1',
      title: 'Human Safety First',
      badge: 'Active',
      icon: ShieldCheck,
      details: [
        '100% human-in-the-loop review for all high-risk recommendations (chemical applications, severe pest outbreaks).',
        'Direct emergency escalation pathways for acute pathogen spread.',
        'Clear hazard statements prominently displayed to farmer operators.',
        'Adheres to Worker Protection Standard (WPS) safety intervals.',
      ],
    },
    {
      id: 'r-2',
      title: 'Chemical & Pesticide Caution',
      badge: 'Active',
      icon: AlertTriangle,
      details: [
        'Restricted Use Pesticides (RUP) require mandatory agronomist sign-off before farmer guidance delivery.',
        'Automatic checks against EPA label restrictions and application maximums.',
        'Surface water buffer zones (minimum 50ft setback) strictly validated.',
        'Organic farm verification prevents non-compliant synthetic fertilizer recommendations.',
      ],
    },
    {
      id: 'r-3',
      title: 'Wrong Advice Controls',
      badge: 'Active',
      icon: HelpCircle,
      details: [
        'Fallback to conservative, low-risk actions when uncertainty is high.',
        'Confidence threshold gates prevent unvalidated AI recommendations from reaching growers without expert review.',
        'Continuous calibration of model outputs against field trials and tissue tests.',
        'Post-harvest outcome feedback loop integrated into retraining datasets.',
      ],
    },
    {
      id: 'r-4',
      title: 'Human Review',
      badge: 'Active',
      icon: UserCheck,
      details: [
        'Certified agronomists inspect every candidate recommendation prior to delivery.',
        'Detailed audit trail of reviewer notes, modifications, and overrides.',
        'Agronomist accountability maintained with full electronic signatures.',
        'Dual-review workflow triggered for restricted chemical applications.',
      ],
    },
    {
      id: 'r-5',
      title: 'Privacy & Data Sovereignty',
      badge: 'Active',
      icon: Lock,
      details: [
        'Zero training policy on farmer-uploaded field images and soil lab tests.',
        'GDPR and CCPA compliant data handling with encrypted storage at rest and in transit.',
        'Farm location data obfuscated to prevent competitive price exploitation.',
        'Farmers retain complete data portability and right-to-delete requests.',
      ],
    },
    {
      id: 'r-6',
      title: 'Explainability & Grounding',
      badge: 'Active',
      icon: FileCheck2,
      details: [
        'Every recommendation includes transparent evidence, assumptions, and confidence bands.',
        'Direct citations to state university extension guides (ISU, UNL, Purdue).',
        'Plain-language farmer guidance reports with synthesized audio summaries.',
        'Interactive "Why not higher?" uncertainty breakdown for diagnostic decisions.',
      ],
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('nav.responsibleAi', 'Responsible AI')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Governance, safety controls, and ethical protocols for AgriAdvisor AI.
        </p>
      </div>

      {/* Filter / Compliance Header Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Safety Controls
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>All Active (6/6)</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Privacy Compliance
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Certified (GDPR)</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Human Oversight
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Enforced</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Last Audit
          </span>
          <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
            Sep 2026 (Passed)
          </div>
        </div>
      </div>

      {/* Policy Cards Grid */}
      <div className="space-y-4">
        {policies.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {p.title}
                  </h3>
                </div>

                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <Check className="w-3 h-3 text-emerald-600" />
                  {p.badge}
                </span>
              </div>

              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {p.details.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-bold text-emerald-600">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Legal & Decision Disclaimer Footer */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <p className="font-semibold text-slate-700 dark:text-slate-300">
          Important Advisory & Decision Support Notice:
        </p>
        <p className="leading-relaxed">
          AgriAdvisor is an AI decision support tool. All recommendations require professional agronomist review before application. Real-world field conditions, localized weather events, micro-climate variations, and soil chemistry can diverge from modeled simulations.
        </p>
      </div>
    </div>
  );
};

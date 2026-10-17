import React from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StepperProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
  maxAccessibleStep?: number;
}

export const Stepper: React.FC<StepperProps> = ({
  currentStep,
  onStepClick,
  maxAccessibleStep = 6,
}) => {
  const { t } = useTranslation();

  const steps = [
    { number: 1, key: 'collect', label: t('wizard.collect', 'Collect') },
    { number: 2, key: 'analyze', label: t('wizard.analyze', 'Analyze') },
    { number: 3, key: 'recommend', label: t('wizard.recommend', 'Recommend') },
    { number: 4, key: 'riskCheck', label: t('wizard.riskCheck', 'Risk Check') },
    { number: 5, key: 'humanReview', label: t('wizard.humanReview', 'Human Review') },
    { number: 6, key: 'explain', label: t('wizard.explain', 'Explain') },
  ];

  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between max-w-4xl mx-auto px-4">
        {steps.map((step, idx) => {
          const isCompleted = currentStep > step.number;
          const isActive = currentStep === step.number;
          const isAccessible = step.number <= maxAccessibleStep;

          return (
            <React.Fragment key={step.number}>
              {/* Step indicator */}
              <div
                onClick={() => isAccessible && onStepClick?.(step.number)}
                className={`flex flex-col items-center group ${
                  isAccessible ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-emerald-800 text-white shadow-md ring-4 ring-emerald-100 dark:ring-emerald-950/50'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : step.number}
                </div>
                <span
                  className={`mt-2 text-xs font-medium tracking-tight text-center ${
                    isActive
                      ? 'text-emerald-900 dark:text-emerald-300 font-semibold'
                      : isCompleted
                      ? 'text-slate-700 dark:text-slate-300'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connecting line */}
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 -mt-5 transition-colors duration-300 ${
                    currentStep > step.number
                      ? 'bg-emerald-600'
                      : 'bg-slate-200 dark:bg-slate-800'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

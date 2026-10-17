import { create } from 'zustand';
import { type CaseItem, mockCases } from '@/mocks/data';

interface NewCaseState {
  currentStep: number;
  caseId: string;
  caseData: CaseItem;
  uploadedImage: string | null;
  uploadedSoilPdf: string | null;
  isAnalyzing: boolean;
  agronomistNotes: string;
  reviewDecision: 'pending' | 'Approved' | 'Approved with Edits' | 'Rejected';

  // Actions
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setImage: (url: string | null) => void;
  setSoilPdf: (name: string | null) => void;
  setNotes: (notes: string) => void;
  setReviewDecision: (decision: 'Approved' | 'Approved with Edits' | 'Rejected') => void;
  updateField: (field: string, value: any) => void;
  resetCase: () => void;
}

const baseCase = { ...mockCases[0] };

export const useNewCaseStore = create<NewCaseState>((set, get) => ({
  currentStep: 1,
  caseId: 'C-2848',
  caseData: JSON.parse(JSON.stringify(baseCase)),
  uploadedImage: null,
  uploadedSoilPdf: null,
  isAnalyzing: false,
  agronomistNotes: '',
  reviewDecision: 'pending',

  setStep: (step) => set({ currentStep: Math.max(1, Math.min(6, step)) }),
  nextStep: () => set((state) => ({ currentStep: Math.min(6, state.currentStep + 1) })),
  prevStep: () => set((state) => ({ currentStep: Math.max(1, state.currentStep - 1) })),

  setImage: (url) => set({ uploadedImage: url }),
  setSoilPdf: (name) => set({ uploadedSoilPdf: name }),
  setNotes: (notes) => set({ agronomistNotes: notes }),

  setReviewDecision: (decision) => {
    set((state) => ({
      reviewDecision: decision,
      caseData: {
        ...state.caseData,
        status: decision === 'Rejected' ? 'Flagged' : 'Resolved',
        agronomistReview: {
          reviewerName: 'Dr. Sarah Chen',
          title: 'Senior Agronomist',
          organization: 'Iowa State Extension',
          status: decision,
          notes: state.agronomistNotes || 'Recommendations verified against ISU tissue testing protocol.',
          timestamp: new Date().toISOString(),
        },
      },
    }));
  },

  updateField: (field, value) => {
    set((state) => ({
      caseData: {
        ...state.caseData,
        [field]: value,
      },
    }));
  },

  resetCase: () => {
    set({
      currentStep: 1,
      caseId: `C-${Math.floor(2850 + Math.random() * 50)}`,
      caseData: JSON.parse(JSON.stringify(baseCase)),
      uploadedImage: null,
      uploadedSoilPdf: null,
      isAnalyzing: false,
      agronomistNotes: '',
      reviewDecision: 'pending',
    });
  },
}));

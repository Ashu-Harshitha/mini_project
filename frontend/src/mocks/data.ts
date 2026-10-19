export interface Farm {
  id: string;
  name: string;
  operator: string;
  location: string;
  totalAcreage: number;
  primaryCrops: string[];
  irrigationSystem: string;
  fields: {
    id: string;
    name: string;
    acreage: number;
    soilType: string;
    currentCrop: string;
    cropVariety?: string;
    lastFertilizer?: string;
  }[];
}

export interface CaseItem {
  id: string;
  caseNumber: string;
  farmId: string;
  farmName: string;
  fieldName: string;
  crop: string;
  issue: string;
  growthStage: string;
  confidence: number; // Single % number
  uncertainty: 'Low' | 'Medium' | 'High';
  status: 'Resolved' | 'Review' | 'Flagged' | 'Draft' | 'Agronomist';
  rawStatus?: string;
  description?: string;
  description_lang?: string;
  assigned_at?: string;
  assigned_agronomist_id?: number | null;
  assigned_agronomist_name?: string | null;
  farmer_summary?: string | null;
  final_suggestion?: string | null;
  decision_note?: string | null;
  rawRecommendations?: any[];
  time: string;
  createdAt: string;
  operator: string;
  assignedAgronomist?: string;
  summary: string;
  audioUrl?: string;
  observations: {
    description: string;
    confidence: number;
    uncertainty: 'Low' | 'Medium' | 'High';
    note?: string;
  }[];
  soil: {
    nitrogen: { value: string; status: 'Marginal' | 'Optimal' | 'Deficient' | 'Adequate'; citation: string };
    ph: { value: string; status: 'Optimal' | 'Low' | 'High' | 'Adequate'; citation: string };
    pk: { value: string; status: 'Optimal' | 'Adequate' | 'Deficient'; citation: string };
  };
  weather: {
    tempMaxC: number;
    tempMinC: number;
    rainfall7dMm: number;
    humidity: number;
    windKmh: number;
    uvIndex: number;
    rainfallStatus: 'Below Average' | 'Optimal' | 'Excessive';
    tempStatus: 'Optimal' | 'Below Average' | 'Stress';
    soilMoistureProxy: { uncertainty: 'High' | 'Medium' | 'Low'; note: string };
  };
  recommendations: {
    id: string;
    category: 'Crop' | 'Fertilizer' | 'Irrigation';
    title: string;
    confidence: number; // single %
    uncertainty: 'Low' | 'Medium' | 'High';
    evidence: string;
    assumptions: string;
    whyLine?: string;
  }[];
  risks: {
    missingData: { item: string; impact: 'High impact' | 'Medium impact' | 'Low impact'; reason: string }[];
    unsafeFlags: { title: string; type: 'warning' | 'safe'; message: string }[];
    environmental: {
      nitrateLeaching: { level: 'Medium' | 'High' | 'Low'; note: string };
      bufferZone: { level: 'Good' | 'Warning'; note: string };
      carbonFootprint: { level: 'Low' | 'Medium'; note: string };
      pollinatorImpact: { level: 'Low' | 'Medium' | 'High'; note: string };
    };
  };
  agronomistReview?: {
    reviewerName: string;
    title: string;
    organization: string;
    status: 'Awaiting Review' | 'Approved' | 'Approved with Edits' | 'Rejected';
    notes?: string;
    timestamp?: string;
  };
  farmerReport?: {
    headline: string;
    description: string;
    steps: { number: number; title: string; instruction: string }[];
    warnings: string[];
    confidenceExplanation: string;
    audioUrl?: string;
  };
}

export const mockFarms: Farm[] = [
  {
    id: '1',
    name: 'Westfield Farm',
    operator: 'James Donovan',
    location: 'Ames, Iowa 50011',
    totalAcreage: 847,
    primaryCrops: ['Corn', 'Soybean'],
    irrigationSystem: 'Center pivot',
    fields: [
      { id: '1', name: 'North 40 — Block C', acreage: 38, soilType: 'Silty clay loam', currentCrop: 'Dent Corn', cropVariety: 'Pioneer P1197AM', lastFertilizer: 'Apr 30 — 120 lb/ac anhydrous NH3' },
      { id: '2', name: 'South 80', acreage: 80, soilType: 'Silt loam', currentCrop: 'Soybean', cropVariety: 'Asgrow A2834', lastFertilizer: 'May 10 — Inoculant & P/K' },
      { id: '3', name: 'Creek Bottom', acreage: 24, soilType: 'Clay', currentCrop: 'Fallow', lastFertilizer: 'None' },
    ],
  },
  {
    id: '2',
    name: 'Oakridge Ranch',
    operator: 'Elena Martinez',
    location: 'Boone, Iowa 50036',
    totalAcreage: 1240,
    primaryCrops: ['Soybean', 'Alfalfa'],
    irrigationSystem: 'Drip & Pivot',
    fields: [
      { id: '4', name: 'West Valley 120', acreage: 120, soilType: 'Loam', currentCrop: 'Soybean' },
      { id: '5', name: 'Prairie East', acreage: 95, soilType: 'Sandy loam', currentCrop: 'Alfalfa' },
    ],
  },
  {
    id: '3',
    name: 'Maple Grove',
    operator: 'Marcus Vance',
    location: 'Story City, Iowa 50248',
    totalAcreage: 620,
    primaryCrops: ['Corn', 'Cotton'],
    irrigationSystem: 'Rain-fed / Pivot',
    fields: [
      { id: '6', name: 'River Flats', acreage: 64, soilType: 'Alluvial silt', currentCrop: 'Corn' },
      { id: '7', name: 'Ridge Top 45', acreage: 45, soilType: 'Clay loam', currentCrop: 'Cotton' },
    ],
  },
];

export const mockCases: CaseItem[] = [
  {
    id: 'c-2848',
    caseNumber: 'C-2848',
    farmId: 'westfield',
    farmName: 'Westfield Farm',
    fieldName: 'North 40 — Block C',
    crop: 'Dent Corn (Pioneer P1197AM)',
    issue: 'Nitrogen deficiency suspected',
    growthStage: 'V8 (8-leaf)',
    confidence: 72,
    uncertainty: 'Medium',
    status: 'Resolved',
    time: 'Just now',
    createdAt: '2026-10-16T14:30:00Z',
    operator: 'James Donovan',
    assignedAgronomist: 'Dr. Sarah Chen',
    summary: 'Lower leaf interveinal chlorosis at V8 stage. Soil test shows 14 ppm NO3-N (marginal).',
    audioUrl: 'https://actions.google.com/sounds/v1/weather/light_rain.ogg', // sample working audio stream
    observations: [
      { description: 'Interveinal chlorosis visible on lower leaves', confidence: 78, uncertainty: 'Medium', note: 'Visible evidence only' },
      { description: 'Yellowing pattern consistent with N or S deficiency', confidence: 65, uncertainty: 'Medium', note: 'Texture artifacts reduce certainty' },
      { description: 'No visible lesions, spots, or pest damage', confidence: 91, uncertainty: 'Low', note: 'High confidence — clear negative' },
      { description: 'Canopy density appears normal for V8 stage', confidence: 82, uncertainty: 'Low', note: 'Compared to reference imagery' },
    ],
    soil: {
      nitrogen: { value: '14 ppm NO3-N', status: 'Marginal', citation: 'Below optimal (25-35 ppm) for V8 corn. [ISU Ext. PM 1714]' },
      ph: { value: 'pH 6.2', status: 'Adequate', citation: 'Within optimal range (6.0-6.8) for corn. [ISU Ext. PM 1688]' },
      pk: { value: 'P & K Sufficient', status: 'Adequate', citation: 'Mid-season demand adequately met.' },
    },
    weather: {
      tempMaxC: 29,
      tempMinC: 14,
      rainfall7dMm: 12,
      humidity: 68,
      windKmh: 18,
      uvIndex: 7,
      rainfallStatus: 'Below Average',
      tempStatus: 'Optimal',
      soilMoistureProxy: {
        uncertainty: 'High',
        note: 'No in-situ sensor data. Estimate derived from rainfall deficit only. Field inspection recommended.',
      },
    },
    recommendations: [
      {
        id: 'rec-2',
        category: 'Crop',
        title: 'In-field tissue test before any application',
        confidence: 89,
        uncertainty: 'Low',
        evidence: 'Soil test alone insufficient to distinguish N vs S deficiency.',
        assumptions: 'Agronomist can collect sample within 48h.',
      },
      {
        id: 'rec-1',
        category: 'Fertilizer',
        title: 'Apply foliar nitrogen — 20 lb/ac urea solution',
        confidence: 72,
        uncertainty: 'Medium',
        evidence: 'Low soil N (14 ppm), Interveinal chlorosis pattern, V8 timing critical window.',
        assumptions: 'Chlorosis is N-driven, not sulfur or water deficiency.',
      },
      {
        id: 'rec-4',
        category: 'Irrigation',
        title: 'Irrigate with 1.0 inch within 48 hours',
        confidence: 68,
        uncertainty: 'Medium',
        evidence: '7-day rainfall deficit (12mm vs 28mm historical average). Crop moisture demand peaks at V8.',
        assumptions: 'Pivots are functional and aquifer draw is within permit bounds.',
        whyLine: 'Why: Soil moisture uncertainty is High (no sensor data). Defer 24h if rain holds to prevent runoff & nitrate leaching.',
      },
      {
        id: 'rec-3',
        category: 'Fertilizer',
        title: 'Monitor for 7 days — no immediate action',
        confidence: 45,
        uncertainty: 'High',
        evidence: 'Symptoms mild; rainfall event forecast next week.',
        assumptions: '7-day rainfall forecast is accurate.',
      },
    ],
    risks: {
      missingData: [
        { item: 'Tissue nitrogen test', impact: 'High impact', reason: 'Required to distinguish N vs S deficiency' },
        { item: 'Soil moisture reading', impact: 'Medium impact', reason: 'Pre-irrigation check / rainfall estimate only' },
        { item: 'Hybrid performance data', impact: 'Low impact', reason: 'Would refine N response curve' },
      ],
      unsafeFlags: [
        {
          title: 'UAN 28% Application Flagged',
          type: 'warning',
          message: 'UAN 28% application flagged as chemical input. Pre-approval required. EPA/state extension guidelines recommend agronomist sign-off before application. Avoid application above 85°F to prevent leaf scorch.',
        },
        {
          title: 'Safe: Tissue test collection',
          type: 'safe',
          message: 'No risk — diagnostic only. Recommended first step.',
        },
        {
          title: 'Safe: Irrigation (1.0 in)',
          type: 'safe',
          message: 'Within normal range. No runoff risk at current soil saturation.',
        },
      ],
      environmental: {
        nitrateLeaching: { level: 'Medium', note: 'Sandy subsoil in NE corner of field. Avoid late N applications.' },
        bufferZone: { level: 'Good', note: '50ft buffer to Ridgeway Creek maintained. No spray drift risk.' },
        carbonFootprint: { level: 'Low', note: 'N2O emissions estimated 12 lb CO2e/ac at recommended rate.' },
        pollinatorImpact: { level: 'Low', note: 'Foliar UAN at this timing has minimal risk to pollinators.' },
      },
    },
    agronomistReview: {
      reviewerName: 'Dr. Sarah Chen',
      title: 'Senior Agronomist',
      organization: 'Iowa State Extension',
      status: 'Approved',
      notes: 'Confirmed visual signs align with soil nitrate depression. Diagnostic leaf test prioritized before side-dressing.',
      timestamp: '2026-10-16T15:10:00Z',
    },
    farmerReport: {
      headline: "What's happening with your corn?",
      description: 'Your North 40 corn field is showing signs of nitrogen shortage. The yellowing between the leaf veins on lower leaves is a classic sign. Your soil test shows nitrogen is lower than ideal for this growth stage.',
      steps: [
        {
          number: 1,
          title: 'Collect a leaf tissue sample today',
          instruction: 'Take 15 leaves from the corn stalk below the whorl. Send to ISU Plant & Insect Diagnostic Lab. Results in 2-3 days. This confirms nitrogen vs. sulfur deficiency.',
        },
        {
          number: 2,
          title: 'Irrigate with 1.0 inch within 48 hours',
          instruction: 'Your crop needs moisture. Check the weather Thursday — if 0.5+ inches of rain arrives, you may be able to skip irrigation this week.',
        },
        {
          number: 3,
          title: 'Wait for tissue test before fertilizing',
          instruction: "Dr. Chen advises confirming the deficiency type before applying any nitrogen fertilizer. If tissue test confirms low N, we'll provide a precise fertilizer plan.",
        },
      ],
      warnings: [
        'Do not apply fertilizer without confirming the issue type — wrong treatment can make things worse.',
        'If rain forecast changes, reassess irrigation timing.',
        'Watch for sulfur deficiency symptoms: yellowing on newer upper leaves (different pattern).',
      ],
      confidenceExplanation: "Why not higher? The AI can't tell from images alone if it's N or sulfur deficiency — they look similar. Tissue test removes this uncertainty.",
      audioUrl: 'https://actions.google.com/sounds/v1/weather/light_rain.ogg',
    },
  },
  {
    id: 'c-2847',
    caseNumber: 'C-2847',
    farmId: 'westfield',
    farmName: 'Westfield Farm',
    fieldName: 'South 80',
    crop: 'Corn',
    issue: 'Nitrogen deficiency suspected',
    growthStage: 'V6 (6-leaf)',
    confidence: 84,
    uncertainty: 'Low',
    status: 'Resolved',
    time: '2h ago',
    createdAt: '2026-10-16T13:00:00Z',
    operator: 'James Donovan',
    assignedAgronomist: 'Dr. Sarah Chen',
    summary: 'Confirmed mild nitrogen stress in sandy spot. Sidedress rate adjusted.',
    observations: [{ description: 'Mild pale green canopy', confidence: 84, uncertainty: 'Low' }],
    soil: {
      nitrogen: { value: '18 ppm', status: 'Marginal', citation: 'ISU Ext' },
      ph: { value: '6.4', status: 'Optimal', citation: 'ISU Ext' },
      pk: { value: 'Normal', status: 'Adequate', citation: 'ISU Ext' },
    },
    weather: { tempMaxC: 28, tempMinC: 13, rainfall7dMm: 14, humidity: 65, windKmh: 14, uvIndex: 6, rainfallStatus: 'Optimal', tempStatus: 'Optimal', soilMoistureProxy: { uncertainty: 'Low', note: 'Sensors online' } },
    recommendations: [],
    risks: { missingData: [], unsafeFlags: [], environmental: { nitrateLeaching: { level: 'Low', note: 'Stable' }, bufferZone: { level: 'Good', note: 'Standard' }, carbonFootprint: { level: 'Low', note: 'Optimal' }, pollinatorImpact: { level: 'Low', note: 'Safe' } } },
  },
  {
    id: 'c-2846',
    caseNumber: 'C-2846',
    farmId: 'oakridge',
    farmName: 'Oakridge Ranch',
    fieldName: 'West Valley 120',
    crop: 'Soybean',
    issue: 'Fungal Infection — Cercospora',
    growthStage: 'R3 (Pod Initiation)',
    confidence: 61,
    uncertainty: 'Medium',
    status: 'Review',
    time: '4h ago',
    createdAt: '2026-10-16T11:00:00Z',
    operator: 'Elena Martinez',
    assignedAgronomist: 'Dr. Sarah Chen',
    summary: 'Purple seed stain and leaf blight symptoms visible on upper canopy.',
    observations: [{ description: 'Purple bronzing on sun-exposed leaves', confidence: 61, uncertainty: 'Medium' }],
    soil: { nitrogen: { value: 'N/A', status: 'Adequate', citation: 'Legume nodulated' }, ph: { value: '6.7', status: 'Optimal', citation: '' }, pk: { value: 'Optimal', status: 'Adequate', citation: '' } },
    weather: { tempMaxC: 31, tempMinC: 19, rainfall7dMm: 35, humidity: 82, windKmh: 10, uvIndex: 8, rainfallStatus: 'Excessive', tempStatus: 'Optimal', soilMoistureProxy: { uncertainty: 'Low', note: 'High moisture' } },
    recommendations: [],
    risks: { missingData: [], unsafeFlags: [], environmental: { nitrateLeaching: { level: 'Low', note: 'N/A' }, bufferZone: { level: 'Good', note: 'Safe' }, carbonFootprint: { level: 'Low', note: 'Minimal' }, pollinatorImpact: { level: 'Medium', note: 'Apply during dusk to protect bees' } } },
  },
  {
    id: 'c-2845',
    caseNumber: 'C-2845',
    farmId: 'westfield',
    farmName: 'Westfield Farm',
    fieldName: 'Creek Bottom',
    crop: 'Wheat',
    issue: 'Rust stripe early detection',
    growthStage: 'Feekes 9',
    confidence: 54,
    uncertainty: 'High',
    status: 'Agronomist',
    time: '1d ago',
    createdAt: '2026-10-15T15:20:00Z',
    operator: 'James Donovan',
    assignedAgronomist: 'Dr. Sarah Chen',
    summary: 'Stripe rust or physiological flecking on flag leaf. Requires microscope confirmation.',
    observations: [{ description: 'Pustule stripe pattern unclear', confidence: 54, uncertainty: 'High' }],
    soil: { nitrogen: { value: '22 ppm', status: 'Optimal', citation: '' }, ph: { value: '6.1', status: 'Optimal', citation: '' }, pk: { value: 'Good', status: 'Adequate', citation: '' } },
    weather: { tempMaxC: 22, tempMinC: 11, rainfall7dMm: 18, humidity: 75, windKmh: 22, uvIndex: 5, rainfallStatus: 'Optimal', tempStatus: 'Optimal', soilMoistureProxy: { uncertainty: 'Medium', note: 'Adequate' } },
    recommendations: [],
    risks: { missingData: [], unsafeFlags: [], environmental: { nitrateLeaching: { level: 'Low', note: 'N/A' }, bufferZone: { level: 'Good', note: 'Safe' }, carbonFootprint: { level: 'Low', note: 'Minimal' }, pollinatorImpact: { level: 'Low', note: 'Safe' } } },
  },
  {
    id: 'c-2844',
    caseNumber: 'C-2844',
    farmId: 'maplegrove',
    farmName: 'Maple Grove',
    fieldName: 'Ridge Top 45',
    crop: 'Cotton',
    issue: 'Bollworm & high-risk chemical flagged',
    growthStage: 'Flowering',
    confidence: 79,
    uncertainty: 'Medium',
    status: 'Flagged',
    time: '1d ago',
    createdAt: '2026-10-15T09:40:00Z',
    operator: 'Marcus Vance',
    assignedAgronomist: 'Dr. Sarah Chen',
    summary: 'High-risk pyrethroid chemical requested near waterway. Blocked by AI safety guardrail.',
    observations: [{ description: 'Boll boring damage on 8% of squares', confidence: 79, uncertainty: 'Medium' }],
    soil: { nitrogen: { value: 'Standard', status: 'Optimal', citation: '' }, ph: { value: '6.5', status: 'Optimal', citation: '' }, pk: { value: 'Normal', status: 'Adequate', citation: '' } },
    weather: { tempMaxC: 34, tempMinC: 22, rainfall7dMm: 2, humidity: 45, windKmh: 16, uvIndex: 9, rainfallStatus: 'Below Average', tempStatus: 'Stress', soilMoistureProxy: { uncertainty: 'Medium', note: 'Dry' } },
    recommendations: [],
    risks: { missingData: [], unsafeFlags: [], environmental: { nitrateLeaching: { level: 'Low', note: 'Dry' }, bufferZone: { level: 'Warning', note: 'Within 30ft of drainage' }, carbonFootprint: { level: 'Low', note: 'Standard' }, pollinatorImpact: { level: 'High', note: 'Direct toxicity risk to honeybees' } } },
  },
];

export interface ModelComparisonItem {
  id: string;
  name: string;
  provider: string;
  capabilityScore: number;
  costPer1kTokens: string;
  costNumeric: number;
  avgLatency: string;
  latencySec: number;
  contextWindow: string;
  multimodal: boolean;
  privacyModel: string;
  integration: string;
  outputQuality: number;
  agriAdvisorScore: number;
}

export const mockModels: ModelComparisonItem[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    capabilityScore: 90,
    costPer1kTokens: '$0.005',
    costNumeric: 0.005,
    avgLatency: '1.8s',
    latencySec: 1.8,
    contextWindow: '128K',
    multimodal: true,
    privacyModel: 'Cloud (opt-out)',
    integration: 'REST API',
    outputQuality: 88,
    agriAdvisorScore: 84,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    capabilityScore: 95,
    costPer1kTokens: '$0.003',
    costNumeric: 0.003,
    avgLatency: '2.1s',
    latencySec: 2.1,
    contextWindow: '200K',
    multimodal: true,
    privacyModel: 'Cloud (no training)',
    integration: 'REST API',
    outputQuality: 91,
    agriAdvisorScore: 87, // Highest score -> Top Pick badge follows this dynamically!
  },
  {
    id: 'gemini-1-5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    capabilityScore: 93,
    costPer1kTokens: '$0.0035',
    costNumeric: 0.0035,
    avgLatency: '2.5s',
    latencySec: 2.5,
    contextWindow: '1M',
    multimodal: true,
    privacyModel: 'Cloud',
    integration: 'REST + SDK',
    outputQuality: 91,
    agriAdvisorScore: 81,
  },
  {
    id: 'llama-3-1-70b',
    name: 'Llama 3.1 70B',
    provider: 'Meta (self-hosted)',
    capabilityScore: 82,
    costPer1kTokens: '~$0.0008',
    costNumeric: 0.0008,
    avgLatency: '3.4s',
    latencySec: 3.4,
    contextWindow: '128K',
    multimodal: false,
    privacyModel: 'On-premise',
    integration: 'vLLM / Ollama',
    outputQuality: 79,
    agriAdvisorScore: 72,
  },
];

export interface PromptTemplate {
  id: string;
  category: 'Image Analysis' | 'Recommendation' | 'Safety Check' | 'Environmental';
  title: string;
  subtitle: string;
  template: string;
  variables: string[];
  mockOutput: {
    observations: string[];
    confidence_scores: Record<string, number>;
    uncertainty_level: 'Low' | 'Medium' | 'High';
    image_quality_notes: string;
  };
}

export const mockPrompts: PromptTemplate[] = [
  {
    id: 'p-1',
    category: 'Image Analysis',
    title: 'Image Analysis Template',
    subtitle: 'Crop image observation prompt — instructs model to report only visible evidence.',
    template: `You are an agricultural image analysis assistant. Analyze the provided crop image and report ONLY what is visually observable.

Instructions:
- Describe visible symptoms, discoloration, lesions, or structural abnormalities
- Use uncertainty language ("appears to", "may indicate", "possibly") when evidence is ambiguous
- Do NOT infer soil conditions, nutrient levels, or lab results from imagery
- Rate your confidence (0-100%) for each observation
- If image quality limits observation, state this explicitly

Crop context: {{crop_type}} at {{growth_stage}}
Field ID: {{field_id}}

Respond in structured JSON with fields: observations[], confidence_scores{}, uncertainty_level (High/Medium/Low), image_quality_notes.`,
    variables: ['{{crop_type}}', '{{growth_stage}}', '{{field_id}}'],
    mockOutput: {
      observations: [
        'Interveinal chlorosis visible on lower leaves (older growth)',
        'Yellowing pattern consistent with mobile nutrient deficit (N or S)',
        'Canopy architecture intact without structural wilting',
      ],
      confidence_scores: {
        chlorosis_detected: 78,
        no_leaf_spot: 91,
        canopy_density: 82,
      },
      uncertainty_level: 'Medium',
      image_quality_notes: 'Good natural lighting, minor specular reflection on midrib. Resolution sufficient for macro inspection.',
    },
  },
  {
    id: 'p-2',
    category: 'Recommendation',
    title: 'Agronomic Recommendation Prompt',
    subtitle: 'Synthesizes observations, soil tests, and weather into tiered candidate actions.',
    template: `Synthesize field observations, soil nitrate levels, and upcoming 7-day weather to provide 3 prioritized actions for the agronomist.

Constraints:
- Always separate diagnostic recommendations from chemical interventions
- Include assumptions and explicit confidence score
- Adhere to extension fertilizer timing thresholds

Field context: {{crop_type}}, Soil N: {{soil_n}}, 7d Rain: {{rain_forecast}}`,
    variables: ['{{crop_type}}', '{{soil_n}}', '{{rain_forecast}}'],
    mockOutput: {
      observations: ['Prioritize leaf tissue sampling', 'Foliar urea 20 lb/ac if confirmed', 'Delay irrigation 24h if rain >0.5in'],
      confidence_scores: { recommendation_applicability: 84 },
      uncertainty_level: 'Low',
      image_quality_notes: 'Synthesized with ISU Extension PM-1688 ruleset.',
    },
  },
  {
    id: 'p-3',
    category: 'Safety Check',
    title: 'Chemical & Environmental Safety Guardrail',
    subtitle: 'Cross-checks recommendations against EPA labels, pollinator buffers, and drift hazards.',
    template: `Verify proposed chemical inputs against safety guardrail rules:
1. EPA buffer zone compliance
2. Temperature inversion or high-heat volatilization (>85°F)
3. Mandatory agronomist sign-off for Restricted Use Pesticides (RUP)`,
    variables: ['{{chemical_name}}', '{{target_rate}}', '{{ambient_temp}}'],
    mockOutput: {
      observations: ['UAN 28% foliar spray requires agronomist validation', 'Ambient temperature below 85F threshold', '50ft buffer zone verified'],
      confidence_scores: { safety_compliance: 94 },
      uncertainty_level: 'Low',
      image_quality_notes: 'All environmental safety barriers evaluated successfully.',
    },
  },
  {
    id: 'p-4',
    category: 'Environmental',
    title: 'Nitrate Leaching & Soil Health Assessment',
    subtitle: 'Estimates leaching risk based on soil texture class, precipitation, and application timing.',
    template: `Evaluate nitrate leaching index given soil series and hydrologic group.
Inputs: {{soil_type}}, {{drainage_class}}, {{application_form}}`,
    variables: ['{{soil_type}}', '{{drainage_class}}', '{{application_form}}'],
    mockOutput: {
      observations: ['Sandy loam subsoil presents moderate leaching potential', 'Split application advised'],
      confidence_scores: { environmental_risk_calibrated: 88 },
      uncertainty_level: 'Low',
      image_quality_notes: 'Hydrologic group B modeling verified.',
    },
  },
];

export interface EvaluationData {
  imageAccuracy: number;
  groundedness: number;
  uncertaintyCalibration: number;
  safetyScore: number;
  environmentalAwareness: number;
  formatClarity: number;
  radarMetrics: { subject: string; value: number; benchmark: number }[];
  trends: { month: string; accuracy: number; groundedness: number; safety: number }[];
  failureCases: {
    id: string;
    caseId: string;
    crop: string;
    model: string;
    rootCause: string;
    date: string;
    severity: 'High' | 'Medium' | 'Low';
    resolution: string;
  }[];
}

export const mockEvaluation: EvaluationData = {
  imageAccuracy: 82,
  groundedness: 78,
  uncertaintyCalibration: 85,
  safetyScore: 94,
  environmentalAwareness: 71,
  formatClarity: 88,
  radarMetrics: [
    { subject: 'Image Accuracy', value: 82, benchmark: 75 },
    { subject: 'Groundedness', value: 78, benchmark: 70 },
    { subject: 'Uncertainty Cal.', value: 85, benchmark: 80 },
    { subject: 'Safety', value: 94, benchmark: 90 },
    { subject: 'Environmental', value: 71, benchmark: 65 },
    { subject: 'Format Clarity', value: 88, benchmark: 82 },
  ],
  trends: [
    { month: 'Apr', accuracy: 74, groundedness: 71, safety: 88 },
    { month: 'May', accuracy: 76, groundedness: 73, safety: 90 },
    { month: 'Jun', accuracy: 78, groundedness: 75, safety: 91 },
    { month: 'Jul', accuracy: 79, groundedness: 76, safety: 92 },
    { month: 'Aug', accuracy: 81, groundedness: 77, safety: 93 },
    { month: 'Sep', accuracy: 82, groundedness: 78, safety: 94 },
  ],
  failureCases: [
    {
      id: 'fc-1',
      caseId: 'C-2845',
      crop: 'Wheat',
      model: 'GPT-4o',
      rootCause: 'Hallucinated fungal pustules on flag leaf without microscopic evidence',
      date: '2026-10-15',
      severity: 'High',
      resolution: 'Prompt guardrail updated to require explicit lesion texture before fungal diagnosis',
    },
    {
      id: 'fc-2',
      caseId: 'C-2831',
      crop: 'Corn',
      model: 'Llama 3.1 70B',
      rootCause: 'Recommended broadcast nitrogen at 32°C (violates volatilization rule)',
      date: '2026-10-12',
      severity: 'High',
      resolution: 'Strict temperature check filter injected into pre-output validator',
    },
    {
      id: 'fc-3',
      caseId: 'C-2819',
      crop: 'Soybean',
      model: 'Claude 3.5 Sonnet',
      rootCause: 'Low confidence interval reported as High due to ambiguous inverted threshold',
      date: '2026-10-08',
      severity: 'Medium',
      resolution: 'Fixed in v2.4 confidence standardization schema',
    },
  ],
};

export interface RagItem {
  id: string;
  title: string;
  type: 'Extension Guide' | 'Decision Tool' | 'Research Report' | 'Fact Sheet';
  authors: string;
  source: string;
  relevance: number;
  snippet: string;
}

export const mockRagData = {
  stats: {
    documentsIndexed: 2847,
    lastRefresh: '6h ago',
    avgRetrievalMs: 340,
    indexCoverage: '94%',
  },
  documents: [
    {
      id: 'rag-1',
      title: 'Nitrogen Deficiency Diagnosis in Corn',
      type: 'Extension Guide' as const,
      authors: '2024 Mallarino, A.P., Sawyer, J.E.',
      source: 'Iowa State University Extension PM-1688',
      relevance: 92,
      snippet: 'Nitrogen deficiency in corn typically appears as a V-shaped yellowing beginning at the leaf tip and progressing down the midrib. Lower leaves are affected first as the plant remobilizes N from older tissue. Interveinal chlorosis is less common for N — consider sulfur if this pattern predominates.',
    },
    {
      id: 'rag-2',
      title: 'Corn Nitrogen Rate Calculator — Corn-Soybean Rotation',
      type: 'Decision Tool' as const,
      authors: '2025 Iowa State University / University of Illinois',
      source: 'ISU Agronomy Extension Corn Nitrogen Rate Calculator',
      relevance: 87,
      snippet: 'For corn following soybean on silty clay loam soils with 14 ppm spring nitrate, supplemental nitrogen applied between V6 and V8 stages yields optimal economic return with minimal residual nitrate leaching.',
    },
    {
      id: 'rag-3',
      title: 'In-Season Nitrogen Management for Irrigated Corn',
      type: 'Research Report' as const,
      authors: '2023 Scharf, P.C., Ferguson, R.B.',
      source: 'University of Nebraska-Lincoln Extension - G1872',
      relevance: 81,
      snippet: 'Foliar application of low-biuret urea solutions at 15-20 lb N/ac can provide emergency rescue when root uptake is impaired by early season dry topsoil, pending sensor confirmation.',
    },
    {
      id: 'rag-4',
      title: 'Distinguishing Nitrogen and Sulfur Deficiency in Corn',
      type: 'Fact Sheet' as const,
      authors: '2022 Sexton, P.A., Roberts, T.L.',
      source: 'International Plant Nutrition Institute (IPNI) Ref #14',
      relevance: 89,
      snippet: 'While nitrogen is mobile in the plant and symptoms start on lower leaves, sulfur is immobile and symptoms appear first on younger upper leaves. In cold wet soils, transient sulfur deficiency can mimic nitrogen chlorosis.',
    },
  ],
};

export const mockNotifications = [
  {
    id: 'notif-1',
    type: 'critical' as const,
    title: 'High-risk chemical flagged in Case C-2844',
    message: 'Expert review required. Unsafe pyrethroid proposed near watershed.',
    time: '1h ago',
    read: false,
    caseId: 'c-2844',
  },
  {
    id: 'notif-2',
    type: 'warning' as const,
    title: 'Model confidence below threshold on 3 recent wheat cases',
    message: 'Average confidence 54% triggered human review queue.',
    time: '3h ago',
    read: false,
    caseId: 'c-2845',
  },
  {
    id: 'notif-3',
    type: 'info' as const,
    title: 'New agronomy RAG index refreshed',
    message: '2,847 documents indexed from ISU, UNL, and Purdue extensions.',
    time: '6h ago',
    read: true,
  },
  {
    id: 'notif-4',
    type: 'success' as const,
    title: 'Agronomist Dr. Chen approved 12 cases this week',
    message: 'All recommendations successfully routed to farm managers.',
    time: '1d ago',
    read: true,
  },
];

export const mockGuardrails = [
  {
    id: 'g-1',
    ruleName: 'Human Safety First & RUP Verification',
    category: 'Chemical Safety',
    description: 'Requires mandatory agronomist sign-off for any chemical on the EPA Restricted Use list.',
    status: 'Enforced',
    triggerCount: 14,
    enabled: true,
  },
  {
    id: 'g-2',
    ruleName: 'High-Temperature Volatilization Cutoff',
    category: 'Environmental',
    description: 'Blocks foliar urea or ammonium application if forecasted temperature exceeds 85°F (29.4°C).',
    status: 'Enforced',
    triggerCount: 8,
    enabled: true,
  },
  {
    id: 'g-3',
    ruleName: 'Surface Water 50ft Buffer Zone',
    category: 'Environmental',
    description: 'Enforces minimum 50ft setback from classified streams and water bodies for nitrogen/herbicide sprays.',
    status: 'Enforced',
    triggerCount: 3,
    enabled: true,
  },
  {
    id: 'g-4',
    ruleName: 'Confidence Auto-Escalation Threshold',
    category: 'Decision Quality',
    description: 'Automatically routes cases with diagnosis confidence < 80% to agronomist review queue.',
    status: 'Enforced',
    triggerCount: 22,
    enabled: true,
  },
  {
    id: 'g-5',
    ruleName: 'Zero Data Training on Private Farm Data',
    category: 'Privacy',
    description: 'Ensures zero farmer imagery or lab reports are forwarded to external LLM provider training queues.',
    status: 'Enforced',
    triggerCount: 108,
    enabled: true,
  },
];

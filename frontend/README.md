# AgriAdvisor AI — Frontend (Smart Agriculture Advisor)

A state-of-the-art decision-support web application for farmers, agronomists, and agricultural administrators. Built to match the AgriAdvisor AI design system with unified confidence scoring, multi-language localization, PWA offline draft synchronization, and role-based access control.

---

## Tech Stack
- **Framework & Language**: React 19 + Vite 8 + TypeScript
- **Styling**: Tailwind CSS (custom agri emerald palette + light/dark mode)
- **Charts**: Recharts (Case Volume, Confidence Trends, Quality Radar)
- **Routing & State**: React Router v7 + Zustand
- **Forms & Validation**: React Hook Form + Zod
- **Internationalization**: i18next + React-i18next (English, Hindi, Kannada)
- **PWA & Offline**: Vite Plugin PWA + Workbox service worker + Local queue
- **Authentication**: Firebase Web SDK + Mock authentication fallback

---

## Setup & Running Locally

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default `.env` configuration runs with `VITE_USE_MOCKS=true`, providing realistic agronomic mock data (Westfield Farm, Case C-2848, Dr. Sarah Chen, ISU Extension guidelines) without needing a live backend:

```env
VITE_USE_MOCKS=true
VITE_API_URL=https://api.agriadvisor.ai/v1
VITE_FIREBASE_API_KEY=mock-api-key
VITE_FIREBASE_AUTH_DOMAIN=agriadvisor-ai.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=agriadvisor-ai
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
```

---

## Features & Fixes Implemented vs PDF

1. **Corn Leaf Visual Placeholder**: Replaced placeholder paddy/tractor photo with a custom annotated corn leaf graphic with interveinal chlorosis patterns and diagnostic overlay bounding boxes.
2. **Dynamic Top Pick Model Badge**: Automatically tracks and highlights the model with the highest AgriAdvisor score (Claude 3.5 Sonnet at 87).
3. **Unified Confidence Definition**: Standardized single `%` score everywhere with exact band definitions:
   - **Low Uncertainty**: $\ge 80\%$
   - **Medium Uncertainty**: $60\% - 79\%$
   - **High Uncertainty**: $< 60\%$
   Defined in `src/lib/confidence.ts` and reused across all cards and tables.
4. **Sorted Recommendations & Irrigation Context**: Recommendations sorted by descending confidence; irrigation advice includes the conditional "Why" line when soil moisture uncertainty is high.
5. **Metric / Imperial Unit Toggle**: Instant conversion in Settings between Imperial (`lb/ac`, `gal/ac`, `acres`, `°F`, `in`) and Metric (`kg/ha`, `L/ha`, `ha`, `°C`, `mm`) via `src/lib/units.ts`.
6. **Multi-Role RBAC**: `farmer`, `agronomist`, and `admin` roles with route guards (`RoleGuard`) and role-specific sidebar navigation. Includes quick role switching in the user menu.
7. **i18n Translation**: English, Hindi (हिंदी), and Kannada (ಕನ್ನಡ) language switcher in the Top Bar and Settings.
8. **Audio Guidance Playback**: Step 6 report includes a "Listen" button with interactive audio wave animation and speech synthesis fallback.
9. **Real-time Notifications**: Notification bell polls every 30s with unread counts and links directly to flagged cases.
10. **PWA Offline Mode**: Automatic service worker shell caching and an offline draft queue (`offlineQueue.ts`) for case creation in fields without connectivity.

---

## Pages
- **Dashboard**: Weekly case volume, confidence trends, live alerts, recent cases.
- **New Case (6-step Wizard)**:
  1. *Collect*: Corn leaf imagery, soil report PDF, weather snapshot, farm profile.
  2. *Analyze*: Visual image analysis, soil interpretation, weather interpretation.
  3. *Recommend*: Sorted recommendations with confidence bars and "Why" notes.
  4. *Risk Check*: Missing data, chemical unsafe flags, environmental notes.
  5. *Human Review*: Expert review panel with Dr. Sarah Chen approval actions.
  6. *Explain*: Farmer guidance report, audio playback, PDF export.
- **Model Comparison**: Matrix comparing capability, latency, context window, output quality, and AgriAdvisor scores.
- **Prompt Lab**: Category prompt editor with variables and interactive model output preview.
- **Evaluation**: Quality radar chart, 6-month trends, and failure cases table.
- **Responsible AI**: Safety policies, chemical caution, privacy sovereignty, explainability.
- **RAG Explorer**: Semantic search over university agronomic extension documents.
- **Settings**: Farm profile, field management, model thresholds, unit toggle, data export.
- **Case History**: Searchable, filterable archive of all cases with JSON export.
- **Case Detail**: Deep-dive inspection into specific case reports.
- **Agronomist Review Queue**: Specialized queue for agronomists to approve or edit pending cases.
- **Outcome Feedback**: Ground-truth harvest and yield validation to close the AI feedback loop.
- **Guardrail Rules (Admin)**: Safety barrier rule management and active enforcement toggles.
- **Notifications**: Polled notification management with case redirection.
- **Login / Sign-up**: Role-based authentication with quick-access test profiles.

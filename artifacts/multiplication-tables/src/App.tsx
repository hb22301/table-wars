import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Clock3, Flag, Gauge, LogOut, MessageCircle, Moon, RotateCcw, ShieldCheck, Sparkles, Sun, Target, Trash2, Trophy, X, Zap } from 'lucide-react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useDeleteCreatorFeedback, useListAllTimeLeaderboard, useListCreatorFeedback, useListLeaderboard, useSubmitFeedback, useSubmitLeaderboardEntry, type LeaderboardEntry as ApiLeaderboardEntry } from '@workspace/api-client-react';
import { APP_VERSION, PUBLISH_AT, PUBLISH_DATE } from './app-meta';
import { trackEvent } from './analytics';
import { applyRouteMetadata } from './route-meta';

type Difficulty = 1 | 2 | 3;
type EditableNumber = number | '';
type QuestionStatus = 'pending' | 'correct' | 'wrong' | 'timeout';
type GameSettings = {
  difficulty: Difficulty;
  sessionDurationMinutes: number;
  secondsPerQuestion: number;
  pointsCorrect: number;
  pointsTimeout: number;
  pointsWrong: number;
  tableFrom: EditableNumber;
  tableTo: EditableNumber;
};
type NormalizedGameSettings = Omit<GameSettings, 'tableFrom' | 'tableTo'> & {
  tableFrom: number;
  tableTo: number;
};
type LeaderboardEntry = ApiLeaderboardEntry;
type GameQuestion = {
  multiplicand: number;
  multiplier: number;
  answer: number;
  status: QuestionStatus;
  response: number | null;
};
type GameSession = {
  playerName: string;
  settings: NormalizedGameSettings;
  questions: GameQuestion[];
  sessionSecondsLeft: number;
  currentIndex: number;
  score: number;
  streak: number;
  maxStreak: number;
  correctCount: number;
  wrongCount: number;
  timeoutCount: number;
  startedAt: string;
};

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const publishLabel = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(PUBLISH_AT));
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#566b2f',
    colorForeground: '#fff9ee',
    colorMutedForeground: '#cfc3d2',
    colorDanger: '#ff9ca4',
    colorBackground: '#292331',
    colorInput: '#332b3e',
    colorInputForeground: '#fff9ee',
    colorNeutral: '#4b4056',
    fontFamily: 'Bricolage Grotesque',
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#292331] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#fff9ee]',
    headerSubtitle: 'text-[#cfc3d2]',
    socialButtonsBlockButtonText: 'text-[#fff9ee]',
    formFieldLabel: 'hidden',
    footerActionLink: 'hidden',
    footerActionText: 'text-[#cfc3d2]',
    dividerText: 'text-[#cfc3d2]',
    formButtonPrimary: 'hidden',
    formFieldInput: 'hidden',
    logoBox: 'bg-[#566b2f]',
    logoImage: 'rounded-xl',
    socialButtonsBlockButton: 'bg-[#332b3e] border-[#4b4056]',
    footerAction: 'hidden',
    dividerLine: 'bg-[#4b4056]',
    alert: 'bg-[#4a2935] border-[#ff9ca4]',
    alertText: 'text-[#ff9ca4]',
    otpCodeFieldInput: 'bg-[#332b3e] text-[#fff9ee] border-[#4b4056]',
    formFieldRow: 'hidden',
    dividerRow: 'hidden',
    main: 'bg-transparent',
  },
};
const SETTINGS_KEY = 'multiplication-tables-settings';
const SESSION_KEY = 'multiplication-tables-session';
const THEME_KEY = 'multiplication-tables-theme';
const CREATOR_EMAIL = 'shakirhusain@gmail.com';
const QUESTION_COUNT = 720;
const LEADERBOARD_MIN_ACCURACY = 70;
const FACTOR_WEIGHTS = [
  { factor: 2, weight: 1 },
  { factor: 3, weight: 1 },
  { factor: 4, weight: 1 },
  { factor: 5, weight: 1 },
  { factor: 6, weight: 2 },
  { factor: 7, weight: 2 },
  { factor: 8, weight: 2 },
  { factor: 9, weight: 2 },
  { factor: 11, weight: 3 },
  { factor: 12, weight: 3 },
];
const defaultSettings: GameSettings = {
  difficulty: 1,
  sessionDurationMinutes: 3,
  secondsPerQuestion: 7,
  pointsCorrect: 3,
  pointsTimeout: -1,
  pointsWrong: -2,
  tableFrom: 2,
  tableTo: 12,
};
const presets: Record<Difficulty, Pick<GameSettings, 'secondsPerQuestion' | 'pointsCorrect' | 'pointsTimeout' | 'pointsWrong'>> = {
  1: { secondsPerQuestion: 7, pointsCorrect: 3, pointsTimeout: -1, pointsWrong: -2 },
  2: { secondsPerQuestion: 5, pointsCorrect: 4, pointsTimeout: -1, pointsWrong: -2 },
  3: { secondsPerQuestion: 3, pointsCorrect: 5, pointsTimeout: -1, pointsWrong: -2 },
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

type ThemeContextValue = {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used within ThemeProvider');
  return theme;
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(() => readStorage<boolean>(THEME_KEY, true));
  const toggleDarkMode = () => {
    setIsDarkMode((current) => {
      const next = !current;
      trackEvent('theme_changed', { theme: next ? 'dark' : 'light' });
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
    writeStorage(THEME_KEY, isDarkMode);
  }, [isDarkMode]);

  return <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>{children}</ThemeContext.Provider>;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatPlayedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function pickFactor() {
  const totalWeight = FACTOR_WEIGHTS.reduce((total, item) => total + item.weight, 0);
  let cursor = Math.random() * totalWeight;
  for (const item of FACTOR_WEIGHTS) {
    cursor -= item.weight;
    if (cursor < 0) return item.factor;
  }
  return FACTOR_WEIGHTS[FACTOR_WEIGHTS.length - 1].factor;
}

function createQuestions(settings: NormalizedGameSettings): GameQuestion[] {
  const result: GameQuestion[] = [];
  let previous = '';
  for (let index = 0; index < QUESTION_COUNT; index += 1) {
    let multiplicand = Math.floor(Math.random() * (settings.tableTo - settings.tableFrom + 1)) + settings.tableFrom;
    let multiplier = pickFactor();
    let key = `${multiplicand}-${multiplier}`;
    let attempts = 0;
    while (key === previous && attempts < 12) {
      multiplicand = Math.floor(Math.random() * (settings.tableTo - settings.tableFrom + 1)) + settings.tableFrom;
      multiplier = pickFactor();
      key = `${multiplicand}-${multiplier}`;
      attempts += 1;
    }
    previous = key;
    result.push({ multiplicand, multiplier, answer: multiplicand * multiplier, status: 'pending', response: null });
  }
  return result;
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3" data-testid="link-home-logo">
      <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-[#566b2f] shadow-[4px_4px_0_#30283d]">
        <span className="absolute h-[5px] w-7 rotate-45 rounded-full bg-[#fff8ea]" />
        <span className="absolute h-[5px] w-7 -rotate-45 rounded-full bg-[#fff8ea]" />
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#ffd66b]" />
      </span>
      {!compact && <span className="text-[17px] font-bold tracking-[-.04em]">Multiplication<br />Tables</span>}
    </Link>
  );
}

function Shell({ children, showBack = false }: { children: ReactNode; showBack?: boolean }) {
  const [, setLocation] = useLocation();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { signOut } = useClerk();
  const { user } = useUser();
  const isCreator = user?.emailAddresses.some(({ emailAddress }) => emailAddress.toLowerCase() === CREATOR_EMAIL) ?? false;
  return (
    <div className="noise board-bg min-h-[100dvh] overflow-hidden">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <Logo />
        <div className="flex items-center gap-2">
          {showBack ? (
            <button className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-[#655b72] transition hover:bg-[#fffaf0] hover:text-[#30283d]" onClick={() => setLocation('/')} data-testid="button-back-home">
              <ArrowLeft size={16} /> Exit session
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.15em] text-[#8b8093]">
              <span className="hidden sm:inline">Practice makes progress</span>
              <Sparkles size={16} className="text-[#566b2f]" />
            </div>
          )}
          <Show when="signed-out">
            <Link href="/sign-in" className="hidden rounded-full px-2.5 py-2 text-xs font-bold text-[#817583] transition hover:bg-[#fffaf0] hover:text-[#566b2f] sm:inline-flex" data-testid="link-creator-sign-in">
              Creator sign in
            </Link>
          </Show>
          <Show when="signed-in">
            {isCreator && <Link href="/creator" className="hidden items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-bold text-[#817583] transition hover:bg-[#fffaf0] hover:text-[#566b2f] sm:inline-flex" data-testid="link-creator-tools">
              <ShieldCheck size={14} /> Creator tools
            </Link>}
            <button type="button" className="hidden items-center gap-1 rounded-full px-2.5 py-2 text-xs font-bold text-[#817583] transition hover:bg-[#fffaf0] hover:text-[#566b2f] sm:inline-flex" onClick={() => void signOut({ redirectUrl: basePath || '/' })} data-testid="button-creator-sign-out">
              <LogOut size={14} /> Sign out
            </button>
          </Show>
          <button className="flex items-center gap-2 rounded-full border-2 border-[#e4d9d3] bg-[#fffdf9]/80 px-3 py-2 text-sm font-semibold text-[#655b72] transition hover:border-[#8da253] hover:bg-[#fffaf0] hover:text-[#30283d]" onClick={toggleDarkMode} aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'} title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'} data-testid="button-theme-toggle">
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            <span className="hidden sm:inline">{isDarkMode ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>
      </header>
      {children}
      <footer className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-3 gap-y-1 px-4 pb-4 pt-5 text-xs font-medium text-[#968b99] sm:px-6">
        <span>A small daily win adds up.</span>
        <span aria-label={`Application version ${APP_VERSION}, published ${publishLabel} in local time`} data-testid="text-app-version">
          {APP_VERSION} · Published {publishLabel}
        </span>
      </footer>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between text-[13px] font-bold text-[#4f455b]">
        {label}
        {hint && <span className="font-mono text-[10px] font-normal uppercase tracking-[.1em] text-[#9d91a0]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, min, max, suffix, testId, disabled = false }: { value: EditableNumber; onChange: (value: EditableNumber) => void; min?: number; max?: number; suffix?: string; testId: string; disabled?: boolean }) {
  return (
    <div className="relative">
      <input className="h-10 w-full rounded-xl border-2 border-[#e1d8d4] bg-[#fffdf9] px-3 font-mono text-sm font-medium text-[#30283d] outline-none transition focus:border-[#566b2f] focus:ring-4 focus:ring-[#566b2f]/10 disabled:cursor-not-allowed disabled:bg-[#f4eee9] disabled:text-[#988d95]" type="number" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} disabled={disabled} data-testid={testId} />
      {suffix && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#918591]">{suffix}</span>}
    </div>
  );
}

function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (value: Difficulty) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {([1, 2, 3] as Difficulty[]).map((level) => (
        <button key={level} onClick={() => onChange(level)} className={`relative rounded-xl border-2 px-2 py-2 text-left transition ${value === level ? 'border-[#566b2f] bg-[#566b2f] text-[#fff9ee] shadow-[3px_3px_0_#30283d]' : 'border-[#e1d8d4] bg-[#fffdf9] text-[#584d62] hover:-translate-y-0.5 hover:border-[#8da253]'}`} data-testid={`button-difficulty-${level}`}>
          <span className="block font-mono text-[10px] uppercase tracking-[.12em] opacity-75">Level</span>
          <span className="mt-0.5 block text-lg font-bold">{level}</span>
          {value === level && <Check size={14} className="absolute right-2 top-2" />}
        </button>
      ))}
    </div>
  );
}

function Leaderboard({ entries, isLoading = false, isError = false, eyebrow = 'Hall of focus', title = 'Leaderboard', description = 'Shared across all players', emptyMessage = 'Your first run gets the top spot. Set a range and make it yours.', testIdPrefix = 'leaderboard' }: { entries: LeaderboardEntry[]; isLoading?: boolean; isError?: boolean; eyebrow?: string; title?: string; description?: string; emptyMessage?: string; testIdPrefix?: string }) {
  const sorted = useMemo(() => [...entries].sort((a, b) => b.score - a.score || new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime() || b.accuracy - a.accuracy).slice(0, 5), [entries]);
  return (
    <section className="rise-in delay-2 rounded-[22px] border-2 border-[#e4d9d3] bg-[#fffdf9]/85 p-4 shadow-[5px_5px_0_rgba(48,40,61,.08)] sm:p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[#566b2f]">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-bold tracking-[-.05em]">{title}</h2>
            <p className="mt-1 text-xs font-medium text-[#968b99]">{description}</p>
        </div>
        <Trophy size={22} className="text-[#dcae20]" />
      </div>
      {isLoading ? (
        <div className="rounded-xl bg-[#faf4ed] px-4 py-5 text-sm font-medium leading-relaxed text-[#74636b]" data-testid={`loading-${testIdPrefix}`}>
          Loading shared scores…
        </div>
      ) : isError ? (
        <div className="rounded-xl bg-[#ffe3df] px-4 py-5 text-sm font-medium leading-relaxed text-[#a44c53]" data-testid={`error-${testIdPrefix}`}>
          The shared leaderboard is unavailable right now. Try again shortly.
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl bg-[#fff5d8] px-4 py-5 text-sm font-medium leading-relaxed text-[#74636b]" data-testid={`empty-${testIdPrefix}`}>
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((entry, index) => (
            <div className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${index === 0 ? 'bg-[#fff1c8]' : 'bg-[#faf4ed]'}`} key={entry.id} data-testid={`row-${testIdPrefix}-${entry.id}`}>
              <span className={`grid h-7 w-7 place-items-center rounded-full font-mono text-[11px] font-medium ${index === 0 ? 'bg-[#f5c844] text-[#4d3c1a]' : 'bg-[#e9ded7] text-[#756873]'}`}>{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{entry.playerName}</span>
                 <span className="block font-mono text-[10px] uppercase tracking-[.08em] text-[#968a91]">Tables {entry.tableFrom}–{entry.tableTo} · {entry.accuracy}%</span>
                 <span className="mt-1 block text-[10px] font-semibold text-[#a2979d]">{formatPlayedAt(entry.playedAt)}</span>
              </span>
              <span className="font-mono text-sm font-medium text-[#566b2f]">{entry.score > 0 ? '+' : ''}{entry.score}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FeedbackForm() {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { mutateAsync: submitFeedback, isPending } = useSubmitFeedback();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setFormError('Write a message before sending feedback.');
      return;
    }
    setFormError('');
    try {
      await submitFeedback({ data: { message: trimmedMessage, ...(name.trim() ? { name: name.trim() } : {}) } });
      setName('');
      setMessage('');
      setSubmitted(true);
    } catch {
      setFormError('Feedback could not be sent right now. Please try again.');
    }
  };

  return (
    <section className="rise-in rounded-[22px] border-2 border-[#e4d9d3] bg-[#fffdf9]/85 p-4 shadow-[5px_5px_0_rgba(48,40,61,.08)] sm:p-5" data-testid="section-feedback-form">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff1c8] text-[#806116]"><MessageCircle size={19} /></span>
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[#566b2f]">Have a thought?</p>
          <h2 className="mt-1 text-xl font-bold tracking-[-.05em]">Feedback for the creator</h2>
          <p className="mt-1 text-xs font-medium leading-relaxed text-[#968b99]">Tell us what would make practice better. Only the creator can see these messages.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input className="h-10 w-full rounded-xl border-2 border-[#e1d8d4] bg-[#fffdf9] px-3 text-sm font-medium text-[#30283d] outline-none transition placeholder:text-[#b2a5ab] focus:border-[#566b2f] focus:ring-4 focus:ring-[#566b2f]/10" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name (optional)" maxLength={80} data-testid="input-feedback-name" />
        <textarea className="min-h-24 w-full resize-y rounded-xl border-2 border-[#e1d8d4] bg-[#fffdf9] px-3 py-2.5 text-sm font-medium text-[#30283d] outline-none transition placeholder:text-[#b2a5ab] focus:border-[#566b2f] focus:ring-4 focus:ring-[#566b2f]/10" value={message} onChange={(event) => { setMessage(event.target.value); setFormError(''); setSubmitted(false); }} placeholder="What should we keep, change, or add?" maxLength={2000} data-testid="input-feedback-message" />
        {formError && <p className="text-xs font-semibold text-[#c34151]" data-testid="text-feedback-error">{formError}</p>}
        {submitted && <p className="text-xs font-semibold text-[#267452]" data-testid="text-feedback-success">Thanks — your feedback was sent to the creator.</p>}
        <button className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#30283d] px-4 text-sm font-bold text-[#fff9ee] transition hover:bg-[#453952] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={isPending} data-testid="button-submit-feedback">{isPending ? 'Sending…' : 'Send feedback'} <ArrowRight size={16} /></button>
      </form>
    </section>
  );
}

function TableReference() {
  const [, setLocation] = useLocation();
  const [selectedNumber, setSelectedNumber] = useState(2);
  const chooseNumber = (value: number) => {
    if (!Number.isFinite(value)) return;
    const nextNumber = Math.max(2, Math.min(20, Math.round(value)));
    setSelectedNumber(nextNumber);
    trackEvent('study_table_selected', { table: nextNumber, source: 'number_input' });
  };

  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 pb-3 pt-1 sm:px-6 sm:pt-4">
        <button className="mb-2 flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sm font-semibold text-[#655b72] transition hover:bg-[#fffaf0] hover:text-[#30283d]" onClick={() => setLocation('/')} data-testid="button-reference-back">
          <ArrowLeft size={16} /> Back to practice
        </button>
        <div className="rise-in grid gap-4 lg:grid-cols-[.85fr_1.15fr] lg:items-start lg:gap-5">
          <section>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#edb9a9] bg-[#fff4eb] px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[.15em] text-[#566b2f]">
              <BookOpen size={13} /> Study mode
            </div>
            <h1 className="max-w-xl text-[clamp(2.35rem,5vw,4.25rem)] font-bold leading-[.9] tracking-[-.08em] text-[#30283d]">Look it<br /><span className="text-[#566b2f]">up.</span></h1>
            <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-[#706475] sm:text-base">Choose a number and scan the full table before you jump back into the clock.</p>
            <div className="mt-4 rounded-[20px] border-2 border-[#e4d9d3] bg-[#fffdf9]/90 p-3 shadow-[6px_6px_0_rgba(48,40,61,.08)] sm:p-4">
              <Field label="Which table do you want to study?" hint="2–20">
                <NumberInput value={selectedNumber} min={2} max={20} onChange={chooseNumber} suffix="×" testId="input-reference-number" />
              </Field>
              <div className="mt-3 grid grid-cols-5 gap-1.5">
                {Array.from({ length: 19 }, (_, index) => index + 2).map((number) => (
                  <button key={number} className={`h-8 rounded-lg border-2 font-mono text-xs font-medium transition ${selectedNumber === number ? 'border-[#566b2f] bg-[#566b2f] text-[#fff9ee] shadow-[2px_2px_0_#30283d]' : 'border-[#e1d8d4] bg-[#fffdf9] text-[#584d62] hover:-translate-y-0.5 hover:border-[#8da253]'}`} onClick={() => { setSelectedNumber(number); trackEvent('study_table_selected', { table: number, source: 'table_picker' }); }} data-testid={`button-reference-number-${number}`}>
                    {number}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <section className="pop-in rounded-[22px] border-2 border-[#e4d9d3] bg-[#fffdf9] p-3 shadow-[7px_7px_0_rgba(48,40,61,.1)] sm:p-4">
            <div className="mb-3 flex items-end justify-between border-b-2 border-[#eee4dc] pb-3">
              <div>
                <p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[#566b2f]">The {selectedNumber}s</p>
                <h2 className="mt-1 text-xl font-bold tracking-[-.06em]" data-testid="heading-reference-table">{selectedNumber} multiplication table</h2>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff1c8] font-mono text-base font-medium text-[#76591a]">{selectedNumber}</span>
            </div>
             <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
              {Array.from({ length: 12 }, (_, index) => index + 1).map((factor) => (
                 <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${factor >= 10 ? 'bg-[#d8f5e5]' : factor >= 6 ? 'bg-[#fff1c8]' : 'bg-[#faf4ed]'}`} key={factor} data-testid={`reference-row-${factor}`}>
                   <span className="shrink-0 whitespace-nowrap font-mono text-xs text-[#766a78]">{selectedNumber} × {factor}</span>
                   <span className="shrink-0 whitespace-nowrap font-mono text-sm font-medium text-[#30283d]">= {selectedNumber * factor}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </Shell>
  );
}

function Home() {
  const [, setLocation] = useLocation();
  const [settings, setSettings] = useState<GameSettings>(() => {
    const saved = readStorage<Partial<GameSettings>>(SETTINGS_KEY, {});
    const difficulty: Difficulty = saved.difficulty === 2 || saved.difficulty === 3 ? saved.difficulty : defaultSettings.difficulty;
    return {
      ...defaultSettings,
      ...saved,
      ...presets[difficulty],
      sessionDurationMinutes: defaultSettings.sessionDurationMinutes,
    };
  });
  const [playerName, setPlayerName] = useState(() => readStorage<string>('multiplication-tables-player', ''));
  const { data: weeklyEntries = [], isLoading: isWeeklyLeaderboardLoading, isError: isWeeklyLeaderboardError } = useListLeaderboard({
    query: { queryKey: ['/api/leaderboard'], staleTime: 30_000 },
  });
  const { data: allTimeEntries = [], isLoading: isAllTimeLeaderboardLoading, isError: isAllTimeLeaderboardError } = useListAllTimeLeaderboard({
    query: { queryKey: ['/api/leaderboard/all-time'], staleTime: 30_000 },
  });
  const [nameError, setNameError] = useState('');

  const updateSetting = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };
  const selectDifficulty = (difficulty: Difficulty) => {
    setSettings((current) => ({ ...current, difficulty, ...presets[difficulty] }));
  };
  const startSession = (event: FormEvent) => {
    event.preventDefault();
    const name = playerName.trim();
    if (!name) {
      setNameError('Add your name so the board knows who is playing.');
      return;
    }
    const from = Math.max(2, Math.min(20, Math.round(settings.tableFrom === '' ? 2 : settings.tableFrom)));
    const to = Math.max(from, Math.min(20, Math.round(settings.tableTo === '' ? from : settings.tableTo)));
    const cleanSettings: NormalizedGameSettings = { ...settings, tableFrom: from, tableTo: to, sessionDurationMinutes: Math.max(1, Math.min(30, Math.round(settings.sessionDurationMinutes))), secondsPerQuestion: Math.max(1, Math.min(30, Math.round(settings.secondsPerQuestion))), pointsCorrect: Math.max(1, Math.round(settings.pointsCorrect)), pointsWrong: Math.min(0, Math.round(settings.pointsWrong)), pointsTimeout: Math.min(0, Math.round(settings.pointsTimeout)) };
    writeStorage(SETTINGS_KEY, cleanSettings);
    writeStorage('multiplication-tables-player', name);
    writeStorage(SESSION_KEY, { playerName: name, settings: cleanSettings, questions: createQuestions(cleanSettings), sessionSecondsLeft: cleanSettings.sessionDurationMinutes * 60, currentIndex: 0, score: 0, streak: 0, maxStreak: 0, correctCount: 0, wrongCount: 0, timeoutCount: 0, startedAt: new Date().toISOString() } satisfies GameSession);
    trackEvent('session_started', {
      difficulty: cleanSettings.difficulty,
      table_from: cleanSettings.tableFrom,
      table_to: cleanSettings.tableTo,
      seconds_per_question: cleanSettings.secondsPerQuestion,
      session_duration_minutes: cleanSettings.sessionDurationMinutes,
    });
    setLocation('/play');
  };
  return (
    <Shell>
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-5 pt-3 sm:px-6 sm:pt-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(350px,.85fr)] lg:gap-8 lg:pt-8">
        <div>
          <div className="rise-in mb-5 max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#edb9a9] bg-[#fff4eb] px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[.15em] text-[#566b2f]">
              <Zap size={13} fill="currentColor" /> Ready when you are
            </div>
            <h1 className="max-w-[650px] text-[clamp(2.8rem,7vw,5.4rem)] font-bold leading-[.88] tracking-[-.085em] text-[#30283d]">Make the<br /><span className="text-[#566b2f]">numbers</span><br />stick.</h1>
            <p className="mt-4 max-w-md text-sm font-medium leading-relaxed text-[#706475] sm:text-base">A focused timed run. One clear goal: get a little sharper with every answer.</p>
          </div>
          <form onSubmit={startSession} className="rise-in delay-1 rounded-[24px] border-2 border-[#e4d9d3] bg-[#fffdf9]/90 p-4 shadow-[7px_7px_0_rgba(48,40,61,.1)] sm:p-5" data-testid="form-session-setup">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[#566b2f]">Build your run</p>
                <h2 className="mt-1 text-xl font-bold tracking-[-.05em]">Session setup</h2>
              </div>
              <Target size={22} className="text-[#566b2f]" />
            </div>
            <div className="space-y-4">
              <Field label="Player name" hint="Leaderboard name">
                <input className={`h-12 w-full rounded-xl border-2 bg-[#fffdf9] px-4 text-sm font-semibold text-[#30283d] outline-none transition placeholder:text-[#b2a5ab] focus:border-[#566b2f] focus:ring-4 focus:ring-[#566b2f]/10 ${nameError ? 'border-[#df5060]' : 'border-[#e1d8d4]'}`} placeholder="What should we call you?" value={playerName} onChange={(event) => { setPlayerName(event.target.value); setNameError(''); }} data-testid="input-player-name" />
                {nameError && <span className="mt-1.5 block text-xs font-semibold text-[#d44356]" data-testid="text-name-error">{nameError}</span>}
              </Field>
              <Field label="Difficulty" hint="Sets the fixed challenge">
                <DifficultyPicker value={settings.difficulty} onChange={selectDifficulty} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tables from" hint="2–20"><NumberInput value={settings.tableFrom} min={2} max={20} onChange={(value) => updateSetting('tableFrom', value)} suffix="×" testId="input-table-from" /></Field>
                <Field label="Tables to" hint="2–20"><NumberInput value={settings.tableTo} min={2} max={20} onChange={(value) => updateSetting('tableTo', value)} suffix="×" testId="input-table-to" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Session length" hint="Fixed"><NumberInput value={settings.sessionDurationMinutes} min={1} max={30} onChange={(value) => { if (value !== '') updateSetting('sessionDurationMinutes', value); }} suffix="min" testId="input-session-duration" disabled /></Field>
                <Field label="Seconds / question" hint="Fixed"><NumberInput value={settings.secondsPerQuestion} min={1} max={30} onChange={(value) => { if (value !== '') updateSetting('secondsPerQuestion', value); }} suffix="sec" testId="input-seconds" disabled /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Points for correct" hint="Fixed"><NumberInput value={settings.pointsCorrect} min={1} max={20} onChange={(value) => { if (value !== '') updateSetting('pointsCorrect', value); }} suffix="pts" testId="input-points-correct" disabled /></Field>
                <Field label="Timeout penalty" hint="Fixed"><NumberInput value={settings.pointsTimeout} max={0} onChange={(value) => { if (value !== '') updateSetting('pointsTimeout', value); }} suffix="pts" testId="input-points-timeout" disabled /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Wrong-answer penalty" hint="Fixed"><NumberInput value={settings.pointsWrong} max={0} onChange={(value) => { if (value !== '') updateSetting('pointsWrong', value); }} suffix="pts" testId="input-points-wrong" disabled /></Field>
              </div>
            </div>
            <button className="group mt-5 flex h-12 w-full items-center justify-between rounded-xl bg-[#566b2f] px-4 text-sm font-bold text-[#fff9ee] shadow-[4px_4px_0_#30283d] transition hover:-translate-y-0.5 hover:bg-[#465824] active:translate-y-0 active:shadow-[2px_2px_0_#30283d]" type="submit" data-testid="button-start-session">
              Start a focused run <ArrowRight size={18} className="transition group-hover:translate-x-1" />
            </button>
          </form>
        </div>
        <div className="flex flex-col gap-4 lg:pt-8">
          <div className="pop-in rounded-[22px] bg-[#30283d] p-4 text-[#fff9ee] shadow-[7px_7px_0_rgba(48,40,61,.16)] sm:p-5">
            <div className="mb-5 flex items-center justify-between">
              <span className="rounded-full bg-[#4b405a] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.15em] text-[#d9d0d2]">How it works</span>
              <Gauge size={20} className="text-[#ffd66b]" />
            </div>
            <div className="space-y-3">
              {[['01', 'Read the board', 'A fresh mix from your chosen tables.'], ['02', 'Beat the clock', 'Answer before the timer makes its move.'], ['03', 'Chase your best', 'Your strongest scores stay on the board.']].map(([number, title, copy]) => (
                <div className="flex gap-3" key={number}><span className="font-mono text-xs text-[#ffd66b]">{number}</span><div><p className="text-sm font-bold">{title}</p><p className="mt-0.5 text-xs leading-relaxed text-[#bdb3c0]">{copy}</p></div></div>
              ))}
            </div>
          </div>
          <Link href="/tables" onClick={() => trackEvent('study_mode_opened', { source: 'home_link' })} className="group flex items-center gap-3 rounded-[20px] border-2 border-[#e4d9d3] bg-[#fffdf9]/85 p-4 shadow-[5px_5px_0_rgba(48,40,61,.08)] transition hover:-translate-y-0.5 hover:border-[#8da253]" data-testid="link-table-reference">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#b9f2d0] text-[#267452]"><BookOpen size={18} /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#30283d]">Study a multiplication table</span><span className="mt-0.5 block text-xs font-medium text-[#8d818d]">Review factors 1 through 12 at your own pace.</span></span>
            <ArrowRight size={18} className="text-[#8d818d] transition group-hover:translate-x-1 group-hover:text-[#566b2f]" />
          </Link>
           <FeedbackForm />
          <Leaderboard entries={weeklyEntries} isLoading={isWeeklyLeaderboardLoading} isError={isWeeklyLeaderboardError} eyebrow="This week" title="Weekly leaderboard" description="Shared scores from the last 7 days" emptyMessage="No scores this week yet. Set a range and make it yours." testIdPrefix="weekly-leaderboard" />
          <Leaderboard entries={allTimeEntries} isLoading={isAllTimeLeaderboardLoading} isError={isAllTimeLeaderboardError} eyebrow="Hall of focus" title="All-time leaderboard" description="The best scores since launch" emptyMessage="No all-time scores yet. Be the first to claim the board." testIdPrefix="all-time-leaderboard" />
        </div>
      </main>
    </Shell>
  );
}

function ProgressDots({ questions, currentIndex }: { questions: GameQuestion[]; currentIndex: number }) {
  const visibleQuestions = questions.slice(Math.max(0, currentIndex - 23), currentIndex + 1);
  return (
    <div className="flex gap-1.5" aria-label="Question progress">
      {visibleQuestions.map((question, index) => {
        const absoluteIndex = Math.max(0, currentIndex - 23) + index;
        return <span key={`${question.multiplicand}-${question.multiplier}-${absoluteIndex}`} className={`h-1.5 flex-1 rounded-full transition-colors ${absoluteIndex < currentIndex ? (question.status === 'correct' ? 'bg-[#53bd8e]' : 'bg-[#ef8a7b]') : absoluteIndex === currentIndex ? 'bg-[#566b2f]' : 'bg-[#e4d9d3]'}`} data-testid={`progress-question-${absoluteIndex + 1}`} />;
      })}
    </div>
  );
}

function Play() {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<GameSession | null>(() => {
    const saved = readStorage<GameSession | null>(SESSION_KEY, null);
    return saved && saved.sessionSecondsLeft === undefined
      ? { ...saved, sessionSecondsLeft: (saved.settings.sessionDurationMinutes ?? 3) * 60 }
      : saved;
  });
  const [seconds, setSeconds] = useState(() => session?.settings.secondsPerQuestion ?? 0);
  const [questionRemainingMs, setQuestionRemainingMs] = useState(() => (session?.settings.secondsPerQuestion ?? 0) * 1000);
  const [answer, setAnswer] = useState('');
  const [inputError, setInputError] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionDeadlineRef = useRef<number | null>(null);
  const sessionDeadlineRef = useRef<number | null>(null);
  const resolutionStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!session) {
      setLocation('/');
      return;
    }
    const questionDurationMs = session.settings.secondsPerQuestion * 1000;
    questionDeadlineRef.current = performance.now() + questionDurationMs;
    if (sessionDeadlineRef.current === null) {
      sessionDeadlineRef.current = performance.now() + session.sessionSecondsLeft * 1000;
    }
    setQuestionRemainingMs(questionDurationMs);
    setSeconds(session.settings.secondsPerQuestion);
    setAnswer('');
    setInputError('');
    setIsResolving(false);
  }, [session?.currentIndex, setLocation]);

  useEffect(() => {
    if (!session || isResolving) return;
    let animationFrame = 0;
    const tick = () => {
      const now = performance.now();
      const questionRemaining = Math.max(0, (questionDeadlineRef.current ?? now) - now);
      const sessionRemaining = Math.max(0, (sessionDeadlineRef.current ?? now) - now);
      setQuestionRemainingMs(questionRemaining);
      setSeconds(Math.ceil(questionRemaining / 1000));
      setSession((currentSession) => {
        if (!currentSession) return currentSession;
        const sessionSecondsLeft = Math.ceil(sessionRemaining / 1000);
        if (sessionSecondsLeft === currentSession.sessionSecondsLeft) return currentSession;
        const updated = { ...currentSession, sessionSecondsLeft };
        writeStorage(SESSION_KEY, updated);
        return updated;
      });
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [session?.currentIndex, isResolving]);

  const current = session?.questions[session.currentIndex];
  const continueAfterResolution = (updated: GameSession, endSession: boolean) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (sessionDeadlineRef.current !== null && resolutionStartedAtRef.current !== null && !endSession) {
      sessionDeadlineRef.current += performance.now() - resolutionStartedAtRef.current;
    }
    resolutionStartedAtRef.current = null;
    if (endSession || updated.currentIndex >= updated.questions.length - 1) {
      setLocation('/results');
    } else {
      setSession({ ...updated, currentIndex: updated.currentIndex + 1 });
    }
  };
  const finishOrNext = (updated: GameSession, endSession = false, showReview = false) => {
    setSession(updated);
    writeStorage(SESSION_KEY, updated);
    setIsResolving(true);
    resolutionStartedAtRef.current = performance.now();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      continueAfterResolution(updated, endSession);
    }, showReview ? 10_000 : 420);
  };
  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    resolutionStartedAtRef.current = null;
  }, []);
  const answerQuestion = (type: 'correct' | 'wrong' | 'timeout', response: number | null, endSession = false) => {
    if (!session || !current || isResolving) return;
    trackEvent('question_answered', {
      outcome: type,
      question_number: session.currentIndex + 1,
      difficulty: session.settings.difficulty,
      table_from: session.settings.tableFrom,
      table_to: session.settings.tableTo,
    });
    const updatedQuestion = { ...current, status: type, response };
    const questions = session.questions.map((question, index) => index === session.currentIndex ? updatedQuestion : question);
    const correctCount = session.correctCount + (type === 'correct' ? 1 : 0);
    const wrongCount = session.wrongCount + (type === 'wrong' ? 1 : 0);
    const timeoutCount = session.timeoutCount + (type === 'timeout' ? 1 : 0);
    const streak = type === 'correct' ? session.streak + 1 : 0;
    const updated = { ...session, questions, score: session.score + (type === 'correct' ? session.settings.pointsCorrect : type === 'wrong' ? session.settings.pointsWrong : session.settings.pointsTimeout), streak, maxStreak: Math.max(session.maxStreak, streak), correctCount, wrongCount, timeoutCount };
    finishOrNext(updated, endSession || session.sessionSecondsLeft === 0, type !== 'correct');
  };
  useEffect(() => {
    if (seconds === 0 && session && current && !isResolving) answerQuestion('timeout', null, session.sessionSecondsLeft === 0);
  }, [seconds, session, current, isResolving]);
  const submitAnswer = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed) {
      setInputError('Type an answer or use skip.');
      return;
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      setInputError('Use numbers only.');
      return;
    }
    setInputError('');
    answerQuestion(numeric === current?.answer ? 'correct' : 'wrong', numeric);
  };
  if (!session || !current) return null;
  const progress = Math.min(100, Math.max(0, (questionRemainingMs / (session.settings.secondsPerQuestion * 1000)) * 100));
  return (
    <Shell showBack>
      <main className="mx-auto w-full max-w-4xl px-4 pb-5 pt-3 sm:px-6 sm:pt-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[#566b2f]">In the zone</p><h1 className="mt-1 text-3xl font-bold tracking-[-.06em] sm:text-4xl">Keep your streak, {session.playerName}.</h1></div>
          <div className="hidden text-right sm:block"><span className="font-mono text-xs uppercase tracking-[.12em] text-[#958894]">Score</span><p className="font-mono text-2xl font-medium text-[#566b2f]" data-testid="text-score">{session.score > 0 ? '+' : ''}{session.score}</p></div>
        </div>
        <ProgressDots questions={session.questions} currentIndex={session.currentIndex} />
         <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[.1em] text-[#928691]">
          <span data-testid="text-question-counter">Question {String(session.currentIndex + 1).padStart(2, '0')}</span>
           <span className="flex flex-wrap items-center gap-4 whitespace-nowrap"><span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[#566b2f]" data-testid="text-session-timer"><Clock3 size={13} /> Run {formatDuration(session.sessionSecondsLeft)}</span><span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"><Zap size={13} className={session.streak > 1 ? 'text-[#e4aa19]' : ''} /> Streak {session.streak}</span></span>
        </div>
        <section className="pop-in relative mt-5 overflow-hidden rounded-[24px] border-2 border-[#e4d9d3] bg-[#fffdf9] p-4 shadow-[7px_7px_0_rgba(48,40,61,.1)] transition sm:p-8" data-testid="card-question">
          <div className="absolute inset-x-0 top-0 h-2 bg-[#f1e7df]"><div className={`h-full ${seconds <= 2 ? 'bg-[#df5060]' : 'bg-[#566b2f]'}`} style={{ width: `${progress}%` }} /></div>
           <div className="flex flex-wrap items-center justify-between gap-2"><span className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[11px] font-medium ${seconds <= 2 ? 'bg-[#ffe2e1] text-[#c34151]' : 'bg-[#fff1c8] text-[#806116]'}`} data-testid="text-timer"><Clock3 size={14} /> {seconds}s left</span><span className="shrink-0 whitespace-nowrap font-mono text-[11px] uppercase tracking-[.12em] text-[#9c9099]">Tables {session.settings.tableFrom}–{session.settings.tableTo}</span></div>
          <div className="py-8 text-center sm:py-10"><p className="font-mono text-xs uppercase tracking-[.2em] text-[#9a8e98]">What is</p><div className="mt-3 flex w-full flex-nowrap items-center justify-center gap-[.18em] whitespace-nowrap text-[clamp(2.15rem,10.5vw,6rem)] font-bold leading-none tracking-[-.1em] text-[#30283d] sm:text-[clamp(3.2rem,11vw,6rem)]" data-testid="text-question"><span className="shrink-0">{current.multiplicand}</span><span className="shrink-0 text-[#566b2f]">×</span><span className="shrink-0">{current.multiplier}</span></div></div>
           {!isResolving && <form onSubmit={submitAnswer} className="mx-auto flex max-w-sm flex-col gap-2.5"><div className="relative"><input autoFocus className={`answer-input h-14 w-full rounded-2xl border-2 bg-[#fffaf3] px-5 text-center font-mono text-xl font-medium text-[#30283d] outline-none transition focus:border-[#566b2f] focus:ring-4 focus:ring-[#566b2f]/10 ${inputError ? 'border-[#df5060]' : 'border-[#e1d8d4]'}`} inputMode="numeric" type="number" placeholder="Your answer" value={answer} onChange={(event) => { setAnswer(event.target.value); setInputError(''); }} data-testid="input-answer" /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-[#b0a2aa]">enter</span></div>{inputError && <p className="text-center text-xs font-semibold text-[#d44356]" data-testid="text-answer-error">{inputError}</p>}<button className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#30283d] px-5 text-sm font-bold text-[#fff9ee] transition hover:bg-[#453952] active:scale-[.99]" type="submit" data-testid="button-submit-answer">Lock it in <ArrowRight size={17} /></button><button className="py-1 text-xs font-bold text-[#958894] transition hover:text-[#d44356]" type="button" onClick={() => answerQuestion('timeout', null)} data-testid="button-skip-question">Skip question</button></form>}
           {isResolving && (current.status === 'wrong' || current.status === 'timeout') && <div className="mx-auto max-w-sm rounded-2xl border-2 border-[#e4d9d3] bg-[#faf4ed] p-4 text-center" data-testid="card-answer-review"><p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[#566b2f]">Correct answer</p><p className="mt-2 font-mono text-3xl font-medium text-[#30283d]" data-testid="text-correct-answer">{current.multiplicand} × {current.multiplier} = {current.answer}</p><p className="mt-2 text-xs font-medium text-[#857986]">{current.status === 'timeout' ? 'No answer was submitted.' : `You entered ${current.response ?? '—'}.`}</p><button className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#566b2f] px-4 text-sm font-bold text-[#fff9ee] transition hover:bg-[#465824]" type="button" onClick={() => continueAfterResolution(session, session.sessionSecondsLeft === 0 || session.currentIndex >= session.questions.length - 1)} data-testid="button-answer-review-ok"><Check size={17} /> OK, next question</button><p className="mt-2 text-[10px] font-semibold uppercase tracking-[.08em] text-[#a0959d]">Continuing automatically in 10 seconds</p></div>}
        </section>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl px-1 text-[11px] font-medium text-[#8f838e]"><span className="flex shrink-0 items-center gap-2 whitespace-nowrap"><Target size={14} /> Correct +{session.settings.pointsCorrect}</span><span className="shrink-0 whitespace-nowrap">Wrong {session.settings.pointsWrong} · Timeout {session.settings.pointsTimeout}</span><button className="flex shrink-0 items-center gap-1 whitespace-nowrap font-bold text-[#8f838e] transition hover:text-[#d44356]" onClick={() => { if (window.confirm('Quit this run? Your progress will not be saved.')) { trackEvent('session_quit', { question_number: session.currentIndex + 1, difficulty: session.settings.difficulty, table_from: session.settings.tableFrom, table_to: session.settings.tableTo }); localStorage.removeItem(SESSION_KEY); setLocation('/'); } }} data-testid="button-quit-session"><Flag size={13} /> Quit</button></div>
      </main>
    </Shell>
  );
}

function Results() {
  const [, setLocation] = useLocation();
  const [session] = useState<GameSession | null>(() => readStorage<GameSession | null>(SESSION_KEY, null));
  const { data: entries = [], refetch } = useListLeaderboard({ query: { queryKey: ['/api/leaderboard'], staleTime: 30_000 } });
  const { mutateAsync: submitLeaderboardEntry } = useSubmitLeaderboardEntry();
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState(false);
  const [leaderboardSaved, setLeaderboardSaved] = useState(false);
  const submittedRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session) { setLocation('/'); return; }
    if (submittedRunRef.current === session.startedAt) return;
    const total = session.questions.filter((question) => question.status !== 'pending').length;
    const accuracy = total ? Math.round((session.correctCount / total) * 100) : 0;
    submittedRunRef.current = session.startedAt;
    trackEvent('session_completed', {
      score: session.score,
      accuracy,
      difficulty: session.settings.difficulty,
      table_from: session.settings.tableFrom,
      table_to: session.settings.tableTo,
      correct_count: session.correctCount,
      wrong_count: session.wrongCount,
      timeout_count: session.timeoutCount,
      total_questions: total,
      max_streak: session.maxStreak,
    });
    if (accuracy < LEADERBOARD_MIN_ACCURACY) {
      trackEvent('leaderboard_entry_ineligible', {
        accuracy,
        minimum_accuracy: LEADERBOARD_MIN_ACCURACY,
        score: session.score,
        difficulty: session.settings.difficulty,
        table_from: session.settings.tableFrom,
        table_to: session.settings.tableTo,
      });
      return;
    }
    void submitLeaderboardEntry({
      data: {
        runId: session.startedAt,
        playerName: session.playerName,
        score: session.score,
        accuracy,
        difficulty: session.settings.difficulty,
        tableFrom: session.settings.tableFrom,
        tableTo: session.settings.tableTo,
        correctCount: session.correctCount,
        totalQuestions: total,
      },
    }).then(() => {
      trackEvent('leaderboard_entry_submitted', {
        score: session.score,
        accuracy,
        difficulty: session.settings.difficulty,
        table_from: session.settings.tableFrom,
        table_to: session.settings.tableTo,
      });
      setLeaderboardSaved(true);
      return Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['/api/leaderboard/all-time'] }),
      ]);
    }).catch(() => {
      trackEvent('leaderboard_submission_failed', {
        difficulty: session.settings.difficulty,
        table_from: session.settings.tableFrom,
        table_to: session.settings.tableTo,
      });
      submittedRunRef.current = null;
      setSaveError(true);
    });
  }, [session, setLocation, submitLeaderboardEntry, refetch, queryClient]);
  if (!session) return null;
  const total = session.questions.filter((question) => question.status !== 'pending').length;
  const accuracy = total ? Math.round((session.correctCount / total) * 100) : 0;
  const missedQuestions = session.questions.filter((question) => question.status === 'wrong' || question.status === 'timeout');
   const leaderboardEligible = accuracy >= LEADERBOARD_MIN_ACCURACY;
   const sorted = [...entries].sort((a, b) => b.score - a.score || new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime() || b.accuracy - a.accuracy);
   const placement = leaderboardEligible ? sorted.findIndex((entry) => entry.playerName === session.playerName && entry.score === session.score && entry.correctCount === session.correctCount) + 1 : 0;
  const again = () => { const next = { ...session, questions: createQuestions(session.settings), sessionSecondsLeft: session.settings.sessionDurationMinutes * 60, currentIndex: 0, score: 0, streak: 0, maxStreak: 0, correctCount: 0, wrongCount: 0, timeoutCount: 0, startedAt: new Date().toISOString() }; writeStorage(SESSION_KEY, next); setLocation('/play'); };
  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 pb-5 pt-3 sm:px-6 sm:pt-7">
        <div className="rise-in text-center"><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[16px] bg-[#ffd66b] text-[#6c5319] shadow-[4px_4px_0_#30283d]"><Trophy size={24} /></div><p className="font-mono text-[10px] font-medium uppercase tracking-[.2em] text-[#566b2f]">Run complete</p><h1 className="mt-2 text-[clamp(2.5rem,7vw,4.6rem)] font-bold leading-[.9] tracking-[-.09em]" data-testid="heading-results">Nice work, {session.playerName}.</h1><p className="mt-3 text-sm font-medium text-[#766a78]">You stayed with it. Here is the shape of this run.</p></div>
        <div className="rise-in delay-1 mx-auto mt-6 grid max-w-3xl gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-[#30283d] p-4 text-[#fff9ee] sm:p-5"><span className="font-mono text-[10px] uppercase tracking-[.16em] text-[#bdb3c0]">Final score</span><p className="mt-1 font-mono text-3xl font-medium text-[#ffd66b]" data-testid="text-final-score">{session.score > 0 ? '+' : ''}{session.score}</p></div>
          <div className="rounded-2xl bg-[#d8f5e5] p-4 text-[#267452] sm:p-5"><span className="font-mono text-[10px] uppercase tracking-[.16em]">Accuracy</span><p className="mt-1 font-mono text-3xl font-medium" data-testid="text-accuracy">{accuracy}%</p></div>
           <div className="rounded-2xl bg-[#fff1c8] p-4 text-[#76591a] sm:p-5"><span className="font-mono text-[10px] uppercase tracking-[.16em]">{leaderboardEligible ? 'Board place' : 'Leaderboard'}</span><p className={`mt-1 font-mono font-medium ${leaderboardEligible ? 'text-3xl' : 'text-xl'}`} data-testid="text-placement">{leaderboardEligible ? `#${placement || '—'}` : 'Not eligible'}</p></div>
        </div>
         {leaderboardSaved && <div className="rise-in delay-2 mx-auto mt-3 flex max-w-3xl items-center gap-3 rounded-2xl border-2 border-[#70c39c] bg-[#d8f5e5] px-4 py-3 text-[#1d5f49]" data-testid="banner-leaderboard-success"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#b9f2d0]"><Trophy size={20} /></div><div><p className="font-bold">You made the leaderboard!</p><p className="text-xs font-medium text-[#43816a]">Your score is now on the weekly and all-time boards.</p></div></div>}
        <div className="rise-in delay-2 mx-auto mt-3 grid max-w-3xl gap-3 sm:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-[20px] border-2 border-[#e4d9d3] bg-[#fffdf9] p-4"><h2 className="text-lg font-bold tracking-[-.04em]">The breakdown</h2><div className="mt-3 grid grid-cols-3 gap-2">{[['Correct', session.correctCount, 'text-[#2f9b6c]'], ['Wrong', session.wrongCount, 'text-[#d44356]'], ['Timed out', session.timeoutCount, 'text-[#bd8d1d]']].map(([label, value, color]) => <div className="rounded-xl bg-[#faf4ed] p-2.5" key={label as string}><p className={`font-mono text-xl font-medium ${color as string}`} data-testid={`text-${String(label).toLowerCase().replace(' ', '-')}`}>{value}</p><p className="mt-1 text-[11px] font-semibold text-[#8e828d]">{label}</p></div>)}</div><div className="mt-3 flex items-center justify-between border-t border-[#eee4dc] pt-3 text-xs font-semibold text-[#857986]"><span>Best streak</span><span className="font-mono text-[#30283d]">{session.maxStreak} in a row</span></div></section>
          <section className="rounded-[20px] bg-[#b9f2d0] p-4 text-[#1d5f49]"><div className="flex items-center justify-between"><h2 className="text-lg font-bold tracking-[-.04em]">Same settings?</h2><RotateCcw size={18} /></div><p className="mt-2 text-sm font-medium leading-relaxed text-[#43816a]">The best practice is the practice you will come back to. Run it again, or tune the challenge at home.</p><button className="mt-4 flex h-11 w-full items-center justify-between rounded-xl bg-[#267452] px-4 text-sm font-bold text-[#effff4] transition hover:bg-[#1d5f49]" onClick={again} data-testid="button-play-again">Play this run again <ArrowRight size={17} /></button><button className="mt-2 flex h-10 w-full items-center justify-center rounded-xl border-2 border-[#70c39c] px-4 text-sm font-bold text-[#267452] transition hover:bg-[#d8f5e5]" onClick={() => setLocation('/')} data-testid="button-return-home">Change settings</button></section>
        </div>
         {missedQuestions.length > 0 && <section className="rise-in delay-3 mx-auto mt-3 max-w-3xl rounded-[20px] border-2 border-[#e4d9d3] bg-[#fffdf9] p-4" data-testid="section-answer-review">
           <div className="flex items-start justify-between gap-3">
             <div><p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[#566b2f]">Answer review</p><h2 className="mt-1 text-lg font-bold tracking-[-.04em]">Answers for the misses</h2><p className="mt-1 text-sm font-medium text-[#857986]">Review the correct answers for mistakes and timeouts from this run.</p></div>
             <BookOpen className="shrink-0 text-[#566b2f]" size={20} />
           </div>
           <div className="mt-4 space-y-2">
             {missedQuestions.map((question, index) => <div className="flex items-center gap-3 rounded-xl bg-[#faf4ed] px-3 py-3" key={`${question.multiplicand}-${question.multiplier}-${index}`} data-testid={`answer-review-${index + 1}`}>
               <span className={`shrink-0 rounded-lg px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[.08em] ${question.status === 'timeout' ? 'bg-[#fff1c8] text-[#806116]' : 'bg-[#ffe2e1] text-[#c34151]'}`}>{question.status === 'timeout' ? 'Timed out' : 'Mistake'}</span>
               <p className="min-w-0 flex-1 font-mono text-sm font-medium text-[#5e5262]">{question.multiplicand} × {question.multiplier} <span className="text-[#aaa0a7]">=</span> <strong className="text-[#30283d]">{question.answer}</strong></p>
               <p className="shrink-0 text-right text-[10px] font-semibold text-[#a0959d]">{question.status === 'timeout' ? 'No answer' : `You entered ${question.response ?? '—'}`}</p>
             </div>)}
           </div>
         </section>}
         <div className="mx-auto mt-7 flex max-w-3xl flex-col items-center gap-3 justify-center">
            {!leaderboardEligible && <p className="text-center text-xs font-semibold text-[#806116]" data-testid="text-leaderboard-ineligible">Runs below {LEADERBOARD_MIN_ACCURACY}% accuracy are not included on the leaderboard.</p>}
            {saveError && <p className="text-center text-xs font-semibold text-[#c34151]" data-testid="text-leaderboard-save-error">This run could not be added to the shared leaderboard.</p>}
           <Link href="/" className="flex items-center gap-1.5 text-sm font-bold text-[#817583] transition hover:text-[#566b2f]" data-testid="link-results-home">Return home <ChevronRight size={16} /></Link>
         </div>
      </main>
    </Shell>
  );
}

function CreatorPage() {
  const [, setLocation] = useLocation();
  const { isLoaded, isSignedIn, user } = useUser();
  const queryClient = useQueryClient();
  const [creatorAccess, setCreatorAccess] = useState<boolean | null>(null);
  const { data: entries = [], isLoading, isError, refetch } = useListAllTimeLeaderboard({
    query: { enabled: creatorAccess === true, queryKey: ['/api/leaderboard/all-time'], staleTime: 30_000 },
  });
  const { data: feedback = [], isLoading: isFeedbackLoading, isError: isFeedbackError, refetch: refetchFeedback } = useListCreatorFeedback({
    query: { enabled: creatorAccess === true, queryKey: ['/api/creator/feedback'], staleTime: 30_000 },
  });
  const { mutateAsync: deleteCreatorFeedback } = useDeleteCreatorFeedback();
  const { refetch: refetchWeekly } = useListLeaderboard({
    query: { enabled: creatorAccess === true, queryKey: ['/api/leaderboard'], staleTime: 30_000 },
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<string | null>(null);
  const [feedbackDeleteError, setFeedbackDeleteError] = useState('');

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation('/sign-in');
  }, [isLoaded, isSignedIn, setLocation]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    void fetch('/api/creator/access', { credentials: 'include' })
      .then((response) => {
        if (active) setCreatorAccess(response.ok);
      })
      .catch(() => {
        if (active) setCreatorAccess(false);
      });
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn]);

  const deleteEntry = async (entry: LeaderboardEntry) => {
    if (!window.confirm(`Delete ${entry.playerName}'s score of ${entry.score}? This cannot be undone.`)) return;
    setDeletingId(entry.id);
    setDeleteError('');
    try {
      const response = await fetch(`/api/leaderboard/${encodeURIComponent(entry.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || 'Unable to delete this leaderboard entry.');
      }
      await Promise.all([refetch(), refetchWeekly()]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/leaderboard'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/leaderboard/all-time'] }),
      ]);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete this leaderboard entry.');
    } finally {
      setDeletingId(null);
    }
  };

  const deleteFeedback = async (id: string) => {
    if (!window.confirm('Delete this feedback? This cannot be undone.')) return;
    setDeletingFeedbackId(id);
    setFeedbackDeleteError('');
    try {
      await deleteCreatorFeedback({ id });
      await refetchFeedback();
    } catch {
      setFeedbackDeleteError('Unable to delete this feedback. Please try again.');
    } finally {
      setDeletingFeedbackId(null);
    }
  };

  if (!isLoaded || !isSignedIn || creatorAccess === null) {
    return <Shell><main className="mx-auto w-full max-w-3xl px-4 py-10 text-center text-sm font-medium text-[#968b99]">Checking creator access…</main></Shell>;
  }

  if (!creatorAccess) {
    return <Shell><main className="mx-auto w-full max-w-3xl px-4 py-10 text-center"><ShieldCheck className="mx-auto text-[#a44c53]" size={28} /><h1 className="mt-3 text-2xl font-bold tracking-[-.05em]">Creator access required</h1><p className="mt-2 text-sm font-medium text-[#857986]">This area is restricted to the approved creator account.</p><Link href="/" className="mt-5 inline-flex rounded-xl bg-[#30283d] px-4 py-3 text-sm font-bold text-[#fff9ee]" data-testid="link-access-denied-home">Return home</Link></main></Shell>;
  }

  const sortedEntries = [...entries].sort((a, b) => b.score - a.score || new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime() || b.accuracy - a.accuracy);
  const creatorEmail = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses[0]?.emailAddress || 'Signed-in creator';

  return (
    <Shell>
      <main className="mx-auto w-full max-w-4xl px-4 pb-8 pt-4 sm:px-6 sm:pt-8">
        <div className="rise-in rounded-[24px] bg-[#30283d] p-5 text-[#fff9ee] shadow-[7px_7px_0_rgba(48,40,61,.16)] sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[#b4c985]">Creator tools</p>
              <h1 className="mt-2 text-3xl font-bold tracking-[-.06em] sm:text-4xl">Manage the leaderboard.</h1>
              <p className="mt-2 text-sm font-medium leading-relaxed text-[#cfc3d2]">Signed in as {creatorEmail}. Remove entries that should not remain on the shared boards.</p>
            </div>
            <ShieldCheck className="shrink-0 text-[#b4c985]" size={28} />
          </div>
        </div>
        <section className="rise-in delay-1 mt-5 rounded-[22px] border-2 border-[#e4d9d3] bg-[#fffdf9]/90 p-4 shadow-[6px_6px_0_rgba(48,40,61,.08)] sm:p-5">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[#566b2f]">All-time board</p>
              <h2 className="mt-1 text-xl font-bold tracking-[-.05em]">Leaderboard entries</h2>
            </div>
            <span className="font-mono text-xs text-[#968b99]">{sortedEntries.length} shown</span>
          </div>
          {isLoading ? (
            <p className="rounded-xl bg-[#faf4ed] px-4 py-5 text-sm font-medium text-[#74636b]">Loading entries…</p>
          ) : isError ? (
            <p className="rounded-xl bg-[#ffe3df] px-4 py-5 text-sm font-medium text-[#a44c53]">The leaderboard could not be loaded.</p>
          ) : sortedEntries.length === 0 ? (
            <p className="rounded-xl bg-[#faf4ed] px-4 py-5 text-sm font-medium text-[#74636b]">There are no eligible entries to manage.</p>
          ) : (
            <div className="space-y-2">
              {sortedEntries.map((entry, index) => (
                <div className="flex items-center gap-3 rounded-xl bg-[#faf4ed] px-3 py-3" key={entry.id} data-testid={`creator-row-${entry.id}`}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e9ded7] font-mono text-xs font-medium text-[#756873]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#30283d]">{entry.playerName}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[.06em] text-[#968a91]">Score {entry.score} · {entry.accuracy}% · Tables {entry.tableFrom}–{entry.tableTo}</p>
                    <p className="mt-1 text-[10px] font-semibold text-[#a2979d]">{formatPlayedAt(entry.playedAt)}</p>
                  </div>
                  <button type="button" className="flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-[#e0a0a2] px-2.5 py-2 text-xs font-bold text-[#a44c53] transition hover:bg-[#ffe3df] disabled:cursor-wait disabled:opacity-50" onClick={() => void deleteEntry(entry)} disabled={deletingId !== null} data-testid={`button-delete-${entry.id}`}>
                    <Trash2 size={14} /> {deletingId === entry.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {deleteError && <p className="mt-3 text-sm font-semibold text-[#a44c53]" data-testid="text-creator-delete-error">{deleteError}</p>}
        </section>
        <section className="rise-in delay-2 mt-5 rounded-[22px] border-2 border-[#e4d9d3] bg-[#fffdf9]/90 p-4 shadow-[6px_6px_0_rgba(48,40,61,.08)] sm:p-5" data-testid="section-creator-feedback">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-[#566b2f]">From players</p>
              <h2 className="mt-1 text-xl font-bold tracking-[-.05em]">Feedback</h2>
            </div>
            <MessageCircle className="text-[#566b2f]" size={21} />
          </div>
          {isFeedbackLoading ? (
            <p className="rounded-xl bg-[#faf4ed] px-4 py-5 text-sm font-medium text-[#74636b]">Loading feedback…</p>
          ) : isFeedbackError ? (
            <p className="rounded-xl bg-[#ffe3df] px-4 py-5 text-sm font-medium text-[#a44c53]">Feedback could not be loaded.</p>
          ) : feedback.length === 0 ? (
            <p className="rounded-xl bg-[#faf4ed] px-4 py-5 text-sm font-medium text-[#74636b]">No feedback has been submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {feedback.map((item) => (
                <article className="rounded-xl bg-[#faf4ed] px-3 py-3" key={item.id} data-testid={`creator-feedback-${item.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#30283d]">{item.name || 'Anonymous player'}</p>
                      <time className="mt-1 block text-[10px] font-semibold text-[#a2979d]">{formatPlayedAt(item.createdAt)}</time>
                    </div>
                    <button type="button" className="flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-[#e0a0a2] px-2.5 py-2 text-xs font-bold text-[#a44c53] transition hover:bg-[#ffe3df] disabled:cursor-wait disabled:opacity-50" onClick={() => void deleteFeedback(item.id)} disabled={deletingFeedbackId !== null} data-testid={`button-delete-feedback-${item.id}`}>
                      <Trash2 size={14} /> {deletingFeedbackId === item.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-[#5e5262]">{item.message}</p>
                </article>
              ))}
            </div>
          )}
          {feedbackDeleteError && <p className="mt-3 text-sm font-semibold text-[#a44c53]" data-testid="text-feedback-delete-error">{feedbackDeleteError}</p>}
        </section>
      </main>
    </Shell>
  );
}

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/tables" component={TableReference} /><Route path="/play" component={Play} /><Route path="/results" component={Results} /><Route path="/creator" component={CreatorPage} /><Route path="/sign-in/*?" component={SignInPage} /><Route component={NotFound} /></Switch>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function SignInPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4"><SignIn routing="path" path={`${basePath}/sign-in`} withSignUp={false} transferable={false} /></div>;
}

function ClerkProviderWithRoutes() {
  const [location, setLocation] = useLocation();
  useEffect(() => {
    applyRouteMetadata(location, basePath);
  }, [location]);

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      localization={{ signIn: { start: { title: 'Creator sign in', subtitle: 'Continue with Google to manage the shared leaderboard.' } } }}
      routerPush={(to) => setLocation(to.startsWith(basePath) ? to.slice(basePath.length) || '/' : to)}
      routerReplace={(to) => setLocation(to.startsWith(basePath) ? to.slice(basePath.length) || '/' : to, { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RoutedErrorBoundary><Router /></RoutedErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the environment.');
  return <ThemeProvider><WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter></ThemeProvider>;
}

export default App;
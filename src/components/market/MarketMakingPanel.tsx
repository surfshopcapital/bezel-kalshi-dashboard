'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProbRunSummary {
  runAt: string;
  modelType: string;
  currentLevel: number;
  strike: number;
  strikeDirection: string;
  probabilityAbove: number;
  probabilityBelow: number;
  kalshiImpliedProb: number | null;
  modelEdge: number | null;
  confidenceScore: number | null;
  annualizedVol: number;
  oneSigmaMove: number;
  daysToExpiry: number;
}

export interface MarketMakingPanelProps {
  ticker: string;
  strikeDirection: 'above' | 'below' | null;
  latestProb: ProbRunSummary | null;
  probHistory: ProbRunSummary[];
  snapshot: {
    yesBid: number | null;
    yesAsk: number | null;
    yesPrice: number;
    impliedProb: number; // [0,1]
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Market making math
// ─────────────────────────────────────────────────────────────────────────────

interface MMQuote {
  fairValue: number;          // cents, model probability
  halfSpread: number;         // cents
  components: {
    base: number;
    confPenalty: number;
    timePenalty: number;
    volPenalty: number;
  };
  bid: number;                // cents — our limit buy price
  ask: number;                // cents — our limit sell price
  signal: 'buy' | 'sell' | 'make_market';
  signalStrength: 'strong' | 'moderate' | 'weak';
  edgeVsKalshi: number;       // fairValue - kalshiMid, in cents
}

function computeMMQuote(
  modelProb: number,      // 0–100
  confidence: number,     // 0–1
  daysToExpiry: number,
  annualizedVol: number,
  yesBid: number,         // current Kalshi bid in cents
  yesAsk: number,         // current Kalshi ask in cents
): MMQuote {
  const fairValue = Math.round(modelProb * 10) / 10;

  // Spread components — each adds half-spread width for a specific risk factor:
  const base = 5;                                             // minimum cushion
  const confPenalty = (1 - confidence) * 10;                 // widens when model is less certain
  const timePenalty = Math.sqrt(Math.max(1, daysToExpiry) / 30) * 2;  // widens with time
  const volPenalty = Math.min(5, annualizedVol * 15);         // widens with underlying volatility

  const raw = base + confPenalty + timePenalty + volPenalty;
  const halfSpread = Math.round(Math.max(3, Math.min(20, raw)) * 10) / 10;

  const bid = Math.max(1, Math.round(fairValue - halfSpread));
  const ask = Math.min(99, Math.round(fairValue + halfSpread));

  const kalshiMid = (yesBid + yesAsk) / 2;
  const edgeVsKalshi = Math.round((fairValue - kalshiMid) * 10) / 10;

  // Trade signal: can we hit Kalshi's current quote better than our limit?
  let signal: MMQuote['signal'];
  if (yesAsk <= bid) {
    signal = 'buy';          // Kalshi is offering cheaper than our own bid → lift their ask
  } else if (yesBid >= ask) {
    signal = 'sell';         // Kalshi bids above our ask → hit their bid (sell YES / buy NO)
  } else {
    signal = 'make_market';  // our quotes straddle theirs → post limits and collect spread
  }

  const signalStrength: MMQuote['signalStrength'] =
    Math.abs(edgeVsKalshi) > 15 ? 'strong' :
    Math.abs(edgeVsKalshi) > 7  ? 'moderate' : 'weak';

  return {
    fairValue,
    halfSpread,
    components: {
      base,
      confPenalty: Math.round(confPenalty * 10) / 10,
      timePenalty: Math.round(timePenalty * 10) / 10,
      volPenalty: Math.round(volPenalty * 10) / 10,
    },
    bid,
    ask,
    signal,
    signalStrength,
    edgeVsKalshi,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function SignalBadge({ signal, strength }: { signal: MMQuote['signal']; strength: MMQuote['signalStrength'] }) {
  const strengthLabel = strength.charAt(0).toUpperCase() + strength.slice(1);
  if (signal === 'buy') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold border
        ${strength === 'strong'
          ? 'bg-green-500/15 text-green-300 border-green-500/40'
          : 'bg-green-900/20 text-green-400 border-green-700/40'}`}>
        <TrendingUp className="h-4 w-4" />
        BUY YES — {strengthLabel} Signal
      </span>
    );
  }
  if (signal === 'sell') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold border
        ${strength === 'strong'
          ? 'bg-red-500/15 text-red-300 border-red-500/40'
          : 'bg-red-900/20 text-red-400 border-red-700/40'}`}>
        <TrendingDown className="h-4 w-4" />
        SELL YES / BUY NO — {strengthLabel} Signal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-700/60 px-3 py-1.5 text-sm font-medium text-slate-300 border border-slate-600">
      <Minus className="h-4 w-4" />
      MAKE MARKET — Post Both Sides
    </span>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-blue-700/30 bg-blue-900/10 p-3">
      <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
      <p className="text-xs text-slate-400 leading-relaxed">{children}</p>
    </div>
  );
}

function Collapsible({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-700/30 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-200">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-700 p-5 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, sub, color = 'text-slate-100' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg bg-slate-700/40 border border-slate-700 p-4 text-center">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-mono text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Backtest chart
// ─────────────────────────────────────────────────────────────────────────────

type BacktestWindow = 'all' | '30d' | '60d' | '90d';

function BacktestChart({ history, strikeDirection }: { history: ProbRunSummary[]; strikeDirection: 'above' | 'below' | null }) {
  const [window, setWindow] = useState<BacktestWindow>('all');

  const cutoff =
    window === 'all'  ? null :
    window === '30d'  ? 30 :
    window === '60d'  ? 60 : 90;

  const filtered = cutoff
    ? history.filter((r) => {
        const daysAgo = (Date.now() - new Date(r.runAt).getTime()) / 86400000;
        return daysAgo <= cutoff;
      })
    : history;

  const chartData = [...filtered].reverse().map((r) => {
    const modelProb =
      strikeDirection === 'above'
        ? r.probabilityAbove * 100
        : r.probabilityBelow * 100;
    return {
      date: new Date(r.runAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      model: Math.round(modelProb * 10) / 10,
      kalshi: r.kalshiImpliedProb != null ? Math.round(r.kalshiImpliedProb * 100 * 10) / 10 : null,
      edge: r.modelEdge != null ? Math.round(r.modelEdge * 100 * 10) / 10 : null,
    };
  });

  // Summary stats
  const edges = filtered.map((r) => r.modelEdge).filter((e): e is number => e != null);
  const avgEdge = edges.length > 0 ? edges.reduce((s, e) => s + e, 0) / edges.length * 100 : null;
  const maxEdge = edges.length > 0 ? Math.max(...edges) * 100 : null;
  const minEdge = edges.length > 0 ? Math.min(...edges) * 100 : null;
  const pctPositiveEdge = edges.length > 0 ? (edges.filter((e) => e > 0).length / edges.length) * 100 : null;

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500 rounded-lg border border-slate-700 bg-slate-800/60">
        No model runs in this window yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Window selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 font-medium">Lookback:</span>
        {(['all', '30d', '60d', '90d'] as BacktestWindow[]).map((w) => (
          <button
            key={w}
            onClick={() => setWindow(w)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              window === w ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {w === 'all' ? 'All' : w}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-600">{filtered.length} model runs</span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox
          label="Avg Model Edge"
          value={avgEdge != null ? `${avgEdge >= 0 ? '+' : ''}${avgEdge.toFixed(1)}%` : '—'}
          color={avgEdge == null ? 'text-slate-400' : avgEdge > 0 ? 'text-green-400' : 'text-red-400'}
        />
        <StatBox
          label="Max Edge"
          value={maxEdge != null ? `+${maxEdge.toFixed(1)}%` : '—'}
          color="text-emerald-400"
        />
        <StatBox
          label="Min Edge"
          value={minEdge != null ? `${minEdge.toFixed(1)}%` : '—'}
          color={minEdge != null && minEdge < 0 ? 'text-red-400' : 'text-slate-300'}
        />
        <StatBox
          label="% Positive Edge"
          value={pctPositiveEdge != null ? `${pctPositiveEdge.toFixed(0)}%` : '—'}
          sub="runs where model > Kalshi"
          color="text-sky-400"
        />
      </div>

      {/* Chart: model prob vs Kalshi implied */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <p className="text-xs text-slate-500 mb-3">
          Model probability vs Kalshi implied — {filtered.length} runs
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(v: number, name: string) => [`${v?.toFixed(1)}%`, name]}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
            />
            <ReferenceLine y={50} stroke="#475569" strokeDasharray="4 2" />
            <Line
              type="monotone"
              dataKey="model"
              name="Model Prob"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="kalshi"
              name="Kalshi Implied"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <InfoBox>
        <strong>Reading this chart:</strong> When the blue Model line is above the grey Kalshi dashed line,
        the model says YES is more likely than the market implies — a potential BUY signal. When it&apos;s below,
        the model thinks YES is overpriced — a potential SELL signal. Consistent separation = persistent edge.
        Crossing lines = model and market in agreement.
      </InfoBox>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export function MarketMakingPanel({
  ticker,
  strikeDirection,
  latestProb,
  probHistory,
  snapshot,
}: MarketMakingPanelProps) {
  if (!latestProb || !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-slate-700 bg-slate-800 py-16 text-center">
        <p className="text-base font-medium text-slate-300">No model output yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Run compute-probabilities after at least 5 Bezel price points exist for this market.
        </p>
      </div>
    );
  }

  const modelProb =
    strikeDirection === 'above'
      ? latestProb.probabilityAbove * 100
      : latestProb.probabilityBelow * 100;

  const confidence = latestProb.confidenceScore ?? 0.5;
  const yesBid = snapshot.yesBid ?? snapshot.yesPrice;
  const yesAsk = snapshot.yesAsk ?? snapshot.yesPrice;

  const quote = computeMMQuote(
    modelProb,
    confidence,
    latestProb.daysToExpiry,
    latestProb.annualizedVol,
    yesBid,
    yesAsk,
  );

  const kalshiMid = Math.round((yesBid + yesAsk) / 2);
  const modelEdgePct = quote.edgeVsKalshi; // already in cents = percentage points

  return (
    <div className="space-y-4">

      {/* ── 1. Signal header ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-0.5">Trading Signal — {ticker}</h3>
            <p className="text-xs text-slate-500">
              Based on log-normal probability model · Last run {new Date(latestProb.runAt).toLocaleString()}
            </p>
          </div>
          <SignalBadge signal={quote.signal} strength={quote.signalStrength} />
        </div>

        {/* Key numbers grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBox
            label="Model Fair Value"
            value={`${quote.fairValue.toFixed(1)}¢`}
            sub="model probability"
            color="text-blue-400"
          />
          <StatBox
            label="Kalshi Mid"
            value={`${kalshiMid}¢`}
            sub={`Bid ${yesBid}¢ · Ask ${yesAsk}¢`}
            color="text-slate-300"
          />
          <StatBox
            label="Model Edge"
            value={`${modelEdgePct >= 0 ? '+' : ''}${modelEdgePct.toFixed(1)}¢`}
            sub="fair value vs Kalshi mid"
            color={modelEdgePct > 5 ? 'text-green-400' : modelEdgePct < -5 ? 'text-red-400' : 'text-slate-400'}
          />
          <StatBox
            label="Confidence"
            value={`${(confidence * 100).toFixed(0)}%`}
            sub={`${latestProb.annualizedVol != null ? (latestProb.annualizedVol * 100).toFixed(1) + '% ann. vol' : ''}`}
            color={confidence > 0.7 ? 'text-emerald-400' : confidence > 0.4 ? 'text-amber-400' : 'text-red-400'}
          />
        </div>
      </div>

      {/* ── 2. Recommended quotes ────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Recommended Market Making Quotes</h3>

        {/* BID / MID / ASK display */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-900/60 border border-green-800/40 p-4 text-center">
            <p className="text-xs font-medium text-slate-500 mb-1">YOUR BID</p>
            <p className="font-mono text-3xl font-bold text-green-400">{quote.bid}¢</p>
            <p className="text-xs text-slate-500 mt-1">limit buy YES here</p>
          </div>
          <div className="rounded-lg bg-slate-900/60 border border-slate-600 p-4 text-center">
            <p className="text-xs font-medium text-slate-500 mb-1">FAIR VALUE</p>
            <p className="font-mono text-3xl font-bold text-slate-200">{quote.fairValue.toFixed(0)}¢</p>
            <p className="text-xs text-slate-500 mt-1">±{quote.halfSpread}¢ half-spread</p>
          </div>
          <div className="rounded-lg bg-slate-900/60 border border-amber-800/40 p-4 text-center">
            <p className="text-xs font-medium text-slate-500 mb-1">YOUR ASK</p>
            <p className="font-mono text-3xl font-bold text-amber-400">{quote.ask}¢</p>
            <p className="text-xs text-slate-500 mt-1">limit sell YES here</p>
          </div>
        </div>

        {/* Spread breakdown */}
        <div className="rounded-lg bg-slate-900/40 border border-slate-700 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Half-Spread Breakdown ({quote.halfSpread}¢ total)</p>
          {[
            { label: 'Base cushion', value: quote.components.base, desc: 'minimum required buffer' },
            { label: 'Confidence penalty', value: quote.components.confPenalty, desc: `model confidence ${(confidence * 100).toFixed(0)}%` },
            { label: 'Time penalty', value: quote.components.timePenalty, desc: `${latestProb.daysToExpiry.toFixed(1)} days to expiry` },
            { label: 'Volatility penalty', value: quote.components.volPenalty, desc: `${(latestProb.annualizedVol * 100).toFixed(1)}% ann. vol` },
          ].map(({ label, value, desc }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-40 shrink-0">{label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-700">
                <div
                  className="h-1.5 rounded-full bg-blue-500"
                  style={{ width: `${Math.min(100, (value / 20) * 100)}%` }}
                />
              </div>
              <span className="font-mono text-xs text-slate-300 w-10 text-right">{value}¢</span>
              <span className="text-xs text-slate-600 hidden sm:inline">{desc}</span>
            </div>
          ))}
        </div>

        <InfoBox>
          <strong>How to use:</strong> Post a limit BUY at {quote.bid}¢ and a limit SELL at {quote.ask}¢ on Kalshi.
          If both sides fill, you earn the {quote.ask - quote.bid}¢ spread. The spread is sized to cover model
          uncertainty — if the model is wrong, the spread cushions the loss. When Kalshi&apos;s market crosses
          outside your quotes, the signal flips to directional (BUY or SELL).
        </InfoBox>
      </div>

      {/* ── 3. How the model works ───────────────────────────────────────── */}
      <Collapsible title="How the Model Works — Full Explanation" defaultOpen={false}>
        <div className="space-y-5 text-sm text-slate-400 leading-relaxed">

          <div>
            <h4 className="text-slate-200 font-semibold mb-2">Step 1: What We&apos;re Predicting</h4>
            <p>
              Each Kalshi contract pays $1 if the watch price index finishes <strong className="text-slate-300">
              {strikeDirection === 'above' ? 'above' : 'below'} ${latestProb.strike.toLocaleString()}</strong> at
              expiry. The contract currently trades around <strong className="text-slate-300">{kalshiMid}¢</strong>,
              which means the market implies a <strong className="text-slate-300">{kalshiMid}% probability</strong>.
              The model says it should be <strong className="text-blue-400">{quote.fairValue.toFixed(0)}%</strong>.
            </p>
          </div>

          <div>
            <h4 className="text-slate-200 font-semibold mb-2">Step 2: The Probability Model (Log-Normal)</h4>
            <p>
              The model treats the watch price as following a <strong className="text-slate-300">log-normal random walk</strong> —
              the same assumption used in the Black-Scholes options model. Price changes are multiplicative
              (a 5% drop from $10,000 is $500; the same 5% from $8,000 is $400), which matches how financial
              assets actually move.
            </p>
            <div className="mt-2 rounded bg-slate-900 border border-slate-700 p-3 font-mono text-xs text-slate-300">
              P(price {strikeDirection === 'above' ? '>' : '<'} K) = Φ( (ln(P₀/K) ± σ²T/2) / (σ√T) )
            </div>
            <p className="mt-2">
              Where: <span className="text-slate-300">P₀</span> = current price (${latestProb.currentLevel.toLocaleString()}),
              <span className="text-slate-300"> K</span> = strike (${latestProb.strike.toLocaleString()}),
              <span className="text-slate-300"> σ</span> = annualized vol ({(latestProb.annualizedVol * 100).toFixed(1)}%),
              <span className="text-slate-300"> T</span> = time in years ({(latestProb.daysToExpiry / 365).toFixed(3)} yr),
              <span className="text-slate-300"> Φ</span> = standard normal CDF.
            </p>
          </div>

          <div>
            <h4 className="text-slate-200 font-semibold mb-2">Step 3: Volatility — The Critical Input</h4>
            <p>
              Annualized volatility is computed from recent daily log-returns of the Bezel price index.
              Current realized vol is <strong className="text-slate-300">{(latestProb.annualizedVol * 100).toFixed(1)}%</strong>,
              implying a 1-sigma daily move of ~<strong className="text-slate-300">
              {formatCurrency(latestProb.oneSigmaMove)}</strong>. Higher vol = wider probability distribution =
              more chance of crossing the strike from far away.
            </p>
          </div>

          <div>
            <h4 className="text-slate-200 font-semibold mb-2">Step 4: Confidence Score</h4>
            <p>
              The confidence score ({(confidence * 100).toFixed(0)}%) reflects how trustworthy the probability estimate is.
              It penalizes situations with: few data points, very high volatility (unstable estimates), extreme
              distance-to-strike (tail events are hard to price), and short history. It ranges from 0 (ignore this)
              to 1 (high trust). The confidence score directly widens your spread — low confidence = wider quotes
              = more protection.
            </p>
          </div>

          <div>
            <h4 className="text-slate-200 font-semibold mb-2">Step 5: Market Making Spread Formula</h4>
            <p>
              The half-spread is the margin between your fair value and your posted price. It&apos;s computed as:
            </p>
            <div className="mt-2 rounded bg-slate-900 border border-slate-700 p-3 font-mono text-xs text-slate-300">
              half_spread = max(3¢, min(20¢, base + confidence_penalty + time_penalty + vol_penalty))
              <br />
              base = 5¢ · conf_penalty = (1−C)×10¢ · time_penalty = √(T/30)×2¢ · vol_penalty = min(5¢, σ×15¢)
            </div>
            <p className="mt-2">
              The cap at 20¢ prevents quoting so wide that you&apos;re never filled. The floor at 3¢ ensures
              you always capture at least 6¢ spread (bid to ask) to cover transaction costs and adverse selection.
            </p>
          </div>

          <div>
            <h4 className="text-slate-200 font-semibold mb-2">Step 6: When to Take Directional Risk</h4>
            <p>
              When Kalshi&apos;s market price crosses outside your quote (e.g. Kalshi ask is cheaper than your
              model bid), the signal becomes directional — the market is mispriced badly enough to justify
              taking on inventory rather than just collecting spread. The signal strength (weak/moderate/strong)
              reflects how far outside your quote the market is trading.
            </p>
          </div>

          <div>
            <h4 className="text-slate-200 font-semibold mb-2">Key Risks to Understand</h4>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-slate-300">Model risk:</strong> The log-normal assumption can be wrong — watch prices can gap or mean-revert in ways the model doesn&apos;t capture.</li>
              <li><strong className="text-slate-300">Adverse selection:</strong> Someone trading against you may have better information (e.g. inside knowledge about Bezel&apos;s next update).</li>
              <li><strong className="text-slate-300">Stale data:</strong> If Bezel hasn&apos;t updated today, the volatility and distance-to-strike figures are stale.</li>
              <li><strong className="text-slate-300">Thin market:</strong> Kalshi&apos;s watch markets have low volume — your posted orders may sit for a long time or never fill.</li>
            </ul>
          </div>
        </div>
      </Collapsible>

      {/* ── 4. Historical performance / backtest ─────────────────────────── */}
      <Collapsible title="Historical Model Performance" defaultOpen={true}>
        {probHistory.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate-500">
            No historical runs yet — check back after a few model cycles.
          </div>
        ) : (
          <BacktestChart history={probHistory} strikeDirection={strikeDirection} />
        )}
      </Collapsible>

    </div>
  );
}

// tiny helper — avoids importing formatCurrency from a different path
function formatCurrency(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

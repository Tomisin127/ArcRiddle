import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Lock, Unlock, RefreshCw, ChevronDown, ChevronUp, CircleDollarSign, Zap } from "lucide-react";

interface RiddleResponse {
  question: string;
  answer: string;
  hint: string;
  paid: boolean;
  price_paid: string;
  seller: string;
  network: string;
}

interface PaymentStatus {
  state: "idle" | "instructions" | "fetching" | "success" | "error";
  data?: RiddleResponse;
  error?: string;
}

const SELLER = "0x72110c7117Ee3D0BC77D4682107EA04b02312ED6";
const PRICE = "0.001";

export default function App() {
  const [status, setStatus] = useState<PaymentStatus>({ state: "idle" });
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  function handleReveal() {
    setStatus({ state: "instructions" });
    setShowAnswer(false);
    setShowHint(false);
  }

  async function handleFetch() {
    setStatus({ state: "fetching" });
    setShowAnswer(false);
    setShowHint(false);
    try {
      // x402 Gateway payment happens client-side via the @circle-fin/x402-batching client.
      // In a browser context you call GatewayClient.pay() which handles the 402 handshake.
      // Because this app runs without a browser wallet private key, we surface the paid
      // endpoint URL so agents or CLI users can pay via `circle services pay`.
      // The direct API call here shows the 402 challenge for transparency.
      const res = await fetch("/api/riddle");
      if (res.status === 402) {
        const paymentHeader = res.headers.get("Payment-Required") || res.headers.get("X-PAYMENT-REQUIRED") || "";
        let parsed: Record<string, unknown> = {};
        try {
          const raw: unknown = JSON.parse(paymentHeader);
          if (raw !== null && typeof raw === "object") parsed = raw as Record<string, unknown>;
        } catch { /* ignore */ }
        setStatus({
          state: "error",
          error:
            "Payment required (HTTP 402). Use a Circle agent wallet or the x402 CLI:\n\n" +
            `circle services pay https://<your-domain>/api/riddle --method GET --max-amount ${PRICE}\n\n` +
            "Payment options returned by the server:\n" +
            JSON.stringify(parsed, null, 2),
        });
      } else if (res.ok) {
        const data = (await res.json()) as RiddleResponse;
        setStatus({ state: "success", data });
      } else {
        const text = await res.text();
        setStatus({ state: "error", error: `Server error ${res.status}: ${text}` });
      }
    } catch (err) {
      setStatus({ state: "error", error: String(err) });
    }
  }

  function handleReset() {
    setStatus({ state: "idle" });
    setShowAnswer(false);
    setShowHint(false);
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-start px-4 py-10"
      style={{ background: "var(--bg-gradient)", fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <Zap size={20} style={{ color: "var(--accent)" }} />
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--muted)", letterSpacing: "0.1em" }}
          >
            Arc Mainnet
          </span>
        </div>
        <h1
          className="text-4xl font-bold mb-2 display"
          style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
        >
          Riddle Oracle
        </h1>
        <p className="text-sm max-w-xs mx-auto" style={{ color: "var(--muted)" }}>
          Pay <span className="font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{PRICE} USDC</span> via x402
          Gateway to unlock a riddle. Gasless. Instant. Onchain.
        </p>
      </motion.div>

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "var(--surface-strong)",
          border: "1px solid var(--border)",
          boxShadow: "0 4px 32px rgba(18,45,69,0.08)",
        }}
      >
        {/* Price badge */}
        <div
          className="flex items-center gap-2 px-5 py-3 border-b"
          style={{ background: "var(--surface-muted)", borderColor: "var(--border)" }}
        >
          <CircleDollarSign size={15} style={{ color: "var(--muted)" }} />
          <span className="text-xs font-medium tabular-nums" style={{ color: "var(--muted)" }}>
            {PRICE} USDC per riddle
          </span>
          <span className="ml-auto text-xs font-medium" style={{ color: "var(--muted)" }}>
            x402 / Gateway
          </span>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {/* Idle */}
            {status.state === "idle" && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div
                  className="rounded-xl p-6 mb-5 flex flex-col items-center gap-3 text-center"
                  style={{ background: "var(--surface-muted)", border: "1px dashed var(--border)" }}
                >
                  <Lock size={28} style={{ color: "var(--muted)" }} />
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Your riddle is locked behind a {PRICE} USDC paywall.
                    Each call settles instantly via Circle Gateway on Arc mainnet.
                  </p>
                </div>
                <button
                  onClick={handleReveal}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-colors"
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
                >
                  Pay &amp; Unlock Riddle
                </button>
              </motion.div>
            )}

            {/* Instructions */}
            {status.state === "instructions" && (
              <motion.div key="instructions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div
                  className="rounded-xl p-5 mb-5"
                  style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
                    How to pay
                  </p>
                  <ol className="space-y-3 text-sm" style={{ color: "var(--ink-2)" }}>
                    <li className="flex gap-2">
                      <span className="font-bold" style={{ color: "var(--accent)", minWidth: "1.2rem" }}>1.</span>
                      <span>Set up a Circle agent wallet: <code className="mono text-xs px-1 py-0.5 rounded" style={{ background: "var(--border)", color: "var(--ink)" }}>circle wallet login</code></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold" style={{ color: "var(--accent)", minWidth: "1.2rem" }}>2.</span>
                      <span>Fund with USDC via Gateway: <code className="mono text-xs px-1 py-0.5 rounded" style={{ background: "var(--border)", color: "var(--ink)" }}>circle gateway deposit</code></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold" style={{ color: "var(--accent)", minWidth: "1.2rem" }}>3.</span>
                      <span>Pay for your riddle:</span>
                    </li>
                  </ol>
                  <div
                    className="mt-3 rounded-lg p-3 mono text-xs overflow-x-auto"
                    style={{ background: "var(--ink)", color: "#f9faf3" }}
                  >
                    circle services pay https://&lt;your-domain&gt;/api/riddle \<br />
                    &nbsp;&nbsp;--method GET \<br />
                    &nbsp;&nbsp;--max-amount {PRICE}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { void handleFetch(); }}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold transition-colors"
                    style={{ background: "var(--accent)", color: "#fff" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
                  >
                    Try the endpoint directly
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                    style={{ background: "var(--surface-muted)", color: "var(--ink-2)", border: "1px solid var(--border)" }}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}

            {/* Fetching */}
            {status.state === "fetching" && (
              <motion.div key="fetching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <RefreshCw size={28} style={{ color: "var(--accent)" }} />
                </motion.div>
                <p className="text-sm" style={{ color: "var(--muted)" }}>Calling x402 endpoint...</p>
              </motion.div>
            )}

            {/* Success */}
            {status.state === "success" && status.data && (
              <motion.div key="success" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div
                  className="rounded-xl p-5 mb-4"
                  style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Unlock size={16} style={{ color: "var(--success)" }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--success)" }}>
                      Riddle unlocked
                    </span>
                    <span className="ml-auto text-xs tabular-nums font-medium" style={{ color: "var(--muted)" }}>
                      {status.data.price_paid} paid
                    </span>
                  </div>
                  <p className="text-base font-medium leading-snug mb-4" style={{ color: "var(--ink)", textPretty: "pretty" } as React.CSSProperties}>
                    {status.data.question}
                  </p>

                  {/* Hint toggle */}
                  <button
                    onClick={() => setShowHint((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium mb-2 transition-opacity hover:opacity-70"
                    style={{ color: "var(--muted)" }}
                  >
                    <Lightbulb size={13} />
                    {showHint ? "Hide hint" : "Show hint"}
                    {showHint ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  <AnimatePresence>
                    {showHint && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <p className="text-sm mb-3 italic" style={{ color: "var(--muted)" }}>
                          {status.data.hint}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Answer toggle */}
                  <button
                    onClick={() => setShowAnswer((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ color: "var(--accent)" }}
                  >
                    {showAnswer ? "Hide answer" : "Reveal answer"}
                    {showAnswer ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  <AnimatePresence>
                    {showAnswer && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <p
                          className="mt-2 text-sm font-semibold"
                          style={{ color: "var(--ink)" }}
                        >
                          {status.data.answer}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button
                  onClick={handleReset}
                  className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  style={{ background: "var(--surface-muted)", color: "var(--ink-2)", border: "1px solid var(--border)" }}
                >
                  <RefreshCw size={14} />
                  Get another riddle
                </button>
              </motion.div>
            )}

            {/* Error / 402 */}
            {status.state === "error" && (
              <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div
                  className="rounded-xl p-5 mb-4"
                  style={{ background: "rgba(186,43,76,0.06)", border: "1px solid rgba(186,43,76,0.18)" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--danger)" }}>
                    Payment required
                  </p>
                  <pre
                    className="text-xs leading-relaxed whitespace-pre-wrap break-all mono"
                    style={{ color: "var(--ink-2)" }}
                  >
                    {status.error}
                  </pre>
                </div>
                <button
                  onClick={handleReset}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-colors"
                  style={{ background: "var(--surface-muted)", color: "var(--ink-2)", border: "1px solid var(--border)" }}
                >
                  Back
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Seller info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="mt-6 max-w-md w-full"
      >
        <div
          className="rounded-xl p-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
            Endpoint details
          </p>
          <div className="space-y-1.5">
            <Row label="Endpoint" value="GET /api/riddle" mono />
            <Row label="Price" value={`${PRICE} USDC`} />
            <Row label="Network" value="Arc Mainnet (chain 5042)" />
            <Row label="Protocol" value="x402 / Circle Gateway" />
            <Row
              label="Seller"
              value={`${SELLER.slice(0, 6)}…${SELLER.slice(-4)}`}
              mono
              link={`https://explorer.arc.io/address/${SELLER}`}
            />
          </div>
        </div>
      </motion.div>

      {/* Instructions toggle */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mt-4 max-w-md w-full"
      >
        <button
          onClick={() => setShowInstructions((v) => !v)}
          className="w-full flex items-center justify-between text-xs font-medium px-4 py-3 rounded-xl transition-colors"
          style={{ background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--border)" }}
        >
          <span>Agent / CLI usage guide</span>
          {showInstructions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <AnimatePresence>
          {showInstructions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div
                className="rounded-b-xl px-4 pb-4 pt-3 space-y-3 text-xs"
                style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", color: "var(--ink-2)" }}
              >
                <p className="font-semibold" style={{ color: "var(--ink)" }}>Step 1: Install Circle CLI</p>
                <code className="mono block px-3 py-2 rounded-lg" style={{ background: "var(--ink)", color: "#f9faf3" }}>
                  npm install -g @circle-fin/cli
                </code>
                <p className="font-semibold" style={{ color: "var(--ink)" }}>Step 2: Login &amp; fund wallet</p>
                <code className="mono block px-3 py-2 rounded-lg" style={{ background: "var(--ink)", color: "#f9faf3" }}>
                  circle wallet login{"\n"}circle gateway deposit
                </code>
                <p className="font-semibold" style={{ color: "var(--ink)" }}>Step 3: Pay for riddle</p>
                <code className="mono block px-3 py-2 rounded-lg whitespace-pre" style={{ background: "var(--ink)", color: "#f9faf3" }}>
                  {`circle services pay https://<your-domain>/api/riddle \\\n  --method GET \\\n  --max-amount ${PRICE}`}
                </code>
                <p style={{ color: "var(--muted)" }}>
                  Replace <span className="mono">&lt;your-domain&gt;</span> with your Hugging Face Space URL after deploy.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  mono?: boolean;
  link?: string;
}
function Row({ label, value, mono, link }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs" style={{ color: "var(--muted)" }}>{label}</span>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-xs font-medium underline underline-offset-2 ${mono ? "mono" : ""}`}
          style={{ color: "var(--accent)" }}
        >
          {value}
        </a>
      ) : (
        <span className={`text-xs font-medium ${mono ? "mono" : ""} tabular-nums`} style={{ color: "var(--ink)" }}>
          {value}
        </span>
      )}
    </div>
  );
}

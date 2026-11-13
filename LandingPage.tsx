import { useAuth } from "@/lib/auth";
import {
  Wallet,
  ArrowRight,
  Shield,
  Zap,
  Send,
  ArrowDownToLine,
  Lock,
  Hash,
  CheckCircle2,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

export default function LandingPage({ onGetStarted }: { onGetStarted: (mode: "login" | "register") => void }) {
  const { session } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Wallet className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-bold tracking-tight">ZOS</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#about" className="text-sm text-slate-400 hover:text-white transition-colors">About</a>
            <a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors">Features</a>
            <a href="#how" className="text-sm text-slate-400 hover:text-white transition-colors">How It Works</a>
            <a href="#faq" className="text-sm text-slate-400 hover:text-white transition-colors">FAQ</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {session ? (
              <button
                onClick={() => onGetStarted("login")}
                className="px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-medium rounded-lg hover:from-teal-400 hover:to-emerald-500 transition-all shadow-lg shadow-teal-500/20"
              >
                Open Wallet
              </button>
            ) : (
              <>
                <button
                  onClick={() => onGetStarted("login")}
                  className="text-sm text-slate-300 hover:text-white font-medium transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => onGetStarted("register")}
                  className="px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-medium rounded-lg hover:from-teal-400 hover:to-emerald-500 transition-all shadow-lg shadow-teal-500/20"
                >
                  Get Started
                </button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-slate-400 p-2"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-4 space-y-3">
            <a href="#about" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-400 hover:text-white">About</a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-400 hover:text-white">Features</a>
            <a href="#how" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-400 hover:text-white">How It Works</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-400 hover:text-white">FAQ</a>
            <div className="pt-2 space-y-2">
              <button
                onClick={() => { onGetStarted("login"); setMobileMenuOpen(false); }}
                className="w-full py-2.5 text-sm text-slate-300 font-medium border border-slate-700 rounded-lg"
              >
                Sign In
              </button>
              <button
                onClick={() => { onGetStarted("register"); setMobileMenuOpen(false); }}
                className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white text-sm font-medium rounded-lg"
              >
                Get Started
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="https://images.pexels.com/photos/28103660/pexels-photo-28103660.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
            alt="Mongolian steppe"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/80 to-slate-950" />
          <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 md:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-full mb-6">
            <span className="w-2 h-2 bg-teal-400 rounded-full animate-pulse" />
            <span className="text-xs text-teal-300 font-medium">1 ZOS = 1 ₮ (MNT) · Always pegged</span>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            The virtual currency
            <br />
            <span className="bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
              pegged to the Tugrik
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            ZOS is a digital currency built for Mongolia — pegged 1:1 to the Tugrik,
            powered by Qpay for deposits, and designed for instant peer-to-peer transfers.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onGetStarted("register")}
              className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-medium rounded-xl hover:from-teal-400 hover:to-emerald-500 transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2"
            >
              Create your ZOS account
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onGetStarted("login")}
              className="w-full sm:w-auto px-7 py-3.5 bg-slate-800/50 border border-slate-700 text-white font-medium rounded-xl hover:bg-slate-800 transition-all"
            >
              Sign In
            </button>
          </div>

          <p className="text-xs text-slate-600 mt-4">
            Just a username and password — you'll get a random 8-digit ZOS ID instantly.
          </p>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-slate-800 bg-slate-900/30">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <Stat label="Pegged to" value="1 ₮" sub="Mongolian Tugrik" />
          <Stat label="Daily deposit limit" value="100K" sub="₮ per day" />
          <Stat label="ZOS ID" value="8 digits" sub="Random & unique" />
          <Stat label="Powered by" value="Qpay" sub="For deposits" />
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-sm font-medium text-teal-400 uppercase tracking-wider">About ZOS</span>
              <h2 className="text-3xl md:text-4xl font-bold mt-3 mb-6 tracking-tight">
                A digital tugrik that moves at the speed of the internet
              </h2>
              <p className="text-slate-400 leading-relaxed mb-4">
                ZOS brings the stability of the Mongolian Tugrik into the digital world.
                Every 1 ZOS is always worth 1 ₮ — no volatility, no speculation. Just a
                reliable way to send and receive money online.
              </p>
              <p className="text-slate-400 leading-relaxed">
                Fund your wallet with Qpay, the payment platform Mongolians already trust,
                and send ZOS to anyone with an 8-digit ZOS ID. No bank details, no phone
                numbers — just an ID.
              </p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 md:p-8">
              <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-800">
                <div>
                  <p className="text-sm text-slate-500">ZOS / MNT</p>
                  <p className="text-2xl font-bold">1.00</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Peg</p>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Stable</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <PegRow label="1 ZOS" value="1.00 ₮" />
                <PegRow label="100 ZOS" value="100.00 ₮" />
                <PegRow label="1,000 ZOS" value="1,000.00 ₮" />
                <PegRow label="10,000 ZOS" value="10,000.00 ₮" />
                <PegRow label="100,000 ZOS" value="100,000.00 ₮" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 md:py-28 bg-slate-900/30 border-y border-slate-800">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="text-center mb-14">
            <span className="text-sm font-medium text-teal-400 uppercase tracking-wider">Features</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 tracking-tight">
              Everything you need to send and receive
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={Shield}
              title="Pegged to the Tugrik"
              desc="1 ZOS is always 1 ₮. No price swings, no surprises. Your money holds its value."
            />
            <FeatureCard
              icon={ArrowDownToLine}
              title="Fund with Qpay"
              desc="Deposit tugrik directly via Qpay — the payment method Mongolians already use every day."
            />
            <FeatureCard
              icon={Send}
              title="Instant transfers"
              desc="Send ZOS to anyone using their 8-digit ZOS ID. No bank info, no phone numbers needed."
            />
            <FeatureCard
              icon={Hash}
              title="Your private ZOS ID"
              desc="Every account gets a random, unique 8-digit ID. Share it to receive — keep your details private."
            />
            <FeatureCard
              icon={Lock}
              title="Secured by design"
              desc="Balances are protected server-side. Every transfer is verified and atomic — no double spending."
            />
            <FeatureCard
              icon={Zap}
              title="Simple by default"
              desc="Just a username and password. No emails, no phone verification, no clutter. Sign up in seconds."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="text-center mb-14">
            <span className="text-sm font-medium text-teal-400 uppercase tracking-wider">How It Works</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 tracking-tight">
              Get started in three steps
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              num="01"
              icon={Wallet}
              title="Create your account"
              desc="Pick a username and password. You'll instantly receive a random 8-digit ZOS ID for receiving payments."
            />
            <StepCard
              num="02"
              icon={ArrowDownToLine}
              title="Deposit with Qpay"
              desc="Fund your wallet by paying via Qpay. Deposit up to 100,000 ₮ per day — 1 ₮ becomes 1 ZOS instantly."
            />
            <StepCard
              num="03"
              icon={Send}
              title="Send to anyone"
              desc="Enter a recipient's 8-digit ZOS ID, type an amount, and hit send. The transfer is instant and secure."
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 md:py-28 bg-slate-900/30 border-y border-slate-800">
        <div className="max-w-3xl mx-auto px-4 md:px-6">
          <div className="text-center mb-14">
            <span className="text-sm font-medium text-teal-400 uppercase tracking-wider">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-bold mt-3 tracking-tight">
              Questions, answered
            </h2>
          </div>

          <div className="space-y-4">
            <FaqItem
              q="What is ZOS?"
              a="ZOS is a virtual currency pegged 1:1 to the Mongolian Tugrik (MNT). 1 ZOS always equals 1 ₮. It's designed for digital payments and peer-to-peer transfers within the ZOS network."
            />
            <FaqItem
              q="How do I get a ZOS ID?"
              a="When you register with a username and password, the system automatically assigns you a random, unique 8-digit ZOS ID (like 04839217). Share this ID with others so they can send you ZOS."
            />
            <FaqItem
              q="How do I deposit money?"
              a="Deposits are powered by Qpay. Enter the amount you want to deposit (up to 100,000 ₮ per day), scan the Qpay QR code with your banking app, and confirm the payment. Your ZOS balance updates instantly."
            />
            <FaqItem
              q="Is there a deposit limit?"
              a="Yes. You can deposit up to 100,000 ₮ per calendar day. This limit is enforced server-side and includes both pending and confirmed deposits."
            />
            <FaqItem
              q="How do I send ZOS to someone?"
              a="Go to the Send page, enter the recipient's 8-digit ZOS ID, type the amount, and optionally add a note. The app verifies the recipient exists before you confirm, and the transfer is instant."
            />
            <FaqItem
              q="Do I need to share personal info?"
              a="No. You only need a username and password. Your ZOS ID is a random number — you share it to receive money, and your personal details stay private."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-4 md:px-6 text-center">
          <div className="relative overflow-hidden bg-gradient-to-br from-teal-500/10 to-emerald-600/10 border border-teal-500/20 rounded-3xl p-10 md:p-14">
            <div className="absolute top-0 right-0 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Ready to start using ZOS?
              </h2>
              <p className="text-slate-400 mb-8 max-w-md mx-auto">
                Create your account in seconds. Get your ZOS ID, deposit via Qpay, and start sending.
              </p>
              <button
                onClick={() => onGetStarted("register")}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-medium rounded-xl hover:from-teal-400 hover:to-emerald-500 transition-all shadow-lg shadow-teal-500/20"
              >
                Create your ZOS account
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-10">
        <div className="max-w-5xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold tracking-tight">ZOS</span>
            <span className="text-slate-600 text-sm">· 1 ZOS = 1 ₮</span>
          </div>
          <p className="text-xs text-slate-600">
            Virtual currency pegged to the Mongolian Tugrik · Powered by Qpay
          </p>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function PegRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-medium text-white font-mono">{value}</span>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Shield;
  title: string;
  desc: string;
}) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-teal-500/30 transition-all group">
      <div className="w-11 h-11 rounded-xl bg-teal-500/10 group-hover:bg-teal-500/20 flex items-center justify-center mb-4 transition-all">
        <Icon className="w-5 h-5 text-teal-400" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function StepCard({
  num,
  icon: Icon,
  title,
  desc,
}: {
  num: string;
  icon: typeof Wallet;
  title: string;
  desc: string;
}) {
  return (
    <div className="relative">
      <div className="absolute -top-2 -right-2 text-5xl font-bold text-slate-800/50 select-none">
        {num}
      </div>
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-teal-500/20">
          <Icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-medium text-white pr-4">{q}</span>
        <span className={`text-teal-400 text-xl flex-shrink-0 transition-transform ${open ? "rotate-45" : ""}`}>
          +
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4">
          <p className="text-sm text-slate-400 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

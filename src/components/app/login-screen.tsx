'use client'
import { useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Gem, Loader2, Lock, Shield, User, BarChart3, Coins, Receipt, HandCoins } from 'lucide-react'
import { toast } from 'sonner'

// No "Load Demo Data" button: seeding was an unauthenticated POST that wrote firms and logins to
// whatever database the server was pointed at. Demo data is now `npx prisma db seed`, run by a human.
export function LoginScreen() {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await signIn('credentials', {
        loginId,
        password,
        redirect: false,
      })

      // No automatic retry: every refused attempt counts against the brute-force limit, so one
      // wrong password must cost exactly one attempt. 'TooManyAttempts' is TOO_MANY_ATTEMPTS in
      // src/lib/auth.ts (not imported: that module is server-only).
      if (!res || res.error || !res.ok) {
        if (res?.error === 'TooManyAttempts') {
          throw new Error('Too many failed sign-in attempts. Please wait 15 minutes and try again.')
        }
        throw new Error('Invalid login ID or password')
      }

      toast.success('Welcome to OmGold ERP')

      // Force-fetch the new session and broadcast it to useSession hooks
      // This avoids a full page reload (which can lose the cookie behind proxies)
      await getSession({ triggerEvent: true })

      // Small delay to let React update, then reload once to ensure fresh state
      setTimeout(() => window.location.replace('/'), 500)
    } catch (err: any) {
      toast.error(err.message || 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 via-orange-50/40 to-stone-100 dark:from-stone-900 dark:via-stone-900 dark:to-black">
      {/* Top nav */}
      <header className="border-b border-amber-200/60 dark:border-stone-800 bg-white/70 dark:bg-stone-950/70 backdrop-blur">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-700 grid place-items-center text-white shadow-lg shadow-amber-500/30">
              <Gem className="size-5" />
            </div>
            <div>
              <p className="font-bold text-lg leading-none text-stone-800 dark:text-stone-100">OmGold<span className="text-amber-600"> ERP</span></p>
              <p className="text-[10px] text-stone-500">Jewellery • Gold Loan • Accounting</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-stone-600 dark:text-stone-300">
            <a className="hover:text-amber-600" href="#features">Features</a>
            <a className="hover:text-amber-600" href="#modules">Modules</a>
          </nav>
        </div>
      </header>

      {/* Hero + login */}
      <main className="flex-1 grid lg:grid-cols-2">
        {/* Left hero */}
        <section className="hidden lg:flex flex-col justify-center px-12 xl:px-20 py-12 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 size-80 rounded-full bg-amber-300/30 blur-3xl" />
          <div className="absolute bottom-0 -left-20 size-72 rounded-full bg-orange-300/20 blur-3xl" />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative max-w-xl"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 dark:bg-amber-950/50 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 ring-1 ring-amber-200">
              <Shield className="size-3.5" /> Trusted by 1000+ jewellers
            </span>
            <h1 className="mt-5 text-4xl xl:text-5xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
              The complete <span className="text-amber-600">Jewellery ERP</span> & Gold Loan software
            </h1>
            <p className="mt-4 text-stone-600 dark:text-stone-300 text-lg">
              Manage billing & accounting, stock, gold loans (girvi), schemes, udhaar and full double-entry books — in one beautiful dashboard.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                { icon: Receipt, title: 'GST Billing', desc: 'CGST/SGST/IGST invoices' },
                { icon: Coins, title: 'Gold Loans', desc: 'Active, released, auctioned' },
                { icon: BarChart3, title: 'Live Reports', desc: 'Stock & sales analytics' },
                { icon: HandCoins, title: 'Udhaar & Schemes', desc: 'Money lending & kitty' },
              ].map((f) => (
                <div key={f.title} className="rounded-xl border border-amber-200/60 bg-white/60 dark:bg-stone-900/60 p-4">
                  <f.icon className="size-5 text-amber-600" />
                  <p className="mt-2 font-semibold text-stone-800 dark:text-stone-100">{f.title}</p>
                  <p className="text-xs text-stone-500">{f.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Right login */}
        <section className="flex items-center justify-center px-4 py-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full max-w-md"
          >
            <div className="rounded-2xl border border-amber-200/70 bg-white dark:bg-stone-950 shadow-xl shadow-amber-500/5 p-6 sm:p-8">
              <div className="text-center mb-6">
                <div className="mx-auto size-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-700 grid place-items-center text-white shadow-lg">
                  <Gem className="size-6" />
                </div>
                <h2 className="mt-4 text-2xl font-bold text-stone-800 dark:text-stone-100">Sign in to your account</h2>
                <p className="text-sm text-stone-500 mt-1">Use your login ID or email to continue</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="loginId">Login ID / Email ID</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400" />
                    <Input id="loginId" className="pl-9" placeholder="Login ID or email" value={loginId} onChange={(e) => setLoginId(e.target.value)} required autoFocus />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button type="button" className="text-xs text-amber-600 hover:underline">Forgot password?</button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400" />
                    <Input id="password" type="password" className="pl-9" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                </div>
                <Button type="submit" className="w-full btn-brand hover:opacity-95 text-white" disabled={loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                  {loading ? 'Signing in…' : 'LOGIN'}
                </Button>
              </form>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-amber-200/60 dark:border-stone-800 bg-white/70 dark:bg-stone-950/70">
        <div className="container mx-auto px-4 py-4 text-center text-xs text-stone-500">
          © {new Date().getFullYear()} OmGold ERP. Built with Next.js, Prisma & React Native.
        </div>
      </footer>
    </div>
  )
}

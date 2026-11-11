import React from 'react';

const Shell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="min-h-screen bg-[#0a0a0b] text-white/85 px-5 py-10 animate-fade-in">
    <div className="max-w-3xl mx-auto">
      <a href="/" className="text-blue-400 text-sm hover:underline">← Back to ZenHR</a>
      <h1 className="text-3xl font-bold text-white mt-4 mb-2">{title}</h1>
      <p className="text-white/50 text-sm mb-8">Effective date: [Effective Date] · Placeholders in [brackets] need confirmation.</p>
      <div className="space-y-6 leading-relaxed">{children}</div>
      <footer className="mt-12 pt-6 border-t border-white/10 text-sm text-white/50 flex gap-4">
        <a href="/privacy" className="hover:text-white">Privacy</a>
        <a href="/terms" className="hover:text-white">Terms</a>
      </footer>
    </div>
  </div>
);
const S: React.FC<{ h: string; children: React.ReactNode }> = ({ h, children }) => (
  <section><h2 className="text-xl font-semibold text-white mb-2">{h}</h2>{children}</section>
);

export const PrivacyPolicy = () => (
  <Shell title="Privacy Policy">
    <S h="Who we are">[Company Name], [Registered Address] ("we") operates ZenHR, an HR, attendance and payroll app used by employers and their staff.</S>
    <S h="Information we collect">Account details (name, phone, email), employment and salary records, attendance punches including location, face or fingerprint check-in data, punch photos, bank details for salary payment, tax declarations, and device information for notifications.</S>
    <S h="How we use it">To record attendance, calculate and pay salaries, meet statutory duties (PF, ESI, TDS), send work alerts, and keep the service secure. We do not sell personal data.</S>
    <S h="Retention">Punch photos are kept for 30 days. Payroll and tax records are kept as long as the law requires, then deleted.</S>
    <S h="Sharing">Only with your employer, the banks and government portals needed for payment and compliance, and service providers that host the app.</S>
    <S h="Your rights">You can ask to see, correct or delete your data through your employer or by writing to [Support Email].</S>
    <S h="Grievance officer">[Grievance Officer Name], [Support Email], [Phone Number].</S>
  </Shell>
);

export const TermsOfService = () => (
  <Shell title="Terms of Service">
    <S h="Agreement">By using ZenHR you agree to these terms with [Company Name].</S>
    <S h="Accounts">Employers are responsible for the staff they add and the accuracy of salary, attendance and bank details. Keep your login private.</S>
    <S h="Payments">ZenHR prepares salary and bank files. Money is moved only by your bank; a payout is final only once a bank reference (UTR) is recorded.</S>
    <S h="Acceptable use">Do not misuse the service, attempt to access other companies' data, or upload unlawful content.</S>
    <S h="Fees">Subscription fees are as listed in your plan: [Pricing Details].</S>
    <S h="Liability">The service is provided "as is". Our total liability is limited to fees paid in the last [Number] months.</S>
    <S h="Governing law">These terms are governed by the laws of [Jurisdiction]. Contact: [Support Email].</S>
  </Shell>
);

export const NotFound = () => (
  <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-6 text-center animate-fade-in">
    <div>
      <p className="text-7xl font-black text-blue-500">404</p>
      <h1 className="text-2xl font-bold text-white mt-3">Page not found</h1>
      <p className="text-white/55 mt-2">The page you're looking for doesn't exist or was moved.</p>
      <a href="/" className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-500 active:scale-95 transition">Go home</a>
    </div>
  </div>
);

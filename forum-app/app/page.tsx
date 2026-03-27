import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Komumech Forum | High-Performance Video Meetings",
  description: "Engineering the next generation of the web. Secure, high-performance video communication for everyone.",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-blue-100">
      
      {/* --- GLASS NAVIGATION --- */}
      <nav className="fixed top-0 w-full h-16 bg-white/80 backdrop-blur-lg border-b border-slate-200 z-50 flex items-center justify-between px-6 lg:px-8">
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 bg-slate-900 rounded-md flex items-center justify-center text-white font-bold text-sm shadow-sm">K</div>
           <span className="font-bold tracking-tight text-slate-900">KOMUMECH</span>
        </div>
        
        <div className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
          <Link href="#home" className="hover:text-blue-600 transition-colors">Home</Link>
          <Link href="#premium" className="hover:text-blue-600 transition-colors">Premium</Link>
          <Link href="#ai" className="hover:text-blue-600 transition-colors">AI in Forum</Link>
          <Link href="#connect" className="hover:text-blue-600 transition-colors">Connect</Link>
          <Link href="#collaborate" className="hover:text-blue-600 transition-colors">Collaborate</Link>
          <Link href="#secure" className="hover:text-blue-600 transition-colors">Secure</Link>
          <Link href="#customers" className="hover:text-blue-600 transition-colors">Customers</Link>
          <Link href="#faqs" className="hover:text-blue-600 transition-colors">FAQs</Link>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-600 hidden sm:block cursor-pointer hover:text-slate-900">Sign in</span>
          <button className="hidden sm:block border border-slate-300 text-blue-600 px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-50 transition-colors">
            Try Forum for work
          </button>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <main id="home" className="pt-32 pb-16 px-6 max-w-5xl mx-auto flex flex-col items-center text-center">
        <h1 className="text-4xl md:text-6xl font-normal tracking-tight text-slate-800 mb-6">
          Video calls and meetings for everyone
        </h1>
        <p className="text-lg md:text-xl text-slate-500 mb-10 max-w-2xl leading-relaxed font-light">
          Connect, collaborate, and celebrate from anywhere with Forum
        </p>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <button className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 transition-colors shadow-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            New meeting
          </button>
          
          <div className="w-full sm:w-auto relative flex items-center">
            <div className="absolute left-3 text-slate-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            </div>
            <input 
              type="text" 
              placeholder="Enter a code or link" 
              className="w-full sm:w-64 pl-10 pr-4 py-3 border border-slate-300 rounded-md focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-slate-700"
            />
          </div>
          <button className="text-slate-400 font-medium px-2 cursor-not-allowed hidden sm:block">Join</button>
        </div>

        <div className="mt-8">
          <a href="#" className="text-sm text-slate-500 hover:underline">Learn more</a> <span className="text-slate-500 text-sm">about Forum</span>
        </div>

        {/* CSS Memphis Illustration Area (Replicating the bottom half circle of the Google screenshot) */}
        <div className="mt-16 relative w-full max-w-2xl h-64 overflow-hidden rounded-t-[200px] border-t border-l border-r border-slate-100 bg-slate-50 flex justify-center items-end pb-0">
            {/* Memphis Shapes */}
            <div className="absolute bottom-10 left-20 w-16 h-16 bg-yellow-400 rounded-full mix-blend-multiply opacity-80 animate-pulse"></div>
            <div className="absolute bottom-24 right-32 w-20 h-20 bg-blue-400 rounded-full mix-blend-multiply opacity-80"></div>
            <div className="absolute bottom-4 left-1/2 w-32 h-32 bg-red-400 rounded-full mix-blend-multiply opacity-80"></div>
            {/* Wireframe UI blocks */}
            <div className="w-3/4 h-48 bg-white border border-slate-200 rounded-t-2xl shadow-sm relative overflow-hidden flex flex-wrap">
              <div className="w-1/2 h-1/2 border-r border-b border-slate-100 bg-slate-50 flex items-center justify-center"><div className="w-12 h-12 bg-slate-200 rounded-full"></div></div>
              <div className="w-1/2 h-1/2 border-b border-slate-100 bg-white flex items-center justify-center"><div className="w-12 h-12 bg-yellow-100 rounded-full"></div></div>
              <div className="w-1/2 h-1/2 border-r border-slate-100 bg-white flex items-center justify-center"><div className="w-12 h-12 bg-blue-100 rounded-full"></div></div>
              <div className="w-1/2 h-1/2 bg-slate-50 flex items-center justify-center"><div className="w-12 h-12 bg-red-100 rounded-full"></div></div>
            </div>
        </div>
      </main>

      <hr className="border-slate-100" />

      {/* --- PRODUCTION FEATURES SECTIONS --- */}
      <section id="premium" className="py-20 px-6 max-w-6xl mx-auto scroll-mt-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-normal text-slate-800 mb-4">Do more with premium features</h2>
          <p className="text-slate-500">Sign up for a Forum Workspace or Premium plan to access premium features.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { title: "Meet longer", desc: "Hold group calls for up to 24 hours." },
            { title: "Keep a record", desc: "Use recordings and transcripts to capture what was discussed." },
            { title: "Host larger meetings", desc: "Add up to 1000 participants." }
          ].map((feat, i) => (
            <div key={i} className="flex flex-col items-start p-6 rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded uppercase tracking-wider mb-4">Premium feature</span>
              <h3 className="text-xl font-medium text-slate-800 mb-2">{feat.title}</h3>
              <p className="text-slate-500">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- AI SECTION --- */}
      <section id="ai" className="py-20 bg-slate-900 text-white overflow-hidden scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1 space-y-6">
            <span className="text-blue-400 font-bold tracking-widest text-xs uppercase">Intelligence Built-in</span>
            <h2 className="text-4xl font-normal">AI-powered collaboration</h2>
            <p className="text-lg text-slate-400 leading-relaxed">
              Forum utilizes advanced Komumech AI to enhance audio quality, provide real-time noise cancellation, and generate automated meeting summaries so you can focus on the conversation.
            </p>
          </div>
          <div className="flex-1 w-full">
            <div className="aspect-video bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl border border-white/10 flex items-center justify-center relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 bg-blue-500/30 rounded-full blur-3xl animate-pulse"></div>
              </div>
              <div className="z-10 text-center space-y-4">
                <div className="flex justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="w-1 bg-blue-400 rounded-full animate-wave" style={{ height: `${20 + Math.random() * 40}px`, animationDelay: `${i * 0.1}s` }}></div>
                  ))}
                </div>
                <p className="text-xs font-mono text-blue-300">PROCESSING AUDIO...</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- CONNECT SECTION --- */}
      <section id="connect" className="py-24 px-6 max-w-6xl mx-auto text-center scroll-mt-20">
        <h2 className="text-4xl font-normal text-slate-800 mb-6">Connect from anywhere</h2>
        <p className="text-lg text-slate-500 mb-12 max-w-2xl mx-auto">Seamlessly transition between your phone, tablet, and desktop. Forum stays in sync so you never miss a beat.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['Mobile', 'Tablet', 'Desktop', 'Web'].map((device) => (
            <div key={device} className="p-8 border border-slate-100 rounded-2xl bg-slate-50/50 hover:bg-white hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-white rounded-xl shadow-sm mx-auto mb-4 flex items-center justify-center text-slate-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              </div>
              <span className="font-medium text-slate-700">{device}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Text/Content Split Block (Like your second screenshot) */}
      <section id="collaborate" className="py-20 px-6 max-w-6xl mx-auto flex flex-col md:flex-row-reverse items-center gap-16 scroll-mt-20">
        <div className="flex-1 space-y-6">
          <h2 className="text-4xl font-normal text-slate-800">Enjoy every moment</h2>
          <p className="text-lg text-slate-500 leading-relaxed">
            Make your time together fun. Watch YouTube videos, listen to music, and play games with Meet live sharing. Enjoy interactive features like effects and emoji reactions.
          </p>
        </div>
        
        {/* Glassmorphism Video UI Mockup */}
        <div className="flex-1 relative w-full h-80 bg-slate-50 rounded-3xl border border-slate-200 overflow-hidden flex items-center justify-center">
            {/* Background elements */}
            <div className="absolute top-4 left-4 w-48 h-32 bg-white rounded-xl shadow-md border border-slate-100 flex items-end p-2 z-10">
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"><div className="w-1/3 h-full bg-red-500"></div></div>
            </div>
            <div className="absolute top-10 right-10 w-40 h-28 bg-blue-100/50 backdrop-blur-md rounded-xl shadow-lg border border-white/40 z-20 flex items-center justify-center">
              <div className="w-12 h-12 bg-blue-500 rounded-full animate-bounce text-white flex items-center justify-center shadow-lg shadow-blue-200">👋</div>
            </div>
            
            {/* Fake Chat overlay */}
            <div className="absolute bottom-6 right-6 bg-white rounded-2xl rounded-br-none shadow-xl border border-slate-100 p-4 max-w-[200px] z-30">
              <p className="text-sm text-slate-700">Hi there 👋 What brings you to Forum Workspace today?</p>
            </div>
            <div className="absolute bottom-4 right-[-10px] w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg cursor-pointer z-40">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            </div>
        </div>
      </section>

      {/* --- PROFESSIONAL FOOTER --- */}
      <footer className="bg-slate-50 border-t border-slate-200 pt-16 pb-8 mt-20">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <h4 className="font-medium text-slate-900 mb-4">Included applications</h4>
            <ul className="space-y-3 text-sm text-slate-500">
              <li><a href="#" className="hover:text-blue-600">Gmail</a></li>
              <li><a href="#" className="hover:text-blue-600">Forum</a></li>
              <li><a href="#" className="hover:text-blue-600">Chat</a></li>
              <li><a href="#" className="hover:text-blue-600">Calendar</a></li>
              <li><a href="#" className="hover:text-blue-600">Drive</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-900 mb-4">Security and management</h4>
            <ul className="space-y-3 text-sm text-slate-500">
              <li><a href="#" className="hover:text-blue-600">Admin</a></li>
              <li><a href="#" className="hover:text-blue-600">Endpoint</a></li>
              <li><a href="#" className="hover:text-blue-600">Vault</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-900 mb-4">Solutions</h4>
            <ul className="space-y-3 text-sm text-slate-500">
              <li><a href="#" className="hover:text-blue-600">New Business</a></li>
              <li><a href="#" className="hover:text-blue-600">Enterprise</a></li>
              <li><a href="#" className="hover:text-blue-600">Education</a></li>
              <li><a href="#" className="hover:text-blue-600">Healthcare</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-900 mb-4">Pricing</h4>
            <ul className="space-y-3 text-sm text-slate-500">
              <li><a href="#" className="hover:text-blue-600">Compare pricing plans</a></li>
              <li><a href="#" className="hover:text-blue-600">Add-ons</a></li>
              <li><a href="#" className="hover:text-blue-600">Forum hardware</a></li>
            </ul>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between border-t border-slate-200 pt-8">
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <span className="font-medium text-slate-900">Forum Products</span>
            <a href="#" className="hover:text-blue-600">Privacy</a>
            <a href="#" className="hover:text-blue-600">Terms</a>
            <a href="#" className="hover:text-blue-600">About</a>
          </div>
          <div className="mt-4 md:mt-0 text-sm text-slate-400">
            Designed for the modern digital aesthetic.
          </div>
        </div>
      </footer>

    </div>
  );
}
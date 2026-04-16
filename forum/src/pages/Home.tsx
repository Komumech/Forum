import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Keyboard, Plus, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const [roomCode, setRoomCode] = useState('');
  const navigate = useNavigate();
  const { user, login, logout, loading, preferences } = useAuth();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      navigate(`/meeting/${roomCode.trim()}`);
    }
  };

  const handleNewMeeting = () => {
    const randomCode = Math.random().toString(36).substring(2, 10);
    navigate(`/meeting/${randomCode}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-light flex items-center justify-center">
        <div className="w-10 h-10 border-[3px] border-accent-blue border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-light flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent-blue rounded-lg flex items-center justify-center">
            <Video className="text-white" size={20} />
          </div>
          <span className="text-xl font-medium text-text-primary-light">Forum</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-text-secondary-light hidden md:block">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          {user ? (
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/dashboard')} className="text-sm font-bold text-accent-blue hover:underline">Go to Dashboard</button>
              <div className="w-8 h-8 rounded-full bg-surface-lighter-light overflow-hidden border border-gray-200">
                <img src={user.photoURL || `https://picsum.photos/seed/${user.uid}/32/32`} alt="User" referrerPolicy="no-referrer" />
              </div>
            </div>
          ) : (
            <button 
              onClick={login}
              className="bg-accent-blue text-white px-4 py-2 rounded-md font-medium hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center px-6 lg:px-24 gap-12 lg:gap-24">
        <div className="max-w-xl space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-normal text-text-primary-light leading-tight">
              Video calls and meetings for everyone
            </h1>
            <p className="text-xl text-text-secondary-light font-light">
              Connect, collaborate, and celebrate from anywhere with Forum.
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4">
            <button 
              onClick={handleNewMeeting}
              className="w-full md:w-auto flex items-center justify-center gap-2 bg-accent-blue hover:bg-blue-600 text-white px-6 py-3 rounded-md font-medium transition-colors shadow-lg shadow-accent-blue/20"
            >
              <Plus size={20} />
              New meeting
            </button>

            <form onSubmit={handleJoin} className="w-full md:w-auto flex items-center gap-2 border border-gray-200 bg-white rounded-md px-3 py-1 focus-within:border-accent-blue focus-within:ring-1 focus-within:ring-accent-blue transition-all">
              <Keyboard className="text-text-secondary-light" size={20} />
              <input 
                type="text" 
                placeholder="Enter a code or link" 
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                className="flex-1 py-2 outline-none text-text-primary-light bg-transparent"
              />
              <button 
                type="submit"
                disabled={!roomCode.trim()}
                className="text-accent-blue font-medium disabled:text-text-secondary-light transition-colors"
              >
                Join
              </button>
            </form>
          </div>

          {user && preferences?.lastRoom && (
            <div className="p-4 bg-surface-lighter-light rounded-xl border border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent-blue/10 rounded-lg text-accent-blue">
                  <Info size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-text-secondary-light uppercase tracking-wider">Recent meeting</p>
                  <p className="text-sm font-medium text-text-primary-light">{preferences.lastRoom}</p>
                </div>
              </div>
              <button 
                onClick={() => navigate(`/meeting/${preferences.lastRoom}`)}
                className="text-accent-blue text-sm font-semibold hover:underline"
              >
                Rejoin
              </button>
            </div>
          )}

          <div className="pt-8 border-t border-gray-100">
            <p className="text-text-secondary-light">
              <span className="text-accent-blue cursor-pointer hover:underline">Learn more</span> about Forum Meet
            </p>
          </div>
        </div>

        <div className="flex-1 max-w-lg">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="relative aspect-square rounded-full bg-surface-light flex items-center justify-center p-12 border border-gray-100"
          >
            <div className="relative w-full h-full rounded-full overflow-hidden shadow-2xl border-4 border-white">
              <img 
                src="https://picsum.photos/seed/meeting/800/800" 
                alt="Meeting Illustration" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            {/* Decorative elements */}
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-accent-blue/10 rounded-full blur-2xl opacity-60" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-accent-red/10 rounded-full blur-3xl opacity-60" />
          </motion.div>
        </div>
      </main>
    </div>
  );
}

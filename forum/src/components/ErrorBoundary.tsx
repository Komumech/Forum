import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, MessageSquarePlus, Check } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showFeedbackForm: boolean;
  feedbackText: string;
  isSending: boolean;
  sentFeedback: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      showFeedbackForm: false,
      feedbackText: '',
      isSending: false,
      sentFeedback: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private getErrorMessage(): string {
    let errorMessage = 'An unexpected error occurred.';
    try {
      const errorData = JSON.parse(this.state.error?.message || '');
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      if (this.state.error?.message) {
        errorMessage = this.state.error.message;
      }
    }
    return errorMessage;
  }

  private handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (this.state.isSending) return;
    this.setState({ isSending: true });
    const msg = this.getErrorMessage();
    try {
      await addDoc(collection(db, 'meetingFeedback'), {
        category: 'error_report',
        roomId: 'app-crash',
        meetingTitle: 'Issue: Application Error',
        errorContext: msg,
        rating: 1,
        comment: this.state.feedbackText.trim() || `Crash report: ${msg}`,
        userId: 'guest',
        userName: 'Forum User',
        pageUrl: typeof window !== 'undefined' ? window.location.pathname : '',
        isGuest: true,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });
      this.setState({ sentFeedback: true, isSending: false });
    } catch (err) {
      console.error('Failed to send error feedback:', err);
      this.setState({ isSending: false });
    }
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.getErrorMessage();

      return (
        <div className="min-h-screen bg-[#FBFBFA] flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white border border-neutral-200/80 p-8 rounded-2xl shadow-xs space-y-6">
            <div className="w-14 h-14 bg-rose-50 border border-rose-200/70 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="text-rose-600" size={26} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-medium text-slate-900 tracking-tight">Something went wrong</h2>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed break-words">
                {errorMessage}
              </p>
            </div>

            {this.state.sentFeedback ? (
              <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/70 text-emerald-800 text-xs flex items-center justify-center gap-2">
                <Check size={14} />
                <span>Feedback sent — thank you.</span>
              </div>
            ) : this.state.showFeedbackForm ? (
              <form onSubmit={this.handleSendFeedback} className="space-y-3 text-left">
                <textarea
                  rows={3}
                  value={this.state.feedbackText}
                  onChange={(e) => this.setState({ feedbackText: e.target.value })}
                  placeholder="What happened right before this error?"
                  className="w-full py-2.5 px-3 border border-neutral-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-700/50 resize-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => this.setState({ showFeedbackForm: false })}
                    className="px-3.5 py-2 rounded-xl border border-neutral-200 text-xs font-medium text-slate-600 hover:border-slate-400 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={this.state.isSending}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                  >
                    {this.state.isSending ? 'Sending…' : 'Submit'}
                  </button>
                </div>
              </form>
            ) : null}

            <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
              <button
                type="button"
                onClick={() => this.setState({ showFeedbackForm: true })}
                className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-stone-50 border border-neutral-200 hover:border-slate-400 text-slate-800 font-medium text-xs py-3 px-4 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <MessageSquarePlus size={15} />
                <span>Send feedback</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs py-3 px-4 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw size={15} />
                <span>Reload App</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

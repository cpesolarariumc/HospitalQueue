import React, { useState } from 'react';
import { User, Lock, Mail, ArrowLeft } from 'lucide-react';
import logo from '../assets/logo.png';
import SiteFooter from './SiteFooter';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  sendEmailVerification,
  type User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../firebaseConfig';

const inputClasses = 'w-full rounded-2xl border border-slate-700 bg-slate-800/80 pr-4 pl-10 text-sm text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#1b7a57]';
const inputIconClasses = 'absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400';

interface LoginViewProps {
  isLoggingIn: boolean;
  onLogin: (e: React.FormEvent, credentials?: { email: string; pass: string }) => void;
  onRegister: (newUserData: { uid: string; fullName: string; email: string; phone: string }) => Promise<void>;
  onGoogleSuccess: (user: FirebaseUser) => void | Promise<void>;
}

export default function LoginView({ isLoggingIn, onLogin, onRegister, onGoogleSuccess }: LoginViewProps) {
  // Modes: 'login' | 'signup' | 'forgot'
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');

  // Input states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [forgotEmail, setForgotEmail] = useState('');

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);
  const isProcessing = loading || isLoggingIn;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'login') {
        if (!loginEmail || !loginPassword) {
          throw new Error("Please enter both email and password.");
        }
        onLogin(e, { email: loginEmail, pass: loginPassword });
        setLoading(false);
        return;
      }

      if (mode === 'forgot') {
        if (!forgotEmail) {
          throw new Error("Please enter your registered email address.");
        }
        await sendPasswordResetEmail(auth, forgotEmail);
        setMessage({ text: `Password reset link sent to ${forgotEmail}! Please check your inbox.`, type: 'success' });
        setLoading(false);
        return;
      }

      const userCred = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
      await sendEmailVerification(userCred.user);

      await onRegister({
        uid: userCred.user.uid,
        fullName: regFullName,
        email: regEmail,
        phone: '',
      });

      setMessage({
        text: `Account created and profile saved. Verification link sent to ${regEmail}; you can verify it from your inbox.`,
        type: 'success',
      });

      setTimeout(() => {
        setMode('login');
      }, 3000);

    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : 'An error occurred. Please try again.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        await onGoogleSuccess(result.user);
      }
    } catch (error: unknown) {
      setMessage({
        text: `Google sign-in failed: ${error instanceof Error ? error.message : String(error)}`,
        type: 'error',
      });
    }
  };

  return (
    <div className="flex h-screen h-dvh flex-col overflow-hidden bg-slate-900 bg-cover bg-center" style={{ backgroundImage: `url('https://i.pinimg.com/1200x/af/b6/05/afb605d20bae30bb5f1886ee8464078e.jpg')` }}>
      <main className={`flex min-h-0 flex-1 items-start justify-center overflow-y-auto overscroll-contain sm:items-center ${
        mode === 'signup' ? 'p-2 sm:p-6' : 'p-3 sm:p-6'
      }`}>
        <div className={`my-auto w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900/85 text-center shadow-2xl backdrop-blur-md ${
        mode === 'signup' ? 'space-y-3 p-4 sm:space-y-6 sm:p-8' : 'space-y-6 p-8'
      }`}>
        
        <div className={`mx-auto flex items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-800 shadow-inner ${
          mode === 'signup' ? 'h-12 w-12 sm:h-20 sm:w-20' : 'h-16 w-16 sm:h-20 sm:w-20'
        }`}>
          <img src={logo} alt="OmniQueue Health logo" className="h-full w-full object-contain" />
        </div>

        <div className={mode === 'signup' ? 'mb-2 sm:mb-6' : ''}>
          <h2 className={`font-bold tracking-wide text-white ${
            mode === 'signup' ? 'text-xl sm:text-2xl' : 'text-2xl'
          }`}>
            {mode === 'signup'
              ? 'Account Registration' 
              : mode === 'forgot' 
              ? 'Reset Password' 
              : 'OmniQueue Health Login'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'signup'
              ? 'Create your secure healthcare profile' 
              : mode === 'forgot' 
              ? 'Enter your email to receive a password reset link' 
              : ''} {/* For login, no additional text is needed */  }
          </p>
        </div>

        {message && (
          <div className={`p-3 rounded-xl text-xs font-semibold ${
            message.type === 'success' 
              ? 'bg-emerald-900/50 text-emerald-200 border border-emerald-700' 
              : 'bg-red-900/50 text-red-200 border border-red-700'
          }`}>
            {message.text}
          </div>
        )}

            {/* GOOGLE SIGN IN (Only shown on Login / Signup main view) */}
            {mode !== 'forgot' && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className={`w-full bg-white font-bold text-slate-800 hover:bg-slate-100 rounded-2xl border border-slate-300 shadow-md flex items-center justify-center space-x-3 transition duration-200 text-sm ${
                    mode === 'signup' ? 'py-2 sm:py-3' : 'py-3'
                  }`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-700"></div>
                  <span className="flex-shrink mx-4 text-xs font-semibold text-slate-400 uppercase">Or continue with email</span>
                  <div className="flex-grow border-t border-slate-700"></div>
                </div>
              </>
            )}

            <form onSubmit={handleFormSubmit} className={mode === 'signup' ? 'space-y-2.5 sm:space-y-4' : 'space-y-4'}>
              {/* SIGNUP FIELDS */}
              {mode === 'signup' && (
                <>
                  <div>
                    <div className="relative">
                      <span className={inputIconClasses}>
                        <User className="w-4 h-4" />
                      </span>
                      <input 
                        type="text" 
                        required 
                        placeholder="Full Name" 
                        value={regFullName} 
                        onChange={(e) => setRegFullName(e.target.value)} 
                        className={`${inputClasses} py-2.5 sm:py-3.5`}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="relative">
                      <span className={inputIconClasses}>
                        <Mail className="w-4 h-4" />
                      </span>
                      <input
                        type="email"
                        required
                        placeholder="Email Address"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className={`${inputClasses} py-2.5 sm:py-3.5`}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="relative">
                      <span className={inputIconClasses}>
                        <Lock className="w-4 h-4" />
                      </span>
                      <input 
                        type="password" 
                        required 
                        placeholder="Password (minimum 6 characters)" 
                        value={regPassword} 
                        onChange={(e) => setRegPassword(e.target.value)} 
                        className={`${inputClasses} py-2.5 sm:py-3.5`}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* LOGIN FIELDS */}
              {mode === 'login' && (
                <>
                  <div>
                    <div className="relative">
                      <span className={inputIconClasses}>
                        <Mail className="w-4 h-4" />
                      </span>
                      <input 
                        type="email" 
                        required 
                        placeholder="Email Address" 
                        value={loginEmail} 
                        onChange={(e) => setLoginEmail(e.target.value)} 
                        className={`${inputClasses} py-3.5`}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="relative">
                      <span className={inputIconClasses}>
                        <Lock className="w-4 h-4" />
                      </span>
                      <input 
                        type="password" 
                        required 
                        placeholder="Password" 
                        value={loginPassword} 
                        onChange={(e) => setLoginPassword(e.target.value)} 
                        className={`${inputClasses} py-3.5`}
                      />
                    </div>

                    {/* FORGOT PASSWORD LINK */}
                    <div className="text-right pt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          setMessage(null);
                        }}
                        className="text-xs text-emerald-400 hover:underline font-semibold"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* FORGOT PASSWORD FIELD */}
              {mode === 'forgot' && (
                <div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input 
                      type="email" 
                      required 
                      placeholder="Enter registered email address" 
                      value={forgotEmail} 
                      onChange={(e) => setForgotEmail(e.target.value)} 
                      className="w-full pl-10 pr-4 py-3.5 bg-slate-800/80 border border-slate-700 rounded-2xl text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#1b7a57] text-sm" 
                    />
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                disabled={isProcessing}
                className={`w-full bg-[#1b7a57] hover:bg-emerald-600 text-white font-bold rounded-2xl shadow-lg transition duration-200 text-sm disabled:opacity-50 ${
                  mode === 'signup' ? 'py-2.5 sm:py-3.5' : 'py-3.5'
                }`}
              >
                {isProcessing
                  ? 'Processing...' 
                  : mode === 'signup' 
                  ? 'Create Account'
                  : mode === 'forgot' 
                  ? 'Send Password Reset Link' 
                  : 'Login'}
              </button>
            </form>

            <div className="space-y-2 pt-2">
              {mode === 'forgot' ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setMessage(null);
                  }}
                  className="text-xs text-slate-300 hover:text-white font-semibold flex items-center justify-center space-x-1 mx-auto transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Login</span>
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={() => {
                    setMode(mode === 'signup' ? 'login' : 'signup');
                    setMessage(null);
                  }}
                  className="text-xs text-white hover:text-emerald-400 font-semibold block w-full transition-colors"
                >
                  {mode === 'signup' ? "Already have an account? Login here" : "Don't have an account? Sign up here"}
                </button>
              )}
            </div>

      </div>
      </main>
      <SiteFooter />
    </div>
  );
}
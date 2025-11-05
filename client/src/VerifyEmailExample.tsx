// Example Email Verification Page Component
// Place this in your client/src/pages/ directory

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      // Get token from URL query parameters
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        setStatus('error');
        setMessage('No verification token provided.');
        return;
      }

      try {
        const response = await fetch(`/api/verify-email?token=${token}`);
        const data = await response.json();

        if (data.success) {
          setStatus('success');
          setMessage(data.message || 'Email verified successfully!');
          // Redirect to dashboard after 3 seconds
          setTimeout(() => setLocation('/'), 3000);
        } else {
          setStatus('error');
          setMessage(data.message || 'Email verification failed.');
        }
      } catch (error) {
        setStatus('error');
        setMessage('An error occurred while verifying your email.');
        console.error('Verification error:', error);
      }
    };

    verifyEmail();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-600 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        {status === 'loading' && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Verifying Email...</h2>
            <p className="text-gray-600">Please wait while we verify your email address.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="text-green-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Email Verified!</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Verification Failed</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <button
              onClick={() => setLocation('/login')}
              className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition-colors"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// Example: Email Verification Banner Component
// Show this on dashboard/profile page if email is not verified

export function EmailVerificationBanner() {
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    checkVerificationStatus();
  }, []);

  const checkVerificationStatus = async () => {
    try {
      const response = await fetch('/api/email-verification-status', {
        credentials: 'include',
      });
      const data = await response.json();
      setIsVerified(data.verified);
      setEmail(data.email);
    } catch (error) {
      console.error('Error checking verification status:', error);
    }
  };

  const resendVerification = async () => {
    setIsResending(true);
    setMessage('');

    try {
      const response = await fetch('/api/resend-verification', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setMessage('Verification email sent! Please check your inbox and spam folder.');
      } else {
        setMessage(data.message || 'Failed to send verification email.');
      }
    } catch (error) {
      setMessage('An error occurred. Please try again later.');
      console.error('Error resending verification:', error);
    } finally {
      setIsResending(false);
    }
  };

  // Don't show banner if email is verified or status is unknown
  if (isVerified === null || isVerified) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              Please verify your email address <span className="font-medium">{email}</span>
            </p>
            <p className="text-xs text-yellow-600 mt-1">
              Check your inbox and spam folder for the verification email.
            </p>
            {message && (
              <p className="text-sm text-yellow-600 mt-1">{message}</p>
            )}
          </div>
        </div>
        <div className="ml-4">
          <button
            onClick={resendVerification}
            disabled={isResending}
            className="text-sm font-medium text-yellow-700 hover:text-yellow-600 disabled:opacity-50"
          >
            {isResending ? 'Sending...' : 'Resend Email'}
          </button>
        </div>
      </div>
    </div>
  );
}

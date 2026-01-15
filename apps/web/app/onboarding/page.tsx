'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStorage } from '@/lib/storage';
import { Settings, DEFAULT_SETTINGS } from '@audio-retrieval-srs/core';
import Link from 'next/link';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  async function checkOnboardingStatus() {
    const storage = getStorage();
    const settings = await storage.getSettings() || DEFAULT_SETTINGS;
    
    if (settings.onboarding_completed) {
      router.push('/');
      return;
    }
  }

  async function completeOnboarding() {
    const storage = getStorage();
    const settings = await storage.getSettings() || DEFAULT_SETTINGS;
    
    const updated: Settings = {
      ...settings,
      onboarding_completed: true,
    };
    
    await storage.saveSettings(updated);
    setCompleted(true);
    
    setTimeout(() => {
      router.push('/');
    }, 2000);
  }

  function speakText(text: string) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  }

  const steps = [
    {
      title: 'Welcome to Audio Retrieval SRS',
      content: (
        <div className="space-y-4">
          <p>This app helps you practice language learning through spaced repetition.</p>
          <p>You'll hear English prompts and respond with the target language.</p>
        </div>
      ),
    },
    {
      title: 'Rating System',
      content: (
        <div className="space-y-4">
          <p>After each item, you'll rate your performance:</p>
          <div className="space-y-2">
            <div className="bg-red-100 p-3 rounded">
              <strong className="text-red-700">Miss</strong> - You didn't remember it
            </div>
            <div className="bg-orange-100 p-3 rounded">
              <strong className="text-orange-700">Repeat</strong> - Practice this again in this session
            </div>
            <div className="bg-blue-100 p-3 rounded">
              <strong className="text-blue-700">Next</strong> - Good enough for today, move on
            </div>
            <div className="bg-green-100 p-3 rounded">
              <strong className="text-green-700">Easy</strong> - You remembered it easily (promotes)
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'How to Rate',
      content: (
        <div className="space-y-4">
          <p>During practice sessions, you can rate items by:</p>
          <ul className="list-disc list-inside space-y-2">
            <li><strong>Speaking</strong> the word: "Miss", "Repeat", "Next", or "Easy"</li>
            <li><strong>Tapping</strong> the buttons if speech recognition isn't available</li>
          </ul>
          <div className="mt-4">
            <p className="font-semibold mb-2">Try saying the words:</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => speakText('Miss')}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                Say "Miss"
              </button>
              <button
                onClick={() => speakText('Repeat')}
                className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
              >
                Say "Repeat"
              </button>
              <button
                onClick={() => speakText('Next')}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Say "Next"
              </button>
              <button
                onClick={() => speakText('Easy')}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                Say "Easy"
              </button>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'You\'re Ready!',
      content: (
        <div className="space-y-4">
          <p>Now you know how to use Audio Retrieval SRS!</p>
          <p>Start by adding sentences in the Inbox, then mark them as eligible to begin practicing.</p>
        </div>
      ),
    },
  ];

  if (completed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="text-center">
          <p className="text-2xl font-bold mb-4">✓ Onboarding Complete!</p>
          <p>Redirecting to home...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col p-8">
      <div className="max-w-4xl mx-auto w-full">
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-gray-600">Step {step + 1} of {steps.length}</span>
            <Link href="/" className="text-blue-500 hover:text-blue-700 text-sm">
              Skip
            </Link>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white border rounded p-8 mb-6">
          <h1 className="text-4xl font-bold mb-6">{steps[step].title}</h1>
          <div className="text-lg">{steps[step].content}</div>
        </div>

        <div className="flex justify-between">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
            >
              Next
            </button>
          ) : (
            <button
              onClick={completeOnboarding}
              className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
            >
              Get Started
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

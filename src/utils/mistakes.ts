import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export interface MistakeEntry {
  id?: string;
  userId: string;
  sourceFeature: string;
  question: string;
  wrongInput: string;
  correctConcept: string;
  createdAt: string;
  aiFix?: {
    why_it_happened: string;
    the_fix: string;
    pro_memory_trick: string;
  } | null;
}

/**
 * Universally saves a mistake context to the MistakeVault collection.
 * Includes a localStorage fallback for offline or anonymous usage.
 */
export async function saveMistakeToVault(
  sourceFeature: 'Chat' | 'Quizzes' | 'Scan' | 'Live Search' | string,
  question: string,
  wrongInput: string,
  correctConcept: string
): Promise<void> {
  const user = auth.currentUser;
  
  const mistakeData = {
    userId: user?.uid || 'anonymous',
    sourceFeature,
    question: question.trim(),
    wrongInput: wrongInput.trim(),
    correctConcept: correctConcept.trim(),
    aiFix: null,
    createdAt: new Date().toISOString()
  };

  try {
    if (user) {
      await addDoc(collection(db, 'MistakeVault'), {
        ...mistakeData,
        createdAt: serverTimestamp()
      });
      console.log(`[MistakeVault] Logged mistake from ${sourceFeature} in Firestore`);
    } else {
      // Offline/Anonymous fallback
      const localMistakes = JSON.parse(localStorage.getItem('study_temp_mistakes') || '[]');
      localMistakes.push({
        ...mistakeData,
        id: 'local_' + Math.random().toString(36).substring(2, 9)
      });
      localStorage.setItem('study_temp_mistakes', JSON.stringify(localMistakes));
      console.log(`[MistakeVault] Logged mistake from ${sourceFeature} in LocalStorage`);
    }
    // Dispatch global event for live reactive UI updates
    window.dispatchEvent(new CustomEvent('study-mistake-vault-updated'));
  } catch (error) {
    console.error('[MistakeVault] Error logging mistake:', error);
  }
}

/**
 * Scans an AI response for common educational trap/misconception markers
 * and automatically logs a mistake entry.
 */
export async function detectAndLogMistake(
  sourceFeature: 'Chat' | 'Scan' | 'Live Search' | string,
  userPrompt: string,
  aiResponse: string
): Promise<void> {
  const lowercaseResponse = aiResponse.toLowerCase();
  
  // High confidence keywords indicating a misconception, common trap, or warning
  const containsTrap = 
    lowercaseResponse.includes('watch out!') || 
    lowercaseResponse.includes('common trap') ||
    lowercaseResponse.includes('misconception') || 
    lowercaseResponse.includes('silly mistake') ||
    lowercaseResponse.includes('common error') ||
    lowercaseResponse.includes('common mistake') ||
    lowercaseResponse.includes('grammatical error') ||
    lowercaseResponse.includes('areas for improvement') ||
    lowercaseResponse.includes('point deduction') ||
    lowercaseResponse.includes('did not earn') ||
    sourceFeature === 'Essay Grader' ||
    sourceFeature === 'Grammar Enhancer';

  if (containsTrap) {
    let correctConcept = "Check the correct concept and common traps associated with this question.";
    let wrongInput = "Concept misconception or common trap detected";

    if (sourceFeature === 'Essay Grader') {
      // Find the areas of improvement or grammatical errors in the Essay Grader output
      const lines = aiResponse.split('\n');
      const improvementLine = lines.find(l => 
        l.toLowerCase().includes('improvement') || 
        l.toLowerCase().includes('deduction') ||
        l.toLowerCase().includes('grammar')
      );
      if (improvementLine) {
        correctConcept = "Area for Improvement: " + improvementLine.replace(/[\#\*\-\>]/g, '').trim();
      } else {
        correctConcept = "Analyze areas for improvement on Thesis/Evidence structure.";
      }
      wrongInput = "Essay writing correction or point deduction noted";
    } else if (sourceFeature === 'Grammar Enhancer') {
      const lines = aiResponse.split('\n');
      const grammarLine = lines.find(l => l.toLowerCase().includes('fixed') || l.toLowerCase().includes('correct'));
      if (grammarLine) {
        correctConcept = grammarLine.replace(/[\#\*\-\>]/g, '').trim();
      } else {
        correctConcept = "Improve sentence grammar, flow, and structural polish.";
      }
      wrongInput = "Grammar corrections and weak sentence flow";
    } else {
      // Find a clean section or sentence about the correct concept
      const lines = aiResponse.split('\n');
      const trapLine = lines.find(l => 
        l.toLowerCase().includes('watch out') || 
        l.toLowerCase().includes('common trap') || 
        l.toLowerCase().includes('misconception') ||
        l.toLowerCase().includes('error') ||
        l.toLowerCase().includes('mistake')
      );
      
      if (trapLine) {
        // Try to get more context if the line is too short (just a heading)
        const lineIdx = lines.indexOf(trapLine);
        if (trapLine.length < 30 && lines[lineIdx + 1]) {
          correctConcept = trapLine.replace(/[\#\*\-\>]/g, '').trim() + ": " + lines[lineIdx + 1].replace(/[\#\*\-\>]/g, '').trim();
        } else {
          correctConcept = trapLine.replace(/[\#\*\-\>]/g, '').trim();
        }
      } else {
        // Fallback: extract a relevant chunk of the response
        const idx = lowercaseResponse.indexOf('watch out') !== -1 
          ? lowercaseResponse.indexOf('watch out') 
          : lowercaseResponse.indexOf('misconception') !== -1
            ? lowercaseResponse.indexOf('misconception')
            : lowercaseResponse.indexOf('mistake');
          
        if (idx !== -1) {
          correctConcept = aiResponse.substring(idx, idx + 150).replace(/[\#\*\-\>]/g, '').trim();
        }
      }
    }

    await saveMistakeToVault(
      sourceFeature,
      userPrompt.length > 150 ? userPrompt.substring(0, 150) + '...' : userPrompt,
      wrongInput,
      correctConcept
    );
  }
}


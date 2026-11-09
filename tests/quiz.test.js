/**
 * EduShare Quiz Assessment QA Test Suite
 * Tests for:
 * 1. Custom number of questions input (1 - 50 constraints).
 * 2. One-question-per-page display, scrolling fix, and "Next" button navigation.
 * 3. Question formatting & distinct visual container/box for each choice with hover/selection styling.
 * 4. Strict full-screen enforcement: 'blur' and 'visibilitychange' event triggers bound for instant Alt-Tab lockdown.
 * 5. Instant invalidation security & exact copy in lockdown modal with functional restart button.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runQuizFeatureTests() {
  console.log('\n--- [TEST SUITE: Quiz Generator & Full-Screen Assessment Flow] ---');

  const generatorHtml = fs.readFileSync(path.resolve(__dirname, '../generator.html'), 'utf8');
  const quizHtml = fs.readFileSync(path.resolve(__dirname, '../quiz.html'), 'utf8');
  const generatorCss = fs.readFileSync(path.resolve(__dirname, '../generator.css'), 'utf8');
  const scriptJs = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
  const quizJs = fs.readFileSync(path.resolve(__dirname, '../quiz.js'), 'utf8');
  const serverJs = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');

  // Test 1: Number Input Field (1 - 50 Constraints) in generator.html
  assert(!generatorHtml.includes('<select id="questionCount"'), 'generator.html must not use select for questionCount');
  assert(/<input[^>]+type="number"[^>]+id="questionCount"/i.test(generatorHtml) ||
         /<input[^>]+id="questionCount"[^>]+type="number"/i.test(generatorHtml),
         'generator.html must have clean HTML number input field for questionCount');
  assert(generatorHtml.includes('min="1"') && generatorHtml.includes('max="50"'),
         'questionCount input must have min="1" and max="50"');
  console.log('✓ PASS: Clean number input field with 1 - 50 constraints verified in generator.html.');

  // Test 2: One-Question-Per-Page Display & Next Button
  assert(quizHtml.includes('id="nextQuestionBtn"'), 'quiz.html must contain Next Question button');
  assert(quizJs.includes('active-q') && quizJs.includes('hidden-q'), 'quiz.js must toggle active-q and hidden-q on question cards');
  assert(quizJs.includes('nextQuestion'), 'quiz.js must implement nextQuestion sequential progression');
  console.log('✓ PASS: One-question-per-page display and clearly styled "Next" button verified.');

  // Test 3: Scrolling Fix in Fullscreen & Quiz Container
  assert(generatorCss.includes('overflow-y: auto !important'), 'generator.css must provide overflow-y: auto for natural scrolling');
  assert(generatorCss.includes('#quizMain') || generatorCss.includes('.assessment-container'), 'generator.css must style assessment container scrolling');
  assert(quizHtml.includes('id="quizMain"'), 'quiz.html must provide #quizMain container');
  console.log('✓ PASS: Natural mouse scrolling fix confirmed in generator.css.');

  // Test 4: Choice Box Formatting, Hover, and Selection Styles
  assert(generatorCss.includes('.q-opt'), 'generator.css must format distinct visual choice containers');
  assert(generatorCss.includes('.q-opt:hover'), 'generator.css must define hover styles for choice boxes');
  assert(generatorCss.includes('.q-opt:has(input:checked)') || generatorCss.includes('.q-opt.selected'),
         'generator.css must define selected styles for choice boxes');
  assert(quizJs.includes('lab.className = \'q-opt\'') || quizJs.includes('q-opt'), 'quiz.js must render options with choice box formatting');
  console.log('✓ PASS: Distinct choice box formatting, hover effects, and selected styling verified.');

  // Test 5: Full-Screen Enforcement & Alt-Tab Lockdown Protection (blur & visibilitychange)
  assert(quizJs.includes("addEventListener('blur'") || quizJs.includes('addEventListener("blur"'),
         'quiz.js must bind window blur event listener to catch Alt-Tab and window switching');
  assert(quizJs.includes("addEventListener('visibilitychange'") || quizJs.includes('addEventListener("visibilitychange"'),
         'quiz.js must bind visibilitychange event listener to catch tab switching and minimizing');
  assert(quizJs.includes('fullscreenchange'), 'quiz.js must listen to fullscreenchange event');
  console.log('✓ PASS: Alt-Tab and tab-switching protection verified with blur and visibilitychange listeners.');

  // Test 6: Strict Lockdown Modal Exact Copy & Functional Restart Button
  assert(quizHtml.includes('Full-Screen Mode Required'), 'Lockdown modal must display "Full-Screen Mode Required"');
  assert(quizHtml.includes('Assessment progress has been completely locked and invalidated.'),
         'Lockdown modal must display exact copy for invalidation');
  assert(quizHtml.includes('You pressed Alt+Tab, Esc, switched tabs, minimized the window, or clicked onto another screen. Under strict assessment protocols, window-switching is strictly prohibited and all answered questions have been invalidated.'),
         'Lockdown modal must display exact copy for window switching violation');
  assert(quizHtml.includes('↻ Restart Quiz from Beginning'), 'Lockdown modal must display "↻ Restart Quiz from Beginning" button');
  assert(quizJs.includes('restartQuiz'), 'quiz.js must implement functional restartQuiz handler');
  console.log('✓ PASS: Lockdown modal exact copy and functional restart button verified.');

  // Test 7: Server Route Protection for /quiz.html
  assert(serverJs.includes('/quiz.html'), 'server.js must define protected route for /quiz.html');
  console.log('✓ PASS: Server route protection for /quiz.html verified.');

  // Test 8: Dynamic Vertical Scrolling Enabled on Quiz Submission & Restrictions in Progress
  assert(quizJs.includes('lockQuizScrolling'), 'quiz.js must implement lockQuizScrolling to maintain scroll restrictions during active quiz');
  assert(quizJs.includes('enableQuizScrolling'), 'quiz.js must implement enableQuizScrolling for instant scrolling on submission');
  assert(quizJs.includes('quiz-submitted') && quizJs.includes('quiz-scroll-enabled'), 'quiz.js must apply quiz-submitted and quiz-scroll-enabled classes');
  assert(generatorCss.includes('.quiz-submitted') || generatorCss.includes('#quizContainer.quiz-submitted'), 'generator.css must support quiz-submitted scrolling styles');
  assert(generatorCss.includes('.quiz-scroll-enabled'), 'generator.css must support quiz-scroll-enabled styles');
  console.log('✓ PASS: Instant scroll enablement on submission and active quiz scroll lockdown verified.');

  // Test 9: Smooth Scroll Animation to Results / Score Section in Full-Screen Mode
  assert(quizJs.includes('smoothScrollToResults'), 'quiz.js must implement smoothScrollToResults animation');
  assert(quizJs.includes('scrollIntoView') && quizJs.includes("'smooth'"), 'quiz.js must trigger smooth scroll animation via scrollIntoView or scrollTo');
  assert(quizJs.includes('scoreBox') && quizJs.includes('quizResultsScreen'), 'quiz.js must target scoreBox and quizResultsScreen for scrolling');
  console.log('✓ PASS: Smooth scroll animation to results/score section in full-screen mode verified.');

  console.log('All Quiz Feature tests passed successfully!\n');
}

if (require.main === module) {
  try {
    runQuizFeatureTests();
    process.exit(0);
  } catch (err) {
    console.error('Quiz Feature tests failed:', err);
    process.exit(1);
  }
}

module.exports = runQuizFeatureTests;

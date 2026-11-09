/**
 * EduShare Master Test Runner
 * Executes all automated test suites and outputs a comprehensive QA report.
 */

const runCryptoTests = require('./crypto.test');
const runPasswordTests = require('./password.test');
const runAuthTests = require('./auth.test');
const runSessionTests = require('./session.test');
const runEmailTests = require('./email.test');
const runHttpTests = require('./http.test');
const runQuizFeatureTests = require('./quiz.test');

async function runAll() {
  console.log('===============================================================');
  console.log('             EDUSHARE QUALITY ASSURANCE TEST SUITE');
  console.log('===============================================================');
  const startTime = Date.now();

  try {
    // 1. Cryptographic tests (AES-256-GCM)
    runCryptoTests();

    // 2. Password security tests (Argon2id)
    await runPasswordTests();

    // 3. Authentication & Verification flow tests
    await runAuthTests();

    // 4. Session & Remember Me tests
    runSessionTests();

    // 5. Email templates & configuration tests
    await runEmailTests();

    // 6. HTTP Server & Endpoints integration tests
    await runHttpTests();

    // 7. Quiz Generator & Full-Screen Assessment tests
    runQuizFeatureTests();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('===============================================================');
    console.log(`🎉 ALL 7 TEST SUITES COMPLETED SUCCESSFULLY in ${elapsed}s!`);
    console.log('===============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  }
}

runAll();

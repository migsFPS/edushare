/**
 * EduShare End-to-End HTTP Server Integration Test
 */

const http = require('http');
const app = require('../server');

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (body) {
      const data = typeof body === 'object' ? JSON.stringify(body) : body;
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(reqOptions, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(responseData);
        } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: responseData,
          json
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'object' ? JSON.stringify(body) : body);
    }
    req.end();
  });
}

async function runHttpTests() {
  console.log('\n--- [TEST SUITE: Express HTTP Endpoints & Static Delivery] ---');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  try {
    // 1. GET / serves index.html
    const rootRes = await makeRequest(server, { path: '/' });
    if (rootRes.statusCode !== 200 || !rootRes.data.includes('EduShare')) {
      throw new Error(`GET / failed. Status: ${rootRes.statusCode}`);
    }
    console.log('✓ PASS: GET / successfully serves EduShare index.html.');

    // 2. GET /generator.html and /quiz.html without authentication redirects to index.html
    const genRes = await makeRequest(server, { path: '/generator.html' });
    if (genRes.statusCode !== 302 || (!genRes.headers.location.includes('index.html') && !genRes.headers.location.includes('login.html'))) {
      throw new Error(`GET /generator.html unauthenticated did not redirect. Status: ${genRes.statusCode}`);
    }
    console.log('✓ PASS: Unauthenticated access to /generator.html redirected to index.html.');

    const quizRes = await makeRequest(server, { path: '/quiz.html' });
    if (quizRes.statusCode !== 302 || (!quizRes.headers.location.includes('index.html') && !quizRes.headers.location.includes('login.html'))) {
      throw new Error(`GET /quiz.html unauthenticated did not redirect. Status: ${quizRes.statusCode}`);
    }
    console.log('✓ PASS: Unauthenticated access to /quiz.html redirected to index.html.');

    // 3. GET /verify-email serves verify.html
    const verifyPageRes = await makeRequest(server, { path: '/verify-email' });
    if (verifyPageRes.statusCode !== 200 || !verifyPageRes.data.includes('EduShare | Account Verification')) {
      throw new Error(`GET /verify-email failed. Status: ${verifyPageRes.statusCode}`);
    }
    console.log('✓ PASS: GET /verify-email serves verification landing page.');

    // 4. GET /reset-password serves reset-password.html
    const resetPageRes = await makeRequest(server, { path: '/reset-password' });
    if (resetPageRes.statusCode !== 200 || !resetPageRes.data.includes('EduShare | Reset Password')) {
      throw new Error(`GET /reset-password failed. Status: ${resetPageRes.statusCode}`);
    }
    console.log('✓ PASS: GET /reset-password serves reset password landing page.');

    // 5. GET /script.js serves quiz generator script intact
    const scriptRes = await makeRequest(server, { path: '/script.js' });
    if (scriptRes.statusCode !== 200 || !scriptRes.data.includes('QUESTION GENERATION ENGINE')) {
      throw new Error(`GET /script.js failed. Status: ${scriptRes.statusCode}`);
    }
    console.log('✓ PASS: GET /script.js serves quiz generator engine with existing logic preserved.');

    // 5b. GET /quiz.js serves assessment script
    const quizScriptRes = await makeRequest(server, { path: '/quiz.js' });
    if (quizScriptRes.statusCode !== 200 || !quizScriptRes.data.includes('Strict Full-Screen Enforcement')) {
      throw new Error(`GET /quiz.js failed. Status: ${quizScriptRes.statusCode}`);
    }
    console.log('✓ PASS: GET /quiz.js serves strict full-screen assessment engine intact.');

    // 6. Test Registration via HTTP POST /api/auth/register
    const uniqueEmail = `http_student_${Date.now()}@ua.edu.ph`;
    const regRes = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, {
      fullName: 'HTTP Test Student',
      email: uniqueEmail,
      password: 'HttpPassword2026!',
      confirmPassword: 'HttpPassword2026!',
      role: 'student'
    });

    if (regRes.statusCode !== 201 || !regRes.json || !regRes.json.success) {
      throw new Error(`Registration failed via HTTP: ${JSON.stringify(regRes.json)}`);
    }
    console.log('✓ PASS: POST /api/auth/register succeeds with status 201.');

    // 7. Test Login while Unverified via HTTP POST /api/auth/login
    const loginRes = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
      email: uniqueEmail,
      password: 'HttpPassword2026!'
    });

    if (loginRes.statusCode !== 403 || !loginRes.json || !loginRes.json.unverified) {
      throw new Error(`Unverified login check failed: status ${loginRes.statusCode}`);
    }
    if (loginRes.json.error !== 'Please verify your email before logging in. Check your inbox or click Resend Verification.') {
      throw new Error(`Incorrect unverified message returned: ${loginRes.json.error}`);
    }
    console.log('✓ PASS: POST /api/auth/login blocks unverified accounts with required error message.');

    console.log('All HTTP Server & Static Asset tests passed successfully!\n');
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runHttpTests().catch(err => {
    console.error('HTTP tests failed:', err);
    process.exit(1);
  });
}

module.exports = runHttpTests;

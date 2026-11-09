/**
 * EduShare Client-Side Authentication Controller
 * 
 * Secure backend integration for:
 * - Student and Teacher Registration
 * - Login with Argon2id Verification
 * - Email Verification & Resend Verification
 * - Password Reset
 * - Persistent Remember Me
 */

(() => {
  'use strict';

  // DOM Elements - Login
  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const rememberInput = document.getElementById('remember');
  const togglePassword = document.getElementById('togglePassword');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  const message = document.getElementById('message');

  // DOM Elements - Modals & Triggers
  const openSignup = document.getElementById('openSignup');
  const closeSignup = document.getElementById('closeSignup');
  const signupPanel = document.getElementById('signupPanel');
  const signupForm = document.getElementById('signupForm');
  const signupSubmitBtn = document.getElementById('signupSubmitBtn');
  const signupMessage = document.getElementById('signupMessage');

  const forgotPassword = document.getElementById('forgotPassword');
  const forgotPanel = document.getElementById('forgotPanel');
  const forgotForm = document.getElementById('forgotForm');
  const closeForgot = document.getElementById('closeForgot');
  const forgotSubmitBtn = document.getElementById('forgotSubmitBtn');
  const forgotMessage = document.getElementById('forgotMessage');

  const openResendModal = document.getElementById('openResendModal');
  const resendPanel = document.getElementById('resendPanel');
  const resendForm = document.getElementById('resendForm');
  const closeResend = document.getElementById('closeResend');
  const resendSubmitBtn = document.getElementById('resendSubmitBtn');
  const resendModalMessage = document.getElementById('resendModalMessage');

  // Clean up legacy demo keys if present in browser localStorage
  try {
    localStorage.removeItem('edushare_demo_accounts');
    localStorage.removeItem('edushare_demo_session');
  } catch (e) {
    // Ignore storage errors
  }

  // Display message helper
  function showMessage(element, text, type = 'info', actionButton = null) {
    if (!element) return;
    element.className = 'message show ' + type;
    element.textContent = text;

    if (actionButton) {
      element.appendChild(document.createElement('br'));
      element.appendChild(actionButton);
    }
  }

  // Clear message helper
  function clearMessage(element) {
    if (!element) return;
    element.className = 'message';
    element.textContent = '';
  }

  // Modal Open / Close Helpers
  function openModal(panel, firstInputId) {
    if (!panel) return;
    panel.classList.add('show');
    panel.setAttribute('aria-hidden', 'false');
    if (firstInputId) {
      const el = document.getElementById(firstInputId);
      if (el) el.focus();
    }
  }

  function closeModal(panel, messageEl, formEl) {
    if (!panel) return;
    panel.classList.remove('show');
    panel.setAttribute('aria-hidden', 'true');
    if (messageEl) clearMessage(messageEl);
    if (formEl) formEl.reset();
  }

  // Check existing session on backend
  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          window.location.replace('generator.html');
        }
      }
    } catch {
      // Backend not reached or offline, stay on login page
    }
  }

  checkSession();

  // Password Visibility Toggle
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      togglePassword.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      togglePassword.setAttribute('aria-pressed', String(isHidden));
    });
  }

  // Sign-Up Modal Event Listeners
  if (openSignup) {
    openSignup.addEventListener('click', () => {
      clearMessage(signupMessage);
      openModal(signupPanel, 'signupName');
    });
  }

  if (closeSignup) {
    closeSignup.addEventListener('click', () => {
      closeModal(signupPanel, signupMessage, signupForm);
    });
  }

  if (signupPanel) {
    signupPanel.addEventListener('click', (event) => {
      if (event.target === signupPanel) {
        closeModal(signupPanel, signupMessage, signupForm);
      }
    });
  }

  // Forgot Password Modal Event Listeners
  if (forgotPassword) {
    forgotPassword.addEventListener('click', (e) => {
      e.preventDefault();
      clearMessage(forgotMessage);
      openModal(forgotPanel, 'forgotEmail');
    });
  }

  if (closeForgot) {
    closeForgot.addEventListener('click', () => {
      closeModal(forgotPanel, forgotMessage, forgotForm);
    });
  }

  if (forgotPanel) {
    forgotPanel.addEventListener('click', (event) => {
      if (event.target === forgotPanel) {
        closeModal(forgotPanel, forgotMessage, forgotForm);
      }
    });
  }

  // Resend Verification Modal Event Listeners
  if (openResendModal) {
    openResendModal.addEventListener('click', () => {
      clearMessage(resendModalMessage);
      // Pre-fill with login email if user typed one
      if (emailInput && emailInput.value) {
        const modalInput = document.getElementById('resendEmailInput');
        if (modalInput) modalInput.value = emailInput.value.trim();
      }
      openModal(resendPanel, 'resendEmailInput');
    });
  }

  if (closeResend) {
    closeResend.addEventListener('click', () => {
      closeModal(resendPanel, resendModalMessage, resendForm);
    });
  }

  if (resendPanel) {
    resendPanel.addEventListener('click', (event) => {
      if (event.target === resendPanel) {
        closeModal(resendPanel, resendModalMessage, resendForm);
      }
    });
  }

  // =========================================================================
  // CREATE ACCOUNT (REGISTRATION)
  // =========================================================================
  if (signupForm) {
    signupForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!signupForm.reportValidity()) return;

      const fullName = document.getElementById('signupName').value.trim();
      const role = document.getElementById('signupRole').value;
      const email = document.getElementById('signupEmail').value.trim().toLowerCase();
      const password = document.getElementById('signupPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (password.length < 8) {
        return showMessage(signupMessage, 'Password must be at least 8 characters long.', 'error');
      }

      if (password !== confirmPassword) {
        return showMessage(signupMessage, 'Passwords do not match.', 'error');
      }

      // Prevent duplicate submission
      signupSubmitBtn.disabled = true;
      signupSubmitBtn.textContent = 'Creating Account...';
      clearMessage(signupMessage);

      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, role, email, password, confirmPassword })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          showMessage(
            signupMessage,
            data.message || 'Account created! Please check your email inbox to verify your account.',
            'success'
          );
          signupForm.reset();

          // After 2.5 seconds, close modal and pre-fill login email
          setTimeout(() => {
            closeModal(signupPanel, signupMessage, signupForm);
            if (emailInput) {
              emailInput.value = email;
            }
            if (passwordInput) {
              passwordInput.focus();
            }
          }, 2500);
        } else {
          showMessage(signupMessage, data.error || 'Registration failed. Please try again.', 'error');
        }
      } catch (err) {
        showMessage(signupMessage, 'A connection error occurred. Please check your network and try again.', 'error');
      } finally {
        signupSubmitBtn.disabled = false;
        signupSubmitBtn.textContent = 'Create Account';
      }
    });
  }

  // =========================================================================
  // RESEND VERIFICATION HELPER FUNCTION
  // =========================================================================
  async function triggerResendVerification(targetEmail, messageTargetEl, buttonEl = null) {
    if (!targetEmail) return;

    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.textContent = 'Sending...';
    }

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showMessage(messageTargetEl, data.message, 'success');
      } else {
        showMessage(messageTargetEl, data.error || 'Failed to resend verification email.', 'error');
      }
    } catch {
      showMessage(messageTargetEl, 'A connection error occurred. Please try again.', 'error');
    } finally {
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.textContent = 'Resend Verification';
      }
    }
  }

  // Resend Modal Form Submit
  if (resendForm) {
    resendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('resendEmailInput').value.trim();
      await triggerResendVerification(email, resendModalMessage, resendSubmitBtn);
    });
  }

  // Forgot Password Form Submit
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgotEmail').value.trim();

      forgotSubmitBtn.disabled = true;
      forgotSubmitBtn.textContent = 'Sending Link...';
      clearMessage(forgotMessage);

      try {
        const response = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const data = await response.json();
        showMessage(forgotMessage, data.message || 'If an account exists, a reset link has been sent.', 'success');
      } catch {
        showMessage(forgotMessage, 'A connection error occurred. Please try again.', 'error');
      } finally {
        forgotSubmitBtn.disabled = false;
        forgotSubmitBtn.textContent = 'Send Reset Link';
      }
    });
  }

  // =========================================================================
  // LOGIN SUBMISSION
  // =========================================================================
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!loginForm.reportValidity()) return;

      const email = emailInput.value.trim().toLowerCase();
      const password = passwordInput.value;
      const remember = rememberInput ? rememberInput.checked : false;

      loginSubmitBtn.disabled = true;
      loginSubmitBtn.innerHTML = '<span>Signing in...</span>';
      clearMessage(message);

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email, password, remember })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          showMessage(message, 'Login successful. Loading EduShare...', 'success');
          setTimeout(() => {
            window.location.href = 'generator.html';
          }, 350);
        } else if (response.status === 403 && data.unverified) {
          // Unverified user restriction (Phase 2.D)
          // EXACT REQUIRED MESSAGE:
          // "Please verify your email before logging in. Check your inbox or click Resend Verification."
          const resendBtn = document.createElement('button');
          resendBtn.type = 'button';
          resendBtn.className = 'resend-action-btn';
          resendBtn.textContent = 'Resend Verification';
          resendBtn.addEventListener('click', async () => {
            await triggerResendVerification(email, message, resendBtn);
          });

          showMessage(
            message,
            'Please verify your email before logging in. Check your inbox or click Resend Verification.',
            'error',
            resendBtn
          );
        } else {
          showMessage(message, data.error || 'Account not found or password is incorrect. Please check your credentials.', 'error');
        }
      } catch (err) {
        showMessage(message, 'A connection error occurred. Please try again.', 'error');
      } finally {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.innerHTML = '<span>Log In</span><span class="arrow" aria-hidden="true">→</span>';
      }
    });
  }

})();

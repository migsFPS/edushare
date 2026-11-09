/**
 * EduShare Assessment Module (quiz.js)
 * Strict Full-Screen Enforcement & One-Question-Per-Page Assessment Engine
 * University of the Assumption - EduShare Platform
 */
(function () {
  'use strict';

  /* ------------------------------- State ------------------------------- */
  var state = {
    quizData: null,
    currentIndex: 0,
    isQuizStarted: false,
    isQuizSubmitted: false,
    isQuizInvalidated: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  /* -------------------- Cross-Browser Fullscreen API -------------------- */
  function requestFullScreen(el) {
    var target = el || $('quizContainer') || $('quizMain') || document.documentElement;
    if (target.requestFullscreen) {
      return target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      return target.webkitRequestFullscreen();
    } else if (target.mozRequestFullScreen) {
      return target.mozRequestFullScreen();
    } else if (target.msRequestFullscreen) {
      return target.msRequestFullscreen();
    }
    return Promise.reject(new Error('Fullscreen API not supported by browser.'));
  }

  function exitFullScreen() {
    if (document.exitFullscreen) {
      return document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      return document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      return document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      return document.msExitFullscreen();
    }
    return Promise.resolve();
  }

  function isFullscreenActive() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  /* ---------------------- View Management Helpers ---------------------- */
  function showScreen(screenId) {
    var screens = [
      'quizLoadingScreen',
      'quizErrorScreen',
      'preQuizScreen',
      'activeQuizScreen',
      'quizResultsScreen'
    ];
    screens.forEach(function (id) {
      var el = $(id);
      if (el) {
        if (id === screenId) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });
  }

  /* ----------- Instant Invalidation Security (Alt-Tab & Esc Protection) ----------- */
  function invalidateAndLockQuiz() {
    // If not in active quiz or already submitted/invalidated, do nothing
    if (!state.isQuizStarted || state.isQuizSubmitted || state.isQuizInvalidated) return;

    state.isQuizInvalidated = true;
    state.isQuizStarted = false;

    // 1. Lock and invalidate entire quiz progress instantly
    var questionsBox = $('questions');
    if (questionsBox) {
      var inputs = questionsBox.querySelectorAll('input[type="radio"]');
      inputs.forEach(function (inp) {
        inp.checked = false;
        inp.disabled = true;
      });
      questionsBox.querySelectorAll('.q-opt').forEach(function (opt) {
        opt.classList.remove('selected');
      });
    }

    // Invalidate local storage
    try {
      localStorage.removeItem('edushare_active_quiz');
      localStorage.removeItem('edushare_quiz_status');
    } catch (e) {}

    // 2. Ensure exact required lockdown modal copy
    var titleEl = $('modalTitle');
    var descEl = $('modalDesc');
    var restartBtn = $('restartQuizBtn');
    if (titleEl) {
      titleEl.textContent = 'Full-Screen Mode Required';
    }
    if (descEl) {
      descEl.innerHTML = 'Assessment progress has been completely locked and invalidated.<br><br>You pressed Alt+Tab, Esc, switched tabs, minimized the window, or clicked onto another screen. Under strict assessment protocols, window-switching is strictly prohibited and all answered questions have been invalidated.';
    }
    if (restartBtn) {
      restartBtn.textContent = '↻ Restart Quiz from Beginning';
    }

    // 3. Display strict, dark full-screen lockdown modal popup: "Full-Screen Mode Required"
    var modal = $('fullscreenModal');
    var quizMain = $('quizMain');
    if (modal) modal.classList.remove('hidden');
    if (quizMain) quizMain.classList.add('assessment-blur');
  }

  // Handle browser full-screen state change event (e.g. user pressing Esc)
  function handleFullscreenChange() {
    if (!state.isQuizStarted || state.isQuizSubmitted || state.isQuizInvalidated) return;
    if (!isFullscreenActive()) {
      invalidateAndLockQuiz();
    }
  }

  // Handle window focus loss (e.g. user pressing Alt+Tab or clicking another monitor/screen)
  function handleWindowBlur() {
    if (!state.isQuizStarted || state.isQuizSubmitted || state.isQuizInvalidated) return;
    invalidateAndLockQuiz();
  }

  // Handle tab switching or window minimizing (document visibility changes)
  function handleVisibilityChange() {
    if (!state.isQuizStarted || state.isQuizSubmitted || state.isQuizInvalidated) return;
    if (document.hidden || document.visibilityState === 'hidden') {
      invalidateAndLockQuiz();
    }
  }

  /* ------------------- Reset / Restart Brand New Quiz ------------------- */
  function restartQuiz() {
    state.isQuizInvalidated = false;
    state.isQuizStarted = false;
    state.isQuizSubmitted = false;
    state.currentIndex = 0;
    state.quizData = null;

    // Wipe bad state and clear data
    try {
      localStorage.removeItem('edushare_active_quiz');
      localStorage.removeItem('edushare_quiz_status');
    } catch (e) {}

    // Exit lockdown view
    var modal = $('fullscreenModal');
    var quizMain = $('quizMain');
    if (modal) modal.classList.add('hidden');
    if (quizMain) quizMain.classList.remove('assessment-blur');

    // Exit full screen if still active
    exitFullScreen().catch(function () {});

    // Reset scroll classes and styles
    document.body.classList.remove('quiz-in-progress', 'quiz-submitted', 'quiz-scroll-enabled');
    document.body.style.overflow = '';
    document.body.style.overflowY = '';
    document.documentElement.classList.remove('quiz-in-progress', 'quiz-submitted', 'quiz-scroll-enabled');
    document.documentElement.style.overflow = '';
    document.documentElement.style.overflowY = '';
    var qc = $('quizContainer');
    if (qc) {
      qc.classList.remove('quiz-in-progress', 'quiz-submitted', 'quiz-scroll-enabled');
      qc.style.overflow = '';
      qc.style.overflowY = '';
    }
    var qm = $('quizMain');
    if (qm) {
      qm.classList.remove('quiz-in-progress', 'quiz-submitted', 'quiz-scroll-enabled');
      qm.style.overflow = '';
      qm.style.overflowY = '';
    }

    // Redirect user to generator.html to configure and restart a brand new quiz from scratch
    window.location.href = 'generator.html';
  }

  /* -------------------------- Render Pre-Quiz -------------------------- */
  function initPreQuiz(data) {
    state.quizData = data;

    var typeLabels = {
      multiple: 'Multiple Choice',
      truefalse: 'True or False',
      mixed: 'Mixed Questions'
    };

    var countText = (data.questions ? data.questions.length : data.count || 0) + ' Questions';
    var typeText = typeLabels[data.type] || 'Multiple Choice';
    var diffText = (data.difficulty || 'Medium') + ' Difficulty';
    var sourceText = data.sourceName || 'Lesson Material';

    if ($('specCount')) $('specCount').textContent = countText;
    if ($('specType')) $('specType').textContent = typeText;
    if ($('specDifficulty')) $('specDifficulty').textContent = diffText;
    if ($('specSource')) $('specSource').textContent = sourceText;

    if ($('activeQuizMeta')) {
      $('activeQuizMeta').textContent = countText + ' \u00B7 ' + typeText + ' \u00B7 ' + diffText;
    }

    showScreen('preQuizScreen');
  }

  /* ------------- One-Question-Per-Page Navigation Logic ------------- */
  function updateQuestionNav() {
    var qs = (state.quizData && state.quizData.questions) || [];
    var total = qs.length;
    var idx = state.currentIndex;

    // Toggle active vs hidden question cards
    var cards = document.querySelectorAll('#questions .q-card');
    cards.forEach(function (c, i) {
      if (i === idx) {
        c.classList.remove('hidden-q');
        c.classList.add('active-q');
      } else {
        c.classList.add('hidden-q');
        c.classList.remove('active-q');
      }
    });

    // Update Question Progress Text & Progress Bar
    if ($('questionStepText')) {
      $('questionStepText').textContent = 'Question ' + (idx + 1) + ' of ' + total;
    }
    if ($('questionProgressPct')) {
      var pct = total > 0 ? Math.round(((idx + 1) / total) * 100) : 0;
      $('questionProgressPct').textContent = pct + '%';
      if ($('quizProgressBar')) {
        $('quizProgressBar').style.width = pct + '%';
      }
    }

    // Navigation buttons state
    var prevBtn = $('prevQuestionBtn');
    var nextBtn = $('nextQuestionBtn');
    var submitBtn = $('submitAnswersBtn');

    if (prevBtn) {
      if (idx > 0) {
        prevBtn.classList.remove('hidden');
        prevBtn.style.display = 'inline-flex';
      } else {
        prevBtn.classList.add('hidden');
        prevBtn.style.display = 'none';
      }
    }

    if (idx >= total - 1) {
      // Reached the final question dictated by user's count
      if (nextBtn) {
        nextBtn.classList.add('hidden');
        nextBtn.style.display = 'none';
      }
      if (submitBtn) {
        submitBtn.classList.remove('hidden');
        submitBtn.style.display = 'inline-flex';
      }
    } else {
      // Not on final question yet
      if (nextBtn) {
        nextBtn.classList.remove('hidden');
        nextBtn.style.display = 'inline-flex';
      }
      if (submitBtn) {
        submitBtn.classList.add('hidden');
        submitBtn.style.display = 'none';
      }
    }

    // Scroll naturally to top of question container
    var quizMain = $('quizMain');
    if (quizMain) quizMain.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function nextQuestion() {
    var qs = (state.quizData && state.quizData.questions) || [];
    if (state.currentIndex < qs.length - 1) {
      state.currentIndex++;
      updateQuestionNav();
    }
  }

  function prevQuestion() {
    if (state.currentIndex > 0) {
      state.currentIndex--;
      updateQuestionNav();
    }
  }

  /* ------------------------ Render Questions Form ------------------------ */
  function renderQuizQuestions(qs) {
    var box = $('questions');
    if (!box) return;
    box.textContent = '';
    state.currentIndex = 0;

    qs.forEach(function (q, i) {
      var card = document.createElement('div');
      // Initially, display exactly ONE question (the first one)
      card.className = 'q-card ' + (i === 0 ? 'active-q' : 'hidden-q');
      card.setAttribute('role', 'group');
      card.id = 'qcard' + i;

      var num = document.createElement('div');
      num.className = 'q-num';
      num.id = 'qh' + i;
      num.textContent = 'Question ' + (i + 1) + ' of ' + qs.length;
      card.setAttribute('aria-labelledby', num.id);

      var txt = document.createElement('p');
      txt.className = 'q-text';
      txt.textContent = (q.type === 'tf' ? 'True or False: ' : '') + q.text;

      var opts = document.createElement('div');
      opts.className = 'q-opts';

      q.options.forEach(function (o, j) {
        var lab = document.createElement('label');
        lab.className = 'q-opt';
        lab.id = 'opt_' + i + '_' + j;

        var inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'q' + i;
        inp.value = String(j);

        var sp = document.createElement('span');
        sp.textContent = o;

        lab.appendChild(inp);
        lab.appendChild(sp);

        // Interactive visual container: toggle selected style on selection
        inp.addEventListener('change', function () {
          opts.querySelectorAll('.q-opt').forEach(function (b) {
            b.classList.remove('selected');
          });
          if (inp.checked) {
            lab.classList.add('selected');
          }
        });

        opts.appendChild(lab);
      });

      card.appendChild(num);
      card.appendChild(txt);
      card.appendChild(opts);
      box.appendChild(card);
    });

    updateQuestionNav();
  }

  /* ---------------- Scroll Lock / Unlock & Results Glide Management ---------------- */
  function lockQuizScrolling() {
    var qc = $('quizContainer');
    var qm = $('quizMain');

    document.body.classList.add('quiz-in-progress');
    document.body.classList.remove('quiz-submitted', 'quiz-scroll-enabled');
    document.body.style.overflow = 'hidden';
    document.body.style.overflowY = 'hidden';

    document.documentElement.classList.add('quiz-in-progress');
    document.documentElement.classList.remove('quiz-submitted', 'quiz-scroll-enabled');
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overflowY = 'hidden';

    if (qc) {
      qc.classList.add('quiz-in-progress');
      qc.classList.remove('quiz-submitted', 'quiz-scroll-enabled');
      qc.style.overflow = 'hidden';
      qc.style.overflowY = 'hidden';
      qc.scrollTop = 0;
    }

    if (qm) {
      qm.classList.add('quiz-in-progress');
      qm.classList.remove('quiz-submitted', 'quiz-scroll-enabled');
      qm.scrollTop = 0;
    }

    window.scrollTo(0, 0);
  }

  function enableQuizScrolling() {
    var qc = $('quizContainer');
    var qm = $('quizMain');

    // Remove restrictive quiz-in-progress classes
    document.body.classList.remove('quiz-in-progress');
    document.documentElement.classList.remove('quiz-in-progress');
    if (qc) qc.classList.remove('quiz-in-progress');
    if (qm) qm.classList.remove('quiz-in-progress');

    // Add submitted and scroll-enabled classes immediately
    document.body.classList.add('quiz-submitted', 'quiz-scroll-enabled');
    document.documentElement.classList.add('quiz-submitted', 'quiz-scroll-enabled');
    if (qc) qc.classList.add('quiz-submitted', 'quiz-scroll-enabled');
    if (qm) qm.classList.add('quiz-submitted', 'quiz-scroll-enabled');

    // Dynamically update container and body CSS/style properties to allow vertical scrolling
    if (qc) {
      qc.style.overflow = 'visible';
      qc.style.overflowY = 'auto';
      qc.style.overflowX = 'hidden';
      qc.style.scrollBehavior = 'smooth';
      qc.style.webkitOverflowScrolling = 'touch';
    }

    document.body.style.overflow = 'visible';
    document.body.style.overflowY = 'auto';
    document.body.style.overflowX = 'hidden';

    document.documentElement.style.overflow = 'visible';
    document.documentElement.style.overflowY = 'auto';
    document.documentElement.style.overflowX = 'hidden';
    document.documentElement.style.scrollBehavior = 'smooth';

    if (qm) {
      qm.style.overflow = 'visible';
      qm.style.overflowY = 'visible';
      qm.style.height = 'auto';
      qm.style.maxHeight = 'none';
    }
  }

  function smoothScrollToResults() {
    var scoreBox = $('scoreBox');
    var resultsScreen = $('quizResultsScreen');
    var target = scoreBox || resultsScreen;
    if (!target) return;

    var qc = $('quizContainer');
    var qm = $('quizMain');

    // 1. Element-level smooth scrollIntoView (handles ancestor scroll containers natively)
    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      try {
        target.scrollIntoView(true);
      } catch (err2) {}
    }

    // 2. Explicit smooth scroll on quizContainer (essential when inside full-screen mode)
    if (qc && typeof qc.scrollTo === 'function') {
      try {
        var qcRect = qc.getBoundingClientRect();
        var targetRect = target.getBoundingClientRect();
        var targetTop = (targetRect.top - qcRect.top) + qc.scrollTop - 24;
        qc.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'smooth'
        });
      } catch (e) {}
    }

    // 3. Explicit window smooth scroll (for non-fullscreen or documentElement viewport mode)
    try {
      var winScrollTop = target.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0) - 24;
      window.scrollTo({
        top: Math.max(0, winScrollTop),
        behavior: 'smooth'
      });
    } catch (e) {}

    // 4. Supplementary quizMain smooth scroll if applicable
    if (qm && typeof qm.scrollTo === 'function' && qm.scrollHeight > qm.clientHeight) {
      try {
        var qmRect = qm.getBoundingClientRect();
        var qmTargetTop = (target.getBoundingClientRect().top - qmRect.top) + qm.scrollTop - 24;
        qm.scrollTo({
          top: Math.max(0, qmTargetTop),
          behavior: 'smooth'
        });
      } catch (e) {}
    }
  }

  /* --------------------------- Start Quiz Flow --------------------------- */
  function startQuiz() {
    if (!state.quizData || !state.quizData.questions || !state.quizData.questions.length) {
      showError('Assessment data is missing or incomplete. Please return to the quiz generator.');
      return;
    }

    state.currentIndex = 0;
    renderQuizQuestions(state.quizData.questions);

    // Keep scroll restrictions active while the quiz is in progress to maintain secure testing environment
    lockQuizScrolling();

    // The moment the "Start Quiz" button is clicked, trigger Fullscreen API on the quiz container
    var quizContainer = $('quizContainer') || $('quizMain') || document.documentElement;
    requestFullScreen(quizContainer)
      .then(function () {
        state.isQuizStarted = true;
        state.isQuizSubmitted = false;
        state.isQuizInvalidated = false;
        showScreen('activeQuizScreen');

        // Fix scrolling immediately when quiz starts so mouse scroll functions naturally
        setTimeout(function () {
          quizContainer.scrollTop = 0;
          window.scrollTo(0, 0);
          quizContainer.focus();
        }, 40);
      })
      .catch(function (err) {
        console.warn('Fullscreen request prompt/error:', err);
        state.isQuizStarted = true;
        state.isQuizSubmitted = false;
        state.isQuizInvalidated = false;
        showScreen('activeQuizScreen');

        setTimeout(function () {
          quizContainer.scrollTop = 0;
          window.scrollTo(0, 0);
          quizContainer.focus();
        }, 40);

        if (!isFullscreenActive()) {
          invalidateAndLockQuiz();
        }
      });
  }

  /* ----------------------- Submit & Grade Quiz Flow ----------------------- */
  function submitQuiz(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!state.quizData || !state.quizData.questions || state.isQuizSubmitted || state.isQuizInvalidated) return;

    // The exact millisecond the user submits answers, automatically update CSS/style properties to allow vertical scrolling
    enableQuizScrolling();

    var qs = state.quizData.questions;
    var cards = $('questions').querySelectorAll('.q-card');
    var score = 0;
    var skipped = 0;

    var reviewBox = $('reviewedQuestions');
    if (reviewBox) reviewBox.textContent = '';

    qs.forEach(function (q, i) {
      var originalCard = cards[i];
      var chosenInput = originalCard ? originalCard.querySelector('input[name="q' + i + '"]:checked') : null;
      var chosenVal = chosenInput ? Number(chosenInput.value) : -1;
      var isCorrect = chosenVal === q.correct;

      if (isCorrect) {
        score++;
      } else if (chosenVal === -1) {
        skipped++;
      }

      // Reviewed card with distinct option highlights
      var card = document.createElement('div');
      card.className = 'q-card ' + (isCorrect ? 'right' : 'wrong');

      var num = document.createElement('div');
      num.className = 'q-num';
      num.textContent = 'Question ' + (i + 1) + ' of ' + qs.length;

      var txt = document.createElement('p');
      txt.className = 'q-text';
      txt.textContent = (q.type === 'tf' ? 'True or False: ' : '') + q.text;

      var opts = document.createElement('div');
      opts.className = 'q-opts';

      q.options.forEach(function (optText, j) {
        var lab = document.createElement('div');
        lab.className = 'q-opt';

        if (j === q.correct) {
          lab.classList.add('is-correct');
        } else if (j === chosenVal && !isCorrect) {
          lab.classList.add('is-wrong');
        }

        var marker = document.createElement('span');
        marker.style.fontWeight = '700';
        marker.style.marginRight = '8px';
        marker.textContent = (j === q.correct) ? '\u2713 ' : (j === chosenVal ? '\u2717 ' : '\u25CB ');

        var sp = document.createElement('span');
        sp.textContent = optText;

        lab.appendChild(marker);
        lab.appendChild(sp);
        opts.appendChild(lab);
      });

      var fb = document.createElement('p');
      fb.className = 'q-explain';
      fb.textContent = (isCorrect ? '\u2713 Correct. ' : '\u2717 Correct answer: ' + q.options[q.correct] + '. ') + (q.explain || '');

      card.appendChild(num);
      card.appendChild(txt);
      card.appendChild(opts);
      card.appendChild(fb);

      if (reviewBox) reviewBox.appendChild(card);
    });

    // Mark quiz as submitted and disarm strict full-screen enforcement
    state.isQuizSubmitted = true;
    state.isQuizStarted = false;

    var modal = $('fullscreenModal');
    if (modal) modal.classList.add('hidden');
    var quizMain = $('quizMain');
    if (quizMain) quizMain.classList.remove('assessment-blur');

    var total = qs.length;
    var pct = Math.round((score / total) * 100);
    var evalMsg = pct >= 90 ? 'Outstanding work!' : pct >= 75 ? 'Great performance!' : pct >= 50 ? 'Good effort \u2014 review the items below.' : 'Keep studying \u2014 detailed explanations are provided below.';

    var scoreBox = $('scoreBox');
    if (scoreBox) {
      scoreBox.textContent = 'Final Score: ' + score + ' / ' + total + ' (' + pct + '%). ' + evalMsg + (skipped > 0 ? ' (' + skipped + ' unanswered)' : '');
    }

    showScreen('quizResultsScreen');

    // Automatically glide user's viewport down to results/score section with smooth animation
    smoothScrollToResults();
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        setTimeout(smoothScrollToResults, 30);
      });
    } else {
      setTimeout(smoothScrollToResults, 30);
    }
  }

  /* --------------------------- Error Handling --------------------------- */
  function showError(msg, title) {
    var titleEl = $('quizErrorTitle');
    var msgEl = $('quizErrorMessage');
    if (titleEl && title) titleEl.textContent = title;
    if (msgEl && msg) msgEl.textContent = msg;
    showScreen('quizErrorScreen');
  }

  /* ----------------------- Ingestion & Data Sync ----------------------- */
  function checkStorageForQuiz() {
    var status = null;
    var rawQuiz = null;

    try {
      status = localStorage.getItem('edushare_quiz_status');
      rawQuiz = localStorage.getItem('edushare_active_quiz');
    } catch (e) {
      console.warn('localStorage read error:', e);
    }

    if (rawQuiz) {
      try {
        var parsed = JSON.parse(rawQuiz);
        if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          initPreQuiz(parsed);
          return true;
        }
      } catch (err) {
        console.error('Failed to parse active quiz:', err);
      }
    }

    if (status && status.startsWith('error:')) {
      showError(status.slice(6), 'Generation Error');
      return true;
    }

    if (status === 'generating') {
      showScreen('quizLoadingScreen');
      return false;
    }

    return false;
  }

  /* -------------------------------- Init -------------------------------- */
  function init() {
    // 1. Strict Full-Screen & Anti-Cheat Security: Listen for Fullscreen Exit (Esc), Alt-Tab (window blur), and Tab/Window Hiding (visibilitychange)
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
      document.addEventListener(ev, handleFullscreenChange);
    });

    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 2. Next & Previous Question Navigation
    var nextBtn = $('nextQuestionBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', nextQuestion);
    }

    var prevBtn = $('prevQuestionBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', prevQuestion);
    }

    // 3. Restart Quiz Button in Lockdown Modal
    var restartBtn = $('restartQuizBtn');
    if (restartBtn) {
      restartBtn.addEventListener('click', restartQuiz);
    }

    // 4. Start Quiz Button
    var startBtn = $('startQuizBtn');
    if (startBtn) {
      startBtn.addEventListener('click', startQuiz);
    }

    // 5. Quiz Form Submit & Instant Scroll Enable on Submit Click
    var submitAnswersBtn = $('submitAnswersBtn');
    if (submitAnswersBtn) {
      submitAnswersBtn.addEventListener('click', function () {
        enableQuizScrolling();
      });
    }

    var qForm = $('quizForm');
    if (qForm) {
      qForm.addEventListener('submit', submitQuiz);
    }

    // 6. Exit Fullscreen Button in Results
    var exitFsBtn = $('exitFullscreenBtn');
    if (exitFsBtn) {
      exitFsBtn.addEventListener('click', function () {
        exitFullScreen().catch(function () {});
      });
    }

    // 7. Cross-tab Message Listener (from window.opener)
    window.addEventListener('message', function (ev) {
      if (!ev.data) return;
      if (ev.data.type === 'EDUSHARE_QUIZ_READY' && ev.data.payload) {
        initPreQuiz(ev.data.payload);
      } else if (ev.data.type === 'EDUSHARE_QUIZ_ERROR') {
        showError(ev.data.message || 'Unable to generate quiz.', 'Generation Error');
      }
    });

    // 8. Cross-tab Storage Listener
    window.addEventListener('storage', function (e) {
      if (e.key === 'edushare_active_quiz' || e.key === 'edushare_quiz_status') {
        checkStorageForQuiz();
      }
    });

    // 9. Initial check and polling fallback
    var found = checkStorageForQuiz();
    if (!found) {
      var pollAttempts = 0;
      var pollTimer = setInterval(function () {
        pollAttempts++;
        var ok = checkStorageForQuiz();
        if (ok || pollAttempts > 180) {
          clearInterval(pollTimer);
          if (!ok && !state.quizData) {
            showError('No active quiz was received. Please return to the Quiz Generator.', 'Quiz Not Found');
          }
        }
      }, 250);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

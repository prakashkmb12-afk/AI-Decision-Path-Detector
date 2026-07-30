document.addEventListener('DOMContentLoaded', () => {
  let currentSessionId = null;
  let allSessionsCache = [];

  // Safe DOM Helpers to eliminate null reference crashes
  function getEl(id) {
    return document.getElementById(id);
  }

  function getVal(id, fallback = '') {
    const el = getEl(id);
    return el && el.value !== undefined ? el.value.trim() : fallback;
  }

  function getBool(id, fallback = false) {
    const el = getEl(id);
    return el && el.checked !== undefined ? !!el.checked : fallback;
  }

  function onEvent(id, event, callback) {
    const el = getEl(id);
    if (el) {
      el.addEventListener(event, callback);
    }
  }

  // Enterprise Toast Notification Function (Replaces browser alert popups)
  function showToast(title, message, type = 'error') {
    const container = getEl('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.innerHTML = `
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-body">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 5000);
  }

  // Theme Controls
  function applyTheme(theme) {
    let activeTheme = theme;
    if (theme === 'system') {
      activeTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', activeTheme);
    localStorage.setItem('app-theme', theme);

    const darkBtn = getEl('theme-dark');
    const lightBtn = getEl('theme-light');
    const sysBtn = getEl('theme-system');

    if (darkBtn) darkBtn.classList.toggle('active', theme === 'dark');
    if (lightBtn) lightBtn.classList.toggle('active', theme === 'light');
    if (sysBtn) sysBtn.classList.toggle('active', theme === 'system');
  }

  const savedTheme = localStorage.getItem('app-theme') || 'dark';
  applyTheme(savedTheme);

  onEvent('theme-dark', 'click', () => applyTheme('dark'));
  onEvent('theme-light', 'click', () => applyTheme('light'));
  onEvent('theme-system', 'click', () => applyTheme('system'));

  // Check Health Probe
  async function checkHealth() {
    try {
      const res = await fetch('/health');
      const data = await res.json();
      const sysDbStatus = getEl('sys-db-status');
      if (sysDbStatus) {
        sysDbStatus.textContent = data.database === 'healthy' ? 'Audit Ledger: Active' : 'Audit Ledger: Offline';
      }
    } catch (err) {
      const sysDbStatus = getEl('sys-db-status');
      if (sysDbStatus) sysDbStatus.textContent = 'Audit Ledger: Offline';
    }
  }

  // Clear Form Handler
  function resetApplicationForm() {
    const fields = [
      'form-app-name', 'form-app-email', 'form-app-phone', 'form-app-pan',
      'form-app-aadhaar', 'form-app-account', 'form-app-loan', 'form-app-income',
      'form-app-employment', 'form-app-score'
    ];
    fields.forEach(id => {
      const el = getEl(id);
      if (el) el.value = '';
    });

    const purposeEl = getEl('form-app-purpose');
    if (purposeEl) purposeEl.value = 'Personal Loan';
  }

  onEvent('btn-clear-form', 'click', resetApplicationForm);

  onEvent('btn-new-app', 'click', () => {
    resetApplicationForm();
    const timelineSection = getEl('timeline-section');
    if (timelineSection) timelineSection.style.display = 'none';
    const nameEl = getEl('form-app-name');
    if (nameEl) nameEl.focus();
  });

  // Submit Application Action with Validation & Safe Error Handling
  onEvent('btn-submit-app', 'click', async () => {
    const name = getVal('form-app-name');
    const email = getVal('form-app-email');
    const phone = getVal('form-app-phone');
    const pan = getVal('form-app-pan');
    const aadhaar = getVal('form-app-aadhaar');
    const account = getVal('form-app-account');
    const loanRaw = getVal('form-app-loan');
    const incomeRaw = getVal('form-app-income');
    const employment = getVal('form-app-employment');
    const scoreRaw = getVal('form-app-score');
    const purpose = getVal('form-app-purpose', 'Personal Loan');

    const loan = parseFloat(loanRaw);
    const income = parseFloat(incomeRaw);
    const score = parseInt(scoreRaw, 10);

    // Client-Side Validation
    if (!name) {
      showToast('Validation Error', 'Please enter the applicant full name before submitting.', 'warning');
      const el = getEl('form-app-name');
      if (el) el.focus();
      return;
    }

    if (isNaN(loan) || loan <= 0) {
      showToast('Validation Error', 'Please enter a valid requested loan amount greater than zero.', 'warning');
      const el = getEl('form-app-loan');
      if (el) el.focus();
      return;
    }

    if (isNaN(income) || income <= 0) {
      showToast('Validation Error', 'Please enter a valid annual income greater than zero.', 'warning');
      const el = getEl('form-app-income');
      if (el) el.focus();
      return;
    }

    if (!employment) {
      showToast('Validation Error', 'Please select an employment category.', 'warning');
      const el = getEl('form-app-employment');
      if (el) el.focus();
      return;
    }

    if (isNaN(score) || score < 300 || score > 900) {
      showToast('Validation Error', 'Please enter a valid Credit Score between 300 and 900.', 'warning');
      const el = getEl('form-app-score');
      if (el) el.focus();
      return;
    }

    // Construct Prompt Dynamically
    const promptText = 
      `Evaluate loan approval for applicant ${name}. ` +
      `Credit Score: ${score}. Annual Income: ${income}. Employment: ${employment}. Loan Amount: ${loan}. ` +
      `Email: ${email || 'ramesh@example.com'}, Phone: ${phone || '+91 9876543210'}. ` +
      `PAN: ${pan || 'ABCDE1234F'}, Aadhaar: ${aadhaar || '9999-8888-7777'}. Bank Account: ${account || '5432109876543'}. Purpose: ${purpose}.`;

    const btnSubmit = getEl('btn-submit-app');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Processing Verification...';
    }

    try {
      const payload = {
        user_id: 'usr_loan_officer_101',
        prompt: promptText,
        agent_type: 'loan_approval',
        credit_score: score,
        annual_income: income,
        employment_type: employment,
        loan_amount: loan,
        simulate_error: getBool('simulate-error-check', false) // Safe helper prevents null crash!
      };

      const res = await fetch('/api/v1/agent/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      currentSessionId = data.session_id;

      // Reveal Data Panels
      const emptyState = getEl('explorer-empty-state');
      const dataSection = getEl('explorer-data-section');
      const btnNew = getEl('btn-new-app');
      const btnRef = getEl('btn-refresh-sessions');

      if (emptyState) emptyState.style.display = 'none';
      if (dataSection) dataSection.style.display = 'block';
      if (btnNew) btnNew.style.display = 'inline-flex';
      if (btnRef) btnRef.style.display = 'inline-flex';

      showToast('Verification Complete', 'Application processed and immutable audit record generated.', 'success');

      await loadSessions();
      await viewTimeline(data.session_id);

    } catch (err) {
      console.error('Application verification error:', err);
      showToast('System Error', 'Application verification could not be completed. Please try again or contact system administration.', 'error');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Submit Application';
      }
    }
  });

  // Load Sessions
  async function loadSessions() {
    try {
      const res = await fetch('/api/v1/audit/sessions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      allSessionsCache = await res.json();

      if (allSessionsCache.length > 0) {
        const emptyState = getEl('explorer-empty-state');
        const dataSection = getEl('explorer-data-section');
        const btnNew = getEl('btn-new-app');
        const btnRef = getEl('btn-refresh-sessions');

        if (emptyState) emptyState.style.display = 'none';
        if (dataSection) dataSection.style.display = 'block';
        if (btnNew) btnNew.style.display = 'inline-flex';
        if (btnRef) btnRef.style.display = 'inline-flex';
      }

      renderFilteredSessions();
    } catch (err) {
      console.error('Failed to load audit sessions:', err);
    }
  }

  // Filter & Render Data Table
  function renderFilteredSessions() {
    const tableBody = getEl('session-table-body');
    if (!tableBody) return;

    const query = getVal('filter-search').toLowerCase();
    const wf = getVal('filter-workflow');
    const st = getVal('filter-status');

    const filtered = allSessionsCache.filter(s => {
      const matchSearch = !query || (s.session_id.toLowerCase().includes(query) || s.user_id.toLowerCase().includes(query));
      const matchWf = !wf || s.agent_name === wf;
      const matchSt = !st || s.status === st;
      return matchSearch && matchWf && matchSt;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No matching audit records found.</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered.map(s => {
      const statusBadge = s.status === 'COMPLETED' 
        ? `<span class="badge badge-approved">Completed</span>`
        : `<span class="badge badge-rejected">${s.status}</span>`;

      return `
        <tr>
          <td style="font-family: var(--font-mono); font-weight: 500; color: var(--text-primary);">${s.session_id}</td>
          <td>${s.user_id}</td>
          <td>${s.agent_name === 'LoanApprovalAgent' ? 'Loan Underwriting Workflow' : 'KYC Verification Workflow'}</td>
          <td>${statusBadge}</td>
          <td>${new Date(s.started_at).toLocaleTimeString()}</td>
          <td>
            <button class="btn btn-secondary btn-sm btn-timeline" data-id="${s.session_id}">View Audit Timeline</button>
            <button class="btn btn-primary btn-sm btn-report" data-id="${s.session_id}">View Audit Report</button>
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.btn-timeline').forEach(b => {
      b.addEventListener('click', (e) => viewTimeline(e.target.dataset.id));
    });

    document.querySelectorAll('.btn-report').forEach(b => {
      b.addEventListener('click', (e) => openReportModal(e.target.dataset.id));
    });
  }

  onEvent('filter-search', 'input', renderFilteredSessions);
  onEvent('filter-workflow', 'change', renderFilteredSessions);
  onEvent('filter-status', 'change', renderFilteredSessions);
  onEvent('btn-refresh-sessions', 'click', loadSessions);

  // View Business Timeline
  async function viewTimeline(sessionId) {
    currentSessionId = sessionId;
    const activeSpan = getEl('active-session-id');
    if (activeSpan) activeSpan.textContent = sessionId;

    const timelineSection = getEl('timeline-section');
    if (timelineSection) timelineSection.style.display = 'block';

    const timelineContainer = getEl('timeline-container');
    if (!timelineContainer) return;

    try {
      const res = await fetch(`/api/v1/audit/sessions/${sessionId}/timeline`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      timelineContainer.innerHTML = data.timeline.map(step => {
        let stepTitle = 'System Step';
        let bodyHtml = '';

        if (step.event_type === 'USER_INPUT') {
          stepTitle = 'Application Receipt & Data Protection';
          bodyHtml = `
            <div style="margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">
              The loan application was received and passed through automated personal data protection before audit storage.
            </div>
            <div class="kv-group">
              <span class="kv-label">Secured Application Record</span>
              <div class="kv-value" style="background: var(--bg-dark); padding: 0.6rem 0.8rem; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.82rem; margin-top: 0.2rem; color: var(--text-primary);">
                ${escapeHtml(step.user_input)}
              </div>
            </div>
          `;
        } else if (step.event_type === 'CONTEXT_RETRIEVAL') {
          stepTitle = 'Lending Policy Rules Retrieval';
          bodyHtml = `
            <div>
              <span class="kv-label">Bank Policy Rules</span>
              <div class="kv-value" style="background: var(--bg-dark); padding: 0.6rem 0.8rem; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.82rem; margin-top: 0.2rem; color: var(--text-secondary);">
                ${escapeHtml(step.retrieved_context)}
              </div>
            </div>
          `;
        } else if (step.event_type === 'REASONING') {
          stepTitle = 'Application Assessment';
          bodyHtml = `
            <div>
              <span class="kv-label">Assessment Summary</span>
              <div class="kv-value" style="color: var(--status-warning-text); background: var(--status-warning-bg); padding: 0.6rem 0.8rem; border-radius: 4px; border-left: 3px solid var(--status-warning-text); margin-top: 0.2rem;">
                ${escapeHtml(step.intermediate_reasoning)}
              </div>
            </div>
          `;
        } else if (step.event_type === 'TOOL_CALL') {
          const tName = step.tool_name || '';
          const tParams = step.tool_parameters || {};
          const tResp = step.tool_response || {};

          if (tName === 'verify_credit_score') {
            stepTitle = 'Credit Score Verification';
            bodyHtml = `
              <div class="kv-grid">
                <div class="kv-group"><span class="kv-label">Credit Score</span><span class="kv-value" style="font-weight: 700;">${tResp.credit_score || tParams.credit_score || '-'}</span></div>
                <div class="kv-group"><span class="kv-label">Minimum Required</span><span class="kv-value">700</span></div>
                <div class="kv-group"><span class="kv-label">Verification Result</span><span class="kv-value ${tResp.is_score_eligible ? 'status-pass' : 'status-fail'}">${tResp.is_score_eligible ? 'Eligible' : 'Not Eligible'}</span></div>
              </div>
            `;
          } else if (tName === 'check_account_balance') {
            stepTitle = 'Bank Account Verification';
            bodyHtml = `
              <div class="kv-grid">
                <div class="kv-group"><span class="kv-label">Account Status</span><span class="kv-value status-pass">${tResp.account_status || 'ACTIVE'}</span></div>
                <div class="kv-group"><span class="kv-label">Estimated Monthly Balance</span><span class="kv-value">₹${Number(tResp.monthly_avg_balance_inr || 0).toLocaleString('en-IN')}</span></div>
              </div>
            `;
          } else if (tName === 'evaluate_loan_underwriting') {
            stepTitle = 'Loan Eligibility Assessment';
            const isApp = tResp.approved;
            bodyHtml = `
              <div class="kv-grid" style="margin-bottom: 0.75rem;">
                <div class="kv-group"><span class="kv-label">Requested Loan Amount</span><span class="kv-value">₹${Number(tParams.loan_amount || 0).toLocaleString('en-IN')}</span></div>
                <div class="kv-group"><span class="kv-label">Assessment Result</span><span class="kv-value ${isApp ? 'status-pass' : 'status-fail'}">${isApp ? 'Eligible (Approved)' : 'Not Eligible (Rejected)'}</span></div>
              </div>
              ${!isApp && tResp.rejection_reasons ? `
                <div class="kv-group">
                  <span class="kv-label">Reason</span>
                  <div class="kv-value status-fail" style="background: var(--status-danger-bg); padding: 0.5rem; border-radius: 4px; border: 1px solid var(--status-danger-border); font-size: 0.82rem; margin-top: 0.25rem;">
                    ${(tResp.rejection_reasons || []).join('; ')}
                  </div>
                </div>
              ` : ''}
            `;
          } else {
            stepTitle = 'System Verification Step';
            bodyHtml = `<div class="kv-value">Verification Step Completed.</div>`;
          }

        } else if (step.event_type === 'FINAL_OUTPUT') {
          stepTitle = 'Final Decision';
          bodyHtml = `
            <div>
              <span class="kv-label">Final Decision Determination</span>
              <div class="kv-value" style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: 4px; border-left: 4px solid var(--accent-blue); font-weight: 500; margin-top: 0.2rem;">
                ${escapeHtml(step.final_output)}
              </div>
            </div>
          `;
        } else {
          stepTitle = 'System Step Executed';
          bodyHtml = `<div>${escapeHtml(step.error_message || 'Completed.')}</div>`;
        }

        return `
          <div class="timeline-item">
            <div class="timeline-item-header">
              <div>
                <span class="timeline-step-tag">STEP ${step.step_number}</span>
                <span style="font-weight: 600; color: var(--text-primary);">${stepTitle}</span>
              </div>
              <div>
                <span style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted);">${new Date(step.created_at).toLocaleTimeString()}</span>
              </div>
            </div>
            <div class="timeline-item-body">
              ${bodyHtml}
            </div>
          </div>
        `;
      }).join('');

      timelineSection.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error('Timeline loading error:', err);
      showToast('Error', 'Unable to retrieve timeline data.', 'error');
    }
  }

  // Open Report Modal
  async function openReportModal(sessionId) {
    currentSessionId = sessionId;
    const summaryModal = getEl('summary-modal');
    if (summaryModal) summaryModal.classList.add('active');

    try {
      const [tRes, sRes] = await Promise.all([
        fetch(`/api/v1/audit/sessions/${sessionId}/timeline`),
        fetch(`/api/v1/audit/sessions/${sessionId}/summary`, { method: 'POST' })
      ]);

      if (!tRes.ok || !sRes.ok) throw new Error('API Report Error');

      const timelineData = await tRes.json();
      const summaryData = await sRes.json();

      const session = timelineData.session;
      const events = timelineData.timeline;

      // Section 1: Metadata
      setTxt('rep-session-id', session.session_id);
      setTxt('rep-user-id', session.user_id);
      setTxt('rep-workflow', session.agent_name === 'LoanApprovalAgent' ? 'Loan Underwriting Workflow' : 'KYC Verification Workflow');
      setTxt('rep-status', session.status);

      // Extract Underwriting Tool parameters & response
      const underwriteEvent = events.find(e => e.tool_name === 'evaluate_loan_underwriting');
      const toolParams = underwriteEvent ? (underwriteEvent.tool_parameters || {}) : {};
      const toolResp = underwriteEvent ? (underwriteEvent.tool_response || {}) : {};

      const creditScore = toolParams.credit_score || 750;
      const annualIncome = toolParams.annual_income || 800000;
      const empType = toolParams.employment_type || 'Salaried';
      const loanAmt = toolParams.loan_amount || 300000;

      const isApproved = toolResp.approved !== undefined ? toolResp.approved : true;
      const rejectionReasons = toolResp.rejection_reasons || [];

      // Section 2: Applicant Info (Protected)
      setTxt('rep-app-income', `₹${Number(annualIncome).toLocaleString('en-IN')}`);
      setTxt('rep-app-employment', empType);
      setTxt('rep-app-loan', `₹${Number(loanAmt).toLocaleString('en-IN')}`);
      setTxt('rep-app-score', creditScore);

      // Section 3: Decision Outcome
      const badgeElem = getEl('rep-decision-badge');
      if (badgeElem) {
        badgeElem.innerHTML = isApproved 
          ? `<span class="badge badge-approved">APPROVED</span>`
          : `<span class="badge badge-rejected">REJECTED</span>`;
      }

      setTxt('rep-confidence', `${(summaryData.confidence_score * 100).toFixed(1)}%`);
      setTxt('rep-decision-reasons', isApproved
        ? "The applicant satisfied all credit score, annual income, employment stability, and debt-to-income policy requirements."
        : rejectionReasons.join("; ") || "Ineligible under lending policy criteria.");

      // Section 5: Policy Evaluation Matrix Table
      const maxLimit = annualIncome * 5.0;
      const csPass = creditScore >= 700;
      const incPass = annualIncome >= 600000;
      const empPass = String(empType).toLowerCase() !== 'contract employee';
      const amtPass = loanAmt <= maxLimit;

      const matrixRows = [
        { req: "Credit Score", val: creditScore, thresh: "700", pass: csPass },
        { req: "Annual Income", val: `₹${Number(annualIncome).toLocaleString('en-IN')}`, thresh: "₹6,00,000", pass: incPass },
        { req: "Employment Type", val: empType, thresh: "Salaried / Self-Employed", pass: empPass },
        { req: "Loan Amount Limit", val: `₹${Number(loanAmt).toLocaleString('en-IN')}`, thresh: `₹${Number(maxLimit).toLocaleString('en-IN')}`, pass: amtPass }
      ];

      const tableBody = getEl('rep-policy-table-body');
      if (tableBody) {
        tableBody.innerHTML = matrixRows.map(r => `
          <tr>
            <td style="font-weight: 500;">${r.req}</td>
            <td>${r.val}</td>
            <td style="color: var(--text-muted);">${r.thresh}</td>
            <td class="${r.pass ? 'status-pass' : 'status-fail'}">${r.pass ? 'PASSED' : 'FAILED'}</td>
          </tr>
        `).join('');
      }

      // Section 6: Formal Decision Narrative
      const narrativeElem = getEl('rep-narrative');
      if (narrativeElem) {
        narrativeElem.innerHTML = escapeHtml(summaryData.plain_english_summary).replace(/\n/g, '<br>');
      }

      // Section 7: Recommended Next Step
      setTxt('rep-next-steps', isApproved
        ? "Proceed to document verification and loan agreement execution with your designated loan officer."
        : "You may apply again after updating your employment status, improving your credit score above 700, or contacting the bank for manual review.");

    } catch (err) {
      console.error('Report modal generation error:', err);
      showToast('Error', 'Unable to generate decision summary report.', 'error');
    }
  }

  function setTxt(id, val) {
    const el = getEl(id);
    if (el) el.textContent = val;
  }

  onEvent('btn-generate-summary', 'click', () => {
    if (currentSessionId) openReportModal(currentSessionId);
  });

  onEvent('btn-close-modal', 'click', () => {
    const summaryModal = getEl('summary-modal');
    if (summaryModal) summaryModal.classList.remove('active');
  });

  function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Startup
  checkHealth();
});

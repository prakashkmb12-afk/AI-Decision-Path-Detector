document.addEventListener('DOMContentLoaded', () => {
  let currentSessionId = null;
  let allSessionsCache = [];

  // Safe DOM Helpers
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
    if (el) el.addEventListener(event, callback);
  }

  // Enterprise Toast Notification
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

  // Dynamic Workflow Form Field Switcher
  onEvent('form-workflow-select', 'change', (e) => {
    const selected = e.target.value;
    const loanGroup = getEl('workflow-fields-loan');
    const kycGroup = getEl('workflow-fields-kyc');
    const insGroup = getEl('workflow-fields-insurance');

    if (loanGroup) loanGroup.style.display = selected === 'loan_approval' ? 'block' : 'none';
    if (kycGroup) kycGroup.style.display = selected === 'kyc_verification' ? 'block' : 'none';
    if (insGroup) insGroup.style.display = selected === 'insurance_claim' ? 'block' : 'none';
  });

  // Clear Form Handler
  function resetDecisionRequestForm() {
    const fields = [
      'form-loan-name', 'form-loan-email', 'form-loan-phone', 'form-loan-pan',
      'form-loan-aadhaar', 'form-loan-account', 'form-loan-amount', 'form-loan-income',
      'form-loan-employment', 'form-loan-score',
      'form-kyc-name', 'form-kyc-email', 'form-kyc-phone', 'form-kyc-docnum', 'form-kyc-facematch',
      'form-ins-name', 'form-ins-policynum', 'form-ins-amount'
    ];
    fields.forEach(id => {
      const el = getEl(id);
      if (el) el.value = '';
    });
  }

  onEvent('btn-clear-form', 'click', resetDecisionRequestForm);

  onEvent('btn-new-app', 'click', () => {
    resetDecisionRequestForm();
    const emptyState = getEl('explorer-empty-state');
    const resultCard = getEl('current-result-card');
    const dataSection = getEl('explorer-data-section');
    const timelineSection = getEl('timeline-section');
    const btnHistory = getEl('btn-toggle-history');
    const btnNew = getEl('btn-new-app');

    if (emptyState) emptyState.style.display = 'block';
    if (resultCard) resultCard.style.display = 'none';
    if (dataSection) dataSection.style.display = 'none';
    if (timelineSection) timelineSection.style.display = 'none';
    if (btnHistory) btnHistory.style.display = 'none';
    if (btnNew) btnNew.style.display = 'none';

    currentSessionId = null;
  });

  // Submit Decision Request Action
  onEvent('btn-submit-app', 'click', async () => {
    const workflowType = getVal('form-workflow-select', 'loan_approval');
    let promptText = '';
    let payloadData = {};

    if (workflowType === 'loan_approval') {
      const name = getVal('form-loan-name');
      const email = getVal('form-loan-email');
      const phone = getVal('form-loan-phone');
      const pan = getVal('form-loan-pan');
      const aadhaar = getVal('form-loan-aadhaar');
      const account = getVal('form-loan-account');
      const loanRaw = getVal('form-loan-amount');
      const incomeRaw = getVal('form-loan-income');
      const employment = getVal('form-loan-employment');
      const scoreRaw = getVal('form-loan-score');
      const purpose = getVal('form-loan-purpose', 'Personal Loan');

      const loan = parseFloat(loanRaw);
      const income = parseFloat(incomeRaw);
      const score = parseInt(scoreRaw, 10);

      // Validation
      if (!name) {
        showToast('Validation Error', 'Please enter the applicant full name.', 'warning');
        return;
      }
      if (isNaN(loan) || loan <= 0) {
        showToast('Validation Error', 'Please enter a valid requested loan amount.', 'warning');
        return;
      }
      if (isNaN(income) || income <= 0) {
        showToast('Validation Error', 'Please enter a valid annual income.', 'warning');
        return;
      }
      if (!employment) {
        showToast('Validation Error', 'Please select an employment category.', 'warning');
        return;
      }
      if (isNaN(score) || score < 300 || score > 900) {
        showToast('Validation Error', 'Please enter a valid Credit Score between 300 and 900.', 'warning');
        return;
      }

      promptText = 
        `Evaluate loan approval for applicant ${name}. Credit Score: ${score}. Annual Income: ${income}. ` +
        `Employment: ${employment}. Loan Amount: ${loan}. Email: ${email || 'ramesh@example.com'}, ` +
        `Phone: ${phone || '+91 9876543210'}. PAN: ${pan || 'ABCDE1234F'}, Aadhaar: ${aadhaar || '9999-8888-7777'}. ` +
        `Bank Account: ${account || '5432109876543'}. Purpose: ${purpose}.`;

      payloadData = {
        user_id: 'usr_governance_officer',
        prompt: promptText,
        agent_type: 'loan_approval',
        credit_score: score,
        annual_income: income,
        employment_type: employment,
        loan_amount: loan
      };

    } else if (workflowType === 'kyc_verification') {
      const name = getVal('form-kyc-name');
      const email = getVal('form-kyc-email');
      const phone = getVal('form-kyc-phone');
      const docType = getVal('form-kyc-doctype', 'PAN Card');
      const docNum = getVal('form-kyc-docnum');
      const faceMatch = getVal('form-kyc-facematch', '95');
      const address = getVal('form-kyc-address', 'Verified');

      if (!name) {
        showToast('Validation Error', 'Please enter subject full name for KYC evaluation.', 'warning');
        return;
      }

      promptText = 
        `Evaluate KYC identity verification for ${name}. Email: ${email || 'priya@example.com'}, ` +
        `Phone: ${phone || '+91 9876543210'}. Document Type: ${docType}, Document ID: ${docNum || 'ABCDE1234F'}. ` +
        `Face Match Rating: ${faceMatch}%, Address Verification: ${address}.`;

      payloadData = {
        user_id: 'usr_kyc_auditor',
        prompt: promptText,
        agent_type: 'kyc_verification',
        credit_score: 750,
        annual_income: 800000,
        employment_type: 'Salaried',
        loan_amount: 100000
      };

    } else if (workflowType === 'insurance_claim') {
      const name = getVal('form-ins-name');
      const policyNum = getVal('form-ins-policynum');
      const category = getVal('form-ins-category', 'Health');
      const amountRaw = getVal('form-ins-amount');
      const proof = getVal('form-ins-proof', 'Yes');

      if (!name) {
        showToast('Validation Error', 'Please enter policyholder name.', 'warning');
        return;
      }

      const claimAmt = parseFloat(amountRaw) || 150000;

      promptText = 
        `Evaluate insurance claim for policyholder ${name}. Policy Number: ${policyNum || 'POL-9876543'}, ` +
        `Claim Category: ${category}, Claim Amount: ₹${claimAmt}, Document Proof Attached: ${proof}.`;

      payloadData = {
        user_id: 'usr_claim_auditor',
        prompt: promptText,
        agent_type: 'insurance_claim',
        credit_score: 750,
        annual_income: 1000000,
        employment_type: 'Salaried',
        loan_amount: claimAmt
      };
    }

    const btnSubmit = getEl('btn-submit-app');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Evaluating AI Decision Path...';
    }

    try {
      const res = await fetch('/api/v1/agent/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadData)
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      currentSessionId = data.session_id;

      // Reveal Result Card & Top Buttons
      const emptyState = getEl('explorer-empty-state');
      const resultCard = getEl('current-result-card');
      const btnHistory = getEl('btn-toggle-history');
      const btnNew = getEl('btn-new-app');

      if (emptyState) emptyState.style.display = 'none';
      if (resultCard) resultCard.style.display = 'block';
      if (btnHistory) btnHistory.style.display = 'inline-flex';
      if (btnNew) btnNew.style.display = 'inline-flex';

      setTxt('current-card-session-id', data.session_id);
      setTxt('current-card-time', new Date().toLocaleTimeString());

      const wfLabel = workflowType === 'loan_approval' ? 'Loan Underwriting Workflow' :
                     (workflowType === 'kyc_verification' ? 'KYC Verification Workflow' : 'Insurance Claim Processing Workflow');
      setTxt('current-card-workflow', wfLabel);

      const isApproved = !data.final_output_redacted.toLowerCase().includes('rejected');
      const badgeElem = getEl('current-card-decision-badge');
      if (badgeElem) {
        badgeElem.innerHTML = isApproved 
          ? `<span class="badge badge-approved">APPROVED / VERIFIED</span>`
          : `<span class="badge badge-rejected">REJECTED</span>`;
      }

      showToast('Decision Audit Logged', 'AI Decision path reconstructed and immutable audit trace saved.', 'success');

      await viewTimeline(data.session_id);

    } catch (err) {
      console.error('Decision evaluation error:', err);
      showToast('System Error', 'AI Decision evaluation could not be completed. Please try again.', 'error');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Submit Decision Request';
      }
    }
  });

  // Current Card Buttons
  onEvent('btn-card-view-report', 'click', () => {
    if (currentSessionId) openReportModal(currentSessionId);
  });

  onEvent('btn-card-view-timeline', 'click', () => {
    const timelineSection = getEl('timeline-section');
    if (timelineSection) timelineSection.scrollIntoView({ behavior: 'smooth' });
  });

  // Toggle History View
  onEvent('btn-toggle-history', 'click', async () => {
    const dataSection = getEl('explorer-data-section');
    const btnHistory = getEl('btn-toggle-history');
    if (!dataSection) return;

    if (dataSection.style.display === 'none' || !dataSection.style.display) {
      dataSection.style.display = 'block';
      if (btnHistory) btnHistory.textContent = 'Hide Audit History';
      await loadSessions();
      dataSection.scrollIntoView({ behavior: 'smooth' });
    } else {
      dataSection.style.display = 'none';
      if (btnHistory) btnHistory.textContent = 'View Audit History';
    }
  });

  onEvent('btn-show-current-only', 'click', () => {
    const filterInput = getEl('filter-search');
    if (filterInput && currentSessionId) {
      filterInput.value = currentSessionId;
      renderFilteredSessions();
    }
  });

  // Load Sessions
  async function loadSessions() {
    try {
      const res = await fetch('/api/v1/audit/sessions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      allSessionsCache = await res.json();
      renderFilteredSessions();
    } catch (err) {
      console.error('Failed to load audit sessions:', err);
    }
  }

  // Render Table
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
          <td>${s.agent_name}</td>
          <td>${statusBadge}</td>
          <td>${new Date(s.started_at).toLocaleTimeString()}</td>
          <td>
            <button class="btn btn-secondary btn-sm btn-timeline" data-id="${s.session_id}">View Timeline</button>
            <button class="btn btn-primary btn-sm btn-report" data-id="${s.session_id}">View Report</button>
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
        let stepTitle = 'System Verification Step';
        let bodyHtml = '';

        if (step.event_type === 'USER_INPUT') {
          stepTitle = 'Decision Request & Data Protection';
          bodyHtml = `
            <div style="margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">
              The decision evaluation request was received and passed through automated data protection before audit log storage.
            </div>
            <div class="kv-group">
              <span class="kv-label">Secured Decision Request Payload</span>
              <div class="kv-value" style="background: var(--bg-dark); padding: 0.6rem 0.8rem; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.82rem; margin-top: 0.2rem; color: var(--text-primary);">
                ${escapeHtml(step.user_input)}
              </div>
            </div>
          `;
        } else if (step.event_type === 'CONTEXT_RETRIEVAL') {
          stepTitle = 'Workflow Policy Rules Retrieval';
          bodyHtml = `
            <div>
              <span class="kv-label">Active Workflow Rules Applied</span>
              <div class="kv-value" style="background: var(--bg-dark); padding: 0.6rem 0.8rem; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.82rem; margin-top: 0.2rem; color: var(--text-secondary);">
                ${escapeHtml(step.retrieved_context)}
              </div>
            </div>
          `;
        } else if (step.event_type === 'REASONING') {
          stepTitle = 'Decision Evaluation Assessment';
          bodyHtml = `
            <div>
              <span class="kv-label">Assessment Trace Finding</span>
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
            stepTitle = 'Workflow Eligibility Evaluation';
            const isApp = tResp.approved;
            bodyHtml = `
              <div class="kv-grid" style="margin-bottom: 0.75rem;">
                <div class="kv-group"><span class="kv-label">Requested Value</span><span class="kv-value">₹${Number(tParams.loan_amount || 0).toLocaleString('en-IN')}</span></div>
                <div class="kv-group"><span class="kv-label">Evaluation Result</span><span class="kv-value ${isApp ? 'status-pass' : 'status-fail'}">${isApp ? 'Eligible (Approved)' : 'Not Eligible (Rejected)'}</span></div>
              </div>
              ${!isApp && tResp.rejection_reasons ? `
                <div class="kv-group">
                  <span class="kv-label">Policy Reason</span>
                  <div class="kv-value status-fail" style="background: var(--status-danger-bg); padding: 0.5rem; border-radius: 4px; border: 1px solid var(--status-danger-border); font-size: 0.82rem; margin-top: 0.25rem;">
                    ${(tResp.rejection_reasons || []).join('; ')}
                  </div>
                </div>
              ` : ''}
            `;
          } else {
            stepTitle = 'Verification Step';
            bodyHtml = `<div class="kv-value">Verification Step Completed.</div>`;
          }

        } else if (step.event_type === 'FINAL_OUTPUT') {
          stepTitle = 'Final Decision Determination';
          bodyHtml = `
            <div>
              <span class="kv-label">AI Decision Outcome</span>
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
      setTxt('rep-workflow', session.agent_name);
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

      // Section 2: Request Params (Protected)
      setTxt('rep-app-income', `₹${Number(annualIncome).toLocaleString('en-IN')}`);
      setTxt('rep-app-employment', empType);
      setTxt('rep-app-loan', `₹${Number(loanAmt).toLocaleString('en-IN')}`);
      setTxt('rep-app-score', creditScore);

      // Section 3: Decision Outcome
      const badgeElem = getEl('rep-decision-badge');
      if (badgeElem) {
        badgeElem.innerHTML = isApproved 
          ? `<span class="badge badge-approved">APPROVED / VERIFIED</span>`
          : `<span class="badge badge-rejected">REJECTED</span>`;
      }

      setTxt('rep-confidence', `${(summaryData.confidence_score * 100).toFixed(1)}%`);
      setTxt('rep-decision-reasons', isApproved
        ? "The request satisfied all credit score, annual income, employment stability, and policy requirements."
        : rejectionReasons.join("; ") || "Ineligible under workflow policy criteria.");

      // Section 5: Policy Evaluation Matrix Table
      const maxLimit = annualIncome * 5.0;
      const csPass = creditScore >= 700;
      const incPass = annualIncome >= 600000;
      const empPass = String(empType).toLowerCase() !== 'contract employee';
      const amtPass = loanAmt <= maxLimit;

      const matrixRows = [
        { req: "Credit Score Threshold", val: creditScore, thresh: "700", pass: csPass },
        { req: "Annual Income Threshold", val: `₹${Number(annualIncome).toLocaleString('en-IN')}`, thresh: "₹6,00,000", pass: incPass },
        { req: "Employment Category Eligibility", val: empType, thresh: "Salaried / Self-Employed", pass: empPass },
        { req: "Maximum Limit Ratio", val: `₹${Number(loanAmt).toLocaleString('en-IN')}`, thresh: `₹${Number(maxLimit).toLocaleString('en-IN')}`, pass: amtPass }
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
        ? "Proceed to next operational step or document execution."
        : "You may re-apply after addressing policy requirements or contacting system administration for manual review.");

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

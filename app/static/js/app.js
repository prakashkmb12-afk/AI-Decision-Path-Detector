document.addEventListener('DOMContentLoaded', () => {
  let currentSessionId = null;
  let allSessionsCache = [];

  // Form Elements
  const formAppName = document.getElementById('form-app-name');
  const formAppEmail = document.getElementById('form-app-email');
  const formAppPhone = document.getElementById('form-app-phone');
  const formAppPan = document.getElementById('form-app-pan');
  const formAppAadhaar = document.getElementById('form-app-aadhaar');
  const formAppAccount = document.getElementById('form-app-account');
  const formAppLoan = document.getElementById('form-app-loan');
  const formAppIncome = document.getElementById('form-app-income');
  const formAppEmployment = document.getElementById('form-app-employment');
  const formAppScore = document.getElementById('form-app-score');
  const formAppPurpose = document.getElementById('form-app-purpose');
  
  const btnFillCompliant = document.getElementById('btn-fill-compliant');
  const btnFillNonCompliant = document.getElementById('btn-fill-non-compliant');
  const btnRunSimulation = document.getElementById('btn-run-simulation');
  const simulateErrorCheck = document.getElementById('simulate-error-check');

  // Header & Explorer Elements
  const sysDbStatus = document.getElementById('sys-db-status');
  const sessionTableBody = document.getElementById('session-table-body');
  const btnRefreshSessions = document.getElementById('btn-refresh-sessions');
  const filterSearch = document.getElementById('filter-search');
  const filterWorkflow = document.getElementById('filter-workflow');
  const filterStatus = document.getElementById('filter-status');

  // Timeline & Modal Elements
  const timelineSection = document.getElementById('timeline-section');
  const activeSessionIdSpan = document.getElementById('active-session-id');
  const timelineContainer = document.getElementById('timeline-container');
  const btnGenerateSummary = document.getElementById('btn-generate-summary');
  const summaryModal = document.getElementById('summary-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');

  // Check Health
  async function checkHealth() {
    try {
      const res = await fetch('/health');
      const data = await res.json();
      sysDbStatus.textContent = data.database === 'healthy' ? 'Audit Log Ledger: Active' : 'Audit Log Ledger: Offline';
    } catch (err) {
      sysDbStatus.textContent = 'Audit Log Ledger: Error';
    }
  }

  // Quick Preset Fillers
  btnFillCompliant.addEventListener('click', () => {
    formAppName.value = 'Ramesh Kumar';
    formAppEmail.value = 'ramesh.kumar@gmail.com';
    formAppPhone.value = '+91 9876543210';
    formAppPan.value = 'ABCDE1234F';
    formAppAadhaar.value = '9999-8888-7777';
    formAppAccount.value = '5432109876543';
    formAppLoan.value = '500000';
    formAppIncome.value = '1200000';
    formAppEmployment.value = 'Salaried';
    formAppScore.value = '780';
    formAppPurpose.value = 'Personal Loan';
  });

  btnFillNonCompliant.addEventListener('click', () => {
    formAppName.value = 'Ramesh Kumar';
    formAppEmail.value = 'ramesh.kumar@gmail.com';
    formAppPhone.value = '+91 9876543210';
    formAppPan.value = 'ABCDE1234F';
    formAppAadhaar.value = '9999-8888-7777';
    formAppAccount.value = '5432109876543';
    formAppLoan.value = '3000000';
    formAppIncome.value = '320000';
    formAppEmployment.value = 'Contract Employee';
    formAppScore.value = '598';
    formAppPurpose.value = 'Personal Loan';
  });

  // Execute Loan Audit Simulation
  btnRunSimulation.addEventListener('click', async () => {
    const name = formAppName.value.trim() || 'Applicant';
    const email = formAppEmail.value.trim() || 'applicant@example.com';
    const phone = formAppPhone.value.trim() || '+91 9876543210';
    const pan = formAppPan.value.trim() || 'ABCDE1234F';
    const aadhaar = formAppAadhaar.value.trim() || '9999-8888-7777';
    const account = formAppAccount.value.trim() || '5432109876543';
    const loan = parseFloat(formAppLoan.value) || 500000;
    const income = parseFloat(formAppIncome.value) || 1200000;
    const employment = formAppEmployment.value || 'Salaried';
    const score = parseInt(formAppScore.value, 10) || 750;
    const purpose = formAppPurpose.value || 'Personal Loan';

    // Formulate Prompt Dynamically
    const promptText = 
      `Evaluate loan approval for applicant ${name}. ` +
      `Credit Score: ${score}. Annual Income: ${income}. Employment: ${employment}. Loan Amount: ${loan}. ` +
      `Email: ${email}, Phone: ${phone}. PAN: ${pan}, Aadhaar: ${aadhaar}. Bank Account: ${account}. Purpose: ${purpose}.`;

    btnRunSimulation.disabled = true;
    btnRunSimulation.textContent = 'Running Decision Audit...';

    try {
      const payload = {
        user_id: 'usr_loan_officer_101',
        prompt: promptText,
        agent_type: 'loan_approval',
        credit_score: score,
        annual_income: income,
        employment_type: employment,
        loan_amount: loan,
        simulate_error: simulateErrorCheck.checked
      };

      const res = await fetch('/api/v1/agent/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      currentSessionId = data.session_id;

      await loadSessions();
      await viewTimeline(data.session_id);
    } catch (err) {
      alert('Error executing decision audit: ' + err.message);
    } finally {
      btnRunSimulation.disabled = false;
      btnRunSimulation.textContent = 'Run Decision Audit';
    }
  });

  // Load Sessions
  async function loadSessions() {
    try {
      const res = await fetch('/api/v1/audit/sessions');
      allSessionsCache = await res.json();
      renderFilteredSessions();
    } catch (err) {
      console.error('Failed to load audit sessions:', err);
    }
  }

  // Filter & Render Data Table
  function renderFilteredSessions() {
    const query = filterSearch.value.trim().toLowerCase();
    const wf = filterWorkflow.value;
    const st = filterStatus.value;

    const filtered = allSessionsCache.filter(s => {
      const matchSearch = !query || (s.session_id.toLowerCase().includes(query) || s.user_id.toLowerCase().includes(query));
      const matchWf = !wf || s.agent_name === wf;
      const matchSt = !st || s.status === st;
      return matchSearch && matchWf && matchSt;
    });

    if (filtered.length === 0) {
      sessionTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No matching audit records found.</td></tr>`;
      return;
    }

    sessionTableBody.innerHTML = filtered.map(s => {
      const statusBadge = s.status === 'COMPLETED' 
        ? `<span class="badge badge-approved">Completed</span>`
        : `<span class="badge badge-rejected">${s.status}</span>`;

      return `
        <tr>
          <td style="font-family: var(--font-mono); font-weight: 500; color: #fff;">${s.session_id}</td>
          <td>${s.user_id}</td>
          <td>${s.agent_name === 'LoanApprovalAgent' ? 'Loan Underwriting Workflow' : 'KYC Verification Workflow'}</td>
          <td>${statusBadge}</td>
          <td>${new Date(s.started_at).toLocaleTimeString()}</td>
          <td>
            <button class="btn btn-secondary btn-sm btn-timeline" data-id="${s.session_id}">Timeline</button>
            <button class="btn btn-primary btn-sm btn-report" data-id="${s.session_id}">Audit Report</button>
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

  filterSearch.addEventListener('input', renderFilteredSessions);
  filterWorkflow.addEventListener('change', renderFilteredSessions);
  filterStatus.addEventListener('change', renderFilteredSessions);
  btnRefreshSessions.addEventListener('click', loadSessions);

  // View Business Timeline
  async function viewTimeline(sessionId) {
    currentSessionId = sessionId;
    activeSessionIdSpan.textContent = sessionId;
    timelineSection.style.display = 'block';

    try {
      const res = await fetch(`/api/v1/audit/sessions/${sessionId}/timeline`);
      const data = await res.json();

      timelineContainer.innerHTML = data.timeline.map(step => {
        let stepTitle = 'System Step';
        let bodyHtml = '';

        if (step.event_type === 'USER_INPUT') {
          stepTitle = 'Application Receipt & PII Sanitization';
          bodyHtml = `
            <div style="margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">
              The loan application prompt was received and passed through the automated Zero-Leak PII Sanitization Engine before audit storage.
            </div>
            <div class="kv-group">
              <span class="kv-label">Sanitized Application Input</span>
              <div class="kv-value" style="background: var(--bg-dark); padding: 0.6rem 0.8rem; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.82rem; margin-top: 0.2rem; color: var(--text-primary);">
                ${escapeHtml(step.user_input)}
              </div>
            </div>
          `;
        } else if (step.event_type === 'CONTEXT_RETRIEVAL') {
          stepTitle = 'Underwriting Policy Context Retrieval';
          bodyHtml = `
            <div>
              <span class="kv-label">Active Policy Rules Applied</span>
              <div class="kv-value" style="background: var(--bg-dark); padding: 0.6rem 0.8rem; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.82rem; margin-top: 0.2rem; color: var(--text-secondary);">
                ${escapeHtml(step.retrieved_context)}
              </div>
            </div>
          `;
        } else if (step.event_type === 'REASONING') {
          stepTitle = 'Audit Logic Evaluation';
          bodyHtml = `
            <div>
              <span class="kv-label">Audit Evaluation Finding</span>
              <div class="kv-value" style="color: var(--status-warning-text); background: rgba(217, 119, 6, 0.05); padding: 0.6rem 0.8rem; border-radius: 4px; border-left: 3px solid var(--status-warning-text); margin-top: 0.2rem;">
                ${escapeHtml(step.intermediate_reasoning)}
              </div>
            </div>
          `;
        } else if (step.event_type === 'TOOL_CALL') {
          const tName = step.tool_name || '';
          const tParams = step.tool_parameters || {};
          const tResp = step.tool_response || {};

          if (tName === 'verify_credit_score') {
            stepTitle = 'Credit Bureau Score Verification';
            bodyHtml = `
              <div class="kv-grid">
                <div class="kv-group"><span class="kv-label">Verified Credit Score</span><span class="kv-value" style="font-weight: 700;">${tResp.credit_score || tParams.credit_score || '-'}</span></div>
                <div class="kv-group"><span class="kv-label">Bureau Rating Tier</span><span class="kv-value">${tResp.credit_tier || '-'}</span></div>
                <div class="kv-group"><span class="kv-label">Required Score Threshold</span><span class="kv-value">700 Minimum</span></div>
                <div class="kv-group"><span class="kv-label">Verification Result</span><span class="kv-value ${tResp.is_score_eligible ? 'status-pass' : 'status-fail'}">${tResp.is_score_eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}</span></div>
              </div>
            `;
          } else if (tName === 'check_account_balance') {
            stepTitle = 'Core Banking Account Ledger Verification';
            bodyHtml = `
              <div class="kv-grid">
                <div class="kv-group"><span class="kv-label">Account Status</span><span class="kv-value status-pass">${tResp.account_status || 'ACTIVE'}</span></div>
                <div class="kv-group"><span class="kv-label">Estimated Monthly Average Balance</span><span class="kv-value">₹${Number(tResp.monthly_avg_balance_inr || 0).toLocaleString('en-IN')}</span></div>
              </div>
            `;
          } else if (tName === 'evaluate_loan_underwriting') {
            stepTitle = 'Policy Underwriting Matrix Evaluation';
            const isApp = tResp.approved;
            bodyHtml = `
              <div class="kv-grid" style="margin-bottom: 0.75rem;">
                <div class="kv-group"><span class="kv-label">Requested Loan Amount</span><span class="kv-value">₹${Number(tParams.loan_amount || 0).toLocaleString('en-IN')}</span></div>
                <div class="kv-group"><span class="kv-label">Underwriting Determination</span><span class="kv-value ${isApp ? 'status-pass' : 'status-fail'}">${isApp ? 'POLICY PASSED (APPROVED)' : 'POLICY REJECTED'}</span></div>
              </div>
              ${!isApp && tResp.rejection_reasons ? `
                <div class="kv-group">
                  <span class="kv-label">Failed Policy Condition(s)</span>
                  <div class="kv-value status-fail" style="background: rgba(220,38,38,0.05); padding: 0.5rem; border-radius: 4px; border: 1px solid rgba(220,38,38,0.2); font-size: 0.82rem; margin-top: 0.25rem;">
                    ${(tResp.rejection_reasons || []).join('; ')}
                  </div>
                </div>
              ` : ''}
            `;
          } else {
            stepTitle = 'Verification Step Completed';
            bodyHtml = `<div class="kv-value">${escapeHtml(JSON.stringify(tResp))}</div>`;
          }

        } else if (step.event_type === 'FINAL_OUTPUT') {
          stepTitle = 'Decision Generation & Determination';
          bodyHtml = `
            <div>
              <span class="kv-label">Official Workflow Decision Result Output</span>
              <div class="kv-value" style="background: rgba(37, 99, 235, 0.1); padding: 0.75rem; border-radius: 4px; border-left: 4px solid var(--accent-blue); font-weight: 500; margin-top: 0.2rem;">
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
                <span style="font-weight: 600; color: #fff;">${stepTitle}</span>
              </div>
              <div>
                <span class="badge badge-pii">PII Sanitized</span>
                <span style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted); margin-left: 0.5rem;">${new Date(step.created_at).toLocaleTimeString()}</span>
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
      alert('Error loading timeline: ' + err.message);
    }
  }

  // Open Report Modal
  async function openReportModal(sessionId) {
    currentSessionId = sessionId;
    summaryModal.classList.add('active');

    try {
      const [tRes, sRes] = await Promise.all([
        fetch(`/api/v1/audit/sessions/${sessionId}/timeline`),
        fetch(`/api/v1/audit/sessions/${sessionId}/summary`, { method: 'POST' })
      ]);

      const timelineData = await tRes.json();
      const summaryData = await sRes.json();

      const session = timelineData.session;
      const events = timelineData.timeline;

      // Section 1: Metadata
      document.getElementById('rep-session-id').textContent = session.session_id;
      document.getElementById('rep-user-id').textContent = session.user_id;
      document.getElementById('rep-workflow').textContent = session.agent_name === 'LoanApprovalAgent' ? 'Loan Underwriting Workflow' : 'KYC Verification Workflow';
      document.getElementById('rep-status').textContent = session.status;

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

      // Section 2: Applicant Info
      document.getElementById('rep-app-income').textContent = `₹${Number(annualIncome).toLocaleString('en-IN')}`;
      document.getElementById('rep-app-employment').textContent = empType;
      document.getElementById('rep-app-loan').textContent = `₹${Number(loanAmt).toLocaleString('en-IN')}`;
      document.getElementById('rep-app-score').textContent = creditScore;

      // Section 3: Decision Outcome
      const badgeElem = document.getElementById('rep-decision-badge');
      if (isApproved) {
        badgeElem.innerHTML = `<span class="badge badge-approved">APPROVED</span>`;
      } else {
        badgeElem.innerHTML = `<span class="badge badge-rejected">REJECTED</span>`;
      }

      document.getElementById('rep-confidence').textContent = `${(summaryData.confidence_score * 100).toFixed(1)}%`;
      document.getElementById('rep-decision-reasons').textContent = isApproved
        ? "The applicant satisfied all credit score, annual income, employment stability, and debt-to-income policy requirements."
        : rejectionReasons.join("; ") || "Ineligible under lending policy criteria.";

      // Section 5: Policy Evaluation Matrix Table
      const maxLimit = annualIncome * 5.0;
      const csPass = creditScore >= 700;
      const incPass = annualIncome >= 600000;
      const empPass = String(empType).toLowerCase() !== 'contract employee';
      const amtPass = loanAmt <= maxLimit;

      const matrixRows = [
        { req: "Credit Bureau Score", val: creditScore, thresh: ">= 700 Minimum", pass: csPass },
        { req: "Annual Income Threshold", val: `₹${Number(annualIncome).toLocaleString('en-IN')}`, thresh: ">= ₹6,00,000 Minimum", pass: incPass },
        { req: "Employment Eligibility", val: empType, thresh: "Salaried or Self-Employed", pass: empPass },
        { req: "Loan Amount Limit", val: `₹${Number(loanAmt).toLocaleString('en-IN')}`, thresh: `<= 5x Income (₹${Number(maxLimit).toLocaleString('en-IN')})`, pass: amtPass }
      ];

      document.getElementById('rep-policy-table-body').innerHTML = matrixRows.map(r => `
        <tr>
          <td style="font-weight: 500;">${r.req}</td>
          <td>${r.val}</td>
          <td style="color: var(--text-muted);">${r.thresh}</td>
          <td class="${r.pass ? 'status-pass' : 'status-fail'}">${r.pass ? 'PASSED' : 'FAILED'}</td>
        </tr>
      `).join('');

      // Section 6: Formal Decision Explanation Narrative
      document.getElementById('rep-narrative').textContent = isApproved
        ? "Your application was carefully evaluated based on your identity, financial profile, employment details, and loan eligibility criteria. After verification, we found that all credit score, income, and employment parameters satisfy our lending policy. Your loan request has been approved."
        : "Your application was carefully evaluated based on your identity, financial profile, employment details, and loan eligibility criteria. After verification, we found that your credit score and annual income do not satisfy our minimum lending policy requirements. For this reason, your loan request could not be approved at this time.";

      // Section 7: Recommended Next Action
      document.getElementById('rep-next-steps').textContent = isApproved
        ? "Proceed to document verification and loan agreement execution with your designated loan officer."
        : "You may improve your credit score above 700 or provide additional financial documentation before applying again.";

    } catch (err) {
      alert('Error generating decision summary report: ' + err.message);
    }
  }

  btnGenerateSummary.addEventListener('click', () => {
    if (currentSessionId) openReportModal(currentSessionId);
  });

  btnCloseModal.addEventListener('click', () => summaryModal.classList.remove('active'));

  function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Startup
  checkHealth();
  loadSessions();
});

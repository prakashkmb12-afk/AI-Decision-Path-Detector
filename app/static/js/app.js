document.addEventListener('DOMContentLoaded', () => {
  let currentSessionId = null;
  let allSessionsCache = [];

  // DOM Elements
  const sysDbStatus = document.getElementById('sys-db-status');
  const btnPresetCompliant = document.getElementById('btn-preset-compliant');
  const btnPresetNonCompliant = document.getElementById('btn-preset-non-compliant');
  
  const promptInput = document.getElementById('prompt-input');
  const userIdInput = document.getElementById('user-id-input');
  const agentTypeSelect = document.getElementById('agent-type-select');
  const simulateErrorCheck = document.getElementById('simulate-error-check');
  const btnRunSimulation = document.getElementById('btn-run-simulation');

  const sessionTableBody = document.getElementById('session-table-body');
  const btnRefreshSessions = document.getElementById('btn-refresh-sessions');
  const filterSearch = document.getElementById('filter-search');
  const filterWorkflow = document.getElementById('filter-workflow');
  const filterStatus = document.getElementById('filter-status');

  const timelineSection = document.getElementById('timeline-section');
  const activeSessionIdSpan = document.getElementById('active-session-id');
  const timelineContainer = document.getElementById('timeline-container');
  const btnGenerateSummary = document.getElementById('btn-generate-summary');

  const summaryModal = document.getElementById('summary-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');

  // Check System Health
  async function checkHealth() {
    try {
      const res = await fetch('/health');
      const data = await res.json();
      sysDbStatus.textContent = data.database === 'healthy' ? 'Audit Storage: Connected' : 'Audit Storage: Offline';
    } catch (err) {
      sysDbStatus.textContent = 'Audit Storage: Error';
    }
  }

  // Presets
  btnPresetCompliant.addEventListener('click', () => {
    promptInput.value = 
      "Evaluate loan approval for applicant Ramesh Kumar. " +
      "Credit Score: 780. Annual Income: 1200000. Employment: Salaried. Loan Amount: 500000. " +
      "Email: ramesh.kumar@gmail.com, Phone: +91 9876543210. PAN: ABCDE1234F, Aadhaar: 9999-8888-7777.";
  });

  btnPresetNonCompliant.addEventListener('click', () => {
    promptInput.value = 
      "Evaluate loan approval for applicant Ramesh Kumar. " +
      "Credit Score: 598. Annual Income: 320000. Employment: Contract Employee. Loan Amount: 3000000. " +
      "Email: ramesh.kumar@gmail.com, Phone: +91 9876543210. PAN: ABCDE1234F, Aadhaar: 9999-8888-7777.";
  });

  // Run Simulation
  btnRunSimulation.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      alert('Please enter an applicant prompt containing financial details.');
      return;
    }

    btnRunSimulation.disabled = true;
    btnRunSimulation.textContent = 'Executing Instrumented Workflow...';

    try {
      const payload = {
        user_id: userIdInput.value.trim() || 'usr_anonymous',
        prompt: prompt,
        agent_type: agentTypeSelect.value,
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
      alert('Simulation execution error: ' + err.message);
    } finally {
      btnRunSimulation.disabled = false;
      btnRunSimulation.textContent = 'Execute Instrumented Workflow';
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

  // Filter & Render Table
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

  // Search/Filter Event Listeners
  filterSearch.addEventListener('input', renderFilteredSessions);
  filterWorkflow.addEventListener('change', renderFilteredSessions);
  filterStatus.addEventListener('change', renderFilteredSessions);
  btnRefreshSessions.addEventListener('click', loadSessions);

  // View Timeline
  async function viewTimeline(sessionId) {
    currentSessionId = sessionId;
    activeSessionIdSpan.textContent = sessionId;
    timelineSection.style.display = 'block';

    try {
      const res = await fetch(`/api/v1/audit/sessions/${sessionId}/timeline`);
      const data = await res.json();

      timelineContainer.innerHTML = data.timeline.map(step => {
        let bodyHtml = '';

        if (step.event_type === 'USER_INPUT') {
          bodyHtml = `
            <div class="kv-grid">
              <div class="kv-group"><span class="kv-label">Event Type</span><span class="kv-value">User Application Prompt</span></div>
              <div class="kv-group"><span class="kv-label">Sanitization Status</span><span class="kv-value"><span class="badge badge-pii">PII Redacted</span></span></div>
            </div>
            <div style="margin-top: 0.75rem;">
              <span class="kv-label">Sanitized Prompt Input</span>
              <div class="kv-value" style="background: var(--bg-dark); padding: 0.6rem 0.8rem; border-radius: 4px; border: 1px solid var(--border-color); font-family: var(--font-mono); font-size: 0.82rem; margin-top: 0.2rem;">
                ${escapeHtml(step.user_input)}
              </div>
            </div>
          `;
        } else if (step.event_type === 'CONTEXT_RETRIEVAL') {
          bodyHtml = `
            <div>
              <span class="kv-label">Retrieved Underwriting Policy Rules</span>
              <div class="kv-value" style="background: var(--bg-dark); padding: 0.6rem 0.8rem; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.82rem; margin-top: 0.2rem; color: var(--text-secondary);">
                ${escapeHtml(step.retrieved_context)}
              </div>
            </div>
          `;
        } else if (step.event_type === 'REASONING') {
          bodyHtml = `
            <div>
              <span class="kv-label">Audit Thought Trace / Reasoning Chain</span>
              <div class="kv-value" style="color: var(--status-warning-text); background: rgba(217, 119, 6, 0.05); padding: 0.6rem 0.8rem; border-radius: 4px; border-left: 3px solid var(--status-warning-text); margin-top: 0.2rem;">
                ${escapeHtml(step.intermediate_reasoning)}
              </div>
            </div>
          `;
        } else if (step.event_type === 'TOOL_CALL') {
          bodyHtml = `
            <div class="kv-grid">
              <div class="kv-group"><span class="kv-label">Tool Function</span><span class="kv-value kv-value-mono" style="color: var(--accent-cyan);">${step.tool_name}</span></div>
              <div class="kv-group"><span class="kv-label">Execution Duration</span><span class="kv-value">${step.execution_time_ms} ms</span></div>
            </div>
            <div style="margin-top: 0.75rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
              <div>
                <span class="kv-label">Input Parameters</span>
                <pre style="background: var(--bg-dark); padding: 0.5rem; border-radius: 4px; font-size: 0.78rem; border: 1px solid var(--border-color); overflow-x: auto;">${escapeHtml(JSON.stringify(step.tool_parameters, null, 2))}</pre>
              </div>
              <div>
                <span class="kv-label">Returned Result</span>
                <pre style="background: var(--bg-dark); padding: 0.5rem; border-radius: 4px; font-size: 0.78rem; border: 1px solid var(--border-color); overflow-x: auto;">${escapeHtml(JSON.stringify(step.tool_response, null, 2))}</pre>
              </div>
            </div>
          `;
        } else if (step.event_type === 'FINAL_OUTPUT') {
          bodyHtml = `
            <div>
              <span class="kv-label">Workflow Decision Result Output</span>
              <div class="kv-value" style="background: rgba(37, 99, 235, 0.1); padding: 0.75rem; border-radius: 4px; border-left: 4px solid var(--accent-blue); font-weight: 500; margin-top: 0.2rem;">
                ${escapeHtml(step.final_output)}
              </div>
            </div>
          `;
        } else {
          bodyHtml = `<div>${escapeHtml(step.error_message || 'Step executed.')}</div>`;
        }

        return `
          <div class="timeline-item">
            <div class="timeline-item-header">
              <div>
                <span class="timeline-step-tag">STEP ${step.step_number}</span>
                <span style="font-weight: 600; color: #fff;">${step.event_type}</span>
              </div>
              <div>
                <span class="badge badge-pii">PII Redacted</span>
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

      // Populate Audit Metadata
      document.getElementById('rep-session-id').textContent = session.session_id;
      document.getElementById('rep-user-id').textContent = session.user_id;
      document.getElementById('rep-workflow').textContent = session.agent_name === 'LoanApprovalAgent' ? 'Loan Underwriting Workflow' : 'KYC Verification Workflow';
      document.getElementById('rep-status').textContent = session.status;

      // Parse Underwriting Tool Call to extract values & policy results
      const underwriteEvent = events.find(e => e.tool_name === 'evaluate_loan_underwriting');
      const toolParams = underwriteEvent ? (underwriteEvent.tool_parameters || {}) : {};
      const toolResp = underwriteEvent ? (underwriteEvent.tool_response || {}) : {};

      const creditScore = toolParams.credit_score || 750;
      const annualIncome = toolParams.annual_income || 800000;
      const empType = toolParams.employment_type || 'Salaried';
      const loanAmt = toolParams.loan_amount || 300000;

      const isApproved = toolResp.approved !== undefined ? toolResp.approved : true;
      const rejectionReasons = toolResp.rejection_reasons || [];

      // Populate Applicant Information (PII Redacted)
      document.getElementById('rep-app-income').textContent = `₹${Number(annualIncome).toLocaleString('en-IN')}`;
      document.getElementById('rep-app-employment').textContent = empType;
      document.getElementById('rep-app-loan').textContent = `₹${Number(loanAmt).toLocaleString('en-IN')}`;
      document.getElementById('rep-app-score').textContent = creditScore;

      // Populate Decision Outcome
      const badgeElem = document.getElementById('rep-decision-badge');
      if (isApproved) {
        badgeElem.innerHTML = `<span class="badge badge-approved">APPROVED</span>`;
      } else {
        badgeElem.innerHTML = `<span class="badge badge-rejected">REJECTED</span>`;
      }

      document.getElementById('rep-confidence').textContent = `${(summaryData.confidence_score * 100).toFixed(1)}%`;
      document.getElementById('rep-decision-reasons').textContent = isApproved
        ? "All credit score, income, employment stability, and debt ratio criteria met Underwriting Policy v4.2 standards."
        : rejectionReasons.join("; ") || "Ineligible under Policy Rules.";

      // Populate Policy Matrix Table
      const maxLimit = annualIncome * 5.0;
      const csPass = creditScore >= 700;
      const incPass = annualIncome >= 600000;
      const empPass = String(empType).toLowerCase() !== 'contract employee';
      const amtPass = loanAmt <= maxLimit;

      const matrixRows = [
        { req: "Credit Score", val: creditScore, thresh: ">= 700", pass: csPass },
        { req: "Annual Income", val: `₹${Number(annualIncome).toLocaleString('en-IN')}`, thresh: ">= ₹6,00,000", pass: incPass },
        { req: "Employment Type", val: empType, thresh: "Salaried / Self-Employed", pass: empPass },
        { req: "Loan Limit Ratio", val: `₹${Number(loanAmt).toLocaleString('en-IN')}`, thresh: `<= 5x Income (₹${Number(maxLimit).toLocaleString('en-IN')})`, pass: amtPass }
      ];

      document.getElementById('rep-policy-table-body').innerHTML = matrixRows.map(r => `
        <tr>
          <td style="font-weight: 500;">${r.req}</td>
          <td>${r.val}</td>
          <td style="color: var(--text-muted);">${r.thresh}</td>
          <td class="${r.pass ? 'status-pass' : 'status-fail'}">${r.pass ? 'PASSED' : 'FAILED'}</td>
        </tr>
      `).join('');

      // Populate Narrative
      document.getElementById('rep-narrative').textContent = summaryData.plain_english_summary;

    } catch (err) {
      alert('Error generating summary report: ' + err.message);
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

  // Initial Startup
  checkHealth();
  loadSessions();
  btnPresetCompliant.click();
});

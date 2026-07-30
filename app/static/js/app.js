document.addEventListener('DOMContentLoaded', () => {
  let currentSessionId = null;

  // DOM Elements
  const dbStatusDot = document.getElementById('db-status-dot');
  const dbStatusText = document.getElementById('db-status-text');
  const groqStatusDot = document.getElementById('groq-status-dot');
  const groqStatusText = document.getElementById('groq-status-text');

  const btnPrefillLoan = document.getElementById('btn-prefill-loan');
  const promptInput = document.getElementById('prompt-input');
  const userIdInput = document.getElementById('user-id-input');
  const agentTypeSelect = document.getElementById('agent-type-select');
  const simulateErrorCheck = document.getElementById('simulate-error-check');
  const btnRunSimulation = document.getElementById('btn-run-simulation');

  const sessionTableBody = document.getElementById('session-table-body');
  const btnRefreshSessions = document.getElementById('btn-refresh-sessions');

  const timelineSection = document.getElementById('timeline-section');
  const activeSessionIdSpan = document.getElementById('active-session-id');
  const timelineContainer = document.getElementById('timeline-container');
  const btnGenerateSummary = document.getElementById('btn-generate-summary');

  const summaryModal = document.getElementById('summary-modal');
  const modalLlmModel = document.getElementById('modal-llm-model');
  const modalSummaryText = document.getElementById('modal-summary-text');
  const modalKeyDecisions = document.getElementById('modal-key-decisions');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCloseModalBottom = document.getElementById('btn-close-modal-bottom');

  // Check Health Status
  async function checkHealth() {
    try {
      const res = await fetch('/health');
      const data = await res.json();
      if (data.database === 'healthy') {
        dbStatusDot.style.background = 'var(--accent-emerald)';
        dbStatusDot.style.boxShadow = '0 0 10px var(--accent-emerald)';
        dbStatusText.textContent = 'Database: Healthy';
      } else {
        dbStatusDot.style.background = 'var(--accent-rose)';
        dbStatusText.textContent = 'Database: Degraded';
      }

      groqStatusText.textContent = data.groq_llm === 'configured' ? 'Groq LLM Active' : 'Groq (Rule Fallback Mode)';
    } catch (err) {
      console.error('Health check failed:', err);
    }
  }

  const btnPrefillApproved = document.getElementById('btn-prefill-approved');
  const btnPrefillRejected = document.getElementById('btn-prefill-rejected');

  // Prefill Sample Approved Request (Credit Score: 780, Income: ₹12,00,000, Salaried, Amount: ₹5,00,000)
  btnPrefillApproved.addEventListener('click', () => {
    promptInput.value = 
      "Evaluate loan approval for applicant Ramesh Kumar. " +
      "Credit Score: 780. Annual Income: ₹12,00,000. Employment: Salaried. Loan Amount: ₹5,00,000. " +
      "Email: ramesh.kumar@gmail.com, Phone: +91 9876543210. PAN: ABCDE1234F, Aadhaar: 9999-8888-7777.";
  });

  // Prefill Sample Rejected Request (Credit Score: 598, Income: ₹3,20,000, Contract Employee, Amount: ₹30,00,000)
  btnPrefillRejected.addEventListener('click', () => {
    promptInput.value = 
      "Evaluate loan approval for applicant Ramesh Kumar. " +
      "Credit Score: 598. Annual Income: ₹3,20,000. Employment: Contract Employee. Loan Amount: ₹30,00,000. " +
      "Email: ramesh.kumar@gmail.com, Phone: +91 9876543210. PAN: ABCDE1234F, Aadhaar: 9999-8888-7777.";
  });

  // Run Simulation
  btnRunSimulation.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      alert('Please enter a prompt containing user request / PII data.');
      return;
    }

    btnRunSimulation.disabled = true;
    btnRunSimulation.textContent = 'Executing Instrumented Agent...';

    try {
      const payload = {
        user_id: userIdInput.value.trim() || 'anonymous',
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
      alert('Error running simulation: ' + err.message);
    } finally {
      btnRunSimulation.disabled = false;
      btnRunSimulation.textContent = 'Run Instrumented Agent Execution';
    }
  });

  // Load Sessions
  async function loadSessions() {
    try {
      const res = await fetch('/api/v1/audit/sessions');
      const sessions = await res.json();

      if (!sessions || sessions.length === 0) {
        sessionTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">No sessions found. Run a simulation!</td></tr>`;
        return;
      }

      sessionTableBody.innerHTML = sessions.map(s => `
        <tr>
          <td style="font-family: var(--font-mono); color: #fff;">${s.session_id}</td>
          <td>${s.user_id}</td>
          <td>${s.agent_name}</td>
          <td><span class="badge badge-${s.status.toLowerCase()}">${s.status}</span></td>
          <td>${new Date(s.started_at).toLocaleTimeString()}</td>
          <td>
            <button class="btn btn-secondary btn-sm btn-view-timeline" data-id="${s.session_id}">Timeline</button>
            <button class="btn btn-purple btn-sm btn-view-summary" data-id="${s.session_id}">Summary</button>
          </td>
        </tr>
      `).join('');

      // Add click listeners
      document.querySelectorAll('.btn-view-timeline').forEach(b => {
        b.addEventListener('click', (e) => viewTimeline(e.target.dataset.id));
      });

      document.querySelectorAll('.btn-view-summary').forEach(b => {
        b.addEventListener('click', (e) => generateSummary(e.target.dataset.id));
      });

    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }

  // View Timeline
  async function viewTimeline(sessionId) {
    currentSessionId = sessionId;
    activeSessionIdSpan.textContent = sessionId;
    timelineSection.style.display = 'block';

    try {
      const res = await fetch(`/api/v1/audit/sessions/${sessionId}/timeline`);
      const data = await res.json();

      timelineContainer.innerHTML = data.timeline.map((step, idx) => {
        let contentHtml = '';
        if (step.user_input) contentHtml += `<p><strong>User Input:</strong> ${escapeHtml(step.user_input)}</p>`;
        if (step.retrieved_context) contentHtml += `<p><strong>Context Retrieved:</strong> ${escapeHtml(step.retrieved_context)}</p>`;
        if (step.intermediate_reasoning) contentHtml += `<p style="color: var(--accent-amber);"><strong>Reasoning:</strong> ${escapeHtml(step.intermediate_reasoning)}</p>`;
        if (step.tool_name) {
          contentHtml += `
            <p><strong>Tool Name:</strong> <code style="color: var(--accent-purple);">${step.tool_name}</code> (${step.execution_time_ms} ms)</p>
            <pre style="background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 6px; font-size: 0.8rem; margin-top: 0.4rem;">${escapeHtml(JSON.stringify(step.tool_parameters, null, 2))}</pre>
          `;
        }
        if (step.final_output) contentHtml += `<p style="color: var(--accent-emerald); font-weight: 500;"><strong>Final Output:</strong> ${escapeHtml(step.final_output)}</p>`;
        if (step.error_message) contentHtml += `<p style="color: var(--accent-rose);"><strong>Error:</strong> ${escapeHtml(step.error_message)}</p>`;

        return `
          <div class="timeline-step">
            <div class="step-node">${step.step_number}</div>
            <div class="step-card">
              <div class="step-header">
                <span class="step-type">${step.event_type}</span>
                <div>
                  <span class="redacted-tag">PII Redacted</span>
                  <span class="step-time">${new Date(step.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
              <div class="step-body" style="font-size: 0.88rem; color: var(--text-muted);">
                ${contentHtml}
              </div>
            </div>
          </div>
        `;
      }).join('');

      timelineSection.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      alert('Error fetching timeline: ' + err.message);
    }
  }

  // Generate Groq Summary
  async function generateSummary(sessionId) {
    currentSessionId = sessionId;
    summaryModal.classList.add('active');
    modalSummaryText.textContent = 'Analyzing decision path trajectory with Groq LLM (llama-3.3-70b)...';
    modalKeyDecisions.innerHTML = '';

    try {
      const res = await fetch(`/api/v1/audit/sessions/${sessionId}/summary`, { method: 'POST' });
      const summary = await res.json();

      modalLlmModel.textContent = `Powered by ${summary.generated_by_llm} | Confidence: ${summary.confidence_score * 100}%`;
      modalSummaryText.textContent = summary.plain_english_summary;
      modalKeyDecisions.innerHTML = summary.key_decisions.map(d => `<li>${escapeHtml(d)}</li>`).join('');
    } catch (err) {
      modalSummaryText.textContent = 'Failed to generate summary: ' + err.message;
    }
  }

  btnGenerateSummary.addEventListener('click', () => {
    if (currentSessionId) generateSummary(currentSessionId);
  });

  btnRefreshSessions.addEventListener('click', loadSessions);
  btnCloseModal.addEventListener('click', () => summaryModal.classList.remove('active'));
  btnCloseModalBottom.addEventListener('click', () => summaryModal.classList.remove('active'));

  function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Initial calls
  checkHealth();
  loadSessions();
  btnPrefillApproved.click();
});

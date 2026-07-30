# PS-7.1: The Decision Path Auditor

> **Production-Ready AI Governance Engine & Decision Path Reconstructor**
> 
> *Interceptors, Zero-Leak PII Redaction, Relational Trajectory Audit Storage, and Groq LLM Decision Summarization.*

---

## 🌟 Executive Overview

**PS-7.1 - The Decision Path Auditor** is an enterprise-grade AI governance platform built for strict regulatory compliance, AI safety, and auditability. It intercepts 100% of AI agent execution steps—capturing user prompts, RAG context retrievals, tool invocations, parameters, return values, intermediate thought chains, final outputs, and execution timing.

Before any audit record is persisted into PostgreSQL, a **Zero-Leak PII Redaction Layer** sanitizes sensitive data (Email, Phone, Indian PAN Card, Aadhaar Card, Names, and Financial Account Numbers), guaranteeing zero PII leakage. The system reconstructs complete chronological timelines and utilizes **Groq LLM (`llama-3.3-70b-versatile`)** to translate complex execution traces into simple, customer-friendly plain English audit reports.

---

## 🏗️ Architecture & Core Components

```
                                    +-----------------------------------------+
                                    |               Frontend UI               |
                                    |     (Dashboard, Timeline Viewer,        |
                                    |       Summary View, Agent Simulator)    |
                                    +--------------------+--------------------+
                                                         |
                                                         | REST HTTP / JSON
                                                         v
                                    +-----------------------------------------+
                                    |             FastAPI Backend             |
                                    +--------------------+--------------------+
                                                         |
          +----------------------------------------------+----------------------------------------------+
          |                                              |                                              |
          v                                              v                                              v
+------------------+                           +-------------------+                          +-------------------+
|  Agent Wrapper   |                           | Decision Path     |                          | Decision Summary  |
|  & Simulator     |                           | Reconstructor     |                          | Generator (Groq)  |
+--------+---------+                           +---------+---------+                          +---------+---------+
         |                                               |                                              |
         v                                               v                                              v
+------------------+                           +-------------------+                          +-------------------+
|  PII Redaction   |                           | Audit Data Access |                          | Groq LLM Client   |
| Engine (Presidio)|                           | (SQLAlchemy ORM)  |                          | (llama-3.3-70b)   |
+--------+---------+                           +---------+---------+                          +-------------------+
         |                                               |
         +-----------------------+-----------------------+
                                 |
                                 v
                       +-------------------+
                       | PostgreSQL Audit  |
                       | Database (Tables: |
                       | audit_sessions &  |
                       | audit_events)     |
                       +-------------------+
```

---

## 🚀 Key Features

1. **Instrumented Agent Interceptor (`app/core/agent_wrapper.py`)**
   - Intercepts all AI interaction steps using async decorators and session managers.
   - Captures User Input, Context, Tool Calls, Parameters, Responses, Reasoning, Timing, and Errors.
2. **Zero-Leak PII Redaction Engine (`app/core/pii_redactor.py`)**
   - Microsoft Presidio + Deterministic Regex rules.
   - Redacts: Email (`[EMAIL_REDACTED]`), Phone (`[PHONE_REDACTED]`), PAN (`[PAN_REDACTED]`), Aadhaar (`[AADHAAR_REDACTED]`), Credit/Account (`[ACCOUNT_REDACTED]`), Names (`[NAME_REDACTED]`).
3. **Relational Audit Database (`app/models/audit.py`)**
   - PostgreSQL schema with compound B-tree indices on `session_id`, `user_id`, and `started_at` for high-performance timeline reconstruction.
4. **Groq LLM Plain-English Summarizer (`app/core/summary_generator.py`)**
   - Invocations of Groq `llama-3.3-70b-versatile` converting technical traces into clear, human-understandable audit explanations.
5. **Interactive Glassmorphism Dashboard UI (`app/static/`)**
   - Embedded Agent Simulator, visual timeline tree, PII badges, search filters, and live health status probes.

---

## 🛠️ Local Quick Start

### 1. Clone & Setup Environment
```bash
git clone https://github.com/prakashkmb12-afk/AI-Decision-Path-Detector.git
cd AI-Decision-Path-Detector

# Create virtual environment
python -m venv venv
# Activate on Windows:
venv\Scripts\activate
# Activate on Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and add your Groq API Key:
```ini
GROQ_API_KEY="gsk_your_actual_groq_api_key"
```

### 3. Run FastAPI Application
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Open your browser at:
- **Dashboard UI**: [http://localhost:8000](http://localhost:8000)
- **Swagger API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Probe**: [http://localhost:8000/health](http://localhost:8000/health)

---

## 🐳 Docker Stack Deployment

Launch the complete container stack (FastAPI Backend + PostgreSQL Database):

```bash
docker-compose up --build -d
```

---

## ☁️ AWS Production Deployment Architecture

To deploy this MVP in AWS production:

1. **Database**: AWS RDS PostgreSQL 15 (Multi-AZ for high availability).
2. **Container Hosting**: AWS ECS Fargate or AWS App Runner.
3. **Load Balancer**: Application Load Balancer (ALB) pointing to ECS tasks on port 8000 with `/health` target group.
4. **Secrets Management**: AWS Secrets Manager storing `GROQ_API_KEY` and PostgreSQL credentials.

### AWS CLI / Terraform Commands Example
```bash
# Build Docker image & push to AWS ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com
docker build -t decision-path-auditor .
docker tag decision-path-auditor:latest <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com/decision-path-auditor:latest
docker push <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com/decision-path-auditor:latest
```

---

## 🧪 Automated Testing

Run the full pytest suite:

```bash
pytest -v
```

---

## 📝 License & Hackathon Compliance
Built strictly in accordance with **PS-7.1 - The Decision Path Auditor** specifications. Zero mock APIs, zero fake workflows—100% production ready code.

export const MOCK_LATEX = `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{titlesec}

\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]
\\setlength{\\parindent}{0pt}

\\begin{document}

% ── Header ──────────────────────────────────────────
\\begin{center}
  {\\LARGE\\bfseries Alex Chen} \\\\[4pt]
  \\href{mailto:alex@example.com}{alex@example.com} \\quad|\\quad
  \\href{https://github.com/alexchen}{github.com/alexchen} \\quad|\\quad
  San Francisco, CA
\\end{center}

% ── Summary ─────────────────────────────────────────
\\section{Summary}
Full-stack engineer with 5+ years of experience building
high-throughput distributed systems. Specialized in Go,
TypeScript, and cloud-native architectures. Passionate about
developer tooling and infrastructure automation.

% ── Experience ──────────────────────────────────────
\\section{Experience}

\\textbf{Senior Software Engineer} \\hfill \\textit{2022 -- Present} \\\\
\\textit{Acme Corp, San Francisco}
\\begin{itemize}[nosep, leftmargin=1.5em]
  \\item Designed event-driven microservices handling 50k req/s
  \\item Reduced CI/CD pipeline time by 60\\% via parallelization
  \\item Led migration from monolith to service mesh (Istio)
\\end{itemize}

\\textbf{Software Engineer} \\hfill \\textit{2020 -- 2022} \\\\
\\textit{StartupXYZ, Remote}
\\begin{itemize}[nosep, leftmargin=1.5em]
  \\item Built real-time analytics dashboard (React, D3, WebSocket)
  \\item Implemented OAuth 2.0 + RBAC for multi-tenant platform
  \\item Optimized PostgreSQL queries, reducing p99 latency by 40\\%
\\end{itemize}

% ── Skills ──────────────────────────────────────────
\\section{Skills}
\\textbf{Languages:} Go, TypeScript, Python, Rust \\\\
\\textbf{Infra:} Kubernetes, Terraform, AWS, GCP \\\\
\\textbf{Data:} PostgreSQL, Redis, Kafka, Elasticsearch

% ── Education ───────────────────────────────────────
\\section{Education}
\\textbf{B.S. Computer Science} \\hfill \\textit{2016 -- 2020} \\\\
University of California, Berkeley

\\end{document}`;

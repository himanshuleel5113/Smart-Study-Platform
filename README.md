# Smart Study Platform

Current completion status, fixes, and remaining work: [Project review — 11 November 2026](PROJECT_REVIEW.md).

A cloud-native study management web application built with a microservices architecture. The project combines a web interface, Spring Boot services, PostgreSQL databases, containerized deployment, Kubernetes orchestration, CI/CD automation, and application monitoring.


**Project report title:** *Smart Study Platform*

## Overview

The Smart Study Platform helps users organize study activities and monitor their progress. Users can manage subjects, record study sessions, review study history, take quizzes, and view quiz scores and attempt history. The Quiz Service also integrates with Azure OpenAI for AI-assisted quiz functionality.

The project demonstrates a practical DevOps workflow: containerizing application components, deploying them in a local Kubernetes cluster and on AWS EC2, automating delivery through Jenkins, and monitoring services with Nagios Core.

## Features

- User registration, login, and JWT-based authentication.
- Subject management and study-session tracking.
- Study history and statistics.
- Quiz management, answer submission, score calculation, and attempt history.
- Google Gemini AI / Azure OpenAI integration for AI-assisted quiz functionality.
- Separate PostgreSQL databases for user, study, and quiz data.
- Docker-based packaging and Docker Compose deployment.
- Kubernetes Deployments, Services, configuration resources, persistent-volume claims, and Horizontal Pod Autoscalers.
- Jenkins pipeline for backend testing, Docker image build/publish, and deployment.
- Nagios Core service and host health monitoring.
- k6-based load testing for authenticated API Gateway requests.
- Terraform configuration for AWS infrastructure resources.

## Architecture

```text
                      ┌──────────────────────┐
                      │   Web Browser/User   │
                      └──────────┬───────────┘
                                 │ HTTP
                      ┌──────────▼───────────┐
                      │ Nginx Frontend       │
                      └──────────┬───────────┘
                                 │ /api/
                      ┌──────────▼───────────┐
                      │ Spring Boot API      │
                      │ Gateway :8080        │
                      └─────┬──────┬─────┬───┘
                            │      │     │
                 ┌──────────▼┐ ┌───▼────┐ ┌▼──────────┐
                 │ User      │ │ Study  │ │ Quiz      │
                 │ Service   │ │ Service│ │ Service   │
                 │ :8081     │ │ :8082  │ │ :8083     │
                 └─────┬─────┘ └───┬────┘ └────┬─────┘
                       │           │           │
                 ┌─────▼─────┐ ┌───▼─────┐ ┌───▼─────┐
                 │ user_db   │ │ study_db│ │ quiz_db │
                 │ PostgreSQL│ │PostgreSQL│ │PostgreSQL│
                 └───────────┘ └─────────┘ └─────────┘

       Jenkins ──> Test/Build/Deploy
       Nagios Core ──> Service & Infrastructure Health Monitoring
       Kubernetes HPA ──> API Gateway replica scaling
```

The diagram summarizes the core runtime path. The exact deployment layout and accessible ports depend on whether the application is running through Docker Compose, local Kubernetes, or AWS EC2.

## Technology Stack

| Area | Technologies |
|---|---|
| Frontend | HTML, CSS, JavaScript, Nginx |
| Backend | Java 21, Spring Boot |
| API entry point | Spring Boot API Gateway |
| Database | PostgreSQL 17 |
| AI integration | Google Gemini API / Azure OpenAI |
| Containers | Docker, Docker Compose |
| Orchestration | Kubernetes (Docker Desktop) |
| Autoscaling | Kubernetes Horizontal Pod Autoscaler (HPA) |
| CI/CD | Jenkins, GitHub |
| Cloud | AWS EC2, EBS, S3, IAM, Systems Manager (SSM) |
| Infrastructure as Code | Terraform |
| Monitoring | Nagios Core |
| Load testing | k6 |

## Main Services and Ports

| Component | Container/service port | Purpose |
|---|---:|---|
| Frontend | 80 | Serves the web interface through Nginx |
| API Gateway | 8080 | Entry point for API requests and routing |
| User Service | 8081 | User registration, login, and profile-related operations |
| Study Service | 8082 | Subjects, study sessions, and study statistics |
| Quiz Service | 8083 | Quizzes, submissions, scoring, and attempt history |
| PostgreSQL | 5432 inside each database container | Stores service-specific data |

In the local Kubernetes configuration, the frontend is exposed through NodePort `30000` and the API Gateway through NodePort `30080`. Backend services and databases use internal ClusterIP Services. These Kubernetes NodePorts are not necessarily the same as local Docker Compose host ports.

## Repository Layout

The repository includes application services and deployment/operations resources. Key areas include:

```text
smart-study-platform/
├── frontend/                 # Web interface and Nginx configuration
├── services/
│   ├── api-gateway/           # Spring Boot API Gateway
│   ├── user-service/          # User and authentication operations
│   ├── study-service/         # Subjects and study sessions
│   └── quiz-service/          # Quiz operations and AI integration
├── kubernetes/                # Kubernetes manifests and load-test Job
├── k6/                        # k6 load-testing script(s)
├── monitoring/                # Prometheus/monitoring configuration
├── terraform/                 # AWS infrastructure as code
├── Jenkinsfile                # CI/CD pipeline definition
└── docker-compose.aws.yml     # AWS Compose file, if kept at repository root
```

*The listed paths are a guide to the principal project areas; consult the repository for the exact current file layout.*

## Prerequisites

Install the tools required for the workflow you intend to run:

- Git
- Docker Desktop with Docker Compose
- Java 21 and Maven (for running backend tests locally)
- `kubectl` and a working Kubernetes cluster (for Kubernetes deployment)
- AWS CLI configured with appropriate access (for AWS/SSM operations)
- Terraform (for infrastructure changes)

Azure OpenAI functionality requires valid endpoint/deployment configuration and an API key. Do not commit real API keys, passwords, JWT secrets, or AWS credentials to Git.

## HOW TO RUN — Docker Compose (local)

On Windows, use the project scripts from PowerShell (the launcher starts Docker Desktop if needed):

```powershell
.\start-platform.ps1 -Build  # first run or after code changes: tests, packages, builds, starts
.\stop-platform.ps1          # stops this project's containers; retains all database volumes
.\start-platform.ps1         # subsequent starts using the existing local images
```

`run.bat` (also accepts `-Build`) and `stop.bat` run these same scripts. They resolve
paths relative to the scripts, so they also work when launched from another directory.
The scripts use `docker-compose.yml`, the root `.env`, and the Compose project name
`smart-study-platform-main` to reuse this project's existing containers and volumes.
They do not overwrite credentials or stop host processes. Normal Compose environment
precedence applies: existing shell variables override `.env` values.

Startup waits for Docker, the databases, all four backend health endpoints, the frontend,
and Nagios Core before reporting success.
`-WaitTimeoutSeconds 300` controls each of the engine, container, and HTTP readiness
phases (each defaults to five minutes). Every Compose service has a recurring health
check, and the gateway/frontend wait for healthy dependencies during Compose startup.
Use `docker compose ps` to inspect current health. All services use `restart: unless-stopped`
to recover after process exits and Docker engine restarts; explicitly stopped containers
need `run.bat` to start again. Docker reports failed health checks as `unhealthy`, but
does not restart a still-running process solely because a health check fails.
Local monitoring uses `monitoring/prometheus.local.yml`; the AWS configuration also
scrapes cAdvisor and Node Exporter, which are not part of the local Compose stack.
Failures return a nonzero exit code; services already started are retained for diagnosis.
The UI is at **http://localhost**; port 8090 is Nagios Core. AI generation remains
unavailable with the current placeholder credentials; it is not needed for startup
or the manual quiz flows. No AI request is made by these scripts.

The equivalent manual workflow follows.

Prerequisites: Git, Docker Desktop (with Docker Compose), JDK 21 + Maven (only to build the jars), and a `.env` file in the repository root (copy from the variables below; never commit the real file).

1. Build the service jars (the Dockerfiles copy them from `target/`):

   ```powershell
   mvn clean package -DskipTests
   ```

2. Copy the root `.env.example` to `.env` if you do not already have one, and configure these variables:

   ```text
   DOCKERHUB_USER, IMAGE_TAG
   USER_DB_PASSWORD, STUDY_DB_PASSWORD, QUIZ_DB_PASSWORD
   JWT_SECRET (Base64-encoded, >= 256 bits)
   AZURE_OPENAI_KEY, OPENAI_BASE_URL, OPENAI_MODEL
   NAGIOSADMIN_USER, NAGIOSADMIN_PASS (Nagios admin credentials)
   ```

   Quiz Service refuses to start without `AZURE_OPENAI_KEY`/`OPENAI_BASE_URL` — a placeholder value such as `dummy-key-for-local-dev` is enough to boot; only real AI generation needs a real key.

   `OPENAI_MODEL` is the exact Azure deployment name (defaults to `gpt-4.1-mini`).
   `OPENAI_BASE_URL` must use your resource's v1 endpoint, for example
   `https://your-resource-name.openai.azure.com/openai/v1/`.
   The deployment must support the Responses API. After editing `.env`, recreate
   the quiz service with `docker compose up -d --force-recreate quiz-service`.

3. Build and start the stack:

   ```powershell
   docker compose up --build -d
   docker compose ps          # wait for postgres containers to report (healthy)
   docker compose logs -f     # watch for errors
   ```

4. URLs and checks:

   | URL | What |
   |---|---|
   | http://localhost | Frontend (Nginx, proxies `/api/` to the gateway) |
   | http://localhost:8080/actuator/health | API Gateway Health |
   | http://localhost:8090/nagios/ | Nagios Core (nagiosadmin / `$NAGIOSADMIN_PASS`) |

5. End-to-end test (register → login → subject → session → quiz):

   ```bash
   bash ssp-e2e-flow.sh            # helper script, or follow the curl steps below
   ```

   ```bash
   curl -X POST http://localhost/api/users/register -H "Content-Type: application/json" \
        -d '{"name":"Test","email":"t1@example.com","password":"Password123!"}'
   # login returns {"token":"<jwt>",...}; use it as: -H "Authorization: Bearer <jwt>"
   curl -X POST http://localhost/api/subjects -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" -d '{"name":"DevOps","description":"k8s"}'
   curl -X POST http://localhost/api/study-sessions/start -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" -d '{"subjectId":1}'
   curl -X POST http://localhost/api/study-sessions/stop  -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" -d '{}'
   ```

6. Stop the stack (containers are kept for a fast restart):

   ```powershell
   docker compose stop      # or: docker compose down (also removes networks; volumes kept)
   ```

Troubleshooting Compose:

- `docker compose ps` shows a service restarting → `docker compose logs <service>`; the most common cause is a missing variable in `.env`.
- Port 80/3000/8080 already in use → stop the conflicting process or change the host port mapping.
- Do **not** run the Compose stack and the Kubernetes stack at the same time on a machine with ~8 GB RAM; the WSL2 VM (~50% of host RAM by default) cannot fit both. This caused repeated Docker Engine freezes during testing.

## HOW TO RUN — Kubernetes (Docker Desktop)

Prerequisites: Docker Desktop with **Settings → Kubernetes → Enable Kubernetes** (restart Docker Desktop afterwards; first start takes several minutes), `kubectl`, and the local images built.

1. Confirm the cluster:

   ```powershell
   kubectl config current-context   # expected: docker-desktop
   kubectl get nodes                # expected: docker-desktop Ready
   ```

2. Build the images and tag them exactly as the manifests expect:

   ```powershell
   mvn clean package -DskipTests
   docker build -t smart-study-user-service:latest   services/user-service
   docker build -t smart-study-study-service:latest  services/study-service
   docker build -t smart-study-quiz-service:k8s-v3   services/quiz-service
   docker build -t smart-study-api-gateway:k8s-v2    services/api-gateway
   docker build -t smart-study-frontend:latest       frontend
   ```

3. Install the Metrics Server (once) and patch it for Docker Desktop:

   ```powershell
   kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
   kubectl patch deployment metrics-server -n kube-system --patch-file metrics-server-patch.yaml
   ```

4. Apply the manifests in order (values for the Secrets come from `.env`; they are never stored in Git):

   ```powershell
   kubectl apply -f kubernetes/namespace.yaml
   kubectl apply -f kubernetes/configmap.yaml
   kubectl -n smart-study create secret generic user-postgres-secret  --from-literal=password="$USER_DB_PASSWORD"  --dry-run=client -o yaml | kubectl apply -f -
   kubectl -n smart-study create secret generic study-postgres-secret --from-literal=password="$STUDY_DB_PASSWORD" --dry-run=client -o yaml | kubectl apply -f -
   kubectl -n smart-study create secret generic quiz-postgres-secret  --from-literal=password="$QUIZ_DB_PASSWORD"  --dry-run=client -o yaml | kubectl apply -f -
   kubectl -n smart-study create secret generic smart-study-jwt-secret --from-literal=jwt-secret="$JWT_SECRET" --dry-run=client -o yaml | kubectl apply -f -
   kubectl -n smart-study create secret generic azure-openai-secret  --from-literal=api-key="$AZURE_OPENAI_KEY"   --dry-run=client -o yaml | kubectl apply -f -
   kubectl apply -f kubernetes/user-postgres.yaml
   kubectl apply -f kubernetes/study-postgres.yaml
   kubectl apply -f kubernetes/quiz-postgres.yaml
   kubectl rollout status deployment/user-postgres  -n smart-study --timeout=300s
   kubectl rollout status deployment/study-postgres -n smart-study --timeout=300s
   kubectl rollout status deployment/quiz-postgres  -n smart-study --timeout=300s
   kubectl apply -f kubernetes/user-service.yaml
   kubectl apply -f kubernetes/study-service.yaml
   kubectl apply -f kubernetes/quiz-service.yaml
   kubectl apply -f kubernetes/api-gateway.yaml
   kubectl apply -f kubernetes/frontend.yaml
   kubectl apply -f kubernetes/hpa-user-service.yaml
   kubectl apply -f kubernetes/hpa-study-service.yaml
   kubectl apply -f kubernetes/hpa-quiz-service.yaml
   kubectl apply -f kubernetes/hpa-api-gateway.yaml
   ```

   (PowerShell: use `$env:USER_DB_PASSWORD` style references inside the `--from-literal` arguments.)

5. Verify:

   ```powershell
   kubectl get pods,svc,hpa -n smart-study      # every pod 1/1 Running, HPA TARGETS show real CPU %, not <unknown>
   kubectl top pods -n smart-study              # real CPU/memory values (proves Metrics Server works)
   curl http://localhost:30000/                 # frontend (NodePort)
   curl http://localhost:30080/actuator/prometheus   # gateway (NodePort)
   ```

6. Load test (the Job runs k6 inside the cluster against the gateway Service). Create the credentials first — the user must exist in the cluster's `user_db`:

   ```powershell
   # register the k6 user once through the frontend, then:
   kubectl -n smart-study create secret generic k6-test-credentials `
     --from-literal=email="k6test@example.com" --from-literal=password="<password>" `
     --dry-run=client -o yaml | kubectl apply -f -
   kubectl apply -f kubernetes/k6-test-configmap.yaml
   kubectl apply -f kubernetes/k6-gateway-load-test-job.yaml
   kubectl wait --for=condition=complete job/k6-gateway-load-test -n smart-study --timeout=300s
   kubectl logs job/k6-gateway-load-test -n smart-study
   ```

Troubleshooting Kubernetes:

- A pod stuck in `CreateContainerConfigError` → a referenced Secret/ConfigMap is missing; `kubectl describe pod <pod> -n smart-study`.
- `kubectl top` says "Metrics API not available" → the Metrics Server pod is not running yet or the `--kubelet-insecure-tls` patch was not applied.
- HPA shows `<unknown>` for more than a few minutes → Metrics Server is down, or the Deployment has no CPU `resources.requests` (all app Deployments here have `cpu: 100m`).
- App pods stay `0/1` for a long time after start → startup probes allow up to 5 minutes for the JVM to boot; check `kubectl logs` for a database connection failure first.
- Pods get `Exit Code 137` / node memory pressure → too many replicas for the host; `kubectl scale deployment api-gateway -n smart-study --replicas=2` and close other heavy workloads (do not run the Compose stack simultaneously).
- The frontend at NodePort 30000 loads but API calls fail → re-deploy the frontend image; older builds hardcoded `http://localhost:8080` instead of using the same-origin `/api/` proxy (fixed in `frontend/js/app.js`).

## Run Backend Tests

Run the tests for an individual service from that service's directory. For example, for the API Gateway:

```powershell
cd C:\dev\smart-study-platform\services\api-gateway
mvn -B clean test
```

The service may require test-specific environment variables, such as a local JWT secret. Use a test-only value and never paste real secrets into logs or the README.

## Kubernetes

The local Kubernetes environment uses the `smart-study` namespace. Common inspection commands are:

```powershell
kubectl config current-context
kubectl get nodes -o wide
kubectl get pods -n smart-study
kubectl get services -n smart-study
kubectl get hpa -n smart-study
```

To inspect the API Gateway autoscaler and its events:

```powershell
kubectl describe hpa api-gateway-hpa -n smart-study
```

The API Gateway HPA is configured with a minimum of two and a maximum of four replicas, targeting average CPU utilization of 60%. The User, Study, and Quiz service HPAs are configured with both minimum and maximum replicas set to two. HPA operation depends on the cluster being able to obtain resource metrics.

## AWS Deployment

The AWS environment runs the application on an Amazon EC2 instance using Docker Compose. The deployment configuration is maintained separately from the local Kubernetes deployment. On the instance, the deployment directory used by the project is `/opt/smart-study`, with the AWS Compose configuration and `.env.aws` file.

The web application is live at `http://34.235.91.177`. Nagios Core monitoring is accessible at `http://34.235.91.177:8090/nagios/` (credentials: `nagiosadmin` / `nagios`). Availability depends on the EC2 instance and its network configuration being active.

For administration, the project uses AWS Systems Manager Session Manager where configured. Monitoring ports should remain private; do not expose Nagios publicly just to access the web console. The `.env.aws` file contains deployment secrets and must not be shared or committed.

## CI/CD and Monitoring

The Jenkins pipeline includes stages for source checkout, backend tests, Docker image build/publish, Kubernetes deployment, AWS EC2 deployment, and post-build actions. The exact stage execution result should be checked in the relevant Jenkins build.

Nagios Core is configured to monitor all backend microservices, database connections, and the frontend web UI using active service and TCP health checks. Nagios provides real-time status dashboards, alerting states (OK, WARNING, CRITICAL), and uptime tracking across the entire microservice architecture.

## Testing and Known Results

The 7 November 2026 full-tree Maven run (`mvn -B -ntp test`) recorded **99 tests across the four modules** (user 9, study 26, quiz 43, gateway 21), with zero failures, errors, or skipped tests. Packaging, Docker startup/shutdown, data persistence, and real browser flows also passed. See [the local verification report](verification/README.md) for results and repeatable commands.

The k6 load test was re-run after health probes were added to the Deployments (startup + readiness + liveness on `/actuator/health/*`, plus unauthenticated `/actuator/health` exposure in the gateway). Comparison against the previously recorded run:

| Metric | Before probes | After probes |
|---|---:|---:|
| Total checks | 7,869 | 5,292 |
| Checks passed | 7,828 (99.47%) | **5,292 (100.00%)** |
| Checks failed | 41 (0.52%) — connection refused | **0 (0.00%)** |
| Average HTTP duration | 28.48 ms | 134.19 ms |
| Max HTTP duration | 18.14 s | **1.91 s** |

The check totals differ because the runs were executed in different environments (host-driven vs in-cluster Job); the meaningful comparison is zero failed checks and no multi-second tail after the probe fix. Requests are no longer routed to pods that are still starting, which was the root cause of the connection-refused errors.

## Security Notes

- Keep `.env`, `.env.aws`, credentials, API keys, database passwords, and JWT secrets out of version control.
- Store only placeholder values in example configuration files.
- Keep Nagios Core behind private access controls or secure port forwarding.
- Review AWS security-group rules before deployment.
- Avoid including account identifiers, tokens, passwords, or other sensitive information in screenshots and public documentation.

## Future Improvements

- Investigate the connection-refused errors observed during k6 load testing.
- Add and verify suitable application health probes in Kubernetes.
- Expand automated functional and integration test coverage.
- Repeat load tests after corrective changes and compare results.
- Improve security and operational hardening, including HTTPS/TLS and more detailed tracing/alerting where appropriate.

## Author

**Dinesh Choudhary**  
B.Tech Computer Science and Engineering  
Lovely Professional University

---

*This README describes the project based on the recorded implementation and test evidence. Confirm environment variables, Compose file names, and current deployment addresses against the checked-out repository before using it as an operational runbook.*

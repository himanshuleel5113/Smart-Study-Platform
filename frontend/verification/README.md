# Frontend UI verification — 4 November 2026

The existing plain HTML/CSS/JavaScript app was completed incrementally. All source changes are inside `frontend`. Backend, Kubernetes, Dockerfiles, Compose files, Nginx, Terraform, Jenkins, and monitoring files were left unchanged. Unrelated pre-existing working-tree changes were preserved.

## Files

| File | Purpose |
| --- | --- |
| `frontend/index.html` | One shared sidebar/top bar; login, register, and eight app views |
| `frontend/css/style.css` | Shared design system, responsive layouts, accessible contrast, local font declarations |
| `frontend/js/app.js` | Existing API flows plus UI navigation, modal, quiz editor, results, and state fixes |
| `frontend/css/fonts/poppins-latin-400.woff2` | Local Poppins regular |
| `frontend/css/fonts/poppins-latin-500.woff2` | Local Poppins medium |
| `frontend/css/fonts/poppins-latin-600.woff2` | Local Poppins semibold |
| `frontend/css/fonts/poppins-latin-700.woff2` | Local Poppins bold |
| `frontend/css/fonts/OFL.txt` | Poppins SIL Open Font License |
| `frontend/verification/.gitignore` | Excludes generated browser state, screenshots, and Python cache |
| `frontend/verification/check_ui.py` | Real registration/login, empty states, auth layouts, modal and sidebar checks |
| `frontend/verification/check_flow.py` | Real subject/study/quiz/result flows, responsive checks, themes, failure recovery |
| `frontend/verification/README.md` | This audit and verification report |

The four font files were downloaded from Google Fonts' Poppins v24 Latin subset. Other writing systems retain the existing system-font fallback. No font or image requests leave the app's origin at runtime. Inline SVG and emoji provide illustrations.

## Initial inventory and API contract

The original frontend had exactly three HTML/CSS/JS files: `index.html`, `css/style.css`, and `js/app.js`. The HTML contains the login and register screens, plus the hash routes `#dashboard`, `#subjects`, `#study`, `#quizzes`, `#quiz`, `#results`, `#profile`, and `#settings`.

| Method | Endpoint | Use |
| --- | --- | --- |
| POST | `/api/users/register` | Register |
| POST | `/api/users/login` | Login |
| GET | `/api/users/profile` | Name/email |
| GET, POST | `/api/subjects` | List/create subjects |
| PUT, DELETE | `/api/subjects/{id}` | Edit/delete subjects |
| POST | `/api/study-sessions/start` | Start session |
| POST | `/api/study-sessions/stop` | Stop session |
| GET | `/api/study-sessions/history` | Session history |
| GET | `/api/study-stats` | Study statistics |
| GET, POST | `/api/quizzes` | List/create quizzes |
| GET | `/api/quizzes/{id}` | Open quiz |
| GET, POST | `/api/quizzes/{id}/questions` | Read/add questions |
| POST | `/api/ai-quizzes/generate` | Generate AI quiz |
| POST | `/api/quiz-submissions` | Submit answers |
| GET | `/api/quiz-attempts` | Attempt history |

Existing URLs, request payloads, authentication headers, and token localStorage operations are preserved. Manual question authoring now exposes the existing backend question endpoint through a form. Its request fields are `questionText`, `optionA`, `optionB`, `optionC`, `optionD`, and `correctAnswer`.

The user explicitly approved one response-handling exception during verification: `apiRequest` returns `null` for HTTP 204. The service sends an empty 204 body with a JSON content type after deletion; previously this caused JSON parsing to fail even though deletion succeeded. Other parsing and error behavior is unchanged.

## Completed checks

- Real registration and login using isolated verification accounts, through the existing API and then through the rebuilt Nginx frontend on port 80.
- Real subject create/edit/details/search/select/delete. The approved 204 handling removes deleted cards without an erroneous parsing failure.
- Start a study session, observe elapsed time, reload during the active session, stop it, and inspect history/details. Start buttons cannot create duplicates while a session is active.
- Create a manual quiz, save two questions, filter/search the list, navigate/reset/select answers, validate unanswered questions, submit, and inspect real score totals.
- Review selections from the current visit, select historical attempts, and reload Results without fabricating unavailable answer details.
- Real profile name/email, study statistics, combined activity history, disabled settings, and persisted Light/Dark/System appearance.
- All ten screens at widths 1920, 1366, 768, and 390px. Captures use a 900px viewport height and full-page screenshots. No document-level horizontal overflow; history tables scroll inside their cards.
- Keyboard focus containment/restoration for modals and mobile navigation; Escape dismissal; accessible question selection and progress.
- A deliberately simulated 503 during data loading hides unverified statistics and shows a retry screen; removing the failure and retrying restores the real data. Mobile logout releases the scroll lock.
- No JavaScript exceptions, console errors, failed local assets, or failing API requests during successful flows. Expected 503 errors are isolated to the failure test.
- `node --check frontend/js/app.js` and `git diff --check -- frontend` pass.
- `docker compose build frontend` succeeds with the unchanged Dockerfile/Nginx configuration. The final image was started with `docker compose up -d --no-deps frontend`.

**Existing service limitation:** a real AI-generation request returned HTTP 500. The UI displayed the service error and restored its controls. Successful AI generation could not be verified; no backend changes were made.

## Visual comparison

These are visual assessments against the supplied screenshots, not pixel-diff claims. The layout, Poppins typography, indigo sidebar, lavender banners, card treatment, and spacing are shared across pages. Content, names, scores, and dates come from the actual account.

| Page | Matches screenshot | Remaining differences |
| --- | --- | --- |
| Login | Yes | Same shared auth layout; mobile header wraps to fit |
| Register | Mostly | Disabled social sign-in and an honest availability note replace unsupported legal/social flows |
| Dashboard | Mostly | Session invitation replaces an unsupported scheduled-session claim; activity uses real records |
| Subjects | Mostly | Bars explicitly show share of recorded study time, not course-completion percentages |
| Study Sessions | Mostly | Honest elapsed timer starts at `00:00`; it does not claim to be a 25-minute countdown |
| Quiz Management | Mostly | Adds a functional question editor; empty quizzes are disabled; AI service currently returns 500 |
| Quiz Taking | Mostly | Same options/palette/progress; unavailable quiz time limits are omitted; controls stack on mobile |
| Results | Mostly | Real score trend replaces topic-wise performance; current selections are reviewable but correctness details are unavailable |
| Profile | Mostly | Session says “Signed in”; count is labelled “Quiz Attempts”; unavailable profile metadata is omitted |
| Settings | Mostly | Readable dark-mode banners; unsupported controls disabled; save button accurately says “Save Appearance” |

## Unsupported and derived elements

- Google/GitHub login and notification bell content are disabled with “Coming soon” labels/tooltips. The bell's red dot is decorative and does not represent an unread count.
- Global search is disabled outside supported pages. Subjects, quizzes, and study history have working local filters over already loaded API data, including no-match feedback.
- Profile editing, password changes, and notification toggles are disabled. Photo upload, member-since, and last-login metadata are omitted.
- Scheduling, topic-wise performance, quiz time limits, and quiz duration are omitted because the API provides no supporting data.
- Subject bars derive each subject's share of recorded study time. They do not claim curriculum completion.
- Review shows actual choices from the just-submitted quiz in memory. Correct-answer feedback and saved historical answer details are unavailable and clearly labelled. No correctness is inferred from quiz scores.
- Themes, study totals, session counts, average quiz scores, attempt counts, activity sorting, question progress, and score trends work using local preferences or existing API data.

## Repeating the checks

The scripts use Python Playwright and an installed Chrome browser. They are verification utilities, not frontend dependencies or a build step. Both were already available on the verification machine.

With the app running locally, execute from the repository root in PowerShell:

```powershell
$env:SSP_BASE_URL = 'http://localhost'
python frontend/verification/check_ui.py
python frontend/verification/check_flow.py dashboard subjects study quizzes taking results profile_settings responsive failures
```

`check_ui.py` registers a new real test account. `check_flow.py` uses its saved browser state and creates real test subjects, sessions, quizzes, and attempts. Run the flow steps in the listed order for a new account. The optional `ai` step performs a real generation request and records whether the service succeeds; it was checked separately because the service returned 500.

Without `SSP_BASE_URL`, the scripts serve the working frontend on port 8765 and use its unchanged direct gateway behavior on port 8080. Screenshots, the test account, and browser authentication state are stored in the ignored `artifacts/` directory. These generated credentials are not committed or copied into the frontend image.

No changes were pushed. Work is saved in local commits per step.

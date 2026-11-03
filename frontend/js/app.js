/* ============================================================
   Smart Study Platform — frontend logic
   Plain JavaScript. Hash-routed views inside a sidebar shell.
   All API endpoints, request bodies and JWT handling unchanged.
   ============================================================ */

// When served by Nginx (port 80 locally, NodePort 30000 on Kubernetes),
// use same-origin paths - Nginx proxies /api/ to the API Gateway.
// Otherwise (e.g. "npx serve" without a proxy) talk to the Gateway directly.
const API_BASE_URL = (window.location.port === "80"
        || window.location.port === "30000"
        || (window.location.port === "" && window.location.protocol !== "file:"))
    ? ""
    : "http://localhost:8080";


/* ============================================================
   Tiny helpers
   ============================================================ */

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function showToast(message, type = "info") {

    const container =
        $("toastContainer");

    if (!container) {
        return;
    }

    const toast =
        document.createElement("div");

    toast.className = `toast toast-${type}`;

    toast.setAttribute("role", "status");

    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {

        toast.classList.add("hide");

        setTimeout(() => toast.remove(), 300);

    }, 4200);
}

function setButtonLoading(button, isLoading) {

    if (!button) {
        return;
    }

    button.classList.toggle("is-loading", isLoading);

    button.disabled = isLoading;
}

function friendlyHttpMessage(status) {

    switch (status) {

        case 400:
            return "The request was invalid. Please check your input and try again.";

        case 401:
            return "Your session has expired. Please log in again.";

        case 403:
            return "You do not have permission to perform this action.";

        case 404:
            return "The requested item was not found.";

        case 502:
            return "The AI service returned an unexpected response. Please try again.";

        case 503:
            return "A service is temporarily unavailable. Please try again shortly.";

        case 504:
            return "The service took too long to respond. Please try again.";

        default:
            return `Something went wrong (error ${status}). Please try again.`;
    }
}

function formatDuration(seconds) {

    if (!seconds || seconds <= 0) {
        return "0 min";
    }

    const totalSeconds =
        Math.round(seconds);

    const hours =
        Math.floor(totalSeconds / 3600);

    const minutes =
        Math.floor((totalSeconds % 3600) / 60);

    const remainingSeconds =
        totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    if (minutes > 0) {
        return `${minutes} min`;
    }

    return `${remainingSeconds} sec`;
}

function formatTimer(totalSeconds) {

    const s =
        Math.max(0, Math.floor(totalSeconds));

    const hours =
        Math.floor(s / 3600);

    const minutes =
        Math.floor((s % 3600) / 60);

    const seconds =
        s % 60;

    const mm =
        String(minutes).padStart(2, "0");

    const ss =
        String(seconds).padStart(2, "0");

    return hours > 0
        ? `${hours}:${mm}:${ss}`
        : `${mm}:${ss}`;
}

function timeAgo(isoString) {

    if (!isoString) {
        return "";
    }

    const then =
        new Date(isoString).getTime();

    const diffMs =
        Date.now() - then;

    const minutes =
        Math.floor(diffMs / 60000);

    if (minutes < 1) {
        return "just now";
    }

    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    const hours =
        Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours}h ago`;
    }

    const days =
        Math.floor(hours / 24);

    return `${days}d ago`;
}

function formatDateTime(isoString) {

    if (!isoString) {
        return "";
    }

    const d =
        new Date(isoString);

    if (Number.isNaN(d.getTime())) {
        return "";
    }

    return d.toLocaleString(undefined, {

        year: "numeric",
        month: "short",
        day: "numeric",

        hour: "2-digit",
        minute: "2-digit"
    });
}


/* ============================================================
   Central API helper (unchanged behaviour)
   ============================================================ */

async function apiRequest(path, options = {}) {

    const {
        method = "GET",
        body = null,
        includeAuth = true
    } = options;

    const headers = {};

    if (body !== null) {

        headers["Content-Type"] =
            "application/json";
    }

    if (includeAuth) {

        const token =
            localStorage.getItem("token");

        if (token) {

            headers["Authorization"] =
                `Bearer ${token}`;
        }
    }

    const fetchOptions = {
        method: method,
        headers: headers
    };

    if (body !== null) {

        fetchOptions.body =
            JSON.stringify(body);
    }

    let response;

    try {

        response =
            await fetch(
                `${API_BASE_URL}${path}`,
                fetchOptions
            );

    } catch (networkError) {

        const error =
            new Error(
                "Cannot reach the server. Please check that the services are running and try again."
            );

        error.status = 0;

        throw error;
    }

    const contentType =
        response.headers.get("content-type");

    let data = null;

    if (
        contentType &&
        contentType.includes("application/json")
    ) {

        data = await response.json();

    } else {

        const text =
            await response.text();

        data = text || null;
    }

    if (!response.ok) {

        const errorMessage =
            data &&
            typeof data === "object" &&
            data.message
                ? data.message
                : friendlyHttpMessage(response.status);

        const error =
            new Error(errorMessage);

        error.status =
            response.status;

        throw error;
    }

    return data;
}


/* ============================================================
   Shared state
   ============================================================ */

const state = {

    profile: null,        // {id, name, email}
    subjects: [],         // [{id, name, description}]
    history: [],          // [{id, subjectId, startedAt, endedAt, durationSeconds}]
    stats: null,          // {totalStudySeconds, totalSessions, averageSessionSeconds}
    quizzes: [],          // [{id, title, description, aiGenerated, createdAt}]
    questionCounts: {},   // quizId -> question count (or null when unknown)
    attempts: [],         // [{attemptId, quizId, score, totalQuestions, percentage, completedAt}]
    lastResult: null,     // result of the quiz just submitted
    quizFilter: "all"
};

let quizSession = null;   // {quiz, questions, idx, answers{}}
let sessionStart = null;  // ms timestamp of the running study session
let timerInterval = null;


/* ============================================================
   Theme (light / dark / system)
   ============================================================ */

function applyTheme(pref) {

    let resolved =
        pref;

    if (pref === "system") {

        resolved = window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }

    if (resolved === "dark") {

        document.documentElement.dataset.theme = "dark";

    } else {

        document.documentElement.dataset.theme = "light";
    }
}

function getThemePreference() {

    return localStorage.getItem("theme") || "system";
}

function initTheme() {

    applyTheme(getThemePreference());
}


/* ============================================================
   Modal helper
   ============================================================ */

function showModal({ title, bodyHTML, okText = "Save", okClass = "btn-primary", onOk }) {

    const root =
        $("modalRoot");

    if (!root) {
        return { close: () => {} };
    }

    root.innerHTML = `
        <div class="modal-backdrop" data-modal-cancel></div>
        <div class="modal" role="dialog" aria-modal="true">
            <h3>${escapeHtml(title)}</h3>
            <div class="modal-body">${bodyHTML}</div>
            <div class="modal-actions">
                <button type="button" class="btn btn-outline" data-modal-cancel>Cancel</button>
                <button type="button" class="btn ${okClass}" data-modal-ok>${escapeHtml(okText)}</button>
            </div>
        </div>
    `;

    root.classList.remove("hidden");

    const close =
        () => {

            root.classList.add("hidden");

            root.innerHTML = "";
        };

    root.querySelectorAll("[data-modal-cancel]")
        .forEach((el) => el.addEventListener("click", close));

    const okButton =
        root.querySelector("[data-modal-ok]");

    okButton.addEventListener("click", async () => {

        if (!onOk) {
            close();
            return;
        }

        setButtonLoading(okButton, true);

        try {

            await onOk();

            close();

        } catch (error) {

            showToast(error.message, "error");

        } finally {

            setButtonLoading(okButton, false);
        }
    });

    document.addEventListener("keydown", function onEsc(e) {

        if (e.key === "Escape") {

            close();

            document.removeEventListener("keydown", onEsc);
        }
    });

    return { close };
}


/* ============================================================
   Router (hash based)
   ============================================================ */

const VIEW_IDS = [

    "dashboard",
    "subjects",
    "study",
    "quizzes",
    "quiz",
    "results",
    "profile",
    "settings"
];

let currentView =
    "dashboard";

function showView(name) {

    if (!VIEW_IDS.includes(name)) {
        name = "dashboard";
    }

    // Quiz view needs an active quiz session
    if (name === "quiz" && !quizSession) {
        name = "quizzes";
    }

    currentView =
        name;

    VIEW_IDS.forEach((view) => {

        const section =
            $(`view-${view}`);

        if (section) {

            section.classList.toggle(
                "hidden",
                view !== name
            );
        }
    });

    document.querySelectorAll(".sidebar-item")
        .forEach((item) => {

            item.classList.toggle(
                "active",
                item.dataset.view === name
            );
        });

    // Per-view refreshers
    if (name === "dashboard") refreshDashboard();
    if (name === "subjects") renderSubjects();
    if (name === "study") refreshStudy();
    if (name === "quizzes") renderQuizzes();
    if (name === "quiz") renderQuizQuestion();
    if (name === "results") refreshResults();
    if (name === "profile") refreshProfile();
    if (name === "settings") renderSettings();

    // Reset the client-side search when switching pages
    const search =
        $("globalSearch");

    if (search) {
        search.value = "";
    }

    // Close the mobile sidebar after navigating
    closeSidebar();

    window.scrollTo({ top: 0, behavior: "instant" });
}

function routeFromHash() {

    const hash =
        (window.location.hash || "#dashboard")
            .replace("#", "");

    showView(hash);
}


/* ============================================================
   Auth views
   ============================================================ */

function showAuthView(which) {

    const authShell =
        $("authShell");

    const appShell =
        $("appShell");

    if (!authShell || !appShell) {
        return;
    }

    authShell.classList.remove("hidden");

    appShell.classList.add("hidden");

    const isRegister =
        which === "register";

    $("loginSection").classList.toggle("hidden", isRegister);

    $("registerSection").classList.toggle("hidden", !isRegister);

    $("authBrandTitle").textContent = isRegister
        ? "Create your account 🚀"
        : "Welcome back 👋";

    $("authBrandSub").textContent = isRegister
        ? "Start tracking your study progress today."
        : "Login to continue your study journey.";

    $("authTopNote").textContent = isRegister
        ? "Already have an account?"
        : "New here?";

    $("showLoginButton").textContent = isRegister
        ? "Login →"
        : "Register →";

    $("loginMessage").textContent = "";

    $("registerMessage").textContent = "";
}

function showLoginPage() {
    showAuthView("login");
}

function showRegisterPage() {
    showAuthView("register");
}

function forceLogout() {

    localStorage.removeItem("token");

    quizSession = null;

    stopTimerTick();

    sessionStart = null;

    showLoginPage();
}


/* ============================================================
   Core data loading (parallel)
   ============================================================ */

async function loadCoreData() {

    const token =
        localStorage.getItem("token");

    if (!token) {

        forceLogout();

        return;
    }

    const [profile, stats, subjects, history, quizzes, attempts] =
        await Promise.all([

            apiRequest("/api/users/profile"),

            apiRequest("/api/study-stats"),

            apiRequest("/api/subjects"),

            apiRequest("/api/study-sessions/history"),

            apiRequest("/api/quizzes"),

            apiRequest("/api/quiz-attempts")
        ]);

    state.profile = profile;

    state.stats = stats;

    state.subjects = Array.isArray(subjects) ? subjects : [];

    state.history = Array.isArray(history) ? history : [];

    state.quizzes = Array.isArray(quizzes) ? quizzes : [];

    state.attempts = Array.isArray(attempts) ? attempts : [];

    // Question counts per quiz (honest "N questions" badges)
    const counts =

        await Promise.all(

            state.quizzes.map((quiz) =>

                apiRequest(`/api/quizzes/${quiz.id}/questions`)
                    .then((questions) => [quiz.id, Array.isArray(questions) ? questions.length : null])
                    .catch(() => [quiz.id, null])
            )
        );

    state.questionCounts =
        Object.fromEntries(counts);

    renderUserChip();
}

async function reloadDataSilently() {

    try {

        await loadCoreData();

    } catch (error) {

        if (error.status === 401) {

            forceLogout();

        } else {

            showToast(error.message, "error");
        }
    }
}

function subjectNameById(subjectId) {

    const subject =
        state.subjects.find((s) => s.id === subjectId);

    return subject
        ? subject.name
        : `Subject #${subjectId}`;
}

function quizById(quizId) {

    return state.quizzes.find((q) => q.id === quizId) || null;
}

function averageScore() {

    if (state.attempts.length === 0) {
        return null;
    }

    const sum =
        state.attempts.reduce(
            (acc, attempt) => acc + (attempt.percentage || 0),
            0
        );

    return Math.round(sum / state.attempts.length);
}


/* ============================================================
   Sidebar + top bar wiring
   ============================================================ */

function renderUserChip() {

    if (!state.profile) {
        return;
    }

    const name =
        state.profile.name || "Student";

    $("userDisplayName").textContent =
        name;

    $("userAvatar").textContent =
        name.trim().charAt(0).toUpperCase() || "S";
}

function closeSidebar() {

    $("appShell")?.classList.remove("sidebar-open");

    $("sidebarBackdrop")?.classList.add("hidden");
}

function initShell() {

    // Sidebar navigation
    document.querySelectorAll(".sidebar-item")
        .forEach((item) => {

            item.addEventListener("click", () => {

                window.location.hash =
                    `#${item.dataset.view}`;

                showView(item.dataset.view);
            });
        });

    // Mobile sidebar
    $("sidebarToggle").addEventListener("click", () => {

        const shell =
            $("appShell");

        const open =
            shell.classList.toggle("sidebar-open");

        $("sidebarBackdrop").classList.toggle("hidden", !open);
    });

    $("sidebarBackdrop").addEventListener("click", closeSidebar);

    // Notification bell (no notifications API yet)
    $("notificationBell").addEventListener("click", () => {

        showToast("Notifications are coming soon.", "info");
    });

    // User menu
    const userMenu =
        $("userMenu");

    $("userChip").addEventListener("click", (event) => {

        event.stopPropagation();

        const rect =
            $("userChip").getBoundingClientRect();

        userMenu.style.top =
            `${rect.bottom + 8}px`;

        userMenu.style.right =
            `${window.innerWidth - rect.right}px`;

        userMenu.style.left =
            "auto";

        const hidden =
            userMenu.classList.toggle("hidden");

        $("userChip").setAttribute(
            "aria-expanded",
            hidden ? "false" : "true"
        );
    });

    document.addEventListener("click", (event) => {

        if (!userMenu.classList.contains("hidden")
            && !userMenu.contains(event.target)) {

            userMenu.classList.add("hidden");
        }
    });

    userMenu.querySelectorAll("[data-view]")
        .forEach((item) => {

            item.addEventListener("click", () => {

                userMenu.classList.add("hidden");

                window.location.hash =
                    `#${item.dataset.view}`;

                showView(item.dataset.view);
            });
        });

    $("menuLogoutButton").addEventListener("click", () => {

        userMenu.classList.add("hidden");

        forceLogout();
    });

    // Logout (sidebar)
    $("logoutButton").addEventListener("click", forceLogout);

    // Global search (client-side filter of the current page)
    $("globalSearch").addEventListener("input", applySearchFilter);
}

function applySearchFilter() {

    const query =
        ($("globalSearch").value || "").trim().toLowerCase();

    if (currentView === "subjects") {

        document.querySelectorAll("#subjectsGrid .subject-card")
            .forEach((card) => {

                const text =
                    (card.dataset.search || "").toLowerCase();

                card.classList.toggle(
                    "hidden",
                    query !== "" && !text.includes(query)
                );
            });
    }

    if (currentView === "quizzes") {

        document.querySelectorAll("#quizzesList .quiz-row")
            .forEach((row) => {

                const text =
                    (row.dataset.search || "").toLowerCase();

                row.classList.toggle(
                    "hidden",
                    query !== "" && !text.includes(query)
                );
            });
    }

    if (currentView === "study") {

        document.querySelectorAll("#studyHistoryList tr[data-search]")
            .forEach((row) => {

                const text =
                    (row.dataset.search || "").toLowerCase();

                row.classList.toggle(
                    "hidden",
                    query !== "" && !text.includes(query)
                );
            });
    }
}


/* ============================================================
   Auth flows (unchanged API behaviour)
   ============================================================ */

function initAuth() {

    $("showRegisterButton").addEventListener("click", showRegisterPage);

    $("showLoginButton").addEventListener("click", () => {

        // top bar button: goes to register page when on login, and back when on register
        const onLogin =
            !$("loginSection").classList.contains("hidden");

        if (onLogin) {
            showRegisterPage();
        } else {
            showLoginPage();
        }
    });

    $("showLoginButton2").addEventListener("click", showLoginPage);

    // Password visibility toggles
    document.querySelectorAll(".eye-toggle")
        .forEach((button) => {

            button.addEventListener("click", () => {

                const input =
                    $(button.dataset.eye);

                if (!input) {
                    return;
                }

                input.type =
                    input.type === "password" ? "text" : "password";
            });
        });

    // Login
    $("loginForm").addEventListener("submit", async (event) => {

        event.preventDefault();

        const email =
            $("loginEmail").value.trim();

        const password =
            $("loginPassword").value;

        const submitButton =
            $("loginForm").querySelector('button[type="submit"]');

        $("loginMessage").textContent =
            "Logging in...";

        setButtonLoading(submitButton, true);

        try {

            const data =
                await apiRequest(
                    "/api/users/login",
                    {
                        method: "POST",
                        body: { email, password },
                        includeAuth: false
                    }
                );

            localStorage.setItem("token", data.token);

            $("loginForm").reset();

            $("loginMessage").textContent = "";

            showToast("Welcome back!", "success");

            await loadCoreData();

            enterApp();

        } catch (error) {

            $("loginMessage").textContent =
                error.message;

            showToast(error.message, "error");

        } finally {

            setButtonLoading(submitButton, false);
        }
    });

    // Registration
    $("registerForm").addEventListener("submit", async (event) => {

        event.preventDefault();

        const name =
            $("registerName").value.trim();

        const email =
            $("registerEmail").value.trim();

        const password =
            $("registerPassword").value;

        const submitButton =
            $("registerForm").querySelector('button[type="submit"]');

        $("registerMessage").textContent =
            "Creating account...";

        setButtonLoading(submitButton, true);

        try {

            await apiRequest(
                "/api/users/register",
                {
                    method: "POST",
                    body: { name, email, password },
                    includeAuth: false
                }
            );

            $("registerForm").reset();

            $("registerMessage").textContent =
                "Registration successful. You can now log in.";

            showToast("Account created - you can now log in.", "success");

        } catch (error) {

            $("registerMessage").textContent =
                error.message;

            showToast(error.message, "error");

        } finally {

            setButtonLoading(submitButton, false);
        }
    });
}


/* ============================================================
   Entering the app
   ============================================================ */

function enterApp() {

    $("authShell").classList.add("hidden");

    $("appShell").classList.remove("hidden");

    renderUserChip();

    if (!window.location.hash || window.location.hash === "#") {
        window.location.hash =
            "#dashboard";
    }

    routeFromHash();
}


/* ============================================================
   Dashboard
   ============================================================ */

function refreshDashboard() {

    if (!state.profile) {
        return;
    }

    $("welcomeMessage").textContent =
        `Welcome back, ${state.profile.name}! 👋`;

    $("totalStudyTime").textContent =
        formatDuration(state.stats?.totalStudySeconds);

    $("totalSessions").textContent =
        state.stats?.totalSessions ?? 0;

    const avg =
        averageScore();

    $("averageScore").textContent =
        avg === null ? "—" : `${avg}%`;

    renderActivityList($("recentActivityList"));
}


function buildActivityItems(limit = 5) {

    const items = [];

    state.attempts.forEach((attempt) => {

        const quiz =
            quizById(attempt.quizId);

        items.push({

            ts: attempt.completedAt,

            icon: "🏆",

            iconClass: "green",

            title: `Completed: ${quiz ? quiz.title : `Quiz #${attempt.quizId}`}`,

            sub: `Score: ${attempt.score}/${attempt.totalQuestions} (${attempt.percentage}%) • ${timeAgo(attempt.completedAt)}`
        });
    });

    state.history.forEach((session) => {

        items.push({

            ts: session.startedAt,

            icon: "📖",

            iconClass: "blue",

            title: "Study Session",

            sub: `${formatDuration(session.durationSeconds)} • ${subjectNameById(session.subjectId)} • ${timeAgo(session.startedAt)}`
        });
    });

    items.sort((a, b) =>

        new Date(b.ts).getTime() - new Date(a.ts).getTime()
    );

    return items.slice(0, limit);
}


function renderActivityList(container) {

    if (!container) {
        return;
    }

    const items =
        buildActivityItems(5);

    if (items.length === 0) {

        container.innerHTML =
            '<div class="empty-state"><span class="empty-emoji">🌱</span>No activity yet - add a subject or take a quiz to get started.</div>';

        return;
    }

    container.innerHTML =
        items.map((item) => `

            <div class="activity-item">

                <span class="activity-icon" style="background:var(--${item.iconClass === "green" ? "success-soft" : "info-soft"});">${item.icon}</span>

                <div>
                    <div class="a-title">${escapeHtml(item.title)}</div>
                    <div class="a-sub">${escapeHtml(item.sub)}</div>
                </div>

            </div>
        `).join("");
}


/* ============================================================
   Subjects
   ============================================================ */

const TONES = ["", "tone-blue", "tone-green", "tone-orange", "tone-pink", "tone-violet"];

function subjectSessions(subjectId) {

    return state.history.filter(
        (session) => session.subjectId === subjectId
    );
}

function subjectSeconds(subjectId) {

    return subjectSessions(subjectId)
        .reduce(
            (acc, session) => acc + (session.durationSeconds || 0),
            0
        );
}

function renderSubjects() {

    const grid =
        $("subjectsGrid");

    // Keep the study-session dropdown in sync with the subject list
    const select =
        $("studySubjectId");

    if (select) {

        const previous =
            select.value;

        select.innerHTML =
            '<option value="">Select a subject</option>';

        state.subjects.forEach((subject) => {

            const option =
                document.createElement("option");

            option.value =
                subject.id;

            option.textContent =
                subject.name;

            select.appendChild(option);
        });

        // restore the previous selection when it still exists
        if (previous && state.subjects.some((s) => String(s.id) === previous)) {

            select.value =
                previous;
        }
    }

    if (!grid) {
        return;
    }

    if (state.subjects.length === 0) {

        grid.innerHTML =
            '<div class="empty-state" style="grid-column:1/-1;"><span class="empty-emoji">📚</span>No subjects yet - click "Add Subject" to create your first one.</div>';

        return;
    }

    // Bar = share of total study time (honest relative measure)
    const maxSeconds =
        Math.max(
            1,
            ...state.subjects.map((subject) => subjectSeconds(subject.id))
        );

    grid.innerHTML =
        state.subjects.map((subject, index) => {

            const sessions =
                subjectSessions(subject.id).length;

            const seconds =
                subjectSeconds(subject.id);

            const pct =
                Math.round((seconds / maxSeconds) * 100);

            const letter =
                (subject.name || "?").trim().charAt(0).toUpperCase();

            return `

                <div class="subject-card ${TONES[index % TONES.length]}" data-search="${escapeHtml(subject.name)} ${escapeHtml(subject.description || "")}">

                    <div class="subject-top">

                        <span class="subject-avatar">${escapeHtml(letter)}</span>

                        <div>
                            <h3>${escapeHtml(subject.name)}</h3>

                            <div class="subject-meta">

                                ${sessions} session${sessions === 1 ? "" : "s"} • ${formatDuration(seconds)}

                            </div>
                        </div>

                    </div>

                    <div class="subject-progress">

                        <div class="progress-track">

                            <div class="progress-fill" style="width:${pct}%;"></div>

                        </div>

                        <span class="progress-label">${formatDuration(seconds)}</span>

                    </div>

                    <div class="subject-actions">

                        <button type="button" class="btn btn-ghost" data-study="${subject.id}">▶ Study</button>

                        <button type="button" class="btn btn-outline" data-view-details="${subject.id}">👁 View</button>

                        <span class="spacer"></span>

                        <button type="button" class="btn-icon" data-edit="${subject.id}" title="Edit subject" aria-label="Edit ${escapeHtml(subject.name)}">✏️</button>

                        <button type="button" class="btn-icon danger" data-delete="${subject.id}" title="Delete subject" aria-label="Delete ${escapeHtml(subject.name)}">🗑️</button>

                    </div>

                </div>
            `;
        }).join("");

    // Wire card actions
    grid.querySelectorAll("[data-study]")
        .forEach((button) => {

            button.addEventListener("click", () => {

                const select =
                    $("studySubjectId");

                if (select) {
                    select.value =
                        button.dataset.study;
                }

                window.location.hash =
                    "#study";

                showView("study");
            });
        });

    grid.querySelectorAll("[data-view-details]")
        .forEach((button) => {

            button.addEventListener("click", () => {

                openSubjectDetails(Number(button.dataset.viewDetails));
            });
        });

    grid.querySelectorAll("[data-edit]")
        .forEach((button) => {

            button.addEventListener("click", () => {

                openSubjectModal(Number(button.dataset.edit));
            });
        });

    grid.querySelectorAll("[data-delete]")
        .forEach((button) => {

            button.addEventListener("click", () => {

                const subject =
                    state.subjects.find(
                        (s) => s.id === Number(button.dataset.delete)
                    );

                if (!subject) {
                    return;
                }

                showModal({

                    title: "Delete subject?",

                    bodyHTML: `<p style="color:var(--text-muted);font-size:13.5px;">"${escapeHtml(subject.name)}" will be removed. This cannot be undone.</p>`,

                    okText: "Delete",

                    okClass: "btn-danger",

                    onOk: async () => {

                        await apiRequest(
                            `/api/subjects/${subject.id}`,
                            { method: "DELETE" }
                        );

                        showToast("Subject deleted.", "success");

                        await reloadDataSilently();

                        renderSubjects();
                    }
                });
            });
        });
}


function openSubjectModal(subjectId = null) {

    const subject =
        subjectId
            ? state.subjects.find((s) => s.id === subjectId)
            : null;

    showModal({

        title: subject ? "Edit Subject" : "Add Subject",

        bodyHTML: `
            <div>
                <label for="modalSubjectName">Subject Name</label>
                <input id="modalSubjectName" class="input" type="text" placeholder="Example: Java"
                    value="${subject ? escapeHtml(subject.name) : ""}" required>
            </div>
            <div>
                <label for="modalSubjectDescription">Description</label>
                <input id="modalSubjectDescription" class="input" type="text" placeholder="Short description"
                    value="${subject ? escapeHtml(subject.description || "") : ""}">
            </div>
        `,

        okText: subject ? "Save Changes" : "Add Subject",

        onOk: async () => {

            const name =
                $("modalSubjectName").value.trim();

            const description =
                $("modalSubjectDescription").value.trim();

            if (!name) {

                throw new Error("Subject name is required.");
            }

            if (subject) {

                await apiRequest(
                    `/api/subjects/${subject.id}`,
                    { method: "PUT", body: { name, description } }
                );

                showToast("Subject updated.", "success");

            } else {

                await apiRequest(
                    "/api/subjects",
                    { method: "POST", body: { name, description } }
                );

                showToast("Subject created.", "success");
            }

            await reloadDataSilently();

            renderSubjects();
        }
    });
}


function openSubjectDetails(subjectId) {

    const subject =
        state.subjects.find((s) => s.id === subjectId);

    if (!subject) {
        return;
    }

    const sessions =
        subjectSessions(subjectId);

    const rows =
        sessions.length === 0

            ? '<div class="empty-state">No study sessions recorded for this subject yet.</div>'

            : sessions.map((session) => `

                <div class="pf-row">
                    <span class="pf-icon">📅</span>
                    <span class="pf-label">${escapeHtml(formatDateTime(session.startedAt))}</span>
                    <span class="pf-value">${escapeHtml(formatDuration(session.durationSeconds))}</span>
                </div>
            `).join("");

    showModal({

        title: subject.name,

        bodyHTML: `
            <p style="color:var(--text-muted);font-size:13px;margin-bottom:4px;">
                ${escapeHtml(subject.description || "No description")}
            </p>
            <div class="pf-row" style="border-top:1px solid var(--border);">
                <span class="pf-icon">🕐</span>
                <span class="pf-label">Total study time</span>
                <span class="pf-value">${escapeHtml(formatDuration(subjectSeconds(subjectId)))}</span>
            </div>
            <div class="pf-row">
                <span class="pf-icon">🔁</span>
                <span class="pf-label">Sessions</span>
                <span class="pf-value">${sessions.length}</span>
            </div>
            ${rows}
        `,

        okText: "Close",

        onOk: null
    });
}


/* ============================================================
   Study sessions + timer
   ============================================================ */

function stopTimerTick() {

    if (timerInterval) {

        clearInterval(timerInterval);

        timerInterval = null;
    }
}

function detectRunningSession() {

    const latest =
        state.history[0];

    if (latest && !latest.endedAt) {

        sessionStart =
            new Date(latest.startedAt).getTime();

    } else {

        sessionStart =
            null;
    }
}

function renderTimerState() {

    const display =
        $("sessionTimer");

    const pill =
        $("timerStatePill");

    const play =
        $("startSessionBtn");

    const stop =
        $("stopStudyButton");

    const reset =
        $("resetTimerBtn");

    if (!display) {
        return;
    }

    if (sessionStart) {

        const elapsed =
            (Date.now() - sessionStart) / 1000;

        display.textContent =
            formatTimer(elapsed);

        pill.textContent =
            "Session in progress";

        play.classList.add("hidden");

        stop.classList.remove("hidden");

        reset.disabled =
            true;

        reset.title =
            "Stop the session before resetting";

        stopTimerTick();

        timerInterval =
            setInterval(() => {

                display.textContent =
                    formatTimer((Date.now() - sessionStart) / 1000);

            }, 1000);

    } else {

        display.textContent =
            "25:00";

        pill.textContent =
            "Pomodoro Timer";

        play.classList.remove("hidden");

        stop.classList.add("hidden");

        reset.disabled =
            false;

        reset.title =
            "Reset the timer display";

        stopTimerTick();
    }
}

function refreshStudy() {

    detectRunningSession();

    renderTimerState();

    $("statStudyTime").textContent =
        formatDuration(state.stats?.totalStudySeconds);

    // Sessions started today (honest derivation from history)
    const today =
        new Date().toDateString();

    const todayCount =
        state.history.filter(
            (session) => new Date(session.startedAt).toDateString() === today
        ).length;

    $("statToday").textContent =
        `${todayCount} session${todayCount === 1 ? "" : "s"}`;

    $("statTotal").textContent =
        state.stats?.totalSessions ?? 0;

    renderStudyHistory();
}


function renderStudyHistory() {

    const container =
        $("studyHistoryList");

    if (!container) {
        return;
    }

    if (state.history.length === 0) {

        container.innerHTML =
            '<div class="empty-state"><span class="empty-emoji">📚</span>No study sessions yet - pick a subject and press Start Session.</div>';

        return;
    }

    container.innerHTML = `

        <table class="data-table">

            <thead>

                <tr>
                    <th>Date &amp; Time</th>
                    <th>Subject</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>

            </thead>

            <tbody>

                ${state.history.map((session) => {

                    const running =
                        !session.endedAt;

                    return `

                        <tr data-search="${escapeHtml(subjectNameById(session.subjectId))} ${escapeHtml(formatDateTime(session.startedAt))}">

                            <td>${escapeHtml(formatDateTime(session.startedAt))}</td>

                            <td>
                                <span class="cell-subject">
                                    <span class="subject-avatar">${escapeHtml(subjectNameById(session.subjectId).charAt(0).toUpperCase())}</span>
                                    ${escapeHtml(subjectNameById(session.subjectId))}
                                </span>
                            </td>

                            <td>${escapeHtml(formatDuration(session.durationSeconds))}</td>

                            <td>
                                ${running
                                    ? '<span class="badge badge-progress">In Progress</span>'
                                    : '<span class="badge badge-complete">Completed</span>'}
                            </td>

                            <td>
                                <button type="button" class="btn btn-outline" style="padding:6px 12px;font-size:12.5px;" data-session="${session.id}">👁 View</button>
                            </td>

                        </tr>
                    `;
                }).join("")}

            </tbody>

        </table>
    `;

    container.querySelectorAll("[data-session]")
        .forEach((button) => {

            button.addEventListener("click", () => {

                const session =
                    state.history.find(
                        (s) => s.id === Number(button.dataset.session)
                    );

                if (!session) {
                    return;
                }

                showModal({

                    title: "Study session details",

                    bodyHTML: `

                        <div class="pf-row"><span class="pf-icon">📚</span><span class="pf-label">Subject</span><span class="pf-value">${escapeHtml(subjectNameById(session.subjectId))}</span></div>

                        <div class="pf-row"><span class="pf-icon">▶️</span><span class="pf-label">Started</span><span class="pf-value">${escapeHtml(formatDateTime(session.startedAt))}</span></div>

                        <div class="pf-row"><span class="pf-icon">⏹️</span><span class="pf-label">Stopped</span><span class="pf-value">${session.endedAt ? escapeHtml(formatDateTime(session.endedAt)) : "Still running"}</span></div>

                        <div class="pf-row"><span class="pf-icon">🕐</span><span class="pf-label">Duration</span><span class="pf-value">${escapeHtml(formatDuration(session.durationSeconds))}</span></div>
                    `,

                    okText: "Close",

                    onOk: null
                });
            });
        });
}


function initStudy() {

    $("studyStartForm").addEventListener("submit", async (event) => {

        event.preventDefault();

        const subjectId =
            Number($("studySubjectId").value);

        if (!subjectId) {

            $("studyMessage").textContent =
                "Please select a subject.";

            showToast("Please select a subject.", "error");

            return;
        }

        const submitButton =
            $("studyStartForm").querySelector('button[type="submit"]');

        $("studyMessage").textContent =
            "Starting study session...";

        setButtonLoading(submitButton, true);

        try {

            await apiRequest(
                "/api/study-sessions/start",
                { method: "POST", body: { subjectId } }
            );

            $("studyMessage").textContent =
                "Study session started. 📚";

            showToast("Study session started. Focus!", "success");

            await reloadDataSilently();

            refreshStudy();

        } catch (error) {

            $("studyMessage").textContent =
                error.message;

            showToast(error.message, "error");

        } finally {

            setButtonLoading(submitButton, false);
        }
    });

    // Big play button submits the same form
    $("startSessionBtn").addEventListener("click", () => {

        if (!$("studySubjectId").value) {

            showToast("Please select a subject first.", "error");

            $("studySubjectId").focus();

            return;
        }

        $("studyStartForm").requestSubmit();
    });

    $("stopStudyButton").addEventListener("click", async () => {

        $("studyMessage").textContent =
            "Stopping study session...";

        setButtonLoading($("stopStudyButton"), true);

        try {

            const result =
                await apiRequest(
                    "/api/study-sessions/stop",
                    { method: "POST" }
                );

            $("studyMessage").textContent =
                `Session completed: ${formatDuration(result.durationSeconds)}`;

            showToast(
                `Session completed: ${formatDuration(result.durationSeconds)}`,
                "success"
            );

            await reloadDataSilently();

            refreshStudy();

        } catch (error) {

            $("studyMessage").textContent =
                error.message;

            showToast(error.message, "error");

        } finally {

            setButtonLoading($("stopStudyButton"), false);
        }
    });

    $("resetTimerBtn").addEventListener("click", () => {

        if (!sessionStart) {

            $("sessionTimer").textContent =
                "25:00";
        }
    });
}


/* ============================================================
   Quizzes (management)
   ============================================================ */

let quizFilter =
    "all";

function renderQuizzes() {

    const container =
        $("quizzesList");

    if (!container) {
        return;
    }

    const quizzes =
        state.quizzes;

    if (quizzes.length === 0) {

        container.innerHTML =
            '<div class="empty-state"><span class="empty-emoji">📝</span>No quizzes yet - create one manually or generate one with AI.</div>';

        return;
    }

    const visible =
        quizzes.filter((quiz) => {

            if (quizFilter === "manual") {
                return !quiz.aiGenerated;
            }

            if (quizFilter === "ai") {
                return quiz.aiGenerated;
            }

            return true;
        });

    if (visible.length === 0) {

        container.innerHTML =
            '<div class="empty-state">No quizzes match this filter.</div>';

        return;
    }

    container.innerHTML =
        visible.map((quiz) => {

            const count =
                state.questionCounts[quiz.id];

            const countText =
                count === null || count === undefined
                    ? ""
                    : `<span class="meta-pill">📋 ${count} question${count === 1 ? "" : "s"}</span>`;

            const letter =
                (quiz.title || "?").trim().charAt(0).toUpperCase();

            return `

                <div class="quiz-row" data-search="${escapeHtml(quiz.title)} ${escapeHtml(quiz.description || "")}">

                    <span class="q-avatar">${escapeHtml(letter)}</span>

                    <div class="q-info">

                        <h3>${escapeHtml(quiz.title)}</h3>

                        <p>${escapeHtml(quiz.description || "No description")}</p>

                    </div>

                    <div class="q-meta">

                        ${countText}

                        ${quiz.aiGenerated
                            ? '<span class="badge badge-ai">✨ AI Generated</span>'
                            : '<span class="badge badge-manual">✍️ Manual</span>'}

                        <button type="button" class="btn btn-primary" data-take="${quiz.id}">Take Quiz ▶</button>

                    </div>

                </div>
            `;
        }).join("");

    container.querySelectorAll("[data-take]")
        .forEach((button) => {

            button.addEventListener("click", () => {

                openQuiz(Number(button.dataset.take));
            });
        });
}


function initQuizzes() {

    // Filter chips
    document.querySelectorAll(".filter-chips .chip")
        .forEach((chip) => {

            chip.addEventListener("click", () => {

                document.querySelectorAll(".filter-chips .chip")
                    .forEach((c) => c.classList.remove("active"));

                chip.classList.add("active");

                quizFilter =
                    chip.dataset.filter;

                renderQuizzes();
            });
        });

    // Number stepper for AI questions
    document.querySelectorAll(".stepper [data-step]")
        .forEach((button) => {

            button.addEventListener("click", () => {

                const input =
                    $("aiQuestionCount");

                const next =
                    Number(input.value) + Number(button.dataset.step);

                const clamped =
                    Math.min(20, Math.max(1, next));

                input.value =
                    clamped;
            });
        });

    // Manual quiz creation (unchanged API behaviour)
    $("quizForm").addEventListener("submit", async (event) => {

        event.preventDefault();

        const title =
            $("quizTitle").value.trim();

        const description =
            $("quizDescription").value.trim();

        const submitButton =
            $("quizForm").querySelector('button[type="submit"]');

        $("quizMessage").textContent =
            "Creating quiz...";

        setButtonLoading(submitButton, true);

        try {

            await apiRequest(
                "/api/quizzes",
                { method: "POST", body: { title, description } }
            );

            $("quizForm").reset();

            $("quizMessage").textContent =
                "Quiz created successfully.";

            showToast("Quiz created.", "success");

            await reloadDataSilently();

            renderQuizzes();

        } catch (error) {

            $("quizMessage").textContent =
                error.message;

            showToast(error.message, "error");

        } finally {

            setButtonLoading(submitButton, false);
        }
    });

    // AI quiz generation (unchanged API behaviour)
    $("aiQuizForm").addEventListener("submit", async (event) => {

        event.preventDefault();

        const topic =
            $("aiTopic").value.trim();

        const numberOfQuestions =
            Number($("aiQuestionCount").value);

        const difficulty =
            $("aiDifficulty").value;

        const submitButton =
            $("aiQuizForm").querySelector('button[type="submit"]');

        $("aiQuizMessage").textContent =
            "Generating AI quiz... 🤖";

        setButtonLoading(submitButton, true);

        try {

            const quiz =
                await apiRequest(
                    "/api/ai-quizzes/generate",
                    {
                        method: "POST",
                        body: { topic, numberOfQuestions, difficulty }
                    }
                );

            $("aiQuizForm").reset();

            $("aiQuestionCount").value =
                5;

            $("aiDifficulty").value =
                "medium";

            $("aiQuizMessage").textContent =
                `AI quiz "${quiz.title}" created successfully.`;

            showToast(`AI quiz "${quiz.title}" created.`, "success");

            await reloadDataSilently();

            openQuiz(quiz.quizId);

        } catch (error) {

            $("aiQuizMessage").textContent =
                error.message;

            showToast(error.message, "error");

        } finally {

            setButtonLoading(submitButton, false);
        }
    });
}


/* ============================================================
   Quiz taking (one question at a time + palette)
   ============================================================ */

async function openQuiz(quizId) {

    try {

        const [quiz, questions] =
            await Promise.all([

                apiRequest(`/api/quizzes/${quizId}`),

                apiRequest(`/api/quizzes/${quizId}/questions`)
            ]);

        quizSession = {

            quiz: quiz,

            questions: Array.isArray(questions) ? questions : [],

            idx: 0,

            answers: {}
        };

        $("quizResultMessage").textContent = "";

        window.location.hash =
            "#quiz";

        showView("quiz");

    } catch (error) {

        showToast(error.message, "error");
    }
}


function renderQuizQuestion() {

    if (!quizSession) {
        return;
    }

    const { quiz, questions, idx } =
        quizSession;

    $("quizTakeTitle").textContent =
        quiz.title;

    $("quizTakeSub").textContent =
        quiz.description || "";

    const question =
        questions[idx];

    $("quizProgressText").textContent =
        `${idx + 1} / ${questions.length}`;

    const answeredCount =
        Object.keys(quizSession.answers).length;

    const pct =
        questions.length === 0
            ? 0
            : Math.round((answeredCount / questions.length) * 100);

    $("quizProgressBar").style.width =
        `${pct}%`;

    $("quizProgressLabel").textContent =
        `${pct}%`;

    if (!question) {

        $("questionText").textContent =
            "This quiz has no questions yet.";

        $("optionsList").innerHTML =
            '<div class="empty-state">Add questions to this quiz before taking it.</div>';

        $("resetAnswerBtn").disabled =
            true;

        $("prevQuestionBtn").disabled =
            true;

        $("nextQuestionBtn").disabled =
            true;

        $("submitQuizButton").disabled =
            true;

        renderPalette();

        return;
    }

    $("resetAnswerBtn").disabled =
        false;

    $("prevQuestionBtn").disabled =
        idx === 0;

    $("submitQuizButton").disabled =
        false;

    $("questionText").textContent =
        `${idx + 1}. ${question.questionText}`;

    const selected =
        quizSession.answers[question.id];

    const options = [

        ["A", question.optionA],
        ["B", question.optionB],
        ["C", question.optionC],
        ["D", question.optionD]
    ];

    $("optionsList").innerHTML =
        options.map(([letter, text]) => `

            <label class="option-label ${selected === letter ? "selected" : ""}">

                <input type="radio" name="option" value="${letter}"

                    ${selected === letter ? "checked" : ""}>

                <span class="opt-letter">${letter}.</span>

                <span>${escapeHtml(text)}</span>

            </label>
        `).join("");

    $("optionsList").querySelectorAll("input[type='radio']")
        .forEach((radio) => {

            radio.addEventListener("change", () => {

                quizSession.answers[question.id] =
                    radio.value;

                renderQuizQuestion();
            });
        });

    // On the last question the Next button becomes Submit
    const isLast =
        idx === questions.length - 1;

    $("nextQuestionBtn").textContent =
        isLast ? "Submit Quiz 🚩" : "Next Question →";

    $("nextQuestionBtn").classList.toggle("btn-primary", true);

    renderPalette();
}


function renderPalette() {

    const container =
        $("paletteButtons");

    if (!container || !quizSession) {
        return;
    }

    container.innerHTML =
        quizSession.questions.map((question, index) => {

            const isCurrent =
                index === quizSession.idx;

            const isAnswered =
                quizSession.answers[question.id] !== undefined;

            const classes = [

                "palette-btn",

                isCurrent ? "current" : (isAnswered ? "answered" : "")
            ].join(" ");

            return `

                <button type="button" class="${classes}" data-jump="${index}"

                    aria-label="Go to question ${index + 1}">

                    ${index + 1}

                </button>
            `;
        }).join("");

    container.querySelectorAll("[data-jump]")
        .forEach((button) => {

            button.addEventListener("click", () => {

                quizSession.idx =
                    Number(button.dataset.jump);

                renderQuizQuestion();
            });
        });
}


function submitQuizSession() {

    if (!quizSession) {
        return;
    }

    const { quiz, questions } =
        quizSession;

    const unanswered =
        questions.filter(
            (question) => quizSession.answers[question.id] === undefined
        );

    if (unanswered.length > 0) {

        $("quizResultMessage").textContent =
            `Please answer every question (${unanswered.length} left).`;

        showToast(
            `Please answer every question (${unanswered.length} left).`,
            "error"
        );

        return;
    }

    const answers =
        questions.map((question) => ({

            questionId: question.id,

            selectedAnswer: quizSession.answers[question.id]
        }));

    const submitButton =
        $("submitQuizButton");

    $("quizResultMessage").textContent =
        "Submitting quiz...";

    setButtonLoading(submitButton, true);

    apiRequest(
        "/api/quiz-submissions",
        { method: "POST", body: { quizId: quiz.id, answers } }
    )

        .then(async (result) => {

            state.lastResult =
                result;

            $("quizResultMessage").textContent = "";

            showToast(
                `You scored ${result.score}/${result.totalQuestions} (${result.percentage}%)`,
                "success"
            );

            quizSession =
                null;

            await reloadDataSilently();

            window.location.hash =
                "#results";

            showView("results");

        })

        .catch((error) => {

            $("quizResultMessage").textContent =
                error.message;

            showToast(error.message, "error");

        })

        .finally(() => {

            setButtonLoading(submitButton, false);
        });
}


function initQuizTaking() {

    $("backToQuizzes").addEventListener("click", () => {

        quizSession =
            null;

        window.location.hash =
            "#quizzes";

        showView("quizzes");
    });

    $("resetAnswerBtn").addEventListener("click", () => {

        if (!quizSession) {
            return;
        }

        const question =
            quizSession.questions[quizSession.idx];

        if (question) {

            delete quizSession.answers[question.id];

            renderQuizQuestion();
        }
    });

    $("prevQuestionBtn").addEventListener("click", () => {

        if (quizSession && quizSession.idx > 0) {

            quizSession.idx -= 1;

            renderQuizQuestion();
        }
    });

    $("nextQuestionBtn").addEventListener("click", () => {

        if (!quizSession) {
            return;
        }

        if (quizSession.idx < quizSession.questions.length - 1) {

            quizSession.idx += 1;

            renderQuizQuestion();

        } else {

            submitQuizSession();
        }
    });

    $("submitQuizButton").addEventListener("click", submitQuizSession);
}


/* ============================================================
   Results
   ============================================================ */

function refreshResults() {

    const banner =
        $("resultsBanner");

    // The latest attempt: the one just submitted, or the most recent one
    const latest =
        state.lastResult

            ? {

                ...state.lastResult,

                quiz: quizById(state.lastResult.quizId)
            }

            : (state.attempts.length > 0

                ? {

                    ...state.attempts[0],

                    quiz: quizById(state.attempts[0].quizId)
                }

                : null);

    if (!latest) {

        banner.classList.add("hidden");

        $("scorePercent").textContent =
            "—";

        $("resultQuizTitle").textContent =
            "No attempts yet";

        $("resultQuizBadge").textContent =
            "—";

        $("resultQuizDesc").textContent =
            "Take a quiz to see your results here.";

        $("resultCompletedOn").textContent =
            "";

        $("resultCorrect").textContent =
            "0";

        $("resultIncorrect").textContent =
            "0";

        $("resultTotal").textContent =
            "0";

        setScoreRing(0);

        renderScoreTrend();

        renderAttempts();

        return;
    }

    banner.classList.remove("hidden");

    const quiz =
        latest.quiz;

    $("resultQuizTitle").textContent =
        quiz ? quiz.title : `Quiz #${latest.quizId}`;

    const badge =
        $("resultQuizBadge");

    badge.textContent =
        quiz && quiz.aiGenerated ? "✨ AI Generated" : "✍️ Manual";

    badge.className =
        quiz && quiz.aiGenerated ? "badge badge-ai" : "badge badge-manual";

    $("resultQuizDesc").textContent =
        quiz && quiz.description ? quiz.description : "";

    $("resultCompletedOn").textContent =
        `Completed on ${formatDateTime(latest.completedAt)}`;

    $("resultCorrect").textContent =
        latest.score;

    $("resultIncorrect").textContent =
        Math.max(0, latest.totalQuestions - latest.score);

    $("resultTotal").textContent =
        latest.totalQuestions;

    setScoreRing(latest.percentage || 0);

    renderScoreTrend();

    renderAttempts();
}


function setScoreRing(percentage) {

    const circumference =
        439.8;

    const ring =
        $("scoreRingFg");

    ring.style.strokeDashoffset =
        circumference * (1 - percentage / 100);

    ring.style.stroke =
        percentage >= 50
            ? "var(--success)"
            : percentage >= 30
                ? "var(--warning)"
                : "var(--danger)";

    $("scorePercent").textContent =
        `${Math.round(percentage)}%`;
}


function renderScoreTrend() {

    const container =
        $("scoreTrendList");

    if (!container) {
        return;
    }

    if (state.attempts.length === 0) {

        container.innerHTML =
            '<div class="empty-state">No attempts yet.</div>';

        return;
    }

    const recent =
        state.attempts.slice(0, 6).reverse();

    container.innerHTML =
        recent.map((attempt, index) => {

            const quiz =
                quizById(attempt.quizId);

            const label =
                quiz ? quiz.title : `Quiz #${attempt.quizId}`;

            const pct =
                Math.round(attempt.percentage || 0);

            return `

                <div class="trend-item">

                    <span class="t-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>

                    <div class="progress-track">

                        <div class="progress-fill" style="width:${pct}%;"></div>

                    </div>

                    <span class="t-value">${pct}%</span>

                </div>
            `;
        }).join("");
}


function renderAttempts() {

    const container =
        $("quizAttemptsList");

    if (!container) {
        return;
    }

    if (state.attempts.length === 0) {

        container.innerHTML =
            '<div class="empty-state"><span class="empty-emoji">📝</span>No quiz attempts yet - open a quiz and test yourself.</div>';

        return;
    }

    container.innerHTML = `

        <table class="data-table">

            <thead>

                <tr>
                    <th>Quiz</th>
                    <th>Score</th>
                    <th>Percentage</th>
                    <th>Completed</th>
                </tr>

            </thead>

            <tbody>

                ${state.attempts.map((attempt) => {

                    const quiz =
                        quizById(attempt.quizId);

                    const pct =
                        Math.round(attempt.percentage || 0);

                    return `

                        <tr>

                            <td style="font-weight:600;">${escapeHtml(quiz ? quiz.title : `Quiz #${attempt.quizId}`)}</td>

                            <td>${attempt.score} / ${attempt.totalQuestions}</td>

                            <td>

                                <span class="badge ${pct >= 50 ? "badge-complete" : "badge-incorrect"}">${pct}%</span>

                            </td>

                            <td>${escapeHtml(formatDateTime(attempt.completedAt))}</td>

                        </tr>
                    `;
                }).join("")}

            </tbody>

        </table>
    `;
}


function initResults() {

    $("takeAnotherQuiz").addEventListener("click", () => {

        window.location.hash =
            "#quizzes";

        showView("quizzes");
    });
}


/* ============================================================
   Profile
   ============================================================ */

function refreshProfile() {

    if (!state.profile) {
        return;
    }

    const name =
        state.profile.name || "Student";

    $("profileName").textContent =
        name;

    $("profileEmail").textContent =
        state.profile.email || "";

    $("profileAvatar").textContent =
        name.trim().charAt(0).toUpperCase() || "S";

    $("pfStudyTime").textContent =
        formatDuration(state.stats?.totalStudySeconds);

    $("pfSessions").textContent =
        state.stats?.totalSessions ?? 0;

    const avg =
        averageScore();

    $("pfAvgScore").textContent =
        avg === null ? "—" : `${avg}%`;

    $("pfQuizzesCompleted").textContent =
        state.attempts.length;

    renderActivityList($("profileActivityList"));
}


function initProfile() {

    $("profileStartStudying").addEventListener("click", () => {

        window.location.hash =
            "#study";

        showView("study");
    });

    $("profileActivityAll").addEventListener("click", () => {

        window.location.hash =
            "#results";

        showView("results");
    });
}


/* ============================================================
   Settings
   ============================================================ */

function renderSettings() {

    if (state.profile) {

        $("settingsName").value =
            state.profile.name || "";

        $("settingsEmail").value =
            state.profile.email || "";
    }

    markThemeSelection();
}


function markThemeSelection() {

    const pref =
        getThemePreference();

    document.querySelectorAll("#themeOptions .theme-option")
        .forEach((option) => {

            option.classList.toggle(
                "selected",
                option.dataset.themeChoice === pref
            );
        });
}


function initSettings() {

    document.querySelectorAll("#themeOptions .theme-option")
        .forEach((option) => {

            option.addEventListener("click", () => {

                const pref =
                    option.dataset.themeChoice;

                localStorage.setItem("theme", pref);

                applyTheme(pref);

                markThemeSelection();
            });
        });

    $("saveSettingsBtn").addEventListener("click", () => {

        showToast("Settings saved. Appearance updated.", "success");
    });
}


/* ============================================================
   Dashboard quick actions + misc wiring
   ============================================================ */

function initDashboard() {

    $("dashboardStartStudying").addEventListener("click", () => {

        window.location.hash =
            "#study";

        showView("study");
    });

    $("quickAddSubject").addEventListener("click", () => {

        openSubjectModal();
    });

    $("quickStartStudy").addEventListener("click", () => {

        window.location.hash =
            "#study";

        showView("study");
    });

    $("quickTakeQuiz").addEventListener("click", () => {

        window.location.hash =
            "#quizzes";

        showView("quizzes");
    });

    $("quickAiQuiz").addEventListener("click", () => {

        window.location.hash =
            "#quizzes";

        showView("quizzes");

        setTimeout(() => {

            $("aiTopic")?.focus();

        }, 250);
    });

    $("nextSessionStart").addEventListener("click", () => {

        window.location.hash =
            "#study";

        showView("study");
    });

    $("recentActivityAll").addEventListener("click", () => {

        window.location.hash =
            "#results";

        showView("results");
    });

    $("addSubjectBtn").addEventListener("click", () => {

        openSubjectModal();
    });
}


/* ============================================================
   Init
   ============================================================ */

function init() {

    initTheme();

    initAuth();

    initShell();

    initDashboard();

    initStudy();

    initQuizzes();

    initQuizTaking();

    initResults();

    initProfile();

    initSettings();

    window.addEventListener("hashchange", routeFromHash);

    // Initial route
    if (localStorage.getItem("token")) {

        loadCoreData()

            .then(() => {

                enterApp();

                detectRunningSession();

                renderTimerState();

            })

            .catch((error) => {

                if (error.status === 401) {

                    forceLogout();

                } else {

                    showToast(error.message, "error");

                    enterApp();
                }
            });

    } else {

        showLoginPage();
    }
}


document.addEventListener("DOMContentLoaded", init);

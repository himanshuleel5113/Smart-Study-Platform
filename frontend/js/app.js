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
        includeAuth = true,
        timeoutMs = 45000
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const fetchOptions = {
        method: method,
        headers: headers,
        signal: controller.signal
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

        clearTimeout(timeoutId);

        if (networkError.name === 'AbortError') {
            const timeoutError = new Error("Request timed out. Please try again.");
            timeoutError.status = 504;
            throw timeoutError;
        }

        const error =
            new Error(
                "Cannot reach the server. Please check that the services are running and try again."
            );

        error.status = 0;

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }

    // A 204 response has no body, even when the service labels it JSON.
    if (response.status === 204) return null;

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

        if (response.status === 401 && includeAuth) {
            forceLogout();
            const sessionError = new Error("Your session has expired. Please log in again.");
            sessionError.status = 401;
            throw sessionError;
        }

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
let quizSubmitting = false;
let selectedResultId = null;
let lastAnswerReview = null;
let answerReviewRequest = 0;


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
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (getThemePreference() === "system") applyTheme("system");
    });
}


/* ============================================================
   Modal helper
   ============================================================ */

function trapFocus(event, container) {
    if (event.key !== "Tab") return;
    const elements = [...container.querySelectorAll(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    )].filter((element) => element.getClientRects().length);
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
    }
}

let closeActiveModal = null;

function showModal({ title, bodyHTML, okText = "Save", okClass = "btn-primary", onOk }) {
    closeActiveModal?.();
    const root = $("modalRoot");
    if (!root) return { close: () => {} };
    const previousFocus = document.activeElement;
    root.innerHTML = `
        <div class="modal-backdrop" data-modal-cancel></div>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <h3 id="modalTitle">${escapeHtml(title)}</h3>
            <div class="modal-body">${bodyHTML}</div>
            <div class="modal-actions">
                <button type="button" class="btn btn-outline" data-modal-cancel>Cancel</button>
                <button type="button" class="btn ${okClass}" data-modal-ok>${escapeHtml(okText)}</button>
            </div>
        </div>`;
    root.classList.remove("hidden");
    document.body.classList.add("modal-open");
    $("appShell").inert = true;
    $("authShell").inert = true;
    const okButton = root.querySelector("[data-modal-ok]");
    let saving = false;
    const close = () => {
        if (saving) return;
        document.removeEventListener("keydown", onModalKey);
        root.classList.add("hidden");
        root.innerHTML = "";
        document.body.classList.remove("modal-open");
        $("appShell").inert = false;
        $("authShell").inert = false;
        closeActiveModal = null;
        if (previousFocus?.isConnected) previousFocus.focus();
    };
    closeActiveModal = close;
    root.querySelectorAll("[data-modal-cancel]").forEach((el) => el.addEventListener("click", close));
    okButton.addEventListener("click", async () => {
        if (saving) return;
        if (!onOk) { close(); return; }
        const invalid = root.querySelector(":invalid");
        if (invalid) { invalid.reportValidity(); return; }
        saving = true;
        setButtonLoading(okButton, true);
        try {
            await onOk();
            saving = false;
            close();
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            saving = false;
            setButtonLoading(okButton, false);
        }
    });
    function onModalKey(event) {
        if (event.key === "Escape") close();
        else trapFocus(event, root);
    }
    document.addEventListener("keydown", onModalKey);
    root.querySelector("input:not(:disabled), textarea:not(:disabled), button")?.focus();
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

    document.querySelectorAll(".sidebar-item").forEach((item) => {
        const active = item.dataset.view === (name === "quiz" ? "quizzes" : name);
        item.classList.toggle("active", active);
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
    });
    const titles = { dashboard: "Dashboard", subjects: "Subjects", study: "Study Sessions", quizzes: "Quizzes", quiz: "Take Quiz", results: "Results", profile: "Profile", settings: "Settings" };
    document.title = `${titles[name]} - Smart Study Platform`;

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
        const labels = { subjects: "Search subjects...", quizzes: "Search quizzes...", study: "Search study history..." };
        search.disabled = !labels[name];
        search.placeholder = labels[name] || "Search subjects, quizzes...";
        search.title = labels[name] ? "Filter the current page" : "Global search coming soon";
        search.setAttribute("aria-label", labels[name] || "Global search coming soon");
        $("searchStatus").classList.add("hidden");
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

    document.title = `${isRegister ? "Register" : "Login"} - Smart Study Platform`;

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
    closeSidebar();
    $("userMenu").classList.add("hidden");
    $("userChip").setAttribute("aria-expanded", "false");
    selectedResultId = null;
    lastAnswerReview = null;
    answerReviewRequest++;
    state.lastResult = null;
    $("settingsCurrentPassword").value = "";
    $("settingsNewPassword").value = "";

    localStorage.removeItem("token");

    quizSession = null;

    stopTimerTick();

    sessionStart = null;

    showLoginPage();
}


/* ============================================================
   Core data loading (parallel)
   ============================================================ */

function showDataLoadError(error) {
    $("appShell").classList.toggle("data-unavailable", Boolean(error));
    $("dataLoadError").classList.toggle("hidden", !error);
    $("dataLoadErrorMessage").textContent = error ? error.message : "";
}

async function loadCoreData() {

    const token =
        localStorage.getItem("token");

    if (!token) {

        forceLogout();

        return;
    }

    const [profileRes, statsRes, subjectsRes, historyRes, quizzesRes, attemptsRes] =
        await Promise.allSettled([

            apiRequest("/api/users/profile"),

            apiRequest("/api/study-stats"),

            apiRequest("/api/subjects"),

            apiRequest("/api/study-sessions/history"),

            apiRequest("/api/quizzes"),

            apiRequest("/api/quiz-attempts")
        ]);

    if (profileRes.status === "rejected") {
        if (profileRes.reason && profileRes.reason.status === 401) {
            forceLogout();
            return;
        }
        throw profileRes.reason;
    }

    state.profile = profileRes.value;

    state.stats = statsRes.status === "fulfilled"
        ? statsRes.value
        : { totalStudySeconds: 0, totalSessions: 0, averageSessionSeconds: 0 };

    state.subjects = (subjectsRes.status === "fulfilled" && Array.isArray(subjectsRes.value))
        ? subjectsRes.value
        : [];

    state.history = (historyRes.status === "fulfilled" && Array.isArray(historyRes.value))
        ? historyRes.value
        : [];

    state.quizzes = (quizzesRes.status === "fulfilled" && Array.isArray(quizzesRes.value))
        ? quizzesRes.value
        : [];

    state.attempts = (attemptsRes.status === "fulfilled" && Array.isArray(attemptsRes.value))
        ? attemptsRes.value
        : [];

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
    showDataLoadError(null);

    renderUserChip();
}

async function reloadDataSilently() {

    try {

        await loadCoreData();

    } catch (error) {

        if (error.status === 401) {

            forceLogout();

        } else {

            showDataLoadError(error);
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

function closeSidebar(restoreFocus = false) {
    $("appShell")?.classList.remove("sidebar-open");
    $("sidebarBackdrop")?.classList.add("hidden");
    document.body.classList.remove("sidebar-visible");
    document.querySelector(".main-area").inert = false;
    $("sidebarToggle").setAttribute("aria-expanded", "false");
    $("sidebar").inert = window.matchMedia("(max-width: 899px)").matches;
    if (restoreFocus) $("sidebarToggle").focus();
}

function initShell() {
    $("retryDataButton").addEventListener("click", async () => {
        const button = $("retryDataButton");
        setButtonLoading(button, true);
        await reloadDataSilently();
        setButtonLoading(button, false);
        if (!$("appShell").classList.contains("data-unavailable")) showView(currentView);
    });

    // Sidebar navigation
    document.querySelectorAll(".sidebar-item")
        .forEach((item) => {

            item.addEventListener("click", () => {

                window.location.hash =
                    `#${item.dataset.view}`;

                showView(item.dataset.view);
            });
        });

    // Off-canvas navigation keeps keyboard focus inside the open sidebar.
    $("sidebarToggle").addEventListener("click", () => {
        $("appShell").classList.add("sidebar-open");
        $("sidebarBackdrop").classList.remove("hidden");
        $("sidebarToggle").setAttribute("aria-expanded", "true");
        document.body.classList.add("sidebar-visible");
        document.querySelector(".main-area").inert = true;
        $("sidebar").inert = false;
        $("sidebar").querySelector(".active, button").focus();
    });
    $("sidebarBackdrop").addEventListener("click", () => closeSidebar(true));
    window.matchMedia("(max-width: 899px)").addEventListener("change", () => closeSidebar());
    closeSidebar();
    document.addEventListener("keydown", (event) => {
        if ($("appShell").classList.contains("sidebar-open")) {
            if (event.key === "Escape") closeSidebar(true);
            else trapFocus(event, $("sidebar"));
        }
        if (event.key === "Escape" && !$("userMenu").classList.contains("hidden")) {
            $("userMenu").classList.add("hidden");
            $("userChip").setAttribute("aria-expanded", "false");
            $("userChip").focus();
        }
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
        $("userChip").setAttribute("aria-expanded", "false");
        }
    });

    userMenu.querySelectorAll("[data-view]")
        .forEach((item) => {

            item.addEventListener("click", () => {

                userMenu.classList.add("hidden");
        $("userChip").setAttribute("aria-expanded", "false");

                window.location.hash =
                    `#${item.dataset.view}`;

                showView(item.dataset.view);
            });
        });

    $("menuLogoutButton").addEventListener("click", () => {

        userMenu.classList.add("hidden");
        $("userChip").setAttribute("aria-expanded", "false");

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

    const selectors = { subjects: "#subjectsGrid .subject-card", quizzes: "#quizzesList .quiz-row", study: "#studyHistoryList tr[data-search]" };
    const selector = selectors[currentView];
    if (selector) {
        const matches = [...document.querySelectorAll(selector)].filter((item) =>
            (item.dataset.search || "").toLowerCase().includes(query)
        ).length;
        $("searchStatus").textContent = matches ? `${matches} matching result${matches === 1 ? "" : "s"}` : "No matches. Try a different search.";
        $("searchStatus").classList.toggle("hidden", !query);
    }

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
                button.setAttribute("aria-pressed", String(input.type === "text"));
                button.setAttribute("aria-label", input.type === "text" ? "Hide password" : "Show password");
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


function openActivityHistory() {
    const content = document.createElement("div");
    content.className = "activity-list";
    renderActivityList(content, Infinity);
    showModal({ title: "Activity History", bodyHTML: content.outerHTML, okText: "Close" });
}

function renderActivityList(container, limit = 5) {

    if (!container) {
        return;
    }

    const items =
        buildActivityItems(limit);

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

function populateSubjectSelect() {

    const select =
        $("studySubjectId");

    if (!select) {
        return;
    }

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


function renderSubjects() {

    const grid =
        $("subjectsGrid");

    // Keep the study-session dropdown in sync with the subject list
    populateSubjectSelect();

    if (!grid) {
        return;
    }

    if (state.subjects.length === 0) {

        grid.innerHTML =
            '<div class="empty-state" style="grid-column:1/-1;"><span class="empty-emoji">📚</span>No subjects yet - click "Add Subject" to create your first one.</div>';

        return;
    }

    // Bar = share of total recorded study time, not course completion.
    const totalSeconds =
        Math.max(
            1,
            state.subjects.reduce((sum, subject) => sum + subjectSeconds(subject.id), 0)
        );

    grid.innerHTML =
        state.subjects.map((subject, index) => {

            const sessions =
                subjectSessions(subject.id).length;

            const seconds =
                subjectSeconds(subject.id);

            const pct =
                Math.round((seconds / totalSeconds) * 100);

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

                    <p class="subject-time-label">Share of recorded study time</p>
                    <div class="subject-progress" role="meter" aria-label="Share of recorded study time" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" title="${pct}% of your recorded study time">

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
        state.history.find((session) => !session.endedAt);

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

    const startButton = $("studyStartForm").querySelector('button[type="submit"]');
    const subjectSelect = $("studySubjectId");
    const running = Boolean(sessionStart);
    startButton.disabled = running;
    startButton.textContent = running ? "Session in progress" : "\u25b6 Start Session";
    subjectSelect.disabled = running;
    if (running) {
        const active = state.history.find((session) => !session.endedAt);
        if (active) subjectSelect.value = active.subjectId;
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
            "00:00";

        pill.textContent =
            "Elapsed study time";

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

    populateSubjectSelect();

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

    document.querySelectorAll("#view-study .quick-link[data-view]").forEach((button) => {
        button.addEventListener("click", () => {
            if (button.dataset.view === "subjects") openSubjectModal();
            else {
                window.location.hash = `#${button.dataset.view}`;
                showView(button.dataset.view);
            }
        });
    });

    $("studyStartForm").addEventListener("submit", async (event) => {

        event.preventDefault();
        if (sessionStart || $("studyStartForm").querySelector("button[type=submit]").disabled) return;

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
        $("startSessionBtn").disabled = true;

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
            $("startSessionBtn").disabled = false;
            renderTimerState();
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
                "00:00";
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

            if (quizFilter === "completed") {
                return Array.isArray(state.attempts) && state.attempts.some((a) => a.quizId === quiz.id);
            }

            return true;
        });

    if (visible.length === 0) {

        container.innerHTML =
            `<div class="empty-state">${quizFilter === "completed" ? "No completed quizzes yet - attempt a quiz to see it here." : "No quizzes match this filter."}</div>`;

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

            const userAttempts = Array.isArray(state.attempts)
                ? state.attempts.filter((a) => a.quizId === quiz.id)
                : [];

            const latestAttempt = userAttempts.length > 0
                ? [...userAttempts].sort((a, b) => (new Date(b.completedAt) - new Date(a.completedAt)) || (b.attemptId - a.attemptId))[0]
                : null;

            const isCompleted = !!latestAttempt;
            const completedScore = isCompleted ? Math.round(latestAttempt.percentage || 0) : null;

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

                        ${isCompleted
                            ? `<span class="badge badge-complete" title="Completed score: ${completedScore}%">✓ Completed (${completedScore}%)</span>`
                            : ""}

                        ${!quiz.aiGenerated ? `<button type="button" class="btn btn-outline" data-add-question="${quiz.id}">+ Add Questions</button>` : ""}

                        ${isCompleted
                            ? `<button type="button" class="btn btn-primary" data-view-result="${latestAttempt.attemptId}">View Result 📊</button>
                               <button type="button" class="btn btn-outline" data-take="${quiz.id}" ${count === 0 ? 'disabled title="Add questions before retaking this quiz"' : ""}>Retake ↻</button>`
                            : `<button type="button" class="btn btn-primary" data-take="${quiz.id}" ${count === 0 ? 'disabled title="Add questions before taking this quiz"' : ""}>Take Quiz ▶</button>`}

                    </div>

                </div>
            `;
        }).join("");

    container.querySelectorAll("[data-add-question]").forEach((button) => {
        button.addEventListener("click", () => openQuestionEditor(Number(button.dataset.addQuestion)));
    });
    applySearchFilter();

    container.querySelectorAll("[data-view-result]").forEach((button) => {
        button.addEventListener("click", () => {
            selectedResultId = Number(button.dataset.viewResult);
            window.location.hash = "#results";
            showView("results");
        });
    });

    container.querySelectorAll("[data-take]")
        .forEach((button) => {

            button.addEventListener("click", () => {

                openQuiz(Number(button.dataset.take));
            });
        });
}


function openQuestionEditor(quizId) {
    const quiz = quizById(quizId);
    if (!quiz || quiz.aiGenerated) return;
    showModal({
        title: `Add a question to ${quiz.title}`,
        bodyHTML: `
            <p class="card-sub">Add one question at a time. Choose the correct answer before saving.</p>
            <div><label for="editorQuestion">Question</label>
                <textarea id="editorQuestion" class="input" rows="2" required></textarea></div>
            <div class="form-row">
                ${["A", "B", "C", "D"].map((letter) => `
                    <div><label for="editorOption${letter}">Option ${letter}</label>
                    <input id="editorOption${letter}" class="input" required></div>
                `).join("")}
            </div>
            <div><label for="editorCorrect">Correct Answer</label>
                <select id="editorCorrect" class="input" required>
                    <option value="">Choose the correct option</option>
                    ${["A", "B", "C", "D"].map((letter) => `<option value="${letter}">Option ${letter}</option>`).join("")}
                </select></div>`,
        okText: "Save Question",
        onOk: async () => {
            const questionText = $("editorQuestion").value.trim();
            const optionA = $("editorOptionA").value.trim();
            const optionB = $("editorOptionB").value.trim();
            const optionC = $("editorOptionC").value.trim();
            const optionD = $("editorOptionD").value.trim();
            const correctAnswer = $("editorCorrect").value;
            if (![questionText, optionA, optionB, optionC, optionD, correctAnswer].every(Boolean)) {
                throw new Error("Enter a question, all four options, and the correct answer.");
            }
            await apiRequest(`/api/quizzes/${quizId}/questions`, {
                method: "POST", body: { questionText, optionA, optionB, optionC, optionD, correctAnswer }
            });
            await reloadDataSilently();
            renderQuizzes();
            showToast("Question saved. Add another question or take your quiz.", "success");
        }
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
                document.querySelectorAll(".filter-chips .chip").forEach((item) =>
                    item.setAttribute("aria-pressed", String(item === chip))
                );

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
    if (quizSubmitting) return;

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
    if (quizSubmitting) return;

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
        `${questions.length ? idx + 1 : 0} / ${questions.length}`;

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
    $("quizProgressBar").parentElement.setAttribute("role", "progressbar");
    $("quizProgressBar").parentElement.setAttribute("aria-label", "Questions answered");
    $("quizProgressBar").parentElement.setAttribute("aria-valuemin", "0");
    $("quizProgressBar").parentElement.setAttribute("aria-valuemax", "100");
    $("quizProgressBar").parentElement.setAttribute("aria-valuenow", String(pct));

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
    $("nextQuestionBtn").disabled = false;

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
                $("optionsList").querySelector(`input[value="${radio.value}"]`)?.focus();
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

                    aria-label="Question ${index + 1}, ${isAnswered ? "answered" : "not answered"}" ${isCurrent ? 'aria-current="step"' : ""}>

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
    if (quizSubmitting || !quizSession?.questions.length) return;

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
    quizSubmitting = true;
    setButtonLoading($("nextQuestionBtn"), true);
    $("optionsList").inert = true;
    $("paletteButtons").inert = true;
    $("backToQuizzes").disabled = true;

    apiRequest(
        "/api/quiz-submissions",
        { method: "POST", body: { quizId: quiz.id, answers } }
    )

        .then(async (result) => {
            selectedResultId = null;
            lastAnswerReview = null;

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

            quizSubmitting = false;
            setButtonLoading(submitButton, false);
            setButtonLoading($("nextQuestionBtn"), false);
            $("optionsList").inert = false;
            $("paletteButtons").inert = false;
            $("backToQuizzes").disabled = false;
            if (quizSession) renderQuizQuestion();
        });
}


function initQuizTaking() {

    $("backToQuizzes").addEventListener("click", () => {
        if (quizSubmitting) return;

        quizSession =
            null;

        window.location.hash =
            "#quizzes";

        showView("quizzes");
    });

    $("resetAnswerBtn").addEventListener("click", () => {
        if (quizSubmitting) return;

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
        if (quizSubmitting) return;

        if (quizSession && quizSession.idx > 0) {

            quizSession.idx -= 1;

            renderQuizQuestion();
        }
    });

    $("nextQuestionBtn").addEventListener("click", () => {
        if (quizSubmitting) return;

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

async function renderAnswerReview() {
    const container = $("answerReviewList");
    const displayedId = selectedResultId || state.lastResult?.attemptId || state.attempts[0]?.attemptId;
    const requestId = ++answerReviewRequest;
    if (!displayedId) {
        container.innerHTML = '<p class="card-sub">Complete a quiz to review your answers.</p>';
        return;
    }
    if (!lastAnswerReview || lastAnswerReview.attemptId !== displayedId) {
        container.innerHTML = '<p class="card-sub" role="status">Loading saved answers...</p>';
        try {
            const review = await apiRequest(`/api/quiz-attempts/${displayedId}/answers`);
            if (requestId !== answerReviewRequest) return;
            lastAnswerReview = review;
        } catch (error) {
            if (requestId !== answerReviewRequest) return;
            container.innerHTML = `<p class="card-sub" role="alert">${escapeHtml(error.message)}</p>
                <button type="button" class="btn btn-outline" id="retryAnswerReview">Retry answer review</button>`;
            $("retryAnswerReview").addEventListener("click", renderAnswerReview);
            return;
        }
    }
    if (!lastAnswerReview.answers.length) {
        container.innerHTML = '<p class="card-sub">No saved answer details are available for this attempt.</p>';
        return;
    }
    container.innerHTML = '<p class="card-sub">Saved answers and correct-answer feedback for this attempt.</p>' +
        lastAnswerReview.answers.map((question, index) => `
            <article class="answer-review">
                <h3>${index + 1}. ${escapeHtml(question.questionText || "Question no longer available")}</h3>
                <p><span class="badge badge-ai">Your answer</span> ${escapeHtml(question.selectedAnswer)}.
                    ${escapeHtml(question.selectedOptionText || "")}</p>
                ${question.correctAnswer ? `<p><span class="badge ${question.correct ? "badge-complete" : "badge-incorrect"}">${question.correct ? "Correct" : "Incorrect"}</span>
                    Correct answer: ${escapeHtml(question.correctAnswer)}. ${escapeHtml(question.correctOptionText)}</p>` :
                    '<p class="card-sub">This older question was deleted before answer snapshots were available.</p>'}
            </article>
        `).join("");
}

function refreshResults() {
    renderAnswerReview();

    const banner =
        $("resultsBanner");

    // The latest attempt: the one just submitted, or the most recent one
    const selectedAttempt = state.attempts.find((attempt) => attempt.attemptId === selectedResultId);
    const latest = selectedAttempt ? { ...selectedAttempt, quiz: quizById(selectedAttempt.quizId) } :
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
        $("scorePercent").textContent = "—";

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

                            <td><button type="button" class="result-link" data-attempt="${attempt.attemptId}" title="View this result">${escapeHtml(quiz ? quiz.title : `Quiz #${attempt.quizId}`)}</button></td>

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
    container.querySelectorAll("[data-attempt]").forEach((button) => {
        button.addEventListener("click", () => {
            selectedResultId = Number(button.dataset.attempt);
            refreshResults();
            $("resultQuizTitle").focus();
            $("view-results").scrollIntoView({ block: "start", behavior: "instant" });
        });
    });
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

    $("profileActivityAll").addEventListener("click", openActivityHistory);
}


/* ============================================================
   Settings
   ============================================================ */

function clearPasswordInputs() {
    const current = $("settingsCurrentPassword");
    const next = $("settingsNewPassword");
    if (current) current.value = "";
    if (next) next.value = "";
    setTimeout(() => {
        if (current) current.value = "";
        if (next) next.value = "";
    }, 50);
    setTimeout(() => {
        if (current) current.value = "";
        if (next) next.value = "";
    }, 250);
}


const defaultPreferences = {
    studyGoal: "30",
    quizReminderFreq: "daily",
    scoreSummary: "always",
    streakAlert: "enabled"
};

function getPreferences() {
    try {
        const stored = localStorage.getItem("ssp_preferences");
        return stored ? { ...defaultPreferences, ...JSON.parse(stored) } : defaultPreferences;
    } catch {
        return defaultPreferences;
    }
}

function savePreferences(prefs) {
    localStorage.setItem("ssp_preferences", JSON.stringify(prefs));
}


function renderSettings() {

    if (state.profile) {

        $("settingsName").value =
            state.profile.name || "";

        $("settingsEmail").value =
            state.profile.email || "";
    }

    const prefs = getPreferences();
    if ($("settingsStudyGoal")) $("settingsStudyGoal").value = prefs.studyGoal;
    if ($("settingsQuizReminderFreq")) $("settingsQuizReminderFreq").value = prefs.quizReminderFreq;
    if ($("settingsScoreSummary")) $("settingsScoreSummary").value = prefs.scoreSummary;
    if ($("settingsStreakAlert")) $("settingsStreakAlert").value = prefs.streakAlert;

    clearPasswordInputs();
    markThemeSelection();
}


function markThemeSelection() {

    const pref =
        getThemePreference();

    document.querySelectorAll("#themeOptions .theme-option")
        .forEach((option) => {
            option.setAttribute("aria-pressed", String(option.dataset.themeChoice === pref));

            option.classList.toggle(
                "selected",
                option.dataset.themeChoice === pref
            );
        });
}


function initSettings() {

    clearPasswordInputs();

    const saveProfile = $("saveProfileBtn") || document.createElement("button");
    if (!saveProfile.parentElement) {
        saveProfile.id = "saveProfileBtn";
        saveProfile.type = "submit";
        saveProfile.className = "btn btn-primary";
        saveProfile.style.marginTop = "16px";
        saveProfile.textContent = "Save Profile";
        $("settingsName").closest(".card").append(saveProfile);
    }
    saveProfile.addEventListener("click", async (event) => {
        if (event) event.preventDefault();
        const name = $("settingsName").value.trim();
        if (!name || !$("settingsName").reportValidity()) {
            showToast("Enter your name before saving.", "error");
            return;
        }
        setButtonLoading(saveProfile, true);
        try {
            state.profile = await apiRequest("/api/users/profile", { method: "PUT", body: { name } });
            renderUserChip();
            refreshProfile();
            $("settingsName").value = state.profile.name;
            showToast("Profile saved.", "success");
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            setButtonLoading(saveProfile, false);
        }
    });

    const changePassword = $("changePasswordBtn") || document.createElement("button");
    if (!changePassword.parentElement) {
        changePassword.id = "changePasswordBtn";
        changePassword.type = "submit";
        changePassword.className = "btn btn-primary";
        changePassword.style.marginTop = "16px";
        changePassword.textContent = "Change Password";
        $("settingsNewPassword").closest(".card").append(changePassword);
    }
    changePassword.addEventListener("click", async (event) => {
        if (event) event.preventDefault();
        const current = $("settingsCurrentPassword");
        const next = $("settingsNewPassword");
        if (!current.reportValidity() || !next.reportValidity()) return;
        setButtonLoading(changePassword, true);
        try {
            await apiRequest("/api/users/password", { method: "POST", body: {
                currentPassword: current.value, newPassword: next.value
            } });
            current.value = "";
            next.value = "";
            showToast("Password changed. Use your new password next time you sign in.", "success");
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            setButtonLoading(changePassword, false);
        }
    });

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

    const saveSettings = $("saveSettingsBtn");
    if (saveSettings) {
        saveSettings.addEventListener("click", () => {
            localStorage.setItem("theme", getThemePreference());
            showToast("Appearance saved on this device.", "success");
        });
    }

    const savePrefsBtn = $("savePreferencesBtn");
    if (savePrefsBtn) {
        savePrefsBtn.addEventListener("click", () => {
            const prefs = {
                studyGoal: $("settingsStudyGoal")?.value || "30",
                quizReminderFreq: $("settingsQuizReminderFreq")?.value || "daily",
                scoreSummary: $("settingsScoreSummary")?.value || "always",
                streakAlert: $("settingsStreakAlert")?.value || "enabled"
            };
            savePreferences(prefs);
            showToast("Study & notification preferences saved.", "success");
        });
    }

    ["settingsStudyGoal", "settingsQuizReminderFreq", "settingsScoreSummary", "settingsStreakAlert"].forEach((id) => {
        const el = $(id);
        if (el) {
            el.addEventListener("change", () => {
                const prefs = {
                    studyGoal: $("settingsStudyGoal")?.value || "30",
                    quizReminderFreq: $("settingsQuizReminderFreq")?.value || "daily",
                    scoreSummary: $("settingsScoreSummary")?.value || "always",
                    streakAlert: $("settingsStreakAlert")?.value || "enabled"
                };
                savePreferences(prefs);
                showToast("Preference updated.", "success");
            });
        }
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

    $("recentActivityAll").addEventListener("click", openActivityHistory);

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

                    showDataLoadError(error);
                    showToast(error.message, "error");

                    enterApp();
                }
            });

    } else {

        showLoginPage();
    }
}


document.addEventListener("DOMContentLoaded", init);

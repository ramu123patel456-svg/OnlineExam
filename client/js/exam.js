/*
|--------------------------------------------------------------------------
| OnlineExamSystem
| client/js/exam.js
| Part 1/12
|--------------------------------------------------------------------------
| Global configuration, constants, utilities, event bus,
| storage helpers, API wrapper, timer utilities and bootstrap.
|--------------------------------------------------------------------------
*/

"use strict";

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const APP_CONFIG = Object.freeze({
    VERSION: "1.0.0",
    AUTO_SAVE_INTERVAL: 15000,
    QUESTION_PALETTE_PAGE_SIZE: 50,
    WARNING_TIMES: [1800, 900, 300, 60],
    STORAGE_PREFIX: "online_exam_",
    MAX_RETRY: 3,
    RETRY_DELAY: 1200,
    TOAST_DURATION: 3500,
    ANIMATION_DURATION: 250
});

/* -------------------------------------------------------------------------- */
/* DOM Helpers                                                                */
/* -------------------------------------------------------------------------- */

const $ = (selector, scope = document) => scope.querySelector(selector);

const $$ = (selector, scope = document) =>
    [...scope.querySelectorAll(selector)];

const createElement = (tag, classes = [], attributes = {}) => {
    const element = document.createElement(tag);

    if (Array.isArray(classes) && classes.length) {
        element.classList.add(...classes);
    }

    Object.entries(attributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            element.setAttribute(key, value);
        }
    });

    return element;
};

/* -------------------------------------------------------------------------- */
/* Event Bus                                                                  */
/* -------------------------------------------------------------------------- */

class EventBus {
    constructor() {
        this.events = new Map();
    }

    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }

        this.events.get(event).push(callback);
    }

    off(event, callback) {
        if (!this.events.has(event)) {
            return;
        }

        const filtered = this.events
            .get(event)
            .filter(listener => listener !== callback);

        this.events.set(event, filtered);
    }

    emit(event, payload = null) {
        if (!this.events.has(event)) {
            return;
        }

        this.events.get(event).forEach(listener => {
            try {
                listener(payload);
            } catch (error) {
                console.error(error);
            }
        });
    }

    once(event, callback) {
        const wrapper = payload => {
            callback(payload);
            this.off(event, wrapper);
        };

        this.on(event, wrapper);
    }

    clear() {
        this.events.clear();
    }
}

const eventBus = new EventBus();

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

class StorageManager {
    static key(key) {
        return `${APP_CONFIG.STORAGE_PREFIX}${key}`;
    }

    static save(key, value) {
        localStorage.setItem(
            this.key(key),
            JSON.stringify(value)
        );
    }

    static load(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(this.key(key));

            if (!item) {
                return defaultValue;
            }

            return JSON.parse(item);
        } catch {
            return defaultValue;
        }
    }

    static remove(key) {
        localStorage.removeItem(this.key(key));
    }

    static clearExamData() {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(APP_CONFIG.STORAGE_PREFIX)) {
                localStorage.removeItem(key);
            }
        });
    }
}

/* -------------------------------------------------------------------------- */
/* API Service                                                                */
/* -------------------------------------------------------------------------- */

class ApiService {

    static async request(url, options = {}, retry = 0) {

        try {

            const response = await fetch(url, {
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const type = response.headers.get("content-type");

            if (type && type.includes("application/json")) {
                return await response.json();
            }

            return await response.text();

        } catch (error) {

            if (retry < APP_CONFIG.MAX_RETRY) {

                await new Promise(resolve =>
                    setTimeout(resolve, APP_CONFIG.RETRY_DELAY)
                );

                return this.request(url, options, retry + 1);
            }

            throw error;
        }
    }

    static get(url) {
        return this.request(url);
    }

    static post(url, body = {}) {
        return this.request(url, {
            method: "POST",
            body: JSON.stringify(body)
        });
    }

    static put(url, body = {}) {
        return this.request(url, {
            method: "PUT",
            body: JSON.stringify(body)
        });
    }

    static delete(url) {
        return this.request(url, {
            method: "DELETE"
        });
    }
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

class Utils {

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static formatTime(seconds) {

        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        return [
            hrs.toString().padStart(2, "0"),
            mins.toString().padStart(2, "0"),
            secs.toString().padStart(2, "0")
        ].join(":");
    }

    static debounce(callback, delay = 300) {

        let timeout;

        return (...args) => {

            clearTimeout(timeout);

            timeout = setTimeout(() => {
                callback(...args);
            }, delay);
        };
    }

    static throttle(callback, delay = 300) {

        let waiting = false;

        return (...args) => {

            if (waiting) {
                return;
            }

            callback(...args);

            waiting = true;

            setTimeout(() => {
                waiting = false;
            }, delay);
        };
    }

    static deepClone(data) {
        return structuredClone(data);
    }

    static randomId(length = 12) {

        const chars =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        let result = "";

        for (let i = 0; i < length; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }

        return result;
    }

    static isObject(value) {
        return (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        );
    }

    static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
}

/* -------------------------------------------------------------------------- */
/* Timer                                                                       */
/* -------------------------------------------------------------------------- */

class CountdownTimer {

    constructor(durationSeconds = 0) {

        this.duration = durationSeconds;
        this.remaining = durationSeconds;

        this.interval = null;
        this.running = false;
    }

    start(onTick, onFinish) {

        if (this.running) {
            return;
        }

        this.running = true;

        this.interval = setInterval(() => {

            this.remaining--;

            if (typeof onTick === "function") {
                onTick(this.remaining);
            }

            if (this.remaining <= 0) {

                this.stop();

                if (typeof onFinish === "function") {
                    onFinish();
                }
            }

        }, 1000);
    }

    pause() {

        if (!this.running) {
            return;
        }

        clearInterval(this.interval);
        this.running = false;
    }

    resume(onTick, onFinish) {

        if (this.running) {
            return;
        }

        this.start(onTick, onFinish);
    }

    stop() {

        clearInterval(this.interval);

        this.running = false;
    }

    reset(seconds = this.duration) {

        this.stop();

        this.duration = seconds;
        this.remaining = seconds;
    }

    getRemaining() {
        return this.remaining;
    }

    isRunning() {
        return this.running;
    }
}

// ===== END OF PART 1 =====

/* -------------------------------------------------------------------------- */
/* Toast Manager                                                              */
/* -------------------------------------------------------------------------- */

class ToastManager {
    constructor(containerSelector = "#toastContainer") {
        this.container =
            $(containerSelector) ||
            this.createContainer(containerSelector.replace("#", ""));
    }

    createContainer(id) {
        const container = createElement("div", ["toast-container"], {
            id
        });

        document.body.appendChild(container);

        return container;
    }

    show(message, type = "info", duration = APP_CONFIG.TOAST_DURATION) {
        const toast = createElement("div", ["toast", `toast-${type}`]);

        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-message">${message}</span>
            </div>
        `;

        this.container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add("show");
        });

        setTimeout(() => {
            toast.classList.remove("show");

            setTimeout(() => {
                toast.remove();
            }, APP_CONFIG.ANIMATION_DURATION);
        }, duration);
    }

    success(message) {
        this.show(message, "success");
    }

    error(message) {
        this.show(message, "error");
    }

    warning(message) {
        this.show(message, "warning");
    }

    info(message) {
        this.show(message, "info");
    }

    clear() {
        this.container.innerHTML = "";
    }
}

const toast = new ToastManager();

/* -------------------------------------------------------------------------- */
/* Loading Overlay                                                            */
/* -------------------------------------------------------------------------- */

class LoadingOverlay {
    constructor(selector = "#loadingOverlay") {
        this.overlay = $(selector);

        if (!this.overlay) {
            this.overlay = createElement("div", ["loading-overlay"], {
                id: selector.replace("#", "")
            });

            this.overlay.innerHTML = `
                <div class="loading-spinner"></div>
                <p class="loading-text">Loading...</p>
            `;

            document.body.appendChild(this.overlay);
        }
    }

    show(message = "Loading...") {
        const text = $(".loading-text", this.overlay);

        if (text) {
            text.textContent = message;
        }

        this.overlay.classList.add("active");
    }

    hide() {
        this.overlay.classList.remove("active");
    }

    setMessage(message) {
        const text = $(".loading-text", this.overlay);

        if (text) {
            text.textContent = message;
        }
    }

    isVisible() {
        return this.overlay.classList.contains("active");
    }
}

const loadingOverlay = new LoadingOverlay();

/* -------------------------------------------------------------------------- */
/* Modal Manager                                                              */
/* -------------------------------------------------------------------------- */

class ModalManager {
    constructor() {
        this.activeModal = null;

        document.addEventListener("click", event => {
            const closeButton = event.target.closest("[data-modal-close]");

            if (closeButton) {
                this.close();
            }

            if (
                this.activeModal &&
                event.target === this.activeModal &&
                this.activeModal.dataset.backdrop === "true"
            ) {
                this.close();
            }
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && this.activeModal) {
                this.close();
            }
        });
    }

    open(selector) {
        const modal =
            typeof selector === "string"
                ? $(selector)
                : selector;

        if (!modal) {
            return;
        }

        if (this.activeModal && this.activeModal !== modal) {
            this.close();
        }

        this.activeModal = modal;

        modal.classList.add("active");

        document.body.classList.add("modal-open");

        eventBus.emit("modal:open", modal);
    }

    close() {
        if (!this.activeModal) {
            return;
        }

        this.activeModal.classList.remove("active");

        eventBus.emit("modal:close", this.activeModal);

        this.activeModal = null;

        document.body.classList.remove("modal-open");
    }

    toggle(selector) {
        const modal =
            typeof selector === "string"
                ? $(selector)
                : selector;

        if (!modal) {
            return;
        }

        if (
            this.activeModal &&
            this.activeModal === modal
        ) {
            this.close();
        } else {
            this.open(modal);
        }
    }

    isOpen() {
        return this.activeModal !== null;
    }
}

const modalManager = new ModalManager();

/* -------------------------------------------------------------------------- */
/* Network Monitor                                                            */
/* -------------------------------------------------------------------------- */

class NetworkMonitor {
    constructor() {
        this.online = navigator.onLine;

        window.addEventListener("online", () => {
            this.online = true;
            toast.success("Internet connection restored.");
            eventBus.emit("network:online");
        });

        window.addEventListener("offline", () => {
            this.online = false;
            toast.warning("You are offline. Changes will sync later.");
            eventBus.emit("network:offline");
        });
    }

    isOnline() {
        return this.online;
    }
}

const networkMonitor = new NetworkMonitor();

/* -------------------------------------------------------------------------- */
/* Fullscreen Manager                                                         */
/* -------------------------------------------------------------------------- */

class FullscreenManager {
    async enter() {
        if (document.fullscreenElement) {
            return true;
        }

        try {
            await document.documentElement.requestFullscreen();
            eventBus.emit("fullscreen:entered");
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async exit() {
        if (!document.fullscreenElement) {
            return true;
        }

        try {
            await document.exitFullscreen();
            eventBus.emit("fullscreen:exited");
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async toggle() {
        if (document.fullscreenElement) {
            return this.exit();
        }

        return this.enter();
    }

    isFullscreen() {
        return document.fullscreenElement !== null;
    }
}

const fullscreenManager = new FullscreenManager();

/* -------------------------------------------------------------------------- */
/* Visibility Monitor                                                         */
/* -------------------------------------------------------------------------- */

class VisibilityMonitor {
    constructor() {
        this.hiddenCount = 0;

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                this.hiddenCount++;
                eventBus.emit("exam:tabHidden", this.hiddenCount);
            } else {
                eventBus.emit("exam:tabVisible");
            }
        });

        window.addEventListener("blur", () => {
            eventBus.emit("window:blur");
        });

        window.addEventListener("focus", () => {
            eventBus.emit("window:focus");
        });
    }

    getHiddenCount() {
        return this.hiddenCount;
    }

    reset() {
        this.hiddenCount = 0;
    }
}

const visibilityMonitor = new VisibilityMonitor();

// ===== END OF PART 2 =====

/* -------------------------------------------------------------------------- */
/* Exam State Manager                                                         */
/* -------------------------------------------------------------------------- */

class ExamStateManager {
    constructor() {
        this.reset();
    }

    reset() {
        this.exam = null;
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.answers = new Map();
        this.visitedQuestions = new Set();
        this.markedQuestions = new Set();
        this.reviewedQuestions = new Set();
        this.timeSpent = new Map();
        this.currentQuestionStartTime = null;
        this.startedAt = null;
        this.submitted = false;
        this.lastSavedAt = null;
    }

    initialize(examData = {}) {
        this.reset();

        this.exam = {
            ...examData
        };

        this.questions = Array.isArray(examData.questions)
            ? [...examData.questions]
            : [];

        this.startedAt = Date.now();
        this.currentQuestionStartTime = Date.now();

        if (this.questions.length > 0) {
            this.visitedQuestions.add(0);
        }

        eventBus.emit("exam:initialized", this.exam);
    }

    getCurrentQuestion() {
        return this.questions[this.currentQuestionIndex] || null;
    }

    getQuestion(index) {
        return this.questions[index] || null;
    }

    getQuestionCount() {
        return this.questions.length;
    }

    hasNextQuestion() {
        return this.currentQuestionIndex < this.questions.length - 1;
    }

    hasPreviousQuestion() {
        return this.currentQuestionIndex > 0;
    }

    nextQuestion() {
        if (!this.hasNextQuestion()) {
            return false;
        }

        this.saveCurrentQuestionTime();

        this.currentQuestionIndex++;

        this.currentQuestionStartTime = Date.now();

        this.visitedQuestions.add(this.currentQuestionIndex);

        eventBus.emit(
            "question:changed",
            this.currentQuestionIndex
        );

        return true;
    }

    previousQuestion() {
        if (!this.hasPreviousQuestion()) {
            return false;
        }

        this.saveCurrentQuestionTime();

        this.currentQuestionIndex--;

        this.currentQuestionStartTime = Date.now();

        this.visitedQuestions.add(this.currentQuestionIndex);

        eventBus.emit(
            "question:changed",
            this.currentQuestionIndex
        );

        return true;
    }

    jumpToQuestion(index) {
        if (
            index < 0 ||
            index >= this.questions.length
        ) {
            return false;
        }

        this.saveCurrentQuestionTime();

        this.currentQuestionIndex = index;

        this.currentQuestionStartTime = Date.now();

        this.visitedQuestions.add(index);

        eventBus.emit(
            "question:changed",
            index
        );

        return true;
    }

    saveCurrentQuestionTime() {
        if (this.currentQuestionStartTime === null) {
            return;
        }

        const duration =
            Math.floor(
                (Date.now() -
                    this.currentQuestionStartTime) / 1000
            );

        const previous =
            this.timeSpent.get(this.currentQuestionIndex) || 0;

        this.timeSpent.set(
            this.currentQuestionIndex,
            previous + duration
        );
    }

    getTimeSpent(index) {
        return this.timeSpent.get(index) || 0;
    }

    answerQuestion(index, answer) {
        this.answers.set(index, answer);

        eventBus.emit("answer:updated", {
            index,
            answer
        });
    }

    removeAnswer(index) {
        this.answers.delete(index);

        eventBus.emit("answer:removed", index);
    }

    getAnswer(index) {
        return this.answers.get(index) ?? null;
    }

    hasAnswered(index) {
        return this.answers.has(index);
    }

    toggleReview(index) {
        if (this.reviewedQuestions.has(index)) {
            this.reviewedQuestions.delete(index);
        } else {
            this.reviewedQuestions.add(index);
        }

        eventBus.emit("review:toggled", index);
    }

    isMarkedForReview(index) {
        return this.reviewedQuestions.has(index);
    }

    toggleBookmark(index) {
        if (this.markedQuestions.has(index)) {
            this.markedQuestions.delete(index);
        } else {
            this.markedQuestions.add(index);
        }

        eventBus.emit("bookmark:toggled", index);
    }

    isBookmarked(index) {
        return this.markedQuestions.has(index);
    }

    getStatistics() {
        return {
            total: this.questions.length,
            answered: this.answers.size,
            visited: this.visitedQuestions.size,
            bookmarked: this.markedQuestions.size,
            review: this.reviewedQuestions.size,
            unanswered:
                this.questions.length - this.answers.size
        };
    }

    exportState() {
        return {
            exam: this.exam,
            currentQuestionIndex:
                this.currentQuestionIndex,
            answers: [...this.answers.entries()],
            visitedQuestions: [
                ...this.visitedQuestions
            ],
            markedQuestions: [
                ...this.markedQuestions
            ],
            reviewedQuestions: [
                ...this.reviewedQuestions
            ],
            timeSpent: [
                ...this.timeSpent.entries()
            ],
            startedAt: this.startedAt,
            submitted: this.submitted,
            lastSavedAt: Date.now()
        };
    }

    importState(data = {}) {
        if (!data) {
            return;
        }

        this.exam = data.exam || null;
        this.currentQuestionIndex =
            data.currentQuestionIndex || 0;

        this.answers = new Map(
            data.answers || []
        );

        this.visitedQuestions = new Set(
            data.visitedQuestions || []
        );

        this.markedQuestions = new Set(
            data.markedQuestions || []
        );

        this.reviewedQuestions = new Set(
            data.reviewedQuestions || []
        );

        this.timeSpent = new Map(
            data.timeSpent || []
        );

        this.startedAt = data.startedAt;
        this.submitted = Boolean(data.submitted);
        this.lastSavedAt = data.lastSavedAt || null;

        this.currentQuestionStartTime = Date.now();

        eventBus.emit("exam:stateImported");
    }
}

const examState = new ExamStateManager();

/* -------------------------------------------------------------------------- */
/* Auto Save Manager                                                          */
/* -------------------------------------------------------------------------- */

class AutoSaveManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.interval = null;
        this.enabled = false;
    }

    start() {
        if (this.enabled) {
            return;
        }

        this.enabled = true;

        this.interval = setInterval(() => {
            this.save();
        }, APP_CONFIG.AUTO_SAVE_INTERVAL);
    }

    stop() {
        this.enabled = false;

        clearInterval(this.interval);
        this.interval = null;
    }

    save() {
        const state =
            this.stateManager.exportState();

        StorageManager.save(
            "exam_state",
            state
        );

        this.stateManager.lastSavedAt =
            Date.now();

        eventBus.emit("autosave:completed");
    }

    restore() {
        const saved =
            StorageManager.load("exam_state");

        if (!saved) {
            return false;
        }

        this.stateManager.importState(saved);

        eventBus.emit("autosave:restored");

        return true;
    }

    clear() {
        StorageManager.remove("exam_state");
    }
}

const autoSaveManager =
    new AutoSaveManager(examState);

/* -------------------------------------------------------------------------- */
/* Keyboard Shortcut Manager                                                  */
/* -------------------------------------------------------------------------- */

class KeyboardShortcutManager {
    constructor() {
        this.enabled = true;

        document.addEventListener(
            "keydown",
            this.handleKeyDown.bind(this)
        );
    }

    handleKeyDown(event) {
        if (!this.enabled) {
            return;
        }

        if (
            event.target.matches(
                "input, textarea, select"
            )
        ) {
            return;
        }

        switch (event.key) {
            case "ArrowRight":
                event.preventDefault();
                eventBus.emit("shortcut:next");
                break;

            case "ArrowLeft":
                event.preventDefault();
                eventBus.emit("shortcut:previous");
                break;

            case "b":
            case "B":
                event.preventDefault();
                eventBus.emit("shortcut:bookmark");
                break;

            case "r":
            case "R":
                event.preventDefault();
                eventBus.emit("shortcut:review");
                break;

            case "s":
            case "S":
                if (event.ctrlKey) {
                    event.preventDefault();
                    eventBus.emit("shortcut:save");
                }
                break;
        }
    }

    disable() {
        this.enabled = false;
    }

    enable() {
        this.enabled = true;
    }
}

const keyboardShortcutManager =
    new KeyboardShortcutManager();

// ===== END OF PART 3 =====


/* -------------------------------------------------------------------------- */
/* Question Palette Manager                                                   */
/* -------------------------------------------------------------------------- */

class QuestionPaletteManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = $("#questionPalette");
        this.pageContainer = $("#palettePagination");
        this.buttons = [];
        this.currentPage = 1;
    }

    initialize() {
        if (!this.container) {
            return;
        }

        this.render();
        this.attachEvents();

        eventBus.on("question:changed", () => {
            this.update();
        });

        eventBus.on("answer:updated", () => {
            this.update();
        });

        eventBus.on("answer:removed", () => {
            this.update();
        });

        eventBus.on("review:toggled", () => {
            this.update();
        });

        eventBus.on("bookmark:toggled", () => {
            this.update();
        });
    }

    attachEvents() {
        this.container.addEventListener("click", event => {
            const button = event.target.closest("[data-question-index]");

            if (!button) {
                return;
            }

            const index = Number(button.dataset.questionIndex);

            eventBus.emit("palette:jump", index);
        });
    }

    render() {
        this.container.innerHTML = "";
        this.buttons = [];

        const total = this.state.getQuestionCount();

        for (let i = 0; i < total; i++) {
            const button = createElement(
                "button",
                ["palette-btn"],
                {
                    type: "button",
                    "data-question-index": i
                }
            );

            button.textContent = i + 1;

            this.container.appendChild(button);

            this.buttons.push(button);
        }

        this.renderPagination();
        this.update();
    }

    renderPagination() {
        if (!this.pageContainer) {
            return;
        }

        this.pageContainer.innerHTML = "";

        const totalPages = Math.ceil(
            this.buttons.length /
            APP_CONFIG.QUESTION_PALETTE_PAGE_SIZE
        );

        if (totalPages <= 1) {
            return;
        }

        for (let page = 1; page <= totalPages; page++) {
            const button = createElement(
                "button",
                ["palette-page-btn"],
                {
                    type: "button"
                }
            );

            button.textContent = page;

            if (page === this.currentPage) {
                button.classList.add("active");
            }

            button.addEventListener("click", () => {
                this.currentPage = page;
                this.showPage(page);
            });

            this.pageContainer.appendChild(button);
        }

        this.showPage(1);
    }

    showPage(page) {
        const start =
            (page - 1) *
            APP_CONFIG.QUESTION_PALETTE_PAGE_SIZE;

        const end =
            start +
            APP_CONFIG.QUESTION_PALETTE_PAGE_SIZE;

        this.buttons.forEach((button, index) => {
            button.style.display =
                index >= start && index < end
                    ? ""
                    : "none";
        });

        if (this.pageContainer) {
            [...this.pageContainer.children].forEach(
                (button, index) => {
                    button.classList.toggle(
                        "active",
                        index + 1 === page
                    );
                }
            );
        }
    }

    update() {
        this.buttons.forEach((button, index) => {
            button.className = "palette-btn";

            if (index === this.state.currentQuestionIndex) {
                button.classList.add("current");
            }

            if (this.state.visitedQuestions.has(index)) {
                button.classList.add("visited");
            }

            if (this.state.hasAnswered(index)) {
                button.classList.add("answered");
            }

            if (this.state.isMarkedForReview(index)) {
                button.classList.add("review");
            }

            if (this.state.isBookmarked(index)) {
                button.classList.add("bookmark");
            }
        });
    }
}

const questionPaletteManager =
    new QuestionPaletteManager(examState);

/* -------------------------------------------------------------------------- */
/* Question Renderer                                                          */
/* -------------------------------------------------------------------------- */

class QuestionRenderer {
    constructor(stateManager) {
        this.state = stateManager;

        this.questionNumber =
            $("#questionNumber");

        this.questionText =
            $("#questionText");

        this.questionImage =
            $("#questionImage");

        this.optionsContainer =
            $("#questionOptions");
    }

    render() {
        const question =
            this.state.getCurrentQuestion();

        if (!question) {
            return;
        }

        if (this.questionNumber) {
            this.questionNumber.textContent =
                `Question ${this.state.currentQuestionIndex + 1}`;
        }

        if (this.questionText) {
            this.questionText.innerHTML =
                question.question ||
                question.text ||
                "";
        }

        if (this.questionImage) {
            if (question.image) {
                this.questionImage.src =
                    question.image;

                this.questionImage.hidden = false;
            } else {
                this.questionImage.hidden = true;
            }
        }

        this.renderOptions(question);
    }

    renderOptions(question) {
        if (!this.optionsContainer) {
            return;
        }

        this.optionsContainer.innerHTML = "";

        const selected =
            this.state.getAnswer(
                this.state.currentQuestionIndex
            );

        (question.options || []).forEach(
            (option, index) => {
                const label = createElement(
                    "label",
                    ["option-card"]
                );

                const input = createElement(
                    "input",
                    [],
                    {
                        type: "radio",
                        name: "question-option",
                        value: index
                    }
                );

                if (selected === index) {
                    input.checked = true;
                }

                input.addEventListener(
                    "change",
                    () => {
                        eventBus.emit(
                            "question:answered",
                            {
                                index:
                                    this.state
                                        .currentQuestionIndex,
                                answer: index
                            }
                        );
                    }
                );

                const text =
                    createElement("span", [
                        "option-text"
                    ]);

                text.innerHTML = option;

                label.appendChild(input);
                label.appendChild(text);

                this.optionsContainer.appendChild(
                    label
                );
            }
        );
    }

    clearSelection() {
        const inputs = $$(
            'input[name="question-option"]'
        );

        inputs.forEach(input => {
            input.checked = false;
        });
    }
}

const questionRenderer =
    new QuestionRenderer(examState);

/* -------------------------------------------------------------------------- */
/* Statistics Panel Manager                                                   */
/* -------------------------------------------------------------------------- */

class StatisticsPanelManager {
    constructor(stateManager) {
        this.state = stateManager;

        this.total =
            $("#statTotal");

        this.answered =
            $("#statAnswered");

        this.unanswered =
            $("#statUnanswered");

        this.review =
            $("#statReview");

        this.bookmarked =
            $("#statBookmarked");

        eventBus.on(
            "answer:updated",
            () => this.update()
        );

        eventBus.on(
            "answer:removed",
            () => this.update()
        );

        eventBus.on(
            "review:toggled",
            () => this.update()
        );

        eventBus.on(
            "bookmark:toggled",
            () => this.update()
        );
    }

    update() {
        const stats =
            this.state.getStatistics();

        if (this.total) {
            this.total.textContent =
                stats.total;
        }

        if (this.answered) {
            this.answered.textContent =
                stats.answered;
        }

        if (this.unanswered) {
            this.unanswered.textContent =
                stats.unanswered;
        }

        if (this.review) {
            this.review.textContent =
                stats.review;
        }

        if (this.bookmarked) {
            this.bookmarked.textContent =
                stats.bookmarked;
        }
    }
}

const statisticsPanelManager =
    new StatisticsPanelManager(examState);

// ===== END OF PART 4 =====

/* -------------------------------------------------------------------------- */
/* Navigation Controller                                                      */
/* -------------------------------------------------------------------------- */

class NavigationController {
    constructor(stateManager, renderer, paletteManager) {
        this.state = stateManager;
        this.renderer = renderer;
        this.palette = paletteManager;

        this.previousButton = $("#previousQuestionBtn");
        this.nextButton = $("#nextQuestionBtn");
        this.clearButton = $("#clearResponseBtn");
        this.reviewButton = $("#markReviewBtn");
        this.bookmarkButton = $("#bookmarkBtn");
        this.saveNextButton = $("#saveNextBtn");

        this.bindEvents();
    }

    bindEvents() {
        this.previousButton?.addEventListener("click", () => {
            this.previous();
        });

        this.nextButton?.addEventListener("click", () => {
            this.next();
        });

        this.clearButton?.addEventListener("click", () => {
            this.clearResponse();
        });

        this.reviewButton?.addEventListener("click", () => {
            this.toggleReview();
        });

        this.bookmarkButton?.addEventListener("click", () => {
            this.toggleBookmark();
        });

        this.saveNextButton?.addEventListener("click", () => {
            this.saveAndNext();
        });

        eventBus.on("palette:jump", index => {
            this.jump(index);
        });

        eventBus.on("shortcut:next", () => {
            this.next();
        });

        eventBus.on("shortcut:previous", () => {
            this.previous();
        });

        eventBus.on("shortcut:bookmark", () => {
            this.toggleBookmark();
        });

        eventBus.on("shortcut:review", () => {
            this.toggleReview();
        });

        eventBus.on("question:answered", payload => {
            this.state.answerQuestion(
                payload.index,
                payload.answer
            );

            this.palette.update();

            statisticsPanelManager.update();
        });

        eventBus.on("question:changed", () => {
            this.renderer.render();
            this.palette.update();
            this.updateButtons();
        });
    }

    next() {
        if (this.state.nextQuestion()) {
            this.renderer.render();
        }
    }

    previous() {
        if (this.state.previousQuestion()) {
            this.renderer.render();
        }
    }

    jump(index) {
        if (this.state.jumpToQuestion(index)) {
            this.renderer.render();
        }
    }

    clearResponse() {
        const index =
            this.state.currentQuestionIndex;

        this.state.removeAnswer(index);

        this.renderer.clearSelection();

        this.palette.update();

        statisticsPanelManager.update();

        toast.info("Response cleared.");
    }

    toggleReview() {
        const index =
            this.state.currentQuestionIndex;

        this.state.toggleReview(index);

        this.palette.update();

        this.updateButtons();

        if (this.state.isMarkedForReview(index)) {
            toast.info(
                "Question marked for review."
            );
        } else {
            toast.info(
                "Review mark removed."
            );
        }
    }

    toggleBookmark() {
        const index =
            this.state.currentQuestionIndex;

        this.state.toggleBookmark(index);

        this.palette.update();

        this.updateButtons();

        if (this.state.isBookmarked(index)) {
            toast.success(
                "Question bookmarked."
            );
        } else {
            toast.info(
                "Bookmark removed."
            );
        }
    }

    saveAndNext() {
        if (this.state.hasNextQuestion()) {
            this.next();
        } else {
            toast.info(
                "You have reached the last question."
            );
        }
    }

    updateButtons() {
        if (this.previousButton) {
            this.previousButton.disabled =
                !this.state.hasPreviousQuestion();
        }

        if (this.nextButton) {
            this.nextButton.disabled =
                !this.state.hasNextQuestion();
        }

        if (this.reviewButton) {
            this.reviewButton.classList.toggle(
                "active",
                this.state.isMarkedForReview(
                    this.state.currentQuestionIndex
                )
            );
        }

        if (this.bookmarkButton) {
            this.bookmarkButton.classList.toggle(
                "active",
                this.state.isBookmarked(
                    this.state.currentQuestionIndex
                )
            );
        }
    }
}

const navigationController =
    new NavigationController(
        examState,
        questionRenderer,
        questionPaletteManager
    );

/* -------------------------------------------------------------------------- */
/* Timer Display Manager                                                      */
/* -------------------------------------------------------------------------- */

class TimerDisplayManager {
    constructor() {
        this.element = $("#examTimer");
        this.warningHistory = new Set();
        this.timer = null;
    }

    attach(timer) {
        this.timer = timer;
    }

    update(seconds) {
        if (!this.element) {
            return;
        }

        this.element.textContent =
            Utils.formatTime(seconds);

        APP_CONFIG.WARNING_TIMES.forEach(time => {
            if (
                seconds <= time &&
                !this.warningHistory.has(time)
            ) {
                this.warningHistory.add(time);

                toast.warning(
                    `Only ${Utils.formatTime(
                        seconds
                    )} remaining.`
                );

                eventBus.emit(
                    "timer:warning",
                    seconds
                );
            }
        });

        if (seconds <= 300) {
            this.element.classList.add(
                "timer-danger"
            );
        } else if (seconds <= 900) {
            this.element.classList.add(
                "timer-warning"
            );
        }
    }

    resetStyles() {
        if (!this.element) {
            return;
        }

        this.warningHistory.clear();

        this.element.classList.remove(
            "timer-warning",
            "timer-danger"
        );
    }
}

const timerDisplayManager =
    new TimerDisplayManager();

/* -------------------------------------------------------------------------- */
/* Candidate Information Manager                                              */
/* -------------------------------------------------------------------------- */

class CandidateInfoManager {
    constructor() {
        this.name = $("#candidateName");
        this.rollNumber =
            $("#candidateRollNumber");
        this.photo =
            $("#candidatePhoto");
        this.subject =
            $("#candidateSubject");
        this.examCode =
            $("#candidateExamCode");
    }

    render(data = {}) {
        if (this.name) {
            this.name.textContent =
                data.name || "-";
        }

        if (this.rollNumber) {
            this.rollNumber.textContent =
                data.rollNumber || "-";
        }

        if (this.subject) {
            this.subject.textContent =
                data.subject || "-";
        }

        if (this.examCode) {
            this.examCode.textContent =
                data.examCode || "-";
        }

        if (this.photo) {
            this.photo.src =
                data.photo ||
                "assets/images/default-user.png";
        }
    }
}

const candidateInfoManager =
    new CandidateInfoManager();

// ===== END OF PART 5 =====

/* -------------------------------------------------------------------------- */
/* Exam Submission Manager                                                    */
/* -------------------------------------------------------------------------- */

class ExamSubmissionManager {
    constructor(stateManager) {
        this.state = stateManager;

        this.submitButton = $("#submitExamBtn");
        this.confirmButton = $("#confirmSubmitBtn");
        this.cancelButton = $("#cancelSubmitBtn");
        this.summaryContainer = $("#submitSummary");

        this.bindEvents();
    }

    bindEvents() {
        this.submitButton?.addEventListener("click", () => {
            this.openConfirmation();
        });

        this.confirmButton?.addEventListener("click", async () => {
            await this.submit();
        });

        this.cancelButton?.addEventListener("click", () => {
            modalManager.close();
        });
    }

    openConfirmation() {
        this.renderSummary();
        modalManager.open("#submitExamModal");
    }

    renderSummary() {
        if (!this.summaryContainer) {
            return;
        }

        const stats = this.state.getStatistics();

        this.summaryContainer.innerHTML = `
            <div class="submit-summary-grid">
                <div class="summary-item">
                    <span>Total Questions</span>
                    <strong>${stats.total}</strong>
                </div>

                <div class="summary-item">
                    <span>Answered</span>
                    <strong>${stats.answered}</strong>
                </div>

                <div class="summary-item">
                    <span>Unanswered</span>
                    <strong>${stats.unanswered}</strong>
                </div>

                <div class="summary-item">
                    <span>Marked For Review</span>
                    <strong>${stats.review}</strong>
                </div>

                <div class="summary-item">
                    <span>Bookmarked</span>
                    <strong>${stats.bookmarked}</strong>
                </div>

                <div class="summary-item">
                    <span>Visited</span>
                    <strong>${stats.visited}</strong>
                </div>
            </div>
        `;
    }

    buildPayload() {
        this.state.saveCurrentQuestionTime();

        return {
            examId: this.state.exam?.id,
            startedAt: this.state.startedAt,
            submittedAt: Date.now(),
            answers: [...this.state.answers.entries()],
            timeSpent: [...this.state.timeSpent.entries()],
            statistics: this.state.getStatistics(),
            violations: visibilityMonitor.getHiddenCount()
        };
    }

    async submit() {
        if (this.state.submitted) {
            return;
        }

        loadingOverlay.show("Submitting your exam...");

        try {
            const payload = this.buildPayload();

            const response = await ApiService.post(
                "/api/exam/submit",
                payload
            );

            this.state.submitted = true;

            autoSaveManager.stop();
            autoSaveManager.clear();

            loadingOverlay.hide();

            modalManager.close();

            toast.success(
                "Exam submitted successfully."
            );

            eventBus.emit(
                "exam:submitted",
                response
            );

            if (response?.redirect) {
                window.location.href =
                    response.redirect;
            }
        } catch (error) {
            loadingOverlay.hide();

            toast.error(
                "Unable to submit exam. Please try again."
            );

            console.error(error);
        }
    }
}

const examSubmissionManager =
    new ExamSubmissionManager(examState);

/* -------------------------------------------------------------------------- */
/* Session Manager                                                            */
/* -------------------------------------------------------------------------- */

class SessionManager {
    constructor() {
        this.expired = false;
    }

    async validate() {
        try {
            const session =
                await ApiService.get(
                    "/api/session/validate"
                );

            if (!session.valid) {
                this.expire();
                return false;
            }

            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    expire() {
        if (this.expired) {
            return;
        }

        this.expired = true;

        autoSaveManager.save();

        toast.error(
            "Your session has expired."
        );

        eventBus.emit("session:expired");

        setTimeout(() => {
            window.location.href = "/login.html";
        }, 2000);
    }

    startHeartbeat(interval = 60000) {
        setInterval(async () => {
            await this.validate();
        }, interval);
    }
}

const sessionManager =
    new SessionManager();

/* -------------------------------------------------------------------------- */
/* Clipboard Protection                                                       */
/* -------------------------------------------------------------------------- */

class ClipboardProtection {
    constructor() {
        this.enabled = true;

        this.blockEvents();
    }

    blockEvents() {
        const prevent = event => {
            if (!this.enabled) {
                return;
            }

            event.preventDefault();

            toast.warning(
                "Clipboard actions are disabled during the exam."
            );

            eventBus.emit(
                "security:clipboardBlocked"
            );
        };

        document.addEventListener(
            "copy",
            prevent
        );

        document.addEventListener(
            "cut",
            prevent
        );

        document.addEventListener(
            "paste",
            prevent
        );

        document.addEventListener(
            "contextmenu",
            prevent
        );
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }
}

const clipboardProtection =
    new ClipboardProtection();

/* -------------------------------------------------------------------------- */
/* Security Monitor                                                           */
/* -------------------------------------------------------------------------- */

class SecurityMonitor {
    constructor() {
        this.fullscreenWarnings = 0;
        this.maxWarnings = 5;

        this.initialize();
    }

    initialize() {
        document.addEventListener(
            "fullscreenchange",
            () => {
                if (
                    !fullscreenManager.isFullscreen() &&
                    !examState.submitted
                ) {
                    this.handleFullscreenExit();
                }
            }
        );

        eventBus.on(
            "exam:tabHidden",
            count => {
                if (count >= 3) {
                    toast.warning(
                        "Multiple tab switches detected."
                    );
                }
            }
        );
    }

    handleFullscreenExit() {
        this.fullscreenWarnings++;

        toast.warning(
            `Fullscreen exited (${this.fullscreenWarnings}/${this.maxWarnings})`
        );

        eventBus.emit(
            "security:fullscreenExit",
            this.fullscreenWarnings
        );

        if (
            this.fullscreenWarnings >=
            this.maxWarnings
        ) {
            toast.error(
                "Exam terminated due to repeated fullscreen violations."
            );

            examSubmissionManager.submit();
        }
    }

    reset() {
        this.fullscreenWarnings = 0;
    }
}

const securityMonitor =
    new SecurityMonitor();

// ===== END OF PART 6 =====

/* -------------------------------------------------------------------------- */
/* Results Preview Manager                                                    */
/* -------------------------------------------------------------------------- */

class ResultsPreviewManager {
    constructor(stateManager) {
        this.state = stateManager;

        this.container = $("#resultsPreview");
        this.scoreElement = $("#previewScore");
        this.correctElement = $("#previewCorrect");
        this.wrongElement = $("#previewWrong");
        this.skippedElement = $("#previewSkipped");
        this.accuracyElement = $("#previewAccuracy");
    }

    calculate() {
        let correct = 0;
        let wrong = 0;
        let skipped = 0;

        this.state.questions.forEach((question, index) => {
            if (!this.state.hasAnswered(index)) {
                skipped++;
                return;
            }

            const answer = this.state.getAnswer(index);

            if (answer === question.correctAnswer) {
                correct++;
            } else {
                wrong++;
            }
        });

        const total = this.state.questions.length;

        const accuracy =
            total === 0
                ? 0
                : Number(((correct / total) * 100).toFixed(2));

        return {
            total,
            correct,
            wrong,
            skipped,
            accuracy,
            score: correct
        };
    }

    render() {
        const stats = this.calculate();

        if (this.scoreElement) {
            this.scoreElement.textContent = stats.score;
        }

        if (this.correctElement) {
            this.correctElement.textContent = stats.correct;
        }

        if (this.wrongElement) {
            this.wrongElement.textContent = stats.wrong;
        }

        if (this.skippedElement) {
            this.skippedElement.textContent = stats.skipped;
        }

        if (this.accuracyElement) {
            this.accuracyElement.textContent =
                `${stats.accuracy}%`;
        }

        eventBus.emit(
            "results:previewUpdated",
            stats
        );
    }
}

const resultsPreviewManager =
    new ResultsPreviewManager(examState);

/* -------------------------------------------------------------------------- */
/* Progress Manager                                                           */
/* -------------------------------------------------------------------------- */

class ProgressManager {
    constructor(stateManager) {
        this.state = stateManager;

        this.progressBar =
            $("#examProgressBar");

        this.progressLabel =
            $("#examProgressLabel");

        this.initialize();
    }

    initialize() {
        eventBus.on(
            "answer:updated",
            () => this.update()
        );

        eventBus.on(
            "answer:removed",
            () => this.update()
        );

        eventBus.on(
            "question:changed",
            () => this.update()
        );
    }

    update() {
        const total =
            this.state.getQuestionCount();

        const answered =
            this.state.answers.size;

        const percentage =
            total === 0
                ? 0
                : Math.round(
                      (answered / total) * 100
                  );

        if (this.progressBar) {
            this.progressBar.style.width =
                `${percentage}%`;
        }

        if (this.progressLabel) {
            this.progressLabel.textContent =
                `${answered}/${total} Answered`;
        }

        eventBus.emit(
            "progress:updated",
            {
                answered,
                total,
                percentage
            }
        );
    }
}

const progressManager =
    new ProgressManager(examState);

/* -------------------------------------------------------------------------- */
/* Question Filter Manager                                                    */
/* -------------------------------------------------------------------------- */

class QuestionFilterManager {
    constructor(stateManager, paletteManager) {
        this.state = stateManager;
        this.palette = paletteManager;

        this.filterButtons = $$(
            "[data-filter]"
        );

        this.bindEvents();
    }

    bindEvents() {
        this.filterButtons.forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    this.apply(
                        button.dataset.filter
                    );
                }
            );
        });
    }

    apply(filter) {
        this.palette.buttons.forEach(
            (button, index) => {
                let visible = true;

                switch (filter) {
                    case "answered":
                        visible =
                            this.state.hasAnswered(
                                index
                            );
                        break;

                    case "unanswered":
                        visible =
                            !this.state.hasAnswered(
                                index
                            );
                        break;

                    case "review":
                        visible =
                            this.state.isMarkedForReview(
                                index
                            );
                        break;

                    case "bookmark":
                        visible =
                            this.state.isBookmarked(
                                index
                            );
                        break;

                    case "visited":
                        visible =
                            this.state.visitedQuestions.has(
                                index
                            );
                        break;

                    default:
                        visible = true;
                }

                button.style.display =
                    visible ? "" : "none";
            }
        );

        eventBus.emit(
            "palette:filtered",
            filter
        );
    }

    reset() {
        this.palette.buttons.forEach(button => {
            button.style.display = "";
        });
    }
}

const questionFilterManager =
    new QuestionFilterManager(
        examState,
        questionPaletteManager
    );

/* -------------------------------------------------------------------------- */
/* Theme Manager                                                              */
/* -------------------------------------------------------------------------- */

class ThemeManager {
    constructor() {
        this.theme =
            StorageManager.load(
                "theme",
                "light"
            );

        this.apply(this.theme);
    }

    apply(theme) {
        this.theme = theme;

        document.documentElement.setAttribute(
            "data-theme",
            theme
        );

        StorageManager.save(
            "theme",
            theme
        );

        eventBus.emit(
            "theme:changed",
            theme
        );
    }

    toggle() {
        this.apply(
            this.theme === "light"
                ? "dark"
                : "light"
        );
    }

    current() {
        return this.theme;
    }
}

const themeManager =
    new ThemeManager();

// ===== END OF PART 7 =====

/* -------------------------------------------------------------------------- */
/* Exam Bootstrap Manager                                                     */
/* -------------------------------------------------------------------------- */

class ExamBootstrapManager {
    constructor() {
        this.initialized = false;
        this.timer = null;
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        loadingOverlay.show("Preparing your exam...");

        try {
            await this.loadExam();

            this.initializeComponents();

            this.registerGlobalEvents();

            this.initialized = true;

            loadingOverlay.hide();

            toast.success("Exam loaded successfully.");

            eventBus.emit("exam:ready");
        } catch (error) {
            loadingOverlay.hide();

            console.error(error);

            toast.error("Failed to load exam.");

            eventBus.emit("exam:error", error);
        }
    }

    async loadExam() {
        const response = await ApiService.get("/api/exam");

        examState.initialize(response);

        candidateInfoManager.render(response.candidate || {});

        questionRenderer.render();

        questionPaletteManager.initialize();

        statisticsPanelManager.update();

        progressManager.update();

        if (response.duration) {
            this.timer = new CountdownTimer(response.duration);

            timerDisplayManager.attach(this.timer);

            timerDisplayManager.resetStyles();

            this.timer.start(
                seconds => {
                    timerDisplayManager.update(seconds);
                },
                async () => {
                    toast.warning("Time is over.");

                    await examSubmissionManager.submit();
                }
            );
        }

        autoSaveManager.restore();

        autoSaveManager.start();

        sessionManager.startHeartbeat();
    }

    initializeComponents() {
        navigationController.updateButtons();

        questionRenderer.render();

        statisticsPanelManager.update();

        progressManager.update();

        resultsPreviewManager.render();
    }

    registerGlobalEvents() {
        eventBus.on("answer:updated", () => {
            autoSaveManager.save();

            progressManager.update();

            statisticsPanelManager.update();

            questionPaletteManager.update();

            resultsPreviewManager.render();
        });

        eventBus.on("answer:removed", () => {
            autoSaveManager.save();

            progressManager.update();

            statisticsPanelManager.update();

            questionPaletteManager.update();

            resultsPreviewManager.render();
        });

        eventBus.on("shortcut:save", () => {
            autoSaveManager.save();

            toast.success("Progress saved.");
        });

        eventBus.on("session:expired", () => {
            if (this.timer) {
                this.timer.pause();
            }
        });

        eventBus.on("exam:submitted", () => {
            if (this.timer) {
                this.timer.stop();
            }
        });
    }
}

const examBootstrapManager =
    new ExamBootstrapManager();

/* -------------------------------------------------------------------------- */
/* Window Event Manager                                                       */
/* -------------------------------------------------------------------------- */

class WindowEventManager {
    constructor() {
        this.beforeUnloadHandler =
            this.beforeUnloadHandler.bind(this);

        this.initialize();
    }

    initialize() {
        window.addEventListener(
            "beforeunload",
            this.beforeUnloadHandler
        );

        window.addEventListener(
            "resize",
            Utils.debounce(() => {
                eventBus.emit(
                    "window:resize",
                    {
                        width: window.innerWidth,
                        height: window.innerHeight
                    }
                );
            }, 250)
        );

        window.addEventListener(
            "online",
            () => {
                autoSaveManager.save();
            }
        );
    }

    beforeUnloadHandler(event) {
        if (examState.submitted) {
            return;
        }

        autoSaveManager.save();

        event.preventDefault();

        event.returnValue =
            "Your exam is still in progress.";

        return event.returnValue;
    }
}

const windowEventManager =
    new WindowEventManager();

/* -------------------------------------------------------------------------- */
/* Accessibility Manager                                                      */
/* -------------------------------------------------------------------------- */

class AccessibilityManager {
    constructor() {
        this.initialize();
    }

    initialize() {
        document.addEventListener(
            "keydown",
            event => {
                if (event.key === "Tab") {
                    document.body.classList.add(
                        "keyboard-navigation"
                    );
                }
            }
        );

        document.addEventListener(
            "mousedown",
            () => {
                document.body.classList.remove(
                    "keyboard-navigation"
                );
            }
        );
    }

    announce(message) {
        let liveRegion = $("#ariaLiveRegion");

        if (!liveRegion) {
            liveRegion = createElement(
                "div",
                [],
                {
                    id: "ariaLiveRegion",
                    "aria-live": "polite"
                }
            );

            liveRegion.style.position = "absolute";
            liveRegion.style.left = "-9999px";

            document.body.appendChild(liveRegion);
        }

        liveRegion.textContent = "";

        requestAnimationFrame(() => {
            liveRegion.textContent = message;
        });
    }
}

const accessibilityManager =
    new AccessibilityManager();

/* -------------------------------------------------------------------------- */
/* Analytics Manager                                                          */
/* -------------------------------------------------------------------------- */

class AnalyticsManager {
    constructor() {
        this.events = [];

        this.initialize();
    }

    initialize() {
        [
            "question:changed",
            "answer:updated",
            "answer:removed",
            "exam:submitted",
            "timer:warning",
            "security:fullscreenExit",
            "exam:tabHidden"
        ].forEach(eventName => {
            eventBus.on(eventName, payload => {
                this.track(eventName, payload);
            });
        });
    }

    track(event, payload = null) {
        this.events.push({
            event,
            payload,
            timestamp: Date.now()
        });

        if (this.events.length > 500) {
            this.events.shift();
        }
    }

    export() {
        return [...this.events];
    }

    clear() {
        this.events.length = 0;
    }
}

const analyticsManager =
    new AnalyticsManager();

// ===== END OF PART 8 =====

/* -------------------------------------------------------------------------- */
/* Exam Recovery Manager                                                      */
/* -------------------------------------------------------------------------- */

class ExamRecoveryManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.recoveryKey = "exam_state";
    }

    hasRecoveryData() {
        return StorageManager.load(this.recoveryKey) !== null;
    }

    restore() {
        const savedState = StorageManager.load(this.recoveryKey);

        if (!savedState) {
            return false;
        }

        this.state.importState(savedState);

        questionRenderer.render();
        questionPaletteManager.update();
        statisticsPanelManager.update();
        progressManager.update();
        navigationController.updateButtons();
        resultsPreviewManager.render();

        toast.success("Previous exam session restored.");

        eventBus.emit("exam:recovered");

        return true;
    }

    discard() {
        StorageManager.remove(this.recoveryKey);

        eventBus.emit("exam:recoveryDiscarded");
    }
}

const examRecoveryManager =
    new ExamRecoveryManager(examState);

/* -------------------------------------------------------------------------- */
/* Idle Monitor                                                               */
/* -------------------------------------------------------------------------- */

class IdleMonitor {
    constructor(timeout = 300000) {
        this.timeout = timeout;
        this.timer = null;

        this.events = [
            "mousemove",
            "mousedown",
            "keydown",
            "touchstart",
            "scroll"
        ];

        this.initialize();
    }

    initialize() {
        this.events.forEach(eventName => {
            window.addEventListener(
                eventName,
                () => this.reset()
            );
        });

        this.reset();
    }

    reset() {
        clearTimeout(this.timer);

        this.timer = setTimeout(() => {
            eventBus.emit("user:idle");

            toast.warning(
                "No activity detected."
            );
        }, this.timeout);
    }
}

const idleMonitor = new IdleMonitor();

/* -------------------------------------------------------------------------- */
/* Notification Manager                                                       */
/* -------------------------------------------------------------------------- */

class NotificationManager {
    async requestPermission() {
        if (!("Notification" in window)) {
            return false;
        }

        if (
            Notification.permission ===
            "granted"
        ) {
            return true;
        }

        const permission =
            await Notification.requestPermission();

        return permission === "granted";
    }

    async notify(title, body) {
        const allowed =
            await this.requestPermission();

        if (!allowed) {
            return;
        }

        new Notification(title, {
            body,
            icon: "/assets/images/logo.png"
        });
    }
}

const notificationManager =
    new NotificationManager();

/* -------------------------------------------------------------------------- */
/* Exam Logger                                                                */
/* -------------------------------------------------------------------------- */

class ExamLogger {
    constructor() {
        this.logs = [];
        this.limit = 1000;
    }

    log(level, message, meta = {}) {
        const entry = {
            level,
            message,
            meta,
            timestamp: new Date().toISOString()
        };

        this.logs.push(entry);

        if (this.logs.length > this.limit) {
            this.logs.shift();
        }

        console[level](
            `[Exam] ${message}`,
            meta
        );
    }

    info(message, meta) {
        this.log("info", message, meta);
    }

    warn(message, meta) {
        this.log("warn", message, meta);
    }

    error(message, meta) {
        this.log("error", message, meta);
    }

    export() {
        return [...this.logs];
    }

    clear() {
        this.logs.length = 0;
    }
}

const examLogger = new ExamLogger();

/* -------------------------------------------------------------------------- */
/* Event Registrations                                                        */
/* -------------------------------------------------------------------------- */

eventBus.on("exam:ready", () => {
    examLogger.info("Exam initialized.");
});

eventBus.on("question:changed", index => {
    examLogger.info(
        "Question changed",
        { index }
    );
});

eventBus.on("answer:updated", payload => {
    examLogger.info(
        "Answer updated",
        payload
    );
});

eventBus.on("exam:submitted", () => {
    examLogger.info(
        "Exam submitted."
    );
});

eventBus.on("security:fullscreenExit", count => {
    examLogger.warn(
        "Fullscreen exited",
        { count }
    );
});

eventBus.on("exam:tabHidden", count => {
    examLogger.warn(
        "Tab switched",
        { count }
    );
});

// ===== END OF PART 9 =====

/* -------------------------------------------------------------------------- */
/* Performance Monitor                                                        */
/* -------------------------------------------------------------------------- */

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            pageLoadedAt: performance.now(),
            renderTimes: [],
            apiCalls: [],
            memorySnapshots: []
        };

        this.enabled = true;
    }

    startRender(label = "render") {
        if (!this.enabled) {
            return;
        }

        performance.mark(`${label}-start`);
    }

    endRender(label = "render") {
        if (!this.enabled) {
            return;
        }

        performance.mark(`${label}-end`);

        performance.measure(
            label,
            `${label}-start`,
            `${label}-end`
        );

        const entries = performance.getEntriesByName(label);

        if (entries.length) {
            this.metrics.renderTimes.push({
                label,
                duration:
                    entries[entries.length - 1].duration,
                timestamp: Date.now()
            });
        }

        performance.clearMarks(`${label}-start`);
        performance.clearMarks(`${label}-end`);
        performance.clearMeasures(label);
    }

    logApi(url, duration) {
        this.metrics.apiCalls.push({
            url,
            duration,
            timestamp: Date.now()
        });
    }

    captureMemory() {
        if (
            performance &&
            performance.memory
        ) {
            this.metrics.memorySnapshots.push({
                used:
                    performance.memory.usedJSHeapSize,
                total:
                    performance.memory.totalJSHeapSize,
                limit:
                    performance.memory.jsHeapSizeLimit,
                timestamp: Date.now()
            });
        }
    }

    export() {
        return Utils.deepClone(this.metrics);
    }
}

const performanceMonitor =
    new PerformanceMonitor();

/* -------------------------------------------------------------------------- */
/* API Performance Wrapper                                                    */
/* -------------------------------------------------------------------------- */

const originalApiRequest =
    ApiService.request.bind(ApiService);

ApiService.request = async function (
    url,
    options = {},
    retry = 0
) {
    const started = performance.now();

    try {
        const response =
            await originalApiRequest(
                url,
                options,
                retry
            );

        performanceMonitor.logApi(
            url,
            Number(
                (
                    performance.now() -
                    started
                ).toFixed(2)
            )
        );

        return response;
    } catch (error) {
        performanceMonitor.logApi(
            url,
            Number(
                (
                    performance.now() -
                    started
                ).toFixed(2)
            )
        );

        throw error;
    }
};

/* -------------------------------------------------------------------------- */
/* Exam Diagnostics                                                           */
/* -------------------------------------------------------------------------- */

class ExamDiagnostics {
    generateReport() {
        return {
            version: APP_CONFIG.VERSION,
            examState:
                examState.exportState(),
            analytics:
                analyticsManager.export(),
            logs:
                examLogger.export(),
            performance:
                performanceMonitor.export(),
            online:
                networkMonitor.isOnline(),
            fullscreen:
                fullscreenManager.isFullscreen(),
            visibilityViolations:
                visibilityMonitor.getHiddenCount(),
            generatedAt:
                new Date().toISOString()
        };
    }

    print() {
        console.group(
            "Exam Diagnostics"
        );

        console.table(
            this.generateReport()
        );

        console.groupEnd();
    }
}

const examDiagnostics =
    new ExamDiagnostics();

/* -------------------------------------------------------------------------- */
/* Global Event Hooks                                                         */
/* -------------------------------------------------------------------------- */

eventBus.on("question:changed", () => {
    performanceMonitor.startRender(
        "question-render"
    );

    requestAnimationFrame(() => {
        performanceMonitor.endRender(
            "question-render"
        );
    });
});

eventBus.on("exam:ready", () => {
    performanceMonitor.captureMemory();
});

eventBus.on("exam:submitted", () => {
    performanceMonitor.captureMemory();

    examDiagnostics.print();
});

eventBus.on("network:offline", () => {
    examLogger.warn(
        "Network connection lost."
    );
});

eventBus.on("network:online", () => {
    examLogger.info(
        "Network connection restored."
    );
});

eventBus.on("user:idle", () => {
    examLogger.warn(
        "User became idle."
    );
});

eventBus.on("progress:updated", stats => {
    examLogger.info(
        "Progress updated",
        stats
    );
});

eventBus.on("results:previewUpdated", stats => {
    examLogger.info(
        "Preview recalculated",
        stats
    );
});

// ===== END OF PART 10 =====

/* -------------------------------------------------------------------------- */
/* Health Check Manager                                                       */
/* -------------------------------------------------------------------------- */

class HealthCheckManager {
    constructor() {
        this.interval = null;
        this.lastHeartbeat = Date.now();
    }

    start(interval = 30000) {
        if (this.interval) {
            return;
        }

        this.interval = setInterval(async () => {
            await this.check();
        }, interval);
    }

    stop() {
        clearInterval(this.interval);
        this.interval = null;
    }

    async check() {
        try {
            const response = await ApiService.get("/api/health");

            this.lastHeartbeat = Date.now();

            eventBus.emit("health:ok", response);
        } catch (error) {
            eventBus.emit("health:error", error);

            examLogger.error("Health check failed.", {
                error: error.message
            });
        }
    }

    getLastHeartbeat() {
        return this.lastHeartbeat;
    }
}

const healthCheckManager =
    new HealthCheckManager();

/* -------------------------------------------------------------------------- */
/* Crash Recovery Manager                                                     */
/* -------------------------------------------------------------------------- */

class CrashRecoveryManager {
    constructor(stateManager) {
        this.state = stateManager;

        window.addEventListener(
            "error",
            event => {
                this.handleError(event.error);
            }
        );

        window.addEventListener(
            "unhandledrejection",
            event => {
                this.handleError(event.reason);
            }
        );
    }

    handleError(error) {
        try {
            autoSaveManager.save();

            examLogger.error(
                "Unexpected application error.",
                {
                    message:
                        error?.message ||
                        String(error)
                }
            );

            eventBus.emit(
                "application:error",
                error
            );

            toast.error(
                "An unexpected error occurred. Your progress has been saved."
            );
        } catch (e) {
            console.error(e);
        }
    }
}

const crashRecoveryManager =
    new CrashRecoveryManager(examState);

/* -------------------------------------------------------------------------- */
/* Application Lifecycle Manager                                              */
/* -------------------------------------------------------------------------- */

class ApplicationLifecycleManager {
    initialize() {
        eventBus.on("exam:ready", () => {
            healthCheckManager.start();

            examLogger.info(
                "Application lifecycle started."
            );
        });

        eventBus.on("exam:submitted", () => {
            healthCheckManager.stop();

            analyticsManager.track(
                "application:shutdown"
            );

            examLogger.info(
                "Application lifecycle completed."
            );
        });

        eventBus.on(
            "application:error",
            error => {
                analyticsManager.track(
                    "application:error",
                    {
                        message:
                            error?.message ??
                            "Unknown Error"
                    }
                );
            }
        );
    }
}

const applicationLifecycleManager =
    new ApplicationLifecycleManager();

applicationLifecycleManager.initialize();

/* -------------------------------------------------------------------------- */
/* Final Event Synchronization                                                */
/* -------------------------------------------------------------------------- */

eventBus.on("answer:updated", () => {
    resultsPreviewManager.render();

    progressManager.update();

    statisticsPanelManager.update();
});

eventBus.on("answer:removed", () => {
    resultsPreviewManager.render();

    progressManager.update();

    statisticsPanelManager.update();
});

eventBus.on("question:changed", () => {
    questionRenderer.render();

    navigationController.updateButtons();

    questionPaletteManager.update();
});

eventBus.on("exam:recovered", () => {
    navigationController.updateButtons();

    progressManager.update();

    statisticsPanelManager.update();

    resultsPreviewManager.render();

    questionPaletteManager.update();
});

eventBus.on("theme:changed", theme => {
    examLogger.info("Theme changed.", {
        theme
    });
});

eventBus.on("health:ok", () => {
    examLogger.info(
        "Health check passed."
    );
});

eventBus.on("health:error", error => {
    examLogger.warn(
        "Health check failed.",
        {
            message: error?.message
        }
    );
});

// ===== END OF PART 11 =====

/* -------------------------------------------------------------------------- */
/* Cleanup Manager                                                            */
/* -------------------------------------------------------------------------- */

class CleanupManager {
    constructor() {
        this.cleanupCompleted = false;
        this.boundBeforeUnload = this.handleBeforeUnload.bind(this);
        this.boundPageHide = this.handlePageHide.bind(this);
        this.boundUnload = this.handleUnload.bind(this);
    }

    initialize() {
        window.addEventListener("beforeunload", this.boundBeforeUnload);
        window.addEventListener("pagehide", this.boundPageHide);
        window.addEventListener("unload", this.boundUnload);
    }

    handleBeforeUnload() {
        if (!examState.submitted) {
            autoSaveManager.save();
        }
    }

    handlePageHide() {
        if (!examState.submitted) {
            autoSaveManager.save();
        }
    }

    handleUnload() {
        this.destroy();
    }

    destroy() {
        if (this.cleanupCompleted) {
            return;
        }

        this.cleanupCompleted = true;

        try {
            if (examBootstrapManager.timer) {
                examBootstrapManager.timer.stop();
            }

            autoSaveManager.stop();
            healthCheckManager.stop();

            if (sessionManager.heartbeatInterval) {
                clearInterval(sessionManager.heartbeatInterval);
            }

            if (idleMonitor.timer) {
                clearTimeout(idleMonitor.timer);
            }

            analyticsManager.clear();

            examLogger.info("Application cleanup completed.");

            eventBus.clear();

            window.removeEventListener(
                "beforeunload",
                this.boundBeforeUnload
            );

            window.removeEventListener(
                "pagehide",
                this.boundPageHide
            );

            window.removeEventListener(
                "unload",
                this.boundUnload
            );
        } catch (error) {
            console.error(error);
        }
    }
}

const cleanupManager = new CleanupManager();

/* -------------------------------------------------------------------------- */
/* Final Button Bindings                                                      */
/* -------------------------------------------------------------------------- */

function bindFinalButtons() {
    $("#previousQuestionBtn")?.addEventListener("click", () => {
        navigationController.previous();
    });

    $("#nextQuestionBtn")?.addEventListener("click", () => {
        navigationController.next();
    });

    $("#saveNextBtn")?.addEventListener("click", () => {
        navigationController.saveAndNext();
    });

    $("#clearResponseBtn")?.addEventListener("click", () => {
        navigationController.clearResponse();
    });

    $("#bookmarkBtn")?.addEventListener("click", () => {
        navigationController.toggleBookmark();
    });

    $("#markReviewBtn")?.addEventListener("click", () => {
        navigationController.toggleReview();
    });

    $("#submitExamBtn")?.addEventListener("click", () => {
        examSubmissionManager.openConfirmation();
    });

    $("#confirmSubmitBtn")?.addEventListener("click", async () => {
        await examSubmissionManager.submit();
    });

    $("#cancelSubmitBtn")?.addEventListener("click", () => {
        modalManager.close();
    });

    $("#themeToggleBtn")?.addEventListener("click", () => {
        themeManager.toggle();
    });
}

/* -------------------------------------------------------------------------- */
/* Final Initialization                                                       */
/* -------------------------------------------------------------------------- */

async function initializeExamApplication() {
    cleanupManager.initialize();

    bindFinalButtons();

    await application.start();

    examLogger.info("Exam application initialized.");

    analyticsManager.track("application:initialized");
}

/* -------------------------------------------------------------------------- */
/* DOM Ready                                                                  */
/* -------------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
    await initializeExamApplication();
});

/* -------------------------------------------------------------------------- */
/* Submission Cleanup                                                         */
/* -------------------------------------------------------------------------- */

eventBus.on("exam:submitted", () => {
    if (examBootstrapManager.timer) {
        examBootstrapManager.timer.stop();
    }

    autoSaveManager.stop();

    healthCheckManager.stop();

    analyticsManager.track("cleanup:submission");

    StorageManager.remove("exam_state");

    cleanupManager.destroy();
});

/* -------------------------------------------------------------------------- */
/* Global API                                                                 */
/* -------------------------------------------------------------------------- */

window.ExamApp = Object.freeze({
    app: application,
    state: examState,
    api: ApiService,
    storage: StorageManager,
    logger: examLogger,
    diagnostics: examDiagnostics,
    analytics: analyticsManager,
    cleanup: cleanupManager,
    submit: () => examSubmissionManager.submit(),
    destroy: () => cleanupManager.destroy(),
    exportDiagnostics: () => examDiagnostics.generateReport()
});

// ===== COMPLETE exam.js =====
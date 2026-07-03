(function() {
    // ─── DOM-элементы ────────────────────────
    const urlInput = document.getElementById('urlInput');
    const btnAnalyze = document.getElementById('btnAnalyze');
    const welcomeBlock = document.getElementById('welcomeBlock');
    const resultsContainer = document.getElementById('resultsContainer');
    const iframeSection = document.getElementById('iframeSection');
    const iframeUrlDisplay = document.getElementById('iframeUrlDisplay');
    const previewIframe = document.getElementById('previewIframe');
    const iframePlaceholder = document.getElementById('iframePlaceholder');
    const reportSummary = document.getElementById('reportSummary');
    const cardsGrid = document.getElementById('cardsGrid');
    const historyList = document.getElementById('historyList');
    const btnClearHistory = document.getElementById('btnClearHistory');
    const btnArchive = document.getElementById('btnArchive');
    const btnTheme = document.getElementById('btnTheme');
    const btnPrint = document.getElementById('btnPrint');
    const btnCopy = document.getElementById('btnCopy');
    const toastContainer = document.getElementById('toastContainer');

    // ─── КОНСТАНТЫ ──────────────────────────
    const HISTORY_KEY = 'webinspector_history';
    const THEME_KEY = 'webinspector_theme';
    const MAX_HISTORY = 50;

    let currentReport = null;
    let isAnalyzing = false;

    // ========== ТЕМА =========================
    function getTheme() {
        return localStorage.getItem(THEME_KEY) || 'light';
    }
    function applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        btnTheme.textContent = theme === 'dark' ? '☀️' : '🌙';
        localStorage.setItem(THEME_KEY, theme);
    }
    function toggleTheme() {
        const current = document.body.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        showToast(next === 'dark' ? '🌙 Тёмная тема включена' : '☀️ Светлая тема включена');
    }
    applyTheme(getTheme());
    btnTheme.addEventListener('click', toggleTheme);

    // ========== TOAST-УВЕДОМЛЕНИЯ ============
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toastContainer.appendChild(toast);
        toast.addEventListener('animationend', (e) => {
            if (e.animationName === 'toastOut') toast.remove();
        });
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3200);
    }

    // ========== FAQ АККОРДЕОН ================
    function initFAQ() {
        const questions = document.querySelectorAll('.faq-question');
        questions.forEach(btn => {
            btn.addEventListener('click', () => {
                const item = btn.parentElement;
                const isOpen = item.classList.contains('open');
                document.querySelectorAll('.faq-item.open').forEach(openItem => {
                    if (openItem !== item) openItem.classList.remove('open');
                });
                item.classList.toggle('open');
            });
        });
    }

    // ========== ЭКРАНИРОВАНИЕ HTML ============
    function escapeHTML(value) {
        if (value === undefined || value === null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ========== ВАЛИДАЦИЯ URL ================
    function validateAndNormalizeURL(raw) {
        let url = raw.trim();
        if (!url) return null;
        url = url.replace(/\/+$/, '');
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        try {
            const parsed = new URL(url);
            if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null;
            if (parsed.hostname.length < 3) return null;
            return url;
        } catch { return null; }
    }

    // ========== ЗАГРУЗКА САЙТА (ПРОКСИ) ======
    async function fetchSiteHTML(url) {
        const proxyBase = 'https://api.allorigins.win/raw?url=';
        const encoded = encodeURIComponent(url);
        const proxyURL = proxyBase + encoded;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18000);
        try {
            const startTime = performance.now();
            const response = await fetch(proxyURL, {
                signal: controller.signal,
                headers: { 'Accept': 'text/html,application/xhtml+xml' }
            });
            clearTimeout(timeoutId);
            const loadTime = Math.round(performance.now() - startTime);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            const html = await response.text();
            return { html, loadTime, proxyURL };
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') throw new Error('Таймаут запроса (превышено 18 секунд).');
            throw new Error(`Не удалось загрузить сайт: ${err.message}`);
        }
    }

    // ========== ПАРСИНГ HTML =================
    function parseHTML(html, url) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const title = doc.querySelector('title')?.textContent?.trim() || '';
        const metaDescription = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
        const metaKeywords = doc.querySelector('meta[name="keywords"]')?.getAttribute('content')?.trim() || '';
        const viewportMeta = doc.querySelector('meta[name="viewport"]')?.getAttribute('content')?.trim() || '';
        const h1Count = doc.querySelectorAll('h1').length;
        const h2Count = doc.querySelectorAll('h2').length;
        const h3Count = doc.querySelectorAll('h3').length;
        const imgCount = doc.querySelectorAll('img').length;
        const linkCount = doc.querySelectorAll('a[href]').length;
        const hasSSL = url.startsWith('https://');
        const hasViewport = !!viewportMeta;
        const totalHeadings = h1Count + h2Count + h3Count;
        return { title, metaDescription, metaKeywords, viewportMeta, h1Count, h2Count, h3Count, totalHeadings, imgCount, linkCount, hasSSL, hasViewport };
    }

    // ========== ГЕНЕРАЦИЯ ОТЧЁТА =============
    function generateReport(url, parsedData, loadTime) {
        const cards = [];
        const summary = { critical: 0, warnings: 0, success: 0 };

        if (!parsedData.title) {
            cards.push({ category:'critical', icon:'❌', title:'Отсутствует title', description:'Тег <title> не найден.', detail:'Добавьте заголовок страницы для SEO.' });
            summary.critical++;
        }
        if (!parsedData.metaDescription) {
            cards.push({ category:'critical', icon:'❌', title:'Отсутствует meta-description', description:'Мета-тег description не найден.', detail:'Добавьте <meta name="description" content="...">.' });
            summary.critical++;
        }
        if (parsedData.h1Count === 0) {
            cards.push({ category:'critical', icon:'❌', title:'Отсутствует h1', description:'На странице нет тега <h1>.', detail:'Добавьте ровно один заголовок h1.' });
            summary.critical++;
        }
        if (!parsedData.hasSSL) {
            cards.push({ category:'critical', icon:'❌', title:'HTTP', description:'Нет SSL-сертификата.', detail:'Рекомендуем перейти на HTTPS.' });
            summary.critical++;
        }

        if (!parsedData.hasViewport) {
            cards.push({ category:'warning', icon:'⚠️', title:'Нет viewport', description:'Возможно, сайт не адаптирован.', detail:'Добавьте <meta name="viewport" content="width=device-width, initial-scale=1.0">.' });
            summary.warnings++;
        }
        if (parsedData.totalHeadings > 0 && parsedData.totalHeadings < 3) {
            cards.push({ category:'warning', icon:'⚠️', title:'Мало заголовков', description:`Всего ${parsedData.totalHeadings} шт.`, detail:'Добавьте больше h2–h3 для структуры.' });
            summary.warnings++;
        }
        if (parsedData.linkCount > 50) {
            cards.push({ category:'warning', icon:'⚠️', title:'Много ссылок', description:`${parsedData.linkCount} ссылок.`, detail:'Проверьте их качество.' });
            summary.warnings++;
        }
        if (parsedData.imgCount > 30) {
            cards.push({ category:'warning', icon:'⚠️', title:'Много изображений', description:`${parsedData.imgCount} шт.`, detail:'Оптимизируйте размеры и форматы.' });
            summary.warnings++;
        }
        if (loadTime > 3000) {
            cards.push({ category:'warning', icon:'⚠️', title:'Медленная загрузка', description:`${(loadTime/1000).toFixed(2)} сек.`, detail:'Ускорьте сайт.' });
            summary.warnings++;
        }

        if (parsedData.title) {
            cards.push({ category:'success', icon:'✅', title:'Title присутствует', description:`"${parsedData.title.substring(0,60)}${parsedData.title.length>60?'…':''}"`, detail:`Длина: ${parsedData.title.length} символов.` });
            summary.success++;
        }
        if (parsedData.metaDescription) {
            cards.push({ category:'success', icon:'✅', title:'Meta-description найден', description:`"${parsedData.metaDescription.substring(0,60)}${parsedData.metaDescription.length>60?'…':''}"`, detail:`Длина: ${parsedData.metaDescription.length} символов.` });
            summary.success++;
        }
        if (parsedData.h1Count === 1) {
            cards.push({ category:'success', icon:'✅', title:'Один h1', description:'Ровно один заголовок первого уровня.' });
            summary.success++;
        }
        if (parsedData.hasSSL) {
            cards.push({ category:'success', icon:'✅', title:'HTTPS', description:'Защищённое соединение.' });
            summary.success++;
        }
        if (parsedData.hasViewport) {
            cards.push({ category:'success', icon:'✅', title:'Viewport', description:'Адаптивность настроена.' });
            summary.success++;
        }
        if (parsedData.metaKeywords) {
            cards.push({ category:'success', icon:'✅', title:'Meta-keywords', description:'Ключевые слова указаны.' });
            summary.success++;
        }

        cards.push({ category:'stats', icon:'📊', title:'Заголовки', description:`h1:${parsedData.h1Count} h2:${parsedData.h2Count} h3:${parsedData.h3Count}` });
        cards.push({ category:'stats', icon:'📊', title:'Изображения', description:`${parsedData.imgCount} шт.` });
        cards.push({ category:'stats', icon:'📊', title:'Ссылки', description:`${parsedData.linkCount} шт.` });
        cards.push({ category:'stats', icon:'📊', title:'Загрузка', description:`${(loadTime/1000).toFixed(2)} сек.` });

        return { url, timestamp: new Date().toISOString(), parsedData, loadTime, cards, summary };
    }

    // ========== ОТРИСОВКА ОТЧЁТА =============
    function renderReport(report) {
        if (!report || !report.cards) {
            showToast('⚠️ Данные отчёта повреждены');
            return;
        }
        currentReport = report;
        welcomeBlock.classList.add('hidden');
        resultsContainer.classList.add('active');
        iframeSection.style.display = 'block';
        iframeUrlDisplay.textContent = report.url;
        previewIframe.src = report.url;
        iframePlaceholder.style.display = 'block';
        previewIframe.onload = () => { iframePlaceholder.style.display = 'none'; };
        setTimeout(() => { iframePlaceholder.style.display = 'none'; }, 5000);

        // Чипсы сводки
        reportSummary.innerHTML = '';
        if (report.summary.critical) {
            const chip = document.createElement('span');
            chip.className = 'summary-chip critical';
            chip.textContent = `❌ Ошибок: ${report.summary.critical}`;
            reportSummary.appendChild(chip);
        }
        if (report.summary.warnings) {
            const chip = document.createElement('span');
            chip.className = 'summary-chip warning';
            chip.textContent = `⚠️ Предупреждений: ${report.summary.warnings}`;
            reportSummary.appendChild(chip);
        }
        if (report.summary.success) {
            const chip = document.createElement('span');
            chip.className = 'summary-chip success';
            chip.textContent = `✅ Успехов: ${report.summary.success}`;
            reportSummary.appendChild(chip);
        }
        const statsChip = document.createElement('span');
        statsChip.className = 'summary-chip stats';
        statsChip.textContent = `📊 Всего: ${report.cards.length}`;
        reportSummary.appendChild(statsChip);

        // Карточки
        cardsGrid.innerHTML = '';
        report.cards.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = `card card-${card.category}`;
            cardEl.style.animationDelay = `${index * 70}ms`;
            cardEl.innerHTML = `
                <div class="card-header"><span class="card-icon">${card.icon}</span><span class="card-title">${escapeHTML(card.title)}</span></div>
                <p class="card-desc">${escapeHTML(card.description)}</p>
                <div class="card-detail">${escapeHTML(card.detail || '')}</div>
                <button class="btn-detail">Подробнее ▾</button>
            `;
            const btnDetail = cardEl.querySelector('.btn-detail');
            const detailEl = cardEl.querySelector('.card-detail');
            btnDetail.addEventListener('click', () => {
                const isOpen = detailEl.classList.contains('open');
                detailEl.classList.toggle('open');
                btnDetail.textContent = isOpen ? 'Подробнее ▾' : 'Скрыть ▴';
            });
            cardsGrid.appendChild(cardEl);
        });

        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ========== ИСТОРИЯ ======================
    function loadHistory() {
        try {
            const data = localStorage.getItem(HISTORY_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn('Ошибка загрузки истории:', e);
            return [];
        }
    }

    function saveHistory(history) {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
        } catch (e) {
            showToast('⚠️ Не удалось сохранить историю (превышен лимит?)');
            console.warn('Ошибка сохранения истории:', e);
        }
    }

    function addToHistory(report) {
        if (!report || !report.url) return;
        const history = loadHistory().filter(h => h.url !== report.url);
        history.unshift({ url: report.url, timestamp: report.timestamp, summary: report.summary, report: report });
        saveHistory(history);
        renderHistoryList();
    }

    function renderHistoryList() {
        const history = loadHistory();
        historyList.innerHTML = '';
        if (history.length === 0) {
            historyList.innerHTML = '<li class="history-empty">История пока пуста. Проведите первый анализ!</li>';
            return;
        }
        history.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'history-item';
            const date = new Date(entry.timestamp);
            const dateStr = date.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' })
                          + ' ' + date.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
            li.innerHTML = `
                <span class="history-url" title="${escapeHTML(entry.url)}">🔗 ${escapeHTML(entry.url)}</span>
                <span class="history-meta">${escapeHTML(dateStr)}</span>
                <span class="history-badges">
                    ${entry.summary && entry.summary.critical ? `<span class="history-badge err">❌${entry.summary.critical}</span>` : ''}
                    ${entry.summary && entry.summary.warnings ? `<span class="history-badge warn">⚠️${entry.summary.warnings}</span>` : ''}
                    ${entry.summary && entry.summary.success ? `<span class="history-badge ok">✅${entry.summary.success}</span>` : ''}
                </span>
            `;
            li.addEventListener('click', () => {
                if (entry.report && entry.report.cards) {
                    renderReport(entry.report);
                    showToast('📋 Загружен сохранённый отчёт');
                    window.scrollTo({ top: resultsContainer.offsetTop - 80, behavior: 'smooth' });
                } else {
                    showToast('⚠️ Данные этого отчёта повреждены');
                }
            });
            historyList.appendChild(li);
        });
    }

    function clearHistory() {
        if (confirm('Вы уверены, что хотите очистить всю историю?')) {
            localStorage.removeItem(HISTORY_KEY);
            renderHistoryList();
            showToast('🗑️ История очищена');
        }
    }

    async function archiveHistory() {
        const history = loadHistory();
        if (history.length === 0) {
            showToast('⚠️ История пуста');
            return;
        }
        if (typeof JSZip === 'undefined') {
            showToast('⚠️ Библиотека архивации не загружена. Обновите страницу.');
            return;
        }
        try {
            const zip = new JSZip();
            const folder = zip.folder('webinspector-reports');
            history.forEach(entry => {
                if (!entry.report) return;
                const date = new Date(entry.timestamp).toISOString().replace(/:/g, '-').split('.')[0];
                const safeUrl = entry.url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9\-_.]/g, '_').substring(0,50);
                folder.file(`report_${date}_${safeUrl}.json`, JSON.stringify(entry.report, null, 2));
            });
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `webinspector-archive-${new Date().toISOString().slice(0,10)}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('📦 Архив создан!');
        } catch (err) {
            showToast('⚠️ Ошибка архивации');
            console.warn(err);
        }
    }

    // ========== ЗАПУСК АНАЛИЗА ================
    async function analyzeSite(url) {
        if (isAnalyzing) return;
        isAnalyzing = true;
        btnAnalyze.classList.add('loading');
        btnAnalyze.disabled = true;
        urlInput.disabled = true;

        previewIframe.src = '';
        iframePlaceholder.style.display = 'block';
        reportSummary.innerHTML = '';
        cardsGrid.innerHTML = '';

        try {
            const { html, loadTime } = await fetchSiteHTML(url);
            const parsedData = parseHTML(html, url);
            const report = generateReport(url, parsedData, loadTime);
            renderReport(report);
            addToHistory(report);
            showToast('✅ Анализ завершён!');
        } catch (err) {
            showToast('⚠️ ' + err.message);
            const partial = { title:'', metaDescription:'', metaKeywords:'', viewportMeta:'', h1Count:0, h2Count:0, h3Count:0, totalHeadings:0, imgCount:0, linkCount:0, hasSSL:url.startsWith('https://'), hasViewport:false };
            const report = generateReport(url, partial, 0);
            report.cards.unshift({ category:'critical', icon:'❌', title:'Ошибка загрузки', description:err.message, detail:'Проверьте URL и доступность.' });
            report.summary.critical++;
            renderReport(report);
            addToHistory(report);
        } finally {
            isAnalyzing = false;
            btnAnalyze.classList.remove('loading');
            btnAnalyze.disabled = false;
            urlInput.disabled = false;
            urlInput.focus();
        }
    }

    // ========== ОБРАБОТЧИКИ ==================
    btnAnalyze.addEventListener('click', () => {
        const url = validateAndNormalizeURL(urlInput.value);
        if (!url) {
            showToast('⚠️ Введите корректный URL');
            urlInput.style.borderColor = '#ef4444';
            setTimeout(() => { urlInput.style.borderColor = ''; }, 1500);
            return;
        }
        analyzeSite(url);
    });

    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); btnAnalyze.click(); }
    });

    btnClearHistory.addEventListener('click', clearHistory);
    btnArchive.addEventListener('click', archiveHistory);

    btnPrint.addEventListener('click', () => {
        if (!currentReport) { showToast('⚠️ Сначала проведите анализ'); return; }
        const details = cardsGrid.querySelectorAll('.card-detail');
        const btns = cardsGrid.querySelectorAll('.btn-detail');
        const wasOpen = [];
        details.forEach((d, i) => { wasOpen.push(d.classList.contains('open')); d.classList.add('open'); if(btns[i]) btns[i].textContent = 'Скрыть ▴'; });
        window.print();
        details.forEach((d, i) => { if(!wasOpen[i]) { d.classList.remove('open'); if(btns[i]) btns[i].textContent = 'Подробнее ▾'; } });
    });

    btnCopy.addEventListener('click', () => {
        if (!currentReport) { showToast('⚠️ Сначала проведите анализ'); return; }
        const lines = [`📋 Отчёт: ${currentReport.url}`, `🕐 ${new Date(currentReport.timestamp).toLocaleString('ru-RU')}`, `⏱️ ${(currentReport.loadTime/1000).toFixed(2)} сек`, '', `❌${currentReport.summary.critical} ⚠️${currentReport.summary.warnings} ✅${currentReport.summary.success}`, '─'.repeat(40)];
        currentReport.cards.forEach(c => { lines.push(`${c.icon} ${c.title}`, `   ${c.description}`, c.detail ? `   💡 ${c.detail}` : '', ''); });
        const text = lines.join('\n');
        navigator.clipboard.writeText(text).then(() => showToast('📋 Скопировано!')).catch(() => showToast('⚠️ Не удалось скопировать'));
    });

    // ========== ИНИЦИАЛИЗАЦИЯ =================
    function init() {
        renderHistoryList();
        initFAQ();
        // Проверка хеша для прямой ссылки на отчёт (опционально)
        const hash = window.location.hash;
        if (hash && hash.startsWith('#report-')) {
            try {
                const decoded = JSON.parse(atob(decodeURIComponent(hash.replace('#report-', ''))));
                if (decoded && decoded.url) { renderReport(decoded); showToast('📋 Загружен отчёт из ссылки'); }
            } catch {}
        }
    }

    init();

    window.WebInspector = { getCurrentReport: () => currentReport, analyzeSite, renderReport, getHistory: loadHistory };
    console.log('🔍 WebInspector готов.');
})();
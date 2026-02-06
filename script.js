// ============================================
// TIDYBOT ARMY TIMELINE
// Activity log for autonomous coding agent
// Virtual scrolling, multi-row support
// ============================================

// Type labels and colors (EVA palette)
const typeConfig = {
    setup: { label: 'Setup', color: '#9d4edd' },
    feature: { label: 'Feature', color: '#39ff14' },
    fix: { label: 'Bug Fix', color: '#ff3366' },
    refactor: { label: 'Refactor', color: '#ff6b00' },
    test: { label: 'Testing', color: '#00d4ff' },
    docs: { label: 'Docs', color: '#6b6b7b' },
    deploy: { label: 'Deploy', color: '#ff6b00' },
    repo: { label: 'Repo', color: '#00d4ff' }
};

// Virtual scrolling config
const CARD_BUFFER = 3;

// Row configuration - which repos belong to which row
const ROW_CONFIG = {
    backend: {
        repos: ['tidybot-agent-server'],
        label: 'Backend',
        source: 'commits'  // commit-level entries from entries.json
    },
    frontend: {
        repos: [],
        label: 'Frontend',
        source: 'repos'  // repo-level entries from repos.json
    }
};

// Per-row state
const rows = {};

// Load entries from JSON file
async function loadActivityLog() {
    try {
        const response = await fetch('./logs/entries.json');

        if (!response.ok) {
            console.error('Failed to fetch entries:', response.status, response.statusText);
            throw new Error(`HTTP ${response.status}`);
        }

        const entries = await response.json();
        console.log(`Loaded ${entries.length} entries from JSON`);
        return entries;
    } catch (error) {
        console.error('Failed to load activity log:', error);
        return [];
    }
}

// Load repos from JSON file (for frontend row)
async function loadRepos() {
    try {
        const response = await fetch('./logs/repos.json');

        if (!response.ok) {
            console.error('Failed to fetch repos:', response.status, response.statusText);
            throw new Error(`HTTP ${response.status}`);
        }

        const repos = await response.json();
        console.log(`Loaded ${repos.length} repos from JSON`);

        // Convert repos to timeline entries format
        return repos.map((repo, index) => ({
            id: String(index + 1).padStart(3, '0'),
            timestamp: repo.created_at ? new Date(repo.created_at).toISOString().slice(0, 16).replace('T', ' ') : '',
            type: 'repo',
            title: repo.name,
            description: repo.description || 'No description',
            language: repo.language || 'Unknown',
            stars: repo.stars || 0,
            html_url: repo.html_url,
            updated_at: repo.updated_at ? new Date(repo.updated_at).toISOString().slice(0, 16).replace('T', ' ') : '',
            status: 'completed',
            _isRepo: true
        }));
    } catch (error) {
        console.error('Failed to load repos:', error);
        return [];
    }
}

// Filter entries by row
function filterEntriesForRow(entries, rowName) {
    const config = ROW_CONFIG[rowName];
    if (!config || config.repos.length === 0) return [];

    return entries
        .filter(e => config.repos.includes(e.repo))
        .map((entry, index) => ({
            ...entry,
            id: String(index + 1).padStart(3, '0'),
            status: 'completed'
        }));
}

// Initialize a single row
function initRow(rowName) {
    const section = document.querySelector(`.timeline-row[data-row="${rowName}"]`);
    if (!section) return;

    const row = rows[rowName];
    if (!row || row.entries.length === 0) {
        // Show empty state
        const emptyEl = section.querySelector('.row-empty');
        if (emptyEl) emptyEl.style.display = '';
        const nav = section.querySelector('.timeline-nav');
        if (nav) nav.style.display = 'none';
        return;
    }

    // Hide empty state, show nav
    const emptyEl = section.querySelector('.row-empty');
    if (emptyEl) emptyEl.style.display = 'none';
    const nav = section.querySelector('.timeline-nav');
    if (nav) nav.style.display = '';

    // Cache DOM elements for this row
    row.elements = {
        entryNumber: section.querySelector('.current-phase'),
        entryType: section.querySelector('.phase-title-text'),
        counterCurrent: section.querySelector('.counter-current'),
        eventsSlider: section.querySelector('.events-slider'),
        eventsViewport: section.querySelector('.events-viewport'),
        timelineBar: section.querySelector('.timeline-bar'),
        timelineNodes: section.querySelector('.timeline-nodes'),
        cardsRow: section.querySelector('.cards-row'),
        prevBtn: section.querySelector('.nav-btn.prev'),
        nextBtn: section.querySelector('.nav-btn.next'),
        robot: section.querySelector('.robot')
    };

    // Start at newest entry
    row.currentIndex = row.entries.length - 1;
    row.renderedRange = { start: -1, end: -1 };
    row.isAnimating = false;

    updateRenderedCards(rowName);
    updateUI(rowName);
    updateSliderPosition(rowName, false);
    bindRowEvents(rowName);

    console.log(`Row "${rowName}" loaded with ${row.entries.length} entries`);
}

// Debounce utility
function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// Virtual scrolling: render cards and nodes in visible range
function updateRenderedCards(rowName, forceRerender = false) {
    const row = rows[rowName];
    if (!row || row.entries.length === 0) return false;

    const start = Math.max(0, row.currentIndex - CARD_BUFFER);
    const end = Math.min(row.entries.length - 1, row.currentIndex + CARD_BUFFER);

    if (!forceRerender && start === row.renderedRange.start && end === row.renderedRange.end) {
        updateCardActiveStates(rowName);
        return false;
    }

    row.renderedRange = { start, end };

    const nodesHTML = [];
    const cardsHTML = [];

    for (let i = start; i <= end; i++) {
        const entry = row.entries[i];
        const isActive = i === row.currentIndex;
        const isPrev = i === row.currentIndex - 1;
        const isNext = i === row.currentIndex + 1;

        nodesHTML.push(createNodeHTML(entry, i, isActive));
        cardsHTML.push(createCardHTML(entry, i, isActive, isPrev, isNext));
    }

    row.elements.timelineNodes.innerHTML = nodesHTML.join('');
    row.elements.cardsRow.innerHTML = cardsHTML.join('');
    return true;
}

// Create HTML for a single node
function createNodeHTML(entry, index, isActive) {
    const nodeNumber = entry._isRepo
        ? entry.timestamp.split(' ')[0].slice(2, 7)  // show year-month for repos
        : entry.timestamp.split(' ')[0].slice(5);     // show month-day for commits
    const nodeTitle = entry._isRepo ? entry.title : typeConfig[entry.type].label;

    return `
        <div class="node-wrapper">
            <div class="timeline-node ${isActive ? 'active' : ''}" data-index="${index}">
                <div class="node-dot" style="--node-color: ${typeConfig[entry.type].color}">
                    <div class="node-pulse"></div>
                    <div class="node-core"></div>
                </div>
                <div class="node-label">
                    <span class="node-number">${nodeNumber}</span>
                    <span class="node-title">${nodeTitle}</span>
                </div>
            </div>
        </div>
    `;
}

// Create HTML for a single card
function createCardHTML(entry, index, isActive, isPrev, isNext) {
    let classes = 'event-card';
    if (isActive) classes += ' active';
    if (isPrev) classes += ' prev';
    if (isNext) classes += ' next-card';

    if (entry._isRepo) {
        return createRepoCardHTML(entry, index, classes);
    }

    return `
        <article class="${classes}" data-index="${index}">
            <div class="corner-bl"></div>
            <div class="event-header">
                <span class="event-number">#${entry.id}</span>
                <span class="event-date">${entry.timestamp}</span>
            </div>
            <div class="event-content">
                <span class="event-type" style="--type-color: ${typeConfig[entry.type].color}">
                    ${typeConfig[entry.type].label}
                </span>
                <h2 class="event-title">${entry.title}</h2>
                <p class="event-description">${entry.description}</p>
                <div class="event-files">
                    <span class="files-label">Files changed</span>
                    <div class="files-list">
                        ${entry.files.map(f => `<code class="file-path">${f}</code>`).join('')}
                    </div>
                </div>
            </div>
        </article>
    `;
}

// Create HTML for a repo card (frontend)
function createRepoCardHTML(entry, index, classes) {
    const createdDate = entry.timestamp ? entry.timestamp.split(' ')[0] : '';
    const updatedDate = entry.updated_at ? entry.updated_at.split(' ')[0] : '';

    return `
        <article class="${classes} repo-card" data-index="${index}">
            <div class="corner-bl"></div>
            <div class="event-header">
                <span class="event-number">#${entry.id}</span>
                <span class="event-date">${createdDate}</span>
            </div>
            <div class="event-content">
                <span class="event-type" style="--type-color: #00d4ff">
                    ${entry.language}
                </span>
                <h2 class="event-title">${entry.title}</h2>
                <p class="event-description">${entry.description}</p>
                <div class="repo-meta">
                    <span class="repo-meta-item">
                        <span class="repo-meta-label">Updated</span>
                        <span class="repo-meta-value">${updatedDate}</span>
                    </span>
                    ${entry.stars > 0 ? `
                    <span class="repo-meta-item">
                        <span class="repo-meta-label">Stars</span>
                        <span class="repo-meta-value">${entry.stars}</span>
                    </span>` : ''}
                </div>
                <a href="${entry.html_url}" target="_blank" rel="noopener noreferrer" class="repo-link-btn">
                    <span>View Repo</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <path d="M7 17L17 7M17 7H7M17 7v10"/>
                    </svg>
                </a>
            </div>
        </article>
    `;
}

// Update active states without re-rendering
function updateCardActiveStates(rowName) {
    const row = rows[rowName];
    if (!row) return;

    const section = document.querySelector(`.timeline-row[data-row="${rowName}"]`);

    section.querySelectorAll('.event-card').forEach(card => {
        const index = parseInt(card.dataset.index, 10);
        card.classList.remove('active', 'prev', 'next-card');
        if (index === row.currentIndex) card.classList.add('active');
        else if (index === row.currentIndex - 1) card.classList.add('prev');
        else if (index === row.currentIndex + 1) card.classList.add('next-card');
    });

    section.querySelectorAll('.timeline-node').forEach(node => {
        const index = parseInt(node.dataset.index, 10);
        node.classList.toggle('active', index === row.currentIndex);
    });
}

// Update all UI elements for a row
function updateUI(rowName) {
    const row = rows[rowName];
    if (!row || row.entries.length === 0) return;

    const entry = row.entries[row.currentIndex];

    animateText(row.elements.entryNumber, String(row.currentIndex + 1).padStart(3, '0'));
    animateText(row.elements.entryType, typeConfig[entry.type].label);

    if (row.elements.counterCurrent) {
        row.elements.counterCurrent.textContent = `#${String(row.currentIndex + 1).padStart(3, '0')}`;
    }

    row.elements.prevBtn.disabled = row.currentIndex === 0;
    row.elements.nextBtn.disabled = row.currentIndex === row.entries.length - 1;
}

// Animate text change
function animateText(element, newText) {
    if (!element || element.textContent === newText) return;
    element.style.opacity = '0';
    element.style.transform = 'translateY(10px)';
    setTimeout(() => {
        element.textContent = newText;
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
    }, 200);
}

// Navigation
function goToIndex(rowName, index) {
    const row = rows[rowName];
    if (!row || row.isAnimating || index < 0 || index >= row.entries.length) return;

    row.isAnimating = true;
    row.currentIndex = index;

    const isRendered = index >= row.renderedRange.start && index <= row.renderedRange.end;

    if (isRendered) {
        updateCardActiveStates(rowName);
        updateSliderPosition(rowName, true);
        updateUI(rowName);

        setTimeout(() => {
            const didRerender = updateRenderedCards(rowName);
            if (didRerender) updateSliderPosition(rowName, false);
            row.isAnimating = false;
        }, 750);
    } else {
        row.elements.eventsSlider.style.transition = 'none';
        updateRenderedCards(rowName, true);

        const cards = row.elements.cardsRow.querySelectorAll('.event-card');
        const cardWidth = cards[0]?.offsetWidth || 500;
        const gap = 24;
        const startOffset = (CARD_BUFFER - 1) * (cardWidth + gap);
        row.elements.eventsSlider.style.transform = `translateX(-${startOffset}px)`;
        row.elements.eventsSlider.offsetHeight;
        row.elements.eventsSlider.style.transition = '';

        requestAnimationFrame(() => {
            updateSliderPosition(rowName, true);
            updateUI(rowName);
        });

        setTimeout(() => { row.isAnimating = false; }, 750);
    }
}

// Update slider position
function updateSliderPosition(rowName, animate = true) {
    const row = rows[rowName];
    if (!row) return;

    const cards = row.elements.cardsRow.querySelectorAll('.event-card');
    if (cards.length === 0) return;

    let activeCardIndex = -1;
    cards.forEach((card, i) => {
        if (parseInt(card.dataset.index, 10) === row.currentIndex) activeCardIndex = i;
    });
    if (activeCardIndex === -1) return;

    const card = cards[activeCardIndex];
    const cardWidth = card.offsetWidth;
    const gap = 24;
    const offset = activeCardIndex * (cardWidth + gap);

    if (!animate) {
        row.elements.eventsSlider.style.transition = 'none';
        row.elements.eventsSlider.style.transform = `translateX(-${offset}px)`;
        row.elements.eventsSlider.offsetHeight;
        row.elements.eventsSlider.style.transition = '';
    } else {
        row.elements.eventsSlider.style.transform = `translateX(-${offset}px)`;
    }
}

// Bind events for a specific row
function bindRowEvents(rowName) {
    const row = rows[rowName];
    if (!row) return;

    row.elements.prevBtn.addEventListener('click', () => {
        if (row.currentIndex > 0) goToIndex(rowName, row.currentIndex - 1);
    });

    row.elements.nextBtn.addEventListener('click', () => {
        if (row.currentIndex < row.entries.length - 1) goToIndex(rowName, row.currentIndex + 1);
    });

    row.elements.timelineNodes.addEventListener('click', (e) => {
        const node = e.target.closest('.timeline-node');
        if (node) goToIndex(rowName, parseInt(node.dataset.index, 10));
    });

    // Mouse wheel on this row's viewport
    row.elements.eventsViewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY > 0) {
            if (row.currentIndex < row.entries.length - 1) goToIndex(rowName, row.currentIndex + 1);
        } else {
            if (row.currentIndex > 0) goToIndex(rowName, row.currentIndex - 1);
        }
    }, { passive: false });
}

// Mouse tracking for card hover effect
function initMouseTracking() {
    document.addEventListener('mousemove', (e) => {
        document.querySelectorAll('.event-card').forEach(card => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mouse-x', `${((e.clientX - rect.left) / rect.width) * 100}%`);
            card.style.setProperty('--mouse-y', `${((e.clientY - rect.top) / rect.height) * 100}%`);
        });
    });
}

// Generate single-layer honeycomb with varied styles
function initHoneycomb() {
    const container = document.querySelector('.honeycomb-bg');
    if (!container) return;

    const colors = ['#ff6b00', '#ff6b00', '#7b2cbf', '#39ff14'];

    const hexRadius = 45;
    const hexW = Math.sqrt(3) * hexRadius;
    const hexH = 2 * hexRadius;
    const horizSpacing = hexW;
    const vertSpacing = hexH * 0.75;

    const cols = Math.ceil(window.innerWidth / horizSpacing) + 4;
    const rowCount = Math.ceil(window.innerHeight / vertSpacing) + 4;

    const svgWidth = cols * horizSpacing + hexW;
    const svgHeight = rowCount * vertSpacing + hexH;

    let paths = '';

    const grid = [];
    for (let y = 0; y < rowCount; y++) {
        grid[y] = [];
        for (let x = 0; x < cols; x++) {
            grid[y][x] = false;
        }
    }

    const numSeeds = 12 + Math.floor(Math.random() * 8);
    const seeds = [];
    for (let i = 0; i < numSeeds; i++) {
        seeds.push({
            x: Math.floor(Math.random() * cols),
            y: Math.floor(Math.random() * rowCount)
        });
    }

    seeds.forEach(seed => {
        const clusterSize = 8 + Math.floor(Math.random() * 25);
        const toVisit = [seed];
        let added = 0;

        while (toVisit.length > 0 && added < clusterSize) {
            const idx = Math.floor(Math.random() * toVisit.length);
            const cell = toVisit.splice(idx, 1)[0];

            if (cell.x < 0 || cell.x >= cols || cell.y < 0 || cell.y >= rowCount) continue;
            if (grid[cell.y][cell.x]) continue;

            grid[cell.y][cell.x] = true;
            added++;

            const neighbors = cell.y % 2 === 0
                ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1]]
                : [[-1, 0], [1, 0], [0, -1], [0, 1], [1, -1], [1, 1]];

            neighbors.forEach(([dx, dy]) => {
                if (Math.random() < 0.7) {
                    toVisit.push({ x: cell.x + dx, y: cell.y + dy });
                }
            });
        }
    });

    for (let y = 0; y < rowCount; y++) {
        for (let x = 0; x < cols; x++) {
            if (!grid[y][x]) continue;

            const px = x * horizSpacing + (y % 2) * (horizSpacing / 2) + hexRadius;
            const py = y * vertSpacing + hexRadius;

            const color = colors[Math.floor(Math.random() * colors.length)];
            const style = Math.random();
            const opacity = 0.4 + Math.random() * 0.6;
            const r = hexRadius;
            const hw = r * Math.sqrt(3) / 2;

            const hexPath = `M${px} ${py - r}L${px + hw} ${py - r/2}L${px + hw} ${py + r/2}L${px} ${py + r}L${px - hw} ${py + r/2}L${px - hw} ${py - r/2}Z`;

            if (style < 0.3) {
                paths += `<path d="${hexPath}" fill="none" stroke="${color}" stroke-width="1.5" opacity="${opacity}"/>`;
            } else if (style < 0.5) {
                paths += `<path d="${hexPath}" fill="${color}" opacity="${opacity * 0.25}"/>`;
            } else if (style < 0.65) {
                const patternId = `stripe-${x}-${y}`;
                paths += `<defs><pattern id="${patternId}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="${color}" stroke-width="1.5" opacity="${opacity}"/>
                </pattern></defs>`;
                paths += `<path d="${hexPath}" fill="url(#${patternId})"/>`;
            } else if (style < 0.85) {
                const edges = [
                    `M${px} ${py - r}L${px + hw} ${py - r/2}`,
                    `M${px + hw} ${py - r/2}L${px + hw} ${py + r/2}`,
                    `M${px + hw} ${py + r/2}L${px} ${py + r}`,
                    `M${px} ${py + r}L${px - hw} ${py + r/2}`,
                    `M${px - hw} ${py + r/2}L${px - hw} ${py - r/2}`,
                    `M${px - hw} ${py - r/2}L${px} ${py - r}`
                ];
                const numEdges = 2 + Math.floor(Math.random() * 3);
                const startEdge = Math.floor(Math.random() * 6);
                for (let e = 0; e < numEdges; e++) {
                    paths += `<path d="${edges[(startEdge + e) % 6]}" stroke="${color}" stroke-width="1.5" opacity="${opacity}" stroke-linecap="round"/>`;
                }
            } else {
                paths += `<path d="${hexPath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 4" opacity="${opacity}"/>`;
            }
        }
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'hex-layer';
    wrapper.innerHTML = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
    container.appendChild(wrapper);
}

// Mouse float effect for honeycomb background
function initParallax() {
    const honeycomb = document.querySelector('.honeycomb-bg');
    if (!honeycomb) return;

    document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 15;
        const y = (e.clientY / window.innerHeight - 0.5) * 15;
        honeycomb.style.transform = `translate(${x}px, ${y}px)`;
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize background
    initHoneycomb();
    initParallax();
    initMouseTracking();

    // Load all entries (commits) and repos in parallel
    const [allEntries, repoEntries] = await Promise.all([
        loadActivityLog(),
        loadRepos()
    ]);

    // Setup each row
    for (const rowName of Object.keys(ROW_CONFIG)) {
        const config = ROW_CONFIG[rowName];
        let entries;

        if (config.source === 'repos') {
            // Frontend row uses repo-level entries
            entries = repoEntries;
        } else {
            // Backend row uses commit-level entries
            entries = filterEntriesForRow(allEntries, rowName);
        }

        rows[rowName] = { entries };
        initRow(rowName);
    }

    // Keyboard navigation - affects the most recently interacted row
    let activeRow = 'backend';
    document.querySelectorAll('.timeline-row').forEach(section => {
        section.addEventListener('mouseenter', () => {
            activeRow = section.dataset.row;
        });
    });

    document.addEventListener('keydown', (e) => {
        const row = rows[activeRow];
        if (!row || row.entries.length === 0) return;
        if (e.key === 'ArrowLeft' && row.currentIndex > 0) goToIndex(activeRow, row.currentIndex - 1);
        if (e.key === 'ArrowRight' && row.currentIndex < row.entries.length - 1) goToIndex(activeRow, row.currentIndex + 1);
    });

    // Resize handler
    window.addEventListener('resize', debounce(() => {
        for (const rowName of Object.keys(rows)) {
            if (rows[rowName].entries.length > 0) {
                updateSliderPosition(rowName, false);
            }
        }
    }, 100));
});

// Export API
window.TidyBotTimeline = {
    goToIndex,
    getRow: (name) => rows[name],
    getRowNames: () => Object.keys(rows),
    reload: async () => {
        const [allEntries, repoEntries] = await Promise.all([
            loadActivityLog(),
            loadRepos()
        ]);
        for (const rowName of Object.keys(ROW_CONFIG)) {
            const config = ROW_CONFIG[rowName];
            const entries = config.source === 'repos'
                ? repoEntries
                : filterEntriesForRow(allEntries, rowName);
            rows[rowName] = { entries };
            initRow(rowName);
        }
    }
};

// ============================================
// TIDYBOT ARMY — HEX GALLERY TIMELINE
// Two galleries (backend / frontend) with
// scattered hexes, popup overlay detail view
// ============================================

const typeConfig = {
    setup:    { label: 'Setup',    color: '#9d4edd' },
    feature:  { label: 'Feature',  color: '#39ff14' },
    fix:      { label: 'Bug Fix',  color: '#ff3366' },
    refactor: { label: 'Refactor', color: '#ff6b00' },
    test:     { label: 'Testing',  color: '#00d4ff' },
    docs:     { label: 'Docs',     color: '#6b6b7b' },
    deploy:   { label: 'Deploy',   color: '#ff6b00' },
    repo:     { label: 'Repo',     color: '#00d4ff' }
};

const HEX_SIZES = {
    xl: { w: 270, h: 310 },
    lg: { w: 210, h: 242 },
    md: { w: 155, h: 178 },
    sm: { w: 110, h: 127 },
    xs: { w: 80,  h: 92 }
};

// ============================================
// LAYOUT CONFIG
// ============================================

function getLayoutConfig() {
    const w = window.innerWidth;
    if (w <= 600)  return { sizeScale: 0.55, baseSpacing: 110, galleryH: 440, padX: 50,  minGap: 14, lineGap: 14 };
    if (w <= 968)  return { sizeScale: 0.72, baseSpacing: 145, galleryH: 550, padX: 90,  minGap: 18, lineGap: 16 };
    return                { sizeScale: 1,    baseSpacing: 190, galleryH: 700, padX: 160, minGap: 24, lineGap: 20 };
}

// ============================================
// STATE
// ============================================

const galleries = {};       // keyed by name
let activePopup = null;     // { galleryName, index } | null
let layoutConfig = getLayoutConfig();

// ============================================
// DATA LOADING
// ============================================

async function loadActivityLog() {
    try {
        const r = await fetch('./logs/entries.json');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } catch (e) {
        console.error('Failed to load entries:', e);
        return [];
    }
}

async function loadRepos() {
    try {
        const r = await fetch('./logs/repos.json');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const repos = await r.json();
        return repos.map((repo, i) => ({
            id: String(i + 1).padStart(3, '0'),
            timestamp: repo.created_at
                ? new Date(repo.created_at).toISOString().slice(0, 16).replace('T', ' ')
                : '',
            type: 'repo',
            title: repo.name,
            description: repo.description || 'No description',
            language: repo.language || 'Unknown',
            stars: repo.stars || 0,
            html_url: repo.html_url,
            updated_at: repo.updated_at
                ? new Date(repo.updated_at).toISOString().slice(0, 16).replace('T', ' ')
                : '',
            success_rate: repo.success_rate ?? null,
            total_trials: repo.total_trials ?? null,
            institutions_tested: repo.institutions_tested ?? null,
            _isRepo: true
        }));
    } catch (e) {
        console.error('Failed to load repos:', e);
        return [];
    }
}

function prepareEntries(entries) {
    const sorted = [...entries].sort((a, b) => {
        const tA = a.timestamp ? a.timestamp.replace(' ', 'T') : '';
        const tB = b.timestamp ? b.timestamp.replace(' ', 'T') : '';
        return new Date(tA) - new Date(tB);
    });
    return sorted.map((e, i) => ({ ...e, id: String(i + 1).padStart(3, '0') }));
}

// ============================================
// LAYOUT: HEX POSITIONING
// ============================================

function getHexSizeClass(entry, index) {
    const hash = ((index * 2654435761) >>> 0) % 100;
    switch (entry.type) {
        case 'feature': case 'deploy':
            if (hash < 35) return 'xl';
            if (hash < 70) return 'lg';
            return 'md';
        case 'setup': case 'repo': case 'refactor':
            if (hash < 10) return 'xl';
            if (hash < 30) return 'lg';
            if (hash < 65) return 'md';
            if (hash < 85) return 'sm';
            return 'xs';
        default:
            if (hash < 5) return 'lg';
            if (hash < 25) return 'md';
            if (hash < 60) return 'sm';
            return 'xs';
    }
}

function getScaledSize(sizeClass, cfg) {
    const b = HEX_SIZES[sizeClass];
    return { w: Math.round(b.w * cfg.sizeScale), h: Math.round(b.h * cfg.sizeScale) };
}

function computeHexY(index, hexH, cfg) {
    const lineY = cfg.galleryH / 2;
    const edgePad = 12;

    // Pseudo-random 0..1 from index (deterministic)
    const raw = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    const frac = raw - Math.floor(raw);

    // Alternate sides: even above, odd below
    if (index % 2 === 0) {
        // Above line: center from edge to (lineY - halfH - lineGap)
        const closest = lineY - hexH / 2 - cfg.lineGap;
        const farthest = hexH / 2 + edgePad;
        return farthest + frac * (closest - farthest);
    } else {
        // Below line: center from (lineY + halfH + lineGap) to bottom edge
        const closest = lineY + hexH / 2 + cfg.lineGap;
        const farthest = cfg.galleryH - hexH / 2 - edgePad;
        return closest + frac * (farthest - closest);
    }
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh, gap) {
    return Math.abs(ax - bx) < (aw + bw) / 2 + gap &&
           Math.abs(ay - by) < (ah + bh) / 2 + gap;
}

function computeLayout(entries, cfg) {
    const positions = [];

    entries.forEach((entry, i) => {
        const sizeClass = getHexSizeClass(entry, i);
        const size = getScaledSize(sizeClass, cfg);
        const y = computeHexY(i, size.h, cfg);

        const jitter = ((i * 73 + 17) % 81) - 40;
        let x = cfg.padX + i * cfg.baseSpacing + jitter;

        // Resolve overlaps
        let iter = 0;
        while (iter < 80) {
            let hit = false;
            for (const p of positions) {
                if (rectsOverlap(x, y, size.w, size.h, p.x, p.y, p.w, p.h, cfg.minGap)) {
                    x = p.x + (p.w + size.w) / 2 + cfg.minGap;
                    hit = true;
                    break;
                }
            }
            if (!hit) break;
            iter++;
        }

        positions.push({ x, y, w: size.w, h: size.h, sizeClass, entry, index: i });
    });

    return positions;
}

// ============================================
// RENDERING
// ============================================

function renderGallery(name) {
    const g = galleries[name];
    if (!g) return;
    const cfg = layoutConfig;
    const lineY = cfg.galleryH / 2;

    g.viewport.style.height = cfg.galleryH + 'px';
    g.hexLayout = computeLayout(g.entries, cfg);

    let maxX = cfg.padX;
    for (const h of g.hexLayout) {
        const r = h.x + h.w / 2;
        if (r > maxX) maxX = r;
    }
    const totalW = maxX + cfg.padX;
    g.track.style.width = totalW + 'px';
    g.scrollMax = Math.max(0, totalW - g.viewport.offsetWidth);

    let html = '';

    // Timeline line
    html += `<div class="gallery-line" style="top:${lineY}px;"></div>`;

    // Robot at end of line
    const robotType = name === 'frontend' ? 'cyan' : 'purple';
    const robotX = totalW - cfg.padX * 0.6;
    html += createRobotHTML(robotType, robotX, lineY);

    // Connectors
    g.hexLayout.forEach((hex, i) => {
        const hexBottom = hex.y + hex.h / 2;
        const hexTop = hex.y - hex.h / 2;
        let connTop, connH;

        if (hex.y < lineY) {
            connTop = hexBottom;
            connH = lineY - hexBottom;
        } else {
            connTop = lineY;
            connH = hexTop - lineY;
        }

        if (connH > 2) {
            html += `<div class="hex-connector" data-gallery="${name}" data-index="${i}"
                style="left:${hex.x}px;top:${connTop}px;height:${connH}px;"></div>`;
        }
    });

    // Dots on line
    g.hexLayout.forEach((hex, i) => {
        html += `<div class="hex-dot" data-gallery="${name}" data-index="${i}"
            style="left:${hex.x}px;top:${lineY}px;"></div>`;
    });

    // Hex cards
    g.hexLayout.forEach((hex, i) => {
        const entry = hex.entry;
        const hexLeft = hex.x - hex.w / 2;
        const hexTop = hex.y - hex.h / 2;
        const typeColor = typeConfig[entry.type]?.color || '#ff6b00';
        const typeLabel = typeConfig[entry.type]?.label || entry.type;
        const dateStr = entry.timestamp ? entry.timestamp.split(' ')[0].slice(5) : '';
        const title = entry.title || 'Untitled';
        const maxLen = { xl: 44, lg: 36, md: 28, sm: 20, xs: 14 }[hex.sizeClass] || 28;
        const titleDisplay = title.length > maxLen ? title.slice(0, maxLen - 2) + '…' : title;
        const repoName = entry.repo ? entry.repo.replace('tidybot-', '') : '';
        const floatDelay = ((i * 0.7) % 5).toFixed(1);
        const patternIdx = i % 4;
        const hasImage = entry.image ? 'has-image' : '';
        const bgStyle = entry.image ? `background-image:url(${entry.image});` : '';

        html += `<div class="hex-card hex-${hex.sizeClass}" data-gallery="${name}" data-index="${i}"
            style="left:${hexLeft}px;top:${hexTop}px;width:${hex.w}px;height:${hex.h}px;
                   --float-delay:${floatDelay}s;">
            <div class="hex-border">
                <div class="hex-inner">
                    <div class="hex-bg pattern-${patternIdx} ${hasImage}"
                         style="--type-color:${typeColor};${bgStyle}"></div>
                    <div class="hex-content">
                        <span class="hex-type" style="color:${typeColor};">${typeLabel}</span>
                        <h3 class="hex-title">${titleDisplay}</h3>
                        <span class="hex-date">${dateStr}</span>
                        ${entry.success_rate != null ? `<span class="hex-rate">Success ${entry.success_rate}%</span>` : ''}
                        ${repoName ? `<span class="hex-repo">${repoName}</span>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    });

    g.track.innerHTML = html;

    // Count
    if (g.countEl) g.countEl.textContent = `${g.entries.length} entries`;

    // Staggered entrance
    g.track.querySelectorAll('.hex-card').forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 35);
    });
}

function createRobotHTML(type, x, lineY) {
    if (type === 'purple') {
        return `<div class="gallery-robot robot-purple" style="left:${x}px;top:${lineY}px;">
            <div class="robot-antenna"></div>
            <div class="robot-head">
                <div class="robot-eye left"></div>
                <div class="robot-eye right"></div>
            </div>
            <div class="robot-body">
                <div class="robot-wheel left"></div>
                <div class="robot-wheel right"></div>
            </div>
        </div>`;
    }
    return `<div class="gallery-robot robot-cyan" style="left:${x}px;top:${lineY}px;">
        <div class="robot-alt-flag"></div>
        <div class="robot-alt-head">
            <div class="robot-alt-visor"></div>
        </div>
        <div class="robot-alt-body">
            <div class="robot-alt-chest"></div>
            <div class="robot-wheel left"></div>
            <div class="robot-wheel right"></div>
        </div>
    </div>`;
}

// ============================================
// SCROLLING
// ============================================

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function tick() {
    for (const name in galleries) {
        const g = galleries[name];
        const dx = g.scrollTarget - g.scrollPos;
        if (Math.abs(dx) > 0.5) {
            g.scrollPos += dx * 0.12;
        } else {
            g.scrollPos = g.scrollTarget;
        }
        g.track.style.transform = `translateX(${-g.scrollPos}px)`;

        if (g.progressFill) {
            const pct = g.scrollMax > 0 ? (g.scrollPos / g.scrollMax) * 100 : 0;
            g.progressFill.style.width = `${pct}%`;
        }
    }
    requestAnimationFrame(tick);
}

// ============================================
// POPUP
// ============================================

function openPopup(galleryName, index) {
    const g = galleries[galleryName];
    if (!g) return;
    const entry = g.entries[index];
    if (!entry) return;

    // Deselect previous
    if (activePopup) {
        deactivateHex(activePopup.galleryName, activePopup.index);
    }

    // Activate new
    activePopup = { galleryName, index };
    activateHex(galleryName, index);

    // Center scroll on hex
    const hex = g.hexLayout[index];
    if (hex) {
        g.scrollTarget = clamp(hex.x - g.viewport.offsetWidth / 2, 0, g.scrollMax);
    }

    // Build popup content
    const typeColor = typeConfig[entry.type]?.color || '#ff6b00';
    const typeLabel = typeConfig[entry.type]?.label || entry.type;

    let filesHTML = '';
    if (entry.files && entry.files.length > 0) {
        filesHTML = `<div class="popup-files">
            <span class="popup-files-label">Files changed</span>
            <div class="popup-files-list">
                ${entry.files.map(f => `<code class="popup-file">${f}</code>`).join('')}
            </div>
        </div>`;
    }

    let repoMeta = '';
    if (entry._isRepo) {
        repoMeta = `<div class="popup-files">
            <span class="popup-files-label">Language</span>
            <div class="popup-files-list">
                <code class="popup-file">${entry.language || 'Unknown'}</code>
            </div>
        </div>`;
        if (entry.success_rate != null) {
            repoMeta += `<div class="popup-stats">
                <div class="popup-stat">
                    <span class="popup-stat-value" style="color:${typeColor};">${entry.success_rate}%</span>
                    <span class="popup-stat-label">Success Rate</span>
                </div>
                <div class="popup-stat">
                    <span class="popup-stat-value">${entry.total_trials ?? '—'}</span>
                    <span class="popup-stat-label">Total Trials</span>
                </div>
                <div class="popup-stat">
                    <span class="popup-stat-value">${entry.institutions_tested ?? '—'}</span>
                    <span class="popup-stat-label">Institutions</span>
                </div>
            </div>`;
        }
    }

    let repoLink = '';
    if (entry._isRepo && entry.html_url) {
        repoLink = `<a href="${entry.html_url}" target="_blank" rel="noopener noreferrer" class="popup-repo-link">View Repo →</a>`;
    }

    let imageHTML = '';
    if (entry.image) {
        imageHTML = `<div class="popup-image"><img src="${entry.image}" alt="${entry.title}"></div>`;
    }

    document.getElementById('popup-inner').innerHTML = `
        <div class="popup-header">
            <span class="popup-number" style="color:${typeColor};">#${entry.id}</span>
            <span class="popup-type" style="--type-color:${typeColor};">${typeLabel}</span>
            <span class="popup-date">${entry.timestamp || ''}</span>
        </div>
        ${imageHTML}
        <h2 class="popup-title">${entry.title}</h2>
        <p class="popup-desc">${entry.description}</p>
        ${filesHTML}
        ${repoMeta}
        ${repoLink}
    `;

    document.getElementById('popup-overlay').classList.add('open');
}

function closePopup() {
    document.getElementById('popup-overlay').classList.remove('open');
    if (activePopup) {
        deactivateHex(activePopup.galleryName, activePopup.index);
        activePopup = null;
    }
}

function activateHex(galleryName, index) {
    const section = galleries[galleryName]?.section;
    if (!section) return;
    section.querySelectorAll(`[data-index="${index}"]`).forEach(el => el.classList.add('active'));
}

function deactivateHex(galleryName, index) {
    const section = galleries[galleryName]?.section;
    if (!section) return;
    section.querySelectorAll(`[data-index="${index}"]`).forEach(el => el.classList.remove('active'));
}

// ============================================
// EVENTS
// ============================================

function setupGalleryEvents(name) {
    const g = galleries[name];
    let dragMoved = false;

    // Mouse drag
    g.viewport.addEventListener('mousedown', (e) => {
        g.dragging = true;
        dragMoved = false;
        g.dragX = e.clientX;
        g.dragScroll = g.scrollTarget;
    });

    window.addEventListener('mousemove', (e) => {
        if (!g.dragging) return;
        const dx = g.dragX - e.clientX;
        if (Math.abs(dx) > 4) {
            dragMoved = true;
            g.viewport.style.cursor = 'grabbing';
        }
        g.scrollTarget = clamp(g.dragScroll + dx, 0, g.scrollMax);
    });

    window.addEventListener('mouseup', () => {
        if (g.dragging) {
            g.dragging = false;
            g.viewport.style.cursor = 'grab';
        }
    });

    // Touch
    g.viewport.addEventListener('touchstart', (e) => {
        g.dragging = true;
        dragMoved = false;
        g.dragX = e.touches[0].clientX;
        g.dragScroll = g.scrollTarget;
    }, { passive: true });

    g.viewport.addEventListener('touchmove', (e) => {
        if (!g.dragging) return;
        const dx = g.dragX - e.touches[0].clientX;
        if (Math.abs(dx) > 4) dragMoved = true;
        e.preventDefault();
        g.scrollTarget = clamp(g.dragScroll + dx, 0, g.scrollMax);
    }, { passive: false });

    g.viewport.addEventListener('touchend', () => { g.dragging = false; });

    // Click
    g.viewport.addEventListener('click', (e) => {
        if (dragMoved) return;
        const hex = e.target.closest('.hex-card');
        if (hex) { openPopup(name, parseInt(hex.dataset.index, 10)); return; }
        const dot = e.target.closest('.hex-dot');
        if (dot) { openPopup(name, parseInt(dot.dataset.index, 10)); return; }
    });
}

function setupGlobalEvents() {
    // Popup close
    document.getElementById('popup-backdrop').addEventListener('click', closePopup);
    document.getElementById('popup-close').addEventListener('click', closePopup);

    // Global wheel: block browser-back gesture & route horizontal to galleries
    window.addEventListener('wheel', (e) => {
        const ax = Math.abs(e.deltaX);
        const ay = Math.abs(e.deltaY);

        // Strict horizontal detection: must be clearly horizontal, not a slight diagonal
        if (ax < 3 || ax < ay * 2) return; // let vertical / diagonal scroll through normally

        // This is a horizontal-dominant gesture — always block browser back
        e.preventDefault();

        // Find if cursor is within a gallery section
        for (const name in galleries) {
            const g = galleries[name];
            const rect = g.section.getBoundingClientRect();
            if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                g.scrollTarget = clamp(g.scrollTarget + e.deltaX, 0, g.scrollMax);
                break;
            }
        }
    }, { passive: false });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePopup();
        if (e.key === 'ArrowRight') {
            for (const n in galleries) {
                galleries[n].scrollTarget = clamp(galleries[n].scrollTarget + 200, 0, galleries[n].scrollMax);
            }
        }
        if (e.key === 'ArrowLeft') {
            for (const n in galleries) {
                galleries[n].scrollTarget = clamp(galleries[n].scrollTarget - 200, 0, galleries[n].scrollMax);
            }
        }
    });

    // Resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            layoutConfig = getLayoutConfig();
            for (const name in galleries) {
                const g = galleries[name];
                const frac = g.scrollMax > 0 ? g.scrollPos / g.scrollMax : 0;
                renderGallery(name);
                g.scrollTarget = g.scrollMax * frac;
                g.scrollPos = g.scrollTarget;
            }
        }, 150);
    });
}

// ============================================
// HONEYCOMB BACKGROUND
// ============================================

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
        for (let x = 0; x < cols; x++) grid[y][x] = false;
    }

    const numSeeds = 12 + Math.floor(Math.random() * 8);
    for (let i = 0; i < numSeeds; i++) {
        const seed = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rowCount) };
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
            const nb = cell.y % 2 === 0
                ? [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1]]
                : [[-1,0],[1,0],[0,-1],[0,1],[1,-1],[1,1]];
            nb.forEach(([dx,dy]) => { if (Math.random()<0.7) toVisit.push({x:cell.x+dx,y:cell.y+dy}); });
        }
    }

    for (let y = 0; y < rowCount; y++) {
        for (let x = 0; x < cols; x++) {
            if (!grid[y][x]) continue;
            const px = x * horizSpacing + (y % 2) * (horizSpacing / 2) + hexRadius;
            const py = y * vertSpacing + hexRadius;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const style = Math.random();
            const opacity = 0.4 + Math.random() * 0.6;
            const r = hexRadius, hw = r * Math.sqrt(3) / 2;
            const hp = `M${px} ${py-r}L${px+hw} ${py-r/2}L${px+hw} ${py+r/2}L${px} ${py+r}L${px-hw} ${py+r/2}L${px-hw} ${py-r/2}Z`;

            if (style < 0.3) {
                paths += `<path d="${hp}" fill="none" stroke="${color}" stroke-width="1.5" opacity="${opacity}"/>`;
            } else if (style < 0.5) {
                paths += `<path d="${hp}" fill="${color}" opacity="${opacity*0.25}"/>`;
            } else if (style < 0.65) {
                const pid = `s-${x}-${y}`;
                paths += `<defs><pattern id="${pid}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${color}" stroke-width="1.5" opacity="${opacity}"/></pattern></defs>`;
                paths += `<path d="${hp}" fill="url(#${pid})"/>`;
            } else if (style < 0.85) {
                const edges = [
                    `M${px} ${py-r}L${px+hw} ${py-r/2}`,`M${px+hw} ${py-r/2}L${px+hw} ${py+r/2}`,
                    `M${px+hw} ${py+r/2}L${px} ${py+r}`,`M${px} ${py+r}L${px-hw} ${py+r/2}`,
                    `M${px-hw} ${py+r/2}L${px-hw} ${py-r/2}`,`M${px-hw} ${py-r/2}L${px} ${py-r}`
                ];
                const n = 2+Math.floor(Math.random()*3), s = Math.floor(Math.random()*6);
                for (let e=0;e<n;e++) paths += `<path d="${edges[(s+e)%6]}" stroke="${color}" stroke-width="1.5" opacity="${opacity}" stroke-linecap="round"/>`;
            } else {
                paths += `<path d="${hp}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 4" opacity="${opacity}"/>`;
            }
        }
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'hex-layer';
    wrapper.innerHTML = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
    container.appendChild(wrapper);
}

function initParallax() {
    const honeycomb = document.querySelector('.honeycomb-bg');
    if (!honeycomb) return;
    document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 15;
        const y = (e.clientY / window.innerHeight - 0.5) * 15;
        honeycomb.style.transform = `translate(${x}px, ${y}px)`;
    });
}

// ============================================
// INIT
// ============================================

function initGallery(name, entries) {
    const section = document.querySelector(`.gallery-section[data-gallery="${name}"]`);
    if (!section) return;

    galleries[name] = {
        entries,
        hexLayout: [],
        scrollPos: 0,
        scrollTarget: 0,
        scrollMax: 0,
        dragging: false,
        dragX: 0,
        dragScroll: 0,
        section,
        viewport: section.querySelector('.gallery-viewport'),
        track: section.querySelector('.gallery-track'),
        progressFill: section.querySelector('.gallery-progress-fill'),
        countEl: section.querySelector('.gallery-count')
    };

    renderGallery(name);
    setupGalleryEvents(name);

    // Start scrolled to end (most recent)
    const g = galleries[name];
    g.scrollTarget = g.scrollMax;
    g.scrollPos = g.scrollMax;
}

document.addEventListener('DOMContentLoaded', async () => {
    initHoneycomb();
    initParallax();

    const [commits, repos] = await Promise.all([loadActivityLog(), loadRepos()]);

    // Backend: all commits
    initGallery('backend', prepareEntries(commits));

    // Frontend: repos
    initGallery('frontend', prepareEntries(repos));

    setupGlobalEvents();
    tick();
});

// Export
window.TidyBotTimeline = {
    openEntry: (gallery, index) => openPopup(gallery, index),
    getGallery: (name) => galleries[name],
    reload: async () => {
        const [commits, repos] = await Promise.all([loadActivityLog(), loadRepos()]);
        galleries.backend && (galleries.backend.entries = prepareEntries(commits));
        galleries.frontend && (galleries.frontend.entries = prepareEntries(repos));
        for (const n in galleries) renderGallery(n);
    }
};

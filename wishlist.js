// ============================================
// WISHLIST — Interactive skill voting overlay
// Google Identity Services + Apps Script proxy
// ============================================

const WISHLIST_CONFIG = {
    // Replace these with your actual values after setup
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby_FdhP9SSO_Uze6I_O3LcfYdgMa5kCD-AR7Lu2octrKurZY-gm6D-E73PIs1jUR-4XJA/exec',  // Your deployed Apps Script Web App URL
    CLIENT_ID: '578982718313-aaha11s9ftmn9sqg4hf90df5olpjfrg8.apps.googleusercontent.com'         // Your Google OAuth 2.0 Client ID
};

const wishlistState = {
    items: [],
    user: null,        // { email, name, picture }
    sortBy: 'votes',   // 'votes' | 'newest'
    isLoading: false,
    formOpen: false,
    tokenClient: null
};

// ============================================
// INIT
// ============================================

function initWishlist() {
    const section = document.querySelector('.wishlist-section');
    if (!section) return;

    // Wishlist button in gallery header → scroll to section
    const wishlistBtn = document.getElementById('skills-wishlist-btn');
    if (wishlistBtn) {
        wishlistBtn.addEventListener('click', () => {
            const subHeader = section.querySelector('.wishlist-sub-header');
            if (subHeader) {
                subHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    // Sort buttons (in inline sub-header)
    section.querySelectorAll('.wishlist-sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            wishlistState.sortBy = btn.dataset.sort;
            section.querySelectorAll('.wishlist-sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderWishlistItems();
        });
    });

    // Suggest button → opens form popup
    document.getElementById('wishlist-suggest-btn').addEventListener('click', () => {
        toggleWishlistForm(true);
    });

    // Form popup: close / cancel / backdrop
    document.getElementById('wishlist-form-close').addEventListener('click', () => {
        toggleWishlistForm(false);
    });
    document.getElementById('wishlist-cancel').addEventListener('click', () => {
        toggleWishlistForm(false);
    });
    document.getElementById('wishlist-backdrop').addEventListener('click', () => {
        toggleWishlistForm(false);
    });

    // Submit form
    document.getElementById('wishlist-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleSubmit();
    });

    // Sign in button
    document.getElementById('wishlist-signin').addEventListener('click', handleSignIn);

    // Escape key closes form popup
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('wishlist-overlay').classList.contains('open')) {
            toggleWishlistForm(false);
        }
    });

    // Restore persisted login
    const saved = localStorage.getItem('wishlist_user');
    if (saved) {
        try {
            wishlistState.user = JSON.parse(saved);
            updateAuthUI();
        } catch (e) { localStorage.removeItem('wishlist_user'); }
    }

    // Init Google Identity Services (if library loaded)
    initGoogleAuth();

    // Auto-load wishlist data immediately
    loadWishlistData();
}

// ============================================
// GOOGLE AUTH
// ============================================

function initGoogleAuth() {
    if (!WISHLIST_CONFIG.CLIENT_ID) return;

    // Wait for GIS library to load
    function tryInit() {
        if (typeof google === 'undefined' || !google.accounts) {
            setTimeout(tryInit, 500);
            return;
        }

        wishlistState.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: WISHLIST_CONFIG.CLIENT_ID,
            scope: 'email profile',
            callback: onGoogleTokenResponse
        });
    }

    tryInit();
}

function onGoogleTokenResponse(response) {
    if (response.error) {
        console.error('Google auth error:', response.error);
        return;
    }

    // Fetch user info with the access token
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + response.access_token }
    })
    .then(r => r.json())
    .then(info => {
        wishlistState.user = {
            email: info.email,
            name: info.name || info.email.split('@')[0],
            picture: info.picture || ''
        };
        localStorage.setItem('wishlist_user', JSON.stringify(wishlistState.user));
        updateAuthUI();
        renderWishlistItems();
    })
    .catch(err => console.error('Failed to get user info:', err));
}

function handleSignIn() {
    if (!wishlistState.tokenClient) {
        if (!WISHLIST_CONFIG.CLIENT_ID) {
            console.warn('Wishlist: No Google Client ID configured');
        }
        return;
    }
    wishlistState.tokenClient.requestAccessToken();
}

function handleSignOut() {
    wishlistState.user = null;
    localStorage.removeItem('wishlist_user');
    updateAuthUI();
    toggleWishlistForm(false);
    renderWishlistItems();
}

function updateAuthUI() {
    const authDiv = document.getElementById('wishlist-auth');
    const suggestBtn = document.getElementById('wishlist-suggest-btn');

    if (wishlistState.user) {
        const u = wishlistState.user;
        const avatarHTML = u.picture
            ? `<img class="wishlist-user-avatar" src="${escapeHTML(u.picture)}" alt="" referrerpolicy="no-referrer">`
            : '';
        authDiv.innerHTML = `
            <div class="wishlist-user-info">
                ${avatarHTML}
                <span class="wishlist-user-name">${escapeHTML(u.name)}</span>
                <button class="wishlist-signout-btn" id="wishlist-signout">Sign out</button>
            </div>`;
        document.getElementById('wishlist-signout').addEventListener('click', handleSignOut);
        suggestBtn.disabled = false;
    } else {
        authDiv.innerHTML = `<button class="wishlist-signin-btn" id="wishlist-signin">Sign In to Submit Wishlist</button>`;
        document.getElementById('wishlist-signin').addEventListener('click', handleSignIn);
        suggestBtn.disabled = true;
    }
}

// ============================================
// FORM POPUP OPEN / CLOSE
// ============================================

function toggleWishlistForm(show) {
    const overlay = document.getElementById('wishlist-overlay');
    const form = document.getElementById('wishlist-form');
    if (show) {
        form.reset();
        overlay.classList.add('open');
    } else {
        overlay.classList.remove('open');
    }
    wishlistState.formOpen = show;
}

// ============================================
// DATA LOADING
// ============================================

async function loadWishlistData() {
    if (!WISHLIST_CONFIG.APPS_SCRIPT_URL) {
        showWishlistEmpty('Configure APPS_SCRIPT_URL in wishlist.js to connect to your Google Sheet.');
        return;
    }

    wishlistState.isLoading = true;
    showWishlistLoading(true);

    try {
        const r = await fetch(WISHLIST_CONFIG.APPS_SCRIPT_URL);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        wishlistState.items = (data.items || data || []).map(item => ({
            id: item.id || '',
            title: item.title || '',
            description: item.description || '',
            category: item.category || 'other',
            author_email: item.author_email || '',
            author_name: item.author_name || '',
            created_at: item.created_at || '',
            votes: item.votes || ''
        }));
    } catch (e) {
        console.error('Wishlist load failed:', e);
        wishlistState.items = [];
    }

    wishlistState.isLoading = false;
    showWishlistLoading(false);
    renderWishlistItems();
}

function showWishlistLoading(show) {
    const el = document.getElementById('wishlist-loading');
    if (el) el.style.display = show ? 'flex' : 'none';
}

function showWishlistEmpty(message) {
    const container = document.getElementById('wishlist-items');
    container.innerHTML = `<div class="wishlist-empty">${escapeHTML(message)}</div>`;
}

// ============================================
// RENDERING
// ============================================

function renderWishlistItems() {
    const container = document.getElementById('wishlist-items');
    const items = [...wishlistState.items];

    if (items.length === 0) {
        container.innerHTML = '<div class="wishlist-empty">No wishes yet. Be the first to suggest a skill!</div>';
        return;
    }

    // Sort
    if (wishlistState.sortBy === 'votes') {
        items.sort((a, b) => getVoteCount(b.votes) - getVoteCount(a.votes));
    } else {
        items.sort((a, b) => {
            const da = a.created_at ? new Date(a.created_at) : new Date(0);
            const db = b.created_at ? new Date(b.created_at) : new Date(0);
            return db - da;
        });
    }

    const userEmail = wishlistState.user?.email || '';
    const isSignedIn = !!wishlistState.user;

    container.innerHTML = items.map(item => {
        const voteCount = getVoteCount(item.votes);
        const hasVoted = userEmail && item.votes.split(',').map(e => e.trim()).includes(userEmail);
        const votedClass = hasVoted ? 'voted' : '';
        const disabledAttr = isSignedIn ? '' : 'disabled';
        const tooltip = isSignedIn ? '' : 'title="Sign in to vote"';
        const catLabel = item.category.charAt(0).toUpperCase() + item.category.slice(1);

        return `<div class="wishlist-item">
            <div class="wishlist-vote-col">
                <button class="wishlist-vote-btn ${votedClass}" data-id="${escapeHTML(item.id)}" ${disabledAttr} ${tooltip}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 14h16z"/></svg>
                </button>
                <span class="wishlist-vote-count">${voteCount}</span>
            </div>
            <div class="wishlist-item-content">
                <h4 class="wishlist-item-title">${escapeHTML(item.title)}</h4>
                <p class="wishlist-item-desc">${escapeHTML(item.description)}</p>
                <div class="wishlist-item-meta">
                    <span class="wishlist-category-tag" data-cat="${escapeHTML(item.category)}">${escapeHTML(catLabel)}</span>
                    <span class="wishlist-item-author">by ${escapeHTML(item.author_name || 'Anonymous')} · ${formatTimeAgo(item.created_at)}</span>
                </div>
            </div>
        </div>`;
    }).join('');

    // Wire vote buttons
    container.querySelectorAll('.wishlist-vote-btn').forEach(btn => {
        btn.addEventListener('click', () => handleVote(btn.dataset.id));
    });
}

function getVoteCount(votesStr) {
    if (!votesStr || !votesStr.trim()) return 0;
    return votesStr.split(',').filter(e => e.trim()).length;
}

// ============================================
// VOTING
// ============================================

async function handleVote(itemId) {
    console.log('handleVote called, user:', wishlistState.user, 'itemId:', itemId);
    if (!wishlistState.user) { console.warn('Vote blocked: not signed in'); return; }
    if (!WISHLIST_CONFIG.APPS_SCRIPT_URL) { console.warn('Vote blocked: no Apps Script URL'); return; }

    // Optimistic update
    const item = wishlistState.items.find(i => i.id === itemId);
    if (!item) return;

    const emails = item.votes ? item.votes.split(',').map(e => e.trim()).filter(Boolean) : [];
    const idx = emails.indexOf(wishlistState.user.email);
    if (idx >= 0) {
        emails.splice(idx, 1);
    } else {
        emails.push(wishlistState.user.email);
    }
    item.votes = emails.join(',');
    renderWishlistItems();

    // POST to Apps Script (no-cors to avoid CORS redirect block)
    try {
        await fetch(WISHLIST_CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'vote',
                itemId: itemId,
                email: wishlistState.user.email
            })
        });
        console.log('Vote sent');
    } catch (e) {
        console.error('Vote failed:', e);
        loadWishlistData();
    }
}

// ============================================
// SUBMIT
// ============================================

async function handleSubmit() {
    console.log('handleSubmit called, user:', wishlistState.user);
    if (!wishlistState.user) { console.warn('Submit blocked: not signed in'); return; }
    if (!WISHLIST_CONFIG.APPS_SCRIPT_URL) { console.warn('Submit blocked: no Apps Script URL'); return; }

    const form = document.getElementById('wishlist-form');
    const formData = new FormData(form);
    const title = formData.get('title').trim();
    const description = formData.get('description').trim();
    const category = formData.get('category');

    if (!title || !description || !category) return;

    const newItem = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
        title,
        description,
        category,
        author_email: wishlistState.user.email,
        author_name: wishlistState.user.name,
        created_at: new Date().toISOString(),
        votes: wishlistState.user.email
    };

    // Optimistic add
    wishlistState.items.unshift(newItem);
    toggleWishlistForm(false);
    renderWishlistItems();

    // POST to Apps Script (no-cors to avoid CORS redirect block)
    try {
        await fetch(WISHLIST_CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'submit',
                title,
                description,
                category,
                email: wishlistState.user.email,
                name: wishlistState.user.name
            })
        });
        console.log('Submit sent');
    } catch (e) {
        console.error('Submit failed:', e);
    }
}

// ============================================
// HELPERS
// ============================================

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTimeAgo(isoStr) {
    if (!isoStr) return '';
    const now = Date.now();
    const then = new Date(isoStr).getTime();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    const diffWeek = Math.floor(diffDay / 7);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return '1 day ago';
    if (diffDay < 7) return `${diffDay} days ago`;
    if (diffWeek === 1) return '1 week ago';
    if (diffWeek < 5) return `${diffWeek} weeks ago`;
    return new Date(isoStr).toLocaleDateString();
}

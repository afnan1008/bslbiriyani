// ========== APP STATE ==========
const state = {
    mosques: [],
    biriyaniPosts: [],
    currentTab: 'biriyani-today',
    surveys: {},
    isAdmin: false
};
const ADMIN_EMAIL = 'afnanhossain9@gmail.com';

// ========== UTILITY FUNCTIONS ==========
function getTodayString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

function getBanglaDate() {
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    return new Date().toLocaleDateString('bn-BD', options);
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.className = isError ? 'toast error show' : 'toast show';
    setTimeout(() => {
        toast.className = 'toast';
    }, 3500);
}

function showLoading() {
    document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}

function validatePhone(phone) {
    const cleaned = phone.replace(/\s+/g, '');
    return /^01[3-9]\d{8}$/.test(cleaned);
}

function timeAgo(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const time = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Math.floor((now - time) / 1000);
    
    if (diff < 60) return 'এইমাত্র';
    if (diff < 3600) return `${Math.floor(diff / 60)} মিনিট আগে`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ঘন্টা আগে`;
    return `${Math.floor(diff / 86400)} দিন আগে`;
}

// ========== TAB NAVIGATION ==========
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        state.currentTab = tabId;
        
        if (tabId === 'add-biriyani') {
            loadMosqueDropdown();
        }
        if (tabId === 'survey') {
            loadSurvey();
        }
    });
});

// ========== SET TODAY'S DATE ==========
document.getElementById('todayDate').textContent = getBanglaDate();
document.getElementById('biriyaniDate').value = getTodayString();

// ========== LOAD MOSQUES ==========
function loadMosques() {
    db.collection('mosques').orderBy('name').onSnapshot(snapshot => {
        state.mosques = [];
        const areas = new Set();
        
        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            state.mosques.push(data);
            if (data.area) areas.add(data.area);
        });
        
        renderMosques(state.mosques);
        updateStats();
        populateAreaFilter(areas);
    });
}

function renderMosques(mosques) {
    const container = document.getElementById('mosqueList');
    const today = getTodayString();
    
    const todayBiriyaniMosqueIds = state.biriyaniPosts
        .filter(b => b.date === today)
        .map(b => b.mosqueId);
    
    if (mosques.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-icon">🕌</div>
                <h3>কোন মসজিদ যোগ করা হয়নি</h3>
                <p>"মসজিদ যোগ করুন" ট্যাবে গিয়ে মসজিদ যোগ করুন</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = mosques.map(mosque => {
        const hasBiriyani = todayBiriyaniMosqueIds.includes(mosque.id);
        return `
            <div class="mosque-card ${hasBiriyani ? 'has-biriyani-today' : ''}">
                ${state.isAdmin ? `<button class="delete-btn" onclick="deleteMosque('${mosque.id}', '${mosque.name.replace(/'/g, "\\'")}')" title="মসজিদ ডিলিট করুন">
                    <i class="fas fa-trash"></i>
                </button>` : ''}
                <div class="mosque-card-top">
                    <div class="mosque-avatar">🕌</div>
                    <div>
                        <h3>${mosque.name}</h3>
                        <span class="mosque-area-badge">📍 ${mosque.area}</span>
                    </div>
                </div>
                <div class="mosque-card-meta">
                    ${mosque.address ? `<span><i class="fas fa-road"></i> ${mosque.address}</span>` : ''}
                    <span><i class="fas fa-user"></i> যোগ করেছেন: ${mosque.addedBy || 'অজানা'}</span>
                    <span><i class="fas fa-clock"></i> ${timeAgo(mosque.createdAt)}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ========== DELETE MOSQUE ==========
async function deleteMosque(mosqueId, mosqueName) {
    // Custom confirm modal
    const confirmed = await showConfirmModal(
        `"${mosqueName}" মসজিদটি ডিলিট করতে চান?`,
        'এই মসজিদের সব বিরিয়ানি পোস্টও মুছে যাবে। এটি ফিরিয়ে আনা যাবে না।'
    );
    
    if (!confirmed) return;
    
    showLoading();
    
    try {
        // Delete all biriyani posts for this mosque first
        const biriyaniSnapshot = await db.collection('biriyaniPosts')
            .where('mosqueId', '==', mosqueId)
            .get();
        
        const batch = db.batch();
        biriyaniSnapshot.forEach(doc => batch.delete(doc.ref));
        
        // Delete the mosque itself
        batch.delete(db.collection('mosques').doc(mosqueId));
        
        await batch.commit();
        
        hideLoading();
        showToast(`✅ "${mosqueName}" সফলভাবে ডিলিট হয়েছে!`);
    } catch (error) {
        hideLoading();
        console.error('Delete error:', error);
        showToast('❌ ডিলিট করতে সমস্যা হয়েছে!', true);
    }
}

// ========== CUSTOM CONFIRM MODAL ==========
function showConfirmModal(title, message) {
    return new Promise(resolve => {
        // Remove existing modal
        const existing = document.getElementById('confirmModal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'confirmModal';
        modal.className = 'confirm-modal';
        modal.innerHTML = `
            <div class="confirm-modal-backdrop"></div>
            <div class="confirm-modal-content">
                <div class="confirm-modal-icon">⚠️</div>
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirm-modal-buttons">
                    <button class="btn-cancel" id="cancelBtn">
                        <i class="fas fa-times"></i> বাতিল
                    </button>
                    <button class="btn-confirm" id="confirmBtn">
                        <i class="fas fa-trash"></i> হ্যাঁ, ডিলিট করুন
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        setTimeout(() => modal.classList.add('show'), 10);
        
        const close = (result) => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
            resolve(result);
        };
        
        document.getElementById('confirmBtn').onclick = () => close(true);
        document.getElementById('cancelBtn').onclick = () => close(false);
        modal.querySelector('.confirm-modal-backdrop').onclick = () => close(false);
    });
}

function populateAreaFilter(areas) {
    const select = document.getElementById('areaFilter');
    const currentValue = select.value;
    select.innerHTML = '<option value="all">সকল এলাকা</option>';
    
    Array.from(areas).sort().forEach(area => {
        select.innerHTML += `<option value="${area}">${area}</option>`;
    });
    
    select.value = currentValue || 'all';
}

// ========== LOAD BIRIYANI POSTS ==========
function loadBiriyaniPosts() {
    db.collection('biriyaniPosts').where('approved', '==', true).onSnapshot(snapshot => {
        state.biriyaniPosts = [];
        
        snapshot.forEach(doc => {
            state.biriyaniPosts.push({ id: doc.id, ...doc.data() });
        });
        const t = p => (p.createdAt && p.createdAt.toMillis) ? p.createdAt.toMillis() : 0;
        state.biriyaniPosts.sort((a, b) => t(b) - t(a));
        
        renderBiriyaniToday();
        updateStats();
        renderMosques(state.mosques);
    });
}

function renderBiriyaniToday(filter = 'all') {
    const container = document.getElementById('biriyaniList');
    const noData = document.getElementById('noBiriyani');
    const today = getTodayString();
    
    let todayPosts = state.biriyaniPosts.filter(b => b.date === today);
    
    if (filter === 'verified') {
        todayPosts = todayPosts.filter(b => b.verified === true);
    } else if (filter === 'unverified') {
        todayPosts = todayPosts.filter(b => !b.verified);
    }
    
    if (todayPosts.length === 0) {
        container.innerHTML = '';
        noData.style.display = 'block';
        return;
    }
    
    noData.style.display = 'none';
    
    container.innerHTML = todayPosts.map(post => {
        const mosque = state.mosques.find(m => m.id === post.mosqueId);
        const mosqueName = mosque ? mosque.name : post.mosqueName || 'অজানা মসজিদ';
        const mosqueArea = mosque ? mosque.area : '';
        const verified = post.verified;
        const yes = post.surveyYes || 0, no = post.surveyNo || 0, tot = yes + no;
        const yp = tot ? Math.round(yes / tot * 100) : 0;
        const addr = mosque && mosque.address ? mosque.address : '';
        
        return `
            <div class="biriyani-card bc" data-verified="${verified ? 'true' : 'false'}">
                ${state.isAdmin ? `<button class="delete-btn" onclick="deleteBiriyaniPost('${post.id}', '${mosqueName.replace(/'/g, "\\'")}')" title="পোস্ট ডিলিট করুন"><i class="fas fa-trash"></i></button>` : ''}
                <div class="bc-hero">
                    <span class="bc-dish">🍛</span>
                    <div>
                        <div class="bc-waqt">${esc(post.waqt || 'জুমা')} নামাজে বিরিয়ানি</div>
                        <div class="bc-date"><i class="fas fa-calendar-day"></i> ${banglaDate(post.date)}</div>
                    </div>
                </div>
                <h3 class="bc-name">${esc(mosqueName)}</h3>
                <div class="bc-tags">
                    ${mosqueArea ? `<span class="bc-area"><i class="fas fa-location-dot"></i> ${esc(mosqueArea)}</span>` : ''}
                    ${verified ? '<span class="bc-status ok"><i class="fas fa-circle-check"></i> যাচাইকৃত</span>' : '<span class="bc-status wait"><i class="fas fa-hourglass-half"></i> যাচাই হয়নি</span>'}
                </div>
                ${addr ? `<p class="bc-addr"><i class="fas fa-road"></i> ${esc(addr)}</p>` : ''}
                ${post.note ? `<p class="bc-note">${esc(post.note)}</p>` : ''}
                <div class="bc-votes">
                    ${tot ? `<div class="bc-bar"><span style="width:${yp}%"></span></div>
                    <small>✅ ${yes} জন নিশ্চিত করেছেন · ❌ ${no} জন বলেছেন দেয়নি</small>` : `<small>এখনো কেউ নিশ্চিত করেনি। সার্ভে ট্যাবে গিয়ে আপনিও জানান।</small>`}
                </div>
                <div class="bc-tear"></div>
                <div class="bc-bottom">
                    <div class="bc-by">
                        <span class="bc-avatar">${esc((post.addedBy || '?').trim().charAt(0))}</span>
                        <div><b>${esc(post.addedBy || 'অজানা')}</b><small>${timeAgo(post.createdAt)}</small></div>
                    </div>
                    <div class="bc-actions">
                        ${state.isAdmin ? `<button class="bc-dl" onclick="downloadCardPng('${post.id}')" title="PNG ডাউনলোড"><i class="fas fa-download"></i> PNG</button>` : ''}
                        ${post.phone ? `<a class="bc-call" href="tel:${esc(post.phone)}"><i class="fas fa-phone"></i> কল</a>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ========== DELETE BIRIYANI POST ==========
async function deleteBiriyaniPost(postId, mosqueName) {
    const confirmed = await showConfirmModal(
        `বিরিয়ানি পোস্ট ডিলিট করবেন?`,
        `"${mosqueName}" এর বিরিয়ানি পোস্টটি মুছে যাবে।`
    );
    
    if (!confirmed) return;
    
    showLoading();
    
    try {
        await db.collection('biriyaniPosts').doc(postId).delete();
        hideLoading();
        showToast('✅ বিরিয়ানি পোস্ট ডিলিট হয়েছে!');
    } catch (error) {
        hideLoading();
        console.error('Delete error:', error);
        showToast('❌ ডিলিট করতে সমস্যা হয়েছে!', true);
    }
}

// ========== UPDATE STATS ==========
function updateStats() {
    const today = getTodayString();
    document.getElementById('totalMosques').textContent = state.mosques.length;
    document.getElementById('totalBiriyani').textContent = 
        state.biriyaniPosts.filter(b => b.date === today).length;
}

// ========== ADD MOSQUE ==========
document.getElementById('mosqueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('mosqueName').value.trim();
    const area = document.getElementById('mosqueArea').value;
    const address = document.getElementById('mosqueAddress').value.trim();
    const adderName = document.getElementById('mosqueAdderName').value.trim();
    const adderPhone = document.getElementById('mosqueAdderPhone').value.trim();
    
    if (!name || !area || !adderName || !adderPhone) {
        showToast('সকল প্রয়োজনীয় ফিল্ড পূরণ করুন!', true);
        return;
    }
    
    if (!validatePhone(adderPhone)) {
        showToast('সঠিক ফোন নম্বর দিন (01XXXXXXXXX)', true);
        return;
    }
    
    const duplicate = state.mosques.find(m => 
        m.name.toLowerCase() === name.toLowerCase() && m.area === area
    );
    if (duplicate) {
        showToast('এই মসজিদটি ইতোমধ্যে যোগ করা আছে!', true);
        return;
    }
    
    showLoading();
    
    try {
        await db.collection('mosques').add({
            name: name,
            area: area,
            address: address,
            addedBy: adderName,
            addedByPhone: adderPhone,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        showToast('মসজিদ সফলভাবে যোগ করা হয়েছে! ✅');
        document.getElementById('mosqueForm').reset();
    } catch (error) {
        hideLoading();
        console.error('Error adding mosque:', error);
        showToast('কিছু সমস্যা হয়েছে! আবার চেষ্টা করুন।', true);
    }
});

// ========== ADD BIRIYANI POST ==========
function loadMosqueDropdown() {
    const select = document.getElementById('biriyaniMosque');
    const currentValue = select.value;
    select.innerHTML = '<option value="">মসজিদ সিলেক্ট করুন</option>';
    
    state.mosques.forEach(mosque => {
        select.innerHTML += `<option value="${mosque.id}">${mosque.name} (${mosque.area})</option>`;
    });
    
    if (currentValue) select.value = currentValue;
}

document.getElementById('biriyaniForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const mosqueId = document.getElementById('biriyaniMosque').value;
    const waqt = document.getElementById('biriyaniWaqt').value;
    const date = document.getElementById('biriyaniDate').value;
    const note = document.getElementById('biriyaniNote').value.trim();
    const adderName = document.getElementById('biriyaniAdderName').value.trim();
    const adderPhone = document.getElementById('biriyaniAdderPhone').value.trim();
    
    if (!mosqueId || !adderName || !adderPhone) {
        showToast('সকল প্রয়োজনীয় ফিল্ড পূরণ করুন!', true);
        return;
    }
    
    if (!validatePhone(adderPhone)) {
        showToast('সঠিক ফোন নম্বর দিন (01XXXXXXXXX)', true);
        return;
    }
    
    const targetDate = date || getTodayString();
    
    const alreadyPosted = state.biriyaniPosts.find(b => 
        b.mosqueId === mosqueId && b.date === targetDate
    );
    if (alreadyPosted) {
        showToast('এই মসজিদে এই তারিখের বিরিয়ানি আপডেট ইতোমধ্যে দেওয়া আছে!', true);
        return;
    }
    
    const mosque = state.mosques.find(m => m.id === mosqueId);
    
    showLoading();
    
    try {
        await db.collection('biriyaniPosts').add({
            mosqueId: mosqueId,
            mosqueName: mosque ? mosque.name : 'অজানা',
            waqt: waqt,
            date: targetDate,
            note: note,
            addedBy: adderName,
            phone: adderPhone,
            approved: false,
            verified: false,
            surveyYes: 0,
            surveyNo: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        showToast('আপডেট জমা হয়েছে। অ্যাডমিন অনুমোদন করলে হোমপেজে দেখা যাবে 🍛');
        document.getElementById('biriyaniForm').reset();
        document.getElementById('biriyaniDate').value = getTodayString();
    } catch (error) {
        hideLoading();
        console.error('Error adding biriyani post:', error);
        showToast('কিছু সমস্যা হয়েছে! আবার চেষ্টা করুন।', true);
    }
});

// ========== SURVEY ==========
function loadSurvey() {
    const container = document.getElementById('surveyList');
    const resultsContainer = document.getElementById('surveyResults');
    const noSurvey = document.getElementById('noSurvey');
    const today = getTodayString();
    
    const todayPosts = state.biriyaniPosts.filter(b => b.date === today);
    
    if (todayPosts.length === 0) {
        container.innerHTML = '';
        resultsContainer.innerHTML = '';
        noSurvey.style.display = 'block';
        return;
    }
    
    noSurvey.style.display = 'none';
    
    const votedSurveys = JSON.parse(localStorage.getItem('votedSurveys') || '{}');
    
    container.innerHTML = todayPosts.map(post => {
        const mosque = state.mosques.find(m => m.id === post.mosqueId);
        const mosqueName = mosque ? mosque.name : post.mosqueName || 'অজানা মসজিদ';
        const hasVoted = votedSurveys[post.id];
        
        return `
            <div class="survey-card">
                <div class="survey-card-header">
                    <h3>🕌 ${mosqueName}</h3>
                    <p>${post.waqt} নামাজে বিরিয়ানির খবর দেওয়া হয়েছিল</p>
                </div>
                <div class="survey-card-body">
                    ${hasVoted ? `
                        <div class="survey-voted">
                            <i class="fas fa-check-circle" style="color: var(--success); font-size: 1.5rem;"></i>
                            <p>আপনি ভোট দিয়েছেন: <strong>${hasVoted === 'yes' ? '✅ হ্যাঁ' : '❌ না'}</strong></p>
                        </div>
                    ` : `
                        <p class="survey-question">এই মসজিদে কি আসলেই বিরিয়ানি দিয়েছিল?</p>
                        <div class="survey-buttons">
                            <button class="btn-yes" onclick="voteSurvey('${post.id}', 'yes')">
                                <i class="fas fa-check"></i> হ্যাঁ, দিয়েছে ✅
                            </button>
                            <button class="btn-no" onclick="voteSurvey('${post.id}', 'no')">
                                <i class="fas fa-times"></i> না, দেয়নি ❌
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
    
    resultsContainer.innerHTML = todayPosts.map(post => {
        const mosque = state.mosques.find(m => m.id === post.mosqueId);
        const mosqueName = mosque ? mosque.name : post.mosqueName || 'অজানা মসজিদ';
        const yes = post.surveyYes || 0;
        const no = post.surveyNo || 0;
        const total = yes + no;
        const yesPercent = total > 0 ? Math.round((yes / total) * 100) : 0;
        const noPercent = total > 0 ? Math.round((no / total) * 100) : 0;
        
        let resultIcon = '⏳';
        let resultText = 'অপেক্ষমান';
        if (total >= 3) {
            if (yesPercent >= 70) {
                resultIcon = '✅';
                resultText = 'যাচাইকৃত - বিরিয়ানি দিয়েছে';
            } else if (noPercent >= 70) {
                resultIcon = '❌';
                resultText = 'ভুল তথ্য - বিরিয়ানি দেয়নি';
            } else {
                resultIcon = '🤔';
                resultText = 'মিশ্র মতামত';
            }
        }
        
        return `
            <div class="survey-card">
                <div class="survey-card-header" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">
                    <h3>${resultIcon} ${mosqueName}</h3>
                    <p>${resultText} | মোট ভোট: ${total}</p>
                </div>
                <div class="survey-card-body">
                    <div class="survey-result-bar">
                        <div class="result-label">
                            <span>✅ হ্যাঁ (${yes} জন - ${yesPercent}%)</span>
                            <span>❌ না (${no} জন - ${noPercent}%)</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-yes" style="width: ${yesPercent}%"></div>
                            <div class="progress-no" style="width: ${noPercent}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function voteSurvey(postId, vote) {
    const votedSurveys = JSON.parse(localStorage.getItem('votedSurveys') || '{}');
    
    if (votedSurveys[postId]) {
        showToast('আপনি ইতোমধ্যে এই সার্ভেতে ভোট দিয়েছেন!', true);
        return;
    }
    
    showLoading();
    
    try {
        const postRef = db.collection('biriyaniPosts').doc(postId);
        
        if (vote === 'yes') {
            await postRef.update({
                surveyYes: firebase.firestore.FieldValue.increment(1)
            });
        } else {
            await postRef.update({
                surveyNo: firebase.firestore.FieldValue.increment(1)
            });
        }
        
        const updatedDoc = await postRef.get();
        const data = updatedDoc.data();
        const total = (data.surveyYes || 0) + (data.surveyNo || 0);
        const yesPercent = total > 0 ? ((data.surveyYes || 0) / total) * 100 : 0;
        
        if (total >= 3 && yesPercent >= 70) {
            await postRef.update({ verified: true });
        } else if (total >= 3 && yesPercent < 30) {
            await postRef.update({ verified: false });
        }
        
        votedSurveys[postId] = vote;
        localStorage.setItem('votedSurveys', JSON.stringify(votedSurveys));
        
        hideLoading();
        showToast(vote === 'yes' ? 'ধন্যবাদ! আপনি "হ্যাঁ" ভোট দিয়েছেন ✅' : 'ধন্যবাদ! আপনি "না" ভোট দিয়েছেন ❌');
        loadSurvey();
    } catch (error) {
        hideLoading();
        console.error('Error voting:', error);
        showToast('ভোট দিতে সমস্যা হয়েছে!', true);
    }
}

// ========== SEARCH & FILTER ==========
document.getElementById('searchBiriyani').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const cards = document.querySelectorAll('#biriyaniList .biriyani-card');
    
    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query) ? '' : 'none';
    });
});

document.getElementById('searchMosque').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const areaFilter = document.getElementById('areaFilter').value;
    
    let filtered = state.mosques.filter(m => 
        m.name.toLowerCase().includes(query) || 
        (m.area && m.area.toLowerCase().includes(query)) ||
        (m.address && m.address.toLowerCase().includes(query))
    );
    
    if (areaFilter !== 'all') {
        filtered = filtered.filter(m => m.area === areaFilter);
    }
    
    renderMosques(filtered);
});

document.getElementById('areaFilter').addEventListener('change', (e) => {
    const area = e.target.value;
    const query = document.getElementById('searchMosque').value.toLowerCase().trim();
    
    let filtered = state.mosques;
    
    if (area !== 'all') {
        filtered = filtered.filter(m => m.area === area);
    }
    
    if (query) {
        filtered = filtered.filter(m => 
            m.name.toLowerCase().includes(query) || 
            (m.address && m.address.toLowerCase().includes(query))
        );
    }
    
    renderMosques(filtered);
});

document.querySelectorAll('.filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderBiriyaniToday(chip.getAttribute('data-filter'));
    });
});

// ========== INITIALIZE APP ==========
function initApp() {
    showLoading();
    firebase.auth().onAuthStateChanged(user => {
        state.isAdmin = !!user && user.email === ADMIN_EMAIL;
        renderMosques(state.mosques);
        renderBiriyaniToday();
    });
    loadMosques();
    loadBiriyaniPosts();
    setTimeout(() => hideLoading(), 1500);
}

initApp();

// ========== HELPERS ==========
function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function banglaDate(str) {
    if (!str) return '';
    return new Date(str + 'T00:00:00').toLocaleDateString('bn-BD', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ========== ADMIN: DOWNLOAD CARD AS PNG ==========
async function downloadCardPng(postId) {
    if (!state.isAdmin) return;
    const post = state.biriyaniPosts.find(p => p.id === postId);
    if (!post) return;
    const mosque = state.mosques.find(m => m.id === post.mosqueId);
    const name = mosque ? mosque.name : post.mosqueName || 'অজানা মসজিদ';
    showLoading();
    try {
        await Promise.all([
            document.fonts.load('700 40px "Noto Sans Bengali"'),
            document.fonts.load('400 40px "Noto Sans Bengali"'),
            document.fonts.load('400 40px "Tiro Bangla"')
        ]);
        const W = 1080, H = 1260, c = document.createElement('canvas');
        c.width = W; c.height = H;
        const x = c.getContext('2d');
        const SANS = '"Noto Sans Bengali", sans-serif', SERIF = '"Tiro Bangla", "Noto Sans Bengali", serif';
        const rr = (px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
        const wrap = (t, maxW) => { const out = []; let line = ''; String(t).split(/\s+/).forEach(w => { const test = line ? line + ' ' + w : w; if (x.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test; }); if (line) out.push(line); return out; };
        // background
        const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#165a45'); g.addColorStop(1, '#0d3b2e');
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.fillStyle = 'rgba(255,255,255,.07)';
        for (let i = 0; i < W; i += 36) for (let j = 0; j < H; j += 36) { x.beginPath(); x.arc(i, j, 2, 0, 7); x.fill(); }
        x.textAlign = 'center'; x.textBaseline = 'alphabetic';
        x.fillStyle = '#f2b01e'; x.font = `400 60px ${SERIF}`; x.fillText('বরিশাল বিরিয়ানি ট্র্যাকার', W / 2, 130);
        x.fillStyle = '#bfe3d2'; x.font = `400 30px ${SANS}`; x.fillText('আজকে কোন মসজিদে বিরিয়ানি?', W / 2, 185);
        // card
        const cx = 70, cy = 240, cw = W - 140, ch = 930;
        x.shadowColor = 'rgba(0,0,0,.3)'; x.shadowBlur = 40; x.shadowOffsetY = 16;
        x.fillStyle = '#fff'; rr(cx, cy, cw, ch, 36); x.fill(); x.shadowColor = 'transparent';
        // dish badge
        x.fillStyle = '#f2b01e'; x.beginPath(); x.arc(W / 2, cy, 70, 0, 7); x.fill();
        x.font = `400 70px ${SANS}`; x.fillStyle = '#000'; x.fillText('🍛', W / 2, cy + 24);
        let y = cy + 140;
        // waqt pill
        const waqt = `${post.waqt || 'জুমা'} নামাজে বিরিয়ানি`;
        x.font = `700 34px ${SANS}`; const pw = x.measureText(waqt).width + 64;
        x.fillStyle = '#0d3b2e'; rr(W / 2 - pw / 2, y - 44, pw, 64, 32); x.fill();
        x.fillStyle = '#fff'; x.fillText(waqt, W / 2, y); y += 56;
        x.fillStyle = '#5f6f67'; x.font = `400 30px ${SANS}`; x.fillText(banglaDate(post.date), W / 2, y); y += 40;
        // mosque name
        x.fillStyle = '#0d3b2e'; x.font = `400 68px ${SERIF}`;
        const nl = wrap(name, cw - 120).slice(0, 3);
        y += 50; nl.forEach(l => { x.fillText(l, W / 2, y); y += 84; });
        // area
        const area = mosque && mosque.area ? mosque.area : '';
        const addr = mosque && mosque.address ? mosque.address : '';
        x.fillStyle = '#165a45'; x.font = `500 32px ${SANS}`;
        if (area) { x.fillText('📍 ' + area + (addr ? ' · ' + addr : ''), W / 2, y - 10); y += 30; }
        // status
        const ok = post.verified === true;
        x.font = `700 30px ${SANS}`;
        const st = ok ? '✅ যাচাইকৃত' : '⏳ যাচাই হয়নি', sw = x.measureText(st).width + 56;
        x.fillStyle = ok ? '#dff4e8' : '#fff3d6'; rr(W / 2 - sw / 2, y, sw, 56, 28); x.fill();
        x.fillStyle = ok ? '#126b3e' : '#9a6a00'; x.fillText(st, W / 2, y + 39); y += 96;
        // note
        if (post.note) {
            x.font = `400 30px ${SANS}`;
            const lines = wrap(post.note, cw - 200).slice(0, 4);
            const bh = lines.length * 46 + 44;
            x.fillStyle = '#fffaf0'; rr(cx + 50, y, cw - 100, bh, 20); x.fill();
            x.strokeStyle = '#ecc66a'; x.setLineDash([10, 8]); x.lineWidth = 2; x.stroke(); x.setLineDash([]);
            x.fillStyle = '#5b4a1c'; lines.forEach((l, i) => x.fillText(l, W / 2, y + 58 + i * 46)); y += bh + 34;
        }
        // votes
        const yes = post.surveyYes || 0, no = post.surveyNo || 0, tot = yes + no;
        x.fillStyle = '#5f6f67'; x.font = `400 28px ${SANS}`;
        x.fillText(tot ? `✅ ${yes} জন নিশ্চিত করেছেন  ·  ❌ ${no} জন বলেছেন দেয়নি` : 'এখনো কেউ ভোট দেয়নি', W / 2, y); 
        // tear line
        const ty = cy + ch - 150;
        x.strokeStyle = '#dce6df'; x.lineWidth = 3; x.setLineDash([14, 12]); x.beginPath(); x.moveTo(cx + 30, ty); x.lineTo(cx + cw - 30, ty); x.stroke(); x.setLineDash([]);
        x.fillStyle = '#165a45'; x.beginPath(); x.arc(cx, ty, 22, 0, 7); x.arc(cx + cw, ty, 22, 0, 7); x.fill();
        // reporter
        x.fillStyle = '#0d3b2e'; x.font = `700 32px ${SANS}`; x.fillText('আপডেট দিয়েছেন: ' + (post.addedBy || 'অজানা'), W / 2, ty + 70);
        x.fillStyle = '#5f6f67'; x.font = `400 26px ${SANS}`; x.fillText('অ্যাডমিন কর্তৃক অনুমোদিত', W / 2, ty + 115);
        c.toBlob(b => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = `biriyani-${(post.date || 'card')}-${postId.slice(0, 5)}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            hideLoading(); showToast('✅ PNG ডাউনলোড হয়েছে!');
        }, 'image/png');
    } catch (e) {
        console.error(e); hideLoading(); showToast('❌ PNG বানানো যায়নি', true);
    }
}

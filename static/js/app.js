/**
 * MTC WiFi Registration – Frontend JS
 */

const API = '/api';
let adminToken = sessionStorage.getItem('adminToken') || '';

// ── Navigation ────────────────────────────────────────────────────────────────

function showHome()       { show('homeScreen'); }
function showRegister()   { show('registerScreen'); }
function showStatus()     { show('statusScreen'); document.getElementById('statusResult').innerHTML = ''; }
function showAdminLogin() { show('adminLoginScreen'); }

function showAdminDashboard() {
    show('adminDashboard');
    loadStats();
    loadSubmissions();
}

function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    window.scrollTo(0, 0);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function previewImg(input, previewId) {
    const img = document.getElementById(previewId);
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; img.classList.remove('hidden'); };
        reader.readAsDataURL(input.files[0]);
    }
}

function previewFile(input, previewId, pdfNoteId) {
    const img     = document.getElementById(previewId);
    const pdfNote = document.getElementById(pdfNoteId);
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    if (file.type === 'application/pdf') {
        img.classList.add('hidden');
        pdfNote.classList.remove('hidden');
    } else {
        pdfNote.classList.add('hidden');
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; img.classList.remove('hidden'); };
        reader.readAsDataURL(file);
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.readAsDataURL(file);
        r.onload  = () => resolve(r.result);
        r.onerror = err => reject(err);
    });
}

function setLoading(btn, loading) {
    if (loading) {
        btn._orig = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-inline"></span> Processing…';
        btn.disabled = true;
    } else {
        btn.innerHTML = btn._orig || btn.innerHTML;
        btn.disabled = false;
    }
}

function modal(icon, title, message, onOk) {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `
        <div class="modal-box">
            <div class="modal-icon ${icon}">
                <i class="fas ${icon === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            </div>
            <h3>${title}</h3>
            <p>${message}</p>
            <button class="btn btn-primary" onclick="this.closest('.modal').remove(); ${onOk ? onOk + '()' : ''}">OK</button>
        </div>`;
    document.body.appendChild(el);
    if (icon === 'success') {
        setTimeout(() => { if (el.parentNode) { el.remove(); if (onOk) window[onOk](); } }, 3000);
    }
}

function imgModal(src) {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `
        <div class="img-modal-box">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <strong>Balance Screenshot</strong>
                <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button>
            </div>
            <img src="${src}" alt="Balance screenshot">
        </div>`;
    el.onclick = e => { if (e.target === el) el.remove(); };
    document.body.appendChild(el);
}

// ── WiFi Registration ─────────────────────────────────────────────────────────

async function submitWifi() {
    const name       = document.getElementById('wName').value.trim();
    const surname    = document.getElementById('wSurname').value.trim();
    const studentNo  = document.getElementById('wStudentNo').value.trim();
    const nationalId = document.getElementById('wNationalID').value.trim();
    const fileInput  = document.getElementById('wBalance');
    const btn        = document.getElementById('wifiSubmitBtn');

    if (!name || !surname || !studentNo || !nationalId) {
        modal('error', 'Missing Fields', 'Please fill in all required fields.');
        return;
    }
    if (!fileInput.files[0]) {
        modal('error', 'Missing File', 'Please upload your portal balance screenshot.');
        return;
    }

    setLoading(btn, true);
    try {
        const balanceImage = await fileToBase64(fileInput.files[0]);
        const res = await fetch(`${API}/wifi/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, surname, student_number: studentNo, national_id: nationalId, balance_image: balanceImage })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('wifiForm').reset();
            document.getElementById('wPreview').classList.add('hidden');
            modal('success', 'Registration Submitted!', 'Your application has been received. Check your status using your student number once reviewed.', 'showHome');
        } else {
            modal('error', 'Submission Failed', data.error || 'Please try again.');
        }
    } catch (e) {
        modal('error', 'Network Error', 'Could not reach the server. Please check your connection.');
    } finally {
        setLoading(btn, false);
    }
}

// ── Status Check ──────────────────────────────────────────────────────────────

async function checkStatus() {
    const studentNo = document.getElementById('statusNo').value.trim();
    const btn       = document.getElementById('checkBtn');
    const result    = document.getElementById('statusResult');

    if (!studentNo) { modal('error', 'Required', 'Enter your student number.'); return; }

    setLoading(btn, true);
    result.innerHTML = '<p class="text-muted"><span class="spinner-inline" style="border-top-color:var(--primary);border-color:var(--border);"></span> Checking…</p>';

    try {
        const res  = await fetch(`${API}/check-status?student_number=${encodeURIComponent(studentNo)}`);
        const data = await res.json();

        if (!data.success) { result.innerHTML = `<p class="text-muted">${data.error}</p>`; return; }

        if (!data.data || data.data.length === 0) {
            result.innerHTML = `<div class="submission-item"><p>No registration found for <strong>${studentNo}</strong>. Please register first.</p></div>`;
            return;
        }

        result.innerHTML = data.data.map(r => `
            <div class="submission-item">
                <div class="submission-header">
                    <div>
                        <h4>${r.name} ${r.surname}</h4>
                        <small class="text-muted">${r.student_number}</small>
                    </div>
                    <span class="status-badge status-${r.status}">${r.status}</span>
                </div>
                <div class="submission-info mt-3">
                    <div class="info-item"><strong>National ID</strong><span>${r.national_id}</span></div>
                    <div class="info-item"><strong>Submitted</strong><span>${fmtDate(r.submitted_date)}</span></div>
                    ${r.approved_date ? `<div class="info-item"><strong>Processed</strong><span>${fmtDate(r.approved_date)}</span></div>` : ''}
                </div>
            </div>`).join('');
    } catch (e) {
        result.innerHTML = '<p class="text-muted">Connection error. Please try again.</p>';
    } finally {
        setLoading(btn, false);
    }
}

// ── Admin Auth ────────────────────────────────────────────────────────────────

async function adminLogin() {
    const username = document.getElementById('adminUser').value.trim();
    const password = document.getElementById('adminPass').value;
    const btn      = document.getElementById('loginBtn');
    if (!username || !password) { modal('error', 'Required', 'Enter username and password.'); return; }

    setLoading(btn, true);
    try {
        const res  = await fetch(`${API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            adminToken = data.token;
            sessionStorage.setItem('adminToken', adminToken);
            showAdminDashboard();
        } else {
            modal('error', 'Login Failed', data.error || 'Invalid credentials.');
        }
    } catch (e) {
        modal('error', 'Connection Error', 'Cannot reach server.');
    } finally {
        setLoading(btn, false);
    }
}

function adminLogout() {
    fetch(`${API}/logout`, { method: 'POST', headers: { 'X-Admin-Token': adminToken } }).catch(() => {});
    adminToken = '';
    sessionStorage.removeItem('adminToken');
    showHome();
}

// ── Admin: Load Stats ─────────────────────────────────────────────────────────

async function loadStats() {
    try {
        const res  = await fetch(`${API}/stats`, { headers: { 'X-Admin-Token': adminToken } });
        const data = await res.json();
        if (data.success) {
            document.getElementById('sTotal').textContent    = data.stats.total;
            document.getElementById('sPending').textContent  = data.stats.pending;
            document.getElementById('sApproved').textContent = data.stats.approved;
            document.getElementById('sRejected').textContent = data.stats.rejected;
        }
    } catch (e) { /* silent */ }
}

// ── Admin: Load Submissions ───────────────────────────────────────────────────

async function loadSubmissions() {
    const container = document.getElementById('submissionsContainer');
    container.innerHTML = '<p class="text-muted"><span class="spinner-inline" style="border-top-color:var(--primary);border-color:var(--border);"></span> Loading…</p>';

    try {
        const res  = await fetch(`${API}/wifi/submissions`, { headers: { 'X-Admin-Token': adminToken } });
        const data = await res.json();

        if (!data.success) {
            container.innerHTML = `<p class="text-muted">${data.error || 'Load failed.'}</p>`;
            return;
        }

        const subs = data.submissions || [];
        if (subs.length === 0) {
            container.innerHTML = '<p class="text-muted" style="text-align:center; padding:2rem;">No registrations yet.</p>';
            return;
        }

        container.innerHTML = subs.map(s => `
            <div class="submission-item" id="sub-${s.id}">
                <div class="submission-header">
                    <div>
                        <h4>${s.name} ${s.surname}</h4>
                        <small class="text-muted">${s.student_number}</small>
                    </div>
                    <span class="status-badge status-${s.status}">${s.status}</span>
                </div>
                <div class="submission-info mt-3">
                    <div class="info-item"><strong>National ID</strong><span>${s.national_id}</span></div>
                    <div class="info-item"><strong>Submitted</strong><span>${fmtDate(s.submitted_date)}</span></div>
                    ${s.approved_date ? `<div class="info-item"><strong>Processed</strong><span>${fmtDate(s.approved_date)}</span></div>` : ''}
                </div>
                ${s.balance_image ? `
                    <div class="mt-3">
                        <small class="text-muted" style="display:block; margin-bottom:4px;">Balance Document:</small>
                        ${s.balance_image.startsWith('data:application/pdf') 
                            ? `<a href="${s.balance_image}" target="_blank" class="btn btn-outline-primary btn-sm">
                                   <i class="fas fa-file-pdf"></i> View PDF
                               </a>`
                            : `<img src="${s.balance_image}" class="balance-thumb" onclick="imgModal('${s.balance_image}')" alt="Balance">`
                        }
                    </div>` : ''}
                ${s.status === 'pending' ? `
                <div class="action-btns">
                    <button class="btn btn-success btn-sm" onclick="updateStatus(${s.id}, 'approved')"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn btn-danger  btn-sm" onclick="updateStatus(${s.id}, 'rejected')"><i class="fas fa-times"></i> Reject</button>
                </div>` : ''}
            </div>`).join('');
    } catch (e) {
        container.innerHTML = '<p class="text-muted">Connection error.</p>';
    }
}

// ── Admin: Update Status ──────────────────────────────────────────────────────

async function updateStatus(id, status) {
    if (!confirm(`${status === 'approved' ? 'Approve' : 'Reject'} this registration?`)) return;
    try {
        const res  = await fetch(`${API}/update-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
            body: JSON.stringify({ id, status })
        });
        const data = await res.json();
        if (data.success) {
            loadStats();
            loadSubmissions();
        } else {
            modal('error', 'Update Failed', data.error || 'Try again.');
        }
    } catch (e) {
        modal('error', 'Error', 'Connection error.');
    }
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV() {
    const date = document.getElementById('filterDate').value;
    const url  = `${API}/export/csv${date ? '?date=' + date : ''}`;
    // Pass token in URL for download (simple approach)
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('data-admin-token', adminToken); // won't work directly; use hidden iframe
    // Proper approach: add token as query param on export
    window.location.href = url + (date ? '&' : '?') + 'token=' + adminToken;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
    if (!iso) return '–';
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Init ──────────────────────────────────────────────────────────────────────

window.onload = () => {
    // If admin was previously logged in, verify token still valid
    if (adminToken) {
        fetch(`${API}/stats`, { headers: { 'X-Admin-Token': adminToken } })
            .then(r => r.json())
            .then(d => { if (!d.success) { adminToken = ''; sessionStorage.removeItem('adminToken'); } })
            .catch(() => {});
    }
    showHome();
};

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') showHome();
});

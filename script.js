
const firebaseConfig = {
      apiKey: "AIzaSyD40csyp5CtEHzwzv6QXCsjwKZXCf7guls",
      authDomain: "jarvis-website-sign-in-feature.firebaseapp.com",
      projectId: "jarvis-website-sign-in-feature",
      storageBucket: "jarvis-website-sign-in-feature.firebasestorage.app",
      messagingSenderId: "88057670607",
      appId: "1:88057670607:web:8a4448a53451cde24dc0ba",
      measurementId: "G-V04D48SN7P"
    };

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    db.enablePersistence().catch(() => {});
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    // ===== PERFORMANCE TIER DETECTION =====
    const perfTier = (function detectPerfTier() {
        const mem = navigator.deviceMemory || 8; // GB, default 8 for desktop
        const cores = navigator.hardwareConcurrency || 4;
        const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent);
        const isSlowConnection = navigator.connection && (navigator.connection.effectiveType === '2g' || navigator.connection.effectiveType === 'slow-2g');
        
        let tier = 'high'; // high, mid, low
        if (mem <= 2 || (isMobile && cores <= 2)) tier = 'low';
        else if (mem <= 4 || (isMobile && cores <= 4)) tier = 'mid';
        if (isSlowConnection && tier === 'high') tier = 'mid';
        
        // Apply CSS class for tier-based optimizations
        if (tier === 'low') document.documentElement.classList.add('perf-low');
        else if (tier === 'mid') document.documentElement.classList.add('perf-mid');
        
        console.log(`Performance tier: ${tier} (RAM: ${mem}GB, Cores: ${cores}, Mobile: ${isMobile})`);
        return tier;
    })();

    let currentUser = null, selectedRole = 'taki', currentViewRole = 'taki', entryImageData = null, entryAudioData = null, currentMood = 'sun', currentEntries = [], openEntryId = null, mediaRecorder, audioChunks = [], isRecording = false, currentPin = "", isGalleryMode = false;
    let entrySongData = null, recordingTimerInterval = null, recordingSeconds = 0, audioAnalyser = null, audioContext = null, recordingStream = null;

    // ===== ESCAPE HTML (XSS Protection) =====
    function escapeHTML(str) { if (!str) return ''; const d = document.createElement('div'); d.appendChild(document.createTextNode(str)); return d.innerHTML; }
    let calendarViewDate = new Date();

    function getIST() { 
        return new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    }
    function tearPage(el) { el.classList.add('torn-off'); setTimeout(() => document.getElementById('tear-off-overlay').style.display='none', 800); }

    // --- INTRO SEQUENCE ---
    function playIntroSequence(role) {
        const overlay = document.getElementById('cinematic-overlay');
        const text = document.getElementById('intro-text');
        const vidContainer = document.getElementById('intro-video-container');
        const iframe = document.getElementById('intro-iframe');
        const hint = document.getElementById('orientation-hint');

        overlay.style.display = 'flex';

        // Mitsuha role: skip text, go straight to video
        if (role === 'mitsuha') {
            text.style.display = 'none';
            hint.style.display = 'flex';
            setTimeout(() => {
                vidContainer.style.opacity = '1';
                iframe.src = "https://www.youtube.com/embed/-pHfPJGatgE?autoplay=1&controls=0&modestbranding=1&rel=0&showinfo=0&loop=1&mute=0&playsinline=1";
            }, 500);
            setTimeout(() => { hint.style.display = 'none'; }, 5000);
            return;
        }
        
        // Taki role: full cinematic sequence
        // 1s: Fade in Text and Hint
        setTimeout(() => { 
            text.style.opacity = '1'; 
            hint.style.display = 'flex';
        }, 1000);

        // 7s: Fade out Text
        setTimeout(() => { text.style.opacity = '0'; }, 7000);

        // 9s: Fade in Video
        setTimeout(() => {
            text.style.display = 'none'; // Clear text to ensure video is clickable
            vidContainer.style.opacity = '1';
            iframe.src = "https://www.youtube.com/embed/-pHfPJGatgE?autoplay=1&controls=0&modestbranding=1&rel=0&showinfo=0&loop=1&mute=0&playsinline=1";
        }, 9000);

        // 12s: Hide hint to not distract from video
        setTimeout(() => { hint.style.display = 'none'; }, 12000);
    }

    function endIntroSequence() {
        const overlay = document.getElementById('cinematic-overlay');
        overlay.style.opacity = '0';
        // Exit fullscreen if active
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        setTimeout(() => {
            overlay.style.display = 'none';
            document.getElementById('intro-iframe').src = ""; // Stop video
            // Auto-show tutorial for new users after intro finishes
            if (!localStorage.getItem('tutorialDone')) {
                setTimeout(showTutorial, 800);
            }
        }, 2000); // Match CSS transition
    }

    // --- LANDSCAPE INTRO VIDEO FULLSCREEN ---
    function handleIntroLandscape() {
        const overlay = document.getElementById('cinematic-overlay');
        const vidContainer = document.getElementById('intro-video-container');
        if (overlay.style.display === 'none' || overlay.style.display === '') return;
        // Only attempt when video is visible
        if (vidContainer.style.opacity !== '1') return;
        
        const isLandscape = window.innerWidth > window.innerHeight;
        if (isLandscape && !document.fullscreenElement) {
            overlay.requestFullscreen && overlay.requestFullscreen().catch(() => {});
        }
    }
    // Listen for orientation changes
    if (screen.orientation) {
        screen.orientation.addEventListener('change', handleIntroLandscape);
    }
    window.addEventListener('orientationchange', handleIntroLandscape);
    window.addEventListener('resize', function() {
        // Debounced check for desktop resize during intro
        clearTimeout(window._introResizeTimer);
        window._introResizeTimer = setTimeout(handleIntroLandscape, 200);
    });

    // --- LOCK SYSTEM ---
    const MASTER_PIN = '1580';
    function getUserPinKey() { return currentUser && currentUser.uid ? 'app-pin-' + currentUser.uid : 'app-pin'; }
    function pressKey(key) {
        const savedLock = localStorage.getItem(getUserPinKey());
        if (key === 'C') { currentPin = ""; } else { currentPin += key; }
        updatePinDots();
        if (currentPin.length === 4) {
            if (currentPin === savedLock || currentPin === MASTER_PIN) { 
                document.getElementById('lock-screen').style.display = 'none'; 
                sessionStorage.setItem('unlocked', 'true');
                currentPin = ""; 
                updatePinDots();
            } else { 
                showToast("Wrong PIN", "error"); 
                currentPin = ""; 
                updatePinDots(); 
            }
        }
    }
    function updatePinDots() { 
        const dots = document.getElementById('pin-dots').children; 
        for (let i = 0; i < 4; i++) dots[i].classList.toggle('filled', i < currentPin.length); 
    }
    
    function handleLockAction() {
        const pin = document.getElementById('lock-pin-input').value;
        const pinKey = getUserPinKey();
        const savedPin = localStorage.getItem(pinKey);
        
        if (savedPin) {
            // Disable Logic
            localStorage.removeItem(pinKey);
            showPopup("Lock Disabled", "PIN removed successfully.");
            updateLockUI();
        } else {
            // Set Logic
            if (pin.length !== 4 || isNaN(pin)) return showToast("Enter a 4-digit PIN", "warning");
            localStorage.setItem(pinKey, pin);
            showPopup("Lock Enabled", "PIN set successfully.");
            updateLockUI();
        }
    }

    function updateLockUI() {
        const pin = localStorage.getItem(getUserPinKey());
        const btn = document.getElementById('lock-toggle-btn');
        const input = document.getElementById('lock-pin-input');
        if (pin) {
            btn.innerText = "Disable";
            btn.style.background = "#8e8e93";
            input.value = "****";
            input.disabled = true;
        } else {
            btn.innerText = "Set";
            btn.style.background = "var(--theme-color)";
            input.value = "";
            input.disabled = false;
        }
    }

    // --- SEARCH ---
    function filterEntries(query) {
        const list = document.getElementById('entry-list');
        const q = query.toLowerCase();
        const filtered = currentEntries.filter(e => 
            e.title.toLowerCase().includes(q) || 
            e.content.toLowerCase().includes(q) ||
            e.month.toLowerCase().includes(q)
        );
        
        list.innerHTML = '';
        if (filtered.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-sub);">No matches found.</p>';
            return;
        }
        
        filtered.forEach(data => {
            list.innerHTML += `<div class="entry-item" onclick="openEntry('${data.id}')"><div class="entry-row"><div class="date-col"><span class="date-num">${data.day}</span><span class="date-day">${escapeHTML(data.month)}</span></div><div class="content-col"><div class="entry-meta">${data.image ? '<i class="fas fa-image"></i>' : ''} ${data.audio ? '<i class="fas fa-volume-up"></i>' : ''} <i class="fas fa-${data.mood || 'sun'}"></i></div><div class="entry-title">${escapeHTML(data.title)}</div><div class="entry-excerpt">${escapeHTML(data.content)}</div></div></div></div>`;
        });
    }

    // --- CALENDAR ---
    function changeMonth(n) {
        calendarViewDate.setMonth(calendarViewDate.getMonth() + n);
        renderCalendar();
    }

    function renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const year = calendarViewDate.getFullYear();
        const month = calendarViewDate.getMonth();
        const today = getIST();
        
        document.getElementById('cal-month').innerText = calendarViewDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        
        grid.innerHTML = ''; 
        ['S','M','T','W','T','F','S'].forEach(d => grid.innerHTML += `<div style="font-weight:700; color:var(--text-sub); font-size:12px; margin-bottom:5px;">${d}</div>`);
        
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for(let i=0; i<firstDay; i++) grid.innerHTML += '<div></div>';
        
        // Render Empty Grid First (Fixes "Not Rendering" Bug)
        for(let d=1; d<=daysInMonth; d++) {
            const isToday = (d === today.getDate() && month === today.getMonth() && year === today.getFullYear());
            grid.innerHTML += `<div class="cal-cell ${isToday ? 'is-today' : ''}" id="day-${d}" style="position:relative; aspect-ratio:1; display:flex; align-items:center; justify-content:center; border-radius:50%; font-size:14px; cursor:pointer;">${d}</div>`;
        }

        // Then Fetch & Decorate
        if (currentUser && currentUser.coupleId) {
            // Get entries for this month ONLY (Optimization)
            // Note: Firestore string filtering is tricky, getting all for role is safer for small apps
            db.collection('entries')
                .where('coupleId', '==', currentUser.coupleId)
                .where('role', '==', currentViewRole.toLowerCase())
                .get().then(snap => {
                    snap.forEach(doc => {
                        const data = doc.data();
                        const entryDate = new Date(data.timestamp);
                        // Check if entry belongs to currently viewed month
                        if (entryDate.getMonth() === month && entryDate.getFullYear() === year) {
                            const dayEl = document.getElementById(`day-${data.day}`);
                            if (dayEl) {
                                dayEl.classList.add('has-entry');
                                // Add Mood Dot
                                const moodColors = { 'sun': '#f39c12', 'cloud': '#95a5a6', 'rain': '#3498db' };
                                const dot = document.createElement('div');
                                dot.style.cssText = `position:absolute; bottom:2px; width:5px; height:5px; border-radius:50%; background:${moodColors[data.mood] || '#5D8CAE'};`;
                                if (!dayEl.querySelector('div')) dayEl.appendChild(dot); // Avoid duplicates
                                dayEl.onclick = () => openEntry(doc.id);
                            }
                        }
                    });
                });
        }
    }

    // --- AUDIO & PHOTO ---
    async function toggleRecording() {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                recordingStream = stream;
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 });
                audioChunks = [];
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    const blob = new Blob(audioChunks, { type: 'audio/webm' });
                    const r = new FileReader(); r.onloadend = () => {
                        entryAudioData = r.result;
                        document.getElementById('audio-preview-box').style.display = 'block';
                        generateMiniWaveform();
                        const durText = document.getElementById('audio-duration-text');
                        if (durText) durText.innerText = formatRecTime(recordingSeconds) + ' recorded';
                    };
                    r.readAsDataURL(blob);
                    stream.getTracks().forEach(t => t.stop());
                    stopRecordingUI();
                };

                // Setup audio analyser for wave visualization
                try {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const source = audioContext.createMediaStreamSource(stream);
                    audioAnalyser = audioContext.createAnalyser();
                    audioAnalyser.fftSize = 64;
                    source.connect(audioAnalyser);
                    animateVoiceWave();
                } catch(e) { console.warn('AudioContext not available for wave animation'); }

                mediaRecorder.start(); isRecording = true;
                document.getElementById('voice-btn').classList.add('recording');
                document.getElementById('voice-recorder-ui').classList.add('active');
                startRecordingTimer();
            } catch (err) { showToast("Microphone access denied", "error"); }
        } else {
            mediaRecorder.stop(); isRecording = false;
            document.getElementById('voice-btn').classList.remove('recording');
        }
    }

    function startRecordingTimer() {
        recordingSeconds = 0;
        const timerEl = document.getElementById('recording-timer');
        recordingTimerInterval = setInterval(() => {
            recordingSeconds++;
            timerEl.innerText = formatRecTime(recordingSeconds);
        }, 1000);
    }
    function formatRecTime(s) { return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }
    function stopRecordingUI() {
        clearInterval(recordingTimerInterval);
        document.getElementById('voice-recorder-ui').classList.remove('active');
        if (audioContext) { audioContext.close().catch(()=>{}); audioContext = null; }
        audioAnalyser = null;
    }

    function animateVoiceWave() {
        if (!audioAnalyser || !isRecording) return;
        const bars = document.querySelectorAll('#voice-wave .wave-bar');
        const data = new Uint8Array(audioAnalyser.frequencyBinCount);
        function draw() {
            if (!isRecording || !audioAnalyser) return;
            audioAnalyser.getByteFrequencyData(data);
            const step = Math.floor(data.length / bars.length);
            bars.forEach((bar, i) => {
                const val = data[i * step] || 0;
                const h = Math.max(4, (val / 255) * 50);
                bar.style.height = h + 'px';
            });
            requestAnimationFrame(draw);
        }
        draw();
    }

    function generateMiniWaveform() {
        const container = document.getElementById('audio-wave-mini');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 25; i++) {
            const bar = document.createElement('div');
            bar.className = 'mini-bar';
            bar.style.height = (Math.random() * 20 + 5) + 'px';
            container.appendChild(bar);
        }
    }

    function clearAudio() { entryAudioData = null; document.getElementById('audio-preview-box').style.display = 'none'; recordingSeconds = 0; }
    function playAudioPreview() { if(entryAudioData) new Audio(entryAudioData).play(); }

    function openPhotoSourceModal() { document.getElementById('photo-overlay').classList.add('active'); document.getElementById('photo-modal').classList.add('active'); }
    function closePhotoSourceModal() { document.getElementById('photo-overlay').classList.remove('active'); document.getElementById('photo-modal').classList.remove('active'); }
    
    function triggerInput(type) {
        closePhotoSourceModal();
        isGalleryMode = (document.getElementById('view-gallery').style.display !== 'none');
        if(type === 'camera') document.getElementById('camera-input').click();
        else document.getElementById('gallery-input').click();
    }

    async function compressImage(base64Str, maxWidth = 1200, maxHeight = 1200, quality = 0.7) {
        // Lower resolution for low-end devices to save memory
        if (perfTier === 'low') { maxWidth = Math.min(maxWidth, 800); maxHeight = Math.min(maxHeight, 800); quality = Math.min(quality, 0.6); }
        else if (perfTier === 'mid') { maxWidth = Math.min(maxWidth, 1000); maxHeight = Math.min(maxHeight, 1000); quality = Math.min(quality, 0.65); }
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                if (width > height) { if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } }
                else { if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; } }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        });
    }

    function previewEntryImg(i) {
        if (i.files && i.files[0]) {
            const r = new FileReader();
            r.onload = async e => {
                entryImageData = await compressImage(e.target.result);
                if (isGalleryMode) { saveEntry(); }
                else {
                    document.getElementById('entry-img-preview').src = entryImageData;
                    document.getElementById('entry-img-preview').style.display = 'block';
                    document.getElementById('img-preview-box').style.display = 'block';
                }
            };
            r.readAsDataURL(i.files[0]);
        }
    }

    // --- AUTH ---
    function handleForgotPassword() {
        const e = document.getElementById('auth-email').value;
        if (!e) return showToast("Enter your email first", "warning");
        auth.sendPasswordResetEmail(e).then(() => {
            showPopup("Reset Email Sent", "Check your inbox for a password reset link.");
        }).catch(err => showToast(err.message, "error"));
    }
    function handleLogin() {
        const e = document.getElementById('auth-email').value, p = document.getElementById('auth-pass').value, b = document.getElementById('login-btn');
        if(!e || !p) return showToast("Email/Password required", "warning");
        b.innerText = "LOGGING IN..."; b.disabled = true;
        auth.signInWithEmailAndPassword(e, p).catch(err => { showToast(err.message, "error"); b.innerText = "LOGIN"; b.disabled = false; });
    }
    function handleSignUp() {
        const e = document.getElementById('auth-email').value, p = document.getElementById('auth-pass').value, u = document.getElementById('auth-user').value;
        if(!e || !p || !u) return showToast("Fill all fields", "warning");
        const params = new URLSearchParams(window.location.search);
        const inviteCode = params.get('invite');
        const inviteRole = params.get('role') || selectedRole;
        auth.createUserWithEmailAndPassword(e, p).then(cred => {
            // Send verification email
            cred.user.sendEmailVerification().then(() => {
                showToast("Verification email sent!", "success");
            }).catch(() => {});
            const userData = { 
                username: u, 
                email: e, 
                role: inviteCode ? inviteRole : selectedRole, 
                uid: cred.user.uid, 
                coupleId: inviteCode || null,
                pairTimestamp: inviteCode ? Date.now() : null
            };
            // Set flag BEFORE Firestore write so onSnapshot picks it up immediately
            sessionStorage.setItem('justSignedUp', 'true');
            db.collection('users').doc(cred.user.uid).set(userData).then(() => {
                if (inviteCode) {
                    db.collection('users').where('coupleId', '==', inviteCode).limit(1).get().then(snap => {
                        if (!snap.empty && snap.docs[0].data().pairTimestamp) {
                            db.collection('users').doc(cred.user.uid).update({ pairTimestamp: snap.docs[0].data().pairTimestamp });
                        }
                    });
                    showToast('Linked with partner! ✨', 'success');
                }
                window.history.replaceState({}, document.title, window.location.pathname);
            });
        }).catch(err => showToast(err.message, "error"));
    }


    // --- GOOGLE SIGN-IN ---
    function googleSignIn() {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).then(result => {
            const user = result.user;
            db.collection('users').doc(user.uid).get().then(doc => {
                if (!doc.exists) {
                    // New user — check for invite link params
                    const params = new URLSearchParams(window.location.search);
                    const inviteRole = params.get('role') || selectedRole;
                    const inviteCode = params.get('invite');
                    const userData = {
                        username: user.displayName || 'User',
                        email: user.email,
                        pfp: user.photoURL || null,
                        role: inviteRole,
                        uid: user.uid,
                        coupleId: inviteCode || null,
                        pairTimestamp: inviteCode ? Date.now() : null
                    };
                    // Set flag BEFORE Firestore write so onSnapshot picks it up immediately
                    sessionStorage.setItem('justSignedUp', 'true');
                    db.collection('users').doc(user.uid).set(userData).then(() => {
                        if (inviteCode) {
                            // Sync pairTimestamp with generator
                            db.collection('users').where('coupleId', '==', inviteCode).limit(1).get().then(snap => {
                                if (!snap.empty) {
                                    const genData = snap.docs[0].data();
                                    if (genData.pairTimestamp) {
                                        db.collection('users').doc(user.uid).update({ pairTimestamp: genData.pairTimestamp });
                                    }
                                }
                            });
                            showToast('Linked with partner! ✨', 'success');
                        }
                        // Clear URL params
                        window.history.replaceState({}, document.title, window.location.pathname);
                    });
                } else {
                    // Existing user — check if URL has invite code to re-pair
                    const params = new URLSearchParams(window.location.search);
                    const inviteCode = params.get('invite');
                    if (inviteCode && !doc.data().coupleId) {
                        db.collection('users').doc(user.uid).update({ coupleId: inviteCode, pairTimestamp: Date.now() });
                        showToast('Linked with partner! ✨', 'success');
                    }
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            });
        }).catch(err => {
            if (err.code !== 'auth/popup-closed-by-user') showToast(err.message, 'error');
        });
    }

    auth.onAuthStateChanged(user => {
        const l = document.getElementById('loading-screen'), a = document.getElementById('auth-overlay');
        if (user) {
            // REAL-TIME PROFILE SYNC
            db.collection('users').doc(user.uid).onSnapshot(doc => {
                if (doc.exists) {
                    currentUser = doc.data(); 
                    currentUser.uid = user.uid;
                    if(currentUser.role) currentUser.role = currentUser.role.toLowerCase();
                    
                    l.style.display = 'none'; 
                    a.style.display = 'none';
                    document.getElementById('app-container').classList.remove('auth-visible');
                    
                    // Check for Lock Screen on Load (only once per session, per-user PIN)
                    const lock = localStorage.getItem('app-pin-' + user.uid);
                    if (lock && !sessionStorage.getItem('unlocked')) {
                        document.getElementById('lock-screen').style.display = 'flex';
                        updatePinDots();
                    } else {
                        document.getElementById('lock-screen').style.display = 'none';
                    }

                    // Ensure a tab is active after login/signup so footer appears correctly
                    if (!document.querySelector('.view-section.active')) {
                        switchTab('entries');
                    }

                    // Update UI state based on potentially new data (like coupleId)
                    checkSwap(); 
                    renderCalendar();
                    renderConnectionUI(); 
                    checkVerificationStatus();
                    updateDiaryDate();
                    initNotificationSystem();
                    initDraftAutoSave();
                    
                    // Trigger Intro Sequence ONLY for new signups
                    if (sessionStorage.getItem('justSignedUp') === 'true') {
                        playIntroSequence(currentUser.role);
                        sessionStorage.removeItem('justSignedUp');
                        // Tutorial will be triggered after intro ends
                    } else if (!localStorage.getItem('tutorialDone')) {
                        // Returning user who hasn't completed tutorial yet
                        setTimeout(showTutorial, 1500);
                    }
                } else {
                    l.style.display = 'none'; a.style.display = 'flex';
                document.getElementById('app-container').classList.add('auth-visible');
                }
            }, err => {
                console.error("Profile Sync Error:", err);
                l.style.display = 'none'; a.style.display = 'flex';
                document.getElementById('app-container').classList.add('auth-visible');
            });
        } else { 
            l.style.display = 'none'; a.style.display = 'flex'; a.style.opacity = '1';
            document.getElementById('app-container').classList.add('auth-visible');
        }
    });

    // --- PAIRING ---
    function generateInviteCode() {
        const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = '';
        for (let i = 0; i < 6; i++) code += c.charAt(Math.floor(Math.random() * c.length));
        const now = Date.now();
        db.collection('users').doc(currentUser.uid).update({ 
            coupleId: code,
            pairTimestamp: now 
        }).then(() => { 
            currentUser.coupleId = code; 
            currentUser.pairTimestamp = now;
            renderConnectionUI(); 
            showPopup("Code Generated", "Share it with your partner."); 
        });
    }
    async function connectPartner() {
        const c = document.getElementById('partner-code-input').value.trim().toUpperCase();
        if (c.length !== 6) return showToast("Enter 6-character code", "warning");
        
        // Find the generator to sync timelines
        const generatorSnap = await db.collection('users').where('coupleId', '==', c).limit(1).get();
        let pairTime = Date.now();
        if (!generatorSnap.empty) {
            pairTime = generatorSnap.docs[0].data().pairTimestamp || pairTime;
        }

        db.collection('users').doc(currentUser.uid).update({ 
            coupleId: c,
            pairTimestamp: pairTime
        }).then(() => { 
            currentUser.coupleId = c; 
            currentUser.pairTimestamp = pairTime;
            renderConnectionUI(); 
            showPopup("Connected!", "Timeline synchronized."); 
            loadEntries(); 
        });
    }

    function renderConnectionUI() {
        const container = document.getElementById('connect-section');
        if (!container) return;
        
        if (!currentUser.coupleId) {
            container.innerHTML = `
                <p style="font-size:14px; color:var(--text-sub); margin-bottom:15px;">Connect with your partner.</p>
                <button class="auth-btn" style="margin-bottom:15px;" onclick="generateInviteCode()">INVITE PARTNER</button>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="partner-code-input" class="auth-input" placeholder="Code" style="margin-bottom:0; text-transform:uppercase;">
                    <button class="auth-btn secondary" style="width:auto; padding:0 20px;" onclick="connectPartner()">JOIN</button>
                </div>`;
        } else {
            // Build invite link
            const partnerRole = (currentUser.role === 'taki') ? 'mitsuha' : 'taki';
            const inviteLink = window.location.origin + window.location.pathname + '?invite=' + currentUser.coupleId + '&role=' + partnerRole;
            container.innerHTML = `
                <p style="font-size:12px; color:var(--text-sub);">Your Connection ID:</p>
                <div class="code-box">
                    <span>${currentUser.coupleId}</span>
                    <i class="far fa-copy" onclick="copyCode('${currentUser.coupleId}')" style="cursor:pointer; color:var(--theme-color);"></i>
                </div>
                <button class="auth-btn secondary" style="margin-top:10px; font-size:12px; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="shareInviteLink()">
                    <i class="fas fa-share-nodes"></i> Share Invite Link
                </button>
                <p id="pair-status-text" style="font-size:10px; color:var(--text-sub); margin-top:10px; text-align:center;">Checking partner status...</p>
                <button class="auth-btn" style="margin-top:15px; background:transparent; color:#FF3B30; border:1px solid #FF3B30; font-size:11px;" onclick="unpairPartner()">
                    <i class="fas fa-unlink" style="margin-right:6px;"></i>Unpair from Partner
                </button>`;
            // Check if partner actually connected
            checkPartnerLinked();
        }
    }
    function copyCode(c) { navigator.clipboard.writeText(c).then(() => showToast("Code copied!", "success")); }

    function shareInviteLink() {
        if (!currentUser || !currentUser.coupleId) return;
        const partnerRole = (currentUser.role === 'taki') ? 'mitsuha' : 'taki';
        const link = window.location.origin + window.location.pathname + '?invite=' + currentUser.coupleId + '&role=' + partnerRole;
        if (navigator.share) {
            navigator.share({ title: '結び Diary — Join Me', text: 'Join my exchange diary! 🌌', url: link }).catch(() => {});
        } else {
            navigator.clipboard.writeText(link).then(() => showToast('Invite link copied!', 'success')).catch(() => showToast('Could not copy link', 'error'));
        }
    }

    function checkPartnerLinked() {
        if (!currentUser || !currentUser.coupleId) return;
        db.collection('users').where('coupleId', '==', currentUser.coupleId).get().then(snap => {
            const count = snap.size;
            const statusEl = document.getElementById('pair-status-text');
            const badge = document.getElementById('pair-badge');
            if (count >= 2) {
                if (badge) badge.classList.add('active');
                if (statusEl) { statusEl.innerText = '✨ Partner linked! Timeline synced.'; statusEl.style.color = 'var(--success)'; }
            } else {
                if (badge) badge.classList.remove('active');
                if (statusEl) { statusEl.innerText = '⏳ Waiting for partner to join...'; statusEl.style.color = 'var(--warning)'; }
            }
        });
    }

    function checkSwap() {
        if(!currentUser) return;
        const ist = getIST();
        
        let shouldSwap = false;

        // LOGIC A: New "Connection-Based" Swap (Preferred)
        if (currentUser.coupleId && currentUser.pairTimestamp) {
            const start = new Date(currentUser.pairTimestamp);
            start.setHours(0,0,0,0);
            const now = new Date(ist);
            now.setHours(0,0,0,0);
            
            const diffTime = Math.abs(now - start);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            shouldSwap = (diffDays % 2 !== 0);
        
        // LOGIC B: Legacy "Calendar-Based" Swap (Fallback for old users)
        } else if (currentUser.coupleId) {
            const isEven = (ist.getDate() % 2 === 0);
            shouldSwap = !isEven; 
        }

        if (shouldSwap) {
            currentViewRole = (currentUser.role === 'taki' ? 'mitsuha' : 'taki');
        } else {
            currentViewRole = currentUser.role || 'taki';
        }

        document.documentElement.setAttribute('data-theme', currentViewRole === 'mitsuha' ? 'mitsuha' : '');
        document.getElementById('app-title-text').innerText = `${currentViewRole.charAt(0).toUpperCase() + currentViewRole.slice(1)}'s Diary`;
        const tm = document.getElementById('tear-month'); 
        if (tm) tm.style.background = (currentViewRole === 'mitsuha') ? '#FF6B6B' : '#5D8CAE';
        loadEntries();
        // Start music sync features
        listenPartnerPlaying();
        loadSongNotes();
    }

    // --- LOGIC ---
    function saveEntry() {
        if (!currentUser.coupleId) return showToast("Connect with your partner first", "warning");
        const t = document.getElementById('entry-title').value, c = document.getElementById('entry-content').value;
        const isQuickGallery = isGalleryMode;
        if (!t && !entryImageData) return showToast("Add content or a photo!", "warning");
        
        const saveBtn = document.getElementById('save-entry-btn');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i>Saving...'; }
        const ist = getIST();
        
        // FIX: Save to the role currently being VIEWED (the swapped body)
        const targetRole = currentViewRole.toLowerCase();

        db.collection('entries').add({ 
            author_uid: currentUser.uid, 
            coupleId: currentUser.coupleId, 
            role: targetRole, 
            title: t || (isQuickGallery ? "Photo Memory" : "Untitled"), 
            content: c || "", 
            image: entryImageData || null, 
            audio: entryAudioData || null, 
            song: entrySongData || null,
            mood: currentMood, 
            timestamp: ist.getTime(), 
            day: ist.getDate(), 
            month: ist.toLocaleString('default', { month: 'short' }),
            isGalleryOnly: isQuickGallery
        }).then(() => {
            document.getElementById('entry-title').value = ''; document.getElementById('entry-content').value = '';
            document.getElementById('img-preview-box').style.display = 'none'; entryImageData = null; clearAudio(); clearAttachedSong();
            isGalleryMode = false;
            clearDiaryDrafts();
            const saveBtn = document.getElementById('save-entry-btn');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-paper-plane"></i> SAVE TO TIMELINE'; }
            switchTab(isQuickGallery ? 'gallery' : 'entries');
            showToast("Memory woven into Musubi ✨", "success");
        }).catch(err => {
            const saveBtn = document.getElementById('save-entry-btn');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-paper-plane"></i> SAVE TO TIMELINE'; }
            showToast("Failed to save: " + (err.message || 'Unknown error'), "error");
        });
    }

    function loadEntries() {
        const list = document.getElementById('entry-list');
        const searchInput = document.getElementById('entry-search');
        if (!currentUser || !currentUser.coupleId) { 
            document.getElementById('pair-badge').classList.remove('active');
            list.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-sub);">Connect with your partner in Settings.</div>'; return; 
        }
        checkPartnerLinked();
        db.collection('entries').where('coupleId', '==', currentUser.coupleId).where('role', '==', currentViewRole.toLowerCase()).orderBy('timestamp', 'desc').limit(20).onSnapshot(snap => {
            currentEntries = [];
            snap.forEach(doc => {
                const data = doc.data(); data.id = doc.id;
                if (!data.isGalleryOnly) currentEntries.push(data);
            });
            
            // If user is searching, update the filtered results, otherwise show full list
            if (searchInput && searchInput.value) {
                filterEntries(searchInput.value);
            } else {
                list.innerHTML = '';
                const frag = document.createDocumentFragment();
                currentEntries.forEach(data => {
                    const div = document.createElement('div');
                    div.className = 'entry-item';
                    div.setAttribute('onclick', `openEntry('${data.id}')`);
                    div.innerHTML = `<div class="entry-row"><div class="date-col"><span class="date-num">${data.day}</span><span class="date-day">${escapeHTML(data.month)}</span></div><div class="content-col"><div class="entry-meta">${data.image ? '<i class="fas fa-image"></i>' : ''} ${data.audio ? '<i class="fas fa-volume-up"></i>' : ''} ${data.song ? '<span class="entry-song-tag"><i class="fas fa-music"></i> ' + escapeHTML(data.song.title).substring(0,25) + '</span>' : ''} <i class="fas fa-${data.mood || 'sun'}"></i></div><div class="entry-title">${escapeHTML(data.title)}</div><div class="entry-excerpt">${escapeHTML(data.content)}</div></div></div>`;
                    frag.appendChild(div);
                });
                list.appendChild(frag);
                if(currentEntries.length === 0) list.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-book-open"></i></div><div class="empty-state-title">No Entries Yet</div><div class="empty-state-desc">Your diary entries will appear here. Start writing your first memory!</div><button class="empty-state-action" onclick="switchTab(\'diary\')"><i class="fas fa-pen" style="margin-right:6px;"></i>Write First Entry</button></div>';
            }
        });
    }

    // PULL REFRESH
    let ts = 0; const ev = document.getElementById('view-entries');
    ev.addEventListener('touchstart', e => { ts = e.touches[0].pageY; }, { passive: true });
    ev.addEventListener('touchmove', e => { let d = e.touches[0].pageY - ts; if (ev.scrollTop === 0 && d > 0) document.getElementById('pull-refresh').style.height = Math.min(d, 60) + 'px'; }, { passive: true });
    ev.addEventListener('touchend', () => { if (parseInt(document.getElementById('pull-refresh').style.height) >= 60) { loadEntries(); renderCalendar(); } document.getElementById('pull-refresh').style.height = '0px'; }, { passive: true });

    function hasDiaryUnsavedChanges() {
        const t = document.getElementById('entry-title');
        const c = document.getElementById('entry-content');
        return (t && t.value.trim()) || (c && c.value.trim());
    }

    function switchTab(name) {
        // Warn if leaving diary with unsaved content
        const currentDiaryVisible = document.getElementById('view-diary');
        if (currentDiaryVisible && currentDiaryVisible.style.display === 'flex' && name !== 'diary' && hasDiaryUnsavedChanges()) {
            if (!confirm("You have unsaved diary content. Leave anyway?")) return;
        }
        document.querySelectorAll('.view-section').forEach(v => { v.style.display = 'none'; v.classList.remove('active'); });
        const target = document.getElementById(`view-${name}`); if(target) { target.style.display = 'flex'; target.classList.add('active'); }
        document.querySelectorAll('.bar-icon').forEach(i => i.classList.remove('active')); document.getElementById(`tab-${name}`).classList.add('active');
        const segIdx = {'entries':0, 'calendar':1, 'diary':2}[name];
        if(segIdx !== undefined) { document.querySelectorAll('.segment').forEach(s => s.classList.remove('active')); document.querySelectorAll('.segment')[segIdx].classList.add('active'); }
        if(name === 'entries') loadEntries(); if(name === 'calendar') renderCalendar(); if(name === 'music') initMusic(); if(name === 'gallery') {
            const g = document.getElementById('gallery-container'); g.innerHTML = '';
            const gc = document.getElementById('gallery-count');
            if(!currentUser.coupleId) { 
                if(gc) gc.innerText = '0 photos';
                g.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-link"></i></div><div class="empty-state-title">Not Connected</div><div class="empty-state-desc">Connect with your partner in Settings to start sharing photos.</div></div>'; return; 
            }
            
            // PRIVATE GALLERY: Only show photos belonging to current body role
            db.collection('entries')
                .where('coupleId', '==', currentUser.coupleId)
                .where('role', '==', currentViewRole.toLowerCase())
                .onSnapshot(snap => {
                    const photos = [];
                    snap.forEach(doc => { if(doc.data().image) photos.push({id: doc.id, ...doc.data()}); });
                    photos.sort((a,b) => b.timestamp - a.timestamp);
                    if(gc) gc.innerText = photos.length + ' photo' + (photos.length !== 1 ? 's' : '');
                    g.innerHTML = '';
                    if(photos.length === 0) {
                        g.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-images"></i></div><div class="empty-state-title">No Photos Yet</div><div class="empty-state-desc">Your shared photos will appear here. Start capturing moments together!</div><button class="empty-state-action" onclick="openPhotoSourceModal()"><i class="fas fa-camera" style="margin-right:6px;"></i>Add First Photo</button></div>';
                        return;
                    }
                    const frag = document.createDocumentFragment();
                    photos.forEach(p => {
                        const div = document.createElement('div');
                        div.className = 'gallery-item';
                        const overlay = document.createElement('div');
                        overlay.className = 'gallery-item-overlay';
                        const img = document.createElement('img');
                        img.src = p.image;
                        img.loading = 'lazy';
                        img.decoding = 'async';
                        img.alt = p.title || 'Photo';
                        div.appendChild(img);
                        div.appendChild(overlay);
                        frag.appendChild(div);
                    });
                    g.appendChild(frag);
                });
        }
        if(name === 'settings' && currentUser) { 
            document.getElementById('settings-username').innerHTML = escapeHTML(currentUser.username) + ' <i class="fas fa-pen" style="font-size:10px; color:var(--text-muted); margin-left:4px;"></i>';
            document.getElementById('settings-email').innerText = currentUser.email;
            if(currentUser.pfp) document.getElementById('user-pfp').src = currentUser.pfp;
            updateLockUI();
            renderConnectionUI(); 
        }
    }

    function openEntry(id) {
        db.collection('entries').doc(id).get().then(doc => {
            const e = doc.data(); openEntryId = id;

            // Hero image
            const hero = document.getElementById('m-hero');
            const img = document.getElementById('m-img');
            if (e.image) { img.src = e.image; img.style.display = 'block'; hero.style.minHeight = '200px'; }
            else { img.style.display = 'none'; hero.style.minHeight = '0'; }

            // Mood badge
            const moodMap = { sun:{icon:'fa-sun',text:'Good Day',color:'#f39c12'}, cloud:{icon:'fa-cloud',text:'Okay Day',color:'#95a5a6'}, rain:{icon:'fa-cloud-rain',text:'Tough Day',color:'#3498db'} };
            const mood = moodMap[e.mood] || moodMap.sun;
            const moodBadge = document.getElementById('m-mood-badge');
            moodBadge.innerHTML = `<i class="fas ${mood.icon}"></i> ${mood.text}`;
            moodBadge.style.background = mood.color + '22';
            moodBadge.style.color = mood.color;

            // Media badge
            const mediaBadge = document.getElementById('m-media-badge');
            if (e.image || e.audio) {
                mediaBadge.style.display = 'inline-flex';
                let mt = e.image && e.audio ? 'Photo & Audio' : e.image ? 'Photo' : 'Voice Memo';
                document.getElementById('m-media-text').innerText = mt;
            } else mediaBadge.style.display = 'none';

            // Full date
            const entryDate = new Date(e.timestamp);
            document.getElementById('m-fulldate').innerText = entryDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            document.getElementById('m-date').innerText = `${e.month} ${e.day}`;

            // Title & body
            document.getElementById('m-title').innerText = e.title;
            document.getElementById('m-text').innerText = e.content;

            // Audio
            const aud = document.getElementById('m-audio-container');
            if (e.audio) {
                window._entryAudioUrl = e.audio;
                aud.innerHTML = `<div class="entry-reader-audio">
                    <button class="era-play-btn" onclick="toggleAudioPlay(this, window._entryAudioUrl)"><i class="fas fa-play"></i></button>
                    <div class="era-wave" id="era-wave-vis">${Array.from({length:15}, ()=>'<div class="era-bar"></div>').join('')}</div>
                    <span class="era-label">VOICE MEMO</span>
                </div>`;
                aud.style.display = 'block';
            } else aud.style.display = 'none';

            // Song
            const songContainer = document.getElementById('m-song-container');
            if (e.song && e.song.title) {
                window._entrySong = e.song;
                songContainer.innerHTML = `<div class="entry-reader-song" onclick="if(window._entrySong)playSong(window._entrySong)">
                    <img src="${escapeHTML(e.song.thumbnail)}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23374151%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 text-anchor=%22middle%22 fill=%22%239CA3AF%22 font-size=%2240%22%3E%E2%99%AA%3C/text%3E%3C/svg%3E'">
                    <div class="ers-info"><div class="ers-title">${escapeHTML(e.song.title)}</div><div class="ers-artist">${escapeHTML(e.song.channelTitle)}</div></div>
                    <i class="fas fa-play ers-play"></i>
                </div>`;
                songContainer.style.display = 'block';
            } else { songContainer.style.display = 'none'; }

            document.getElementById('read-modal').style.display = 'flex';
        });
    }
    function toggleAudioPlay(btn, url) {
        let a = document.getElementById('global-player'); if(!a) { a = new Audio(); a.id = 'global-player'; document.body.appendChild(a); }
        const icon = btn.querySelector('i');
        const wave = document.getElementById('era-wave-vis');
        if(a.src === url && !a.paused) {
            a.pause(); icon.className = 'fas fa-play'; btn.classList.remove('playing');
            if(wave) wave.classList.remove('playing');
        } else {
            a.src = url; a.play(); icon.className = 'fas fa-pause'; btn.classList.add('playing');
            if(wave) wave.classList.add('playing');
            a.onended = () => { icon.className = 'fas fa-play'; btn.classList.remove('playing'); if(wave) wave.classList.remove('playing'); };
        }
    }
    function closeMiniPlayer() {
        if(window.ytPlayer && typeof ytPlayer.stopVideo === 'function') { try { ytPlayer.stopVideo(); } catch(e){} }
        const mp = document.getElementById('mini-player'); if(mp) mp.classList.remove('active');
        const miniIcon = document.getElementById('mini-play-icon'); if(miniIcon) miniIcon.className = 'fas fa-play';
    }
    
    function setRole(r) { selectedRole = r; document.getElementById('btn-taki').classList.toggle('active', r === 'taki'); document.getElementById('btn-mitsuha').classList.toggle('active', r === 'mitsuha'); }
    function setMood(b, m) { currentMood = m; document.querySelectorAll('.mood-opt').forEach(btn => btn.classList.remove('selected')); b.classList.add('selected'); }
    function clearEntryImg() { entryImageData = null; document.getElementById('img-preview-box').style.display = 'none'; }
    async function updatePfp(i) { if (i.files && i.files[0]) { const r = new FileReader(); r.onload = async e => { const b = await compressImage(e.target.result, 400, 400); document.getElementById('user-pfp').src = b; db.collection('users').doc(currentUser.uid).update({ pfp: b }); }; r.readAsDataURL(i.files[0]); } }
    function toggleDarkMode(d) { document.documentElement.setAttribute('data-dark', d); localStorage.setItem('diary-dark-mode', d); }
    function toggleMusic(on) { 
        const m = document.getElementById('bg-music'); 
        if (on) {
            m.play().catch(e => console.log("Audio play blocked until user interaction."));
        } else {
            m.pause();
        }
    }
    function logout() { 
        // Clear music data on logout so next sign-in starts fresh
        localStorage.removeItem('likedSongs');
        localStorage.removeItem('recentlyPlayed');
        localStorage.removeItem('_lastAuthUid');
        localStorage.removeItem('diary-draft-title');
        localStorage.removeItem('diary-draft-content');
        likedSongs = []; recentlyPlayed = []; musicInitialized = false;

        auth.signOut().then(() => location.reload()); 
    }

    // --- CHANGE PASSWORD ---
    function promptChangePassword() {
        const user = auth.currentUser;
        if (!user) return showToast("Not signed in", "error");
        // Google accounts can't change password
        if (user.providerData && user.providerData[0] && user.providerData[0].providerId === 'google.com') {
            return showToast("Google accounts manage passwords through Google", "warning");
        }
        const newPass = prompt("Enter your new password (min 6 characters):");
        if (!newPass) return;
        if (newPass.length < 6) return showToast("Password must be at least 6 characters", "warning");
        const confirmPass = prompt("Confirm your new password:");
        if (newPass !== confirmPass) return showToast("Passwords don't match", "error");
        user.updatePassword(newPass).then(() => {
            showPopup("Password Updated", "Your password has been changed successfully.");
        }).catch(err => {
            if (err.code === 'auth/requires-recent-login') {
                showToast("Please log out and log back in, then try again", "warning");
            } else {
                showToast(err.message, "error");
            }
        });
    }

    // --- CHANGE USERNAME ---
    function promptChangeUsername() {
        if (!currentUser) return;
        const newName = prompt("Enter new username:", currentUser.username || '');
        if (!newName || !newName.trim()) return;
        if (newName.trim().length > 30) return showToast("Username too long (max 30 chars)", "warning");
        db.collection('users').doc(currentUser.uid).update({ username: newName.trim() }).then(() => {
            currentUser.username = newName.trim();
            document.getElementById('settings-username').innerHTML = escapeHTML(newName.trim()) + ' <i class="fas fa-pen" style="font-size:10px; color:var(--text-muted); margin-left:4px;"></i>';
            showToast("Username updated!", "success");
        }).catch(err => showToast(err.message, "error"));
    }

    // --- Mini Player New Features: iOS Floating Mode & Options ---
    let isDraggingMP = false, hasDraggedMP = false;
    let mpStartX, mpStartY, mpStartLeft, mpStartTop;

    function initMPDrag() {
        const mp = document.getElementById('mini-player');
        if (!mp) return;
        
        function onStart(e) {
            if (!mp.classList.contains('floating-mode')) return;
            isDraggingMP = true;
            hasDraggedMP = false;
            const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            mpStartX = clientX;
            mpStartY = clientY;
            const rect = mp.getBoundingClientRect();
            mpStartLeft = rect.left;
            mpStartTop = rect.top;
            
            mp.style.transition = 'none';
            mp.style.bottom = 'auto';
            mp.style.right = 'auto';
            mp.style.left = mpStartLeft + 'px';
            mp.style.top = mpStartTop + 'px';
        }
        
        function onMove(e) {
            if (!isDraggingMP) return;
            const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            const dx = clientX - mpStartX;
            const dy = clientY - mpStartY;
            
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasDraggedMP = true;
            
            if (hasDraggedMP) {
                if (e.cancelable) e.preventDefault(); 
                let nLeft = mpStartLeft + dx;
                let nTop = mpStartTop + dy;
                nLeft = Math.max(10, Math.min(window.innerWidth - 70, nLeft));
                nTop = Math.max(10, Math.min(window.innerHeight - 70, nTop));
                mp.style.left = nLeft + 'px';
                mp.style.top = nTop + 'px';
            }
        }
        
        function onEnd(e) {
            if (!isDraggingMP) return;
            isDraggingMP = false;
            mp.style.transition = 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
        }
        
        mp.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
        
        mp.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    }

    document.addEventListener('DOMContentLoaded', initMPDrag);

    function handleMiniPlayerClick(e) {
        if (hasDraggedMP) return; // Prevent click trigger immediately after drag
        const mp = document.getElementById('mini-player');
        if (mp.classList.contains('floating-mode')) {
            // Restore from floating PiP
            mp.classList.remove('floating-mode');
            mp.style.left = '';
            mp.style.top = '';
            mp.style.bottom = '';
            mp.style.right = '';
        } else {
            // Pop up options menu
            openMPOptions();
        }
    }
    
    function openMPOptions() {
        document.getElementById('mp-opt-overlay').classList.add('active');
        document.getElementById('mp-opt-sheet').classList.add('active');
    }
    
    function closeMPOptions() {
        document.getElementById('mp-opt-overlay').classList.remove('active');
        document.getElementById('mp-opt-sheet').classList.remove('active');
    }
    
    function hideMiniPlayerToBox() {
        closeMPOptions();
        const mp = document.getElementById('mini-player');
        mp.classList.add('floating-mode');
        // iOS pop animation effect
        mp.style.transform = 'scale(1.1)';
        setTimeout(() => mp.style.transform = 'scale(1)', 150);
        showToast('Running in background. Tap floating icon to restore.', 'info', 2000);
    }
    
    function openFullPlayerFromOpt() {
        closeMPOptions();
        openFullPlayer();
    }
    
    function closeMiniPlayerOpt() {
        closeMPOptions();
        closeMiniPlayer();
    }

    // --- UNPAIR FROM PARTNER ---
    function unpairPartner() {
        if (!currentUser || !currentUser.coupleId) return;
        if (!confirm("Are you sure you want to unpair? Your shared diary entries will remain but you won't be connected anymore.")) return;
        const oldCode = currentUser.coupleId;
        db.collection('users').doc(currentUser.uid).update({ coupleId: null, pairTimestamp: null }).then(() => {
            currentUser.coupleId = null;
            currentUser.pairTimestamp = null;
            renderConnectionUI();
            showPopup("Unpaired", "You've been disconnected from your partner. You can re-pair anytime.");
            // Update badge
            const badge = document.getElementById('pair-badge');
            if (badge) badge.classList.remove('active');
        }).catch(err => showToast(err.message, "error"));
    }

    // --- EXPORT DIARY DATA ---
    async function exportDiaryData() {
        if (!currentUser) return;
        showToast("Preparing export...", "success");
        try {
            let query = db.collection('entries').where('author_uid', '==', currentUser.uid);
            const snap = await query.get();
            const entries = [];
            snap.forEach(doc => {
                const d = doc.data();
                entries.push({
                    title: d.title || '',
                    content: d.content || '',
                    mood: d.mood || '',
                    timestamp: d.timestamp,
                    date: d.day + ' ' + d.month,
                    role: d.role || '',
                    hasImage: !!d.image,
                    hasAudio: !!d.audio,
                    song: d.song ? { title: d.song.title, artist: d.song.artist } : null
                });
            });
            entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const exportData = {
                exported_at: new Date().toISOString(),
                user: currentUser.username,
                email: currentUser.email,
                total_entries: entries.length,
                entries: entries
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'musubi-diary-export-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast("Diary exported successfully!", "success");
        } catch (err) {
            showToast("Export failed: " + err.message, "error");
        }
    }

    // --- DELETE ACCOUNT ---
    function promptDeleteAccount() {
        if (!currentUser) return;
        const confirmText = prompt("This will permanently delete your account and all your data.\n\nType DELETE to confirm:");
        if (confirmText !== 'DELETE') {
            if (confirmText !== null) showToast("Account deletion cancelled", "warning");
            return;
        }
        const user = auth.currentUser;
        if (!user) return showToast("Not signed in", "error");
        showToast("Deleting account...", "warning");
        // Delete user's entries
        db.collection('entries').where('author_uid', '==', currentUser.uid).get().then(snap => {
            const batch = db.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            return batch.commit();
        }).then(() => {
            // Delete user document
            return db.collection('users').doc(currentUser.uid).delete();
        }).then(() => {
            // Clear local data
            localStorage.removeItem('likedSongs');
            localStorage.removeItem('recentlyPlayed');
            localStorage.removeItem('_lastAuthUid');
            localStorage.removeItem('diary-draft-title');
            localStorage.removeItem('diary-draft-content');
            localStorage.removeItem('diary-dark-mode');
            // Delete Firebase Auth account
            return user.delete();
        }).then(() => {

            showToast("Account deleted forever", "success");
            setTimeout(() => location.reload(), 1500);
        }).catch(err => {
            if (err.code === 'auth/requires-recent-login') {
                showToast("Please log out, log back in, then try deleting again", "warning");
            } else {
                showToast("Delete failed: " + err.message, "error");
            }
        });
    }

    // --- AUTO-SAVE DIARY DRAFTS ---
    let draftSaveTimer = null;
    function initDraftAutoSave() {
        const titleInput = document.getElementById('entry-title');
        const contentInput = document.getElementById('entry-content');
        if (!titleInput || !contentInput) return;
        
        // Restore saved drafts
        const savedTitle = localStorage.getItem('diary-draft-title');
        const savedContent = localStorage.getItem('diary-draft-content');
        if (savedTitle && !titleInput.value) titleInput.value = savedTitle;
        if (savedContent && !contentInput.value) contentInput.value = savedContent;
        if (savedContent) updateWordCount();
        
        // Auto-save on input with debounce
        const saveDraft = () => {
            clearTimeout(draftSaveTimer);
            draftSaveTimer = setTimeout(() => {
                const t = titleInput.value, c = contentInput.value;
                if (t || c) {
                    localStorage.setItem('diary-draft-title', t);
                    localStorage.setItem('diary-draft-content', c);
                } else {
                    localStorage.removeItem('diary-draft-title');
                    localStorage.removeItem('diary-draft-content');
                }
            }, 1000);
        };
        titleInput.addEventListener('input', saveDraft);
        contentInput.addEventListener('input', saveDraft);
    }
    function clearDiaryDrafts() {
        localStorage.removeItem('diary-draft-title');
        localStorage.removeItem('diary-draft-content');
    }
    function showPopup(t, m) { document.getElementById('popup-title').innerText = t; document.getElementById('popup-msg').innerText = m; document.getElementById('ios-popup').classList.add('show'); }
    function closePopup() { document.getElementById('ios-popup').classList.remove('show'); }
    function closeModal() { document.getElementById('read-modal').style.display = 'none'; }
    function deleteCurrentEntry() { if(confirm("Delete this memory?") && openEntryId) db.collection('entries').doc(openEntryId).delete().then(() => { closeModal(); switchTab('entries'); }); }

    setInterval(() => {
        const ist = getIST();
        // Calculate next midnight IST
        const nextMidnight = new Date(ist);
        nextMidnight.setDate(nextMidnight.getDate() + 1);
        nextMidnight.setHours(0, 0, 0, 0);
        const diff = nextMidnight - ist;
        const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
        document.getElementById('status-clock').innerText = ist.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
        document.getElementById('swap-timer').innerText = `Swap at 12AM • ${h}h ${m}m ${s}s`;
    }, 1000);

    const ist = getIST();
    document.getElementById('tear-date').innerText = ist.getDate();
    document.getElementById('tear-month').innerText = ist.toLocaleString('default', { month: 'long' }).toUpperCase();
    document.getElementById('tear-day').innerText = ist.toLocaleString('default', { weekday: 'long' });
    document.getElementById('status-date').innerText = ist.toLocaleString('default', { month: 'short', day: 'numeric' });
    if(localStorage.getItem('diary-dark-mode') === 'true') { document.documentElement.setAttribute('data-dark', 'true'); document.getElementById('dark-mode-toggle').checked = true; }

    // ===== MUSIC GALLERY - Spotify Clone (YouTube Data API) =====
    const YT_API_KEY = 'AIzaSyC-xXB1dmGANDHaqUN4_bLOhvwE-VgiW4U';
    let ytPlayer = null, ytReady = false;
    let musicQueue = [], musicQueueIndex = -1, isShuffled = false, repeatMode = 0;
    let likedSongs = [], musicPlaylists = [], recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
    let _lastAuthUid = localStorage.getItem('_lastAuthUid') || null;
    let currentSong = null, isMusicPlaying = false, currentPlaylistId = null, addToPlSong = null;
    let progressInterval = null, musicInitialized = false, lastMusicSubTab = 'home';

    const musicCategories = [
        {name:'Trending', q:'trending music 2025 hits'}, {name:'Anime OST', q:'anime opening songs best'},
        {name:'Lo-fi', q:'lofi hip hop chill beats'}, {name:'Bollywood', q:'bollywood latest songs 2025'},
        {name:'Pop', q:'pop music hits 2025'}, {name:'K-Pop', q:'kpop music latest hits'},
        {name:'Romance', q:'romantic love songs playlist'}, {name:'Sad', q:'sad emotional songs'},
        {name:'Your Name', q:'kimi no na wa your name soundtrack RADWIMPS'}, {name:'EDM', q:'edm electronic dance music'},
        {name:'Hip Hop', q:'hip hop rap songs latest'}, {name:'Classical', q:'classical music relaxing'},
        {name:'🧘 Relax', q:'relaxing calm meditation music peaceful'}, {name:'🌧️ Rain', q:'rain sounds relaxing sleep ambient'},
        {name:'🌊 Ocean', q:'ocean waves sounds relaxing calm'}, {name:'🎹 Piano', q:'relaxing piano music calm study'},
        {name:'🌙 Sleep', q:'deep sleep music relaxing ambient'}, {name:'🍃 Nature', q:'nature sounds birds forest relaxing'}
    ];

    // ===== LAZY YOUTUBE IFRAME API LOADER =====
    let ytApiLoading = false, ytApiLoaded = false, ytInitAttempts = 0;

    function loadYTApi() {
        if (ytApiLoaded || ytApiLoading) return Promise.resolve();
        ytApiLoading = true;
        return new Promise((resolve, reject) => {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            tag.onerror = function() {
                ytApiLoading = false;
                console.error('Failed to load YouTube IFrame API');
                reject(new Error('YouTube API script failed to load'));
            };
            // Define the callback before inserting the script
            window.onYouTubeIframeAPIReady = function() {
                ytApiLoaded = true;
                ytApiLoading = false;
                console.log('YT API loaded');
                createYTPlayer();
                resolve();
            };
            document.head.appendChild(tag);
            // Safety timeout: if callback doesn't fire within 8s, try manual init
            setTimeout(() => {
                if (!ytApiLoaded && typeof YT !== 'undefined' && YT.Player) {
                    ytApiLoaded = true;
                    ytApiLoading = false;
                    console.log('YT API loaded (fallback detection)');
                    createYTPlayer();
                    resolve();
                } else if (!ytApiLoaded) {
                    ytApiLoading = false;
                    reject(new Error('YouTube API load timeout'));
                }
            }, 8000);
        });
    }

    function createYTPlayer() {
        if (ytReady || ytPlayer) return; // Already created
        ytInitAttempts++;
        if (ytInitAttempts > 5) { console.error('YT Player init failed after 5 attempts'); return; }
        try {
            if (typeof YT === 'undefined' || !YT.Player) {
                console.warn('YT not ready, retrying in 1s...');
                setTimeout(createYTPlayer, 1000);
                return;
            }
            ytPlayer = new YT.Player('yt-player', {
                height: '100%', width: '100%',
                playerVars: { autoplay:0, controls:0, disablekb:1, fs:0, modestbranding:1, playsinline:1, origin: window.location.origin },
                events: {
                    'onReady': function() { ytReady = true; console.log('YT Player Ready'); },
                    'onStateChange': onPlayerStateChange,
                    'onError': function(e) {
                        console.error('YT Error:', e.data);
                        if (e.data === 150 || e.data === 101) {
                            showToast('This song is restricted. Skipping...', 'warning', 2000);
                        } else {
                            showToast('Playback error. Trying next song...', 'warning', 2000);
                        }
                        // Only skip if there are other songs in queue
                        if (musicQueue.length > 1) setTimeout(playNext, 1000);
                        else { isMusicPlaying = false; updatePlayerUI(); }
                    }
                }
            });
            // Verify player was created, retry if not ready after 3s
            setTimeout(() => {
                if (!ytReady && ytInitAttempts < 5) {
                    console.warn('YT Player not ready after init, retrying...');
                    ytPlayer = null;
                    createYTPlayer();
                }
            }, 3000);
        } catch(e) {
            console.error('YT Player init failed:', e);
            ytPlayer = null;
            setTimeout(createYTPlayer, 2000);
        }
    }

    // Ensure YT API is loaded when music is needed
    function ensureYTReady() {
        return new Promise((resolve, reject) => {
            if (ytReady) { resolve(); return; }
            loadYTApi().catch(err => console.warn('YT API load issue:', err));
            // Poll for readiness
            let attempts = 0;
            const check = setInterval(() => {
                attempts++;
                if (ytReady) { clearInterval(check); resolve(); }
                else if (attempts > 20) { clearInterval(check); reject(new Error('Player not ready')); }
            }, 500);
        });
    }

    let isPreviewingSnippet = false;
    let _spectatorLoadingVideo = false; // Guard flag to prevent state-change fights during spectator video load

    function onPlayerStateChange(event) {
        if (isPreviewingSnippet) return;
        if (event.data === YT.PlayerState.ENDED) {
            if (isSpectating) { /* Wait for partner's next song via sync */ return; }
            if (repeatMode === 2) { ytPlayer.seekTo(0); ytPlayer.playVideo(); }
            else if (musicQueueIndex < musicQueue.length - 1) playNext();
            else if (repeatMode === 1) { musicQueueIndex = 0; playSongFromQueue(); }
            else { isMusicPlaying = false; updatePlayerUI(); stopProgress(); try { stopBroadcast(); } catch(e) {} }
        }

    window.setPlayerMode = function(mode) {
        const togglePill = document.querySelector('.fp-toggle-pill');
        const btnSong = document.getElementById('btn-song');
        const btnVideo = document.getElementById('btn-video');
        const videoLayer = document.getElementById('fp-video-layer');
        const artworkImg = document.getElementById('fp-artwork-img');
        
        if (!togglePill || !videoLayer || !artworkImg) return;
        
        if (mode === 'video') {
            togglePill.setAttribute('data-mode', 'video');
            btnSong.classList.remove('active');
            btnVideo.classList.add('active');
            videoLayer.classList.add('active');
            artworkImg.classList.add('hidden-mode');
        } else {
            togglePill.setAttribute('data-mode', 'song');
            btnVideo.classList.remove('active');
            btnSong.classList.add('active');
            videoLayer.classList.remove('active');
            artworkImg.classList.remove('hidden-mode');
        }
    };
        if (event.data === YT.PlayerState.PLAYING) {
            isMusicPlaying = true; updatePlayerUI(); startProgress();
            // If spectating and partner has paused, re-pause to stay in sync
            // But skip this check during initial video load to avoid race condition
            if (isSpectating && !_spectatorLoadingVideo && partnerNowPlayingData && !partnerNowPlayingData.isPlaying) {
                setTimeout(() => { if (isSpectating && !_spectatorLoadingVideo && ytPlayer && partnerNowPlayingData && !partnerNowPlayingData.isPlaying) try { ytPlayer.pauseVideo(); } catch(e) {} }, 500);
            }
        }
        if (event.data === YT.PlayerState.PAUSED) {
            // During spectator video load, don't kill progress - YouTube buffers and fires PAUSED briefly
            if (_spectatorLoadingVideo) return;
            isMusicPlaying = false; updatePlayerUI(); stopProgress();
            if (!isSpectating) { try { stopBroadcast(); } catch(e) {} }
            // If spectating and partner is still playing, auto-resume
            if (isSpectating && partnerNowPlayingData && partnerNowPlayingData.isPlaying) {
                setTimeout(() => { if (isSpectating && ytPlayer && partnerNowPlayingData && partnerNowPlayingData.isPlaying) try { ytPlayer.playVideo(); } catch(e) {} }, 500);
            }
        }
        if (event.data === YT.PlayerState.BUFFERING) {
            // While buffering in spectator mode, keep UI showing playing state
            if (isSpectating && partnerNowPlayingData && partnerNowPlayingData.isPlaying) {
                isMusicPlaying = true; updatePlayerUI();
            }
        }
    }

    // --- YouTube Data API ---
    async function ytSearch(query, max = 15) {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${max}&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&key=${YT_API_KEY}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return (data.items || []).map(item => ({
            videoId: item.id.videoId,
            title: decodeHTMLEntities(item.snippet.title),
            thumbnail: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : item.snippet.thumbnails.default.url,
            channelTitle: item.snippet.channelTitle
        }));
    }

    function decodeHTMLEntities(text) {
        const ta = document.createElement('textarea'); ta.innerHTML = text; return ta.value;
    }

    async function searchMusic() {
        const q = document.getElementById('music-search-input').value.trim();
        if (!q) return;
        const container = document.getElementById('search-results');
        container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner"></div><p style="margin-top:10px;color:var(--text-sub);font-size:13px;">Searching...</p></div>';
        try {
            const songs = await ytSearch(q + ' song audio');
            container.innerHTML = '';
            if (songs.length === 0) { container.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-sub);">No results found</p>'; return; }
            songs.forEach((song, i) => { container.innerHTML += buildSongHTML(song, i); });
        } catch(err) { container.innerHTML = '<p style="text-align:center;padding:40px;color:#FF3B30;">'+err.message+'</p>'; }
    }

    async function fetchTrending(query) {
        const row = document.getElementById('trending-row');
        row.innerHTML = Array(5).fill('<div class="chart-row-skel"><div class="skeleton skel-num"></div><div class="skeleton skel-thumb"></div><div class="skel-info"><div class="skeleton skel-line"></div><div class="skeleton skel-line-sm"></div></div></div>').join('');
        try {
            const songs = await ytSearch(query || 'trending music 2025 hits', 12);
            row.innerHTML = '';
            row.className = 'chart-list';
            songs.forEach((song, index) => {
                row.innerHTML += `<div class="chart-row" onclick='playSong(JSON.parse(this.dataset.song))' data-song='${JSON.stringify(song).replace(/'/g, "&#39;")}' tabindex="0">
                    <div class="chart-rank">${index + 1}</div>
                    <img class="chart-img" src="${song.thumbnail}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23374151%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 text-anchor=%22middle%22 fill=%22%239CA3AF%22 font-size=%2240%22%3E%E2%99%AA%3C/text%3E%3C/svg%3E'">
                    <div class="chart-info">
                        <div class="chart-title">${song.title}</div>
                        <div class="chart-artist">${song.channelTitle}</div>
                    </div>
                    <div class="chart-play-icon"><i class="fas fa-play"></i></div>
                </div>`;
            });
        } catch(err) { row.innerHTML = '<p style="color:var(--text-sub);font-size:12px;padding:5px;">Could not load. Try again later.</p>'; }
    }

    // --- Playback ---
    function playSong(song) {
        // Exit spectator mode when user explicitly plays a song
        if (isSpectating) exitSpectatorMode('You started playing your own music');
        // Show mini player immediately with song info (even before YT is ready)
        currentSong = song;
        document.getElementById('mini-player').classList.add('active');
        document.body.classList.add('mini-player-visible');
        updatePlayerUI();
        // If YT not ready, load API and wait
        if (!ytReady) {
            showToast('Loading player...', 'info', 2000);
            ensureYTReady().then(() => {
                startPlayback(song);
            }).catch(() => {
                showToast('Music player failed to load. Check your connection and try again.', 'error', 4000);
            });
            return;
        }
        startPlayback(song);
    }

    function startPlayback(song) {
        if (!ytPlayer || !song) return;
        currentSong = song;
        // Reset lyrics for new song
        currentLyrics = null; activeLyricIndex = -1;
        if (lyricsActive) loadLyricsForSong(song);
        const idx = musicQueue.findIndex(s => s.videoId === song.videoId);
        if (idx >= 0) { musicQueueIndex = idx; } else { musicQueue.push(song); musicQueueIndex = musicQueue.length - 1; }
        if (song.startTime !== undefined) {
            ytPlayer.loadVideoById({ videoId: song.videoId, startSeconds: song.startTime });
        } else {
            ytPlayer.loadVideoById(song.videoId);
        }
        isMusicPlaying = true;
        addToRecentlyPlayed(song);
        document.getElementById('mini-player').classList.add('active');
        document.body.classList.add('mini-player-visible');
        updatePlayerUI();
        startProgress();
        try { broadcastNowPlaying(song); } catch(e) { console.warn('Broadcast error:', e); }
    }

    function playSongFromQueue() {
        if (musicQueueIndex >= 0 && musicQueueIndex < musicQueue.length) {
            currentSong = musicQueue[musicQueueIndex];
            // Reset lyrics for new song
            currentLyrics = null; activeLyricIndex = -1;
            if (lyricsActive) loadLyricsForSong(currentSong);
            if (currentSong.startTime !== undefined) {
                ytPlayer.loadVideoById({ videoId: currentSong.videoId, startSeconds: currentSong.startTime });
            } else {
                ytPlayer.loadVideoById(currentSong.videoId);
            }
            isMusicPlaying = true;
            addToRecentlyPlayed(currentSong);
            document.getElementById('mini-player').classList.add('active');
            document.body.classList.add('mini-player-visible');
            updatePlayerUI(); startProgress();
            try { broadcastNowPlaying(currentSong); } catch(e) {}
        }
    }

    function togglePlayPause() {
        if (isSpectating) { showToast('Controls locked in spectator mode', 'warning', 1500); return; }
        if (!ytPlayer || !currentSong) return;
        if (isMusicPlaying) ytPlayer.pauseVideo(); else ytPlayer.playVideo();
    }

    function playNext() {
        if (isSpectating) { showToast('Controls locked in spectator mode', 'warning', 1500); return; }
        if (musicQueue.length === 0) return;
        if (isShuffled) musicQueueIndex = Math.floor(Math.random() * musicQueue.length);
        else musicQueueIndex = (musicQueueIndex + 1) % musicQueue.length;
        playSongFromQueue();
    }

    function playPrev() {
        if (isSpectating) { showToast('Controls locked in spectator mode', 'warning', 1500); return; }
        if (!ytPlayer || !currentSong) return;
        if (ytPlayer.getCurrentTime && ytPlayer.getCurrentTime() > 3) { ytPlayer.seekTo(0); return; }
        if (musicQueue.length === 0) return;
        musicQueueIndex = (musicQueueIndex - 1 + musicQueue.length) % musicQueue.length;
        playSongFromQueue();
    }

    function toggleShuffle() {
        if (isSpectating) { showToast('Controls locked in spectator mode', 'warning', 1500); return; }
        isShuffled = !isShuffled;
        const btn = document.getElementById('fp-shuffle');
        if (btn) btn.classList.toggle('active', isShuffled);
    }

    function toggleRepeat() {
        if (isSpectating) { showToast('Controls locked in spectator mode', 'warning', 1500); return; }
        repeatMode = (repeatMode + 1) % 3;
        const btn = document.getElementById('fp-repeat');
        if (btn) { btn.classList.toggle('active', repeatMode > 0); btn.querySelector('i').className = repeatMode === 2 ? 'fas fa-arrow-rotate-right' : 'fas fa-repeat'; }
    }

    // --- Progress (uses rAF throttled to ~250ms for smoother lyrics sync) ---
    let lastProgressUpdate = 0;
    function startProgress() {
        stopProgress();
        function tick(now) {
            if (!progressInterval) return;
            if (now - lastProgressUpdate >= 250) {
                lastProgressUpdate = now;
                updateProgress();
            }
            progressInterval = requestAnimationFrame(tick);
        }
        progressInterval = requestAnimationFrame(tick);
    }
    function stopProgress() { if (progressInterval) { cancelAnimationFrame(progressInterval); progressInterval = null; } }

    // Cache DOM refs for progress (avoids repeated lookups every 500ms)
    let _progEls = null;
    function getProgEls() {
        if (!_progEls) _progEls = {
            mp: document.getElementById('mini-progress'),
            fp: document.getElementById('fp-fill'),
            ct: document.getElementById('fp-current-time'),
            dt: document.getElementById('fp-duration-time')
        };
        return _progEls;
    }

    function updateProgress() {
        if (!ytPlayer || !ytPlayer.getDuration) return;
        const cur = ytPlayer.getCurrentTime() || 0, dur = ytPlayer.getDuration() || 0;
        
        // Auto-pause if playing a snippet and duration is reached
        if (currentSong && currentSong.customDuration && currentSong.startTime !== undefined) {
            if (cur >= currentSong.startTime + currentSong.customDuration) {
                if (repeatMode === 2) {
                    ytPlayer.seekTo(currentSong.startTime, true);
                    return;
                } else if (musicQueueIndex < musicQueue.length - 1) {
                    playNext();
                } else {
                    ytPlayer.pauseVideo();
                    ytPlayer.seekTo(currentSong.startTime, true);
                    return;
                }
            }
        }
        
        const pct = dur > 0 ? (cur / dur * 100) : 0;
        const els = getProgEls();
        if (els.mp) els.mp.style.width = pct + '%';
        if (els.fp) els.fp.style.width = pct + '%';
        const curFmt = fmtTime(cur), durFmt = fmtTime(dur);
        if (els.ct && els.ct.textContent !== curFmt) els.ct.textContent = curFmt;
        if (els.dt && els.dt.textContent !== durFmt) els.dt.textContent = durFmt;
        // Sync lyrics with current playback position
        syncLyrics();
    }

    function seekTo(e) {
        if (isSpectating) { showToast('Controls locked in spectator mode', 'warning', 1500); return; }
        if (!ytPlayer || !ytPlayer.getDuration) return;
        const bar = e.currentTarget, rect = bar.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        ytPlayer.seekTo(pct * ytPlayer.getDuration(), true);
    }

    function fmtTime(s) { const m = Math.floor(s/60); return m + ':' + String(Math.floor(s%60)).padStart(2, '0'); }

    // --- UI Updates ---
    let lastExtractedVideoId = null;

    const _imgFallback = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23374151%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 text-anchor=%22middle%22 fill=%22%239CA3AF%22 font-size=%2240%22%3E%E2%99%AA%3C/text%3E%3C/svg%3E";

    // Robust thumbnail URL — try maxresdefault, fall back to hqdefault, then mqdefault
    function getBestThumbnail(song) {
        if (!song || !song.videoId) return song ? song.thumbnail : _imgFallback;
        // If thumbnail is already a high-res URL, use it
        if (song.thumbnail && !song.thumbnail.includes('/default.')) return song.thumbnail;
        // Build best available thumbnail URL
        return 'https://i3.ytimg.com/vi/' + song.videoId + '/hqdefault.jpg';
    }

    function updatePlayerUI() {
        if (!currentSong) return;
        const thumb = getBestThumbnail(currentSong);
        const miniThumb = document.getElementById('mini-thumb');
        miniThumb.src = thumb;
        miniThumb.onerror = function() { this.onerror = null; this.src = _imgFallback; };
        document.getElementById('mini-title').innerText = currentSong.title;
        document.getElementById('mini-artist').innerText = currentSong.channelTitle;
        document.getElementById('mini-play-icon').className = isMusicPlaying ? 'fas fa-pause' : 'fas fa-play';

        const artImg = document.getElementById('fp-artwork-img');
        artImg.src = thumb;
        artImg.onerror = function() { this.onerror = null; this.src = _imgFallback; };
        artImg.classList.toggle('playing', isMusicPlaying);

        document.getElementById('fp-title').innerText = currentSong.title;
        document.getElementById('fp-artist').innerText = currentSong.channelTitle;
        const fpPlayWrapper = document.getElementById('fp-play-wrapper');
        if (fpPlayWrapper) {
            fpPlayWrapper.innerHTML = isMusicPlaying 
                ? '<svg id="fp-play-icon-svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75V5.25z" clip-rule="evenodd" /></svg>'
                : '<svg id="fp-play-icon-svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32" style="margin-left: 3px;"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd" /></svg>';
        }
        // Update lyrics mini info
        const lyrThumb = document.getElementById('fp-lyrics-thumb'); if(lyrThumb) { lyrThumb.src = thumb; lyrThumb.onerror = function() { this.onerror = null; this.src = _imgFallback; }; }
        const lyrTitle = document.getElementById('fp-lyrics-title'); if(lyrTitle) lyrTitle.innerText = currentSong.title;
        const lyrArtist = document.getElementById('fp-lyrics-artist'); if(lyrArtist) lyrArtist.innerText = currentSong.channelTitle;
        const isLiked = likedSongs.some(s => s.videoId === currentSong.videoId);
        const lb = document.getElementById('fp-like-btn');
        if (lb) { lb.className = 'fp-extra-btn' + (isLiked ? ' active' : ''); lb.innerHTML = '<i class="' + (isLiked ? 'fas' : 'far') + ' fa-heart"></i>'; }

        // Update dynamic background
        if (currentSong.videoId !== lastExtractedVideoId) {
            lastExtractedVideoId = currentSong.videoId;
            updatePlayerBackground(thumb);
        }
    }

    // --- Dynamic Color Extraction & Background ---
    function updatePlayerBackground(thumbnailUrl) {
        // Set blurred album art as background layer
        const bgLayer = document.getElementById('fp-bg-layer');
        if (bgLayer) {
            bgLayer.style.backgroundImage = 'url(' + thumbnailUrl + ')';
        }

        // Skip expensive canvas color extraction on low-end devices
        if (perfTier === 'low') { applyFallbackColors(); return; }

        // Extract colors from thumbnail via canvas
        // Use a separate Image without crossOrigin first (for display), 
        // then try with crossOrigin for color extraction
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                // Smaller canvas for mid-tier
                const sz = perfTier === 'mid' ? 32 : 64;
                canvas.width = sz; canvas.height = sz;
                ctx.drawImage(img, 0, 0, sz, sz);
                const data = ctx.getImageData(0, 0, sz, sz).data;

                // Sample colors from different regions (scaled to canvas size)
                const colors = [];
                const q1 = Math.round(sz * 0.125), q2 = Math.round(sz * 0.25), mid = Math.round(sz * 0.5), q3 = Math.round(sz * 0.75), q4 = Math.round(sz * 0.875);
                const regions = [
                    [q1, q1], [q4, q1], [mid, mid], [q1, q4], [q4, q4],
                    [q2, q2], [q3, q3], [q2, q3], [q3, q2]
                ];
                regions.forEach(([x, y]) => {
                    const i = (y * sz + x) * 4;
                    colors.push({ r: data[i], g: data[i+1], b: data[i+2] });
                });

                // Find 3 most vibrant/distinct colors
                const scored = colors.map(c => {
                    const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
                    const sat = max === 0 ? 0 : (max - min) / max;
                    const brightness = (c.r + c.g + c.b) / 3;
                    return { ...c, score: sat * 0.6 + (brightness > 40 && brightness < 220 ? 0.4 : 0) };
                });
                scored.sort((a, b) => b.score - a.score);

                const c1 = scored[0] || { r: 74, g: 144, b: 217 };
                const c2 = scored[Math.min(2, scored.length - 1)] || { r: 124, g: 100, b: 200 };
                const c3 = scored[Math.min(4, scored.length - 1)] || { r: 200, g: 100, b: 150 };

                applyBlobColors(c1, c2, c3);
            } catch(e) {
                // CORS or canvas error — use fallback gradient from theme
                applyFallbackColors();
            }
        };
        img.onerror = function() {
            // CORS failed — retry without crossOrigin won't help for canvas,
            // so just use fallback colors
            applyFallbackColors();
        };
        // Use i3.ytimg.com instead of i.ytimg.com for better CORS support
        let proxyUrl = thumbnailUrl;
        if (thumbnailUrl.includes('i.ytimg.com')) {
            proxyUrl = thumbnailUrl.replace('i.ytimg.com', 'i3.ytimg.com');
        }
        img.src = proxyUrl;
    }

    function applyBlobColors(c1, c2, c3) {
        const b1 = document.getElementById('fp-blob-1');
        const b2 = document.getElementById('fp-blob-2');
        const b3 = document.getElementById('fp-blob-3');
        if (b1) b1.style.background = `radial-gradient(circle, rgba(${c1.r},${c1.g},${c1.b},0.8), rgba(${c1.r},${c1.g},${c1.b},0.2))`;
        if (b2) b2.style.background = `radial-gradient(circle, rgba(${c2.r},${c2.g},${c2.b},0.8), rgba(${c2.r},${c2.g},${c2.b},0.2))`;
        if (b3) b3.style.background = `radial-gradient(circle, rgba(${c3.r},${c3.g},${c3.b},0.7), rgba(${c3.r},${c3.g},${c3.b},0.15))`;
        // Set lyrics glow color from dominant album art color
        document.documentElement.style.setProperty('--lyrics-glow-rgb', `${c1.r}, ${c1.g}, ${c1.b}`);
    }

    function applyFallbackColors() {
        const isMitsuha = currentViewRole === 'mitsuha';
        applyBlobColors(
            isMitsuha ? {r:232,g:100,b:124} : {r:74,g:144,b:217},
            isMitsuha ? {r:180,g:80,b:160}  : {r:100,g:130,b:230},
            isMitsuha ? {r:255,g:150,b:170} : {r:60,g:180,b:200}
        );
    }

    function openFullPlayer() { document.getElementById('full-player').classList.add('active'); document.body.classList.add('full-player-open'); updatePlayerUI(); }
    function closeFullPlayer() { document.getElementById('full-player').classList.remove('active'); document.body.classList.remove('full-player-open'); }

    // --- Like / Unlike ---
    function toggleLikeSong(song) {
        if (!song) song = currentSong; if (!song) return;
        const idx = likedSongs.findIndex(s => s.videoId === song.videoId);
        if (idx >= 0) likedSongs.splice(idx, 1); else likedSongs.push({...song, likedAt: Date.now()});
        saveLikedSongs(); updatePlayerUI();
    }

    function saveLikedSongs() {
        localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
        if (currentUser && currentUser.coupleId && currentViewRole) {
            const docId = currentUser.coupleId + '_' + currentViewRole;
            db.collection('music_data').doc(docId).set({ likedSongs: likedSongs }, { merge: true }).catch(()=>{});
        }
        const lc = document.getElementById('liked-count'); if (lc) lc.innerText = likedSongs.length + ' songs';
    }

    function loadLikedSongs() {
        // Check if user changed — if new sign-in, start with empty liked songs
        const uid = currentUser ? currentUser.uid : null;
        if (uid && _lastAuthUid && _lastAuthUid !== uid) {
            // Different user signed in — clear local liked songs
            localStorage.removeItem('likedSongs');
            localStorage.removeItem('recentlyPlayed');
            likedSongs = [];
            recentlyPlayed = [];
        }
        if (uid) { _lastAuthUid = uid; localStorage.setItem('_lastAuthUid', uid); }

        likedSongs = JSON.parse(localStorage.getItem('likedSongs') || '[]');
        if (currentUser && currentUser.coupleId && currentViewRole) {
            const docId = currentUser.coupleId + '_' + currentViewRole;
            db.collection('music_data').doc(docId).get().then(doc => {
                if (doc.exists && doc.data().likedSongs) {
                    likedSongs = doc.data().likedSongs;
                    localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
                } else {
                    // No data in Firestore for this user — start empty
                    likedSongs = [];
                    localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
                }
                const lc = document.getElementById('liked-count'); if (lc) lc.innerText = likedSongs.length + ' songs';
            }).catch(() => {});
        }
        const lc = document.getElementById('liked-count'); if (lc) lc.innerText = likedSongs.length + ' songs';
    }

    // --- Recently Played ---
    function addToRecentlyPlayed(song) {
        recentlyPlayed = recentlyPlayed.filter(s => s.videoId !== song.videoId);
        recentlyPlayed.unshift({...song, playedAt: Date.now()});
        if (recentlyPlayed.length > 50) recentlyPlayed = recentlyPlayed.slice(0, 50);
        localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
        const rc = document.getElementById('recent-count'); if (rc) rc.innerText = recentlyPlayed.length + ' songs';
    }

    function renderRecentRow() {
        const row = document.getElementById('recent-row'); if (!row) return;
        row.innerHTML = '';
        if (recentlyPlayed.length === 0) { row.innerHTML = '<p style="color:var(--text-sub);font-size:12px;padding:8px;">Play some music to see history</p>'; return; }
        recentlyPlayed.slice(0, 10).forEach(song => {
            row.innerHTML += `<div class="music-card" onclick='playSong(JSON.parse(this.dataset.song))' data-song='${JSON.stringify(song).replace(/'/g, "&#39;")}'>
                <img class="music-card-img" src="${song.thumbnail}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23374151%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 text-anchor=%22middle%22 fill=%22%239CA3AF%22 font-size=%2240%22%3E%E2%99%AA%3C/text%3E%3C/svg%3E'">
                <div class="music-card-title">${song.title}</div><div class="music-card-sub">${song.channelTitle}</div></div>`;
        });
    }

    // --- Playlists (Firestore) ---
    function loadPlaylists() {
        if (!currentUser || !currentUser.coupleId) return;
        db.collection('music_playlists').where('coupleId', '==', currentUser.coupleId).where('role', '==', currentViewRole).get().then(snap => {
            musicPlaylists = [];
            snap.forEach(doc => musicPlaylists.push({id: doc.id, ...doc.data()}));
            musicPlaylists.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            renderPlaylistsUI();
        }).catch(err => { console.log('Playlist load error:', err); });
    }

    function renderPlaylistsUI() {
        const libC = document.getElementById('library-playlists');
        const homeC = document.getElementById('home-playlists');
        let html = '';
        musicPlaylists.forEach(pl => {
            const cover = pl.songs && pl.songs.length > 0 ? '<img src="'+pl.songs[0].thumbnail+'">' : '<i class="fas fa-music"></i>';
            html += '<div class="playlist-card" onclick="openPlaylistDetail(\''+pl.id+'\')"><div class="playlist-cover">'+cover+'</div><div class="playlist-info"><div class="playlist-name">'+pl.name+'</div><div class="playlist-count">'+(pl.songs ? pl.songs.length : 0)+' songs</div></div><button onclick="event.stopPropagation();deletePlaylist(\''+pl.id+'\')" style="background:none;border:none;color:#FF3B30;font-size:14px;cursor:pointer;padding:8px;"><i class="fas fa-trash"></i></button></div>';
        });
        if (musicPlaylists.length === 0) html = '<p style="color:var(--text-sub);font-size:12px;padding:8px;">No playlists yet. Create one!</p>';
        if (libC) libC.innerHTML = html;
        if (homeC) homeC.innerHTML = html;
    }

    function openCreatePlaylist() {
        document.getElementById('create-pl-overlay').classList.add('active');
        setTimeout(() => document.getElementById('create-pl-sheet').classList.add('active'), 10);
        document.getElementById('new-pl-name').value = '';
    }
    function closeCreatePlaylist() {
        document.getElementById('create-pl-sheet').classList.remove('active');
        setTimeout(() => document.getElementById('create-pl-overlay').classList.remove('active'), 300);
    }

    function createPlaylist() {
        const name = document.getElementById('new-pl-name').value.trim();
        if (!name || !currentUser) return;
        db.collection('music_playlists').add({
            uid: currentUser.uid, coupleId: currentUser.coupleId || null,
            role: currentViewRole,
            name: name, songs: [], createdAt: Date.now()
        }).then(() => { closeCreatePlaylist(); loadPlaylists(); showPopup('Created', 'Playlist "'+name+'" created!'); setTimeout(closePopup, 1500); });
    }

    function deletePlaylist(id) {
        if (!confirm('Delete this playlist?')) return;
        db.collection('music_playlists').doc(id).delete().then(() => { loadPlaylists(); showPopup('Deleted', 'Playlist removed.'); setTimeout(closePopup, 1500); });
    }

    function openPlaylistDetail(id) {
        const pl = musicPlaylists.find(p => p.id === id);
        if (!pl) return;
        currentPlaylistId = id;
        document.getElementById('pl-detail-title').innerText = pl.name;
        const c = document.getElementById('pl-detail-songs'); c.innerHTML = '';
        if (!pl.songs || pl.songs.length === 0) { c.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-sub);">No songs yet. Search and add some!</p>'; }
        else { pl.songs.forEach((song, i) => { c.innerHTML += buildSongHTML(song, i, 'playlist'); }); }
        musicSubTab('playlist-detail');
    }

    function playPlaylistAll() {
        if (currentPlaylistId === '__liked__') { musicQueue = [...likedSongs]; }
        else if (currentPlaylistId === '__recent__') { musicQueue = [...recentlyPlayed]; }
        else { const pl = musicPlaylists.find(p => p.id === currentPlaylistId); if (!pl || !pl.songs || pl.songs.length === 0) return; musicQueue = [...pl.songs]; }
        if (musicQueue.length === 0) return;
        musicQueueIndex = 0; playSongFromQueue();
    }

    function showLikedSongs() {
        document.getElementById('pl-detail-title').innerText = 'Liked Songs';
        currentPlaylistId = '__liked__';
        const c = document.getElementById('pl-detail-songs'); c.innerHTML = '';
        if (likedSongs.length === 0) c.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-sub);">No liked songs yet. Heart some songs!</p>';
        else likedSongs.forEach((s, i) => { c.innerHTML += buildSongHTML(s, i, 'liked'); });
        musicSubTab('playlist-detail');
    }

    function showRecentlyPlayed() {
        document.getElementById('pl-detail-title').innerText = 'Recently Played';
        currentPlaylistId = '__recent__';
        const c = document.getElementById('pl-detail-songs'); c.innerHTML = '';
        if (recentlyPlayed.length === 0) c.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-sub);">No recently played songs.</p>';
        else recentlyPlayed.forEach((s, i) => { c.innerHTML += buildSongHTML(s, i, 'recent'); });
        musicSubTab('playlist-detail');
    }

    // --- Add to Playlist ---
    function openAddToPlaylist(song) {
        addToPlSong = song;
        const c = document.getElementById('add-pl-list'); c.innerHTML = '';
        musicPlaylists.forEach(pl => {
            c.innerHTML += '<div class="playlist-card" onclick="addSongToPlaylist(\''+pl.id+'\')"><div class="playlist-cover" style="width:40px;height:40px;font-size:14px;"><i class="fas fa-music"></i></div><div class="playlist-info"><div class="playlist-name">'+pl.name+'</div><div class="playlist-count">'+(pl.songs?pl.songs.length:0)+' songs</div></div></div>';
        });
        if (musicPlaylists.length === 0) c.innerHTML = '<p style="color:var(--text-sub);font-size:12px;padding:8px;">Create a playlist first from Library tab</p>';
        document.getElementById('add-pl-overlay').classList.add('active');
        setTimeout(() => document.getElementById('add-pl-sheet').classList.add('active'), 10);
    }
    function closeAddToPlaylist() {
        document.getElementById('add-pl-sheet').classList.remove('active');
        setTimeout(() => document.getElementById('add-pl-overlay').classList.remove('active'), 300);
    }
    function addSongToPlaylist(plId) {
        if (!addToPlSong) return;
        const pl = musicPlaylists.find(p => p.id === plId); if (!pl) return;
        if (pl.songs && pl.songs.some(s => s.videoId === addToPlSong.videoId)) {
            closeAddToPlaylist(); showPopup('Exists', 'Song already in this playlist.'); setTimeout(closePopup, 1500); return;
        }
        const updated = pl.songs ? [...pl.songs, addToPlSong] : [addToPlSong];
        db.collection('music_playlists').doc(plId).update({ songs: updated }).then(() => {
            closeAddToPlaylist(); loadPlaylists(); showPopup('Added', 'Song added to "'+pl.name+'"'); setTimeout(closePopup, 1500);
        });
    }
    function removeSongFromPlaylist(videoId) {
        const pl = musicPlaylists.find(p => p.id === currentPlaylistId); if (!pl) return;
        const updated = pl.songs.filter(s => s.videoId !== videoId);
        db.collection('music_playlists').doc(currentPlaylistId).update({ songs: updated }).then(() => { loadPlaylists(); openPlaylistDetail(currentPlaylistId); });
    }

    // --- Queue ---
    function openQueue() {
        const c = document.getElementById('queue-songs'); c.innerHTML = '';
        if (musicQueue.length === 0) { c.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-sub);">Queue is empty</p>'; }
        else {
            musicQueue.forEach((song, idx) => {
                const playing = idx === musicQueueIndex;
                c.innerHTML += '<div class="song-item" onclick="musicQueueIndex='+idx+';playSongFromQueue();closeQueue();" style="'+(playing?'background:var(--theme-light);border-radius:8px;padding:10px;':'')+'">'
                    +(playing?'<div class="eq-bars"><span></span><span></span><span></span></div>':'<span style="width:18px;text-align:center;color:var(--text-sub);font-size:12px;">'+(idx+1)+'</span>')
                    +'<img class="song-thumb" src="'+song.thumbnail+'">'
                    +'<div class="song-info"><div class="song-title" style="'+(playing?'color:var(--theme-color);':'')+'">'+song.title+'</div><div class="song-artist">'+song.channelTitle+'</div></div>'
                    +'<button onclick="event.stopPropagation();musicQueue.splice('+idx+',1);if('+idx+'<musicQueueIndex)musicQueueIndex--;openQueue();" style="background:none;border:none;color:#FF3B30;cursor:pointer;padding:5px;"><i class="fas fa-times"></i></button></div>';
            });
        }
        document.getElementById('queue-modal').classList.add('active');
    }
    function closeQueue() { document.getElementById('queue-modal').classList.remove('active'); }

    function addToQueue(song) { musicQueue.push(song); showPopup('Queued', 'Added to queue'); setTimeout(closePopup, 1000); }

    // --- Song Menu ---
    function openSongMenu(song) {
        addToPlSong = song;
        document.getElementById('sm-thumb').src = song.thumbnail;
        document.getElementById('sm-title').innerText = song.title;
        document.getElementById('sm-artist').innerText = song.channelTitle;
        document.getElementById('song-sheet-overlay').classList.add('active');
        setTimeout(() => document.getElementById('song-sheet').classList.add('active'), 10);
    }
    function closeSongMenu() {
        document.getElementById('song-sheet').classList.remove('active');
        setTimeout(() => document.getElementById('song-sheet-overlay').classList.remove('active'), 300);
    }
    function songMenuAction(action) {
        const song = addToPlSong; closeSongMenu();
        if (action === 'like') setTimeout(() => toggleLikeSong(song), 350);
        if (action === 'note') setTimeout(() => openSongNote(song), 350);
        if (action === 'queue') setTimeout(() => addToQueue(song), 350);
        if (action === 'playlist') setTimeout(() => openAddToPlaylist(song), 350);
    }

    // --- Music Sub Tab Nav ---
    function musicSubTab(name) {
        document.querySelectorAll('.music-sub').forEach(s => { s.style.display = 'none'; s.classList.remove('active'); });
        const target = document.getElementById('music-' + name);
        if (target) { target.style.display = 'flex'; target.classList.add('active'); }
        document.querySelectorAll('.music-nav-btn').forEach(b => b.classList.remove('active'));
        const map = {'home':'mnav-home','search':'mnav-search','library':'mnav-library'};
        if (map[name]) document.getElementById(map[name]).classList.add('active');
        if (name !== 'playlist-detail') lastMusicSubTab = name;
        if (name === 'home') renderRecentRow();
        if (name === 'library') {
            const lc = document.getElementById('liked-count'); if (lc) lc.innerText = likedSongs.length + ' songs';
            const rc = document.getElementById('recent-count'); if (rc) rc.innerText = recentlyPlayed.length + ' songs';
        }
    }
    function musicBackFromDetail() { musicSubTab(lastMusicSubTab || 'library'); }

    // --- Build Song HTML ---
    function buildSongHTML(song, index, context) {
        const playing = currentSong && currentSong.videoId === song.videoId && isMusicPlaying;
        const liked = likedSongs.some(s => s.videoId === song.videoId);
        const sj = JSON.stringify(song).replace(/'/g, "&#39;").replace(/"/g, '&quot;');
        let extra = '';
        if (context === 'playlist' && currentPlaylistId && currentPlaylistId !== '__liked__' && currentPlaylistId !== '__recent__') {
            extra = '<button class="song-action-btn" onclick="event.stopPropagation();removeSongFromPlaylist(\''+song.videoId+'\')" title="Remove"><i class="fas fa-minus-circle" style="color:#FF3B30;"></i></button>';
        }
        return '<div class="song-item" onclick="playSong(JSON.parse(this.dataset.song))" data-song=\''+JSON.stringify(song).replace(/'/g, "&#39;")+'\'>'
            +(playing?'<div class="eq-bars"><span></span><span></span><span></span></div>':'<span style="width:18px;text-align:center;color:var(--text-sub);font-size:12px;">'+(index+1)+'</span>')
            +'<img class="song-thumb" src="'+song.thumbnail+'" loading="lazy" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23374151%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 text-anchor=%22middle%22 fill=%22%239CA3AF%22 font-size=%2240%22%3E%E2%99%AA%3C/text%3E%3C/svg%3E\'">'
            +'<div class="song-info"><div class="song-title" style="'+(playing?'color:var(--theme-color);':'')+'">'+song.title+'</div><div class="song-artist">'+song.channelTitle+'</div></div>'
            +'<div class="song-actions">'
            +'<button class="song-action-btn'+(liked?' liked':'')+'" onclick="event.stopPropagation();toggleLikeSong(JSON.parse(this.closest(\'.song-item\').dataset.song))"><i class="'+(liked?'fas':'far')+' fa-heart"></i></button>'
            +'<button class="song-action-btn" onclick="event.stopPropagation();openSongMenu(JSON.parse(this.closest(\'.song-item\').dataset.song))"><i class="fas fa-ellipsis-vertical"></i></button>'
            +extra+'</div></div>';
    }

    // --- Init Music ---
    function initMusic() {
        if (musicInitialized) { renderRecentRow(); return; }
        musicInitialized = true;
        // Start loading YT API in background when music tab opens
        loadYTApi().catch(err => console.warn('YT preload:', err));
        // Render category chips
        const cc = document.getElementById('music-categories');
        if (cc) { cc.innerHTML = ''; musicCategories.forEach(cat => { cc.innerHTML += '<div class="music-chip" onclick="fetchTrending(\''+cat.q+'\')">'+cat.name+'</div>'; }); }
        fetchTrending();
        renderRecentRow();
        loadLikedSongs();
        loadPlaylists();
    }

    // ===== TOAST NOTIFICATION SYSTEM =====
    function showToast(message, type = 'info', duration = 3500) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const icons = { success: 'fas fa-check-circle', error: 'fas fa-times-circle', warning: 'fas fa-exclamation-circle', info: 'fas fa-info-circle' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, duration);
    }

    // ===== EMAIL VERIFICATION =====
    function checkVerificationStatus() {
        const user = auth.currentUser;
        const banner = document.getElementById('verify-banner');
        if (!user || user.isAnonymous || !banner) return;
        if (!user.emailVerified) {
            banner.classList.add('show');
        } else {
            banner.classList.remove('show');
        }
    }
    function resendVerification() {
        const user = auth.currentUser;
        if (!user) return;
        user.sendEmailVerification().then(() => {
            showToast('Verification email sent!', 'success');
        }).catch(err => {
            showToast(err.message || 'Could not send email', 'error');
        });
    }
    // Check verification periodically (60s to reduce network load)
    setInterval(() => {
        const user = auth.currentUser;
        if (user && !user.emailVerified) {
            user.reload().then(() => checkVerificationStatus());
        }
    }, 60000);

    // ===== WORD COUNT =====
    function updateWordCount() {
        const text = document.getElementById('entry-content').value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        const el = document.getElementById('word-count');
        if (el) el.innerText = words + ' word' + (words !== 1 ? 's' : '');
    }

    // ===== FLOATING PARTICLES =====
    function initParticles() {
        const container = document.getElementById('particles-bg');
        if (!container) return;
        // Skip particles entirely on low-end devices (handled by CSS too)
        if (perfTier === 'low') return;
        const count = perfTier === 'mid' ? (window.innerWidth < 768 ? 6 : 10) : (window.innerWidth < 768 ? 15 : 25);
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            const isComet = Math.random() > 0.7;
            p.className = `particle ${isComet ? 'comet' : 'star'}`;
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (15 + Math.random() * 25) + 's';
            p.style.animationDelay = (Math.random() * 20) + 's';
            p.style.opacity = (0.3 + Math.random() * 0.5);
            fragment.appendChild(p);
        }
        container.appendChild(fragment);
    }

    // Init particles + check verification on load
    document.addEventListener('DOMContentLoaded', () => {
        initParticles();
        setTimeout(checkVerificationStatus, 3000);
        // Start notification system if enabled
        initNotificationSystem();
        // Handle invite link on auth screen
        handleInviteLink();
    });

    // ===== INVITE LINK HANDLER =====
    function handleInviteLink() {
        const params = new URLSearchParams(window.location.search);
        const inviteCode = params.get('invite');
        const inviteRole = params.get('role');
        if (inviteCode && inviteRole) {
            // Pre-select the role
            selectedRole = inviteRole;
            setRole(inviteRole);
            // Show a banner on auth screen
            const authCard = document.querySelector('.auth-card');
            if (authCard) {
                const banner = document.createElement('div');
                banner.style.cssText = 'background:var(--theme-light);color:var(--theme-color);padding:10px 15px;font-size:12px;font-weight:600;border-radius:var(--r-s);margin-bottom:12px;text-align:center;';
                banner.innerHTML = '<i class="fas fa-link" style="margin-right:6px;"></i>Invite received! Sign in to connect with your partner.';
                authCard.querySelector('#auth-form').prepend(banner);
                // Hide role selector since role is auto-assigned
                const roleSelector = authCard.querySelector('.role-selector');
                if (roleSelector) roleSelector.style.display = 'none';
                const roleLabel = roleSelector?.previousElementSibling;
                if (roleLabel) roleLabel.style.display = 'none';
            }
        }
    }

    // ===== OFFLINE / ONLINE INDICATOR =====
    window.addEventListener('offline', () => showToast('You are offline. Changes will sync when reconnected.', 'warning', 5000));
    window.addEventListener('online', () => showToast('Back online ✨', 'success'));

    // ===== UNSAVED CHANGES WARNING (BROWSER CLOSE/REFRESH) =====
    window.addEventListener('beforeunload', function(e) {
        if (hasDiaryUnsavedChanges()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // ===== GLOBAL ERROR HANDLER =====
    window.onerror = function(msg, url, line) { console.error('Global error:', msg, 'at', url, line); return true; };
    window.addEventListener('unhandledrejection', e => { console.error('Unhandled promise:', e.reason); e.preventDefault(); });

    // ===== SONG NOTES SYSTEM =====
    let currentNoteSong = null;
    let songNotes = {};

    function openSongNote(song) {
        if (!song) song = addToPlSong;
        if (!song) return;
        currentNoteSong = song;
        document.getElementById('note-song-thumb').src = song.thumbnail;
        document.getElementById('note-song-title').innerText = song.title;
        document.getElementById('note-song-artist').innerText = song.channelTitle;
        document.getElementById('song-note-input').value = songNotes[song.videoId] || '';
        loadPartnerNote(song.videoId);
        document.getElementById('note-overlay').classList.add('active');
        document.getElementById('song-note-modal').classList.add('active');
    }

    function closeSongNote() {
        document.getElementById('song-note-modal').classList.remove('active');
        document.getElementById('note-overlay').classList.remove('active');
        currentNoteSong = null;
    }

    function saveSongNote() {
        if (!currentNoteSong || !currentUser || !currentUser.coupleId) return;
        const note = document.getElementById('song-note-input').value.trim();
        const docId = currentUser.coupleId + '_' + currentViewRole;
        songNotes[currentNoteSong.videoId] = note;
        const noteData = {};
        noteData['songNotes.' + currentNoteSong.videoId] = { note: note, songTitle: currentNoteSong.title, updatedAt: Date.now() };
        db.collection('music_data').doc(docId).set(noteData, { merge: true }).then(() => {
            showToast('Note saved ✨', 'success');
            closeSongNote();
        }).catch(err => showToast('Could not save note', 'error'));
    }

    function loadPartnerNote(videoId) {
        const area = document.getElementById('partner-note-area');
        area.innerHTML = '';
        if (!currentUser || !currentUser.coupleId) return;
        const partnerRole = currentViewRole === 'taki' ? 'mitsuha' : 'taki';
        const docId = currentUser.coupleId + '_' + partnerRole;
        db.collection('music_data').doc(docId).get().then(doc => {
            if (doc.exists && doc.data().songNotes && doc.data().songNotes[videoId]) {
                const pNote = doc.data().songNotes[videoId];
                area.innerHTML = `<div class="partner-note-bubble"><div class="song-note-indicator">💌 ${partnerRole.charAt(0).toUpperCase() + partnerRole.slice(1)}'s note</div><p style="margin:5px 0 0;font-size:13px;line-height:1.6;">${pNote.note}</p></div>`;
            }
        }).catch(() => {});
    }

    function loadSongNotes() {
        if (!currentUser || !currentUser.coupleId || !currentViewRole) return;
        const docId = currentUser.coupleId + '_' + currentViewRole;
        db.collection('music_data').doc(docId).get().then(doc => {
            if (doc.exists && doc.data().songNotes) {
                const notes = doc.data().songNotes;
                Object.keys(notes).forEach(vid => { songNotes[vid] = notes[vid].note; });
            }
        }).catch(() => {});
    }

    // ===== NOTIFICATION SYSTEM (ENHANCED) =====
    let notifRecipient = 'partner';
    let notificationHistory = JSON.parse(localStorage.getItem('musubi-notif-history') || '[]');
    let scheduledNotifs = JSON.parse(localStorage.getItem('musubi-scheduled-notifs') || '[]');

    // --- Romantic notification messages pool (Your Name themed) ---
    const romanticMessages = [
        { title: '結び — Red Thread', body: '"Even if I forget you, we\'ll meet again..." 🌅 Have you written in your diary today?' },
        { title: '✨ Twilight Reminder', body: 'Kataware-doki... the magic hour is here. Tell your partner how you feel 💫' },
        { title: '💕 Musubi Moment', body: 'Your threads of fate are intertwined. Take a moment to write something beautiful.' },
        { title: '🌸 Cherry Blossom Note', body: 'Like petals in the wind, each moment is fleeting. Capture it in your diary!' },
        { title: '📖 Diary Calling', body: 'Your partner might be thinking of you right now... Write them something special ✨' },
        { title: '🌙 Under the Same Sky', body: 'No matter the distance, you\'re under the same comet\'s light. Share a thought 💭' },
        { title: '💌 Love Reminder', body: 'A small entry today could become a treasured memory tomorrow. Start writing! 🖊️' },
        { title: '⏳ Time Flows', body: 'The braided cord of time connects you two. Don\'t let this moment pass unwritten.' },
        { title: '🎋 Tanabata Wish', body: 'Like Orihime and Hikoboshi, your love story deserves to be told. Open your diary 🌌' },
        { title: '🌄 Dawn of Connection', body: 'Every sunrise is a new page. What will you write on yours today?' },
        { title: '💝 Heartstring Tug', body: 'Felt a tug on your heartstring? That\'s your partner thinking of you. Write back! 🧶' },
        { title: '🔮 Comet\'s Return', body: 'Like Tiamat\'s comet, your love keeps coming back. Time to make an entry! ☄️' },
        { title: '🎵 Melody of Us', body: 'Your story is a song waiting to be written. Add a verse to your diary today 🎶' },
        { title: '🏮 Festival of Hearts', body: 'Every entry is a lantern lighting the path between you two. Write one now! 🏮' },
        { title: '✏️ Pen to Paper', body: 'The most beautiful stories are lived and then written down. Your turn! 📝' },
        { title: '🌊 Waves of Love', body: 'Like waves reaching the shore, your words reach your partner\'s heart. Write! 🌊' },
        { title: '🦋 Flutter', body: 'Butterflies in your stomach? Pour that feeling into your diary entry 🦋' },
        { title: '🫧 Dreamy Reminder', body: 'Was your partner in your dreams last night? Tell them about it! 🫧' },
        { title: '🌈 After the Rain', body: 'Beautiful moments come after the wait. Open your diary and create one now 🌈' },
        { title: '⭐ Stargazer', body: 'Somewhere under these same stars, your partner awaits your words. Don\'t keep them waiting! 🌟' },
        { title: '🍵 Warm Thoughts', body: 'Like a warm cup of tea, your words bring comfort. Send some warmth through your diary ☕' },
        { title: '📸 Snapshot', body: 'Capture this moment before it fades. A photo, a thought, a feeling — diary it! 📸' },
        { title: '🌻 Sunshine Note', body: 'You are someone\'s sunshine. Brighten their day with a diary entry! 🌻' },
        { title: '🎀 Tied Together', body: 'The red thread never breaks, no matter the distance. Write something to strengthen it 🎀' },
    ];

    function requestNotifPermission() {
        if (!('Notification' in window)) { showToast('Notifications not supported in this browser', 'warning'); return; }
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                showToast('Notifications enabled! 🔔', 'success');
                localStorage.setItem('notif-enabled', 'true');
                startHourlyNotifications();
            } else {
                showToast('Notification permission denied', 'warning');
            }
        });
    }

    function toggleHourlyNotifs(on) {
        if (on) {
            localStorage.setItem('notif-hourly', 'true');
            if (!('Notification' in window) || Notification.permission !== 'granted') {
                requestNotifPermission();
            } else {
                startHourlyNotifications();
            }
            showToast('Hourly reminders enabled 🔔', 'success');
        } else {
            localStorage.setItem('notif-hourly', 'false');
            if (window._hourlyNotifInterval) { clearInterval(window._hourlyNotifInterval); window._hourlyNotifInterval = null; }
            showToast('Hourly reminders disabled', 'info');
        }
    }

    function startHourlyNotifications() {
        if (localStorage.getItem('notif-hourly') !== 'true') return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        if (window._hourlyNotifInterval) clearInterval(window._hourlyNotifInterval);

        // Send first notification after a small delay (5 seconds) so user sees it works
        setTimeout(() => {
            if (localStorage.getItem('notif-hourly') === 'true') sendHourlyNotification();
        }, 5000);

        window._hourlyNotifInterval = setInterval(() => {
            sendHourlyNotification();
        }, 60 * 60 * 1000); // Every 1 hour
    }

    function sendHourlyNotification() {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const msg = romanticMessages[Math.floor(Math.random() * romanticMessages.length)];
        const ist = getIST();
        const hour = ist.getHours();

        // Time-aware contextual override (optional special messages)
        let finalTitle = msg.title;
        let finalBody = msg.body;
        if (hour >= 22 || hour < 6) {
            finalTitle = '🌙 Goodnight Musubi';
            finalBody = 'The stars are out... Did you write your last thought of the day? Sweet dreams 💤';
        } else if (hour >= 6 && hour < 9) {
            finalTitle = '🌅 Good Morning!';
            finalBody = 'A new day, a new page. Start your morning by writing something for your partner ☀️';
        }

        // System notification
        try {
            new Notification(finalTitle, {
                body: finalBody,
                icon: 'https://i.imgur.com/kXGQOgM.png',
                tag: 'musubi-hourly-' + Date.now()
            });
        } catch(e) {}

        // Add to in-app history
        addNotifToHistory({
            type: 'reminder',
            title: finalTitle,
            body: finalBody,
            time: Date.now(),
            read: false
        });
    }

    // --- Notification History ---
    function addNotifToHistory(notif) {
        notificationHistory.unshift(notif);
        if (notificationHistory.length > 50) notificationHistory = notificationHistory.slice(0, 50);
        localStorage.setItem('musubi-notif-history', JSON.stringify(notificationHistory));
        updateNotifBadge();
        renderNotifPanel();
    }

    function updateNotifBadge() {
        const unreadCount = notificationHistory.filter(n => !n.read).length;
        const badge = document.getElementById('notif-badge');
        if (!badge) return;
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.classList.add('show');
        } else {
            badge.classList.remove('show');
        }
    }

    function toggleNotifPanel() {
        const panel = document.getElementById('notif-panel');
        if (!panel) return;
        const isOpen = panel.classList.contains('active');
        if (isOpen) {
            panel.classList.remove('active');
        } else {
            panel.classList.add('active');
            // Mark all as read
            notificationHistory.forEach(n => n.read = true);
            localStorage.setItem('musubi-notif-history', JSON.stringify(notificationHistory));
            updateNotifBadge();
            renderNotifPanel();
        }
    }

    function renderNotifPanel() {
        const container = document.getElementById('notif-panel-body');
        const emptyEl = document.getElementById('notif-empty');
        if (!container) return;

        if (notificationHistory.length === 0) {
            emptyEl.style.display = 'block';
            // Remove notif cards but keep empty
            container.querySelectorAll('.notif-card').forEach(c => c.remove());
            return;
        }
        emptyEl.style.display = 'none';
        // Remove old cards
        container.querySelectorAll('.notif-card').forEach(c => c.remove());

        notificationHistory.forEach((n, idx) => {
            const card = document.createElement('div');
            card.className = 'notif-card' + (n.read ? '' : ' unread');
            const iconClass = n.type === 'love' ? 'love' : n.type === 'custom' ? 'custom' : n.type === 'partner' ? 'partner' : 'reminder';
            const iconMap = { love: 'fa-heart', reminder: 'fa-bell', custom: 'fa-paper-plane', partner: 'fa-heart-pulse' };
            const timeAgo = getTimeAgo(n.time);
            card.innerHTML = `
                <div class="notif-icon ${iconClass}"><i class="fas ${iconMap[n.type] || 'fa-bell'}"></i></div>
                <div class="notif-content">
                    <div class="notif-title">${escapeHTML(n.title)}</div>
                    <div class="notif-body">${escapeHTML(n.body)}</div>
                    <div class="notif-time">${timeAgo}</div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function getTimeAgo(ts) {
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return mins + 'm ago';
        const hours = Math.floor(mins / 60);
        if (hours < 24) return hours + 'h ago';
        const days = Math.floor(hours / 24);
        if (days < 7) return days + 'd ago';
        return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    function clearAllNotifications() {
        notificationHistory = [];
        localStorage.setItem('musubi-notif-history', '[]');
        updateNotifBadge();
        renderNotifPanel();
        showToast('Notifications cleared', 'info');
    }

    // --- Custom Notification Creator ---
    function setNotifRecipient(who) {
        notifRecipient = who;
        document.getElementById('notif-rec-partner').classList.toggle('active', who === 'partner');
        document.getElementById('notif-rec-me').classList.toggle('active', who === 'me');
    }

    async function sendCustomNotification() {
        const title = document.getElementById('custom-notif-title').value.trim();
        const body = document.getElementById('custom-notif-body').value.trim();
        const timeInput = document.getElementById('custom-notif-time').value;

        if (!title || !body) { showToast('Please enter a title and message', 'warning'); return; }
        if (!currentUser) { showToast('Please log in first', 'error'); return; }

        const now = Date.now();

        if (timeInput) {
            // Scheduled notification
            const scheduledTime = new Date(timeInput).getTime();
            if (scheduledTime <= now) { showToast('Please pick a future time', 'warning'); return; }

            const schedItem = {
                id: 'sn_' + now,
                title, body,
                recipient: notifRecipient,
                scheduledTime,
                createdBy: currentUser.uid
            };

            if (notifRecipient === 'partner' && currentUser.coupleId) {
                // Save to Firestore so partner can receive it
                try {
                    await db.collection('notifications').add({
                        coupleId: currentUser.coupleId,
                        senderUid: currentUser.uid,
                        senderName: currentUser.displayName || currentUser.email,
                        recipient: 'partner',
                        title, body,
                        scheduledTime,
                        delivered: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch(e) { console.error('Failed to save notification:', e); }
            }

            scheduledNotifs.push(schedItem);
            localStorage.setItem('musubi-scheduled-notifs', JSON.stringify(scheduledNotifs));
            renderScheduledNotifs();
            showToast('Notification scheduled! ⏰', 'success');
        } else {
            // Instant notification
            if (notifRecipient === 'me') {
                // Self notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    try { new Notification(title, { body, icon: 'https://i.imgur.com/kXGQOgM.png', tag: 'custom-' + now }); } catch(e) {}
                }
                addNotifToHistory({ type: 'custom', title, body, time: now, read: false });
                showToast('Notification sent to yourself! 📬', 'success');
            } else {
                // Partner notification — save to Firestore
                if (!currentUser.coupleId) { showToast('You need to be paired with a partner first', 'warning'); return; }
                try {
                    await db.collection('notifications').add({
                        coupleId: currentUser.coupleId,
                        senderUid: currentUser.uid,
                        senderName: currentUser.displayName || currentUser.email,
                        recipient: 'partner',
                        title, body,
                        scheduledTime: null,
                        delivered: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    showToast('Notification sent to your partner! 💕', 'success');
                    // Also add to own history as "sent"
                    addNotifToHistory({ type: 'custom', title: '📤 Sent: ' + title, body: 'To partner: ' + body, time: now, read: true });
                } catch(e) {
                    showToast('Failed to send notification', 'error');
                    console.error(e);
                }
            }
        }

        // Clear form
        document.getElementById('custom-notif-title').value = '';
        document.getElementById('custom-notif-body').value = '';
        document.getElementById('custom-notif-time').value = '';
    }

    function renderScheduledNotifs() {
        const container = document.getElementById('scheduled-notifs-list');
        if (!container) return;
        const upcoming = scheduledNotifs.filter(s => s.scheduledTime > Date.now());
        if (upcoming.length === 0) { container.innerHTML = ''; return; }
        container.innerHTML = '<div style="font-size:11px; font-weight:700; color:var(--theme-color); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; margin-top:6px;">Scheduled</div>' +
            upcoming.map(s => {
                const dt = new Date(s.scheduledTime);
                const dateStr = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                return `<div class="notif-scheduled-item">
                    <div class="notif-scheduled-info">
                        <div class="ns-title">${escapeHTML(s.title)}</div>
                        <div class="ns-meta"><i class="fas ${s.recipient === 'partner' ? 'fa-heart' : 'fa-user'}" style="margin-right:4px;"></i>${s.recipient === 'partner' ? 'Partner' : 'Me'} · ${dateStr}</div>
                    </div>
                    <button class="notif-scheduled-del" onclick="deleteScheduledNotif('${s.id}')"><i class="fas fa-trash"></i></button>
                </div>`;
            }).join('');
    }

    function deleteScheduledNotif(id) {
        scheduledNotifs = scheduledNotifs.filter(s => s.id !== id);
        localStorage.setItem('musubi-scheduled-notifs', JSON.stringify(scheduledNotifs));
        renderScheduledNotifs();
        showToast('Scheduled notification removed', 'info');
    }

    // --- Check scheduled notifications every minute ---
    function processScheduledNotifs() {
        const now = Date.now();
        let changed = false;
        scheduledNotifs = scheduledNotifs.filter(s => {
            if (s.scheduledTime <= now) {
                // Fire it!
                if (s.recipient === 'me' || s.createdBy === (currentUser && currentUser.uid)) {
                    if ('Notification' in window && Notification.permission === 'granted') {
                        try { new Notification(s.title, { body: s.body, icon: 'https://i.imgur.com/kXGQOgM.png', tag: 'sched-' + s.id }); } catch(e) {}
                    }
                    addNotifToHistory({ type: 'custom', title: s.title, body: s.body, time: now, read: false });
                }
                changed = true;
                return false; // Remove from list
            }
            return true;
        });
        if (changed) {
            localStorage.setItem('musubi-scheduled-notifs', JSON.stringify(scheduledNotifs));
            renderScheduledNotifs();
        }
    }
    setInterval(processScheduledNotifs, 60 * 1000);

    // --- Listen for partner notifications from Firestore ---
    function listenForPartnerNotifications() {
        if (!currentUser || !currentUser.coupleId) return;
        if (window._notifUnsubscribe) window._notifUnsubscribe();

        window._notifUnsubscribe = db.collection('notifications')
            .where('coupleId', '==', currentUser.coupleId)
            .where('recipient', '==', 'partner')
            .where('delivered', '==', false)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        // Only show if it's NOT sent by me (it's from my partner)
                        if (data.senderUid !== currentUser.uid) {
                            const now = Date.now();
                            // Check if scheduled for future
                            if (data.scheduledTime && data.scheduledTime > now) return;

                            // Show system notification
                            if ('Notification' in window && Notification.permission === 'granted') {
                                try {
                                    new Notification('💌 ' + (data.senderName || 'Your Partner'), {
                                        body: data.title + ': ' + data.body,
                                        icon: 'https://i.imgur.com/kXGQOgM.png',
                                        tag: 'partner-' + change.doc.id
                                    });
                                } catch(e) {}
                            }

                            // Add to in-app history
                            addNotifToHistory({
                                type: 'partner',
                                title: '💌 From ' + (data.senderName || 'Partner'),
                                body: data.title + ' — ' + data.body,
                                time: now,
                                read: false
                            });

                            // Mark as delivered
                            db.collection('notifications').doc(change.doc.id).update({ delivered: true }).catch(() => {});
                        }
                    }
                });
            });
    }

    // --- Init notifications on auth ---
    function initNotificationSystem() {
        updateNotifBadge();
        renderNotifPanel();
        renderScheduledNotifs();

        // Restore hourly toggle state
        const hourlyOn = localStorage.getItem('notif-hourly') === 'true';
        const hourlyToggle = document.getElementById('notif-hourly-toggle');
        if (hourlyToggle) hourlyToggle.checked = hourlyOn;
        if (hourlyOn) startHourlyNotifications();

        // Auto-request permission if previously enabled
        if (localStorage.getItem('notif-enabled') === 'true' && 'Notification' in window && Notification.permission === 'default') {
            requestNotifPermission();
        }

        // Listen for partner notifications
        listenForPartnerNotifications();

        // Process any pending scheduled notifications
        processScheduledNotifs();
    }

    // ===== NOW-LISTENING BROADCAST (with playback time for spectator sync) =====
    let broadcastInterval = null;
    let isSpectating = false, spectatorSyncInterval = null, partnerNowPlayingData = null;
    let lastSpectatorSyncVideoId = null; // Track last synced videoId to avoid redundant loads

    function broadcastNowPlaying(song) {
        if (!currentUser || !currentUser.coupleId || !song) return;
        if (isSpectating) return;
        broadcastPlaybackState();
        clearInterval(broadcastInterval);
        broadcastInterval = setInterval(() => {
            if (!isMusicPlaying || !currentSong || isSpectating) { clearInterval(broadcastInterval); broadcastInterval = null; return; }
            broadcastPlaybackState();
        }, 3000); // Broadcast every 3s for tighter sync
    }

    function broadcastPlaybackState() {
        try {
            if (!currentUser || !currentUser.coupleId || !currentSong) return;
            if (isSpectating) return;
            let playbackTime = 0;
            try { playbackTime = (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') ? ytPlayer.getCurrentTime() : 0; } catch(e) {}
            db.collection('now_playing').doc(currentUser.coupleId + '_' + currentViewRole).set({
                videoId: currentSong.videoId, title: currentSong.title, thumbnail: currentSong.thumbnail,
                channelTitle: currentSong.channelTitle, role: currentViewRole,
                timestamp: Date.now(), playbackTime: playbackTime, isPlaying: isMusicPlaying
            }).catch(() => {});
        } catch(e) { console.warn('broadcastPlaybackState error:', e); }
    }

    function stopBroadcast() {
        try {
            if (broadcastInterval) { clearInterval(broadcastInterval); broadcastInterval = null; }
            if (!currentUser || !currentUser.coupleId || isSpectating) return;
            let playbackTime = 0;
            try { playbackTime = (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') ? ytPlayer.getCurrentTime() : 0; } catch(e) {}
            db.collection('now_playing').doc(currentUser.coupleId + '_' + currentViewRole).update({
                isPlaying: false, playbackTime: playbackTime, timestamp: Date.now()
            }).catch(() => {});
        } catch(e) { console.warn('stopBroadcast error:', e); }
    }

    function listenPartnerPlaying() {
        if (!currentUser || !currentUser.coupleId) return;
        const partnerRole = currentViewRole === 'taki' ? 'mitsuha' : 'taki';
        const docRef = db.collection('now_playing').doc(currentUser.coupleId + '_' + partnerRole);
        docRef.onSnapshot(doc => {
            const bar = document.getElementById('now-listening-bar');
            if (!doc.exists || !doc.data() || !doc.data().videoId) {
                bar.classList.remove('active');
                partnerNowPlayingData = null;
                if (isSpectating) exitSpectatorMode('Partner stopped playing');
                return;
            }
            const data = doc.data();
            if (Date.now() - data.timestamp > 30000 && !data.isPlaying) {
                bar.classList.remove('active');
                partnerNowPlayingData = null;
                if (isSpectating) exitSpectatorMode('Partner stopped playing');
                return;
            }
            // Stamp with local receive time to avoid cross-device clock skew
            data._receivedAt = Date.now();
            partnerNowPlayingData = data;
            const nlThumb = document.getElementById('nl-thumb');
            nlThumb.src = data.thumbnail;
            nlThumb.onerror = function() { this.onerror = null; this.src = _imgFallback; };
            const roleName = partnerRole.charAt(0).toUpperCase() + partnerRole.slice(1);
            document.getElementById('nl-text').innerHTML = `<strong>${roleName}</strong> is listening to <em>${data.title.substring(0, 30)}${data.title.length > 30 ? '...' : ''}</em>`;
            bar.classList.add('active');

            // === REAL-TIME SPECTATOR SYNC (onSnapshot-driven, like watching a live TV) ===
            if (isSpectating) {
                spectatorRealtimeSync(data);
            }

            if ('Notification' in window && Notification.permission === 'granted' && document.hidden && !isSpectating) {
                new Notification(`${roleName} is listening 🎵`, {
                    body: data.title, icon: data.thumbnail, tag: 'now-playing'
                });
            }
        });
    }

    // ===== SPECTATOR MODE =====
    function enterSpectatorMode() {
        if (!partnerNowPlayingData) {
            showToast('Partner is not playing anything right now', 'warning');
            return;
        }
        if (isSpectating) { openFullPlayer(); return; }
        const data = partnerNowPlayingData;
        if (!data.isPlaying && (Date.now() - data.timestamp > 30000)) {
            showToast('Partner has stopped playing', 'warning');
            return;
        }

        isSpectating = true;
        lastSpectatorSyncVideoId = null;
        clearInterval(broadcastInterval); broadcastInterval = null;

        document.getElementById('app-container').classList.add('spectating');
        document.getElementById('fp-spectator-badge').classList.add('active');
        document.getElementById('fp-spectator-exit').classList.add('active');

        const partnerRole = currentViewRole === 'taki' ? 'mitsuha' : 'taki';
        const roleName = partnerRole.charAt(0).toUpperCase() + partnerRole.slice(1);
        showToast(`Listening along with ${roleName} 🎧`, 'success', 2500);

        // Ensure YT player is ready before syncing
        ensureYTReady().then(function() {
            // Fresh read from Firestore for accurate initial sync
            var docRef = db.collection('now_playing').doc(currentUser.coupleId + '_' + partnerRole);
            docRef.get().then(function(doc) {
                if (doc.exists && doc.data() && doc.data().videoId) {
                    var freshData = doc.data();
                    freshData._receivedAt = Date.now();
                    partnerNowPlayingData = freshData;
                    spectatorSyncToPartner(freshData);
                } else {
                    data._receivedAt = data._receivedAt || Date.now();
                    spectatorSyncToPartner(data);
                }
            }).catch(function() { data._receivedAt = data._receivedAt || Date.now(); spectatorSyncToPartner(data); });
        }).catch(function() {
            showToast('Music player failed to load', 'error');
            exitSpectatorMode();
        });

        openFullPlayer();

        // Backup polling every 4s (safety net, onSnapshot is primary driver)
        clearInterval(spectatorSyncInterval);
        spectatorSyncInterval = setInterval(() => {
            if (!isSpectating || !partnerNowPlayingData) return;
            spectatorResync();
        }, 4000);
    }

    function spectatorSyncToPartner(data) {
        if (!data || !data.videoId) return;
        if (!ytReady) {
            ensureYTReady().then(() => spectatorSyncToPartner(data)).catch(() => {
                showToast('Music player failed to load', 'error');
                exitSpectatorMode();
            });
            return;
        }

        const song = { videoId: data.videoId, title: data.title, thumbnail: data.thumbnail, channelTitle: data.channelTitle };
        // Use _receivedAt (local clock) instead of data.timestamp (partner's clock) to avoid clock skew
        const receivedAt = data._receivedAt || Date.now();
        const elapsed = (Date.now() - receivedAt) / 1000;
        const syncedTime = Math.max(0, (data.playbackTime || 0) + (data.isPlaying ? elapsed : 0));

        currentSong = song;
        lastSpectatorSyncVideoId = song.videoId;
        currentLyrics = null; activeLyricIndex = -1;
        if (lyricsActive) loadLyricsForSong(song);

        const idx = musicQueue.findIndex(s => s.videoId === song.videoId);
        if (idx >= 0) { musicQueueIndex = idx; } else { musicQueue.push(song); musicQueueIndex = musicQueue.length - 1; }

        // Set loading guard to prevent onPlayerStateChange from fighting
        _spectatorLoadingVideo = true;

        // Set UI state immediately
        isMusicPlaying = data.isPlaying;
        document.getElementById('mini-player').classList.add('active');
        document.body.classList.add('mini-player-visible');
        updatePlayerUI();
        if (data.isPlaying) startProgress();

        // Use loadVideoById with startSeconds for immediate playback
        try {
            ytPlayer.loadVideoById({ videoId: song.videoId, startSeconds: syncedTime });
        } catch(e) {
            console.warn('Spectator loadVideo error:', e);
            _spectatorLoadingVideo = false;
            return;
        }

        // Retry playback at multiple intervals to handle autoplay restrictions
        var retryAttempts = [800, 1800, 3000, 5000];
        retryAttempts.forEach(function(delay) {
            setTimeout(function() {
                if (!isSpectating || !ytPlayer) return;
                try {
                    var state = ytPlayer.getPlayerState();
                    if (data.isPlaying && state !== YT.PlayerState.PLAYING) {
                        // Recalculate position in case of long buffer (use local clock)
                        var newReceivedAt = data._receivedAt || Date.now();
                        var newElapsed = (Date.now() - newReceivedAt) / 1000;
                        var newTime = Math.max(0, (data.playbackTime || 0) + newElapsed);
                        ytPlayer.seekTo(newTime, true);
                        ytPlayer.playVideo();
                        isMusicPlaying = true;
                        updatePlayerUI();
                        startProgress();
                    } else if (!data.isPlaying && state === YT.PlayerState.PLAYING) {
                        ytPlayer.pauseVideo();
                        isMusicPlaying = false;
                        updatePlayerUI();
                        stopProgress();
                    }
                } catch(e) {}
                // Remove loading guard after last retry
                if (delay === retryAttempts[retryAttempts.length - 1]) {
                    _spectatorLoadingVideo = false;
                }
            }, delay);
        });

        // Remove loading guard at 1.5s as a baseline
        setTimeout(function() { _spectatorLoadingVideo = false; }, 1500);
    }

    // Called by onSnapshot every time partner broadcasts — this is the primary sync driver
    function spectatorRealtimeSync(data) {
        if (!isSpectating || !data || !data.videoId) return;
        if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;

        // Update stored data
        partnerNowPlayingData = data;

        // Partner changed song → full reload
        if (!currentSong || data.videoId !== currentSong.videoId) {
            spectatorSyncToPartner(data);
            return;
        }

        // Skip drift correction during initial load
        if (_spectatorLoadingVideo) return;

        // Calculate where partner should be right now (use _receivedAt to avoid clock skew)
        const receivedAt = data._receivedAt || Date.now();
        const elapsed = (Date.now() - receivedAt) / 1000;
        const expectedTime = Math.max(0, (data.playbackTime || 0) + (data.isPlaying ? elapsed : 0));
        let actualTime = 0;
        try { actualTime = ytPlayer.getCurrentTime() || 0; } catch(e) { return; }
        const drift = Math.abs(expectedTime - actualTime);

        // Correct drift > 2s immediately
        if (drift > 2) {
            try { ytPlayer.seekTo(expectedTime, true); } catch(e) {}
        }

        // Sync play/pause state
        if (data.isPlaying && !isMusicPlaying) {
            try { ytPlayer.playVideo(); } catch(e) {}
            isMusicPlaying = true; updatePlayerUI(); startProgress();
        } else if (!data.isPlaying && isMusicPlaying) {
            try { ytPlayer.pauseVideo(); } catch(e) {}
            isMusicPlaying = false; updatePlayerUI(); stopProgress();
        }
    }

    // Backup polling resync (safety net if onSnapshot misses)
    function spectatorResync() {
        if (!isSpectating || !partnerNowPlayingData || _spectatorLoadingVideo) return;
        if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
        spectatorRealtimeSync(partnerNowPlayingData);
    }

    function exitSpectatorMode(reason) {
        if (!isSpectating) return;
        isSpectating = false;
        lastSpectatorSyncVideoId = null;

        clearInterval(spectatorSyncInterval); spectatorSyncInterval = null;

        document.getElementById('app-container').classList.remove('spectating');
        document.getElementById('fp-spectator-badge').classList.remove('active');
        document.getElementById('fp-spectator-exit').classList.remove('active');

        if (reason) showToast(reason, 'info', 2000);
        else showToast('Stopped listening together', 'info', 2000);
    }

    // ===== INTERACTIVE TUTORIAL WALKTHROUGH ENGINE =====
    const tutWtSteps = [
        {
            img: 'img/img5.png', // Happy
            text: "Welcome to Musubi Diary! I'm Mitsuha. Let me show you how to connect our timelines! ✨",
            action: 'next',
            btnLabel: 'Next'
        },
        {
            img: 'img/img1.png', // Sparkle eyes
            text: "First, let's write a memory. Tap the Pen icon down here! ✍️",
            action: 'click',
            target: '#tab-diary'
        },
        {
            img: 'img/img3.png', // Confused
            text: "This is your diary! Don't forget to tell me how your day was by picking a weather mood. ☁️",
            action: 'click',
            target: '.diary-mood-section',
            listenTarget: '.mood-opt'
        },
        {
            img: 'img/img1.png', // Sparkle eyes
            text: "Perfect! Now tap the Music tab so we can share a song together! 🎵",
            action: 'click',
            target: '#tab-music'
        },
        {
            img: 'img/img5.png', // Happy
            text: "You did it! Remember, we swap bodies every day at midnight. Have fun! 結び 💫",
            action: 'finish',
            btnLabel: 'Finish'
        }
    ];

    let tutWtIndex = 0;
    let _tutWtClickHandler = null;
    let _tutWtBlockHandler = null;
    let _tutWtPrevSpotlight = null;
    let _tutWtElevated = [];

    function showTutorial() {
        tutWtIndex = 0;
        document.getElementById('tut-wt-overlay').classList.add('active');
        document.getElementById('tut-wt-avatar-wrap').classList.add('active');
        _renderTutWtStep();
    }

    function closeTutorial() {
        _tutWtClearSpotlight();
        _tutWtRemoveClickListener();
        document.getElementById('tut-wt-overlay').classList.remove('active');
        document.getElementById('tut-wt-avatar-wrap').classList.remove('active');
        localStorage.setItem('tutorialDone', 'true');
    }

    function _tutWtClearSpotlight() {
        if (_tutWtPrevSpotlight) {
            _tutWtPrevSpotlight.classList.remove('tut-wt-spotlight');
            _tutWtPrevSpotlight = null;
        }
        // Remove elevated ancestors
        _tutWtElevated.forEach(function(el) {
            el.classList.remove('tut-wt-elevated');
            if (el._tutOrigContain !== undefined) { el.style.contain = el._tutOrigContain; delete el._tutOrigContain; }
            if (el._tutOrigContentVis !== undefined) { el.style.contentVisibility = el._tutOrigContentVis; delete el._tutOrigContentVis; }
            if (el._tutOrigOverflow !== undefined) { el.style.overflow = el._tutOrigOverflow; delete el._tutOrigOverflow; }
        });
        _tutWtElevated = [];
    }

    function _tutWtRemoveClickListener() {
        if (_tutWtClickHandler) {
            document.removeEventListener('click', _tutWtClickHandler, true);
            _tutWtClickHandler = null;
        }
        if (_tutWtBlockHandler) {
            document.removeEventListener('click', _tutWtBlockHandler, true);
            _tutWtBlockHandler = null;
        }
    }

    // Walk up ancestors and elevate any that create stacking contexts
    function _tutWtElevateAncestors(el) {
        var node = el.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
            var style = getComputedStyle(node);
            var needsElevation = false;

            // Check for stacking context triggers
            if (style.zIndex !== 'auto' && style.position !== 'static') needsElevation = true;
            if (style.backdropFilter && style.backdropFilter !== 'none') needsElevation = true;
            if (style.webkitBackdropFilter && style.webkitBackdropFilter !== 'none') needsElevation = true;
            if (style.transform && style.transform !== 'none') needsElevation = true;
            if (style.isolation === 'isolate') needsElevation = true;
            if (style.contain === 'paint' || style.contain === 'layout' || style.contain === 'strict' || style.contain === 'content') needsElevation = true;
            if (style.opacity !== '1') needsElevation = true;
            // overflow:hidden clips spotlighted children
            if (style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden') needsElevation = true;

            if (needsElevation) {
                // Store original inline styles to restore later
                node._tutOrigContain = node.style.contain;
                node._tutOrigContentVis = node.style.contentVisibility;
                node._tutOrigOverflow = node.style.overflow;
                // Remove contain/content-visibility/overflow that trap z-index or clip
                node.style.contain = 'none';
                node.style.contentVisibility = 'visible';
                node.style.overflow = 'visible';
                node.classList.add('tut-wt-elevated');
                _tutWtElevated.push(node);
            }
            node = node.parentElement;
        }
    }

    function _renderTutWtStep() {
        var step = tutWtSteps[tutWtIndex];
        if (!step) return;

        var avatarImg = document.getElementById('tut-wt-avatar');
        var textEl = document.getElementById('tut-wt-text');
        var btnEl = document.getElementById('tut-wt-btn');
        var bubbleEl = document.getElementById('tut-wt-bubble');

        // Clear previous spotlight & listeners
        _tutWtClearSpotlight();
        _tutWtRemoveClickListener();

        // Set avatar image with bounce
        avatarImg.src = step.img;
        avatarImg.style.animation = 'none';
        void avatarImg.offsetWidth;
        avatarImg.style.animation = 'tutBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';

        // Re-trigger bubble pop animation
        bubbleEl.style.animation = 'none';
        void bubbleEl.offsetWidth;
        bubbleEl.style.animation = 'tutBubblePop 0.4s cubic-bezier(0.16, 1, 0.3, 1) both';

        // Set text
        textEl.textContent = step.text;

        // Remove old skip button if any
        var oldSkip = document.querySelector('.tut-wt-skip');
        if (oldSkip) oldSkip.remove();

        if (step.action === 'next' || step.action === 'finish') {
            btnEl.classList.remove('hidden');
            btnEl.textContent = step.btnLabel || 'Next';

            if (step.action === 'finish') {
                btnEl.onclick = function() { closeTutorial(); };
            } else {
                btnEl.onclick = function() {
                    tutWtIndex++;
                    _renderTutWtStep();
                };
            }

            // Add skip button for non-finish steps
            if (step.action === 'next') {
                var skipBtn = document.createElement('button');
                skipBtn.className = 'tut-wt-skip';
                skipBtn.textContent = 'Skip';
                skipBtn.onclick = function() { closeTutorial(); };
                btnEl.parentNode.insertBefore(skipBtn, btnEl.nextSibling);
            }

            // Block clicks outside the tutorial bubble area
            _tutWtBlockHandler = function(e) {
                if (!e.target.closest('.tut-wt-avatar-wrap')) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            };
            document.addEventListener('click', _tutWtBlockHandler, true);

        } else if (step.action === 'click') {
            // Hide the Next button
            btnEl.classList.add('hidden');

            // Add skip button
            var skipBtn2 = document.createElement('button');
            skipBtn2.className = 'tut-wt-skip';
            skipBtn2.textContent = 'Skip';
            skipBtn2.onclick = function(e) {
                e.stopPropagation();
                closeTutorial();
            };
            btnEl.parentNode.appendChild(skipBtn2);

            // Spotlight the target element
            var targetEl = document.querySelector(step.target);
            if (targetEl) {
                targetEl.classList.add('tut-wt-spotlight');
                _tutWtPrevSpotlight = targetEl;
                // Elevate all ancestors that create stacking contexts
                _tutWtElevateAncestors(targetEl);
            }

            // Listen for click on the actual target (or listenTarget)
            var listenSelector = step.listenTarget || step.target;
            _tutWtClickHandler = function(e) {
                // Always allow tutorial UI clicks
                if (e.target.closest('.tut-wt-avatar-wrap')) return;

                var clicked = e.target.closest(listenSelector);
                if (clicked) {
                    // Allow the click to propagate to the original handler
                    setTimeout(function() {
                        tutWtIndex++;
                        _renderTutWtStep();
                    }, 400);
                } else {
                    // Block clicks on anything else
                    e.stopPropagation();
                    e.preventDefault();
                }
            };
            document.addEventListener('click', _tutWtClickHandler, true);
        }
    }

    // ===== SONG LYRICS SYSTEM (Spotify-style Real-time Synced) =====
    let lyricsCache = {};
    let currentLyrics = null;
    let lyricsActive = false;
    let activeLyricIndex = -1;
    let lyricsUserScrolling = false;
    let lyricsScrollTimeout = null;

    // --- Title/Artist Extraction from YouTube data ---
    function extractArtistAndTitle(ytTitle, channelTitle) {
        const dashPatterns = [
            /^(.+?)\s*[-–—]\s*(.+)$/,
            /^(.+?)\s*\/\s*(.+)$/
        ];
        for (const pattern of dashPatterns) {
            const match = ytTitle.match(pattern);
            if (match) {
                let a = match[1].trim();
                let t = match[2].trim();
                t = cleanSongTitle(t);
                a = cleanArtistName(a);
                if (a.length > 45 && t.length < a.length) { let tmp = a; a = t; t = tmp; }
                return { artist: a, title: t };
            }
        }
        return { artist: cleanArtistName(channelTitle), title: cleanSongTitle(ytTitle) };
    }

    function cleanSongTitle(title) {
        return title
            .replace(/\(Official\s*(?:Music\s*)?(?:Video|Audio|MV|M\/V|Visuali[sz]er|Lyric\s*Video)?\s*\)/gi, '')
            .replace(/\[Official\s*(?:Music\s*)?(?:Video|Audio|MV|M\/V|Visuali[sz]er|Lyric\s*Video)?\s*\]/gi, '')
            .replace(/\(Full\s*(?:Song|Video|Audio|Version)\)/gi, '')
            .replace(/\[Full\s*(?:Song|Video|Audio|Version)\]/gi, '')
            .replace(/\((?:HD|HQ|4K|Lyrics?|Sub(?:titled)?|Eng(?:lish)?)\)/gi, '')
            .replace(/\[(?:HD|HQ|4K|Lyrics?|Sub(?:titled)?|Eng(?:lish)?)\]/gi, '')
            .replace(/\(movie\s*ver\.?\)/gi, '')
            .replace(/Official\s*(?:Music\s*)?(?:Video|Audio|MV|M\/V)/gi, '')
            .replace(/\b(?:MV|M\/V)\b/gi, '')
            .replace(/\|.*$/g, '')
            .replace(/ft\.?\s+.*/gi, '')
            .replace(/feat\.?\s+.*/gi, '')
            .replace(/\s*[-–—]\s*$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function cleanArtistName(name) {
        return name
            .replace(/\s*[-–]\s*Topic$/i, '')
            .replace(/VEVO$/i, '')
            .replace(/Official$/i, '')
            .replace(/\s*Music$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // --- Lyrics Fetching (lrclib.net + lyrics.ovh fallback) ---
    async function fetchLyrics(ytTitle, channelTitle) {
        const { artist, title } = extractArtistAndTitle(ytTitle, channelTitle);
        const cacheKey = (title + '||' + artist).toLowerCase();
        if (lyricsCache[cacheKey] !== undefined) return lyricsCache[cacheKey];

        try {
            // Attempt 1: lrclib exact match
            let res = await fetch('https://lrclib.net/api/get?artist_name=' + encodeURIComponent(artist) + '&track_name=' + encodeURIComponent(title));
            if (res.ok) {
                let data = await res.json();
                if (data && (data.syncedLyrics || data.plainLyrics)) {
                    const result = {
                        synced: data.syncedLyrics ? parseLRC(data.syncedLyrics) : null,
                        plain: data.plainLyrics || null,
                        source: 'lrclib',
                        trackName: data.trackName || title,
                        artistName: data.artistName || artist
                    };
                    lyricsCache[cacheKey] = result;
                    return result;
                }
            }

            // Attempt 2: lrclib search with artist + title
            res = await fetch('https://lrclib.net/api/search?artist_name=' + encodeURIComponent(artist) + '&track_name=' + encodeURIComponent(title));
            if (res.ok) {
                let data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    const best = data[0];
                    const result = {
                        synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : null,
                        plain: best.plainLyrics || null,
                        source: 'lrclib',
                        trackName: best.trackName || title,
                        artistName: best.artistName || artist
                    };
                    lyricsCache[cacheKey] = result;
                    return result;
                }
            }

            // Attempt 3: lrclib broader query search
            res = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(title + ' ' + artist));
            if (res.ok) {
                let data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    const best = data[0];
                    const result = {
                        synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : null,
                        plain: best.plainLyrics || null,
                        source: 'lrclib',
                        trackName: best.trackName || title,
                        artistName: best.artistName || artist
                    };
                    lyricsCache[cacheKey] = result;
                    return result;
                }
            }

            // Attempt 4: lyrics.ovh fallback (plain lyrics only)
            try {
                res = await fetch('https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title));
                if (res.ok) {
                    let data = await res.json();
                    if (data && data.lyrics) {
                        const result = { synced: null, plain: data.lyrics, source: 'lyrics.ovh', trackName: title, artistName: artist };
                        lyricsCache[cacheKey] = result;
                        return result;
                    }
                }
            } catch(e) { /* lyrics.ovh may fail with CORS, ignore */ }

            // No lyrics found
            lyricsCache[cacheKey] = null;
            return null;
        } catch(e) {
            console.error('Lyrics fetch error:', e);
            return null;
        }
    }

    // --- LRC Parser (synced lyrics format) ---
    function parseLRC(lrcText) {
        if (!lrcText) return null;
        const lines = lrcText.split('\n');
        const synced = [];
        const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

        lines.forEach(function(line) {
            const timestamps = [];
            let match;
            let cleanLine = line;
            timeRegex.lastIndex = 0;
            while ((match = timeRegex.exec(line)) !== null) {
                const mins = parseInt(match[1]);
                const secs = parseInt(match[2]);
                const ms = match[3] ? parseInt(match[3]) : 0;
                const time = mins * 60 + secs + ms / (match[3] && match[3].length === 3 ? 1000 : 100);
                timestamps.push(time);
                cleanLine = cleanLine.replace(match[0], '');
            }
            const text = cleanLine.trim();
            timestamps.forEach(function(time) {
                synced.push({ time: time, text: text });
            });
        });

        synced.sort(function(a, b) { return a.time - b.time; });
        return synced.length > 0 ? synced : null;
    }

    // --- Lyrics Rendering ---
    function renderLyrics(lyrics) {
        const content = document.getElementById('fp-lyrics-content');
        const scroll = document.getElementById('fp-lyrics-scroll');
        const badge = document.getElementById('fp-lyrics-badge');
        if (!content) return;

        if (!lyrics) {
            content.innerHTML = '<div class="fp-lyrics-empty">' +
                '<i class="fas fa-music" style="font-size:44px;opacity:0.3;color:rgba(255,255,255,0.3);"></i>' +
                '<p style="color:rgba(255,255,255,0.4);">Lyrics not available for this song</p>' +
                '<p style="font-size:12px;color:rgba(255,255,255,0.25);">We searched everywhere but couldn\'t find them</p>' +
                '</div>';
            if (scroll) scroll.classList.remove('lyrics-plain-mode');
            if (badge) badge.innerText = '—';
            return;
        }

        if (lyrics.synced && lyrics.synced.length > 0) {
            // Synced (timestamped) lyrics — Spotify-style line-by-line
            var html = '<div style="height:35vh;"></div>';
            lyrics.synced.forEach(function(line, i) {
                if (line.text === '') {
                    html += '<div class="lyrics-interlude" data-time="' + line.time + '" data-index="' + i + '">' +
                        '<div class="lyrics-interlude-dot"></div>' +
                        '<div class="lyrics-interlude-dot"></div>' +
                        '<div class="lyrics-interlude-dot"></div>' +
                        '</div>';
                } else {
                    html += '<div class="lyrics-line" data-time="' + line.time + '" data-index="' + i + '" onclick="seekToLyric(' + line.time + ')">' + escapeHTML(line.text) + '</div>';
                }
            });
            html += '<div style="height:55vh;"></div>';
            content.innerHTML = html;
            if (scroll) scroll.classList.remove('lyrics-plain-mode');
            if (badge) { badge.innerText = 'SYNCED'; badge.style.borderColor = 'rgba(29,185,84,0.5)'; badge.style.color = 'rgba(29,185,84,0.8)'; }
            activeLyricIndex = -1;
        } else if (lyrics.plain) {
            // Unsynced plain lyrics
            var lines = lyrics.plain.split('\n');
            var html = '<div style="height:25vh;"></div>';
            lines.forEach(function(line, i) {
                if (line.trim()) {
                    html += '<div class="lyrics-line" data-index="' + i + '">' + escapeHTML(line.trim()) + '</div>';
                } else {
                    html += '<div style="height:20px;"></div>';
                }
            });
            html += '<div style="height:55vh;"></div>';
            content.innerHTML = html;
            if (scroll) scroll.classList.add('lyrics-plain-mode');
            if (badge) { badge.innerText = 'LYRICS'; badge.style.borderColor = 'rgba(255,255,255,0.15)'; badge.style.color = 'rgba(255,255,255,0.4)'; }
        }

    }
    function syncLyrics() {
        if (!lyricsActive || !currentLyrics || !currentLyrics.synced) return;
        if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
        if (lyricsUserScrolling) return;

        var currentTime = ytPlayer.getCurrentTime() || 0;
        var lines = currentLyrics.synced;
        var newIndex = -1;

        // Binary search for better performance on large lyrics
        var lo = 0, hi = lines.length - 1;
        while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            if (lines[mid].time - 0.1 <= currentTime) {
                newIndex = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        if (newIndex !== activeLyricIndex) {
            activeLyricIndex = newIndex;
            highlightLyricLine(newIndex);
        }
    }

    function highlightLyricLine(index) {
        var content = document.getElementById('fp-lyrics-content');
        var scroll = document.getElementById('fp-lyrics-scroll');
        if (!content || !scroll) return;

        var allLines = content.querySelectorAll('.lyrics-line');
        allLines.forEach(function(el) {
            var lineIdx = parseInt(el.dataset.index);
            el.classList.remove('active', 'past', 'upcoming');
            if (lineIdx < index) el.classList.add('past');
            else if (lineIdx === index) el.classList.add('active');
            else if (lineIdx === index + 1 || lineIdx === index + 2) el.classList.add('upcoming');
        });

        // Update interlude elements
        content.querySelectorAll('.lyrics-interlude').forEach(function(el) {
            var lineIdx = parseInt(el.dataset.index);
            el.style.opacity = lineIdx <= index ? '0.3' : '0.5';
        });

        // Show/hide lyrics badge
        var badge2 = document.getElementById('fp-lyrics-badge');
        if (index >= 0) {
            var activeLine = content.querySelector('.lyrics-line[data-index="' + index + '"]') ||
                             content.querySelector('.lyrics-interlude[data-index="' + index + '"]');
            if (activeLine) {
                var scrollRect = scroll.getBoundingClientRect();
                var lineRect = activeLine.getBoundingClientRect();
                var targetOffset = lineRect.top - scrollRect.top - scrollRect.height * 0.3;
                scroll.scrollBy({ top: targetOffset, behavior: 'smooth' });
            }
        }
    }

    function seekToLyric(time) {
        if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
            ytPlayer.seekTo(time, true);
            if (!isMusicPlaying) ytPlayer.playVideo();
        }
    }

    // --- User scroll detection (pause auto-scroll during manual scroll) ---
    function initLyricsScrollDetection() {
        var scroll = document.getElementById('fp-lyrics-scroll');
        if (!scroll || scroll._lyricsScrollInit) return;
        scroll._lyricsScrollInit = true;

        scroll.addEventListener('touchstart', function() {
            lyricsUserScrolling = true;
        }, { passive: true });

        scroll.addEventListener('touchend', function() {
            clearTimeout(lyricsScrollTimeout);
            lyricsScrollTimeout = setTimeout(function() { lyricsUserScrolling = false; }, 3000);
        }, { passive: true });

        scroll.addEventListener('wheel', function() {
            lyricsUserScrolling = true;
            clearTimeout(lyricsScrollTimeout);
            lyricsScrollTimeout = setTimeout(function() { lyricsUserScrolling = false; }, 3000);
        }, { passive: true });
    }

    // --- Toggle Lyrics View ---
    function toggleLyrics() {
        lyricsActive = !lyricsActive;
        var panel = document.getElementById('fp-lyrics-panel');
        var artwork = document.querySelector('.fp-artwork');
        var btn = document.getElementById('fp-lyrics-toggle');

        if (lyricsActive) {
            if (artwork) artwork.style.display = 'none';
            if (panel) panel.classList.add('active');
            if (btn) btn.classList.add('lyrics-active');
            var fpInfo = document.querySelector('.fp-info');
            if (fpInfo) fpInfo.style.display = 'none';

            if (currentSong) {
                var lyrThumb = document.getElementById('fp-lyrics-thumb');
                var lyrTitle = document.getElementById('fp-lyrics-title');
                var lyrArtist = document.getElementById('fp-lyrics-artist');
                if (lyrThumb) lyrThumb.src = currentSong.thumbnail;
                if (lyrTitle) lyrTitle.innerText = currentSong.title;
                if (lyrArtist) lyrArtist.innerText = currentSong.channelTitle;

                if (!currentLyrics) loadLyricsForSong(currentSong);
                else if (currentLyrics) { activeLyricIndex = -1; syncLyrics(); }
            }

            initLyricsScrollDetection();
        } else {
            if (artwork) artwork.style.display = 'flex';
            if (panel) panel.classList.remove('active');
            if (btn) btn.classList.remove('lyrics-active');
            var fpInfo = document.querySelector('.fp-info');
            if (fpInfo) fpInfo.style.display = '';
            lyricsUserScrolling = false;
        }
    }



    // --- Load Lyrics for Song ---
    async function loadLyricsForSong(song) {
        if (!song) return;
        var content = document.getElementById('fp-lyrics-content');
        if (!content) return;

        // Show loading state
        content.innerHTML = '<div class="fp-lyrics-loading">' +
            '<div style="width:30px;height:30px;border:2.5px solid rgba(255,255,255,0.15);border-top-color:rgba(255,255,255,0.8);border-radius:50%;animation:lyricsSpin 0.8s linear infinite;"></div>' +
            '<span style="font-family:\'Poppins\',sans-serif;color:rgba(255,255,255,0.5);">Finding lyrics...</span>' +
            '</div>';

        var lyrics = await fetchLyrics(song.title, song.channelTitle);

        // Check if the song is still the same (user might have changed songs)
        if (currentSong && currentSong.videoId !== song.videoId) return;

        currentLyrics = lyrics;
        activeLyricIndex = -1;
        renderLyrics(lyrics);

        // Immediately sync if playing
        if (isMusicPlaying) syncLyrics();
    }

    // ===== THEMED CONFIRM DIALOG =====
    let confirmResolve = null;
    function showConfirm(title, msg) {
        return new Promise(resolve => {
            confirmResolve = resolve;
            document.getElementById('confirm-title').innerText = title;
            document.getElementById('confirm-msg').innerText = msg;
            document.getElementById('confirm-overlay').classList.add('active');
        });
    }
    function closeConfirm(result) {
        document.getElementById('confirm-overlay').classList.remove('active');
        if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
    }

    // Replace the old deleteCurrentEntry
    window._origDeleteEntry = deleteCurrentEntry;
    deleteCurrentEntry = async function() {
        if (!openEntryId) return;
        const confirmed = await showConfirm("Delete Memory?", "This will permanently remove this entry. This action cannot be undone.");
        if (confirmed) {
            db.collection('entries').doc(openEntryId).delete().then(() => {
                closeModal(); switchTab('entries');
                showToast("Memory removed", "success");
            }).catch(err => showToast("Failed to delete", "error"));
        }
    };

    // ===== SCROLL TO TOP =====
    function scrollToTop() {
        const active = document.querySelector('.view-section.active');
        if (active) active.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Show/hide scroll-to-top button
    function initScrollTopWatcher() {
        const sections = document.querySelectorAll('.view-section');
        const btn = document.getElementById('scroll-top');
        let scrollTick = false;
        sections.forEach(section => {
            section.addEventListener('scroll', () => {
                if (scrollTick) return;
                scrollTick = true;
                requestAnimationFrame(() => {
                    scrollTick = false;
                    if (section.classList.contains('active') && section.scrollTop > 300) {
                        btn.classList.add('visible');
                    } else {
                        btn.classList.remove('visible');
                    }
                });
            }, { passive: true });
        });
    }
    document.addEventListener('DOMContentLoaded', initScrollTopWatcher);

    // ===== IMAGE LIGHTBOX =====
    var _lbPhotos = [], _lbIndex = 0;
    function openLightbox(src, photos, index) {
        const lb = document.getElementById('lightbox');
        const img = document.getElementById('lightbox-img');
        _lbPhotos = photos || [src];
        _lbIndex = (typeof index === 'number') ? index : 0;
        img.src = _lbPhotos[_lbIndex];
        img.style.transform = '';
        lb.classList.add('active');
        document.body.style.overflow = 'hidden';
        _updateLbUI();
        // Init swipe
        _lbStartX = 0; _lbStartY = 0; _lbSwiping = false;
    }
    function closeLightbox() {
        document.getElementById('lightbox').classList.remove('active');
        document.body.style.overflow = '';
    }
    function lightboxNav(dir) {
        if (_lbPhotos.length <= 1) return;
        _lbIndex = (_lbIndex + dir + _lbPhotos.length) % _lbPhotos.length;
        var img = document.getElementById('lightbox-img');
        img.style.opacity = '0';
        setTimeout(function() {
            img.src = _lbPhotos[_lbIndex];
            img.style.opacity = '1';
            img.style.transform = '';
        }, 150);
        _updateLbUI();
    }
    function _updateLbUI() {
        var counter = document.getElementById('lb-counter');
        var prev = document.getElementById('lb-prev');
        var next = document.getElementById('lb-next');
        if (_lbPhotos.length > 1) {
            counter.style.display = '';
            counter.innerText = (_lbIndex + 1) + ' / ' + _lbPhotos.length;
            if (prev) prev.style.display = '';
            if (next) next.style.display = '';
        } else {
            counter.style.display = 'none';
            if (prev) prev.style.display = 'none';
            if (next) next.style.display = 'none';
        }
    }
    function downloadLightboxImage() {
        var src = _lbPhotos[_lbIndex];
        if (!src) return;
        var a = document.createElement('a');
        a.href = src; a.download = 'musubi_photo_' + Date.now() + '.jpg';
        a.target = '_blank'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    // Swipe support for lightbox
    var _lbStartX = 0, _lbStartY = 0, _lbSwiping = false;
    (function() {
        var wrap = document.getElementById('lightbox-img-wrap');
        if (!wrap) return;
        wrap.addEventListener('touchstart', function(e) {
            if (e.touches.length === 1) {
                _lbStartX = e.touches[0].clientX;
                _lbStartY = e.touches[0].clientY;
                _lbSwiping = true;
            }
        }, { passive: true });
        wrap.addEventListener('touchend', function(e) {
            if (!_lbSwiping) return;
            _lbSwiping = false;
            var endX = e.changedTouches[0].clientX;
            var endY = e.changedTouches[0].clientY;
            var dx = endX - _lbStartX;
            var dy = endY - _lbStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                // Horizontal swipe
                if (dx < 0) lightboxNav(1); else lightboxNav(-1);
            } else if (dy > 80) {
                // Swipe down to close
                closeLightbox();
            }
        }, { passive: true });
        // Tap on background to close (but not on img/buttons)
        wrap.addEventListener('click', function(e) {
            if (e.target === wrap) closeLightbox();
        });
    })();
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeLightbox();
            closeConfirm(false);
        }
        if (document.getElementById('lightbox').classList.contains('active')) {
            if (e.key === 'ArrowLeft') lightboxNav(-1);
            if (e.key === 'ArrowRight') lightboxNav(1);
        }
    });

    // ===== STATS CARD =====
    function updateStats() {
        if (!currentUser || !currentUser.coupleId) return;
        db.collection('entries').where('coupleId', '==', currentUser.coupleId).get().then(snap => {
            let totalEntries = 0, totalPhotos = 0, totalVoice = 0;
            const uniqueDays = new Set();
            snap.forEach(doc => {
                const d = doc.data();
                totalEntries++;
                if (d.image) totalPhotos++;
                if (d.audio) totalVoice++;
                if (d.timestamp) {
                    const date = new Date(d.timestamp);
                    uniqueDays.add(date.toDateString());
                }
            });
            const statsHtml = `
                <div class="stats-card">
                    <div class="stats-row">
                        <div class="stat-item"><div class="stat-num">${totalEntries}</div><div class="stat-label">Entries</div></div>
                        <div class="stat-item"><div class="stat-num">${totalPhotos}</div><div class="stat-label">Photos</div></div>
                        <div class="stat-item"><div class="stat-num">${totalVoice}</div><div class="stat-label">Voice Notes</div></div>
                        <div class="stat-item"><div class="stat-num">${uniqueDays.size}</div><div class="stat-label">Active Days</div></div>
                    </div>
                </div>`;
            // Insert stats after profile section
            const existing = document.getElementById('diary-stats-card');
            if (existing) existing.outerHTML = statsHtml.replace('<div class="stats-card">', '<div class="stats-card" id="diary-stats-card">');
            else {
                const settingsSection = document.querySelector('#view-settings .settings-section');
                if (settingsSection) {
                    const card = document.createElement('div');
                    card.innerHTML = statsHtml.replace('<div class="stats-card">', '<div class="stats-card" id="diary-stats-card">');
                    settingsSection.after(card.firstElementChild);
                }
            }
        });
    }

    // ===== SEARCH DEBOUNCE =====
    let searchTimeout = null;
    const searchInput = document.getElementById('entry-search');
    if (searchInput) {
        searchInput.removeAttribute('onkeyup');
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => filterEntries(this.value), 250);
        });
    }

    // ===== SONG ATTACHMENT TO DIARY =====
    function openSongPicker() {
        document.getElementById('song-picker-overlay').classList.add('active');
        document.getElementById('song-picker-input').value = '';
        window._songPickerItems = [];
        setTimeout(() => document.getElementById('song-picker-input').focus(), 300);
        // Show recently played as suggestions
        const results = document.getElementById('song-picker-results');
        try {
            const recent = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
            if (recent.length > 0) {
                let html = '<div style="font-size:12px; font-weight:700; color:var(--text-sub); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; padding:4px 0;">Recently Played</div>';
                recent.slice(0, 10).forEach(song => {
                    html += buildSongPickItem(song);
                });
                results.innerHTML = html;
            }
        } catch(e) {}
    }
    function closeSongPicker() { document.getElementById('song-picker-overlay').classList.remove('active'); }

    async function searchSongPicker() {
        const q = document.getElementById('song-picker-input').value.trim();
        if (!q) return;
        const results = document.getElementById('song-picker-results');
        results.innerHTML = '<div style="text-align:center;padding:30px;"><div class="spinner"></div><p style="margin-top:10px;color:var(--text-sub);font-size:12px;">Searching...</p></div>';
        window._songPickerItems = [];
        try {
            const songs = await ytSearch(q + ' song', 12);
            results.innerHTML = '';
            if (songs.length === 0) { results.innerHTML = '<p style="text-align:center;padding:30px;color:var(--text-sub);">No results</p>'; return; }
            songs.forEach(song => { results.innerHTML += buildSongPickItem(song); });
        } catch(err) { results.innerHTML = '<p style="text-align:center;padding:30px;color:#FF3B30;">Search failed</p>'; }
    }

    function buildSongPickItem(song) {
        const idx = window._songPickerItems ? window._songPickerItems.length : 0;
        if (!window._songPickerItems) window._songPickerItems = [];
        window._songPickerItems.push(song);
        return `<div class="song-pick-item" onclick="attachSongToEntry(window._songPickerItems[${idx}])">
            <img src="${song.thumbnail}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23374151%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 text-anchor=%22middle%22 fill=%22%239CA3AF%22 font-size=%2240%22%3E%E2%99%AA%3C/text%3E%3C/svg%3E'">
            <div class="spi-info"><div class="spi-title">${escapeHTML(song.title)}</div><div class="spi-artist">${escapeHTML(song.channelTitle)}</div></div>
            <i class="fas fa-plus-circle spi-add"></i>
        </div>`;
    }

    let snippetSong = null;
    let snippetPreviewInterval = null;
    let snippetIsPlaying = false;
    let snippetMaxTime = 0;
    let prevSongState = null;

    function attachSongToEntry(song) {
        snippetSong = song;
        document.getElementById('song-snippet-thumb').src = song.thumbnail;
        document.getElementById('song-snippet-title').innerText = song.title;
        document.getElementById('song-snippet-artist').innerText = song.channelTitle;
        document.getElementById('song-snippet-slider').value = 0;
        document.getElementById('song-snippet-time').innerText = '0:00';
        document.getElementById('song-snippet-play').innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        document.getElementById('song-picker-overlay').classList.remove('active');
        document.getElementById('song-snippet-overlay').classList.add('active');

        // Save global player state
        if (currentSong) {
            prevSongState = {
                song: currentSong,
                time: ytPlayer && typeof ytPlayer.getCurrentTime === 'function' ? ytPlayer.getCurrentTime() : 0,
                wasPlaying: isMusicPlaying
            };
        }
        
        if (isMusicPlaying) togglePlayPause();

        ensureYTReady().then(() => {
            isPreviewingSnippet = true;
            ytPlayer.mute();
            ytPlayer.cueVideoById(song.videoId);
            ytPlayer.playVideo();
            
            let checks = 0;
            const checkDuration = setInterval(() => {
                checks++;
                const dur = ytPlayer.getDuration();
                if (dur > 0) {
                    clearInterval(checkDuration);
                    ytPlayer.pauseVideo();
                    ytPlayer.unMute();
                    ytPlayer.seekTo(0, true);
                    snippetMaxTime = dur;
                    document.getElementById('song-snippet-slider').max = Math.max(0, dur - 15);
                    document.getElementById('song-snippet-play').innerHTML = '<i class="fas fa-play"></i>';
                } else if (checks > 20) {
                    clearInterval(checkDuration);
                    showToast('Could not load song duration', 'error');
                    closeSongSnippet();
                }
            }, 500);
        });
    }

    function closeSongSnippet() {
        document.getElementById('song-snippet-overlay').classList.remove('active');
        if (snippetIsPlaying) toggleSnippetPreview();
        snippetSong = null;
        isPreviewingSnippet = false;
        try { ytPlayer.pauseVideo(); } catch(e) {}
        
        // Restore global player state
        if (prevSongState && prevSongState.song) {
            currentSong = prevSongState.song;
            if (currentSong.startTime !== undefined) {
                ytPlayer.cueVideoById({ videoId: currentSong.videoId, startSeconds: currentSong.startTime });
            } else {
                ytPlayer.cueVideoById(currentSong.videoId);
            }
            setTimeout(() => {
                if (window.ytPlayer && typeof ytPlayer.seekTo === 'function') {
                    ytPlayer.seekTo(prevSongState.time || 0, true);
                    if (prevSongState.wasPlaying) togglePlayPause();
                }
            }, 800);
        }
        prevSongState = null;
    }

    function onSnippetSliderInput() {
        const val = parseInt(document.getElementById('song-snippet-slider').value) || 0;
        document.getElementById('song-snippet-time').innerText = fmtTime(val);
        if (snippetIsPlaying) {
            ytPlayer.seekTo(val, true);
        }
    }

    function toggleSnippetPreview() {
        if (!snippetMaxTime) return;
        if (!snippetIsPlaying) {
            const startStr = document.getElementById('song-snippet-slider').value;
            const start = parseInt(startStr) || 0;
            ytPlayer.seekTo(start, true);
            ytPlayer.playVideo();
            snippetIsPlaying = true;
            document.getElementById('song-snippet-play').innerHTML = '<i class="fas fa-pause"></i>';
            
            snippetPreviewInterval = setInterval(() => {
                const cur = ytPlayer.getCurrentTime();
                const curStart = parseInt(document.getElementById('song-snippet-slider').value) || 0;
                if (cur >= curStart + 15) {
                    toggleSnippetPreview();
                }
            }, 500);
        } else {
            ytPlayer.pauseVideo();
            snippetIsPlaying = false;
            document.getElementById('song-snippet-play').innerHTML = '<i class="fas fa-play"></i>';
            if (snippetPreviewInterval) clearInterval(snippetPreviewInterval);
        }
    }

    function confirmSongSnippet() {
        if (!snippetSong) return;
        const start = parseInt(document.getElementById('song-snippet-slider').value) || 0;
        entrySongData = {
            ...snippetSong,
            startTime: start,
            customDuration: 15
        };
        
        document.getElementById('song-attach-thumb').src = entrySongData.thumbnail;
        document.getElementById('song-attach-title').innerText = entrySongData.title;
        document.getElementById('song-attach-artist').innerText = entrySongData.channelTitle;
        document.getElementById('song-attach-preview').classList.add('active');
        
        const existInd = document.getElementById('song-attach-indicator');
        if (existInd) existInd.remove();
        const ind = document.createElement('div');
        ind.id = 'song-attach-indicator';
        ind.style.cssText = 'position:absolute; top:4px; right:4px; margin-top:-8px; margin-right:-8px; background:rgba(0,0,0,0.6); color:#fff; font-size:9px; padding:2px 6px; border-radius:10px; font-weight:700; border:1px solid rgba(255,255,255,0.2); pointer-events:none; z-index:2; line-height:1.2;';
        ind.innerHTML = '<i class="fas fa-cut" style="margin-right:3px;"></i>15s';
        
        const songPreviewEl = document.getElementById('song-attach-preview');
        songPreviewEl.style.position = 'relative';
        songPreviewEl.appendChild(ind);
        
        closeSongSnippet();
        showToast('15s Snippet attached! 🎵', 'success', 2000);
    }

    function clearAttachedSong() {
        entrySongData = null;
        document.getElementById('song-attach-preview').classList.remove('active');
    }

    function previewAttachedSong() {
        if (entrySongData) playSong(entrySongData);
    }

    // ===== DIARY DATE DISPLAY =====
    function updateDiaryDate() {
        const el = document.getElementById('diary-current-date');
        if (el) {
            const ist = getIST();
            el.innerText = ist.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }
    }

    // Update switchTab to include diary date and settings stats
    const origSwitchTab = switchTab;
    switchTab = function(name) {
        origSwitchTab(name);
        if (name === 'diary') updateDiaryDate();
        if (name === 'settings') updateStats();
    };

    // ===== ENTRY EDITING =====
    let editingEntryId = null;
    function editEntry(id, title, content, mood) {
        editingEntryId = id;
        switchTab('diary');
        document.getElementById('entry-title').value = title || '';
        document.getElementById('entry-content').value = content || '';
        updateWordCount();
        // Set mood
        const moodMap = { 'sun': 0, 'cloud': 1, 'rain': 2 };
        const idx = moodMap[mood] || 0;
        const moodBtns = document.querySelectorAll('.mood-opt');
        moodBtns.forEach(b => b.classList.remove('selected'));
        if (moodBtns[idx]) { moodBtns[idx].classList.add('selected'); currentMood = mood || 'sun'; }
        // Update save button to show "Update"
        const saveBtn = document.getElementById('save-entry-btn');
        saveBtn.innerHTML = '<i class="fas fa-pen"></i> UPDATE ENTRY';
        closeModal();
    }

    // Override save to handle editing
    const origSaveEntry = saveEntry;
    saveEntry = function() {
        if (editingEntryId) {
            const t = document.getElementById('entry-title').value;
            const c = document.getElementById('entry-content').value;
            if (!t && !c) return showToast("Add some content!", "warning");
            
            const saveBtn = document.getElementById('save-entry-btn');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...'; }
            
            const updates = { title: t || 'Untitled', content: c || '', mood: currentMood };
            if (entryImageData) updates.image = entryImageData;
            if (entryAudioData) updates.audio = entryAudioData;
            if (entrySongData) updates.song = entrySongData;
            
            db.collection('entries').doc(editingEntryId).update(updates).then(() => {
                document.getElementById('entry-title').value = '';
                document.getElementById('entry-content').value = '';
                document.getElementById('img-preview-box').style.display = 'none';
                entryImageData = null; clearAudio(); clearAttachedSong();
                editingEntryId = null;
                if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-paper-plane"></i> SAVE TO TIMELINE'; }
                switchTab('entries');
                showToast("Entry updated ✨", "success");
            }).catch(err => {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-pen"></i> UPDATE ENTRY'; }
                showToast("Failed to update", "error");
            });
            return;
        }
        origSaveEntry();
    };

    // ===== GALLERY LIGHTBOX INTEGRATION =====
    // Override gallery item clicks to show lightbox with navigation
    document.addEventListener('click', e => {
        const galleryItem = e.target.closest('.gallery-item img');
        if (galleryItem && e.target.closest('#gallery-container')) {
            e.stopPropagation();
            e.preventDefault();
            // Collect all gallery photos for navigation
            var allImgs = Array.from(document.querySelectorAll('#gallery-container .gallery-item img'));
            var photos = allImgs.map(function(img) { return img.src; });
            var idx = allImgs.indexOf(galleryItem);
            openLightbox(galleryItem.src, photos, idx >= 0 ? idx : 0);
        }
    }, true);

    // ===== ADD EDIT BUTTON TO ENTRY READER =====
    const sheetHeader = document.querySelector('#read-modal .sheet-header');
    if (sheetHeader) {
        const editBtn = document.createElement('button');
        editBtn.style.cssText = 'color:var(--theme-color); border:none; background:none; font-size:16px; cursor:pointer; padding:4px 8px;';
        editBtn.innerHTML = '<i class="fas fa-pen-to-square"></i>';
        editBtn.onclick = function() {
            if (!openEntryId) return;
            db.collection('entries').doc(openEntryId).get().then(doc => {
                const e = doc.data();
                editEntry(openEntryId, e.title, e.content, e.mood);
            });
        };
        const firstSpan = sheetHeader.querySelector('span');
        if (firstSpan) sheetHeader.replaceChild(editBtn, firstSpan);
        else sheetHeader.insertBefore(editBtn, sheetHeader.firstChild);
    }

    // ===== VERSION INFO =====
    const APP_VERSION = '1.0.0';
    document.addEventListener('DOMContentLoaded', () => {
        const settings = document.getElementById('view-settings');
        if (settings) {
            const versionDiv = document.createElement('div');
            versionDiv.style.cssText = 'text-align:center; padding:20px 0 40px; color:var(--text-muted); font-size:11px;';
            versionDiv.innerHTML = `
                <div style="font-family:var(--font-serif); font-size:14px; margin-bottom:4px; opacity:0.6;">結び Diary</div>
                <div>Version ${APP_VERSION}</div>
                <div style="margin-top:4px;">Made with ❤️ inspired by Your Name</div>
                <div style="margin-top:2px; font-size:10px; opacity:0.5;">© ${new Date().getFullYear()} Musubi Diary</div>
            `;
            settings.appendChild(versionDiv);
        }
    });

    // ===== KEYBOARD SHORTCUTS (DESKTOP) =====
    document.addEventListener('keydown', e => {
        // Don't handle shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.altKey) {
            switch(e.key) {
                case '1': e.preventDefault(); switchTab('entries'); break;
                case '2': e.preventDefault(); switchTab('calendar'); break;
                case '3': e.preventDefault(); switchTab('gallery'); break;
                case '4': e.preventDefault(); switchTab('music'); break;
                case '5': e.preventDefault(); switchTab('diary'); break;
                case '6': e.preventDefault(); switchTab('settings'); break;
            }
        }
        if (e.key === ' ' && currentSong && document.getElementById('full-player').classList.contains('active')) {
            e.preventDefault(); togglePlayPause();
        }
    });

    // ===== LAZY LOAD ENTRY IMAGES =====
    if ('IntersectionObserver' in window) {
        const imgObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                    img.classList.add('loaded');
                    imgObserver.unobserve(img);
                }
            });
        }, { rootMargin: '100px' });

        // Observe entry images as they're added
        const entryListObserver = new MutationObserver(mutations => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        const imgs = node.querySelectorAll ? node.querySelectorAll('.entry-img-attached') : [];
                        imgs.forEach(img => imgObserver.observe(img));
                    }
                });
            });
        });
        const entryList = document.getElementById('entry-list');
        if (entryList) entryListObserver.observe(entryList, { childList: true, subtree: true });
    }

    // ===== EMPTY STATE ENHANCEMENT =====
    // Improve the empty entries state
    const origLoadEntries = loadEntries;
    loadEntries = function() {
        origLoadEntries();
    };
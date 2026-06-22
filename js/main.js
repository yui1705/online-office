document.addEventListener('DOMContentLoaded', () => {
    const refreshIcons = () => {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    };

    refreshIcons();

    let appData = null;
    let currentSection = 'home';
    let searchTerm = '';
    let majorSchedules = [];
    let academicSchedules = [];
    let academicScheduleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let todayClassChanges = [];
    let todayMeals = [];
    let todayWeather = null;
    let visitorCounts = null;
    let scheduleLoadState = 'idle';
    let academicScheduleLoadState = 'idle';
    let classChangeLoadState = 'idle';
    let mealLoadState = 'idle';
    let weatherLoadState = 'idle';
    let renderRequestId = 0;
    let editingNoticeId = null;
    let editingLinkId = null;
    let editingDocumentId = null;
    let selectedDocumentFile = null;
    if (
        window.firebase &&
        typeof window.firebase.initializeApp === 'function' &&
        Array.isArray(window.firebase.apps) &&
        window.firebase.apps.length === 0 &&
        window.HYOAM_FIREBASE_CONFIG
    ) {
        window.firebase.initializeApp(window.HYOAM_FIREBASE_CONFIG);
    }

    // Firestore Instance (initialized via init.js or local config)
    const hasFirestore = Boolean(
        window.firebase &&
        typeof window.firebase.firestore === 'function' &&
        Array.isArray(window.firebase.apps) &&
        window.firebase.apps.length > 0
    );
    const db = hasFirestore ? window.firebase.firestore() : null;

    // Firestore Collections
    const COLL_LINKS = 'shared-links';
    const COLL_NOTICES = 'department-notices';
    const COLL_DOCUMENTS = 'work-documents';
    const COLL_DELETED = 'deleted-item-ids';
    const COLL_SETTINGS = 'site-settings';
    const VISITOR_COUNTS_DOC = 'visitor-counts';
    const SPECIAL_ROOM_NAMES_DOC = 'special-room-names';
    const SPECIAL_ROOM_RESERVATIONS_DOC = 'special-room-reservations';
    const VISITOR_COUNTED_DATE_KEY = 'hyoam-visitor-counted-date';
    const SPECIAL_ROOM_STORAGE_KEY = 'hyoam-special-room-reservations';
    const SPECIAL_ROOM_NAMES_KEY = 'hyoam-special-room-names';
    const SPECIAL_ROOM_WEEK_KEY = 'hyoam-special-room-week';

    // Real-time Data State
    let firestoreLinks = [];
    let firestoreNotices = [];
    let firestoreDocs = [];
    let firestoreDeletedIds = {
        [COLL_LINKS]: [],
        [COLL_NOTICES]: [],
        [COLL_DOCUMENTS]: []
    };
    let firestoreSpecialRoomNames = null;
    let specialRoomNamesSaveTimer = null;
    let firestoreSpecialRoomReservations = null;
    let firestoreSpecialRoomReservationsWeek = null;
    let specialRoomReservationsSaveTimer = null;

    const contentArea = document.getElementById('content-area');
    const navItems = document.querySelectorAll('.sidebar-nav li');
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const dateDisplay = document.getElementById('current-date');
    const globalSearch = document.getElementById('global-search');
    const visitorCounter = document.getElementById('visitor-counter');
    const visitorToday = document.getElementById('visitor-today');
    const visitorTotal = document.getElementById('visitor-total');

    const updateDate = () => {
        const now = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
        dateDisplay.textContent = now.toLocaleDateString('ko-KR', options);
    };

    const formatVisitorCount = (value) => Number(value || 0).toLocaleString('ko-KR');

    const renderVisitorCounter = () => {
        if (!visitorCounter || !visitorToday || !visitorTotal) return;

        if (!db || !visitorCounts) {
            visitorCounter.hidden = true;
            return;
        }

        visitorToday.textContent = `\uC624\uB298 ${formatVisitorCount(visitorCounts.today)}\uBA85`;
        visitorTotal.textContent = `\uC804\uCCB4 ${formatVisitorCount(visitorCounts.total)}\uBA85`;
        visitorCounter.hidden = false;
        refreshIcons();
    };

    const recordVisitorVisit = async () => {
        if (!db) {
            renderVisitorCounter();
            return;
        }

        const todayKey = getLocalDateKey(new Date());
        try {
            if (localStorage.getItem(VISITOR_COUNTED_DATE_KEY) === todayKey) return;
        } catch {
            // Continue without local duplicate protection if storage is unavailable.
        }

        const ref = db.collection(COLL_SETTINGS).doc(VISITOR_COUNTS_DOC);

        try {
            await db.runTransaction(async transaction => {
                const snapshot = await transaction.get(ref);
                const data = snapshot.exists ? snapshot.data() : {};
                const storedTodayKey = String(data.todayKey || '');
                const currentTotal = Number(data.total || 0);
                const currentToday = storedTodayKey === todayKey ? Number(data.today || 0) : 0;

                transaction.set(ref, {
                    total: currentTotal + 1,
                    today: currentToday + 1,
                    todayKey,
                    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });

            try {
                localStorage.setItem(VISITOR_COUNTED_DATE_KEY, todayKey);
            } catch {
                // Ignore storage failures after the visit is recorded.
            }
        } catch (error) {
            console.error('Visitor count update error:', error);
        }
    };

    // Firestore Data Helpers
    const getDeletedIds = (collectionName) => firestoreDeletedIds[collectionName] || [];

    const saveDeletedId = async (collectionName, id) => {
        if (!db) return;

        try {
            await db.collection(COLL_DELETED).doc(`${collectionName}_${id}`).set({
                collection: collectionName,
                targetId: String(id),
                deletedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Firestore delete record error:', error);
        }
    };

    const restoreDeletedId = async (collectionName, id) => {
        if (!db) return;

        try {
            await db.collection(COLL_DELETED).doc(`${collectionName}_${id}`).delete();
        } catch (error) {
            console.error('Firestore restore record error:', error);
        }
    };

    const normalize = (value) => String(value || '').toLowerCase();

    const createShortcut = () => {
        const url = window.location.origin;
        const title = '효암고 온라인 교무실';
        // Internet Shortcut (.url) format for Windows
        const content = `[InternetShortcut]\r\nURL=${url}\r\nIDList=\r\nHotKey=0\r\nIconFile=${url}/hyoam-office.ico\r\nIconIndex=0\r\n`;
        const blob = new Blob([content], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${title}.url`;
        link.click();
        URL.revokeObjectURL(link.href);

        alert('바로가기 파일을 다운로드했습니다. 다운로드 폴더에서 바탕화면으로 옮겨 사용해 주세요.');
    };

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#create-shortcut');
        if (btn) createShortcut();
    });

    const matchesSearch = (...values) => {
        if (!searchTerm) return true;
        return values.some(value => normalize(value).includes(searchTerm));
    };

    const getGoogleLinkType = (url) => {
        if (url.includes('/spreadsheets/')) return 'sheet';
        if (url.includes('/document/')) return 'doc';
        if (url.includes('/presentation/')) return 'slide';
        if (url.includes('/forms/')) return 'form';
        return 'link';
    };

    const getLinkIcon = (type) => {
        const icons = {
            sheet: 'table-2',
            doc: 'file-text',
            slide: 'presentation',
            form: 'list-checks',
            link: 'external-link'
        };
        return icons[type] || icons.link;
    };

        const getLinkTypeLabel = (type) => {
        const labels = {
            sheet: '구글 시트',
            doc: '구글 문서',
            slide: '구글 슬라이드',
            form: '구글 설문',
            link: '공유 링크'
        };
        return labels[type] || labels.link;
    };

    const formatDateInput = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    };

    const formatLocalDate = (date) => {
        const raw = formatDateInput(date);
        return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    };

    const formatDisplayDate = (yyyymmdd) => {
        const year = yyyymmdd.slice(0, 4);
        const month = yyyymmdd.slice(4, 6);
        const day = yyyymmdd.slice(6, 8);
        const date = new Date(`${year}-${month}-${day}T00:00:00`);
        const weekday = date.toLocaleDateString('ko-KR', { weekday: 'short' });
        return `${Number(month)}.${Number(day)}(${weekday})`;
    };

    const formatHeaderDate = (date) => {
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const weekday = date.toLocaleDateString('ko-KR', { weekday: 'short' });
        return `${month}/${day}(${weekday})`;
    };

    const formatMonthTitle = (date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`;

    const getMonthRange = (date) => {
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        return { start, end };
    };

    const getAcademicScheduleApiUrl = (fromDate, toDate, withTimestamp = false) => {
        if (!appData?.scheduleSource) return '';

        const params = new URLSearchParams({
            Type: 'json',
            pIndex: '1',
            pSize: '100',
            ATPT_OFCDC_SC_CODE: appData.scheduleSource.officeCode,
            SD_SCHUL_CODE: appData.scheduleSource.schoolCode,
            AA_FROM_YMD: formatDateInput(fromDate),
            AA_TO_YMD: formatDateInput(toDate)
        });

        if (withTimestamp) {
            params.set('_ts', String(Date.now()));
        }

        return `https://open.neis.go.kr/hub/SchoolSchedule?${params.toString()}`;
    };

    const normalizeSheetDate = (value, baseYear = new Date().getFullYear()) => {
        const raw = String(value || '').trim();
        if (!raw) return '';

        const googleDate = raw.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
        if (googleDate) {
            const [, year, zeroBasedMonth, day] = googleDate;
            return `${year}${String(Number(zeroBasedMonth) + 1).padStart(2, '0')}${String(Number(day)).padStart(2, '0')}`;
        }

        const normalized = raw
            .replace(/[년월.-]/g, '/')
            .replace(/일/g, '')
            .replace(/\s+/g, '')
            .replace(/\/+/g, '/');
        const parts = normalized.split('/').filter(Boolean);

        if (parts.length >= 3) {
            const [year, month, day] = parts;
            return `${String(year).padStart(4, '20')}${String(Number(month)).padStart(2, '0')}${String(Number(day)).padStart(2, '0')}`;
        }

        if (parts.length === 2) {
            const [month, day] = parts;
            return `${baseYear}${String(Number(month)).padStart(2, '0')}${String(Number(day)).padStart(2, '0')}`;
        }

        return '';
    };


        const getGradeLabel = (schedule) => {
        const grades = [
            schedule.ONE_GRADE_EVENT_YN === 'Y' ? '1학년' : '',
            schedule.TW_GRADE_EVENT_YN === 'Y' ? '2학년' : '',
            schedule.THREE_GRADE_EVENT_YN === 'Y' ? '3학년' : ''
        ].filter(Boolean);

        return grades.length === 3 ? '전학년' : grades.join(', ');
    };

    const isImportantSchedule = (schedule) => {
        const eventName = schedule.EVENT_NM || '';
        return !['토요휴업일'].includes(eventName);
    };

    const cleanMealDishes = (dishText) => String(dishText || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .split(/\n+/)
        .map(item => item.trim().replace(/\s*\((?:[\d.]+)\)\s*$/g, ''))
        .filter(Boolean);

    const getMealOrder = (mealName) => ({
        '조식': 1,
        '중식': 2,
        '석식': 3
    }[mealName] || 9);

    const getWeatherMood = (code) => {
        if (code === 0) return { icon: 'sun', label: '\uB9D1\uC74C', tone: 'sunny' };
        if ([1, 2, 3].includes(code)) return { icon: 'cloud-sun', label: '\uAD6C\uB984 \uC870\uAE08', tone: 'cloudy' };
        if ([45, 48].includes(code)) return { icon: 'cloud-fog', label: '\uC548\uAC1C', tone: 'foggy' };
        if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) return { icon: 'cloud-rain', label: '\uBE44', tone: 'rainy' };
        if ([66, 67, 71, 73, 75, 77, 85, 86].includes(code)) return { icon: 'cloud-snow', label: '\uB208', tone: 'snowy' };
        if ([95, 96, 99].includes(code)) return { icon: 'cloud-lightning', label: '\uCC9C\uB465', tone: 'stormy' };
        return { icon: 'cloud-sun', label: '\uB0A0\uC528', tone: 'cloudy' };
    };

    const loadGoogleSheetJsonp = (spreadsheetId, gid) => new Promise((resolve, reject) => {
        const callbackName = `googleSheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = document.createElement('script');
        const url = new URL(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq`);
        url.searchParams.set('tqx', `responseHandler:${callbackName}`);
        url.searchParams.set('gid', gid);
        url.searchParams.set('headers', '1');

        window[callbackName] = (response) => {
            delete window[callbackName];
            script.remove();
            if (response.status === 'error') {
                reject(new Error(response.errors?.[0]?.detailed_message || 'Google Sheet load failed'));
                return;
            }
            resolve(response.table);
        };

        script.onerror = () => {
            delete window[callbackName];
            script.remove();
            reject(new Error('Google Sheet script load failed'));
        };

        script.src = url.toString();
        document.body.appendChild(script);
    });

    const getCellValue = (row, index) => row.c?.[index]?.f || row.c?.[index]?.v || '';

    const parseClassChanges = (table) => {
        const targetDate = formatDateInput(new Date());
        const changes = [];
        let activeDate = '';

        table.rows.forEach(row => {
            const dateValue = getCellValue(row, 0);
            const name = String(getCellValue(row, 1)).trim();
            const content = String(getCellValue(row, 2)).trim();
            const normalizedDate = normalizeSheetDate(dateValue);
            if (normalizedDate) activeDate = normalizedDate === targetDate ? normalizedDate : '';
            if (!content || activeDate !== targetDate) return;

            content.split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach(line => {
                const period = line.match(/(\d+)교시/)?.[1] || '';
                let type = '대강';
                if (line.includes('교체')) {
                    type = '교체';
                } else if (line.includes('대강')) {
                    type = '대강';
                } else if (line.includes('->')) {
                    type = '교체';
                }
                changes.push({
                    date: activeDate,
                    dateKey: activeDate,
                    name,
                    line,
                    period: period ? `${period}교시` : '',
                    type
                });
            });
        });

        return changes;
    };

    const escapeHtml = (value) => String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    const isValidUrl = (value) => {
        try {
            const url = new URL(value);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    };

    const createId = () => window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : String(Date.now());

    const openDocumentDb = () => new Promise((resolve, reject) => {
        const request = indexedDB.open('hyoam-office-files', 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('files');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    const saveDocumentFile = async (id, file) => {
        const db = await openDocumentDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('files', 'readwrite');
            transaction.objectStore('files').put(file, id);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    };

    const getDocumentFile = async (id) => {
        const db = await openDocumentDb();
        return new Promise((resolve, reject) => {
            const request = db.transaction('files', 'readonly').objectStore('files').get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

        const getBaseSharedLinks = () => [
        ...(appData?.teacherOnlyLinks?.departmentLinks || []),
        ...(appData?.googleSheets || [])
    ];

    const getBaseNotices = () => [
        ...(appData?.adminEditableData?.notices || []),
        ...(appData?.notices || [])
    ];

    const getBaseDocuments = () => [
        ...(appData?.adminEditableData?.forms || []),
        ...(appData?.documents || [])
    ];

    const getQuickLinks = () => [
        ...(appData?.teacherOnlyLinks?.quickLinks || []),
        ...(appData?.quickLinks || []),
        ...(appData?.publicLinks || [])
    ];

    const getAllSharedLinks = () => {
        const deletedIds = getDeletedIds(COLL_LINKS);
        const baseLinks = getBaseSharedLinks()
            .filter(link => !deletedIds.includes(String(link.id)))
            .map(link => ({ ...link, isLocal: false }));
        return [...firestoreLinks, ...baseLinks];
    };

    const getAllNotices = () => {
        const deletedIds = getDeletedIds(COLL_NOTICES);
        const baseNotices = getBaseNotices()
            .filter(notice => !deletedIds.includes(String(notice.id)))
            .map(notice => ({ ...notice, isLocal: false }));
        return [...firestoreNotices, ...baseNotices];
    };

    const getAllDocuments = () => {
        const deletedIds = getDeletedIds(COLL_DOCUMENTS);
        const baseDocuments = getBaseDocuments()
            .filter(doc => !deletedIds.includes(String(doc.id)))
            .map(doc => ({ ...doc, isLocal: false }));
        return [...firestoreDocs, ...baseDocuments];
    };

    const getDefaultSpecialRoomNames = () => ['특별실1', '특별실2', '특별실3', '특별실4', '특별실5', '특별실6'];

    const normalizeSpecialRoomNames = (names) => {
        const defaults = getDefaultSpecialRoomNames();

        return defaults.map((name, index) => String(names?.[index] || name));
    };

    const getSpecialRoomNames = () => {
        if (Array.isArray(firestoreSpecialRoomNames)) {
            return normalizeSpecialRoomNames(firestoreSpecialRoomNames);
        }

        try {
            const names = JSON.parse(localStorage.getItem(SPECIAL_ROOM_NAMES_KEY) || '[]');
            return normalizeSpecialRoomNames(names);
        } catch {
            return getDefaultSpecialRoomNames();
        }
    };

    const saveSpecialRoomNames = (names) => {
        try {
            localStorage.setItem(SPECIAL_ROOM_NAMES_KEY, JSON.stringify(names));
        } catch (error) {
            console.error('Special room names save error:', error);
        }
    };

    const saveSharedSpecialRoomNames = async (names, options = {}) => {
        const normalizedNames = normalizeSpecialRoomNames(names);
        saveSpecialRoomNames(normalizedNames);

        if (!db) return;

        try {
            await db.collection(COLL_SETTINGS).doc(SPECIAL_ROOM_NAMES_DOC).set({
                names: normalizedNames,
                updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error('Firestore special room names save error:', error);
            if (!options.silent) {
                alert('특별실 제목 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
            }
        }
    };

    const getLocalDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const formatSpecialRoomRangeDate = (date) => {
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const weekday = date.toLocaleDateString('ko-KR', { weekday: 'short' });
        return `${month}.${day}(${weekday})`;
    };

    const getSpecialRoomWeekRange = () => {
        const today = new Date();
        const monday = new Date(today);
        const day = today.getDay();
        const mondayOffset = day === 0 ? 1 : 1 - day;

        monday.setDate(today.getDate() + mondayOffset);
        monday.setHours(0, 0, 0, 0);

        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);

        return {
            key: getLocalDateKey(monday),
            label: `${formatSpecialRoomRangeDate(monday)} ~ ${formatSpecialRoomRangeDate(friday)}`
        };
    };

    const normalizeSpecialRoomReservations = (reservations) => {
        if (!reservations || typeof reservations !== 'object') return {};

        return Object.entries(reservations).reduce((normalized, [cellId, reservation]) => {
            if (!reservation || typeof reservation !== 'object') return normalized;

            const text = String(reservation.text || '');
            if (text.trim()) {
                normalized[cellId] = { text };
            }

            return normalized;
        }, {});
    };

    const getSpecialRoomReservations = () => {
        const { key } = getSpecialRoomWeekRange();
        if (
            firestoreSpecialRoomReservationsWeek === key &&
            firestoreSpecialRoomReservations &&
            typeof firestoreSpecialRoomReservations === 'object'
        ) {
            return normalizeSpecialRoomReservations(firestoreSpecialRoomReservations);
        }

        try {
            return normalizeSpecialRoomReservations(JSON.parse(localStorage.getItem(SPECIAL_ROOM_STORAGE_KEY) || '{}'));
        } catch {
            return {};
        }
    };

    const saveSpecialRoomReservations = (reservations) => {
        const { key } = getSpecialRoomWeekRange();
        const normalizedReservations = normalizeSpecialRoomReservations(reservations);
        firestoreSpecialRoomReservations = normalizedReservations;
        firestoreSpecialRoomReservationsWeek = key;

        try {
            localStorage.setItem(SPECIAL_ROOM_STORAGE_KEY, JSON.stringify(normalizedReservations));
        } catch (error) {
            console.error('Special room reservation save error:', error);
        }
    };

    const saveSharedSpecialRoomReservations = async (reservations, options = {}) => {
        const { key } = getSpecialRoomWeekRange();
        const normalizedReservations = normalizeSpecialRoomReservations(reservations);
        saveSpecialRoomReservations(normalizedReservations);

        if (!db) return;

        try {
            await db.collection(COLL_SETTINGS).doc(SPECIAL_ROOM_RESERVATIONS_DOC).set({
                weekKey: key,
                reservations: normalizedReservations,
                updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Firestore special room reservations save error:', error);
            if (!options.silent) {
                alert('특별실 예약 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
            }
        }
    };

    const resetSpecialRoomReservationsIfNeeded = () => {
        const { key } = getSpecialRoomWeekRange();
        const storedWeek = localStorage.getItem(SPECIAL_ROOM_WEEK_KEY);
        const isSunday = new Date().getDay() === 0;

        if ((storedWeek && storedWeek !== key) || (!storedWeek && isSunday)) {
            localStorage.removeItem(SPECIAL_ROOM_STORAGE_KEY);
        }

        localStorage.setItem(SPECIAL_ROOM_WEEK_KEY, key);
    };

    const getNoticePriority = (notice) => {
        if (notice.priority) return notice.priority;
        if (notice.isUrgent) return '긴급';
        return '일반';
    };

    const getPriorityClass = (priority) => ({
        '긴급': 'priority-urgent',
        '중요': 'priority-important',
        '일반': 'priority-normal'
    }[priority] || 'priority-normal');

    const renderPriorityBadge = (notice) => {
        const priority = getNoticePriority(notice);
        return `<span class="priority-badge ${getPriorityClass(priority)}">${escapeHtml(priority)}</span>`;
    };

    const sortByUpdatedDate = (items) => [...items].sort((a, b) =>
        String(b.updatedAt || b.date || '').localeCompare(String(a.updatedAt || a.date || ''))
    );

    const isEditingSpecialRoomField = () => (
        currentSection === 'special-room-reservations' &&
        document.activeElement instanceof HTMLElement &&
        (
            document.activeElement.classList.contains('special-room-name-input') ||
            document.activeElement.classList.contains('reservation-input')
        )
    );

    const setupFirestoreListeners = () => {
        if (!db) return Promise.resolve();

        const listenForInitialSnapshot = (ref, applySnapshot, errorLabel, shouldRender = () => !isEditingSpecialRoomField()) => new Promise(resolve => {
            let hasInitialSnapshot = false;
            const resolveInitial = () => {
                if (hasInitialSnapshot) return false;
                hasInitialSnapshot = true;
                resolve();
                return true;
            };
            const initialTimer = setTimeout(resolveInitial, 1800);
            ref.onSnapshot(snapshot => {
                applySnapshot(snapshot);
                if (resolveInitial()) {
                    clearTimeout(initialTimer);
                    return;
                }
                if (shouldRender(snapshot)) {
                    renderSection(currentSection);
                }
            }, error => {
                console.error(errorLabel, error);
                if (resolveInitial()) {
                    clearTimeout(initialTimer);
                }
            });
        });

        // Notices (Descending by date)
        const noticesReady = listenForInitialSnapshot(db.collection(COLL_NOTICES).orderBy('date', 'desc'), snapshot => {
            firestoreNotices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isLocal: true }));
        }, 'Firestore notices listener error:');

        // Shared Links
        const linksReady = listenForInitialSnapshot(db.collection(COLL_LINKS), snapshot => {
            firestoreLinks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isLocal: true }));
        }, 'Firestore links listener error:');

        // Documents
        const docsReady = listenForInitialSnapshot(db.collection(COLL_DOCUMENTS), snapshot => {
            firestoreDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isLocal: true }));
        }, 'Firestore docs listener error:');

        // Deleted IDs (Overriding base data)
        const deletedIdsReady = listenForInitialSnapshot(db.collection(COLL_DELETED), snapshot => {
            firestoreDeletedIds = {
                [COLL_LINKS]: [],
                [COLL_NOTICES]: [],
                [COLL_DOCUMENTS]: []
            };
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (firestoreDeletedIds[data.collection]) {
                    firestoreDeletedIds[data.collection].push(String(data.targetId));
                }
            });
        }, 'Firestore deleted-ids listener error:');

        const visitorCountsReady = listenForInitialSnapshot(db.collection(COLL_SETTINGS).doc(VISITOR_COUNTS_DOC), snapshot => {
            const data = snapshot.exists ? snapshot.data() : {};
            const todayKey = getLocalDateKey(new Date());
            visitorCounts = {
                total: Number(data.total || 0),
                today: String(data.todayKey || '') === todayKey ? Number(data.today || 0) : 0,
                todayKey: String(data.todayKey || '')
            };
            renderVisitorCounter();
        }, 'Firestore visitor counts listener error:', () => false);

        const specialRoomNamesReady = listenForInitialSnapshot(db.collection(COLL_SETTINGS).doc(SPECIAL_ROOM_NAMES_DOC), snapshot => {
            if (isEditingSpecialRoomField()) return;

            const data = snapshot.exists ? snapshot.data() : {};
            firestoreSpecialRoomNames = Array.isArray(data.names) ? data.names : null;
            if (firestoreSpecialRoomNames) {
                saveSpecialRoomNames(firestoreSpecialRoomNames);
            }
        }, 'Firestore special room names listener error:', snapshot => (
            !isEditingSpecialRoomField() &&
            !snapshot.metadata.hasPendingWrites
        ));

        const specialRoomReservationsReady = listenForInitialSnapshot(db.collection(COLL_SETTINGS).doc(SPECIAL_ROOM_RESERVATIONS_DOC), snapshot => {
            if (isEditingSpecialRoomField()) return;

            const data = snapshot.exists ? snapshot.data() : {};
            const { key } = getSpecialRoomWeekRange();
            firestoreSpecialRoomReservationsWeek = String(data.weekKey || '');
            firestoreSpecialRoomReservations = firestoreSpecialRoomReservationsWeek === key
                ? normalizeSpecialRoomReservations(data.reservations)
                : null;
            if (firestoreSpecialRoomReservations) {
                saveSpecialRoomReservations(firestoreSpecialRoomReservations);
                localStorage.setItem(SPECIAL_ROOM_WEEK_KEY, key);
            }
        }, 'Firestore special room reservations listener error:', snapshot => (
            !isEditingSpecialRoomField() &&
            !snapshot.metadata.hasPendingWrites
        ));

        return Promise.all([
            noticesReady,
            linksReady,
            docsReady,
            deletedIdsReady,
            visitorCountsReady,
            specialRoomNamesReady,
            specialRoomReservationsReady
        ]);
    };

    const fetchSchoolSchedules = async (fromDate, toDate) => {
        if (!appData?.scheduleSource) return;

        const response = await fetch(getAcademicScheduleApiUrl(fromDate, toDate, true), {
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('Schedule response was not ok');

        const data = await response.json();
        return data.SchoolSchedule?.[1]?.row || [];
    };

    const fetchSchoolSchedulesInChunks = async (fromDate, toDate, chunkDays = 5) => {
        const requests = [];
        const cursor = new Date(fromDate);

        while (cursor <= toDate) {
            const chunkStart = new Date(cursor);
            const chunkEnd = new Date(cursor);
            chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
            if (chunkEnd > toDate) {
                chunkEnd.setTime(toDate.getTime());
            }

            requests.push(fetchSchoolSchedules(chunkStart, chunkEnd));
            cursor.setDate(cursor.getDate() + chunkDays);
        }

        const chunks = await Promise.all(requests);
        const seen = new Set();

        return chunks.flat().filter(row => {
            const key = [
                row.AA_YMD,
                row.EVENT_NM,
                row.ONE_GRADE_EVENT_YN,
                row.TW_GRADE_EVENT_YN,
                row.THREE_GRADE_EVENT_YN
            ].join('|');

            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };

    const mapAcademicSchedule = (row) => ({
        date: row.AA_YMD,
        title: row.EVENT_NM,
        type: row.SBTR_DD_SC_NM || '학사일정',
        grades: getGradeLabel(row),
        sourceLoadedAt: row.LOAD_DTM
    });

    const fetchMajorSchedules = async () => {
        if (!appData?.scheduleSource) return;

        scheduleLoadState = 'loading';
        const today = new Date();
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 60);

        try {
            const rows = await fetchSchoolSchedulesInChunks(today, endDate);
            majorSchedules = rows
                .filter(isImportantSchedule)
                .map(mapAcademicSchedule)
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(0, 8);
            scheduleLoadState = 'loaded';
        } catch (error) {
            console.error('Schedule fetch error:', error);
            scheduleLoadState = 'failed';
            majorSchedules = [];
        }
    };

    const fetchAcademicSchedules = async () => {
        if (!appData?.scheduleSource) return;

        academicScheduleLoadState = 'loading';
        const { start, end } = getMonthRange(academicScheduleMonth);

        try {
            const rows = await fetchSchoolSchedulesInChunks(start, end);
            academicSchedules = rows
                .filter(isImportantSchedule)
                .map(mapAcademicSchedule)
                .sort((a, b) => a.date.localeCompare(b.date));
            academicScheduleLoadState = 'loaded';
        } catch (error) {
            console.error('Academic schedule fetch error:', error);
            academicSchedules = [];
            academicScheduleLoadState = 'failed';
        }
    };

    const fetchTodayClassChanges = async () => {
        if (!appData?.classChangeSource) return;

        classChangeLoadState = 'loading';
        try {
            const table = await loadGoogleSheetJsonp(
                appData.classChangeSource.spreadsheetId,
                appData.classChangeSource.gid
            );
            todayClassChanges = parseClassChanges(table);
            classChangeLoadState = 'loaded';
        } catch (error) {
            console.error('Class change fetch error:', error);
            todayClassChanges = [];
            classChangeLoadState = 'failed';
        }
    };

    const fetchTodayMeals = async () => {
        if (!appData?.scheduleSource) return;

        mealLoadState = 'loading';
        const today = new Date();
        const params = new URLSearchParams({
            Type: 'json',
            pIndex: '1',
            pSize: '20',
            ATPT_OFCDC_SC_CODE: appData.scheduleSource.officeCode,
            SD_SCHUL_CODE: appData.scheduleSource.schoolCode,
            MLSV_YMD: formatDateInput(today)
        });

        try {
            const response = await fetch(`https://open.neis.go.kr/hub/mealServiceDietInfo?${params.toString()}`);
            if (!response.ok) throw new Error('Meal response was not ok');

            const data = await response.json();
            const rows = data.mealServiceDietInfo?.[1]?.row || [];
            todayMeals = rows
                .map(row => ({
                    type: row.MMEAL_SC_NM || '급식',
                    dishes: cleanMealDishes(row.DDISH_NM),
                    calories: row.CAL_INFO || '',
                    sourceLoadedAt: row.LOAD_DTM || ''
                }))
                .filter(meal => meal.dishes.length > 0)
                .sort((a, b) => getMealOrder(a.type) - getMealOrder(b.type));
            mealLoadState = 'loaded';
        } catch (error) {
            console.error('Meal fetch error:', error);
            todayMeals = [];
            mealLoadState = 'failed';
        }
    };

    const fetchTodayWeather = async () => {
        weatherLoadState = 'loading';

        try {
            const params = new URLSearchParams({
                latitude: '35.335',
                longitude: '129.037',
                current: 'temperature_2m,weather_code',
                timezone: 'Asia/Seoul'
            });
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
            if (!response.ok) throw new Error('Weather response was not ok');

            const data = await response.json();
            const current = data.current || {};
            const weatherCode = Number(current.weather_code);
            const mood = getWeatherMood(weatherCode);
            todayWeather = {
                icon: mood.icon,
                label: mood.label,
                tone: mood.tone,
                temperature: Number.isFinite(Number(current.temperature_2m))
                    ? Math.round(Number(current.temperature_2m))
                    : null
            };
            weatherLoadState = 'loaded';
        } catch (error) {
            console.error('Weather fetch error:', error);
            todayWeather = null;
            weatherLoadState = 'failed';
        }
    };

        const renderSidebarQuickLinks = () => {
        const container = document.getElementById('sidebar-quick-links-list');
        if (!container) return;

        container.innerHTML = getQuickLinks().slice(0, 5).map(link => `
            <li>
                <a href="${escapeHtml(link.url)}" target="_blank" class="sidebar-quick-link">
                    <i data-lucide="${escapeHtml(link.icon || 'external-link')}"></i>
                    <span>${escapeHtml(link.name)}</span>
                </a>
            </li>
        `).join('');
        refreshIcons();
    };

    const renderSection = (section) => {
        if (!appData) return;

        const requestId = ++renderRequestId;
        contentArea.style.opacity = '0';

        setTimeout(() => {
            if (requestId !== renderRequestId) return;

            switch (section) {
                case 'home':
                    renderDashboard();
                    break;
                case 'notices':
                    renderNotices();
                    break;
                case 'sheets':
                    renderSheets();
                    break;
                case 'documents':
                    renderDocuments();
                    break;
                case 'academic-schedule':
                    renderAcademicSchedule();
                    break;
                case 'special-room-reservations':
                    renderSpecialRoomReservations();
                    break;
                default:
                    renderDashboard();
            }
            contentArea.style.opacity = '1';
            refreshIcons();
        }, 160);
    };

    const renderWeatherChip = () => {
        if (weatherLoadState === 'loading') {
            return `
                <span class="weather-chip weather-chip-loading" title="\uB0A0\uC528\uB97C \uD655\uC778\uD558\uB294 \uC911\uC785\uB2C8\uB2E4">
                    <i data-lucide="cloud-sun"></i>
                    <span>\uD655\uC778 \uC911</span>
                </span>
            `;
        }

        if (weatherLoadState !== 'loaded' || !todayWeather) {
            return `
                <span class="weather-chip weather-chip-muted" title="\uB0A0\uC528\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4">
                    <i data-lucide="cloud"></i>
                    <span>\uB0A0\uC528</span>
                </span>
            `;
        }

        const temperature = todayWeather.temperature === null ? '' : ` ${todayWeather.temperature}\u00B0`;
        return `
            <span class="weather-chip weather-chip-${escapeHtml(todayWeather.tone)}" title="\uC624\uB298\uC758 \uB0A0\uC528">
                <i data-lucide="${escapeHtml(todayWeather.icon)}"></i>
                <span>${escapeHtml(todayWeather.label)}${temperature}</span>
            </span>
        `;
    };

    const renderDashboard = () => {
        const notices = getAllNotices()
            .filter(notice => matchesSearch(notice.title, notice.category, notice.department, notice.content, getNoticePriority(notice)))
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
            .slice(0, 4);
        const sharedLinks = getAllSharedLinks()
            .filter(link => matchesSearch(link.name, link.description, link.department, getLinkTypeLabel(link.type)))
            .slice(0, 4);
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() + 7);
        const weekEndRaw = formatDateInput(weekEnd);
        const filteredSchedules = majorSchedules
            .filter(schedule => String(schedule.date || '') <= weekEndRaw)
            .filter(schedule => matchesSearch(schedule.title, schedule.type, schedule.grades, schedule.date))
            .slice(0, 5);
        const todayKey = formatDateInput(new Date());
        const classChanges = todayClassChanges
            .filter(change => change.dateKey === todayKey)
            .filter(change => matchesSearch(change.name, change.line, change.period, change.type));
        const classChangeGroups = Object.values(classChanges.reduce((groups, change) => {
            const name = change.name || '미지정';
            if (!groups[name]) {
                groups[name] = { name, items: [] };
            }
            groups[name].items.push(change);
            return groups;
        }, {}));

        contentArea.innerHTML = `
            <div class="portal-hero">
                <div>
                    <span class="eyebrow">오늘의 교무실</span>
                    <h1>${escapeHtml(appData.portalTitle || '효암고 온라인 교무실')}</h1>
                    <p>${escapeHtml(appData.portalSubtitle || '교직원 업무를 한 화면에서 시작하는 효암고 교무 포털')}</p>
                </div>
                <div class="portal-hero-actions">
                    <a class="mobile-qr-card" href="https://online-office-4fe31.web.app" target="_blank" rel="noopener" aria-label="모바일로 효암고 온라인 교무실 열기">
                        <img src="assets/online-office-qr.svg" alt="효암고 온라인 교무실 모바일 접속 QR코드">
                        <span>
                            <strong>모바일 접속</strong>
                            <small>스캔해서 열기</small>
                        </span>
                    </a>
                    <button class="status-pill create-shortcut-btn" id="create-shortcut" type="button">
                    <i data-lucide="monitor"></i>
                    <span>바탕화면 바로가기 만들기</span>
                    </button>
                </div>
            </div>

            <div class="today-dashboard-grid">
                <section class="card portal-card main-notice-card">
                    <div class="notice-meal-layout">
                        <div class="notice-panel">
                            <div class="card-header">
                                <div>
                                    <h3 class="card-title">오늘의 주요 안내</h3>
                                    <p class="card-help">긴급·중요 전달사항을 먼저 확인합니다.</p>
                                </div>
                                <div class="card-icon"><i data-lucide="bell"></i></div>
                            </div>
                            <div class="notice-summary-list">
                                ${notices.map(notice => `
                                    <article class="notice-summary-item">
                                        <div class="notice-summary-top">
                                            ${renderPriorityBadge(notice)}
                                            <span class="notice-date">${escapeHtml(notice.date || '')}</span>
                                        </div>
                                        <strong>${escapeHtml(notice.title)}</strong>
                                        <p>${escapeHtml(notice.department || notice.category || '기타')} · ${escapeHtml(notice.content || '')}</p>
                                    </article>
                                `).join('') || '<p class="empty-text">등록된 공지·전달사항이 없습니다.</p>'}
                            </div>
                        </div>

                        <aside class="meal-panel">
                            <div class="card-header">
                                <div>
                                    <h3 class="card-title">오늘의 급식</h3>
                                    <p class="card-help">${formatHeaderDate(new Date())}</p>
                                </div>
                                <div class="card-icon"><i data-lucide="utensils"></i></div>
                            </div>
                            <div class="meal-list">
                                ${mealLoadState === 'loading' ? '<p class="empty-text">급식 메뉴를 불러오는 중입니다...</p>' : ''}
                                ${mealLoadState === 'failed' ? '<p class="empty-text">급식 메뉴를 불러오지 못했습니다.</p>' : ''}
                                ${mealLoadState === 'loaded' && todayMeals.length === 0 ? '<p class="empty-text">오늘 등록된 급식 메뉴가 없습니다.</p>' : ''}
                                ${todayMeals.map(meal => `
                                    <section class="meal-block">
                                        <div class="meal-title">
                                            <span>${escapeHtml(meal.type)}</span>
                                            ${meal.calories ? `<small>${escapeHtml(meal.calories)}</small>` : ''}
                                        </div>
                                        <ul>
                                            ${meal.dishes.map(dish => `<li>${escapeHtml(dish)}</li>`).join('')}
                                        </ul>
                                    </section>
                                `).join('')}
                            </div>
                        </aside>
                    </div>
                </section>

                <section class="card portal-card class-change-card">
                    <div class="card-header">
                        <div class="class-change-heading">
                            <div class="class-change-title-row">
                                <h3 class="card-title">오늘 수업 변경</h3>
                                <div class="class-change-meta">
                                    <span class="card-date-badge">${formatHeaderDate(new Date())}</span>
                                    ${renderWeatherChip()}
                                </div>
                            </div>
                        </div>
                        <div class="card-icon"><i data-lucide="repeat-2"></i></div>
                    </div>
                    <div class="class-change-list">
                        ${classChangeLoadState === 'loading' ? '<p class="empty-text">수업 변경 내용을 불러오는 중입니다...</p>' : ''}
                        ${classChangeLoadState === 'failed' ? `
                            <div class="empty-text">
                                수업 변경 내용을 자동으로 불러오지 못했습니다.
                                <a href="${escapeHtml(appData.classChangeSource.sheetUrl)}">구글시트에서 확인</a>
                            </div>
                        ` : ''}
                        ${classChangeLoadState === 'loaded' && classChanges.length === 0 ? '<p class="empty-text">오늘 등록된 수업 변경이 없습니다.</p>' : ''}
                        ${classChanges.length ? `
                            <div class="class-change-table-wrap">
                                <table class="class-change-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">교사</th>
                                            <th scope="col">변경 내용</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${classChangeGroups.map(group => `
                                            <tr>
                                                <th scope="row">${escapeHtml(group.name)}</th>
                                                <td>
                                                    <div class="class-change-lines">
                                                        ${group.items.map(change => `
                                                            <div class="class-change-line">
                                                                <span class="notice-tag ${change.type === '교체' ? 'tag-normal' : 'tag-urgent'}">${escapeHtml(change.type)}</span>
                                                                <span>${escapeHtml(change.line)}</span>
                                                            </div>
                                                        `).join('')}
                                                    </div>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : ''}
                    </div>
                </section>

                <section class="card portal-card schedule-card">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">이번 주 학사 일정</h3>
                            <p class="card-help">NEIS 학사일정 API 기준</p>
                        </div>
                        <div class="card-icon"><i data-lucide="calendar-days"></i></div>
                    </div>
                    <div class="timeline-list">
                        ${scheduleLoadState === 'loading' ? '<p class="empty-text">학사 일정을 불러오는 중입니다...</p>' : ''}
                        ${scheduleLoadState === 'failed' ? `
                            <div class="empty-text">
                                학사 일정을 자동으로 불러오지 못했습니다.
                                <a href="${escapeHtml(appData.scheduleSource.homepageUrl)}">홈페이지에서 확인</a>
                            </div>
                        ` : ''}
                        ${scheduleLoadState === 'loaded' && filteredSchedules.length === 0 ? '<p class="empty-text">표시할 학사 일정이 없습니다.</p>' : ''}
                        ${filteredSchedules.map(schedule => `
                            <div class="timeline-item schedule-item">
                                <span class="timeline-time">${escapeHtml(formatDisplayDate(schedule.date))}</span>
                                <div>
                                    <strong>${escapeHtml(schedule.title)}</strong>
                                    <span>${escapeHtml(schedule.type)}${schedule.grades ? ` · ${escapeHtml(schedule.grades)}` : ''}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="source-note">
                        <a href="${escapeHtml(appData.scheduleSource.homepageUrl)}" class="schedule-more-link">
                            <i data-lucide="calendar-search"></i>
                            <span>전체 학사일정 보기</span>
                        </a>
                    </div>
                </section>

                <section class="card portal-card shared-card">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">부서별 업무 링크</h3>
                            <p class="card-help">부서에서 공유하는 주요 문서와 시트</p>
                        </div>
                        <div class="card-icon"><i data-lucide="folder-symlink"></i></div>
                    </div>
                    <div class="list-container">
                        ${sharedLinks.map(link => renderSharedLinkRow(link)).join('') || '<p class="empty-text">등록된 업무 링크가 없습니다.</p>'}
                    </div>
                </section>
            </div>
        `;
    };

    const renderAcademicSchedule = () => {
        if (academicScheduleLoadState === 'idle') {
            fetchAcademicSchedules().finally(() => {
                if (currentSection === 'academic-schedule') {
                    renderSection(currentSection);
                }
            });
        }

        const { start, end } = getMonthRange(academicScheduleMonth);
        const filteredSchedules = academicSchedules.filter(schedule =>
            matchesSearch(schedule.title, schedule.type, schedule.grades, schedule.date)
        );
        const scheduleGroups = filteredSchedules.reduce((groups, schedule) => {
            const key = String(schedule.date || '');
            if (!groups[key]) groups[key] = [];
            groups[key].push(schedule);
            return groups;
        }, {});
        const calendarStart = new Date(start);
        calendarStart.setDate(start.getDate() - start.getDay());
        const calendarEnd = new Date(end);
        calendarEnd.setDate(end.getDate() + (6 - end.getDay()));
        const calendarDays = [];
        const cursor = new Date(calendarStart);
        const todayRaw = formatDateInput(new Date());

        while (cursor <= calendarEnd) {
            calendarDays.push(new Date(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }

        contentArea.innerHTML = `
            <div class="section-header split-header">
                <div>
                    <h2>학사일정</h2>
                    <p>${escapeHtml(appData.scheduleSource.name || '효암고등학교 학사일정')}을 NEIS 공개 API에서 월별로 불러옵니다.</p>
                </div>
                <div class="academic-toolbar">
                    <button class="btn-icon" type="button" data-academic-month="-1" aria-label="이전 달">
                        <i data-lucide="chevron-left"></i>
                    </button>
                    <strong>${escapeHtml(formatMonthTitle(academicScheduleMonth))}</strong>
                    <button class="btn-icon" type="button" data-academic-month="1" aria-label="다음 달">
                        <i data-lucide="chevron-right"></i>
                    </button>
                    <button class="btn-primary" type="button" data-academic-refresh>
                        <i data-lucide="refresh-cw"></i>
                        <span>새로고침</span>
                    </button>
                </div>
            </div>

            <section class="card academic-schedule-card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">${escapeHtml(formatMonthTitle(academicScheduleMonth))} 일정</h3>
                        <p class="card-help">효암고 · 경상남도교육청 · 학교코드 9010259</p>
                    </div>
                    <div class="card-icon"><i data-lucide="calendar-search"></i></div>
                </div>

                <div class="academic-status">
                    ${academicScheduleLoadState === 'loading' ? '<p class="empty-text">학사 일정을 불러오는 중입니다...</p>' : ''}
                    ${academicScheduleLoadState === 'failed' ? `
                        <div class="empty-text">
                            학사 일정을 자동으로 불러오지 못했습니다.
                            <a href="${escapeHtml(appData.scheduleSource.homepageUrl)}">홈페이지에서 확인</a>
                        </div>
                    ` : ''}
                    ${academicScheduleLoadState === 'loaded' && filteredSchedules.length === 0 ? '<p class="empty-text">표시할 학사 일정이 없습니다.</p>' : ''}
                </div>

                <div class="academic-calendar" aria-label="${escapeHtml(formatMonthTitle(academicScheduleMonth))} 학사일정 달력">
                    ${['일', '월', '화', '수', '목', '금', '토'].map(day => `
                        <div class="academic-weekday">${day}</div>
                    `).join('')}
                    ${calendarDays.map(day => {
                        const dayRaw = formatDateInput(day);
                        const daySchedules = scheduleGroups[dayRaw] || [];
                        const isCurrentMonth = day.getMonth() === academicScheduleMonth.getMonth();
                        const classes = [
                            'academic-day',
                            isCurrentMonth ? '' : 'academic-day-muted',
                            dayRaw === todayRaw ? 'academic-day-today' : '',
                            daySchedules.length ? 'academic-day-has-events' : ''
                        ].filter(Boolean).join(' ');

                        return `
                            <div class="${classes}">
                                <div class="academic-day-number">
                                    <strong>${day.getDate()}</strong>
                                    ${dayRaw === todayRaw ? '<span>오늘</span>' : ''}
                                </div>
                                <div class="academic-day-events">
                                    ${daySchedules.map(schedule => `
                                        <article class="academic-event">
                                            <strong>${escapeHtml(schedule.title)}</strong>
                                            <span>${escapeHtml(schedule.type)}${schedule.grades ? ` · ${escapeHtml(schedule.grades)}` : ''}</span>
                                        </article>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div class="academic-source-row">
                    <a href="${escapeHtml(appData.scheduleSource.homepageUrl)}" class="schedule-more-link">
                        <i data-lucide="external-link"></i>
                        <span>학교 홈페이지 일정 보기</span>
                    </a>
                </div>
            </section>
        `;

        bindAcademicScheduleControls();
    };

    const bindAcademicScheduleControls = () => {
        contentArea.querySelectorAll('[data-academic-month]').forEach(button => {
            button.addEventListener('click', () => {
                const offset = Number(button.getAttribute('data-academic-month') || 0);
                academicScheduleMonth = new Date(
                    academicScheduleMonth.getFullYear(),
                    academicScheduleMonth.getMonth() + offset,
                    1
                );
                academicSchedules = [];
                academicScheduleLoadState = 'loading';
                renderSection('academic-schedule');
                fetchAcademicSchedules().finally(() => {
                    if (currentSection === 'academic-schedule') {
                        renderSection(currentSection);
                    }
                });
            });
        });

        const refreshButton = contentArea.querySelector('[data-academic-refresh]');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                academicSchedules = [];
                academicScheduleLoadState = 'loading';
                renderSection('academic-schedule');
                fetchAcademicSchedules().finally(() => {
                    if (currentSection === 'academic-schedule') {
                        renderSection(currentSection);
                    }
                });
            });
        }
    };

    const renderNotices = () => {
        const notices = getAllNotices().filter(notice =>
            matchesSearch(notice.title, notice.category, notice.department, notice.content, getNoticePriority(notice))
        ).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

        contentArea.innerHTML = `
            <div class="section-header split-header">
                <div>
                    <h2>공지·전달사항</h2>
                    <p>부서별 전달사항과 긴급 안내를 등록하고 확인합니다.</p>
                </div>
            </div>

            <div class="card link-form-card management-form-card">
                <div class="form-heading">
                    <div class="card-icon"><i data-lucide="megaphone"></i></div>
                    <div>
                        <h3>공지·전달사항 등록</h3>
                        <p>부서, 분류, 중요도를 함께 기록합니다.</p>
                    </div>
                </div>
                <form id="notice-form" class="shared-link-form notice-form">
                    <input id="notice-title" type="text" placeholder="공지 제목" required>
                    <select id="notice-department" required>
                        ${appData.departments.map(department => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`).join('')}
                    </select>
                    <select id="notice-category" required>
                        <option value="교무">교무</option>
                        <option value="평가">평가</option>
                        <option value="연구">연구</option>
                        <option value="행정">행정</option>
                        <option value="생활">생활</option>
                        <option value="기타">기타</option>
                    </select>
                    <select id="notice-priority" required>
                        <option value="일반">일반</option>
                        <option value="중요">중요</option>
                        <option value="긴급">긴급</option>
                    </select>
                    <textarea id="notice-content" placeholder="안내 내용을 입력하세요." required></textarea>
                    <button class="btn-primary" type="submit">
                        <i data-lucide="plus"></i>
                        <span>등록</span>
                    </button>
                </form>
                <p class="helper-text">직접 등록한 공지는 Firebase에 저장됩니다. 향후 관리자 권한과 연결하기 쉽도록 데이터 구조를 분리해 두었습니다.</p>
            </div>

            <div class="notice-full-list card management-list-card">
                <div class="list-heading">
                    <h3>등록된 공지·전달사항</h3>
                    <span>${notices.length}건</span>
                </div>
                ${notices.map(notice => `
                    <div class="notice-row">
                        <div class="notice-meta">
                            ${renderPriorityBadge(notice)}
                            <span class="notice-tag tag-normal">${escapeHtml(notice.category)}</span>
                            <span class="notice-date">${escapeHtml(notice.date)}</span>
                        </div>
                        <div class="notice-content">
                            <h3>${escapeHtml(notice.title)}</h3>
                            <p>${escapeHtml(notice.department)} · ${escapeHtml(notice.content)}</p>
                        </div>
                        <div class="row-actions compact-actions">
                            <button class="btn-icon" type="button" data-edit-notice="${escapeHtml(notice.id)}" aria-label="${escapeHtml(notice.title)} 수정">
                                <i data-lucide="pencil"></i>
                            </button>
                            <button class="btn-icon danger" type="button" data-delete-notice="${escapeHtml(notice.id)}" aria-label="${escapeHtml(notice.title)} 삭제">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </div>
                `).join('') || '<div class="empty-state">검색 결과가 없습니다.</div>'}
            </div>
        `;

        bindNoticeForm();
        bindDeleteButtons();
        bindEditButtons();
    };
    const renderSharedLinkRow = (link) => `
        <div class="list-item shared-link-row">
            <div class="item-info">
                <span class="item-name">${escapeHtml(link.name)}</span>
                <span class="item-desc">${escapeHtml(link.department || '기타')} · ${escapeHtml(getLinkTypeLabel(link.type))}${link.description ? ` · ${escapeHtml(link.description)}` : ''}</span>
            </div>
            <a href="${escapeHtml(link.url)}" class="btn-icon" aria-label="${escapeHtml(link.name)} 열기">
                <i data-lucide="${getLinkIcon(link.type)}"></i>
            </a>
        </div>
    `;

    const renderManagedSharedLinkRow = (link) => `
        <div class="list-item shared-link-row">
            <div class="item-info">
                <span class="item-name">${escapeHtml(link.name)}</span>
                <span class="item-desc">${escapeHtml(link.department || '기타')} · ${escapeHtml(getLinkTypeLabel(link.type))}</span>
            </div>
            <div class="row-actions">
                <a href="${escapeHtml(link.url)}" class="btn-icon" aria-label="${escapeHtml(link.name)} 열기">
                    <i data-lucide="${getLinkIcon(link.type)}"></i>
                </a>
                <button class="btn-icon danger" type="button" data-delete-link="${escapeHtml(link.id)}" aria-label="${escapeHtml(link.name)} 삭제">
                    <i data-lucide="trash-2"></i>
                </button>
                <button class="btn-icon" type="button" data-edit-link="${escapeHtml(link.id)}" aria-label="${escapeHtml(link.name)} 수정">
                    <i data-lucide="pencil"></i>
                </button>
            </div>
        </div>
    `;

    const renderSheets = () => {
        const sharedLinks = getAllSharedLinks().filter(link =>
            matchesSearch(link.name, link.description, link.department, getLinkTypeLabel(link.type))
        );

        contentArea.innerHTML = `
            <div class="section-header split-header">
                <div>
                    <h2>부서별 업무 링크</h2>
                    <p>부서에서 자주 사용하는 구글 시트, 문서, 업무 링크를 모아 둡니다.</p>
                </div>
            </div>

            <div class="card link-form-card management-form-card">
                <div class="form-heading">
                    <div class="card-icon"><i data-lucide="folder-plus"></i></div>
                    <div>
                        <h3>업무 링크 등록</h3>
                        <p>공유 문서와 업무 시스템 링크를 부서별로 관리합니다.</p>
                    </div>
                </div>
                <form id="shared-link-form" class="shared-link-form">
                    <input id="shared-link-title" type="text" placeholder="제목 예: 2학년 수행평가 입력표" required>
                    <select id="shared-link-department" required>
                        ${appData.departments.map(department => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`).join('')}
                    </select>
                    <input id="shared-link-url" type="url" placeholder="구글 시트 또는 문서 링크 붙여넣기" required>
                    <button class="btn-primary" type="submit">
                        <i data-lucide="plus"></i>
                        <span>등록</span>
                    </button>
                </form>
                <p class="helper-text">교직원 전용 링크는 향후 Firebase Authentication을 붙이면 로그인 사용자에게만 노출할 수 있습니다.</p>
            </div>

            <div class="list-heading outside-heading">
                <h3>등록된 부서별 업무 링크</h3>
                <span>${sharedLinks.length}건</span>
            </div>
            <div class="sheets-grid compact-grid">
                ${sharedLinks.map(link => `
                    <div class="card sheet-card-large shared-resource-card">
                        <div class="resource-topline">
                            <span class="notice-tag tag-normal">${escapeHtml(link.department || '기타')}</span>
                            <span>${escapeHtml(getLinkTypeLabel(link.type))}</span>
                        </div>
                        <div class="sheet-preview">
                            <i data-lucide="${getLinkIcon(link.type)}" size="48"></i>
                        </div>
                        <div class="card-content">
                            <h3>${escapeHtml(link.name)}</h3>
                            <p>${escapeHtml(link.description || '부서에서 공유한 업무 링크입니다.')}</p>
                            <div class="card-actions">
                                <a href="${escapeHtml(link.url)}" class="btn-primary">
                                    <i data-lucide="external-link"></i>
                                    <span>열기</span>
                                </a>
                                <button class="btn-icon danger" type="button" data-delete-link="${escapeHtml(link.id)}" aria-label="${escapeHtml(link.name)} 삭제">
                                    <i data-lucide="trash-2"></i>
                                </button>
                                <button class="btn-icon" type="button" data-edit-link="${escapeHtml(link.id)}" aria-label="${escapeHtml(link.name)} 수정">
                                    <i data-lucide="pencil"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('') || '<div class="empty-state card">검색 결과가 없습니다.</div>'}
            </div>
        `;

        bindSharedLinkForm();
        bindDeleteButtons();
        bindEditButtons();
    };
    const renderDocuments = () => {
        const documents = getAllDocuments().filter(doc => matchesSearch(doc.name, doc.category, doc.department, doc.type, doc.url));

        contentArea.innerHTML = `
            <div class="section-header split-header">
                <div>
                    <h2>업무 서식함</h2>
                    <p>부서별로 자주 쓰는 서식과 작성 가이드를 등록하고 내려받습니다.</p>
                </div>
            </div>

            <div class="card link-form-card management-form-card">
                <div class="form-heading">
                    <div class="card-icon"><i data-lucide="file-plus-2"></i></div>
                    <div>
                        <h3>업무 서식 등록</h3>
                        <p>서식 파일이나 공유 문서 링크를 등록합니다.</p>
                    </div>
                </div>
                <form id="document-form" class="shared-link-form document-form">
                    <input id="document-name" type="text" placeholder="서식명 예: 현장체험학습 결과보고서" required>
                    <select id="document-department" required>
                        ${appData.departments.map(department => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`).join('')}
                    </select>
                    <select id="document-category" required>
                        <option value="교무">교무</option>
                        <option value="평가">평가</option>
                        <option value="연구">연구</option>
                        <option value="행정">행정</option>
                        <option value="생활">생활</option>
                        <option value="기타">기타</option>
                    </select>
                    <select id="document-type" required>
                        <option value="hwp">HWP</option>
                        <option value="pdf">PDF</option>
                        <option value="doc">DOC</option>
                        <option value="link">LINK</option>
                    </select>
                    <input id="document-url" type="url" placeholder="공유 문서 링크 또는 파일 대신 사용할 URL">
                    <label id="document-drop-zone" class="file-drop-zone">
                        <input id="document-file" type="file" accept=".hwp,.hwpx,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip">
                        <i data-lucide="upload-cloud"></i>
                        <span id="document-file-label">PC 파일을 끌어오거나 클릭해서 선택</span>
                    </label>
                    <button class="btn-primary" type="submit">
                        <i data-lucide="plus"></i>
                        <span>등록</span>
                    </button>
                </form>
                <p class="helper-text">브라우저에 직접 등록한 파일은 현재 PC에 저장됩니다. 여러 PC에서 쓰려면 공유 드라이브 링크를 함께 사용하세요.</p>
            </div>

            <div class="list-heading outside-heading">
                <h3>등록된 업무 서식</h3>
                <span>${documents.length}건</span>
            </div>
            <div class="docs-grid">
                ${documents.map(doc => `
                    <div class="card doc-card">
                        <div class="doc-type-icon ${escapeHtml(doc.type)}">${escapeHtml(doc.type.toUpperCase())}</div>
                        <div class="doc-info">
                            <h3>${escapeHtml(doc.name)}</h3>
                            <span>${escapeHtml(doc.department || '기타')} · ${escapeHtml(doc.category)}</span>
                        </div>
                        <div class="row-actions">
                            ${doc.fileId ? `
                                <button class="btn-icon" type="button" data-open-document-file="${escapeHtml(doc.fileId)}" aria-label="${escapeHtml(doc.name)} 다운로드"><i data-lucide="download"></i></button>
                            ` : isValidUrl(doc.url) ? `
                                <a href="${escapeHtml(doc.url)}" class="btn-icon" aria-label="${escapeHtml(doc.name)} 열기"><i data-lucide="external-link"></i></a>
                            ` : `
                                <button class="btn-icon disabled" type="button" aria-label="등록된 파일 또는 링크 없음" title="등록된 파일 또는 링크가 없습니다. 수정 버튼으로 파일이나 링크를 추가해 주세요."><i data-lucide="file-x"></i></button>
                            `}
                            <button class="btn-icon" type="button" data-edit-document="${escapeHtml(doc.id)}" aria-label="${escapeHtml(doc.name)} 수정">
                                <i data-lucide="pencil"></i>
                            </button>
                            <button class="btn-icon danger" type="button" data-delete-document="${escapeHtml(doc.id)}" aria-label="${escapeHtml(doc.name)} 삭제">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </div>
                `).join('') || '<div class="empty-state card">검색 결과가 없습니다.</div>'}
            </div>
        `;

        bindDocumentForm();
        bindDeleteButtons();
        bindEditButtons();
        bindOpenDocumentFiles();
    };
    const renderSpecialRoomReservations = () => {
        resetSpecialRoomReservationsIfNeeded();

        const days = ['월', '화', '수', '목', '금', '토'];
        const periods = ['1교시', '2교시', '3교시', '점심시간', '4교시', '5교시', '6교시', '7교시'];
        const rooms = getSpecialRoomNames();
        const weekRange = getSpecialRoomWeekRange();
        const reservations = getSpecialRoomReservations();

        contentArea.innerHTML = `
            <div class="section-header split-header">
                <div>
                    <div class="special-room-title-line">
                        <h2>특별실 예약 현황</h2>
                        <span class="special-room-week-range">${escapeHtml(weekRange.label)}</span>
                    </div>
                    <p>특별실 사용 예약과 이용 현황을 확인합니다.</p>
                    <p class="special-room-guide">매주 일요일이 되면 자동으로 리셋됩니다.</p>
                    <p class="special-room-guide">예약 내용을 입력하면 칸이 분홍색으로 표시됩니다.</p>
                </div>
            </div>

            <div class="special-room-grid">
                ${rooms.map((room, roomIndex) => `
                    <section class="card special-room-card">
                        <input class="special-room-name-input" type="text" value="${escapeHtml(room)}" data-room-index="${roomIndex}" aria-label="특별실 이름">
                        <div class="special-room-table-wrap">
                            <table class="special-room-table" aria-label="${room} 예약 현황 주간 시간표">
                                <thead>
                                    <tr>
                                        <th scope="col">교시</th>
                                        ${days.map(day => `<th scope="col">${day}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${periods.map((period, periodIndex) => `
                                        <tr>
                                            <th scope="row">${period}</th>
                                            ${days.map((day, dayIndex) => {
                                                const cellId = `${roomIndex}-${dayIndex}-${periodIndex}`;
                                                const reservation = reservations[cellId] || {};
                                                const hasText = String(reservation.text || '').trim().length > 0;
                                                return `
                                                    <td class="reservation-cell${hasText ? ' reservation-filled' : ''}" data-cell-id="${cellId}">
                                                        <textarea class="reservation-input" rows="2" placeholder="입력" aria-label="${room} ${day} ${period} 특별실 예약 내용">${escapeHtml(reservation.text || '')}</textarea>
                                                    </td>
                                                `;
                                            }).join('')}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </section>
                `).join('')}
            </div>
        `;

        bindSpecialRoomReservations();
        bindSpecialRoomNames();
    };
    const bindSpecialRoomNames = () => {
        const inputs = contentArea.querySelectorAll('.special-room-name-input');

        inputs.forEach(input => {
            const saveCurrentInput = () => {
                const names = getSpecialRoomNames();
                const index = Number(input.getAttribute('data-room-index'));
                names[index] = input.value.trim() || `특별실${index + 1}`;
                return names;
            };

            input.addEventListener('input', () => {
                const names = saveCurrentInput();
                saveSpecialRoomNames(names);
                clearTimeout(specialRoomNamesSaveTimer);
                specialRoomNamesSaveTimer = setTimeout(() => {
                    saveSharedSpecialRoomNames(names, { silent: true });
                }, 500);
            });

            input.addEventListener('change', () => {
                clearTimeout(specialRoomNamesSaveTimer);
                saveSharedSpecialRoomNames(saveCurrentInput());
            });
        });
    };
    const bindSpecialRoomReservations = () => {
        const cells = contentArea.querySelectorAll('[data-cell-id]');

        cells.forEach(cell => {
            const textarea = cell.querySelector('.reservation-input');

            cell.addEventListener('click', () => {
                textarea.focus();
            });

            textarea.addEventListener('input', () => {
                const reservations = getSpecialRoomReservations();
                const cellId = cell.getAttribute('data-cell-id');
                const current = reservations[cellId] || {};

                reservations[cellId] = {
                    ...current,
                    text: textarea.value
                };
                cell.classList.toggle('reservation-filled', textarea.value.trim().length > 0);
                saveSpecialRoomReservations(reservations);
                clearTimeout(specialRoomReservationsSaveTimer);
                specialRoomReservationsSaveTimer = setTimeout(() => {
                    saveSharedSpecialRoomReservations(reservations, { silent: true });
                }, 500);
            });

            textarea.addEventListener('change', () => {
                clearTimeout(specialRoomReservationsSaveTimer);
                const reservations = getSpecialRoomReservations();
                const cellId = cell.getAttribute('data-cell-id');
                const current = reservations[cellId] || {};

                reservations[cellId] = {
                    ...current,
                    text: textarea.value
                };
                saveSharedSpecialRoomReservations(reservations);
            });
        });
    };
    const bindSharedLinkForm = () => {
        const form = document.getElementById('shared-link-form');
        if (!form) return;

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const title = document.getElementById('shared-link-title').value.trim();
            const department = document.getElementById('shared-link-department').value;
            const url = document.getElementById('shared-link-url').value.trim();

            if (!title || !isValidUrl(url)) {
                alert('제목과 올바른 링크 주소를 입력해 주세요.');
                return;
            }

            const itemId = editingLinkId || createId();
            if (!db) {
                alert('Firestore 연결이 없어 링크를 저장할 수 없습니다. Firebase Hosting 주소에서 다시 시도해 주세요.');
                return;
            }

            try {
                await db.collection(COLL_LINKS).doc(itemId).set({
                    name: title,
                    department,
                    url,
                    type: getGoogleLinkType(url),
                    description: '부서별 업무 링크',
                    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
                });
                await restoreDeletedId(COLL_LINKS, itemId);
                editingLinkId = null;
                form.reset();
                renderSection('sheets');
            } catch (error) {
                console.error('Firestore link save error:', error);
                alert('링크 저장 중 오류가 발생했습니다.');
            }
        });
    };

    const bindNoticeForm = () => {
        const form = document.getElementById('notice-form');
        if (!form) return;

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const title = document.getElementById('notice-title').value.trim();
            const department = document.getElementById('notice-department').value;
            const category = document.getElementById('notice-category').value;
            const content = document.getElementById('notice-content').value.trim();
            const priority = document.getElementById('notice-priority').value;
            const isUrgent = priority === '긴급';

            if (!title || !content) {
                alert('제목과 내용을 입력해 주세요.');
                return;
            }

            const itemId = editingNoticeId || createId();
            if (!db) {
                alert('Firestore 연결이 없어 공지를 저장할 수 없습니다. Firebase Hosting 주소에서 다시 시도해 주세요.');
                return;
            }

            try {
                await db.collection(COLL_NOTICES).doc(itemId).set({
                    title,
                    department,
                    category,
                    content,
                    priority,
                    isUrgent,
                    date: formatLocalDate(new Date()),
                    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
                });
                await restoreDeletedId(COLL_NOTICES, itemId);
                editingNoticeId = null;
                form.reset();
                renderSection('notices');
            } catch (error) {
                console.error('Firestore notice save error:', error);
                alert('공지 저장 중 오류가 발생했습니다.');
            }
        });
    };

    const bindDocumentForm = () => {
        const form = document.getElementById('document-form');
        if (!form) return;
        const fileInput = document.getElementById('document-file');
        const dropZone = document.getElementById('document-drop-zone');
        const fileLabel = document.getElementById('document-file-label');

        const setSelectedFile = (file) => {
            selectedDocumentFile = file;
            if (fileLabel) fileLabel.textContent = file ? file.name : 'PC 파일을 여기에 끌어오거나 클릭해서 선택';
        };

        fileInput.addEventListener('change', () => {
            setSelectedFile(fileInput.files?.[0] || null);
        });

        dropZone.addEventListener('dragover', (event) => {
            event.preventDefault();
            dropZone.classList.add('is-dragging');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('is-dragging');
        });

        dropZone.addEventListener('drop', (event) => {
            event.preventDefault();
            dropZone.classList.remove('is-dragging');
            const file = event.dataTransfer.files?.[0];
            if (file) setSelectedFile(file);
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const name = document.getElementById('document-name').value.trim();
            const department = document.getElementById('document-department').value;
            const category = document.getElementById('document-category').value;
            const type = document.getElementById('document-type').value;
            const url = document.getElementById('document-url').value.trim();

            if (!name || (!selectedDocumentFile && !editingDocumentId && !isValidUrl(url))) {
                alert('서식명과 파일 또는 올바른 링크 주소를 입력해 주세요.');
                return;
            }

            if (url && !isValidUrl(url)) {
                alert('링크 주소 형식을 확인해 주세요.');
                return;
            }

            const itemId = editingDocumentId || createId();
            if (!db) {
                alert('Firestore 연결이 없어 서식을 저장할 수 없습니다. Firebase Hosting 주소에서 다시 시도해 주세요.');
                return;
            }

            if (selectedDocumentFile) {
                await saveDocumentFile(itemId, selectedDocumentFile);
            }

            const existing = getAllDocuments().find(doc => String(doc.id) === String(itemId));
            try {
                await db.collection(COLL_DOCUMENTS).doc(itemId).set({
                    name,
                    department,
                    category,
                    type,
                    url: url || existing?.url || '',
                    fileId: selectedDocumentFile ? itemId : existing?.fileId || '',
                    fileName: selectedDocumentFile ? selectedDocumentFile.name : existing?.fileName || '',
                    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
                });
                await restoreDeletedId(COLL_DOCUMENTS, itemId);
                editingDocumentId = null;
                selectedDocumentFile = null;
                form.reset();
                if (fileLabel) fileLabel.textContent = 'PC 파일을 여기에 끌어오거나 클릭해서 선택';
                renderSection('documents');
            } catch (error) {
                console.error('Firestore document save error:', error);
                alert('서식 저장 중 오류가 발생했습니다.');
            }
        });
    };

    const bindDeleteButtons = () => {
        document.querySelectorAll('[data-delete-link]').forEach(button => {
            button.addEventListener('click', async () => {
                const id = button.getAttribute('data-delete-link');
                if (confirm('이 업무 링크를 삭제하시겠습니까?')) {
                    if (!db) {
                        alert('Firestore 연결이 없어 삭제할 수 없습니다. Firebase Hosting 주소에서 다시 시도해 주세요.');
                        return;
                    }

                    const isFirestore = firestoreLinks.some(l => String(l.id) === String(id));
                    if (isFirestore) {
                        await db.collection(COLL_LINKS).doc(id).delete();
                    } else {
                        await saveDeletedId(COLL_LINKS, id);
                    }
                }
            });
        });
        document.querySelectorAll('[data-delete-notice]').forEach(button => {
            button.addEventListener('click', async () => {
                const id = button.getAttribute('data-delete-notice');
                if (confirm('이 공지·전달사항을 삭제하시겠습니까?')) {
                    if (!db) {
                        alert('Firestore 연결이 없어 삭제할 수 없습니다. Firebase Hosting 주소에서 다시 시도해 주세요.');
                        return;
                    }

                    const isFirestore = firestoreNotices.some(n => String(n.id) === String(id));
                    if (isFirestore) {
                        await db.collection(COLL_NOTICES).doc(id).delete();
                    } else {
                        await saveDeletedId(COLL_NOTICES, id);
                    }
                }
            });
        });
        document.querySelectorAll('[data-delete-document]').forEach(button => {
            button.addEventListener('click', async () => {
                const id = button.getAttribute('data-delete-document');
                if (confirm('이 업무 서식을 삭제하시겠습니까?')) {
                    if (!db) {
                        alert('Firestore 연결이 없어 삭제할 수 없습니다. Firebase Hosting 주소에서 다시 시도해 주세요.');
                        return;
                    }

                    const isFirestore = firestoreDocs.some(d => String(d.id) === String(id));
                    if (isFirestore) {
                        await db.collection(COLL_DOCUMENTS).doc(id).delete();
                    } else {
                        await saveDeletedId(COLL_DOCUMENTS, id);
                    }
                }
            });
        });
    };

    const bindOpenDocumentFiles = () => {
        document.querySelectorAll('[data-open-document-file]').forEach(button => {
            button.addEventListener('click', async () => {
                try {
                    const id = button.getAttribute('data-open-document-file');
                    const file = await getDocumentFile(id);
                    if (!file) {
                        alert('저장된 파일을 찾을 수 없습니다. 다시 등록해 주세요.');
                        return;
                    }
                    const url = URL.createObjectURL(file);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = file.name || 'document';
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch (error) {
                    console.error('Document file open error:', error);
                    alert('파일을 여는 동안 문제가 발생했습니다. 파일을 다시 등록해 주세요.');
                }
            });
        });
    };

    const bindEditButtons = () => {
        document.querySelectorAll('[data-edit-link]').forEach(button => {
            button.addEventListener('click', () => {
                const id = button.getAttribute('data-edit-link');
                const link = getAllSharedLinks().find(item => String(item.id) === String(id));
                if (!link) return;

                editingLinkId = id;
                restoreDeletedId(COLL_LINKS, id);
                document.getElementById('shared-link-title').value = link.name || '';
                document.getElementById('shared-link-department').value = link.department || '기타';
                document.getElementById('shared-link-url').value = link.url || '';
                document.getElementById('shared-link-title').focus();
            });
        });

        document.querySelectorAll('[data-edit-notice]').forEach(button => {
            button.addEventListener('click', () => {
                const id = button.getAttribute('data-edit-notice');
                const notice = getAllNotices().find(item => String(item.id) === String(id));
                if (!notice) return;

                editingNoticeId = id;
                restoreDeletedId(COLL_NOTICES, id);
                document.getElementById('notice-title').value = notice.title || '';
                document.getElementById('notice-department').value = notice.department || '\uAE30\uD0C0';
                document.getElementById('notice-category').value = notice.category || '\uAE30\uD0C0';
                document.getElementById('notice-priority').value = getNoticePriority(notice);
                document.getElementById('notice-content').value = notice.content || '';
                document.getElementById('notice-title').focus();
            });
        });

        document.querySelectorAll('[data-edit-document]').forEach(button => {
            button.addEventListener('click', () => {
                const id = button.getAttribute('data-edit-document');
                const doc = getAllDocuments().find(item => String(item.id) === String(id));
                if (!doc) return;

                editingDocumentId = id;
                restoreDeletedId(COLL_DOCUMENTS, id);
                document.getElementById('document-name').value = doc.name || '';
                document.getElementById('document-department').value = doc.department || '\uAE30\uD0C0';
                document.getElementById('document-category').value = doc.category || '\uAE30\uD0C0';
                document.getElementById('document-type').value = doc.type || 'link';
                document.getElementById('document-url').value = doc.url === '#' ? '' : doc.url || '';
                selectedDocumentFile = null;
                const fileLabel = document.getElementById('document-file-label');
                if (fileLabel) fileLabel.textContent = doc.fileName ? `\uD604\uC7AC \uD30C\uC77C: ${doc.fileName}` : '\u0050\u0043 \uD30C\uC77C\uC744 \uB04C\uC5B4\uC624\uAC70\uB098 \uD074\uB9AD\uD574\uC11C \uC120\uD0DD';
                document.getElementById('document-name').focus();
            });
        });
    };

    const fetchData = async () => {
        const dataUrl = 'data.json';

        try {
            const response = await fetch(dataUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            appData = await response.json();
            await setupFirestoreListeners();
            await recordVisitorVisit();
            renderSidebarQuickLinks();
            scheduleLoadState = 'loading';
            classChangeLoadState = 'loading';
            mealLoadState = 'loading';
            weatherLoadState = 'loading';
            renderSection(currentSection);

            const refreshDashboardIfActive = () => {
                if (currentSection === 'home') {
                    renderSection(currentSection);
                }
            };

            await Promise.all([
                fetchMajorSchedules().finally(refreshDashboardIfActive),
                fetchTodayClassChanges().finally(refreshDashboardIfActive),
                fetchTodayMeals().finally(refreshDashboardIfActive),
                fetchTodayWeather().finally(refreshDashboardIfActive)
            ]);
            refreshDashboardIfActive();
        } catch (error) {
            console.error('Data fetch error:', error);
            contentArea.innerHTML = `
                <div class="error-container card">
                    <i data-lucide="alert-circle" size="48"></i>
                    <h2>데이터 연결 실패</h2>
                    <p>데이터 파일을 불러오지 못했습니다. 서버 상태를 확인해 주세요.</p>
                    <div class="error-details">
                        <code>${escapeHtml(error.message)}</code>
                    </div>
                    <button class="btn-primary" type="button" onclick="location.reload()">
                        <i data-lucide="refresh-cw"></i> 다시 시도
                    </button>
                </div>
            `;
            refreshIcons();
        }
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.getAttribute('data-section');
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            currentSection = section;
            renderSection(section);
        });
    });

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        document.body.classList.toggle('light-theme');
        const isDark = document.body.classList.contains('dark-theme');
        themeIcon.setAttribute('data-lucide', isDark ? 'moon' : 'sun');
        refreshIcons();
    });

    globalSearch.addEventListener('input', () => {
        searchTerm = normalize(globalSearch.value.trim());
        renderSection(currentSection);
    });

    updateDate();
    fetchData();
});

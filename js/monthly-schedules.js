/* The shared monthly plan is the sole source for calendar events. */
(function (root) {
    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
    const key = date => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const value = cell => String(cell?.v ?? cell?.f ?? '');

    function parseTable(table, year, month) {
        const rows = (table?.rows || []).map(row => (row.c || []).map(value));
        const heading = rows.slice(0, 4).flat().join(' ');
        if (!new RegExp(`${year}\\s*학년도\\s*${month}\\s*월`).test(heading)) {
            throw new Error('요청한 연도·월의 행사 계획표가 아닙니다.');
        }
        // Google Visualization drops the text '일자' in its numeric date column.
        const headerIndex = rows.findIndex(row => clean(row[1]) === '요일' && row.slice(2).some(cell => /부$/.test(clean(cell))));
        if (headerIndex < 0) throw new Error('월중행사 시트의 일자·요일 머리글을 찾지 못했습니다.');
        const headers = rows[headerIndex];
        const schedules = new Map();
        const lastDay = new Date(year, month, 0).getDate();
        for (const row of rows.slice(headerIndex + 1)) {
            const day = Number(row[0]);
            if (!Number.isInteger(day) || day < 1 || day > lastDay) continue;
            for (let column = 2; column < headers.length; column++) {
                const department = clean(headers[column]);
                const raw = String(row[column] || '').replace(/\r/g, '').trim();
                if (!raw || !department) continue;
                // Time-only lines belong to the preceding event; other lines are separate events.
                const events = [];
                let pendingRange = '';
                for (const line of raw.split('\n').map(x => x.trim()).filter(Boolean)) {
                    if (/^\d{1,2}\/\d{1,2}\s*[~～]\s*\d{1,2}\/\d{1,2}$/.test(line)) {
                        pendingRange = line;
                    } else if (/^\d{1,2}:\d{2}(?:\s*[-~～]\s*\d{1,2}:\d{2})?$/.test(line) && events.length) {
                        events[events.length - 1].time = line;
                    } else {
                        events.push({ title: line, range: pendingRange, time: '' });
                        pendingRange = '';
                    }
                }
                for (const event of events) {
                    let start = new Date(year, month - 1, day);
                    let end = new Date(start);
                    const explicit = (event.range || event.title).match(/(\d{1,2})\/(\d{1,2})\s*[~～]\s*(\d{1,2})\/(\d{1,2})/);
                    const until = event.title.match(/[~～]\s*(?:(\d{1,2})[/.월]\s*)?(\d{1,2})\s*\.?\s*\)?/);
                    if (explicit) {
                        start = new Date(year, Number(explicit[1]) - 1, Number(explicit[2]));
                        end = new Date(year, Number(explicit[3]) - 1, Number(explicit[4]));
                        if (end < start) end.setFullYear(year + 1);
                    } else if (until) {
                        end = new Date(year, until[1] ? Number(until[1]) - 1 : month - 1, Number(until[2]));
                    }
                    if (end < start || (end - start) / 86400000 > 366) throw new Error('일정 기간을 확인해 주세요.');
                    const title = clean(event.title.replace(/\(?\s*[~～]\s*(?:\d{1,2}[/.월]\s*)?\d{1,2}\s*\.?\s*\)?/, ''));
                    const gradeMatch = department.match(/^([123])학년부$/);
                    const grades = gradeMatch ? `${gradeMatch[1]}학년` : '';
                    const detail = [department, event.time, event.range || (end > start ? `${start.getMonth() + 1}/${start.getDate()}~${end.getMonth() + 1}/${end.getDate()}` : '')].filter(Boolean).join(' · ');
                    for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                        // Adjacent-month rows belong to their own monthly plan.
                        if (date.getFullYear() !== year || date.getMonth() !== month - 1) continue;
                        const dateKey = key(date);
                        const id = `${dateKey}|${title}`;
                        const existing = schedules.get(id);
                        if (existing) {
                            if (!existing.detail.includes(department)) existing.detail += ` / ${detail}`;
                            if (grades && !existing.grades.includes(grades)) existing.grades = [existing.grades, grades].filter(Boolean).join(', ');
                        } else {
                            schedules.set(id, { date: dateKey, title, detail, grades, type: '월중행사' });
                        }
                    }
                }
            }
        }
        return [...schedules.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko'));
    }
    root.MonthlyPlan = { parseTable };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.MonthlyPlan;
})(typeof window !== 'undefined' ? window : globalThis);

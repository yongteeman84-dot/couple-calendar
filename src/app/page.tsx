'use client';

import { useState, useEffect } from 'react';

// Type Definitions
type ScheduleData = {
  [date: string]: { memo: string; color: string };
};

const COLORS = [
  { id: 'pink', value: '#ec4899' },
  { id: 'accent', value: '#6366f1' },
  { id: 'success', value: '#10b981' },
  { id: 'warning', value: '#f59e0b' },
  { id: 'danger', value: '#ef4444' },
];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [schedules, setSchedules] = useState<ScheduleData>({});
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState('');
  const [memoInput, setMemoInput] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0].value);

  // Fetch Schedules automatically
  const fetchSchedules = async () => {
    try {
      const res = await fetch('/api/schedule');
      const data = await res.json();
      setSchedules(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentDate(new Date());
    fetchSchedules();
  }, []);

  if (!currentDate) {
    return (
      <div className="app-container">
        <header><h1>우리 일정표 🤍</h1></header>
        <div className="loader-wrapper"><span className="loader"></span></div>
      </div>
    );
  }

  // Calendar Helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => {
    console.log("prevMonth clicked!");
    setCurrentDate(prev => {
      if (!prev) return new Date();
      const newD = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      console.log("New Prev Date:", newD.toISOString());
      return newD;
    });
  };

  const nextMonth = () => {
    console.log("nextMonth clicked!");
    setCurrentDate(prev => {
      if (!prev) return new Date();
      const newD = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
      console.log("New Next Date:", newD.toISOString());
      return newD;
    });
  };

  console.log("Calendar Rendering...", { currentDate: currentDate?.toISOString() });

  // Date Formatting for JSON mapping
  const toDateString = (y: number, m: number, d: number) => {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  const handleDayClick = (d: number) => {
    const dateStr = toDateString(year, month, d);
    setSelectedDateStr(dateStr);

    // Populate existing data if any
    const existing = schedules[dateStr];
    setMemoInput(existing?.memo || '');
    setSelectedColor(existing?.color || COLORS[0].value);

    setIsModalOpen(true);
  };

  const saveSchedule = async () => {
    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDateStr,
          memo: memoInput,
          color: selectedColor,
        }),
      });
      // Update local state instantly for snappy UI
      setSchedules(prev => {
        const next = { ...prev };
        if (!memoInput && selectedColor === COLORS[0].value) { // Very basic logic
          // keeping it simple
        }
        next[selectedDateStr] = { memo: memoInput, color: selectedColor };
        return next;
      });
      setIsModalOpen(false);
    } catch (e) {
      console.error('Failed to save', e);
    }
  };

  // Render Grid
  const renderCalendarDays = () => {
    const cells = [];
    const today = new Date();

    // Padding empty cells
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="day-cell empty" />);
    }

    // Actual days
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday =
        d === today.getDate() &&
        month === today.getMonth() &&
        year === today.getFullYear();

      const dateStr = toDateString(year, month, d);
      const schedule = schedules[dateStr];

      // Calculate day of week: (firstDay + dayOfMonth - 1) % 7
      const dayOfWeek = (firstDay + d - 1) % 7;
      let weekendClass = '';
      if (dayOfWeek === 0) weekendClass = 'sunday';
      if (dayOfWeek === 6) weekendClass = 'saturday';

      cells.push(
        <div
          key={d}
          className={`day-cell ${isToday ? 'today' : ''} ${weekendClass}`}
          onClick={() => handleDayClick(d)}
        >
          <span className="day-num">{d}</span>
          {schedule && schedule.memo && (
            <div
              className="schedule-indicator"
              style={{ background: schedule.color, boxShadow: `0 0 8px ${schedule.color}` }}
            />
          )}
        </div>
      );
    }
    return cells;
  };

  const formatModalDateTitle = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${m}월 ${d}일 일정 ✨`;
  };

  return (
    <div className="app-container">
      <header>
        <h1>우리 일정표 🤍</h1>
      </header>

      {loading ? (
        <div className="loader-wrapper"><span className="loader"></span></div>
      ) : (
        <main className="calendar-wrapper">
          <div className="calendar-header">
            <button onClick={prevMonth}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div className="month-label">
              {year}년 {month + 1}월
            </div>
            <button onClick={nextMonth}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>

          <div className="weekdays">
            <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
          </div>

          <div className="days-grid">
            {renderCalendarDays()}
          </div>
        </main>
      )}

      {/* Glassmorphic Modal */}
      <div className={`modal-overlay ${isModalOpen ? 'open' : ''}`} onClick={() => setIsModalOpen(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-handle" />
          <h2 className="modal-date">{formatModalDateTitle(selectedDateStr)}</h2>

          <div className="color-options">
            {COLORS.map(c => (
              <div
                key={c.id}
                className={`color-option ${selectedColor === c.value ? 'selected' : ''}`}
                style={{ background: c.value }}
                onClick={() => setSelectedColor(c.value)}
              />
            ))}
          </div>

          <textarea
            placeholder="어떤 약속이 있나요?"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
          />

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>취소</button>
            <button className="btn btn-primary" onClick={saveSchedule}>저장하기</button>
          </div>
        </div>
      </div>
    </div>
  );
}

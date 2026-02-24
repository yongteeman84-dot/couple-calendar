'use client';

import { useEffect, useState } from 'react';

type ScheduleData = Record<string, { memo: string; color: string }>;

const COLORS = [
  { id: 'pink', value: '#ec4899' },
  { id: 'accent', value: '#6366f1' },
  { id: 'success', value: '#10b981' },
  { id: 'warning', value: '#f59e0b' },
  { id: 'danger', value: '#ef4444' },
];

const DEFAULT_COLOR = COLORS[0].value;

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [schedules, setSchedules] = useState<ScheduleData>({});
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState('');
  const [memoInput, setMemoInput] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEFAULT_COLOR);

  const fetchSchedules = async () => {
    try {
      const res = await fetch('/api/schedule');
      const data = await res.json();
      setSchedules(data);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
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
        <header>
          <h1>우리 일정표</h1>
        </header>
        <div className="loader-wrapper">
          <span className="loader"></span>
        </div>
      </div>
    );
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const toDateString = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const prevMonth = () => {
    setCurrentDate((prev) => {
      if (!prev) return new Date();
      return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
    });
  };

  const nextMonth = () => {
    setCurrentDate((prev) => {
      if (!prev) return new Date();
      return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
    });
  };

  const handleDayClick = (d: number) => {
    const dateStr = toDateString(year, month, d);
    const existing = schedules[dateStr];

    setSelectedDateStr(dateStr);
    setMemoInput(existing?.memo ?? '');
    setSelectedColor(existing?.color ?? DEFAULT_COLOR);
    setIsModalOpen(true);
  };

  const saveSchedule = async () => {
    const trimmedMemo = memoInput.trim();
    const shouldDelete = trimmedMemo.length === 0 && selectedColor === DEFAULT_COLOR;

    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDateStr,
          memo: shouldDelete ? '' : trimmedMemo,
          color: shouldDelete ? '' : selectedColor,
        }),
      });

      setSchedules((prev) => {
        const next = { ...prev };
        if (shouldDelete) {
          delete next[selectedDateStr];
        } else {
          next[selectedDateStr] = { memo: trimmedMemo, color: selectedColor };
        }
        return next;
      });

      setIsModalOpen(false);
    } catch (error) {
      console.error('Failed to save schedule:', error);
    }
  };

  const formatModalDateTitle = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${y}년 ${m}월 ${d}일 일정`;
  };

  const renderCalendarDays = () => {
    const cells = [];
    const today = new Date();

    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="day-cell empty" />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const isToday =
        d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

      const dateStr = toDateString(year, month, d);
      const schedule = schedules[dateStr];
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
          {schedule?.memo && (
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

  return (
    <div className="app-container">
      <header>
        <h1>우리 일정표</h1>
      </header>

      {loading ? (
        <div className="loader-wrapper">
          <span className="loader"></span>
        </div>
      ) : (
        <main className="calendar-wrapper">
          <div className="calendar-header">
            <button onClick={prevMonth} aria-label="이전 달">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div className="month-label">
              {year}년 {month + 1}월
            </div>
            <button onClick={nextMonth} aria-label="다음 달">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>

          <div className="weekdays">
            <span>일</span>
            <span>월</span>
            <span>화</span>
            <span>수</span>
            <span>목</span>
            <span>금</span>
            <span>토</span>
          </div>

          <div className="days-grid">{renderCalendarDays()}</div>
        </main>
      )}

      <div
        className={`modal-overlay ${isModalOpen ? 'open' : ''}`}
        onClick={() => setIsModalOpen(false)}
      >
        <div className="modal-content" onClick={(event) => event.stopPropagation()}>
          <div className="modal-handle" />
          <h2 className="modal-date">{formatModalDateTitle(selectedDateStr)}</h2>

          <div className="color-options">
            {COLORS.map((color) => (
              <div
                key={color.id}
                className={`color-option ${selectedColor === color.value ? 'selected' : ''}`}
                style={{ background: color.value }}
                onClick={() => setSelectedColor(color.value)}
              />
            ))}
          </div>

          <textarea
            placeholder="메모를 입력하세요"
            value={memoInput}
            onChange={(event) => setMemoInput(event.target.value)}
          />

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              취소
            </button>
            <button className="btn btn-primary" onClick={saveSchedule}>
              저장하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

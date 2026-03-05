'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';

type ScheduleItem = {
  id: number;
  memo: string;
  color: string;
  sortOrder: number;
};

type DraftItem = {
  tempId: string;
  memo: string;
  color: string;
};

type ScheduleData = Record<string, ScheduleItem[]>;

const COLORS = [
  { id: 'pink', value: '#ec4899' },
  { id: 'accent', value: '#6366f1' },
  { id: 'success', value: '#10b981' },
  { id: 'warning', value: '#f59e0b' },
  { id: 'danger', value: '#ef4444' },
];

const DEFAULT_COLOR = COLORS[0].value;

const createDraftItem = (): DraftItem => ({
  tempId:
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  memo: '',
  color: DEFAULT_COLOR,
});

const reorderItemsByIds = (
  items: ScheduleItem[],
  draggingId: number,
  targetId: number
): ScheduleItem[] => {
  const fromIndex = items.findIndex((item) => item.id === draggingId);
  const toIndex = items.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

const applyOrder = (items: ScheduleItem[], orderedIds: number[]): ScheduleItem[] => {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const ordered: ScheduleItem[] = [];

  for (const id of orderedIds) {
    const item = itemMap.get(id);
    if (item) {
      ordered.push(item);
      itemMap.delete(id);
    }
  }

  // Keep leftovers safely appended if data changed while dragging.
  return [...ordered, ...itemMap.values()];
};

const normalizeSchedules = (raw: unknown): ScheduleData => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const normalized: ScheduleData = {};
  const entries = Object.entries(raw as Record<string, unknown>);

  for (const [date, value] of entries) {
    if (Array.isArray(value)) {
      const mapped = value
        .map((item, index) => {
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const memo = typeof record.memo === 'string' ? record.memo : '';
          const color =
            typeof record.color === 'string' && record.color
              ? record.color
              : DEFAULT_COLOR;
          const rawId = Number(record.id);
          const fallbackId = index + 1;
          const id = Number.isInteger(rawId) && rawId > 0 ? rawId : fallbackId;
          const rawSortOrder = Number(record.sortOrder ?? record.sort_order);
          const sortOrder = Number.isFinite(rawSortOrder) ? rawSortOrder : index;
          return { id, memo, color, sortOrder };
        })
        .filter((item): item is ScheduleItem => item !== null)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);

      if (mapped.length > 0) {
        normalized[date] = mapped;
      }
      continue;
    }

    // Backward compatibility: old API shape { date: { memo, color } }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const memo = typeof record.memo === 'string' ? record.memo : '';
      const color =
        typeof record.color === 'string' && record.color ? record.color : DEFAULT_COLOR;
      if (memo.trim().length > 0) {
        normalized[date] = [{ id: 1, memo, color, sortOrder: 0 }];
      }
    }
  }

  return normalized;
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [schedules, setSchedules] = useState<ScheduleData>({});
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([createDraftItem()]);
  const [savingDrafts, setSavingDrafts] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMemo, setEditMemo] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragSnapshot, setDragSnapshot] = useState<number[] | null>(null);
  const [reordering, setReordering] = useState(false);
  const didDropRef = useRef(false);

  const fetchSchedules = async () => {
    try {
      const res = await fetch('/api/schedule');
      if (!res.ok) {
        throw new Error(`Failed to fetch schedules: ${res.status}`);
      }
      const data = await res.json();
      setSchedules(normalizeSchedules(data));
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

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setEditMemo('');
    setEditColor(DEFAULT_COLOR);
    setDraggingId(null);
    setDragSnapshot(null);
    setDraftItems([createDraftItem()]);
  };

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

    setSelectedDateStr(dateStr);
    setDraftItems([createDraftItem()]);
    setEditingId(null);
    setEditMemo('');
    setEditColor(DEFAULT_COLOR);
    setIsModalOpen(true);
  };

  const addDraftRow = () => {
    setDraftItems((prev) => [...prev, createDraftItem()]);
  };

  const removeDraftRow = (tempId: string) => {
    setDraftItems((prev) => {
      const next = prev.filter((item) => item.tempId !== tempId);
      return next.length > 0 ? next : [createDraftItem()];
    });
  };

  const updateDraftMemo = (tempId: string, memo: string) => {
    setDraftItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, memo } : item))
    );
  };

  const updateDraftColor = (tempId: string, color: string) => {
    setDraftItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, color } : item))
    );
  };

  const saveDraftSchedules = async () => {
    const date = selectedDateStr;
    const sanitizedItems = draftItems
      .map((item) => ({ memo: item.memo.trim(), color: item.color }))
      .filter((item) => item.memo.length > 0);

    if (!date || sanitizedItems.length === 0) {
      return;
    }

    try {
      setSavingDrafts(true);
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createMany',
          date,
          items: sanitizedItems,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to save schedules');
      }

      const createdItems = Array.isArray(result?.items)
        ? result.items
            .map((item: Record<string, unknown>, index: number) => {
              const id = Number(item?.id);
              const memo = typeof item?.memo === 'string' ? item.memo : '';
              const color =
                typeof item?.color === 'string' && item.color
                  ? item.color
                  : DEFAULT_COLOR;
              const rawSortOrder = Number(item?.sortOrder ?? item?.sort_order);
              const sortOrder = Number.isFinite(rawSortOrder)
                ? rawSortOrder
                : index;

              if (!Number.isInteger(id) || id <= 0 || memo.length === 0) return null;
              return { id, memo, color, sortOrder };
            })
            .filter((item: ScheduleItem | null): item is ScheduleItem => item !== null)
        : [];

      if (createdItems.length > 0) {
        setSchedules((prev) => {
          const existing = prev[date] ?? [];
          return {
            ...prev,
            [date]: [...existing, ...createdItems],
          };
        });
      } else {
        await fetchSchedules();
      }

      setDraftItems([createDraftItem()]);
    } catch (error) {
      console.error('Failed to save schedules:', error);
    } finally {
      setSavingDrafts(false);
    }
  };

  const startEdit = (item: ScheduleItem) => {
    setEditingId(item.id);
    setEditMemo(item.memo);
    setEditColor(item.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditMemo('');
    setEditColor(DEFAULT_COLOR);
  };

  const saveEdit = async () => {
    const id = editingId;
    const memo = editMemo.trim();
    if (!id || memo.length === 0) {
      return;
    }

    try {
      setSavingEdit(true);
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id,
          memo,
          color: editColor,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to update schedule');
      }

      const item = result?.item as
        | { id?: number; memo?: string; color?: string; sortOrder?: number; sort_order?: number }
        | undefined;

      setSchedules((prev) => {
        const current = prev[selectedDateStr] ?? [];
        const next = current.map((schedule) => {
          if (schedule.id !== id) return schedule;
          return {
            ...schedule,
            memo: typeof item?.memo === 'string' ? item.memo : memo,
            color: typeof item?.color === 'string' ? item.color : editColor,
            sortOrder: Number(item?.sortOrder ?? item?.sort_order ?? schedule.sortOrder ?? 0),
          };
        });

        return {
          ...prev,
          [selectedDateStr]: next,
        };
      });

      cancelEdit();
    } catch (error) {
      console.error('Failed to update schedule:', error);
    } finally {
      setSavingEdit(false);
    }
  };

  const removeSchedule = async (id: number) => {
    if (!Number.isInteger(id) || id <= 0) {
      return;
    }

    try {
      setDeletingId(id);
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          id,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to delete schedule');
      }

      setSchedules((prev) => {
        const dateItems = prev[selectedDateStr] ?? [];
        const nextItems = dateItems.filter((item) => item.id !== id);
        const next = { ...prev };
        if (nextItems.length === 0) {
          delete next[selectedDateStr];
        } else {
          next[selectedDateStr] = nextItems;
        }
        return next;
      });

      if (editingId === id) {
        cancelEdit();
      }
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const persistReorder = async (date: string, orderedIds: number[], snapshotIds: number[]) => {
    try {
      setReordering(true);
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder',
          date,
          orderedIds,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to reorder schedules');
      }

      setSchedules((prev) => {
        const current = prev[date] ?? [];
        const ordered = applyOrder(current, orderedIds).map((item, index) => ({
          ...item,
          sortOrder: index,
        }));
        return {
          ...prev,
          [date]: ordered,
        };
      });
    } catch (error) {
      console.error('Failed to reorder schedules:', error);
      setSchedules((prev) => {
        const current = prev[date] ?? [];
        return {
          ...prev,
          [date]: applyOrder(current, snapshotIds),
        };
      });
    } finally {
      setReordering(false);
    }
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, id: number) => {
    event.dataTransfer.effectAllowed = 'move';
    didDropRef.current = false;
    setDraggingId(id);
    setDragSnapshot((schedules[selectedDateStr] ?? []).map((item) => item.id));
  };

  const handleDragOver = (event: DragEvent<HTMLLIElement>, targetId: number) => {
    event.preventDefault();
    if (draggingId === null || draggingId === targetId) return;

    const date = selectedDateStr;
    setSchedules((prev) => {
      const current = prev[date] ?? [];
      const next = reorderItemsByIds(current, draggingId, targetId);
      if (next === current) return prev;
      return {
        ...prev,
        [date]: next,
      };
    });
  };

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const date = selectedDateStr;
    const snapshotIds = dragSnapshot;

    didDropRef.current = true;
    setDraggingId(null);

    if (!date || !snapshotIds) {
      setDragSnapshot(null);
      return;
    }

    const orderedIds = (schedules[date] ?? []).map((item) => item.id);
    const unchanged =
      orderedIds.length === snapshotIds.length &&
      orderedIds.every((id, index) => id === snapshotIds[index]);

    if (!unchanged) {
      await persistReorder(date, orderedIds, snapshotIds);
    }

    setDragSnapshot(null);
  };

  const handleDragEnd = () => {
    if (!didDropRef.current && dragSnapshot && selectedDateStr) {
      const date = selectedDateStr;
      const snapshotIds = dragSnapshot;
      setSchedules((prev) => {
        const current = prev[date] ?? [];
        return {
          ...prev,
          [date]: applyOrder(current, snapshotIds),
        };
      });
    }

    didDropRef.current = false;
    setDraggingId(null);
    setDragSnapshot(null);
  };

  const formatModalDateTitle = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${y}년 ${Number(m)}월 ${Number(d)}일 일정`;
  };

  const selectedSchedules = schedules[selectedDateStr] ?? [];
  const hasValidDraft = draftItems.some((item) => item.memo.trim().length > 0);

  const renderCalendarDays = () => {
    const cells = [];
    const today = new Date();
    const totalCells = 42; // fixed 6-week grid for consistent mobile rendering

    for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
      const dayOfWeek = cellIndex % 7;
      const dayNumber = cellIndex - firstDay + 1;
      const inCurrentMonth = dayNumber >= 1 && dayNumber <= daysInMonth;

      let weekendClass = '';
      if (dayOfWeek === 0) weekendClass = 'sunday';
      if (dayOfWeek === 6) weekendClass = 'saturday';

      if (!inCurrentMonth) {
        cells.push(
          <div key={`empty-${cellIndex}`} className="day-cell empty" aria-hidden="true" />
        );
        continue;
      }

      const isToday =
        dayNumber === today.getDate() && month === today.getMonth() && year === today.getFullYear();

      const dateStr = toDateString(year, month, dayNumber);
      const daySchedules = schedules[dateStr] ?? [];
      const firstSchedule = daySchedules[0];
      const extraCount = Math.max(0, daySchedules.length - 1);

      cells.push(
        <div
          key={dateStr}
          className={`day-cell ${isToday ? 'today' : ''} ${weekendClass}`}
          onClick={() => handleDayClick(dayNumber)}
        >
          <span className="day-num">{dayNumber}</span>
          {firstSchedule && (
            <div className="schedule-meta">
              <div
                className="schedule-indicator"
                style={{
                  background: firstSchedule.color,
                  boxShadow: `0 0 8px ${firstSchedule.color}`,
                }}
              />
              {extraCount > 0 && <span className="schedule-count">+{extraCount}</span>}
            </div>
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

      <div className={`modal-overlay ${isModalOpen ? 'open' : ''}`} onClick={closeModal}>
        <div className="modal-content" onClick={(event) => event.stopPropagation()}>
          <div className="modal-handle" />
          <h2 className="modal-date">{formatModalDateTitle(selectedDateStr)}</h2>

          {selectedSchedules.length > 0 && (
            <div className="schedule-list">
              <h3 className="schedule-list-title">등록된 일정</h3>
              <p className="schedule-list-help">드래그 핸들을 잡고 순서를 바꿀 수 있어요.</p>
              <ul className="schedule-list-items" onDrop={handleDrop}>
                {selectedSchedules.map((item) => (
                  <li
                    key={item.id}
                    className={`schedule-list-item ${draggingId === item.id ? 'dragging' : ''}`}
                    onDragOver={(event) => handleDragOver(event, item.id)}
                    onDrop={handleDrop}
                  >
                    {editingId === item.id ? (
                      <div className="schedule-edit-box">
                        <input
                          className="schedule-edit-input"
                          value={editMemo}
                          onChange={(event) => setEditMemo(event.target.value)}
                          placeholder="일정 메모"
                        />
                        <div className="schedule-edit-colors">
                          {COLORS.map((color) => (
                            <button
                              key={`edit-${item.id}-${color.id}`}
                              type="button"
                              className={`schedule-edit-color ${
                                editColor === color.value ? 'selected' : ''
                              }`}
                              style={{ background: color.value }}
                              onClick={() => setEditColor(color.value)}
                            />
                          ))}
                        </div>
                        <div className="schedule-edit-actions">
                          <button
                            type="button"
                            className="schedule-list-delete"
                            onClick={cancelEdit}
                            disabled={savingEdit}
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            className="schedule-list-edit"
                            onClick={saveEdit}
                            disabled={savingEdit || editMemo.trim().length === 0}
                          >
                            {savingEdit ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="schedule-list-item-main">
                          <button
                            type="button"
                            className="schedule-drag-handle"
                            draggable
                            onDragStart={(event) => handleDragStart(event, item.id)}
                            onDragEnd={handleDragEnd}
                            aria-label="일정 순서 이동"
                            disabled={reordering || deletingId === item.id}
                          >
                            ⋮⋮
                          </button>
                          <span className="schedule-list-dot" style={{ background: item.color }} />
                          <span className="schedule-list-memo">{item.memo}</span>
                        </div>
                        <div className="schedule-list-actions">
                          <button
                            type="button"
                            className="schedule-list-edit"
                            onClick={() => startEdit(item)}
                            disabled={reordering || deletingId === item.id}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className="schedule-list-delete"
                            onClick={() => removeSchedule(item.id)}
                            disabled={deletingId === item.id || reordering}
                          >
                            {deletingId === item.id ? '삭제 중...' : '삭제'}
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {reordering && <p className="schedule-list-help">순서 저장 중...</p>}
            </div>
          )}

          <div className="draft-list">
            <h3 className="schedule-list-title">여러 일정 한 번에 추가</h3>
            <div className="draft-list-items">
              {draftItems.map((draft, index) => (
                <div key={draft.tempId} className="draft-item">
                  <div className="draft-item-head">
                    <span className="draft-item-index">{index + 1}</span>
                    <input
                      className="draft-item-input"
                      value={draft.memo}
                      onChange={(event) => updateDraftMemo(draft.tempId, event.target.value)}
                      placeholder="일정 메모 입력"
                    />
                    <button
                      type="button"
                      className="draft-item-remove"
                      onClick={() => removeDraftRow(draft.tempId)}
                      disabled={draftItems.length === 1}
                    >
                      삭제
                    </button>
                  </div>
                  <div className="draft-item-colors">
                    {COLORS.map((color) => (
                      <button
                        key={`${draft.tempId}-${color.id}`}
                        type="button"
                        className={`draft-color-option ${
                          draft.color === color.value ? 'selected' : ''
                        }`}
                        style={{ background: color.value }}
                        onClick={() => updateDraftColor(draft.tempId, color.value)}
                        aria-label="색상 선택"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-secondary draft-add-btn" onClick={addDraftRow}>
              + 입력칸 추가
            </button>
          </div>

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={closeModal}>
              닫기
            </button>
            <button
              className="btn btn-primary"
              onClick={saveDraftSchedules}
              disabled={savingDrafts || !hasValidDraft}
            >
              {savingDrafts ? '저장 중...' : '일정 추가'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

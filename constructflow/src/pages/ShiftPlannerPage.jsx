import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import {
  addDays,
  formatHour,
  formatShiftRange,
  startOfWeek,
  toDate,
  toDayKey,
} from "../utils/dateTime";
import {
  SHIFT_VALIDATION_ERROR,
  validateShiftsForDay,
} from "../utils/shiftValidation";
import "../styles/ShiftPlanner.css";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const ROLE_LABELS = {
  electrician: "Electrician",
  plumber: "Plumber",
};

export default function ShiftPlannerPage() {
  const { currentUser, organizationId } = useAuth();

  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [publishedShifts, setPublishedShifts] = useState([]);
  const [draftShifts, setDraftShifts] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [savingShift, setSavingShift] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [attendanceEntries, setAttendanceEntries] = useState([]);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrentHour, setDragCurrentHour] = useState(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const selectedWorker =
    workers.find((worker) => worker.uid === selectedWorkerId) || null;

  useEffect(() => {
    if (!organizationId) return;
    const loadWorkers = async () => {
      setLoadingData(true);
      try {
        const workersQuery = query(
          collection(db, "users"),
          where("organizationId", "==", organizationId),
          where("role", "in", ["electrician", "plumber"]),
        );
        const workerSnap = await getDocs(workersQuery);
        const list = workerSnap.docs
          .map((workerDoc) => ({ uid: workerDoc.id, ...workerDoc.data() }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        setWorkers(list);
        if (list.length > 0) {
          setSelectedWorkerId((prev) => prev || list[0].uid);
        }
      } catch (err) {
        console.error("Failed to load workers:", err);
      }
      setLoadingData(false);
    };

    loadWorkers();
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !selectedWorkerId) return;

    const loadShifts = async () => {
      try {
        const shiftsQuery = query(
          collection(db, "workerShifts"),
          where("organizationId", "==", organizationId),
          where("workerId", "==", selectedWorkerId),
        );
        const shiftSnap = await getDocs(shiftsQuery);
        const allShifts = shiftSnap.docs
          .map((shiftDoc) => {
            const raw = shiftDoc.data();
            return {
              id: shiftDoc.id,
              start: toDate(raw.startAt),
              end: toDate(raw.endAt),
              workerId: raw.workerId,
              workerName: raw.workerName,
              workerRole: raw.workerRole,
            };
          })
          .filter((shift) => shift.start && shift.end);

        const weekEnd = addDays(weekStart, 7);
        const inWeek = allShifts.filter(
          (shift) => shift.start >= weekStart && shift.start < weekEnd,
        );

        inWeek.sort((a, b) => a.start.getTime() - b.start.getTime());
        setPublishedShifts(inWeek);
        setDraftShifts(inWeek);
        setHasUnsavedChanges(false);
        setSaveMessage("");
      } catch (err) {
        console.error("Failed to load shifts:", err);
      }
    };

    loadShifts();
  }, [organizationId, selectedWorkerId, weekStart]);

  useEffect(() => {
    if (!organizationId || !selectedWorkerId) return;

    const loadAttendance = async () => {
      try {
        const attendanceQuery = query(
          collection(db, "workerAttendance"),
          where("organizationId", "==", organizationId),
          where("workerId", "==", selectedWorkerId),
        );
        const attendanceSnap = await getDocs(attendanceQuery);
        const weekEnd = addDays(weekStart, 7);

        const entries = attendanceSnap.docs
          .map((recordDoc) => {
            const raw = recordDoc.data();
            return {
              id: recordDoc.id,
              dayKey: raw.dayKey || null,
              clockInAt: toDate(raw.clockInAt),
              clockOutAt: toDate(raw.clockOutAt),
            };
          })
          .filter((entry) => entry.clockInAt)
          .filter(
            (entry) =>
              entry.clockInAt >= weekStart && entry.clockInAt < weekEnd,
          );

        if (selectedWorker?.isClockedIn && selectedWorker?.clockedInAt) {
          const liveClockIn = toDate(selectedWorker.clockedInAt);
          if (
            liveClockIn &&
            liveClockIn >= weekStart &&
            liveClockIn < weekEnd
          ) {
            const liveDayKey = toDayKey(liveClockIn);
            const alreadyHasEntry = entries.some(
              (entry) =>
                (entry.dayKey || toDayKey(entry.clockInAt)) === liveDayKey,
            );
            if (!alreadyHasEntry) {
              entries.push({
                id: `live-${selectedWorkerId}-${liveDayKey}`,
                dayKey: liveDayKey,
                clockInAt: liveClockIn,
                clockOutAt: null,
              });
            }
          }
        }

        setAttendanceEntries(entries);
      } catch (err) {
        console.error("Failed to load attendance:", err);
        setAttendanceEntries([]);
      }
    };

    loadAttendance();
  }, [organizationId, selectedWorkerId, weekStart, selectedWorker]);

  const shiftsByDay = useMemo(() => {
    const map = new Map();
    weekDays.forEach((day) => {
      map.set(day.toDateString(), []);
    });

    draftShifts.forEach((shift) => {
      const start = shift.start;
      const end = shift.end;
      if (!start || !end) return;
      const key = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
      ).toDateString();
      if (!map.has(key)) return;
      map.get(key).push({ ...shift, start, end });
    });

    return map;
  }, [draftShifts, weekDays]);

  const draftRange = useMemo(() => {
    if (!dragStart || dragCurrentHour === null) return null;
    const startHour = Math.min(dragStart.hour, dragCurrentHour);
    const endHour = Math.max(dragStart.hour, dragCurrentHour) + 1;
    return { dayIndex: dragStart.dayIndex, startHour, endHour };
  }, [dragStart, dragCurrentHour]);

  const attendanceByDay = useMemo(() => {
    const map = new Map();
    weekDays.forEach((day) => {
      map.set(day.toDateString(), []);
    });

    attendanceEntries.forEach((entry) => {
      const start = entry.clockInAt;
      if (!start) return;
      const dayKey = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
      ).toDateString();
      if (!map.has(dayKey)) return;

      const end = entry.clockOutAt || new Date();
      map.get(dayKey).push({ ...entry, start, end });
    });

    return map;
  }, [attendanceEntries, weekDays]);

  const deleteShift = (shiftId) => {
    setDraftShifts((prev) => prev.filter((shift) => shift.id !== shiftId));
    setHasUnsavedChanges(true);
    setSaveMessage("");
  };

  const saveWeeklyShifts = async () => {
    if (!organizationId || !selectedWorker || !currentUser?.uid) return;
    setSavingShift(true);
    setSaveMessage("");
    try {
      const shiftsByDayMap = new Map();
      for (const shift of draftShifts) {
        const key = toDayKey(shift.start);
        if (!shiftsByDayMap.has(key)) shiftsByDayMap.set(key, []);
        shiftsByDayMap.get(key).push(shift);
      }
      for (const [, dayShifts] of shiftsByDayMap) {
        const validation = validateShiftsForDay(dayShifts);
        if (!validation.ok) {
          if (validation.code === SHIFT_VALIDATION_ERROR.OVERLAP) {
            setSaveMessage("Shifts overlap on the same day.");
            setSavingShift(false);
            return;
          }
          if (validation.code === SHIFT_VALIDATION_ERROR.EXCEEDS_HOURS) {
          setSaveMessage("Total shift hours exceed 8 hours on the same day.");
          setSavingShift(false);
          return;
          }
        }
      }

      await Promise.all(
        publishedShifts.map((shift) =>
          deleteDoc(doc(db, "workerShifts", shift.id)),
        ),
      );

      const createdShifts = [];
      for (const shift of draftShifts) {
        const payload = {
          organizationId,
          workerId: selectedWorker.uid,
          workerName: selectedWorker.name || selectedWorker.email || "Worker",
          workerRole: selectedWorker.role || null,
          startAt: shift.start,
          endAt: shift.end,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, "workerShifts"), payload);
        createdShifts.push({
          id: docRef.id,
          start: shift.start,
          end: shift.end,
          workerId: payload.workerId,
          workerName: payload.workerName,
          workerRole: payload.workerRole,
        });
      }

      const now = Date.now();
      const sorted = [...createdShifts].sort(
        (a, b) => a.start.getTime() - b.start.getTime(),
      );
      const active = sorted.find(
        (shift) => now >= shift.start.getTime() && now <= shift.end.getTime(),
      );
      const upcoming = sorted.find((shift) => now < shift.start.getTime());
      const fallback = sorted[sorted.length - 1] || null;
      const representative = active || upcoming || fallback;

      await updateDoc(doc(db, "users", selectedWorker.uid), {
        shiftStartAt: representative ? representative.start : null,
        shiftEndAt: representative ? representative.end : null,
      });

      setPublishedShifts(createdShifts);
      setDraftShifts(createdShifts);
      setHasUnsavedChanges(false);
      setSaveMessage("Shift plan saved. Workers now see this final version.");
    } catch (err) {
      console.error("Failed to save shifts:", err);
      setSaveMessage("Failed to save shifts.");
    }
    setSavingShift(false);
  };

  useEffect(() => {
    if (!dragStart || draftRange === null) return;

    const handleMouseUp = async () => {
      if (
        !selectedWorker ||
        !organizationId ||
        !currentUser?.uid ||
        !draftRange
      ) {
        setDragStart(null);
        setDragCurrentHour(null);
        return;
      }

      const day = weekDays[draftRange.dayIndex];
      const startDate = new Date(day);
      startDate.setHours(draftRange.startHour, 0, 0, 0);
      const endDate = new Date(day);
      endDate.setHours(draftRange.endHour, 0, 0, 0);

      const dayKey = toDayKey(startDate);
      const dayShifts = draftShifts.filter(
        (shift) => toDayKey(shift.start) === dayKey,
      );

      const nextDayShifts = [...dayShifts, { start: startDate, end: endDate }];
      const validation = validateShiftsForDay(nextDayShifts);
      if (!validation.ok && validation.code === SHIFT_VALIDATION_ERROR.OVERLAP) {
        alert("This shift overlaps with an existing shift on the same day.");
        setDragStart(null);
        setDragCurrentHour(null);
        return;
      }

      const newHours = (endDate - startDate) / (1000 * 60 * 60);
      const existingHours = dayShifts.reduce(
        (sum, shift) => sum + (shift.end - shift.start) / (1000 * 60 * 60),
        0,
      );
      if (
        !validation.ok &&
        validation.code === SHIFT_VALIDATION_ERROR.EXCEEDS_HOURS
      ) {
        alert(
          `Adding this shift would exceed 8 hours for this day. Already scheduled: ${existingHours}h.`,
        );
        setDragStart(null);
        setDragCurrentHour(null);
        return;
      }

      const newDraftShift = {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        start: startDate,
        end: endDate,
        workerId: selectedWorker.uid,
        workerName: selectedWorker.name || selectedWorker.email || "Worker",
        workerRole: selectedWorker.role || null,
      };
      setDraftShifts((prev) => [...prev, newDraftShift]);
      setHasUnsavedChanges(true);
      setSaveMessage("");
      setDragStart(null);
      setDragCurrentHour(null);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [
    currentUser?.uid,
    dragStart,
    draftRange,
    organizationId,
    selectedWorker,
    draftShifts,
    weekDays,
  ]);

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Shift Planner" />

        <div className="shift-planner-page">
          <div className="shift-planner-header">
            <div>
              <h2>Weekly Shift Planner</h2>
              <p>
                Select a worker from the right panel. Calendar blocks only show
                shifts for that selected worker.
              </p>
            </div>
            <div className="week-nav">
              <button
                className="btn-primary"
                onClick={saveWeeklyShifts}
                disabled={savingShift || !selectedWorker || !hasUnsavedChanges}
              >
                {savingShift ? "Saving..." : "Save Shifts"}
              </button>
              <button
                className="btn-secondary"
                onClick={() => setWeekStart((prev) => addDays(prev, -7))}
                disabled={savingShift}
              >
                <MdChevronLeft /> Previous
              </button>
              <div className="week-label">
                {weekStart.toLocaleDateString()} -{" "}
                {addDays(weekStart, 6).toLocaleDateString()}
              </div>
              <button
                className="btn-secondary"
                onClick={() => setWeekStart((prev) => addDays(prev, 7))}
                disabled={savingShift}
              >
                Next <MdChevronRight />
              </button>
            </div>
          </div>

          {(hasUnsavedChanges || saveMessage) && (
            <p
              className={`shift-save-note${hasUnsavedChanges ? " pending" : ""}`}
            >
              {hasUnsavedChanges
                ? "You have unsaved shift changes. Workers still see the last saved plan."
                : saveMessage}
            </p>
          )}

          <div className="shift-planner-layout">
            <div className="shift-calendar-wrap">
              {loadingData ? (
                <div className="shift-loading">Loading workers...</div>
              ) : !selectedWorker ? (
                <div className="shift-loading">No workers available.</div>
              ) : (
                <>
                  <div className="shift-days-header">
                    <div className="time-col-header" />
                    {weekDays.map((day) => (
                      <div key={day.toDateString()} className="day-col-header">
                        <span>
                          {day.toLocaleDateString([], { weekday: "short" })}
                        </span>
                        <strong>
                          {day.toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </strong>
                      </div>
                    ))}
                  </div>

                  <div className="shift-grid-scroll">
                    <div className="shift-grid">
                      <div className="time-col">
                        {HOURS.map((hour) => (
                          <div key={hour} className="time-cell">
                            {formatHour(hour)}
                          </div>
                        ))}
                      </div>

                      {weekDays.map((day, dayIndex) => {
                        const dayShifts =
                          shiftsByDay.get(day.toDateString()) || [];
                        const dayAttendance =
                          attendanceByDay.get(day.toDateString()) || [];
                        return (
                          <div key={day.toDateString()} className="day-col">
                            {HOURS.map((hour) => {
                              const isDraft =
                                draftRange &&
                                draftRange.dayIndex === dayIndex &&
                                hour >= draftRange.startHour &&
                                hour < draftRange.endHour;

                              return (
                                <div
                                  key={`${day.toDateString()}-${hour}`}
                                  className={`grid-cell${isDraft ? " draft" : ""}`}
                                  onMouseDown={() => {
                                    if (savingShift) return;
                                    setDragStart({ dayIndex, hour });
                                    setDragCurrentHour(hour);
                                  }}
                                  onMouseEnter={() => {
                                    if (
                                      !dragStart ||
                                      dragStart.dayIndex !== dayIndex
                                    )
                                      return;
                                    setDragCurrentHour(hour);
                                  }}
                                />
                              );
                            })}

                            {dayShifts.map((shift) => {
                              const top = shift.start.getHours() * 48;
                              const hours = Math.max(
                                1,
                                (shift.end.getTime() - shift.start.getTime()) /
                                  (60 * 60 * 1000),
                              );
                              const height = hours * 48;

                              return (
                                <div
                                  key={shift.id}
                                  className="shift-block"
                                  style={{
                                    top: `${top}px`,
                                    height: `${height}px`,
                                  }}
                                >
                                  <div className="shift-block-time">
                                    {formatShiftRange(shift.start, shift.end)}
                                  </div>
                                  <button
                                    className="shift-delete"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteShift(shift.id);
                                    }}
                                    title="Delete shift"
                                  >
                                    x
                                  </button>
                                </div>
                              );
                            })}

                            {dayAttendance.map((entry) => {
                              const startDecimal =
                                entry.start.getHours() +
                                entry.start.getMinutes() / 60;
                              const endDate = entry.end;
                              const endDecimal =
                                endDate.getHours() + endDate.getMinutes() / 60;
                              const top = startDecimal * 48;
                              const height = Math.max(
                                12,
                                (endDecimal - startDecimal) * 48,
                              );

                              return (
                                <div
                                  key={entry.id}
                                  className="shift-attendance-overlay"
                                  style={{
                                    top: `${top}px`,
                                    height: `${height}px`,
                                  }}
                                >
                                  <span className="shift-attendance-time">
                                    {entry.clockOutAt
                                      ? `Attended ${formatShiftRange(entry.start, entry.end)}`
                                      : `In shift since ${entry.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <aside className="shift-workers-panel">
              <h3>Workers</h3>
              <p className="shift-workers-hint">
                Choose one worker to display and edit their weekly blocks.
              </p>

              <div className="shift-worker-list">
                {workers.map((worker) => {
                  const isSelected = selectedWorkerId === worker.uid;
                  return (
                    <button
                      key={worker.uid}
                      className={`shift-worker-item${isSelected ? " active" : ""}`}
                      onClick={() => setSelectedWorkerId(worker.uid)}
                    >
                      <span className="shift-worker-name">
                        {worker.name || worker.email}
                      </span>
                      <span className="shift-worker-role">
                        {ROLE_LABELS[worker.role] || worker.role || "Worker"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

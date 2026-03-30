export const SHIFT_VALIDATION_ERROR = {
  OVERLAP: "OVERLAP",
  EXCEEDS_HOURS: "EXCEEDS_HOURS",
};

export const MAX_SHIFT_HOURS_PER_DAY = 8;

export function getShiftDurationHours(shift) {
  return (shift.end - shift.start) / (1000 * 60 * 60);
}

export function validateShiftsForDay(dayShifts = []) {
  const sorted = [...dayShifts].sort((a, b) => a.start - b.start);

  let totalHours = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].start < sorted[i - 1].end) {
      return {
        ok: false,
        code: SHIFT_VALIDATION_ERROR.OVERLAP,
      };
    }
    totalHours += getShiftDurationHours(sorted[i]);
  }

  if (totalHours > MAX_SHIFT_HOURS_PER_DAY) {
    return {
      ok: false,
      code: SHIFT_VALIDATION_ERROR.EXCEEDS_HOURS,
      totalHours,
    };
  }

  return {
    ok: true,
    totalHours,
  };
}
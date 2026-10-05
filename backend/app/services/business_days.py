"""Business-day time accounting.

The SLA clock runs continuously (24h/day) on working days and stops completely on
Saturdays and Sundays, evaluated in the configured local timezone. One business day
equals 86 400 business seconds; DST transition days contribute their real length.
"""
from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.config import get_settings

DAY_SECONDS = 86_400


@lru_cache
def _tz() -> ZoneInfo:
    return ZoneInfo(get_settings().app_timezone)


def _midnight(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=_tz())


def end_of_day(d: date) -> datetime:
    """The instant a local calendar day ends (next local midnight): deadline of a due date."""
    return _midnight(d + timedelta(days=1))


def local_today() -> date:
    return datetime.now(_tz()).date()


def _is_business_day(d: date) -> bool:
    return d.weekday() < 5


def business_seconds(start: datetime, end: datetime) -> float:
    """Seconds between start and end that fall on Monday-Friday (local time)."""
    if end <= start:
        return 0.0
    total = 0.0
    day = start.astimezone(_tz()).date()
    last = end.astimezone(_tz()).date()
    while day <= last:
        if _is_business_day(day):
            lo = max(start, _midnight(day))
            hi = min(end, _midnight(day + timedelta(days=1)))
            if hi > lo:
                total += (hi - lo).total_seconds()
        day += timedelta(days=1)
    return total


def business_days(start: datetime, end: datetime) -> float:
    return business_seconds(start, end) / DAY_SECONDS


def add_business_days(start: datetime, days: float) -> datetime:
    """The instant at which `days` business days have elapsed since `start`."""
    remaining = days * DAY_SECONDS
    cursor = start.astimezone(_tz())
    while True:
        day = cursor.date()
        next_midnight = _midnight(day + timedelta(days=1))
        if _is_business_day(day):
            available = (next_midnight - cursor).total_seconds()
            if remaining <= available:
                return cursor + timedelta(seconds=remaining)
            remaining -= available
        cursor = next_midnight


def merge_intervals(intervals: Iterable[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    """Merge overlapping/adjacent intervals; drops empty ones."""
    merged: list[tuple[datetime, datetime]] = []
    for s, e in sorted((s, e) for s, e in intervals if e > s):
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def business_seconds_union(
    intervals: Iterable[tuple[datetime, datetime]], clip_start: datetime, clip_end: datetime
) -> float:
    """Business seconds covered by the union of intervals, clipped to [clip_start, clip_end]."""
    clipped = ((max(s, clip_start), min(e, clip_end)) for s, e in intervals)
    return sum(business_seconds(s, e) for s, e in merge_intervals(clipped))

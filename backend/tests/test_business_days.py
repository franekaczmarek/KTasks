"""Unit tests for business-day SLA arithmetic (timezone Europe/Warsaw)."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.services.business_days import (
    DAY_SECONDS, add_business_days, business_days, business_seconds, business_seconds_union, merge_intervals,
)

WAW = ZoneInfo("Europe/Warsaw")


def at(y, m, d, h=0, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=WAW)


# 2026-10-05 is a Monday.
MON, FRI, SAT, SUN, NEXT_MON = at(2026, 10, 5), at(2026, 10, 9), at(2026, 10, 10), at(2026, 10, 11), at(2026, 10, 12)


def test_same_day_hours():
    assert business_seconds(at(2026, 10, 5, 9), at(2026, 10, 5, 17)) == 8 * 3600


def test_full_week_is_five_days():
    assert business_days(MON, NEXT_MON) == 5


def test_weekend_only_is_zero():
    assert business_seconds(SAT, NEXT_MON) == 0
    assert business_seconds(at(2026, 10, 10, 10), at(2026, 10, 11, 22)) == 0


def test_friday_evening_to_monday_morning():
    # Fri 18:00 -> Sat 00:00 = 6h, Mon 00:00 -> 09:00 = 9h
    assert business_seconds(at(2026, 10, 9, 18), at(2026, 10, 12, 9)) == 15 * 3600


def test_reversed_or_equal_is_zero():
    assert business_seconds(FRI, MON) == 0
    assert business_seconds(MON, MON) == 0


def test_accepts_utc_inputs():
    utc_start = at(2026, 10, 9, 18).astimezone(ZoneInfo("UTC"))
    utc_end = at(2026, 10, 12, 9).astimezone(ZoneInfo("UTC"))
    assert business_seconds(utc_start, utc_end) == 15 * 3600


def test_dst_end_day_counts_real_length():
    # 2026-10-25 (Sun) clocks go back; it's a weekend so contributes nothing.
    assert business_days(at(2026, 10, 23), at(2026, 10, 27)) == 2  # Fri + Mon
    # 2026-03-30 is Monday after DST start (Sun 29th): full weekdays still 24h each.
    assert business_days(at(2026, 3, 30), at(2026, 3, 31)) == 1


@pytest.mark.parametrize("start,days,expected", [
    (at(2026, 10, 5, 10), 1, at(2026, 10, 6, 10)),        # Mon -> Tue
    (at(2026, 10, 9, 10), 1, at(2026, 10, 12, 10)),       # Fri -> Mon (skips weekend)
    (at(2026, 10, 5, 10), 5, at(2026, 10, 12, 10)),       # one full week
    (at(2026, 10, 10, 15), 1, at(2026, 10, 13, 0)),       # Sat start: clock starts Monday 00:00
    (at(2026, 10, 9, 23), 0.5, at(2026, 10, 12, 11)),     # 1h Fri + 11h Mon
])
def test_add_business_days(start, days, expected):
    assert add_business_days(start, days) == expected


@pytest.mark.parametrize("start", [at(2026, 10, 5, 10), at(2026, 10, 9, 23), at(2026, 10, 10, 12), at(2026, 10, 22, 8)])
@pytest.mark.parametrize("days", [0.25, 1, 3, 5, 12])
def test_add_is_inverse_of_measure(start, days):
    end = add_business_days(start, days)
    assert business_seconds(start, end) == pytest.approx(days * DAY_SECONDS)


def test_merge_intervals():
    h = lambda n: MON + timedelta(hours=n)  # noqa: E731
    assert merge_intervals([(h(5), h(8)), (h(0), h(2)), (h(1), h(3)), (h(3), h(4)), (h(9), h(9))]) == [
        (h(0), h(4)), (h(5), h(8)),
    ]


def test_union_clips_and_dedupes_overlaps():
    h = lambda n: MON + timedelta(hours=n)  # noqa: E731
    # Two overlapping blockers 0-10h and 5-12h -> 12h, clipped to start at 2h -> 10h.
    assert business_seconds_union([(h(0), h(10)), (h(5), h(12))], h(2), h(100)) == 10 * 3600
    # Blocker spanning a weekend only counts weekdays.
    assert business_seconds_union([(FRI, NEXT_MON + timedelta(hours=6))], MON, NEXT_MON + timedelta(days=1)) == (
        30 * 3600
    )

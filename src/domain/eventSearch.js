// Pure functions: events in, events out. No store, no side effects.
// That makes them trivial to test and reuse (the API and the UI can share them).

import { DomainError } from './errors.js';
import { mergeSort } from './sorting.js';

function invalid(message) {
  throw new DomainError('VALIDATION', message);
}

function parseDate(value, field, endOfDay = false) {
  if (typeof value !== 'string' || value.trim() === '') invalid(`${field} must be a valid date`);
  const text = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const date = new Date(dateOnly && endOfDay ? `${text}T23:59:59.999Z` : text);
  if (Number.isNaN(date.getTime())) invalid(`${field} must be a valid date`);
  if (dateOnly) {
    const [year, month, day] = text.split('-').map(Number);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
      invalid(`${field} must be a valid date`);
    }
  }
  return date.getTime();
}

function cheapestPrice(summary) {
  if (Number.isInteger(summary.cheapestPriceCents)) return summary.cheapestPriceCents;
  if (!summary.tiers?.length) return undefined;
  return Math.min(...summary.tiers.map((tier) => tier.priceCents));
}

function seatsLeft(summary) {
  if (Number.isInteger(summary.seatsLeft)) return summary.seatsLeft;
  return (summary.tiers ?? []).reduce(
    (total, tier) => total + (Number.isInteger(tier.seatsLeft) ? tier.seatsLeft : tier.capacity - tier.sold),
    0,
  );
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

// CHANGED: title comparison is now case-insensitive.
// 'Jazz' and 'jazz' are treated as equal at the title step and fall through to id.
function tieBreak(left, right) {
  const leftTitle = String(left.title ?? '').toLocaleLowerCase();
  const rightTitle = String(right.title ?? '').toLocaleLowerCase();
  return compareText(leftTitle, rightTitle) || compareText(left.id, right.id);
}

export function filterEvents(summaries, {
  q,
  city,
  from,
  to,
  maxPriceCents,
  onlyAvailable = false,
} = {}) {
  const fromTime = from === undefined ? undefined : parseDate(from, 'from');
  const toTime = to === undefined ? undefined : parseDate(to, 'to', true);

  // CHANGED: negative maxPriceCents is now rejected as VALIDATION.
  // A negative price filter is a caller bug, not a legitimate query.
  if (maxPriceCents !== undefined && (!Number.isInteger(maxPriceCents) || maxPriceCents < 0)) {
  invalid('maxPriceCents must be a whole number of cents');
}

  const query = q === undefined ? undefined : String(q).toLocaleLowerCase();
  const wantedCity = city === undefined ? undefined : String(city).toLocaleLowerCase();

  return summaries.filter((summary) => {
    const title = String(summary.title ?? '');
    const venue = String(summary.venue ?? '');
    if (query !== undefined && !title.toLocaleLowerCase().includes(query)
      && !venue.toLocaleLowerCase().includes(query)) return false;
    if (wantedCity !== undefined && summary.city?.toLocaleLowerCase() !== wantedCity) return false;
    const startsAt = new Date(summary.startsAt).getTime();
    if (fromTime !== undefined && (Number.isNaN(startsAt) || startsAt < fromTime)) return false;
    if (toTime !== undefined && (Number.isNaN(startsAt) || startsAt > toTime)) return false;
    if (maxPriceCents !== undefined) {
      const price = cheapestPrice(summary);
      if (price === undefined || price > maxPriceCents) return false;
    }
    if (onlyAvailable && seatsLeft(summary) <= 0) return false;
    return true;
  });
}

// CHANGED: sortBy now defaults to 'date'.
export function sortEvents(summaries, sortBy = 'date') {
  if (!['date', 'price', 'availability'].includes(sortBy)) {
    invalid('sortBy must be date, price, or availability');
  }
  return mergeSort(summaries, (left, right) => {
    let result;
    if (sortBy === 'date') {
      result = new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
    } else if (sortBy === 'price') {
      const leftPrice = cheapestPrice(left);
      const rightPrice = cheapestPrice(right);
      if (leftPrice === undefined && rightPrice === undefined) result = 0;
      else if (leftPrice === undefined) result = 1;
      else if (rightPrice === undefined) result = -1;
      else result = leftPrice - rightPrice;
    } else {
      result = seatsLeft(right) - seatsLeft(left);
    }
    return result || tieBreak(left, right);
  });
}

export function searchEvents(summaries, criteria = {}, sortBy = 'date') {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
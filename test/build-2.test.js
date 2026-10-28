import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTier,
  bookTickets,
  createEvent,
  createStore,
  listEventSummaries,
  publishEvent,
  seatsLeft,
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';
import { filterEvents, searchEvents, sortEvents } from '../src/domain/eventSearch.js';
import { mergeSort } from '../src/domain/sorting.js';

function errorCode(action) {
  let thrown;
  assert.throws(action, (error) => {
    thrown = error;
    assert.ok(error instanceof DomainError);
    return true;
  });
  return thrown.code;
}

function makeStore() {
  const store = createStore();
  const event = createEvent(store, {
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Yaba Hub',
    startsAt: '2026-12-05T17:00:00Z',
    organizerId: 'organizer-1',
  });
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 3 });
  return { store, event, tier };
}

// ─────────────────────────────────────────────────────────────
// S02 — create event
// ─────────────────────────────────────────────────────────────

test('S02 creates a draft event with an id and hides it publicly', () => {
  const { store, event } = makeStore();
  assert.equal(event.status, 'draft');
  assert.equal(event.id.length > 0, true);
  assert.deepEqual(listEventSummaries(store), []);
});

test('S02 rejects missing title, city, and invalid dates without saving', () => {
  for (const input of [
    { title: '', city: 'Lagos', startsAt: '2026-12-05' },
    { title: 'Event', city: '', startsAt: '2026-12-05' },
    { title: 'Event', city: 'Lagos', startsAt: 'not-a-date' },
  ]) {
    const store = createStore();
    assert.equal(errorCode(() => createEvent(store, input)), 'VALIDATION');
    assert.equal(store.events.size, 0);
  }
});

// ─────────────────────────────────────────────────────────────
// S03 — ticket tiers
// ─────────────────────────────────────────────────────────────

test('S03 adds a tier with zero sold and the expected seats left', () => {
  const { tier } = makeStore();
  assert.equal(tier.sold, 0);
  assert.equal(seatsLeft(tier), 3);
});

test('S03 rejects non-whole prices and invalid capacities', () => {
  const { store, event } = makeStore();
  assert.equal(errorCode(() => addTier(store, event.id, {
    name: 'VIP', priceCents: 10.5, capacity: 2,
  })), 'VALIDATION');
  assert.equal(errorCode(() => addTier(store, event.id, {
    name: 'VIP', priceCents: 1000, capacity: 0,
  })), 'VALIDATION');
});

test('S03 rejects an unknown event id', () => {
  const store = createStore();
  assert.equal(errorCode(() => addTier(store, 'missing', {
    name: 'General', priceCents: 1000, capacity: 2,
  })), 'NOT_FOUND');
});

// ─────────────────────────────────────────────────────────────
// S04 — publish
// ─────────────────────────────────────────────────────────────

test('S04 refuses to publish an event without tiers', () => {
  const store = createStore();
  const event = createEvent(store, {
    title: 'No Tickets', city: 'Lagos', startsAt: '2026-12-05', organizerId: 'org',
  });
  assert.equal(errorCode(() => publishEvent(store, event.id)), 'INVALID_STATE');
});

test('S04 publishes an event and includes it in the public list', () => {
  const { store, event } = makeStore();
  assert.equal(publishEvent(store, event.id).status, 'published');
  assert.equal(listEventSummaries(store).length, 1);
});

test('S04 publishing an unknown event returns NOT_FOUND', () => {
  assert.equal(errorCode(() => publishEvent(createStore(), 'missing')), 'NOT_FOUND');
});

test('S04 drafts are hidden from the public list, included when publishedOnly=false', () => {
  const { store, event } = makeStore();
  assert.deepEqual(listEventSummaries(store), []);
  assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 1);
  publishEvent(store, event.id);
  assert.equal(listEventSummaries(store).length, 1);
});

test('S04 republishing a published event is a no-op', () => {
  // NOTE: if your publishEvent throws INVALID_STATE on republish,
  // swap the body to: assert.equal(errorCode(() => publishEvent(store, event.id)), 'INVALID_STATE')
  const { store, event } = makeStore();
  publishEvent(store, event.id);
  assert.equal(publishEvent(store, event.id).status, 'published');
});

// ─────────────────────────────────────────────────────────────
// Shared fixture for S05
// ─────────────────────────────────────────────────────────────

function summaries() {
  return [
    {
      id: 'a', title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Yaba Hub',
      startsAt: '2026-12-05T17:00:00Z',
      tiers: [{ priceCents: 500000, capacity: 3, sold: 1 }],
    },
    {
      id: 'b', title: 'Abuja Jazz Night', city: 'Abuja', venue: 'Arts Centre',
      startsAt: '2026-12-04T19:00:00Z',
      tiers: [{ priceCents: 250000, capacity: 10, sold: 10 }],
    },
    {
      id: 'c', title: 'Free Park Show', city: 'Lagos', venue: 'Central Park',
      startsAt: '2026-12-05T09:00:00Z',
      tiers: [],
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// S05 — search / filter / sort
// ─────────────────────────────────────────────────────────────

test('S05 searches title and venue case-insensitively and filters city', () => {
  assert.deepEqual(filterEvents(summaries(), { q: 'JAZZ' }).map((event) => event.id), ['b']);
  assert.deepEqual(filterEvents(summaries(), { city: 'lagos' }).map((event) => event.id), ['a', 'c']);
});

test('S05 filters by cheapest price, availability, and inclusive date-only to', () => {
  assert.deepEqual(
    searchEvents(summaries(), { to: '2026-12-05', onlyAvailable: true }, 'price').map((event) => event.id),
    ['a'],
  );
  assert.deepEqual(filterEvents(summaries(), { maxPriceCents: 300000 }).map((event) => event.id), ['b']);
});

test('S05 sorts by date, price, and availability with tie breakers', () => {
  const input = summaries();
  assert.deepEqual(sortEvents(input, 'date').map((event) => event.id), ['b', 'c', 'a']);
  assert.deepEqual(sortEvents(input, 'price').map((event) => event.id), ['b', 'a', 'c']);
  assert.deepEqual(sortEvents(input, 'availability').map((event) => event.id), ['a', 'b', 'c']);
});

test('S05 rejects bad dates, non-whole prices, and unknown sort options', () => {
  assert.equal(errorCode(() => filterEvents(summaries(), { from: 'bad' })), 'VALIDATION');
  assert.equal(errorCode(() => filterEvents(summaries(), { maxPriceCents: 1.2 })), 'VALIDATION');
  assert.equal(errorCode(() => sortEvents(summaries(), 'name')), 'VALIDATION');
});

test('S05 leaves the original list unchanged and supports empty lists', () => {
  const input = summaries();
  const before = structuredClone(input);
  assert.deepEqual(searchEvents([], {}, 'date'), []);
  searchEvents(input, { q: 'event' }, 'date');
  assert.deepEqual(input, before);
});

// ── gap tests added during review ──

test('S05 filters correctly when maxPriceCents is omitted', () => {
  const result = filterEvents(summaries(), { q: 'Jazz' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'b');
});

test('S05 from date bound is inclusive and excludes earlier events', () => {
  const result = filterEvents(summaries(), { from: '2026-12-05' });
  assert.deepEqual(result.map((e) => e.id).sort(), ['a', 'c']);
});

test('S05 from and to together bound the range', () => {
  const result = filterEvents(summaries(), { from: '2026-12-05', to: '2026-12-05' });
  assert.deepEqual(result.map((e) => e.id).sort(), ['a', 'c']);
});

test('S05 from is inclusive at exact midnight boundary', () => {
  const input = [
    { id: 'exact', startsAt: '2026-12-05T00:00:00.000Z', title: 'A', city: 'L', venue: 'V', tiers: [] },
    { id: 'before', startsAt: '2026-12-04T23:59:59.999Z', title: 'A', city: 'L', venue: 'V', tiers: [] },
  ];
  assert.deepEqual(filterEvents(input, { from: '2026-12-05' }).map((e) => e.id), ['exact']);
});

test('S05 to is inclusive at exact end of day', () => {
  const input = [
    { id: 'end', startsAt: '2026-12-05T23:59:59.999Z', title: 'A', city: 'L', venue: 'V', tiers: [] },
    { id: 'after', startsAt: '2026-12-06T00:00:00.000Z', title: 'A', city: 'L', venue: 'V', tiers: [] },
  ];
  assert.deepEqual(filterEvents(input, { to: '2026-12-05' }).map((e) => e.id), ['end']);
});

test('S05 city is an exact match, not a partial match', () => {
  assert.deepEqual(filterEvents(summaries(), { city: 'lag' }), []);
});

test('S05 rejects negative maxPriceCents with VALIDATION', () => {
  assert.equal(errorCode(() => filterEvents(summaries(), { maxPriceCents: -1 })), 'VALIDATION');
});

test('S05 title tiebreaker is case-insensitive, falls through to id', () => {
  const input = [
    { id: 'z', title: 'jazz', startsAt: '2026-12-05T10:00:00Z', city: 'L', venue: 'V', tiers: [] },
    { id: 'a', title: 'Jazz', startsAt: '2026-12-05T10:00:00Z', city: 'L', venue: 'V', tiers: [] },
  ];
  assert.deepEqual(sortEvents(input, 'date').map((e) => e.id), ['a', 'z']);
});

test('S05 sortEvents defaults to date ordering', () => {
  assert.deepEqual(sortEvents(summaries()).map((e) => e.id), ['b', 'c', 'a']);
});

// ─────────────────────────────────────────────────────────────
// mergeSort
// ─────────────────────────────────────────────────────────────

test('mergeSort is stable, returns a new list, and does not mutate its input', () => {
  const input = [{ key: 1, id: 'first' }, { key: 1, id: 'second' }, { key: 0, id: 'third' }];
  const sorted = mergeSort(input, (left, right) => left.key - right.key);
  assert.deepEqual(sorted.map((item) => item.id), ['third', 'first', 'second']);
  assert.notStrictEqual(sorted, input);
  assert.deepEqual(input.map((item) => item.id), ['first', 'second', 'third']);
});

// ─────────────────────────────────────────────────────────────
// S06 — booking
// ─────────────────────────────────────────────────────────────

test('S06 creates a pending booking and rejects overselling without changing seats', () => {
  const { store, event, tier } = makeStore();
  publishEvent(store, event.id);
  const booking = bookTickets(store, tier.id, 'user-1', 2);
  assert.equal(booking.status, 'pending');
  assert.equal(booking.amountCents, 1000000);
  assert.equal(seatsLeft(tier), 1);
  assert.equal(errorCode(() => bookTickets(store, tier.id, 'user-2', 2)), 'SOLD_OUT');
  assert.equal(seatsLeft(tier), 1);
});

test('S06 rejects zero, negative, fractional, and over-limit quantities', () => {
  const { store, tier } = makeStore();
  for (const quantity of [0, -1, 1.5, 11]) {
    assert.equal(errorCode(() => bookTickets(store, tier.id, 'user-1', quantity)), 'VALIDATION');
  }
});

test('S06 oversell leaves the entire store unchanged', () => {
  const { store, event, tier } = makeStore();
  publishEvent(store, event.id);
  bookTickets(store, tier.id, 'user-1', 2);

  const before = structuredClone({
    events: [...store.events.values()],
    bookings: [...(store.bookings?.values?.() ?? [])],
  });

  assert.equal(errorCode(() => bookTickets(store, tier.id, 'user-2', 2)), 'SOLD_OUT');

  const after = structuredClone({
    events: [...store.events.values()],
    bookings: [...(store.bookings?.values?.() ?? [])],
  });
  assert.deepEqual(after, before);
});
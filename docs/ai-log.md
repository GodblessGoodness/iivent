# AI Interaction Log - Build 1
 
## Overview
 Throughout Build 1, I used AI to generate initial drafts for our backend domain logic, then compared the outputs against the tutor's reference implementation to analyze performance, syntax, and algorithmic efficiency before commiting the final code.

## Entry 1: Custom Errors 
('src/domain/errors.js')

### *What I asked:*
 "Create a custom DomainError class that extends Error, so that the domain layer can throw errors with a machine-readable code and a structured details object. Every error should have name = 'DomainError' so callers can distinguish our errors from built-in JavaScript errors, and code should be a short string like VALIDATION or SOLD_OUT so callers can branch on it without parsing messages."

### *What came back:*
 A subclass of Error that called super(message), set name, code, and a defaulted details = {} object.

### *What was changed & why:*
 Nothing. Compared against the instructor's reference and the two were functionally identical — same constructor signature, same fields, same defaults. This is a small utility where "extend Error, add a code, add details" has essentially one right answer, so convergence was the expected outcome, not a sign the prompt was vague. Kept the reference version unchanged.

## Entry 2: ID generation
('src/domain/ids.js')

### *What I asked:*
 Write helpers for a UUID (newId()) and a short human-friendly booking reference of around 8 characters.

### *What came back:*
 newId() via randomUUID(), and newReference() with a hard-coded 8-character loop over a 32-char alphabet.

### *What changed & why:*
 By reading the instructor's version I learned three things my draft got wrong or missed. First, the helper should be named referenceCode, not newReference — every other file in the domain says "reference" (bookingsByReference, findBookingByReference), so the tutor's naming keeps the vocabulary consistent and I adopted it. Second, the length should be a parameter (length = 8) rather than hard-coded, so it flows from the argument through randomBytes and the loop; in my draft the 8 appeared twice, so changing one and not the other would either shorten the code silently or crash. Third, for...of bytes is safer than indexing — same reasoning. I also learned from the tutor's comments, not just the code: the alphabet is exactly 32 characters because 32 divides 256 evenly (no modulo bias), and crypto is used instead of Math.random because these codes are what stands between a customer and their booking. 

## Entry 3: 
('src/domain/waitlistQueue.js')

### *What I asked:*
 A FIFO queue for sold-out ticket tiers, with enqueue, dequeue, peek, and size.

### *What came back:*
 A WaitlistQueue class wrapping a plain array. enqueue did push, dequeue did shift, peek returned the whole array (clearly a bug — should have been this.queue[0]), size() was a method rather than a property, and enqueue validated that the entry had a userId.

### *What changed & why:*
 By looking at the instructor's version I learned the single most important thing in this file: Array.shift() is O(n), because every remaining element has to be re-indexed to close the gap at the front. For a waitlist of 10 people that's invisible; for 10,000 it's a real cost paid on every single dequeue. The instructor replaced the array with a linked list — each node holds a value and a pointer to the next — so dequeue only ever touches the head, which is O(1) regardless of length. enqueue appends at #tail, also O(1). 

## Entry 4:
('src/domain/inventory.js')

### *What I asked:*
 Domain logic for events, tiers, and bookings — whole-number validation, prices in integer cents, 1–10 tickets per booking, SOLD_OUT on insufficient capacity without changing state, seat release on cancel, rejecting a second cancel, and O(1) booking lookup by reference. Plus a waitlist for sold-out tiers.

### *What came back:*
 A working module but with structural problems. Tiers lived inside each event keyed by name (so two "VIP" tiers overwrite each other). Bookings had status: 'confirmed' set at creation and never changed, so there was no way to represent cancellation and cancelBooking didn't exist. No waitlist. createEvent required venue, which should be optional. Reference helper was called newReference, which conflicts with what ids.js was settled on.

### *What changed & why:* 
 Five things, by reading the instructor's version.

 **Store shape.** The instructor flattened tiers, bookings, and waitlists into top-level Maps keyed by generated id, instead of nesting them under each event. This decouples tiers from events (you can price and book without holding an event), and it stops two same-named tiers from clobbering each other. I adopted that.

 **Booking lifecycle.** The instructor added status: 'pending' and a HOLDS_SEATS = new Set(['pending', 'paid']) guard, so cancelBooking can throw INVALID_STATE on a re-cancel. My draft had no status field at all, so the "cancel twice is an error" spec couldn't be expressed. Also: cancelBooking releases seats before flipping status — release-then-flip, not flip-then-release — so a crash between the two leaves seats returned rather than half-held.

 **O(1) lookup made load-bearing.** My draft had bookingsByRef but no lookup function, so the claim was unverified. The instructor added findBookingByReference as a one-line Map.get wrapper, plus a do { reference = referenceCode(); } while (bookingsByReference.has(reference)) collision guard so a duplicate reference can't silently overwrite a real booking. Small additions, but they turn "we use a Map" into "the Map is doing work."

 **Atomic sold-out guard.** bookTickets checks seatsLeft and throws SOLD_OUT before tier.sold += quantity. My draft did the same, but the instructor made the invariant explicit by attaching { seatsLeft } to the error details, which lets the UI say "only 3 left" without re-querying. That's a correctness win I hadn't thought of.

 **Waitlist + NOT_SOLD_OUT.** I had no waitlist. The instructor wired a Queue per tier, made joinWaitlist throw NOT_SOLD_OUT if seats are actually available (so nobody waits for something they could just buy), and made offerNextOnWaitlist strict FIFO — only the head is considered, and only if there's room for their full request, so a smaller request behind them can't leapfrog. That's a policy choice I hadn't considered at all, and the comment makes it visible enough to change deliberately later.

 **Renames.** price → priceCents (with the "0.1 + 0.2 !== 0.3" comment), bookSeat → bookTickets, bookingsByRef → bookingsByReference, addTier(event, opts) → addTier(store, eventId, opts). Vocabulary work, but these names flow into every test, script, and later module.

## Entry 5:
('scripts/demo.js')

### *What I asked:*
 A terminal demo that exercises the Build 1 domain — create event, add tier, book seats, trigger sold-out, use the waitlist, look up by reference.

### *What came back:*
 A script that ran but proved little. The "sold out" branch was a coincidence of chosen numbers, not a real test. The waitlist was a Queue created inside the script, disconnected from the store, so it demonstrated nothing about the domain. booking1.reference would have printed undefined because bookSeat returned no reference. No cancelBooking, no findBookingByReference, no offerNextOnWaitlist, no error handling. It only walked the happy path.

### *What changed & why:*
 By reading the instructor's version I learned that a demo is a narrative test, not a sequence of logs. The key idea I took is the attempt(label, action) helper — it wraps each call in try/catch, prints OK or FAIL → CODE: message for DomainError, and rethrows anything else so real bugs aren't hidden. That turns the script into a readable transcript of what the domain allows and rejects, which is worth far more than a string of successful bookings. The instructor also exercised every exported function in a fixed order (book, oversell, cancel, waitlist, offer), so the script covers the sold-out and re-cancel rules as first-class demonstrations rather than happy-path coincidences. And it threaded a single store through a connected sequence instead of three unrelated objects pretending to be a story — my draft created the waitlist ad hoc instead of using store.waitlists, which is the exact thing the demo should have been proving.

## Entry 6:
('scripts/benchmark-lookup.js')

### *What I asked:*
 A script that empirically demonstrates the difference between Map.get() (O(1)) and Array.find() (O(n)) by timing lookups against 100,000 in-memory bookings.

### *What came back:*
 Worked but fragile. Synthetic REF00000 references instead of real referenceCode() output, a redundant node:perf_hooks import, duplicated timing blocks, random targets that could repeat, and arrayTime / mapTime could print Infinityx faster if map time rounded to zero.

### *What changed & why:*
 By reading the instructor's version I learned that a benchmark is a story about complexity, and every design choice should serve it. Real referenceCode() output means the benchmark measures the actual lookup, not a toy dataset with hidden ordering. The duplicated timing code became a time(label, lookup) helper — same lesson as attempt() in the demo, extract the shape so the two cases can't drift apart, and they end up visually parallel so the O(n) vs O(1) difference is one glance. Math.max(mapMs, 0.001) guards the speedup line against Infinity. Dropped the perf_hooks import (Node has performance globally) and the trailing rhetorical question, since the benchmark itself already makes the point.


# AI Interaction Log - Build 2
 (src/domain/sorting.js, src/domain/inventory.js, src/domain/eventSearch.js, test/build-2.test.js)

### *What I asked:*
 Implement Build 2 of the Event Ticketing capstone: a pure, stable mergeSort in sorting.js; event publishing and summaries in inventory.js; pure filtering and sorting in eventSearch.js; and comprehensive unit tests covering S02–S06.

### *What came back:*
 A working implementation with 16 passing tests. mergeSort was stable and immutable, inventory.js enforced INVALID_STATE for tierless events, and eventSearch.js handled filtering and sorting. Problems: all tests were bundled into a single flat build-2.test.js file with no nested suites; tie-breaking was ASCII-sensitive ("Jazz" vs "jazz"); negative maxPriceCents was silently accepted; and sortEvents(summaries) without a second argument threw a VALIDATION error.

### *What changed & why:*
 Compared against the instructor's reference implementation and fixed four issues:

 Case-insensitive tie-breaking — tieBreak now uses .toLocaleLowerCase() so "Jazz" and "jazz" fall through to id ordering.

 Negative price validation — added a < 0 check so caller bugs throw VALIDATION instead of returning an empty list.

 Default sort key — sortBy = 'date' so sortEvents(summaries) defaults to date order.

 Expanded coverage to 28 passing tests verifying stability, immutability, and error handling.


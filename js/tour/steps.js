// The first-run how-to tour: what it says, when it shows, and the Next / Back / Skip state machine.
// Pure (no DOM, no Firebase), so the rules are unit-tested; js/tour/tour.js draws it.
//
// When it shows: only for a brand-new account. Finishing onboarding for the first time writes
// profile.tour = 'pending'; finishing or skipping the tour writes profile.tour = 'seen' (+ tour_seen_at).
// Accounts that already existed have no `tour` field, so they never get it on their own; Settings →
// "Show the how-to tour again" replays it for anyone. It lives in the profile doc, not localStorage, so it
// doesn't come back on a new phone.

// target: a CSS selector for the real element to spotlight (null = no spotlight, just the card).
// route: the screen the target is on; the tour opens it first.
export const TOUR_STEPS = [
  {
    id: 'welcome', route: 'today', target: null,
    title: 'Welcome to Forge 👋',
    body: 'Here’s a quick tour of the app. It takes about a minute. You can skip it any time, and you can play it again from Settings.',
  },
  {
    id: 'rings', route: 'today', target: '.rings-card',
    title: 'Your week at a glance',
    body: 'These rings fill up as you work out this week. Fill them all to hit your weekly goal.',
  },
  {
    id: 'workout', route: 'today', target: '[data-tour="workout"]',
    title: 'Today’s workout',
    body: 'Forge picks a workout for you each day. Tap Start to begin, or See plan to look at it first.',
  },
  {
    id: 'weight', route: 'today', target: '.weight-card [data-log]',
    title: 'Log your weight',
    body: 'Tap Log weight to add your weight by hand. The Withings scale can only link to one Forge account for now, so type your weight in here instead. A few times a week is plenty.',
  },
  {
    id: 'train', route: 'train', target: '[aria-label="Location"]',
    title: 'Train: pick where you are',
    body: 'On the Train tab, choose where you’re working out today. Forge builds the workout from the equipment you have there.',
  },
  {
    id: 'start', route: 'train', target: '.card.preview [data-start]',
    title: 'Start, then one set at a time',
    body: 'When you tap Start workout you’ll see one exercise at a time. Tap Done set after each set. Pause when you need a break, Swap if a move doesn’t suit you, and How to shows a demo. “RIR” means reps in reserve: how many more reps you could have done.',
  },
  {
    id: 'progress', route: 'weight', target: '.tabbar a[href="#/weight"]',
    title: 'Progress',
    body: 'Here you’ll find your weight chart, your past workouts, your personal records, and the badges and XP you earn.',
  },
  {
    id: 'settings', route: 'settings', target: '[data-tour="settings-profile"]',
    title: 'Settings',
    body: 'Change your profile and targets, your locations and equipment, your units (lb or kg) and the coach audio. You can play this tour again from the bottom of Settings.',
  },
];

/** Profile fields to add when a profile is saved: a brand-new account gets the tour; editing one doesn't. */
export const tourFieldsForSave = (hasProfile) => (hasProfile ? {} : { tour: 'pending' });

/** Profile fields that mark the tour as seen (skipped or finished). */
export const tourSeenFields = (iso) => ({ tour: 'seen', tour_seen_at: iso });

/** The tour is waiting for this account (only brand-new accounts; existing profiles have no tour field). */
export const tourPending = (profile) => !!profile && profile.tour === 'pending';

/** Should the app start the tour now? Once only: not while it's already showing, not once it's been seen. */
export const shouldStartTour = (profile, active) => !active && tourPending(profile);

/**
 * How far to scroll (positive = down) so a target sits clear of the tour card: its bottom (plus pad) at least
 * gap px above cardTop, and its top not above minTop. 0 when it already fits.
 */
export function scrollToClear(rect, cardTop, { pad = 8, gap = 12, minTop = 12 } = {}) {
  const down = Math.max(0, rect.bottom + pad - (cardTop - gap));
  return Math.min(down, rect.top - minTop); // never scroll its top above minTop; negative = scroll up to it
}

/**
 * Step through `steps`. onEnd(how) is called once, with 'finished' (Next on the last step) or 'skipped'.
 * Back stops at the first step; Next/Back/Skip do nothing after the tour has ended.
 */
export function createTour(steps, onEnd = () => {}) {
  let index = 0;
  let ended = null;
  const end = (how) => {
    if (ended) return;
    ended = how;
    onEnd(how);
  };
  return {
    get index() { return index; },
    get count() { return steps.length; },
    get step() { return steps[index]; },
    get first() { return index === 0; },
    get last() { return index === steps.length - 1; },
    get ended() { return ended; },
    next() {
      if (ended) return;
      if (index >= steps.length - 1) end('finished');
      else index++;
    },
    back() {
      if (!ended && index > 0) index--;
    },
    skip() { end('skipped'); },
  };
}

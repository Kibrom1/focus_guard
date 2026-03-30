// Focus Guard — Blocked Page Script

const QUOTES = [
  '"The secret of getting ahead is getting started." — Mark Twain',
  '"Focus on being productive instead of busy." — Tim Ferriss',
  '"It\'s not that I\'m so smart, it\'s just that I stay with problems longer." — Einstein',
  '"Deep work is the superpower of the 21st century." — Cal Newport',
  '"You don\'t need more time, you need more focus." — unknown',
  '"Concentrate all your thoughts upon the work at hand." — Alexander Graham Bell',
  '"The successful warrior is the average man, with laser-like focus." — Bruce Lee',
  '"My success, part of it certainly, is that I have focused in on a few things." — Bill Gates',
  '"Where focus goes, energy flows." — Tony Robbins',
  '"It is during our darkest moments that we must focus to see the light." — Aristotle',
  '"Lack of direction, not lack of time, is the problem." — Zig Ziglar',
  '"One reason so few of us achieve what we truly want is that we never direct our focus." — Tony Robbins',
  '"The key is not to prioritize what\'s on your schedule, but to schedule your priorities." — Stephen Covey',
  '"Wherever you are, be all there." — Jim Elliot',
  '"You can do anything, but not everything." — David Allen',
  '"Stop managing your time. Start managing your focus." — Robin Sharma',
  '"Either you run the day or the day runs you." — Jim Rohn',
  '"The main thing is to keep the main thing the main thing." — Stephen Covey',
  '"Hard work and focus will always triumph over natural talent." — unknown',
  '"Discipline is doing what needs to be done, even if you don\'t want to." — unknown',
  '"Your future is created by what you do today, not tomorrow." — Robert Kiyosaki',
  '"Do the hard jobs first. The easy jobs will take care of themselves." — Dale Carnegie',
  '"Productivity is never an accident. It is always the result of a commitment to excellence." — Paul J. Meyer',
  '"The way to get started is to quit talking and begin doing." — Walt Disney',
  '"Take up one idea. Make that one idea your life." — Swami Vivekananda',
  '"You will never find time for anything. If you want time, you must make it." — Charles Buxton',
  '"The most precious resource we all have is time." — Steve Jobs',
  '"Simplicity boils down to two steps: Identify the essential. Eliminate the rest." — Leo Babauta',
  '"Focus is a matter of deciding what things you\'re not going to do." — John Carmack',
  '"Until we can manage time, we can manage nothing else." — Peter Drucker',
  '"Your mind is for having ideas, not holding them." — David Allen',
  '"Work is hard. Distractions are plentiful. And time is short." — Adam Hochschild',
  '"Don\'t watch the clock; do what it does. Keep going." — Sam Levenson',
  '"You\'ve got to think about big things while you\'re doing small things, so that all the small things go in the right direction." — Alvin Toffler',
  '"Efficiency is doing the thing right. Effectiveness is doing the right thing." — Peter Drucker',
  '"The shorter way to do many things is to only do one thing at a time." — Mozart',
  '"Multitasking is the ability to screw everything up simultaneously." — unknown',
  '"There is time enough for everything in the course of the day if you do but one thing at a time." — Benjamin Franklin',
  '"Energy, not time, is the fundamental currency of high performance." — Jim Loehr',
  '"Flow is the state in which people are so involved in an activity that nothing else seems to matter." — Mihaly Csikszentmihalyi',
];

const params = new URLSearchParams(window.location.search);
const domain = params.get('domain') || 'this site';

document.getElementById('domain-display').textContent = domain;
document.getElementById('motivational-quote').textContent =
  QUOTES[Math.floor(Math.random() * QUOTES.length)];

// Notify background to count this as a blocked attempt
chrome.runtime.sendMessage({ action: 'trackBlocked', domain: domain });

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateCountdown() {
  chrome.storage.local.get(['isActive', 'startTime', 'duration'], (data) => {
    if (!data.isActive || !data.startTime) {
      document.getElementById('countdown').textContent = '--:--';
      document.getElementById('session-label').textContent = 'No active session';
      return;
    }

    const endTime = data.startTime + data.duration * 60 * 1000;
    const remaining = endTime - Date.now();

    document.getElementById('countdown').textContent = formatTime(remaining);

    if (remaining <= 0) {
      document.getElementById('countdown').textContent = '00:00';
      document.getElementById('session-label').textContent = 'Session complete!';
      clearInterval(tickInterval);
    }
  });
}

const tickInterval = setInterval(updateCountdown, 1000);
updateCountdown();

document.getElementById('btn-go-back').addEventListener('click', () => {
  if (document.referrer && !document.referrer.startsWith(location.origin)) {
    location.href = document.referrer;
  } else if (history.length > 1) {
    history.back();
  } else {
    location.href = 'chrome://newtab/';
  }
});

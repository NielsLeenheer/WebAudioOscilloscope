// Import all SVG example paths from text files
import starPath from './star.txt?raw';
import html5Path from './html5.txt?raw';
import heartPath from './heart.txt?raw';
import lightningPath from './lightning.txt?raw';
import musicPath from './music.txt?raw';
import rocketPath from './rocket.txt?raw';
import housePath from './house.txt?raw';
import smileyPath from './smiley.txt?raw';
import infinityPath from './infinity.txt?raw';
import peacePath from './peace.txt?raw';
import chromePath from './chrome.txt?raw';
import halfstackPath from './halfstack.txt?raw';
import beyondtellerrandPath from './beyondtellerrand.txt?raw';
import clockPath from './clock.txt?raw';

// Export as array with id, label, path, and complexity
export const svgExamples = [
    { id: 'star', label: 'Star', path: starPath.trim(), complex: false },
    { id: 'html5', label: 'HTML5 Logo', path: html5Path.trim(), complex: false },
    { id: 'heart', label: 'Heart', path: heartPath.trim(), complex: false },
    { id: 'lightning', label: 'Lightning Bolt', path: lightningPath.trim(), complex: false },
    { id: 'music', label: 'Music Note', path: musicPath.trim(), complex: true },
    { id: 'rocket', label: 'Rocket', path: rocketPath.trim(), complex: false },
    { id: 'house', label: 'House', path: housePath.trim(), complex: false },
    { id: 'smiley', label: 'Smiley Face', path: smileyPath.trim(), complex: true },
    { id: 'infinity', label: 'Infinity Symbol', path: infinityPath.trim(), complex: true },
    { id: 'peace', label: 'Peace Sign', path: peacePath.trim(), complex: true },
    { id: 'chrome', label: 'Chrome', path: chromePath.trim(), complex: true },
    { id: 'halfstack', label: 'Halfstack', path: halfstackPath.trim(), complex: true },
    { id: 'beyondtellerrand', label: 'Beyond Tellerrand', path: beyondtellerrandPath.trim(), complex: true },
    { id: 'clock', label: 'Clock', path: clockPath.trim(), complex: true },
];

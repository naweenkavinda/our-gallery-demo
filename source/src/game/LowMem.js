/**
 * Phones (and anything with little memory) get lighter textures: an iPhone shuts a page down for good
 * once it holds a few hundred MB of pictures, and the gallery's photos alone were over 400 MB when
 * every one was decoded at full size. ?touch=1 forces this on a computer, for testing.
 */
export const LOW_MEM = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || /[?&]touch=1\b/.test(location.search) || (navigator.deviceMemory || 8) <= 4;

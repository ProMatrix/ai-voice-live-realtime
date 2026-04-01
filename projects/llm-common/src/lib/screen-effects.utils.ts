import { sleep } from './utils';

const DEFAULT_FADE_STEP = 0.05;
const DEFAULT_FADE_DELAY_MS = 50;

async function fadeElement(
  htmlElement: HTMLElement,
  startOpacity: number,
  endOpacity: number,
  step = DEFAULT_FADE_STEP,
  delayMs = DEFAULT_FADE_DELAY_MS,
) {
  htmlElement.style.visibility = 'visible';

  const direction = startOpacity < endOpacity ? 1 : -1;
  let opacity = startOpacity;

  while ((direction > 0 && opacity < endOpacity) || (direction < 0 && opacity > endOpacity)) {
    htmlElement.style.opacity = opacity.toString();
    opacity += step * direction;
    await sleep(delayMs);
  }

  htmlElement.style.opacity = endOpacity.toString();
}

export function fadeOutOverlay(htmlElement: HTMLDivElement) {
  return fadeElement(htmlElement, 1, 0);
}

export function fadeInOverlay(htmlElement: HTMLDivElement) {
  return fadeElement(htmlElement, 0, 1);
}

export function toggleFadeClasses(
  elements: Array<Element | null | undefined>,
  shouldHide: boolean,
) {
  const addClass = shouldHide ? 'fade-out' : 'fade-in';
  const removeClass = shouldHide ? 'fade-in' : 'fade-out';

  elements.forEach((element) => {
    if (!element) {
      return;
    }

    element.classList.remove(removeClass);
    element.classList.add(addClass);
  });
}

import { DEFAULT_DIFFICULTY } from "../src/config.js";

export const BOOTSTRAP_AGE_HOURS = 24;
export const BOOTSTRAP_FILTER_DIFFICULTY = DEFAULT_DIFFICULTY;
export const BOOTSTRAP_CACHE_KEY = "feed:bootstrap:default";
export const BOOTSTRAP_CACHE_TAG = "feed:bootstrap";
export const BOOTSTRAP_CACHE_TTL_SECONDS = 300;

export type BootstrapSettings = {
  ageHours: number;
  filterDifficulty: number;
};

export function canUseFeedBootstrap(settings: BootstrapSettings): boolean {
  return (
    settings.ageHours === BOOTSTRAP_AGE_HOURS &&
    settings.filterDifficulty === BOOTSTRAP_FILTER_DIFFICULTY
  );
}